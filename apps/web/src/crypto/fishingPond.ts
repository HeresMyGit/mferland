import { createWalletClient, encodeFunctionData, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { FishingNftClaimVoucher, OnchainFishingRodRequirementSnapshot } from "@mferland/shared";
import { getLocalDebugWalletAddress } from "../auth/debugWallet";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

const FISHING_POND_ABI = parseAbi([
  "function claim((bytes32 catchId,address fisher,uint8 standard,address collection,uint256 tokenId,uint256 amount,uint256 pondEntryId,uint256 expiresAt,uint256 chainId,address verifyingContract) voucher, bytes signature)",
]);
const ONCHAIN_FISHING_ROD_MINT_ABI = parseAbi(["function mint() returns (uint256)"]);
const ONCHAIN_FISHING_ROD_MINT_TO_ABI = parseAbi(["function mint(address to) returns (uint256)"]);
const ONCHAIN_FISHING_ROD_MINT_QUANTITY_ABI = parseAbi(["function mint(uint256 quantity) returns (uint256)"]);
const ONCHAIN_FISHING_ROD_MINT_TO_QUANTITY_ABI = parseAbi(["function mint(address to,uint256 quantity) returns (uint256)"]);
const ERC20_APPROVAL_ABI = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const VITE_ENV: Partial<ImportMetaEnv> = import.meta.env ?? {};
const LOCAL_ANVIL_RPC_URL = "http://127.0.0.1:8545";
const LOCAL_DEBUG_WALLET_ADDRESS = getLocalDebugWalletAddress();
const BASE_SEPOLIA_RPC_URL = String(VITE_ENV.VITE_MFERLAND_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org").trim()
  || "https://sepolia.base.org";

export async function executeFishingPondClaim(
  provider: EthereumProvider,
  expectedWalletAddress: string,
  voucher: FishingNftClaimVoucher,
) {
  const account = await getConnectedAccount(provider);
  if (account.toLowerCase() !== expectedWalletAddress.trim().toLowerCase()) {
    throw new Error("connected wallet changed");
  }

  await switchToChain(provider, voucher.chainId);
  const transaction = makeFishingPondClaimTransaction(account, voucher);
  await preflightFishingPondClaim(provider, transaction);

  const txHash = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
  if (typeof txHash !== "string") throw new Error("claim transaction failed");
  await waitForTransactionReceipt(provider, txHash, { maxAttempts: 90, intervalMs: 1000 });
  return txHash;
}

export function getFishingPondClaimTxUrl(chainId: number, txHash: string) {
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return "";
}

export async function executeOnchainFishingRodMint(
  provider: EthereumProvider,
  expectedWalletAddress: string,
  requirement: OnchainFishingRodRequirementSnapshot,
) {
  const account = await getConnectedAccount(provider);
  if (account.toLowerCase() !== expectedWalletAddress.trim().toLowerCase()) {
    throw new Error("connected wallet changed");
  }
  if (!requirement.enabled) throw new Error("rod minting unavailable");
  const mintContractAddress = requirement.mintContractAddress || requirement.contractAddress;
  if (!isAddress(mintContractAddress)) throw new Error("rod mint contract missing");

  await switchToChain(provider, requirement.chainId);
  await ensureRodMintApproval(provider, account, requirement, mintContractAddress);

  const transaction = makeOnchainFishingRodMintTransaction(account, mintContractAddress, requirement);
  await preflightOnchainFishingRodMint(provider, transaction);
  const txHash = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
  if (typeof txHash !== "string") throw new Error("rod mint transaction failed");
  await waitForTransactionReceipt(provider, txHash, { maxAttempts: 120, intervalMs: 1000 });
  return txHash;
}

export function getOnchainFishingRodMintTxUrl(chainId: number, txHash: string) {
  return getFishingPondClaimTxUrl(chainId, txHash);
}

export function getLocalFishingPondClaimProvider(walletAddress: string, chainId: number): EthereumProvider | null {
  return getLocalDebugEthereumProvider(walletAddress, chainId);
}

export function getLocalDebugEthereumProvider(walletAddress: string, chainId: number): EthereumProvider | null {
  if (!VITE_ENV.DEV) return null;
  if (walletAddress.trim().toLowerCase() !== LOCAL_DEBUG_WALLET_ADDRESS.toLowerCase()) return null;
  if (chainId === 84532) return getBaseSepoliaDebugProvider(walletAddress);
  if (chainId !== 31337) return null;

  return {
    async request({ method, params = [] }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [LOCAL_DEBUG_WALLET_ADDRESS];
      if (method === "eth_chainId") return toChainIdHex(31337);
      if (method === "wallet_switchEthereumChain") {
        const requestedChain = getRequestedChainId(params);
        if (requestedChain !== 31337) throw new Error("local test wallet only supports Anvil");
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      return requestLocalAnvil(method, params);
    },
  };
}

function getBaseSepoliaDebugProvider(walletAddress: string): EthereumProvider | null {
  const privateKey = normalizePrivateKey(VITE_ENV.VITE_MFERLAND_DEBUG_WALLET_PRIVATE_KEY);
  if (!privateKey) return null;
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== walletAddress.trim().toLowerCase()) return null;

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });

  return {
    async request({ method, params = [] }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account.address];
      if (method === "eth_chainId") return toChainIdHex(baseSepolia.id);
      if (method === "wallet_switchEthereumChain") {
        const requestedChain = getRequestedChainId(params);
        if (requestedChain !== baseSepolia.id) throw new Error("debug wallet only supports Base Sepolia");
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      if (method === "eth_sendTransaction") {
        return sendBaseSepoliaDebugTransaction({ account, walletClient, params });
      }
      return requestJsonRpc(BASE_SEPOLIA_RPC_URL, method, params);
    },
  };
}

async function getConnectedAccount(provider: EthereumProvider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!isAddress(account)) throw new Error("wallet not connected");
  return account;
}

async function switchToChain(provider: EthereumProvider, chainId: number) {
  const chainIdHex = toChainIdHex(chainId);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: getChainName(chainId),
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: getRpcUrls(chainId),
      }],
    });
  }
}

function makeFishingPondClaimTransaction(account: string, voucher: FishingNftClaimVoucher) {
  return {
    from: account,
    to: voucher.verifyingContract,
    data: encodeFunctionData({
      abi: FISHING_POND_ABI,
      functionName: "claim",
      args: [{
        catchId: voucher.catchId as `0x${string}`,
        fisher: voucher.fisher as `0x${string}`,
        standard: voucher.tokenStandard,
        collection: voucher.collection as `0x${string}`,
        tokenId: BigInt(voucher.tokenId),
        amount: BigInt(voucher.amount),
        pondEntryId: BigInt(voucher.pondEntryId),
        expiresAt: BigInt(voucher.expiresAt),
        chainId: BigInt(voucher.chainId),
        verifyingContract: voucher.verifyingContract as `0x${string}`,
      }, voucher.signature as `0x${string}`],
    }),
    value: "0x0",
  };
}

async function preflightFishingPondClaim(provider: EthereumProvider, transaction: ReturnType<typeof makeFishingPondClaimTransaction>) {
  try {
    await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  } catch (error) {
    throw new Error(getFishingPondClaimPreflightErrorMessage(error));
  }
}

async function ensureRodMintApproval(
  provider: EthereumProvider,
  account: string,
  requirement: OnchainFishingRodRequirementSnapshot,
  mintContractAddress: string,
) {
  const token = requirement.mintPaymentTokenAddress;
  const amountWei = requirement.mintPriceAmountWei;
  if (!token || !isAddress(token) || !amountWei || !/^\d+$/.test(amountWei)) return;

  const spender = requirement.mintPaymentSpenderAddress && isAddress(requirement.mintPaymentSpenderAddress)
    ? requirement.mintPaymentSpenderAddress
    : mintContractAddress;
  const required = BigInt(amountWei);
  const allowance = await readErc20Allowance(provider, account, token, spender);
  if (allowance >= required) return;

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: token,
      data: encodeFunctionData({
        abi: ERC20_APPROVAL_ABI,
        functionName: "approve",
        args: [spender as `0x${string}`, required],
      }),
      value: "0x0",
    }],
  });
  if (typeof txHash !== "string") throw new Error("approval transaction failed");
  await waitForTransactionReceipt(provider, txHash, { maxAttempts: 90, intervalMs: 1000 });
}

async function readErc20Allowance(provider: EthereumProvider, owner: string, token: string, spender: string) {
  const result = await provider.request({
    method: "eth_call",
    params: [{
      from: owner,
      to: token,
      data: encodeFunctionData({
        abi: ERC20_APPROVAL_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, spender as `0x${string}`],
      }),
    }, "latest"],
  });
  return typeof result === "string" && /^0x[0-9a-fA-F]+$/.test(result) ? BigInt(result) : 0n;
}

function makeOnchainFishingRodMintTransaction(
  account: string,
  mintContractAddress: string,
  requirement: OnchainFishingRodRequirementSnapshot,
) {
  const mintFunction = requirement.mintFunction || "mint";
  return {
    from: account,
    to: mintContractAddress,
    data: mintFunction === "mintTo"
      ? encodeFunctionData({
        abi: ONCHAIN_FISHING_ROD_MINT_TO_ABI,
        functionName: "mint",
        args: [account as `0x${string}`],
      })
      : mintFunction === "mintQuantity"
      ? encodeFunctionData({
        abi: ONCHAIN_FISHING_ROD_MINT_QUANTITY_ABI,
        functionName: "mint",
        args: [1n],
      })
      : mintFunction === "mintToQuantity"
      ? encodeFunctionData({
        abi: ONCHAIN_FISHING_ROD_MINT_TO_QUANTITY_ABI,
        functionName: "mint",
        args: [account as `0x${string}`, 1n],
      })
      : encodeFunctionData({
        abi: ONCHAIN_FISHING_ROD_MINT_ABI,
        functionName: "mint",
        args: [],
      }),
    value: "0x0",
  };
}

async function preflightOnchainFishingRodMint(
  provider: EthereumProvider,
  transaction: ReturnType<typeof makeOnchainFishingRodMintTransaction>,
) {
  try {
    await provider.request({ method: "eth_call", params: [transaction, "latest"] });
  } catch (error) {
    throw new Error(getFishingPondClaimPreflightErrorMessage(error));
  }
}

function toChainIdHex(chainId: number) {
  return `0x${Math.max(0, Math.floor(chainId)).toString(16)}`;
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function getChainName(chainId: number) {
  if (chainId === 31337) return "mferland local";
  if (chainId === 8453) return "Base";
  if (chainId === 84532) return "Base Sepolia";
  return `chain ${chainId}`;
}

function getRpcUrls(chainId: number) {
  if (chainId === 31337) return [LOCAL_ANVIL_RPC_URL];
  if (chainId === 8453) return ["https://mainnet.base.org"];
  if (chainId === 84532) return ["https://sepolia.base.org"];
  return [];
}

async function requestLocalAnvil(method: string, params: unknown[]) {
  return requestJsonRpc(LOCAL_ANVIL_RPC_URL, method, params);
}

async function requestJsonRpc(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`RPC request failed: ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "RPC request failed");
  return payload.result ?? null;
}

async function sendBaseSepoliaDebugTransaction({
  account,
  walletClient,
  params,
}: {
  account: PrivateKeyAccount;
  walletClient: ReturnType<typeof createWalletClient>;
  params: unknown[];
}) {
  const [transaction] = params;
  if (!transaction || typeof transaction !== "object") throw new Error("transaction missing");
  const tx = transaction as Record<string, unknown>;
  const from = typeof tx.from === "string" ? tx.from : "";
  if (from && from.toLowerCase() !== account.address.toLowerCase()) throw new Error("connected wallet changed");
  const to = typeof tx.to === "string" && /^0x[0-9a-fA-F]{40}$/.test(tx.to) ? tx.to as `0x${string}` : undefined;
  const data = typeof tx.data === "string" && /^0x[0-9a-fA-F]*$/.test(tx.data) ? tx.data as Hex : undefined;
  const value = typeof tx.value === "string" ? hexToBigInt(tx.value) : undefined;
  return walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to,
    data,
    value,
  });
}

function getRequestedChainId(params: unknown[]) {
  const [first] = params;
  if (!first || typeof first !== "object") return 0;
  const chainId = (first as { chainId?: unknown }).chainId;
  if (typeof chainId !== "string") return 0;
  return Number.parseInt(chainId, 16);
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (maybeError.code === 4902) return true;
  if (isUnknownChainError(maybeError.cause)) return true;
  return typeof maybeError.message === "string" && /unknown chain|unrecognized chain|not added/i.test(maybeError.message);
}

function normalizePrivateKey(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^0x[0-9a-fA-F]{64}$/.test(text) ? text as Hex : null;
}

function hexToBigInt(value: string) {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return undefined;
  return BigInt(value);
}

function getFishingPondClaimPreflightErrorMessage(error: unknown) {
  const message = getErrorMessage(error);
  if (/expired/i.test(message)) return "claim voucher expired";
  if (/daily/i.test(message) && /cap/i.test(message)) return "daily NFT catch cap reached";
  if (/signature|voucher|claim|entry|paused|drain/i.test(message)) return "claim no longer valid";
  return "claim preflight failed";
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const maybeError = error as { message?: unknown; shortMessage?: unknown; cause?: unknown; data?: unknown };
  const parts = [
    typeof maybeError.shortMessage === "string" ? maybeError.shortMessage : "",
    typeof maybeError.message === "string" ? maybeError.message : "",
    getErrorMessage(maybeError.cause),
    getErrorMessage(maybeError.data),
  ];
  return parts.filter(Boolean).join(" ");
}

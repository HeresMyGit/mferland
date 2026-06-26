import { encodeFunctionData, parseAbi } from "viem";
import type { FishingNftClaimVoucher } from "@mferland/shared";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

const FISHING_POND_ABI = parseAbi([
  "function claim((bytes32 catchId,address fisher,uint8 standard,address collection,uint256 tokenId,uint256 amount,uint256 pondEntryId,uint256 expiresAt,uint256 chainId,address verifyingContract) voucher, bytes signature)",
]);
const LOCAL_ANVIL_RPC_URL = "http://127.0.0.1:8545";
const LOCAL_DEBUG_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

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

export function getLocalFishingPondClaimProvider(walletAddress: string, chainId: number): EthereumProvider | null {
  if (!import.meta.env.DEV || chainId !== 31337) return null;
  if (walletAddress.trim().toLowerCase() !== LOCAL_DEBUG_WALLET_ADDRESS.toLowerCase()) return null;

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
  const response = await fetch(LOCAL_ANVIL_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`local Anvil RPC failed: ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "local Anvil RPC failed");
  return payload.result ?? null;
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

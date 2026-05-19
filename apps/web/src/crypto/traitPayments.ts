import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_CHAIN_ID_HEX,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_AMOUNT_LABEL,
  TRAIT_CHANGE_MFERGPT_AMOUNT_WEI,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  type MferGptPaymentProof,
} from "@mferland/shared";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

const BASE_BLOCK_EXPLORER_URL = "https://basescan.org";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";

export async function executeTraitMferGptPayment(provider: EthereumProvider, expectedWalletAddress: string) {
  return executeMferGptBurnPayment(provider, expectedWalletAddress, TRAIT_CHANGE_MFERGPT_AMOUNT_WEI, TRAIT_CHANGE_MFERGPT_AMOUNT_LABEL);
}

export async function executeMferGptBurnPayment(
  provider: EthereumProvider,
  expectedWalletAddress: string,
  amountWei: string,
  amountLabel: string,
): Promise<MferGptPaymentProof> {
  const account = await getConnectedAccount(provider);
  if (account.toLowerCase() !== expectedWalletAddress.trim().toLowerCase()) {
    throw new Error("connected wallet changed");
  }

  await switchToBase(provider);

  const amount = BigInt(amountWei);
  const balance = await readTokenBalance(provider, TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS, account);
  if (balance < amount) {
    throw new Error(`not enough ${amountLabel}`);
  }

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: account,
      to: TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
      data: `${ERC20_TRANSFER_SELECTOR}${encodeAddress(TRAIT_CHANGE_BURN_ADDRESS)}${encodeUint(amount)}`,
      value: "0x0",
    }],
  });
  if (typeof txHash !== "string") throw new Error("payment transaction failed");

  await waitForTransactionReceipt(provider, txHash, { maxAttempts: 90, intervalMs: 1000 });
  return {
    token: "MFERGPT" as const,
    txHash,
    amountWei,
    chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    contractAddress: TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  };
}

export function getTraitPaymentTxUrl(txHash: string) {
  return getMferGptPaymentTxUrl(txHash);
}

export function getMferGptPaymentTxUrl(txHash: string) {
  return `${BASE_BLOCK_EXPLORER_URL}/tx/${txHash}`;
}

function getConnectedAccount(provider: EthereumProvider) {
  return provider.request({ method: "eth_requestAccounts" }).then((accounts) => {
    const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
    if (!isAddress(account)) throw new Error("wallet not connected");
    return account;
  });
}

async function switchToBase(provider: EthereumProvider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: TRAIT_CHANGE_BASE_CHAIN_ID_HEX }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: TRAIT_CHANGE_BASE_CHAIN_ID_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [TRAIT_CHANGE_BASE_RPC_URL],
        blockExplorerUrls: [BASE_BLOCK_EXPLORER_URL],
      }],
    });
  }

  const chainId = await provider.request({ method: "eth_chainId" }).catch(() => TRAIT_CHANGE_BASE_CHAIN_ID_HEX);
  if (typeof chainId === "string" && Number.parseInt(chainId, 16) !== TRAIT_CHANGE_BASE_CHAIN_ID) {
    throw new Error("switch to Base");
  }
}

async function readTokenBalance(provider: EthereumProvider, tokenAddress: string, account: string) {
  const result = await provider.request({
    method: "eth_call",
    params: [{
      to: tokenAddress,
      data: `${ERC20_BALANCE_OF_SELECTOR}${encodeAddress(account)}`,
    }, "latest"],
  });
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]*$/.test(result)) {
    throw new Error("MFERGPT balance unavailable");
  }
  return BigInt(result);
}

function encodeAddress(address: string) {
  if (!isAddress(address)) throw new Error("address missing");
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUint(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (maybeError.code === 4902) return true;
  if (isUnknownChainError(maybeError.cause)) return true;
  return typeof maybeError.message === "string" && /unknown chain|unrecognized chain|not added/i.test(maybeError.message);
}

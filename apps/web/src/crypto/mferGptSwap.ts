import { formatUnits, parseEther, parseUnits } from "viem";
import {
  DEFAULT_MFERGPT_SWAP_ETH_AMOUNT,
  MFERGPT_BASE_CHAIN_ID,
  MFERGPT_BASE_CHAIN_ID_HEX,
  MFERGPT_BASE_RPC_URL,
  MFERGPT_BASE_TOKEN_ADDRESS,
  MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  MFERGPT_BASE_WETH_ADDRESS,
  MFERGPT_DECIMALS,
  MFERGPT_SWAP_GAS_LIMIT,
  MFERGPT_SWAP_PRICE_DECIMALS,
  getMferGptSwapQuoteAmounts,
  buildMferGptUniversalRouterCallData,
} from "@mferland/shared";
import { formatReadableDecimal } from "./displayAmounts";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

export { MFERGPT_BASE_TOKEN_ADDRESS };
export const DEFAULT_SWAP_ETH_AMOUNT = DEFAULT_MFERGPT_SWAP_ETH_AMOUNT;
export const DEFAULT_SWAP_SLIPPAGE_PERCENT = "5";

export type MferGptSwapQuote = {
  amountInWei: bigint;
  estimatedAmountOutWei: bigint;
  minAmountOutWei: bigint;
  priceNative: string;
  liquidityUsd: number | null;
  pairUrl: string;
  slippageBps: number;
};

type SwapTransactionRequest = {
  from: string;
  to: string;
  data: string;
  value: string;
  gas?: string;
};

const BASE_BLOCK_EXPLORER_URL = "https://basescan.org";

type DexScreenerTokenResponse = {
  pairs?: Array<{
    chainId?: string;
    dexId?: string;
    labels?: string[];
    url?: string;
    priceNative?: string;
    liquidity?: {
      usd?: number;
    };
    baseToken?: {
      address?: string;
      symbol?: string;
    };
    quoteToken?: {
      address?: string;
      symbol?: string;
    };
  }>;
};

export async function getMferGptSwapQuote(ethAmountText: string, slippagePercentText: string): Promise<MferGptSwapQuote> {
  const amountInWei = parseSwapEthAmount(ethAmountText);
  const slippageBps = parseSlippageBps(slippagePercentText);
  const pair = await fetchMferGptPair();
  const priceNativeWei = parseUnits(pair.priceNative, MFERGPT_SWAP_PRICE_DECIMALS);
  const { estimatedAmountOutWei, minAmountOutWei } = getMferGptSwapQuoteAmounts({
    amountInWei,
    priceNativeWei,
    slippageBps,
  });

  return {
    amountInWei,
    estimatedAmountOutWei,
    minAmountOutWei,
    priceNative: pair.priceNative,
    liquidityUsd: pair.liquidityUsd,
    pairUrl: pair.url,
    slippageBps,
  };
}

export async function executeMferGptSwap(provider: EthereumProvider, quote: MferGptSwapQuote) {
  const account = await getConnectedAccount(provider);
  await switchToBase(provider);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const transaction: SwapTransactionRequest = {
    from: account,
    to: MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
    data: buildMferGptUniversalRouterCallData({
      amountInWei: quote.amountInWei,
      minAmountOutWei: quote.minAmountOutWei,
      deadline,
    }),
    value: toHex(quote.amountInWei),
    gas: toHex(MFERGPT_SWAP_GAS_LIMIT),
  };

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [transaction],
  });
  if (typeof txHash !== "string") throw new Error("swap transaction failed");
  await waitForTransactionReceipt(provider, txHash, { maxAttempts: 90, intervalMs: 1000 });
  return txHash;
}

export function formatMferGptAmount(amountWei: bigint) {
  const formatted = formatUnits(amountWei, MFERGPT_DECIMALS);
  const [whole, fraction = ""] = formatted.split(".");
  const wholeNumber = Number(whole);
  const wholeLabel = Number.isFinite(wholeNumber) ? wholeNumber.toLocaleString("en-US") : whole;
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, whole === "0" ? 4 : 2);
  return trimmedFraction ? `${wholeLabel}.${trimmedFraction}` : wholeLabel;
}

export function formatMferGptCompact(amountWei: bigint) {
  const amount = Number(formatUnits(amountWei, MFERGPT_DECIMALS));
  if (!Number.isFinite(amount)) return formatMferGptAmount(amountWei);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
    notation: amount >= 1_000_000 ? "compact" : "standard",
  }).format(amount);
}

export function formatSwapPrice(priceNative: string) {
  const price = Number(priceNative);
  if (!Number.isFinite(price) || price <= 0) return "--";
  return `${formatReadableDecimal(priceNative)} ETH`;
}

export function makeMferGptUniswapUrl(ethAmount: string) {
  const url = new URL("https://app.uniswap.org/swap");
  url.searchParams.set("chain", "base");
  url.searchParams.set("inputCurrency", "ETH");
  url.searchParams.set("outputCurrency", MFERGPT_BASE_TOKEN_ADDRESS);
  url.searchParams.set("theme", "dark");

  const normalizedAmount = normalizeSwapAmountInput(ethAmount).replace(/\.$/, "");
  if (normalizedAmount && normalizedAmount !== "0") {
    url.searchParams.set("field", "input");
    url.searchParams.set("value", normalizedAmount);
  }

  return url.toString();
}

export function normalizeSwapAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = normalized.split(".");
  const decimal = decimalParts.join("").slice(0, 18);
  const wholePart = whole.replace(/^0+(?=\d)/, "").slice(0, 12);
  return decimalParts.length > 0 ? `${wholePart || "0"}.${decimal}` : wholePart;
}

export function normalizeSlippageInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = normalized.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  const wholePart = whole.replace(/^0+(?=\d)/, "").slice(0, 2);
  return decimalParts.length > 0 ? `${wholePart || "0"}.${decimal}` : wholePart;
}

export function getBaseScanTxUrl(txHash: string) {
  return `${BASE_BLOCK_EXPLORER_URL}/tx/${txHash}`;
}

function parseSwapEthAmount(value: string) {
  const normalized = normalizeSwapAmountInput(value).replace(/\.$/, "");
  if (!normalized || Number(normalized) <= 0) throw new Error("enter an ETH amount");
  return parseEther(normalized);
}

function parseSlippageBps(value: string) {
  const numeric = Number(normalizeSlippageInput(value));
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("enter max slippage");
  if (numeric > 50) throw new Error("max slippage too high");
  return Math.max(1, Math.round(numeric * 100));
}

async function fetchMferGptPair() {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MFERGPT_BASE_TOKEN_ADDRESS}`, { cache: "no-store" });
  if (!response.ok) throw new Error("market quote unavailable");
  const document = await response.json() as DexScreenerTokenResponse;
  const pair = document.pairs?.find((entry) => {
    const baseToken = entry.baseToken?.address ?? "";
    const quoteToken = entry.quoteToken?.address ?? "";
    return entry.chainId === "base"
      && entry.dexId === "uniswap"
      && (entry.labels ?? []).includes("v4")
      && baseToken.toLowerCase() === MFERGPT_BASE_TOKEN_ADDRESS.toLowerCase()
      && quoteToken.toLowerCase() === MFERGPT_BASE_WETH_ADDRESS.toLowerCase()
      && typeof entry.priceNative === "string"
      && Number(entry.priceNative) > 0;
  });
  if (!pair || !pair.priceNative) throw new Error("MFERGPT/WETH pool unavailable");
  return {
    priceNative: pair.priceNative,
    liquidityUsd: typeof pair.liquidity?.usd === "number" ? pair.liquidity.usd : null,
    url: typeof pair.url === "string" ? pair.url : makeMferGptUniswapUrl(DEFAULT_SWAP_ETH_AMOUNT),
  };
}

async function getConnectedAccount(provider: EthereumProvider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!isAddress(account)) throw new Error("wallet not connected");
  return account;
}

async function switchToBase(provider: EthereumProvider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MFERGPT_BASE_CHAIN_ID_HEX }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: MFERGPT_BASE_CHAIN_ID_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [MFERGPT_BASE_RPC_URL],
        blockExplorerUrls: [BASE_BLOCK_EXPLORER_URL],
      }],
    });
  }

  const chainId = await provider.request({ method: "eth_chainId" }).catch(() => MFERGPT_BASE_CHAIN_ID_HEX);
  if (typeof chainId === "string" && Number.parseInt(chainId, 16) !== MFERGPT_BASE_CHAIN_ID) {
    throw new Error("switch to Base");
  }
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (maybeError.code === 4902) return true;
  if (isUnknownChainError(maybeError.cause)) return true;
  return typeof maybeError.message === "string" && /unknown chain|unrecognized chain|not added/i.test(maybeError.message);
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function toHex(value: bigint) {
  return `0x${value.toString(16)}`;
}

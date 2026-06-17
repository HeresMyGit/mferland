import {
  formatUnits,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import {
  DEFAULT_MFERGPT_SWAP_ETH_AMOUNT,
  DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
  MFERGPT_BASE_CHAIN_ID,
  MFERGPT_BASE_TOKEN_ADDRESS,
  MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  MFERGPT_BASE_WETH_ADDRESS,
  MFERGPT_DECIMALS,
  MFERGPT_SWAP_GAS_LIMIT,
  MFERGPT_SWAP_PRICE_DECIMALS,
  buildMferGptUniversalRouterCallData,
  getMferGptSwapQuoteAmounts,
} from "@mferland/shared";

export type AgentMferGptSwapQuoteInput = {
  walletAddress: string;
  amountEth?: string;
  slippageBps?: number;
  priceNativeWei?: string;
  nowSeconds?: number;
};

type DexScreenerTokenResponse = {
  pairs?: Array<{
    chainId?: string;
    dexId?: string;
    labels?: string[];
    priceNative?: string;
    baseToken?: { address?: string };
    quoteToken?: { address?: string };
  }>;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUOTE_TTL_SECONDS = 20 * 60;

export async function buildAgentMferGptSwapQuote(input: AgentMferGptSwapQuoteInput) {
  const walletAddress = normalizeAddress(input.walletAddress);
  if (!walletAddress) throw new Error("valid walletAddress required");

  const amountEth = cleanDecimal(input.amountEth || DEFAULT_MFERGPT_SWAP_ETH_AMOUNT, "amountEth");
  const amountInWei = parseEther(amountEth);
  const priceNativeWei = input.priceNativeWei && /^\d+$/.test(input.priceNativeWei)
    ? BigInt(input.priceNativeWei)
    : await fetchBaseMferGptPriceNativeWei();
  const slippageBps = normalizeSlippageBps(input.slippageBps);
  const quote = getMferGptSwapQuoteAmounts({ amountInWei, priceNativeWei, slippageBps });
  const deadline = BigInt(Math.floor(input.nowSeconds ?? Date.now() / 1000) + QUOTE_TTL_SECONDS);
  const data = buildMferGptUniversalRouterCallData({
    amountInWei,
    minAmountOutWei: quote.minAmountOutWei,
    deadline,
  });

  return {
    ok: true,
    action: "swap_eth_for_mfergpt",
    route: "Base ETH -> WETH -> MFERGPT via Uniswap v4 Universal Router",
    walletAddress,
    chainId: MFERGPT_BASE_CHAIN_ID,
    inputToken: {
      symbol: "ETH",
      address: ZERO_ADDRESS,
      amountEth,
      amountWei: amountInWei.toString(),
    },
    outputToken: {
      symbol: "MFERGPT",
      address: MFERGPT_BASE_TOKEN_ADDRESS,
      estimatedAmountWei: quote.estimatedAmountOutWei.toString(),
      estimatedAmount: formatUnits(quote.estimatedAmountOutWei, MFERGPT_DECIMALS),
      minAmountOutWei: quote.minAmountOutWei.toString(),
      minAmountOut: formatUnits(quote.minAmountOutWei, MFERGPT_DECIMALS),
    },
    slippageBps,
    priceNativeWei: priceNativeWei.toString(),
    transaction: {
      chainId: MFERGPT_BASE_CHAIN_ID,
      to: MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
      data,
      valueWei: amountInWei.toString(),
      gas: MFERGPT_SWAP_GAS_LIMIT.toString(),
      deadline: deadline.toString(),
    },
    fallbackUrl: `https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${MFERGPT_BASE_TOKEN_ADDRESS}`,
  };
}

export function buildAgentMferGptSwapResult(input: {
  walletAddress: string;
  txHash: string;
  amountEth?: string;
  receivedWei?: string;
  commandId?: string;
}) {
  const walletAddress = normalizeAddress(input.walletAddress);
  if (!walletAddress) throw new Error("valid walletAddress required");
  const txHash = normalizeTxHash(input.txHash);
  if (!txHash) throw new Error("valid txHash required");
  return {
    ok: true,
    action: "swap_eth_for_mfergpt",
    walletAddress,
    txHash,
    chainId: MFERGPT_BASE_CHAIN_ID,
    amountEth: input.amountEth ? cleanDecimal(input.amountEth, "amountEth") : "",
    receivedWei: normalizePositiveIntegerString(input.receivedWei),
    commandId: cleanText(input.commandId, 80),
    note: "Swap result accepted for command reporting. Receipt/output verification is performed by live wallet tooling when configured.",
  };
}

async function fetchBaseMferGptPriceNativeWei() {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MFERGPT_BASE_TOKEN_ADDRESS}`, { cache: "no-store" });
  const document = await response.json().catch(() => null) as DexScreenerTokenResponse | null;
  if (!response.ok || !document) throw new Error("MFERGPT market quote unavailable");
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
  if (!pair?.priceNative) throw new Error("MFERGPT/WETH pool unavailable");
  return parseUnits(pair.priceNative, MFERGPT_SWAP_PRICE_DECIMALS);
}

function normalizeSlippageBps(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS;
  return Math.min(2500, Math.max(1, Math.floor(parsed)));
}

function cleanDecimal(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text)) throw new Error(`${label} must be a decimal string`);
  if (Number(text) <= 0 || Number(text) > 1) throw new Error(`${label} must be between 0 and 1`);
  return text;
}

function normalizeAddress(value: unknown): Address | "" {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{40}$/.test(text) ? text as Address : "";
}

function normalizeTxHash(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{64}$/.test(text) ? text : "";
}

function normalizePositiveIntegerString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[1-9]\d*$/.test(text) ? text : "";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

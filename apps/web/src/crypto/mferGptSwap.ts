import { encodeAbiParameters, encodeFunctionData, formatUnits, parseEther, parseUnits } from "viem";
import { formatReadableDecimal } from "./displayAmounts";
import { waitForTransactionReceipt, type EthereumProvider } from "./transactionReceipts";

export const MFERGPT_BASE_TOKEN_ADDRESS = "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07";
export const DEFAULT_SWAP_ETH_AMOUNT = "0.01";
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

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = "0x2105";
const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_BLOCK_EXPLORER_URL = "https://basescan.org";
const UNISWAP_UNIVERSAL_ROUTER = "0x6fF5693b99212Da76ad316178A184AB56D299b43";
const WETH_BASE_ADDRESS = "0x4200000000000000000000000000000000000006";
const MFERGPT_POOL_KEY = {
  currency0: MFERGPT_BASE_TOKEN_ADDRESS,
  currency1: WETH_BASE_ADDRESS,
  fee: 0x800000,
  tickSpacing: 200,
  hooks: "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC",
} as const;
const MFERGPT_DECIMALS = 18;
const PRICE_DECIMALS = 18;
const SLIPPAGE_DENOMINATOR_BPS = 10_000;
const ACTION_CONSTANT_ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
const UNISWAP_COMMAND_WRAP_ETH = "0b";
const UNISWAP_COMMAND_V4_SWAP = "10";
const V4_ACTION_SWAP_EXACT_IN_SINGLE = "06";
const V4_ACTION_SETTLE = "0b";
const V4_ACTION_TAKE_ALL = "0f";
const MFERGPT_SWAP_GAS_LIMIT = 900_000n;

const UNIVERSAL_ROUTER_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}] as const;

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
  const priceNativeWei = parseUnits(pair.priceNative, PRICE_DECIMALS);
  if (priceNativeWei <= 0n) throw new Error("market price unavailable");

  const estimatedAmountOutWei = amountInWei * 10n ** BigInt(MFERGPT_DECIMALS) / priceNativeWei;
  const minAmountOutWei = estimatedAmountOutWei * BigInt(SLIPPAGE_DENOMINATOR_BPS - slippageBps) / BigInt(SLIPPAGE_DENOMINATOR_BPS);
  if (minAmountOutWei <= 0n) throw new Error("swap amount too small");

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
    to: UNISWAP_UNIVERSAL_ROUTER,
    data: buildMferGptSwapCallData(quote, deadline),
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

function buildMferGptSwapCallData(quote: MferGptSwapQuote, deadline: bigint) {
  const wrapEthInput = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [ACTION_CONSTANT_ADDRESS_THIS, quote.amountInWei],
  );
  const swapActions = `0x${V4_ACTION_SWAP_EXACT_IN_SINGLE}${V4_ACTION_SETTLE}${V4_ACTION_TAKE_ALL}` as const;
  const swapParams = [
    encodeAbiParameters(
      [{
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      }],
      [{
        poolKey: MFERGPT_POOL_KEY,
        zeroForOne: false,
        amountIn: quote.amountInWei,
        amountOutMinimum: quote.minAmountOutWei,
        hookData: "0x",
      }],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
      [WETH_BASE_ADDRESS, quote.amountInWei, false],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [MFERGPT_BASE_TOKEN_ADDRESS, quote.minAmountOutWei],
    ),
  ];
  const v4SwapInput = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [swapActions, swapParams],
  );

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [
      `0x${UNISWAP_COMMAND_WRAP_ETH}${UNISWAP_COMMAND_V4_SWAP}`,
      [wrapEthInput, v4SwapInput],
      deadline,
    ],
  });
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
      && quoteToken.toLowerCase() === WETH_BASE_ADDRESS.toLowerCase()
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
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID_HEX }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BASE_CHAIN_ID_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [BASE_RPC_URL],
        blockExplorerUrls: [BASE_BLOCK_EXPLORER_URL],
      }],
    });
  }

  const chainId = await provider.request({ method: "eth_chainId" }).catch(() => BASE_CHAIN_ID_HEX);
  if (typeof chainId === "string" && Number.parseInt(chainId, 16) !== BASE_CHAIN_ID) {
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

import { parseArgs } from "node:util";

const BASIS_POINTS = 10_000n;
const DECIMALS = 18n;
const UNIT = 10n ** DECIMALS;

const { values } = parseArgs({
  options: {
    "dexscreener-chain": { type: "string", default: "base" },
    "dexscreener-pair": { type: "string" },
    "dexscreener-token": { type: "string" },
    "discount-bps": { type: "string", default: "1000" },
    "eth-price": { type: "string", default: "0.0069" },
    "min-liquidity-usd": { type: "string", default: "1000" },
    "mfer-eth": { type: "string" },
    "mfer-eth-wei": { type: "string" },
    "quote-symbol": { type: "string", default: "WETH" },
  },
});

const ethPriceWei = parseDecimalToWei(values["eth-price"], "eth-price");
const discountBps = parseBasisPoints(values["discount-bps"]);
const quote = await resolveMferEthQuote(values);
const mferEthWei = quote.mferEthWei;
const targetEthWei = ethPriceWei * (BASIS_POINTS - discountBps) / BASIS_POINTS;
const requiredMferWei = ceilDiv(targetEthWei * UNIT, mferEthWei);

console.log(JSON.stringify({
  ethPrice: formatWei(ethPriceWei),
  discountBps: Number(discountBps),
  targetEth: formatWei(targetEthWei),
  mferEth: formatWei(mferEthWei),
  requiredMfer: formatWei(requiredMferWei),
  requiredMferWei: requiredMferWei.toString(),
  quote: serializeQuote(quote),
}, null, 2));

async function resolveMferEthQuote(options) {
  const manualWei = parseManualMferEthWei(options["mfer-eth"], options["mfer-eth-wei"]);
  if (manualWei !== null) {
    return {
      source: "manual",
      mferEthWei: manualWei,
    };
  }

  const token = normalizeAddress(options["dexscreener-token"]);
  const pair = normalizeAddress(options["dexscreener-pair"]);
  if (!token && !pair) {
    throw new Error("Pass --mfer-eth, --mfer-eth-wei, --dexscreener-token, or --dexscreener-pair");
  }

  const chain = normalizeChainId(options["dexscreener-chain"]);
  const quoteSymbol = normalizeSymbol(options["quote-symbol"]);
  const minLiquidityUsd = parseUsdThreshold(options["min-liquidity-usd"]);
  const candidates = pair
    ? await fetchDexScreenerPair({ chain, pair })
    : await fetchDexScreenerTokenPairs({ chain, token });
  const selected = selectDexScreenerPair({ candidates, minLiquidityUsd, quoteSymbol, token });
  const mferEthWei = parseDecimalToWei(selected.priceNative, "dexscreener priceNative");

  return {
    source: "dexscreener",
    chainId: selected.chainId,
    dexId: selected.dexId,
    pairAddress: selected.pairAddress,
    baseToken: selected.baseToken?.symbol ?? "",
    quoteToken: selected.quoteToken?.symbol ?? "",
    priceNative: selected.priceNative,
    liquidityUsd: selected.liquidity?.usd ?? null,
    volume24h: selected.volume?.h24 ?? null,
    url: selected.url ?? "",
    mferEthWei,
  };
}

function parseManualMferEthWei(decimalValue, integerValue) {
  const hasDecimal = hasText(decimalValue);
  const hasInteger = hasText(integerValue);
  if (hasDecimal && hasInteger) throw new Error("Pass either --mfer-eth or --mfer-eth-wei, not both");
  if (hasInteger) {
    if (!/^[0-9]+$/.test(integerValue.trim())) throw new Error("--mfer-eth-wei must be digits");
    const parsed = BigInt(integerValue.trim());
    if (parsed <= 0n) throw new Error("--mfer-eth-wei must be greater than zero");
    return parsed;
  }
  if (hasDecimal) return parseDecimalToWei(decimalValue, "mfer-eth");
  return null;
}

async function fetchDexScreenerTokenPairs({ chain, token }) {
  const response = await fetchJson(`https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${token}`);
  if (!Array.isArray(response)) throw new Error("Dex Screener token-pairs response was not an array");
  return response;
}

async function fetchDexScreenerPair({ chain, pair }) {
  const response = await fetchJson(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${pair}`);
  const pairs = Array.isArray(response?.pairs) ? response.pairs : [];
  return pairs;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Dex Screener request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function selectDexScreenerPair({ candidates, minLiquidityUsd, quoteSymbol, token }) {
  const normalizedToken = token.toLowerCase();
  const eligible = candidates
    .filter((pair) => {
      const baseAddress = normalizeAddress(pair?.baseToken?.address);
      const baseMatches = !normalizedToken || baseAddress === normalizedToken;
      const quoteMatches = normalizeSymbol(pair?.quoteToken?.symbol) === quoteSymbol;
      const hasPrice = typeof pair?.priceNative === "string" && pair.priceNative.trim() !== "";
      const liquidityUsd = Number(pair?.liquidity?.usd ?? 0);
      return baseMatches && quoteMatches && hasPrice && Number.isFinite(liquidityUsd) && liquidityUsd >= minLiquidityUsd;
    })
    .sort((left, right) => Number(right?.liquidity?.usd ?? 0) - Number(left?.liquidity?.usd ?? 0));

  if (eligible[0]) return eligible[0];
  throw new Error(`No Dex Screener pair matched quote ${quoteSymbol} with at least $${minLiquidityUsd} liquidity`);
}

function parseBasisPoints(value) {
  if (!/^[0-9]+$/.test(String(value ?? ""))) throw new Error("--discount-bps must be an integer");
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BASIS_POINTS) throw new Error("--discount-bps must be between 0 and 9999");
  return parsed;
}

function parseDecimalToWei(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9]+(\.[0-9]{1,18})?$/.test(normalized)) {
    throw new Error(`--${label} must be a decimal with up to 18 fractional digits`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const parsed = BigInt(whole) * UNIT + BigInt(fraction.padEnd(Number(DECIMALS), "0"));
  if (parsed <= 0n) throw new Error(`--${label} must be greater than zero`);
  return parsed;
}

function parseUsdThreshold(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalized)) throw new Error("--min-liquidity-usd must be a non-negative number");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("--min-liquidity-usd must be a non-negative number");
  return parsed;
}

function normalizeAddress(value) {
  if (!hasText(value)) return "";
  const normalized = value.toLowerCase().trim();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error(`Invalid address: ${value}`);
  return normalized;
}

function normalizeChainId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(normalized)) throw new Error("--dexscreener-chain is invalid");
  return normalized;
}

function normalizeSymbol(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_$.-]{1,32}$/.test(normalized)) throw new Error("--quote-symbol is invalid");
  return normalized;
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function serializeQuote(quote) {
  return {
    ...quote,
    mferEthWei: quote.mferEthWei.toString(),
  };
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function formatWei(value) {
  const whole = value / UNIT;
  const fraction = value % UNIT;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

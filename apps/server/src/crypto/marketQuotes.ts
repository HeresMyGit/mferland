import { asc } from "drizzle-orm";
import { getDatabase } from "../db/client.js";
import { cryptoMarketQuotes } from "../db/schema.js";

const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;
const DEXSCREENER_SOURCE = "dexscreener";

type MarketTokenConfig = {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  quoteSymbol: string;
  minLiquidityUsd: number;
};

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    symbol?: string;
  };
  quoteToken?: {
    symbol?: string;
  };
  priceNative?: string;
  priceUsd?: string | null;
  liquidity?: {
    usd?: number | string | null;
  } | null;
  volume?: {
    h24?: number | string | null;
  } | null;
};

export type CryptoMarketQuoteView = {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  quoteSymbol: string;
  source: string;
  dexId: string;
  pairAddress: string;
  pairUrl: string;
  priceNative: string;
  priceUsd: string;
  liquidityUsd: string;
  volume24h: string;
  fetchedAt: string;
  updatedAt: string;
};

export type CryptoMarketQuoteSnapshot = {
  ok: boolean;
  error?: string;
  refreshIntervalSeconds: number;
  quotes: CryptoMarketQuoteView[];
};

const MARKET_TOKENS: MarketTokenConfig[] = [
  {
    id: "base:mfer:weth",
    tokenSymbol: "$mfer",
    tokenAddress: "0xe3086852a4b125803c815a158249ae468a3254ca",
    chainId: "base",
    quoteSymbol: "WETH",
    minLiquidityUsd: 1000,
  },
  {
    id: "base:mfergpt:weth",
    tokenSymbol: "MFERGPT",
    tokenAddress: "0x4160efdd66521483c22cb98b57b87d1fdafeab07",
    chainId: "base",
    quoteSymbol: "WETH",
    minLiquidityUsd: 1000,
  },
];

export async function getCryptoMarketQuoteSnapshot(): Promise<CryptoMarketQuoteSnapshot> {
  const refreshIntervalSeconds = Math.round(getMarketQuoteRefreshIntervalMs() / 1000);
  const db = getDatabase();
  if (!db) {
    return {
      ok: false,
      error: "DATABASE_URL is not configured",
      refreshIntervalSeconds,
      quotes: [],
    };
  }

  const rows = await db.select()
    .from(cryptoMarketQuotes)
    .orderBy(asc(cryptoMarketQuotes.tokenSymbol));

  return {
    ok: true,
    refreshIntervalSeconds,
    quotes: rows.map((row) => ({
      id: row.id,
      tokenSymbol: row.tokenSymbol,
      tokenAddress: row.tokenAddress,
      chainId: row.chainId,
      quoteSymbol: row.quoteSymbol,
      source: row.source,
      dexId: row.dexId,
      pairAddress: row.pairAddress,
      pairUrl: row.pairUrl,
      priceNative: row.priceNative,
      priceUsd: row.priceUsd,
      liquidityUsd: row.liquidityUsd,
      volume24h: row.volume24h,
      fetchedAt: row.fetchedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function refreshCryptoMarketQuotes() {
  const db = getDatabase();
  if (!db) throw new Error("DATABASE_URL is required to refresh market quotes");

  const now = new Date();
  const updated: CryptoMarketQuoteView[] = [];
  const errors: Array<{ tokenSymbol: string; error: string }> = [];

  for (const config of MARKET_TOKENS) {
    try {
      const pair = await fetchBestDexScreenerPair(config);
      const row = toMarketQuoteRow(config, pair, now);
      await db.insert(cryptoMarketQuotes)
        .values(row)
        .onConflictDoUpdate({
          target: cryptoMarketQuotes.id,
          set: {
            tokenSymbol: row.tokenSymbol,
            tokenAddress: row.tokenAddress,
            chainId: row.chainId,
            quoteSymbol: row.quoteSymbol,
            source: row.source,
            dexId: row.dexId,
            pairAddress: row.pairAddress,
            pairUrl: row.pairUrl,
            priceNative: row.priceNative,
            priceUsd: row.priceUsd,
            liquidityUsd: row.liquidityUsd,
            volume24h: row.volume24h,
            fetchedAt: row.fetchedAt,
            updatedAt: row.updatedAt,
            rawJson: row.rawJson,
          },
        });
      updated.push({
        id: row.id,
        tokenSymbol: row.tokenSymbol,
        tokenAddress: row.tokenAddress,
        chainId: row.chainId,
        quoteSymbol: row.quoteSymbol,
        source: row.source,
        dexId: row.dexId,
        pairAddress: row.pairAddress,
        pairUrl: row.pairUrl,
        priceNative: row.priceNative,
        priceUsd: row.priceUsd,
        liquidityUsd: row.liquidityUsd,
        volume24h: row.volume24h,
        fetchedAt: row.fetchedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    } catch (error) {
      errors.push({
        tokenSymbol: config.tokenSymbol,
        error: error instanceof Error ? error.message : "Unknown quote refresh error",
      });
    }
  }

  return {
    ok: errors.length === 0,
    updated,
    errors,
  };
}

export function startCryptoMarketQuotePoller() {
  if (process.env.MFERLAND_MARKET_QUOTES_DISABLED === "1") {
    console.info("crypto_market_quotes.poller disabled");
    return () => undefined;
  }

  if (!getDatabase()) {
    console.info("crypto_market_quotes.poller skipped; DATABASE_URL is not configured");
    return () => undefined;
  }

  const intervalMs = getMarketQuoteRefreshIntervalMs();
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await refreshCryptoMarketQuotes();
      const suffix = result.errors.length > 0 ? `, ${result.errors.length} failed` : "";
      console.info(`crypto_market_quotes.refreshed ${result.updated.length} quote(s)${suffix}`);
    } catch (error) {
      console.warn("crypto_market_quotes.refresh_failed", error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

function getMarketQuoteRefreshIntervalMs() {
  const configured = Number(process.env.MFERLAND_MARKET_QUOTE_INTERVAL_MS ?? "");
  if (Number.isFinite(configured) && configured >= MIN_REFRESH_INTERVAL_MS) return Math.floor(configured);
  return DEFAULT_REFRESH_INTERVAL_MS;
}

async function fetchBestDexScreenerPair(config: MarketTokenConfig) {
  const tokenAddress = normalizeAddress(config.tokenAddress);
  const response = await fetch(
    `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(config.chainId)}/${tokenAddress}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`DexScreener request failed: ${response.status} ${response.statusText}`);

  const pairs = await response.json();
  if (!Array.isArray(pairs)) throw new Error("DexScreener token-pairs response was not an array");

  const selected = pairs
    .filter((pair: DexScreenerPair) => {
      const baseAddress = normalizeExternalAddress(pair.baseToken?.address);
      const quoteSymbol = normalizeExternalSymbol(pair.quoteToken?.symbol);
      const liquidityUsd = toFiniteNumber(pair.liquidity?.usd);
      return (
        baseAddress === tokenAddress
        && quoteSymbol === config.quoteSymbol
        && isPositiveDecimalString(pair.priceNative)
        && liquidityUsd >= config.minLiquidityUsd
      );
    })
    .sort((left: DexScreenerPair, right: DexScreenerPair) => (
      toFiniteNumber(right.liquidity?.usd) - toFiniteNumber(left.liquidity?.usd)
    ))[0];

  if (!selected) {
    throw new Error(`No ${config.tokenSymbol}/${config.quoteSymbol} DexScreener pair matched the liquidity floor`);
  }
  return selected;
}

function toMarketQuoteRow(config: MarketTokenConfig, pair: DexScreenerPair, now: Date) {
  return {
    id: config.id,
    tokenSymbol: config.tokenSymbol,
    tokenAddress: normalizeAddress(config.tokenAddress),
    chainId: config.chainId,
    quoteSymbol: config.quoteSymbol,
    source: DEXSCREENER_SOURCE,
    dexId: safeText(pair.dexId),
    pairAddress: safeText(pair.pairAddress),
    pairUrl: safeText(pair.url),
    priceNative: String(pair.priceNative),
    priceUsd: safeText(pair.priceUsd),
    liquidityUsd: numberText(pair.liquidity?.usd),
    volume24h: numberText(pair.volume?.h24),
    fetchedAt: now,
    updatedAt: now,
    rawJson: JSON.stringify({
      chainId: pair.chainId,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      baseToken: pair.baseToken,
      quoteToken: pair.quoteToken,
      priceNative: pair.priceNative,
      priceUsd: pair.priceUsd,
      liquidity: pair.liquidity,
      volume: pair.volume,
      url: pair.url,
    }),
  };
}

function normalizeAddress(value: string) {
  const normalized = value.toLowerCase().trim();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error(`Invalid token address: ${value}`);
  return normalized;
}

function normalizeExternalAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.toLowerCase().trim();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function normalizeExternalSymbol(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_$.-]{1,32}$/.test(normalized) ? normalized : "";
}

function isPositiveDecimalString(value: unknown) {
  if (typeof value !== "string" || !/^[0-9]+(\.[0-9]+)?$/.test(value.trim())) return false;
  return Number(value) > 0;
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberText(value: unknown) {
  const parsed = toFiniteNumber(value);
  return parsed > 0 ? String(parsed) : "";
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

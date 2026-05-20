import { sql } from "drizzle-orm";
import { createPublicClient, formatUnits, http } from "viem";
import { base } from "viem/chains";
import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
} from "@mferland/shared";
import { getDatabase } from "../db/client.js";
import { cryptoPurchaseEvents } from "../db/schema.js";

const ERC20_STATS_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export type MferGptBurnStats = {
  ok: true;
  source: "base-rpc";
  generatedAt: string;
  chainId: typeof TRAIT_CHANGE_BASE_CHAIN_ID;
  tokenAddress: string;
  burnAddress: string;
  symbol: string;
  decimals: number;
  totalSupplyWei: string;
  totalSupplyLabel: string;
  burnBalanceWei: string;
  burnBalanceLabel: string;
  burnPercent: string;
  burnPercentLabel: string;
  mferlandTracked: {
    configured: boolean;
    amountWei: string;
    amountLabel: string;
    percent: string;
    percentLabel: string;
    events: number;
    wallets: number;
  };
};

type MferGptBurnTrackerRow = {
  amount_wei?: unknown;
  events?: unknown;
  wallets?: unknown;
};

const MFERGPT_BURN_STATS_CACHE_TTL_MS = 60_000;
let cachedBurnStats: { value: MferGptBurnStats; expiresAt: number } | null = null;
let pendingBurnStats: Promise<MferGptBurnStats> | null = null;

export async function getMferGptBurnStats(): Promise<MferGptBurnStats> {
  const nowMs = Date.now();
  if (cachedBurnStats && cachedBurnStats.expiresAt > nowMs) return cachedBurnStats.value;
  if (pendingBurnStats) return pendingBurnStats;

  pendingBurnStats = readMferGptBurnStats()
    .then((value) => {
      cachedBurnStats = {
        value,
        expiresAt: Date.now() + MFERGPT_BURN_STATS_CACHE_TTL_MS,
      };
      return value;
    })
    .catch((error) => {
      if (cachedBurnStats) return cachedBurnStats.value;
      throw error;
    })
    .finally(() => {
      pendingBurnStats = null;
    });

  return pendingBurnStats;
}

async function readMferGptBurnStats(): Promise<MferGptBurnStats> {
  const now = new Date();
  const tokenAddress = getMferGptTokenAddress();
  const burnAddress = getMferGptBurnAddress();
  const publicClient = createPublicClient({
    chain: base,
    transport: http(getMferGptRpcUrl()),
  });

  const [[totalSupply, burnBalance], tracked] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: [
        {
          address: tokenAddress as `0x${string}`,
          abi: ERC20_STATS_ABI,
          functionName: "totalSupply",
        },
        {
          address: tokenAddress as `0x${string}`,
          abi: ERC20_STATS_ABI,
          functionName: "balanceOf",
          args: [burnAddress as `0x${string}`],
        },
      ],
    }),
    loadMferlandTrackedBurns(tokenAddress),
  ]);
  const decimals = 18;
  const symbol = "MFERGPT";

  return {
    ok: true,
    source: "base-rpc",
    generatedAt: now.toISOString(),
    chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    tokenAddress,
    burnAddress,
    symbol,
    decimals,
    totalSupplyWei: totalSupply.toString(),
    totalSupplyLabel: formatTokenAmount(totalSupply, decimals),
    burnBalanceWei: burnBalance.toString(),
    burnBalanceLabel: formatTokenAmount(burnBalance, decimals),
    burnPercent: formatPercent(burnBalance, totalSupply),
    burnPercentLabel: `${formatPercent(burnBalance, totalSupply)}%`,
    mferlandTracked: {
      configured: tracked.configured,
      amountWei: tracked.amountWei.toString(),
      amountLabel: formatTokenAmount(tracked.amountWei, decimals),
      percent: formatPercent(tracked.amountWei, totalSupply),
      percentLabel: `${formatPercent(tracked.amountWei, totalSupply)}%`,
      events: tracked.events,
      wallets: tracked.wallets,
    },
  };
}

async function loadMferlandTrackedBurns(tokenAddress: string) {
  const db = getDatabase();
  if (!db) {
    return {
      configured: false,
      amountWei: 0n,
      events: 0,
      wallets: 0,
    };
  }

  const [row] = await db.execute<MferGptBurnTrackerRow>(sql`
    SELECT
      coalesce(sum(
        CASE
          WHEN ${cryptoPurchaseEvents.paymentAmountWei} ~ '^[0-9]+$'
          THEN ${cryptoPurchaseEvents.paymentAmountWei}::numeric
          ELSE 0
        END
      ), 0)::text AS amount_wei,
      count(*)::int AS events,
      count(DISTINCT ${cryptoPurchaseEvents.walletAddress})::int AS wallets
    FROM ${cryptoPurchaseEvents}
    WHERE lower(${cryptoPurchaseEvents.paymentToken}) = 'mfergpt'
      AND ${cryptoPurchaseEvents.status} = 'confirmed'
      AND (
        lower(${cryptoPurchaseEvents.contractAddress}) = ${tokenAddress}
        OR ${cryptoPurchaseEvents.contractAddress} = ''
      )
  `);

  return {
    configured: true,
    amountWei: parseBigIntText(row?.amount_wei),
    events: toNumber(row?.events),
    wallets: toNumber(row?.wallets),
  };
}

function getMferGptRpcUrl() {
  return (
    process.env.MFERLAND_MFERGPT_PAYMENT_RPC_URL
    || process.env.MFERLAND_TRAIT_PAYMENT_RPC_URL
    || TRAIT_CHANGE_BASE_RPC_URL
  ).trim();
}

function getMferGptTokenAddress() {
  return normalizeAddress(process.env.MFERLAND_MFERGPT_TOKEN_ADDRESS)
    || normalizeAddress(process.env.MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS)
    || normalizeAddress(TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS);
}

function getMferGptBurnAddress() {
  return normalizeAddress(process.env.MFERLAND_MFERGPT_BURN_ADDRESS)
    || normalizeAddress(process.env.MFERLAND_TRAIT_BURN_ADDRESS)
    || normalizeAddress(TRAIT_CHANGE_BURN_ADDRESS);
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function formatTokenAmount(amountWei: bigint, decimals: number) {
  const value = Number(formatUnits(amountWei, decimals));
  if (!Number.isFinite(value)) return formatUnits(amountWei, decimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000_000 ? 2 : value >= 1000 ? 0 : 2,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function formatPercent(amount: bigint, total: bigint) {
  if (total <= 0n) return "0.0000";
  const scaled = amount * 1_000_000n / total;
  const whole = scaled / 10_000n;
  const fraction = String(scaled % 10_000n).padStart(4, "0");
  return `${whole}.${fraction}`;
}

function parseBigIntText(value: unknown) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return 0n;
  return BigInt(value);
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

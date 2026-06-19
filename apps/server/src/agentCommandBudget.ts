import { sql } from "drizzle-orm";
import { getDatabase } from "./db/client.js";

export type AgentCommandBudget = {
  tier: "base" | "mfergpt_25m" | "mfergpt_100m" | "mfergpt_500m";
  balanceWei: string;
  maxCommandSeconds: number;
  rollingDailySeconds: number;
};

export type AgentCommandUsage = {
  walletAddress: string;
  windowStartedAt: string;
  usedSeconds: number;
  reservedSeconds: number;
  remainingSeconds: number;
};

const MFERGPT_DECIMALS = 10n ** 18n;
const MFERGPT_25M_WEI = 25_000_000n * MFERGPT_DECIMALS;
const MFERGPT_100M_WEI = 100_000_000n * MFERGPT_DECIMALS;
const MFERGPT_500M_WEI = 500_000_000n * MFERGPT_DECIMALS;
const COMMAND_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const COMMAND_RESERVATION_GRACE_MS = 60 * 1000;

type MutableCommandUsage = {
  windowStartedAt: number;
  usedSeconds: number;
  reservedSeconds: number;
  reservationExpiresAt: number;
};

type PersistedCommandUsageRow = {
  wallet_address?: unknown;
  window_started_at?: unknown;
  used_seconds?: unknown;
  reserved_seconds?: unknown;
  reservation_expires_at?: unknown;
};

type CommandUsageStore = {
  transaction<T>(callback: (tx: {
    execute<R extends Record<string, unknown> = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<Iterable<R>>;
  }) => Promise<T>): Promise<T>;
};

type CommandUsageTx = Parameters<Parameters<CommandUsageStore["transaction"]>[0]>[0];

const commandUsageByWallet = new Map<string, MutableCommandUsage>();

export function getAgentCommandBudget(balanceWei: string | bigint | null | undefined): AgentCommandBudget {
  const balance = normalizeWei(balanceWei);
  if (balance >= MFERGPT_500M_WEI) {
    return {
      tier: "mfergpt_500m",
      balanceWei: balance.toString(),
      maxCommandSeconds: 30 * 60,
      rollingDailySeconds: 360 * 60,
    };
  }
  if (balance >= MFERGPT_100M_WEI) {
    return {
      tier: "mfergpt_100m",
      balanceWei: balance.toString(),
      maxCommandSeconds: 30 * 60,
      rollingDailySeconds: 180 * 60,
    };
  }
  if (balance >= MFERGPT_25M_WEI) {
    return {
      tier: "mfergpt_25m",
      balanceWei: balance.toString(),
      maxCommandSeconds: 15 * 60,
      rollingDailySeconds: 60 * 60,
    };
  }
  return {
    tier: "base",
    balanceWei: balance.toString(),
    maxCommandSeconds: 5 * 60,
    rollingDailySeconds: 20 * 60,
  };
}

export function getLocalAgentCommandBudgetOverride(env: NodeJS.ProcessEnv = process.env): AgentCommandBudget | null {
  if (env.MFERLAND_AGENT_LOCAL_ONLY !== "1") return null;
  const balanceWei = env.MFERLAND_AGENT_COMMAND_BUDGET_BALANCE_WEI?.trim();
  if (!balanceWei) return null;
  return getAgentCommandBudget(balanceWei);
}

export function describeAgentCommandBudgetExhaustion(budget: AgentCommandBudget, usage: AgentCommandUsage) {
  const usedMinutes = Math.ceil(Math.max(0, usage.usedSeconds) / 60);
  const dailyMinutes = Math.ceil(Math.max(0, budget.rollingDailySeconds) / 60);
  return `agent command daily budget exhausted for ${budget.tier} tier (${usedMinutes}/${dailyMinutes} rolling daily minutes used). Hold at least 25M MFERGPT on Base for longer autoplay commands and Season 0 agent points; progress still saves below the gate.`;
}

function normalizeWei(value: string | bigint | null | undefined) {
  if (typeof value === "bigint") return value > 0n ? value : 0n;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return 0n;
  return BigInt(value.trim());
}

export async function reserveAgentCommandSeconds(walletAddress: string, budget: AgentCommandBudget, requestedSeconds: number, now = Date.now()) {
  const key = normalizeWalletKey(walletAddress);
  const db = getDatabase() as CommandUsageStore | null;
  if (!db) return reserveMemoryAgentCommandSeconds(key, budget, requestedSeconds, now);
  return db.transaction(async (tx) => {
    const usage = await getPersistedMutableUsage(tx, key, now);
    const result = reserveMutableAgentCommandSeconds(key, usage, budget, requestedSeconds, now);
    await writePersistedUsage(tx, key, usage);
    return result;
  });
}

export async function finalizeAgentCommandSeconds(walletAddress: string, reservedSeconds: number, startedAt: number, finishedAt = Date.now()) {
  const key = normalizeWalletKey(walletAddress);
  const db = getDatabase() as CommandUsageStore | null;
  if (!db) {
    finalizeMemoryAgentCommandSeconds(key, reservedSeconds, startedAt, finishedAt);
    return;
  }
  await db.transaction(async (tx) => {
    const usage = await getPersistedMutableUsage(tx, key, finishedAt);
    finalizeMutableAgentCommandSeconds(usage, reservedSeconds, startedAt, finishedAt);
    await writePersistedUsage(tx, key, usage);
  });
}

export async function getAgentCommandUsage(walletAddress: string, budget: AgentCommandBudget, now = Date.now()): Promise<AgentCommandUsage> {
  const key = normalizeWalletKey(walletAddress);
  const db = getDatabase() as CommandUsageStore | null;
  if (!db) return serializeUsage(key, getMutableMemoryUsage(key, now), budget);
  return db.transaction(async (tx) => {
    const usage = await getPersistedMutableUsage(tx, key, now);
    await writePersistedUsage(tx, key, usage);
    return serializeUsage(key, usage, budget);
  });
}

function reserveMemoryAgentCommandSeconds(walletAddress: string, budget: AgentCommandBudget, requestedSeconds: number, now: number) {
  return reserveMutableAgentCommandSeconds(walletAddress, getMutableMemoryUsage(walletAddress, now), budget, requestedSeconds, now);
}

function reserveMutableAgentCommandSeconds(
  walletAddress: string,
  usage: MutableCommandUsage,
  budget: AgentCommandBudget,
  requestedSeconds: number,
  now: number,
) {
  const remainingSeconds = Math.max(0, budget.rollingDailySeconds - usage.usedSeconds - usage.reservedSeconds);
  const seconds = Math.min(
    Math.max(1, Math.floor(requestedSeconds)),
    budget.maxCommandSeconds,
    remainingSeconds,
  );
  if (seconds <= 0) {
    return {
      ok: false,
      seconds: 0,
      usage: serializeUsage(walletAddress, usage, budget),
    };
  }
  usage.reservedSeconds += seconds;
  usage.reservationExpiresAt = Math.max(usage.reservationExpiresAt, now + (seconds * 1000) + COMMAND_RESERVATION_GRACE_MS);
  return {
    ok: true,
    seconds,
    usage: serializeUsage(walletAddress, usage, budget),
  };
}

function finalizeMemoryAgentCommandSeconds(walletAddress: string, reservedSeconds: number, startedAt: number, finishedAt: number) {
  finalizeMutableAgentCommandSeconds(getMutableMemoryUsage(walletAddress, finishedAt), reservedSeconds, startedAt, finishedAt);
}

function finalizeMutableAgentCommandSeconds(usage: MutableCommandUsage, reservedSeconds: number, startedAt: number, finishedAt: number) {
  const reserved = Math.max(0, Math.floor(reservedSeconds));
  const elapsed = Math.max(0, Math.ceil((finishedAt - startedAt) / 1000));
  usage.reservedSeconds = Math.max(0, usage.reservedSeconds - reserved);
  if (usage.reservedSeconds <= 0) usage.reservationExpiresAt = 0;
  usage.usedSeconds += Math.min(reserved || elapsed, elapsed || reserved);
}

function getMutableMemoryUsage(walletAddress: string, now: number) {
  const existing = commandUsageByWallet.get(walletAddress);
  if (existing && now - existing.windowStartedAt < COMMAND_USAGE_WINDOW_MS) {
    clearExpiredReservation(existing, now);
    return existing;
  }
  const next = { windowStartedAt: now, usedSeconds: 0, reservedSeconds: 0, reservationExpiresAt: 0 };
  commandUsageByWallet.set(walletAddress, next);
  return next;
}

async function getPersistedMutableUsage(tx: CommandUsageTx, walletAddress: string, now: number): Promise<MutableCommandUsage> {
  const rows = Array.from(await tx.execute<PersistedCommandUsageRow>(sql`
    SELECT wallet_address, window_started_at, used_seconds, reserved_seconds, reservation_expires_at
    FROM agent_command_usage
    WHERE wallet_address = ${walletAddress}
    FOR UPDATE
  `));
  const existing = rows[0] ? persistedUsageFromRow(rows[0]) : null;
  if (existing && now - existing.windowStartedAt < COMMAND_USAGE_WINDOW_MS) {
    clearExpiredReservation(existing, now);
    return existing;
  }
  return { windowStartedAt: now, usedSeconds: 0, reservedSeconds: 0, reservationExpiresAt: 0 };
}

async function writePersistedUsage(tx: CommandUsageTx, walletAddress: string, usage: MutableCommandUsage) {
  const windowStartedAt = new Date(usage.windowStartedAt).toISOString();
  const reservationExpiresAt = usage.reservationExpiresAt
    ? sql`${new Date(usage.reservationExpiresAt).toISOString()}::timestamptz`
    : sql`NULL`;
  await tx.execute(sql`
    INSERT INTO agent_command_usage (
      wallet_address,
      window_started_at,
      used_seconds,
      reserved_seconds,
      reservation_expires_at,
      updated_at
    )
    VALUES (
      ${walletAddress},
      ${windowStartedAt}::timestamptz,
      ${usage.usedSeconds},
      ${usage.reservedSeconds},
      ${reservationExpiresAt},
      now()
    )
    ON CONFLICT (wallet_address) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      used_seconds = excluded.used_seconds,
      reserved_seconds = excluded.reserved_seconds,
      reservation_expires_at = excluded.reservation_expires_at,
      updated_at = now()
  `);
}

function persistedUsageFromRow(row: PersistedCommandUsageRow): MutableCommandUsage {
  return {
    windowStartedAt: toTimestamp(row.window_started_at),
    usedSeconds: nonNegativeInteger(row.used_seconds),
    reservedSeconds: nonNegativeInteger(row.reserved_seconds),
    reservationExpiresAt: toTimestamp(row.reservation_expires_at),
  };
}

function clearExpiredReservation(usage: MutableCommandUsage, now: number) {
  if (usage.reservationExpiresAt > 0 && usage.reservationExpiresAt <= now) {
    usage.reservedSeconds = 0;
    usage.reservationExpiresAt = 0;
  }
}

function serializeUsage(
  walletAddress: string,
  usage: MutableCommandUsage,
  budget: AgentCommandBudget,
): AgentCommandUsage {
  return {
    walletAddress,
    windowStartedAt: new Date(usage.windowStartedAt).toISOString(),
    usedSeconds: usage.usedSeconds,
    reservedSeconds: usage.reservedSeconds,
    remainingSeconds: Math.max(0, budget.rollingDailySeconds - usage.usedSeconds - usage.reservedSeconds),
  };
}

function normalizeWalletKey(value: string) {
  return value.trim().toLowerCase() || "unknown";
}

function toTimestamp(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

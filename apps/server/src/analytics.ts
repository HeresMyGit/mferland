import { createHash, randomUUID } from "node:crypto";
import { type IdentityType } from "@mferland/shared";
import { getDatabase } from "./db/client.js";
import { analyticsEvents } from "./db/schema.js";

export type AnalyticsProperties = Record<string, unknown>;

type RecordAnalyticsEventOptions = {
  eventType: string;
  sessionId?: string;
  characterId?: string | null;
  identityType?: IdentityType | "npc" | "";
  walletAddress?: string;
  walletHash?: string;
  properties?: AnalyticsProperties;
};

const MAX_EVENT_TYPE_LENGTH = 96;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_PROPERTY_KEYS = 32;
const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 12;
const MAX_DEPTH = 3;
const SENSITIVE_PROPERTY_KEY_PATTERN = /(wallet|secret|private|mnemonic|password|txhash|transactionhash|rawtx|auth|bearer|cookie|sessiontoken|apikey|api_key)/i;

export async function recordAnalyticsEvent({
  eventType,
  sessionId = "",
  characterId = null,
  identityType = "",
  walletAddress = "",
  walletHash = "",
  properties = {},
}: RecordAnalyticsEventOptions) {
  const db = getDatabase();
  if (!db) return;

  const normalizedEventType = normalizeEventType(eventType);
  if (!normalizedEventType) return;

  try {
    await db.insert(analyticsEvents).values({
      id: randomUUID(),
      eventType: normalizedEventType,
      sessionId: normalizeSessionId(sessionId),
      characterId: characterId || null,
      identityType: normalizeIdentityType(identityType),
      walletHash: normalizeWalletHash(walletHash) || hashWallet(walletAddress),
      properties: sanitizeAnalyticsProperties(properties),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("analytics.event_failed", {
      eventType: normalizedEventType,
      sessionId,
      error,
    });
  }
}

export function hashWallet(walletAddress: string) {
  const normalized = walletAddress.toLowerCase().trim();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return "";
  return createHash("sha256").update(normalized).digest("hex");
}

function normalizeEventType(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.:-]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_EVENT_TYPE_LENGTH);
}

function normalizeSessionId(value: string) {
  return value.trim().slice(0, MAX_SESSION_ID_LENGTH);
}

function normalizeIdentityType(value: IdentityType | "npc" | "") {
  return value === "guest" || value === "wallet" || value === "agent" || value === "npc" ? value : "";
}

function normalizeWalletHash(value: string) {
  const normalized = value.toLowerCase().trim();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function sanitizeAnalyticsProperties(properties: AnalyticsProperties) {
  const sanitized = sanitizeRecord(properties, 0);
  return sanitized;
}

function sanitizeRecord(value: AnalyticsProperties, depth: number): AnalyticsProperties {
  if (depth >= MAX_DEPTH) return {};

  const result: AnalyticsProperties = {};
  for (const [key, rawValue] of Object.entries(value).slice(0, MAX_PROPERTY_KEYS)) {
    const normalizedKey = normalizePropertyKey(key);
    if (!normalizedKey || SENSITIVE_PROPERTY_KEY_PATTERN.test(normalizedKey)) continue;
    const sanitizedValue = sanitizeValue(rawValue, depth + 1);
    if (sanitizedValue !== undefined) result[normalizedKey] = sanitizedValue;
  }
  return result;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return undefined;
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object" && value) {
    if (depth >= MAX_DEPTH) return undefined;
    return sanitizeRecord(value as AnalyticsProperties, depth);
  }
  return undefined;
}

function normalizePropertyKey(value: string) {
  return value
    .replaceAll(/[^a-zA-Z0-9_:-]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

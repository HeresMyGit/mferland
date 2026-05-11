export function sanitizePlayerName(input: unknown, fallback = "mfer"): string {
  const text = typeof input === "string" ? input : "";
  const cleaned = text
    .replace(/[^\w .$-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

  return cleaned || fallback;
}

export function normalizeWalletAddress(input: unknown): string {
  if (typeof input !== "string") return "";
  const normalized = input.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const MAX_AVATAR_SEED = 2_147_483_647;

export function normalizeAvatarSeed(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeAvatarSeed(fallback, 0);
  return Math.abs(Math.trunc(numeric)) % (MAX_AVATAR_SEED + 1);
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeGuestName(seed: string): string {
  return `mfer#${String(stableHash(seed) % 10000).padStart(4, "0")}`;
}

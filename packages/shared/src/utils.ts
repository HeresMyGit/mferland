export function sanitizePlayerName(input: unknown, fallback = "mfer"): string {
  const text = typeof input === "string" ? input : "";
  const cleaned = text
    .replace(/[^\w .$-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

  return cleaned || fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

import { MFER_BACKGROUND_COLORS, MFER_COLORS } from "./mferPalette";

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickSeeded<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

export function colorFromSeed(seed: number): string {
  const colors = [
    MFER_BACKGROUND_COLORS.yellow,
    MFER_BACKGROUND_COLORS.green,
    MFER_BACKGROUND_COLORS.blue,
    MFER_BACKGROUND_COLORS.red,
    MFER_COLORS.agent,
    MFER_COLORS.signal,
    MFER_BACKGROUND_COLORS.orange,
  ];
  return pickSeeded(colors, seed);
}

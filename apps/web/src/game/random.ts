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
  const colors = ["#f1c84b", "#54d66a", "#51a7ff", "#ef4f61", "#a767ff", "#35d9d0", "#f68b3c"];
  return pickSeeded(colors, seed);
}

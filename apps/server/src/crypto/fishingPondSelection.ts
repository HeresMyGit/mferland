import { randomBytes } from "node:crypto";
import type { FishingPondEntrySnapshot } from "./fishingPond.js";

type RandomBelow = (maxExclusive: bigint) => bigint;

export function selectWeightedFishingPondEntry(
  entries: readonly FishingPondEntrySnapshot[],
  randomBelow: RandomBelow = randomBigIntBelow,
) {
  const weightedEntries: Array<{ entry: FishingPondEntrySnapshot; weight: bigint }> = [];
  let totalWeight = 0n;

  for (const entry of entries) {
    const weight = parsePositiveBigInt(entry.remainingAmount);
    if (weight <= 0n) continue;
    weightedEntries.push({ entry, weight });
    totalWeight += weight;
  }

  if (totalWeight <= 0n) return null;

  let cursor = randomBelow(totalWeight);
  if (cursor < 0n || cursor >= totalWeight) {
    throw new Error("weighted pond entry random value out of range");
  }

  for (const { entry, weight } of weightedEntries) {
    if (cursor < weight) return entry;
    cursor -= weight;
  }

  return weightedEntries.at(-1)?.entry ?? null;
}

function parsePositiveBigInt(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

function randomBigIntBelow(maxExclusive: bigint) {
  if (maxExclusive <= 0n) throw new Error("random max must be positive");

  const bitLength = maxExclusive.toString(2).length;
  const byteLength = Math.ceil(bitLength / 8);
  const range = 1n << BigInt(byteLength * 8);
  const limit = range - (range % maxExclusive);

  while (true) {
    const candidate = BigInt(`0x${randomBytes(byteLength).toString("hex")}`);
    if (candidate < limit) return candidate % maxExclusive;
  }
}

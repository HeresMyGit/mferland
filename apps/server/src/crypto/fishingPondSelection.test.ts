import assert from "node:assert/strict";
import test from "node:test";
import type { FishingPondEntrySnapshot } from "./fishingPond.js";
import { selectWeightedFishingPondEntry } from "./fishingPondSelection.js";

test("weighted pond entry selection treats remaining ERC1155 units as individual odds", () => {
  const rare = makeEntry("1", "1");
  const common = makeEntry("2", "100");
  const counts = new Map<string, number>();

  for (let slot = 0n; slot < 101n; slot += 1n) {
    const selected = selectWeightedFishingPondEntry([rare, common], () => slot);
    assert.ok(selected);
    counts.set(selected.pondEntryId, (counts.get(selected.pondEntryId) ?? 0) + 1);
  }

  assert.equal(counts.get("1"), 1);
  assert.equal(counts.get("2"), 100);
});

test("weighted pond entry selection preserves proportional odds across mixed pond entries", () => {
  const common = makeEntry("1", "100");
  const uncommon = makeEntry("2", "5");
  const rare = makeEntry("3", "1");
  const counts = new Map<string, number>();

  for (let slot = 0n; slot < 106n; slot += 1n) {
    const selected = selectWeightedFishingPondEntry([common, uncommon, rare], () => slot);
    assert.ok(selected);
    counts.set(selected.pondEntryId, (counts.get(selected.pondEntryId) ?? 0) + 1);
  }

  assert.equal(counts.get("1"), 100);
  assert.equal(counts.get("2"), 5);
  assert.equal(counts.get("3"), 1);
});

test("weighted pond entry selection ignores empty or invalid remaining amounts", () => {
  const empty = makeEntry("1", "0");
  const invalid = makeEntry("2", "lol");
  const stocked = makeEntry("3", "7");

  const selected = selectWeightedFishingPondEntry([empty, invalid, stocked], () => 6n);

  assert.equal(selected?.pondEntryId, "3");
});

test("weighted pond entry selection supports amounts larger than Number safe integers", () => {
  const huge = makeEntry("1", "90071992547409930");
  const one = makeEntry("2", "1");

  assert.equal(selectWeightedFishingPondEntry([huge, one], () => 90071992547409929n)?.pondEntryId, "1");
  assert.equal(selectWeightedFishingPondEntry([huge, one], () => 90071992547409930n)?.pondEntryId, "2");
});

function makeEntry(pondEntryId: string, remainingAmount: string): FishingPondEntrySnapshot {
  return {
    pondEntryId,
    standard: "ERC1155",
    tokenStandard: 2,
    collection: "0x1111111111111111111111111111111111111111",
    tokenId: pondEntryId,
    remainingAmount,
    depositor: "0x2222222222222222222222222222222222222222",
  };
}

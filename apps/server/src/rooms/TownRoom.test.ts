import assert from "node:assert/strict";
import test from "node:test";
import {
  claimFishingVendorSaleSession,
  fishingVendorSaleOwnerKey,
  isDuplicateFishingVendorRequest,
  normalizeFishingVendorRequestId,
  rememberFishingVendorRequestId,
} from "./TownRoom.js";

test("fishing vendor request ids are bounded and duplicate bridge sends are ignored", () => {
  assert.equal(normalizeFishingVendorRequestId("sale-123"), "sale-123");
  assert.equal(normalizeFishingVendorRequestId(" sale-123 "), "sale-123");
  assert.equal(normalizeFishingVendorRequestId("bad request"), "");
  assert.equal(normalizeFishingVendorRequestId("x".repeat(97)), "");

  const remembered = rememberFishingVendorRequestId(undefined, "sale-123");
  const rememberedTwice = rememberFishingVendorRequestId(remembered, "sale-124");
  assert.equal(isDuplicateFishingVendorRequest(rememberedTwice, "sale-123"), true);
  assert.equal(isDuplicateFishingVendorRequest(rememberedTwice, "sale-124"), true);
  assert.equal(isDuplicateFishingVendorRequest(rememberedTwice, "sale-125"), false);
  assert.equal(isDuplicateFishingVendorRequest(undefined, "sale-123"), false);
  const bounded = Array.from({ length: 20 }, (_, index) => `sale-${index}`)
    .reduce<string[]>((ids, requestId) => rememberFishingVendorRequestId(ids, requestId), []);
  assert.equal(bounded.length, 16);
  assert.equal(bounded.includes("sale-0"), false);
  assert.equal(bounded.includes("sale-19"), true);

  const inFlight = new Set<string>();
  assert.equal(claimFishingVendorSaleSession(inFlight, "session-a"), true);
  assert.equal(claimFishingVendorSaleSession(inFlight, "session-a"), false);
  inFlight.delete("session-a");
  assert.equal(claimFishingVendorSaleSession(inFlight, "session-a"), true);

  assert.equal(fishingVendorSaleOwnerKey("character-1", "0x1111111111111111111111111111111111111111", "session-a"), "character:character-1");
  assert.equal(fishingVendorSaleOwnerKey("character-1", "0x2222222222222222222222222222222222222222", "session-b"), "character:character-1");
  assert.equal(fishingVendorSaleOwnerKey("", "0x1111111111111111111111111111111111111111", "session-a"), "wallet:0x1111111111111111111111111111111111111111");
});

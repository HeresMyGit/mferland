import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFishingCancelResult,
  claimFishingVendorSaleSession,
  describeFishingPondClaimPersistenceConflict,
  describeFishingPondClaimVerificationFailure,
  describeMintClubRedemptionVerificationFailure,
  describeMintClubRedemptionPersistenceConflict,
  describeFishingVendorBundleRequirements,
  describeFishingVendorZeroSale,
  fishingVendorSaleOwnerKey,
  isDuplicateFishingVendorRequest,
  normalizeFishingVendorRequestId,
  rememberFishingVendorRequestId,
  shouldExpireFishingPondCatch,
} from "./TownRoom.js";

test("submitted pond claims never expire before authoritative reconciliation", () => {
  const now = Date.UTC(2026, 6, 14, 12, 0, 0);
  assert.equal(shouldExpireFishingPondCatch("pending", now - 1, now), true);
  assert.equal(shouldExpireFishingPondCatch("voucher_issued", now, now), true);
  assert.equal(shouldExpireFishingPondCatch("voucher_issued", now + 1, now), false);
  assert.equal(shouldExpireFishingPondCatch("tx_submitted", now - 86_400_000, now), false);
});

test("pond claim receipt verification failures never expose provider details", () => {
  const pending = describeFishingPondClaimVerificationFailure(new Error(
    "HTTP request failed for https://rpc.example/v2/private-provider-key",
  ));
  assert.deepEqual(pending, {
    definitiveFailure: false,
    publicError: "Fishing pond claim confirmation is unavailable; retry submit_claim_tx with the same transaction hash",
  });
  assert.doesNotMatch(pending.publicError, /https?:|rpc|provider|private/i);

  assert.deepEqual(describeFishingPondClaimVerificationFailure(
    new Error("transaction receipt not found at https://rpc.example/v2/private-provider-key"),
  ), {
    definitiveFailure: false,
    publicError: "Fishing pond claim confirmation is unavailable; retry submit_claim_tx with the same transaction hash",
  });

  assert.deepEqual(describeFishingPondClaimVerificationFailure(
    new Error("FishingPond CatchClaimed event not found"),
  ), {
    definitiveFailure: true,
    publicError: "Fishing pond claim transaction did not contain a valid claim; refresh before retrying",
  });
});

test("pond claim persistence conflicts are structured and sanitized", () => {
  assert.equal(
    describeFishingPondClaimPersistenceConflict("tx_hash_conflict"),
    "claim transaction hash is already assigned to another catch",
  );
  assert.equal(
    describeFishingPondClaimPersistenceConflict("state_conflict"),
    "claim state changed; refresh history before retrying",
  );
});

test("Mint Club receipt verification failures never expose provider details", () => {
  const failed = describeMintClubRedemptionVerificationFailure(new Error(
    "HTTP request failed for https://rpc.example/v2/private-provider-key",
  ));
  assert.deepEqual(failed, {
    definitiveFailure: false,
    publicError: "Mint Club redemption confirmation is unavailable; retry submit_redemption_tx with the same transaction hash",
  });
  assert.doesNotMatch(failed.publicError, /https?:|rpc|provider|private/i);

  assert.deepEqual(describeMintClubRedemptionVerificationFailure(
    new Error("transaction receipt not found at https://rpc.example/v2/private-provider-key"),
  ), {
    definitiveFailure: false,
    publicError: "Mint Club redemption confirmation is unavailable; retry submit_redemption_tx with the same transaction hash",
  });

  assert.deepEqual(describeMintClubRedemptionVerificationFailure(
    new Error("Mint Club redemption transaction reverted"),
  ), {
    definitiveFailure: true,
    publicError: "Mint Club redemption transaction did not contain a valid sale; refresh before retrying",
  });
});

test("Mint Club redemption persistence conflicts are structured and sanitized", () => {
  assert.equal(
    describeMintClubRedemptionPersistenceConflict("tx_hash_conflict"),
    "redemption transaction hash is already assigned to another catch",
  );
  assert.equal(
    describeMintClubRedemptionPersistenceConflict("state_conflict"),
    "redemption state changed; refresh history before retrying",
  );
});

test("fishing cancellation acknowledgements are safe and preserve the pre-cancel attempt", () => {
  assert.deepEqual(buildFishingCancelResult(true, "attempt-1", { requestId: "  command-1  " }), {
    ok: true,
    requestId: "command-1",
    attemptId: "attempt-1",
    canceled: true,
  });
  assert.deepEqual(buildFishingCancelResult(true, "", { requestId: "command-1" }), {
    ok: true,
    requestId: "command-1",
    attemptId: "",
    canceled: false,
  });
  assert.deepEqual(buildFishingCancelResult(false, "", null), {
    ok: false,
    requestId: "",
    attemptId: "",
    canceled: false,
  });
  assert.equal(buildFishingCancelResult(true, "attempt-2", {
    requestId: `  ${"x".repeat(100)}  `,
  }).requestId, "x".repeat(80));
});

test("fishing vendor reports exact declared-agent bundle shortfalls", () => {
  assert.deepEqual(describeFishingVendorBundleRequirements([
    { itemId: "messy-red-lobster", availableQuantity: 1 },
    { itemId: "green-fin-mferfish", availableQuantity: 16 },
    { itemId: "based-bass", availableQuantity: 5 },
  ], true), [
    {
      itemId: "messy-red-lobster",
      itemName: "messy red lobster",
      availableQuantity: 1,
      bundleSize: 4,
      neededQuantity: 3,
      pointsPerBundle: 5,
    },
    {
      itemId: "green-fin-mferfish",
      itemName: "green-fin mferfish",
      availableQuantity: 16,
      bundleSize: 20,
      neededQuantity: 4,
      pointsPerBundle: 1,
    },
    {
      itemId: "based-bass",
      itemName: "based bass",
      availableQuantity: 5,
      bundleSize: 6,
      neededQuantity: 1,
      pointsPerBundle: 4,
    },
  ]);
});

test("fishing vendor bundle requirements distinguish empty and complete stacks", () => {
  assert.deepEqual(describeFishingVendorZeroSale([
    { itemId: "based-bass", availableQuantity: 0 },
  ], { isAgent: true }), {
    status: "error",
    error: "no fish in stash",
  });
  assert.deepEqual(describeFishingVendorZeroSale([
    { itemId: "messy-red-lobster", availableQuantity: 1 },
    { itemId: "green-fin-mferfish", availableQuantity: 16 },
    { itemId: "based-bass", availableQuantity: 5 },
  ], { isAgent: true }), {
    status: "insufficient_bundle",
    bundleRequirements: describeFishingVendorBundleRequirements([
      { itemId: "messy-red-lobster", availableQuantity: 1 },
      { itemId: "green-fin-mferfish", availableQuantity: 16 },
      { itemId: "based-bass", availableQuantity: 5 },
    ], true),
    error: "fish in stash but no complete agent bundle; use bundleRequirements for exact shortfalls",
  });
  assert.deepEqual(describeFishingVendorZeroSale([
    { itemId: "based-bass", availableQuantity: 6 },
  ], { isAgent: true, pointCapacity: 4 }), {
    status: "error",
    error: "complete fish bundles could not be sold",
  });
});

test("fishing vendor reports Season point capacity below a complete agent bundle", () => {
  const completeBasedBass = [{ itemId: "based-bass" as const, availableQuantity: 6 }];
  const requirement = describeFishingVendorBundleRequirements(completeBasedBass, true);
  assert.deepEqual(describeFishingVendorZeroSale(completeBasedBass, {
    isAgent: true,
    pointCapacity: 0,
  }), {
    status: "season_point_capacity",
    bundleRequirements: requirement,
    seasonPointCapacity: 0,
    minimumBundlePoints: 4,
    error: "season point cap reached; remaining capacity is 0",
  });
  assert.deepEqual(describeFishingVendorZeroSale(completeBasedBass, {
    isAgent: true,
    pointCapacity: 3,
  }), {
    status: "season_point_capacity",
    bundleRequirements: requirement,
    seasonPointCapacity: 3,
    minimumBundlePoints: 4,
    error: "remaining Season point capacity 3 is below the next fish bundle award of 4",
  });
});

test("fishing vendor reports an item-specific quantity below a complete agent bundle", () => {
  const completeBasedBass = [{ itemId: "based-bass" as const, availableQuantity: 6 }];
  assert.deepEqual(describeFishingVendorZeroSale(completeBasedBass, {
    isAgent: true,
    selectedItemId: "based-bass",
    requestedQuantity: 1,
    pointCapacity: 500,
  }), {
    status: "request_limit",
    bundleRequirements: describeFishingVendorBundleRequirements(completeBasedBass, true),
    requestedQuantity: 1,
    error: "requested quantity 1 is below the 6-fish agent bundle",
  });

  const incompleteBasedBass = [{ itemId: "based-bass" as const, availableQuantity: 5 }];
  assert.deepEqual(describeFishingVendorZeroSale(incompleteBasedBass, {
    isAgent: true,
    selectedItemId: "based-bass",
    requestedQuantity: 1,
    pointCapacity: 500,
  }), {
    status: "request_limit",
    bundleRequirements: describeFishingVendorBundleRequirements(incompleteBasedBass, true),
    requestedQuantity: 1,
    error: "requested quantity 1 is below the 6-fish agent bundle",
  });
});

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

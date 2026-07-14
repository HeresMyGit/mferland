import assert from "node:assert/strict";
import test from "node:test";
import {
  getWalletClientKindMismatchMessage,
  isConfirmedFishingPondClaimTx,
  isFishingPondClaimTxHashConflict,
  isMintClubRedemptionPreparationReservableStatus,
  isMintClubRedemptionTxHashConflict,
  normalizeFishingPondTxHash,
  normalizeMintClubRedemptionStatus,
  normalizeMintClubRedemptionTxHash,
  normalizeWalletClientKind,
} from "./persistence.js";

test("wallet client kind mismatch messages name the registered kind", () => {
  assert.equal(getWalletClientKindMismatchMessage("human", "agent"), "wallet already registered for a human");
  assert.equal(getWalletClientKindMismatchMessage("agent", "human"), "wallet already registered for an agent");
  assert.equal(getWalletClientKindMismatchMessage("human", "human"), "");
  assert.equal(getWalletClientKindMismatchMessage("", "agent"), "");
});

test("wallet client kind normalization only accepts human and agent", () => {
  assert.equal(normalizeWalletClientKind("human"), "human");
  assert.equal(normalizeWalletClientKind("agent"), "agent");
  assert.equal(normalizeWalletClientKind("external"), "");
  assert.equal(normalizeWalletClientKind(undefined), "");
});

test("Mint Club redemption transaction hashes normalize before unique assignment", () => {
  const upperHash = `0x${"AB".repeat(32)}`;
  assert.equal(normalizeMintClubRedemptionTxHash(`  ${upperHash}  `), upperHash.toLowerCase());
  assert.equal(normalizeMintClubRedemptionTxHash(undefined), "");
});

test("pond claim transaction hashes normalize before unique assignment", () => {
  const upperHash = `0x${"AB".repeat(32)}`;
  assert.equal(normalizeFishingPondTxHash(`  ${upperHash}  `), upperHash.toLowerCase());
  assert.equal(normalizeFishingPondTxHash(undefined), "");
});

test("same-hash confirmed pond claims reconcile idempotently", () => {
  const txHash = `0x${"ab".repeat(32)}`;
  assert.equal(isConfirmedFishingPondClaimTx({ status: "confirmed", txHash }, txHash.toUpperCase().replace("0X", "0x")), true);
  assert.equal(isConfirmedFishingPondClaimTx({ status: "confirmed", txHash }, `0x${"cd".repeat(32)}`), false);
  assert.equal(isConfirmedFishingPondClaimTx({ status: "tx_submitted", txHash }, txHash), false);
});

test("pond claim unique conflicts recognize only the claim transaction index", () => {
  assert.equal(isFishingPondClaimTxHashConflict({
    code: "23505",
    constraint_name: "fishing_pond_catches_tx_hash_unique_idx",
  }), true);
  assert.equal(isFishingPondClaimTxHashConflict({
    cause: { code: "23505", constraint: "fishing_pond_catches_tx_hash_unique_idx" },
  }), true);
  assert.equal(isFishingPondClaimTxHashConflict({ code: "23505", constraint_name: "some_other_unique_idx" }), false);
  assert.equal(isFishingPondClaimTxHashConflict({ code: "23503" }), false);
});

test("Mint Club redemption unique conflicts recognize the partial unique index violation", () => {
  assert.equal(isMintClubRedemptionTxHashConflict({
    code: "23505",
    constraint_name: "fishing_pond_catches_mint_club_tx_hash_unique_idx",
  }), true);
  assert.equal(isMintClubRedemptionTxHashConflict({
    cause: { code: "23505", constraint: "fishing_pond_catches_mint_club_tx_hash_unique_idx" },
  }), true);
  assert.equal(isMintClubRedemptionTxHashConflict({ code: "23505", constraint_name: "some_other_unique_idx" }), false);
  assert.equal(isMintClubRedemptionTxHashConflict({ code: "23503" }), false);
});

test("Mint Club sell preparation is a one-way compare-and-set from preparable states", () => {
  assert.equal(isMintClubRedemptionPreparationReservableStatus(""), true);
  assert.equal(isMintClubRedemptionPreparationReservableStatus("eligible"), true);
  assert.equal(isMintClubRedemptionPreparationReservableStatus("failed"), true);
  assert.equal(isMintClubRedemptionPreparationReservableStatus("prepared"), false);
  assert.equal(isMintClubRedemptionPreparationReservableStatus("tx_submitted"), false);
  assert.equal(isMintClubRedemptionPreparationReservableStatus("confirmed"), false);
  assert.equal(normalizeMintClubRedemptionStatus("prepared"), "prepared");
  assert.equal(normalizeMintClubRedemptionStatus("unknown"), "");
});

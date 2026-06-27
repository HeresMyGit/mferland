import test from "node:test";
import assert from "node:assert/strict";
import {
  MINT_CLUB_BASE_SEPOLIA_BOND_ADDRESS,
  MINT_CLUB_BASE_SEPOLIA_CHAIN_ID,
  MINT_CLUB_BASE_SEPOLIA_ERC1155_ADDRESS,
  MINT_CLUB_BASE_SEPOLIA_WETH_ADDRESS,
  MINT_CLUB_REDEMPTION_NPC_ID,
} from "@mferland/shared";
import type { PersistedFishingPondCatch } from "../persistence.js";
import {
  isMintClubRedemptionEligibleCatch,
  makeMintClubRedemptionSnapshot,
  resolveMintClubRedemptionConfig,
} from "./mintClubRedemption.js";

const ALLOWED_COLLECTION = "0x1111111111111111111111111111111111111111";
const OTHER_COLLECTION = "0x2222222222222222222222222222222222222222";

test("Mint Club redemption config only enables with an explicit allowlist", () => {
  const disabled = resolveMintClubRedemptionConfig({
    MFERLAND_MINT_CLUB_REDEMPTION_ENABLED: "true",
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.chainId, MINT_CLUB_BASE_SEPOLIA_CHAIN_ID);
  assert.equal(disabled.bondAddress, MINT_CLUB_BASE_SEPOLIA_BOND_ADDRESS);
  assert.equal(disabled.erc1155Address, MINT_CLUB_BASE_SEPOLIA_ERC1155_ADDRESS);
  assert.equal(disabled.reserveTokenAddress, MINT_CLUB_BASE_SEPOLIA_WETH_ADDRESS);

  const enabled = resolveMintClubRedemptionConfig({
    MFERLAND_MINT_CLUB_REDEMPTION_ENABLED: "1",
    MFERLAND_MINT_CLUB_REDEMPTION_ALLOWED_COLLECTIONS: `${ALLOWED_COLLECTION}, not-an-address`,
    MFERLAND_MINT_CLUB_REDEMPTION_SELL_ROYALTY_BPS: "250",
    MFERLAND_MINT_CLUB_REDEMPTION_SLIPPAGE_BPS: "75",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.allowedCollections.size, 1);
  assert.equal(enabled.allowedCollections.has(ALLOWED_COLLECTION.toLowerCase()), true);
  assert.equal(enabled.sellRoyaltyBps, 250);
  assert.equal(enabled.slippageBps, 75);
});

test("Mint Club redemption eligibility is separate from pond catch allowlist and requires ERC-1155", () => {
  const config = resolveMintClubRedemptionConfig({
    MFERLAND_MINT_CLUB_REDEMPTION_ENABLED: "true",
    MFERLAND_MINT_CLUB_REDEMPTION_ALLOWED_COLLECTIONS: ALLOWED_COLLECTION,
  });

  assert.equal(isMintClubRedemptionEligibleCatch(makeCatch(), config), true);
  assert.equal(isMintClubRedemptionEligibleCatch(makeCatch({ standard: "ERC721" }), config), false);
  assert.equal(isMintClubRedemptionEligibleCatch(makeCatch({ collection: OTHER_COLLECTION }), config), false);
  assert.equal(isMintClubRedemptionEligibleCatch(makeCatch({ chainId: 31337 }), config), false);
});

test("Mint Club redemption snapshot exposes wallet action state for confirmed catches", () => {
  const config = resolveMintClubRedemptionConfig({
    MFERLAND_MINT_CLUB_REDEMPTION_ENABLED: "true",
    MFERLAND_MINT_CLUB_REDEMPTION_ALLOWED_COLLECTIONS: ALLOWED_COLLECTION,
  });

  const unclaimed = makeMintClubRedemptionSnapshot(makeCatch({ status: "voucher_issued" }), config);
  assert.equal(unclaimed?.status, "claim_required");
  assert.equal(unclaimed?.walletActionRequired, false);

  const eligible = makeMintClubRedemptionSnapshot(makeCatch(), config);
  assert.equal(eligible?.status, "eligible");
  assert.equal(eligible?.walletActionRequired, true);
  assert.equal(eligible?.npcId, MINT_CLUB_REDEMPTION_NPC_ID);
  assert.equal(eligible?.collection, ALLOWED_COLLECTION);
  assert.equal(eligible?.tokenId, "0");
  assert.equal(eligible?.sellRoyaltyBps, 300);

  const submittedAt = new Date("2026-06-26T12:00:00.000Z");
  const txSubmitted = makeMintClubRedemptionSnapshot(makeCatch({
    mintClubRedemptionStatus: "tx_submitted",
    mintClubRedemptionTxHash: "0x1234",
    mintClubRedemptionSubmittedAt: submittedAt,
  }), config);
  assert.equal(txSubmitted?.status, "tx_submitted");
  assert.equal(txSubmitted?.walletActionRequired, true);
  assert.equal(txSubmitted?.txHash, "0x1234");
  assert.equal(txSubmitted?.submittedAt, Math.floor(submittedAt.getTime() / 1000));

  const sold = makeMintClubRedemptionSnapshot(makeCatch({
    mintClubRedemptionStatus: "confirmed",
    mintClubRedemptionTxHash: "0xabcd",
    mintClubRedemptionConfirmedAt: submittedAt,
  }), config);
  assert.equal(sold?.status, "confirmed");
  assert.equal(sold?.walletActionRequired, false);
  assert.equal(sold?.confirmedAt, Math.floor(submittedAt.getTime() / 1000));
});

function makeCatch(overrides: Partial<PersistedFishingPondCatch> = {}): PersistedFishingPondCatch {
  const now = new Date("2026-06-26T00:00:00.000Z");
  return {
    catchId: "catch-1",
    characterId: "character-1",
    walletAddress: "0x3333333333333333333333333333333333333333",
    attemptId: "attempt-1",
    status: "confirmed",
    chainId: MINT_CLUB_BASE_SEPOLIA_CHAIN_ID,
    contractAddress: "0x4444444444444444444444444444444444444444",
    standard: "ERC1155",
    collection: ALLOWED_COLLECTION,
    tokenId: "0",
    amount: "1",
    pondEntryId: "1",
    metadata: null,
    voucher: null,
    txHash: "",
    mintClubRedemptionStatus: "",
    mintClubRedemptionTxHash: "",
    mintClubRedemptionError: "",
    mintClubRedemptionSubmittedAt: null,
    mintClubRedemptionConfirmedAt: null,
    error: "",
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
    txSubmittedAt: null,
    confirmedAt: now,
    ...overrides,
  };
}

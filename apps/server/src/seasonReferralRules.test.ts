import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeasonReferralBonusDelta,
  getSeasonReferralCreateDecision,
  getSeasonReferralProgressUpdate,
  isSeasonReferralEligibleBaseAward,
} from "./seasonReferralRules.js";

const REFERRER = "0x1111111111111111111111111111111111111111";
const REFEREE = "0x2222222222222222222222222222222222222222";

test("referral binding rejects self, agent, invalid referrer, and max-slot cases", () => {
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFERRER,
  }).reason, "self_referral");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: "not-a-wallet",
    refereeWalletAddress: REFEREE,
  }).reason, "invalid_wallet");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFEREE,
    referrerExists: false,
  }).reason, "missing_referrer");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFEREE,
    referrerIsAgent: true,
  }).reason, "agent_referrer");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFEREE,
    refereeIsAgent: true,
  }).reason, "agent_referee");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFEREE,
    referrerReferralCount: 10,
  }).reason, "max_referees");
  assert.equal(getSeasonReferralCreateDecision({
    referrerWalletAddress: REFERRER,
    refereeWalletAddress: REFEREE,
    referrerReferralCount: 9,
  }).reason, "ok");
});

test("pending legacy referrals activate immediately and count the current award", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const update = getSeasonReferralProgressUpdate({
    status: "pending",
    activatedAt: null,
    postActivationBasePoints: 0,
    totalEligibleBasePoints: 3,
    awardedPoints: 3,
    now,
  });

  assert.equal(update.nextStatus, "active");
  assert.equal(update.nextActivatedAt, now);
  assert.equal(update.nextPostActivationBasePoints, 3);
  assert.equal(update.shouldCountAward, true);
});

test("eligible base points accumulate immediately across sessions for 3 plus 2 bonus math", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const first = getSeasonReferralProgressUpdate({
    status: "active",
    activatedAt: now,
    postActivationBasePoints: 0,
    totalEligibleBasePoints: 28,
    awardedPoints: 3,
    now,
  });
  assert.equal(first.nextPostActivationBasePoints, 3);
  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: first.nextPostActivationBasePoints,
    referrerBonusPoints: 0,
    refereeBonusPoints: 0,
    referrerCapacity: 500,
    refereeCapacity: 500,
  }), 0);

  const second = getSeasonReferralProgressUpdate({
    status: "active",
    activatedAt: now,
    postActivationBasePoints: first.nextPostActivationBasePoints,
    totalEligibleBasePoints: 30,
    awardedPoints: 2,
    now,
  });
  assert.equal(second.nextPostActivationBasePoints, 5);
  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: second.nextPostActivationBasePoints,
    referrerBonusPoints: 0,
    refereeBonusPoints: 0,
    referrerCapacity: 500,
    refereeCapacity: 500,
  }), 1);
});

test("referral bonus events do not cascade and bonus deltas respect pending capacity", () => {
  assert.equal(isSeasonReferralEligibleBaseAward({
    sourceType: "referral",
    isAgent: false,
    walletIsAgent: false,
    awardedPoints: 100,
  }), false);
  assert.equal(isSeasonReferralEligibleBaseAward({
    sourceType: "event",
    isAgent: true,
    walletIsAgent: false,
    awardedPoints: 100,
  }), false);
  assert.equal(isSeasonReferralEligibleBaseAward({
    sourceType: "event",
    isAgent: false,
    walletIsAgent: true,
    awardedPoints: 100,
  }), false);
  assert.equal(isSeasonReferralEligibleBaseAward({
    sourceType: "event",
    isAgent: false,
    walletIsAgent: false,
    awardedPoints: 100,
  }), true);
  assert.equal(isSeasonReferralEligibleBaseAward({
    sourceType: "quest",
    isAgent: false,
    walletIsAgent: false,
    awardedPoints: 100,
  }), true);

  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: 100,
    referrerBonusPoints: 10,
    refereeBonusPoints: 10,
    referrerCapacity: 0,
    refereeCapacity: 500,
  }), 0);
  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: 100,
    referrerBonusPoints: 10,
    refereeBonusPoints: 10,
    referrerCapacity: 2,
    refereeCapacity: 500,
  }), 2);
});

test("referral bonus math caps at 500 points per side", () => {
  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: 2_500,
    referrerBonusPoints: 0,
    refereeBonusPoints: 0,
    referrerCapacity: 10_000,
    refereeCapacity: 10_000,
  }), 500);
  assert.equal(getSeasonReferralBonusDelta({
    postActivationBasePoints: 4_000,
    referrerBonusPoints: 499,
    refereeBonusPoints: 499,
    referrerCapacity: 10_000,
    refereeCapacity: 10_000,
  }), 1);
});

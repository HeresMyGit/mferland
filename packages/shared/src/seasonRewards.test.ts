import assert from "node:assert/strict";
import test from "node:test";
import {
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_REFERRAL_ACTIVATION_POINTS,
  SEASON_0_REFERRAL_BONUS_DENOMINATOR,
  SEASON_0_REFERRAL_BONUS_NUMERATOR,
  SEASON_0_REFERRAL_MAX_BONUS_POINTS,
  SEASON_0_REFERRAL_MAX_REFEREES,
  SEASON_0_TOTAL_POINT_CAP,
  getSeason0QuestReward,
  getSeason0ReferralBonusTargetPoints,
  getSeasonRewardSourceId,
} from "./seasonRewards.js";

test("defines season point caps", () => {
  assert.equal(SEASON_0_DAILY_POINT_CAP, 500);
  assert.equal(SEASON_0_TOTAL_POINT_CAP, 10000);
});

test("defines referral limits and cumulative bonus math", () => {
  assert.equal(SEASON_0_REFERRAL_ACTIVATION_POINTS, 0);
  assert.equal(SEASON_0_REFERRAL_BONUS_NUMERATOR, 20);
  assert.equal(SEASON_0_REFERRAL_BONUS_DENOMINATOR, 100);
  assert.equal(SEASON_0_REFERRAL_MAX_BONUS_POINTS, 500);
  assert.equal(SEASON_0_REFERRAL_MAX_REFEREES, 10);
  assert.equal(getSeason0ReferralBonusTargetPoints(3), 0);
  assert.equal(getSeason0ReferralBonusTargetPoints(5), 1);
  assert.equal(getSeason0ReferralBonusTargetPoints(2500), 500);
  assert.equal(getSeason0ReferralBonusTargetPoints(4000), 500);
});

test("keeps repeatable hog loop out of liquid-reward eligibility", () => {
  assert.equal(getSeason0QuestReward("hog-loop"), null);
});

test("uses stable daily source ids for daily reward quests", () => {
  const sourceId = getSeasonRewardSourceId("route-patrol-daily", new Date("2026-05-04T23:59:59Z"));
  assert.equal(sourceId, "route-patrol-daily:2026-05-04");
});

test("uses one-time source ids for one-time reward quests", () => {
  assert.equal(getSeasonRewardSourceId("sealed-note", new Date("2026-05-04T23:59:59Z")), "sealed-note");
});

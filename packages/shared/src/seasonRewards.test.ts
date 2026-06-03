import assert from "node:assert/strict";
import test from "node:test";
import {
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_TOTAL_POINT_CAP,
  getSeason0QuestReward,
  getSeasonRewardSourceId,
} from "./seasonRewards.js";

test("defines conservative season point caps", () => {
  assert.equal(SEASON_0_DAILY_POINT_CAP, 100);
  assert.equal(SEASON_0_TOTAL_POINT_CAP, 3000);
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

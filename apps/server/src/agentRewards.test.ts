import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER,
  adjustSeason0QuestPointsForAgent,
  formatRewardMultiplier,
  normalizeAgentSeason0PointMultiplier,
} from "./agentRewards.js";

test("agent season reward multiplier defaults to a nerf", () => {
  assert.equal(DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER, 0.5);
  assert.equal(normalizeAgentSeason0PointMultiplier(""), 0.5);
  assert.equal(adjustSeason0QuestPointsForAgent(20, true), 10);
});

test("agent season reward multiplier clamps and preserves a positive reward when enabled", () => {
  assert.equal(normalizeAgentSeason0PointMultiplier("-1"), 0);
  assert.equal(normalizeAgentSeason0PointMultiplier("2"), 1);
  assert.equal(adjustSeason0QuestPointsForAgent(0, true, 0.5), 0);
  assert.equal(adjustSeason0QuestPointsForAgent(5, true, 0.5), 2);
  assert.equal(adjustSeason0QuestPointsForAgent(5, true, 0), 0);
  assert.equal(adjustSeason0QuestPointsForAgent(5, false, 0), 5);
});

test("agent season reward note labels adjusted points", () => {
  assert.equal(formatRewardMultiplier(0.5), "0.5");
  assert.equal(formatRewardMultiplier(1), "1");
});

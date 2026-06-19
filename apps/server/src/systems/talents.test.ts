import assert from "node:assert/strict";
import test from "node:test";
import { PlayerState } from "../state.js";
import {
  getPlayerTalentRanks,
  rankPlayerTalent,
  respecPlayerTalents,
  restorePlayerTalentRanks,
} from "./talents.js";

test("respecPlayerTalents refunds spent ranks and clears talents", () => {
  const player = new PlayerState();
  player.level = 6;
  player.talentPoints = 3;

  assert.equal(rankPlayerTalent(player, "brawler:street-tough"), true);
  assert.equal(rankPlayerTalent(player, "brawler:street-tough"), true);
  assert.equal(rankPlayerTalent(player, "brawler:heavy-hands"), true);
  assert.equal(player.talentPoints, 0);

  const spentRanks = getPlayerTalentRanks(player);
  const refunded = respecPlayerTalents(player);

  assert.equal(refunded, 3);
  assert.equal(player.talentPoints, 3);
  assert.deepEqual(getPlayerTalentRanks(player), []);

  restorePlayerTalentRanks(player, spentRanks, 0);

  assert.equal(player.talentPoints, 0);
  assert.deepEqual(getPlayerTalentRanks(player), spentRanks);
});

test("respecPlayerTalents leaves unspent-only characters alone", () => {
  const player = new PlayerState();
  player.talentPoints = 2;

  assert.equal(respecPlayerTalents(player), 0);
  assert.equal(player.talentPoints, 2);
  assert.deepEqual(getPlayerTalentRanks(player), []);
});

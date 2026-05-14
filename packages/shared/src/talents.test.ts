import assert from "node:assert/strict";
import test from "node:test";
import { getUnlockedCombatActions } from "./combat.js";
import {
  getTalentRank,
  getTalentUnlockedCombatActions,
  isCombatActionUnlocked,
  type TalentRankLike,
} from "./talents.js";

test("learned caster bolt unlocks by level while ultimates require talents", () => {
  assert.equal(isCombatActionUnlocked("iceBlast", 5), true);
  assert.equal(isCombatActionUnlocked("frostNova", 99), false);
  assert.equal(isCombatActionUnlocked("whirlwind", 99), false);
  assert.equal(isCombatActionUnlocked("multishot", 99), false);
  assert.deepEqual(getUnlockedCombatActions(5), ["attack", "shoot", "signalShot", "fireblast", "iceBlast"]);
});

test("capstone talents unlock ultimate moves", () => {
  const talents: TalentRankLike[] = [
    { id: "brawler:whirlwind", rank: 1 },
    { id: "caster:frost-nova", rank: 1 },
    { id: "utility:multishot", rank: 1 },
  ];

  assert.deepEqual(getTalentUnlockedCombatActions(talents), ["whirlwind", "frostNova", "multishot"]);
  assert.equal(isCombatActionUnlocked("frostNova", 6, talents), true);
  assert.equal(isCombatActionUnlocked("whirlwind", 6, talents), true);
  assert.equal(isCombatActionUnlocked("multishot", 6, talents), true);
});

test("legacy caster ice-blast talent rows map to the frost nova capstone", () => {
  const talents: TalentRankLike[] = [
    { tree: "caster", nodeId: "ice-blast", rank: 1 },
  ];

  assert.equal(getTalentRank(talents, "caster:frost-nova"), 1);
  assert.equal(isCombatActionUnlocked("frostNova", 6, talents), true);
});

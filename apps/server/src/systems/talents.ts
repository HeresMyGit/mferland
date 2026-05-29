import {
  COMBAT,
  TALENTS,
  getTalentActionBaseDamage,
  getTalentActionCooldownMs,
  getTalentEffectTotals,
  getTalentId,
  getTalentQuestXpReward,
  getTalentRankStatus,
  isCombatActionUnlocked,
  isTalentId,
  isTalentUnlocked,
  type CombatActionId,
  type TalentId,
  type TalentRankSnapshot,
} from "@mferland/shared";
import { TalentState, type PlayerState } from "../state.js";
import { getPlayerActionCooldownMultiplier } from "./buffs.js";

export function normalizeTalentId(input: unknown): TalentId | null {
  return isTalentId(input) ? input : null;
}

export function rankPlayerTalent(player: PlayerState, talentId: TalentId) {
  normalizePlayerTalents(player);

  const status = getTalentRankStatus(getPlayerTalentRanks(player), player.level, player.talentPoints, talentId);
  if (!status.canRank) return false;

  const definition = TALENTS[talentId];
  const talent = player.talents.get(talentId) ?? new TalentState();
  talent.id = talentId;
  talent.tree = definition.tree;
  talent.nodeId = definition.nodeId;
  talent.rank = status.nextRank;
  player.talents.set(talentId, talent);
  player.talentPoints = Math.max(0, player.talentPoints - 1);
  return true;
}

export function normalizePlayerTalents(player: PlayerState) {
  let refundedRanks = 0;

  for (const [key, talent] of getTalentEntries(player)) {
    const talentId = normalizeTalentStateId(key, talent);
    const originalRank = Math.max(0, Math.floor(talent.rank));
    if (!talentId || originalRank <= 0) {
      player.talents.delete(key);
      refundedRanks += originalRank;
      continue;
    }

    const definition = TALENTS[talentId];
    const rank = Math.min(originalRank, definition.maxRank);
    if (rank < originalRank) refundedRanks += originalRank - rank;

    if (key !== talentId) {
      player.talents.delete(key);
      player.talents.set(talentId, talent);
    }
    talent.id = talentId;
    talent.tree = definition.tree;
    talent.nodeId = definition.nodeId;
    talent.rank = rank;
  }

  let changed = true;
  while (changed) {
    changed = false;
    const ranks = getPlayerTalentRanks(player);
    for (const [key, talent] of getTalentEntries(player)) {
      const talentId = normalizeTalentStateId(key, talent);
      if (!talentId) continue;
      if (isTalentUnlocked(ranks, player.level, talentId)) continue;

      refundedRanks += Math.max(0, Math.floor(talent.rank));
      player.talents.delete(key);
      changed = true;
    }
  }

  player.talentPoints = Math.max(0, Math.floor(player.talentPoints + refundedRanks));
}

export function getPlayerTalentRanks(player: PlayerState): TalentRankSnapshot[] {
  const talents: TalentRankSnapshot[] = [];
  player.talents.forEach((talent, key) => {
    const talentId = normalizeTalentStateId(key, talent);
    if (!talentId) return;

    const definition = TALENTS[talentId];
    const rank = Math.min(Math.max(Math.floor(talent.rank), 0), definition.maxRank);
    if (rank <= 0) return;

    talents.push({
      id: talentId,
      tree: definition.tree,
      nodeId: definition.nodeId,
      rank,
    });
  });
  return talents.sort((left, right) => left.id.localeCompare(right.id));
}

export function getPlayerTalentEffects(player: PlayerState) {
  return getTalentEffectTotals(getPlayerTalentRanks(player));
}

export function getPlayerActionConfig(player: PlayerState, actionId: CombatActionId) {
  const talentCooldownMs = getTalentActionCooldownMs(actionId, getPlayerTalentRanks(player));
  const cooldownMultiplier = getPlayerActionCooldownMultiplier(player);
  return {
    ...COMBAT.actions[actionId],
    damage: getTalentActionBaseDamage(actionId, getPlayerTalentRanks(player)),
    cooldownMs: talentCooldownMs > 0 ? Math.max(350, Math.round(talentCooldownMs * cooldownMultiplier)) : 0,
  };
}

export function isPlayerActionUnlocked(player: PlayerState, actionId: CombatActionId, debugUnlockAllMoves = false) {
  return isCombatActionUnlocked(actionId, player.level, getPlayerTalentRanks(player), debugUnlockAllMoves);
}

export function getPlayerQuestXpReward(player: PlayerState, baseXp: number) {
  return getTalentQuestXpReward(baseXp, getPlayerTalentRanks(player));
}

function normalizeTalentStateId(key: string, talent: TalentState) {
  if (isTalentId(talent.id)) return talent.id;
  const talentId = getTalentId(talent.tree, talent.nodeId);
  if (talentId) return talentId;
  return isTalentId(key) ? key : null;
}

function getTalentEntries(player: PlayerState) {
  const entries: Array<[string, TalentState]> = [];
  player.talents.forEach((talent, key) => {
    entries.push([key, talent]);
  });
  return entries;
}

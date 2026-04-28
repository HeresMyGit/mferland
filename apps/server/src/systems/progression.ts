import {
  PROGRESSION,
  getLevelForXp,
  getMaxLevelXp,
  type NpcModel,
  type NpcRole,
} from "@mferland/shared";
import type { NpcState, PlayerState } from "../state.js";

export type ExperienceAward = {
  xpGained: number;
  oldLevel: number;
  newLevel: number;
  levelsGained: number;
  talentPointsGained: number;
};

export function normalizePlayerProgression(player: PlayerState) {
  player.xp = clampTotalXp(player.xp);
  player.level = clampLevel(player.level);
  player.talentPoints = Math.max(0, Math.floor(player.talentPoints));

  const xpLevel = getLevelForXp(player.xp);
  if (xpLevel > player.level) {
    player.talentPoints += xpLevel - player.level;
    player.level = xpLevel;
  }
}

export function awardExperience(player: PlayerState, amount: number): ExperienceAward {
  normalizePlayerProgression(player);

  const oldLevel = player.level;
  const oldXp = player.xp;
  const xpGained = Math.max(0, Math.floor(amount));
  const nextXp = clampTotalXp(oldXp + xpGained);
  const newLevel = Math.max(oldLevel, getLevelForXp(nextXp));
  const levelsGained = Math.max(0, newLevel - oldLevel);

  player.xp = nextXp;
  player.level = newLevel;
  if (levelsGained > 0) {
    player.talentPoints += levelsGained;
  }

  return {
    xpGained: nextXp - oldXp,
    oldLevel,
    newLevel,
    levelsGained,
    talentPointsGained: levelsGained,
  };
}

export function getNpcDefeatXp(npc: Pick<NpcState, "role" | "model">) {
  if (npc.role === "farmer") return PROGRESSION.mobXpRewards.farmer;
  if (npc.role === "enemy") return PROGRESSION.mobXpRewards.enemy;
  if (npc.role === "critter") return getModelXpReward(npc.model, PROGRESSION.mobXpRewards.critter);
  if (npc.role === "beast") return getModelXpReward(npc.model, PROGRESSION.mobXpRewards.beast);
  return 0;
}

function getModelXpReward(model: NpcModel, fallback: number) {
  if (model === "hog") return PROGRESSION.mobXpRewards.hog;
  if (model === "rabbit") return PROGRESSION.mobXpRewards.rabbit;
  if (model === "deer") return PROGRESSION.mobXpRewards.deer;
  return fallback;
}

function clampLevel(level: number) {
  return Math.min(Math.max(Math.floor(level), 1), PROGRESSION.levelCap);
}

function clampTotalXp(xp: number) {
  return Math.min(Math.max(Math.floor(xp), 0), getMaxLevelXp());
}

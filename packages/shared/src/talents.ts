import { COMBAT, isCombatActionUnlockedByLevel } from "./combat.js";
import type { StatKey } from "./items.js";

type CombatActionId = keyof typeof COMBAT.actions;

export const TALENT_TREES = {
  brawler: {
    label: "brawler",
    description: "harder bonks, more HP, faster close pressure.",
  },
  caster: {
    label: "caster",
    description: "more MP, stronger posts, faster mana recovery.",
  },
  utility: {
    label: "utility",
    description: "movement, errands, and steady recovery.",
  },
} as const;

export type TalentTreeId = keyof typeof TALENT_TREES;

export type TalentRequirement = {
  talentId: string;
  rank: number;
};

export type TalentEffect = {
  stats?: Partial<Record<StatKey, number>>;
  actionDamage?: Partial<Record<CombatActionId, number>>;
  actionCooldownMs?: Partial<Record<CombatActionId, number>>;
  healthRegenPer5?: number;
  manaRegenPer5?: number;
  walkSpeed?: number;
  runSpeed?: number;
  questXpPercent?: number;
};

export type TalentDefinition = {
  tree: TalentTreeId;
  nodeId: string;
  name: string;
  description: string;
  maxRank: number;
  minLevel?: number;
  requires?: readonly TalentRequirement[];
  effectText: string;
  effectPerRank: TalentEffect;
  unlockAction?: CombatActionId;
};

export const TALENTS = {
  "brawler:street-tough": {
    tree: "brawler",
    nodeId: "street-tough",
    name: "built different",
    description: "a little extra padding for farm trouble.",
    maxRank: 3,
    effectText: "+10 HP per rank",
    effectPerRank: {
      stats: {
        maxHealth: 10,
      },
    },
  },
  "brawler:heavy-hands": {
    tree: "brawler",
    nodeId: "heavy-hands",
    name: "heavy hands",
    description: "your basic bonk lands with more weight.",
    maxRank: 3,
    requires: [{ talentId: "brawler:street-tough", rank: 1 }],
    effectText: "+2 bonk damage per rank",
    effectPerRank: {
      actionDamage: {
        attack: 2,
      },
    },
  },
  "brawler:snap-swing": {
    tree: "brawler",
    nodeId: "snap-swing",
    name: "quick bonk",
    description: "less windup between close-range hits.",
    maxRank: 2,
    minLevel: 4,
    requires: [{ talentId: "brawler:heavy-hands", rank: 2 }],
    effectText: "-120 ms bonk cooldown per rank",
    effectPerRank: {
      actionCooldownMs: {
        attack: -120,
      },
    },
  },
  "brawler:whirlwind": {
    tree: "brawler",
    nodeId: "whirlwind",
    name: "spin out control",
    description: "spin through nearby enemies with more snap.",
    maxRank: 1,
    minLevel: 6,
    requires: [{ talentId: "brawler:snap-swing", rank: 1 }],
    effectText: "+3 spin out damage",
    effectPerRank: {
      actionDamage: {
        whirlwind: 3,
      },
    },
  },
  "caster:deep-pockets": {
    tree: "caster",
    nodeId: "deep-pockets",
    name: "deep reserves",
    description: "more room for casts before you run dry.",
    maxRank: 3,
    effectText: "+8 MP per rank",
    effectPerRank: {
      stats: {
        maxMana: 8,
      },
    },
  },
  "caster:sticker-sparks": {
    tree: "caster",
    nodeId: "sticker-sparks",
    name: "sticker sparks",
    description: "burn post and cold take hit harder.",
    maxRank: 3,
    requires: [{ talentId: "caster:deep-pockets", rank: 1 }],
    effectText: "+3 burn post and +1 cold take damage per rank",
    effectPerRank: {
      actionDamage: {
        fireblast: 3,
        frostNova: 1,
      },
    },
  },
  "caster:flow-state": {
    tree: "caster",
    nodeId: "flow-state",
    name: "flow state",
    description: "mana returns faster once casting quiets down.",
    maxRank: 2,
    minLevel: 4,
    requires: [{ talentId: "caster:sticker-sparks", rank: 2 }],
    effectText: "+4 MP regen per 5 sec per rank",
    effectPerRank: {
      manaRegenPer5: 4,
    },
  },
  "caster:ice-blast": {
    tree: "caster",
    nodeId: "ice-blast",
    name: "freeze post bite",
    description: "put more bite behind your cold bolt.",
    maxRank: 1,
    minLevel: 6,
    requires: [{ talentId: "caster:flow-state", rank: 1 }],
    effectText: "+3 freeze post damage",
    effectPerRank: {
      actionDamage: {
        iceBlast: 3,
      },
    },
  },
  "utility:light-step": {
    tree: "utility",
    nodeId: "light-step",
    name: "light step",
    description: "move faster while crossing the plaza and farm road.",
    maxRank: 3,
    effectText: "+0.2 walk and +0.3 run speed per rank",
    effectPerRank: {
      walkSpeed: 0.2,
      runSpeed: 0.3,
    },
  },
  "utility:errand-brain": {
    tree: "utility",
    nodeId: "errand-brain",
    name: "errand brain",
    description: "errand turn-ins teach a little more.",
    maxRank: 3,
    requires: [{ talentId: "utility:light-step", rank: 1 }],
    effectText: "+5% quest XP per rank",
    effectPerRank: {
      questXpPercent: 5,
    },
  },
  "utility:recovery-loop": {
    tree: "utility",
    nodeId: "recovery-loop",
    name: "recovery loop",
    description: "HP and MP tick back more steadily outside pressure.",
    maxRank: 2,
    minLevel: 4,
    requires: [{ talentId: "utility:errand-brain", rank: 2 }],
    effectText: "+3 HP and +2 MP regen per 5 sec per rank",
    effectPerRank: {
      healthRegenPer5: 3,
      manaRegenPer5: 2,
    },
  },
  "utility:multishot": {
    tree: "utility",
    nodeId: "multishot",
    name: "thread spray rhythm",
    description: "recover faster after spraying nearby enemies.",
    maxRank: 1,
    minLevel: 6,
    requires: [{ talentId: "utility:recovery-loop", rank: 1 }],
    effectText: "-1500 ms thread spray cooldown",
    effectPerRank: {
      actionCooldownMs: {
        multishot: -1500,
      },
    },
  },
} as const satisfies Record<string, TalentDefinition>;

export type TalentId = keyof typeof TALENTS;

export type TalentRankLike = {
  id?: string;
  tree?: string;
  nodeId?: string;
  rank: number;
};

export type TalentEffectTotals = Required<Omit<TalentEffect, "stats" | "actionDamage" | "actionCooldownMs">> & {
  stats: Partial<Record<StatKey, number>>;
  actionDamage: Partial<Record<CombatActionId, number>>;
  actionCooldownMs: Partial<Record<CombatActionId, number>>;
};

export const TALENT_TREE_IDS = Object.keys(TALENT_TREES) as TalentTreeId[];
export const TALENT_IDS = Object.keys(TALENTS) as TalentId[];

export function isTalentId(value: unknown): value is TalentId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TALENTS, value);
}

export function getTalentId(tree: string, nodeId: string): TalentId | null {
  const talentId = `${tree}:${nodeId}`;
  return isTalentId(talentId) ? talentId : null;
}

export function getTalentRank(talents: Iterable<TalentRankLike> | undefined, talentId: TalentId) {
  if (!talents) return 0;

  for (const talent of talents) {
    const currentId = normalizeTalentRankId(talent);
    if (currentId !== talentId) continue;
    return clampTalentRank(talentId, talent.rank);
  }
  return 0;
}

export function getTalentPointsSpent(talents: Iterable<TalentRankLike> | undefined) {
  let spent = 0;
  for (const talentId of TALENT_IDS) {
    spent += getTalentRank(talents, talentId);
  }
  return spent;
}

export function getTalentEffectTotals(talents: Iterable<TalentRankLike> | undefined): TalentEffectTotals {
  const totals: TalentEffectTotals = {
    stats: {},
    actionDamage: {},
    actionCooldownMs: {},
    healthRegenPer5: 0,
    manaRegenPer5: 0,
    walkSpeed: 0,
    runSpeed: 0,
    questXpPercent: 0,
  };

  for (const talentId of TALENT_IDS) {
    const rank = getTalentRank(talents, talentId);
    if (rank <= 0) continue;

    const effect = (TALENTS[talentId] as TalentDefinition).effectPerRank;
    addNumberRecord(totals.stats, effect.stats, rank);
    addNumberRecord(totals.actionDamage, effect.actionDamage, rank);
    addNumberRecord(totals.actionCooldownMs, effect.actionCooldownMs, rank);
    totals.healthRegenPer5 += (effect.healthRegenPer5 ?? 0) * rank;
    totals.manaRegenPer5 += (effect.manaRegenPer5 ?? 0) * rank;
    totals.walkSpeed += (effect.walkSpeed ?? 0) * rank;
    totals.runSpeed += (effect.runSpeed ?? 0) * rank;
    totals.questXpPercent += (effect.questXpPercent ?? 0) * rank;
  }

  return totals;
}

export function getTalentActionBaseDamage(actionId: CombatActionId, talents: Iterable<TalentRankLike> | undefined) {
  const effects = getTalentEffectTotals(talents);
  return COMBAT.actions[actionId].damage + (effects.actionDamage[actionId] ?? 0);
}

export function getTalentActionCooldownMs(actionId: CombatActionId, talents: Iterable<TalentRankLike> | undefined) {
  const baseCooldownMs = COMBAT.actions[actionId].cooldownMs;
  const cooldownMs = baseCooldownMs + (getTalentEffectTotals(talents).actionCooldownMs[actionId] ?? 0);
  return baseCooldownMs > 0 ? Math.max(350, cooldownMs) : Math.max(0, cooldownMs);
}

export function getTalentQuestXpReward(baseXp: number, talents: Iterable<TalentRankLike> | undefined) {
  const bonusPercent = getTalentEffectTotals(talents).questXpPercent;
  return Math.max(0, Math.round(baseXp * (1 + bonusPercent / 100)));
}

export function getCombatActionUnlockTalent(actionId: CombatActionId): TalentId | null {
  for (const talentId of TALENT_IDS) {
    if ((TALENTS[talentId] as TalentDefinition).unlockAction === actionId) return talentId;
  }
  return null;
}

export function isCombatActionUnlocked(actionId: CombatActionId, playerLevel: number, debugUnlockAllMoves = false) {
  return isCombatActionUnlockedByLevel(actionId, playerLevel, debugUnlockAllMoves);
}

export function isTalentUnlocked(talents: Iterable<TalentRankLike> | undefined, playerLevel: number, talentId: TalentId) {
  const definition = TALENTS[talentId] as TalentDefinition;
  if (playerLevel < (definition.minLevel ?? 1)) return false;

  for (const requirement of definition.requires ?? []) {
    if (!isTalentId(requirement.talentId)) return false;
    if (getTalentRank(talents, requirement.talentId) < requirement.rank) return false;
  }
  return true;
}

export function getTalentRankStatus(
  talents: Iterable<TalentRankLike> | undefined,
  playerLevel: number,
  availablePoints: number,
  talentId: TalentId,
) {
  const definition = TALENTS[talentId] as TalentDefinition;
  const currentRank = getTalentRank(talents, talentId);
  const maxRank = definition.maxRank;

  if (currentRank >= maxRank) {
    return { canRank: false, reason: "Maxed", currentRank, nextRank: currentRank, maxRank };
  }

  const requiredLevel = definition.minLevel ?? 1;
  if (playerLevel < requiredLevel) {
    return { canRank: false, reason: `Level ${requiredLevel}`, currentRank, nextRank: currentRank + 1, maxRank };
  }

  for (const requirement of definition.requires ?? []) {
    if (!isTalentId(requirement.talentId)) {
      return { canRank: false, reason: "Locked", currentRank, nextRank: currentRank + 1, maxRank };
    }
    if (getTalentRank(talents, requirement.talentId) < requirement.rank) {
      return {
        canRank: false,
        reason: `${TALENTS[requirement.talentId].name} ${requirement.rank}`,
        currentRank,
        nextRank: currentRank + 1,
        maxRank,
      };
    }
  }

  if (availablePoints <= 0) {
    return { canRank: false, reason: "No Points", currentRank, nextRank: currentRank + 1, maxRank };
  }

  return { canRank: true, reason: "", currentRank, nextRank: currentRank + 1, maxRank };
}

function normalizeTalentRankId(talent: TalentRankLike) {
  if (isTalentId(talent.id)) return talent.id;
  return getTalentId(talent.tree ?? "", talent.nodeId ?? "");
}

function clampTalentRank(talentId: TalentId, rank: number) {
  return Math.min(Math.max(Math.floor(rank), 0), (TALENTS[talentId] as TalentDefinition).maxRank);
}

function addNumberRecord<Key extends string>(
  target: Partial<Record<Key, number>>,
  source: Partial<Record<Key, number>> | undefined,
  multiplier: number,
) {
  if (!source) return;
  for (const key of Object.keys(source) as Key[]) {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
  }
}

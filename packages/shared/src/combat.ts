export const COMBAT = {
  manaRegenDelayMs: 5000,
  healthRegenDelayMs: 10000,
  defeatedDespawnMs: 6500,
  defeatedRespawnMs: 12000,
  castPushbackMs: 500,
  universalCooldownMs: 1000,
  fireblastProjectileSpeed: 24,
  fireblastMinTravelMs: 320,
  fireblastMaxTravelMs: 1100,
  stationaryInputThreshold: 0.05,
  actions: {
    attack: {
      label: "bonk",
      description: "A close hit that builds extra threat.",
      damage: 4,
      cooldownMs: 1500,
      minRange: 0,
      maxRange: 5,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: false,
      threatBonus: 24,
    },
    shoot: {
      label: "snipe",
      description: "A longer-range shot for enemies that are not in your face.",
      damage: 10,
      cooldownMs: 2000,
      minRange: 4.0,
      maxRange: 40,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: true,
    },
    signalShot: {
      label: "ping",
      description: "A quick signal shot you can fire while moving.",
      damage: 12,
      cooldownMs: 6000,
      minRange: 4.0,
      maxRange: 34,
      manaCost: 10,
      castTimeMs: 0,
      requiresStationary: false,
    },
    fireblast: {
      label: "rugburn",
      description: "A heavy casted hit that asks you to stand still.",
      damage: 20,
      cooldownMs: 0,
      minRange: 0,
      maxRange: 30,
      manaCost: 14,
      castTimeMs: 3500,
      requiresStationary: true,
    },
    frostNova: {
      label: "freeze assets",
      description: "A close burst that freezes nearby enemies.",
      damage: 5,
      cooldownMs: 12000,
      minRange: 0,
      maxRange: 6.5,
      manaCost: 12,
      castTimeMs: 0,
      requiresStationary: false,
      freezeMs: 3000,
    },
    heal: {
      label: "top off",
      description: "A casted heal for yourself or a friendly target.",
      damage: 0,
      healing: 34,
      cooldownMs: 0,
      minRange: 0,
      maxRange: 24,
      manaCost: 16,
      castTimeMs: 2000,
      requiresStationary: true,
      threatMultiplier: 0.55,
      threatRadius: 20,
    },
    taunt: {
      label: "talk shit",
      description: "Forces your target to attack you and adds snap threat.",
      damage: 0,
      cooldownMs: 10000,
      minRange: 0,
      maxRange: 12,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: false,
      forceMs: 3000,
      threat: 140,
    },
    whirlwind: {
      label: "tornado crash",
      description: "Hit nearby enemies and keep their attention.",
      damage: 9,
      cooldownMs: 9000,
      minRange: 0,
      maxRange: 4.5,
      manaCost: 10,
      castTimeMs: 0,
      requiresStationary: false,
      threatBonus: 22,
    },
    multishot: {
      label: "thread spray",
      description: "A shot that splits across enemies near your target.",
      damage: 9,
      cooldownMs: 10000,
      minRange: 4,
      maxRange: 36,
      manaCost: 12,
      castTimeMs: 0,
      requiresStationary: true,
      maxTargets: 3,
      splashRadius: 8,
    },
    iceBlast: {
      label: "slippage bolt",
      description: "A casted ice bolt that slows the target.",
      damage: 14,
      cooldownMs: 0,
      minRange: 0,
      maxRange: 28,
      manaCost: 12,
      castTimeMs: 3500,
      requiresStationary: true,
      slowMs: 4500,
      slowMultiplier: 0.62,
    },
  },
} as const;

export const COMBAT_ACTION_UNLOCKS = [
  { actionId: "attack", level: 1 },
  { actionId: "shoot", level: 2 },
  { actionId: "signalShot", level: 3 },
  { actionId: "fireblast", level: 4 },
  { actionId: "iceBlast", level: 5 },
  { actionId: "heal", level: 6 },
  { actionId: "taunt", level: 7 },
] as const satisfies readonly { actionId: keyof typeof COMBAT.actions; level: number }[];

export function getCombatActionUnlockLevel(actionId: keyof typeof COMBAT.actions) {
  return COMBAT_ACTION_UNLOCKS.find((unlock) => unlock.actionId === actionId)?.level ?? Number.POSITIVE_INFINITY;
}

export function getUnlockedCombatActions(
  playerLevel: number,
  debugUnlockAllMoves = false,
  extraUnlockedActions: readonly (keyof typeof COMBAT.actions)[] = [],
) {
  if (debugUnlockAllMoves) return Object.keys(COMBAT.actions) as (keyof typeof COMBAT.actions)[];

  const level = Math.max(1, Math.floor(playerLevel));
  const unlocked: (keyof typeof COMBAT.actions)[] = COMBAT_ACTION_UNLOCKS
    .filter((unlock) => level >= unlock.level)
    .map((unlock) => unlock.actionId);
  const seen = new Set<keyof typeof COMBAT.actions>(unlocked);
  for (const actionId of extraUnlockedActions) {
    if (seen.has(actionId)) continue;
    unlocked.push(actionId);
    seen.add(actionId);
  }
  return unlocked;
}

export function isCombatActionUnlockedByLevel(
  actionId: keyof typeof COMBAT.actions,
  playerLevel: number,
  debugUnlockAllMoves = false,
) {
  return debugUnlockAllMoves || Math.max(1, Math.floor(playerLevel)) >= getCombatActionUnlockLevel(actionId);
}

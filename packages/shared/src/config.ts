export const ROOM_NAME = "town";
export const MAX_PLAYERS = 40;
export const SERVER_TICK_RATE = 20;
export const INPUT_SEND_RATE = 20;

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 6.4,
  jumpVelocity: 6.4,
  gravity: 17,
  radius: 0.55,
  maxHealth: 100,
  maxMana: 50,
  strength: 5,
  dexterity: 5,
  magic: 5,
  healthRegenPer5: 8,
  manaRegenPer5: 12,
};

export const PROGRESSION = {
  levelCap: 10,
  nearbyCreditRadius: 16,
  levelXpThresholds: [
    0,
    150,
    530,
    950,
    1450,
    2050,
    2750,
    3550,
    4450,
    5450,
  ],
  mobXpRewards: {
    enemy: 18,
    critter: 8,
    beast: 22,
    farmer: 34,
    hog: 24,
    rabbit: 6,
    deer: 10,
  },
} as const;

export function getXpForLevel(level: number) {
  const clampedLevel = Math.min(Math.max(Math.floor(level), 1), PROGRESSION.levelCap);
  return PROGRESSION.levelXpThresholds[clampedLevel - 1] ?? 0;
}

export function getMaxLevelXp() {
  return getXpForLevel(PROGRESSION.levelCap);
}

export function getLevelForXp(xp: number) {
  const totalXp = Math.min(Math.max(Math.floor(xp), 0), getMaxLevelXp());
  let level = 1;
  for (let index = 0; index < PROGRESSION.levelXpThresholds.length; index += 1) {
    const threshold = PROGRESSION.levelXpThresholds[index] ?? 0;
    if (totalXp >= threshold) level = index + 1;
  }
  return Math.min(level, PROGRESSION.levelCap);
}

export function getNextLevelXp(level: number) {
  const clampedLevel = Math.min(Math.max(Math.floor(level), 1), PROGRESSION.levelCap);
  if (clampedLevel >= PROGRESSION.levelCap) return getMaxLevelXp();
  return getXpForLevel(clampedLevel + 1);
}

export function getLevelProgress(xp: number) {
  const totalXp = Math.min(Math.max(Math.floor(xp), 0), getMaxLevelXp());
  const level = getLevelForXp(totalXp);
  const levelStartXp = getXpForLevel(level);
  const nextLevelXp = getNextLevelXp(level);
  const required = Math.max(nextLevelXp - levelStartXp, 0);
  const current = level >= PROGRESSION.levelCap
    ? required
    : Math.min(Math.max(totalXp - levelStartXp, 0), required);

  return {
    level,
    totalXp,
    current,
    required,
    nextLevelXp,
    isMaxLevel: level >= PROGRESSION.levelCap,
  };
}

export const RESPAWN_POINT = {
  x: -2.4,
  z: 4.2,
  yaw: Math.PI * 0.88,
};

export const CHAT = {
  maxLength: 180,
  minIntervalMs: 1200,
};

export const EMOTES = {
  wave: {
    label: "wave",
    chatText: "waves like a mfer",
    durationMs: 0,
  },
  dance: {
    label: "dance",
    chatText: "dances like a mfer",
    durationMs: 4200,
  },
  laugh: {
    label: "laugh",
    chatText: "laughs like a mfer",
    durationMs: 2600,
  },
  cheer: {
    label: "cheer",
    chatText: "cheers like a mfer",
    durationMs: 3000,
  },
  flex: {
    label: "flex",
    chatText: "flexes like a mfer",
    durationMs: 2800,
  },
  shrug: {
    label: "shrug",
    chatText: "shrugs like a mfer",
    durationMs: 2400,
  },
} as const;

export const MFERGPT = {
  npcId: "mfergpt",
  mention: "@mfergpt",
  commandCooldownMs: 7000,
  responseMaxLength: 260,
  llmTimeoutMs: 10000,
  arenaCenter: { x: -10.8, z: -12.4 },
  arenaRadius: 5.2,
  temporaryEnemyPrefix: "mfergpt-arena-",
  temporaryEventPrefix: "mfergpt-event-",
  temporaryEnemyCount: 2,
  maxTemporaryEnemies: 4,
  temporaryEnemyLifetimeMs: 90_000,
  townEventLifetimeMs: 60_000,
} as const;

export const SOCIAL = {
  mferlandUrl: "https://game.mfergpt.lol",
  tweetText: "gm, i'm in mferland",
} as const;

export const FARMER_COMBAT = {
  aggroRange: 12,
  leashRange: 34,
  moveSpeed: 3.6,
  meleeRange: 3.8,
  meleeDamage: 8,
  meleeCooldownMs: 1700,
  spellRange: 22,
  spellDamage: 14,
  spellCooldownMs: 3200,
  respawnMs: 16000,
};

export const AGENT = {
  observationRadius: 14,
  decisionIntervalMs: 650,
};

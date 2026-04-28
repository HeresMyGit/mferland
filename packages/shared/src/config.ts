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
  healthRegenPer5: 8,
  manaRegenPer5: 12,
};

export const RESPAWN_POINT = {
  x: -2.4,
  z: 4.2,
  yaw: Math.PI * 0.88,
};

export const CHAT = {
  maxLength: 180,
  minIntervalMs: 1200,
};

export const FARMER_COMBAT = {
  aggroRange: 11,
  leashRange: 28,
  moveSpeed: 3.6,
  meleeRange: 3.8,
  meleeDamage: 8,
  meleeCooldownMs: 1700,
  spellRange: 22,
  spellDamage: 14,
  spellCooldownMs: 3200,
  respawnMs: 18000,
};

export const AGENT = {
  observationRadius: 14,
  decisionIntervalMs: 650,
};

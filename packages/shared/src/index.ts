export const ROOM_NAME = "town";
export const MAX_PLAYERS = 40;
export const SERVER_TICK_RATE = 20;
export const INPUT_SEND_RATE = 20;

export const PLAZA_BOUNDS = {
  minX: -72,
  maxX: 72,
  minZ: -58,
  maxZ: 74,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 6.4,
  jumpVelocity: 6.4,
  gravity: 17,
  radius: 0.55,
  maxHealth: 100,
  maxMana: 50,
};

export const RESPAWN_POINT = {
  x: -2.4,
  z: 4.2,
  yaw: Math.PI * 0.88,
};

export const COMBAT = {
  manaRegenPer5: 12,
  defeatedDespawnMs: 6500,
  defeatedRespawnMs: 12000,
  castPushbackMs: 500,
  fireblastProjectileSpeed: 24,
  fireblastMinTravelMs: 320,
  fireblastMaxTravelMs: 1100,
  stationaryInputThreshold: 0.05,
  actions: {
    attack: {
      label: "Attack",
      damage: 6,
      cooldownMs: 1500,
      minRange: 0,
      maxRange: 5,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: false,
    },
    shoot: {
      label: "Shoot",
      damage: 12,
      cooldownMs: 3000,
      minRange: 4.0,
      maxRange: 40,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: true,
    },
    fireblast: {
      label: "Fireblast",
      damage: 32,
      cooldownMs: 8000,
      minRange: 0,
      maxRange: 30,
      manaCost: 15,
      castTimeMs: 2000,
      requiresStationary: true,
    },
  },
} as const;

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

export type IdentityType = "guest" | "wallet" | "agent";
export type SpeakerType = IdentityType | "npc";
export type AnimationState = "idle" | "walk" | "run" | "jump";
export type NpcRole = "wanderer" | "quest_giver" | "merchant" | "guard" | "enemy" | "critter" | "beast" | "farmer";
export type NpcModel = "mfer" | "rabbit" | "deer" | "hog";
export type TargetKind = "player" | "npc";
export type CombatActionId = keyof typeof COMBAT.actions;
export type ActionId = "interact" | CombatActionId;

export type JoinOptions = {
  name?: string;
  identityType?: IdentityType;
  walletAddress?: string;
  avatarSeed?: number;
};

export type ClientInput = {
  seq: number;
  x: number;
  z: number;
  yaw: number;
  sprint?: boolean;
  jump?: boolean;
};

export type PlayerSnapshot = {
  sessionId: string;
  name: string;
  identityType: IdentityType;
  walletAddress: string;
  avatarSeed: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  lastSeq: number;
  attackReadyAt: number;
  shootReadyAt: number;
  fireblastReadyAt: number;
  castingAction: CombatActionId | "";
  castStartedAt: number;
  castEndsAt: number;
};

export type NpcSnapshot = {
  id: string;
  name: string;
  role: NpcRole;
  model: NpcModel;
  avatarSeed: number;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  dialogue: string;
  questId: string;
  defeatedAt: number;
  despawnAt: number;
};

export type TargetSelection = {
  kind: TargetKind;
  id: string;
};

export type ChatMessage = {
  sessionId: string;
  name: string;
  identityType: SpeakerType;
  text: string;
  sentAt: number;
};

export type CombatEvent = {
  id: string;
  sourceId: string;
  actionId: CombatActionId;
  target: TargetSelection;
  targetName: string;
  amount: number;
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  sentAt: number;
  impactAt: number;
  defeated: boolean;
};

export type AgentVisiblePlayer = Pick<
  PlayerSnapshot,
  "sessionId" | "name" | "identityType" | "avatarSeed" | "health" | "maxHealth" | "mana" | "maxMana" | "x" | "y" | "z" | "yaw" | "animation"
> & {
  distance: number;
};

export type AgentVisibleNpc = Pick<
  NpcSnapshot,
  "id" | "name" | "role" | "model" | "avatarSeed" | "health" | "maxHealth" | "isImmortal" | "x" | "y" | "z" | "yaw" | "animation" | "dialogue" | "questId" | "defeatedAt" | "despawnAt"
> & {
  distance: number;
};

export type ClientInteract = {
  npcId?: string;
};

export type ClientCombatAction = {
  actionId: CombatActionId;
  target?: TargetSelection | null;
};

export type ClientRespawn = Record<string, never>;

export type AgentObservation = {
  self: PlayerSnapshot;
  nearbyPlayers: AgentVisiblePlayer[];
  nearbyNpcs: AgentVisibleNpc[];
  recentChat: ChatMessage[];
  bounds: typeof PLAZA_BOUNDS;
  availableActions: Array<"move" | "look" | "jump" | "sprint" | "chat" | "interact" | CombatActionId>;
};

export function sanitizePlayerName(input: unknown, fallback = "mfer"): string {
  const text = typeof input === "string" ? input : "";
  const cleaned = text
    .replace(/[^\w .$-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

  return cleaned || fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeGuestName(seed: string): string {
  return `mfer#${String(stableHash(seed) % 10000).padStart(4, "0")}`;
}

export function isAttackableNpcRole(role: NpcRole): boolean {
  return role === "enemy" || role === "critter" || role === "beast" || role === "farmer";
}

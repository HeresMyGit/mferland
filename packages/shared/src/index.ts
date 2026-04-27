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
  healthRegenPer5: 8,
  manaRegenPer5: 12,
};

export const RESPAWN_POINT = {
  x: -2.4,
  z: 4.2,
  yaw: Math.PI * 0.88,
};

export type SolidObstacle =
  | { kind: "circle"; x: number; z: number; radius: number }
  | { kind: "rect"; x: number; z: number; halfX: number; halfZ: number; rotation: number };

const TOWN_BUILDING_SOLIDS: SolidObstacle[] = [
  { kind: "rect", x: -18, z: -8, halfX: 4.1, halfZ: 2.85, rotation: 0.4 },
  { kind: "rect", x: 18, z: -7.5, halfX: 4.1, halfZ: 2.85, rotation: -0.45 },
  { kind: "rect", x: -18, z: 11, halfX: 4.1, halfZ: 2.85, rotation: -0.2 },
  { kind: "rect", x: 18, z: 10.5, halfX: 4.1, halfZ: 2.85, rotation: 0.25 },
  { kind: "rect", x: -25.5, z: -33.8, halfX: 4.1, halfZ: 2.85, rotation: 1.28 },
  { kind: "rect", x: 25.5, z: -33.8, halfX: 4.1, halfZ: 2.85, rotation: -1.28 },
  { kind: "rect", x: -36, z: 17.5, halfX: 4.1, halfZ: 2.85, rotation: 1.5 },
  { kind: "rect", x: 36, z: 17.5, halfX: 4.1, halfZ: 2.85, rotation: -1.5 },
  { kind: "rect", x: -16, z: 36.5, halfX: 4.1, halfZ: 2.85, rotation: 2.82 },
  { kind: "rect", x: 16, z: 36.5, halfX: 4.1, halfZ: 2.85, rotation: -2.82 },
  { kind: "rect", x: -6.4, z: 29.2, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "rect", x: 0, z: 31.4, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "rect", x: 6.4, z: 29.2, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "circle", x: -41, z: -36, radius: 1.8 },
  { kind: "circle", x: 41, z: -36, radius: 1.8 },
  { kind: "circle", x: -5.35, z: -24, radius: 2.05 },
  { kind: "circle", x: 5.35, z: -24, radius: 2.05 },
  { kind: "rect", x: 0, z: -24, halfX: 2.15, halfZ: 1.65, rotation: 0 },
  { kind: "circle", x: 0, z: 0, radius: 3.95 },
  { kind: "rect", x: -59, z: 55.9, halfX: 3.35, halfZ: 2.55, rotation: -0.08 },
  { kind: "rect", x: -44.35, z: 59.15, halfX: 4.25, halfZ: 3.25, rotation: -0.3 },
  { kind: "rect", x: -47.45, z: 68.35, halfX: 2.7, halfZ: 1.75, rotation: 0.2 },
  { kind: "circle", x: -62.3, z: 68.45, radius: 0.85 },
];

const TREE_SOLIDS: SolidObstacle[] = [
  [-31, -18, 0.95], [-27, -7, 0.75], [-30, 15, 0.85], [-41, 30, 0.8],
  [-12, 25, 0.75], [12, 25, 0.85], [41, 30, 0.8], [30, 16, 0.75],
  [29, -17, 0.92], [42, -4, 0.75], [-42, -4, 0.75], [23, -26, 0.7],
  [-23, -26, 0.75], [35, -39, 0.78], [-35, -39, 0.78], [-67, 51, 0.85],
  [-65, 68, 0.75], [-38, 72, 0.92], [-22, 60, 0.7], [58, 48, 0.78],
  [66, -36, 0.85], [-66, -42, 0.8],
  [-82, -68, 0.78], [-72, -73, 0.86], [-62, -68, 0.95], [-54, -73, 0.78],
  [-47, -68, 0.86], [-38, -73, 0.95], [-31, -68, 0.78], [-24, -73, 0.86],
  [-17, -68, 0.95], [18, -73, 0.78], [25, -68, 0.86], [32, -73, 0.95],
  [39, -68, 0.78], [47, -73, 0.86], [54, -68, 0.95], [64, -73, 0.78],
  [74, -68, 0.86], [84, -73, 0.95],
].map(([x, z, radius]) => ({ kind: "circle", x, z, radius }) as SolidObstacle);

export const WORLD_SOLIDS: SolidObstacle[] = [
  ...TOWN_BUILDING_SOLIDS,
  ...TREE_SOLIDS,
];

export const COMBAT = {
  manaRegenDelayMs: 5000,
  healthRegenDelayMs: 10000,
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
      damage: 8,
      cooldownMs: 2000,
      minRange: 4.0,
      maxRange: 40,
      manaCost: 0,
      castTimeMs: 0,
      requiresStationary: true,
    },
    fireblast: {
      label: "Fireblast",
      damage: 16,
      cooldownMs: 0,
      minRange: 0,
      maxRange: 30,
      manaCost: 10,
      castTimeMs: 4000,
      requiresStationary: true,
    },
  },
} as const;

export const QUESTS = {
  "mfer-beginnings": {
    title: "First GM",
    giverNpcId: "og-mfer",
    description: "OG mfer wants to make sure you can check in with town before heading deeper into the plaza.",
    objectiveLabel: "Check back with OG mfer",
    turnInLabel: "Return to OG mfer",
    required: 1,
    autoReady: true,
  },
  "dao-tour": {
    title: "DAO Tour",
    giverNpcId: "dao-mfer",
    description: "DAO mfer wants you to find the hall and report back once you know where proposals will live.",
    objectiveLabel: "Check back with DAO mfer",
    turnInLabel: "Return to DAO mfer",
    required: 1,
    autoReady: true,
  },
  "fountain-vibes": {
    title: "Fountain Vibes",
    giverNpcId: "fountain-mfer",
    description: "Fountain mfer wants you to take a quick breather by the plaza fountain.",
    objectiveLabel: "Check back with Fountain mfer",
    turnInLabel: "Return to Fountain mfer",
    required: 1,
    autoReady: true,
  },
  "feral-farmers": {
    title: "Feral Farmers",
    giverNpcId: "hogwatch-mfer",
    description: "The busted farm is raising feral hogs that keep charging townspeople.",
    objectiveLabel: "Defeat Bran, Mae, and Sol",
    turnInLabel: "Return to Hogwatch mfer",
    required: 3,
    objectives: [
      { id: "farmhand-bran", label: "Defeat Farmhand Bran" },
      { id: "farmhand-mae", label: "Defeat Farmhand Mae" },
      { id: "field-mage-sol", label: "Defeat Field mage Sol" },
    ],
    nextQuestId: "hog-livers",
  },
  "hog-livers": {
    title: "Liver Remedy",
    giverNpcId: "hogwatch-mfer",
    description: "Hog livers can be brewed into a charm that keeps the worst hogs away from the plaza.",
    objectiveLabel: "Collect hog livers",
    turnInLabel: "Return to Hogwatch mfer",
    required: 5,
    requiredQuestId: "feral-farmers",
    dropRate: 0.66,
  },
} as const;

export const ITEMS = {
  "hog-liver": {
    name: "Hog Liver",
    description: "A grimy quest item for Hogwatch mfer's ward brew.",
    quality: "quest",
    iconColor: "#7a2d25",
  },
  "muddy-tusk": {
    name: "Muddy Tusk",
    description: "A chipped tusk from a wild hog.",
    quality: "common",
    iconColor: "#d8c89c",
  },
  "small-tooth": {
    name: "Small Tooth",
    description: "A tiny animal tooth with no obvious use.",
    quality: "common",
    iconColor: "#e7dfc4",
  },
  "worn-antler": {
    name: "Worn Antler",
    description: "A scuffed antler tip from a deer.",
    quality: "common",
    iconColor: "#b89360",
  },
  "farmhand-bandana": {
    name: "Farmhand Bandana",
    description: "A rough scrap from the busted farm crew.",
    quality: "common",
    iconColor: "#b84a3d",
  },
  "dummy-splinter": {
    name: "Dummy Splinter",
    description: "A training dummy splinter. Probably worthless.",
    quality: "common",
    iconColor: "#9b6a3f",
  },
} as const;

export const LOOT = {
  interactRange: 3.25,
  corpseDespawnMs: 180000,
  lootedDespawnMs: 6500,
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
export type NpcDisposition = "friendly" | "neutral" | "hostile";
export type QuestId = keyof typeof QUESTS;
export type QuestStatus = "active" | "ready" | "completed";
export type QuestMarkerType = "available" | "turnIn";
export type ItemId = keyof typeof ITEMS;

export const QUEST_IDS = Object.keys(QUESTS) as QuestId[];

export type QuestSnapshot = {
  id: QuestId;
  status: QuestStatus;
  progress: number;
  required: number;
  flags: string;
  completedAt: number;
};

export type QuestOffer = {
  questId: QuestId;
  npcId: string;
  title: string;
  description: string;
  objectiveLabel: string;
  required: number;
};

export type InventoryItemSnapshot = {
  id: ItemId;
  count: number;
};

export type LootItemSnapshot = {
  id: ItemId;
  count: number;
};

export type LootWindow = {
  npcId: string;
  npcName: string;
  items: LootItemSnapshot[];
};

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
  healthRegenPer5: number;
  mana: number;
  maxMana: number;
  manaRegenPer5: number;
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
  lastCastAt: number;
  lastDamagedAt: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
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
  aggroTargetId: string;
  hasLoot: boolean;
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

export type ClientAcceptQuest = {
  questId: QuestId;
  npcId?: string;
};

export type ClientLootCorpse = {
  npcId: string;
  itemId?: ItemId;
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

export function resolveWorldCollision(x: number, z: number, radius: number) {
  let resolvedX = clamp(x, PLAZA_BOUNDS.minX + radius, PLAZA_BOUNDS.maxX - radius);
  let resolvedZ = clamp(z, PLAZA_BOUNDS.minZ + radius, PLAZA_BOUNDS.maxZ - radius);

  for (let pass = 0; pass < 3; pass += 1) {
    for (const obstacle of WORLD_SOLIDS) {
      if (obstacle.kind === "circle") {
        const dx = resolvedX - obstacle.x;
        const dz = resolvedZ - obstacle.z;
        const minDistance = obstacle.radius + radius;
        const distance = Math.hypot(dx, dz);
        if (distance >= minDistance) continue;

        const push = minDistance - distance;
        if (distance > 0.0001) {
          resolvedX += (dx / distance) * push;
          resolvedZ += (dz / distance) * push;
        } else {
          resolvedX += minDistance;
        }
        continue;
      }

      const push = getRectCollisionPush(resolvedX, resolvedZ, radius, obstacle);
      if (!push) continue;
      resolvedX += push.x;
      resolvedZ += push.z;
    }
  }

  return {
    x: clamp(resolvedX, PLAZA_BOUNDS.minX + radius, PLAZA_BOUNDS.maxX - radius),
    z: clamp(resolvedZ, PLAZA_BOUNDS.minZ + radius, PLAZA_BOUNDS.maxZ - radius),
  };
}

function getRectCollisionPush(x: number, z: number, radius: number, obstacle: Extract<SolidObstacle, { kind: "rect" }>) {
  const dx = x - obstacle.x;
  const dz = z - obstacle.z;
  const cos = Math.cos(obstacle.rotation);
  const sin = Math.sin(obstacle.rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const closestX = clamp(localX, -obstacle.halfX, obstacle.halfX);
  const closestZ = clamp(localZ, -obstacle.halfZ, obstacle.halfZ);
  let pushLocalX = localX - closestX;
  let pushLocalZ = localZ - closestZ;
  const distance = Math.hypot(pushLocalX, pushLocalZ);

  if (distance > 0.0001) {
    if (distance >= radius) return null;
    const pushDistance = radius - distance;
    pushLocalX = (pushLocalX / distance) * pushDistance;
    pushLocalZ = (pushLocalZ / distance) * pushDistance;
  } else {
    const overlapX = obstacle.halfX + radius - Math.abs(localX);
    const overlapZ = obstacle.halfZ + radius - Math.abs(localZ);
    if (overlapX <= 0 || overlapZ <= 0) return null;
    if (overlapX < overlapZ) {
      pushLocalX = (localX >= 0 ? 1 : -1) * overlapX;
      pushLocalZ = 0;
    } else {
      pushLocalX = 0;
      pushLocalZ = (localZ >= 0 ? 1 : -1) * overlapZ;
    }
  }

  return {
    x: pushLocalX * cos + pushLocalZ * sin,
    z: -pushLocalX * sin + pushLocalZ * cos,
  };
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

export function getNpcDisposition(npc: Pick<NpcSnapshot, "role" | "model" | "aggroTargetId">): NpcDisposition {
  if (!isAttackableNpcRole(npc.role)) return "friendly";
  if (npc.role === "farmer" || npc.aggroTargetId) return "hostile";
  return "neutral";
}

export function getNpcQuestIds(npcId: string): QuestId[] {
  return QUEST_IDS.filter((questId) => QUESTS[questId].giverNpcId === npcId);
}

export function getQuestRequirement(questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  return "requiredQuestId" in quest ? quest.requiredQuestId : null;
}

export function getQuestObjectives(questId: QuestId): ReadonlyArray<{ id: string; label: string }> {
  const quest = QUESTS[questId];
  return "objectives" in quest ? quest.objectives : [];
}

export function isQuestAutoReady(questId: QuestId): boolean {
  const quest = QUESTS[questId];
  return "autoReady" in quest && quest.autoReady;
}

export function isQuestAvailableForSnapshots(questId: QuestId, quests: QuestSnapshot[] | undefined): boolean {
  if (quests?.some((quest) => quest.id === questId)) return false;

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return quests?.some((quest) => quest.id === requiredQuestId && quest.status === "completed") ?? false;
}

export function getNpcQuestMarker(
  npc: Pick<NpcSnapshot, "id">,
  quests: QuestSnapshot[] | undefined,
): QuestMarkerType | null {
  const npcQuestIds = getNpcQuestIds(npc.id);
  const questLog = quests ?? [];

  for (const questId of npcQuestIds) {
    const quest = questLog.find((entry) => entry.id === questId);
    if (!quest) {
      if (isQuestAvailableForSnapshots(questId, questLog)) return "available";
      continue;
    }

    if (quest.status === "ready") return "turnIn";
    if (quest.status !== "completed") return null;
  }

  return null;
}

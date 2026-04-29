import type { COMBAT } from "./combat.js";
import type { EquipmentSlotId, ITEMS } from "./items.js";
import type { QUESTS } from "./quests.js";
import type { TalentId, TalentTreeId } from "./talents.js";
import type { PLAZA_BOUNDS } from "./world.js";

export type IdentityType = "guest" | "wallet" | "agent";
export type SpeakerType = IdentityType | "npc";
export type AnimationState = "idle" | "walk" | "run" | "jump";
export type NpcRole = "wanderer" | "quest_giver" | "merchant" | "guard" | "enemy" | "critter" | "beast" | "farmer";
export type NpcModel = "mfer" | "mfergpt" | "rabbit" | "deer" | "hog" | "training-dummy";
export type TargetKind = "player" | "npc";
export type CombatActionId = keyof typeof COMBAT.actions;
export type ActionId = "interact" | CombatActionId;
export type NpcDisposition = "friendly" | "neutral" | "hostile";
export type QuestId = keyof typeof QUESTS;
export type QuestStatus = "active" | "ready" | "completed";
export type QuestMarkerType = "available" | "turnIn";
export type ItemId = keyof typeof ITEMS;
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
  npcName: string;
  title: string;
  description: string;
  storyText: string;
  objectiveLabel: string;
  required: number;
  rewardPreview: string[];
};

export type QuestTurnIn = {
  questId: QuestId;
  npcId: string;
  npcName: string;
  title: string;
  completionText: string;
  completedTaskSummary: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
};

export type QuestStatusNotice = {
  questId: QuestId;
  npcId: string;
  npcName: string;
  title: string;
  statusText: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
};

export type InventoryItemSnapshot = {
  id: ItemId;
  chainTokenId: string;
  count: number;
};

export type EquipmentSlotSnapshot = {
  slot: EquipmentSlotId;
  itemId: ItemId | "";
  chainTokenId: string;
};

export type TalentRankSnapshot = {
  id: TalentId;
  tree: TalentTreeId;
  nodeId: string;
  rank: number;
};

export type LootItemSnapshot = {
  id: ItemId;
  chainTokenId: string;
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
  level: number;
  xp: number;
  talentPoints: number;
  health: number;
  maxHealth: number;
  healthRegenPer5: number;
  mana: number;
  maxMana: number;
  manaRegenPer5: number;
  walkSpeed: number;
  runSpeed: number;
  strength: number;
  dexterity: number;
  magic: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  lastSeq: number;
  attackReadyAt: number;
  shootReadyAt: number;
  signalShotReadyAt: number;
  fireblastReadyAt: number;
  frostNovaReadyAt: number;
  healReadyAt: number;
  tauntReadyAt: number;
  whirlwindReadyAt: number;
  multishotReadyAt: number;
  iceBlastReadyAt: number;
  castingAction: CombatActionId | "";
  castStartedAt: number;
  castEndsAt: number;
  lastCastAt: number;
  lastDamagedAt: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
  talents: TalentRankSnapshot[];
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
  frozenUntil: number;
  slowedUntil: number;
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

export type ExperienceEvent = {
  id: string;
  sessionId: string;
  sourceNpcId: string;
  amount: number;
  x: number;
  y: number;
  z: number;
  sentAt: number;
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

export type ClientCompleteQuest = {
  questId: QuestId;
  npcId?: string;
};

export type ClientLootCorpse = {
  npcId: string;
  itemId?: ItemId;
  chainTokenId?: string;
};

export type ClientEquipItem = {
  itemId: ItemId;
  chainTokenId?: string;
};

export type ClientUseItem = {
  itemId: ItemId;
  chainTokenId?: string;
};

export type ClientUnequipItem = {
  slot: EquipmentSlotId;
};

export type ClientSelectTalent = {
  talentId: TalentId;
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

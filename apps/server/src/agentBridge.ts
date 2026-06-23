import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Client, type Room } from "colyseus.js";
import {
  AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
  COMBAT,
  FISHING_AGENT_BUNDLE_MULTIPLIER,
  FISHING_CHUM_ITEM_ID,
  FISHING_VENDOR_NPC_ID,
  FISHING_ZONE,
  INPUT_SEND_RATE,
  clamp,
  getCombatActionUnlockLevel,
  getItemEquipment,
  getLevelProgress,
  getNpcQuestIds,
  getQuestObjectives,
  getFishingSupplyPrice,
  getPotionShopPrice,
  getQuestRequirement,
  getQuestTurnInNpcId,
  getTalentRankStatus,
  isFishingSellableItemId,
  isPotionShopItemId,
  isPotionShopPurchaseQuantity,
  isQuestAvailableForSnapshots,
  ITEMS,
  normalizeWalletAddress,
  PLAYER,
  resolveAgentMferAppearanceTraitsForUpdate,
  resolveWorldCollision,
  QUESTS,
  QUEST_IDS,
  ROOM_NAME,
  TALENTS,
  TALENT_IDS,
  type CombatActionId,
  type CombatEvent,
  type ItemId,
  type QuestId,
  type QuestSnapshot,
  type QuestStatus,
  type StatKey,
  type TalentId,
  type TalentRankLike,
} from "@mferland/shared";
import {
  describeAgentCommandBudgetExhaustion,
  finalizeAgentCommandSeconds,
  getAgentCommandBudget,
  getAgentCommandUsage,
  getLocalAgentCommandBudgetOverride,
  reserveAgentCommandSeconds,
  type AgentCommandBudget,
  type AgentCommandUsage,
} from "./agentCommandBudget.js";
import { buildAgentCatalog } from "./agentCatalog.js";
import { AGENT_PREMADE_BEHAVIOR_SCHEMES } from "./agentHarnessOptions.js";
import { getAgentSeason0MferGptGateStatus } from "./agentMferGptGate.js";
import {
  parseToolPaymentHeader,
  reportAgentToolUsage,
  verifyZeroPriceToolPayment,
} from "./agentToolRegistry.js";
import { verifyAgentSessionTokenDetailed } from "./walletAuth.js";

type AnyRecord = Record<string, unknown>;
export type Point = { x: number; z: number };
export type QuestAgentPointHint = { label: string; point: Point };
export type QuestAgentHints = {
  targetArea?: QuestAgentPointHint;
  patrolPoints: QuestAgentPointHint[];
  avoidGenericTargetNpcIds: string[];
};
type AgentQuestLike = { id?: unknown; status?: unknown };
type AgentParticipantLike = {
  sessionId?: unknown;
  health?: unknown;
  maxHealth?: unknown;
  x?: unknown;
  z?: unknown;
  quests?: unknown;
};
type TargetSelection = { kind: "npc"; id: string } | { kind: "player"; id: string };
type QuestTargetMatchers = { models: string[]; roles: string[]; idPrefixes: string[] };

type AgentBridgeConfig = {
  roomServer: string;
  roomName?: string;
  defaultName?: string;
  sessionTtlMs?: number;
};

type AgentBridgeStartPayload = {
  walletAddress?: string;
  wallet?: string;
  sessionToken?: string;
  name?: string;
  inviteCode?: string;
  createCharacter?: boolean;
  objective?: string;
};

export type AgentBridgeDecision = {
  action: string;
  reason: string;
  x?: number | null;
  z?: number | null;
  npcRef?: string | null;
  playerRef?: string | null;
  questId?: string | null;
  itemId?: string | null;
  chainTokenId?: string | null;
  slotId?: string | null;
  talentId?: string | null;
  actionId?: string | null;
  text?: string | null;
  emoteId?: string | null;
  quantity?: number | null;
  amountEth?: string | null;
  paymentTxHash?: string | null;
  paymentAmountWei?: string | null;
  paymentChainId?: number | null;
  paymentContractAddress?: string | null;
  sprint?: boolean | null;
  jump?: boolean | null;
  traits?: AnyRecord | null;
};

type RuntimePlayer = AnyRecord & {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  walletAddress: string;
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
  level: number;
  xp: number;
  talentPoints: number;
  x: number;
  z: number;
  yaw: number;
  animation: string;
  castingAction: string;
  quests: AnyRecord[];
  inventory: AnyRecord[];
  equipment: AnyRecord[];
  talents: AnyRecord[];
  activeBuffs: AnyRecord[];
  agentStatusAction: string;
  agentStatusThought: string;
  agentStatusObjective: string;
  agentStatusQuest: string;
  agentStatusUpdatedAt: number;
};

type RuntimeNpc = AnyRecord & {
  id: string;
  name: string;
  role: string;
  model: string;
  combatStyle: string;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  z: number;
  defeatedAt: number;
  despawnAt: number;
  aggroTargetId: string;
  hasLoot: boolean;
  loot: AnyRecord[];
  questId: string;
  dialogue: string;
};

type QuestMemory = {
  kind: "offer" | "status" | "turnIn" | "completed";
  questId: string;
  npcId: string;
  npcName: string;
  turnInNpcId: string;
  turnInNpcName: string;
  title: string;
  text: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
  nextQuestId: string;
  nextQuestTitle: string;
  nextGiverNpcId: string;
  nextGiverNpcName: string;
  observedAt: number;
};

type BridgeActionResult = {
  ok: boolean;
  status?: string;
  bridgeSessionId?: string;
  lastAction?: string;
  error?: string;
  retryAfterMs?: number;
  paymentRequired?: AnyRecord;
  walletActionRequired?: AnyRecord;
  report?: ActionReport;
  summary?: string;
  stoppedBecause?: string;
  suggestedNextAction?: SuggestedDecision | null;
  continuePrompt?: string;
  durationMs?: number;
};

type QuestSnapshotSummary = {
  id: string;
  status: string;
  progress: number;
  required: number;
};

type PlayerInventorySummary = {
  itemId: string;
  count: number;
  chainTokenId: string;
  chainTier: number;
};

type PlayerEquipmentSummary = {
  slot: string;
  itemId: string;
  chainTokenId: string;
  chainTier: number;
};

type PlayerTalentSummary = {
  talentId: string;
  rank: number;
};

type PlayerActiveBuffSummary = {
  id: string;
  stacks: number;
  expiresAt: number;
};

type PlayerFinalStateSummary = {
  level: number;
  xp: number;
  talentPoints: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  position: Point;
  stats: {
    strength: number;
    dexterity: number;
    magic: number;
    healthRegenPer5: number;
    manaRegenPer5: number;
    walkSpeed: number;
    runSpeed: number;
  };
  inventoryCounts: Record<string, number>;
  inventory: PlayerInventorySummary[];
  equipment: PlayerEquipmentSummary[];
  talents: PlayerTalentSummary[];
  activeBuffs: PlayerActiveBuffSummary[];
};

type EquipmentChangeSummary = {
  slot: string;
  before: Omit<PlayerEquipmentSummary, "slot"> | null;
  after: Omit<PlayerEquipmentSummary, "slot"> | null;
};

type PlayerActionSnapshot = {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  talentPoints: number;
  position: Point;
  stats: PlayerFinalStateSummary["stats"];
  quests: QuestSnapshotSummary[];
  inventoryCounts: Record<string, number>;
  inventory: PlayerInventorySummary[];
  equipment: PlayerEquipmentSummary[];
  talents: PlayerTalentSummary[];
  activeBuffs: PlayerActiveBuffSummary[];
  attackerIds: string[];
};

type DurableOutcome = {
  status: string;
  stoppedBecause: string;
  durationMs: number;
};

type OpenLootWindow = {
  npcId: string;
  source: string;
  observedAt: number;
};

type SuggestedDecision = {
  action: string;
  reason: string;
  npcRef?: string;
  questId?: string;
  itemId?: string;
  talentId?: string;
  actionId?: string;
  text?: string;
  x?: number;
  z?: number;
};

type DecisionPlanningOptions = {
  skipOptionalBossDailies?: boolean;
  profile?: AgentCommandProfile;
  deathCount?: number;
  focusedQuestId?: string;
  planningOnly?: boolean;
};

type GroupEncounterPrepOptions = {
  ignoreAttemptCooldown?: boolean;
  markAttempt?: boolean;
  allowDuringObjectiveCombat?: boolean;
  includeExplicitPrep?: boolean;
  includeAggroAdds?: boolean;
};

type ActionReport = {
  status: string;
  stoppedBecause: string;
  summary: string;
  durationMs: number;
  action: string;
  target: string;
  reason: string;
  health: string;
  position: Point | null;
  questProgress: QuestSnapshotSummary[];
  questChanges: Array<{ id: string; before: string; after: string }>;
  recentMessages: string[];
  suggestedNextAction: SuggestedDecision | null;
  continuePrompt: string;
};

type AgentCommandKind = "finish_next_quest" | "finish_quest" | "play_for" | "farm_until" | "run_goals";

type AgentCommandStatus = "running" | "completed" | "time_limit" | "safety_stop" | "payment_required" | "wallet_action_required" | "stopped" | "failed";

type AgentCommandPriority = "auto" | "quester" | "farmer" | "boss_hunter" | "looter" | "completionist" | "social";
type AgentCommandRole = "auto" | "tank" | "healer" | "dps" | "support";
type AgentCommandSpec = "auto" | "brawler_tank" | "brawler_dps" | "caster_fire" | "caster_frost" | "utility_ranger" | "utility_support";
type AgentCommandPartyMode = "auto" | "grouper" | "lone_wolf" | "follow_leader";
type AgentCommandRisk = "safe" | "normal" | "bold";
type AgentCommandSocial = "quiet" | "normal" | "chatty";
type AgentCommandStopWhen = "any" | "all";
type AgentCommandController = {
  type: "premade" | "external_policy";
  policyRef: string;
  policyHash: string;
};
type AgentCommandProfile = {
  priority: AgentCommandPriority;
  role: AgentCommandRole;
  spec: AgentCommandSpec;
  partyMode: AgentCommandPartyMode;
  risk: AgentCommandRisk;
  social: AgentCommandSocial;
};
type AgentCommandGoalType =
  | "quest_completed"
  | "quest_ready"
  | "quest_accepted"
  | "inventory_at_least"
  | "level_at_least"
  | "xp_gained"
  | "survive_seconds"
  | "arrive_at_landmark"
  | "near_player_count";
type AgentCommandGoal = {
  type: AgentCommandGoalType;
  questId: string;
  itemId: string;
  count: number;
  level: number;
  xp: number;
  seconds: number;
  landmarkId: string;
  radius: number;
};
type AgentCommandGoalProgress = AgentCommandGoal & {
  current: number;
  required: number;
  satisfied: boolean;
  summary: string;
};
type AgentCommandConstraints = {
  noWalletActions: boolean;
  noPaidActions: boolean;
  maxDeaths: number | null;
  maxSafetyStops: number | null;
  allowedActions: string[];
  disallowedActions: string[];
};

export type AgentCommandSocialPlayer = {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  closestDistance: number;
};

export type AgentCommandSocialChat = {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  kind: string;
  text: string;
  observedAt: number;
};

export type AgentCommandSocialMemory = {
  players: Map<string, AgentCommandSocialPlayer>;
  chat: AgentCommandSocialChat[];
};

type AgentCommandCombatTargetStats = {
  targetId: string;
  targetName: string;
  targetModel: string;
  damageDone: number;
  hitCount: number;
  firstAt: number;
  lastAt: number;
  defeated: boolean;
};

type AgentCommandCombatStats = {
  damageDone: number;
  healingDone: number;
  hitCount: number;
  firstAt: number;
  lastAt: number;
  targets: Map<string, AgentCommandCombatTargetStats>;
};

type AgentCommandPayload = {
  command?: unknown;
  kind?: unknown;
  behavior?: unknown;
  behaviorMode?: unknown;
  behaviorScheme?: unknown;
  profile?: unknown;
  controller?: unknown;
  policySource?: unknown;
  policyRef?: unknown;
  codeChunk?: unknown;
  codeChunkHash?: unknown;
  policyHash?: unknown;
  objective?: unknown;
  maxSeconds?: unknown;
  questId?: unknown;
  itemId?: unknown;
  targetCount?: unknown;
  goals?: unknown;
  stopWhen?: unknown;
  constraints?: unknown;
};

type NormalizedAgentCommandPayload = {
  kind: AgentCommandKind;
  behaviorScheme: string;
  controller: AgentCommandController;
  profile: AgentCommandProfile;
  goals: AgentCommandGoal[];
  stopWhen: AgentCommandStopWhen;
  constraints: AgentCommandConstraints;
  maxSeconds: number;
  questId: string;
  itemId: string;
  targetCount: number;
};

type AgentCommandState = {
  commandId: string;
  kind: AgentCommandKind;
  behaviorScheme: string;
  controller: AgentCommandController;
  profile: AgentCommandProfile;
  goals: AgentCommandGoal[];
  stopWhen: AgentCommandStopWhen;
  constraints: AgentCommandConstraints;
  status: AgentCommandStatus;
  stoppedBecause: string;
  startedAt: number;
  finishedAt: number;
  requestedMaxSeconds: number;
  maxSeconds: number;
  budget: AgentCommandBudget;
  usage: AgentCommandUsage;
  questId: string;
  itemId: string;
  targetCount: number;
  deathCount: number;
  safetyStopCount: number;
  abortRequested: boolean;
  usageFinalized: boolean;
  startSnapshot: PlayerActionSnapshot | null;
  lastSnapshot: PlayerActionSnapshot | null;
  reports: ActionReport[];
  errors: string[];
  social: AgentCommandSocialMemory;
  combat: AgentCommandCombatStats;
};

type CombatMemoryEntry = {
  key: string;
  kind: "death" | "retreat" | "safety_stop" | "movement" | "unsafe_target";
  reason: string;
  action: string;
  npcId: string;
  npcName: string;
  questId: string;
  position: Point | null;
  targetPosition: Point | null;
  severity: number;
  count: number;
  firstAt: number;
  lastAt: number;
  avoidUntil: number;
  recommendedAction: string;
};

type RecentNpcPlayerCombat = {
  lastAt: number;
  playerSessionId: string;
  direction: "npc_to_player" | "player_to_npc";
  defeated: boolean;
};

const BRIDGE_BODY_LIMIT_BYTES = 64 * 1024;
const INPUT_INTERVAL_MS = Math.round(1000 / INPUT_SEND_RATE);
const INTERACT_SEND_RANGE = 12.5;
const QUEST_SEND_RANGE = 3.75;
const INTERACT_APPROACH_DISTANCE = 1.6;
const LOOT_SEND_RANGE = 3.2;
const COMMAND_SOCIAL_PLAYER_RADIUS = 45;
const LOCAL_NAV_MAX_DISTANCE = 34;
const LOCAL_NAV_MARGIN = 16;
const LOCAL_NAV_GRID_SIZE = 0.5;
const LOCAL_NAV_ARRIVAL_DISTANCE = 0.8;
const LOCAL_NAV_FREE_TOLERANCE = 0.08;
const LOCAL_NAV_MAX_NODES = 18_000;
const RECOVER_HEALTH_RATIO = 0.72;
const CRITICAL_HEALTH_RATIO = 0.35;
const DANGEROUS_NEIGHBOR_RADIUS = 11;
const CROWDED_PULL_RADIUS = 12;
const HOSTILE_PATH_CORRIDOR_RADIUS = 9;
const SAFE_APPROACH_TRIGGER_RISK = 0.42;
const SAFE_APPROACH_ARRIVAL_DISTANCE = 4.2;
const GENERIC_QUEST_TARGET_SAFE_SCORE = 1.12;
const GENERIC_QUEST_TARGET_FALLBACK_SCORE = 1.28;
const GENERIC_QUEST_TARGET_AREA_RADIUS = 76;
const GENERIC_QUEST_TARGET_AREA_PATROL_RADIUS = 18;
const SOCIAL_MESSAGE_TTL_MS = 2 * 60_000;
const DEFAULT_CHAT_COOLDOWN_MS = 30_000;
const DEFAULT_EMOTE_COOLDOWN_MS = 45_000;
const PRESS_SINGLE_ATTACKER_HEALTH_RATIO = 0.58;
const PRESS_MULTI_ATTACKER_HEALTH_RATIO = 0.68;
const PRESS_ENGAGED_MULTI_ATTACKER_HEALTH_RATIO = 0.76;
const PRESS_LOW_HEALTH_FINISH_RATIO = 0.38;
const FAVORABLE_FIGHT_SURVIVAL_MARGIN = 1.25;
const MOVEMENT_STUCK_RETHINK_ATTEMPTS = 3;
const MOVEMENT_TROUBLE_TTL_MS = 2 * 60_000;
const COMBAT_MEMORY_TTL_MS = 10 * 60_000;
const COMBAT_AVOID_BASE_MS = 90_000;
const COMBAT_AVOID_MAX_MS = 5 * 60_000;
const GROUP_ENCOUNTER_ACTIVE_COMBAT_TTL_MS = 20_000;
const GROUP_ENCOUNTER_COMBAT_MEMORY_TTL_MS = 3 * 60_000;
const GROUP_ENCOUNTER_PREP_SKIP_AFTER_PULL_MS = 2 * 60_000;
const GROUP_ENCOUNTER_PREP_RETRY_MS = 25_000;
const GROUP_ENCOUNTER_PREP_CLEAR_MEMORY_MS = 90_000;
const DEFAULT_COMMAND_MAX_DEATHS = null;
const DEFAULT_COMMAND_MAX_SAFETY_STOPS = null;
const GROUP_ENCOUNTER_READY_RADIUS = 34;
const GROUP_ENCOUNTER_RALLY_DISTANCE = 28;
const GROUP_ENCOUNTER_READY_HEALTH_RATIO = 0.88;
const GROUP_ENCOUNTER_SELF_HEAL_RATIO = 0.82;
const GROUP_ENCOUNTER_ALLY_HEAL_RATIO = 0.82;
const GROUP_ENCOUNTER_CONSUMABLE_HEALTH_RATIO = 0.9;
const GROUP_ENCOUNTER_REPOSITION_HEALTH_RATIO = 0.68;
const GROUP_ENCOUNTER_PRESS_HEALTH_RATIO = 0.5;
const GROUP_ENCOUNTER_CAST_PRESSURE_DISTANCE = 13;
const GROUP_ENCOUNTER_RECOVERY_KITE_DISTANCE = 14;
const GROUP_ENCOUNTER_CRITICAL_RECOVERY_KITE_DISTANCE = 18;
const GROUP_ENCOUNTER_MAX_RECOVERY_BOSS_DISTANCE = 34;
const GROUP_ENCOUNTER_EXPLICIT_PREP_RADIUS = 58;
const GROUP_ENCOUNTER_ADD_PREP_RADIUS = 34;
const DURABLE_ACTION_POLL_MS = 300;
const DURABLE_CONTINUATION_MS = 900;
const SHORT_ACTION_SETTLE_MS = 700;
const BASE_CHAIN_ID = 8453;
const BASE_MFERGPT_TOKEN_ADDRESS = "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07";
const BASE_BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS = "0x6fF5693b99212Da76ad316178A184AB56D299b43";
const DEFAULT_SWAP_ETH_AMOUNT = "0.01";
const DAILY_SIGNAL_QUEST_ID = "mfergpt-daily-signal";
const DAILY_BOSS_NPC_ID = "mfergpt-daily-boss";
const DAILY_BOSS_ROUTE_ID = "plaza-to-daily-boss";
const DAILY_BOSS_RETURN_ROUTE_ID = "daily-boss-to-plaza";
const DAILY_BOSS_ROUTE: Point[] = [
  { x: -18, z: 0 },
  { x: -52, z: 0 },
  { x: -52, z: -36 },
  { x: -58, z: -48 },
  { x: -69.4, z: -55.6 },
];
const DAILY_BOSS_RETURN_ROUTE: Point[] = [
  { x: -58, z: -48 },
  { x: -52, z: -36 },
  { x: -52, z: 0 },
  { x: -18, z: 0 },
  { x: 6.8, z: -5.2 },
];
const PLAZA_TO_ROUTE_POST_ROUTE: Point[] = [
  { x: 0, z: 29 },
  { x: -31, z: 60 },
  { x: -64.5, z: 64.5 },
  { x: -76, z: 78 },
  { x: -82, z: 92 },
  { x: -101, z: 116 },
  { x: -119.2, z: 132.4 },
];
const ROUTE_POST_TO_LOOP_FARM_ROUTE: Point[] = [
  { x: -101, z: 116 },
  { x: -82, z: 92 },
  { x: -76, z: 78 },
  { x: -64.5, z: 64.5 },
];
const OPTIONAL_BOSS_DAILY_QUEST_IDS = new Set<string>([
  DAILY_SIGNAL_QUEST_ID,
  "ogre-raid-daily",
]);

const NPC_AREA_ROUTE_RULES: Array<{
  id: string;
  matchesTarget: (point: Point) => boolean;
  routeFrom: (self: Point) => string;
}> = [
  {
    id: "route-post",
    matchesTarget: (target) => target.x < -100 && target.z > 110,
    routeFrom: (self) => self.x < -55 && self.z > 45 ? "loop-farm-to-route-post" : "plaza-to-route-post",
  },
  {
    id: "loop-farm",
    matchesTarget: (target) => target.x < -55 && target.z > 45,
    routeFrom: (self) => self.x < -90 && self.z > 105 ? "route-post-to-loop-farm" : "plaza-to-loop-farm",
  },
  {
    id: "static-lot",
    matchesTarget: (target) => target.x > 135 && target.z < -70,
    routeFrom: (self) => {
      if (self.x > 80 && self.z < -45) return "signal-post-to-static-lot";
      return self.x < -55 && self.z > 45 ? "route-post-to-signal-ridge" : "plaza-to-signal-ridge";
    },
  },
  {
    id: "signal-ridge",
    matchesTarget: (target) => target.x > 80 && target.z < -45,
    routeFrom: (self) => self.x < -55 && self.z > 45 ? "route-post-to-signal-ridge" : "plaza-to-signal-ridge",
  },
  {
    id: "daily-boss-camp",
    matchesTarget: (target) => target.x < -45 && target.z < -35,
    routeFrom: () => DAILY_BOSS_ROUTE_ID,
  },
];

const PUBLIC_LANDMARKS: Record<string, Point> = {
  plaza: { x: -2.4, z: 4.2 },
  "north-gate": { x: 5.5, z: -18.5 },
  market: { x: 0, z: 25.4 },
  "loop-farm": { x: -64.5, z: 64.5 },
  "claim-pile": { x: -89, z: 92 },
  "route-post": { x: -119.2, z: 132.4 },
  "claim-booth": { x: -111.2, z: 136.7 },
  "signal-post": { x: 108.8, z: -92.8 },
  "uplink-shack": { x: 117.6, z: -91.2 },
  "static-lot": { x: 151.5, z: -106.2 },
};

const OBJECTIVE_LOCATION_HINTS: Record<string, { label: string; point: Point }> = {
  "farmhand-bran": { label: "creyzie chaser bran", point: { x: -77.5, z: 86.5 } },
  "farmhand-mae": { label: "just-missed-it mae", point: { x: -87.5, z: 91.5 } },
  "field-mage-sol": { label: "nakamigo truther sol", point: { x: -73.2, z: 99.8 } },
  "ridge-raider-vex": { label: "operator vex", point: { x: 145.5, z: -84.2 } },
  "ridge-raider-pax": { label: "repeater pax", point: { x: 153.2, z: -95.8 } },
  "static-mage-ori": { label: "echo-shell ori", point: { x: 150.2, z: -113.4 } },
  "static-baron-nox": { label: "The Centralizer", point: { x: 151.5, z: -124.8 } },
};

const PUBLIC_ROUTES: Record<string, Point[]> = {
  "plaza-to-loop-farm": [{ x: 0, z: 29 }, { x: -31, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-claim-pile": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -99, z: 75 }, { x: -89, z: 92 }],
  "claim-pile-to-loop-farm": [{ x: -89, z: 92 }, { x: -99, z: 75 }, { x: -82, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-route-post": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "plaza-to-route-post": PLAZA_TO_ROUTE_POST_ROUTE,
  "route-post-to-loop-farm": ROUTE_POST_TO_LOOP_FARM_ROUTE,
  "claim-pile-to-route-post": [{ x: -89, z: 92 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "route-post-to-claim-booth": [{ x: -119.2, z: 132.4 }, { x: -111.2, z: 136.7 }],
  "route-post-to-signal-post": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 0, z: -56 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "route-post-to-signal-ridge": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 0, z: -56 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "plaza-to-signal-ridge": [{ x: 0, z: -34 }, { x: 0, z: -56 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "signal-post-to-uplink-shack": [{ x: 108.8, z: -92.8 }, { x: 117.6, z: -91.2 }],
  "signal-post-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "signal-ridge-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "uplink-shack-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  [DAILY_BOSS_ROUTE_ID]: DAILY_BOSS_ROUTE,
  [DAILY_BOSS_RETURN_ROUTE_ID]: DAILY_BOSS_RETURN_ROUTE,
  "field-to-plaza": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: -2.4, z: 4.2 }],
  "ridge-to-plaza": [{ x: 108.8, z: -92.8 }, { x: 75, z: -22 }, { x: 53, z: -11.5 }, { x: 0, z: -34 }, { x: -2.4, z: 4.2 }],
};

const DECISION_ACTIONS = [
  "wait",
  "move_to",
  "travel_route",
  "move_near_npc",
  "move_near_player",
  "respawn",
  "interact_npc",
  "accept_quest",
  "complete_quest",
  "cancel_quest",
  "use_ability",
  "fight_npc",
  "loot",
  "equip_item",
  "unequip_item",
  "use_item",
  "select_talent",
  "swap_eth_for_mfergpt",
  "register_chain_gear",
  "purchase_potion_shop_item",
  "purchase_fishing_supply",
  "sell_trash_items",
  "fish",
  "sell_fish_items",
  "update_traits",
  "emote",
  "chat",
  "share_quest_link",
] as const;

const WALLET_DECISION_ACTIONS = new Set<string>([
  "swap_eth_for_mfergpt",
  "register_chain_gear",
  "purchase_potion_shop_item",
  "purchase_fishing_supply",
  "update_traits",
]);
const PAID_DECISION_ACTIONS = new Set<string>([
  "swap_eth_for_mfergpt",
  "purchase_potion_shop_item",
  "purchase_fishing_supply",
  "update_traits",
]);
const FREE_TRAIT_QUEST_ID = "set-your-traits";
const DEFAULT_COMMAND_PROFILE: AgentCommandProfile = {
  priority: "auto",
  role: "auto",
  spec: "auto",
  partyMode: "auto",
  risk: "normal",
  social: "quiet",
};

const COMBAT_ACTION_IDS = Object.keys(COMBAT.actions) as CombatActionId[];
const COMBAT_UNLOCK_TALENTS: Partial<Record<CombatActionId, string>> = {
  frostNova: "caster:frost-nova",
  whirlwind: "brawler:whirlwind",
  multishot: "utility:multishot",
};
const EQUIPMENT_STAT_WEIGHTS: Record<StatKey, number> = {
  maxHealth: 0.16,
  maxMana: 0.04,
  strength: 1.2,
  dexterity: 1.1,
  magic: 0.9,
};

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: DECISION_ACTIONS },
    reason: { type: "string" },
    x: { type: ["number", "null"] },
    z: { type: ["number", "null"] },
    npcRef: { type: ["string", "null"] },
    playerRef: { type: ["string", "null"] },
    questId: { type: ["string", "null"] },
    itemId: { type: ["string", "null"] },
    chainTokenId: { type: ["string", "null"] },
    slotId: { type: ["string", "null"] },
    talentId: { type: ["string", "null"] },
    actionId: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    emoteId: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    amountEth: { type: ["string", "null"] },
    paymentTxHash: { type: ["string", "null"] },
    paymentAmountWei: { type: ["string", "null"] },
    paymentChainId: { type: ["number", "null"] },
    paymentContractAddress: { type: ["string", "null"] },
    sprint: { type: ["boolean", "null"] },
    jump: { type: ["boolean", "null"] },
    traits: { type: ["object", "null"], additionalProperties: { type: "string" } },
  },
  required: [
    "action",
    "reason",
    "x",
    "z",
    "npcRef",
    "playerRef",
    "questId",
    "itemId",
    "chainTokenId",
    "slotId",
    "talentId",
    "actionId",
    "text",
    "emoteId",
    "quantity",
    "amountEth",
    "paymentTxHash",
    "paymentAmountWei",
    "paymentChainId",
    "paymentContractAddress",
    "sprint",
    "jump",
    "traits",
  ],
} as const;

class AgentBridgeSession {
  readonly id = randomUUID();
  readonly walletAddress: string;
  readonly sessionToken: string;
  readonly objective: string;
  private readonly client: Client;
  private readonly roomName: string;
  private readonly agentName: string;
  private readonly inviteCode: string;
  private readonly createCharacter: boolean;
  private room: Room | null = null;
  private players = new Map<string, RuntimePlayer>();
  private npcs = new Map<string, RuntimeNpc>();
  private lastNpcRefs = new Map<string, string>();
  private lastPlayerRefs = new Map<string, string>();
  private recentMessages: string[] = [];
  private openLootWindow: OpenLootWindow | null = null;
  private pendingSocialMessages: Array<{ sessionId: string; name: string; identityType: string; text: string; kind: string; observedAt: number }> = [];
  private questMemory = new Map<string, QuestMemory>();
  private focusedQuestId = "";
  private targetPoint: Point | null = null;
  private avoidancePoint: Point | null = null;
  private avoidanceUntil = 0;
  private movementProgressTarget: Point | null = null;
  private movementProgressDistance = Number.POSITIVE_INFINITY;
  private movementProgressAt = 0;
  private movementUnstickAttempts = 0;
  private movementTrouble: AnyRecord | null = null;
  private combatMemory: CombatMemoryEntry[] = [];
  private recentNpcPlayerCombat = new Map<string, RecentNpcPlayerCombat>();
  private groupPrepAttemptedNpcIds = new Map<string, Map<string, number>>();
  private lastDeathRecordedAt = 0;
  private routeQueue: Point[] = [];
  private currentRouteId = "";
  private routeArrivalDistance = 2;
  private engagedNpcId = "";
  private combatAnchor: Point | null = null;
  private lastSafePoint: Point | null = null;
  private retreatUntil = 0;
  private seq = 0;
  private yaw = Math.PI;
  private stationaryUntil = 0;
  private nextAutoCombatAt = 0;
  private nextAutoConsumableAt = 0;
  private nextAgentStatusAt = 0;
  private nextChatAt = 0;
  private nextEmoteAt = 0;
  private movementJumpUntil = 0;
  private lastNextActionChat = "";
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private reconnecting = false;
  private mferGptSpendProofedWei = 0n;
  private swapEthSpendRequestedWei = 0n;
  private readonly commands = new Map<string, AgentCommandState>();
  private activeCommandId = "";
  lastDecision: AgentBridgeDecision | null = null;
  lastActionReport: ActionReport | null = null;
  lastAction = "";
  lastError = "";
  startedAt = Date.now();
  lastObservedAt = 0;
  lastActionAt = 0;

  constructor(options: {
    roomServer: string;
    roomName: string;
    walletAddress: string;
    sessionToken: string;
    agentName: string;
    inviteCode: string;
    createCharacter: boolean;
    objective: string;
  }) {
    this.walletAddress = options.walletAddress;
    this.sessionToken = options.sessionToken;
    this.roomName = options.roomName;
    this.agentName = options.agentName;
    this.inviteCode = options.inviteCode;
    this.createCharacter = options.createCharacter;
    this.objective = options.objective;
    this.client = new Client(options.roomServer);
  }

  async start() {
    await this.connect();
    this.inputTimer = setInterval(() => this.sendInput(), INPUT_INTERVAL_MS);
  }

  stop() {
    this.stopping = true;
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = null;
    void this.room?.leave();
    this.room = null;
  }

  async connect() {
    const room = await this.client.joinOrCreate(this.roomName, {
      name: this.agentName,
      identityType: "wallet",
      walletAddress: this.walletAddress,
      createCharacter: this.createCharacter,
      inviteCode: this.inviteCode,
      agentClient: true,
      sessionToken: this.sessionToken,
    });
    this.room = room;
    this.installHandlers(room);
    this.lastAction = `bridge_joined ${room.sessionId}`;
  }

  private installHandlers(room: Room) {
    room.onStateChange((state: unknown) => {
      const record = asRecord(state);
      this.players = new Map(schemaEntries(record.players).map(([id, value]) => [id, normalizePlayer(id, value)]));
      this.npcs = new Map(schemaEntries(record.npcs).map(([id, value]) => [id, normalizeNpc(id, value)]));
      this.lastObservedAt = Date.now();
      this.rememberActiveCommandPlayers(this.lastObservedAt);
    });
    room.onMessage("chat", (message: unknown) => this.handleChatMessage(message));
    room.onMessage("combatEvent", (message: unknown) => this.handleCombatEvent(message));
    room.onMessage("experienceEvent", (message: unknown) => this.remember(`xp:${messageSummary(message)}`, true));
    room.onMessage("lootWindow", (message: unknown) => {
      this.openLootWindow = readOpenLootWindow(message);
      this.remember(`lootWindow:${messageSummary(message)}`, true);
    });
    room.onMessage("lootResult", (message: unknown) => this.remember(`lootResult:${messageSummary(message)}`, true));
    room.onMessage("closeLootWindow", (message: unknown) => {
      const npcId = cleanText(asRecord(message).npcId, 128);
      if (!npcId || this.openLootWindow?.npcId === npcId) this.openLootWindow = null;
      this.remember(`closeLoot:${messageSummary(message)}`);
    });
    room.onMessage("potionShopPurchaseResult", (message: unknown) => this.remember(`potionShop:${messageSummary(message)}`, true));
    room.onMessage("trashVendorSellResult", (message: unknown) => this.remember(`trashVendor:${messageSummary(message)}`, true));
    room.onMessage("fishingResult", (message: unknown) => this.remember(`fishing:${messageSummary(message)}`, true));
    room.onMessage("fishingSupplyPurchaseResult", (message: unknown) => this.remember(`fishingSupply:${messageSummary(message)}`, true));
    room.onMessage("fishingVendorSellResult", (message: unknown) => this.remember(`fishingVendor:${messageSummary(message)}`, true));
    room.onMessage("questOffer", (message: unknown) => this.rememberQuestMessage("offer", message));
    room.onMessage("questStatus", (message: unknown) => this.rememberQuestMessage("status", message));
    room.onMessage("questTurnIn", (message: unknown) => this.rememberQuestMessage("turnIn", message));
    room.onMessage("questCompleted", (message: unknown) => this.rememberQuestMessage("completed", message));
    room.onMessage("persistenceStatus", (message: unknown) => this.remember(`persistence:${messageSummary(message)}`, true));
    room.onMessage("traitUpdateResult", (message: unknown) => this.remember(`traitUpdate:${messageSummary(message)}`, true));
    room.onMessage("sessionReplaced", () => {
      this.remember("sessionReplaced", true);
      void this.reconnect();
    });
    room.onLeave(() => {
      if (!this.stopping) void this.reconnect();
    });
  }

  private async reconnect() {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    this.room = null;
    await delay(1500);
    try {
      await this.connect();
    } catch (error) {
      this.lastError = errorMessage(error);
      await delay(5000);
    } finally {
      this.reconnecting = false;
    }
  }

  observe(view = "full") {
    const self = this.self();
    if (!self) {
      return {
        ok: false,
        bridgeSessionId: this.id,
        status: this.room ? "waiting_for_state" : "disconnected",
        actionSchema: DECISION_SCHEMA,
        availableActions: DECISION_ACTIONS,
        recentMessages: this.recentMessages.slice(-20),
        lastActionReport: this.lastActionReport,
        lastAction: this.lastAction,
        lastError: this.lastError,
      };
    }

    const now = Date.now();
    this.observeCombatMemory(self, now);
    const refs = new Map<string, string>();
    const visibleNpcs = [...this.npcs.values()]
      .map((npc) => ({ npc, distance: distance2d(self, npc) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 48)
      .map(({ npc, distance }, index) => {
        const ref = `npc${index + 1}`;
        refs.set(ref, npc.id);
        refs.set(npc.id.toLowerCase(), npc.id);
        refs.set(npc.name.toLowerCase(), npc.id);
        const alive = npc.health > 0 && npc.defeatedAt <= 0;
        return {
          ref,
          id: npc.id,
          name: npc.name,
          role: npc.role,
          model: npc.model,
          alive,
          attackable: isAttackable(npc),
          hostile: isHostile(npc),
          health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
          distance: round(distance),
          dist: round(distance),
          position: point(npc),
          dialogue: npc.dialogue,
          questIdHint: npc.questId,
          hasLoot: npc.hasLoot,
          lootItems: this.describeLootItems(npc),
          aggroTarget: npc.aggroTargetId === self.sessionId ? "you" : npc.aggroTargetId ? "someone" : "",
          nearbyHostileCount: this.nearbyHostileCount(npc, 8, npc.id),
          nearbyDangerousHostileCount: this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc),
          pullRisk: this.describePullRisk(npc),
          pullRiskScore: this.scorePullRisk(npc),
          approachRisk: this.describeApproachRisk(self, npc),
          approachRiskScore: this.scoreApproachRisk(self, npc),
          threatLevel: this.scoreThreatLevel(self, npc),
          avoidance: this.describeNpcAvoidance(npc, now),
        };
      });

    const playerRefs = new Map<string, string>();
    const visiblePlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => ({ player, distance: distance2d(self, player) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 16)
      .map(({ player, distance }, index) => {
        const ref = `player${index + 1}`;
        playerRefs.set(ref, player.sessionId);
        playerRefs.set(player.sessionId.toLowerCase(), player.sessionId);
        playerRefs.set(player.name.toLowerCase(), player.sessionId);
        return {
          ref,
          sessionId: player.sessionId,
          name: player.name,
          identityType: player.identityType,
          isAgent: player.isAgent,
          health: `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}`,
          mana: `${Math.ceil(player.mana)}/${Math.ceil(player.maxMana)}`,
          distance: round(distance),
          position: point(player),
          animation: player.animation,
          agentStatus: player.isAgent ? {
            action: player.agentStatusAction,
            thought: player.agentStatusThought,
            objective: player.agentStatusObjective,
            quest: player.agentStatusQuest,
            updatedAgoMs: player.agentStatusUpdatedAt ? Math.max(0, now - player.agentStatusUpdatedAt) : null,
          } : null,
        };
      });

    this.lastNpcRefs = refs;
    this.lastPlayerRefs = playerRefs;

    const catalog = buildAgentCatalog();
    const quests = self.quests.map((quest) => {
      const questId = getString(quest.id);
      const memory = this.questMemory.get(questId);
      const metadata = asRecord(asRecord(catalog.quests)[questId]);
      return {
        id: questId,
        status: getString(quest.status),
        progress: getNumber(quest.progress),
        required: getNumber(quest.required),
        progressLabel: `${getNumber(quest.progress)}/${getNumber(quest.required)}`,
        flags: getString(quest.flags),
        objectives: this.describeQuestObjectives(questId, quest),
        title: memory?.title || getString(metadata.title),
        objective: memory?.objectiveLabel || getString(metadata.objectiveLabel),
        turnInNpcId: memory?.turnInNpcId || getString(metadata.turnInNpcId),
        turnInNpcName: memory?.turnInNpcName || "",
        lastKnownText: memory?.text || "",
        nextQuestId: memory?.nextQuestId || getString(metadata.nextQuestId),
      };
    });
    const questOffers = this.describeQuestOffers();
    const availableQuestHints = this.describeAvailableQuestHints(self);
    const lootableCorpses = this.describeLootableCorpses(self);
    const activeCommand = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    const defaultPlanningOptions: DecisionPlanningOptions = activeCommand?.status === "running"
      ? {
        skipOptionalBossDailies: this.shouldSkipOptionalBossDailies(activeCommand),
        profile: activeCommand.profile,
        deathCount: activeCommand.deathCount,
        focusedQuestId: activeCommand.questId,
      }
      : { skipOptionalBossDailies: true };
    const hints = this.buildDecisionHints(self, availableQuestHints, lootableCorpses, defaultPlanningOptions);

    const body = {
      ok: true,
      bridgeSessionId: this.id,
      status: this.room ? "connected" : "disconnected",
      roomSessionId: this.room?.sessionId ?? "",
      actionSchema: DECISION_SCHEMA,
      availableActions: DECISION_ACTIONS,
      actionAliases: {
        npcId: "npcRef",
        abilityId: "actionId",
        routeId: "text",
        tokenId: "text for register_chain_gear",
      },
      walletActions: this.buildWalletActionGuide(),
      objective: this.objective,
      wallet: {
        address: this.walletAddress,
        agentClient: true,
        mferGptTokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
        mferGptBurnAddress: BASE_BURN_ADDRESS,
        mferGptPaymentChainId: BASE_CHAIN_ID,
        mferGptSwapRouterAddress: BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
        recommendedSwapEthAmount: DEFAULT_SWAP_ETH_AMOUNT,
        bridgeCanSignWalletTransactions: false,
        note: "Bankr signs swaps, burns, and mints in its own wallet context, then passes payment proof fields to the bridge for normal room actions.",
      },
      questStateGuide: {
        currentAcceptedQuests: "self.quests is the authoritative accepted quest log. It includes active, ready, and completed quests.",
        offers: "Unaccepted quest offers are event messages, not persistent room state. Interact with a quest NPC to receive questOffer; availableQuestHints is derived from catalog + self.quests + visible NPCs.",
        acceptQuest: "accept_quest does not require a prior interact_npc on the server. If /agent-action returns moving_to_quest_giver, poll observe and repeat once close.",
      },
      self: {
        sessionId: self.sessionId,
        name: self.name,
        level: self.level,
        xp: self.xp,
        levelProgress: getLevelProgress(self.xp),
        health: Math.ceil(self.health),
        maxHealth: Math.ceil(self.maxHealth),
        mana: Math.ceil(self.mana),
        maxMana: Math.ceil(self.maxMana),
        position: point(self),
        yaw: round(self.yaw),
        animation: self.animation,
        castingAction: self.castingAction,
        talentPoints: self.talentPoints,
        skillPoints: self.talentPoints,
        unspentSkillPoints: self.talentPoints,
        spendableTalents: this.describeSpendableTalents(self),
        recommendedTalentSpends: this.describeRecommendedTalentSpends(self),
        stats: {
          maxHealth: round(self.maxHealth),
          maxMana: round(self.maxMana),
          healthRegenPer5: round(self.healthRegenPer5),
          manaRegenPer5: round(self.manaRegenPer5),
          walkSpeed: round(self.walkSpeed),
          runSpeed: round(self.runSpeed),
          strength: round(self.strength),
          dexterity: round(self.dexterity),
          magic: round(self.magic),
        },
        aggroCount: this.getAttackers(self).length,
        nearbyHostileCount: this.nearbyHostileCount(self, 10),
        nearbyDangerousHostileCount: this.nearbyDangerousHostileCount(self, 14),
        combatMath: this.describeCombatMath(self),
        quests,
        inventory: this.describeInventory(self),
        equipment: this.describeEquipment(self),
        talents: self.talents,
        activeBuffs: self.activeBuffs,
        combatActions: COMBAT_ACTION_IDS.map((actionId) => {
          const action = COMBAT.actions[actionId];
          return {
            actionId,
            unlocked: this.isActionUnlocked(self, actionId),
            ready: this.canUse(self, actionId),
            manaCost: action.manaCost,
            minRange: action.minRange,
            maxRange: action.maxRange,
            cooldownMs: action.cooldownMs,
            castTimeMs: action.castTimeMs,
            requiresStationary: action.requiresStationary,
          };
        }),
      },
      questOffers,
      availableQuestHints,
      hints,
      nearbyNpcs: visibleNpcs,
      nearbyPlayers: visiblePlayers,
      publicMap: {
        landmarks: PUBLIC_LANDMARKS,
        routes: Object.keys(PUBLIC_ROUTES),
        routeDetails: PUBLIC_ROUTES,
      },
      catalog,
      questMemory: [...this.questMemory.values()].sort((a, b) => b.observedAt - a.observedAt).slice(0, 20),
      movementTrouble: this.describeMovementTrouble(now),
      combatMemory: this.describeCombatMemory(now, self),
      lootableCorpses,
      social: this.buildSocialObservation(now),
      recentMessages: this.recentMessages.slice(-25),
      lastActionReport: this.lastActionReport,
      suggestedNextAction: this.buildSuggestedNextAction(self, defaultPlanningOptions),
      lastDecision: this.lastDecision,
      lastAction: this.lastAction,
      lastError: this.lastError,
      timestamps: {
        startedAt: new Date(this.startedAt).toISOString(),
        lastObservedAt: this.lastObservedAt ? new Date(this.lastObservedAt).toISOString() : "",
        lastActionAt: this.lastActionAt ? new Date(this.lastActionAt).toISOString() : "",
      },
    };
    return view === "bankr" || view === "compact" ? this.compactBankrObservation(body) : body;
  }

  async execute(rawDecision: unknown): Promise<BridgeActionResult> {
    const self = this.self();
    if (!self) return { ok: false, status: "waiting_for_state", error: "bridge has not received player state yet" };
    const decision = normalizeDecision(rawDecision);
    const before = this.snapshotPlayer(self);
    this.lastDecision = decision;
    this.lastActionAt = Date.now();
    this.lastError = "";
    try {
      const immediateResult = await this.executeDecision(self, decision);
      this.maybeAnnounceNextAction(self, decision);
      this.publishAgentStatus(self, true);
      if (immediateResult && immediateResult.ok === false) {
        const report = this.buildActionReport(decision, before, {
          status: immediateResult.status || "blocked",
          stoppedBecause: immediateResult.status || immediateResult.error || "blocked",
          durationMs: 0,
        });
        this.lastActionReport = report;
        this.recordCombatMemoryFromReport(decision, before, report);
        return this.withActionReport(immediateResult, report);
      }
      const outcome = await this.waitForDurableAction(decision, before);
      const report = this.buildActionReport(decision, before, outcome);
      this.lastActionReport = report;
      this.recordCombatMemoryFromReport(decision, before, report);
      return this.withActionReport({
        ok: true,
        status: outcome.status,
        bridgeSessionId: this.id,
        lastAction: this.lastAction,
        durationMs: outcome.durationMs,
      }, report);
    } catch (error) {
      this.lastError = errorMessage(error);
      const report = this.buildActionReport(decision, before, {
        status: "rejected",
        stoppedBecause: this.lastError,
        durationMs: Math.max(0, Date.now() - this.lastActionAt),
      });
      this.lastActionReport = report;
      this.recordCombatMemoryFromReport(decision, before, report);
      return {
        ok: false,
        status: "rejected",
        bridgeSessionId: this.id,
        lastAction: this.lastAction,
        error: this.lastError,
        report,
        summary: report.summary,
        stoppedBecause: report.stoppedBecause,
        suggestedNextAction: report.suggestedNextAction,
        continuePrompt: report.continuePrompt,
        durationMs: report.durationMs,
      };
    }
  }

  async startCommand(rawPayload: AgentCommandPayload) {
    const self = this.self();
    if (!self) throw new BridgeHttpError(409, "bridge has not received player state yet");
    const active = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    if (active?.status === "running") throw new BridgeHttpError(409, "agent command already running for this wallet");

    const payload = normalizeCommandPayload(rawPayload);
    const budget = await this.resolveCommandBudget();
    const reservation = await reserveAgentCommandSeconds(this.walletAddress, budget, payload.maxSeconds);
    if (!reservation.ok) {
      throw new BridgeHttpError(429, describeAgentCommandBudgetExhaustion(budget, reservation.usage), {
        code: "agent_command_budget_exhausted",
        budget,
        usage: reservation.usage,
        upgrade: {
          chain: "Base",
          requiredMferGpt: "25M MFERGPT",
          reason: "Longer autoplay commands and Season 0 agent points require the agent wallet to hold more MFERGPT.",
        },
      });
    }
    const focusedGoalQuestId = payload.questId || payload.goals.find((goal) => goal.questId)?.questId || "";
    if (focusedGoalQuestId) this.focusedQuestId = focusedGoalQuestId;
    const command: AgentCommandState = {
      commandId: randomUUID(),
      kind: payload.kind,
      behaviorScheme: payload.behaviorScheme,
      controller: payload.controller,
      profile: payload.profile,
      goals: payload.goals,
      stopWhen: payload.stopWhen,
      constraints: payload.constraints,
      status: "running",
      stoppedBecause: "",
      startedAt: Date.now(),
      finishedAt: 0,
      requestedMaxSeconds: payload.maxSeconds,
      maxSeconds: reservation.seconds,
      budget,
      usage: reservation.usage,
      questId: payload.questId,
      itemId: payload.itemId,
      targetCount: payload.targetCount,
      deathCount: 0,
      safetyStopCount: 0,
      abortRequested: false,
      usageFinalized: false,
      startSnapshot: this.snapshotPlayer(self),
      lastSnapshot: this.snapshotPlayer(self),
      reports: [],
      errors: [],
      social: { players: new Map(), chat: [] },
      combat: createCommandCombatStats(),
    };
    this.commands.set(command.commandId, command);
    this.activeCommandId = command.commandId;
    this.rememberCommandPlayers(command, self, command.startedAt);
    this.lastAction = `command_start ${command.kind}`;
    void this.runCommand(command);
    return this.serializeCommand(command);
  }

  getCommand(commandId: string) {
    const command = this.commands.get(cleanText(commandId, 80));
    if (!command) throw new BridgeHttpError(404, "agent command not found");
    return this.serializeCommand(command);
  }

  async stopCommand(commandId: string) {
    const command = this.commands.get(cleanText(commandId, 80));
    if (!command) throw new BridgeHttpError(404, "agent command not found");
    if (command.status === "running") {
      command.abortRequested = true;
      await this.finishCommand(command, "stopped", "manual_stop");
    }
    return this.serializeCommand(command);
  }

  private async resolveCommandBudget(): Promise<AgentCommandBudget> {
    const localOverride = getLocalAgentCommandBudgetOverride();
    if (localOverride) return localOverride;
    try {
      const gate = await getAgentSeason0MferGptGateStatus(this.walletAddress);
      return getAgentCommandBudget(gate.balanceWei);
    } catch {
      return getAgentCommandBudget("0");
    }
  }

  private async runCommand(command: AgentCommandState) {
    while (command.status === "running") {
      const elapsedMs = Date.now() - command.startedAt;
      if (command.abortRequested) {
        await this.finishCommand(command, "stopped", "manual_stop");
        break;
      }
      if (elapsedMs >= command.maxSeconds * 1000) {
        await this.finishCommand(command, "time_limit", "command_time_limit");
        break;
      }

      const self = this.self();
      if (!self) {
        command.errors.push("state_unavailable");
        await delay(1000);
        continue;
      }
      if (command.constraints.maxDeaths === 0 && self.health <= 0) {
        await this.finishCommand(command, "safety_stop", "constraint_max_deaths");
        break;
      }
      command.lastSnapshot = this.snapshotPlayer(self);
      this.rememberCommandPlayers(command, self, Date.now());
      const stop = this.checkCommandCompletion(command, self);
      if (stop) {
        await this.finishCommand(command, "completed", stop);
        break;
      }

      const decision = this.chooseCommandDecision(command, self);
      try {
        const result = await this.execute(decision);
        if (result.report) command.reports = [...command.reports.slice(-19), result.report];
        const status = result.status || "";
        if (!result.ok && status === "chat_cooldown") {
          await delay(Math.min(DEFAULT_CHAT_COOLDOWN_MS, Math.max(350, result.retryAfterMs ?? 1000)));
          continue;
        }
        if (!result.ok && status === "payment_required") {
          await this.finishCommand(command, "payment_required", "payment_required");
          break;
        }
        if (!result.ok && status === "wallet_action_required") {
          await this.finishCommand(command, "wallet_action_required", "wallet_action_required");
          break;
        }
        if (status === "safety_stop" || result.stoppedBecause?.startsWith("retreat_")) {
          command.safetyStopCount += 1;
          if (isCommandFailureCapReached(command.constraints.maxSafetyStops, command.safetyStopCount)) {
            await this.finishCommand(command, "safety_stop", "constraint_max_safety_stops");
            break;
          }
          await delay(1200);
          continue;
        }
        if (result.stoppedBecause === "dead") {
          command.deathCount += 1;
          if (isCommandFailureCapReached(command.constraints.maxDeaths, command.deathCount)) {
            await this.finishCommand(command, "safety_stop", "constraint_max_deaths");
            break;
          }
        }
      } catch (error) {
        const message = errorMessage(error);
        command.errors.push(message);
        if (command.errors.length >= 3) {
          await this.finishCommand(command, "failed", message);
          break;
        }
      }
      await delay(350);
    }
  }

  private chooseCommandDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision {
    const survivalDecision = this.chooseSurvivalDecision(command, self);
    if (survivalDecision && !this.decisionBlockedByConstraints(command, survivalDecision)) return survivalDecision;

    const goalDecision = this.chooseGoalDecision(command, self);
    if (goalDecision && !this.decisionBlockedByConstraints(command, goalDecision)) return goalDecision;

    const profileDecision = this.chooseProfileDecision(command, self);
    if (profileDecision && !this.decisionBlockedByConstraints(command, profileDecision)) return profileDecision;

    const suggested = this.buildSuggestedNextAction(self, {
      skipOptionalBossDailies: this.shouldSkipOptionalBossDailies(command),
      profile: command.profile,
      deathCount: command.deathCount,
      focusedQuestId: command.questId,
    });
    if (suggested) {
      const decision = normalizeDecision({
        ...suggested,
        reason: `${command.kind}/${command.profile.priority}/${command.profile.risk}: ${suggested.reason}`,
      });
      if (this.decisionHasRequiredTarget(decision) && !this.decisionBlockedByConstraints(command, decision)) return decision;
    }
    return normalizeDecision({
      action: "wait",
      reason: `${command.kind}/${command.profile.priority}/${command.profile.risk}: waiting for a safe actionable game state`,
    });
  }

  private chooseSurvivalDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision | null {
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (self.health <= 0) return normalizeDecision({ action: "respawn", reason: `${command.kind}/${command.profile.priority}: respawning before continuing` });
    const attackers = this.getAttackers(self);
    const groupQuestId = this.commandGroupEncounterQuestId(command);
    const groupQuestActive = Boolean(groupQuestId && this.hasQuestStatus(self, groupQuestId, ["active"]));
    const fightingGroupEncounter = Boolean(
      groupQuestActive
      && attackers.some((npc) => this.groupEncounterQuestForNpc(npc) === groupQuestId),
    );
    const groupEncounterAttacker = fightingGroupEncounter && groupQuestId
      ? this.groupEncounterPressureAttacker(self, groupQuestId, attackers)
      : null;
    const recentlyUsedRecoveryItem = this.lastAction.startsWith("use_item")
      && Date.now() - this.lastActionAt < 5_000;

    if (
      groupEncounterAttacker
      && (
        healthRatio <= CRITICAL_HEALTH_RATIO
        || (attackers.length >= 2 && healthRatio <= GROUP_ENCOUNTER_REPOSITION_HEALTH_RATIO)
      )
    ) {
      const pressureDistance = distance2d(self, groupEncounterAttacker);
      if (pressureDistance <= COMBAT.actions.frostNova.maxRange && this.canUse(self, "frostNova")) {
        return normalizeDecision({
          action: "use_ability",
          actionId: "frostNova",
          reason: `${command.kind}/${command.profile.priority}: controlling ${groupEncounterAttacker.name || groupEncounterAttacker.id} to break a group-boss overpull`,
          questId: groupQuestId,
        });
      }
      const destination = this.groupEncounterRecoveryPoint(self, groupEncounterAttacker, healthRatio);
      return normalizeDecision({
        action: "move_to",
        reason: `${command.kind}/${command.profile.priority}: breaking a group-boss overpull before spending more recovery items`,
        questId: groupQuestId,
        x: destination.x,
        z: destination.z,
      });
    }

    if (
      attackers.length > 0
      && recentlyUsedRecoveryItem
      && healthRatio <= (fightingGroupEncounter ? GROUP_ENCOUNTER_REPOSITION_HEALTH_RATIO : 0.56)
    ) {
      const destination = groupEncounterAttacker
        ? this.groupEncounterRecoveryPoint(self, groupEncounterAttacker, healthRatio)
        : this.retreatDestination(self);
      return normalizeDecision({
        action: "move_to",
        reason: `${command.kind}/${command.profile.priority}: creating space after a recovery item under pressure`,
        questId: groupQuestId,
        x: destination.x,
        z: destination.z,
      });
    }

    if (!recentlyUsedRecoveryItem && attackers.length > 0 && healthRatio <= (fightingGroupEncounter ? GROUP_ENCOUNTER_CONSUMABLE_HEALTH_RATIO : 0.56) && inventoryCount(self, "red-juice") > 0) {
      return normalizeDecision({
        action: "use_item",
        itemId: "red-juice",
        reason: `${command.kind}/${command.profile.priority}: using red juice before retreating under pressure`,
        questId: groupQuestId,
      });
    }

    if (!recentlyUsedRecoveryItem && attackers.length > 0 && healthRatio <= (fightingGroupEncounter ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.46) && inventoryCount(self, "field-snack") > 0) {
      return normalizeDecision({
        action: "use_item",
        itemId: "field-snack",
        reason: `${command.kind}/${command.profile.priority}: using field snack before retreating under pressure`,
        questId: groupQuestId,
      });
    }

    if (
      attackers.length > 0
      && !recentlyUsedRecoveryItem
      && healthRatio <= (fightingGroupEncounter ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.68)
      && self.mana < COMBAT.actions.heal.manaCost
      && inventoryCount(self, "blue-juice") > 0
    ) {
      return normalizeDecision({
        action: "use_item",
        itemId: "blue-juice",
        reason: `${command.kind}/${command.profile.priority}: restoring mana for emergency healing under pressure`,
        questId: groupQuestId,
      });
    }

    if (groupEncounterAttacker && this.shouldCreateSpaceBeforeGroupEncounterHeal(self, groupEncounterAttacker, healthRatio)) {
      const pressureDistance = distance2d(self, groupEncounterAttacker);
      if (pressureDistance <= COMBAT.actions.frostNova.maxRange && this.canUse(self, "frostNova")) {
        return normalizeDecision({
          action: "use_ability",
          actionId: "frostNova",
          reason: `${command.kind}/${command.profile.priority}: controlling ${groupEncounterAttacker.name || groupEncounterAttacker.id} before a stationary group-boss heal`,
          questId: groupQuestId,
        });
      }
      const destination = this.groupEncounterRecoveryPoint(self, groupEncounterAttacker, healthRatio);
      return normalizeDecision({
        action: "move_to",
        reason: `${command.kind}/${command.profile.priority}: creating space from ${groupEncounterAttacker.name || groupEncounterAttacker.id} before a stationary group-boss heal`,
        questId: groupQuestId,
        x: destination.x,
        z: destination.z,
      });
    }

    if (fightingGroupEncounter && healthRatio < GROUP_ENCOUNTER_SELF_HEAL_RATIO && this.canUse(self, "heal")) {
      return normalizeDecision({
        action: "use_ability",
        actionId: "heal",
        reason: `${command.kind}/${command.profile.priority}: healing early during ${groupQuestId}`,
        questId: groupQuestId,
      });
    }

    if (command.profile.role === "healer" && healthRatio < 0.82 && this.canUse(self, "heal")) {
      return normalizeDecision({
        action: "use_ability",
        actionId: "heal",
        reason: `${command.kind}/healer: healing self before continuing`,
      });
    }

    const activeGroupObjective = groupQuestActive ? this.findActiveGroupObjectiveNpc(self, groupQuestId) : null;
    const activeGroupAddDecision = groupQuestActive
      && activeGroupObjective
      && healthRatio >= GROUP_ENCOUNTER_REPOSITION_HEALTH_RATIO
      && distance2d(self, activeGroupObjective) <= GROUP_ENCOUNTER_READY_RADIUS
      ? this.chooseGroupEncounterPrepDecision(
        self,
        groupQuestId,
        activeGroupObjective,
        `${command.kind}/${command.profile.priority}: active group fight has aggroed adds`,
        activeGroupObjective.id,
        {
          allowDuringObjectiveCombat: true,
          ignoreAttemptCooldown: true,
          includeExplicitPrep: false,
          includeAggroAdds: true,
          markAttempt: false,
        },
      )
      : null;
    if (activeGroupAddDecision) return activeGroupAddDecision;

    const groupAllyHealDecision = groupQuestActive && this.canUseGroupAllyHealProfile(command.profile)
      ? this.chooseGroupAllyHealDecision(command, self, groupQuestId, attackers)
      : null;
    if (groupAllyHealDecision) return groupAllyHealDecision;

    if (groupQuestActive && attackers.length === 0 && healthRatio < GROUP_ENCOUNTER_READY_HEALTH_RATIO) {
      if (self.mana < COMBAT.actions.heal.manaCost && inventoryCount(self, "blue-juice") > 0) {
        return normalizeDecision({
          action: "use_item",
          itemId: "blue-juice",
          reason: `${command.kind}/${command.profile.priority}: restoring mana to reach group-ready health for ${groupQuestId}`,
          questId: groupQuestId,
        });
      }
      if (this.canUse(self, "heal")) {
        return normalizeDecision({
          action: "use_ability",
          actionId: "heal",
          reason: `${command.kind}/${command.profile.priority}: healing to group-ready health for ${groupQuestId}`,
          questId: groupQuestId,
        });
      }
    }

    if ((attackers.length > 0 || Date.now() < this.retreatUntil) && healthRatio < RECOVER_HEALTH_RATIO && this.canUse(self, "heal")) {
      return normalizeDecision({
        action: "use_ability",
        actionId: "heal",
        reason: `${command.kind}/${command.profile.priority}: healing self before retreating under pressure`,
      });
    }

    if (Date.now() < this.retreatUntil) {
      const destination = this.targetPoint && distance2d(self, this.targetPoint) > 2.6
        ? this.targetPoint
        : attackers.length > 0
          ? this.retreatDestination(self)
          : null;
      if (destination) {
        return normalizeDecision({
          action: "move_to",
          reason: `${command.kind}/${command.profile.priority}: finishing retreat before re-engaging`,
          x: destination.x,
          z: destination.z,
        });
      }
      if (healthRatio < RECOVER_HEALTH_RATIO || attackers.length === 0) {
        return normalizeDecision({
          action: "wait",
          reason: `${command.kind}/${command.profile.priority}: recovering after retreat`,
        });
      }
    }

    if (command.profile.risk === "safe" && healthRatio < 0.9) {
      if (attackers.length > 0) {
        const pressableAttacker = this.findPressableAttacker(self, attackers);
        if (pressableAttacker) {
          return normalizeDecision({
            action: "fight_npc",
            reason: `${command.kind}/safe: clearing ${pressableAttacker.name || pressableAttacker.id} because the fight is safer than dragging aggro`,
            npcRef: pressableAttacker.id,
          });
        }
        const destination = this.retreatDestination(self);
        return normalizeDecision({
          action: "move_to",
          reason: `${command.kind}/safe: retreating to recover before risking the command`,
          x: destination.x,
          z: destination.z,
        });
      }
      if (healthRatio < RECOVER_HEALTH_RATIO) {
        return normalizeDecision({
          action: "wait",
          reason: `${command.kind}/safe: recovering to a safer health buffer`,
        });
      }
    }

    return null;
  }

  private chooseGroupAllyHealDecision(command: AgentCommandState, self: RuntimePlayer, questId: string, attackers: RuntimeNpc[]) {
    const selfHealthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (selfHealthRatio < PRESS_SINGLE_ATTACKER_HEALTH_RATIO) return null;
    const heal = COMBAT.actions.heal;
    const ally = this.findGroupAllyNeedingHeal(self, GROUP_ENCOUNTER_ALLY_HEAL_RATIO, GROUP_ENCOUNTER_READY_RADIUS * 1.8);
    if (!ally) return null;
    const activeGroupObjective = this.findActiveGroupObjectiveNpc(self, questId);
    const activeGroupFight = Boolean(
      activeGroupObjective
      && this.hasRecentNpcPlayerCombat(activeGroupObjective.id, GROUP_ENCOUNTER_PREP_SKIP_AFTER_PULL_MS),
    );
    const canSafelyMoveToAlly = attackers.length === 0 && selfHealthRatio >= RECOVER_HEALTH_RATIO && !activeGroupFight;

    if (self.mana < heal.manaCost && ally.distance <= heal.maxRange + 3 && inventoryCount(self, "blue-juice") > 0) {
      return normalizeDecision({
        action: "use_item",
        itemId: "blue-juice",
        reason: `${command.kind}/${command.profile.priority}: restoring mana to heal ${ally.player.name || "ally"} during ${questId}`,
        questId,
      });
    }
    if (ally.distance <= heal.maxRange && this.canUse(self, "heal")) {
      return normalizeDecision({
        action: "use_ability",
        actionId: "heal",
        playerRef: ally.player.sessionId,
        reason: `${command.kind}/${command.profile.priority}: healing ${ally.player.name || "ally"} during ${questId}`,
        questId,
      });
    }
    if (canSafelyMoveToAlly) {
      return normalizeDecision({
        action: "move_near_player",
        playerRef: ally.player.sessionId,
        reason: `${command.kind}/${command.profile.priority}: moving into heal range for ${ally.player.name || "ally"} during ${questId}`,
        questId,
      });
    }
    return null;
  }

  private canUseGroupAllyHealProfile(profile: AgentCommandProfile) {
    return profile.role === "healer" || profile.role === "support" || profile.spec === "utility_support";
  }

  private findGroupAllyNeedingHeal(self: RuntimePlayer, maxHealthRatio: number, maxDistance: number) {
    return [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => {
        const health = getNumber(player.health);
        const maxHealth = getNumber(player.maxHealth);
        return {
          player,
          distance: distance2d(self, player),
          healthRatio: maxHealth > 0 ? health / maxHealth : 1,
        };
      })
      .filter((entry) => (
        entry.healthRatio > 0
        && entry.healthRatio <= maxHealthRatio
        && entry.distance <= maxDistance
        && this.playerHasActiveNpcAggro(entry.player)
      ))
      .sort((a, b) => a.healthRatio - b.healthRatio || a.distance - b.distance)[0] ?? null;
  }

  private commandGroupEncounterQuestId(command: AgentCommandState) {
    const questIds = uniqueStrings([
      command.questId,
      ...command.goals.map((goal) => goal.questId),
    ]);
    return questIds.find((questId) => this.isGroupEncounterQuest(questId)) || "";
  }

  private activeGroupCommandQuestId() {
    const command = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    if (command?.status === "running") {
      const commandQuestId = this.commandGroupEncounterQuestId(command);
      if (commandQuestId) return commandQuestId;
    }
    return this.isGroupEncounterQuest(this.focusedQuestId) ? this.focusedQuestId : "";
  }

  private chooseGoalDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision | null {
    if (command.kind === "finish_quest" && command.questId) {
      return this.chooseQuestGoalDecision(self, command.questId, "quest_completed", command);
    }
    if (command.kind !== "run_goals") return null;

    const progress = this.describeCommandGoalProgress(command, self);
    const pending = progress.find((goal) => !goal.satisfied);
    if (!pending) return null;

    switch (pending.type) {
      case "quest_completed":
      case "quest_ready":
      case "quest_accepted":
        return this.chooseQuestGoalDecision(self, pending.questId, pending.type, command);
      case "inventory_at_least": {
        const loot = this.describeLootableCorpses(self).find((corpse) => {
          const npc = this.npcs.get(getString(corpse.npcId));
          return npc ? this.describeLootItems(npc).some((item) => item.itemId === pending.itemId) : false;
        });
        if (loot) {
          return normalizeDecision({
            action: "loot",
            reason: `${command.kind}/goal: looting ${pending.itemId} for inventory goal`,
            npcRef: getString(loot.npcId) || getString(loot.id),
          });
        }
        const target = this.findGenericQuestTarget(self)?.npc ?? this.findSafeTrainingTarget(self);
        if (target) {
          return normalizeDecision({
            action: "fight_npc",
            reason: `${command.kind}/goal: fighting likely loot source while working toward ${pending.itemId}`,
            npcRef: target.id,
          });
        }
        return null;
      }
      case "level_at_least":
      case "xp_gained": {
        const questTarget = this.findNamedObjectiveTarget(self) ?? this.findGenericQuestTarget(self);
        const target = questTarget?.npc ?? this.findSafeTrainingTarget(self);
        return target ? normalizeDecision({
          action: "fight_npc",
          reason: `${command.kind}/goal: earning xp toward ${pending.type}`,
          questId: questTarget?.questId,
          npcRef: target.id,
        }) : null;
      }
      case "survive_seconds":
        return normalizeDecision({
          action: "wait",
          reason: `${command.kind}/goal: staying alive for ${pending.required} seconds`,
        });
      case "arrive_at_landmark": {
        const landmark = PUBLIC_LANDMARKS[pending.landmarkId];
        return landmark ? normalizeDecision({
          action: "move_to",
          reason: `${command.kind}/goal: moving to landmark ${pending.landmarkId}`,
          x: landmark.x,
          z: landmark.z,
        }) : null;
      }
      case "near_player_count": {
        const nearest = [...this.players.values()]
          .filter((player) => player.sessionId !== self.sessionId)
          .sort((a, b) => distance2d(self, a) - distance2d(self, b))[0];
        return nearest ? normalizeDecision({
          action: "move_near_player",
          reason: `${command.kind}/goal: grouping near visible players`,
          playerRef: nearest.name || nearest.sessionId,
        }) : normalizeDecision({
          action: "wait",
          reason: `${command.kind}/goal: waiting for visible players to group with`,
        });
      }
    }
    return null;
  }

  private chooseQuestGoalDecision(
    self: RuntimePlayer,
    questId: string,
    goalType: AgentCommandGoalType,
    command?: Pick<AgentCommandState, "profile" | "deathCount">,
  ): AgentBridgeDecision | null {
    const quest = self.quests.find((entry) => getString(entry.id) === questId);
    const status = getString(quest?.status);
    const turnInNpc = this.resolveQuestTurnInNpc(questId);
    if ((status === "ready" || status === "completed") && goalType === "quest_completed" && turnInNpc) {
      const dailyReturnDecision = this.chooseDailyBossReturnDecision(self, questId, turnInNpc);
      if (dailyReturnDecision) return dailyReturnDecision;
      const routeDecision = this.chooseRouteToNpcAreaDecision(self, turnInNpc, `${questId} is ready for turn-in`, questId);
      if (routeDecision) return routeDecision;
      return normalizeDecision({
        action: "complete_quest",
        reason: `${questId} is ready for the structured quest goal`,
        questId,
        npcRef: turnInNpc.id,
      });
    }
    if ((status === "active" || status === "ready" || status === "completed") && goalType === "quest_accepted") {
      return normalizeDecision({ action: "wait", reason: `${questId} is already accepted` });
    }
    const targetQuestAccepted = status === "active" || status === "ready" || status === "completed";
    if (!targetQuestAccepted) {
      const prerequisiteQuestId = this.findIncompleteRequiredQuestId(self, questId);
      if (prerequisiteQuestId) {
        return this.chooseQuestGoalDecision(self, prerequisiteQuestId, "quest_completed", command);
      }
    }
    if (status === "active") {
      const immediateDecision = this.chooseImmediateQuestGoalDecision(self, questId);
      if (immediateDecision) return immediateDecision;
      const utilityDecision = this.chooseActiveUtilityQuestDecision(self, questId);
      if (utilityDecision) return utilityDecision;
    }
    if (!targetQuestAccepted) {
      const offer = this.describeAvailableQuestHints(self).find((hint) => getString(hint.questId) === questId);
      if (offer) {
        const npc = this.resolveNpc(getString(offer.npcId));
        const routeDecision = this.chooseRouteToNpcAreaDecision(self, npc, `${questId} is available`, questId);
        if (routeDecision) return routeDecision;
        return normalizeDecision({
          action: "accept_quest",
          reason: `${questId} is the structured quest goal and is available`,
          questId,
          npcRef: getString(offer.npcId),
        });
      }
    }
    if (status === "active" || status === "ready") {
      const namedTarget = this.findNamedObjectiveTarget(self, questId);
      if (namedTarget) {
        const namedReason = `${namedTarget.npc.name} is an unfinished named objective for ${questId}`;
        const groupDecision = this.chooseGroupEncounterDecision(
          self,
          questId,
          namedTarget.npc,
          namedReason,
          command?.profile,
          command?.deathCount ?? 0,
          namedTarget.npc.id,
        );
        if (groupDecision) return groupDecision;
        const dailyBossDecision = this.chooseDailyBossRunnerDecision(
          self,
          questId,
          namedTarget.npc,
          `${namedTarget.npc.name} is an unfinished named objective for ${questId}`,
        );
        if (dailyBossDecision) return dailyBossDecision;
        if (this.hasOpenGroupEncounterPrep(questId, namedTarget.npc, namedTarget.npc.id)) {
          const prepDecision = this.chooseGroupEncounterPrepDecision(
            self,
            questId,
            namedTarget.npc,
            namedReason,
            namedTarget.npc.id,
            { ignoreAttemptCooldown: true },
          );
          if (prepDecision) return prepDecision;
          return normalizeDecision({
            action: "wait",
            reason: `${namedTarget.npc.name} is an unfinished named objective for ${questId}; waiting for group prep targets before pulling`,
            questId,
          });
        }
        const routeDecision = this.chooseRouteToNpcAreaDecision(self, namedTarget.npc, namedReason, questId);
        if (routeDecision) return routeDecision;
        return normalizeDecision({
          action: "fight_npc",
          reason: namedReason,
          questId,
          npcRef: namedTarget.npc.id,
        });
      }
      const questTarget = this.findGenericQuestTarget(self, questId);
      if (questTarget) {
        const targetReason = `${questTarget.npc.name} matches structured quest goal ${questId}`;
        const groupDecision = this.chooseGroupEncounterDecision(
          self,
          questId,
          questTarget.npc,
          targetReason,
          command?.profile,
          command?.deathCount ?? 0,
          questTarget.npc.id,
        );
        if (groupDecision) return groupDecision;
        const dailyBossDecision = this.chooseDailyBossRunnerDecision(
          self,
          questId,
          questTarget.npc,
          `${questTarget.npc.name} matches structured quest goal ${questId}`,
        );
        if (dailyBossDecision) return dailyBossDecision;
        if (this.hasOpenGroupEncounterPrep(questId, questTarget.npc, questTarget.npc.id)) {
          const prepDecision = this.chooseGroupEncounterPrepDecision(
            self,
            questId,
            questTarget.npc,
            targetReason,
            questTarget.npc.id,
            { ignoreAttemptCooldown: true },
          );
          if (prepDecision) return prepDecision;
          return normalizeDecision({
            action: "wait",
            reason: `${questTarget.npc.name} matches structured quest goal ${questId}; waiting for group prep targets before pulling`,
            questId,
          });
        }
        const routeDecision = this.chooseRouteToNpcAreaDecision(self, questTarget.npc, targetReason, questId);
        if (routeDecision) return routeDecision;
        return normalizeDecision({
          action: "fight_npc",
          reason: targetReason,
          questId,
          npcRef: questTarget.npc.id,
        });
      }
      const genericTargetAreaDecision = this.chooseGenericQuestTargetAreaDecision(self, questId, {
        profile: command?.profile,
        deathCount: command?.deathCount ?? 0,
      });
      if (genericTargetAreaDecision) return genericTargetAreaDecision;
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        questId,
        null,
        `${questId} is active and the runner daily boss target is not visible yet`,
      );
      if (dailyBossDecision) return dailyBossDecision;
      const missingObjectiveRoute = this.chooseMissingObjectiveRouteDecision(self, questId, {
        profile: command?.profile,
        deathCount: command?.deathCount ?? 0,
      });
      if (missingObjectiveRoute) return missingObjectiveRoute;
    }
    return null;
  }

  private findIncompleteRequiredQuestId(self: RuntimePlayer, questId: string, seen = new Set<string>()): string {
    return resolveIncompleteRequiredQuestIdForQuests(self.quests, questId, seen);
  }

  private chooseImmediateQuestGoalDecision(self: RuntimePlayer, questId: string): AgentBridgeDecision | null {
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const activeGroupObjective = this.findActiveGroupObjectiveNpc(self, questId);
    const activeGroupObjectiveExtraAttackers = activeGroupObjective
      ? attackers.filter((npc) => npc.id !== activeGroupObjective.id)
      : attackers;
    const activeGroupObjectiveDistance = activeGroupObjective
      ? distance2d(self, activeGroupObjective)
      : Number.POSITIVE_INFINITY;
    if (
      activeGroupObjective
      && this.hasRecentNpcPlayerCombat(activeGroupObjective.id, GROUP_ENCOUNTER_PREP_SKIP_AFTER_PULL_MS)
      && activeGroupObjectiveExtraAttackers.length === 0
      && healthRatio >= GROUP_ENCOUNTER_PRESS_HEALTH_RATIO
      && activeGroupObjectiveDistance <= GROUP_ENCOUNTER_READY_RADIUS
      && this.healthyQuestParticipantCountNear(self, activeGroupObjective, GROUP_ENCOUNTER_READY_RADIUS, questId) >= this.suggestedGroupSize(questId)
    ) {
      return normalizeDecision({
        action: "fight_npc",
        reason: `${questId}: staying on active group objective ${activeGroupObjective.name || activeGroupObjective.id}`,
        questId,
        npcRef: activeGroupObjective.id,
      });
    }
    if (attackers.length > 0) {
      const pressableAttacker = this.findPressableAttacker(self, attackers);
      if (pressableAttacker) {
        return normalizeDecision({
          action: "fight_npc",
          reason: `${questId}: clearing ${pressableAttacker.name || pressableAttacker.id} before waiting or routing`,
          questId,
          npcRef: pressableAttacker.id,
        });
      }
    }

    const loot = this.describeLootableCorpses(self)
      .find((corpse) => getNumber(corpse.distance) <= 18);
    if (loot) {
      return normalizeDecision({
        action: "loot",
        reason: `${questId}: looting ${getString(loot.name) || "nearby corpse"} before continuing`,
        questId,
        npcRef: getString(loot.npcId) || getString(loot.id),
      });
    }

    return null;
  }

  private chooseActiveUtilityQuestDecision(self: RuntimePlayer, preferredQuestId = ""): AgentBridgeDecision | null {
    const activeQuestIds = self.quests
      .filter((quest) => getString(quest.status) === "active")
      .map((quest) => getString(quest.id))
      .filter((questId): questId is QuestId => (QUEST_IDS as readonly string[]).includes(questId));
    if (preferredQuestId && activeQuestIds.includes(preferredQuestId as QuestId)) {
      return this.utilityDecisionForActiveQuest(self, preferredQuestId as QuestId);
    }
    const orderedQuestIds = uniqueStrings([
      preferredQuestId,
      FREE_TRAIT_QUEST_ID,
      "mfergpt-checkin",
      "ask-mfergpt",
      "tweet-town-link",
      ...activeQuestIds,
    ]).filter((questId): questId is QuestId => activeQuestIds.includes(questId as QuestId));

    for (const questId of orderedQuestIds) {
      const decision = this.utilityDecisionForActiveQuest(self, questId);
      if (decision) return decision;
    }
    return null;
  }

  private utilityDecisionForActiveQuest(self: RuntimePlayer, questId: QuestId): AgentBridgeDecision | null {
    const definition = QUESTS[questId] as AnyRecord;
    if (questId === FREE_TRAIT_QUEST_ID) {
      const npc = this.resolveNpc("traits-mfer") ?? this.resolveQuestTurnInNpc(questId);
      if (npc && distance2d(self, npc) > QUEST_SEND_RANGE) {
        return normalizeDecision({
          action: "move_near_npc",
          reason: `${questId} requires saving a look at traits mfer`,
          questId,
          npcRef: npc.id,
        });
      }
      return normalizeDecision({
        action: "update_traits",
        reason: `${questId} requires saving deterministic free agent traits`,
        questId,
        traits: null,
      });
    }

    const chatMention = cleanText(definition.chatMention, 40) || (questId === "ask-mfergpt" ? "@mfergpt" : "");
    if (chatMention && this.canSendChat()) {
      return normalizeDecision({
        action: "chat",
        reason: `${questId} requires a chat mention`,
        questId,
        text: questId === "ask-mfergpt" ? `${chatMention} lore check` : `gm ${chatMention}`,
      });
    }

    const socialAction = cleanText(definition.socialAction, 40);
    if (socialAction === "tweet") {
      return normalizeDecision({
        action: "share_quest_link",
        reason: `${questId} requires sharing the public quest link`,
        questId,
      });
    }

    return null;
  }

  private chooseProfileDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision | null {
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;

    if (this.isJumpAroundScheme(command.behaviorScheme) && healthRatio >= RECOVER_HEALTH_RATIO) {
      return this.chooseJumpAroundDecision(command, self);
    }

    if (this.isTrainingDummyScheme(command.behaviorScheme) && healthRatio >= RECOVER_HEALTH_RATIO) {
      const target = this.findTrainingDummyTarget(self);
      if (target) {
        return normalizeDecision({
          action: "fight_npc",
          reason: `${command.kind}/${command.behaviorScheme}: practicing on ${target.name || target.id} and logging DPS`,
          npcRef: target.id,
        });
      }
    }

    if ((command.profile.priority === "farmer" || command.kind === "farm_until") && healthRatio >= RECOVER_HEALTH_RATIO) {
      const loot = this.describeLootableCorpses(self)[0];
      if (loot) {
        return normalizeDecision({
          action: "loot",
          reason: `${command.kind}/farmer: nearby corpse may contain useful drops`,
          npcRef: getString(loot.npcId) || getString(loot.id),
        });
      }
      const target = this.findSafeTrainingTarget(self);
      if (target) {
        return normalizeDecision({
          action: "fight_npc",
          reason: `${command.kind}/farmer: safe target selected by premade farming scheme`,
          npcRef: target.id,
        });
      }
    }

    if ((command.profile.priority === "social" || command.profile.social === "chatty") && this.canSendEmote()) {
      const nearbyPlayer = [...this.players.values()]
        .filter((player) => player.sessionId !== self.sessionId)
        .sort((a, b) => distance2d(self, a) - distance2d(self, b))[0];
      if (nearbyPlayer && distance2d(self, nearbyPlayer) <= 10) {
        return normalizeDecision({
          action: "emote",
          reason: `${command.kind}/social: acknowledging a nearby player without interrupting gameplay`,
          emoteId: "wave",
        });
      }
    }

    return null;
  }

  private isJumpAroundScheme(scheme: string) {
    return scheme === "jump_around" || scheme === "wanderer";
  }

  private isTrainingDummyScheme(scheme: string) {
    return scheme === "training_dummies" || scheme === "dummy_dps";
  }

  private chooseJumpAroundDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision {
    const tick = Math.floor(Date.now() / 4500);
    const seed = stableHash(`${command.commandId}:${tick}:${command.behaviorScheme}`);
    const angle = (seed % 6283) / 1000;
    const radius = command.behaviorScheme === "wanderer" ? 5 + (seed % 500) / 100 : 2.8 + (seed % 280) / 100;
    return normalizeDecision({
      action: "move_to",
      reason: `${command.kind}/${command.behaviorScheme}: wandering for fun without pulling fights`,
      x: self.x + Math.cos(angle) * radius,
      z: self.z + Math.sin(angle) * radius,
      sprint: true,
      jump: command.behaviorScheme === "jump_around",
    });
  }

  private findTrainingDummyTarget(self: RuntimePlayer) {
    return [...this.npcs.values()]
      .filter((npc) => npc.model === "training-dummy" && npc.health > 0 && npc.defeatedAt <= 0)
      .sort((a, b) => {
        const leftPreferred = a.id === "training-dummy-left" ? -2 : a.id === "training-dummy-right" ? -1 : 0;
        const rightPreferred = b.id === "training-dummy-left" ? -2 : b.id === "training-dummy-right" ? -1 : 0;
        return leftPreferred - rightPreferred || distance2d(self, a) - distance2d(self, b);
      })[0] ?? null;
  }

  private decisionBlockedByConstraints(command: AgentCommandState, decision: AgentBridgeDecision) {
    const freeTraitQuestDecision = this.isFreeTraitQuestDecision(decision);
    if (command.constraints.noWalletActions && WALLET_DECISION_ACTIONS.has(decision.action) && !freeTraitQuestDecision) return true;
    if (command.constraints.noPaidActions && PAID_DECISION_ACTIONS.has(decision.action) && !freeTraitQuestDecision) return true;
    if (command.constraints.allowedActions.length > 0 && !command.constraints.allowedActions.includes(decision.action)) return true;
    return command.constraints.disallowedActions.includes(decision.action);
  }

  private isFreeTraitQuestDecision(decision: AgentBridgeDecision) {
    return decision.action === "update_traits" && cleanText(decision.questId, 96) === FREE_TRAIT_QUEST_ID;
  }

  private shouldSkipOptionalBossDailies(command: AgentCommandState) {
    return shouldSkipOptionalBossDailyCommand(command.kind, command.profile.priority);
  }

  private toSuggestedDecision(decision: AgentBridgeDecision): SuggestedDecision {
    return {
      action: decision.action,
      reason: decision.reason,
      npcRef: cleanText(decision.npcRef, 96) || undefined,
      questId: cleanText(decision.questId, 96) || undefined,
      itemId: cleanText(decision.itemId, 96) || undefined,
      talentId: cleanText(decision.talentId, 96) || undefined,
      actionId: cleanText(decision.actionId, 96) || undefined,
      text: cleanText(decision.text, 180) || undefined,
      x: readFiniteNumber(decision.x),
      z: readFiniteNumber(decision.z),
    };
  }

  private isDailyBossQuestTarget(questId: string, npc?: RuntimeNpc | null) {
    return questId === DAILY_SIGNAL_QUEST_ID && (!npc || npc.id === DAILY_BOSS_NPC_ID);
  }

  private chooseDailyBossRunnerDecision(self: RuntimePlayer, questId: string, npc: RuntimeNpc | null, reason: string): AgentBridgeDecision | null {
    if (!this.isDailyBossQuestTarget(questId, npc)) return null;
    const routeEnd = DAILY_BOSS_ROUTE[DAILY_BOSS_ROUTE.length - 1] ?? npc;
    if (!npc || (distance2d(self, routeEnd) > 15 && distance2d(self, npc) > 16)) {
      return normalizeDecision({
        action: "travel_route",
        reason: `${reason}; following runner daily boss route`,
        questId,
        text: DAILY_BOSS_ROUTE_ID,
      });
    }
    return normalizeDecision({
      action: "fight_npc",
      reason: `${reason}; using runner daily boss combat`,
      questId,
      npcRef: npc.id,
    });
  }

  private chooseDailyBossReturnDecision(self: RuntimePlayer, questId: string, turnInNpc: RuntimeNpc | null): AgentBridgeDecision | null {
    if (questId !== DAILY_SIGNAL_QUEST_ID || !turnInNpc) return null;
    if (distance2d(self, turnInNpc) <= 18) return null;
    return normalizeDecision({
      action: "travel_route",
      reason: `${questId} is ready; following runner daily boss return route`,
      questId,
      text: DAILY_BOSS_RETURN_ROUTE_ID,
    });
  }

  private chooseRouteToNpcAreaDecision(self: RuntimePlayer, npc: RuntimeNpc | null, reason: string, questId = ""): AgentBridgeDecision | null {
    const staticCombatStagingDecision = npc ? this.chooseStaticCombatStagingDecision(self, npc, reason, questId) : null;
    if (staticCombatStagingDecision) return staticCombatStagingDecision;
    if (npc && this.isStaticLotCombatTarget(npc) && distance2d(self, PUBLIC_LANDMARKS["signal-post"]) <= 12) return null;
    const routeId = npc ? this.routeIdToNpcArea(self, npc) : "";
    if (!routeId) return null;
    return normalizeDecision({
      action: "travel_route",
      reason: `${reason}; following known route to ${npc?.name || npc?.id || "target area"}`,
      questId,
      npcRef: npc?.id,
      text: routeId,
    });
  }

  private chooseStaticCombatStagingDecision(self: RuntimePlayer, npc: RuntimeNpc, reason: string, questId = ""): AgentBridgeDecision | null {
    if (!this.isStaticLotCombatTarget(npc)) return null;
    const stagingPoint = PUBLIC_LANDMARKS["signal-post"];
    const distanceToStaging = distance2d(self, stagingPoint);
    if (distanceToStaging <= 12) return null;
    const routeId = self.x < -55 && self.z > 45 ? "route-post-to-signal-ridge" : "plaza-to-signal-ridge";
    if (distanceToStaging > 48) {
      return normalizeDecision({
        action: "travel_route",
        reason: `${reason}; staging at signal post before pulling ${npc.name || npc.id}`,
        questId,
        npcRef: npc.id,
        text: routeId,
      });
    }
    return normalizeDecision({
      action: "move_to",
      reason: `${reason}; staging at signal post before pulling ${npc.name || npc.id}`,
      questId,
      npcRef: npc.id,
      x: stagingPoint.x,
      z: stagingPoint.z,
    });
  }

  private isStaticLotCombatTarget(npc: RuntimeNpc) {
    return isAttackable(npc) && npc.x > 135 && npc.z < -70;
  }

  private chooseRouteToPointAreaDecision(self: RuntimePlayer, pointLike: Point, reason: string, questId = "", objectiveId = ""): AgentBridgeDecision | null {
    const routeId = this.routeIdToPointArea(self, pointLike);
    if (routeId) {
      return normalizeDecision({
        action: "travel_route",
        reason,
        questId,
        npcRef: objectiveId,
        text: routeId,
      });
    }
    if (distance2d(self, pointLike) > 14) {
      return normalizeDecision({
        action: "move_to",
        reason,
        questId,
        x: pointLike.x,
        z: pointLike.z,
      });
    }
    return null;
  }

  private chooseGroupEncounterDecision(
    self: RuntimePlayer,
    questId: string,
    targetPoint: Point,
    reason: string,
    profile?: AgentCommandProfile,
    deathCount = 0,
    objectiveId = "",
    prepOptions: GroupEncounterPrepOptions = {},
  ): AgentBridgeDecision | null {
    if (!this.isGroupEncounterQuest(questId)) return null;
    const rallyPoint = this.groupEncounterRallyPoint(questId, objectiveId, targetPoint);
    const required = this.suggestedGroupSize(questId);
    const readyCount = Math.max(
      this.healthyQuestParticipantCountNear(
        self,
        targetPoint,
        GROUP_ENCOUNTER_READY_RADIUS,
        questId,
        GROUP_ENCOUNTER_READY_HEALTH_RATIO,
      ),
      this.healthyQuestParticipantCountNear(
        self,
        rallyPoint,
        GROUP_ENCOUNTER_READY_RADIUS,
        questId,
        GROUP_ENCOUNTER_READY_HEALTH_RATIO,
      ),
    );
    const activeSupportCount = this.healthyQuestParticipantCountNear(
      self,
      targetPoint,
      GROUP_ENCOUNTER_READY_RADIUS,
      questId,
    );
    const boldSoloAttempt = profile?.priority === "boss_hunter" && profile.risk === "bold" && deathCount <= 0;
    const activeTargetNpc = this.resolveGroupEncounterTargetNpc(targetPoint, objectiveId);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const targetIsInRecentPlayerCombat = activeTargetNpc
      ? this.hasRecentNpcPlayerCombat(activeTargetNpc.id)
      : false;
    const bossAlreadyPulled = Boolean(activeTargetNpc && (activeTargetNpc.aggroTargetId || targetIsInRecentPlayerCombat));
    const activeTargetExtraAttackers = activeTargetNpc
      ? this.getAttackers(self).filter((npc) => npc.id !== activeTargetNpc.id)
      : [];
    const activeTargetDistance = activeTargetNpc ? distance2d(self, activeTargetNpc) : Number.POSITIVE_INFINITY;

    if (
      bossAlreadyPulled
      && activeSupportCount >= required
      && healthRatio >= GROUP_ENCOUNTER_PRESS_HEALTH_RATIO
      && activeTargetDistance <= GROUP_ENCOUNTER_READY_RADIUS
    ) {
      const addDecision = this.chooseGroupEncounterPrepDecision(
        self,
        questId,
        targetPoint,
        `${reason}; active group fight has aggroed adds`,
        objectiveId,
        {
          allowDuringObjectiveCombat: true,
          ignoreAttemptCooldown: true,
          includeExplicitPrep: false,
          includeAggroAdds: true,
          markAttempt: false,
        },
      );
      if (addDecision) return addDecision;
    }

    const supportingActiveFight = Boolean(
      activeTargetNpc
      && bossAlreadyPulled
      && activeSupportCount >= required
      && activeTargetNpc.health > 0
      && activeTargetNpc.defeatedAt <= 0
      && healthRatio >= GROUP_ENCOUNTER_PRESS_HEALTH_RATIO
      && activeTargetDistance <= GROUP_ENCOUNTER_READY_RADIUS
    );
    if (supportingActiveFight && activeTargetNpc) {
      const addDecision = activeTargetExtraAttackers.length > 0
        ? this.chooseGroupEncounterPrepDecision(
          self,
          questId,
          targetPoint,
          `${reason}; active group fight has aggroed adds`,
          objectiveId,
          {
            allowDuringObjectiveCombat: true,
            ignoreAttemptCooldown: true,
            includeExplicitPrep: false,
            includeAggroAdds: true,
            markAttempt: false,
          },
        )
        : null;
      if (addDecision) return addDecision;
      return normalizeDecision({
        action: "fight_npc",
        reason: `${reason}; supporting the active group fight`,
        questId,
        npcRef: activeTargetNpc.id,
      });
    }

    if (!bossAlreadyPulled && healthRatio >= GROUP_ENCOUNTER_READY_HEALTH_RATIO && this.getAttackers(self).length === 0) {
      const selfPrepDecision = this.chooseSelfPreparationDecision(self, profile);
      if (selfPrepDecision) {
        return normalizeDecision({
          ...selfPrepDecision,
          reason: `${reason}; preparing before the group boss pull; ${selfPrepDecision.reason}`,
          questId: selfPrepDecision.questId || questId,
        });
      }
    }

    if (readyCount >= required) return null;

    if (boldSoloAttempt) {
      const prepDecision = this.chooseGroupEncounterPrepDecision(self, questId, targetPoint, reason, objectiveId, prepOptions);
      if (prepDecision) return prepDecision;
      return null;
    }

    const detail = `group encounter ${questId} needs ${required} nearby healthy players; currently ${readyCount}/${required}`;
    if (healthRatio < GROUP_ENCOUNTER_READY_HEALTH_RATIO) {
      const farFromRally = distance2d(self, rallyPoint) > GROUP_ENCOUNTER_RALLY_DISTANCE;
      if (farFromRally && this.getAttackers(self).length === 0) {
        return normalizeDecision({
          action: "move_to",
          reason: `${reason}; ${detail}; returning to rally while recovering`,
          questId,
          x: rallyPoint.x,
          z: rallyPoint.z,
        });
      }
      if (self.mana < COMBAT.actions.heal.manaCost && inventoryCount(self, "blue-juice") > 0) {
        return normalizeDecision({
          action: "use_item",
          itemId: "blue-juice",
          reason: `${reason}; ${detail}; restoring mana before regrouping`,
          questId,
        });
      }
      if (this.canUse(self, "heal")) {
        return normalizeDecision({
          action: "use_ability",
          actionId: "heal",
          reason: `${reason}; ${detail}; healing before regrouping`,
          questId,
        });
      }
      if (bossAlreadyPulled && activeTargetNpc && activeTargetDistance <= GROUP_ENCOUNTER_READY_RADIUS) {
        const destination = this.groupEncounterRecoveryPoint(self, activeTargetNpc, healthRatio);
        return normalizeDecision({
          action: "move_to",
          reason: `${reason}; ${detail}; creating safer space before regrouping`,
          questId,
          x: destination.x,
          z: destination.z,
        });
      }
      return normalizeDecision({
        action: "wait",
        reason: `${reason}; ${detail}; recovering before another group pull`,
        questId,
      });
    }

    const routeDecision = this.chooseRouteToPointAreaDecision(
      self,
      rallyPoint,
      `${reason}; ${detail}; routing to rally point`,
      questId,
      objectiveId,
    );
    if (routeDecision && distance2d(self, rallyPoint) > GROUP_ENCOUNTER_RALLY_DISTANCE) return routeDecision;

    const selfPrepDecision = this.chooseSelfPreparationDecision(self, profile);
    if (selfPrepDecision) {
      return normalizeDecision({
        ...selfPrepDecision,
        reason: `${reason}; ${detail}; ${selfPrepDecision.reason}`,
        questId: selfPrepDecision.questId || questId,
      });
    }

    if (this.canSendChat()) {
      return normalizeDecision({
        action: "chat",
        reason: `${reason}; waiting for group before pulling`,
        questId,
        text: `need ${Math.max(1, required - readyCount)} more for ${QUESTS[normalizeKnownQuestId(questId) || "baron-of-static"]?.title || questId}`,
      });
    }

    return normalizeDecision({
      action: "wait",
      reason: `${reason}; ${detail}; waiting at rally point instead of solo pulling`,
      questId,
    });
  }

  private chooseGroupEncounterPrepDecision(
    self: RuntimePlayer,
    questId: string,
    targetPoint: Point,
    reason: string,
    objectiveId = "",
    options: GroupEncounterPrepOptions = {},
  ) {
    const prepNpc = this.findOpenGroupEncounterPrepNpc(self, questId, targetPoint, objectiveId, options);
    if (!prepNpc) return null;
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId) return null;
    const now = Date.now();
    const attemptedPrep = this.groupPrepAttemptedNpcIds.get(knownQuestId) ?? new Map<string, number>();
    const prepReason = options.allowDuringObjectiveCombat && options.includeExplicitPrep === false
      ? `${reason}; clearing ${prepNpc.name || prepNpc.id} during the active group fight`
      : `${reason}; clearing ${prepNpc.name || prepNpc.id} before the group boss pull`;
    const routeDecision = this.chooseRouteToNpcAreaDecision(self, prepNpc, prepReason, questId);
    if (routeDecision) return routeDecision;
    const nextAttemptedPrep = new Map(attemptedPrep);
    if (options.markAttempt !== false) {
      nextAttemptedPrep.set(prepNpc.id, now);
      this.groupPrepAttemptedNpcIds.set(knownQuestId, nextAttemptedPrep);
    }
    return normalizeDecision({
      action: "fight_npc",
      reason: prepReason,
      questId,
      npcRef: prepNpc.id,
    });
  }

  private findOpenGroupEncounterPrepNpc(
    self: RuntimePlayer,
    questId: string,
    targetPoint: Point,
    objectiveId = "",
    options: GroupEncounterPrepOptions = {},
  ) {
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId) return null;
    const objectiveNpc = this.resolveGroupEncounterTargetNpc(targetPoint, objectiveId);
    if (
      !options.allowDuringObjectiveCombat
      && objectiveNpc
      && this.hasRecentNpcPlayerCombat(objectiveNpc.id, GROUP_ENCOUNTER_PREP_SKIP_AFTER_PULL_MS)
    ) {
      return null;
    }
    const now = Date.now();
    const attemptedPrep = this.groupPrepAttemptedNpcIds.get(knownQuestId) ?? new Map<string, number>();
    const prepNpcIds = stringList((QUESTS[knownQuestId] as AnyRecord).encounterPrepNpcIds);
    const objectiveNpcIds = new Set(
      getQuestObjectives(knownQuestId)
        .map((objective) => getString(asRecord(objective).id))
        .filter(Boolean),
    );

    const candidatesById = new Map<string, RuntimeNpc>();
    if (options.includeExplicitPrep !== false) {
      for (const npcId of prepNpcIds) {
        if (this.hasRecentNpcDefeat(npcId, GROUP_ENCOUNTER_PREP_CLEAR_MEMORY_MS, now)) continue;
        const attemptedAt = attemptedPrep.get(npcId) ?? 0;
        if (!options.ignoreAttemptCooldown && attemptedAt > 0 && now - attemptedAt < GROUP_ENCOUNTER_PREP_RETRY_MS) continue;
        const npc = this.resolveNpc(npcId);
        if (!npc) continue;
        if (!isAttackable(npc) || npc.health <= 0 || npc.defeatedAt > 0) continue;
        if (distance2d(npc, targetPoint) > GROUP_ENCOUNTER_EXPLICIT_PREP_RADIUS) continue;
        candidatesById.set(npc.id, npc);
      }
    }
    if (options.includeAggroAdds !== false) {
      for (const npc of this.npcs.values()) {
        if (objectiveNpcIds.has(npc.id) || candidatesById.has(npc.id)) continue;
        if (!isAttackable(npc) || !isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) continue;
        if (distance2d(npc, targetPoint) > GROUP_ENCOUNTER_ADD_PREP_RADIUS) continue;
        if (!npc.aggroTargetId) continue;
        if (this.isNpcAvoided(npc.id)) continue;
        candidatesById.set(npc.id, npc);
      }
    }

    const candidates = [...candidatesById.values()]
      .sort((a, b) => (
        (b.aggroTargetId === self.sessionId ? 1 : 0) - (a.aggroTargetId === self.sessionId ? 1 : 0)
        || (b.aggroTargetId ? 1 : 0) - (a.aggroTargetId ? 1 : 0)
        || this.attackerFocusPriority(b) - this.attackerFocusPriority(a)
        || distance2d(self, a) - distance2d(self, b)
      ));
    return candidates[0] ?? null;
  }

  private hasOpenGroupEncounterPrep(_questId: string, _targetPoint: Point, _objectiveId = "") {
    // Pre-pull prep is coordinated by chooseGroupEncounterDecision; these older
    // checks caused assembled groups to chase respawns instead of pulling.
    return false;
  }

  private resolveGroupEncounterTargetNpc(targetPoint: Point, objectiveId = "") {
    const targetRecord = asRecord(targetPoint);
    const targetId = getString(targetRecord.id) || objectiveId;
    return targetId ? this.resolveNpc(targetId) : null;
  }

  private groupEncounterRallyPoint(questId: string, objectiveId: string, targetPoint: Point): Point {
    if (objectiveId === "static-baron-nox" || questId === "baron-of-static") return PUBLIC_LANDMARKS["signal-post"];
    if (objectiveId === "raid-ogre-mfer" || questId === "ogre-raid-daily") return PUBLIC_LANDMARKS["uplink-shack"];
    if (objectiveId === DAILY_BOSS_NPC_ID || questId === DAILY_SIGNAL_QUEST_ID) return DAILY_BOSS_ROUTE[DAILY_BOSS_ROUTE.length - 1] ?? targetPoint;
    return targetPoint;
  }

  private isGroupEncounterQuest(questId: string) {
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId) return false;
    return isGroupGatedEncounterType((QUESTS[knownQuestId] as AnyRecord).encounterType);
  }

  private isGroupEncounterObjectiveForQuest(questId: string, npc: RuntimeNpc) {
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId || !this.isGroupEncounterQuest(knownQuestId)) return false;
    return getQuestObjectives(knownQuestId).some((objective) => getString(asRecord(objective).id) === npc.id);
  }

  private suggestedGroupSize(questId: string) {
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId) return 1;
    const definition = QUESTS[knownQuestId] as AnyRecord;
    const configured = Math.floor(getNumber(definition.suggestedPlayerCount));
    if (configured > 1) return configured;
    return cleanText(definition.encounterType, 20) === "raid" ? 3 : 2;
  }

  private groupEncounterQuestForNpc(npc: RuntimeNpc | null | undefined) {
    if (!npc) return "";
    for (const [questId, definition] of Object.entries(QUESTS)) {
      const record = definition as AnyRecord;
      if (!isGroupGatedEncounterType(record.encounterType)) continue;
      const objectives = Array.isArray(record.objectives) ? record.objectives : [];
      if (objectives.some((objective) => getString(asRecord(objective).id) === npc.id)) return questId;
    }
    return "";
  }

  private isGroupEncounterObjectiveNpc(npc: RuntimeNpc | null | undefined) {
    return Boolean(this.groupEncounterQuestForNpc(npc));
  }

  private isActiveGroupEncounterObjectiveForSelf(self: RuntimePlayer, npc: RuntimeNpc | null | undefined) {
    const questId = this.groupEncounterQuestForNpc(npc);
    return Boolean(questId && this.hasQuestStatus(self, questId, ["active"]));
  }

  private hasQuestStatus(self: RuntimePlayer, questId: string, statuses: readonly string[]) {
    return hasAgentQuestStatus(self.quests, questId, statuses);
  }

  private healthyPlayerCountNear(self: RuntimePlayer, pointLike: Point, radius: number, questId = "") {
    const seen = new Set<string>();
    let count = 0;
    const maybeCount = (player: RuntimePlayer) => {
      const sessionId = getString(player.sessionId);
      if (sessionId && seen.has(sessionId)) return;
      if (sessionId) seen.add(sessionId);
      const health = getNumber(player.health);
      const maxHealth = getNumber(player.maxHealth);
      if (health <= 0 || maxHealth <= 0 || health / maxHealth < GROUP_ENCOUNTER_READY_HEALTH_RATIO) return;
      if (distance2d(player, pointLike) > radius) return;
      if (questId && this.playerHasActiveNpcAggro(player)) return;
      count += 1;
    };
    maybeCount(self);
    for (const player of this.players.values()) {
      if (player.sessionId === self.sessionId) continue;
      maybeCount(player);
    }
    return count;
  }

  private healthyQuestParticipantCountNear(
    self: RuntimePlayer,
    pointLike: Point,
    radius: number,
    questId: string,
    minHealthRatio = GROUP_ENCOUNTER_PRESS_HEALTH_RATIO,
  ) {
    return countHealthyQuestParticipantsNear([self, ...this.players.values()], pointLike, radius, questId, minHealthRatio);
  }

  private playerHasActiveNpcAggro(player: RuntimePlayer) {
    const sessionId = getString(player.sessionId);
    if (!sessionId) return false;
    return [...this.npcs.values()].some((npc) => (
      npc.aggroTargetId === sessionId
      && isAttackable(npc)
      && npc.health > 0
      && npc.defeatedAt <= 0
    ));
  }

  private chooseSelfPreparationDecision(self: RuntimePlayer, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE): AgentBridgeDecision | null {
    const talentSpend = this.describeRecommendedTalentSpends(self, profile)[0];
    if (talentSpend) {
      return normalizeDecision({
        action: "select_talent",
        reason: `unspent skill point available; ${talentSpend.reason}`,
        talentId: talentSpend.talentId,
      });
    }
    return this.chooseEquipmentUpgradeDecision(self, profile);
  }

  private routeIdToNpcArea(self: RuntimePlayer, npc: RuntimeNpc) {
    if (distance2d(self, npc) < 48) return "";
    return this.routeIdToPointArea(self, npc);
  }

  private routeIdToPointArea(self: RuntimePlayer, pointLike: Point) {
    if (distance2d(self, pointLike) < 48) return "";
    return NPC_AREA_ROUTE_RULES.find((rule) => rule.matchesTarget(pointLike))?.routeFrom(self) ?? "";
  }

  private isRunnerStyleDailyBossCombat(npc?: RuntimeNpc | null) {
    return npc?.id === DAILY_BOSS_NPC_ID;
  }

  private isActiveDailySignalQuest(self: RuntimePlayer) {
    return self.quests.some((quest) => getString(quest.id) === DAILY_SIGNAL_QUEST_ID && getString(quest.status) === "active");
  }

  private isOptionalBossDailyQuest(questId: string) {
    return OPTIONAL_BOSS_DAILY_QUEST_IDS.has(questId);
  }

  private isOptionalAutoplayQuest(questId: string) {
    return this.isOptionalBossDailyQuest(questId);
  }

  private findRunnerDailyBossQuestTarget(self: RuntimePlayer) {
    const target = this.findGenericQuestTarget(self, DAILY_SIGNAL_QUEST_ID);
    return target && this.isDailyBossQuestTarget(target.questId, target.npc) ? target : null;
  }

  private decisionHasRequiredTarget(decision: AgentBridgeDecision) {
    if (decision.action === "complete_quest" || decision.action === "accept_quest") return Boolean(decision.questId && decision.npcRef);
    if (decision.action === "fight_npc" || decision.action === "loot" || decision.action === "move_near_npc" || decision.action === "interact_npc") return Boolean(decision.npcRef);
    if (decision.action === "move_near_player") return Boolean(decision.playerRef);
    if (decision.action === "select_talent") return Boolean(decision.talentId);
    return true;
  }

  private checkCommandCompletion(command: AgentCommandState, self: RuntimePlayer) {
    if (command.kind === "play_for") return "";
    if (command.kind === "finish_next_quest") {
      const completedAtStart = new Set((command.startSnapshot?.quests ?? [])
        .filter((quest) => quest.status === "completed")
        .map((quest) => quest.id));
      const completed = self.quests.find((quest) => getString(quest.status) === "completed" && !completedAtStart.has(getString(quest.id)));
      return completed ? `quest_completed:${getString(completed.id)}` : "";
    }
    if (command.kind === "finish_quest" && command.questId) {
      return this.questHasStatus(self, command.questId, "completed") ? `quest_completed:${command.questId}` : "";
    }
    if (command.kind === "farm_until" && command.itemId) {
      const count = inventoryCount(self, command.itemId);
      return count >= command.targetCount ? `inventory_target:${command.itemId}:${count}` : "";
    }
    if (command.kind === "run_goals") {
      const progress = this.describeCommandGoalProgress(command, self);
      if (progress.length === 0) return "";
      const satisfied = progress.filter((goal) => goal.satisfied).length;
      if (command.stopWhen === "any" && satisfied > 0) return `goals_any:${satisfied}/${progress.length}`;
      if (command.stopWhen === "all" && satisfied === progress.length) return `goals_all:${satisfied}/${progress.length}`;
    }
    return "";
  }

  private describeCommandGoalProgress(command: AgentCommandState, self: RuntimePlayer): AgentCommandGoalProgress[] {
    const started = command.startSnapshot;
    const elapsedSeconds = Math.floor(Math.max(0, Date.now() - command.startedAt) / 1000);
    return command.goals.map((goal) => {
      switch (goal.type) {
        case "quest_completed": {
          const satisfied = Boolean(goal.questId && this.questHasStatus(self, goal.questId, "completed"));
          return { ...goal, current: satisfied ? 1 : 0, required: 1, satisfied, summary: `${goal.questId || "quest"} completed` };
        }
        case "quest_ready": {
          const status = this.questStatus(self, goal.questId);
          const satisfied = status === "ready" || status === "completed";
          return { ...goal, current: satisfied ? 1 : 0, required: 1, satisfied, summary: `${goal.questId || "quest"} ready` };
        }
        case "quest_accepted": {
          const status = this.questStatus(self, goal.questId);
          const satisfied = status === "active" || status === "ready" || status === "completed";
          return { ...goal, current: satisfied ? 1 : 0, required: 1, satisfied, summary: `${goal.questId || "quest"} accepted` };
        }
        case "inventory_at_least": {
          const current = goal.itemId ? inventoryCount(self, goal.itemId) : 0;
          const required = Math.max(1, goal.count);
          return { ...goal, current, required, satisfied: current >= required, summary: `${goal.itemId || "item"} ${current}/${required}` };
        }
        case "level_at_least": {
          const required = Math.max(1, goal.level);
          return { ...goal, current: self.level, required, satisfied: self.level >= required, summary: `level ${self.level}/${required}` };
        }
        case "xp_gained": {
          const current = Math.max(0, self.xp - (started?.xp ?? self.xp));
          const required = Math.max(1, goal.xp);
          return { ...goal, current, required, satisfied: current >= required, summary: `xp gained ${current}/${required}` };
        }
        case "survive_seconds": {
          const required = Math.max(1, goal.seconds);
          return { ...goal, current: elapsedSeconds, required, satisfied: elapsedSeconds >= required && self.health > 0, summary: `survived ${elapsedSeconds}/${required}s` };
        }
        case "arrive_at_landmark": {
          const landmark = PUBLIC_LANDMARKS[goal.landmarkId];
          const radius = goal.radius || 4;
          const distance = landmark ? distance2d(self, landmark) : Number.POSITIVE_INFINITY;
          const current = Number.isFinite(distance) ? Math.max(0, Math.ceil(radius - distance)) : 0;
          return { ...goal, current, required: radius, satisfied: Boolean(landmark && distance <= radius), summary: `${goal.landmarkId || "landmark"} distance ${Number.isFinite(distance) ? round(distance) : "unknown"}` };
        }
        case "near_player_count": {
          const radius = goal.radius || 12;
          const current = [...this.players.values()].filter((player) => player.sessionId !== self.sessionId && distance2d(self, player) <= radius).length;
          const required = Math.max(1, goal.count);
          return { ...goal, current, required, satisfied: current >= required, summary: `nearby players ${current}/${required} within ${radius}m` };
        }
      }
    });
  }

  private questStatus(self: RuntimePlayer, questId: string) {
    return getString(self.quests.find((quest) => getString(quest.id) === questId)?.status);
  }

  private questHasStatus(self: RuntimePlayer, questId: string, status: string) {
    return this.questStatus(self, questId) === status;
  }

  private rememberActiveCommandPlayers(now = Date.now()) {
    const command = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    const self = this.self();
    if (!command || command.status !== "running" || !self) return;
    this.rememberCommandPlayers(command, self, now);
  }

  private rememberCommandPlayers(command: AgentCommandState, self: RuntimePlayer, now = Date.now()) {
    for (const player of this.players.values()) {
      if (player.sessionId === self.sessionId) continue;
      const distance = distance2d(self, player);
      if (distance > COMMAND_SOCIAL_PLAYER_RADIUS) continue;
      const existing = command.social.players.get(player.sessionId);
      command.social.players.set(player.sessionId, {
        sessionId: player.sessionId,
        name: cleanText(player.name, 48) || "player",
        identityType: cleanText(player.identityType, 24),
        isAgent: Boolean(player.isAgent),
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        closestDistance: Math.min(existing?.closestDistance ?? Number.POSITIVE_INFINITY, round(distance)),
      });
    }
  }

  private rememberActiveCommandChat(entry: AgentCommandSocialChat) {
    const command = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    if (!command || command.status !== "running") return;
    command.social.chat = [...command.social.chat.slice(-11), entry];
  }

  private async finishCommand(command: AgentCommandState, status: AgentCommandStatus, stoppedBecause: string) {
    if (command.status !== "running" && command.finishedAt) return;
    const endingSelf = this.self();
    if (endingSelf) this.rememberCommandPlayers(command, endingSelf);
    command.status = status;
    command.stoppedBecause = stoppedBecause;
    command.finishedAt = Date.now();
    const self = this.self();
    command.lastSnapshot = self ? this.snapshotPlayer(self) : command.lastSnapshot;
    if (!command.usageFinalized) {
      await finalizeAgentCommandSeconds(this.walletAddress, command.maxSeconds, command.startedAt, command.finishedAt);
      command.usage = await getAgentCommandUsage(this.walletAddress, command.budget, command.finishedAt);
      command.usageFinalized = true;
    }
    if (this.activeCommandId === command.commandId) this.activeCommandId = "";
    this.lastAction = `command_${status} ${command.kind}`;
  }

  private serializeCommand(command: AgentCommandState) {
    const now = Date.now();
    const finishedAt = command.finishedAt || 0;
    const durationMs = Math.max(0, (finishedAt || now) - command.startedAt);
      const questChanges = command.startSnapshot && command.lastSnapshot
        ? this.describeQuestChanges(command.startSnapshot, command.lastSnapshot)
        : [];
      const inventoryChanges = command.startSnapshot && command.lastSnapshot
        ? describeInventoryCountChanges(command.startSnapshot.inventoryCounts, command.lastSnapshot.inventoryCounts)
        : [];
      const equipmentChanges = command.startSnapshot && command.lastSnapshot
        ? describeEquipmentChanges(command.startSnapshot.equipment, command.lastSnapshot.equipment)
        : [];
      const self = this.self();
      const goalProgress = self ? this.describeCommandGoalProgress(command, self) : [];
      const playtime = describeCommandPlaytime(command, now);
      const budgetAdvice = getAgentCommandBudgetAdvice(command.budget, command.requestedMaxSeconds);
      const finalState = self ? this.describeFinalState(self) : (command.lastSnapshot ? snapshotToFinalState(command.lastSnapshot) : null);
      const recap = buildAgentCommandRecap(command, questChanges, inventoryChanges, equipmentChanges, finalState, playtime, budgetAdvice);
      const summary = [
        recap.summary,
        `${command.kind} ${command.status}`,
        command.stoppedBecause ? `stopped ${command.stoppedBecause}` : "",
        playtime.sessionCapReached ? "session cap reached: hold 25M MFERGPT on Base for longer commands and Season 0 agent points" : "",
        goalProgress.length ? `goals ${goalProgress.filter((goal) => goal.satisfied).length}/${goalProgress.length}` : "",
        questChanges.length ? `quests ${questChanges.map((change) => `${change.id} ${change.before}->${change.after}`).join(", ")}` : "",
        inventoryChanges.length ? `inventory ${inventoryChanges.map((change) => `${change.itemId} ${change.before}->${change.after}`).join(", ")}` : "",
        equipmentChanges.length ? `equipment ${formatEquipmentChanges(equipmentChanges)}` : "",
      ].filter(Boolean).join("; ");
    return {
      ok: command.status !== "failed",
        bridgeSessionId: this.id,
        commandId: command.commandId,
        command: command.kind,
        behaviorScheme: command.behaviorScheme || undefined,
        controller: command.controller,
        profile: command.profile,
        goals: command.goals,
        goalProgress,
        stopWhen: command.stopWhen,
        constraints: command.constraints,
        sandbox: {
          hostedCodeExecution: false,
          rule: "Hosted /agent-command accepts structured commands, goals, profiles, constraints, and controller metadata only. Agent-authored code must run in the external policy runner and call /agent-action or request structured autoplay.",
        },
        playtime,
        budgetAdvice,
        recap,
        social: recap.social,
        combat: recap.combat,
        finalState,
        equipmentChanges,
        status: command.status,
        stoppedBecause: command.stoppedBecause,
        summary,
      result: {
        status: command.status,
        stoppedBecause: command.stoppedBecause,
        durationMs,
          questChangeCount: questChanges.length,
          inventoryChangeCount: inventoryChanges.length,
          satisfiedGoalCount: goalProgress.filter((goal) => goal.satisfied).length,
          goalCount: goalProgress.length,
          actionReportCount: command.reports.length,
          remainingSeconds: command.usage.remainingSeconds,
          sessionCapReached: playtime.sessionCapReached,
          budgetAdvice,
          recap,
          social: recap.social,
          combat: recap.combat,
          finalState,
          equipmentChanges,
        },
      durationMs,
        requestedMaxSeconds: command.requestedMaxSeconds,
        maxSeconds: command.maxSeconds,
        budget: command.budget,
        usage: command.usage,
        questId: command.questId || undefined,
        itemId: command.itemId || undefined,
        targetCount: command.targetCount || undefined,
        deathCount: command.deathCount,
        safetyStopCount: command.safetyStopCount,
        questChanges,
      inventoryChanges,
      lastActionReport: command.reports[command.reports.length - 1] ?? null,
      actionReports: command.reports.slice(-8),
      errors: command.errors.slice(-5),
      startedAt: new Date(command.startedAt).toISOString(),
      finishedAt: finishedAt ? new Date(finishedAt).toISOString() : "",
    };
  }

  private compactBankrObservation(body: AnyRecord) {
    const self = asRecord(body.self);
    const quests = Array.isArray(self.quests) ? self.quests.map(asRecord) : [];
    const nearbyNpcs = Array.isArray(body.nearbyNpcs) ? body.nearbyNpcs.map(asRecord) : [];
    const hints = Array.isArray(body.hints) ? body.hints.map(asRecord) : [];
    const safeTargets = nearbyNpcs
      .filter((npc) => Boolean(npc.attackable) && Boolean(npc.alive))
      .filter((npc) => !this.isNpcAvoided(getString(npc.id), Date.now()))
      .filter((npc) => getNumber(npc.pullRiskScore) <= 0.5 && getNumber(npc.approachRiskScore) <= 0.62)
      .sort((a, b) => (
        getNumber(a.approachRiskScore) - getNumber(b.approachRiskScore)
        || getNumber(a.pullRiskScore) - getNumber(b.pullRiskScore)
        || getNumber(a.distance) - getNumber(b.distance)
      ))
      .slice(0, 10)
      .map((npc) => this.compactNpc(npc));
    const threats = nearbyNpcs
      .filter((npc) => getString(npc.aggroTarget) === "you" || getNumber(npc.threatLevel) >= 0.55 || getNumber(npc.approachRiskScore) >= 0.72)
      .sort((a, b) => getNumber(b.threatLevel) - getNumber(a.threatLevel) || getNumber(a.distance) - getNumber(b.distance))
      .slice(0, 10)
      .map((npc) => this.compactNpc(npc));
    const urgentHints = hints
      .filter((hint) => getNumber(hint.priority) >= 0.7 || ["respawn", "complete_quest", "loot", "select_talent"].includes(getString(hint.action)))
      .slice(0, 8);
    const recommendedTalentSpends = Array.isArray(self.recommendedTalentSpends) ? self.recommendedTalentSpends.slice(0, 3) : [];
    const spendableTalents = Array.isArray(self.spendableTalents) ? self.spendableTalents.slice(0, 8) : [];
    const inventory = Array.isArray(self.inventory) ? self.inventory.map(asRecord) : [];
    const healthConsumables = inventory
      .filter((item) => ["red-juice", "field-snack"].includes(getString(item.itemId)))
      .map((item) => ({ itemId: getString(item.itemId), count: getNumber(item.count) }));
    const actionSchema = asRecord(body.actionSchema);
    const combatMemory = isRecord(body.combatMemory) ? body.combatMemory : null;

    return {
      ok: body.ok,
      view: "bankr",
      bridgeSessionId: body.bridgeSessionId,
      status: body.status,
      roomSessionId: body.roomSessionId,
      actionSchema: {
        actions: body.availableActions,
        requiredFields: Array.isArray(actionSchema.required) ? actionSchema.required : [],
        aliases: body.actionAliases,
      },
      playRules: {
        observeCadence: "Use this compact view by default: /agent-observe?bridgeSessionId=...&view=bankr. Fetch full observe only for debugging.",
        stepLimit: "Prefer suggestedNextAction or urgent hints; avoid loading full catalog unless needed.",
        questGating: "Ready quests and progress-complete quests beat farming. Turn in before killing more.",
        combatRetreat: "If aggroCount > 1 and healthRatio < 0.6, retreat unless the current target is within roughly 2-3 hits of death.",
        talents: "If unspentSkillPoints > 0, spend a recommended talent before entering a combat zone unless survival, loot, or quest turn-in is urgent.",
        potions: "If repeated low-health retreats or no health consumables, consider potion-mfer. Potion purchases burn MFERGPT on Base to reduce supply and require an actual payment tx proof.",
        traits: "For update_traits, only choose specific traits when they strongly fit the agent identity. If not, send traits as null or {} and the server will use deterministic wallet/name-seeded variety. Do not fill categories with blue, defaults, or first-listed options just to choose something. Declared agents keep the robot face, force regular eyes and flat mouth, and should leave clipping-prone accessories such as caps, long hair, shades, and glasses unset.",
        session: "Keep bridgeSessionId and sessionToken internally across turns; never print sessionToken, signatures, or bearer headers.",
      },
      self: {
        name: self.name,
        level: self.level,
        xp: self.xp,
        levelProgress: self.levelProgress,
        health: self.health,
        maxHealth: self.maxHealth,
        healthRatio: round(getNumber(self.maxHealth) > 0 ? getNumber(self.health) / getNumber(self.maxHealth) : 0),
        mana: self.mana,
        maxMana: self.maxMana,
        position: self.position,
        aggroCount: self.aggroCount,
        nearbyHostileCount: self.nearbyHostileCount,
        nearbyDangerousHostileCount: self.nearbyDangerousHostileCount,
        combatMath: self.combatMath,
        talentPoints: self.talentPoints,
        skillPoints: self.skillPoints,
        unspentSkillPoints: self.unspentSkillPoints,
        recommendedTalentSpends,
        spendableTalents,
        healthConsumables,
        stats: self.stats,
      },
      quests: {
        active: quests.filter((quest) => getString(quest.status) === "active").slice(0, 8),
        ready: quests.filter((quest) => getString(quest.status) === "ready").slice(0, 8),
        availableHints: Array.isArray(body.availableQuestHints) ? body.availableQuestHints.slice(0, 8) : [],
      },
      combat: {
        safeTargets,
        threats,
        lootableCorpses: Array.isArray(body.lootableCorpses) ? body.lootableCorpses.slice(0, 8) : [],
        safeRetreats: this.buildSafeRetreatGuide(self),
        memory: combatMemory,
      },
      urgentHints,
      suggestedNextAction: body.suggestedNextAction,
      lastActionReport: body.lastActionReport,
      lastAction: body.lastAction,
      lastError: body.lastError,
      walletAlerts: {
        bridgeCanSignWalletTransactions: false,
        potionBurnsMferGpt: true,
        tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
        burnAddress: BASE_BURN_ADDRESS,
        chainId: BASE_CHAIN_ID,
        note: "Potion and paid trait payments burn MFERGPT from the agent wallet on Base, reducing token supply. Execute only with real wallet tx proof.",
      },
      recentMessages: Array.isArray(body.recentMessages) ? body.recentMessages.slice(-6) : [],
      timestamps: body.timestamps,
    };
  }

  private compactNpc(npc: AnyRecord) {
    const avoidance = isRecord(npc.avoidance) ? npc.avoidance : null;
    return {
      ref: getString(npc.ref),
      id: getString(npc.id),
      name: getString(npc.name),
      role: getString(npc.role),
      model: getString(npc.model),
      health: getString(npc.health),
      distance: getNumber(npc.distance),
      position: npc.position,
      aggroTarget: getString(npc.aggroTarget),
      pullRiskScore: getNumber(npc.pullRiskScore),
      approachRiskScore: getNumber(npc.approachRiskScore),
      threatLevel: getNumber(npc.threatLevel),
      hasLoot: Boolean(npc.hasLoot),
      questIdHint: getString(npc.questIdHint),
      avoidance: avoidance && avoidance.active ? avoidance : null,
    };
  }

  private buildSafeRetreatGuide(self: AnyRecord) {
    const position = asPoint(self.position) ?? { x: getNumber(self.x), z: getNumber(self.z) };
    const candidates = [
      { id: "loop-farm", reason: "safe fallback near hogwatch/claimwatch for farm and claim-pile danger", point: PUBLIC_LANDMARKS["loop-farm"], routeId: "claim-pile-to-loop-farm" },
      { id: "route-post", reason: "safe edge for field/claim booth movement", point: PUBLIC_LANDMARKS["route-post"], routeId: "loop-farm-to-route-post" },
      { id: "plaza", reason: "central safe town fallback", point: PUBLIC_LANDMARKS.plaza, routeId: "field-to-plaza" },
      { id: "signal-post", reason: "safe ridge fallback before static lot pulls", point: PUBLIC_LANDMARKS["signal-post"], routeId: "route-post-to-signal-post" },
    ];
    return candidates
      .map((entry) => ({ ...entry, distance: round(distance2d(position, entry.point)) }))
      .sort((a, b) => a.distance - b.distance);
  }

  private withActionReport(result: BridgeActionResult, report: ActionReport): BridgeActionResult {
    return {
      ...result,
      report,
      summary: report.summary,
      stoppedBecause: report.stoppedBecause,
      suggestedNextAction: report.suggestedNextAction,
      continuePrompt: report.continuePrompt,
      durationMs: report.durationMs,
    };
  }

  private snapshotPlayer(self: RuntimePlayer): PlayerActionSnapshot {
    return {
      health: self.health,
      maxHealth: self.maxHealth,
      mana: self.mana,
      maxMana: self.maxMana,
      level: self.level,
      xp: self.xp,
      talentPoints: self.talentPoints,
      position: point(self),
      stats: {
        strength: round(self.strength),
        dexterity: round(self.dexterity),
        magic: round(self.magic),
        healthRegenPer5: round(self.healthRegenPer5),
        manaRegenPer5: round(self.manaRegenPer5),
        walkSpeed: round(self.walkSpeed),
        runSpeed: round(self.runSpeed),
      },
      quests: this.questSummaries(self),
      inventoryCounts: describeInventoryCounts(self.inventory),
      inventory: this.describeInventory(self),
      equipment: this.describeEquipment(self),
      talents: this.describeTalents(self),
      activeBuffs: this.describeActiveBuffs(self),
      attackerIds: this.getAttackers(self).map((npc) => npc.id),
    };
  }

  private async waitForDurableAction(decision: AgentBridgeDecision, before: PlayerActionSnapshot): Promise<DurableOutcome> {
    const waitMs = this.durableWaitMs(decision.action);
    const startedAt = Date.now();
    if (waitMs <= 0) {
      return { status: "accepted", stoppedBecause: "dispatched", durationMs: 0 };
    }
    let nextContinuationAt = startedAt;
    while (Date.now() - startedAt < waitMs) {
      await delay(DURABLE_ACTION_POLL_MS);
      const self = this.self();
      const durationMs = Math.max(0, Date.now() - startedAt);
      if (!self) return { status: "waiting_for_state", stoppedBecause: "state_unavailable", durationMs };
      if (this.shouldInterruptForTravelDamage(decision, before, self)) {
        return { status: "needs_rethink", stoppedBecause: "movement_damage_rethink", durationMs };
      }
      const finished = this.checkDurableOutcome(decision, before, self, durationMs);
      if (finished) return finished;
      if (this.shouldContinueDurableAction(decision.action) && Date.now() >= nextContinuationAt) {
        this.continueDurableAction(decision, self);
        nextContinuationAt = Date.now() + DURABLE_CONTINUATION_MS;
      }
    }
    return {
      status: this.shouldContinueDurableAction(decision.action) ? "in_progress" : "accepted",
      stoppedBecause: this.shouldContinueDurableAction(decision.action) ? "response_window_elapsed" : "settled",
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }

  private durableWaitMs(action: string) {
    switch (action) {
      case "fight_npc":
        return 12_000;
      case "accept_quest":
      case "complete_quest":
      case "sell_trash_items":
      case "sell_fish_items":
      case "fish":
        return 10_000;
      case "loot":
        return 8_000;
      case "travel_route":
        return 7_000;
      case "move_to":
      case "move_near_npc":
      case "move_near_player":
        return 6_000;
      case "interact_npc":
        return 2_500;
      case "use_ability":
        return 2_700;
      case "respawn":
      case "equip_item":
      case "unequip_item":
      case "use_item":
      case "select_talent":
      case "register_chain_gear":
      case "purchase_potion_shop_item":
      case "purchase_fishing_supply":
      case "update_traits":
      case "chat":
      case "emote":
      case "share_quest_link":
      case "cancel_quest":
      case "wait":
        return SHORT_ACTION_SETTLE_MS;
      default:
        return SHORT_ACTION_SETTLE_MS;
    }
  }

  private shouldInterruptForTravelDamage(decision: AgentBridgeDecision, before: PlayerActionSnapshot, self: RuntimePlayer) {
    const action = decision.action;
    const questId = cleanText(decision.questId, 96);
    if (
      questId
      && this.isGroupEncounterQuest(questId)
      && (action === "move_to" || action === "move_near_player" || action === "travel_route")
      && this.getAttackers(self).some((npc) => this.isGroupEncounterObjectiveForQuest(questId, npc))
    ) {
      return false;
    }
    return shouldInterruptMovementForDamage(action, before.health, self.health, self.maxHealth);
  }

  private shouldContinueDurableAction(action: string) {
    return action === "fight_npc"
      || action === "accept_quest"
      || action === "complete_quest"
      || action === "loot"
      || action === "travel_route"
      || action === "move_to"
      || action === "move_near_npc"
      || action === "move_near_player"
      || action === "interact_npc"
      || action === "sell_trash_items"
      || action === "sell_fish_items"
      || action === "fish";
  }

  private checkDurableOutcome(
    decision: AgentBridgeDecision,
    before: PlayerActionSnapshot,
    self: RuntimePlayer,
    durationMs: number,
  ): DurableOutcome | null {
    if (self.health <= 0) return { status: "stopped", stoppedBecause: "dead", durationMs };
    if (this.movementTrouble && Date.now() - getNumber(this.movementTrouble.lastAt) < 2200) {
      return { status: "needs_rethink", stoppedBecause: "movement_stuck", durationMs };
    }

    switch (decision.action) {
      case "fight_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) return { status: "stopped", stoppedBecause: "target_unavailable", durationMs };
        const runnerStyleDailyBoss = this.isRunnerStyleDailyBossCombat(npc);
        if (npc.health <= 0 || npc.defeatedAt > 0) {
          if (npc.hasLoot) return null;
          return { status: "completed", stoppedBecause: "target_defeated", durationMs };
        }
        if (!runnerStyleDailyBoss && (this.lastAction.startsWith("retreat_") || this.lastAction.startsWith("auto_control_frostNova"))) {
          return { status: "safety_stop", stoppedBecause: this.lastAction, durationMs };
        }
        const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
        const attackers = this.getAttackers(self);
        if (!runnerStyleDailyBoss && healthRatio < CRITICAL_HEALTH_RATIO && attackers.length > 0) {
          return { status: "safety_stop", stoppedBecause: "critical_health_under_attack", durationMs };
        }
        return null;
      }
      case "accept_quest": {
        const questId = cleanText(decision.questId, 96);
        if (questId && self.quests.some((quest) => getString(quest.id) === questId && getString(quest.status) !== "completed")) {
          return { status: "completed", stoppedBecause: "quest_accepted", durationMs };
        }
        return null;
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        if (questId && self.quests.some((quest) => getString(quest.id) === questId && getString(quest.status) === "completed")) {
          return { status: "completed", stoppedBecause: "quest_turned_in", durationMs };
        }
        const memory = questId ? this.questMemory.get(questId) : null;
        if (memory?.kind === "completed" && Date.now() - memory.observedAt < 6_000) {
          return { status: "completed", stoppedBecause: "quest_completed_message", durationMs };
        }
        return null;
      }
      case "loot": {
        const lootWindow = this.resolveOpenLootWindow(decision.npcRef);
        if (lootWindow && !this.openLootWindow) return { status: "completed", stoppedBecause: "loot_collected_or_unavailable", durationMs };
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc || !npc.hasLoot) return { status: "completed", stoppedBecause: "loot_collected_or_unavailable", durationMs };
        return null;
      }
      case "travel_route":
        if (this.routeQueue.length === 0 && !this.targetPoint) return { status: "completed", stoppedBecause: "route_arrived", durationMs };
        return null;
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        if (x !== undefined && z !== undefined && distance2d(self, { x, z }) <= 2.4) {
          return { status: "completed", stoppedBecause: "arrived", durationMs };
        }
        return null;
      }
      case "move_near_npc":
      case "interact_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) return { status: "stopped", stoppedBecause: "npc_unavailable", durationMs };
        if (distance2d(self, npc) <= INTERACT_SEND_RANGE && decision.action === "interact_npc" && this.lastAction.startsWith("interact_npc")) {
          return { status: "completed", stoppedBecause: "interaction_sent", durationMs };
        }
        if (distance2d(self, npc) <= INTERACT_APPROACH_DISTANCE + 1.8 && decision.action === "move_near_npc") {
          return { status: "completed", stoppedBecause: "near_npc", durationMs };
        }
        return null;
      }
      case "move_near_player": {
        const player = this.resolvePlayer(decision.playerRef);
        if (!player) return { status: "stopped", stoppedBecause: "player_unavailable", durationMs };
        if (distance2d(self, player) <= 3.5) return { status: "completed", stoppedBecause: "near_player", durationMs };
        return null;
      }
      case "sell_trash_items":
        if (this.recentMessages.some((message) => message.startsWith("trashVendor:"))) {
          return { status: "completed", stoppedBecause: "trash_sale_result", durationMs };
        }
        return null;
      case "sell_fish_items":
        if (this.recentMessages.some((message) => message.startsWith("fishingVendor:"))) {
          return { status: "completed", stoppedBecause: "fishing_sale_result", durationMs };
        }
        return null;
      case "purchase_fishing_supply":
        if (this.recentMessages.some((message) => message.startsWith("fishingSupply:"))) {
          return { status: "completed", stoppedBecause: "fishing_supply_purchase_result", durationMs };
        }
        return null;
      case "fish":
        if (this.recentMessages.some((message) => message.startsWith("fishing:"))) {
          if (this.getOpenFishingLootWindow()) return null;
          return { status: "completed", stoppedBecause: this.lastAction.startsWith("loot_fishing") ? "fishing_loot_collected" : "fishing_result", durationMs };
        }
        return null;
      default:
        if (durationMs >= SHORT_ACTION_SETTLE_MS) return { status: "accepted", stoppedBecause: "settled", durationMs };
        return null;
    }
  }

  private continueDurableAction(decision: AgentBridgeDecision, self: RuntimePlayer) {
    switch (decision.action) {
      case "fight_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) return;
        if (npc.health <= 0 || npc.defeatedAt > 0) {
          if (!npc.hasLoot) return;
          if (distance2d(self, npc) > LOOT_SEND_RANGE) {
            this.moveTo(point(npc));
            this.lastAction = `move_to_loot ${npc.id}`;
          } else {
            this.targetPoint = null;
            this.send("lootCorpse", { npcId: npc.id });
            this.lastAction = `loot ${npc.id}`;
          }
          return;
        }
        if (!this.engagedNpcId) this.setEngagement(self, npc.id);
        this.fight(self, npc);
        return;
      }
      case "accept_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) return;
        this.focusedQuestId = questId;
        if (self.quests.some((quest) => getString(quest.id) === questId && getString(quest.status) !== "completed")) return;
        this.clearRoute();
        this.targetPoint = null;
        this.send("acceptQuest", { questId, npcId: npc.id });
        this.lastAction = `accept_quest ${questId}`;
        return;
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveQuestTurnInNpc(questId);
        if (!questId || !npc) return;
        this.focusedQuestId = questId;
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveToNpcInteractionRange(self, npc, QUEST_SEND_RANGE, `move_to_complete ${questId}`);
        } else {
          this.clearRoute();
          this.targetPoint = null;
          this.send("completeQuest", { questId, npcId: npc.id });
          this.lastAction = `complete_quest ${questId}`;
        }
        return;
      }
      case "loot": {
        const lootWindow = this.resolveOpenLootWindow(decision.npcRef);
        if (lootWindow) {
          this.clearEngagement();
          this.clearRoute();
          this.targetPoint = null;
          this.send("lootCorpse", { npcId: lootWindow.npcId, itemId: cleanText(decision.itemId, 96) || undefined });
          this.lastAction = lootWindow.source === "fishing" ? `loot_fishing ${lootWindow.npcId}` : `loot_window ${lootWindow.npcId}`;
          return;
        }
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc || !npc.hasLoot) return;
        this.clearRoute();
        if (distance2d(self, npc) > LOOT_SEND_RANGE) {
          this.moveTo(point(npc));
          this.lastAction = `move_to_loot ${npc.id}`;
        } else {
          this.targetPoint = null;
          this.send("lootCorpse", { npcId: npc.id, itemId: cleanText(decision.itemId, 96) || undefined });
          this.lastAction = `loot ${npc.id}`;
        }
        return;
      }
      case "interact_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) return;
        this.clearRoute();
        if (distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_near_npc ${npc.id}`;
        } else {
          this.targetPoint = null;
          this.send("interact", { npcId: npc.id });
          this.lastAction = `interact_npc ${npc.id}`;
        }
        return;
      }
      case "sell_trash_items": {
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveNpc("trash-mfer");
        if (!npc) return;
        this.clearRoute();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_sell_trash ${npc.id}`;
        } else {
          const itemId = cleanText(decision.itemId, 96);
          const quantity = normalizeTrashSellQuantity(decision.quantity, self.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1);
          this.targetPoint = null;
          this.send("sellTrashItems", itemId ? { itemId, quantity } : { sellAll: true });
          this.lastAction = itemId ? `sell_trash_items ${itemId} x${quantity}` : "sell_trash_items all";
        }
        return;
      }
      case "fish": {
        this.clearRoute();
        const shore = { x: FISHING_ZONE.x + FISHING_ZONE.waterRadius + 3.2, z: FISHING_ZONE.z - 1.2 };
        if (distance2d(self, shore) > 2.6) {
          this.moveTo(shore);
          this.lastAction = "move_to_fishing_pond";
          return;
        }
        this.targetPoint = null;
        const fishingState = cleanText(self.fishingState, 24);
        const attemptId = cleanText(self.fishingAttemptId, 128);
        if (fishingState === "bite") {
          this.send("reelFishing", attemptId ? { attemptId } : {});
          this.lastAction = "reel_fishing";
          return;
        }
        if (fishingState) {
          this.lastAction = `wait_fishing_${fishingState}`;
          return;
        }
        this.send("startFishing", {});
        this.lastAction = "start_fishing";
        return;
      }
      case "sell_fish_items": {
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveNpc(FISHING_VENDOR_NPC_ID);
        if (!npc) return;
        this.clearRoute();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_sell_fish ${npc.id}`;
        } else {
          const requestedItemId = cleanText(decision.itemId, 96);
          const itemId = isFishingSellableItemId(requestedItemId) ? requestedItemId : "";
          const quantity = normalizeFishingSellQuantity(decision.quantity, 999);
          this.targetPoint = null;
          this.send("sellFishingItems", itemId ? { itemId, quantity } : { sellAll: true });
          this.lastAction = itemId ? `sell_fish_items ${itemId} x${quantity}` : "sell_fish_items all";
        }
        return;
      }
      default:
        return;
    }
  }

  private buildActionReport(decision: AgentBridgeDecision, before: PlayerActionSnapshot, outcome: DurableOutcome): ActionReport {
    const self = this.self();
    const after = self ? this.snapshotPlayer(self) : null;
    const questProgress = after?.quests ?? before.quests;
    const questChanges = after ? this.describeQuestChanges(before, after) : [];
    const activeCommand = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    const suggestedNextAction = self ? this.buildSuggestedNextAction(self, activeCommand?.status === "running"
      ? {
        skipOptionalBossDailies: this.shouldSkipOptionalBossDailies(activeCommand),
        profile: activeCommand.profile,
        deathCount: activeCommand.deathCount,
        focusedQuestId: activeCommand.questId,
      }
      : { skipOptionalBossDailies: true }) : null;
    const continuePrompt = suggestedNextAction
      ? `Suggested next: ${suggestedNextAction.action} because ${suggestedNextAction.reason}`
      : "Observe again, then choose the next action from current state.";
    const target = this.describeDecisionTarget(decision);
    const summary = this.summarizeAction(decision, before, after, outcome, questChanges, suggestedNextAction);
    return {
      status: outcome.status,
      stoppedBecause: outcome.stoppedBecause,
      summary,
      durationMs: outcome.durationMs,
      action: decision.action,
      target,
      reason: decision.reason,
      health: after ? `${Math.ceil(after.health)}/${Math.ceil(after.maxHealth)}` : "unknown",
      position: after?.position ?? null,
      questProgress,
      questChanges,
      recentMessages: this.recentMessages.slice(-8),
      suggestedNextAction,
      continuePrompt,
    };
  }

  private summarizeAction(
    decision: AgentBridgeDecision,
    before: PlayerActionSnapshot,
    after: PlayerActionSnapshot | null,
    outcome: DurableOutcome,
    questChanges: Array<{ id: string; before: string; after: string }>,
    suggestedNextAction: SuggestedDecision | null,
  ) {
    const target = this.describeDecisionTarget(decision);
    const health = after ? `${Math.ceil(after.health)}/${Math.ceil(after.maxHealth)}` : "unknown";
    const hpDelta = after ? Math.ceil(after.health - before.health) : 0;
    const healthText = after ? `hp ${health}${hpDelta < 0 ? ` (${hpDelta})` : ""}` : "hp unknown";
    const questText = questChanges.length
      ? `quest ${questChanges.map((change) => `${change.id} ${change.before}->${change.after}`).join(", ")}`
      : this.describeFocusedQuestProgress(after ?? before);
    const nextText = suggestedNextAction ? `next ${suggestedNextAction.action}` : "next observe";
    return [
      `${decision.action}${target ? ` ${target}` : ""}`,
      outcome.stoppedBecause.replace(/_/g, " "),
      healthText,
      questText,
      nextText,
    ].filter(Boolean).join("; ");
  }

  private describeDecisionTarget(decision: AgentBridgeDecision) {
    const npc = this.resolveNpc(decision.npcRef);
    const player = this.resolvePlayer(decision.playerRef);
    const questId = cleanText(decision.questId, 96);
    const itemId = cleanText(decision.itemId, 96);
    const route = cleanText(decision.text, 80);
    if (npc) return npc.name || npc.id;
    if (player) return player.name || player.sessionId;
    if (questId) return questId;
    if (itemId) return itemId;
    if (decision.action === "travel_route" && route) return route;
    return "";
  }

  private questSummaries(self: RuntimePlayer) {
    return self.quests.map((quest) => ({
      id: getString(quest.id),
      status: getString(quest.status),
      progress: getNumber(quest.progress),
      required: getNumber(quest.required),
    })).filter((quest) => quest.id);
  }

  private describeQuestChanges(before: PlayerActionSnapshot, after: PlayerActionSnapshot) {
    const beforeById = new Map(before.quests.map((quest) => [quest.id, quest]));
    return after.quests.flatMap((quest) => {
      const previous = beforeById.get(quest.id);
      const beforeLabel = previous ? questProgressLabel(previous) : "not_started";
      const afterLabel = questProgressLabel(quest);
      return beforeLabel === afterLabel ? [] : [{ id: quest.id, before: beforeLabel, after: afterLabel }];
    }).slice(0, 8);
  }

  private describeFocusedQuestProgress(snapshot: PlayerActionSnapshot) {
    const focused = this.focusedQuestId
      ? snapshot.quests.find((quest) => quest.id === this.focusedQuestId)
      : null;
    const quest = focused
      ?? snapshot.quests.find((entry) => entry.status === "ready")
      ?? snapshot.quests.find((entry) => entry.status === "active");
    return quest ? `quest ${quest.id} ${questProgressLabel(quest)}` : "";
  }

  private buildSuggestedNextAction(self: RuntimePlayer, options: DecisionPlanningOptions = {}): SuggestedDecision | null {
    if (self.health <= 0) return { action: "respawn", reason: "self health is 0" };
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const attackers = this.getAttackers(self).sort((a, b) => distance2d(self, a) - distance2d(self, b));
    const runnerDailyBossTarget = options.skipOptionalBossDailies ? null : this.findRunnerDailyBossQuestTarget(self);
    if (!runnerDailyBossTarget && attackers.length > 0 && (healthRatio < CRITICAL_HEALTH_RATIO || attackers.length >= 2)) {
      const groupQuestId = this.activeGroupCommandQuestId();
      const activeGroupObjective = groupQuestId ? this.findActiveGroupObjectiveNpc(self, groupQuestId) : null;
      const activeGroupObjectiveExtraAttackers = activeGroupObjective
        ? attackers.filter((npc) => npc.id !== activeGroupObjective.id)
        : attackers;
      if (
        activeGroupObjective
        && this.hasRecentNpcPlayerCombat(activeGroupObjective.id, GROUP_ENCOUNTER_PREP_SKIP_AFTER_PULL_MS)
        && activeGroupObjectiveExtraAttackers.length === 0
        && healthRatio >= GROUP_ENCOUNTER_PRESS_HEALTH_RATIO
        && this.healthyQuestParticipantCountNear(self, activeGroupObjective, GROUP_ENCOUNTER_READY_RADIUS, groupQuestId) >= this.suggestedGroupSize(groupQuestId)
      ) {
        return {
          action: "fight_npc",
          reason: `${activeGroupObjective.name || activeGroupObjective.id} is the active group objective under pressure`,
          questId: groupQuestId,
          npcRef: activeGroupObjective.id,
        };
      }
      const pressableAttacker = healthRatio > CRITICAL_HEALTH_RATIO ? this.findPressableAttacker(self, attackers) : null;
      if (pressableAttacker) {
        return {
          action: "fight_npc",
          reason: `${pressableAttacker.name || pressableAttacker.id} is attacking and is safer to clear than to keep dragging aggro`,
          npcRef: pressableAttacker.id,
        };
      }
      const destination = this.retreatDestination(self);
      return {
        action: "move_to",
        reason: attackers.length >= 2 ? "multiple NPCs are attacking; reposition before choosing a target" : "health is critical under aggro",
        x: destination.x,
        z: destination.z,
      };
    }
    const loot = this.describeLootableCorpses(self)[0];
    if (loot && getNumber(loot.distance) <= 18) {
      return {
        action: "loot",
        reason: `${getString(loot.name) || "corpse"} has loot nearby`,
        npcRef: getString(loot.npcId) || getString(loot.id),
      };
    }
    const focusedQuestId = normalizeKnownQuestId(cleanText(options.focusedQuestId, 96));
    if (focusedQuestId) {
      const focusedDecision = this.chooseQuestGoalDecision(self, focusedQuestId, "quest_completed", {
        profile: options.profile ?? DEFAULT_COMMAND_PROFILE,
        deathCount: options.deathCount ?? 0,
      });
      if (focusedDecision) return this.toSuggestedDecision(focusedDecision);
      return {
        action: "wait",
        reason: `focused on ${focusedQuestId}; no actionable focused quest step is visible yet`,
        questId: focusedQuestId,
      };
    }
    const readyQuest = self.quests.find((quest) => (
      getString(quest.status) === "ready"
      && !(options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(getString(quest.id)))
    ));
    if (readyQuest) {
      const questId = getString(readyQuest.id);
      const npc = this.resolveQuestTurnInNpc(questId);
      const dailyReturnDecision = this.chooseDailyBossReturnDecision(self, questId, npc);
      if (dailyReturnDecision) return this.toSuggestedDecision(dailyReturnDecision);
      const routeDecision = this.chooseRouteToNpcAreaDecision(self, npc, `${questId} is ready to turn in`, questId);
      if (routeDecision) return this.toSuggestedDecision(routeDecision);
      return {
        action: "complete_quest",
        reason: `${questId} is ready to turn in`,
        questId,
        npcRef: npc?.id,
      };
    }
    const talentSpend = this.describeRecommendedTalentSpends(self, options.profile)[0];
    if (talentSpend) {
      return {
        action: "select_talent",
        reason: `unspent skill point available; ${talentSpend.reason}`,
        talentId: talentSpend.talentId,
      };
    }
    if (!runnerDailyBossTarget && attackers[0]) {
      const pressableAttacker = this.findPressableAttacker(self, attackers);
      if (!pressableAttacker) {
        const destination = this.retreatDestination(self);
        return {
          action: "move_to",
          reason: `${attackers[0].name} is attacking but health is below the safe press threshold`,
          x: destination.x,
          z: destination.z,
        };
      }
      return {
        action: "fight_npc",
        reason: `${pressableAttacker.name} is currently attacking and safe enough to pressure`,
        npcRef: pressableAttacker.id,
      };
    }
    if (healthRatio < RECOVER_HEALTH_RATIO) {
      return { action: "wait", reason: "recover health before pulling another target" };
    }
    const equipmentUpgrade = this.chooseEquipmentUpgradeDecision(self);
    if (equipmentUpgrade) return this.toSuggestedDecision(equipmentUpgrade);
    const utilityQuestDecision = this.chooseActiveUtilityQuestDecision(self);
    if (utilityQuestDecision) return this.toSuggestedDecision(utilityQuestDecision);
    if (!options.skipOptionalBossDailies && this.isActiveDailySignalQuest(self)) {
      const dailyBossTarget = this.findRunnerDailyBossQuestTarget(self);
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        DAILY_SIGNAL_QUEST_ID,
        dailyBossTarget?.npc ?? null,
        dailyBossTarget
          ? `${dailyBossTarget.npc.name} matches active quest ${DAILY_SIGNAL_QUEST_ID}`
          : `${DAILY_SIGNAL_QUEST_ID} is active and the runner daily boss target is not visible yet`,
      );
      if (dailyBossDecision) return this.toSuggestedDecision(dailyBossDecision);
    }
    const namedTarget = this.findNamedObjectiveTarget(self, "", { skipOptionalBossDailies: options.skipOptionalBossDailies });
    if (namedTarget) {
      const namedReason = `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`;
      const groupDecision = this.chooseGroupEncounterDecision(
        self,
        namedTarget.questId,
        namedTarget.npc,
        namedReason,
        options.profile,
        options.deathCount ?? 0,
        namedTarget.npc.id,
        { markAttempt: false },
      );
      if (groupDecision) return this.toSuggestedDecision(groupDecision);
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        namedTarget.questId,
        namedTarget.npc,
        `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`,
      );
      if (dailyBossDecision) return this.toSuggestedDecision(dailyBossDecision);
      if (this.hasOpenGroupEncounterPrep(namedTarget.questId, namedTarget.npc, namedTarget.npc.id)) {
        const prepDecision = this.chooseGroupEncounterPrepDecision(
          self,
          namedTarget.questId,
          namedTarget.npc,
          namedReason,
          namedTarget.npc.id,
          { ignoreAttemptCooldown: true, markAttempt: false },
        );
        if (prepDecision) return this.toSuggestedDecision(prepDecision);
      }
      const routeDecision = this.chooseRouteToNpcAreaDecision(self, namedTarget.npc, namedReason, namedTarget.questId);
      if (routeDecision) return this.toSuggestedDecision(routeDecision);
      return {
        action: "fight_npc",
        reason: namedReason,
        questId: namedTarget.questId,
        npcRef: namedTarget.npc.id,
      };
    }
    const missingObjectiveRoute = this.chooseMissingObjectiveRouteDecision(self, "", { ...options, planningOnly: true });
    if (missingObjectiveRoute) return this.toSuggestedDecision(missingObjectiveRoute);
    const questTarget = this.findGenericQuestTarget(self, "", { skipOptionalBossDailies: options.skipOptionalBossDailies });
    if (questTarget) {
      const targetReason = `${questTarget.npc.name} matches active quest ${questTarget.questId}`;
      const groupDecision = this.chooseGroupEncounterDecision(
        self,
        questTarget.questId,
        questTarget.npc,
        targetReason,
        options.profile,
        options.deathCount ?? 0,
        questTarget.npc.id,
        { markAttempt: false },
      );
      if (groupDecision) return this.toSuggestedDecision(groupDecision);
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        questTarget.questId,
        questTarget.npc,
        `${questTarget.npc.name} matches active quest ${questTarget.questId}`,
      );
      if (dailyBossDecision) return this.toSuggestedDecision(dailyBossDecision);
      if (this.hasOpenGroupEncounterPrep(questTarget.questId, questTarget.npc, questTarget.npc.id)) {
        const prepDecision = this.chooseGroupEncounterPrepDecision(
          self,
          questTarget.questId,
          questTarget.npc,
          targetReason,
          questTarget.npc.id,
          { ignoreAttemptCooldown: true, markAttempt: false },
        );
        if (prepDecision) return this.toSuggestedDecision(prepDecision);
      }
      const routeDecision = this.chooseRouteToNpcAreaDecision(self, questTarget.npc, targetReason, questTarget.questId);
      if (routeDecision) return this.toSuggestedDecision(routeDecision);
      return {
        action: "fight_npc",
        reason: targetReason,
        questId: questTarget.questId,
        npcRef: questTarget.npc.id,
      };
    }
    const genericTargetAreaDecision = this.chooseActiveGenericQuestTargetAreaDecision(self, "", options);
    if (genericTargetAreaDecision) return this.toSuggestedDecision(genericTargetAreaDecision);
    const availableQuest = this.describeAvailableQuestHints(self)
      .find((hint) => !(options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(getString(hint.questId))));
    if (availableQuest) {
      const questId = getString(availableQuest.questId);
      const npc = this.resolveNpc(getString(availableQuest.npcId));
      const routeDecision = this.chooseRouteToNpcAreaDecision(self, npc, `${getString(availableQuest.title) || questId} is available`, questId);
      if (routeDecision) return this.toSuggestedDecision(routeDecision);
      return {
        action: "accept_quest",
        reason: `${getString(availableQuest.title) || questId} is available`,
        questId,
        npcRef: getString(availableQuest.npcId),
      };
    }
    return { action: "wait", reason: "no urgent quest, loot, or combat action is visible" };
  }

  private async executeDecision(self: RuntimePlayer, decision: AgentBridgeDecision): Promise<BridgeActionResult | null> {
    switch (decision.action) {
      case "wait":
        this.targetPoint = null;
        this.movementJumpUntil = 0;
        this.clearEngagement();
        this.clearRoute();
        this.lastAction = "wait";
        return null;
      case "respawn":
        this.movementJumpUntil = 0;
        this.clearEngagement();
        this.clearRoute();
        this.send("respawn", {});
        this.lastAction = "respawn";
        return null;
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        if (x === undefined || z === undefined) throw new Error("move_to requires x and z");
        this.clearEngagement();
        this.clearRoute();
        this.moveTo({ x, z });
        this.movementJumpUntil = decision.jump ? Date.now() + 7_000 : 0;
        this.lastAction = `move_to ${round(x)},${round(z)}`;
        return null;
      }
      case "travel_route": {
        const routeText = cleanText(decision.text, 80);
        const route = resolveRoute(routeText);
        if (!route) throw new Error(`unknown route ${routeText}`);
        const routeId = normalizeRouteId(routeText);
        this.clearEngagement();
        if (this.currentRouteId !== routeId || this.routeQueue.length === 0) {
          this.currentRouteId = routeId;
          this.routeArrivalDistance = routeArrivalDistance(routeId);
          this.routeQueue = routeQueueFromPosition(route, self);
        }
        this.followRoute(self);
        this.lastAction = `travel_route ${routeText}`;
        return null;
      }
      case "move_near_npc":
      case "interact_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error(`${decision.action} requires npcRef`);
        if (isHostile(npc) && !npc.isImmortal && npc.health > 0 && npc.defeatedAt <= 0) {
          this.setEngagement(self, npc.id);
          this.clearRoute();
          this.fight(self, npc);
          return null;
        }
        this.clearEngagement();
        this.clearRoute();
        if (decision.action === "move_near_npc" || distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_near_npc ${npc.id}`;
          return null;
        }
        this.targetPoint = null;
        this.send("interact", { npcId: npc.id });
        this.lastAction = `interact_npc ${npc.id}`;
        return null;
      }
      case "move_near_player": {
        const player = this.resolvePlayer(decision.playerRef);
        if (!player) throw new Error("move_near_player requires playerRef");
        this.clearEngagement();
        this.clearRoute();
        this.moveTo(player);
        this.lastAction = `move_near_player ${player.name}`;
        return null;
      }
      case "accept_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) throw new Error("accept_quest requires questId and npcRef");
        this.focusedQuestId = questId;
        this.clearEngagement();
        this.clearRoute();
        this.targetPoint = null;
        this.send("acceptQuest", { questId, npcId: npc.id });
        this.lastAction = `accept_quest ${questId}`;
        return { ok: true, status: "quest_accept_sent", bridgeSessionId: this.id, lastAction: this.lastAction };
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveQuestTurnInNpc(questId);
        if (!questId || !npc) throw new Error("complete_quest requires questId and a visible turn-in npcRef");
        this.focusedQuestId = questId;
        this.clearEngagement();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveToNpcInteractionRange(self, npc, QUEST_SEND_RANGE, `move_to_complete ${questId}`);
          return null;
        }
        this.clearRoute();
        this.targetPoint = null;
        this.send("completeQuest", { questId, npcId: npc.id });
        this.lastAction = `complete_quest ${questId}`;
        return null;
      }
      case "cancel_quest": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("cancel_quest requires questId");
        if (this.focusedQuestId === questId) this.focusedQuestId = "";
        this.send("cancelQuest", { questId });
        this.lastAction = `cancel_quest ${questId}`;
        return null;
      }
      case "fight_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("fight_npc requires visible npcRef");
        this.assertNpcCombatTarget(npc, "fight_npc");
        this.setEngagement(self, npc.id);
        this.clearRoute();
        this.fight(self, npc);
        return null;
      }
      case "use_ability": {
        const actionId = normalizeCombatAction(decision.actionId);
        if (!actionId) throw new Error("use_ability requires actionId");
        if (decision.playerRef) {
          const player = this.resolvePlayer(decision.playerRef);
          if (!player) throw new Error("unknown playerRef");
          this.clearEngagement();
          this.clearRoute();
          this.cast(actionId, { kind: "player", id: player.sessionId });
        } else {
          if (actionId === "frostNova" || actionId === "whirlwind") {
            this.clearEngagement();
            this.clearRoute();
            this.cast(actionId, { kind: "npc", id: "" });
            this.lastAction = `use_ability ${actionId}`;
            return null;
          }
          const npc = this.resolveNpc(decision.npcRef);
          if (!npc && actionId !== "heal") throw new Error("use_ability requires npcRef or playerRef");
          if (npc && actionId !== "heal") this.assertNpcCombatTarget(npc, `use_ability ${actionId}`);
          if (actionId === "heal") this.clearEngagement();
          else if (npc) this.setEngagement(self, npc.id);
          this.clearRoute();
          this.cast(actionId, actionId === "heal" ? { kind: "player", id: self.sessionId } : { kind: "npc", id: npc?.id ?? "" });
        }
        this.lastAction = `use_ability ${actionId}`;
        return null;
      }
      case "loot": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("loot requires npcRef");
        this.clearEngagement();
        this.clearRoute();
        if (distance2d(self, npc) > LOOT_SEND_RANGE) {
          this.moveTo(point(npc));
          this.lastAction = `move_to_loot ${npc.id}`;
          return null;
        }
        this.targetPoint = null;
        this.send("lootCorpse", { npcId: npc.id, itemId: cleanText(decision.itemId, 96) || undefined });
        this.lastAction = `loot ${npc.id}`;
        return null;
      }
      case "equip_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("equip_item requires itemId");
        this.clearEngagement();
        this.send("equipItem", { itemId, chainTokenId: cleanText(decision.chainTokenId, 128) || undefined });
        this.lastAction = `equip_item ${itemId}`;
        return null;
      }
      case "unequip_item": {
        const slot = cleanText(decision.slotId, 40) || cleanText(decision.text, 40);
        if (!slot) throw new Error("unequip_item requires slotId or text");
        this.clearEngagement();
        this.send("unequipItem", { slot });
        this.lastAction = `unequip_item ${slot}`;
        return null;
      }
      case "use_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("use_item requires itemId");
        this.clearEngagement();
        this.send("useItem", { itemId, chainTokenId: cleanText(decision.chainTokenId, 128) || undefined });
        this.lastAction = `use_item ${itemId}`;
        return null;
      }
      case "select_talent": {
        const talentId = cleanText(decision.talentId, 96) || cleanText(decision.text, 96);
        if (!talentId) throw new Error("select_talent requires talentId or text");
        this.clearEngagement();
        this.send("selectTalent", { talentId });
        this.lastAction = `select_talent ${talentId}`;
        return null;
      }
      case "swap_eth_for_mfergpt": {
        const amountEth = cleanText(decision.amountEth, 32) || DEFAULT_SWAP_ETH_AMOUNT;
        this.lastAction = `swap_eth_for_mfergpt external ${amountEth}`;
        this.swapEthSpendRequestedWei += 1n;
        return {
          ok: false,
          status: "wallet_action_required",
          bridgeSessionId: this.id,
          lastAction: this.lastAction,
          walletActionRequired: {
            action: "swap_eth_for_mfergpt",
            reason: "The bridge is session-token authenticated and cannot sign wallet transactions. Bankr should perform the Base ETH -> MFERGPT swap in its wallet context, then continue gameplay.",
            chainId: BASE_CHAIN_ID,
            amountEth,
            tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
            routerAddress: BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
            fallbackUrl: "https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07",
          },
        };
      }
      case "register_chain_gear": {
        const tokenId = cleanText(decision.text, 96);
        if (!tokenId) throw new Error("register_chain_gear requires token id in text");
        this.clearEngagement();
        this.send("registerChainGear", { tokenId });
        this.lastAction = `register_chain_gear ${tokenId}`;
        return null;
      }
      case "purchase_potion_shop_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("purchase_potion_shop_item requires itemId");
        const quantity = normalizePurchaseQuantity(decision.quantity);
        const payment = this.buildPaymentProof(decision);
        if (!payment) {
          const required = potionShopPaymentRequired(itemId, quantity);
          this.lastAction = `purchase_potion_shop_item needs_payment ${itemId} x${quantity}`;
          return { ok: false, status: "payment_required", bridgeSessionId: this.id, lastAction: this.lastAction, paymentRequired: required };
        }
        this.mferGptSpendProofedWei += BigInt(payment.amountWei);
        this.clearEngagement();
        this.send("purchasePotionShopItem", { itemId, quantity, payment });
        this.lastAction = `purchase_potion_shop_item ${itemId} x${quantity}`;
        return null;
      }
      case "purchase_fishing_supply": {
        const payment = this.buildPaymentProof(decision);
        if (!payment) {
          const required = fishingSupplyPaymentRequired();
          this.lastAction = "purchase_fishing_supply needs_payment";
          return { ok: false, status: "payment_required", bridgeSessionId: this.id, lastAction: this.lastAction, paymentRequired: required };
        }
        this.mferGptSpendProofedWei += BigInt(payment.amountWei);
        this.clearEngagement();
        this.send("purchaseFishingSupply", { payment });
        this.lastAction = `purchase_fishing_supply ${FISHING_CHUM_ITEM_ID}`;
        return null;
      }
      case "sell_trash_items": {
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveNpc("trash-mfer");
        if (!npc) throw new Error("sell_trash_items requires trash-mfer to be visible in room state");
        this.clearEngagement();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_sell_trash ${npc.id}`;
          return null;
        }
        const itemId = cleanText(decision.itemId, 96);
        const quantity = normalizeTrashSellQuantity(decision.quantity, self.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1);
        this.targetPoint = null;
        this.send("sellTrashItems", itemId ? { itemId, quantity } : { sellAll: true });
        this.lastAction = itemId ? `sell_trash_items ${itemId} x${quantity}` : "sell_trash_items all";
        return null;
      }
      case "fish": {
        this.clearEngagement();
        const lootWindow = this.getOpenFishingLootWindow();
        if (lootWindow) {
          this.targetPoint = null;
          this.send("lootCorpse", { npcId: lootWindow.npcId });
          this.lastAction = `loot_fishing ${lootWindow.npcId}`;
          return null;
        }
        const shore = { x: FISHING_ZONE.x + FISHING_ZONE.waterRadius + 3.2, z: FISHING_ZONE.z - 1.2 };
        if (distance2d(self, shore) > 2.6) {
          this.moveTo(shore);
          this.lastAction = "move_to_fishing_pond";
          return null;
        }
        const fishingState = cleanText(self.fishingState, 24);
        const attemptId = cleanText(self.fishingAttemptId, 128);
        this.targetPoint = null;
        if (fishingState === "bite") {
          this.send("reelFishing", attemptId ? { attemptId } : {});
          this.lastAction = "reel_fishing";
          return null;
        }
        if (fishingState) {
          this.lastAction = `wait_fishing_${fishingState}`;
          return null;
        }
        this.send("startFishing", {});
        this.lastAction = "start_fishing";
        return null;
      }
      case "sell_fish_items": {
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveNpc(FISHING_VENDOR_NPC_ID);
        if (!npc) throw new Error("sell_fish_items requires fish monger to be visible in room state");
        this.clearEngagement();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_sell_fish ${npc.id}`;
          return null;
        }
        const requestedItemId = cleanText(decision.itemId, 96);
        const itemId = isFishingSellableItemId(requestedItemId) ? requestedItemId : "";
        const quantity = normalizeFishingSellQuantity(decision.quantity, 999);
        this.targetPoint = null;
        this.send("sellFishingItems", itemId ? { itemId, quantity } : { sellAll: true });
        this.lastAction = itemId ? `sell_fish_items ${itemId} x${quantity}` : "sell_fish_items all";
        return null;
      }
      case "update_traits": {
        this.clearEngagement();
        const payment = this.buildPaymentProof(decision);
        if (payment) this.mferGptSpendProofedWei += BigInt(payment.amountWei);
        const traits = this.resolveAgentTraits(decision.traits);
        this.send("updateTraits", {
          traits,
          name: this.agentName,
          attemptId: `bankr-bridge-${Date.now()}`,
          payment: payment || undefined,
        });
        this.lastAction = `update_traits ${JSON.stringify(traits)}`;
        return null;
      }
      case "share_quest_link": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("share_quest_link requires questId");
        this.focusedQuestId = questId;
        this.clearEngagement();
        this.send("shareQuestLink", { questId, url: "https://game.mfergpt.lol" });
        this.lastAction = `share_quest_link ${questId}`;
        return null;
      }
      case "chat": {
        const text = cleanText(decision.text, 180);
        if (!text) throw new Error("chat requires text");
        this.clearEngagement();
        if (!this.canSendChat()) {
          const retryAfterMs = this.chatRetryAfterMs();
          this.lastAction = "chat_cooldown";
          return {
            ok: false,
            status: "chat_cooldown",
            bridgeSessionId: this.id,
            lastAction: this.lastAction,
            retryAfterMs,
            error: `chat is cooling down; retry in ${Math.ceil(retryAfterMs / 1000)}s`,
          };
        }
        this.sendChat(text);
        this.lastAction = `chat ${text.slice(0, 24)}`;
        return null;
      }
      case "emote": {
        const emoteId = cleanText(decision.emoteId, 40) || "wave";
        this.clearEngagement();
        if (!this.canSendEmote()) {
          this.lastAction = "emote_cooldown";
          return null;
        }
        this.sendEmote(emoteId);
        this.lastAction = `emote ${emoteId}`;
        return null;
      }
      default:
        throw new Error(`unknown action ${decision.action}`);
    }
  }

  private sendInput() {
    const self = this.self();
    if (!this.room || !self) return;
    this.updateLastSafePoint(self);
    this.maintainSurvival(self);
    this.continueEngagement(self);
    if (!this.engagedNpcId && this.routeQueue.length > 0) this.followRoute(self);
    let x = 0;
    let z = 0;
    if (Date.now() >= this.stationaryUntil && this.targetPoint) {
      this.updateMovementRecovery(self);
      if (this.targetPoint) {
        const movementTarget = this.currentMovementTarget();
        const dx = movementTarget.x - self.x;
        const dz = movementTarget.z - self.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.7) {
          x = dx / length;
          z = dz / length;
          this.yaw = Math.atan2(x, z);
        } else {
          this.targetPoint = null;
        }
      }
    }
    const jump = Boolean(
      this.targetPoint
      && Date.now() < this.movementJumpUntil
      && Math.floor(Date.now() / 520) % 2 === 0,
    );
    this.send("input", { x, z, yaw: this.yaw, sprint: Boolean(this.targetPoint), jump, seq: ++this.seq });
    this.publishAgentStatus(self);
  }

  private fight(self: RuntimePlayer, npc: RuntimeNpc) {
    this.clearRoute();
    const distance = distance2d(self, npc);
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const runnerStyleDailyBoss = this.isRunnerStyleDailyBossCombat(npc);
    const groupEncounterObjective = this.isActiveGroupEncounterObjectiveForSelf(self, npc);
    if (!runnerStyleDailyBoss && !groupEncounterObjective && healthRatio < CRITICAL_HEALTH_RATIO && (this.lastSafePoint || this.combatAnchor)) {
      this.startRetreat(self, "retreat_critical_health");
      return;
    }
    if (!runnerStyleDailyBoss && attackers.length >= 2 && !this.shouldPressCurrentFight(self, npc, attackers)) {
      const pressableAttacker = this.findPressableAttacker(self, attackers);
      if (pressableAttacker && pressableAttacker.id !== npc.id) {
        this.fight(self, pressableAttacker);
        return;
      }
      if (groupEncounterObjective) {
        this.moveTo(this.groupEncounterRecoveryPoint(self, npc, healthRatio));
        this.lastAction = `kite_group_boss_overpull ${npc.id}`;
        return;
      }
      this.startRetreat(self, "retreat_overpull");
      return;
    }
    if (groupEncounterObjective && this.shouldCreateSpaceBeforeGroupEncounterHeal(self, npc, healthRatio, distance)) {
      if (distance <= COMBAT.actions.frostNova.maxRange && this.canUse(self, "frostNova")) {
        this.cast("frostNova", { kind: "npc", id: "" });
        this.lastAction = `control_group_boss ${npc.id}`;
        return;
      }
      this.moveTo(this.groupEncounterRecoveryPoint(self, npc, healthRatio));
      this.lastAction = `kite_group_boss_recover ${npc.id}`;
      return;
    }
    const actionId = this.chooseCombatAction(self, npc, distance);
    const action = COMBAT.actions[actionId];
    if (
      groupEncounterObjective
      && actionId !== "heal"
      && action.maxRange >= 20
      && distance < Math.max(10, action.maxRange * 0.45)
      && healthRatio > CRITICAL_HEALTH_RATIO
    ) {
      this.moveTo(this.combatKitePoint(self, npc, 9));
      this.lastAction = `kite_group_boss ${npc.id}`;
      return;
    }
    if (distance > action.maxRange * 0.9) {
      const directCombatPoint = this.combatRangePoint(self, npc, action);
      const safeApproach = runnerStyleDailyBoss ? null : this.safeCombatApproachPoint(self, npc, action, directCombatPoint);
      if (safeApproach && distance2d(self, safeApproach.point) > SAFE_APPROACH_ARRIVAL_DISTANCE) {
        this.moveTo(safeApproach.point);
        this.lastAction = `safe_approach ${npc.id} via ${safeApproach.label}`;
        return;
      }
      this.moveTo(directCombatPoint);
      this.lastAction = `move_to_fight ${npc.id}`;
      return;
    }
    this.targetPoint = null;
    this.cast(actionId, actionId === "heal" ? { kind: "player", id: self.sessionId } : { kind: "npc", id: npc.id });
    this.lastAction = `combat ${actionId} ${npc.id}`;
  }

  private continueEngagement(self: RuntimePlayer) {
    if (!this.engagedNpcId || Date.now() < this.nextAutoCombatAt || self.health <= 0 || self.castingAction) return;
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const npc = this.npcs.get(this.engagedNpcId);
    const runnerStyleDailyBoss = this.isRunnerStyleDailyBossCombat(npc);
    const groupEncounterObjective = this.isActiveGroupEncounterObjectiveForSelf(self, npc);
    if (!runnerStyleDailyBoss && !groupEncounterObjective && (attackers.length >= 2 || healthRatio < 0.55)) {
      if (npc && this.shouldPressCurrentFight(self, npc, attackers)) {
        this.nextAutoCombatAt = Date.now() + 650;
        this.fight(self, npc);
        return;
      }
      this.startRetreat(self, attackers.length >= 2 ? "retreat_overpull" : "retreat_low_health");
      return;
    }
    if (!runnerStyleDailyBoss && groupEncounterObjective && healthRatio < CRITICAL_HEALTH_RATIO) {
      if (npc) {
        this.nextAutoCombatAt = Date.now() + 900;
        this.moveTo(this.groupEncounterRecoveryPoint(self, npc, healthRatio));
        this.lastAction = `recover_group_boss_critical ${npc.id}`;
        return;
      }
      this.startRetreat(self, "retreat_group_boss_critical");
      return;
    }
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) {
      this.clearEngagement();
      return;
    }
    this.nextAutoCombatAt = Date.now() + 650;
    this.fight(self, npc);
  }

  private maintainSurvival(self: RuntimePlayer) {
    if (Date.now() < this.nextAutoConsumableAt || self.health <= 0) return;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const attackers = this.getAttackers(self);
    const closeAttackers = attackers.filter((npc) => distance2d(self, npc) <= 6.5);
    const engagedNpc = this.activeEngagementNpc();
    const runnerStyleDailyBoss = this.isRunnerStyleDailyBossCombat(engagedNpc);
    const groupEncounterObjective = this.isActiveGroupEncounterObjectiveForSelf(self, engagedNpc);
    const pressCurrentFight = Boolean(engagedNpc && this.shouldPressCurrentFight(self, engagedNpc, attackers));
    if (healthRatio <= (groupEncounterObjective ? GROUP_ENCOUNTER_CONSUMABLE_HEALTH_RATIO : 0.56) && inventoryCount(self, "red-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "red-juice" });
      this.lastAction = "auto_use red-juice";
      return;
    }
    if (healthRatio <= (groupEncounterObjective ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.46) && inventoryCount(self, "field-snack") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "field-snack" });
      this.lastAction = "auto_use field-snack";
      return;
    }
    if (healthRatio <= (groupEncounterObjective ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.68) && self.mana < COMBAT.actions.heal.manaCost && inventoryCount(self, "blue-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "blue-juice" });
      this.lastAction = "auto_use blue-juice";
      return;
    }
    if (engagedNpc && groupEncounterObjective && this.shouldCreateSpaceBeforeGroupEncounterHeal(self, engagedNpc, healthRatio)) {
      const distance = distance2d(self, engagedNpc);
      this.nextAutoConsumableAt = Date.now() + 1200;
      if (distance <= COMBAT.actions.frostNova.maxRange && this.canUse(self, "frostNova") && !self.castingAction) {
        this.cast("frostNova", { kind: "npc", id: "" });
        this.lastAction = `auto_control_group_boss ${engagedNpc.id}`;
        return;
      }
      this.moveTo(this.groupEncounterRecoveryPoint(self, engagedNpc, healthRatio));
      this.lastAction = `auto_kite_group_boss_recover ${engagedNpc.id}`;
      return;
    }
    if (healthRatio <= (groupEncounterObjective ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.62) && this.canUse(self, "heal") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 2200;
      this.cast("heal", { kind: "player", id: self.sessionId });
      this.lastAction = "auto_heal self";
      return;
    }
    const groupQuestId = this.activeGroupCommandQuestId();
    const allyToHeal = groupQuestId && healthRatio >= PRESS_SINGLE_ATTACKER_HEALTH_RATIO
      ? this.findGroupAllyNeedingHeal(self, GROUP_ENCOUNTER_ALLY_HEAL_RATIO, COMBAT.actions.heal.maxRange)
      : null;
    if (allyToHeal && self.mana < COMBAT.actions.heal.manaCost && inventoryCount(self, "blue-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "blue-juice" });
      this.lastAction = `auto_use blue-juice ally_heal ${allyToHeal.player.name || "ally"}`;
      return;
    }
    if (allyToHeal && this.canUse(self, "heal") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 2200;
      this.cast("heal", { kind: "player", id: allyToHeal.player.sessionId });
      this.lastAction = `auto_heal ally ${allyToHeal.player.name || allyToHeal.player.sessionId}`;
      return;
    }
    if (attackers.length >= 2 && closeAttackers.length > 0 && this.canUse(self, "frostNova") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 1800;
      this.cast("frostNova", { kind: "npc", id: "" });
      if (pressCurrentFight || runnerStyleDailyBoss || groupEncounterObjective) this.lastAction = "auto_control_frostNova_press";
      else this.startRetreat(self, "auto_control_frostNova", 5600);
      return;
    }
  }

  private groupEncounterPressureAttacker(self: RuntimePlayer, questId: string, attackers = this.getAttackers(self)) {
    return attackers
      .filter((npc) => this.groupEncounterQuestForNpc(npc) === questId)
      .sort((a, b) => distance2d(self, a) - distance2d(self, b))[0] ?? null;
  }

  private shouldCreateSpaceBeforeGroupEncounterHeal(self: RuntimePlayer, npc: RuntimeNpc, healthRatio: number, distance = distance2d(self, npc)) {
    if (!this.isGroupEncounterObjectiveNpc(npc)) return false;
    if (healthRatio <= CRITICAL_HEALTH_RATIO) return true;
    return healthRatio <= GROUP_ENCOUNTER_REPOSITION_HEALTH_RATIO
      && distance <= GROUP_ENCOUNTER_CAST_PRESSURE_DISTANCE;
  }

  private groupEncounterRecoveryPoint(self: RuntimePlayer, npc: RuntimeNpc, healthRatio: number) {
    const questId = this.groupEncounterQuestForNpc(npc);
    if (!questId) return this.combatKitePoint(self, npc, GROUP_ENCOUNTER_RECOVERY_KITE_DISTANCE);
    const desiredDistance = healthRatio <= CRITICAL_HEALTH_RATIO
      ? GROUP_ENCOUNTER_CRITICAL_RECOVERY_KITE_DISTANCE
      : GROUP_ENCOUNTER_RECOVERY_KITE_DISTANCE;
    const idealBossDistance = healthRatio <= CRITICAL_HEALTH_RATIO ? 24 : 18;
    const rallyPoint = this.groupEncounterRallyPoint(questId, npc.id, npc);
    const candidates = [
      this.combatKitePoint(self, npc, desiredDistance),
      this.threatAvoidancePoint(self, desiredDistance),
      pointAlongVector(npc, self, idealBossDistance),
      pointAlongVector(npc, rallyPoint, idealBossDistance),
      rotatePointAround(npc, self, Math.PI / 5, idealBossDistance),
      rotatePointAround(npc, self, -Math.PI / 5, idealBossDistance),
    ]
      .map((candidate) => point(resolveWorldCollision(candidate.x, candidate.z, PLAYER.radius)))
      .filter((candidate, index, list) => (
        list.findIndex((entry) => distance2d(entry, candidate) < 1.2) === index
      ))
      .map((candidate) => ({
        point: candidate,
        density: this.nearbyHostileCount(candidate, 10, npc.id),
        pathRisk: this.scoreHostileTravelPath(self, candidate, HOSTILE_PATH_CORRIDOR_RADIUS, npc),
        bossDistance: distance2d(candidate, npc),
        selfDistance: distance2d(candidate, self),
        rallyDistance: distance2d(candidate, rallyPoint),
      }))
      .filter((candidate) => candidate.bossDistance >= 10 && candidate.bossDistance <= GROUP_ENCOUNTER_MAX_RECOVERY_BOSS_DISTANCE)
      .sort((a, b) => (
        a.density - b.density
        || a.pathRisk - b.pathRisk
        || Math.abs(idealBossDistance - a.bossDistance) - Math.abs(idealBossDistance - b.bossDistance)
        || a.rallyDistance - b.rallyDistance
        || a.selfDistance - b.selfDistance
      ));
    return candidates[0]?.point ?? this.combatKitePoint(self, npc, desiredDistance);
  }

  private chooseCombatAction(self: RuntimePlayer, npc: RuntimeNpc, distance: number): CombatActionId {
    const closeAttackers = this.getAttackers(self).filter((entry) => distance2d(self, entry) <= 5.5).length;
    const groupEncounterObjective = this.isActiveGroupEncounterObjectiveForSelf(self, npc);
    const selfHealRatio = groupEncounterObjective ? GROUP_ENCOUNTER_SELF_HEAL_RATIO : 0.62;
    if (self.health < self.maxHealth * selfHealRatio && this.canUse(self, "heal")) return "heal";
    const bossAggroAlly = groupEncounterObjective ? this.groupBossAggroAllyNeedingCover(self, npc) : null;
    if (bossAggroAlly && this.canUse(self, "taunt")) return "taunt";
    if (this.isRunnerStyleDailyBossCombat(npc)) {
      const shoot = COMBAT.actions.shoot;
      if (distance >= shoot.minRange && distance <= shoot.maxRange && this.canUse(self, "shoot")) return "shoot";
      return "attack";
    }
    if (closeAttackers >= 2 && this.canUse(self, "frostNova")) return "frostNova";
    if (closeAttackers >= 2 && this.canUse(self, "whirlwind")) return "whirlwind";
    if (distance >= 8 && this.canUse(self, "fireblast")) return "fireblast";
    if (distance >= 4 && this.canUse(self, "signalShot")) return "signalShot";
    if (distance >= 4 && this.canUse(self, "shoot")) return "shoot";
    return "attack";
  }

  private groupBossAggroAllyNeedingCover(self: RuntimePlayer, npc: RuntimeNpc) {
    const aggroTargetId = getString(npc.aggroTargetId);
    if (!aggroTargetId || aggroTargetId === self.sessionId) return null;
    const ally = this.players.get(aggroTargetId);
    if (!ally || ally.health <= 0 || ally.maxHealth <= 0 || self.maxHealth <= 0) return null;
    const selfHealthRatio = self.health / self.maxHealth;
    const allyHealthRatio = ally.health / ally.maxHealth;
    if (selfHealthRatio < 0.74) return null;
    if (allyHealthRatio > GROUP_ENCOUNTER_ALLY_HEAL_RATIO) return null;
    if (allyHealthRatio + 0.12 >= selfHealthRatio) return null;
    return ally;
  }

  private canUse(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT.actions[actionId];
    if (!this.isActionUnlocked(self, actionId)) return false;
    if (self.mana < action.manaCost) return false;
    const readyAt = getNumber(self[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now();
  }

  private isActionUnlocked(self: RuntimePlayer, actionId: CombatActionId) {
    if (self.level < getCombatActionUnlockLevel(actionId)) return false;
    const unlockTalentId = COMBAT_UNLOCK_TALENTS[actionId];
    if (unlockTalentId && this.getTalentRank(self, unlockTalentId) <= 0) return false;
    return true;
  }

  private getTalentRank(self: RuntimePlayer, talentId: string) {
    return self.talents
      .filter((talent) => getString(talent.id) === talentId || getString(talent.nodeId) === talentId)
      .reduce((rank, talent) => Math.max(rank, getNumber(talent.rank)), 0);
  }

  private cast(actionId: CombatActionId, target: TargetSelection) {
    const action = COMBAT.actions[actionId];
    if (action.requiresStationary || action.castTimeMs > 0) {
      this.stationaryUntil = Date.now() + action.castTimeMs + 350;
      this.targetPoint = null;
    }
    this.send("combatAction", target.id ? { actionId, target } : { actionId });
  }

  private startRetreat(self: RuntimePlayer, reason: string, durationMs = 5200) {
    const destination = this.retreatDestination(self);
    const npc = this.activeEngagementNpc() ?? this.getAttackers(self)[0] ?? null;
    this.recordCombatMemory({
      kind: "retreat",
      reason,
      action: this.lastAction || "retreat",
      npc,
      questId: cleanText(this.lastDecision?.questId, 96),
      position: point(self),
      targetPosition: npc ? point(npc) : null,
      severity: reason.includes("overpull") ? 0.82 : reason.includes("critical") ? 0.78 : 0.62,
      recommendedAction: npc
        ? `avoid immediately re-pulling ${npc.name || npc.id}; recover or take a safer target/route`
        : "recover at a safe waypoint before another pull",
    });
    this.clearEngagement();
    this.clearRoute();
    this.moveTo(destination);
    this.retreatUntil = Date.now() + durationMs;
    this.lastAction = reason;
  }

  private retreatDestination(self: RuntimePlayer) {
    const activeThreatEscape = this.getAttackers(self).length > 0 ? this.threatAvoidancePoint(self, 28) : null;
    const candidates = [
      activeThreatEscape,
      this.lastSafePoint,
      this.combatAnchor,
      PUBLIC_LANDMARKS.plaza,
      PUBLIC_LANDMARKS["loop-farm"],
      PUBLIC_LANDMARKS["route-post"],
      PUBLIC_LANDMARKS["signal-post"],
    ]
      .filter((candidate): candidate is Point => Boolean(candidate))
      .filter((candidate) => distance2d(self, candidate) >= 6)
      .map((candidate) => ({
        point: candidate,
        density: this.nearbyHostileCount(candidate, 18),
        pathRisk: this.scoreHostileTravelPath(self, candidate, HOSTILE_PATH_CORRIDOR_RADIUS),
        distance: distance2d(self, candidate),
        activeEscape: activeThreatEscape ? distance2d(candidate, activeThreatEscape) <= 0.5 : false,
      }))
      .map((candidate) => ({
        ...candidate,
        score: candidate.density * 2.8 + candidate.pathRisk * 3.4 + candidate.distance * 0.012 - (candidate.activeEscape ? 0.35 : 0),
      }))
      .sort((a, b) => a.score - b.score);
    return candidates[0]?.point ?? this.threatAvoidancePoint(self, 22);
  }

  private threatAvoidancePoint(self: RuntimePlayer, distance: number) {
    const threats = this.getAttackers(self);
    let awayX = 0;
    let awayZ = 0;
    for (const threat of threats) {
      const dx = self.x - threat.x;
      const dz = self.z - threat.z;
      const length = Math.hypot(dx, dz) || 1;
      awayX += dx / length;
      awayZ += dz / length;
    }
    const length = Math.hypot(awayX, awayZ);
    if (length <= 0.001) return point(self);
    return { x: round(self.x + (awayX / length) * distance), z: round(self.z + (awayZ / length) * distance) };
  }

  private combatKitePoint(self: RuntimePlayer, npc: RuntimeNpc, distance: number) {
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    const direct = { x: round(self.x + (dx / length) * distance), z: round(self.z + (dz / length) * distance) };
    const activeEscape = this.getAttackers(self).length > 0 ? this.threatAvoidancePoint(self, distance) : direct;
    const candidates = [
      direct,
      activeEscape,
    ].filter((candidate): candidate is Point => Boolean(candidate));
    return candidates
      .map((candidate) => ({
        point: candidate,
        density: this.nearbyHostileCount(candidate, 10, npc.id),
        pathRisk: this.scoreHostileTravelPath(self, candidate, HOSTILE_PATH_CORRIDOR_RADIUS, npc),
        bossDistance: distance2d(candidate, npc),
        travelDistance: distance2d(self, candidate),
      }))
      .filter((candidate) => candidate.bossDistance >= 10)
      .sort((a, b) => (
        a.density - b.density
        || a.pathRisk - b.pathRisk
        || Math.abs(18 - a.bossDistance) - Math.abs(18 - b.bossDistance)
        || a.travelDistance - b.travelDistance
      ))[0]?.point ?? direct;
  }

  private findPressableAttacker(self: RuntimePlayer, attackers: RuntimeNpc[]) {
    if (attackers.length === 0) return null;
    return [...attackers]
      .filter((npc) => isAttackable(npc) && npc.health > 0 && npc.defeatedAt <= 0)
      .sort((a, b) => (
        this.attackerFocusPriority(b) - this.attackerFocusPriority(a)
        || a.health - b.health
        || distance2d(self, a) - distance2d(self, b)
      ))
      .find((npc) => this.shouldPressCurrentFight(self, npc, attackers)) ?? null;
  }

  private attackerFocusPriority(npc: RuntimeNpc) {
    if (npc.id === "static-baron-nox" || npc.id === "raid-ogre-mfer") return 6;
    if (npc.combatStyle === "caster") return 4;
    if (npc.role === "farmer") return 3;
    if (npc.model === "hog") return 1;
    return 0;
  }

  private shouldPressCurrentFight(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) return false;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (healthRatio <= CRITICAL_HEALTH_RATIO) return false;
    const groupQuestId = this.groupEncounterQuestForNpc(npc);
    if (groupQuestId && !this.hasQuestStatus(self, groupQuestId, ["active"])) return false;
    if (
      groupQuestId
      && this.healthyQuestParticipantCountNear(self, npc, GROUP_ENCOUNTER_READY_RADIUS, groupQuestId) < this.suggestedGroupSize(groupQuestId)
    ) {
      return false;
    }
    if (attackers.length === 0) return true;
    const targetIsAttacking = attackers.some((attacker) => attacker.id === npc.id);
    const extraAttackers = attackers.filter((attacker) => attacker.id !== npc.id);
    const estimate = this.estimateCombatOutcome(self, npc, attackers);
    const canFinishSoon = npc.health <= this.estimatePlayerBurstDamage(self) * 1.35 && healthRatio >= PRESS_LOW_HEALTH_FINISH_RATIO;
    const highThreatAdd = this.attackerFocusPriority(npc) >= 3 && npc.maxHealth <= self.maxHealth * 1.25;
    const dangerousPull = attackers.some((attacker) => attacker.combatStyle === "caster" || attacker.maxHealth >= self.maxHealth * 1.2);
    if (
      groupQuestId
      && targetIsAttacking
      && extraAttackers.length === 0
      && healthRatio >= GROUP_ENCOUNTER_PRESS_HEALTH_RATIO
      && this.healthyQuestParticipantCountNear(self, npc, GROUP_ENCOUNTER_READY_RADIUS, groupQuestId) >= this.suggestedGroupSize(groupQuestId)
      && estimate.survivalMs > 1600
    ) {
      return true;
    }
    if (targetIsAttacking && highThreatAdd && dangerousPull && healthRatio >= 0.48 && estimate.survivalMs > 1800) {
      return true;
    }
    if (targetIsAttacking && dangerousPull && npc.maxHealth <= self.maxHealth * 0.75 && healthRatio >= 0.42 && estimate.survivalMs > 1400) {
      return true;
    }
    if (extraAttackers.length === 0 && targetIsAttacking) {
      return healthRatio >= PRESS_SINGLE_ATTACKER_HEALTH_RATIO || estimate.favorable || canFinishSoon;
    }
    if (targetIsAttacking && attackers.length <= 2 && healthRatio >= PRESS_ENGAGED_MULTI_ATTACKER_HEALTH_RATIO && npc.maxHealth <= self.maxHealth * 1.15) {
      return true;
    }
    if (attackers.length <= 2 && healthRatio >= PRESS_MULTI_ATTACKER_HEALTH_RATIO && estimate.favorable) return true;
    return canFinishSoon && estimate.survivalMs > 2500;
  }

  private estimateCombatOutcome(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    const playerDps = this.estimatePlayerDamagePerSecond(self);
    const incomingDps = attackers.reduce((total, attacker) => total + this.estimateNpcDamagePerSecond(attacker), 0);
    const targetTtkMs = playerDps > 0 ? (Math.max(0, npc.health) / playerDps) * 1000 : Number.POSITIVE_INFINITY;
    const survivalMs = incomingDps > 0 ? (Math.max(0, self.health) / incomingDps) * 1000 : Number.POSITIVE_INFINITY;
    const burstFinish = npc.health <= this.estimatePlayerBurstDamage(self) * 1.2;
    const favorable = incomingDps <= 0 || targetTtkMs * FAVORABLE_FIGHT_SURVIVAL_MARGIN <= survivalMs || (burstFinish && self.health >= self.maxHealth * PRESS_LOW_HEALTH_FINISH_RATIO);
    return { playerDps, incomingDps, targetTtkMs, survivalMs, favorable };
  }

  private estimatePlayerDamagePerSecond(self: RuntimePlayer) {
    return Math.max(
      ...COMBAT_ACTION_IDS
        .filter((actionId) => actionId !== "heal" && actionId !== "taunt")
        .filter((actionId) => this.isActionUsableSoon(self, actionId))
        .map((actionId) => {
          const action = COMBAT.actions[actionId];
          const cycleMs = Math.max(action.cooldownMs, action.castTimeMs + 1000, 1000);
          return this.estimatePlayerActionDamage(self, actionId) / (cycleMs / 1000);
        }),
      this.estimatePlayerActionDamage(self, "attack") / 1.5,
    );
  }

  private estimatePlayerBurstDamage(self: RuntimePlayer) {
    return Math.max(
      ...COMBAT_ACTION_IDS
        .filter((actionId) => actionId !== "heal" && actionId !== "taunt")
        .filter((actionId) => this.isActionUsableSoon(self, actionId))
        .map((actionId) => this.estimatePlayerActionDamage(self, actionId)),
      this.estimatePlayerActionDamage(self, "attack"),
    );
  }

  private isActionUsableSoon(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT.actions[actionId];
    if (!this.isActionUnlocked(self, actionId) || self.mana < action.manaCost) return false;
    const readyAt = getNumber(self[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now() + 2500;
  }

  private estimatePlayerActionDamage(self: RuntimePlayer, actionId: CombatActionId) {
    const baseDamage = COMBAT.actions[actionId].damage;
    if (actionId === "attack") return baseDamage + Math.floor(self.strength * 0.7);
    if (actionId === "shoot" || actionId === "multishot") return baseDamage + Math.floor(self.dexterity * 0.75);
    if (actionId === "signalShot") return baseDamage + Math.floor(self.dexterity * 0.45) + Math.floor(self.magic * 0.45);
    if (actionId === "whirlwind") return baseDamage + Math.floor(self.strength * 0.55);
    if (actionId === "fireblast") return baseDamage + Math.floor(self.magic * 1.1);
    if (actionId === "iceBlast") return baseDamage + Math.floor(self.magic * 0.78);
    return baseDamage;
  }

  private estimateNpcDamagePerSecond(npc: RuntimeNpc) {
    if (npc.id === "raid-ogre-mfer") return 38 / 1.4;
    if (npc.id === "static-baron-nox") return 24 / 1.5;
    if (npc.id === "mfergpt-daily-boss") return 10 / 1.55;
    if (npc.role === "farmer") return npc.combatStyle === "caster" ? 14 / 3.2 : 8 / 1.7;
    if (npc.model === "hog") return 5 / 1.7;
    return 4 / 1.8;
  }

  private assertNpcCombatTarget(npc: RuntimeNpc, action: string) {
    if (!isAttackable(npc)) throw new Error(`${action} target ${npc.id} is not attackable; role=${npc.role}, model=${npc.model}`);
    if ((npc.isImmortal && npc.model !== "training-dummy") || npc.health <= 0 || npc.defeatedAt > 0) throw new Error(`${action} target ${npc.id} is not available`);
  }

  private activeEngagementNpc() {
    const npc = this.npcs.get(this.engagedNpcId);
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) return null;
    return npc;
  }

  private setEngagement(self: RuntimePlayer, npcId: string) {
    this.engagedNpcId = npcId;
    this.combatAnchor = point(self);
  }

  private clearEngagement() {
    this.engagedNpcId = "";
    this.combatAnchor = null;
  }

  private clearRoute() {
    this.routeQueue = [];
    this.currentRouteId = "";
    this.routeArrivalDistance = 2;
  }

  private getAttackers(self: RuntimePlayer) {
    const sessionId = getString(self.sessionId);
    const now = Date.now();
    this.pruneRecentNpcPlayerCombat(now);
    return [...this.npcs.values()].filter((npc) => {
      if (npc.health <= 0 || npc.defeatedAt > 0) return false;
      if (npc.aggroTargetId === sessionId) return true;
      const recent = this.recentNpcPlayerCombat.get(npc.id);
      return Boolean(
        sessionId
        && recent
        && recent.direction === "npc_to_player"
        && recent.playerSessionId === sessionId
        && !recent.defeated
        && now - recent.lastAt <= GROUP_ENCOUNTER_ACTIVE_COMBAT_TTL_MS,
      );
    });
  }

  private isDangerousNeighbor(npc: RuntimeNpc, intendedTarget?: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0 || npc.id === intendedTarget?.id) return false;
    if (npc.isImmortal || npc.model === "training-dummy") return false;
    return npc.role === "farmer" || npc.maxHealth >= Math.max(50, (intendedTarget?.maxHealth ?? 0) * 2);
  }

  private nearbyDangerousHostileCount(pointLike: Point, radius: number, intendedTarget?: RuntimeNpc) {
    return [...this.npcs.values()].filter((npc) => this.isDangerousNeighbor(npc, intendedTarget) && distance2d(pointLike, npc) <= radius).length;
  }

  private dangerousHostileOnTravelPath(from: Point, to: Point, radius: number) {
    const pathLength = distance2d(from, to);
    if (pathLength <= 0.001) return null;
    return [...this.npcs.values()]
      .filter((npc) => this.isDangerousNeighbor(npc))
      .map((npc) => ({ npc, corridorDistance: distanceToSegment(npc, from, to), fromDistance: distance2d(from, npc) }))
      .filter(({ corridorDistance, fromDistance }) => corridorDistance <= radius && fromDistance <= pathLength + radius)
      .sort((a, b) => a.fromDistance - b.fromDistance)[0]?.npc ?? null;
  }

  private hostileTravelPathThreats(from: Point, to: Point, radius: number, intendedTarget?: RuntimeNpc) {
    const pathLength = distance2d(from, to);
    if (pathLength <= 0.001) return [];
    return [...this.npcs.values()]
      .filter((npc) => (
        npc.id !== intendedTarget?.id
        && npc.health > 0
        && npc.defeatedAt <= 0
        && !npc.isImmortal
        && isHostile(npc)
      ))
      .map((npc) => ({
        npc,
        corridorDistance: distanceToSegment(npc, from, to),
        fromDistance: distance2d(from, npc),
      }))
      .filter(({ corridorDistance, fromDistance }) => corridorDistance <= radius && fromDistance <= pathLength + radius)
      .sort((a, b) => a.fromDistance - b.fromDistance)
      .map(({ npc }) => npc);
  }

  private scoreHostileTravelPath(from: Point, to: Point, radius: number, intendedTarget?: RuntimeNpc) {
    const threats = this.hostileTravelPathThreats(from, to, radius, intendedTarget);
    const weighted = threats.reduce((total, npc) => (
      total
      + (npc.role === "farmer" ? 0.28 : 0)
      + (npc.model === "hog" ? 0.14 : 0.18)
      + (npc.maxHealth >= Math.max(80, intendedTarget?.maxHealth ?? 0) ? 0.08 : 0)
    ), 0);
    return round(clamp(weighted, 0, 1));
  }

  private describePullRisk(npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return "none";
    if (this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc) > 0) return "high: stronger hostile is close enough to join the pull";
    if (this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id) >= 4) return "high: crowded hostile cluster";
    if (this.nearbyHostileCount(npc, 8, npc.id) >= 2) return "medium: another hostile is nearby";
    return "low";
  }

  private describeApproachRisk(self: RuntimePlayer, npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return "none";
    const pathThreat = this.dangerousHostileOnTravelPath(self, npc, 12);
    if (pathThreat) return `high: path from current position passes near ${pathThreat.name || pathThreat.id}`;
    const pathThreats = this.hostileTravelPathThreats(self, npc, HOSTILE_PATH_CORRIDOR_RADIUS, npc);
    if (pathThreats.length >= 3) return "high: direct path crosses hostile density";
    if (pathThreats.length > 0) return `medium: direct path passes near ${pathThreats[0]?.name || pathThreats[0]?.id || "a hostile"}`;
    if (this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc) > 0) return "high: target is beside a stronger hostile";
    if (distance2d(self, npc) > 34 && this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id) >= 3) return "high: target is beyond range inside a crowded cluster";
    if (this.nearbyHostileCount(npc, 8, npc.id) >= 2) return "medium: target has nearby hostiles";
    return "low";
  }

  private scorePullRisk(npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return 0;
    const nearby = this.nearbyHostileCount(npc, 8, npc.id);
    const crowded = this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id);
    const dangerous = this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc);
    return round(clamp(0.16 + nearby * 0.16 + Math.max(0, crowded - 2) * 0.1 + dangerous * 0.34, 0, 1));
  }

  private scoreApproachRisk(self: RuntimePlayer, npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return 0;
    const pathThreat = this.dangerousHostileOnTravelPath(self, npc, 12);
    const pathRisk = this.scoreHostileTravelPath(self, npc, HOSTILE_PATH_CORRIDOR_RADIUS, npc);
    const pullRisk = this.scorePullRisk(npc);
    const distanceRisk = distance2d(self, npc) > 34 ? 0.14 : 0;
    return round(clamp(pullRisk + pathRisk + (pathThreat ? 0.28 : 0) + distanceRisk, 0, 1));
  }

  private scoreThreatLevel(self: RuntimePlayer, npc: RuntimeNpc) {
    if (!isAttackable(npc) || npc.health <= 0 || npc.defeatedAt > 0) return 0;
    const distance = distance2d(self, npc);
    const bossRisk = npc.id === "raid-ogre-mfer" || npc.id === "static-baron-nox" ? 0.45 : 0;
    const roleRisk = npc.role === "farmer" ? 0.52 : npc.model === "hog" ? 0.32 : 0.24;
    const aggroRisk = npc.aggroTargetId === self.sessionId ? 0.28 : npc.aggroTargetId ? 0.12 : 0;
    const closeRisk = distance <= 7 ? 0.12 : distance <= 18 ? 0.06 : 0;
    const healthRisk = npc.maxHealth >= Math.max(80, self.maxHealth * 0.75) ? 0.16 : 0;
    return round(clamp(roleRisk + bossRisk + aggroRisk + closeRisk + healthRisk, 0, 1));
  }

  private nearbyHostileCount(pointLike: Point, radius: number, excludeNpcId = "") {
    return [...this.npcs.values()].filter((npc) => (
      npc.id !== excludeNpcId
      && npc.health > 0
      && npc.defeatedAt <= 0
      && !npc.isImmortal
      && isHostile(npc)
      && distance2d(pointLike, npc) <= radius
    )).length;
  }

  private updateLastSafePoint(self: RuntimePlayer) {
    if (self.health <= 0) return;
    if (this.getAttackers(self).length > 0) return;
    if (this.nearbyHostileCount(self, 18) > 0) return;
    this.lastSafePoint = point(self);
  }

  private moveNearNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    this.moveTo({ x: npc.x + (dx / length) * INTERACT_APPROACH_DISTANCE, z: npc.z + (dz / length) * INTERACT_APPROACH_DISTANCE });
  }

  private combatRangePoint(self: RuntimePlayer, npc: RuntimeNpc, action: { maxRange: number; minRange: number }) {
    const desiredRange = action.maxRange >= 20
      ? Math.max(action.minRange + 1.5, Math.min(action.maxRange - 2, action.maxRange * 0.86))
      : Math.max(2.4, Math.min(action.maxRange * 0.7, action.maxRange - 0.5));
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: npc.x + (dx / length) * desiredRange, z: npc.z + (dz / length) * desiredRange };
  }

  private safeCombatApproachPoint(
    self: RuntimePlayer,
    npc: RuntimeNpc,
    action: { maxRange: number; minRange: number },
    directCombatPoint: Point,
  ) {
    if (this.getAttackers(self).length > 0) return null;
    if (distance2d(self, npc) <= action.maxRange * 1.25) return null;

    const directPathRisk = this.scoreHostileTravelPath(self, directCombatPoint, HOSTILE_PATH_CORRIDOR_RADIUS, npc);
    const directAnchorRisk = this.nearbyHostileCount(directCombatPoint, 8, npc.id) * 0.16;
    const directRisk = clamp(directPathRisk + directAnchorRisk + this.scoreApproachRisk(self, npc) * 0.35, 0, 1);
    if (directRisk < SAFE_APPROACH_TRIGGER_RISK) return null;

    const candidates = this.safeCombatApproachCandidates(self)
      .map((candidate) => {
        const anchorPoint = this.combatRangePointFrom(candidate.point, npc, action);
        const routeRisk = this.scoreHostileTravelPath(self, candidate.point, HOSTILE_PATH_CORRIDOR_RADIUS, npc);
        const anchorRisk = this.scoreHostileTravelPath(candidate.point, anchorPoint, HOSTILE_PATH_CORRIDOR_RADIUS, npc);
        const candidateDensity = this.nearbyHostileCount(candidate.point, 13, npc.id);
        const anchorDensity = this.nearbyHostileCount(anchorPoint, 8, npc.id);
        const travelDistance = distance2d(self, candidate.point);
        const finalDistance = distance2d(candidate.point, anchorPoint);
        const score = routeRisk * 4
          + anchorRisk * 3
          + candidateDensity * 0.22
          + anchorDensity * 0.28
          + travelDistance * 0.012
          + finalDistance * 0.01;
        return { ...candidate, anchorPoint, routeRisk, anchorRisk, candidateDensity, anchorDensity, score };
      })
      .filter((candidate) => distance2d(self, candidate.point) > SAFE_APPROACH_ARRIVAL_DISTANCE)
      .filter((candidate) => candidate.routeRisk <= 0.36)
      .filter((candidate) => candidate.candidateDensity <= 1)
      .filter((candidate) => candidate.anchorDensity <= 2)
      .sort((a, b) => a.score - b.score);

    const best = candidates[0];
    if (!best) return null;
    if (best.score >= directRisk * 3.6) return null;
    return { point: best.point, label: best.label };
  }

  private combatRangePointFrom(anchor: Point, npc: RuntimeNpc, action: { maxRange: number; minRange: number }) {
    const desiredRange = action.maxRange >= 20
      ? Math.max(action.minRange + 1.5, Math.min(action.maxRange - 2, action.maxRange * 0.86))
      : Math.max(2.4, Math.min(action.maxRange * 0.7, action.maxRange - 0.5));
    const dx = anchor.x - npc.x;
    const dz = anchor.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: npc.x + (dx / length) * desiredRange, z: npc.z + (dz / length) * desiredRange };
  }

  private safeCombatApproachCandidates(self: RuntimePlayer) {
    const base = [
      { label: "loop-farm", point: PUBLIC_LANDMARKS["loop-farm"] },
      { label: "claim-pile-edge", point: PUBLIC_LANDMARKS["claim-pile"] },
      { label: "route-post", point: PUBLIC_LANDMARKS["route-post"] },
      { label: "plaza", point: PUBLIC_LANDMARKS.plaza },
      { label: "signal-post", point: PUBLIC_LANDMARKS["signal-post"] },
    ];
    return [
      ...(this.lastSafePoint ? [{ label: "last-safe", point: this.lastSafePoint }] : []),
      ...base,
    ].filter((candidate) => distance2d(candidate.point, self) <= 180);
  }

  private followRoute(self: RuntimePlayer) {
    let target = this.routeQueue[0];
    if (!target) return;
    while (target && distance2d(self, target) <= this.routeArrivalDistance) {
      this.routeQueue.shift();
      target = this.routeQueue[0];
    }
    const nextTarget = this.routeQueue[0];
    if (nextTarget) this.moveTo(nextTarget);
    else {
      this.targetPoint = null;
      this.currentRouteId = "";
      this.routeArrivalDistance = 2;
    }
  }

  private moveTo(target: Point) {
    const nextPoint = { x: target.x, z: target.z };
    if (!this.targetPoint || distance2d(this.targetPoint, nextPoint) > 1.2) this.resetMovementProgress(nextPoint);
    this.targetPoint = nextPoint;
  }

  private moveToNpcInteractionRange(self: RuntimePlayer, npc: RuntimeNpc, sendRange: number, actionLabel: string) {
    const route = findLocalCollisionRoute(point(self), point(npc), npcInteractionRouteStopDistance(sendRange));
    if (route.length > 0) {
      this.currentRouteId = `local-npc:${npc.id}`;
      this.routeArrivalDistance = LOCAL_NAV_ARRIVAL_DISTANCE;
      this.routeQueue = route;
      this.followRoute(self);
      this.lastAction = actionLabel;
      return;
    }

    this.clearRoute();
    this.moveNearNpc(self, npc);
    this.lastAction = actionLabel;
  }

  private currentMovementTarget() {
    if (this.avoidancePoint && Date.now() < this.avoidanceUntil) return this.avoidancePoint;
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    return this.targetPoint as Point;
  }

  private resetMovementProgress(target: Point | null = this.targetPoint) {
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    this.movementProgressTarget = target ? { ...target } : null;
    this.movementProgressDistance = Number.POSITIVE_INFINITY;
    this.movementProgressAt = Date.now();
    this.movementUnstickAttempts = 0;
  }

  private updateMovementRecovery(self: RuntimePlayer) {
    if (!this.targetPoint) {
      this.resetMovementProgress(null);
      return;
    }
    const now = Date.now();
    if (!this.movementProgressTarget || distance2d(this.movementProgressTarget, this.targetPoint) > 1.2) this.resetMovementProgress(this.targetPoint);
    if (this.avoidancePoint && now < this.avoidanceUntil) return;
    const distance = distance2d(self, this.targetPoint);
    if (distance < this.movementProgressDistance - 0.35) {
      this.movementProgressDistance = distance;
      this.movementProgressAt = now;
      this.movementUnstickAttempts = 0;
      return;
    }
    if (distance < 3 || now - this.movementProgressAt < 2400) return;
    this.movementUnstickAttempts += 1;
    if (this.movementUnstickAttempts >= MOVEMENT_STUCK_RETHINK_ATTEMPTS) {
      this.recordMovementTrouble(self, "stuck_loop", distance);
      return;
    }
    const dx = this.targetPoint.x - self.x;
    const dz = this.targetPoint.z - self.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = stableHash(`${Math.round(self.x)}:${Math.round(self.z)}:${Math.round(now / 2400)}`) % 2 === 0 ? 1 : -1;
    this.avoidancePoint = { x: round(self.x + (-dz / length) * 5.5 * side + (dx / length) * 1.2), z: round(self.z + (dx / length) * 5.5 * side + (dz / length) * 1.2) };
    this.avoidanceUntil = now + 950;
    this.movementProgressAt = now;
    this.lastAction = this.lastAction.startsWith("unstick_move") ? this.lastAction : `unstick_move ${this.lastAction}`;
  }

  private recordMovementTrouble(self: RuntimePlayer, reason: string, distance: number) {
    const previousAction = this.lastAction || "movement";
    const npc = this.activeEngagementNpc() ?? this.resolveNpc(this.lastDecision?.npcRef);
    this.recordCombatMemory({
      kind: "movement",
      reason,
      action: previousAction,
      npc,
      questId: cleanText(this.lastDecision?.questId, 96),
      position: point(self),
      targetPosition: this.targetPoint ? point(this.targetPoint) : null,
      severity: 0.5,
      recommendedAction: "avoid repeating the same direct path; use a named route or safe retreat waypoint first",
    });
    this.movementTrouble = {
      reason,
      action: previousAction,
      position: point(self),
      targetPoint: this.targetPoint ? point(this.targetPoint) : null,
      routeQueue: this.routeQueue.slice(0, 6).map(point),
      attempts: this.movementUnstickAttempts,
      lastAt: Date.now(),
      distance: round(distance),
    };
    this.targetPoint = null;
    this.clearRoute();
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    this.lastAction = `stuck_rethink ${previousAction}`.slice(0, 120);
  }

  private describeMovementTrouble(now: number) {
    const entry = this.movementTrouble;
    if (!entry || now - getNumber(entry.lastAt) > MOVEMENT_TROUBLE_TTL_MS) return null;
    return { ...entry, lastAgoMs: Math.max(0, now - getNumber(entry.lastAt)) };
  }

  private observeCombatMemory(self: RuntimePlayer, now = Date.now()) {
    this.pruneCombatMemory(now);
    if (self.health > 0 || now - this.lastDeathRecordedAt < 5_000) return;
    this.lastDeathRecordedAt = now;
    const npc = this.activeEngagementNpc()
      ?? this.getAttackers(self)[0]
      ?? this.resolveNpc(this.lastDecision?.npcRef);
    this.recordCombatMemory({
      kind: "death",
      reason: "health reached 0",
      action: this.lastAction || this.lastDecision?.action || "unknown",
      npc,
      questId: cleanText(this.lastDecision?.questId, 96),
      position: point(self),
      targetPosition: npc ? point(npc) : null,
      severity: 1,
      recommendedAction: npc
        ? `avoid ${npc.name || npc.id} temporarily; respawn, recover, spend talents/gear, or pick a safer target`
        : "respawn, recover, and avoid the last danger area temporarily",
    });
  }

  private recordCombatMemoryFromReport(decision: AgentBridgeDecision, before: PlayerActionSnapshot, report: ActionReport) {
    const stoppedBecause = report.stoppedBecause.toLowerCase();
    const self = this.self();
    const npc = this.resolveNpc(decision.npcRef)
      ?? this.activeEngagementNpc()
      ?? (self ? this.getAttackers(self)[0] : null);
    const position = report.position ?? before.position;
    const targetPosition = npc ? point(npc) : null;
    if (stoppedBecause.includes("dead")) {
      this.lastDeathRecordedAt = Date.now();
      this.recordCombatMemory({
        kind: "death",
        reason: report.stoppedBecause,
        action: decision.action,
        npc,
        questId: cleanText(decision.questId, 96),
        position,
        targetPosition,
        severity: 1,
        recommendedAction: npc
          ? `avoid ${npc.name || npc.id} temporarily; use safer target/route or recover first`
          : "avoid the last danger area temporarily; recover before another pull",
      });
      return;
    }
    if (stoppedBecause.includes("overpull") || stoppedBecause.includes("critical") || stoppedBecause.includes("low_health")) {
      this.recordCombatMemory({
        kind: "safety_stop",
        reason: report.stoppedBecause,
        action: decision.action,
        npc,
        questId: cleanText(decision.questId, 96),
        position,
        targetPosition,
        severity: stoppedBecause.includes("overpull") ? 0.82 : 0.72,
        recommendedAction: npc
          ? `avoid re-pulling ${npc.name || npc.id} until healed or choose a safer approach`
          : "retreat/recover before another combat action",
      });
      return;
    }
    if (stoppedBecause.includes("movement_stuck") || stoppedBecause.includes("stuck")) {
      this.recordCombatMemory({
        kind: "movement",
        reason: report.stoppedBecause,
        action: decision.action,
        npc,
        questId: cleanText(decision.questId, 96),
        position,
        targetPosition,
        severity: 0.55,
        recommendedAction: "use a different route or waypoint; avoid repeating the same direct path immediately",
      });
    }
  }

  private recordCombatMemory({
    kind,
    reason,
    action,
    npc,
    questId,
    position,
    targetPosition,
    severity,
    recommendedAction,
  }: {
    kind: CombatMemoryEntry["kind"];
    reason: string;
    action: string;
    npc?: RuntimeNpc | null;
    questId: string;
    position: Point | null;
    targetPosition: Point | null;
    severity: number;
    recommendedAction: string;
  }) {
    const now = Date.now();
    this.pruneCombatMemory(now);
    const npcId = npc?.id ?? "";
    const key = npcId
      ? `npc:${npcId}`
      : position
        ? `${kind}:area:${Math.round(position.x / 12)}:${Math.round(position.z / 12)}`
        : `${kind}:${action}`;
    const previous = this.combatMemory.find((entry) => entry.key === key);
    const count = (previous?.count ?? 0) + 1;
    const avoidMs = Math.min(COMBAT_AVOID_MAX_MS, Math.round(COMBAT_AVOID_BASE_MS * Math.max(1, severity) * count));
    const next: CombatMemoryEntry = {
      key,
      kind,
      reason: cleanText(reason, 120) || kind,
      action: cleanText(action, 80) || "unknown",
      npcId,
      npcName: npc?.name ?? "",
      questId: cleanText(questId, 96),
      position,
      targetPosition,
      severity: round(clamp(severity, 0, 1)),
      count,
      firstAt: previous?.firstAt ?? now,
      lastAt: now,
      avoidUntil: Math.max(previous?.avoidUntil ?? 0, now + avoidMs),
      recommendedAction: cleanText(recommendedAction, 220),
    };
    this.combatMemory = [next, ...this.combatMemory.filter((entry) => entry.key !== key)]
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 30);
  }

  private describeCombatMemory(now: number, self: RuntimePlayer) {
    this.pruneCombatMemory(now);
    const entries = this.combatMemory.map((entry) => ({
      ...entry,
      lastAgoMs: Math.max(0, now - entry.lastAt),
      avoidRemainingMs: Math.max(0, entry.avoidUntil - now),
      nearbyNow: entry.position ? round(distance2d(self, entry.position)) : null,
    }));
    const activeAvoids = entries.filter((entry) => entry.avoidRemainingMs > 0);
    return {
      summary: activeAvoids.length > 0
        ? `Avoid ${activeAvoids.slice(0, 3).map((entry) => entry.npcName || entry.npcId || "recent trouble spot").join(", ")} until timer clears or situation improves.`
        : "No active combat avoidance memory.",
      recentEvents: entries.slice(0, 8),
      recentDeaths: entries.filter((entry) => entry.kind === "death").slice(0, 4),
      avoidTargets: activeAvoids.filter((entry) => entry.npcId).slice(0, 8),
      troubleSpots: activeAvoids.filter((entry) => entry.position).slice(0, 8).map((entry) => ({
        reason: entry.reason,
        action: entry.action,
        position: entry.position,
        targetPosition: entry.targetPosition,
        nearbyNow: entry.nearbyNow,
        avoidRemainingMs: entry.avoidRemainingMs,
        count: entry.count,
        recommendedAction: entry.recommendedAction,
      })),
      guidance: [
        "Prefer safeTargets that are not in avoidTargets.",
        "If the same NPC/path caused repeated deaths or overpulls, switch quest focus, level/gear/shop, or use a safer route.",
        "Bankr may override this memory for a deliberate group/boss attempt, but should mention the risk.",
      ],
    };
  }

  private describeNpcAvoidance(npc: RuntimeNpc, now = Date.now()) {
    const entry = this.combatMemory.find((memory) => memory.npcId === npc.id && memory.avoidUntil > now);
    if (!entry) return { active: false };
    return {
      active: true,
      reason: entry.reason,
      count: entry.count,
      severity: entry.severity,
      avoidRemainingMs: Math.max(0, entry.avoidUntil - now),
      recommendedAction: entry.recommendedAction,
    };
  }

  private isNpcAvoided(npcId: string, now = Date.now()) {
    return Boolean(npcId && this.combatMemory.some((entry) => entry.npcId === npcId && entry.avoidUntil > now));
  }

  private hasRecentNpcPlayerCombat(npcId: string, ttlMs = GROUP_ENCOUNTER_ACTIVE_COMBAT_TTL_MS, now = Date.now()) {
    if (!npcId) return false;
    this.pruneRecentNpcPlayerCombat(now);
    const entry = this.recentNpcPlayerCombat.get(npcId);
    return Boolean(entry && now - entry.lastAt <= ttlMs);
  }

  private hasRecentNpcDefeat(npcId: string, ttlMs: number, now = Date.now()) {
    if (!npcId) return false;
    this.pruneRecentNpcPlayerCombat(now);
    const entry = this.recentNpcPlayerCombat.get(npcId);
    return Boolean(entry?.defeated && now - entry.lastAt <= ttlMs);
  }

  private combatAvoidancePenalty(npc: RuntimeNpc, now = Date.now()) {
    const entry = this.combatMemory.find((memory) => memory.npcId === npc.id && memory.avoidUntil > now);
    return entry ? 0.85 + Math.min(0.45, entry.count * 0.08) : 0;
  }

  private combatAreaAvoidancePenalty(npc: RuntimeNpc, now = Date.now()) {
    let penalty = 0;
    for (const entry of this.combatMemory) {
      if (entry.avoidUntil <= now) continue;
      const anchor = entry.targetPosition ?? entry.position;
      if (!anchor) continue;
      const distance = distance2d(npc, anchor);
      if (distance > 18) continue;
      const distancePenalty = distance <= 10 ? 0.1 : 0;
      penalty = Math.max(penalty, 0.28 + entry.severity * 0.34 + Math.min(0.24, entry.count * 0.06) + distancePenalty);
    }
    return round(clamp(penalty, 0, 0.9));
  }

  private pruneCombatMemory(now = Date.now()) {
    this.combatMemory = this.combatMemory.filter((entry) => now - entry.lastAt <= COMBAT_MEMORY_TTL_MS);
  }

  private pruneRecentNpcPlayerCombat(now = Date.now()) {
    for (const [npcId, entry] of this.recentNpcPlayerCombat.entries()) {
      if (now - entry.lastAt > GROUP_ENCOUNTER_COMBAT_MEMORY_TTL_MS) this.recentNpcPlayerCombat.delete(npcId);
    }
  }

  private resolveNpc(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.npcs.get(key);
    if (direct) return direct;
    const mapped = this.lastNpcRefs.get(key);
    if (mapped) return this.npcs.get(mapped) ?? null;
    return [...this.npcs.values()].find((npc) => npc.name.toLowerCase() === key || npc.id.toLowerCase() === key) ?? null;
  }

  private resolveQuestTurnInNpc(questId: string) {
    const memory = this.questMemory.get(questId);
    if (memory?.turnInNpcId) return this.resolveNpc(memory.turnInNpcId);
    const metadata = asRecord(asRecord(buildAgentCatalog().quests)[questId]);
    return this.resolveNpc(getString(metadata.turnInNpcId));
  }

  private resolvePlayer(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.players.get(key);
    if (direct) return direct;
    const mapped = this.lastPlayerRefs.get(key);
    if (mapped) return this.players.get(mapped) ?? null;
    return [...this.players.values()].find((player) => player.name.toLowerCase() === key || player.sessionId.toLowerCase() === key) ?? null;
  }

  private self() {
    return this.room ? this.players.get(this.room.sessionId) ?? null : null;
  }

  private send(type: string, message: AnyRecord = {}) {
    this.room?.send(type, message);
  }

  private publishAgentStatus(self: RuntimePlayer, force = false) {
    const now = Date.now();
    if (!force && now < this.nextAgentStatusAt) return;
    this.nextAgentStatusAt = now + 1500;
    const activeCommand = this.activeCommandId ? this.commands.get(this.activeCommandId) ?? null : null;
    const playtime = activeCommand?.status === "running"
      ? describeCommandPlaytime(activeCommand, now)
      : null;
    this.send("agentStatus", {
      action: this.lastAction,
      thought: this.lastDecision?.reason ?? "",
      objective: this.objective,
      quest: this.describeCurrentQuest(self),
      commandStatus: activeCommand?.status ?? "",
      commandBudgetTier: activeCommand?.budget.tier ?? "",
      commandStartedAt: activeCommand?.startedAt ?? 0,
      commandMaxSeconds: activeCommand?.maxSeconds ?? 0,
      commandSessionUsedSeconds: playtime?.session.usedSeconds ?? 0,
      commandSessionRemainingSeconds: playtime?.session.remainingSeconds ?? 0,
      commandDailyUsedSeconds: playtime?.daily.usedSeconds ?? 0,
      commandDailyRemainingSeconds: playtime?.daily.remainingSeconds ?? 0,
      commandDailySeconds: playtime?.daily.totalSeconds ?? 0,
    });
  }

  private describeCurrentQuest(self: RuntimePlayer) {
    const focusedQuest = this.focusedQuestId
      ? self.quests.find((entry) => getString(entry.id) === this.focusedQuestId && getString(entry.status) !== "completed")
      : null;
    const quest = focusedQuest
      ?? self.quests.find((entry) => getString(entry.status) === "ready")
      ?? self.quests.find((entry) => getString(entry.status) === "active")
      ?? self.quests.find((entry) => getString(entry.status) !== "completed")
      ?? self.quests[0];
    if (!quest) return "";
    const questId = getString(quest.id);
    this.focusedQuestId = questId;
    const status = getString(quest.status);
    const progress = `${getNumber(quest.progress)}/${getNumber(quest.required)}`;
    const memory = this.questMemory.get(questId);
    return [status, progress, memory?.objectiveLabel || memory?.title || questId].filter(Boolean).join(" ");
  }

  private maybeAnnounceNextAction(self: RuntimePlayer, decision: AgentBridgeDecision) {
    if (self.health <= 0 || decision.action === "wait") return;
    const text = this.describeNextActionChat(decision);
    if (text) this.lastNextActionChat = text;
  }

  private describeNextActionChat(decision: AgentBridgeDecision) {
    const npc = this.resolveNpc(decision.npcRef);
    const questId = cleanText(decision.questId, 96);
    const itemId = cleanText(decision.itemId, 96);
    switch (decision.action) {
      case "move_to":
        return "next: moving";
      case "travel_route":
        return `next: taking ${cleanText(decision.text, 80) || "a route"}`;
      case "interact_npc":
        return npc ? `next: talking to ${npc.name}` : "";
      case "accept_quest":
        return questId ? `next: accepting ${questId}` : "";
      case "complete_quest":
        return questId ? `next: turning in ${questId}` : "";
      case "fight_npc":
        return npc ? `next: fighting ${npc.name}` : "";
      case "loot":
        return npc ? `next: looting ${npc.name}` : this.resolveOpenLootWindow(decision.npcRef) ? "next: looting catch" : "";
      case "use_ability":
        return cleanText(decision.actionId, 40) ? `next: using ${cleanText(decision.actionId, 40)}` : "";
      case "purchase_potion_shop_item":
        return itemId ? `next: buying ${itemId}` : "";
      case "purchase_fishing_supply":
        return "next: buying fishing chum";
      case "swap_eth_for_mfergpt":
        return "next: preparing an ETH to MFERGPT swap";
      case "respawn":
        return "next: respawning";
      default:
        return "";
    }
  }

  private getOpenFishingLootWindow() {
    return this.openLootWindow?.source === "fishing" ? this.openLootWindow : null;
  }

  private resolveOpenLootWindow(ref: unknown) {
    const lootWindow = this.openLootWindow;
    if (!lootWindow) return null;
    const key = cleanText(ref, 128).toLowerCase();
    if (!key) return lootWindow.source === "fishing" ? lootWindow : null;
    return key === lootWindow.npcId.toLowerCase() || key === lootWindow.source.toLowerCase() ? lootWindow : null;
  }

  private canSendChat() {
    return Date.now() >= this.nextChatAt;
  }

  private chatRetryAfterMs(now = Date.now()) {
    return Math.max(0, this.nextChatAt - now);
  }

  private sendChat(text: string) {
    const cleaned = makeChatLine(text);
    if (!cleaned) return;
    this.send("chat", { text: cleaned });
    this.nextChatAt = Date.now() + DEFAULT_CHAT_COOLDOWN_MS;
  }

  private canSendEmote() {
    return Date.now() >= this.nextEmoteAt;
  }

  private sendEmote(emoteId: string) {
    const cleaned = cleanText(emoteId, 40) || "wave";
    this.send("emote", { emoteId: cleaned });
    this.nextEmoteAt = Date.now() + DEFAULT_EMOTE_COOLDOWN_MS;
  }

  private buildPaymentProof(decision: AgentBridgeDecision) {
    const txHash = normalizeTxHash(decision.paymentTxHash);
    if (!txHash) return null;
    const amountWei = normalizePositiveIntegerString(decision.paymentAmountWei);
    if (!amountWei) throw new Error("paymentAmountWei must be a positive integer string");
    const chainId = readInteger(decision.paymentChainId);
    if (!chainId) throw new Error("paymentChainId is required for payment proof");
    const contractAddress = normalizeAddress(decision.paymentContractAddress);
    return { token: "MFERGPT", txHash, amountWei, chainId, contractAddress: contractAddress || undefined };
  }

  private resolveAgentTraits(rawTraits: unknown) {
    const selected = asRecord(rawTraits);
    return resolveAgentMferAppearanceTraitsForUpdate(selected, {}, `${this.walletAddress}:${this.agentName}`);
  }

  private buildWalletActionGuide() {
    return {
      bridgeCanSignWalletTransactions: false,
      swapEthForMferGpt: {
        action: "swap_eth_for_mfergpt",
        note: "Bridge returns wallet_action_required. Bankr should execute the Base ETH -> MFERGPT swap in its own wallet context.",
        chainId: BASE_CHAIN_ID,
        tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
        routerAddress: BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
        fallbackUrl: "https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07",
      },
      potionShopBuy: {
        action: "purchase_potion_shop_item",
        note: "Burn the exact MFERGPT price from the agent wallet to the burn address, then include paymentTxHash/paymentAmountWei/paymentChainId/paymentContractAddress in the decision.",
        chainId: BASE_CHAIN_ID,
        tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
        burnAddress: BASE_BURN_ADDRESS,
      },
      fishingSupplyBuy: {
        action: "purchase_fishing_supply",
        note: "After fishin-lesson, burn the exact MFERGPT chum price from the agent wallet to the burn address, then include payment proof fields.",
        itemId: FISHING_CHUM_ITEM_ID,
        chainId: BASE_CHAIN_ID,
        tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
        burnAddress: BASE_BURN_ADDRESS,
      },
      paidTraits: {
        action: "update_traits",
        note: "For paid trait updates, burn MFERGPT externally and include payment proof fields. First trait setup may be free when the room/server allows it.",
      },
      chainGear: {
        action: "register_chain_gear",
        note: "After Bankr mints/buys chain gear in wallet context, pass token id in text to register ownership into game inventory.",
      },
    };
  }

  private describeQuestObjectives(questIdText: string, quest: AnyRecord) {
    const questId = normalizeKnownQuestId(questIdText);
    if (!questId) return [];
    const status = normalizeQuestStatus(getString(quest.status));
    const completedFlags = getQuestFlagSet(getString(quest.flags));
    return getQuestObjectives(questId).map((objective) => ({
      id: objective.id,
      label: objective.label,
      done: status === "completed" || status === "ready" || completedFlags.has(objective.id),
    }));
  }

  private describeLootableCorpses(self: RuntimePlayer) {
    return [...this.npcs.values()]
      .filter((npc) => npc.health <= 0 && npc.defeatedAt > 0 && npc.hasLoot)
      .map((npc) => ({
        id: npc.id,
        npcId: npc.id,
        name: npc.name,
        distance: round(distance2d(self, npc)),
        dist: round(distance2d(self, npc)),
        position: point(npc),
        items: this.describeLootItems(npc),
        suggestedAction: "loot",
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12);
  }

  private describeLootItems(npc: RuntimeNpc) {
    return npc.loot
      .map((item) => ({
        itemId: getString(item.id),
        id: getString(item.id),
        count: getNumber(item.count),
        chainTokenId: getString(item.chainTokenId),
      }))
      .filter((item) => item.itemId && item.count > 0)
      .slice(0, 12);
  }

  private describeFinalState(self: RuntimePlayer): PlayerFinalStateSummary {
    return {
      level: self.level,
      xp: self.xp,
      talentPoints: self.talentPoints,
      health: round(self.health),
      maxHealth: round(self.maxHealth),
      mana: round(self.mana),
      maxMana: round(self.maxMana),
      position: { x: round(self.x), z: round(self.z) },
      stats: {
        strength: round(self.strength),
        dexterity: round(self.dexterity),
        magic: round(self.magic),
        healthRegenPer5: round(self.healthRegenPer5),
        manaRegenPer5: round(self.manaRegenPer5),
        walkSpeed: round(self.walkSpeed),
        runSpeed: round(self.runSpeed),
      },
      inventoryCounts: describeInventoryCounts(self.inventory),
      inventory: this.describeInventory(self).filter((item) => item.count > 0),
      equipment: this.describeEquipment(self).filter((slot) => slot.itemId),
      talents: this.describeTalents(self),
      activeBuffs: this.describeActiveBuffs(self),
    };
  }

  private describeInventory(self: RuntimePlayer): PlayerInventorySummary[] {
    return self.inventory.map((item) => ({
      itemId: getString(item.id),
      count: getNumber(item.count),
      chainTokenId: getString(item.chainTokenId),
      chainTier: getNumber(item.chainTier, 1),
    }));
  }

  private describeEquipment(self: RuntimePlayer): PlayerEquipmentSummary[] {
    return self.equipment.map((slot) => ({
      slot: getString(slot.slot),
      itemId: getString(slot.itemId),
      chainTokenId: getString(slot.chainTokenId),
      chainTier: getNumber(slot.chainTier, 1),
    }));
  }

  private describeTalents(self: RuntimePlayer): PlayerTalentSummary[] {
    return self.talents
      .map((talent) => ({
        talentId: getString(talent.id ?? talent.talentId),
        rank: getNumber(talent.rank),
      }))
      .filter((talent) => talent.talentId && talent.rank > 0);
  }

  private describeActiveBuffs(self: RuntimePlayer): PlayerActiveBuffSummary[] {
    return self.activeBuffs
      .map((buff) => ({
        id: getString(buff.id),
        stacks: getNumber(buff.stacks, 1),
        expiresAt: getNumber(buff.expiresAt),
      }))
      .filter((buff) => buff.id);
  }

  private describeSpendableTalents(self: RuntimePlayer) {
    if (self.talentPoints <= 0) return [];
    const talents = this.talentRankLikes(self);
    return TALENT_IDS.map((talentId) => {
      const status = getTalentRankStatus(talents, self.level, self.talentPoints, talentId);
      if (!status.canRank) return null;
      const talent = TALENTS[talentId];
      return {
        talentId,
        id: talentId,
        tree: talent.tree,
        nodeId: talent.nodeId,
        name: talent.name,
        description: talent.description,
        currentRank: status.currentRank,
        nextRank: status.nextRank,
        maxRank: status.maxRank,
        effectText: talent.effectText,
        unlockAction: getString((talent as { unlockAction?: unknown }).unlockAction),
      };
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  private describeRecommendedTalentSpends(self: RuntimePlayer, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE) {
    return this.describeSpendableTalents(self)
      .map((talent) => ({
        ...talent,
        priority: this.scoreTalentSpend(self, talent.talentId, profile),
        reason: this.describeTalentSpendReason(talent.talentId, profile),
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, Math.max(1, Math.min(5, self.talentPoints || 1)));
  }

  private chooseEquipmentUpgradeDecision(self: RuntimePlayer, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE): AgentBridgeDecision | null {
    const equippedBySlot = new Map(self.equipment.map((slot) => [getString(slot.slot), slot]));
    const candidates = self.inventory
      .map((item) => {
        const itemId = normalizeKnownItemId(getString(item.id));
        if (!itemId || getNumber(item.count) <= 0) return null;
        const chainTokenId = getString(item.chainTokenId);
        const chainTier = getNumber(item.chainTier, 1);
        const equipment = getItemEquipment(itemId, chainTier, self.level);
        if (!equipment) return null;
        const equipped = equippedBySlot.get(equipment.slot);
        const equippedItemId = normalizeKnownItemId(getString(equipped?.itemId));
        const equippedTokenId = getString(equipped?.chainTokenId);
        if (equippedItemId === itemId && equippedTokenId === chainTokenId) return null;
        const equippedEquipment = equippedItemId
          ? getItemEquipment(equippedItemId, getNumber(equipped?.chainTier, 1), self.level)
          : null;
        const score = scoreEquipmentStats(equipment.stats, profile);
        const currentScore = equippedEquipment ? scoreEquipmentStats(equippedEquipment.stats, profile) : 0;
        const delta = score - currentScore;
        return {
          itemId,
          chainTokenId,
          slot: equipment.slot,
          score,
          currentScore,
          delta,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .filter((entry) => entry.delta >= 1.25)
      .sort((a, b) => b.delta - a.delta || b.score - a.score);
    const best = candidates[0];
    if (!best) return null;
    return normalizeDecision({
      action: "equip_item",
      reason: `equipping ${best.itemId} improves ${best.slot} before more combat`,
      itemId: best.itemId,
      chainTokenId: best.chainTokenId || null,
    });
  }

  private scoreTalentSpend(self: RuntimePlayer, talentId: TalentId, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE) {
    const talent = TALENTS[talentId];
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    let score = 0.1;
    if (talent.tree === "brawler") score += 0.12;
    if (talent.tree === "utility") score += 0.1;
    if (talentId === "brawler:street-tough") score += 0.36;
    if (talentId === "utility:light-step") score += 0.3;
    if (talentId === "utility:recovery-loop") score += 0.26;
    if (talentId === "brawler:heavy-hands") score += 0.24;
    if (talentId === "caster:deep-pockets") score += 0.12;
    score += this.scoreProfileTalentFit(profile, talentId);
    if (healthRatio < RECOVER_HEALTH_RATIO && talentId === "brawler:street-tough") score += 0.12;
    if (this.getAttackers(self).length > 0 && talent.tree === "brawler") score += 0.08;
    return round(score);
  }

  private scoreProfileTalentFit(profile: AgentCommandProfile, talentId: TalentId) {
    const brawlerTank = profile.role === "tank" || profile.spec === "brawler_tank";
    const brawlerDps = profile.role === "dps" || profile.spec === "brawler_dps";
    const supportCaster = profile.role === "healer" || profile.role === "support" || profile.spec === "utility_support";
    const rangedUtility = profile.spec === "utility_ranger";
    let score = 0;

    if (brawlerTank) {
      if (talentId === "brawler:street-tough") score += 0.34;
      if (talentId === "brawler:heavy-hands") score += 0.28;
      if (talentId === "brawler:snap-swing") score += 0.44;
      if (talentId === "brawler:whirlwind") score += 0.56;
      if (talentId === "utility:recovery-loop") score += 0.18;
    }

    if (brawlerDps) {
      if (talentId === "brawler:heavy-hands") score += 0.44;
      if (talentId === "brawler:snap-swing") score += 0.56;
      if (talentId === "brawler:whirlwind") score += 0.74;
      if (talentId === "brawler:street-tough") score += 0.08;
    }

    if (supportCaster) {
      if (TALENTS[talentId].tree === "brawler") score -= 0.22;
      if (talentId === "caster:deep-pockets") score += 0.5;
      if (talentId === "caster:sticker-sparks") score += 0.58;
      if (talentId === "caster:flow-state") score += 0.7;
      if (talentId === "caster:frost-nova") score += 0.82;
      if (talentId === "utility:recovery-loop") score += 0.2;
      if (talentId === "brawler:street-tough") score += 0.12;
    }

    if (rangedUtility) {
      if (talentId === "utility:light-step") score += 0.24;
      if (talentId === "utility:errand-brain") score += 0.2;
      if (talentId === "utility:recovery-loop") score += 0.44;
      if (talentId === "utility:multishot") score += 0.52;
      if (talentId === "brawler:street-tough") score += 0.1;
    }

    if (profile.priority === "boss_hunter") {
      if (talentId === "brawler:street-tough") score += 0.16;
      if (talentId === "brawler:heavy-hands") score += 0.16;
      if (talentId === "brawler:snap-swing") score += 0.18;
      if (talentId === "brawler:whirlwind") score += 0.18;
      if (talentId === "caster:frost-nova") score += 0.14;
    }

    return score;
  }

  private talentRankLikes(self: RuntimePlayer): TalentRankLike[] {
    return self.talents.map((talent) => ({
      id: getString(talent.id),
      tree: getString(talent.tree),
      nodeId: getString(talent.nodeId),
      rank: getNumber(talent.rank),
    }));
  }

  private describeTalentSpendReason(talentId: TalentId, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE) {
    if (profile.role === "tank" || profile.spec === "brawler_tank") {
      if (talentId.startsWith("brawler:")) return "tank profile favors HP, bonk threat, and close control for group fights";
    }
    if (profile.role === "dps" || profile.spec === "brawler_dps") {
      if (talentId.startsWith("brawler:")) return "dps profile favors faster, harder close pressure";
    }
    if (profile.role === "healer" || profile.role === "support" || profile.spec === "utility_support") {
      if (talentId.startsWith("caster:")) return "support profile favors mana, regen, and control for safer group fights";
    }
    if (profile.spec === "utility_ranger" && talentId.startsWith("utility:")) return "ranger profile favors movement, recovery, and ranged utility";
    switch (talentId) {
      case "brawler:street-tough":
        return "more max HP improves farm survival";
      case "utility:light-step":
        return "movement helps safer routing and retreats";
      case "utility:recovery-loop":
        return "recovery helps downtime between pulls";
      case "brawler:heavy-hands":
        return "more basic attack damage helps finish close fights";
      case "caster:deep-pockets":
        return "more mana gives extra room for casts";
      default:
        return TALENTS[talentId].description;
    }
  }

  private buildSocialObservation(now: number) {
    const pendingMessages = this.pendingSocialMessages
      .filter((entry) => now - entry.observedAt <= SOCIAL_MESSAGE_TTL_MS)
      .map((entry) => ({ ...entry, observedAgoMs: Math.max(0, now - entry.observedAt) }));
    return {
      pendingMessages,
      canChatNow: this.canSendChat(),
      canEmoteNow: this.canSendEmote(),
      chatCooldownMs: Math.max(0, this.nextChatAt - now),
      emoteCooldownMs: Math.max(0, this.nextEmoteAt - now),
    };
  }

  private describeQuestOffers() {
    return [...this.questMemory.values()]
      .filter((entry) => entry.kind === "offer")
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, 12)
      .map((entry) => ({
        questId: entry.questId,
        npcId: entry.npcId,
        npcName: entry.npcName,
        turnInNpcId: entry.turnInNpcId,
        turnInNpcName: entry.turnInNpcName,
        title: entry.title,
        objective: entry.objectiveLabel,
        required: entry.required,
        rewardPreview: entry.rewardPreview,
        observedAgoMs: Math.max(0, Date.now() - entry.observedAt),
      }));
  }

  private describeAvailableQuestHints(self: RuntimePlayer) {
    const questSnapshots: QuestSnapshot[] = self.quests.flatMap((quest) => {
      const id = getString(quest.id);
      if (!(QUEST_IDS as readonly string[]).includes(id)) return [];
      return [{
        id: id as QuestId,
        status: normalizeQuestStatus(getString(quest.status)),
        progress: getNumber(quest.progress),
        required: getNumber(quest.required),
        flags: getString(quest.flags),
        completedAt: getNumber(quest.completedAt),
      }];
    });
    const hints: AnyRecord[] = [];
    for (const npc of this.npcs.values()) {
      for (const questId of getNpcQuestIds(npc.id)) {
        if (QUESTS[questId].giverNpcId !== npc.id) continue;
        if (!isQuestAvailableForSnapshots(questId, questSnapshots)) continue;
        const existing = questSnapshots.find((quest) => quest.id === questId);
        const requirement = getQuestRequirement(questId);
        const distance = distance2d(self, npc);
        hints.push({
          questId,
          title: QUESTS[questId].title,
          npcId: npc.id,
          npcName: npc.name,
          distance: round(distance),
          requirement,
          requirementStatus: requirement
            ? questSnapshots.find((quest) => quest.id === requirement)?.status || "missing"
            : "none",
          existingStatus: existing?.status || "not_started",
          turnInNpcId: getQuestTurnInNpcId(questId),
          objective: QUESTS[questId].objectiveLabel,
          source: "derived_from_catalog_and_self_quests",
          suggestedAction: distance > QUEST_SEND_RANGE
            ? "accept_quest will move toward the giver first; repeat when observe shows close enough"
            : "accept_quest",
        });
      }
    }
    return hints.sort((a, b) => getNumber(a.distance) - getNumber(b.distance)).slice(0, 16);
  }

  private buildDecisionHints(
    self: RuntimePlayer,
    availableQuestHints: AnyRecord[],
    lootableCorpses: AnyRecord[],
    options: DecisionPlanningOptions = {},
  ) {
    const hints: AnyRecord[] = [];
    if (self.health <= 0) {
      hints.push({ action: "respawn", priority: 1, reason: "self health is 0" });
      return hints;
    }

    const attackers = this.getAttackers(self).sort((a, b) => distance2d(self, a) - distance2d(self, b));
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const runnerDailyBossTarget = this.findRunnerDailyBossQuestTarget(self);
    if (!runnerDailyBossTarget && (attackers.length >= 2 || healthRatio < CRITICAL_HEALTH_RATIO)) {
      hints.push({
        action: "retreat",
        priority: attackers.length >= 2 ? 0.94 : 0.88,
        reason: attackers.length >= 2 ? "multiple NPCs are attacking" : "health is critical",
      });
    }
    if (attackers[0]) {
      hints.push({
        action: "fight_npc",
        npcId: attackers[0].id,
        npcRef: attackers[0].id,
        priority: healthRatio < CRITICAL_HEALTH_RATIO ? 0.45 : 0.86,
        reason: `${attackers[0].name} is attacking you`,
      });
    }

    const closeLoot = lootableCorpses.find((corpse) => getNumber(corpse.distance) <= LOOT_SEND_RANGE);
    if (closeLoot) {
      hints.push({
        action: "loot",
        npcId: getString(closeLoot.id),
        npcRef: getString(closeLoot.id),
        priority: 0.92,
        reason: `${getString(closeLoot.name) || "corpse"} has loot nearby`,
      });
    }

    const focusedQuestId = normalizeKnownQuestId(cleanText(options.focusedQuestId, 96));
    if (focusedQuestId) {
      const focusedDecision = this.chooseQuestGoalDecision(self, focusedQuestId, "quest_completed", {
        profile: options.profile ?? DEFAULT_COMMAND_PROFILE,
        deathCount: options.deathCount ?? 0,
      });
      if (focusedDecision) {
        const focusedHint = this.toSuggestedDecision(focusedDecision);
        hints.push({
          ...focusedHint,
          priority: 0.88,
          reason: focusedHint.reason || focusedDecision.reason,
        });
      } else {
        hints.push({
          action: "wait",
          questId: focusedQuestId,
          priority: 0.45,
          reason: `focused on ${focusedQuestId}; no actionable focused quest step is visible yet`,
        });
      }
      return hints
        .sort((a, b) => getNumber(b.priority) - getNumber(a.priority))
        .slice(0, 8);
    }

    const readyQuest = self.quests.find((quest) => (
      getString(quest.status) === "ready"
      && !(options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(getString(quest.id)))
    ));
    if (readyQuest) {
      const questId = getString(readyQuest.id);
      const npc = this.resolveQuestTurnInNpc(questId);
      const dailyReturnDecision = this.chooseDailyBossReturnDecision(self, questId, npc);
      if (dailyReturnDecision) {
        hints.push({
          action: dailyReturnDecision.action,
          questId,
          npcId: npc?.id ?? "",
          npcRef: npc?.id ?? "",
          routeId: cleanText(dailyReturnDecision.text, 80) || undefined,
          priority: 0.9,
          reason: dailyReturnDecision.reason,
        });
      } else {
        hints.push({
          action: "complete_quest",
          questId,
          npcId: npc?.id ?? "",
          npcRef: npc?.id ?? "",
          priority: npc && distance2d(self, npc) <= QUEST_SEND_RANGE ? 0.9 : 0.78,
          reason: `${questId} is ready to turn in`,
        });
      }
    }

    const talentSpend = this.describeRecommendedTalentSpends(self, options.profile)[0];
    if (talentSpend) {
      hints.push({
        action: "select_talent",
        talentId: talentSpend.talentId,
        priority: 0.74,
        reason: `unspent skill point available; ${talentSpend.reason}`,
      });
    }

    if (!options.skipOptionalBossDailies && this.isActiveDailySignalQuest(self)) {
      const dailyBossTarget = this.findRunnerDailyBossQuestTarget(self);
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        DAILY_SIGNAL_QUEST_ID,
        dailyBossTarget?.npc ?? null,
        dailyBossTarget
          ? `${dailyBossTarget.npc.name} matches active quest ${DAILY_SIGNAL_QUEST_ID}`
          : `${DAILY_SIGNAL_QUEST_ID} is active and the runner daily boss target is not visible yet`,
      );
      if (dailyBossDecision) {
        hints.push({
          action: dailyBossDecision.action,
          npcId: dailyBossTarget?.npc.id ?? DAILY_BOSS_NPC_ID,
          npcRef: cleanText(dailyBossDecision.npcRef, 96) || DAILY_BOSS_NPC_ID,
          questId: DAILY_SIGNAL_QUEST_ID,
          routeId: cleanText(dailyBossDecision.text, 80) || undefined,
          priority: dailyBossDecision.action === "travel_route" ? 0.9 : 0.92,
          reason: dailyBossDecision.reason,
        });
      }
    }

    for (const offer of availableQuestHints
      .filter((hint) => !(options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(getString(hint.questId))))
      .slice(0, 3)) {
      hints.push({
        action: "accept_quest",
        questId: getString(offer.questId),
        npcId: getString(offer.npcId),
        npcRef: getString(offer.npcId),
        priority: getNumber(offer.distance) <= QUEST_SEND_RANGE ? 0.82 : 0.55,
        reason: `${getString(offer.title) || getString(offer.questId)} is available`,
      });
    }

    const namedTarget = this.findNamedObjectiveTarget(self, "", options);
    if (namedTarget) {
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        namedTarget.questId,
        namedTarget.npc,
        `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`,
      );
      if (dailyBossDecision) {
        hints.push({
          action: dailyBossDecision.action,
          npcId: namedTarget.npc.id,
          npcRef: cleanText(dailyBossDecision.npcRef, 96) || namedTarget.npc.id,
          questId: namedTarget.questId,
          routeId: cleanText(dailyBossDecision.text, 80) || undefined,
          priority: dailyBossDecision.action === "travel_route" ? 0.8 : 0.76,
          reason: dailyBossDecision.reason,
        });
        return hints
          .sort((a, b) => getNumber(b.priority) - getNumber(a.priority))
          .slice(0, 8);
      }
      hints.push({
        action: "fight_npc",
        npcId: namedTarget.npc.id,
        npcRef: namedTarget.npc.id,
        questId: namedTarget.questId,
        priority: 0.76,
        reason: `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`,
      });
    }

    const questTarget = this.findGenericQuestTarget(self, "", options);
    if (questTarget) {
      const dailyBossDecision = this.chooseDailyBossRunnerDecision(
        self,
        questTarget.questId,
        questTarget.npc,
        `${questTarget.npc.name} matches active quest ${questTarget.questId}`,
      );
      if (dailyBossDecision) {
        hints.push({
          action: dailyBossDecision.action,
          npcId: questTarget.npc.id,
          npcRef: cleanText(dailyBossDecision.npcRef, 96) || questTarget.npc.id,
          questId: questTarget.questId,
          routeId: cleanText(dailyBossDecision.text, 80) || undefined,
          priority: dailyBossDecision.action === "travel_route" ? 0.72 : 0.64,
          reason: dailyBossDecision.reason,
        });
        return hints
          .sort((a, b) => getNumber(b.priority) - getNumber(a.priority))
          .slice(0, 8);
      }
      hints.push({
        action: "fight_npc",
        npcId: questTarget.npc.id,
        npcRef: questTarget.npc.id,
        questId: questTarget.questId,
        priority: 0.64,
        reason: `${questTarget.npc.name} matches active quest ${questTarget.questId}`,
      });
    }
    const genericTargetAreaDecision = this.chooseActiveGenericQuestTargetAreaDecision(self, "", options);
    if (genericTargetAreaDecision) {
      const areaHint = this.toSuggestedDecision(genericTargetAreaDecision);
      hints.push({
        ...areaHint,
        priority: areaHint.action === "travel_route" || areaHint.action === "move_to" ? 0.6 : 0.42,
        reason: areaHint.reason || genericTargetAreaDecision.reason,
      });
    }

    return hints
      .sort((a, b) => getNumber(b.priority) - getNumber(a.priority))
      .slice(0, 8);
  }

  private findNamedObjectiveTarget(self: RuntimePlayer, preferredQuestId = "", options: { skipOptionalBossDailies?: boolean } = {}) {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId) continue;
      if (options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(questId)) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const completed = getQuestFlagSet(getString(quest.flags));
      for (const objective of getQuestObjectives(questId)) {
        if (completed.has(objective.id)) continue;
        const npc = this.npcs.get(objective.id);
        if (npc && isAttackable(npc) && npc.health > 0 && npc.defeatedAt <= 0 && !this.isNpcAvoided(npc.id)) return { questId, npc };
      }
    }
    return null;
  }

  private findActiveGroupObjectiveNpc(self: RuntimePlayer, preferredQuestId = "") {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId || !this.isGroupEncounterQuest(questId)) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const completed = getQuestFlagSet(getString(quest.flags));
      for (const objective of getQuestObjectives(questId)) {
        if (completed.has(objective.id)) continue;
        const npc = this.npcs.get(objective.id);
        if (npc && isAttackable(npc) && npc.health > 0 && npc.defeatedAt <= 0) return npc;
      }
    }
    return null;
  }

  private questAgentHints(questId: string): QuestAgentHints {
    return getQuestAgentHints(questId);
  }

  private chooseGenericQuestTargetAreaDecision(self: RuntimePlayer, questId: string, options: DecisionPlanningOptions = {}) {
    const knownQuestId = normalizeKnownQuestId(questId);
    if (!knownQuestId || getQuestObjectives(knownQuestId).length > 0) return null;
    const matchers = getQuestTargetMatchers(knownQuestId);
    if (matchers.models.length === 0 && matchers.roles.length === 0 && matchers.idPrefixes.length === 0) return null;
    const hint = this.questAgentHints(knownQuestId).targetArea;
    if (!hint) return null;
    const groupDecision = this.chooseGroupEncounterDecision(
      self,
      knownQuestId,
      hint.point,
      `${hint.label} are the public target area for ${knownQuestId}`,
      options.profile,
      options.deathCount ?? 0,
    );
    if (groupDecision) return groupDecision;
    const routeDecision = this.chooseRouteToPointAreaDecision(
      self,
      hint.point,
      `${hint.label} are the public target area for ${knownQuestId}; routing to reacquire safe visible targets`,
      knownQuestId,
    );
    if (routeDecision) return routeDecision;
    const patrolDecision = this.chooseGenericQuestPatrolDecision(self, knownQuestId, hint.label, hint.point);
    if (patrolDecision) return patrolDecision;
    return normalizeDecision({
      action: "wait",
      reason: `${hint.label} are the public target area for ${knownQuestId}; waiting for safe visible targets`,
      questId: knownQuestId,
    });
  }

  private chooseActiveGenericQuestTargetAreaDecision(self: RuntimePlayer, preferredQuestId = "", options: DecisionPlanningOptions = {}) {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId) continue;
      if (options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(questId)) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const decision = this.chooseGenericQuestTargetAreaDecision(self, questId, options);
      if (decision) return decision;
    }
    return null;
  }

  private chooseGenericQuestPatrolDecision(self: RuntimePlayer, questId: QuestId, label: string, fallbackCenter?: Point) {
    const configuredPatrolPoints = this.questAgentHints(questId).patrolPoints;
    const patrolPoints = configuredPatrolPoints.length > 0
      ? configuredPatrolPoints
      : fallbackCenter
        ? generatedQuestTargetAreaPatrolPoints(fallbackCenter, label)
        : [];
    return this.chooseAreaPatrolDecision(
      self,
      questId,
      patrolPoints,
      `${label} are the public target area for ${questId}`,
    );
  }

  private chooseAreaPatrolDecision(
    self: RuntimePlayer,
    questId: QuestId,
    patrolPoints: QuestAgentPointHint[],
    reasonPrefix: string,
  ) {
    if (!patrolPoints.length) return null;
    const candidates = patrolPoints
      .map((candidate, index) => {
        const travelDistance = distance2d(self, candidate.point);
        const pathRisk = this.scoreHostileTravelPath(self, candidate.point, HOSTILE_PATH_CORRIDOR_RADIUS);
        const density = this.nearbyHostileCount(candidate.point, 9);
        const dangerous = this.nearbyDangerousHostileCount(candidate.point, DANGEROUS_NEIGHBOR_RADIUS);
        const idealDistance = 18;
        const score = pathRisk * 4
          + dangerous * 1.8
          + density * 0.18
          + Math.abs(travelDistance - idealDistance) * 0.025
          + index * 0.01;
        return { ...candidate, travelDistance, pathRisk, density, dangerous, score };
      })
      .filter((candidate) => candidate.travelDistance > 6)
      .filter((candidate) => candidate.pathRisk <= 0.78)
      .filter((candidate) => candidate.dangerous <= 1)
      .sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (!best) return null;
    return normalizeDecision({
      action: "move_to",
      reason: `${reasonPrefix}; patrolling ${best.label} to reacquire safe visible targets`,
      questId,
      x: best.point.x,
      z: best.point.z,
    });
  }

  private chooseMissingObjectiveRouteDecision(self: RuntimePlayer, preferredQuestId = "", options: DecisionPlanningOptions = {}) {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId) continue;
      if (options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(questId)) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const completed = getQuestFlagSet(getString(quest.flags));
      for (const objective of getQuestObjectives(questId)) {
        if (completed.has(objective.id)) continue;
        const visibleNpc = this.npcs.get(objective.id);
        if (visibleNpc && isAttackable(visibleNpc) && visibleNpc.health > 0 && visibleNpc.defeatedAt <= 0) {
          if (this.isGroupEncounterQuest(questId)) {
            const groupDecision = this.chooseGroupEncounterDecision(
              self,
              questId,
              visibleNpc,
              this.isNpcAvoided(visibleNpc.id)
                ? `${objective.label || visibleNpc.name || objective.id} is an active objective for ${questId} but was recently unsafe`
                : `${objective.label || visibleNpc.name || objective.id} is an active objective for ${questId}`,
              options.profile,
              options.deathCount ?? 0,
              objective.id,
              { markAttempt: !options.planningOnly },
            );
            if (groupDecision) return groupDecision;
            const routeDecision = this.chooseRouteToNpcAreaDecision(
              self,
              visibleNpc,
              `${objective.label || visibleNpc.name || objective.id} is the active group objective for ${questId}`,
              questId,
            );
            if (routeDecision) return routeDecision;
            return normalizeDecision({
              action: "fight_npc",
              reason: `${objective.label || visibleNpc.name || objective.id} is the active group objective for ${questId}`,
              questId,
              npcRef: visibleNpc.id,
            });
          }
          if (this.isNpcAvoided(visibleNpc.id)) {
            const routeDecision = this.chooseRouteToNpcAreaDecision(
              self,
              visibleNpc,
              `${objective.label || visibleNpc.name || objective.id} is an active objective for ${questId} but was recently unsafe; repositioning before retrying`,
              questId,
            );
            if (routeDecision) return routeDecision;
            return normalizeDecision({
              action: "wait",
              reason: `${objective.label || visibleNpc.name || objective.id} is an active objective for ${questId} but was recently unsafe; waiting near its area before retrying`,
              questId,
              npcRef: visibleNpc.id,
            });
          }
          continue;
        }
        const hint = OBJECTIVE_LOCATION_HINTS[objective.id];
        if (!hint) continue;
        const groupDecision = this.chooseGroupEncounterDecision(
          self,
          questId,
          hint.point,
          `${objective.label || hint.label} is an active objective for ${questId} but is not currently visible`,
          options.profile,
          options.deathCount ?? 0,
          objective.id,
          { markAttempt: !options.planningOnly },
        );
        if (groupDecision) return groupDecision;
        const routeDecision = this.chooseRouteToPointAreaDecision(
          self,
          hint.point,
          `${objective.label || hint.label} is an active objective for ${questId} but is not currently visible; routing to its known area`,
          questId,
          objective.id,
        );
        if (routeDecision) return routeDecision;
        const patrolDecision = this.chooseAreaPatrolDecision(
          self,
          questId,
          generatedQuestTargetAreaPatrolPoints(hint.point, objective.label || hint.label),
          `${objective.label || hint.label} is an active objective for ${questId} but is not currently visible`,
        );
        if (patrolDecision) {
          return normalizeDecision({
            ...patrolDecision,
            npcRef: objective.id,
          });
        }
        return normalizeDecision({
          action: "wait",
          reason: `${objective.label || hint.label} is an active objective for ${questId} but is not currently visible; waiting at its known area`,
          questId,
          npcRef: objective.id,
        });
      }
    }
    return null;
  }

  private findGenericQuestTarget(self: RuntimePlayer, preferredQuestId = "", options: { skipOptionalBossDailies?: boolean } = {}) {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId || getQuestObjectives(questId).length > 0) continue;
      if (options.skipOptionalBossDailies && this.isOptionalAutoplayQuest(questId)) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const matchers = getQuestTargetMatchers(questId);
      if (matchers.models.length === 0 && matchers.roles.length === 0 && matchers.idPrefixes.length === 0) continue;
      const candidates = [...this.npcs.values()]
        .filter((candidate) => isAttackable(candidate) && candidate.health > 0 && candidate.defeatedAt <= 0)
        .filter((candidate) => matchesQuestTarget(candidate, matchers))
        .filter((candidate) => isQuestTargetAreaCandidate(questId, candidate))
        .filter((candidate) => !this.isSuppressedGenericQuestTarget(questId, candidate))
        .map((npc) => ({
          npc,
          score: this.scoreCombatTargetCandidate(self, npc),
          avoided: this.isNpcAvoided(npc.id),
        }))
        .sort((a, b) => a.score - b.score || distance2d(self, a.npc) - distance2d(self, b.npc));
      const safeTarget = candidates.find((candidate) => !candidate.avoided && candidate.score <= GENERIC_QUEST_TARGET_SAFE_SCORE);
      if (safeTarget) return { questId, npc: safeTarget.npc };
      const fallbackTarget = candidates.find((candidate) => !candidate.avoided && candidate.score <= GENERIC_QUEST_TARGET_FALLBACK_SCORE);
      if (fallbackTarget) return { questId, npc: fallbackTarget.npc };
    }
    return null;
  }

  private isSuppressedGenericQuestTarget(questId: QuestId, npc: RuntimeNpc) {
    return isGenericQuestTargetSuppressed(questId, npc.id);
  }

  private findSafeTrainingTarget(self: RuntimePlayer) {
    return [...this.npcs.values()]
      .filter((candidate) => isAttackable(candidate) && candidate.health > 0 && candidate.defeatedAt <= 0)
      .filter((candidate) => !this.isNpcAvoided(candidate.id))
      .filter((candidate) => this.scorePullRisk(candidate) <= 0.5 && this.scoreApproachRisk(self, candidate) <= 0.62)
      .sort((a, b) => this.scoreCombatTargetCandidate(self, a) - this.scoreCombatTargetCandidate(self, b) || distance2d(self, a) - distance2d(self, b))[0] ?? null;
  }

  private scoreCombatTargetCandidate(self: RuntimePlayer, npc: RuntimeNpc) {
    const distance = distance2d(self, npc);
    const distancePenalty = distance > 40 ? 0.12 : distance > 28 ? 0.06 : 0;
    const pullRisk = this.scorePullRisk(npc);
    const approachRisk = this.scoreApproachRisk(self, npc);
    const densityPenalty = this.nearbyHostileCount(npc, 9, npc.id) * 0.08;
    const avoidPenalty = this.combatAvoidancePenalty(npc);
    const areaAvoidPenalty = this.combatAreaAvoidancePenalty(npc);
    const crowdedCasterPenalty = npc.combatStyle === "caster" && this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id) >= 2 ? 0.16 : 0;
    return round(clamp(pullRisk * 0.55 + approachRisk * 0.85 + densityPenalty + distancePenalty + avoidPenalty + areaAvoidPenalty + crowdedCasterPenalty, 0, 2));
  }

  private describeCombatMath(self: RuntimePlayer) {
    const npc = this.activeEngagementNpc();
    const attackers = this.getAttackers(self);
    if (!npc && attackers.length === 0) return null;
    const target = npc ?? attackers[0];
    if (!target) return null;
    const estimate = this.estimateCombatOutcome(self, target, attackers);
    return {
      targetId: target.id,
      targetName: target.name,
      attackers: attackers.map((attacker) => attacker.id),
      favorable: estimate.favorable,
      targetTtkSeconds: formatEstimateSeconds(estimate.targetTtkMs),
      survivalSeconds: formatEstimateSeconds(estimate.survivalMs),
    };
  }

  private handleChatMessage(message: unknown) {
    this.remember(`chat:${messageSummary(message)}`, isImportantChat(message));
    const record = asRecord(message);
    const sessionId = getString(record.sessionId);
    const identityType = getString(record.identityType);
    const text = cleanText(record.text, 180);
    const kind = cleanText(record.kind, 20) || "say";
    if (!sessionId || sessionId === this.room?.sessionId || identityType === "npc" || !text) return;
    const now = Date.now();
    const player = this.players.get(sessionId);
    const entry: AgentCommandSocialChat = {
      sessionId,
      name: cleanText(record.name, 48) || player?.name || "player",
      identityType,
      isAgent: Boolean(player?.isAgent),
      text: makeChatLine(text),
      kind,
      observedAt: now,
    };
    this.pendingSocialMessages = [
      ...this.pendingSocialMessages.filter((entry) => now - entry.observedAt <= SOCIAL_MESSAGE_TTL_MS).slice(-7),
      entry,
    ];
    this.rememberActiveCommandChat(entry);
  }

  private handleCombatEvent(message: unknown) {
    this.remember(`combat:${messageSummary(message)}`);
    this.recordRecentNpcPlayerCombat(message as CombatEvent);
    this.recordActiveCommandCombat(message as CombatEvent);
  }

  private recordRecentNpcPlayerCombat(event: CombatEvent) {
    const record = asRecord(event);
    const sourceId = getString(record.sourceId);
    const target = asRecord(record.target);
    const targetKind = getString(target.kind);
    const targetId = getString(target.id);
    if (!sourceId || !targetId) return;

    const sourceNpc = this.npcs.get(sourceId);
    const now = Date.now();
    if (targetKind === "player" && sourceNpc) {
      this.recentNpcPlayerCombat.set(sourceNpc.id, {
        lastAt: now,
        playerSessionId: targetId,
        direction: "npc_to_player",
        defeated: Boolean(record.defeated),
      });
      this.pruneRecentNpcPlayerCombat(now);
      return;
    }

    const targetNpc = targetKind === "npc" ? this.npcs.get(targetId) : null;
    if (targetNpc && !sourceNpc) {
      this.recentNpcPlayerCombat.set(targetNpc.id, {
        lastAt: now,
        playerSessionId: sourceId,
        direction: "player_to_npc",
        defeated: Boolean(record.defeated),
      });
      this.pruneRecentNpcPlayerCombat(now);
    }
  }

  private recordActiveCommandCombat(event: CombatEvent) {
    const command = this.activeCommandId ? this.commands.get(this.activeCommandId) : null;
    if (!command || command.status !== "running" || !this.room) return;
    const record = asRecord(event);
    const sourceId = getString(record.sourceId);
    if (sourceId !== this.room.sessionId) return;
    const amount = Math.max(0, getNumber(record.amount));
    if (amount <= 0) return;
    const impactAt = getNumber(record.impactAt);
    if (impactAt > Date.now() + 100) return;
    const actionId = getString(record.actionId);
    const target = asRecord(record.target);
    const targetKind = getString(target.kind);
    const targetId = getString(target.id);
    const now = impactAt || getNumber(record.sentAt) || Date.now();

    if (actionId === "heal" || targetKind === "player") {
      command.combat.healingDone += amount;
      return;
    }
    if (targetKind !== "npc" || !targetId) return;

    const npc = this.npcs.get(targetId);
    const targetStats = command.combat.targets.get(targetId) ?? {
      targetId,
      targetName: getString(record.targetName) || npc?.name || targetId,
      targetModel: npc?.model || "",
      damageDone: 0,
      hitCount: 0,
      firstAt: now,
      lastAt: now,
      defeated: false,
    };
    targetStats.targetName = getString(record.targetName) || targetStats.targetName;
    targetStats.targetModel = npc?.model || targetStats.targetModel;
    targetStats.damageDone += amount;
    targetStats.hitCount += 1;
    targetStats.firstAt = targetStats.firstAt || now;
    targetStats.lastAt = Math.max(targetStats.lastAt, now);
    targetStats.defeated = targetStats.defeated || Boolean(record.defeated);
    command.combat.targets.set(targetId, targetStats);

    command.combat.damageDone += amount;
    command.combat.hitCount += 1;
    command.combat.firstAt = command.combat.firstAt || now;
    command.combat.lastAt = Math.max(command.combat.lastAt, now);
  }

  private rememberQuestMessage(kind: QuestMemory["kind"], message: unknown) {
    const record = asRecord(message);
    const questId = getString(record.questId);
    if (questId) {
      const entry: QuestMemory = {
        kind,
        questId,
        npcId: getString(record.npcId),
        npcName: getString(record.npcName),
        turnInNpcId: getString(record.turnInNpcId) || (kind === "turnIn" ? getString(record.npcId) : ""),
        turnInNpcName: getString(record.turnInNpcName) || (kind === "turnIn" ? getString(record.npcName) : ""),
        title: getString(record.title),
        text: getString(record.statusText) || getString(record.description) || getString(record.completionText) || getString(record.completedTaskSummary),
        objectiveLabel: getString(record.objectiveLabel),
        progress: getNumber(record.progress),
        required: getNumber(record.required),
        rewardPreview: Array.isArray(record.rewardPreview) ? record.rewardPreview.map(String).slice(0, 8) : [],
        nextQuestId: getString(record.nextQuestId),
        nextQuestTitle: getString(record.nextQuestTitle),
        nextGiverNpcId: getString(record.nextGiverNpcId),
        nextGiverNpcName: getString(record.nextGiverNpcName),
        observedAt: Date.now(),
      };
      this.questMemory.set(questId, entry);
      if (kind === "status" || kind === "turnIn" || kind === "offer") this.focusedQuestId = questId;
      if (kind === "completed" && this.focusedQuestId === questId) this.focusedQuestId = getString(record.nextQuestId);
    }
    this.remember(`${kind}:${messageSummary(message)}`, true);
  }

  private remember(message: string, print = false) {
    this.recentMessages = [...this.recentMessages.slice(-30), message];
    if (print) console.log(`[agent-bridge] ${this.id} ${message}`);
  }
}

export class AgentBridgeManager {
  private readonly config: Required<AgentBridgeConfig>;
  private readonly sessions = new Map<string, AgentBridgeSession>();

  constructor(config: AgentBridgeConfig) {
    this.config = {
      roomServer: config.roomServer,
      roomName: config.roomName || ROOM_NAME,
      defaultName: config.defaultName || "bankr-agent",
      sessionTtlMs: config.sessionTtlMs || 12 * 60 * 60 * 1000,
    };
  }

  async handle(req: IncomingMessage, requestUrl: URL, res: ServerResponse): Promise<boolean> {
    const path = requestUrl.pathname;
    if (!["/agent-start", "/agent-observe", "/agent-action", "/agent-command", "/agent-command-stop", "/agent-stop"].includes(path)) return false;
    const requestId = randomUUID();

    writeBridgeCorsHeaders(res);
    writeBridgeNoStoreHeaders(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }

    this.pruneSessions();
    try {
      if (path === "/agent-start") await this.handleStart(req, res);
      else if (path === "/agent-observe") await this.handleObserve(req, requestUrl, res);
      else if (path === "/agent-action") await this.handleAction(req, res);
      else if (path === "/agent-command") await this.handleCommand(req, requestUrl, res);
      else if (path === "/agent-command-stop") await this.handleCommandStop(req, res);
      else if (path === "/agent-stop") await this.handleStop(req, res);
    } catch (error) {
      writeBridgeError(res, error, requestId);
    }
    return true;
  }

  shutdown() {
    for (const session of this.sessions.values()) session.stop();
    this.sessions.clear();
  }

  private async handleStart(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
      return;
    }
    const payload = await readBridgeJsonBody<AgentBridgeStartPayload>(req, BRIDGE_BODY_LIMIT_BYTES);
    const walletAddress = normalizeWalletAddress(payload.walletAddress || payload.wallet || "");
    const sessionToken = cleanText(payload.sessionToken, 160) || readBearerToken(req);
    if (!walletAddress) {
      throw new BridgeHttpError(
        400,
        "valid walletAddress required",
        "valid_wallet_address_required",
        "send_valid_wallet_address",
      );
    }
    const tokenVerification = verifyAgentSessionTokenDetailed(walletAddress, sessionToken);
    if (!tokenVerification.ok) {
      throw new BridgeHttpError(
        401,
        "valid agent session bearer token required",
        tokenVerification.code,
        tokenVerification.recovery,
      );
    }

    for (const [id, existing] of this.sessions) {
      if (existing.walletAddress === walletAddress) {
        existing.stop();
        this.sessions.delete(id);
      }
    }

    const session = new AgentBridgeSession({
      roomServer: this.config.roomServer,
      roomName: this.config.roomName,
      walletAddress,
      sessionToken,
      agentName: cleanText(payload.name, 48) || this.config.defaultName,
      inviteCode: cleanText(payload.inviteCode, 80),
      createCharacter: payload.createCharacter !== false,
      objective: cleanText(payload.objective, 260) || "Play mferland naturally with Bankr as the high-level decision brain.",
    });
    this.sessions.set(session.id, session);
    try {
      await session.start();
      writeBridgeJson(res, 200, { ok: true, bridgeSessionId: session.id, status: "started", observeUrl: `/agent-observe?bridgeSessionId=${session.id}` });
    } catch (error) {
      this.sessions.delete(session.id);
      session.stop();
      writeBridgeJson(res, 502, { ok: false, error: `bridge join failed: ${errorMessage(error)}` });
    }
  }

  private async handleObserve(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "GET, HEAD" });
      return;
    }
    const session = this.requireSession(req, requestUrl.searchParams.get("bridgeSessionId"));
    const requestedView = cleanText(requestUrl.searchParams.get("view"), 24).toLowerCase();
    const compact = requestUrl.searchParams.get("compact") === "1" || requestUrl.searchParams.get("compact") === "true";
    const body = session.observe(compact ? "bankr" : requestedView);
    writeBridgeJson(res, 200, body, undefined, req.method === "HEAD");
  }

  private async handleAction(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
      return;
    }
    const payload = await readBridgeJsonBody<AnyRecord>(req, BRIDGE_BODY_LIMIT_BYTES);
    const session = this.requireSession(req, cleanText(payload.bridgeSessionId, 80));
    let decision: AgentBridgeDecision;
    try {
      decision = normalizeDecision({
        ...payload,
        npcRef: payload.npcRef ?? payload.npcId,
        playerRef: payload.playerRef ?? payload.playerId,
        actionId: payload.actionId ?? payload.abilityId,
        text: payload.text ?? payload.routeId ?? payload.tokenId,
      });
    } catch (error) {
      throw new BridgeHttpError(400, errorMessage(error));
    }
    const result = await session.execute(decision);
    writeBridgeJson(res, actionResultHttpStatus(result), result);
  }

  private async handleCommand(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
    const toolUsageStartedAt = Date.now();
    if (req.method === "GET" || req.method === "HEAD") {
      const session = this.requireSession(req, requestUrl.searchParams.get("bridgeSessionId"));
      const body = session.getCommand(requestUrl.searchParams.get("commandId") || "");
      const toolUsageReport = req.method === "HEAD" ? null : await maybeReportCommandToolUsage(req, toolUsageStartedAt);
      writeBridgeJson(res, 200, withOptionalToolUsageReport(body, toolUsageReport), undefined, req.method === "HEAD");
      return;
    }
    if (req.method !== "POST") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "GET, HEAD, POST" });
      return;
    }

    const payload = await readBridgeJsonBody<AnyRecord>(req, BRIDGE_BODY_LIMIT_BYTES);
    const session = this.requireSession(req, cleanText(payload.bridgeSessionId, 80));
    const operation = cleanText(payload.operation, 24).toLowerCase() || "start";
    if (operation === "status") {
      const toolUsageReport = await maybeReportCommandToolUsage(req, toolUsageStartedAt);
      writeBridgeJson(res, 200, withOptionalToolUsageReport(session.getCommand(cleanText(payload.commandId, 80)), toolUsageReport));
      return;
    }
    if (operation === "stop") {
      const toolUsageReport = await maybeReportCommandToolUsage(req, toolUsageStartedAt);
      const stopped = await session.stopCommand(cleanText(payload.commandId, 80));
      writeBridgeJson(res, 200, withOptionalToolUsageReport(stopped, toolUsageReport));
      return;
    }
    if (operation !== "start") {
      writeBridgeJson(res, 400, { ok: false, error: "operation must be start, status, or stop" });
      return;
    }
    const body = await session.startCommand(payload);
    const toolUsageReport = await maybeReportCommandToolUsage(req, toolUsageStartedAt);
    writeBridgeJson(res, 202, withOptionalToolUsageReport(body, toolUsageReport));
  }

  private async handleCommandStop(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
      return;
    }
    const payload = await readBridgeJsonBody<AnyRecord>(req, BRIDGE_BODY_LIMIT_BYTES);
    const session = this.requireSession(req, cleanText(payload.bridgeSessionId, 80));
    writeBridgeJson(res, 200, await session.stopCommand(cleanText(payload.commandId, 80)));
  }

  private async handleStop(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      writeBridgeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
      return;
    }
    const payload = await readBridgeJsonBody<AnyRecord>(req, BRIDGE_BODY_LIMIT_BYTES);
    const id = cleanText(payload.bridgeSessionId, 80);
    const session = this.requireSession(req, id);
    session.stop();
    this.sessions.delete(session.id);
    writeBridgeJson(res, 200, { ok: true, bridgeSessionId: session.id, status: "stopped" });
  }

  private requireSession(req: IncomingMessage, id: string | null | undefined) {
    const sessionId = cleanText(id, 80);
    const session = sessionId ? this.sessions.get(sessionId) : null;
    if (!sessionId) {
      throw new BridgeHttpError(
        400,
        "bridgeSessionId required",
        "bridge_session_id_required",
        "call_agent_start_with_valid_session_token",
      );
    }
    if (!session) {
      throw new BridgeHttpError(
        404,
        "bridge session not found",
        "bridge_session_not_found",
        "call_agent_start_with_existing_session_token",
      );
    }
    const bearer = readBearerToken(req);
    if (!bearer) {
      throw new BridgeHttpError(
        401,
        "valid bearer token required for bridge session",
        "missing_bearer_token",
        "reuse_original_session_token",
      );
    }
    if (bearer !== session.sessionToken) {
      throw new BridgeHttpError(
        401,
        "valid bearer token required for bridge session",
        "bridge_bearer_mismatch",
        "reuse_original_session_token",
      );
    }
    const tokenVerification = verifyAgentSessionTokenDetailed(session.walletAddress, bearer);
    if (!tokenVerification.ok) {
      throw new BridgeHttpError(
        401,
        "valid bearer token required for bridge session",
        tokenVerification.code,
        tokenVerification.recovery,
      );
    }
    return session;
  }

  private pruneSessions(now = Date.now()) {
    for (const [id, session] of this.sessions) {
      if (now - session.startedAt <= this.config.sessionTtlMs) continue;
      session.stop();
      this.sessions.delete(id);
    }
  }
}

class BridgeHttpError extends Error {
  readonly details: AnyRecord | null;
  readonly code?: string;
  readonly recovery?: string;

  constructor(
    readonly status: number,
    message: string,
    detailsOrCode?: AnyRecord | string | null,
    recovery?: string,
  ) {
    super(message);
    if (typeof detailsOrCode === "string") {
      this.details = null;
      this.code = detailsOrCode;
      this.recovery = recovery;
      return;
    }
    this.details = detailsOrCode ?? null;
    this.code = cleanText(this.details?.code, 80) || undefined;
    this.recovery = cleanText(this.details?.recovery, 120) || undefined;
  }
}

export function actionResultHttpStatus(result: { ok: boolean; status?: string }) {
  if (result.ok) return 202;
  if (result.status === "payment_required" || result.status === "wallet_action_required") return 409;
  if (result.status === "chat_cooldown") return 429;
  return 400;
}

export function writeBridgeError(res: ServerResponse, error: unknown, requestId = randomUUID()) {
  if (error instanceof BridgeHttpError) {
    const body = {
      ok: false,
      error: error.message,
      ...(error.details ?? {}),
      code: error.code,
      recovery: error.recovery,
      requestId,
    };
    console.warn("[agent-bridge] request failed", {
      requestId,
      status: error.status,
      error: error.message,
      code: error.code,
      recovery: error.recovery,
    });
    writeBridgeJson(res, error.status, body);
    return;
  }
  console.warn("[agent-bridge] request failed", {
    requestId,
    status: 500,
    error: errorMessage(error),
  });
  writeBridgeJson(res, 500, {
    ok: false,
    error: errorMessage(error),
    code: "internal_bridge_error",
    recovery: "retry_or_report_request_id",
    requestId,
  });
}

function readBridgeJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new BridgeHttpError(413, "payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        resolvePromise((text ? JSON.parse(text) : {}) as T);
      } catch {
        reject(new BridgeHttpError(400, "invalid json"));
      }
    });
  });
}

function writeBridgeJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}, head = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(head ? undefined : body);
}

async function maybeReportCommandToolUsage(req: IncomingMessage, startedAt: number) {
  const payment = parseToolPaymentHeader(req.headers["x-payment"]);
  if (!payment) return null;
  const verified = await verifyZeroPriceToolPayment(payment);
  if (!verified.ok) {
    return {
      ok: false,
      skipped: true,
      reason: verified.error,
    };
  }
  const report = await reportAgentToolUsage("mfertown-agent-command", payment, startedAt);
  return {
    ...report,
    callerAddress: verified.callerAddress,
  };
}

function withOptionalToolUsageReport<T extends AnyRecord>(body: T, toolUsageReport: unknown) {
  return toolUsageReport ? { ...body, toolUsageReport } : body;
}

function writeBridgeCorsHeaders(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type,x-payment");
}

function writeBridgeNoStoreHeaders(res: ServerResponse) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
}

function readBearerToken(req: IncomingMessage) {
  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const match = /^Bearer\s+(.+)$/i.exec(authorization || "");
  return match?.[1]?.trim() || "";
}

function normalizeDecision(value: unknown): AgentBridgeDecision {
  const record = asRecord(value);
  const action = cleanText(record.action, 40);
  if (!DECISION_ACTIONS.includes(action as typeof DECISION_ACTIONS[number])) throw new Error(`invalid action ${action}`);
  return {
    action,
    reason: cleanText(record.reason, 240) || action,
    x: readFiniteNumber(record.x) ?? null,
    z: readFiniteNumber(record.z) ?? null,
    npcRef: nullableText(record.npcRef),
    playerRef: nullableText(record.playerRef),
    questId: nullableText(record.questId),
    itemId: nullableText(record.itemId),
    chainTokenId: nullableText(record.chainTokenId),
    slotId: nullableText(record.slotId),
    talentId: nullableText(record.talentId),
    actionId: nullableText(record.actionId),
    text: nullableText(record.text),
    emoteId: nullableText(record.emoteId),
    quantity: readFiniteNumber(record.quantity) ?? null,
    amountEth: nullableText(record.amountEth),
    paymentTxHash: nullableText(record.paymentTxHash),
    paymentAmountWei: nullableText(record.paymentAmountWei),
    paymentChainId: readFiniteNumber(record.paymentChainId) ?? null,
    paymentContractAddress: nullableText(record.paymentContractAddress),
    sprint: typeof record.sprint === "boolean" ? record.sprint : null,
    jump: typeof record.jump === "boolean" ? record.jump : null,
    traits: record.traits && typeof record.traits === "object" && !Array.isArray(record.traits) ? asRecord(record.traits) : null,
  };
}

function normalizeCommandPayload(value: AgentCommandPayload): NormalizedAgentCommandPayload {
  const record = asRecord(value);
  const kind = normalizeCommandKind(record.command ?? record.kind);
  if (cleanText(record.objective, 260)) {
    throw new BridgeHttpError(400, "freeform objective is not accepted by /agent-command; translate player intent into structured command, goals, profile, and constraints in the agent runner");
  }
  const codeChunk = cleanText(record.codeChunk, 20_000);
  if (codeChunk) {
    throw new BridgeHttpError(400, "hosted /agent-command does not execute codeChunk; run agent-authored code in the external policy runner and call /agent-action or send structured goals/profile");
  }
  const behaviorScheme = normalizeBehaviorScheme(record.behaviorScheme ?? record.behavior);
  const controller = normalizeCommandController(record.controller, record.behaviorMode, record.policyRef ?? record.policySource, record.policyHash ?? record.codeChunkHash);
  const profile = normalizeCommandProfile(record.profile, behaviorScheme, kind);
  const goals = normalizeCommandGoals(record.goals, kind, record);
  const stopWhen = normalizeCommandStopWhen(record.stopWhen);
  const constraints = normalizeCommandConstraints(record.constraints);
  const maxSeconds = normalizeCommandSeconds(record.maxSeconds, kind);
  const questId = cleanText(record.questId, 96);
  const itemId = cleanText(record.itemId, 96);
  const targetCount = normalizeCommandTargetCount(record.targetCount);
  if (kind === "finish_quest" && !questId) {
    throw new BridgeHttpError(400, "finish_quest requires questId");
  }
  if (kind === "farm_until" && (!itemId || targetCount <= 0)) {
    throw new BridgeHttpError(400, "farm_until requires itemId and targetCount");
  }
  if (kind === "run_goals" && goals.length === 0) {
    throw new BridgeHttpError(400, "run_goals requires at least one structured goal");
  }
  return {
    kind,
    behaviorScheme,
    controller,
    profile,
    goals,
    stopWhen,
    constraints,
    maxSeconds,
    questId,
    itemId,
    targetCount,
  };
}

function normalizeCommandController(value: unknown, legacyMode: unknown, policyRef: unknown, policyHash: unknown): AgentCommandController {
  const record = asRecord(value);
  const requested = cleanText(record.type, 40) || cleanText(legacyMode, 40);
  const normalized = requested.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const hash = normalizePolicyHash(record.policyHash ?? policyHash);
  const ref = cleanText(record.policyRef ?? policyRef, 120);
  const type = normalized === "external_policy" || normalized === "external" || ref || hash
    ? "external_policy"
    : "premade";
  return {
    type,
    policyRef: ref,
    policyHash: hash,
  };
}

function normalizeCommandKind(value: unknown): AgentCommandKind {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (text === "finish_next_quest" || text === "quest" || text === "next_quest") return "finish_next_quest";
  if (text === "finish_quest" || text === "quest_id") return "finish_quest";
  if (text === "play_for" || text === "play" || text === "timebox") return "play_for";
  if (text === "farm_until" || text === "farm") return "farm_until";
  if (text === "run_goals" || text === "goal_set" || text === "custom_goal_set" || text === "custom_objective" || text === "custom") return "run_goals";
  return "play_for";
}

function normalizeBehaviorScheme(value: unknown) {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!text) return "";
  if (text === "jump" || text === "jumper" || text === "jumping" || text === "jumping_around") return "jump_around";
  if (text === "wander" || text === "wanderer" || text === "aimless" || text === "aimless_wander") return "wanderer";
  if (text === "dummy" || text === "training_dummy" || text === "training_dummies") return "training_dummies";
  if (text === "dummy_dps" || text === "dps_dummy" || text === "training_dummy_dps" || text === "dps_meter") return "dummy_dps";
  return AGENT_PREMADE_BEHAVIOR_SCHEMES.includes(text as typeof AGENT_PREMADE_BEHAVIOR_SCHEMES[number]) ? text : "";
}

function normalizeCommandProfile(value: unknown, legacyBehavior: unknown, kind: AgentCommandKind): AgentCommandProfile {
  const record = asRecord(value);
  const scheme = premadeProfileForScheme(legacyBehavior, kind);
  return {
    priority: normalizeProfileEnum(record.priority, ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"], scheme.priority),
    role: normalizeProfileEnum(record.role, ["auto", "tank", "healer", "dps", "support"], scheme.role),
    spec: normalizeProfileEnum(record.spec, ["auto", "brawler_tank", "brawler_dps", "caster_fire", "caster_frost", "utility_ranger", "utility_support"], scheme.spec),
    partyMode: normalizeProfileEnum(record.partyMode ?? record.party, ["auto", "grouper", "lone_wolf", "follow_leader"], scheme.partyMode),
    risk: normalizeProfileEnum(record.risk, ["safe", "normal", "bold"], scheme.risk),
    social: normalizeProfileEnum(record.social, ["quiet", "normal", "chatty"], scheme.social),
  };
}

function premadeProfileForScheme(value: unknown, kind: AgentCommandKind): AgentCommandProfile {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base: AgentCommandProfile = {
    ...DEFAULT_COMMAND_PROFILE,
    priority: defaultCommandPriority(kind),
  };
  switch (text) {
    case "mainline":
    case "mainline_quester":
    case "quest":
    case "quester":
      return { ...base, priority: "quester", risk: "normal" };
    case "farmer":
    case "farm":
      return { ...base, priority: "farmer", risk: "normal" };
    case "boss":
    case "boss_hunter":
    case "raider":
      return { ...base, priority: "boss_hunter", partyMode: "grouper", risk: "bold" };
    case "looter":
    case "loot":
      return { ...base, priority: "looter", risk: "normal" };
    case "completionist":
    case "complete":
      return { ...base, priority: "completionist", risk: "normal" };
    case "social":
      return { ...base, priority: "social", social: "normal" };
    case "survivor":
    case "safe":
      return { ...base, priority: "auto", risk: "safe" };
    case "healer":
      return { ...base, priority: "quester", role: "healer", spec: "utility_support", partyMode: "grouper", risk: "safe" };
    case "tank":
      return { ...base, priority: "quester", role: "tank", spec: "brawler_tank", partyMode: "grouper", risk: "normal" };
    case "dps":
      return { ...base, priority: "quester", role: "dps", spec: "brawler_dps", risk: "normal" };
    case "support":
      return { ...base, priority: "quester", role: "support", spec: "utility_support", partyMode: "grouper", risk: "safe" };
    case "grouper":
    case "group":
      return { ...base, priority: "quester", partyMode: "grouper", risk: "normal" };
    case "lone_wolf":
    case "solo":
      return { ...base, priority: "quester", partyMode: "lone_wolf", risk: "safe" };
    case "jump_around":
    case "wanderer":
      return { ...base, priority: "social", social: "chatty", risk: "safe" };
    case "training_dummies":
    case "dummy_dps":
      return { ...base, priority: "farmer", role: "dps", spec: "brawler_dps", risk: "safe" };
    default:
      return base;
  }
}

function normalizeProfileEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return allowed.includes(text as T) ? text as T : fallback;
}

function defaultCommandPriority(kind: AgentCommandKind): AgentCommandPriority {
  if (kind === "finish_next_quest" || kind === "finish_quest") return "quester";
  if (kind === "farm_until") return "farmer";
  return "auto";
}

function normalizeCommandGoals(value: unknown, kind: AgentCommandKind, record: AnyRecord): AgentCommandGoal[] {
  const rawGoals = Array.isArray(value) ? value : [];
  const goals = rawGoals.map(normalizeCommandGoal).filter((goal): goal is AgentCommandGoal => Boolean(goal));
  if (goals.length > 0) return goals.slice(0, 12);
  if (kind === "finish_quest") {
    const questId = cleanText(record.questId, 96);
    return questId ? [emptyGoal("quest_completed", { questId })] : [];
  }
  if (kind === "farm_until") {
    const itemId = cleanText(record.itemId, 96);
    const count = normalizeCommandTargetCount(record.targetCount);
    return itemId && count > 0 ? [emptyGoal("inventory_at_least", { itemId, count })] : [];
  }
  return [];
}

function normalizeCommandGoal(value: unknown): AgentCommandGoal | null {
  const record = asRecord(value);
  const type = normalizeCommandGoalType(record.type);
  if (!type) return null;
  const goal = emptyGoal(type, {
    questId: cleanText(record.questId, 96),
    itemId: cleanText(record.itemId, 96),
    landmarkId: cleanText(record.landmarkId, 80),
    count: nonNegativeInt(record.count),
    level: nonNegativeInt(record.level),
    xp: nonNegativeInt(record.xp ?? record.amount),
    seconds: nonNegativeInt(record.seconds),
    radius: nonNegativeInt(record.radius),
  });
  if (["quest_completed", "quest_ready", "quest_accepted"].includes(goal.type) && !goal.questId) return null;
  if (goal.type === "inventory_at_least" && (!goal.itemId || goal.count <= 0)) return null;
  if (goal.type === "level_at_least" && goal.level <= 0) return null;
  if (goal.type === "xp_gained" && goal.xp <= 0) return null;
  if (goal.type === "survive_seconds" && goal.seconds <= 0) return null;
  if (goal.type === "arrive_at_landmark" && !goal.landmarkId) return null;
  if (goal.type === "near_player_count" && goal.count <= 0) return null;
  return goal;
}

function normalizeCommandGoalType(value: unknown): AgentCommandGoalType | "" {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (text === "quest_completed" || text === "complete_quest") return "quest_completed";
  if (text === "quest_ready" || text === "ready_quest") return "quest_ready";
  if (text === "quest_accepted" || text === "accepted_quest" || text === "accept_quest") return "quest_accepted";
  if (text === "inventory_at_least" || text === "inventory_count" || text === "item_count") return "inventory_at_least";
  if (text === "level_at_least" || text === "level") return "level_at_least";
  if (text === "xp_gained" || text === "gain_xp") return "xp_gained";
  if (text === "survive_seconds" || text === "survive") return "survive_seconds";
  if (text === "arrive_at_landmark" || text === "arrive" || text === "landmark") return "arrive_at_landmark";
  if (text === "near_player_count" || text === "near_players" || text === "group_size") return "near_player_count";
  return "";
}

function emptyGoal(type: AgentCommandGoalType, overrides: Partial<AgentCommandGoal> = {}): AgentCommandGoal {
  return {
    type,
    questId: "",
    itemId: "",
    count: 0,
    level: 0,
    xp: 0,
    seconds: 0,
    landmarkId: "",
    radius: 0,
    ...overrides,
  };
}

function normalizeCommandStopWhen(value: unknown): AgentCommandStopWhen {
  const text = cleanText(value, 20).toLowerCase();
  return text === "all" ? "all" : "any";
}

function normalizeCommandConstraints(value: unknown): AgentCommandConstraints {
  const record = asRecord(value);
  const hasMaxDeaths = Object.prototype.hasOwnProperty.call(record, "maxDeaths");
  const hasMaxSafetyStops = Object.prototype.hasOwnProperty.call(record, "maxSafetyStops");
  return {
    noWalletActions: Boolean(record.noWalletActions),
    noPaidActions: Boolean(record.noPaidActions),
    maxDeaths: hasMaxDeaths ? normalizeCommandFailureCap(record.maxDeaths) : DEFAULT_COMMAND_MAX_DEATHS,
    maxSafetyStops: hasMaxSafetyStops ? normalizeCommandFailureCap(record.maxSafetyStops) : DEFAULT_COMMAND_MAX_SAFETY_STOPS,
    allowedActions: normalizeDecisionActionList(record.allowedActions),
    disallowedActions: normalizeDecisionActionList(record.disallowedActions),
  };
}

export function normalizeCommandFailureCap(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (text === "none" || text === "unlimited" || text === "no_limit" || text === "ignore") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(99, Math.max(0, Math.floor(parsed)));
}

export function isCommandFailureCapReached(cap: number | null, count: number) {
  return cap !== null && count >= cap;
}

function normalizeDecisionActionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry, 40))
    .filter((entry) => DECISION_ACTIONS.includes(entry as typeof DECISION_ACTIONS[number]))
    .slice(0, 32);
}

function normalizeCommandSeconds(value: unknown, kind: AgentCommandKind) {
  const fallback = kind === "finish_next_quest" || kind === "farm_until" ? 15 * 60 : 30 * 60;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(30 * 60, Math.max(15, Math.floor(parsed)));
}

function normalizePolicyHash(value: unknown) {
  const text = cleanText(value, 96).toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(text) || /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function nonNegativeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCommandTargetCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(9999, Math.max(1, Math.floor(parsed)));
}

function potionShopPaymentRequired(itemId: string, quantity: number) {
  if (!isPotionShopItemId(itemId)) throw new Error(`unknown potion shop itemId ${itemId}`);
  const normalizedItemId = itemId;
  const normalizedQuantity = isPotionShopPurchaseQuantity(quantity) ? quantity : 1;
  const price = getPotionShopPrice(normalizedQuantity, normalizedItemId);
  return {
    action: "burn_mfergpt",
    itemId: normalizedItemId,
    quantity: normalizedQuantity,
    chainId: BASE_CHAIN_ID,
    token: "MFERGPT",
    tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
    burnAddress: BASE_BURN_ADDRESS,
    amountWei: price.amountWei,
    amountLabel: price.label,
    proofFields: ["paymentTxHash", "paymentAmountWei", "paymentChainId", "paymentContractAddress"],
  };
}

function fishingSupplyPaymentRequired() {
  const price = getFishingSupplyPrice();
  return {
    action: "burn_mfergpt",
    itemId: FISHING_CHUM_ITEM_ID,
    quantity: 1,
    chainId: BASE_CHAIN_ID,
    token: "MFERGPT",
    tokenAddress: BASE_MFERGPT_TOKEN_ADDRESS,
    burnAddress: BASE_BURN_ADDRESS,
    amountWei: price.amountWei,
    amountLabel: price.label,
    proofFields: ["paymentTxHash", "paymentAmountWei", "paymentChainId", "paymentContractAddress"],
  };
}

function normalizeCombatAction(value: unknown): CombatActionId | null {
  const text = cleanText(value, 40);
  return COMBAT_ACTION_IDS.includes(text as CombatActionId) ? text as CombatActionId : null;
}

function normalizeQuestStatus(value: string): QuestStatus {
  return value === "ready" || value === "completed" ? value : "active";
}

function questProgressLabel(quest: QuestSnapshotSummary) {
  return `${quest.status}:${quest.progress}/${quest.required}`;
}

function describeInventoryCounts(inventory: AnyRecord[]) {
  const inventoryCounts: Record<string, number> = {};
  for (const item of inventory) {
    const itemId = getString(item.id);
    if (!itemId) continue;
    inventoryCounts[itemId] = (inventoryCounts[itemId] ?? 0) + getNumber(item.count);
  }
  return inventoryCounts;
}

function describeInventoryCountChanges(before: Record<string, number>, after: Record<string, number>) {
  const itemIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...itemIds]
    .map((itemId) => ({
      itemId,
      before: before[itemId] ?? 0,
      after: after[itemId] ?? 0,
    }))
    .filter((change) => change.before !== change.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || a.itemId.localeCompare(b.itemId))
    .slice(0, 12);
}

export function describeEquipmentChanges(before: PlayerEquipmentSummary[], after: PlayerEquipmentSummary[]): EquipmentChangeSummary[] {
  const beforeBySlot = equipmentBySlot(before);
  const afterBySlot = equipmentBySlot(after);
  const slots = new Set([...beforeBySlot.keys(), ...afterBySlot.keys()]);
  return [...slots]
    .sort()
    .map((slot) => {
      const beforeEntry = compactEquipmentSummary(beforeBySlot.get(slot));
      const afterEntry = compactEquipmentSummary(afterBySlot.get(slot));
      return { slot, before: beforeEntry, after: afterEntry };
    })
    .filter((change) => !equipmentSummaryEqual(change.before, change.after));
}

function equipmentBySlot(equipment: PlayerEquipmentSummary[]) {
  const bySlot = new Map<string, PlayerEquipmentSummary>();
  for (const entry of equipment) {
    if (!entry.slot) continue;
    bySlot.set(entry.slot, entry);
  }
  return bySlot;
}

function compactEquipmentSummary(entry: PlayerEquipmentSummary | undefined): Omit<PlayerEquipmentSummary, "slot"> | null {
  if (!entry?.itemId) return null;
  return {
    itemId: entry.itemId,
    chainTokenId: entry.chainTokenId,
    chainTier: entry.chainTier,
  };
}

function equipmentSummaryEqual(left: Omit<PlayerEquipmentSummary, "slot"> | null, right: Omit<PlayerEquipmentSummary, "slot"> | null) {
  if (!left || !right) return left === right;
  return left.itemId === right.itemId
    && left.chainTokenId === right.chainTokenId
    && left.chainTier === right.chainTier;
}

function formatEquipmentChanges(changes: EquipmentChangeSummary[]) {
  return changes
    .map((change) => {
      const before = change.before?.itemId || "empty";
      const after = change.after?.itemId || "empty";
      return `${change.slot} ${before}->${after}`;
    })
    .join(", ");
}

function snapshotToFinalState(snapshot: PlayerActionSnapshot): PlayerFinalStateSummary {
  return {
    level: snapshot.level,
    xp: snapshot.xp,
    talentPoints: snapshot.talentPoints,
    health: round(snapshot.health),
    maxHealth: round(snapshot.maxHealth),
    mana: round(snapshot.mana),
    maxMana: round(snapshot.maxMana),
    position: { x: round(snapshot.position.x), z: round(snapshot.position.z) },
    stats: snapshot.stats,
    inventoryCounts: snapshot.inventoryCounts,
    inventory: snapshot.inventory.filter((item) => item.count > 0),
    equipment: snapshot.equipment.filter((slot) => slot.itemId),
    talents: snapshot.talents,
    activeBuffs: snapshot.activeBuffs,
  };
}

function normalizeKnownQuestId(value: string): QuestId | null {
  return (QUEST_IDS as readonly string[]).includes(value) ? value as QuestId : null;
}

export function hasAgentQuestStatus(quests: unknown, questId: string, statuses: readonly string[]) {
  const knownQuestId = normalizeKnownQuestId(questId);
  const entries = Array.isArray(quests) ? quests : [];
  if (!knownQuestId || statuses.length === 0) return false;
  return entries.some((entry) => {
    const quest = asRecord(entry);
    return getString(quest.id) === knownQuestId && statuses.includes(getString(quest.status));
  });
}

export function isGroupGatedEncounterType(value: unknown) {
  const encounterType = cleanText(value, 20);
  return encounterType === "group" || encounterType === "raid" || encounterType === "daily_boss";
}

export function shouldSkipOptionalBossDailyCommand(kind: unknown, priority: unknown) {
  const commandKind = cleanText(kind, 40);
  const commandPriority = cleanText(priority, 40);
  if (commandPriority === "boss_hunter" || commandPriority === "completionist") return false;
  return commandKind === "finish_next_quest" || commandKind === "play_for" || commandKind === "run_goals";
}

export function resolveIncompleteRequiredQuestIdForQuests(
  quests: ReadonlyArray<AgentQuestLike>,
  questId: string,
  seen = new Set<string>(),
): QuestId | "" {
  const knownQuestId = normalizeKnownQuestId(questId);
  if (!knownQuestId || seen.has(knownQuestId)) return "";
  seen.add(knownQuestId);

  const requiredQuestId = normalizeKnownQuestId(getString((QUESTS[knownQuestId] as AnyRecord).requiredQuestId));
  if (!requiredQuestId) return "";

  const earlierRequiredQuestId = resolveIncompleteRequiredQuestIdForQuests(quests, requiredQuestId, seen);
  if (earlierRequiredQuestId) return earlierRequiredQuestId;

  return hasAgentQuestStatus(quests, requiredQuestId, ["completed"]) ? "" : requiredQuestId;
}

export function getQuestAgentHints(questId: string): QuestAgentHints {
  const knownQuestId = normalizeKnownQuestId(questId);
  const hints = knownQuestId ? asRecord((QUESTS[knownQuestId] as AnyRecord).agentHints) : {};
  const targetAreaRecord = asRecord(hints.targetArea);
  const targetAreaPoint = asPoint(targetAreaRecord.point);
  const targetArea = targetAreaPoint
    ? { label: cleanText(targetAreaRecord.label, 80) || `${knownQuestId} target area`, point: targetAreaPoint }
    : undefined;
  const patrolPoints = Array.isArray(hints.patrolPoints)
    ? hints.patrolPoints
      .map((entry): QuestAgentPointHint | null => {
        const record = asRecord(entry);
        const point = asPoint(record.point);
        return point ? { label: cleanText(record.label, 80) || "patrol point", point } : null;
      })
      .filter((entry): entry is QuestAgentPointHint => Boolean(entry))
    : [];
  return {
    targetArea,
    patrolPoints,
    avoidGenericTargetNpcIds: stringList(hints.avoidGenericTargetNpcIds),
  };
}

export function isGenericQuestTargetSuppressed(questId: string, npcId: string) {
  return getQuestAgentHints(questId).avoidGenericTargetNpcIds.includes(npcId);
}

export function isQuestTargetAreaCandidate(
  questId: string,
  pointLike: Point,
  maxDistance = GENERIC_QUEST_TARGET_AREA_RADIUS,
) {
  const targetArea = getQuestAgentHints(questId).targetArea;
  return !targetArea || distance2d(pointLike, targetArea.point) <= maxDistance;
}

export function generatedQuestTargetAreaPatrolPoints(center: Point, label = "target area"): QuestAgentPointHint[] {
  const radius = GENERIC_QUEST_TARGET_AREA_PATROL_RADIUS;
  return [
    { label: `${label} north sweep`, point: { x: center.x, z: center.z - radius } },
    { label: `${label} east sweep`, point: { x: center.x + radius, z: center.z } },
    { label: `${label} south sweep`, point: { x: center.x, z: center.z + radius } },
    { label: `${label} west sweep`, point: { x: center.x - radius, z: center.z } },
    { label: `${label} center sweep`, point: center },
  ].map((entry) => ({ label: entry.label, point: point(entry.point) }));
}

export function countHealthyQuestParticipantsNear(
  participants: ReadonlyArray<AgentParticipantLike>,
  pointLike: Point,
  radius: number,
  questId: string,
  minHealthRatio = GROUP_ENCOUNTER_PRESS_HEALTH_RATIO,
) {
  const knownQuestId = normalizeKnownQuestId(questId);
  if (!knownQuestId) return 0;

  const seen = new Set<string>();
  let count = 0;
  for (const participant of participants) {
    const sessionId = getString(participant.sessionId);
    if (sessionId && seen.has(sessionId)) continue;
    if (sessionId) seen.add(sessionId);
    if (!hasAgentQuestStatus(participant.quests, knownQuestId, ["active"])) continue;

    const health = getNumber(participant.health);
    const maxHealth = getNumber(participant.maxHealth);
    if (health <= 0 || maxHealth <= 0 || health / maxHealth < minHealthRatio) continue;

    const x = readFiniteNumber(participant.x);
    const z = readFiniteNumber(participant.z);
    if (x === undefined || z === undefined) continue;
    if (distance2d({ x, z }, pointLike) > radius) continue;

    count += 1;
  }
  return count;
}

function normalizeKnownItemId(value: string): ItemId | null {
  return Object.prototype.hasOwnProperty.call(ITEMS, value) ? value as ItemId : null;
}

function scoreEquipmentStats(stats: Partial<Record<StatKey, number>>, profile: AgentCommandProfile = DEFAULT_COMMAND_PROFILE) {
  const weights = equipmentStatWeightsForProfile(profile);
  return round((Object.entries(stats) as Array<[StatKey, number | undefined]>)
    .reduce((score, [statKey, value]) => score + (value ?? 0) * weights[statKey], 0));
}

function equipmentStatWeightsForProfile(profile: AgentCommandProfile): Record<StatKey, number> {
  if (profile.role === "tank" || profile.spec === "brawler_tank") {
    return {
      maxHealth: 0.24,
      maxMana: 0.04,
      strength: 1.18,
      dexterity: 0.7,
      magic: 0.55,
    };
  }
  if (profile.role === "dps" || profile.spec === "brawler_dps") {
    return {
      maxHealth: 0.13,
      maxMana: 0.04,
      strength: 1.38,
      dexterity: 0.92,
      magic: 0.7,
    };
  }
  if (profile.role === "healer" || profile.role === "support" || profile.spec === "utility_support") {
    return {
      maxHealth: 0.48,
      maxMana: 0.14,
      strength: 0.5,
      dexterity: 0.65,
      magic: 1.1,
    };
  }
  if (profile.spec === "caster_fire" || profile.spec === "caster_frost") {
    return {
      maxHealth: 0.12,
      maxMana: 0.18,
      strength: 0.5,
      dexterity: 0.7,
      magic: 1.42,
    };
  }
  if (profile.spec === "utility_ranger") {
    return {
      maxHealth: 0.13,
      maxMana: 0.08,
      strength: 0.72,
      dexterity: 1.35,
      magic: 0.82,
    };
  }
  return EQUIPMENT_STAT_WEIGHTS;
}

function getQuestFlagSet(value: string) {
  return new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function inventoryCount(self: RuntimePlayer, itemId: string) {
  return self.inventory.reduce((count, item) => getString(item.id) === itemId ? count + getNumber(item.count) : count, 0);
}

function resolveRoute(value: string) {
  const routeId = normalizeRouteId(value);
  if (PUBLIC_ROUTES[routeId]) return PUBLIC_ROUTES[routeId];
  const routeEntry = Object.entries(PUBLIC_ROUTES).find(([id]) => normalizeRouteId(id) === routeId || routeId.includes(normalizeRouteId(id)));
  if (routeEntry) return routeEntry[1];
  const landmark = PUBLIC_LANDMARKS[routeId];
  if (landmark) return [landmark];
  const landmarkEntry = Object.entries(PUBLIC_LANDMARKS).find(([id]) => routeId.includes(normalizeRouteId(id)));
  return landmarkEntry ? [landmarkEntry[1]] : null;
}

export function routeQueueFromPosition(route: readonly Point[], position: Point) {
  if (route.length <= 1) return [...route];
  const first = route[0] as Point;
  const firstDistance = distance2d(position, first);
  let bestIndex = 0;
  let bestDistance = firstDistance;
  for (let index = 1; index < route.length; index += 1) {
    const candidate = route[index] as Point;
    const candidateDistance = distance2d(position, candidate);
    if (candidateDistance < bestDistance) {
      bestIndex = index;
      bestDistance = candidateDistance;
    }
  }
  return bestIndex > 0 && bestDistance + 8 < firstDistance ? route.slice(bestIndex) : [...route];
}

function routeArrivalDistance(routeId: string) {
  if (routeId === DAILY_BOSS_ROUTE_ID) return 12;
  if (routeId === DAILY_BOSS_RETURN_ROUTE_ID) return 8;
  if (routeId === "route-post-to-signal-ridge"
    || routeId === "route-post-to-signal-post"
    || routeId === "plaza-to-signal-ridge"
    || routeId === "signal-post-to-static-lot"
    || routeId === "signal-ridge-to-static-lot"
    || routeId === "uplink-shack-to-static-lot") return 8;
  if (routeId === "plaza-to-route-post" || routeId === "loop-farm-to-route-post") return 6;
  return 2;
}

export function npcInteractionRouteStopDistance(sendRange: number, arrivalDistance = LOCAL_NAV_ARRIVAL_DISTANCE) {
  const safeSendRange = Number.isFinite(sendRange) && sendRange > 0 ? sendRange : QUEST_SEND_RANGE;
  const safeArrivalDistance = Number.isFinite(arrivalDistance) && arrivalDistance > 0
    ? arrivalDistance
    : LOCAL_NAV_ARRIVAL_DISTANCE;
  return Math.max(1.4, safeSendRange - safeArrivalDistance - 0.5);
}

function normalizeRouteId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function schemaEntries(value: unknown): Array<[string, AnyRecord]> {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()].map(([key, entry]) => [String(key), asRecord(entry)]);
  const maybe = value as { forEach?: unknown };
  if (typeof maybe.forEach === "function") {
    const rows: Array<[string, AnyRecord]> = [];
    maybe.forEach.call(value, (entry: unknown, key: unknown) => rows.push([String(key), asRecord(entry)]));
    return rows;
  }
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), asRecord(entry)]);
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, asRecord(entry)]);
  return [];
}

function normalizePlayer(sessionId: string, value: AnyRecord): RuntimePlayer {
  return {
    ...value,
    sessionId,
    name: getString(value.name) || sessionId,
    identityType: getString(value.identityType),
    isAgent: Boolean(value.isAgent),
    walletAddress: getString(value.walletAddress),
    agentStatusAction: getString(value.agentStatusAction),
    agentStatusThought: getString(value.agentStatusThought),
    agentStatusObjective: getString(value.agentStatusObjective),
    agentStatusQuest: getString(value.agentStatusQuest),
    agentStatusUpdatedAt: getNumber(value.agentStatusUpdatedAt),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    healthRegenPer5: getNumber(value.healthRegenPer5),
    mana: getNumber(value.mana),
    maxMana: getNumber(value.maxMana, 1),
    manaRegenPer5: getNumber(value.manaRegenPer5),
    walkSpeed: getNumber(value.walkSpeed),
    runSpeed: getNumber(value.runSpeed),
    strength: getNumber(value.strength),
    dexterity: getNumber(value.dexterity),
    magic: getNumber(value.magic),
    level: Math.max(1, getNumber(value.level, 1)),
    xp: getNumber(value.xp),
    talentPoints: getNumber(value.talentPoints),
    x: getNumber(value.x),
    z: getNumber(value.z),
    yaw: getNumber(value.yaw),
    animation: getString(value.animation),
    castingAction: getString(value.castingAction),
    quests: schemaEntries(value.quests).map(([, quest]) => quest),
    inventory: schemaEntries(value.inventory).map(([, item]) => item),
    equipment: schemaEntries(value.equipment).map(([, slot]) => slot),
    talents: schemaEntries(value.talents).map(([, talent]) => talent),
    activeBuffs: schemaEntries(value.activeBuffs).map(([, buff]) => buff),
  };
}

function normalizeNpc(id: string, value: AnyRecord): RuntimeNpc {
  return {
    ...value,
    id: getString(value.id) || id,
    name: getString(value.name) || id,
    role: getString(value.role),
    model: getString(value.model),
    combatStyle: getString(value.combatStyle),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    isImmortal: Boolean(value.isImmortal),
    x: getNumber(value.x),
    z: getNumber(value.z),
    defeatedAt: getNumber(value.defeatedAt),
    despawnAt: getNumber(value.despawnAt),
    aggroTargetId: getString(value.aggroTargetId),
    hasLoot: Boolean(value.hasLoot),
    loot: schemaEntries(value.loot).map(([, item]) => item),
    questId: getString(value.questId),
    dialogue: getString(value.dialogue),
  };
}

function getQuestTargetMatchers(questId: QuestId): QuestTargetMatchers {
  const definition = QUESTS[questId] as AnyRecord;
  return {
    models: uniqueStrings([
      ...stringList(definition.defeatNpcModels),
      ...stringList(definition.dropNpcModels),
    ]),
    roles: uniqueStrings([
      ...stringList(definition.defeatNpcRoles),
      ...stringList(definition.dropNpcRoles),
    ]),
    idPrefixes: uniqueStrings([
      ...stringList(definition.defeatNpcIdPrefixes),
      ...stringList(definition.dropNpcIdPrefixes),
    ]),
  };
}

function matchesQuestTarget(npc: RuntimeNpc, matchers: QuestTargetMatchers) {
  if (matchers.models.includes(npc.model)) return true;
  if (matchers.roles.includes(npc.role)) return true;
  return matchers.idPrefixes.some((prefix) => prefix && npc.id.startsWith(prefix));
}

function isMovementLikeAction(action: string) {
  return action === "move_to"
    || action === "move_near_npc"
    || action === "move_near_player"
    || action === "travel_route"
    || action === "accept_quest"
    || action === "complete_quest";
}

export function shouldInterruptMovementForDamage(action: string, beforeHealth: number, currentHealth: number, maxHealth: number) {
  if (!isMovementLikeAction(action)) return false;
  if (maxHealth <= 0 || currentHealth <= 0) return false;
  const healthRatio = currentHealth / maxHealth;
  const damageTaken = beforeHealth - currentHealth;
  const materialDamage = damageTaken >= Math.max(16, maxHealth * 0.08);
  return materialDamage && healthRatio < 0.7;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function isAttackable(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer" || npc.role === "beast" || npc.role === "critter") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function isHostile(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function distance2d(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function pointAlongVector(origin: Point, through: Point, distance: number): Point {
  const dx = through.x - origin.x;
  const dz = through.z - origin.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: round(origin.x + (dx / length) * distance), z: round(origin.z + (dz / length) * distance) };
}

function rotatePointAround(origin: Point, through: Point, radians: number, distance: number): Point {
  const dx = through.x - origin.x;
  const dz = through.z - origin.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: round(origin.x + (ux * cos - uz * sin) * distance),
    z: round(origin.z + (ux * sin + uz * cos) * distance),
  };
}

function findLocalCollisionRoute(start: Point, target: Point, goalRange: number): Point[] {
  if (distance2d(start, target) > LOCAL_NAV_MAX_DISTANCE) return [];

  const minX = snapGrid(Math.min(start.x, target.x) - LOCAL_NAV_MARGIN);
  const maxX = snapGrid(Math.max(start.x, target.x) + LOCAL_NAV_MARGIN);
  const minZ = snapGrid(Math.min(start.z, target.z) - LOCAL_NAV_MARGIN);
  const maxZ = snapGrid(Math.max(start.z, target.z) + LOCAL_NAV_MARGIN);
  const startCell = nearestFreeLocalNavCell(start, minX, maxX, minZ, maxZ);
  if (!startCell) return [];

  const queue: Point[] = [startCell];
  const previous = new Map<string, Point | null>([[localNavKey(startCell), null]]);
  let queueIndex = 0;
  let goal: Point | null = null;

  while (queueIndex < queue.length && previous.size < LOCAL_NAV_MAX_NODES) {
    const current = queue[queueIndex++] as Point;
    if (distance2d(current, target) <= goalRange && isLocalNavFreePoint(current)) {
      goal = current;
      break;
    }

    for (const next of localNavNeighbors(current, target, minX, maxX, minZ, maxZ)) {
      const key = localNavKey(next);
      if (previous.has(key)) continue;
      previous.set(key, current);
      queue.push(next);
    }
  }

  if (!goal) return [];

  const path: Point[] = [];
  for (let current: Point | null = goal; current; current = previous.get(localNavKey(current)) ?? null) {
    path.push(current);
  }
  path.reverse();
  return sampleLocalNavRoute(path);
}

function localNavNeighbors(current: Point, target: Point, minX: number, maxX: number, minZ: number, maxZ: number) {
  const neighbors: Point[] = [];
  for (const dx of [-LOCAL_NAV_GRID_SIZE, 0, LOCAL_NAV_GRID_SIZE]) {
    for (const dz of [-LOCAL_NAV_GRID_SIZE, 0, LOCAL_NAV_GRID_SIZE]) {
      if (dx === 0 && dz === 0) continue;
      const next = { x: snapGrid(current.x + dx), z: snapGrid(current.z + dz) };
      if (next.x < minX || next.x > maxX || next.z < minZ || next.z > maxZ) continue;
      if (!isLocalNavFreePoint(next)) continue;
      neighbors.push(next);
    }
  }
  return neighbors.sort((a, b) => distance2d(a, target) - distance2d(b, target));
}

function sampleLocalNavRoute(path: Point[]) {
  const route: Point[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1] as Point;
    const current = path[index] as Point;
    const next = path[index + 1];
    const previousDx = roundGrid(current.x - previous.x);
    const previousDz = roundGrid(current.z - previous.z);
    const nextDx = next ? roundGrid(next.x - current.x) : Number.NaN;
    const nextDz = next ? roundGrid(next.z - current.z) : Number.NaN;
    if (!next || previousDx !== nextDx || previousDz !== nextDz || index % 4 === 0) {
      route.push(point(current));
    }
  }
  return route;
}

function nearestFreeLocalNavCell(start: Point, minX: number, maxX: number, minZ: number, maxZ: number) {
  const resolved = resolveWorldCollision(start.x, start.z, PLAYER.radius);
  const snapped = { x: snapGrid(resolved.x), z: snapGrid(resolved.z) };
  if (snapped.x >= minX && snapped.x <= maxX && snapped.z >= minZ && snapped.z <= maxZ && isLocalNavFreePoint(snapped)) {
    return snapped;
  }

  for (let radius = LOCAL_NAV_GRID_SIZE; radius <= 2.5; radius += LOCAL_NAV_GRID_SIZE) {
    for (let dx = -radius; dx <= radius; dx += LOCAL_NAV_GRID_SIZE) {
      for (let dz = -radius; dz <= radius; dz += LOCAL_NAV_GRID_SIZE) {
        const candidate = { x: snapGrid(resolved.x + dx), z: snapGrid(resolved.z + dz) };
        if (candidate.x < minX || candidate.x > maxX || candidate.z < minZ || candidate.z > maxZ) continue;
        if (isLocalNavFreePoint(candidate)) return candidate;
      }
    }
  }

  return null;
}

function isLocalNavFreePoint(pointLike: Point) {
  const resolved = resolveWorldCollision(pointLike.x, pointLike.z, PLAYER.radius);
  return distance2d(resolved, pointLike) <= LOCAL_NAV_FREE_TOLERANCE;
}

function localNavKey(pointLike: Point) {
  return `${pointLike.x.toFixed(1)},${pointLike.z.toFixed(1)}`;
}

function snapGrid(value: number) {
  return Math.round(value / LOCAL_NAV_GRID_SIZE) * LOCAL_NAV_GRID_SIZE;
}

function roundGrid(value: number) {
  return Math.round(value * 10) / 10;
}

function asPoint(value: unknown): Point | null {
  const record = asRecord(value);
  const x = readFiniteNumber(record.x);
  const z = readFiniteNumber(record.z);
  return x === undefined || z === undefined ? null : { x, z };
}

function distanceToSegment(pointLike: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return distance2d(pointLike, start);
  const t = Math.max(0, Math.min(1, ((pointLike.x - start.x) * dx + (pointLike.z - start.z) * dz) / lengthSq));
  return distance2d(pointLike, { x: start.x + dx * t, z: start.z + dz * t });
}

function point(value: Point): Point {
  return { x: round(value.x), z: round(value.z) };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? value as AnyRecord : {};
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown) {
  const text = cleanText(value, 160);
  return text || null;
}

function readFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOpenLootWindow(value: unknown): OpenLootWindow | null {
  const record = asRecord(value);
  const npcId = cleanText(record.npcId, 128);
  if (!npcId) return null;
  return {
    npcId,
    source: cleanText(record.source, 40) || "corpse",
    observedAt: Date.now(),
  };
}

function readInteger(value: unknown) {
  const parsed = readFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function normalizePurchaseQuantity(value: unknown) {
  return value === 5 ? 5 : 1;
}

function normalizeTrashSellQuantity(value: unknown, defaultQuantity = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(999, Math.max(1, Math.floor(defaultQuantity)));
  return Math.min(999, Math.max(1, Math.floor(parsed)));
}

function normalizeFishingSellQuantity(value: unknown, defaultQuantity = 999) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(999, Math.max(1, Math.floor(defaultQuantity)));
  return Math.min(999, Math.max(1, Math.floor(parsed)));
}

function normalizePositiveIntegerString(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return /^[1-9]\d*$/.test(text) ? text : "";
}

function normalizeTxHash(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(text) ? text : "";
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(text) ? text : "";
}

function makeChatLine(value: unknown) {
  return cleanText(value, 180).replace(/\s+/g, " ");
}

function formatEstimateSeconds(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) return "safe";
  return `${round(milliseconds / 1000)}s`;
}

function describeCommandPlaytime(command: AgentCommandState, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.min(command.maxSeconds, Math.ceil(((command.finishedAt || now) - command.startedAt) / 1000)));
  const previousUsedSeconds = Math.max(
    0,
    command.budget.rollingDailySeconds - command.usage.remainingSeconds - command.maxSeconds,
  );
  const dailyUsedSeconds = Math.min(command.budget.rollingDailySeconds, previousUsedSeconds + elapsedSeconds);
  return {
    requestedSeconds: command.requestedMaxSeconds,
    sessionCapReached: command.requestedMaxSeconds > command.maxSeconds,
    session: {
      status: command.status,
      startedAt: new Date(command.startedAt).toISOString(),
      finishedAt: command.finishedAt ? new Date(command.finishedAt).toISOString() : "",
      requestedSeconds: command.requestedMaxSeconds,
      maxSeconds: command.maxSeconds,
      usedSeconds: elapsedSeconds,
      remainingSeconds: Math.max(0, command.maxSeconds - elapsedSeconds),
    },
    daily: {
      tier: command.budget.tier,
      totalSeconds: command.budget.rollingDailySeconds,
      usedSeconds: dailyUsedSeconds,
      remainingSeconds: Math.max(0, command.budget.rollingDailySeconds - dailyUsedSeconds),
      windowStartedAt: command.usage.windowStartedAt,
    },
  };
}

function buildAgentCommandRecap(
  command: AgentCommandState,
  questChanges: Array<{ id: string; before: string; after: string }>,
  inventoryChanges: Array<{ itemId: string; before: number; after: number }>,
  equipmentChanges: EquipmentChangeSummary[],
  finalState: PlayerFinalStateSummary | null,
  playtime: ReturnType<typeof describeCommandPlaytime>,
  budgetAdvice: string,
) {
  const social = buildAgentCommandSocialRecap(command);
  const combat = buildAgentCommandCombatRecap(command.combat, Date.now());
  const defeatedCounts = countReportTargets(command.reports, (report) => {
    if (report.action !== "fight_npc") return false;
    return report.stoppedBecause === "target_defeated" || /\btarget defeated\b/i.test(report.summary);
  }, "enemy");
  const lootCounts = countReportTargets(command.reports, (report) => report.action === "loot", "corpse");
  const completedQuests = uniqueRecapStrings(questChanges
    .filter((change) => change.after === "completed" || change.after.startsWith("completed"))
    .map((change) => change.id));
  const inventoryDeltas = inventoryChanges.map((change) => ({
    itemId: change.itemId,
    before: change.before,
    after: change.after,
    delta: change.after - change.before,
  }));
  const parts = [
    defeatedCounts.length ? `defeated ${formatCountedTargets(defeatedCounts)}` : "",
    lootCounts.length ? `looted ${formatCountedTargets(lootCounts)}` : "",
    completedQuests.length ? `finished ${formatHumanList(completedQuests)}` : "",
    inventoryDeltas.length ? `inventory ${inventoryDeltas.map((change) => `${change.delta > 0 ? "+" : ""}${change.delta} ${change.itemId}`).join(", ")}` : "",
    equipmentChanges.length ? `equipment ${formatEquipmentChanges(equipmentChanges)}` : "",
    combat.damageDone > 0 ? `dealt ${combat.damageDone} damage (${combat.dps} DPS${combat.trainingDummyDps > 0 ? `, ${combat.trainingDummyDps} dummy DPS` : ""})` : "",
  ].filter(Boolean);
  const actionSentence = parts.length
    ? `I ${formatHumanList(parts)}.`
    : `I ran ${command.kind.replace(/_/g, " ")} with no major quest, loot, or combat changes recorded.`;
  const stoppedText = command.stoppedBecause
    ? `${command.status} (${command.stoppedBecause.replace(/_/g, " ")})`
    : command.status;
  const sessionText = `Stopped after ${formatRecapDuration(playtime.session.usedSeconds)} as ${stoppedText}.`;
  const socialText = social.summary ? ` ${social.summary}` : "";
  const adviceText = budgetAdvice ? ` ${budgetAdvice}` : "";
  return {
    summary: `${actionSentence} ${sessionText}${socialText}${adviceText}`,
    defeated: defeatedCounts,
    looted: lootCounts,
    completedQuests,
    inventoryChanges: inventoryDeltas,
    equipmentChanges,
    finalState,
    social,
    combat,
    playtime: {
      sessionUsedSeconds: playtime.session.usedSeconds,
      sessionMaxSeconds: playtime.session.maxSeconds,
      sessionRemainingSeconds: playtime.session.remainingSeconds,
      dailyUsedSeconds: playtime.daily.usedSeconds,
      dailyRemainingSeconds: playtime.daily.remainingSeconds,
      dailySeconds: playtime.daily.totalSeconds,
      tier: playtime.daily.tier,
      sessionCapReached: playtime.sessionCapReached,
    },
    budgetAdvice,
  };
}

function createCommandCombatStats(): AgentCommandCombatStats {
  return {
    damageDone: 0,
    healingDone: 0,
    hitCount: 0,
    firstAt: 0,
    lastAt: 0,
    targets: new Map(),
  };
}

function buildAgentCommandCombatRecap(stats: AgentCommandCombatStats, now = Date.now()) {
  const durationSeconds = stats.firstAt > 0
    ? Math.max(1, ((stats.lastAt || now) - stats.firstAt) / 1000)
    : 0;
  const targets = [...stats.targets.values()]
    .sort((left, right) => right.damageDone - left.damageDone || left.targetName.localeCompare(right.targetName))
    .map((target) => {
      const targetDurationSeconds = target.firstAt > 0
        ? Math.max(1, ((target.lastAt || now) - target.firstAt) / 1000)
        : 0;
      return {
        targetId: target.targetId,
        targetName: target.targetName,
        targetModel: target.targetModel,
        damageDone: round(target.damageDone),
        hitCount: target.hitCount,
        dps: targetDurationSeconds > 0 ? round(target.damageDone / targetDurationSeconds) : 0,
        durationSeconds: round(targetDurationSeconds),
        defeated: target.defeated,
      };
    });
  const trainingDummyDamage = targets
    .filter((target) => target.targetModel === "training-dummy" || /dummy/i.test(target.targetName) || /dummy/i.test(target.targetId))
    .reduce((sum, target) => sum + target.damageDone, 0);
  const trainingDummyWindow = stats.firstAt > 0
    ? Math.max(1, ((stats.lastAt || now) - stats.firstAt) / 1000)
    : 0;
  return {
    damageDone: round(stats.damageDone),
    healingDone: round(stats.healingDone),
    hitCount: stats.hitCount,
    durationSeconds: round(durationSeconds),
    dps: durationSeconds > 0 ? round(stats.damageDone / durationSeconds) : 0,
    trainingDummyDamage: round(trainingDummyDamage),
    trainingDummyDps: trainingDummyWindow > 0 ? round(trainingDummyDamage / trainingDummyWindow) : 0,
    targets,
  };
}

export function buildAgentCommandSocialRecap(command: { social?: AgentCommandSocialMemory }, now = Date.now()) {
  const players = [...(command.social?.players.values() ?? [])]
    .sort((left, right) => left.closestDistance - right.closestDistance || right.lastSeenAt - left.lastSeenAt || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map((player) => ({
      sessionId: player.sessionId,
      name: player.name,
      identityType: player.identityType,
      isAgent: player.isAgent,
      closestDistance: Number.isFinite(player.closestDistance) ? round(player.closestDistance) : null,
      lastSeenAgoMs: Math.max(0, now - player.lastSeenAt),
    }));
  const chat = (command.social?.chat ?? [])
    .slice(-6)
    .map((entry) => ({
      sessionId: entry.sessionId,
      name: entry.name,
      identityType: entry.identityType,
      isAgent: entry.isAgent,
      kind: entry.kind,
      text: entry.text,
      observedAgoMs: Math.max(0, now - entry.observedAt),
    }));
  const nearbyAgentCount = players.filter((player) => player.isAgent).length;
  const nearbyHumanCount = players.length - nearbyAgentCount;
  const playerSummary = players.length
    ? `I saw ${formatHumanList(players.slice(0, 4).map((player) => `${player.name}${player.isAgent ? " (agent)" : ""}`))} nearby.`
    : "";
  const chatSummary = chat.length
    ? `Chat included ${formatHumanList(chat.slice(-3).map((entry) => `${entry.name}: "${entry.text}"`))}.`
    : "";
  return {
    nearbyPlayers: players,
    nearbyPlayerCount: players.length,
    nearbyAgentCount,
    nearbyHumanCount,
    recentChat: chat,
    summary: [playerSummary, chatSummary].filter(Boolean).join(" "),
  };
}

function countReportTargets(reports: ActionReport[], predicate: (report: ActionReport) => boolean, fallback: string) {
  const counts = new Map<string, number>();
  for (const report of reports) {
    if (!predicate(report)) continue;
    const target = cleanText(report.target, 64) || fallback;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((left, right) => right.count - left.count || left.target.localeCompare(right.target))
    .slice(0, 8);
}

function formatCountedTargets(values: Array<{ target: string; count: number }>) {
  return values.map((entry) => entry.count > 1 ? `${entry.count} ${pluralizeLabel(entry.target)}` : `1 ${entry.target}`).join(", ");
}

function pluralizeLabel(value: string) {
  if (/\d/.test(value) || value.endsWith("s")) return value;
  return `${value}s`;
}

function formatHumanList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function uniqueRecapStrings(values: string[]) {
  return [...new Set(values.map((value) => cleanText(value, 96)).filter(Boolean))];
}

function formatRecapDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function getAgentCommandBudgetAdvice(budget: AgentCommandBudget, requestedSeconds: number) {
  const sessionCapReached = requestedSeconds > budget.maxCommandSeconds;
  if (!sessionCapReached && budget.tier !== "base") return "";
  const commandMinutes = Math.ceil(budget.maxCommandSeconds / 60);
  const dailyMinutes = Math.ceil(budget.rollingDailySeconds / 60);
  return `This wallet is on the ${budget.tier} autoplay tier (${commandMinutes} minute commands, ${dailyMinutes} rolling daily minutes). Add 25M MFERGPT on Base to unlock longer sessions and Season 0 agent points; progress still saves below the gate.`;
}

function messageSummary(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

function isImportantChat(value: unknown) {
  const text = getString(asRecord(value).text).toLowerCase();
  return text.includes("agent rewards") || text.includes("season 0") || text.includes("quest") || text.includes("reward");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

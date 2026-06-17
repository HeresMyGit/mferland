import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Client, type Room } from "colyseus.js";
import {
  AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
  COMBAT,
  clamp,
  getCombatActionUnlockLevel,
  getLevelProgress,
  getNpcQuestIds,
  getQuestObjectives,
  getPotionShopPrice,
  getQuestRequirement,
  getQuestTurnInNpcId,
  getTalentRankStatus,
  isPotionShopItemId,
  isPotionShopPurchaseQuantity,
  isQuestAvailableForSnapshots,
  normalizeWalletAddress,
  resolveAgentMferAppearanceTraitsForUpdate,
  QUESTS,
  QUEST_IDS,
  ROOM_NAME,
  TALENTS,
  TALENT_IDS,
  type CombatActionId,
  type QuestId,
  type QuestSnapshot,
  type QuestStatus,
  type TalentId,
  type TalentRankLike,
} from "@mferland/shared";
import {
  finalizeAgentCommandSeconds,
  getAgentCommandBudget,
  getAgentCommandUsage,
  reserveAgentCommandSeconds,
  type AgentCommandBudget,
  type AgentCommandUsage,
} from "./agentCommandBudget.js";
import { buildAgentCatalog } from "./agentCatalog.js";
import { getAgentSeason0MferGptGateStatus } from "./agentMferGptGate.js";
import {
  parseToolPaymentHeader,
  reportAgentToolUsage,
  verifyZeroPriceToolPayment,
} from "./agentToolRegistry.js";
import { verifyAgentSessionToken } from "./walletAuth.js";

type AnyRecord = Record<string, unknown>;
type Point = { x: number; z: number };
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

type PlayerActionSnapshot = {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  position: Point;
  quests: QuestSnapshotSummary[];
  inventoryCounts: Record<string, number>;
  attackerIds: string[];
};

type DurableOutcome = {
  status: string;
  stoppedBecause: string;
  durationMs: number;
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

type ActionReport = {
  status: string;
  stoppedBecause: string;
  summary: string;
  durationMs: number;
  action: string;
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
  maxDeaths: number;
  maxSafetyStops: number;
  allowedActions: string[];
  disallowedActions: string[];
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
  controller: AgentCommandController;
  profile: AgentCommandProfile;
  goals: AgentCommandGoal[];
  stopWhen: AgentCommandStopWhen;
  constraints: AgentCommandConstraints;
  status: AgentCommandStatus;
  stoppedBecause: string;
  startedAt: number;
  finishedAt: number;
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

const BRIDGE_BODY_LIMIT_BYTES = 64 * 1024;
const INPUT_INTERVAL_MS = 150;
const INTERACT_SEND_RANGE = 12.5;
const QUEST_SEND_RANGE = 3.2;
const INTERACT_APPROACH_DISTANCE = 1.6;
const LOOT_SEND_RANGE = 3.2;
const RECOVER_HEALTH_RATIO = 0.72;
const CRITICAL_HEALTH_RATIO = 0.35;
const DANGEROUS_NEIGHBOR_RADIUS = 11;
const CROWDED_PULL_RADIUS = 12;
const HOSTILE_PATH_CORRIDOR_RADIUS = 9;
const SAFE_APPROACH_TRIGGER_RISK = 0.42;
const SAFE_APPROACH_ARRIVAL_DISTANCE = 4.2;
const SOCIAL_MESSAGE_TTL_MS = 2 * 60_000;
const DEFAULT_CHAT_COOLDOWN_MS = 30_000;
const DEFAULT_EMOTE_COOLDOWN_MS = 45_000;
const PRESS_SINGLE_ATTACKER_HEALTH_RATIO = 0.46;
const PRESS_MULTI_ATTACKER_HEALTH_RATIO = 0.68;
const PRESS_LOW_HEALTH_FINISH_RATIO = 0.38;
const FAVORABLE_FIGHT_SURVIVAL_MARGIN = 1.25;
const MOVEMENT_STUCK_RETHINK_ATTEMPTS = 3;
const MOVEMENT_TROUBLE_TTL_MS = 2 * 60_000;
const COMBAT_MEMORY_TTL_MS = 10 * 60_000;
const COMBAT_AVOID_BASE_MS = 90_000;
const COMBAT_AVOID_MAX_MS = 5 * 60_000;
const DURABLE_ACTION_POLL_MS = 300;
const DURABLE_CONTINUATION_MS = 900;
const SHORT_ACTION_SETTLE_MS = 700;
const BASE_CHAIN_ID = 8453;
const BASE_MFERGPT_TOKEN_ADDRESS = "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07";
const BASE_BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS = "0x6fF5693b99212Da76ad316178A184AB56D299b43";
const DEFAULT_SWAP_ETH_AMOUNT = "0.01";

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

const PUBLIC_ROUTES: Record<string, Point[]> = {
  "plaza-to-loop-farm": [{ x: 0, z: 29 }, { x: -31, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-claim-pile": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -99, z: 75 }, { x: -89, z: 92 }],
  "claim-pile-to-loop-farm": [{ x: -89, z: 92 }, { x: -99, z: 75 }, { x: -82, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-route-post": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "claim-pile-to-route-post": [{ x: -89, z: 92 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "route-post-to-claim-booth": [{ x: -119.2, z: 132.4 }, { x: -111.2, z: 136.7 }],
  "route-post-to-signal-post": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "route-post-to-signal-ridge": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "plaza-to-signal-ridge": [{ x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "signal-post-to-uplink-shack": [{ x: 108.8, z: -92.8 }, { x: 117.6, z: -91.2 }],
  "signal-post-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "signal-ridge-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "uplink-shack-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
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
  "sell_trash_items",
  "update_traits",
  "emote",
  "chat",
  "share_quest_link",
] as const;

const WALLET_DECISION_ACTIONS = new Set<string>([
  "swap_eth_for_mfergpt",
  "register_chain_gear",
  "purchase_potion_shop_item",
  "update_traits",
]);
const PAID_DECISION_ACTIONS = new Set<string>([
  "swap_eth_for_mfergpt",
  "purchase_potion_shop_item",
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
  private lastDeathRecordedAt = 0;
  private routeQueue: Point[] = [];
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
    });
    room.onMessage("chat", (message: unknown) => this.handleChatMessage(message));
    room.onMessage("combatEvent", (message: unknown) => this.remember(`combat:${messageSummary(message)}`));
    room.onMessage("experienceEvent", (message: unknown) => this.remember(`xp:${messageSummary(message)}`, true));
    room.onMessage("lootWindow", (message: unknown) => this.remember(`lootWindow:${messageSummary(message)}`, true));
    room.onMessage("lootResult", (message: unknown) => this.remember(`lootResult:${messageSummary(message)}`, true));
    room.onMessage("closeLootWindow", (message: unknown) => this.remember(`closeLoot:${messageSummary(message)}`));
    room.onMessage("potionShopPurchaseResult", (message: unknown) => this.remember(`potionShop:${messageSummary(message)}`, true));
    room.onMessage("trashVendorSellResult", (message: unknown) => this.remember(`trashVendor:${messageSummary(message)}`, true));
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
    const hints = this.buildDecisionHints(self, availableQuestHints, lootableCorpses);

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
      suggestedNextAction: this.buildSuggestedNextAction(self),
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
    if (!reservation.ok) throw new BridgeHttpError(429, "agent command daily budget exhausted");
    const focusedGoalQuestId = payload.questId || payload.goals.find((goal) => goal.questId)?.questId || "";
    if (focusedGoalQuestId) this.focusedQuestId = focusedGoalQuestId;
    const command: AgentCommandState = {
      commandId: randomUUID(),
      kind: payload.kind,
      controller: payload.controller,
      profile: payload.profile,
      goals: payload.goals,
      stopWhen: payload.stopWhen,
      constraints: payload.constraints,
      status: "running",
      stoppedBecause: "",
      startedAt: Date.now(),
      finishedAt: 0,
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
    };
    this.commands.set(command.commandId, command);
    this.activeCommandId = command.commandId;
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
      command.lastSnapshot = this.snapshotPlayer(self);
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
          if (command.constraints.maxSafetyStops <= 0 || command.safetyStopCount > command.constraints.maxSafetyStops) {
            await this.finishCommand(command, "safety_stop", "constraint_max_safety_stops");
            break;
          }
          await delay(1200);
          continue;
        }
        if (result.stoppedBecause === "dead") {
          command.deathCount += 1;
          if (command.deathCount > command.constraints.maxDeaths) {
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

    const suggested = this.buildSuggestedNextAction(self);
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

    if (command.profile.role === "healer" && healthRatio < 0.82 && this.canUse(self, "heal")) {
      return normalizeDecision({
        action: "use_ability",
        actionId: "heal",
        reason: `${command.kind}/healer: healing self before continuing`,
      });
    }

    if (command.profile.risk === "safe" && healthRatio < 0.9) {
      const attackers = this.getAttackers(self);
      if (attackers.length > 0) {
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

  private chooseGoalDecision(command: AgentCommandState, self: RuntimePlayer): AgentBridgeDecision | null {
    if (command.kind === "finish_quest" && command.questId) {
      return this.chooseQuestGoalDecision(self, command.questId, "quest_completed");
    }
    if (command.kind !== "run_goals") return null;

    const progress = this.describeCommandGoalProgress(command, self);
    const pending = progress.find((goal) => !goal.satisfied);
    if (!pending) return null;

    switch (pending.type) {
      case "quest_completed":
      case "quest_ready":
      case "quest_accepted":
        return this.chooseQuestGoalDecision(self, pending.questId, pending.type);
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

  private chooseQuestGoalDecision(self: RuntimePlayer, questId: string, goalType: AgentCommandGoalType): AgentBridgeDecision | null {
    const quest = self.quests.find((entry) => getString(entry.id) === questId);
    const status = getString(quest?.status);
    const turnInNpc = this.resolveQuestTurnInNpc(questId);
    if ((status === "ready" || status === "completed") && goalType === "quest_completed" && turnInNpc) {
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
    if (status === "active") {
      const utilityDecision = this.chooseActiveUtilityQuestDecision(self, questId);
      if (utilityDecision) return utilityDecision;
    }
    if (!status) {
      const offer = this.describeAvailableQuestHints(self).find((hint) => getString(hint.questId) === questId);
      if (offer) {
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
        return normalizeDecision({
          action: "fight_npc",
          reason: `${namedTarget.npc.name} is an unfinished named objective for ${questId}`,
          questId,
          npcRef: namedTarget.npc.id,
        });
      }
      const questTarget = this.findGenericQuestTarget(self, questId);
      if (questTarget) {
        return normalizeDecision({
          action: "fight_npc",
          reason: `${questTarget.npc.name} matches structured quest goal ${questId}`,
          questId,
          npcRef: questTarget.npc.id,
        });
      }
    }
    return null;
  }

  private chooseActiveUtilityQuestDecision(self: RuntimePlayer, preferredQuestId = ""): AgentBridgeDecision | null {
    const activeQuestIds = self.quests
      .filter((quest) => getString(quest.status) === "active")
      .map((quest) => getString(quest.id))
      .filter((questId): questId is QuestId => (QUEST_IDS as readonly string[]).includes(questId));
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

  private decisionHasRequiredTarget(decision: AgentBridgeDecision) {
    if (decision.action === "complete_quest" || decision.action === "accept_quest") return Boolean(decision.questId && decision.npcRef);
    if (decision.action === "fight_npc" || decision.action === "loot" || decision.action === "move_near_npc" || decision.action === "interact_npc") return Boolean(decision.npcRef);
    if (decision.action === "move_near_player") return Boolean(decision.playerRef);
    if (decision.action === "select_talent") return Boolean(decision.talentId);
    return true;
  }

  private checkCommandCompletion(command: AgentCommandState, self: RuntimePlayer) {
    if (command.constraints.maxDeaths === 0 && self.health <= 0) return "constraint_max_deaths";
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

  private async finishCommand(command: AgentCommandState, status: AgentCommandStatus, stoppedBecause: string) {
    if (command.status !== "running" && command.finishedAt) return;
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
      const self = this.self();
      const goalProgress = self ? this.describeCommandGoalProgress(command, self) : [];
      const summary = [
        `${command.kind} ${command.status}`,
        command.stoppedBecause ? `stopped ${command.stoppedBecause}` : "",
        goalProgress.length ? `goals ${goalProgress.filter((goal) => goal.satisfied).length}/${goalProgress.length}` : "",
        questChanges.length ? `quests ${questChanges.map((change) => `${change.id} ${change.before}->${change.after}`).join(", ")}` : "",
        inventoryChanges.length ? `inventory ${inventoryChanges.map((change) => `${change.itemId} ${change.before}->${change.after}`).join(", ")}` : "",
      ].filter(Boolean).join("; ");
    return {
      ok: command.status !== "failed",
        bridgeSessionId: this.id,
        commandId: command.commandId,
        command: command.kind,
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
        },
      durationMs,
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
        traits: "For update_traits, only choose specific traits when they strongly fit the agent identity. If not, send traits as null or {} and the server will use deterministic wallet/name-seeded variety. Do not fill categories with blue, defaults, or first-listed options just to choose something. Declared agents keep the robot face, force regular eyes and flat mouth, and cannot use caps, long hair, shades, or glasses because those clip into the model.",
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
    const inventoryCounts: Record<string, number> = {};
    for (const item of self.inventory) {
      const itemId = getString(item.id);
      if (!itemId) continue;
      inventoryCounts[itemId] = (inventoryCounts[itemId] ?? 0) + getNumber(item.count);
    }
    return {
      health: self.health,
      maxHealth: self.maxHealth,
      mana: self.mana,
      maxMana: self.maxMana,
      level: self.level,
      xp: self.xp,
      position: point(self),
      quests: this.questSummaries(self),
      inventoryCounts,
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
      if (this.shouldInterruptForTravelDamage(decision.action, before, self)) {
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
      case "respawn":
      case "use_ability":
      case "equip_item":
      case "unequip_item":
      case "use_item":
      case "select_talent":
      case "register_chain_gear":
      case "purchase_potion_shop_item":
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

  private shouldInterruptForTravelDamage(action: string, before: PlayerActionSnapshot, self: RuntimePlayer) {
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
      || action === "sell_trash_items";
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
        if (npc.health <= 0 || npc.defeatedAt > 0) {
          if (npc.hasLoot) return null;
          return { status: "completed", stoppedBecause: "target_defeated", durationMs };
        }
        if (this.lastAction.startsWith("retreat_") || this.lastAction.startsWith("auto_control_frostNova")) {
          return { status: "safety_stop", stoppedBecause: this.lastAction, durationMs };
        }
        const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
        const attackers = this.getAttackers(self);
        if (healthRatio < CRITICAL_HEALTH_RATIO && attackers.length > 0) {
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
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_accept ${questId}`;
        } else {
          this.targetPoint = null;
          this.send("acceptQuest", { questId, npcId: npc.id });
          this.lastAction = `accept_quest ${questId}`;
        }
        return;
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveQuestTurnInNpc(questId);
        if (!questId || !npc) return;
        this.focusedQuestId = questId;
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_complete ${questId}`;
        } else {
          this.targetPoint = null;
          this.send("completeQuest", { questId, npcId: npc.id });
          this.lastAction = `complete_quest ${questId}`;
        }
        return;
      }
      case "loot": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc || !npc.hasLoot) return;
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
      default:
        return;
    }
  }

  private buildActionReport(decision: AgentBridgeDecision, before: PlayerActionSnapshot, outcome: DurableOutcome): ActionReport {
    const self = this.self();
    const after = self ? this.snapshotPlayer(self) : null;
    const questProgress = after?.quests ?? before.quests;
    const questChanges = after ? this.describeQuestChanges(before, after) : [];
    const suggestedNextAction = self ? this.buildSuggestedNextAction(self) : null;
    const continuePrompt = suggestedNextAction
      ? `Suggested next: ${suggestedNextAction.action} because ${suggestedNextAction.reason}`
      : "Observe again, then choose the next action from current state.";
    const summary = this.summarizeAction(decision, before, after, outcome, questChanges, suggestedNextAction);
    return {
      status: outcome.status,
      stoppedBecause: outcome.stoppedBecause,
      summary,
      durationMs: outcome.durationMs,
      action: decision.action,
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

  private buildSuggestedNextAction(self: RuntimePlayer): SuggestedDecision | null {
    if (self.health <= 0) return { action: "respawn", reason: "self health is 0" };
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const attackers = this.getAttackers(self).sort((a, b) => distance2d(self, a) - distance2d(self, b));
    if (attackers.length > 0 && (healthRatio < CRITICAL_HEALTH_RATIO || attackers.length >= 2)) {
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
    const readyQuest = self.quests.find((quest) => getString(quest.status) === "ready");
    if (readyQuest) {
      const questId = getString(readyQuest.id);
      const npc = this.resolveQuestTurnInNpc(questId);
      return {
        action: "complete_quest",
        reason: `${questId} is ready to turn in`,
        questId,
        npcRef: npc?.id,
      };
    }
    const talentSpend = this.describeRecommendedTalentSpends(self)[0];
    if (talentSpend) {
      return {
        action: "select_talent",
        reason: `unspent skill point available; ${talentSpend.reason}`,
        talentId: talentSpend.talentId,
      };
    }
    if (attackers[0] && healthRatio >= CRITICAL_HEALTH_RATIO) {
      return {
        action: "fight_npc",
        reason: `${attackers[0].name} is currently attacking`,
        npcRef: attackers[0].id,
      };
    }
    const utilityQuestDecision = this.chooseActiveUtilityQuestDecision(self);
    if (utilityQuestDecision) return this.toSuggestedDecision(utilityQuestDecision);
    const availableQuest = this.describeAvailableQuestHints(self)[0];
    if (availableQuest) {
      return {
        action: "accept_quest",
        reason: `${getString(availableQuest.title) || getString(availableQuest.questId)} is available`,
        questId: getString(availableQuest.questId),
        npcRef: getString(availableQuest.npcId),
      };
    }
    const namedTarget = this.findNamedObjectiveTarget(self);
    if (namedTarget) {
      return {
        action: "fight_npc",
        reason: `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`,
        questId: namedTarget.questId,
        npcRef: namedTarget.npc.id,
      };
    }
    const questTarget = this.findGenericQuestTarget(self);
    if (questTarget) {
      return {
        action: "fight_npc",
        reason: `${questTarget.npc.name} matches active quest ${questTarget.questId}`,
        questId: questTarget.questId,
        npcRef: questTarget.npc.id,
      };
    }
    if (healthRatio < RECOVER_HEALTH_RATIO) {
      return { action: "wait", reason: "recover health before pulling another target" };
    }
    return { action: "wait", reason: "no urgent quest, loot, or combat action is visible" };
  }

  private async executeDecision(self: RuntimePlayer, decision: AgentBridgeDecision): Promise<BridgeActionResult | null> {
    switch (decision.action) {
      case "wait":
        this.targetPoint = null;
        this.clearEngagement();
        this.lastAction = "wait";
        return null;
      case "respawn":
        this.clearEngagement();
        this.routeQueue = [];
        this.send("respawn", {});
        this.lastAction = "respawn";
        return null;
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        if (x === undefined || z === undefined) throw new Error("move_to requires x and z");
        this.clearEngagement();
        this.routeQueue = [];
        this.moveTo({ x, z });
        this.lastAction = `move_to ${round(x)},${round(z)}`;
        return null;
      }
      case "travel_route": {
        const routeText = cleanText(decision.text, 80);
        const route = resolveRoute(routeText);
        if (!route) throw new Error(`unknown route ${routeText}`);
        this.clearEngagement();
        this.routeQueue = [...route];
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
          this.routeQueue = [];
          this.fight(self, npc);
          return null;
        }
        this.clearEngagement();
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
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_accept ${questId}`;
          return { ok: true, status: "moving_to_quest_giver", bridgeSessionId: this.id, lastAction: this.lastAction };
        }
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
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_complete ${questId}`;
          return null;
        }
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
        this.routeQueue = [];
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
          this.routeQueue = [];
          this.cast(actionId, { kind: "player", id: player.sessionId });
        } else {
          if (actionId === "frostNova" || actionId === "whirlwind") {
            this.clearEngagement();
            this.routeQueue = [];
            this.cast(actionId, { kind: "npc", id: "" });
            this.lastAction = `use_ability ${actionId}`;
            return null;
          }
          const npc = this.resolveNpc(decision.npcRef);
          if (!npc && actionId !== "heal") throw new Error("use_ability requires npcRef or playerRef");
          if (npc && actionId !== "heal") this.assertNpcCombatTarget(npc, `use_ability ${actionId}`);
          if (actionId === "heal") this.clearEngagement();
          else if (npc) this.setEngagement(self, npc.id);
          this.routeQueue = [];
          this.cast(actionId, actionId === "heal" ? { kind: "player", id: self.sessionId } : { kind: "npc", id: npc?.id ?? "" });
        }
        this.lastAction = `use_ability ${actionId}`;
        return null;
      }
      case "loot": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("loot requires npcRef");
        this.clearEngagement();
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
    this.send("input", { x, z, yaw: this.yaw, sprint: Boolean(this.targetPoint), jump: false, seq: ++this.seq });
    this.publishAgentStatus(self);
  }

  private fight(self: RuntimePlayer, npc: RuntimeNpc) {
    this.routeQueue = [];
    const distance = distance2d(self, npc);
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (healthRatio < CRITICAL_HEALTH_RATIO && (this.lastSafePoint || this.combatAnchor)) {
      this.startRetreat(self, "retreat_critical_health");
      return;
    }
    if (attackers.length >= 2 && !this.shouldPressCurrentFight(self, npc, attackers)) {
      this.startRetreat(self, "retreat_overpull");
      return;
    }
    const actionId = this.chooseCombatAction(self, npc, distance);
    const action = COMBAT.actions[actionId];
    if (distance > action.maxRange * 0.9) {
      const directCombatPoint = this.combatRangePoint(self, npc, action);
      const safeApproach = this.safeCombatApproachPoint(self, npc, action, directCombatPoint);
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
    if (attackers.length >= 2 || healthRatio < 0.55) {
      if (npc && this.shouldPressCurrentFight(self, npc, attackers)) {
        this.nextAutoCombatAt = Date.now() + 650;
        this.fight(self, npc);
        return;
      }
      this.startRetreat(self, attackers.length >= 2 ? "retreat_overpull" : "retreat_low_health");
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
    const pressCurrentFight = Boolean(engagedNpc && this.shouldPressCurrentFight(self, engagedNpc, attackers));
    if (attackers.length >= 2 && closeAttackers.length > 0 && this.canUse(self, "frostNova") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 1800;
      this.cast("frostNova", { kind: "npc", id: "" });
      if (pressCurrentFight) this.lastAction = "auto_control_frostNova_press";
      else this.startRetreat(self, "auto_control_frostNova", 5600);
      return;
    }
    if (healthRatio <= 0.48 && inventoryCount(self, "red-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "red-juice" });
      this.lastAction = "auto_use red-juice";
      return;
    }
    if (healthRatio <= 0.62 && inventoryCount(self, "field-snack") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "field-snack" });
    }
  }

  private chooseCombatAction(self: RuntimePlayer, npc: RuntimeNpc, distance: number): CombatActionId {
    const closeAttackers = this.getAttackers(self).filter((entry) => distance2d(self, entry) <= 5.5).length;
    if (self.health < self.maxHealth * 0.45 && this.canUse(self, "heal")) return "heal";
    if (closeAttackers >= 2 && this.canUse(self, "frostNova")) return "frostNova";
    if (closeAttackers >= 2 && this.canUse(self, "whirlwind")) return "whirlwind";
    if (distance >= 8 && this.canUse(self, "fireblast")) return "fireblast";
    if (distance >= 4 && this.canUse(self, "signalShot")) return "signalShot";
    if (distance >= 4 && this.canUse(self, "shoot")) return "shoot";
    return "attack";
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
    this.routeQueue = [];
    this.moveTo(destination);
    this.retreatUntil = Date.now() + durationMs;
    this.lastAction = reason;
  }

  private retreatDestination(self: RuntimePlayer) {
    const candidates = [this.lastSafePoint, this.combatAnchor]
      .filter((candidate): candidate is Point => Boolean(candidate))
      .filter((candidate) => distance2d(self, candidate) >= 6)
      .sort((a, b) => this.nearbyHostileCount(a, 14) - this.nearbyHostileCount(b, 14));
    return candidates.find((candidate) => this.nearbyHostileCount(candidate, 14) === 0)
      ?? candidates[0]
      ?? this.threatAvoidancePoint(self, 22);
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

  private shouldPressCurrentFight(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) return false;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (healthRatio <= CRITICAL_HEALTH_RATIO) return false;
    if (attackers.length === 0) return true;
    const targetIsAttacking = attackers.some((attacker) => attacker.id === npc.id);
    const extraAttackers = attackers.filter((attacker) => attacker.id !== npc.id);
    const estimate = this.estimateCombatOutcome(self, npc, attackers);
    const canFinishSoon = npc.health <= this.estimatePlayerBurstDamage(self) * 1.35 && healthRatio >= PRESS_LOW_HEALTH_FINISH_RATIO;
    if (extraAttackers.length === 0 && targetIsAttacking) {
      return healthRatio >= PRESS_SINGLE_ATTACKER_HEALTH_RATIO || estimate.favorable || canFinishSoon;
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
    if (npc.isImmortal || npc.health <= 0 || npc.defeatedAt > 0) throw new Error(`${action} target ${npc.id} is not available`);
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

  private getAttackers(self: RuntimePlayer) {
    return [...this.npcs.values()].filter((npc) => npc.aggroTargetId === self.sessionId && npc.health > 0 && npc.defeatedAt <= 0);
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
    const target = this.routeQueue[0];
    if (!target) return;
    if (distance2d(self, target) < 2) this.routeQueue.shift();
    const nextTarget = this.routeQueue[0];
    if (nextTarget) this.moveTo(nextTarget);
  }

  private moveTo(target: Point) {
    const nextPoint = { x: target.x, z: target.z };
    if (!this.targetPoint || distance2d(this.targetPoint, nextPoint) > 1.2) this.resetMovementProgress(nextPoint);
    this.targetPoint = nextPoint;
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
    this.routeQueue = [];
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

  private combatAvoidancePenalty(npc: RuntimeNpc, now = Date.now()) {
    const entry = this.combatMemory.find((memory) => memory.npcId === npc.id && memory.avoidUntil > now);
    return entry ? 0.85 + Math.min(0.45, entry.count * 0.08) : 0;
  }

  private pruneCombatMemory(now = Date.now()) {
    this.combatMemory = this.combatMemory.filter((entry) => now - entry.lastAt <= COMBAT_MEMORY_TTL_MS);
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
    this.send("agentStatus", {
      action: this.lastAction,
      thought: this.lastDecision?.reason ?? "",
      objective: this.objective,
      quest: this.describeCurrentQuest(self),
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
        return npc ? `next: looting ${npc.name}` : "";
      case "use_ability":
        return cleanText(decision.actionId, 40) ? `next: using ${cleanText(decision.actionId, 40)}` : "";
      case "purchase_potion_shop_item":
        return itemId ? `next: buying ${itemId}` : "";
      case "swap_eth_for_mfergpt":
        return "next: preparing an ETH to MFERGPT swap";
      case "respawn":
        return "next: respawning";
      default:
        return "";
    }
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

  private describeInventory(self: RuntimePlayer) {
    return self.inventory.map((item) => ({
      itemId: getString(item.id),
      count: getNumber(item.count),
      chainTokenId: getString(item.chainTokenId),
      chainTier: getNumber(item.chainTier, 1),
    }));
  }

  private describeEquipment(self: RuntimePlayer) {
    return self.equipment.map((slot) => ({
      slot: getString(slot.slot),
      itemId: getString(slot.itemId),
      chainTokenId: getString(slot.chainTokenId),
      chainTier: getNumber(slot.chainTier, 1),
    }));
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

  private describeRecommendedTalentSpends(self: RuntimePlayer) {
    return this.describeSpendableTalents(self)
      .map((talent) => ({
        ...talent,
        priority: this.scoreTalentSpend(self, talent.talentId),
        reason: this.describeTalentSpendReason(talent.talentId),
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, Math.max(1, Math.min(5, self.talentPoints || 1)));
  }

  private scoreTalentSpend(self: RuntimePlayer, talentId: TalentId) {
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
    if (healthRatio < RECOVER_HEALTH_RATIO && talentId === "brawler:street-tough") score += 0.12;
    if (this.getAttackers(self).length > 0 && talent.tree === "brawler") score += 0.08;
    return round(score);
  }

  private talentRankLikes(self: RuntimePlayer): TalentRankLike[] {
    return self.talents.map((talent) => ({
      id: getString(talent.id),
      tree: getString(talent.tree),
      nodeId: getString(talent.nodeId),
      rank: getNumber(talent.rank),
    }));
  }

  private describeTalentSpendReason(talentId: TalentId) {
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

  private buildDecisionHints(self: RuntimePlayer, availableQuestHints: AnyRecord[], lootableCorpses: AnyRecord[]) {
    const hints: AnyRecord[] = [];
    if (self.health <= 0) {
      hints.push({ action: "respawn", priority: 1, reason: "self health is 0" });
      return hints;
    }

    const attackers = this.getAttackers(self).sort((a, b) => distance2d(self, a) - distance2d(self, b));
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (attackers.length >= 2 || healthRatio < CRITICAL_HEALTH_RATIO) {
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

    const readyQuest = self.quests.find((quest) => getString(quest.status) === "ready");
    if (readyQuest) {
      const questId = getString(readyQuest.id);
      const npc = this.resolveQuestTurnInNpc(questId);
      hints.push({
        action: "complete_quest",
        questId,
        npcId: npc?.id ?? "",
        npcRef: npc?.id ?? "",
        priority: npc && distance2d(self, npc) <= QUEST_SEND_RANGE ? 0.9 : 0.78,
        reason: `${questId} is ready to turn in`,
      });
    }

    const talentSpend = this.describeRecommendedTalentSpends(self)[0];
    if (talentSpend) {
      hints.push({
        action: "select_talent",
        talentId: talentSpend.talentId,
        priority: 0.74,
        reason: `unspent skill point available; ${talentSpend.reason}`,
      });
    }

    for (const offer of availableQuestHints.slice(0, 3)) {
      hints.push({
        action: "accept_quest",
        questId: getString(offer.questId),
        npcId: getString(offer.npcId),
        npcRef: getString(offer.npcId),
        priority: getNumber(offer.distance) <= QUEST_SEND_RANGE ? 0.82 : 0.55,
        reason: `${getString(offer.title) || getString(offer.questId)} is available`,
      });
    }

    const namedTarget = this.findNamedObjectiveTarget(self);
    if (namedTarget) {
      hints.push({
        action: "fight_npc",
        npcId: namedTarget.npc.id,
        npcRef: namedTarget.npc.id,
        questId: namedTarget.questId,
        priority: 0.76,
        reason: `${namedTarget.npc.name} is an unfinished named objective for ${namedTarget.questId}`,
      });
    }

    const questTarget = this.findGenericQuestTarget(self);
    if (questTarget) {
      hints.push({
        action: "fight_npc",
        npcId: questTarget.npc.id,
        npcRef: questTarget.npc.id,
        questId: questTarget.questId,
        priority: 0.64,
        reason: `${questTarget.npc.name} matches active quest ${questTarget.questId}`,
      });
    }

    return hints
      .sort((a, b) => getNumber(b.priority) - getNumber(a.priority))
      .slice(0, 8);
  }

  private findNamedObjectiveTarget(self: RuntimePlayer, preferredQuestId = "") {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId) continue;
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

  private findGenericQuestTarget(self: RuntimePlayer, preferredQuestId = "") {
    for (const quest of self.quests) {
      if (getString(quest.status) !== "active") continue;
      const questId = normalizeKnownQuestId(getString(quest.id));
      if (!questId || getQuestObjectives(questId).length > 0) continue;
      if (preferredQuestId && questId !== preferredQuestId) continue;
      const matchers = getQuestTargetMatchers(questId);
      if (matchers.models.length === 0 && matchers.roles.length === 0 && matchers.idPrefixes.length === 0) continue;
      const npc = [...this.npcs.values()]
        .filter((candidate) => isAttackable(candidate) && candidate.health > 0 && candidate.defeatedAt <= 0)
        .filter((candidate) => matchesQuestTarget(candidate, matchers))
        .sort((a, b) => this.scoreCombatTargetCandidate(self, a) - this.scoreCombatTargetCandidate(self, b) || distance2d(self, a) - distance2d(self, b))[0];
      if (npc) return { questId, npc };
    }
    return null;
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
    return round(clamp(pullRisk * 0.55 + approachRisk * 0.85 + densityPenalty + distancePenalty + avoidPenalty, 0, 2));
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
    this.pendingSocialMessages = [
      ...this.pendingSocialMessages.filter((entry) => now - entry.observedAt <= SOCIAL_MESSAGE_TTL_MS).slice(-7),
      { sessionId, name: cleanText(record.name, 48) || "player", identityType, text, kind, observedAt: now },
    ];
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
      writeBridgeError(res, error);
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
      writeBridgeJson(res, 400, { ok: false, error: "valid walletAddress required" });
      return;
    }
    if (!verifyAgentSessionToken(walletAddress, sessionToken)) {
      writeBridgeJson(res, 401, { ok: false, error: "valid agent session bearer token required" });
      return;
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
    if (!session) throw new BridgeHttpError(404, "bridge session not found");
    const bearer = readBearerToken(req);
    if (bearer !== session.sessionToken || !verifyAgentSessionToken(session.walletAddress, bearer)) {
      throw new BridgeHttpError(401, "valid bearer token required for bridge session");
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
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function actionResultHttpStatus(result: { ok: boolean; status?: string }) {
  if (result.ok) return 202;
  if (result.status === "payment_required" || result.status === "wallet_action_required") return 409;
  if (result.status === "chat_cooldown") return 429;
  return 400;
}

export function writeBridgeError(res: ServerResponse, error: unknown) {
  if (error instanceof BridgeHttpError) {
    writeBridgeJson(res, error.status, { ok: false, error: error.message });
    return;
  }
  writeBridgeJson(res, 500, { ok: false, error: errorMessage(error) });
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
  const report = await reportAgentToolUsage("mferland-agent-command", payment, startedAt);
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
  const controller = normalizeCommandController(record.controller, record.behaviorMode, record.policyRef ?? record.policySource, record.policyHash ?? record.codeChunkHash);
  const profile = normalizeCommandProfile(record.profile, record.behaviorScheme ?? record.behavior, kind);
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

function normalizeCommandProfile(value: unknown, legacyBehavior: unknown, kind: AgentCommandKind): AgentCommandProfile {
  const record = asRecord(value);
  const legacy = normalizeProfileToken(legacyBehavior);
  const defaultPriority = defaultCommandPriority(kind);
  const legacyPriority: AgentCommandPriority = legacy && legacy !== "safe" ? legacy : defaultPriority;
  return {
    priority: normalizeProfileEnum(record.priority, ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"], legacyPriority),
    role: normalizeProfileEnum(record.role, ["auto", "tank", "healer", "dps", "support"], DEFAULT_COMMAND_PROFILE.role),
    spec: normalizeProfileEnum(record.spec, ["auto", "brawler_tank", "brawler_dps", "caster_fire", "caster_frost", "utility_ranger", "utility_support"], DEFAULT_COMMAND_PROFILE.spec),
    partyMode: normalizeProfileEnum(record.partyMode ?? record.party, ["auto", "grouper", "lone_wolf", "follow_leader"], DEFAULT_COMMAND_PROFILE.partyMode),
    risk: normalizeProfileEnum(record.risk, ["safe", "normal", "bold"], legacy === "safe" ? "safe" : DEFAULT_COMMAND_PROFILE.risk),
    social: normalizeProfileEnum(record.social, ["quiet", "normal", "chatty"], legacy === "social" ? "normal" : DEFAULT_COMMAND_PROFILE.social),
  };
}

function normalizeProfileToken(value: unknown): AgentCommandPriority | "safe" | "" {
  const text = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (text === "quester" || text === "quest") return "quester";
  if (text === "farmer" || text === "farm") return "farmer";
  if (text === "boss_hunter" || text === "boss") return "boss_hunter";
  if (text === "looter" || text === "loot") return "looter";
  if (text === "completionist" || text === "complete") return "completionist";
  if (text === "social") return "social";
  if (text === "survivor" || text === "safe") return "safe";
  return "";
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
  return {
    noWalletActions: Boolean(record.noWalletActions),
    noPaidActions: Boolean(record.noPaidActions),
    maxDeaths: Math.min(99, Math.max(0, nonNegativeInt(record.maxDeaths))),
    maxSafetyStops: Math.min(99, Math.max(0, nonNegativeInt(record.maxSafetyStops))),
    allowedActions: normalizeDecisionActionList(record.allowedActions),
    disallowedActions: normalizeDecisionActionList(record.disallowedActions),
  };
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

function normalizeKnownQuestId(value: string): QuestId | null {
  return (QUEST_IDS as readonly string[]).includes(value) ? value as QuestId : null;
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

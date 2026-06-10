import { appendFile } from "node:fs/promises";
import { Client, type Room } from "colyseus.js";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  AGENT,
  CHAT,
  COMBAT,
  DEFAULT_MFER_APPEARANCE_TRAITS,
  INPUT_SEND_RATE,
  PLAZA_BOUNDS,
  ROOM_NAME,
  getNpcDisposition,
  isCombatActionUnlocked,
  getQuestTurnInNpcId,
  normalizeAvatarSeed,
  parseMferAppearanceTraitsJson,
  stableHash,
  type ActiveBuffSnapshot,
  type AgentObservation,
  type ChatMessage,
  type ClientAgentStatus,
  type ClientInput,
  type CombatEvent,
  type CombatActionId,
  type EquipmentSlotId,
  type EquipmentSlotSnapshot,
  type InventoryItemSnapshot,
  type ItemId,
  type LootWindow,
  type MferGptPaymentProof,
  type MferAppearanceTraits,
  type NpcModel,
  type NpcRole,
  type NpcSnapshot,
  type PlayerSnapshot,
  type PotionShopItemId,
  type PotionShopPurchaseQuantity,
  type PotionShopPurchaseResult,
  type QuestId,
  type QuestSnapshot,
  type TalentId,
  type TalentRankSnapshot,
  type TargetSelection,
  type TrashVendorItemId,
  type TrashVendorSellResult,
} from "@mferland/shared";
import { toHttpServerUrl, toWsServerUrl } from "./localSafety.js";

export type Point = {
  x: number;
  z: number;
};

export type MferlandAgentOptions = {
  serverUrl: string;
  inviteCode: string;
  name: string;
  account: PrivateKeyAccount;
  avatarSeed?: number;
  createCharacter?: boolean;
  agentClient?: boolean;
  chatEnabled?: boolean;
  combatLogPath?: string;
  log?: (message: string) => void;
};

type RuntimePlayer = Omit<PlayerSnapshot, "sessionId" | "appearanceTraits" | "quests" | "inventory" | "equipment" | "talents" | "activeBuffs"> & {
  appearanceTraitsJson?: string;
  quests?: RuntimeQuestCollection;
  inventory?: RuntimeInventoryCollection;
  equipment?: RuntimeEquipmentCollection;
  talents?: RuntimeTalentCollection;
  activeBuffs?: RuntimeBuffCollection;
};

type RuntimeQuestCollection = {
  forEach(callback: (quest: QuestSnapshot, id: string) => void): void;
};

type RuntimeInventoryCollection = {
  forEach(callback: (item: InventoryItemSnapshot, id: string) => void): void;
};

type RuntimeEquipmentCollection = {
  forEach(callback: (slot: EquipmentSlotSnapshot, id: string) => void): void;
};

type RuntimeTalentCollection = {
  forEach(callback: (talent: TalentRankSnapshot, id: string) => void): void;
};

type RuntimeBuffCollection = {
  forEach(callback: (buff: ActiveBuffSnapshot, id: string) => void): void;
};

type RuntimeNpc = {
  name: string;
  role: NpcRole;
  model: NpcModel;
  portraitImage: string;
  avatarSeed: number;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: PlayerSnapshot["animation"];
  dialogue: string;
  questId: string;
  defeatedAt: number;
  despawnAt: number;
  frozenUntil: number;
  slowedUntil: number;
  aggroTargetId: string;
  hasLoot: boolean;
};

type RuntimeState = {
  players?: RuntimeCollection<RuntimePlayer>;
  npcs?: RuntimeCollection<RuntimeNpc>;
};

type RuntimeCollection<T> = {
  forEach(callback: (value: T, key: string) => void): void;
};

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

type MoveOptions = WaitOptions & {
  range?: number;
  sprint?: boolean;
  stopOnDanger?: boolean;
  dangerRadius?: number;
  maxSelfAttackers?: number;
  maxCloseHostiles?: number;
  dangerHealthRatio?: number;
};

type FightOptions = WaitOptions & {
  preferredActions?: CombatActionId[];
  abortOnRespawn?: boolean;
  stopDamageBelowHealth?: number;
  disableSelfHeal?: boolean;
  healAllySessionId?: string;
  healAllyHealthRatio?: number;
  healNearbyAllies?: boolean;
  healNearbyAllyHealthRatio?: number;
  followAllySessionId?: string;
  followAllyMaxRange?: number;
  suppressDamageWhileAllyNeedsHeal?: boolean;
  healCastDelayMs?: number;
  abortUnlessNpcAggroTargetId?: string;
  abortUnlessNpcAggroTargetIds?: string[];
  ignoreAggroGuardBelowHealthRatio?: number;
  healNpcAggroTarget?: boolean;
  healNpcAggroTargetHealthRatio?: number;
  healthPotionThresholdRatio?: number;
  yieldOnDanger?: boolean;
  dangerRadius?: number;
  maxSelfAttackers?: number;
  maxCloseHostiles?: number;
  dangerHealthRatio?: number;
  kiteMinRange?: number;
  avoidNpcId?: string;
  avoidNpcIds?: string[];
  avoidNpcMinRange?: number;
  avoidMovePoint?: Point;
};

type AmbientStyle = "lurker" | "builder" | "drifter";
type TraitUpdateOptions = {
  name?: string;
  attemptId?: string;
  payment?: MferGptPaymentProof;
};

const DEFAULT_WAIT_TIMEOUT_MS = 15_000;
const DEFAULT_MOVE_TIMEOUT_MS = 45_000;
const DEFAULT_FIGHT_TIMEOUT_MS = 90_000;
const MELEE_RANGE = 3.4;
const RANGED_RANGE = 12;
const NPC_OBSERVATION_RADIUS = Math.max(AGENT.observationRadius, 32);
const PLAYER_OBSERVATION_RADIUS = Math.max(AGENT.observationRadius, 64);
const COMBAT_LOGGED_EVENT_ID_LIMIT = 5000;
const combatLoggedEventIds = new Set<string>();

export class MferlandAgentClient {
  private readonly client: Client;
  private readonly httpServerUrl: string;
  private readonly inviteCode: string;
  private readonly account: PrivateKeyAccount;
  private readonly name: string;
  private readonly avatarSeed: number;
  private readonly createCharacter: boolean;
  private readonly agentClient: boolean;
  private readonly chatEnabled: boolean;
  private readonly combatLogPath: string;
  private readonly log: (message: string) => void;
  private readonly style: AmbientStyle;
  private room: Room<RuntimeState> | null = null;
  private players = new Map<string, PlayerSnapshot>();
  private npcs = new Map<string, NpcSnapshot>();
  private recentChat: ChatMessage[] = [];
  private recentCombatEvents: CombatEvent[] = [];
  private potionShopResults: PotionShopPurchaseResult[] = [];
  private trashVendorResults: TrashVendorSellResult[] = [];
  private targetPoint: Point | null = null;
  private selectedTarget: TargetSelection | null = null;
  private sprint = false;
  private yaw = Math.PI;
  private seq = 0;
  private inputTimer: NodeJS.Timeout | null = null;
  private nextAmbientDecisionAt = 0;
  private nextChatAt = 0;
  private jumpUntil = 0;
  private connected = false;
  private lastRespawnAt = 0;
  private consumableAttemptedAt = new Map<string, number>();
  private combatLogFailed = false;

  constructor(options: MferlandAgentOptions) {
    const wsServerUrl = toWsServerUrl(options.serverUrl);
    this.client = new Client(wsServerUrl);
    this.httpServerUrl = toHttpServerUrl(options.serverUrl);
    this.inviteCode = options.inviteCode;
    this.account = options.account;
    this.name = cleanName(options.name);
    this.avatarSeed = normalizeAvatarSeed(options.avatarSeed ?? stableHash(`wallet-agent:${this.account.address}:${this.name}`));
    this.createCharacter = options.createCharacter ?? true;
    this.agentClient = options.agentClient ?? true;
    this.chatEnabled = options.chatEnabled ?? true;
    this.combatLogPath = options.combatLogPath?.trim() || process.env.AGENT_COMBAT_LOG_PATH?.trim() || "";
    this.log = options.log ?? ((message) => console.log(message));
    this.style = getAgentStyle(this.avatarSeed);
  }

  get sessionId() {
    return this.room?.sessionId ?? "";
  }

  get walletAddress() {
    return this.account.address;
  }

  getSelf() {
    return this.room ? this.players.get(this.room.sessionId) ?? null : null;
  }

  getPlayers() {
    return Array.from(this.players.values());
  }

  getNpcs() {
    return Array.from(this.npcs.values());
  }

  getRecentCombatEvents() {
    return [...this.recentCombatEvents];
  }

  getNpc(npcId: string) {
    return this.npcs.get(npcId) ?? null;
  }

  getQuest(questId: QuestId) {
    return this.getSelf()?.quests.find((quest) => quest.id === questId) ?? null;
  }

  hasCompletedQuest(questId: QuestId) {
    return this.getQuest(questId)?.status === "completed";
  }

  hasActiveOrReadyQuest(questId: QuestId) {
    const quest = this.getQuest(questId);
    return quest?.status === "active" || quest?.status === "ready";
  }

  observe(): AgentObservation | null {
    const self = this.getSelf();
    if (!self) return null;

    const nearbyPlayers = Array.from(this.players.values())
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => ({
        ...player,
        distance: distance2d(self, player),
      }))
      .filter((player) => player.distance <= PLAYER_OBSERVATION_RADIUS)
      .sort((a, b) => a.distance - b.distance);

    const nearbyNpcs = Array.from(this.npcs.values())
      .map((npc) => ({
        ...npc,
        distance: distance2d(self, npc),
      }))
      .filter((npc) => npc.distance <= NPC_OBSERVATION_RADIUS)
      .sort((a, b) => a.distance - b.distance);

    return {
      self,
      nearbyPlayers,
      nearbyNpcs,
      recentChat: this.recentChat.slice(-8),
      bounds: PLAZA_BOUNDS,
      availableActions: [
        "move",
        "look",
        "jump",
        "sprint",
        "chat",
        "emote",
        "interact",
        "acceptQuest",
        "completeQuest",
        "cancelQuest",
        "shareQuestLink",
        "combatAction",
        "respawn",
        "lootCorpse",
        "equipItem",
        "unequipItem",
        "useItem",
        "selectTalent",
        "updateTraits",
        "registerChainGear",
        "purchasePotionShopItem",
        "sellTrashItems",
        ...(Object.keys(COMBAT.actions) as CombatActionId[]),
      ],
    };
  }

  sendAgentStatus(status: ClientAgentStatus) {
    this.room?.send("agentStatus", status);
  }

  async connect() {
    const challenge = await this.requestWalletChallenge();
    const signature = await this.account.signMessage({ message: challenge.message });
    const room = await this.client.joinOrCreate<RuntimeState>(ROOM_NAME, {
      name: this.name,
      identityType: "wallet",
      walletAddress: this.account.address,
      agentClient: this.agentClient,
      avatarSeed: this.avatarSeed,
      createCharacter: this.createCharacter,
      inviteCode: this.inviteCode,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    });

    this.room = room;
    this.connected = true;
    this.nextChatAt = Date.now() + 3000 + randomRange(0, 4000);
    this.installRoomHandlers(room);
    this.inputTimer = setInterval(() => this.tick(), 1000 / INPUT_SEND_RATE);
    await this.waitFor(() => Boolean(this.getSelf()), { timeoutMs: 8000 }, "self snapshot");
    this.log(`${this.name} joined ${ROOM_NAME} as wallet ${shortAddress(this.account.address)} (${room.sessionId})`);
  }

  async leave() {
    this.stop();
    await this.room?.leave();
  }

  selectTarget(target: TargetSelection | null) {
    this.selectedTarget = target;
  }

  async moveToPoint(point: Point, options: MoveOptions = {}) {
    const range = options.range ?? 1.5;
    const timeoutMs = options.timeoutMs ?? DEFAULT_MOVE_TIMEOUT_MS;
    const intervalMs = options.intervalMs ?? 100;
    const startedAt = Date.now();
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestAt = startedAt;
    let sidestepCount = 0;
    this.targetPoint = point;
    this.sprint = options.sprint ?? true;
    try {
      while (Date.now() - startedAt < timeoutMs) {
        const self = this.getSelf();
        if (self) {
          this.respawnIfDefeated(self);
          if (this.useCombatConsumables(self)) {
            this.targetPoint = null;
            this.sendIdleInput();
            await delay(650);
            this.targetPoint = point;
            this.sprint = options.sprint ?? true;
            continue;
          }
          const dangerReason = options.stopOnDanger ? this.getDangerYieldReason(self, options) : "";
          if (dangerReason) throw new Error(`${this.name} yielded movement: ${dangerReason}`);
          const distance = distanceToPoint(self, point);
          if (distance <= range) return;
          if (distance + 0.35 < bestDistance) {
            bestDistance = distance;
            bestAt = Date.now();
          }
          if (distance > range + 0.8 && Date.now() - bestAt > 2200) {
            this.targetPoint = makeSidestepPoint(self, point, sidestepCount);
            this.jumpUntil = Date.now() + 260;
            sidestepCount += 1;
            await delay(650);
            this.targetPoint = point;
            bestDistance = distanceToPoint(self, point);
            bestAt = Date.now();
          }
        }
        await delay(intervalMs);
      }
      throw new Error(`${this.name} timed out waiting for move to ${formatPoint(point)}`);
    } catch (error) {
      const self = this.getSelf();
      throw new Error(`${error instanceof Error ? error.message : String(error)}${self ? ` from ${formatPoint(self)}` : ""}`);
    } finally {
      this.targetPoint = null;
      this.sprint = false;
      this.sendIdleInput();
    }
  }

  async moveAlong(points: Point[], options: MoveOptions = {}) {
    for (const point of this.getRoutePointsFromCurrentPosition(points, options.range ?? 1.5)) {
      await this.moveToPoint(point, options);
    }
  }

  async moveToNpc(npcId: string, options: MoveOptions = {}) {
    const range = options.range ?? 2.7;
    const timeoutMs = options.timeoutMs ?? DEFAULT_MOVE_TIMEOUT_MS;
    const startedAt = Date.now();
    await this.moveThroughNpcApproach(npcId, range, startedAt, timeoutMs, options);
    this.sprint = options.sprint ?? true;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestAt = startedAt;
    let orbitIndex = 0;
    while (Date.now() - startedAt < timeoutMs) {
      const self = this.getSelf();
      const npc = this.getNpc(npcId);
      if (self) {
        this.respawnIfDefeated(self);
        if (this.useCombatConsumables(self)) {
          this.targetPoint = null;
          this.sendIdleInput();
          await delay(650);
          continue;
        }
        const dangerReason = options.stopOnDanger ? this.getDangerYieldReason(self, options, npcId) : "";
        if (dangerReason) {
          this.targetPoint = null;
          this.sprint = false;
          this.sendIdleInput();
          throw new Error(`${this.name} yielded movement to ${npcId}: ${dangerReason}`);
        }
      }
      if (self && npc && distance2d(self, npc) <= range) {
        this.targetPoint = null;
        this.sprint = false;
        this.sendIdleInput();
        return;
      }
      if (self && npc) {
        const distance = distance2d(self, npc);
        if (distance + 0.25 < bestDistance) {
          bestDistance = distance;
          bestAt = Date.now();
        }
        if (distance > range + 0.5 && Date.now() - bestAt > 2200) {
          this.targetPoint = makeNpcOrbitPoint(npc, self, orbitIndex, Math.max(range * 0.72, 1.8));
          this.jumpUntil = Date.now() + 260;
          orbitIndex += 1;
          await delay(650);
          bestDistance = distance2d(self, npc);
          bestAt = Date.now();
        } else {
          this.targetPoint = { x: npc.x, z: npc.z };
        }
      } else if (npc) {
        this.targetPoint = { x: npc.x, z: npc.z };
      }
      await delay(options.intervalMs ?? 100);
    }
    const self = this.getSelf();
    throw new Error(`${this.name} timed out moving to npc ${npcId}${self ? ` from ${formatPoint(self)}` : ""}`);
  }

  async interactWithNpc(npcId: string, options: MoveOptions = {}) {
    await this.moveToNpc(npcId, { range: options.range ?? 3, timeoutMs: options.timeoutMs, intervalMs: options.intervalMs });
    this.room?.send("interact", { npcId });
    await delay(250);
  }

  async acceptQuest(questId: QuestId, npcId?: string) {
    if (this.hasCompletedQuest(questId) || this.hasActiveOrReadyQuest(questId)) return;
    const giverNpcId = npcId ?? getQuestGiverNpcId(questId);
    await this.interactWithNpc(giverNpcId, { range: 10 });
    this.room?.send("acceptQuest", { questId, npcId: giverNpcId });
    await this.waitFor(() => Boolean(this.getQuest(questId)), { timeoutMs: DEFAULT_WAIT_TIMEOUT_MS }, `accept ${questId}`);
  }

  async completeQuest(questId: QuestId, npcId = getQuestTurnInNpcId(questId)) {
    if (this.hasCompletedQuest(questId)) return;
    await this.interactWithNpc(npcId);
    this.room?.send("completeQuest", { questId, npcId });
    let nextRetryAt = Date.now() + 2000;
    await this.waitFor(() => {
      if (this.hasCompletedQuest(questId)) return true;
      if (Date.now() >= nextRetryAt) {
        this.room?.send("completeQuest", { questId, npcId });
        nextRetryAt = Date.now() + 2000;
      }
      return false;
    }, { timeoutMs: 30_000, intervalMs: 250 }, `complete ${questId}`);
  }

  cancelQuest(questId: QuestId) {
    this.room?.send("cancelQuest", { questId });
  }

  shareQuestLink(questId: QuestId, url = "http://localhost:5173") {
    this.room?.send("shareQuestLink", { questId, url });
  }

  chat(text: string) {
    this.room?.send("chat", { text: text.slice(0, CHAT.maxLength) });
  }

  emote(emoteId: string) {
    this.room?.send("emote", { emoteId });
  }

  useCombatAbility(actionId: CombatActionId, target = this.selectedTarget) {
    this.room?.send("combatAction", { actionId, target });
  }

  respawn() {
    this.room?.send("respawn", {});
  }

  lootNpc(npcId: string, itemId?: ItemId) {
    this.room?.send("lootCorpse", { npcId, itemId });
  }

  async openStore(npcId: string) {
    await this.interactWithNpc(npcId);
  }

  equipItem(itemId: ItemId, chainTokenId?: string) {
    this.room?.send("equipItem", { itemId, chainTokenId });
  }

  unequipItem(slot: EquipmentSlotId) {
    this.room?.send("unequipItem", { slot });
  }

  useItem(itemId: ItemId, chainTokenId?: string) {
    this.room?.send("useItem", { itemId, chainTokenId });
  }

  selectTalent(talentId: TalentId) {
    this.room?.send("selectTalent", { talentId });
  }

  registerChainGear(tokenId: string, gearType?: number) {
    this.room?.send("registerChainGear", { tokenId, gearType });
  }

  usePotionShopItem(itemId: PotionShopItemId, quantity?: PotionShopPurchaseQuantity, payment?: MferGptPaymentProof) {
    this.room?.send("purchasePotionShopItem", { itemId, quantity, payment });
  }

  async purchasePotionShopItem(itemId: PotionShopItemId, quantity: PotionShopPurchaseQuantity, payment: MferGptPaymentProof) {
    this.usePotionShopItem(itemId, quantity, payment);
    await this.waitFor(() => this.potionShopResults.some((result) => (
      result.itemId === itemId
      && result.quantity === quantity
      && (!payment.txHash || result.txHash === payment.txHash)
    )), { timeoutMs: 95_000, intervalMs: 250 }, `potion shop purchase ${itemId}`);
    const result = [...this.potionShopResults]
      .reverse()
      .find((entry) => (
        entry.itemId === itemId
        && entry.quantity === quantity
        && (!payment.txHash || entry.txHash === payment.txHash)
      ));
    if (!result?.ok) throw new Error(result?.error || `potion shop purchase ${itemId} failed`);
  }

  async sellTrashItems(options: { itemId?: TrashVendorItemId; quantity?: number; sellAll?: boolean } = {}) {
    const previousResultCount = this.trashVendorResults.length;
    this.room?.send("sellTrashItems", options);
    await this.waitFor(() => this.trashVendorResults.length > previousResultCount, {
      timeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
      intervalMs: 250,
    }, "trash vendor sale");
    const result = this.trashVendorResults.at(-1);
    if (!result?.ok) throw new Error(result?.error || "trash vendor sale failed");
    return result;
  }

  updateTraits(traits: MferAppearanceTraits = DEFAULT_MFER_APPEARANCE_TRAITS, options: TraitUpdateOptions = {}) {
    this.room?.send("updateTraits", {
      traits,
      name: options.name ?? this.name,
      attemptId: options.attemptId ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payment: options.payment,
    });
  }

  async completeTraitQuest() {
    if (this.hasCompletedQuest("set-your-traits")) return;
    await this.acceptQuest("set-your-traits", "traits-mfer");
    await this.moveToNpc("traits-mfer", { range: 2.8 });
    this.updateTraits();
    await this.waitFor(() => {
      const quest = this.getQuest("set-your-traits");
      return quest?.status === "ready" || quest?.status === "completed";
    }, { timeoutMs: DEFAULT_WAIT_TIMEOUT_MS }, "traits quest ready");
    await this.completeQuest("set-your-traits", "traits-mfer");
  }

  async completeChatQuest(questId: QuestId, text: string, npcId: string) {
    if (this.hasCompletedQuest(questId)) return;
    await this.acceptQuest(questId, npcId);
    this.chat(text);
    await this.waitFor(() => {
      const quest = this.getQuest(questId);
      return quest?.status === "ready" || quest?.status === "completed";
    }, { timeoutMs: DEFAULT_WAIT_TIMEOUT_MS }, `${questId} ready`);
    await this.completeQuest(questId, getQuestTurnInNpcId(questId));
  }

  async fightNpc(npcId: string, options: FightOptions = {}) {
    await this.waitForNpc(npcId, options);
    this.selectTarget({ kind: "npc", id: npcId });
    const timeoutMs = options.timeoutMs ?? DEFAULT_FIGHT_TIMEOUT_MS;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const npc = this.getNpc(npcId);
      const self = this.getSelf();
      if (!npc || npc.health <= 0 || npc.defeatedAt > 0) {
        this.targetPoint = null;
        this.sendIdleInput();
        return;
      }
      if (!self) throw new Error(`${this.name} has no self snapshot during fight`);
      if (self.health <= 0) {
        this.respawnIfDefeated(self);
        if (options.abortOnRespawn) throw new Error(`${this.name} was defeated fighting ${npcId}`);
        await delay(500);
        continue;
      }
      const ignoreAggroGuard = options.ignoreAggroGuardBelowHealthRatio !== undefined
        && npc.maxHealth > 0
        && npc.health / npc.maxHealth <= options.ignoreAggroGuardBelowHealthRatio;
      if (
        !ignoreAggroGuard
        &&
        (options.abortUnlessNpcAggroTargetId || options.abortUnlessNpcAggroTargetIds?.length)
        && npc.aggroTargetId
        && npc.aggroTargetId !== options.abortUnlessNpcAggroTargetId
        && !options.abortUnlessNpcAggroTargetIds?.includes(npc.aggroTargetId)
      ) {
        throw new Error(`${this.name} stopped fighting ${npcId}: boss aggro is not on the assigned tank`);
      }
      if (self.castingAction) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(120);
        continue;
      }
      const healAlly = options.healAllySessionId ? this.players.get(options.healAllySessionId) : null;
      const healAllyThreshold = options.healAllyHealthRatio ?? 0.74;
      const healAllyNeedsHeal = Boolean(
        healAlly
        && healAlly.health > 0
        && healAlly.maxHealth > 0
        && healAlly.health <= healAlly.maxHealth * healAllyThreshold,
      );
      const followAllySessionId = options.followAllySessionId ?? options.healAllySessionId;
      if (
        followAllySessionId
        && (!healAllyNeedsHeal || !healAlly || distance2d(self, healAlly) > COMBAT.actions.heal.maxRange)
        && this.tryMoveTowardAlly(self, followAllySessionId, options.followAllyMaxRange ?? COMBAT.actions.heal.maxRange - 3)
      ) {
        await delay(220);
        continue;
      }
      if (
        options.healAllySessionId
        && healAllyNeedsHeal
        && options.healCastDelayMs
        && self.mana >= COMBAT.actions.heal.manaCost
      ) {
        await delay(options.healCastDelayMs);
      }
      if (options.healAllySessionId && this.tryHealAlly(self, options.healAllySessionId, healAllyThreshold)) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(500);
        continue;
      }
      const bossAggroAlly = options.healNpcAggroTarget && npc.aggroTargetId !== self.sessionId
        ? this.players.get(npc.aggroTargetId)
        : null;
      const bossAggroAllyThreshold = options.healNpcAggroTargetHealthRatio ?? options.healNearbyAllyHealthRatio ?? 0.82;
      if (
        bossAggroAlly
        && bossAggroAlly.health > 0
        && bossAggroAlly.maxHealth > 0
        && bossAggroAlly.health <= bossAggroAlly.maxHealth * bossAggroAllyThreshold
        && distance2d(self, bossAggroAlly) > COMBAT.actions.heal.maxRange
        && this.tryMoveTowardAlly(self, bossAggroAlly.sessionId, COMBAT.actions.heal.maxRange - 3)
      ) {
        await delay(220);
        continue;
      }
      if (
        bossAggroAlly
        && this.tryHealAlly(self, bossAggroAlly.sessionId, bossAggroAllyThreshold)
      ) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(500);
        continue;
      }
      if (this.useCombatConsumables(self, {
        preferMana: Boolean(options.healAllySessionId),
        healthPotionThresholdRatio: options.healthPotionThresholdRatio,
      })) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(500);
        continue;
      }
      if (options.suppressDamageWhileAllyNeedsHeal && healAllyNeedsHeal) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(220);
        continue;
      }
      if (!options.disableSelfHeal && this.trySelfHeal(self)) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(500);
        continue;
      }
      if (options.healNearbyAllies && this.tryHealLowestAlly(self, options.healNearbyAllyHealthRatio)) {
        this.targetPoint = null;
        this.sendIdleInput();
        await delay(500);
        continue;
      }

      const dangerReason = options.yieldOnDanger ? this.getDangerYieldReason(self, options, npcId) : "";
      if (dangerReason) {
        this.targetPoint = null;
        this.sprint = false;
        this.sendIdleInput();
        throw new Error(`${this.name} yielded fight ${npcId}: ${dangerReason}`);
      }

      const avoidNpcIds = options.avoidNpcIds ?? (options.avoidNpcId ? [options.avoidNpcId] : []);
      const avoidNpc = avoidNpcIds
        .filter((id) => id !== npcId)
        .map((id) => this.getNpc(id))
        .filter((candidate): candidate is NpcSnapshot => Boolean(candidate && isAliveNpc(candidate)))
        .sort((left, right) => distance2d(self, left) - distance2d(self, right))[0];
      if (avoidNpc) {
        const avoidRange = options.avoidNpcMinRange ?? 26;
        if (distance2d(self, avoidNpc) < avoidRange) {
          if (options.avoidMovePoint) {
            this.yaw = Math.atan2(avoidNpc.x - self.x, avoidNpc.z - self.z);
            this.targetPoint = options.avoidMovePoint;
            this.sprint = true;
          } else {
            this.kiteAwayFromNpc(self, avoidNpc);
          }
          await delay(220);
          continue;
        }
      }

      if (options.kiteMinRange && distance2d(self, npc) < options.kiteMinRange) {
        this.kiteAwayFromNpc(self, npc);
        await delay(220);
        continue;
      }

      const actionId = chooseCombatAction(self, npc, options.preferredActions);
      this.steerForCombat(self, npc, actionId);
      const shouldHoldDamage = actionId
        && options.stopDamageBelowHealth !== undefined
        && (COMBAT.actions[actionId].damage ?? 0) > 0
        && npc.health <= options.stopDamageBelowHealth;
      if (actionId && !shouldHoldDamage && isActionReady(self, actionId)) {
        if (COMBAT.actions[actionId].requiresStationary && isMoving(self)) {
          this.targetPoint = null;
          this.sendIdleInput();
          await delay(160);
          continue;
        }
        if (COMBAT.actions[actionId].requiresStationary) {
          this.targetPoint = null;
          this.sprint = false;
          this.sendIdleInput();
        }
        this.useCombatAbility(actionId, { kind: "npc", id: npcId });
        if (COMBAT.actions[actionId].requiresStationary) {
          await delay(Math.min(COMBAT.actions[actionId].castTimeMs + 160, 4200));
          continue;
        }
      }
      await delay(220);
    }

    throw new Error(`${this.name} timed out fighting ${npcId}`);
  }

  runAmbientDecision(now = Date.now()) {
    const observation = this.observe();
    if (!observation || now < this.nextAmbientDecisionAt) return;
    this.nextAmbientDecisionAt = now + AGENT.decisionIntervalMs + randomRange(0, 260);

    const nearestQuestNpc = observation.nearbyNpcs.find((npc) => npc.role === "quest_giver" && npc.distance < 3.2);
    if (nearestQuestNpc && Math.random() < 0.18) {
      this.targetPoint = null;
      this.yaw = Math.atan2(nearestQuestNpc.x - observation.self.x, nearestQuestNpc.z - observation.self.z);
      this.room?.send("interact", { npcId: nearestQuestNpc.id });
      this.nextChatAt = Math.max(this.nextChatAt, now + 2500);
      return;
    }

    const nearest = observation.nearbyPlayers[0];
    if (nearest && nearest.distance < 4.4) {
      this.targetPoint = null;
      this.yaw = Math.atan2(nearest.x - observation.self.x, nearest.z - observation.self.z);
      this.maybeChat(observation, now, nearest.name);
      if (Math.random() < 0.08) this.jumpUntil = now + 260;
      return;
    }

    if (!this.targetPoint || distanceToPoint(observation.self, this.targetPoint) < 1.3) {
      this.targetPoint = chooseTownPoint();
      this.sprint = false;
    }

    if (Math.random() < 0.025) this.jumpUntil = now + 260;
    this.maybeChat(observation, now);
  }

  private installRoomHandlers(room: Room<RuntimeState>) {
    room.onStateChange((state) => {
      const nextPlayers = new Map<string, PlayerSnapshot>();
      state.players?.forEach((player: RuntimePlayer, sessionId: string) => {
        nextPlayers.set(sessionId, snapshotPlayer(sessionId, player));
      });
      this.players = nextPlayers;

      const nextNpcs = new Map<string, NpcSnapshot>();
      state.npcs?.forEach((npc: RuntimeNpc, id: string) => {
        nextNpcs.set(id, snapshotNpc(id, npc));
      });
      this.npcs = nextNpcs;
    });

    room.onMessage("chat", (message: ChatMessage) => {
      this.recentChat = [...this.recentChat.slice(-12), message];
    });

    room.onMessage("lootWindow", (message: LootWindow) => {
      if (message.items.length > 0) this.lootNpc(message.npcId);
    });
    room.onMessage("closeLootWindow", () => undefined);
    room.onMessage("combatEvent", (event: CombatEvent) => {
      this.recordCombatEvent(event);
    });
    room.onMessage("experienceEvent", () => undefined);
    room.onMessage("persistenceStatus", () => undefined);
    room.onMessage("potionShopPurchaseResult", (message: PotionShopPurchaseResult) => {
      this.potionShopResults = [...this.potionShopResults.slice(-8), message];
    });
    room.onMessage("trashVendorSellResult", (message: TrashVendorSellResult) => {
      this.trashVendorResults = [...this.trashVendorResults.slice(-8), message];
    });
    room.onMessage("questOffer", () => undefined);
    room.onMessage("questStatus", () => undefined);
    room.onMessage("questTurnIn", () => undefined);
    room.onMessage("sessionReplaced", () => undefined);
    room.onMessage("traitUpdateResult", () => undefined);

    room.onLeave(() => {
      this.connected = false;
      this.stop();
    });
  }

  private async requestWalletChallenge() {
    const response = await fetch(new URL("/wallet-auth-challenge", this.httpServerUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: this.account.address }),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      nonce?: string;
      message?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok || !payload.nonce || !payload.message) {
      throw new Error(payload?.error || "wallet auth challenge failed");
    }
    return {
      nonce: payload.nonce,
      message: payload.message,
    };
  }

  private tick() {
    if (!this.room || !this.connected) return;
    const self = this.getSelf();
    if (!self) return;
    const input = this.buildInput(self, Date.now());
    this.room.send("input", input);
  }

  private buildInput(self: PlayerSnapshot, now: number): ClientInput {
    let x = 0;
    let z = 0;

    if (this.targetPoint) {
      const dx = this.targetPoint.x - self.x;
      const dz = this.targetPoint.z - self.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.2) {
        x = dx / length;
        z = dz / length;
        this.yaw = Math.atan2(x, z);
      }
    }

    return {
      seq: ++this.seq,
      x,
      z,
      yaw: this.yaw,
      sprint: this.sprint,
      jump: now < this.jumpUntil,
    };
  }

  private recordCombatEvent(event: CombatEvent) {
    this.recentCombatEvents = [...this.recentCombatEvents.slice(-199), event];
    if (!this.combatLogPath) return;
    if (combatLoggedEventIds.has(event.id)) return;
    combatLoggedEventIds.add(event.id);
    if (combatLoggedEventIds.size > COMBAT_LOGGED_EVENT_ID_LIMIT) {
      const oldestEventId = combatLoggedEventIds.values().next().value;
      if (oldestEventId) combatLoggedEventIds.delete(oldestEventId);
    }

    const self = this.getSelf();
    const entry = {
      receivedAt: Date.now(),
      agentName: this.name,
      walletAddress: this.account.address,
      sessionId: this.sessionId,
      self: self
        ? {
            health: self.health,
            maxHealth: self.maxHealth,
            mana: self.mana,
            maxMana: self.maxMana,
            x: self.x,
            z: self.z,
          }
        : null,
      event,
    };
    void appendFile(this.combatLogPath, `${JSON.stringify(entry)}\n`, "utf8").catch((error) => {
      if (this.combatLogFailed) return;
      this.combatLogFailed = true;
      this.log(`combat log write failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private sendIdleInput() {
    const self = this.getSelf();
    if (!this.room || !self) return;
    this.room.send("input", {
      seq: ++this.seq,
      x: 0,
      z: 0,
      yaw: this.yaw || self.yaw,
      sprint: false,
      jump: false,
    } satisfies ClientInput);
  }

  private steerForCombat(self: PlayerSnapshot, npc: NpcSnapshot, actionId: CombatActionId | null) {
    this.yaw = Math.atan2(npc.x - self.x, npc.z - self.z);
    const distance = distance2d(self, npc);
    const action = actionId ? COMBAT.actions[actionId] : null;
    if (action && action.requiresStationary && distance >= action.minRange && distance <= action.maxRange) {
      this.targetPoint = null;
      this.sprint = false;
      return;
    }

    if (actionId === "shoot" || actionId === "signalShot" || actionId === "multishot" || actionId === "fireblast" || actionId === "iceBlast") {
      const minComfortRange = Math.max(7.5, action?.minRange ?? 0);
      const maxComfortRange = Math.min(action?.maxRange ?? RANGED_RANGE, RANGED_RANGE + 2);
      if (distance < minComfortRange) {
        const away = unitAwayFrom(npc, self);
        this.targetPoint = { x: self.x + away.x * 4, z: self.z + away.z * 4 };
        this.sprint = true;
        return;
      }
      if (distance > maxComfortRange) {
        this.targetPoint = { x: npc.x, z: npc.z };
        this.sprint = true;
        return;
      }
      this.targetPoint = null;
      this.sprint = false;
      return;
    }

    if (distance > MELEE_RANGE) {
      this.targetPoint = { x: npc.x, z: npc.z };
      this.sprint = true;
      return;
    }
    this.targetPoint = null;
    this.sprint = false;
  }

  private kiteAwayFromNpc(self: PlayerSnapshot, npc: NpcSnapshot) {
    this.yaw = Math.atan2(npc.x - self.x, npc.z - self.z);
    const away = unitAwayFrom(npc, self);
    this.targetPoint = { x: self.x + away.x * 7, z: self.z + away.z * 7 };
    this.sprint = true;
  }

  private trySelfHeal(self: PlayerSnapshot) {
    if (self.health > self.maxHealth * 0.78) return false;
    if (!canUseAction(self, "heal")) return false;
    if (isMoving(self)) {
      this.targetPoint = null;
      this.sendIdleInput();
      return true;
    }
    this.useCombatAbility("heal", { kind: "player", id: self.sessionId });
    return true;
  }

  private tryHealAlly(self: PlayerSnapshot, sessionId: string, healthRatioThreshold = 0.74) {
    const ally = this.players.get(sessionId);
    if (!ally || ally.health <= 0 || ally.health > ally.maxHealth * healthRatioThreshold) return false;
    if (distance2d(self, ally) > COMBAT.actions.heal.maxRange) return false;
    if (!canUseAction(self, "heal")) return false;
    if (isMoving(self)) {
      this.targetPoint = null;
      this.sendIdleInput();
      return true;
    }
    this.yaw = Math.atan2(ally.x - self.x, ally.z - self.z);
    this.useCombatAbility("heal", { kind: "player", id: ally.sessionId });
    return true;
  }

  private tryHealLowestAlly(self: PlayerSnapshot, healthRatioThreshold = 0.74) {
    const ally = Array.from(this.players.values())
      .filter((player) => (
        player.sessionId !== self.sessionId
        && player.health > 0
        && player.health <= player.maxHealth * healthRatioThreshold
        && distance2d(self, player) <= COMBAT.actions.heal.maxRange
      ))
      .sort((left, right) => (left.health / left.maxHealth) - (right.health / right.maxHealth))[0];
    return ally ? this.tryHealAlly(self, ally.sessionId, healthRatioThreshold) : false;
  }

  private tryMoveTowardAlly(self: PlayerSnapshot, sessionId: string, maxRange: number) {
    const ally = this.players.get(sessionId);
    if (!ally || ally.health <= 0) return false;
    if (distance2d(self, ally) <= maxRange) return false;
    this.yaw = Math.atan2(ally.x - self.x, ally.z - self.z);
    this.targetPoint = { x: ally.x, z: ally.z };
    this.sprint = true;
    return true;
  }

  private useCombatConsumables(
    self: PlayerSnapshot,
    options: { preferMana?: boolean; healthPotionThresholdRatio?: number } = {},
  ) {
    if (
      options.preferMana
      && this.tryUseCombatConsumable(self, "blue-juice", "potion", self.maxMana * 0.75, 14_500, "mana")
    ) {
      return true;
    }
    return this.tryUseCombatConsumable(
      self,
      "red-juice",
      "potion",
      self.maxHealth * (options.healthPotionThresholdRatio ?? 0.9),
      14_500,
      "health",
    )
      || this.tryUseCombatConsumable(self, "field-snack", "food", self.maxHealth * 0.95, 11_500, "health")
      || this.tryUseCombatConsumable(self, "blue-juice", "potion", self.maxMana * 0.45, 14_500, "mana")
      || this.tryUseElixirBuff(self, "exit-liquidity-elixir", "exit-liquidity")
      || this.tryUseElixirBuff(self, "hopium-elixir", "hopium")
      || this.tryUseElixirBuff(self, "mev-bot-elixir", "mev-bot");
  }

  private tryUseCombatConsumable(
    self: PlayerSnapshot,
    itemId: ItemId,
    cooldownKey: string,
    threshold: number,
    cooldownMs: number,
    resource: "health" | "mana",
  ) {
    const value = resource === "health" ? self.health : self.mana;
    if (value <= 0 || value >= threshold || !hasInventoryItem(self, itemId)) return false;
    const now = Date.now();
    if (now - (this.consumableAttemptedAt.get(cooldownKey) ?? 0) < cooldownMs) return false;
    this.consumableAttemptedAt.set(cooldownKey, now);
    this.useItem(itemId);
    return true;
  }

  private tryUseElixirBuff(self: PlayerSnapshot, itemId: ItemId, buffId: string) {
    if (self.health <= 0 || hasActiveBuff(self, buffId) || !hasInventoryItem(self, itemId)) return false;
    const now = Date.now();
    if (now - (this.consumableAttemptedAt.get("elixir") ?? 0) < 14_500) return false;
    this.consumableAttemptedAt.set("elixir", now);
    this.useItem(itemId);
    return true;
  }

  private getDangerYieldReason(
    self: PlayerSnapshot,
    options: {
      dangerRadius?: number;
      maxSelfAttackers?: number;
      maxCloseHostiles?: number;
      dangerHealthRatio?: number;
    },
    targetNpcId?: string,
  ) {
    if (self.health <= 0) return "health is 0";

    const danger = this.getCombatDanger(self, targetNpcId, options.dangerRadius ?? 8);
    const maxSelfAttackers = options.maxSelfAttackers ?? 1;
    const maxCloseHostiles = options.maxCloseHostiles ?? 2;
    const dangerHealthRatio = options.dangerHealthRatio ?? 0.42;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 0;

    if (danger.selfAttackers > maxSelfAttackers) {
      return `${danger.selfAttackers} NPCs are targeting me`;
    }
    if (danger.closeHostiles > maxCloseHostiles) {
      return `${danger.closeHostiles} hostile NPCs are close`;
    }
    if (danger.selfAttackers > 0 && healthRatio <= dangerHealthRatio) {
      return `health is ${Math.ceil(healthRatio * 100)}% while under attack`;
    }
    if (danger.closeHostiles > 0 && healthRatio <= Math.min(0.3, dangerHealthRatio)) {
      return `health is ${Math.ceil(healthRatio * 100)}% near hostile NPCs`;
    }
    return "";
  }

  private getCombatDanger(self: PlayerSnapshot, targetNpcId: string | undefined, radius: number) {
    let selfAttackers = 0;
    let closeHostiles = 0;
    this.npcs.forEach((npc) => {
      if (!isAliveNpc(npc) || npc.isImmortal) return;
      const distance = distance2d(self, npc);
      if (npc.aggroTargetId === self.sessionId) selfAttackers += 1;
      if (npc.id === targetNpcId) return;
      if (distance > radius) return;
      if (getNpcDisposition(npc) === "hostile") closeHostiles += 1;
    });
    return { selfAttackers, closeHostiles };
  }

  private async waitForNpc(npcId: string, options: WaitOptions = {}) {
    await this.waitFor(() => Boolean(this.getNpc(npcId)), options, `npc ${npcId}`);
    const npc = this.getNpc(npcId);
    if (!npc) throw new Error(`NPC ${npcId} disappeared`);
    return npc;
  }

  private async moveThroughNpcApproach(
    npcId: string,
    finalRange: number,
    startedAt: number,
    timeoutMs: number,
    options: MoveOptions,
  ) {
    const points = getNpcApproachPoints(npcId);
    if (points.length === 0) return;
    const initialSelf = this.getSelf();
    const initialNpc = this.getNpc(npcId);
    if (initialSelf && initialNpc) {
      const npcDistance = distance2d(initialSelf, initialNpc);
      const nearestApproachDistance = Math.min(...points.map((point) => distanceToPoint(initialSelf, point)));
      if (npcDistance <= finalRange + 1 || npcDistance + 4 < nearestApproachDistance) return;
    }
    const routePoints = this.getRoutePointsFromCurrentPosition(points, finalRange);
    for (let index = 0; index < routePoints.length; index += 1) {
      const point = routePoints[index]!;
      const self = this.getSelf();
      const npc = this.getNpc(npcId);
      if (self && npc && distance2d(self, npc) <= finalRange + 1) return;
      if (self && npc && distance2d(self, npc) + 4 < distanceToPoint(self, point)) return;
      if (self && distanceToPoint(self, point) <= 6) continue;
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 5000) return;
      const pointRange = index === routePoints.length - 1
        ? Math.max(finalRange + 0.5, 3.5)
        : 6;
      await this.moveToPoint(point, {
        ...options,
        range: pointRange,
        timeoutMs: Math.min(remainingMs, 35_000),
      });
    }
  }

  private getRoutePointsFromCurrentPosition(points: Point[], range: number) {
    const self = this.getSelf();
    if (!self || points.length < 2) return points;

    const distances = points.map((point) => distanceToPoint(self, point));
    const nearestIndex = distances.reduce((bestIndex, distance, index) => (
      distance < distances[bestIndex] ? index : bestIndex
    ), 0);
    const nearestDistance = distances[nearestIndex] ?? Infinity;
    const firstDistance = distances[0] ?? Infinity;
    if (nearestIndex <= 0 || nearestDistance > 35 || nearestDistance + 8 >= firstDistance) return points;

    const startIndex = nearestDistance <= range + 2 ? nearestIndex + 1 : nearestIndex;
    return points.slice(Math.min(startIndex, points.length - 1));
  }

  private async waitFor(predicate: () => boolean, options: WaitOptions, label: string) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const intervalMs = options.intervalMs ?? 100;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (predicate()) return;
      await delay(intervalMs);
    }
    throw new Error(`${this.name} timed out waiting for ${label}`);
  }

  private maybeChat(observation: AgentObservation, now: number, nearbyName?: string) {
    if (!this.chatEnabled || !this.room) return;
    if (now < this.nextChatAt) return;

    const text = chooseAmbientLine(observation, this.style, nearbyName).slice(0, CHAT.maxLength);
    this.room.send("chat", { text });
    this.nextChatAt = now + 12000 + randomRange(0, 10000);
  }

  private stop() {
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = null;
  }

  private respawnIfDefeated(self: PlayerSnapshot, now = Date.now()) {
    if (self.health > 0 || now - this.lastRespawnAt < 750) return;
    this.lastRespawnAt = now;
    this.respawn();
  }
}

function snapshotPlayer(sessionId: string, player: RuntimePlayer): PlayerSnapshot {
  return {
    sessionId,
    name: player.name,
    identityType: player.identityType,
    isAgent: Boolean(player.isAgent),
    walletAddress: player.walletAddress,
    agentStatusAction: player.agentStatusAction || "",
    agentStatusThought: player.agentStatusThought || "",
    agentStatusObjective: player.agentStatusObjective || "",
    agentStatusQuest: player.agentStatusQuest || "",
    agentStatusUpdatedAt: Number(player.agentStatusUpdatedAt) || 0,
    avatarSeed: player.avatarSeed,
    appearanceTraits: parseMferAppearanceTraitsJson(player.appearanceTraitsJson),
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    season0Points: player.season0Points ?? 0,
    season0DailyPoints: player.season0DailyPoints ?? 0,
    health: player.health,
    maxHealth: player.maxHealth,
    healthRegenPer5: player.healthRegenPer5,
    mana: player.mana,
    maxMana: player.maxMana,
    manaRegenPer5: player.manaRegenPer5,
    walkSpeed: player.walkSpeed,
    runSpeed: player.runSpeed,
    strength: player.strength,
    dexterity: player.dexterity,
    magic: player.magic,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    animation: player.animation,
    emote: player.emote,
    emoteStartedAt: player.emoteStartedAt,
    emoteEndsAt: player.emoteEndsAt,
    lastSeq: player.lastSeq,
    attackReadyAt: player.attackReadyAt,
    shootReadyAt: player.shootReadyAt,
    signalShotReadyAt: player.signalShotReadyAt,
    fireblastReadyAt: player.fireblastReadyAt,
    frostNovaReadyAt: player.frostNovaReadyAt,
    healReadyAt: player.healReadyAt,
    tauntReadyAt: player.tauntReadyAt,
    whirlwindReadyAt: player.whirlwindReadyAt,
    multishotReadyAt: player.multishotReadyAt,
    iceBlastReadyAt: player.iceBlastReadyAt,
    castingAction: player.castingAction,
    castStartedAt: player.castStartedAt,
    castEndsAt: player.castEndsAt,
    lastCastAt: player.lastCastAt,
    lastDamagedAt: player.lastDamagedAt,
    frozenUntil: player.frozenUntil,
    quests: snapshotQuests(player.quests),
    inventory: snapshotInventory(player.inventory),
    equipment: snapshotEquipment(player.equipment),
    talents: snapshotTalents(player.talents),
    activeBuffs: snapshotBuffs(player.activeBuffs),
  };
}

function snapshotNpc(id: string, npc: RuntimeNpc): NpcSnapshot {
  return {
    id,
    name: npc.name,
    role: npc.role,
    model: npc.model,
    portraitImage: npc.portraitImage,
    avatarSeed: npc.avatarSeed,
    health: npc.health,
    maxHealth: npc.maxHealth,
    isImmortal: npc.isImmortal,
    x: npc.x,
    y: npc.y,
    z: npc.z,
    yaw: npc.yaw,
    animation: npc.animation,
    dialogue: npc.dialogue,
    questId: npc.questId,
    defeatedAt: npc.defeatedAt,
    despawnAt: npc.despawnAt,
    frozenUntil: npc.frozenUntil,
    slowedUntil: npc.slowedUntil,
    aggroTargetId: npc.aggroTargetId,
    hasLoot: npc.hasLoot,
  };
}

function snapshotQuests(quests: RuntimeQuestCollection | undefined): QuestSnapshot[] {
  const next: QuestSnapshot[] = [];
  quests?.forEach((quest, id) => {
    next.push({
      id: (quest.id || id) as QuestSnapshot["id"],
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function snapshotInventory(inventory: RuntimeInventoryCollection | undefined): InventoryItemSnapshot[] {
  const next: InventoryItemSnapshot[] = [];
  inventory?.forEach((item, id) => {
    next.push({
      id: (item.id || id) as InventoryItemSnapshot["id"],
      chainTokenId: item.chainTokenId,
      chainTier: item.chainTier,
      count: item.count,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function snapshotEquipment(equipment: RuntimeEquipmentCollection | undefined): EquipmentSlotSnapshot[] {
  const next: EquipmentSlotSnapshot[] = [];
  equipment?.forEach((slot, id) => {
    next.push({
      slot: (slot.slot || id) as EquipmentSlotSnapshot["slot"],
      itemId: slot.itemId,
      chainTokenId: slot.chainTokenId,
      chainTier: slot.chainTier,
    });
  });
  return next.sort((left, right) => left.slot.localeCompare(right.slot));
}

function snapshotTalents(talents: RuntimeTalentCollection | undefined): TalentRankSnapshot[] {
  const next: TalentRankSnapshot[] = [];
  talents?.forEach((talent, id) => {
    next.push({
      id: (talent.id || id) as TalentRankSnapshot["id"],
      tree: talent.tree,
      nodeId: talent.nodeId,
      rank: talent.rank,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function snapshotBuffs(activeBuffs: RuntimeBuffCollection | undefined): ActiveBuffSnapshot[] {
  const next: ActiveBuffSnapshot[] = [];
  activeBuffs?.forEach((buff) => next.push({ ...buff }));
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

function chooseCombatAction(self: PlayerSnapshot, npc: NpcSnapshot, preferredActions: CombatActionId[] = []) {
  const distance = distance2d(self, npc);
  const defaults: CombatActionId[] = self.level >= 2 ? ["shoot", "attack"] : ["attack"];
  const actions = preferredActions.length ? preferredActions : defaults;
  for (const actionId of actions) {
    const action = COMBAT.actions[actionId];
    if (!action) continue;
    if (!canUseAction(self, actionId)) continue;
    if (distance < action.minRange || distance > action.maxRange) continue;
    if (self.mana < action.manaCost) continue;
    return actionId;
  }
  return distance <= COMBAT.actions.attack.maxRange && canUseAction(self, "attack") ? "attack" : null;
}

function canUseAction(self: PlayerSnapshot, actionId: CombatActionId) {
  return isCombatActionUnlocked(actionId, self.level, self.talents) && isActionReady(self, actionId);
}

function isActionReady(self: PlayerSnapshot, actionId: CombatActionId) {
  const key = `${actionId}ReadyAt` as keyof PlayerSnapshot;
  const readyAt = typeof self[key] === "number" ? self[key] as number : 0;
  return Date.now() >= readyAt && !self.castingAction;
}

function hasInventoryItem(self: PlayerSnapshot, itemId: ItemId) {
  return self.inventory.some((item) => item.id === itemId && item.count > 0);
}

function hasActiveBuff(self: PlayerSnapshot, buffId: string) {
  return self.activeBuffs.some((buff) => buff.id === buffId && buff.expiresAt > Date.now());
}

function isAliveNpc(npc: NpcSnapshot) {
  return npc.health > 0 && npc.defeatedAt <= 0;
}

function isMoving(self: PlayerSnapshot) {
  return self.animation === "walk" || self.animation === "run" || self.animation === "jump";
}

function getQuestGiverNpcId(questId: QuestId) {
  return ({
    "mfer-beginnings": "og-mfer",
    "set-your-traits": "traits-mfer",
    "dao-tour": "dao-mfer",
    "fountain-vibes": "fountain-mfer",
    "sealed-note": "og-mfer",
    "farm-road-handoff": "wearables-mfer",
    "ask-mfergpt": "wearables-mfer",
    "mfergpt-checkin": "mfergpt",
    "mfergpt-daily-signal": "mfergpt",
    "tweet-town-link": "mfergpt",
    "boar-bristle-cull": "hogwatch-mfer",
    "feral-farmers": "hogwatch-mfer",
    "hog-livers": "hogwatch-mfer",
    "field-camp-delivery": "hogwatch-mfer",
    "route-patrol-daily": "field-guide-mfer",
    "hog-loop": "pen-keeper-mfer",
    "ridge-dispatch": "field-guide-mfer",
    "signal-scraps": "ridge-guide-mfer",
    "cut-the-static": "beacon-keeper-mfer",
    "baron-of-static": "beacon-keeper-mfer",
    "ogre-raid-daily": "beacon-keeper-mfer",
  } satisfies Record<QuestId, string>)[questId];
}

function chooseTownPoint(): Point {
  const margin = 2.5;
  return {
    x: randomRange(PLAZA_BOUNDS.minX + margin, PLAZA_BOUNDS.maxX - margin),
    z: randomRange(PLAZA_BOUNDS.minZ + margin, PLAZA_BOUNDS.maxZ - margin),
  };
}

function chooseAmbientLine(observation: AgentObservation, style: AmbientStyle, nearbyName?: string) {
  if (nearbyName) {
    return pickLine([
      `gm ${nearbyName}`,
      `${nearbyName} made it out here`,
      "good to see a live mfer",
    ]);
  }

  const zoneLines = getZoneLines(observation.self);
  const styleLines = style === "builder" ? BUILDER_LINES : style === "lurker" ? LURKER_LINES : GLOBAL_LINES;
  const pool = [
    ...GLOBAL_LINES,
    ...zoneLines,
    ...styleLines,
    observation.nearbyPlayers.length > 1 ? "plaza's got bodies today" : "",
    observation.nearbyNpcs.length > 0 ? `checking in with ${observation.nearbyNpcs[0].name}` : "",
  ].filter(Boolean);
  return pickLine(pool);
}

function getZoneLines(point: Point) {
  if (point.x < -58 && point.z > 58) return FARM_LINES;
  if (point.x > 86 && point.z < -42) return RIDGE_LINES;
  if (Math.abs(point.x) < 24 && point.z > 18) return MARKET_LINES;
  if (Math.hypot(point.x, point.z) < 28) return PLAZA_LINES;
  return GLOBAL_LINES;
}

function getAgentStyle(seed: number): AmbientStyle {
  const styles: AmbientStyle[] = ["lurker", "builder", "drifter"];
  return styles[Math.abs(seed) % styles.length] ?? "drifter";
}

function pickLine(lines: readonly string[]) {
  return lines[Math.floor(Math.random() * lines.length)] || "gm mfers";
}

function cleanName(value: string) {
  return value.replace(/[^\w .$-]/g, "").trim().slice(0, 18) || "mfer-agent";
}

function distance2d(a: Pick<PlayerSnapshot | NpcSnapshot, "x" | "z">, b: Pick<PlayerSnapshot | NpcSnapshot, "x" | "z">) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distanceToPoint(player: Pick<PlayerSnapshot, "x" | "z">, point: Point) {
  return Math.hypot(player.x - point.x, player.z - point.z);
}

function makeSidestepPoint(self: Pick<PlayerSnapshot, "x" | "z">, target: Point, index: number): Point {
  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const length = Math.hypot(dx, dz) || 1;
  const forwardX = dx / length;
  const forwardZ = dz / length;
  const side = index % 2 === 0 ? 1 : -1;
  return {
    x: self.x + forwardX * 1.2 + (-forwardZ) * side * 2.2,
    z: self.z + forwardZ * 1.2 + forwardX * side * 2.2,
  };
}

function makeNpcOrbitPoint(npc: Pick<NpcSnapshot, "x" | "z">, self: Pick<PlayerSnapshot, "x" | "z">, index: number, radius: number): Point {
  const baseAngle = Math.atan2(self.z - npc.z, self.x - npc.x);
  const offsets = [0.9, -0.9, 1.8, -1.8, Math.PI];
  const angle = baseAngle + (offsets[index % offsets.length] ?? 0);
  return {
    x: npc.x + Math.cos(angle) * radius,
    z: npc.z + Math.sin(angle) * radius,
  };
}

function getNpcApproachPoints(npcId: string): Point[] {
  return ({
    "og-mfer": [{ x: -4.2, z: 3.9 }],
    "dao-mfer": [{ x: 0, z: 0 }, { x: 12, z: -7.4 }],
    "fountain-mfer": [{ x: -2.4, z: 4.2 }],
    "wearables-mfer": [{ x: -18, z: 0 }, { x: -14.8, z: 12.5 }],
    "traits-mfer": [{ x: 0, z: 20 }, { x: -3.7, z: 25.4 }],
    "swap-mfer": [{ x: 0, z: 20 }, { x: 0, z: 25.4 }],
    "crypto-mfer": [{ x: 0, z: 20 }, { x: 3.7, z: 25.4 }],
    "potion-mfer": [{ x: 0, z: 20 }, { x: 7.4, z: 25.4 }],
    mfergpt: [{ x: -2.4, z: 4.2 }, { x: 6.8, z: -5.2 }],
    "hogwatch-mfer": [{ x: 0, z: 29 }, { x: -31, z: 60 }, { x: -64.5, z: 64.5 }],
    "field-guide-mfer": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
    "pen-keeper-mfer": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -121, z: 123 }, { x: -116, z: 123 }, { x: -112, z: 124 }, { x: -111, z: 130 }, { x: -111, z: 136 }],
    "ridge-guide-mfer": [{ x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
    "beacon-keeper-mfer": [{ x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }, { x: 117.6, z: -91.2 }],
  } satisfies Partial<Record<string, Point[]>>)[npcId] ?? [];
}

function unitAwayFrom(source: Point, target: Point) {
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function formatPoint(point: Point) {
  return `${point.x.toFixed(1)},${point.z.toFixed(1)}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GLOBAL_LINES = [
  "gm mfers",
  "coffee's cold",
  "just posting",
  "cc0 town still standing",
  "mfers do what they want",
] as const;
const PLAZA_LINES = [
  "fountain's still the spot",
  "quiet plaza today",
  "someone left a mug by the chairs",
] as const;
const MARKET_LINES = [
  "drip check",
  "good hats today",
  "market's awake",
] as const;
const FARM_LINES = [
  "road's open but it still smells like hogs",
  "loop farm again",
  "hog loop never ends",
] as const;
const RIDGE_LINES = [
  "ridge is buzzing",
  "relay sounds wrong",
  "static's loud uptrail",
] as const;
const BUILDER_LINES = [
  "ship it",
  "deploy shed looks busy",
  "ai agents are mfers",
] as const;
const LURKER_LINES = [
  "late posts",
  "no roadmap",
  "officially unofficial",
] as const;

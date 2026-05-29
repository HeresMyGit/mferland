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
  getQuestTurnInNpcId,
  normalizeAvatarSeed,
  parseMferAppearanceTraitsJson,
  stableHash,
  type ActiveBuffSnapshot,
  type AgentObservation,
  type ChatMessage,
  type ClientInput,
  type CombatActionId,
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
  type TalentRankSnapshot,
  type TargetSelection,
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
  chatEnabled?: boolean;
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
};

type FightOptions = WaitOptions & {
  preferredActions?: CombatActionId[];
};

type AmbientStyle = "lurker" | "builder" | "drifter";

const DEFAULT_WAIT_TIMEOUT_MS = 15_000;
const DEFAULT_MOVE_TIMEOUT_MS = 45_000;
const DEFAULT_FIGHT_TIMEOUT_MS = 90_000;
const MELEE_RANGE = 3.4;
const RANGED_RANGE = 12;

export class MferlandAgentClient {
  private readonly client: Client;
  private readonly httpServerUrl: string;
  private readonly inviteCode: string;
  private readonly account: PrivateKeyAccount;
  private readonly name: string;
  private readonly avatarSeed: number;
  private readonly createCharacter: boolean;
  private readonly chatEnabled: boolean;
  private readonly log: (message: string) => void;
  private readonly style: AmbientStyle;
  private room: Room<RuntimeState> | null = null;
  private players = new Map<string, PlayerSnapshot>();
  private npcs = new Map<string, NpcSnapshot>();
  private recentChat: ChatMessage[] = [];
  private potionShopResults: PotionShopPurchaseResult[] = [];
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

  constructor(options: MferlandAgentOptions) {
    const wsServerUrl = toWsServerUrl(options.serverUrl);
    this.client = new Client(wsServerUrl);
    this.httpServerUrl = toHttpServerUrl(options.serverUrl);
    this.inviteCode = options.inviteCode;
    this.account = options.account;
    this.name = cleanName(options.name);
    this.avatarSeed = normalizeAvatarSeed(options.avatarSeed ?? stableHash(`wallet-agent:${this.account.address}:${this.name}`));
    this.createCharacter = options.createCharacter ?? true;
    this.chatEnabled = options.chatEnabled ?? true;
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
      .filter((player) => player.distance <= AGENT.observationRadius)
      .sort((a, b) => a.distance - b.distance);

    const nearbyNpcs = Array.from(this.npcs.values())
      .map((npc) => ({
        ...npc,
        distance: distance2d(self, npc),
      }))
      .filter((npc) => npc.distance <= AGENT.observationRadius)
      .sort((a, b) => a.distance - b.distance);

    return {
      self,
      nearbyPlayers,
      nearbyNpcs,
      recentChat: this.recentChat.slice(-8),
      bounds: PLAZA_BOUNDS,
      availableActions: ["move", "look", "jump", "sprint", "chat", "interact", ...(Object.keys(COMBAT.actions) as CombatActionId[])],
    };
  }

  async connect() {
    const challenge = await this.requestWalletChallenge();
    const signature = await this.account.signMessage({ message: challenge.message });
    const room = await this.client.joinOrCreate<RuntimeState>(ROOM_NAME, {
      name: this.name,
      identityType: "wallet",
      walletAddress: this.account.address,
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
    this.targetPoint = point;
    this.sprint = options.sprint ?? true;
    try {
      await this.waitFor(() => {
        const self = this.getSelf();
        if (self) this.respawnIfDefeated(self);
        return Boolean(self && distanceToPoint(self, point) <= range);
      }, { timeoutMs, intervalMs: options.intervalMs }, `move to ${formatPoint(point)}`);
    } catch (error) {
      const self = this.getSelf();
      throw new Error(`${error instanceof Error ? error.message : String(error)}${self ? ` from ${formatPoint(self)}` : ""}`);
    }
    this.targetPoint = null;
    this.sprint = false;
    this.sendIdleInput();
  }

  async moveAlong(points: Point[], options: MoveOptions = {}) {
    for (const point of points) {
      await this.moveToPoint(point, options);
    }
  }

  async moveToNpc(npcId: string, options: MoveOptions = {}) {
    const range = options.range ?? 2.7;
    const timeoutMs = options.timeoutMs ?? DEFAULT_MOVE_TIMEOUT_MS;
    const startedAt = Date.now();
    this.sprint = options.sprint ?? true;
    while (Date.now() - startedAt < timeoutMs) {
      const self = this.getSelf();
      const npc = this.getNpc(npcId);
      if (self) this.respawnIfDefeated(self);
      if (self && npc && distance2d(self, npc) <= range) {
        this.targetPoint = null;
        this.sprint = false;
        this.sendIdleInput();
        return;
      }
      if (npc) this.targetPoint = { x: npc.x, z: npc.z };
      await delay(options.intervalMs ?? 100);
    }
    const self = this.getSelf();
    throw new Error(`${this.name} timed out moving to npc ${npcId}${self ? ` from ${formatPoint(self)}` : ""}`);
  }

  async interactWithNpc(npcId: string) {
    await this.moveToNpc(npcId, { range: 3 });
    this.room?.send("interact", { npcId });
    await delay(250);
  }

  async acceptQuest(questId: QuestId, npcId?: string) {
    if (this.hasCompletedQuest(questId) || this.hasActiveOrReadyQuest(questId)) return;
    const giverNpcId = npcId ?? getQuestGiverNpcId(questId);
    await this.interactWithNpc(giverNpcId);
    this.room?.send("acceptQuest", { questId, npcId: giverNpcId });
    await this.waitFor(() => Boolean(this.getQuest(questId)), { timeoutMs: DEFAULT_WAIT_TIMEOUT_MS }, `accept ${questId}`);
  }

  async completeQuest(questId: QuestId, npcId = getQuestTurnInNpcId(questId)) {
    if (this.hasCompletedQuest(questId)) return;
    await this.interactWithNpc(npcId);
    this.room?.send("completeQuest", { questId, npcId });
    await this.waitFor(() => this.hasCompletedQuest(questId), { timeoutMs: DEFAULT_WAIT_TIMEOUT_MS }, `complete ${questId}`);
  }

  cancelQuest(questId: QuestId) {
    this.room?.send("cancelQuest", { questId });
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

  lootNpc(npcId: string, itemId?: ItemId) {
    this.room?.send("lootCorpse", { npcId, itemId });
  }

  async openStore(npcId: string) {
    await this.interactWithNpc(npcId);
  }

  equipItem(itemId: ItemId, chainTokenId?: string) {
    this.room?.send("equipItem", { itemId, chainTokenId });
  }

  useItem(itemId: ItemId, chainTokenId?: string) {
    this.room?.send("useItem", { itemId, chainTokenId });
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

  updateTraits(traits: MferAppearanceTraits = DEFAULT_MFER_APPEARANCE_TRAITS) {
    this.room?.send("updateTraits", {
      traits,
      name: this.name,
      attemptId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        await delay(500);
        continue;
      }

      const actionId = chooseCombatAction(self, npc, options.preferredActions);
      this.steerForCombat(self, npc, actionId);
      if (actionId && isActionReady(self, actionId)) {
        this.useCombatAbility(actionId, { kind: "npc", id: npcId });
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
    room.onMessage("combatEvent", () => undefined);
    room.onMessage("experienceEvent", () => undefined);
    room.onMessage("persistenceStatus", () => undefined);
    room.onMessage("potionShopPurchaseResult", (message: PotionShopPurchaseResult) => {
      this.potionShopResults = [...this.potionShopResults.slice(-8), message];
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
    if (actionId === "shoot" || actionId === "signalShot" || actionId === "multishot") {
      if (distance < 7.5) {
        const away = unitAwayFrom(npc, self);
        this.targetPoint = { x: self.x + away.x * 4, z: self.z + away.z * 4 };
        this.sprint = true;
        return;
      }
      if (distance > RANGED_RANGE + 2) {
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

  private async waitForNpc(npcId: string, options: WaitOptions = {}) {
    await this.waitFor(() => Boolean(this.getNpc(npcId)), options, `npc ${npcId}`);
    const npc = this.getNpc(npcId);
    if (!npc) throw new Error(`NPC ${npcId} disappeared`);
    return npc;
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
    this.room?.send("respawn", {});
  }
}

function snapshotPlayer(sessionId: string, player: RuntimePlayer): PlayerSnapshot {
  return {
    sessionId,
    name: player.name,
    identityType: player.identityType,
    walletAddress: player.walletAddress,
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
    if (distance < action.minRange || distance > action.maxRange) continue;
    if (self.mana < action.manaCost) continue;
    if (action.requiresStationary && isMoving(self)) continue;
    return actionId;
  }
  return distance <= COMBAT.actions.attack.maxRange ? "attack" : null;
}

function isActionReady(self: PlayerSnapshot, actionId: CombatActionId) {
  const key = `${actionId}ReadyAt` as keyof PlayerSnapshot;
  const readyAt = typeof self[key] === "number" ? self[key] as number : 0;
  return Date.now() >= readyAt && !self.castingAction;
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

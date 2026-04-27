import { createServer } from "node:http";
import { Room, Server, type Client } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  CHAT,
  clamp,
  COMBAT,
  FARMER_COMBAT,
  getNpcQuestIds,
  getQuestObjectives,
  getQuestRequiredItemId,
  getQuestRequirement,
  getQuestStartItemId,
  getQuestTurnInNpcId,
  ITEMS,
  LOOT,
  isAttackableNpcRole,
  isQuestAutoReady,
  makeGuestName,
  MAX_PLAYERS,
  PLAYER,
  PLAZA_BOUNDS,
  QUEST_IDS,
  QUESTS,
  RESPAWN_POINT,
  resolveWorldCollision,
  ROOM_NAME,
  sanitizePlayerName,
  SERVER_TICK_RATE,
  shouldConsumeQuestItem,
  stableHash,
  type AnimationState,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCombatAction,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type CombatEvent,
  type CombatActionId,
  type IdentityType,
  type ItemId,
  type JoinOptions,
  type LootWindow,
  type NpcModel,
  type NpcRole,
  type QuestId,
  type QuestStatus,
} from "@mferland/shared";

class QuestState extends Schema {
  @type("string") id: QuestId = "feral-farmers";
  @type("string") status: QuestStatus = "active";
  @type("number") progress = 0;
  @type("number") required = 1;
  @type("string") flags = "";
  @type("number") completedAt = 0;
}

class InventoryItemState extends Schema {
  @type("string") id: ItemId = "hog-liver";
  @type("number") count = 0;
}

class LootItemState extends Schema {
  @type("string") id: ItemId = "hog-liver";
  @type("number") count = 0;
}

class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") identityType: IdentityType = "guest";
  @type("string") walletAddress = "";
  @type("number") avatarSeed = 0;
  @type("number") health = PLAYER.maxHealth;
  @type("number") maxHealth = PLAYER.maxHealth;
  @type("number") healthRegenPer5 = PLAYER.healthRegenPer5;
  @type("number") mana = PLAYER.maxMana;
  @type("number") maxMana = PLAYER.maxMana;
  @type("number") manaRegenPer5 = PLAYER.manaRegenPer5;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("number") verticalVelocity = 0;
  @type("string") animation: AnimationState = "idle";
  @type("number") lastSeq = 0;
  @type("number") attackReadyAt = 0;
  @type("number") shootReadyAt = 0;
  @type("number") fireblastReadyAt = 0;
  @type("string") castingAction: CombatActionId | "" = "";
  @type("number") castStartedAt = 0;
  @type("number") castEndsAt = 0;
  @type("number") lastCastAt = 0;
  @type("number") lastDamagedAt = 0;
  @type("string") castTargetKind = "";
  @type("string") castTargetId = "";
  @type({ map: QuestState }) quests = new MapSchema<QuestState>();
  @type({ map: InventoryItemState }) inventory = new MapSchema<InventoryItemState>();
}

class NpcState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") role: NpcRole = "wanderer";
  @type("string") model: NpcModel = "mfer";
  @type("number") avatarSeed = 0;
  @type("number") health = 100;
  @type("number") maxHealth = 100;
  @type("boolean") isImmortal = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("string") animation: AnimationState = "idle";
  @type("string") dialogue = "";
  @type("string") questId = "";
  @type("number") homeX = 0;
  @type("number") homeZ = 0;
  @type("number") targetX = 0;
  @type("number") targetZ = 0;
  @type("number") leashRadius = 0;
  @type("number") nextDecisionAt = 0;
  @type("number") defeatedAt = 0;
  @type("number") despawnAt = 0;
  @type("number") respawnAt = 0;
  @type("string") aggroTargetId = "";
  @type("number") attackReadyAt = 0;
  @type("string") combatStyle = "";
  @type("boolean") hasLoot = false;
  @type({ map: LootItemState }) loot = new MapSchema<LootItemState>();
}

class TownState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
}

type TrackedInput = ClientInput & {
  receivedAt: number;
};

type PendingCombatImpact = {
  target: CombatEvent["target"];
  sourcePlayerId?: string;
  damage: number;
  impactAt: number;
};

const HOG_COMBAT = {
  leashRange: 24,
  moveSpeed: 4.1,
  meleeRange: 2.15,
  meleeDamage: 5,
  meleeCooldownMs: 1700,
};

class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();
  private readonly pendingCombatImpacts: PendingCombatImpact[] = [];

  onCreate() {
    this.setState(new TownState());
    spawnNpcs(this.state.npcs);
    this.setSimulationInterval((dt) => this.update(dt / 1000), 1000 / SERVER_TICK_RATE);

    this.onMessage("input", (client, message: Partial<ClientInput>) => {
      const input = normalizeInput(message);
      if (!input) return;
      this.inputs.set(client.sessionId, {
        ...input,
        receivedAt: Date.now(),
      });
    });

    this.onMessage("combatAction", (client, message: Partial<ClientCombatAction>) => {
      this.handleCombatAction(client, message);
    });

    this.onMessage("acceptQuest", (client, message: Partial<ClientAcceptQuest>) => {
      this.handleAcceptQuest(client, message);
    });

    this.onMessage("lootCorpse", (client, message: Partial<ClientLootCorpse>) => {
      this.handleLootCorpse(client, message);
    });

    this.onMessage("respawn", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health > 0) return;
      respawnPlayerAtFountain(player);
      this.inputs.delete(client.sessionId);
      this.jumpHeld.set(client.sessionId, false);
    });

    this.onMessage("chat", (client, message: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const text = sanitizeChatText(message?.text);
      if (!text) return;

      const now = Date.now();
      const lastChat = this.lastChatAt.get(client.sessionId) ?? 0;
      if (now - lastChat < CHAT.minIntervalMs) return;
      this.lastChatAt.set(client.sessionId, now);

      const payload: ChatMessage = {
        sessionId: client.sessionId,
        name: player.name,
        identityType: player.identityType,
        text,
        sentAt: now,
      };
      this.broadcast("chat", payload);
    });

    this.onMessage("interact", (client, message: ClientInteract = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const now = Date.now();
      const lastInteract = this.lastInteractAt.get(client.sessionId) ?? 0;
      if (now - lastInteract < 750) return;
      this.lastInteractAt.set(client.sessionId, now);

      const npc = findInteractNpc(player, this.state.npcs, message?.npcId);
      if (!npc) return;

      if (!isNpcAlive(npc)) {
        if (npcHasLoot(npc)) {
          client.send("lootWindow", makeLootWindow(npc));
        }
        return;
      }

      npc.yaw = Math.atan2(player.x - npc.x, player.z - npc.z);
      npc.animation = "idle";

      const payload: ChatMessage = {
        sessionId: npc.id,
        name: npc.name,
        identityType: "npc",
        text: getNpcDialogue(npc, player, now, (questId) => client.send("questOffer", makeQuestOffer(questId, npc))),
        sentAt: now,
      };
      this.broadcast("chat", payload);
    });
  }

  onJoin(client: Client, options?: JoinOptions) {
    const player = new PlayerState();
    const spawn = getSpawnPoint(this.state.players.size);
    const walletAddress =
      typeof options?.walletAddress === "string" ? options.walletAddress.toLowerCase().slice(0, 64) : "";
    const identityType = getIdentityType(options, walletAddress);
    const defaultName = getDefaultName(identityType, walletAddress, client.sessionId);

    player.name = sanitizePlayerName(options?.name, defaultName);
    player.identityType = identityType;
    player.walletAddress = walletAddress;
    player.avatarSeed = Number.isFinite(options?.avatarSeed)
      ? Number(options?.avatarSeed)
      : stableHash(`${client.sessionId}:${player.name}:${walletAddress}`);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.x = spawn.x;
    player.y = 0;
    player.z = spawn.z;
    player.yaw = spawn.yaw;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.jumpHeld.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastInteractAt.delete(client.sessionId);
  }

  private handleCombatAction(client: Client, message: Partial<ClientCombatAction>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.health <= 0) return;

    const actionId = normalizeCombatActionId(message?.actionId);
    if (!actionId) return;

    const action = COMBAT.actions[actionId];
    const now = Date.now();
    if (player.castingAction) return;
    if (getActionReadyAt(player, actionId) > now) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) return;
    if (action.requiresStationary && !isPlayerStationary(player, this.inputs.get(client.sessionId), now)) return;

    const target = findCombatTarget(this.state.npcs, message?.target);
    if (!target) return;
    if (!isNpcAlive(target)) return;

    const distance = distanceToNpc(player, target);
    if (distance < action.minRange || distance > action.maxRange) return;

    player.yaw = Math.atan2(target.x - player.x, target.z - player.z);

    if (action.castTimeMs > 0) {
      player.lastCastAt = now;
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = "npc";
      player.castTargetId = target.id;
      return;
    }

    setActionReadyAt(player, actionId, now + action.cooldownMs);
    player.lastCastAt = now;
    aggroNeutralNpcOnPlayerAttackStart(target, client.sessionId, player);
    applyCombatDamage(
      client.sessionId,
      player,
      target,
      actionId,
      action.damage,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
  }

  private handleAcceptQuest(client: Client, message: Partial<ClientAcceptQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !isQuestAvailable(player, questId)) return;

    const npc = this.state.npcs.get(QUESTS[questId].giverNpcId);
    if (!npc || distanceToNpc(player, npc) > 3.75) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;

    const now = Date.now();
    startQuest(player, questId);
    this.broadcast("chat", {
      sessionId: npc.id,
      name: npc.name,
      identityType: "npc",
      text: `${player.name}, quest accepted: ${QUESTS[questId].title}.`,
      sentAt: now,
    } satisfies ChatMessage);
  }

  private handleLootCorpse(client: Client, message: Partial<ClientLootCorpse>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const npcId = typeof message?.npcId === "string" ? message.npcId : "";
    const npc = this.state.npcs.get(npcId);
    if (!npc || isNpcAlive(npc) || !npcHasLoot(npc)) return;
    if (distanceToNpc(player, npc) > LOOT.interactRange) return;

    const requestedItemId = message?.itemId;
    const itemId = requestedItemId === undefined ? null : normalizeItemId(requestedItemId);
    if (requestedItemId !== undefined && !itemId) return;
    if (itemId && !npc.loot.has(itemId)) return;

    if (itemId) {
      lootCorpseItem(player, npc, itemId);
    } else {
      const itemIds: ItemId[] = [];
      npc.loot.forEach((item) => itemIds.push(item.id));
      for (const nextItemId of itemIds) {
        lootCorpseItem(player, npc, nextItemId);
      }
    }

    if (npcHasLoot(npc)) {
      client.send("lootWindow", makeLootWindow(npc));
      return;
    }

    npc.hasLoot = false;
    npc.despawnAt = Date.now() + LOOT.lootedDespawnMs;
    npc.respawnAt = Math.max(npc.respawnAt, npc.despawnAt + 250);
    client.send("closeLootWindow", { npcId: npc.id });
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    updateNpcs(
      this.state.npcs,
      this.state.players,
      delta,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
    processPendingCombatImpacts(this.pendingCombatImpacts, this.state.players, this.state.npcs, now);

    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      const activeInput = input && now - input.receivedAt < 1000 ? input : null;
      updatePlayerRegen(player, delta, now);
      if (player.health <= 0) {
        player.verticalVelocity = 0;
        player.animation = "idle";
        clearPlayerCast(player);
        return;
      }
      updatePlayerCast(
        sessionId,
        player,
        activeInput,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
      );
      let grounded = player.y <= 0.001;

      if (activeInput?.jump && !this.jumpHeld.get(sessionId) && grounded) {
        player.verticalVelocity = PLAYER.jumpVelocity;
        grounded = false;
      }
      this.jumpHeld.set(sessionId, Boolean(activeInput?.jump));

      if (!grounded || Math.abs(player.verticalVelocity) > 0.001) {
        player.verticalVelocity -= PLAYER.gravity * delta;
        player.y += player.verticalVelocity * delta;
        if (player.y <= 0) {
          player.y = 0;
          player.verticalVelocity = 0;
          grounded = true;
        }
      }

      if (!activeInput) {
        player.animation = grounded ? "idle" : "jump";
        return;
      }

      const length = Math.hypot(activeInput.x, activeInput.z);
      player.yaw = activeInput.yaw;
      player.lastSeq = activeInput.seq;

      if (length < 0.01) {
        player.animation = grounded ? "idle" : "jump";
        return;
      }

      const nx = activeInput.x / length;
      const nz = activeInput.z / length;
      const speed = activeInput.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nextPosition = resolveWorldCollision(
        player.x + nx * speed * delta,
        player.z + nz * speed * delta,
        PLAYER.radius,
      );
      player.x = nextPosition.x;
      player.z = nextPosition.z;
      player.animation = grounded ? (activeInput.sprint ? "run" : "walk") : "jump";
    });
  }
}

function normalizeInput(message: Partial<ClientInput>): ClientInput | null {
  const x = Number(message?.x ?? 0);
  const z = Number(message?.z ?? 0);
  const yaw = Number(message?.yaw ?? 0);
  const seq = Number(message?.seq ?? 0);
  if (![x, z, yaw, seq].every(Number.isFinite)) return null;

  const length = Math.hypot(x, z);
  const scale = length > 1 ? 1 / length : 1;
  return {
    seq: Math.max(0, Math.floor(seq)),
    x: x * scale,
    z: z * scale,
    yaw,
    sprint: Boolean(message?.sprint),
    jump: Boolean(message?.jump),
  };
}

function sanitizeChatText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, CHAT.maxLength);
}

function getIdentityType(options: JoinOptions | undefined, walletAddress: string): IdentityType {
  if (walletAddress) return "wallet";
  if (options?.identityType === "agent") return "agent";
  return options?.identityType === "wallet" ? "wallet" : "guest";
}

function getDefaultName(identityType: IdentityType, walletAddress: string, sessionId: string): string {
  if (identityType === "wallet" && walletAddress) {
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }
  if (identityType === "agent") {
    return `agent#${String(stableHash(sessionId) % 1000).padStart(3, "0")}`;
  }
  return makeGuestName(sessionId);
}

function spawnNpcs(npcs: MapSchema<NpcState>) {
  const specs: Array<{
    id: string;
    name: string;
    role: NpcRole;
    model?: NpcModel;
    x: number;
    z: number;
    yaw: number;
    leashRadius: number;
    dialogue: string;
    questId?: QuestId;
    health?: number;
    maxHealth?: number;
    isImmortal?: boolean;
    combatStyle?: "melee" | "caster";
  }> = [
    {
      id: "og-mfer",
      name: "OG mfer",
      role: "quest_giver",
      x: -4.2,
      z: 3.9,
      yaw: 2.3,
      leashRadius: 1.1,
      dialogue: "Quest: check in with me once you have your bearings.",
      questId: "mfer-beginnings",
    },
    {
      id: "dao-mfer",
      name: "DAO mfer",
      role: "quest_giver",
      x: 14.8,
      z: -8.8,
      yaw: -1.7,
      leashRadius: 1.5,
      dialogue: "Quest: find the DAO hall and report back.",
      questId: "dao-tour",
    },
    {
      id: "wearables-mfer",
      name: "Wearables mfer",
      role: "merchant",
      x: -14.8,
      z: 12.5,
      yaw: 1.1,
      leashRadius: 1.2,
      dialogue: "Shop is warming up. If OG sent you, hand it over.",
    },
    {
      id: "gate-guard",
      name: "Gate guard",
      role: "guard",
      x: 5.5,
      z: -18.5,
      yaw: 0.2,
      leashRadius: 4.8,
      dialogue: "Mfers only beyond the gate. Keep it moving.",
    },
    {
      id: "plaza-mfer",
      name: "Plaza mfer",
      role: "wanderer",
      x: 8.5,
      z: 6.5,
      yaw: -2.4,
      leashRadius: 9.5,
      dialogue: "Just wandering. The town already feels less empty.",
    },
    {
      id: "fountain-mfer",
      name: "Fountain mfer",
      role: "quest_giver",
      x: -7.5,
      z: -2.8,
      yaw: 1.6,
      leashRadius: 7.5,
      dialogue: "Daily vibes quest: chill by the fountain, then check back in.",
      questId: "fountain-vibes",
    },
    {
      id: "hogwatch-mfer",
      name: "Hogwatch mfer",
      role: "quest_giver",
      x: -29.5,
      z: 42.5,
      yaw: -0.65,
      leashRadius: 1.3,
      dialogue: "The busted farm is making the roads rough. I could use a hand.",
      questId: "feral-farmers",
    },
    {
      id: "training-dummy-left",
      name: "Training dummy",
      role: "enemy",
      model: "mfer",
      x: -10.5,
      z: -11.5,
      yaw: 2.5,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "The dummy looks ready to get bonked.",
    },
    {
      id: "training-dummy-right",
      name: "Training dummy",
      role: "enemy",
      model: "mfer",
      x: -7.8,
      z: -13.8,
      yaw: 2.2,
      leashRadius: 0,
      health: 160,
      maxHealth: 160,
      isImmortal: true,
      dialogue: "This dummy is for target practice.",
    },
    ...makeRabbitSpecs(),
    ...makeDeerSpecs(),
    ...makeWildHogSpecs(),
    ...makeFarmerSpecs(),
  ];

  for (const spec of specs) {
    const npc = new NpcState();
    npc.id = spec.id;
    npc.name = spec.name;
    npc.role = spec.role;
    npc.model = spec.model ?? "mfer";
    npc.avatarSeed = stableHash(`npc:${spec.id}`);
    npc.health = spec.health ?? 100;
    npc.maxHealth = spec.maxHealth ?? spec.health ?? 100;
    npc.isImmortal = Boolean(spec.isImmortal);
    const spawnPosition = resolveWorldCollision(spec.x, spec.z, getNpcCollisionRadius(npc));
    npc.x = spawnPosition.x;
    npc.y = 0;
    npc.z = spawnPosition.z;
    npc.yaw = spec.yaw;
    npc.animation = "idle";
    npc.dialogue = spec.dialogue;
    npc.questId = spec.questId ?? "";
    npc.homeX = npc.x;
    npc.homeZ = npc.z;
    npc.targetX = npc.x;
    npc.targetZ = npc.z;
    npc.leashRadius = spec.leashRadius;
    npc.combatStyle = spec.combatStyle ?? "";
    npc.nextDecisionAt = Date.now() + randomRange(1000, 5000);
    npcs.set(npc.id, npc);
  }
}

function makeRabbitSpecs() {
  return [
    { id: "rabbit-north", x: -21.5, z: -20.5 },
    { id: "rabbit-plaza", x: 18.5, z: 10.2 },
    { id: "rabbit-grove", x: -28.2, z: 17.4 },
    { id: "rabbit-path", x: 24.4, z: -14.6 },
    { id: "rabbit-fountain", x: -15.3, z: -5.8 },
    { id: "rabbit-gate", x: 11.7, z: -27.5 },
  ].map((rabbit, index) => ({
    id: rabbit.id,
    name: "Rabbit",
    role: "critter" as NpcRole,
    model: "rabbit" as NpcModel,
    x: rabbit.x,
    z: rabbit.z,
    yaw: index * 0.9,
    leashRadius: 5.4,
    health: 1,
    maxHealth: 1,
    dialogue: "The rabbit wiggles its nose.",
  }));
}

function makeDeerSpecs() {
  return [
    { id: "deer-west", x: -33.5, z: -2.2 },
    { id: "deer-south", x: 29.5, z: 22.4 },
    { id: "deer-hill", x: -19.2, z: 30.2 },
    { id: "deer-copse", x: 34.8, z: -25.8 },
  ].map((deer, index) => ({
    id: deer.id,
    name: "Deer",
    role: "beast" as NpcRole,
    model: "deer" as NpcModel,
    x: deer.x,
    z: deer.z,
    yaw: Math.PI - index * 0.7,
    leashRadius: 7.2,
    health: 10,
    maxHealth: 10,
    dialogue: "The deer watches the plaza carefully.",
  }));
}

function makeWildHogSpecs() {
  return [
    { id: "wild-hog-rooter", x: -52.5, z: 59.8 },
    { id: "wild-hog-bristle", x: -46.8, z: 63.5 },
    { id: "wild-hog-snort", x: -57.2, z: 65.4 },
    { id: "wild-hog-mud", x: -42.4, z: 56.9 },
    { id: "wild-hog-runt", x: -60.8, z: 55.3 },
    { id: "wild-hog-tusk", x: -48.7, z: 52.1 },
    { id: "wild-hog-grub", x: -55.9, z: 48.8 },
    { id: "wild-hog-boar", x: -38.6, z: 61.4 },
  ].map((hog, index) => ({
    id: hog.id,
    name: index === 7 ? "Old boar" : "Wild hog",
    role: "beast" as NpcRole,
    model: "hog" as NpcModel,
    x: hog.x,
    z: hog.z,
    yaw: Math.PI * 0.35 + index * 0.58,
    leashRadius: index === 7 ? 10.5 : 8.4,
    health: index === 7 ? 42 : 24,
    maxHealth: index === 7 ? 42 : 24,
    dialogue: index === 7 ? "The old boar paws at the broken fence." : "The wild hog snorts and roots through the mud.",
  }));
}

function makeFarmerSpecs() {
  return [
    { id: "farmhand-bran", name: "Farmhand Bran", x: -47.5, z: 55.5, yaw: -0.7, style: "melee" },
    { id: "farmhand-mae", name: "Farmhand Mae", x: -55.5, z: 58.5, yaw: 0.8, style: "melee" },
    { id: "field-mage-sol", name: "Field mage Sol", x: -43.2, z: 64.8, yaw: -1.6, style: "caster" },
  ].map((farmer) => ({
    id: farmer.id,
    name: farmer.name,
    role: "farmer" as NpcRole,
    model: "mfer" as NpcModel,
    x: farmer.x,
    z: farmer.z,
    yaw: farmer.yaw,
    leashRadius: 8.5,
    health: farmer.style === "caster" ? 70 : 90,
    maxHealth: farmer.style === "caster" ? 70 : 90,
    combatStyle: farmer.style as "melee" | "caster",
    dialogue: farmer.style === "caster" ? "The field mage guards the busted farm." : "This farmer grips a pitchfork and watches the pen.",
  }));
}

function updateNpcs(
  npcs: MapSchema<NpcState>,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  npcs.forEach((npc) => {
    if (!isNpcAlive(npc)) {
      if (npc.respawnAt > 0 && now >= npc.respawnAt) {
        npc.health = npc.maxHealth;
        npc.defeatedAt = 0;
        npc.despawnAt = 0;
        npc.respawnAt = 0;
        npc.aggroTargetId = "";
        npc.attackReadyAt = 0;
        npc.hasLoot = false;
        npc.loot.clear();
        npc.x = npc.homeX;
        npc.y = 0;
        npc.z = npc.homeZ;
        npc.targetX = npc.homeX;
        npc.targetZ = npc.homeZ;
      } else if (npc.despawnAt > 0 && now >= npc.despawnAt) {
        npc.despawnAt = 0;
        npc.hasLoot = false;
        npc.loot.clear();
        npc.y = -1000;
        npc.animation = "idle";
        return;
      } else {
        npc.animation = "idle";
        return;
      }
    }

    if (npc.role === "farmer") {
      updateFarmerNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts);
      return;
    }

    if (npc.model === "hog" && npc.aggroTargetId) {
      updateHogNpc(npc, players, delta, now, emitCombatEvent, pendingCombatImpacts);
      return;
    }

    if (npc.role === "enemy") {
      npc.animation = "idle";
      return;
    }

    if (!isNpcNearAnyPlayer(npc, players, getNpcInterestRadius(npc))) {
      npc.animation = "idle";
      return;
    }

    const canWander = npc.role === "wanderer" || npc.role === "guard" || npc.role === "critter" || npc.role === "beast";
    const canPace = npc.role === "quest_giver" || npc.role === "merchant";
    const shouldPickTarget = now >= npc.nextDecisionAt
      || Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) < 0.35;

    if (shouldPickTarget) {
      if (shouldNpcIdle(npc)) {
        npc.targetX = npc.x;
        npc.targetZ = npc.z;
        npc.animation = "idle";
        npc.nextDecisionAt = now + getNpcIdleDurationMs(npc);
        return;
      }

      if (canWander || (canPace && Math.random() < getNpcPaceChance(npc))) {
        const target = getNpcWanderTarget(npc);
        npc.targetX = target.x;
        npc.targetZ = target.z;
      } else {
        npc.targetX = npc.homeX;
        npc.targetZ = npc.homeZ;
      }
      npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
    }

    const dx = npc.targetX - npc.x;
    const dz = npc.targetZ - npc.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      npc.animation = "idle";
      return;
    }

    const speed = getNpcMoveSpeed(npc);
    const step = Math.min(distance, speed * delta);
    const previousX = npc.x;
    const previousZ = npc.z;
    const nextPosition = resolveWorldCollision(
      npc.x + (dx / distance) * step,
      npc.z + (dz / distance) * step,
      getNpcCollisionRadius(npc),
    );
    npc.x = nextPosition.x;
    npc.z = nextPosition.z;
    npc.yaw = Math.atan2(dx, dz);
    npc.animation = Math.hypot(npc.x - previousX, npc.z - previousZ) > 0.01 ? "walk" : "idle";
  });
}

function updateFarmerNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  let target = npc.aggroTargetId ? players.get(npc.aggroTargetId) ?? null : null;
  if (!target || target.health <= 0 || distanceToHome(npc, target) > getFarmerLeashRange(npc)) {
    target = findNearestAggroPlayer(npc, players);
    npc.aggroTargetId = target ? getPlayerSessionId(players, target) : "";
  }

  if (!target) {
    npc.attackReadyAt = 0;
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, 1.8);
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  const isCaster = npc.combatStyle === "caster";
  const attackRange = isCaster ? FARMER_COMBAT.spellRange : FARMER_COMBAT.meleeRange;
  if (distance > attackRange * 0.82) {
    moveNpcToward(npc, target.x, target.z, delta, FARMER_COMBAT.moveSpeed);
    return;
  }

  npc.animation = "idle";
  if (now < npc.attackReadyAt) return;

  const actionId: CombatActionId = isCaster ? "fireblast" : "attack";
  const damage = isCaster ? FARMER_COMBAT.spellDamage : FARMER_COMBAT.meleeDamage;
  npc.attackReadyAt = now + (isCaster ? FARMER_COMBAT.spellCooldownMs : FARMER_COMBAT.meleeCooldownMs);
  applyNpcCombatDamage(npc, npc.aggroTargetId, target, actionId, damage, now, emitCombatEvent, pendingCombatImpacts);
}

function updateHogNpc(
  npc: NpcState,
  players: MapSchema<PlayerState>,
  delta: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  const target = players.get(npc.aggroTargetId);
  if (!target || target.health <= 0 || distanceToHome(npc, target) > HOG_COMBAT.leashRange) {
    npc.aggroTargetId = "";
    npc.attackReadyAt = 0;
    npc.targetX = npc.homeX;
    npc.targetZ = npc.homeZ;
    npc.nextDecisionAt = now + getNpcWanderDecisionMs(npc);
    return moveNpcToward(npc, npc.homeX, npc.homeZ, delta, getNpcMoveSpeed(npc));
  }

  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);

  if (distance > HOG_COMBAT.meleeRange * 0.85) {
    moveNpcToward(npc, target.x, target.z, delta, HOG_COMBAT.moveSpeed);
    return;
  }

  npc.animation = "idle";
  if (now < npc.attackReadyAt) return;

  npc.attackReadyAt = now + HOG_COMBAT.meleeCooldownMs;
  applyNpcCombatDamage(npc, npc.aggroTargetId, target, "attack", HOG_COMBAT.meleeDamage, now, emitCombatEvent, pendingCombatImpacts);
}

function findNearestAggroPlayer(npc: NpcState, players: MapSchema<PlayerState>) {
  let nearest: PlayerState | null = null;
  let nearestDistance = Infinity;
  players.forEach((player) => {
    if (player.health <= 0) return;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance > FARMER_COMBAT.aggroRange || distanceToHome(npc, player) > FARMER_COMBAT.leashRange) return;
    if (distance < nearestDistance) {
      nearest = player;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function getFarmerLeashRange(npc: NpcState) {
  if (!npc.aggroTargetId) return FARMER_COMBAT.leashRange;
  return Math.max(FARMER_COMBAT.leashRange, COMBAT.actions.fireblast.maxRange + 2);
}

function getPlayerSessionId(players: MapSchema<PlayerState>, target: PlayerState) {
  let found = "";
  players.forEach((player, sessionId) => {
    if (player === target) found = sessionId;
  });
  return found;
}

function moveNpcToward(npc: NpcState, x: number, z: number, delta: number, speed: number) {
  const dx = x - npc.x;
  const dz = z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.12) {
    npc.animation = "idle";
    return;
  }

  const step = Math.min(distance, speed * delta);
  const previousX = npc.x;
  const previousZ = npc.z;
  const nextPosition = resolveWorldCollision(
    npc.x + (dx / distance) * step,
    npc.z + (dz / distance) * step,
    getNpcCollisionRadius(npc),
  );
  npc.x = nextPosition.x;
  npc.z = nextPosition.z;
  npc.yaw = Math.atan2(dx, dz);
  npc.animation = Math.hypot(npc.x - previousX, npc.z - previousZ) > 0.01 ? "run" : "idle";
}

function distanceToHome(npc: NpcState, point: { x: number; z: number }) {
  return Math.hypot(point.x - npc.homeX, point.z - npc.homeZ);
}

function getNpcWanderTarget(npc: NpcState) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * npc.leashRadius;
  return {
    ...resolveWorldCollision(
      npc.homeX + Math.cos(angle) * radius,
      npc.homeZ + Math.sin(angle) * radius,
      getNpcCollisionRadius(npc),
    ),
  };
}

function getNpcMoveSpeed(npc: NpcState) {
  if (npc.role === "guard") return 2.35;
  if (npc.role === "critter") return 2.65;
  if (npc.model === "hog") return 2.0;
  if (npc.role === "beast") return 2.2;
  return 1.85;
}

function getNpcCollisionRadius(npc: NpcState) {
  if (npc.model === "rabbit") return 0.36;
  if (npc.model === "hog") return 0.74;
  if (npc.model === "deer") return 0.62;
  return PLAYER.radius;
}

function getNpcInterestRadius(npc: NpcState) {
  if (npc.role === "critter" || npc.role === "beast") return 34;
  if (npc.role === "wanderer" || npc.role === "guard") return 42;
  return 28;
}

function shouldNpcIdle(npc: NpcState) {
  if (npc.role === "critter") return Math.random() < 0.62;
  if (npc.role === "beast") return Math.random() < 0.55;
  if (npc.role === "wanderer" || npc.role === "guard") return Math.random() < 0.82;
  if (npc.role === "quest_giver" || npc.role === "merchant") return Math.random() < 0.94;
  return false;
}

function getNpcIdleDurationMs(npc: NpcState) {
  if (npc.role === "critter") return randomRange(1600, 4200);
  if (npc.role === "beast") return randomRange(2200, 6200);
  if (npc.role === "wanderer" || npc.role === "guard") return randomRange(9000, 22000);
  if (npc.role === "quest_giver" || npc.role === "merchant") return randomRange(16000, 38000);
  return randomRange(5500, 12000);
}

function getNpcWanderDecisionMs(npc: NpcState) {
  if (npc.role === "critter") return randomRange(3000, 8000);
  if (npc.role === "beast") return randomRange(4500, 11000);
  if (npc.role === "wanderer" || npc.role === "guard") return randomRange(9000, 22000);
  if (npc.role === "quest_giver" || npc.role === "merchant") return randomRange(14000, 32000);
  return randomRange(5000, 12000);
}

function getNpcPaceChance(npc: NpcState) {
  if (npc.role === "quest_giver" || npc.role === "merchant") return 0.08;
  return 0.35;
}

function isNpcNearAnyPlayer(npc: NpcState, players: MapSchema<PlayerState>, radius: number) {
  let isNear = false;
  players.forEach((player) => {
    if (isNear || player.health <= 0) return;
    isNear = Math.hypot(player.x - npc.x, player.z - npc.z) <= radius;
  });
  return isNear;
}

function normalizeCombatActionId(actionId: unknown): CombatActionId | null {
  return actionId === "attack" || actionId === "shoot" || actionId === "fireblast" ? actionId : null;
}

function getActionReadyAt(player: PlayerState, actionId: CombatActionId) {
  if (actionId === "attack") return player.attackReadyAt;
  if (actionId === "shoot") return player.shootReadyAt;
  return player.fireblastReadyAt;
}

function setActionReadyAt(player: PlayerState, actionId: CombatActionId, readyAt: number) {
  if (actionId === "attack") player.attackReadyAt = readyAt;
  else if (actionId === "shoot") player.shootReadyAt = readyAt;
  else player.fireblastReadyAt = readyAt;
}

function isPlayerStationary(player: PlayerState, input: TrackedInput | undefined, now: number) {
  if (player.y > 0.05) return false;
  if (!input || now - input.receivedAt >= 350) return true;
  return Math.hypot(input.x, input.z) <= COMBAT.stationaryInputThreshold && !input.jump;
}

function updatePlayerCast(
  sessionId: string,
  player: PlayerState,
  activeInput: TrackedInput | null,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  const actionId = normalizeCombatActionId(player.castingAction);
  if (!actionId) return;

  if (!isPlayerStationary(player, activeInput ?? undefined, now)) {
    clearPlayerCast(player);
    return;
  }

  if (now < player.castEndsAt) return;

  const action = COMBAT.actions[actionId];
  if (action.manaCost > 0 && player.mana < action.manaCost) {
    clearPlayerCast(player);
    return;
  }

  const target = findCombatTarget(npcs, { kind: player.castTargetKind, id: player.castTargetId });
  if (target && isNpcAlive(target) && distanceToNpc(player, target) <= action.maxRange && distanceToNpc(player, target) >= action.minRange) {
    player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
    setActionReadyAt(player, actionId, now + action.cooldownMs);
    applyCombatDamage(sessionId, player, target, actionId, action.damage, now, emitCombatEvent, pendingCombatImpacts);
  }
  clearPlayerCast(player);
}

function clearPlayerCast(player: PlayerState) {
  player.castingAction = "";
  player.castStartedAt = 0;
  player.castEndsAt = 0;
  player.castTargetKind = "";
  player.castTargetId = "";
}

function updatePlayerRegen(player: PlayerState, delta: number, now: number) {
  if (player.health <= 0) return;

  if (now - player.lastCastAt >= COMBAT.manaRegenDelayMs) {
    player.mana = clamp(player.mana + (player.manaRegenPer5 / 5) * delta, 0, player.maxMana);
  }

  if (now - player.lastDamagedAt >= COMBAT.healthRegenDelayMs) {
    player.health = clamp(player.health + (player.healthRegenPer5 / 5) * delta, 0, player.maxHealth);
  }
}

function findCombatTarget(npcs: MapSchema<NpcState>, target: unknown) {
  if (!target || typeof target !== "object") return null;
  const maybeTarget = target as { kind?: unknown; id?: unknown };
  if (maybeTarget.kind !== "npc" || typeof maybeTarget.id !== "string") return null;
  const npc = npcs.get(maybeTarget.id);
  if (!npc || !isAttackableNpcRole(npc.role)) return null;
  return npc;
}

function isNpcAlive(npc: NpcState) {
  return npc.isImmortal || npc.health > 0;
}

function applyCombatDamage(
  sourceId: string,
  player: PlayerState,
  target: NpcState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  if (actionId === "fireblast") {
    const impactAt = now + getProjectileTravelMs(player.x, player.z, target.x, target.z);
    pendingCombatImpacts.push({
      target: { kind: "npc", id: target.id },
      sourcePlayerId: sourceId,
      damage,
      impactAt,
    });
    emitCombatEvent(makeCombatEvent(sourceId, player, target, actionId, damage, now, false, impactAt));
    return;
  }

  const defeated = applyNpcDamage(target, damage, now);
  if (defeated) {
    handleNpcDefeated(player, target, now);
  }
  aggroNpcOnPlayerHit(target, sourceId, player);
  emitCombatEvent(makeCombatEvent(sourceId, player, target, actionId, damage, now, defeated, now));
}

function applyNpcCombatDamage(
  source: NpcState,
  targetId: string,
  player: PlayerState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  if (actionId === "fireblast") {
    const impactAt = now + getProjectileTravelMs(source.x, source.z, player.x, player.z);
    pendingCombatImpacts.push({
      target: { kind: "player", id: targetId },
      damage,
      impactAt,
    });
    emitCombatEvent(makePlayerCombatEvent(source, targetId, player, actionId, damage, now, false, impactAt));
    return;
  }

  const defeated = applyPlayerDamage(player, damage, now);
  emitCombatEvent(makePlayerCombatEvent(source, targetId, player, actionId, damage, now, defeated, now));
}

function applyNpcDamage(npc: NpcState, damage: number, now: number) {
  if (npc.isImmortal) {
    npc.health = npc.maxHealth;
    return false;
  }

  const wasAlive = npc.health > 0;
  npc.health = clamp(npc.health - damage, 0, npc.maxHealth);
  if (wasAlive && npc.health <= 0) {
    npc.defeatedAt = now;
    npc.despawnAt = now + COMBAT.defeatedDespawnMs;
    npc.respawnAt = now + (npc.role === "farmer" ? FARMER_COMBAT.respawnMs : COMBAT.defeatedRespawnMs);
    npc.aggroTargetId = "";
    npc.attackReadyAt = 0;
    npc.y = 0;
    npc.targetX = npc.homeX;
    npc.targetZ = npc.homeZ;
    npc.animation = "idle";
    return true;
  }
  return false;
}

function handleNpcDefeated(player: PlayerState, npc: NpcState, now: number) {
  populateCorpseLoot(player, npc, now);
  progressDefeatQuests(player, npc);
}

function populateCorpseLoot(player: PlayerState, npc: NpcState, now: number) {
  npc.loot.clear();
  npc.hasLoot = false;

  if (npc.model === "hog") {
    if (canDropQuestItem(player, "hog-livers") && Math.random() < QUESTS["hog-livers"].dropRate) {
      addLootItem(npc, "hog-liver", 1);
    }
    if (Math.random() < 0.28) {
      addLootItem(npc, "muddy-tusk", 1);
    }
    if (Math.random() < 0.18) {
      addLootItem(npc, "small-tooth", 1);
    }
  } else if (npc.model === "rabbit") {
    if (Math.random() < 0.36) {
      addLootItem(npc, "small-tooth", 1);
    }
  } else if (npc.model === "deer") {
    if (Math.random() < 0.42) {
      addLootItem(npc, "worn-antler", 1);
    }
  } else if (npc.role === "farmer") {
    const bandanaDropRate = canDropQuestItem(player, "farmhand-bandanas") && "dropRate" in QUESTS["farmhand-bandanas"]
      ? QUESTS["farmhand-bandanas"].dropRate
      : 0.35;
    if (Math.random() < bandanaDropRate) {
      addLootItem(npc, "farmhand-bandana", 1);
    }
  } else if (npc.role === "enemy" && Math.random() < 0.22) {
    addLootItem(npc, "dummy-splinter", 1);
  }

  npc.hasLoot = npcHasLoot(npc);
  if (!npc.hasLoot) return;

  npc.despawnAt = now + LOOT.corpseDespawnMs;
  npc.respawnAt = npc.despawnAt + 250;
}

function addLootItem(npc: NpcState, itemId: ItemId, count: number) {
  const existing = npc.loot.get(itemId);
  if (existing) {
    existing.count += count;
    return;
  }

  const item = new LootItemState();
  item.id = itemId;
  item.count = count;
  npc.loot.set(itemId, item);
}

function processPendingCombatImpacts(
  pendingCombatImpacts: PendingCombatImpact[],
  players: MapSchema<PlayerState>,
  npcs: MapSchema<NpcState>,
  now: number,
) {
  for (let index = pendingCombatImpacts.length - 1; index >= 0; index -= 1) {
    const impact = pendingCombatImpacts[index];
    if (now < impact.impactAt) continue;

    pendingCombatImpacts.splice(index, 1);
    if (impact.target.kind === "npc") {
      const npc = npcs.get(impact.target.id);
      const sourcePlayer = impact.sourcePlayerId ? players.get(impact.sourcePlayerId) : undefined;
      if (npc && isNpcAlive(npc)) {
        const defeated = applyNpcDamage(npc, impact.damage, now);
        if (sourcePlayer && impact.sourcePlayerId) {
          if (defeated) {
            handleNpcDefeated(sourcePlayer, npc, now);
          }
          aggroNpcOnPlayerHit(npc, impact.sourcePlayerId, sourcePlayer);
        }
      }
    } else {
      const player = players.get(impact.target.id);
      if (player) applyPlayerDamage(player, impact.damage, now);
    }
  }
}

function aggroNpcOnPlayerHit(npc: NpcState, sourcePlayerId: string, player: PlayerState) {
  if (!canNpcAggroOnPlayerHit(npc)) return;
  if (npc.health <= 0 || player.health <= 0) return;

  npc.aggroTargetId = sourcePlayerId;
  npc.nextDecisionAt = 0;
}

function aggroNeutralNpcOnPlayerAttackStart(npc: NpcState, sourcePlayerId: string, player: PlayerState) {
  if (npc.model !== "hog") return;
  aggroNpcOnPlayerHit(npc, sourcePlayerId, player);
}

function canNpcAggroOnPlayerHit(npc: NpcState) {
  return npc.role === "farmer" || npc.model === "hog";
}

function applyPlayerDamage(player: PlayerState, damage: number, now: number) {
  if (player.health <= 0) return false;

  player.health = clamp(player.health - damage, 0, player.maxHealth);
  if (damage > 0) {
    player.lastDamagedAt = now;
    if (player.castingAction) pushbackPlayerCast(player, now);
  }
  if (player.health > 0) return false;

  clearPlayerCast(player);
  player.verticalVelocity = 0;
  player.animation = "idle";
  return true;
}

function pushbackPlayerCast(player: PlayerState, now: number) {
  const actionId = normalizeCombatActionId(player.castingAction);
  if (!actionId) return;

  const castTimeMs = COMBAT.actions[actionId].castTimeMs;
  if (castTimeMs <= 0) return;

  const elapsedMs = clamp(now - player.castStartedAt, 0, castTimeMs);
  const reducedElapsedMs = Math.max(0, elapsedMs - COMBAT.castPushbackMs);
  player.castStartedAt = now - reducedElapsedMs;
  player.castEndsAt = player.castStartedAt + castTimeMs;
}

function makeCombatEvent(
  sourceId: string,
  player: PlayerState,
  target: NpcState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  defeated: boolean,
  impactAt: number,
): CombatEvent {
  const impactHeight = getNpcImpactHeight(target);
  return {
    id: `${now}:${sourceId}:${actionId}:${target.id}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    actionId,
    target: { kind: "npc", id: target.id },
    targetName: target.name,
    amount: damage,
    sourceX: player.x,
    sourceY: player.y + 1.2,
    sourceZ: player.z,
    targetX: target.x,
    targetY: target.y + impactHeight,
    targetZ: target.z,
    sentAt: now,
    impactAt,
    defeated,
  };
}

function makePlayerCombatEvent(
  source: NpcState,
  targetId: string,
  player: PlayerState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  defeated: boolean,
  impactAt: number,
): CombatEvent {
  return {
    id: `${now}:${source.id}:${actionId}:${player.name}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId: source.id,
    actionId,
    target: { kind: "player", id: targetId },
    targetName: player.name,
    amount: damage,
    sourceX: source.x,
    sourceY: source.y + getNpcImpactHeight(source),
    sourceZ: source.z,
    targetX: player.x,
    targetY: player.y + 1.45,
    targetZ: player.z,
    sentAt: now,
    impactAt,
    defeated,
  };
}

function getProjectileTravelMs(sourceX: number, sourceZ: number, targetX: number, targetZ: number) {
  const distance = Math.hypot(sourceX - targetX, sourceZ - targetZ);
  return Math.round(clamp(
    (distance / COMBAT.fireblastProjectileSpeed) * 1000,
    COMBAT.fireblastMinTravelMs,
    COMBAT.fireblastMaxTravelMs,
  ));
}

function getNpcImpactHeight(npc: NpcState) {
  if (npc.model === "rabbit") return 0.75;
  if (npc.model === "hog") return 0.9;
  if (npc.model === "deer") return 1.15;
  return 1.45;
}

function respawnPlayerAtFountain(player: PlayerState) {
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  player.lastDamagedAt = 0;
  player.lastCastAt = 0;
  player.x = RESPAWN_POINT.x;
  player.y = 0;
  player.z = RESPAWN_POINT.z;
  player.yaw = RESPAWN_POINT.yaw;
  player.verticalVelocity = 0;
  player.animation = "idle";
  clearPlayerCast(player);
}

function findInteractNpc(player: PlayerState, npcs: MapSchema<NpcState>, requestedNpcId?: string) {
  const requested = typeof requestedNpcId === "string" ? npcs.get(requestedNpcId) : undefined;
  if (requested && isInteractableNpc(requested) && distanceToNpc(player, requested) <= LOOT.interactRange) return requested;

  let nearest: NpcState | null = null;
  let nearestDistance = Infinity;
  npcs.forEach((npc) => {
    if (!isInteractableNpc(npc)) return;
    const distance = distanceToNpc(player, npc);
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  });

  return nearestDistance <= LOOT.interactRange ? nearest : null;
}

function isInteractableNpc(npc: NpcState) {
  return isNpcAlive(npc) || npcHasLoot(npc);
}

function distanceToNpc(player: PlayerState, npc: NpcState) {
  return Math.hypot(player.x - npc.x, player.z - npc.z);
}

function getNpcDialogue(npc: NpcState, player: PlayerState, now: number, offerQuest: (questId: QuestId) => void) {
  const questDialogue = getQuestDialogue(npc, player, now, offerQuest);
  if (questDialogue) return `${player.name}, ${questDialogue}`;

  if (npc.role === "quest_giver" && npc.questId) {
    return `${player.name}, ${npc.dialogue}`;
  }
  return npc.dialogue;
}

function getQuestDialogue(npc: NpcState, player: PlayerState, now: number, offerQuest: (questId: QuestId) => void) {
  const questIds = getNpcQuestIds(npc.id);
  if (questIds.length === 0) return null;

  for (const questId of questIds) {
    const isGiver = QUESTS[questId].giverNpcId === npc.id;
    const isTurnInNpc = getQuestTurnInNpcId(questId) === npc.id;
    const quest = player.quests.get(questId);
    if (!quest) {
      if (!isGiver) continue;
      if (!isQuestAvailable(player, questId)) continue;

      offerQuest(questId);
      return `quest available: ${QUESTS[questId].title}. ${QUESTS[questId].description}`;
    }

    syncQuestItemProgress(player, questId);
    if (quest.status === "active" && isQuestAutoReady(questId)) {
      quest.status = "ready";
      quest.progress = quest.required;
    }

    if (quest.status === "active") {
      if (!isTurnInNpc && isGiver) return getQuestTravelDialogue(questId);
      if (!isTurnInNpc) continue;
      return getActiveQuestDialogue(questId, quest);
    }

    if (quest.status === "ready") {
      if (!isTurnInNpc) {
        if (isGiver) return getQuestTravelDialogue(questId);
        continue;
      }

      if (!completeQuest(player, questId, now)) {
        return getActiveQuestDialogue(questId, quest);
      }

      const nextQuestId = getNextAvailableQuestId(player, questId);
      if (nextQuestId && QUESTS[nextQuestId].giverNpcId === npc.id) {
        offerQuest(nextQuestId);
        return `${getQuestCompletionDialogue(questId)} I have another job when you are ready.`;
      }

      return getQuestCompletionDialogue(questId);
    }
  }

  return getFinishedQuestDialogue(npc.id);
}

function getActiveQuestDialogue(questId: QuestId, quest: QuestState) {
  if (questId === "feral-farmers") {
    return `${QUESTS[questId].title}: ${formatNamedQuestProgress(quest)}.`;
  }

  if (questId === "hog-livers") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hog livers collected. They do not always drop, so keep hunting.`;
  }

  return `${QUESTS[questId].title}: ${QUESTS[questId].objectiveLabel}.`;
}

function getQuestTravelDialogue(questId: QuestId) {
  const turnInNpcId = getQuestTurnInNpcId(questId);
  if (turnInNpcId !== QUESTS[questId].giverNpcId) {
    return `${QUESTS[questId].title}: take it to ${getNpcDisplayName(turnInNpcId)}.`;
  }

  return `${QUESTS[questId].title}: ${QUESTS[questId].objectiveLabel}.`;
}

function getNextAvailableQuestId(player: PlayerState, questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  const nextQuestId = "nextQuestId" in quest ? quest.nextQuestId : null;
  return nextQuestId && isQuestAvailable(player, nextQuestId) ? nextQuestId : null;
}

function getQuestCompletionDialogue(questId: QuestId) {
  const questTitle = QUESTS[questId].title;

  if (questId === "mfer-beginnings") {
    return `quest complete: ${questTitle}. You are checked in. The plaza is yours.`;
  }

  if (questId === "sealed-note") {
    return `quest complete: ${questTitle}. Wearables mfer tucks the note away and starts pulling fabric scraps.`;
  }

  if (questId === "farmhand-bandanas") {
    return `quest complete: ${questTitle}. These scraps will make warning flags for the farm road.`;
  }

  if (questId === "dao-tour") {
    return `quest complete: ${questTitle}. You found the DAO hall. Proposals can wait until the town is ready.`;
  }

  if (questId === "fountain-vibes") {
    return `quest complete: ${questTitle}. The fountain is doing its job.`;
  }

  if (questId === "feral-farmers") {
    return `good work. Quest complete: ${questTitle}.`;
  }

  if (questId === "hog-livers") {
    return `quest complete: ${questTitle}. This brew smells awful, but it should keep the road clear.`;
  }

  return `quest complete: ${questTitle}.`;
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "og-mfer") return "you are checked in. Roam around and see who needs help.";
  if (npcId === "wearables-mfer") return "the red-eye scraps are enough for a few road flags.";
  if (npcId === "dao-mfer") return "the DAO hall is on the map now. Come back when proposals are live.";
  if (npcId === "fountain-mfer") return "fountain vibes are handled for today.";
  if (npcId === "hogwatch-mfer") return "the farm is quieter already. Town owes you one.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "og-mfer") return "OG mfer";
  if (npcId === "wearables-mfer") return "Wearables mfer";
  if (npcId === "dao-mfer") return "DAO mfer";
  if (npcId === "fountain-mfer") return "Fountain mfer";
  if (npcId === "hogwatch-mfer") return "Hogwatch mfer";
  return "the right mfer";
}

function isQuestAvailable(player: PlayerState, questId: QuestId) {
  if (player.quests.has(questId)) return false;

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return player.quests.get(requiredQuestId)?.status === "completed";
}

function makeQuestOffer(questId: QuestId, npc: NpcState) {
  const quest = QUESTS[questId];
  return {
    questId,
    npcId: npc.id,
    title: quest.title,
    description: quest.description,
    objectiveLabel: quest.objectiveLabel,
    required: quest.required,
  };
}

function normalizeQuestId(input: unknown): QuestId | null {
  return typeof input === "string" && QUEST_IDS.includes(input as QuestId) ? input as QuestId : null;
}

function startQuest(player: PlayerState, questId: QuestId) {
  if (player.quests.has(questId)) return;

  const startItemId = getQuestStartItemId(questId);
  if (startItemId) addInventoryItem(player, startItemId, QUESTS[questId].required);

  const quest = new QuestState();
  quest.id = questId;
  quest.required = QUESTS[questId].required;
  quest.status = isQuestAutoReady(questId) ? "ready" : "active";
  quest.progress = quest.status === "ready" ? quest.required : 0;
  quest.flags = "";
  quest.completedAt = 0;
  player.quests.set(questId, quest);
  syncQuestItemProgress(player, questId);
}

function completeQuest(player: PlayerState, questId: QuestId, now: number) {
  const quest = player.quests.get(questId);
  if (!quest) return false;

  syncQuestItemProgress(player, questId);
  if (quest.status !== "ready" && quest.progress < quest.required) return false;

  const requiredItemId = getQuestRequiredItemId(questId);
  if (requiredItemId && shouldConsumeQuestItem(questId)) {
    removeInventoryItem(player, requiredItemId, quest.required);
  }

  quest.status = "completed";
  quest.progress = quest.required;
  quest.completedAt = now;
  return true;
}

function progressDefeatQuests(player: PlayerState, npc: NpcState) {
  if (npc.role === "farmer") {
    progressNamedQuestObjective(player, "feral-farmers", npc.id);
  }
}

function progressNamedQuestObjective(player: PlayerState, questId: QuestId, objectiveId: string) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return;
  if (!getQuestObjectiveIds(questId).includes(objectiveId)) return;

  const completed = getQuestFlags(quest);
  if (completed.has(objectiveId)) return;

  completed.add(objectiveId);
  quest.flags = Array.from(completed).sort().join(",");
  quest.progress = clamp(completed.size, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
}

function progressQuest(player: PlayerState, questId: QuestId, amount: number) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return;

  quest.progress = clamp(quest.progress + amount, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
}

function syncQuestItemProgress(player: PlayerState, questId: QuestId) {
  const quest = player.quests.get(questId);
  const requiredItemId = getQuestRequiredItemId(questId);
  if (!quest || !requiredItemId || quest.status === "completed") return;

  quest.progress = clamp(getInventoryItemCount(player, requiredItemId), 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  } else if (quest.status === "ready") {
    quest.status = "active";
  }
}

function hasActiveQuest(player: PlayerState, questId: QuestId) {
  return player.quests.get(questId)?.status === "active";
}

function canDropQuestItem(player: PlayerState, questId: QuestId) {
  return hasActiveQuest(player, questId);
}

function formatQuestProgress(quest: QuestState) {
  return `${Math.min(quest.progress, quest.required)}/${quest.required}`;
}

function formatNamedQuestProgress(quest: QuestState) {
  const completed = getQuestFlags(quest);
  const labels = QUESTS["feral-farmers"].objectives.map((objective) => (
    `${objective.label.replace("Defeat ", "")}: ${completed.has(objective.id) ? "done" : "needed"}`
  ));
  return labels.join(", ");
}

function getQuestFlags(quest: QuestState) {
  return new Set(quest.flags.split(",").filter(Boolean));
}

function getQuestObjectiveIds(questId: QuestId) {
  return getQuestObjectives(questId).map((objective) => objective.id);
}

function lootCorpseItem(player: PlayerState, npc: NpcState, itemId: ItemId) {
  const loot = npc.loot.get(itemId);
  if (!loot || loot.count <= 0) return;

  addInventoryItem(player, itemId, loot.count);
  progressLootQuests(player, itemId, loot.count);
  npc.loot.delete(itemId);
  npc.hasLoot = npcHasLoot(npc);
}

function addInventoryItem(player: PlayerState, itemId: ItemId, count: number) {
  const existing = player.inventory.get(itemId);
  if (existing) {
    existing.count += count;
    return;
  }

  const item = new InventoryItemState();
  item.id = itemId;
  item.count = count;
  player.inventory.set(itemId, item);
}

function removeInventoryItem(player: PlayerState, itemId: ItemId, count: number) {
  const existing = player.inventory.get(itemId);
  if (!existing) return;

  existing.count = Math.max(0, existing.count - count);
  if (existing.count <= 0) {
    player.inventory.delete(itemId);
  }
}

function getInventoryItemCount(player: PlayerState, itemId: ItemId) {
  return player.inventory.get(itemId)?.count ?? 0;
}

function progressLootQuests(player: PlayerState, itemId: ItemId, count: number) {
  for (const questId of QUEST_IDS) {
    if (getQuestRequiredItemId(questId) === itemId) {
      progressQuest(player, questId, count);
    }
  }
}

function npcHasLoot(npc: NpcState) {
  let hasLoot = false;
  npc.loot.forEach((item) => {
    if (item.count > 0 && ITEMS[item.id]) hasLoot = true;
  });
  return hasLoot;
}

function makeLootWindow(npc: NpcState): LootWindow {
  const items: LootWindow["items"] = [];
  npc.loot.forEach((item) => {
    if (item.count > 0 && ITEMS[item.id]) {
      items.push({ id: item.id, count: item.count });
    }
  });
  return {
    npcId: npc.id,
    npcName: npc.name,
    items,
  };
}

function normalizeItemId(input: unknown): ItemId | null {
  return typeof input === "string" && Object.prototype.hasOwnProperty.call(ITEMS, input) ? input as ItemId : null;
}

function getSpawnPoint(index: number) {
  const ring = 5 + Math.floor(index / 8) * 2.2;
  const angle = (index % 8) / 8 * Math.PI * 2;
  return {
    x: Math.cos(angle) * ring,
    z: Math.sin(angle) * ring,
    yaw: angle + Math.PI,
  };
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const port = Number(process.env.PORT ?? 2567);
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, room: ROOM_NAME, maxPlayers: MAX_PLAYERS }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("mferland server\n");
});

const gameServer = new Server({ server });
gameServer.define(ROOM_NAME, TownRoom);

server.listen(port, () => {
  console.log(`mferland server listening on ws://localhost:${port}`);
});

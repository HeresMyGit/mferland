import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Client, type Room } from "colyseus.js";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type AnyRecord = Record<string, unknown>;
type Point = { x: number; z: number };
type TargetSelection = { kind: "npc"; id: string } | { kind: "player"; id: string };
type CombatActionId = typeof COMBAT_ACTION_IDS[number];

type AgentConfig = {
  roomServer: string;
  httpServer: string;
  roomName: string;
  authEndpoint: string;
  privateKey: `0x${string}`;
  agentName: string;
  inviteCode: string;
  createCharacter: boolean;
  allowProduction: boolean;
  runSeconds: number;
  decisionModel: string;
  decisionTimeoutMs: number;
  decisionIntervalMs: number;
  objective: string;
  viewerPort: number;
  viewerHost: string;
};

type RuntimePlayer = AnyRecord & {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  walletAddress: string;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  x: number;
  z: number;
  yaw: number;
  animation: string;
  castingAction: string;
  quests: AnyRecord[];
  inventory: AnyRecord[];
  equipment: AnyRecord[];
  activeBuffs: AnyRecord[];
};

type RuntimeNpc = {
  id: string;
  name: string;
  role: string;
  model: string;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  z: number;
  defeatedAt: number;
  despawnAt: number;
  aggroTargetId: string;
  hasLoot: boolean;
  questId: string;
  shopId: string;
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

type Decision = {
  action: string;
  reason: string;
  x?: number | null;
  z?: number | null;
  npcRef?: string | null;
  playerRef?: string | null;
  questId?: string | null;
  itemId?: string | null;
  actionId?: string | null;
  text?: string | null;
  emoteId?: string | null;
  sprint?: boolean | null;
};

const COMBAT_ACTION_IDS = [
  "attack",
  "shoot",
  "signalShot",
  "fireblast",
  "frostNova",
  "heal",
  "taunt",
  "whirlwind",
  "multishot",
  "iceBlast",
] as const;

const COMBAT: Record<CombatActionId, { minRange: number; maxRange: number; manaCost: number; castTimeMs: number; requiresStationary: boolean; minLevel: number }> = {
  attack: { minRange: 0, maxRange: 5, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  shoot: { minRange: 4, maxRange: 40, manaCost: 0, castTimeMs: 0, requiresStationary: true, minLevel: 2 },
  signalShot: { minRange: 4, maxRange: 34, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 3 },
  fireblast: { minRange: 0, maxRange: 30, manaCost: 14, castTimeMs: 3500, requiresStationary: true, minLevel: 4 },
  frostNova: { minRange: 0, maxRange: 6.5, manaCost: 12, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  heal: { minRange: 0, maxRange: 24, manaCost: 16, castTimeMs: 2000, requiresStationary: true, minLevel: 6 },
  taunt: { minRange: 0, maxRange: 12, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 7 },
  whirlwind: { minRange: 0, maxRange: 4.5, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  multishot: { minRange: 4, maxRange: 36, manaCost: 12, castTimeMs: 0, requiresStationary: true, minLevel: 1 },
  iceBlast: { minRange: 0, maxRange: 28, manaCost: 12, castTimeMs: 3500, requiresStationary: true, minLevel: 5 },
};

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
  "signal-post-to-uplink-shack": [{ x: 108.8, z: -92.8 }, { x: 117.6, z: -91.2 }],
  "signal-post-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "uplink-shack-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "field-to-plaza": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: -2.4, z: 4.2 }],
  "ridge-to-plaza": [{ x: 108.8, z: -92.8 }, { x: 75, z: -22 }, { x: 53, z: -11.5 }, { x: 0, z: -34 }, { x: -2.4, z: 4.2 }],
};

const DEFAULT_TRAITS = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
} as const;

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
  "use_item",
  "update_traits",
  "emote",
  "chat",
  "share_quest_link",
] as const;

const INPUT_INTERVAL_MS = 150;
const INTERACT_SEND_RANGE = 2.7;
const INTERACT_APPROACH_DISTANCE = 2.4;

class MferlandRunner {
  private readonly config: AgentConfig;
  private readonly account: PrivateKeyAccount;
  private readonly client: Client;
  private room: Room | null = null;
  private players = new Map<string, RuntimePlayer>();
  private npcs = new Map<string, RuntimeNpc>();
  private lastNpcRefs = new Map<string, string>();
  private lastPlayerRefs = new Map<string, string>();
  private recentMessages: string[] = [];
  private questMemory = new Map<string, QuestMemory>();
  private targetPoint: Point | null = null;
  private routeQueue: Point[] = [];
  private engagedNpcId = "";
  private combatAnchor: Point | null = null;
  private seq = 0;
  private yaw = Math.PI;
  private stationaryUntil = 0;
  private nextAutoCombatAt = 0;
  private nextAutoConsumableAt = 0;
  private nextDecisionAt = 0;
  private deciding = false;
  private lastAction = "";
  private reconnecting = false;
  private stopping = false;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private decisionTimer: ReturnType<typeof setInterval> | null = null;
  private viewerServer: Server | null = null;
  private lastDecision: Decision | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.account = privateKeyToAccount(config.privateKey);
    this.client = new Client(config.roomServer);
  }

  async start() {
    this.startViewer();
    await this.connect();
    this.inputTimer = setInterval(() => this.sendInput(), INPUT_INTERVAL_MS);
    this.decisionTimer = setInterval(() => void this.decide(), 250);
    if (this.config.runSeconds > 0) {
      setTimeout(() => {
        this.log(`run_seconds elapsed (${this.config.runSeconds}); stopping`);
        this.stop();
        process.exit(0);
      }, this.config.runSeconds * 1000).unref();
    }
  }

  stop() {
    this.stopping = true;
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.decisionTimer) clearInterval(this.decisionTimer);
    this.viewerServer?.close();
    void this.room?.leave();
  }

  private async connect() {
    const challenge = await this.requestChallenge();
    const signature = await this.account.signMessage({ message: challenge.message });
    const room = await this.client.joinOrCreate(this.config.roomName, {
      name: this.config.agentName,
      identityType: "wallet",
      walletAddress: this.account.address,
      createCharacter: this.config.createCharacter,
      inviteCode: this.config.inviteCode,
      agentClient: true,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    });
    this.room = room;
    this.installHandlers(room);
    this.log(`joined ${this.config.roomName} as ${this.config.agentName} ${shortAddress(this.account.address)}`);
  }

  private async requestChallenge() {
    const url = new URL(this.config.authEndpoint, this.config.httpServer);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: this.account.address }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; nonce?: string; message?: string; error?: string } | null;
    if (!response.ok || !payload?.ok || !payload.nonce || !payload.message) {
      throw new Error(payload?.error || `wallet auth challenge failed with ${response.status}`);
    }
    return { nonce: payload.nonce, message: payload.message };
  }

  private installHandlers(room: Room) {
    room.onStateChange((state: unknown) => {
      const record = asRecord(state);
      this.players = new Map(schemaEntries(record.players).map(([id, value]) => [id, normalizePlayer(id, value)]));
      this.npcs = new Map(schemaEntries(record.npcs).map(([id, value]) => [id, normalizeNpc(id, value)]));
    });
    room.onMessage("chat", (message: unknown) => this.remember(`chat:${messageSummary(message)}`, isImportantChat(message)));
    room.onMessage("combatEvent", (event: unknown) => this.remember(`combat:${messageSummary(event)}`));
    room.onMessage("experienceEvent", (event: unknown) => this.remember(`xp:${messageSummary(event)}`, true));
    room.onMessage("lootWindow", (message: unknown) => this.remember(`lootWindow:${messageSummary(message)}`, true));
    room.onMessage("lootResult", (message: unknown) => this.remember(`lootResult:${messageSummary(message)}`, true));
    room.onMessage("closeLootWindow", (message: unknown) => this.remember(`closeLoot:${messageSummary(message)}`));
    room.onMessage("potionShopPurchaseResult", (message: unknown) => this.remember(`potionShop:${messageSummary(message)}`, true));
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
    }
    this.remember(`${kind}:${messageSummary(message)}`, true);
  }

  private async reconnect() {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    this.room = null;
    await delay(1500);
    try {
      await this.connect();
    } catch (error) {
      this.log(`reconnect failed: ${errorMessage(error)}`);
      await delay(5000);
    } finally {
      this.reconnecting = false;
    }
  }

  private async decide() {
    if (this.deciding || Date.now() < this.nextDecisionAt || !this.room) return;
    const self = this.self();
    if (!self) return;

    this.deciding = true;
    this.nextDecisionAt = Date.now() + this.config.decisionIntervalMs;
    this.logStatus(self);
    try {
      const observation = this.buildObservation(self);
      const decision = await decideWithCodex(this.config, observation);
      this.lastDecision = decision;
      this.log(`decision ${decision.action}: ${decision.reason}`);
      this.executeDecision(decision);
    } catch (error) {
      this.log(`decision failed: ${errorMessage(error)}`);
    } finally {
      this.deciding = false;
    }
  }

  private buildObservation(self: RuntimePlayer) {
    const now = Date.now();
    const refs = new Map<string, string>();
    const visibleNpcs = [...this.npcs.values()]
      .map((npc) => ({ npc, distance: distance2d(self, npc) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 32)
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
          health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
          distance: round(distance),
          position: point(npc),
          dialogue: npc.dialogue,
          questIdHint: npc.questId,
          shopId: npc.shopId,
          hasLoot: npc.hasLoot,
          aggroTarget: npc.aggroTargetId === self.sessionId ? "you" : npc.aggroTargetId ? "someone" : "",
          nearbyHostileCount: this.nearbyHostileCount(npc, 8),
        };
      });

    const playerRefs = new Map<string, string>();
    const visiblePlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => ({ player, distance: distance2d(self, player) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12)
      .map(({ player, distance }, index) => {
        const ref = `player${index + 1}`;
        playerRefs.set(ref, player.sessionId);
        playerRefs.set(player.sessionId.toLowerCase(), player.sessionId);
        playerRefs.set(player.name.toLowerCase(), player.sessionId);
        return {
          ref,
          name: player.name,
          identityType: player.identityType,
          isAgent: player.isAgent,
          health: `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}`,
          mana: `${Math.ceil(player.mana)}/${Math.ceil(player.maxMana)}`,
          distance: round(distance),
          position: point(player),
          animation: player.animation,
        };
      });

    this.lastNpcRefs = refs;
    this.lastPlayerRefs = playerRefs;

    const quests = self.quests.map((quest) => {
      const questId = getString(quest.id);
      const memory = this.questMemory.get(questId);
      return {
        id: questId,
        status: getString(quest.status),
        progress: `${getNumber(quest.progress)}/${getNumber(quest.required)}`,
        flags: getString(quest.flags),
        lastKnownTitle: memory?.title ?? "",
        lastKnownObjective: memory?.objectiveLabel ?? "",
        lastKnownNpcId: memory?.npcId ?? "",
        lastKnownNpcName: memory?.npcName ?? "",
        lastKnownTurnInNpcId: memory?.turnInNpcId ?? "",
        lastKnownTurnInNpcName: memory?.turnInNpcName ?? "",
        lastKnownText: memory?.text ?? "",
        lastKnownRewardPreview: memory?.rewardPreview ?? [],
      };
    });

    return {
      objective: this.config.objective,
      wallet: {
        address: this.account.address,
        agentClient: true,
      },
      self: {
        name: self.name,
        level: self.level,
        xp: self.xp,
        health: `${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)}`,
        mana: `${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)}`,
        position: point(self),
        animation: self.animation,
        castingAction: self.castingAction,
        aggroCount: [...this.npcs.values()].filter((npc) => npc.aggroTargetId === self.sessionId && npc.health > 0 && npc.defeatedAt <= 0).length,
        nearbyHostileCount: this.nearbyHostileCount(self, 10),
        quests,
        inventory: self.inventory,
        equipment: self.equipment,
        activeBuffs: self.activeBuffs,
        combatActions: COMBAT_ACTION_IDS.map((actionId) => {
          const action = COMBAT[actionId];
          return {
            actionId,
            unlocked: self.level >= action.minLevel,
            ready: this.canUse(self, actionId),
            manaCost: action.manaCost,
            maxRange: action.maxRange,
            castTimeMs: action.castTimeMs,
            requiresStationary: action.requiresStationary,
          };
        }),
      },
      publicMap: {
        landmarks: PUBLIC_LANDMARKS,
        routes: Object.keys(PUBLIC_ROUTES),
        routeDetails: PUBLIC_ROUTES,
      },
      nearbyNpcs: visibleNpcs,
      nearbyPlayers: visiblePlayers,
      questMemory: [...this.questMemory.values()]
        .sort((a, b) => b.observedAt - a.observedAt)
        .slice(0, 20),
      lootableCorpses: visibleNpcs.filter((npc) => !npc.alive && npc.hasLoot),
      recentMessages: this.recentMessages.slice(-20),
      availableActions: DECISION_ACTIONS,
      actionNotes: [
        "Use only one normal room action per decision.",
        "The model policy owns high-level choices: quest order, exploration, target selection, grouping, looting, shopping, and when to disengage.",
        "The harness only supplies wallet login, observation summaries, normal room-message actions, movement/cast safety, and short combat continuations after the policy selects a target.",
        "Use quest offer/status/turn-in messages, NPC dialogue, quest log state, visible NPCs, and public map landmarks as context clues.",
        "Do not assume a hidden quest script or hard-coded quest order. Explore by moving, interacting with nearby quest NPCs, reading offers/status, accepting available quests, doing objectives, and turning in ready quests.",
        "For accept_quest, use the offer npcRef. For complete_quest, use the turnInNpcId/turnInNpcName from quest messages when present.",
        "Prefer stable NPC ids or exact NPC names for npcRef. Numbered refs like npc1 also work, but only for the current observation.",
        "If a quest is completed or a questCompleted message was observed, move on to available next quest context instead of retrying that turn-in.",
        "For combat, prefer fight_npc with a visible hostile npcRef. Avoid pulling packs unless grouping or using AoE intentionally.",
        "After fight_npc or use_ability against an NPC, the harness continues ordinary combat messages on that selected target until it dies or you choose another high-level action.",
        "For travel_route, put a public route id or landmark id in text. Minor wording differences are accepted.",
        "If dead, use respawn. If multiple enemies target you, stabilize before moving deeper.",
        "If a corpse has loot and you are safe, use loot to clear it.",
        "If a spell has castTimeMs or requiresStationary, do not move until it lands.",
        "For update_traits, no item or quest id is required; the runner sends a basic trait set.",
      ],
      refs: {
        npcs: Object.fromEntries(refs),
        players: Object.fromEntries(playerRefs),
      },
      autonomyBoundary: {
        policyOwns: [
          "quest order",
          "where to explore",
          "which NPCs or players to interact with",
          "which target to fight",
          "when to loot",
          "when to group, chat, or emote",
          "when to use shops or wallet-backed payments",
        ],
        harnessAssists: [
          "wallet challenge signing",
          "Colyseus connection",
          "public observation packet",
          "normal room-message dispatch",
          "holding still while casts resolve",
          "continuing attacks on a policy-selected target",
          "using owned consumables at low health or mana",
        ],
        notIncluded: [
          "hard-coded quest path",
          "database reads",
          "debug server messages",
          "teleports",
          "production bypasses",
        ],
      },
      now,
      lastAction: this.lastAction,
    };
  }

  private startViewer() {
    if (!this.config.viewerPort) return;
    this.viewerServer = createServer((request, response) => this.handleViewerRequest(request, response));
    this.viewerServer.on("error", (error) => this.log(`viewer error: ${errorMessage(error)}`));
    this.viewerServer.listen(this.config.viewerPort, this.config.viewerHost, () => {
      this.log(`viewer listening at http://${this.config.viewerHost}:${this.config.viewerPort}`);
    });
  }

  private handleViewerRequest(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${this.config.viewerHost}:${this.config.viewerPort}`}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(VIEWER_HTML);
      return;
    }
    if (url.pathname === "/state") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(this.buildViewerState()));
      return;
    }
    if (url.pathname === "/health") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }

  private buildViewerState() {
    const self = this.self();
    const now = Date.now();
    const npcs = [...this.npcs.values()]
      .map((npc) => ({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        model: npc.model,
        position: point(npc),
        health: Math.ceil(npc.health),
        maxHealth: Math.ceil(npc.maxHealth),
        alive: npc.health > 0 && npc.defeatedAt <= 0,
        defeatedAt: npc.defeatedAt,
        hasLoot: npc.hasLoot,
        questId: npc.questId,
        shopId: npc.shopId,
        aggroTarget: self && npc.aggroTargetId === self.sessionId ? "you" : npc.aggroTargetId ? "other" : "",
        distance: self ? round(distance2d(self, npc)) : 0,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 80);
    const players = [...this.players.values()]
      .map((player) => ({
        sessionId: player.sessionId,
        name: player.name,
        isSelf: self ? player.sessionId === self.sessionId : false,
        isAgent: player.isAgent,
        identityType: player.identityType,
        position: point(player),
        health: Math.ceil(player.health),
        maxHealth: Math.ceil(player.maxHealth),
        mana: Math.ceil(player.mana),
        maxMana: Math.ceil(player.maxMana),
        level: player.level,
        animation: player.animation,
        castingAction: player.castingAction,
        distance: self ? round(distance2d(self, player)) : 0,
      }))
      .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.distance - b.distance))
      .slice(0, 24);
    return {
      connected: Boolean(this.room),
      roomName: this.config.roomName,
      objective: this.config.objective,
      wallet: {
        address: this.account.address,
        agentClient: true,
      },
      self: self
        ? {
          sessionId: self.sessionId,
          name: self.name,
          position: point(self),
          yaw: round(self.yaw),
          level: self.level,
          xp: self.xp,
          health: Math.ceil(self.health),
          maxHealth: Math.ceil(self.maxHealth),
          mana: Math.ceil(self.mana),
          maxMana: Math.ceil(self.maxMana),
          animation: self.animation,
          castingAction: self.castingAction,
          aggroCount: [...this.npcs.values()].filter((npc) => npc.aggroTargetId === self.sessionId && npc.health > 0 && npc.defeatedAt <= 0).length,
          quests: self.quests.map((quest) => ({
            id: getString(quest.id),
            status: getString(quest.status),
            progress: getNumber(quest.progress),
            required: getNumber(quest.required),
            title: this.questMemory.get(getString(quest.id))?.title ?? "",
            objective: this.questMemory.get(getString(quest.id))?.objectiveLabel ?? "",
          })),
          inventory: self.inventory.slice(0, 32),
        }
        : null,
      players,
      npcs,
      targetPoint: this.targetPoint,
      routeQueue: this.routeQueue,
      engagedNpcId: this.engagedNpcId,
      combatAnchor: this.combatAnchor,
      lastAction: this.lastAction,
      lastDecision: this.lastDecision,
      recentMessages: this.recentMessages.slice(-18),
      questMemory: [...this.questMemory.values()].sort((a, b) => b.observedAt - a.observedAt).slice(0, 12),
      publicMap: {
        landmarks: PUBLIC_LANDMARKS,
        routes: PUBLIC_ROUTES,
      },
      now,
    };
  }

  private executeDecision(decision: Decision) {
    const self = this.self();
    if (!self) return;

    switch (decision.action) {
      case "wait":
        this.targetPoint = null;
        this.clearEngagement();
        this.lastAction = "wait";
        return;
      case "respawn":
        this.clearEngagement();
        this.routeQueue = [];
        this.send("respawn", {});
        this.lastAction = "respawn";
        return;
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        if (x === undefined || z === undefined) throw new Error("move_to requires x and z");
        this.clearEngagement();
        this.routeQueue = [];
        this.moveTo({ x, z });
        this.lastAction = `move_to ${round(x)},${round(z)}`;
        return;
      }
      case "travel_route": {
        const routeText = cleanText(decision.text, 80);
        const route = resolveRoute(routeText);
        if (!route) throw new Error(`unknown route ${routeText}`);
        this.clearEngagement();
        this.routeQueue = [...route];
        this.followRoute(self);
        this.lastAction = `travel_route ${routeText}`;
        return;
      }
      case "move_near_npc":
      case "interact_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error(`${decision.action} requires npcRef`);
        this.clearEngagement();
        if (decision.action === "move_near_npc" || distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_near_npc ${npc.id}`;
          return;
        }
        this.targetPoint = null;
        this.send("interact", { npcId: npc.id });
        this.lastAction = `interact_npc ${npc.id}`;
        return;
      }
      case "move_near_player": {
        const player = this.resolvePlayer(decision.playerRef);
        if (!player) throw new Error("move_near_player requires playerRef");
        this.clearEngagement();
        this.moveTo(player);
        this.lastAction = `move_near_player ${player.name}`;
        return;
      }
      case "accept_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) throw new Error("accept_quest requires questId and npcRef");
        this.clearEngagement();
        if (distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_accept ${questId}`;
          return;
        }
        this.targetPoint = null;
        this.send("acceptQuest", { questId, npcId: npc.id });
        this.lastAction = `accept_quest ${questId}`;
        return;
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) throw new Error("complete_quest requires questId and npcRef");
        this.clearEngagement();
        if (distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_complete ${questId}`;
          return;
        }
        this.targetPoint = null;
        this.send("completeQuest", { questId, npcId: npc.id });
        this.lastAction = `complete_quest ${questId}`;
        return;
      }
      case "cancel_quest": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("cancel_quest requires questId");
        this.send("cancelQuest", { questId });
        this.lastAction = `cancel_quest ${questId}`;
        return;
      }
      case "fight_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("fight_npc requires visible npcRef");
        this.setEngagement(self, npc.id);
        this.routeQueue = [];
        this.fight(self, npc);
        return;
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
            return;
          }
          const npc = this.resolveNpc(decision.npcRef);
          if (!npc) throw new Error("use_ability requires npcRef or playerRef");
          if (actionId === "heal") this.clearEngagement();
          else this.setEngagement(self, npc.id);
          this.routeQueue = [];
          this.cast(actionId, { kind: "npc", id: npc.id });
        }
        this.lastAction = `use_ability ${actionId}`;
        return;
      }
      case "loot": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("loot requires npcRef");
        this.clearEngagement();
        this.send("lootCorpse", { npcId: npc.id });
        this.lastAction = `loot ${npc.id}`;
        return;
      }
      case "equip_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("equip_item requires itemId");
        this.clearEngagement();
        this.send("equipItem", { itemId });
        this.lastAction = `equip_item ${itemId}`;
        return;
      }
      case "use_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("use_item requires itemId");
        this.clearEngagement();
        this.send("useItem", { itemId });
        this.lastAction = `use_item ${itemId}`;
        return;
      }
      case "update_traits":
        this.clearEngagement();
        this.send("updateTraits", {
          traits: DEFAULT_TRAITS,
          name: this.config.agentName,
          attemptId: `llm-skill-runner-${Date.now()}`,
        });
        this.lastAction = "update_traits";
        return;
      case "share_quest_link": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("share_quest_link requires questId");
        this.clearEngagement();
        this.send("shareQuestLink", { questId, url: "https://game.mfergpt.lol" });
        this.lastAction = `share_quest_link ${questId}`;
        return;
      }
      case "chat": {
        const text = cleanText(decision.text, 180);
        if (!text) throw new Error("chat requires text");
        this.clearEngagement();
        this.send("chat", { text });
        this.lastAction = `chat ${text.slice(0, 24)}`;
        return;
      }
      case "emote": {
        const emoteId = cleanText(decision.emoteId, 40) || "wave";
        this.clearEngagement();
        this.send("emote", { emoteId });
        this.lastAction = `emote ${emoteId}`;
        return;
      }
      default:
        throw new Error(`unknown action ${decision.action}`);
    }
  }

  private setEngagement(self: RuntimePlayer, npcId: string) {
    this.engagedNpcId = npcId;
    this.combatAnchor = point(self);
  }

  private clearEngagement() {
    this.engagedNpcId = "";
    this.combatAnchor = null;
  }

  private fight(self: RuntimePlayer, npc: RuntimeNpc) {
    this.routeQueue = [];
    const distance = distance2d(self, npc);
    const actionId = this.chooseCombatAction(self, npc, distance);
    const action = COMBAT[actionId];
    if (distance > action.maxRange * 0.9) {
      this.moveToCombatRange(self, npc, action);
      this.lastAction = `move_to_fight ${npc.id}`;
      return;
    }
    this.targetPoint = null;
    this.cast(actionId, { kind: "npc", id: npc.id });
    this.lastAction = `combat ${actionId} ${npc.id}`;
  }

  private chooseCombatAction(self: RuntimePlayer, npc: RuntimeNpc, distance: number): CombatActionId {
    const closeAttackers = [...this.npcs.values()].filter((entry) => (
      entry.health > 0
      && entry.defeatedAt <= 0
      && entry.aggroTargetId === self.sessionId
      && distance2d(self, entry) <= 5.5
    )).length;
    if (self.health < self.maxHealth * 0.45 && this.canUse(self, "heal")) return "heal";
    if (closeAttackers >= 2 && this.canUse(self, "frostNova")) return "frostNova";
    if (closeAttackers >= 2 && this.canUse(self, "whirlwind")) return "whirlwind";
    if (distance >= 8 && this.canUse(self, "fireblast")) return "fireblast";
    if (distance >= 4 && this.canUse(self, "signalShot")) return "signalShot";
    if (distance >= 4 && this.canUse(self, "shoot")) return "shoot";
    return "attack";
  }

  private cast(actionId: CombatActionId, target: TargetSelection) {
    const action = COMBAT[actionId];
    if (action.requiresStationary || action.castTimeMs > 0) {
      this.stationaryUntil = Date.now() + action.castTimeMs + 350;
      this.targetPoint = null;
    }
    this.send("combatAction", target.id ? { actionId, target } : { actionId });
  }

  private canUse(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT[actionId];
    if (self.level < action.minLevel) return false;
    if (self.mana < action.manaCost) return false;
    const readyAt = getNumber(self[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now();
  }

  private followRoute(self: RuntimePlayer) {
    const target = this.routeQueue[0];
    if (!target) return;
    if (distance2d(self, target) < 2) this.routeQueue.shift();
    const nextTarget = this.routeQueue[0];
    if (nextTarget) this.moveTo(nextTarget);
  }

  private moveTo(point: Point) {
    this.targetPoint = { x: point.x, z: point.z };
  }

  private moveNearNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    this.moveTo({
      x: npc.x + (dx / length) * INTERACT_APPROACH_DISTANCE,
      z: npc.z + (dz / length) * INTERACT_APPROACH_DISTANCE,
    });
  }

  private moveToCombatRange(self: RuntimePlayer, npc: RuntimeNpc, action: { maxRange: number; minRange: number }) {
    const desiredRange = action.maxRange >= 20
      ? Math.max(action.minRange + 1.5, Math.min(action.maxRange - 2, action.maxRange * 0.86))
      : Math.max(2.4, Math.min(action.maxRange * 0.7, action.maxRange - 0.5));
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    this.moveTo({
      x: npc.x + (dx / length) * desiredRange,
      z: npc.z + (dz / length) * desiredRange,
    });
  }

  private sendInput() {
    const self = this.self();
    if (!this.room || !self) return;
    this.maintainSurvival(self);
    this.continueEngagement(self);
    if (!this.engagedNpcId && this.routeQueue.length > 0) this.followRoute(self);
    let x = 0;
    let z = 0;
    if (Date.now() >= this.stationaryUntil && this.targetPoint) {
      const dx = this.targetPoint.x - self.x;
      const dz = this.targetPoint.z - self.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.7) {
        x = dx / length;
        z = dz / length;
        this.yaw = Math.atan2(x, z);
      } else {
        this.targetPoint = null;
      }
    }
    this.send("input", { x, z, yaw: this.yaw, sprint: Boolean(this.targetPoint), jump: false, seq: ++this.seq });
  }

  private continueEngagement(self: RuntimePlayer) {
    if (!this.engagedNpcId || Date.now() < this.nextAutoCombatAt || self.health <= 0 || self.castingAction) return;
    const attackers = [...this.npcs.values()].filter((npc) => (
      npc.aggroTargetId === self.sessionId
      && npc.health > 0
      && npc.defeatedAt <= 0
    )).length;
    if (attackers >= 3 || self.health < self.maxHealth * 0.35) {
      if (this.combatAnchor) this.moveTo(this.combatAnchor);
      this.clearEngagement();
      this.lastAction = attackers >= 3 ? "retreat_overpull" : "retreat_low_health";
      return;
    }
    const npc = this.npcs.get(this.engagedNpcId);
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
    const manaRatio = self.maxMana > 0 ? self.mana / self.maxMana : 1;
    if (healthRatio <= 0.48 && inventoryCount(self, "red-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "red-juice" });
      this.lastAction = "auto_use red-juice";
      return;
    }
    if (healthRatio <= 0.62 && inventoryCount(self, "field-snack") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "field-snack" });
      this.lastAction = "auto_use field-snack";
      return;
    }
    if (manaRatio <= 0.25 && inventoryCount(self, "blue-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "blue-juice" });
      this.lastAction = "auto_use blue-juice";
    }
  }

  private send(type: string, message: AnyRecord = {}) {
    this.room?.send(type, message);
  }

  private self() {
    return this.room ? this.players.get(this.room.sessionId) ?? null : null;
  }

  private resolveNpc(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.npcs.get(key);
    if (direct) return direct;
    const mapped = this.lastNpcRefs.get(key);
    if (mapped) return this.npcs.get(mapped) ?? null;
    const refMatch = /^npc(\d+)$/.exec(key);
    if (refMatch) {
      const self = this.self();
      if (!self) return null;
      const index = Number(refMatch[1]) - 1;
      return [...this.npcs.values()]
        .map((npc) => ({ npc, distance: distance2d(self, npc) }))
        .sort((a, b) => a.distance - b.distance)[index]?.npc ?? null;
    }
    return [...this.npcs.values()].find((npc) => npc.name.toLowerCase() === key || npc.id.toLowerCase() === key) ?? null;
  }

  private resolvePlayer(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.players.get(key);
    if (direct) return direct;
    const mapped = this.lastPlayerRefs.get(key);
    if (mapped) return this.players.get(mapped) ?? null;
    const refMatch = /^player(\d+)$/.exec(key);
    if (refMatch) {
      const self = this.self();
      if (!self) return null;
      const index = Number(refMatch[1]) - 1;
      return [...this.players.values()]
        .filter((player) => player.sessionId !== self.sessionId)
        .map((player) => ({ player, distance: distance2d(self, player) }))
        .sort((a, b) => a.distance - b.distance)[index]?.player ?? null;
    }
    return [...this.players.values()].find((player) => player.name.toLowerCase() === key || player.sessionId.toLowerCase() === key) ?? null;
  }

  private nearbyHostileCount(pointLike: Point, radius: number) {
    return [...this.npcs.values()].filter((npc) => (
      npc.health > 0
      && npc.defeatedAt <= 0
      && isHostile(npc)
      && distance2d(pointLike, npc) <= radius
    )).length;
  }

  private remember(message: string, print = false) {
    this.recentMessages = [...this.recentMessages.slice(-30), message];
    if (print) this.log(message);
  }

  private logStatus(self: RuntimePlayer) {
    const nearbyPlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId && distance2d(self, player) <= 20)
      .map((player) => `${player.name}${player.isAgent ? ":agent" : ""}`)
      .slice(0, 4)
      .join(",");
    const nearbyNpcs = [...this.npcs.values()]
      .filter((npc) => distance2d(self, npc) <= 16)
      .map((npc) => `${npc.id}:${Math.ceil(npc.health)}`)
      .slice(0, 5)
      .join(",");
    this.log(`hp=${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)} mana=${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)} lvl=${self.level} pos=${round(self.x)},${round(self.z)} action=${this.lastAction || "none"} players=${nearbyPlayers || "-"} npcs=${nearbyNpcs || "-"}`);
  }

  private log(message: string) {
    console.log(`[mferland-agent] ${message}`);
  }
}

const config = readConfig();
const runner = new MferlandRunner(config);
await runner.start();

process.on("SIGINT", () => {
  runner.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  runner.stop();
  process.exit(0);
});

async function decideWithCodex(config: AgentConfig, observation: unknown): Promise<Decision> {
  const tempDir = await mkdtemp(join(tmpdir(), "mferland-agent-decision-"));
  const schemaPath = join(tempDir, "decision.schema.json");
  const outputPath = join(tempDir, "decision.json");
  await writeFile(schemaPath, JSON.stringify(DECISION_SCHEMA, null, 2));
  const prompt = buildDecisionPrompt(config.objective, observation);
  const result = await runCodexExec({
    model: config.decisionModel,
    outputPath,
    prompt,
    schemaPath,
    tempDir,
    timeoutMs: config.decisionTimeoutMs,
  });
  if (!result.ok) throw new Error(`codex decision failed${result.reason === "timeout" ? " (timeout)" : ""}: ${result.stderr || result.stdout}`);
  const raw = await readFile(outputPath, "utf8").catch(() => result.stdout);
  return normalizeDecision(JSON.parse(raw));
}

function buildDecisionPrompt(objective: string, observation: unknown) {
  return [
    "You are controlling one mferland wallet character as a normal player agent.",
    "Return exactly one JSON object matching the supplied schema. Use null for fields that do not apply.",
    "Do not run commands, inspect files, browse, ask for hidden server state, use debug messages, teleport, boost, or request database access.",
    "Make your own gameplay decision from public in-game context: current room state, quest offers/status/turn-ins, NPC dialogue, visible players, public map landmarks, inventory, cooldowns, combat state, and recent chat.",
    "There is no quest script. Discover the game by exploring, interacting, accepting quests, reading objective text, completing objectives, looting, grouping, and turning in ready quests.",
    "Work toward the objective, but preserve normal gameplay: stay alive, avoid overpulls, loot when safe, and coordinate with visible players.",
    "",
    JSON.stringify({ objective, observation }),
  ].join("\n");
}

function runCodexExec({
  model,
  outputPath,
  prompt,
  schemaPath,
  tempDir,
  timeoutMs,
}: {
  model: string;
  outputPath: string;
  prompt: string;
  schemaPath: string;
  tempDir: string;
  timeoutMs: number;
}) {
  return new Promise<{
    ok: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    reason?: "timeout";
    stderr: string;
    stdout: string;
  }>((resolve) => {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      tempDir,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
    ];
    if (model) args.push("-m", model);
    args.push("-");

    const child = spawn(getCodexCliPath(), args, {
      cwd: tempDir,
      env: getSanitizedCodexEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.end(prompt);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, code: null, signal: null, stderr: appendLimited(stderr, error.message), stdout });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ ok: !timedOut && code === 0, code, signal, reason: timedOut ? "timeout" : undefined, stderr, stdout });
    });
  });
}

function readConfig(): AgentConfig {
  const roomServer = cleanEnv("ROOM_SERVER") || "wss://game.mfergpt.lol";
  const httpServer = cleanEnv("HTTP_SERVER") || toHttpServer(roomServer);
  const privateKey = cleanEnv("AGENT_PRIVATE_KEY");
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.");
  const allowProduction = cleanEnv("AGENT_ALLOW_PRODUCTION") === "1";
  if (/game\.mfergpt\.lol/i.test(roomServer) && !allowProduction) {
    throw new Error("Set AGENT_ALLOW_PRODUCTION=1 to connect this runner to game.mfergpt.lol.");
  }
  const viewerPort = readPortEnv("AGENT_VIEWER_PORT");
  const viewerHost = cleanEnv("AGENT_VIEWER_HOST") || "127.0.0.1";
  if (viewerPort && !isLoopbackHost(viewerHost)) {
    throw new Error("AGENT_VIEWER_HOST must be loopback-only, such as 127.0.0.1 or localhost.");
  }
  return {
    roomServer,
    httpServer,
    roomName: cleanEnv("ROOM_NAME") || "town",
    authEndpoint: cleanEnv("AUTH_ENDPOINT") || "/wallet-auth-challenge",
    privateKey: privateKey as `0x${string}`,
    agentName: cleanEnv("AGENT_NAME") || "mfer-agent",
    inviteCode: cleanEnv("AGENT_INVITE_CODE"),
    createCharacter: cleanEnv("AGENT_CREATE_CHARACTER") !== "0",
    allowProduction,
    runSeconds: readNumberEnv("AGENT_RUN_SECONDS"),
    decisionModel: cleanEnv("AGENT_DECISION_MODEL") || cleanEnv("CODEX_LLM_MODEL"),
    decisionTimeoutMs: readNumberEnv("AGENT_DECISION_TIMEOUT_MS") || 60_000,
    decisionIntervalMs: readNumberEnv("AGENT_DECISION_INTERVAL_MS") || 1200,
    objective: cleanEnv("AGENT_OBJECTIVE") || "Play mferland naturally. Progress the main questline from public quest context, cooperate with players, loot, survive, and eventually defeat The Centralizer through its quest.",
    viewerPort,
    viewerHost,
  };
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
    name: getString(value.name) || shortAddress(getString(value.walletAddress)) || sessionId,
    identityType: getString(value.identityType),
    isAgent: Boolean(value.isAgent),
    walletAddress: getString(value.walletAddress),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    mana: getNumber(value.mana),
    maxMana: getNumber(value.maxMana, 1),
    level: Math.max(1, getNumber(value.level, 1)),
    xp: getNumber(value.xp),
    x: getNumber(value.x),
    z: getNumber(value.z),
    yaw: getNumber(value.yaw),
    animation: getString(value.animation),
    castingAction: getString(value.castingAction),
    quests: schemaEntries(value.quests).map(([, quest]) => quest),
    inventory: schemaEntries(value.inventory).map(([, item]) => item),
    equipment: schemaEntries(value.equipment).map(([, slot]) => slot),
    activeBuffs: schemaEntries(value.activeBuffs).map(([, buff]) => buff),
  };
}

function normalizeNpc(id: string, value: AnyRecord): RuntimeNpc {
  return {
    id: getString(value.id) || id,
    name: getString(value.name) || id,
    role: getString(value.role),
    model: getString(value.model),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    isImmortal: Boolean(value.isImmortal),
    x: getNumber(value.x),
    z: getNumber(value.z),
    defeatedAt: getNumber(value.defeatedAt),
    despawnAt: getNumber(value.despawnAt),
    aggroTargetId: getString(value.aggroTargetId),
    hasLoot: Boolean(value.hasLoot),
    questId: getString(value.questId),
    shopId: getString(value.shopId),
    dialogue: getString(value.dialogue),
  };
}

function normalizeDecision(value: unknown): Decision {
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
    actionId: nullableText(record.actionId),
    text: nullableText(record.text),
    emoteId: nullableText(record.emoteId),
    sprint: typeof record.sprint === "boolean" ? record.sprint : null,
  };
}

function normalizeCombatAction(value: unknown): CombatActionId | null {
  const text = cleanText(value, 40);
  return COMBAT_ACTION_IDS.includes(text as CombatActionId) ? text as CombatActionId : null;
}

function inventoryCount(self: RuntimePlayer, itemId: string) {
  return self.inventory.reduce((count, item) => (
    getString(item.id) === itemId ? count + getNumber(item.count) : count
  ), 0);
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

function isHostile(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function distance2d(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function point(value: Point): Point {
  return { x: round(value.x), z: round(value.z) };
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? value as AnyRecord : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumberEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function readPortEnv(name: string) {
  const port = readNumberEnv(name);
  if (!port) return 0;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be a TCP port from 1 to 65535.`);
  return port;
}

function isLoopbackHost(host: string) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function cleanEnv(name: string) {
  return (process.env[name] ?? "").trim();
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

function toHttpServer(roomServer: string) {
  if (roomServer.startsWith("wss://")) return `https://${roomServer.slice("wss://".length)}`;
  if (roomServer.startsWith("ws://")) return `http://${roomServer.slice("ws://".length)}`;
  return roomServer;
}

function shortAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function messageSummary(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 260);
  } catch {
    return String(value).slice(0, 260);
  }
}

function isImportantChat(value: unknown) {
  const record = asRecord(value);
  const name = getString(record.name).toLowerCase();
  const text = getString(record.text).toLowerCase();
  return name === "agent rewards" || name === "season 0" || text.includes("agent season 0");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function getCodexCliPath() {
  const configuredPath = process.env.AGENT_CODEX_CLI_PATH?.trim() || process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath) return configuredPath;
  const macosAppPath = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(macosAppPath)) return macosAppPath;
  return "codex";
}

function getSanitizedCodexEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || homedir();
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    LOGNAME: process.env.LOGNAME || process.env.USER,
    NO_COLOR: "1",
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || "/bin/zsh",
    TERM: "dumb",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    USER: process.env.USER || process.env.LOGNAME,
  };
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}

function appendLimited(current: string, next: string) {
  const combined = current + next;
  return combined.length > 4000
    ? combined.slice(combined.length - 4000)
    : combined;
}

const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mferland Agent Viewer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f4ef;
      --ink: #1f2523;
      --muted: #69716c;
      --line: #d9d4c7;
      --panel: #fffdf8;
      --green: #2f8f55;
      --red: #c7473d;
      --orange: #d9872d;
      --blue: #3478b8;
      --purple: #7d5bb3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      background: #fffaf0;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 740;
    }
    .subline {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status {
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 0 3px rgba(199, 71, 61, 0.12);
    }
    .dot.ok {
      background: var(--green);
      box-shadow: 0 0 0 3px rgba(47, 143, 85, 0.14);
    }
    main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(420px, 1fr) 360px;
      gap: 0;
    }
    .stage {
      min-width: 0;
      min-height: 0;
      padding: 16px;
    }
    canvas {
      width: 100%;
      height: 100%;
      min-height: 520px;
      display: block;
      background: #fbfaf5;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    aside {
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--line);
      background: var(--panel);
      padding: 14px;
    }
    section {
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }
    section:first-child { padding-top: 0; }
    section:last-child { border-bottom: 0; }
    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      line-height: 1.2;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 760;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      background: #fff;
      min-width: 0;
    }
    .label {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
    }
    .value {
      margin-top: 3px;
      font-size: 13px;
      font-weight: 680;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      font-size: 12px;
      border-top: 1px solid #ece7da;
    }
    .row:first-child { border-top: 0; }
    .row span:last-child {
      text-align: right;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .log {
      display: grid;
      gap: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #353b38;
    }
    .log div {
      padding: 6px;
      border-radius: 5px;
      background: #f4f1e9;
      overflow-wrap: anywhere;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { border-left: 0; border-top: 1px solid var(--line); }
      canvas { min-height: 420px; }
      header { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>mferland Agent Viewer</h1>
        <div class="subline" id="subtitle">waiting for runner state</div>
      </div>
      <div class="status"><span class="dot" id="dot"></span><span id="status">disconnected</span></div>
    </header>
    <main>
      <div class="stage"><canvas id="map" width="1200" height="800"></canvas></div>
      <aside>
        <section>
          <h2>Agent</h2>
          <div class="metric-grid" id="metrics"></div>
        </section>
        <section>
          <h2>Decision</h2>
          <div id="decision"></div>
        </section>
        <section>
          <h2>Quests</h2>
          <div id="quests"></div>
        </section>
        <section>
          <h2>Nearby</h2>
          <div id="nearby"></div>
        </section>
        <section>
          <h2>Messages</h2>
          <div class="log" id="messages"></div>
        </section>
      </aside>
    </main>
  </div>
  <script>
    const canvas = document.getElementById("map");
    const ctx = canvas.getContext("2d");
    let state = null;

    function text(value) {
      return value === undefined || value === null || value === "" ? "-" : String(value);
    }

    function ratio(current, max) {
      return text(current) + "/" + text(max);
    }

    function rows(items) {
      return items.length ? items.map(function(item) {
        return '<div class="row"><span>' + escapeHtml(item[0]) + '</span><span>' + escapeHtml(item[1]) + '</span></div>';
      }).join("") : '<div class="row"><span>-</span><span>-</span></div>';
    }

    function escapeHtml(value) {
      return text(value).replace(/[&<>"']/g, function(char) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
      });
    }

    function metric(label, value) {
      return '<div class="metric"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
    }

    function setState(next) {
      state = next;
      const self = state.self;
      document.getElementById("dot").className = state.connected && self ? "dot ok" : "dot";
      document.getElementById("status").textContent = state.connected && self ? "connected" : "waiting";
      document.getElementById("subtitle").textContent = self ? self.name + " " + state.wallet.address : state.roomName;

      document.getElementById("metrics").innerHTML = self ? [
        metric("Level", self.level),
        metric("XP", self.xp),
        metric("Health", ratio(self.health, self.maxHealth)),
        metric("Mana", ratio(self.mana, self.maxMana)),
        metric("Position", self.position.x + ", " + self.position.z),
        metric("Aggro", self.aggroCount),
        metric("Action", state.lastAction || "-"),
        metric("Casting", self.castingAction || "-")
      ].join("") : metric("State", "waiting for room join");

      const decision = state.lastDecision;
      document.getElementById("decision").innerHTML = decision ? rows([
        ["Action", decision.action],
        ["Reason", decision.reason],
        ["NPC", decision.npcRef || "-"],
        ["Player", decision.playerRef || "-"],
        ["Quest", decision.questId || "-"],
        ["Ability", decision.actionId || "-"]
      ]) : rows([["Action", state.lastAction || "-"]]);

      document.getElementById("quests").innerHTML = self ? rows((self.quests || []).slice(0, 8).map(function(quest) {
        const label = quest.title || quest.id;
        const progress = quest.status + " " + quest.progress + "/" + quest.required;
        return [label, progress];
      })) : rows([]);

      const nearby = (state.npcs || []).slice(0, 10).map(function(npc) {
        const flags = [npc.alive ? ratio(npc.health, npc.maxHealth) : "down", npc.aggroTarget, npc.hasLoot ? "loot" : ""].filter(Boolean).join(" ");
        return [npc.name || npc.id, Math.round(npc.distance) + "m " + flags];
      });
      document.getElementById("nearby").innerHTML = rows(nearby);

      document.getElementById("messages").innerHTML = (state.recentMessages || []).slice(-10).reverse().map(function(message) {
        return "<div>" + escapeHtml(message) + "</div>";
      }).join("");
      draw();
    }

    function fetchState() {
      fetch("/state", { cache: "no-store" })
        .then(function(response) { return response.json(); })
        .then(setState)
        .catch(function() {
          document.getElementById("dot").className = "dot";
          document.getElementById("status").textContent = "offline";
        });
    }

    function getPoints() {
      if (!state) return [];
      const points = [];
      if (state.self) points.push(state.self.position);
      (state.players || []).forEach(function(player) { points.push(player.position); });
      (state.npcs || []).slice(0, 40).forEach(function(npc) { points.push(npc.position); });
      if (state.targetPoint) points.push(state.targetPoint);
      (state.routeQueue || []).forEach(function(point) { points.push(point); });
      Object.keys((state.publicMap && state.publicMap.landmarks) || {}).forEach(function(key) {
        points.push(state.publicMap.landmarks[key]);
      });
      return points.filter(Boolean);
    }

    function projector() {
      const points = getPoints();
      const width = canvas.width;
      const height = canvas.height;
      if (!points.length) return function(point) { return { x: width / 2, y: height / 2 }; };
      let minX = Math.min.apply(null, points.map(function(point) { return point.x; }));
      let maxX = Math.max.apply(null, points.map(function(point) { return point.x; }));
      let minZ = Math.min.apply(null, points.map(function(point) { return point.z; }));
      let maxZ = Math.max.apply(null, points.map(function(point) { return point.z; }));
      const pad = 34;
      minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
      const spanX = Math.max(20, maxX - minX);
      const spanZ = Math.max(20, maxZ - minZ);
      const scale = Math.min((width - 60) / spanX, (height - 60) / spanZ);
      const offsetX = (width - spanX * scale) / 2;
      const offsetY = (height - spanZ * scale) / 2;
      return function(point) {
        return {
          x: offsetX + (point.x - minX) * scale,
          y: offsetY + (point.z - minZ) * scale
        };
      };
    }

    function drawCircle(point, radius, fill, stroke) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    function drawLabel(point, label, fill) {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = fill || "#1f2523";
      ctx.fillText(label, point.x + 8, point.y - 8);
    }

    function drawLine(points, color, width) {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach(function(point, index) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fbfaf5";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ebe5d8";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      if (!state) return;
      const project = projector();
      const landmarks = (state.publicMap && state.publicMap.landmarks) || {};
      Object.keys(landmarks).forEach(function(name) {
        const p = project(landmarks[name]);
        drawCircle(p, 4, "#7d5bb3");
        drawLabel(p, name, "#6f6082");
      });
      drawLine((state.routeQueue || []).map(project), "#d9872d", 3);
      if (state.targetPoint) {
        const target = project(state.targetPoint);
        drawCircle(target, 8, "rgba(217,135,45,0.24)", "#d9872d");
      }
      (state.npcs || []).slice(0, 60).forEach(function(npc) {
        const p = project(npc.position);
        const hostile = npc.role === "enemy" || npc.model === "hog" || npc.role === "farmer";
        const fill = npc.alive ? (hostile ? "#c7473d" : "#3478b8") : "#8d908a";
        const stroke = npc.aggroTarget === "you" ? "#1f2523" : "";
        drawCircle(p, npc.hasLoot ? 7 : 5, fill, stroke);
        if (npc.distance < 18 || npc.id === state.engagedNpcId) drawLabel(p, npc.name || npc.id, "#343a36");
      });
      (state.players || []).forEach(function(player) {
        const p = project(player.position);
        drawCircle(p, player.isSelf ? 10 : 7, player.isSelf ? "#2f8f55" : "#d9872d", "#1f2523");
        drawLabel(p, player.name + (player.isAgent ? " agent" : ""), "#1f2523");
      });
    }

    fetchState();
    setInterval(fetchState, 500);
    window.addEventListener("resize", draw);
  </script>
</body>
</html>`;

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
    actionId: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    emoteId: { type: ["string", "null"] },
    sprint: { type: ["boolean", "null"] },
  },
  required: ["action", "reason", "x", "z", "npcRef", "playerRef", "questId", "itemId", "actionId", "text", "emoteId", "sprint"],
} as const;

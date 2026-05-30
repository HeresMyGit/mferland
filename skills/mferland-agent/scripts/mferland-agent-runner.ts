import { Client, type Room } from "colyseus.js";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type AnyRecord = Record<string, unknown>;
type Point = { x: number; z: number };
type TargetSelection = { type: "npc"; id: string } | { type: "player"; id: string };
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
  maxMferGptSpendWei: bigint;
  runSeconds: number;
};

type RuntimePlayer = {
  sessionId: string;
  name: string;
  isAgent: boolean;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  x: number;
  z: number;
  yaw: number;
  quests: AnyRecord[];
  inventory: AnyRecord[];
};

type RuntimeNpc = {
  id: string;
  name: string;
  role: string;
  model: string;
  health: number;
  maxHealth: number;
  x: number;
  z: number;
  defeatedAt: number;
  lootWindowUntil: number;
  targetSessionId: string;
  questIds: string[];
  shopId: string;
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

const COMBAT: Record<CombatActionId, { maxRange: number; manaCost: number; castTimeMs: number; requiresStationary: boolean; minLevel: number }> = {
  attack: { maxRange: 5, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  shoot: { maxRange: 40, manaCost: 0, castTimeMs: 0, requiresStationary: true, minLevel: 2 },
  signalShot: { maxRange: 34, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 3 },
  fireblast: { maxRange: 30, manaCost: 14, castTimeMs: 3500, requiresStationary: true, minLevel: 4 },
  frostNova: { maxRange: 6.5, manaCost: 12, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  heal: { maxRange: 24, manaCost: 16, castTimeMs: 2000, requiresStationary: true, minLevel: 6 },
  taunt: { maxRange: 12, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 7 },
  whirlwind: { maxRange: 4.5, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  multishot: { maxRange: 36, manaCost: 12, castTimeMs: 0, requiresStationary: true, minLevel: 1 },
  iceBlast: { maxRange: 28, manaCost: 12, castTimeMs: 3500, requiresStationary: true, minLevel: 5 },
};

const KNOWN_NPCS: Record<string, Point> = {
  "og-mfer": { x: -4.2, z: 3.9 },
  "dao-mfer": { x: 14.8, z: -8.8 },
  "fountain-mfer": { x: -7.5, z: -2.8 },
  "wearables-mfer": { x: -14.8, z: 12.5 },
  "traits-mfer": { x: -3.7, z: 25.4 },
  "swap-mfer": { x: 0, z: 25.4 },
  "crypto-mfer": { x: 3.7, z: 25.4 },
  "potion-mfer": { x: 7.4, z: 25.4 },
  mfergpt: { x: 6.8, z: -5.2 },
  "hogwatch-mfer": { x: -64.5, z: 64.5 },
  "field-guide-mfer": { x: -119.2, z: 132.4 },
  "pen-keeper-mfer": { x: -111.2, z: 136.7 },
  "ridge-guide-mfer": { x: 108.8, z: -92.8 },
  "beacon-keeper-mfer": { x: 117.6, z: -91.2 },
};

const QUEST_HINTS: Record<string, { giver: string; turnIn: string; chat?: string; share?: boolean }> = {
  "mfer-beginnings": { giver: "og-mfer", turnIn: "dao-mfer" },
  "set-your-traits": { giver: "traits-mfer", turnIn: "traits-mfer" },
  "dao-tour": { giver: "dao-mfer", turnIn: "fountain-mfer" },
  "fountain-vibes": { giver: "fountain-mfer", turnIn: "og-mfer" },
  "sealed-note": { giver: "og-mfer", turnIn: "wearables-mfer" },
  "farm-road-handoff": { giver: "wearables-mfer", turnIn: "hogwatch-mfer" },
  "ask-mfergpt": { giver: "wearables-mfer", turnIn: "mfergpt", chat: "@mfergpt gm, tell me one town fragment" },
  "mfergpt-checkin": { giver: "mfergpt", turnIn: "mfergpt", chat: "@mfergpt gm" },
  "tweet-town-link": { giver: "mfergpt", turnIn: "mfergpt", share: true },
  "mfergpt-daily-signal": { giver: "mfergpt", turnIn: "mfergpt" },
  "field-camp-delivery": { giver: "hogwatch-mfer", turnIn: "field-guide-mfer" },
  "route-patrol-daily": { giver: "field-guide-mfer", turnIn: "field-guide-mfer" },
  "hog-loop": { giver: "pen-keeper-mfer", turnIn: "pen-keeper-mfer" },
  "ridge-dispatch": { giver: "field-guide-mfer", turnIn: "ridge-guide-mfer" },
  "signal-scraps": { giver: "ridge-guide-mfer", turnIn: "ridge-guide-mfer" },
  "cut-the-static": { giver: "beacon-keeper-mfer", turnIn: "beacon-keeper-mfer" },
  "baron-of-static": { giver: "ridge-guide-mfer", turnIn: "ridge-guide-mfer" },
  "ogre-raid-daily": { giver: "beacon-keeper-mfer", turnIn: "beacon-keeper-mfer" },
};
const DEFAULT_TRAITS = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
} as const;

const PUBLIC_ROUTES: Record<string, Point[]> = {
  "plaza-to-daily-signal-camp": [{ x: -18, z: 0 }, { x: -52, z: 0 }, { x: -52, z: -36 }, { x: -49, z: -42 }],
  "daily-signal-camp-to-mfergpt": [{ x: -58, z: -48 }, { x: -52, z: -36 }, { x: -52, z: 0 }, { x: -18, z: 0 }, { x: 6.8, z: -5.2 }],
  "plaza-to-loop-farm": [{ x: 0, z: 29 }, { x: -31, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-claim-pile": [{ x: -82, z: 60 }, { x: -99, z: 75 }],
  "loop-farm-to-route-post": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "route-post-to-signal-ridge": [{ x: -124, z: 124 }, { x: -128, z: 102 }, { x: -112, z: 70 }, { x: -82, z: 60 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "route-post-to-plaza": [{ x: -124, z: 124 }, { x: -128, z: 102 }, { x: -112, z: 70 }, { x: -82, z: 60 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: -2.4, z: 4.2 }],
  "plaza-to-signal-ridge": [{ x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "signal-ridge-to-static-lot": [{ x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
};

const POTION_SHOP_ITEMS = new Set(["red-juice", "blue-juice", "field-snack", "mev-bot-elixir", "gasless-focus-elixir"]);
const BOSS_NPC_IDS = new Set(["mfergpt-daily-boss", "static-baron-nox", "raid-ogre-mfer"]);
const STARTER_QUEST_ORDER = [
  "mfer-beginnings",
  "set-your-traits",
  "dao-tour",
  "fountain-vibes",
  "sealed-note",
  "farm-road-handoff",
  "boar-bristle-cull",
  "feral-farmers",
  "hog-livers",
  "field-camp-delivery",
  "mfergpt-checkin",
  "ask-mfergpt",
  "tweet-town-link",
];
const HIGH_LEVEL_DECISION_MS = 1000;
const INPUT_INTERVAL_MS = 150;
const INTERACT_RANGE = 3.75;

class MferlandRunner {
  private readonly config: AgentConfig;
  private readonly account: PrivateKeyAccount;
  private readonly client: Client;
  private room: Room | null = null;
  private players = new Map<string, RuntimePlayer>();
  private npcs = new Map<string, RuntimeNpc>();
  private recentMessages: string[] = [];
  private targetPoint: Point | null = null;
  private routeQueue: Point[] = [];
  private seq = 0;
  private yaw = Math.PI;
  private stationaryUntil = 0;
  private nextDecisionAt = 0;
  private nextSocialAt = Date.now() + 45_000;
  private lastAction = "";
  private reconnecting = false;
  private stopping = false;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private decisionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.account = privateKeyToAccount(config.privateKey);
    this.client = new Client(config.roomServer);
  }

  async start() {
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
    room.onMessage("experienceEvent", (event: unknown) => this.remember(`xp:${messageSummary(event)}`));
    room.onMessage("lootWindow", (message: unknown) => {
      const record = asRecord(message);
      const npcId = getString(record.npcId);
      if (npcId) this.send("lootCorpse", { npcId });
      this.remember(`lootWindow:${npcId}`, true);
    });
    room.onMessage("closeLootWindow", (message: unknown) => this.remember(`closeLoot:${messageSummary(message)}`));
    room.onMessage("potionShopPurchaseResult", (message: unknown) => this.remember(`potionShop:${messageSummary(message)}`, true));
    room.onMessage("questOffer", (message: unknown) => this.remember(`questOffer:${messageSummary(message)}`, true));
    room.onMessage("questStatus", (message: unknown) => this.remember(`questStatus:${messageSummary(message)}`, true));
    room.onMessage("questTurnIn", (message: unknown) => this.remember(`questTurnIn:${messageSummary(message)}`, true));
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
      this.log(`reconnect failed: ${errorMessage(error)}`);
      await delay(5000);
    } finally {
      this.reconnecting = false;
    }
  }

  private async decide() {
    if (Date.now() < this.nextDecisionAt || !this.room) return;
    this.nextDecisionAt = Date.now() + HIGH_LEVEL_DECISION_MS;
    const self = this.self();
    if (!self) return;

    this.logStatus(self);
    if (self.health <= 0) {
      this.send("respawn", {});
      this.lastAction = "respawn";
      return;
    }

    const loot = this.nearbyLoot(self);
    if (loot) {
      this.send("lootCorpse", { npcId: loot.id });
      this.lastAction = `loot ${loot.id}`;
      return;
    }

    const attacker = this.currentAttacker(self);
    if (attacker) {
      this.fight(self, attacker);
      return;
    }

    if (self.health < self.maxHealth * 0.55 && this.canUse(self, "heal")) {
      this.cast("heal", { type: "player", id: self.sessionId });
      this.lastAction = "heal self";
      return;
    }

    if (await this.progressQuest(self)) return;

    const nearbyHostile = this.nearbyHostile(self);
    if (nearbyHostile && self.health > self.maxHealth * 0.75) {
      this.fight(self, nearbyHostile);
      return;
    }

    if (Date.now() >= this.nextSocialAt) {
      this.send("emote", { emoteId: "wave" });
      this.send("chat", { text: "gm" });
      this.nextSocialAt = Date.now() + 90_000;
      this.lastAction = "social gm";
      return;
    }

    this.followIdleRoute(self);
  }

  private async progressQuest(self: RuntimePlayer) {
    const readyQuest = self.quests.find((quest) => getString(quest.status) === "ready");
    if (readyQuest) {
      const questId = getString(readyQuest.id);
      const npcId = QUEST_HINTS[questId]?.turnIn;
      if (questId && npcId) {
        if (await this.moveOrInteract(self, npcId)) {
          this.send("completeQuest", { questId, npcId });
          this.lastAction = `complete ${questId}`;
        }
        return true;
      }
    }

    const activeQuest = self.quests.find((quest) => getString(quest.status) === "active");
    if (activeQuest) {
      const questId = getString(activeQuest.id);
      const hint = QUEST_HINTS[questId];
      if (questId === "set-your-traits") {
        if (await this.moveOrInteract(self, "traits-mfer")) {
          this.send("updateTraits", {
            traits: DEFAULT_TRAITS,
            name: this.config.agentName,
            attemptId: `skill-runner-${Date.now()}`,
          });
          this.lastAction = "update traits";
        }
        return true;
      }
      if (hint?.chat) {
        this.send("chat", { text: hint.chat });
        this.lastAction = `chat for ${questId}`;
        return true;
      }
      if (hint?.share) {
        this.send("shareQuestLink", { questId, url: "https://game.mfergpt.lol" });
        this.lastAction = `share ${questId}`;
        return true;
      }
      const target = this.questTarget(self, questId);
      if (target) {
        this.fight(self, target);
        return true;
      }
    }

    const nextQuestId = STARTER_QUEST_ORDER.find((questId) => !self.quests.some((quest) => getString(quest.id) === questId));
    if (nextQuestId) {
      const npcId = QUEST_HINTS[nextQuestId]?.giver;
      if (npcId) {
        if (await this.moveOrInteract(self, npcId)) {
          this.send("acceptQuest", { questId: nextQuestId, npcId });
          this.lastAction = `accept ${nextQuestId}`;
        }
        return true;
      }
    }
    return false;
  }

  private questTarget(self: RuntimePlayer, questId: string) {
    const alive = [...this.npcs.values()].filter((npc) => npc.health > 0 && npc.defeatedAt <= 0);
    if (questId === "mfergpt-daily-signal") return alive.find((npc) => npc.id === "mfergpt-daily-boss") ?? null;
    if (questId === "boar-bristle-cull" || questId === "hog-livers" || questId === "hog-loop") {
      return nearest(self, alive.filter((npc) => npc.model === "hog"));
    }
    if (questId === "feral-farmers") {
      return nearest(self, alive.filter((npc) => npc.id === "farmhand-bran" || npc.id === "farmhand-mae" || npc.id === "field-mage-sol"));
    }
    if (questId === "route-patrol-daily") {
      return nearest(self, alive.filter((npc) => npc.model === "hog" || npc.role === "farmer"));
    }
    if (questId === "signal-scraps") {
      return nearest(self, alive.filter((npc) => npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-")));
    }
    if (questId === "cut-the-static") return alive.find((npc) => npc.id === "static-baron-nox") ?? null;
    if (questId === "ogre-raid-daily") return alive.find((npc) => npc.id === "raid-ogre-mfer") ?? null;
    return null;
  }

  private fight(self: RuntimePlayer, npc: RuntimeNpc) {
    const distance = distance2d(self, npc);
    const actionId = this.chooseCombatAction(self, npc, distance);
    const action = COMBAT[actionId];
    if (distance > action.maxRange * 0.9) {
      this.moveTo(npc);
      this.lastAction = `move to fight ${npc.id}`;
      return;
    }
    this.targetPoint = null;
    this.cast(actionId, { type: "npc", id: npc.id });
    this.lastAction = `combat ${actionId} ${npc.id}`;
  }

  private chooseCombatAction(self: RuntimePlayer, npc: RuntimeNpc, distance: number): CombatActionId {
    const closeEnemies = [...this.npcs.values()].filter((entry) => entry.health > 0 && entry.defeatedAt <= 0 && distance2d(self, entry) <= 5.5).length;
    if (self.health < self.maxHealth * 0.45 && this.canUse(self, "heal")) return "heal";
    if (closeEnemies >= 2 && this.canUse(self, "frostNova")) return "frostNova";
    if (closeEnemies >= 2 && this.canUse(self, "whirlwind")) return "whirlwind";
    if ((BOSS_NPC_IDS.has(npc.id) || distance >= 8) && this.canUse(self, "fireblast")) return "fireblast";
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
    this.send("combatAction", { actionId, target });
  }

  private canUse(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT[actionId];
    if (self.level < action.minLevel) return false;
    if (self.mana < action.manaCost) return false;
    const readyAt = getNumber(asRecord(self)[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now();
  }

  private async moveOrInteract(self: RuntimePlayer, npcId: string) {
    const npc = this.npcs.get(npcId);
    const target = npc ?? KNOWN_NPCS[npcId];
    if (!target) return false;
    if (distance2d(self, target) > INTERACT_RANGE) {
      this.moveTo(target);
      this.lastAction = `move ${npcId}`;
      return false;
    }
    this.targetPoint = null;
    this.send("interact", { npcId });
    await delay(150);
    return true;
  }

  private followIdleRoute(self: RuntimePlayer) {
    if (this.routeQueue.length === 0) this.routeQueue = [...PUBLIC_ROUTES["plaza-to-daily-signal-camp"], ...PUBLIC_ROUTES["daily-signal-camp-to-mfergpt"]];
    const target = this.routeQueue[0];
    if (!target) return;
    if (distance2d(self, target) < 2) this.routeQueue.shift();
    else this.moveTo(target);
    this.lastAction = "idle route";
  }

  private moveTo(point: Point) {
    this.targetPoint = { x: point.x, z: point.z };
  }

  private sendInput() {
    const self = this.self();
    if (!this.room || !self) return;
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

  private send(type: string, message: AnyRecord = {}) {
    this.room?.send(type, message);
  }

  private self() {
    return this.room ? this.players.get(this.room.sessionId) ?? null : null;
  }

  private currentAttacker(self: RuntimePlayer) {
    return nearest(self, [...this.npcs.values()].filter((npc) => npc.health > 0 && npc.defeatedAt <= 0 && npc.targetSessionId === self.sessionId));
  }

  private nearbyHostile(self: RuntimePlayer) {
    return nearest(self, [...this.npcs.values()].filter((npc) => npc.health > 0 && npc.defeatedAt <= 0 && isHostile(npc) && distance2d(self, npc) <= 10));
  }

  private nearbyLoot(self: RuntimePlayer) {
    const now = Date.now();
    return nearest(self, [...this.npcs.values()].filter((npc) => npc.defeatedAt > 0 && npc.lootWindowUntil > now && distance2d(self, npc) <= 5.5));
  }

  private remember(message: string, print = false) {
    this.recentMessages = [...this.recentMessages.slice(-20), message];
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

function readConfig(): AgentConfig {
  const roomServer = cleanEnv("ROOM_SERVER") || "wss://game.mfergpt.lol";
  const httpServer = cleanEnv("HTTP_SERVER") || toHttpServer(roomServer);
  const privateKey = cleanEnv("AGENT_PRIVATE_KEY");
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.");
  const allowProduction = cleanEnv("AGENT_ALLOW_PRODUCTION") === "1";
  if (/game\.mfergpt\.lol/i.test(roomServer) && !allowProduction) {
    throw new Error("Set AGENT_ALLOW_PRODUCTION=1 to connect this runner to game.mfergpt.lol.");
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
    maxMferGptSpendWei: readBigIntEnv("AGENT_MAX_MFERGPT_SPEND_WEI"),
    runSeconds: readNumberEnv("AGENT_RUN_SECONDS"),
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
    sessionId,
    name: getString(value.name) || shortAddress(getString(value.walletAddress)) || sessionId,
    isAgent: Boolean(value.isAgent),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    mana: getNumber(value.mana),
    maxMana: getNumber(value.maxMana, 1),
    level: Math.max(1, getNumber(value.level, 1)),
    x: getNumber(value.x),
    z: getNumber(value.z),
    yaw: getNumber(value.yaw),
    quests: schemaEntries(value.quests).map(([, quest]) => quest),
    inventory: schemaEntries(value.inventory).map(([, item]) => item),
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
    x: getNumber(value.x),
    z: getNumber(value.z),
    defeatedAt: getNumber(value.defeatedAt),
    lootWindowUntil: getNumber(value.lootWindowUntil),
    targetSessionId: getString(value.targetSessionId),
    questIds: schemaEntries(value.questIds).map(([, quest]) => getString(quest.id)).filter(Boolean),
    shopId: getString(value.shopId),
  };
}

function nearest<T extends Point>(self: Point, entries: T[]) {
  return entries.sort((a, b) => distance2d(self, a) - distance2d(self, b))[0] ?? null;
}

function isHostile(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-") || BOSS_NPC_IDS.has(npc.id);
}

function distance2d(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
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

function readBigIntEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return 0n;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer wei string.`);
  return BigInt(value);
}

function readNumberEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function cleanEnv(name: string) {
  return (process.env[name] ?? "").trim();
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
    return JSON.stringify(value).slice(0, 220);
  } catch {
    return String(value).slice(0, 220);
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

void config.maxMferGptSpendWei;
void POTION_SHOP_ITEMS;

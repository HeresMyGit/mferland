import { Client, type Room } from "colyseus.js";
import {
  AGENT,
  CHAT,
  INPUT_SEND_RATE,
  PLAZA_BOUNDS,
  ROOM_NAME,
  stableHash,
  type AgentObservation,
  type ChatMessage,
  type ClientInput,
  type CombatActionId,
  type EquipmentSlotSnapshot,
  type IdentityType,
  type InventoryItemSnapshot,
  type NpcModel,
  type NpcRole,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestSnapshot,
  type TalentRankSnapshot,
} from "@mferland/shared";

type AgentConfig = {
  serverUrl: string;
  count: number;
  baseName: string;
  chatEnabled: boolean;
};

type Point = {
  x: number;
  z: number;
};

type AmbientStyle = "lurker" | "builder" | "drifter";

type RuntimePlayer = {
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
  animation: PlayerSnapshot["animation"];
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
  quests?: RuntimeQuestCollection;
  inventory?: RuntimeInventoryCollection;
  equipment?: RuntimeEquipmentCollection;
  talents?: RuntimeTalentCollection;
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

const config = readConfig();
const agents: AgentCharacter[] = [];

class AgentCharacter {
  private readonly client: Client;
  private readonly name: string;
  private readonly avatarSeed: number;
  private readonly chatEnabled: boolean;
  private readonly style: AmbientStyle;
  private room: Room | null = null;
  private players = new Map<string, PlayerSnapshot>();
  private npcs = new Map<string, NpcSnapshot>();
  private recentChat: ChatMessage[] = [];
  private target: Point | null = null;
  private yaw = Math.PI;
  private seq = 0;
  private inputTimer: NodeJS.Timeout | null = null;
  private nextDecisionAt = 0;
  private nextChatAt = 0;
  private jumpUntil = 0;
  private connected = false;

  constructor(config: AgentConfig & { name: string; avatarSeed: number }) {
    this.client = new Client(config.serverUrl);
    this.name = config.name;
    this.avatarSeed = config.avatarSeed;
    this.chatEnabled = config.chatEnabled;
    this.style = getAgentStyle(config.avatarSeed);
  }

  async connect() {
    const room = await this.client.joinOrCreate(ROOM_NAME, {
      name: this.name,
      identityType: "agent",
      avatarSeed: this.avatarSeed,
    });

    this.room = room;
    this.connected = true;
    this.nextChatAt = Date.now() + 3000 + randomRange(0, 4000);

    room.onStateChange((state) => {
      const next = new Map<string, PlayerSnapshot>();
      state.players.forEach((player: RuntimePlayer, sessionId: string) => {
        next.set(sessionId, {
          sessionId,
          name: player.name,
          identityType: player.identityType,
          walletAddress: player.walletAddress,
          avatarSeed: player.avatarSeed,
          level: player.level,
          xp: player.xp,
          talentPoints: player.talentPoints,
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
          quests: snapshotQuests(player.quests),
          inventory: snapshotInventory(player.inventory),
          equipment: snapshotEquipment(player.equipment),
          talents: snapshotTalents(player.talents),
        });
      });
      this.players = next;

      const nextNpcs = new Map<string, NpcSnapshot>();
      state.npcs?.forEach((npc: RuntimeNpc, id: string) => {
        nextNpcs.set(id, {
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
        });
      });
      this.npcs = nextNpcs;
    });

    room.onMessage("chat", (message: ChatMessage) => {
      this.recentChat = [...this.recentChat.slice(-12), message];
    });

    room.onLeave(() => {
      this.connected = false;
      this.stop();
    });

    this.inputTimer = setInterval(() => this.tick(), 1000 / INPUT_SEND_RATE);
    console.log(`${this.name} joined ${ROOM_NAME} as ${room.sessionId}`);
  }

  async leave() {
    this.stop();
    await this.room?.leave();
  }

  private stop() {
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = null;
  }

  private tick() {
    if (!this.room || !this.connected) return;

    const observation = this.observe();
    if (!observation) return;

    const now = Date.now();
    if (now >= this.nextDecisionAt) {
      this.decide(observation, now);
      this.nextDecisionAt = now + AGENT.decisionIntervalMs + randomRange(0, 260);
    }

    const input = this.buildInput(observation.self, now);
    this.room.send("input", input);
  }

  private observe(): AgentObservation | null {
    const self = this.room ? this.players.get(this.room.sessionId) : undefined;
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
      availableActions: ["move", "look", "jump", "sprint", "chat", "interact", "attack", "shoot", "signalShot", "fireblast", "frostNova", "heal", "taunt", "whirlwind", "multishot", "iceBlast"],
    };
  }

  private decide(observation: AgentObservation, now: number) {
    const nearestQuestNpc = observation.nearbyNpcs.find((npc) => npc.role === "quest_giver" && npc.distance < 3.2);
    if (nearestQuestNpc && Math.random() < 0.18) {
      this.target = null;
      this.yaw = Math.atan2(nearestQuestNpc.x - observation.self.x, nearestQuestNpc.z - observation.self.z);
      this.room?.send("interact", { npcId: nearestQuestNpc.id });
      this.nextChatAt = Math.max(this.nextChatAt, now + 2500);
      return;
    }

    const nearest = observation.nearbyPlayers[0];
    if (nearest && nearest.distance < 4.4) {
      this.target = null;
      this.yaw = Math.atan2(nearest.x - observation.self.x, nearest.z - observation.self.z);
      this.maybeChat(observation, now, nearest.name);
      if (Math.random() < 0.08) this.jumpUntil = now + 260;
      return;
    }

    if (!this.target || distanceToPoint(observation.self, this.target) < 1.3) {
      this.target = chooseTownPoint();
    }

    if (Math.random() < 0.025) this.jumpUntil = now + 260;
    this.maybeChat(observation, now);
  }

  private buildInput(self: PlayerSnapshot, now: number): ClientInput {
    let x = 0;
    let z = 0;

    if (this.target) {
      const dx = this.target.x - self.x;
      const dz = this.target.z - self.z;
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
      sprint: false,
      jump: now < this.jumpUntil,
    };
  }

  private maybeChat(observation: AgentObservation, now: number, nearbyName?: string) {
    if (!this.chatEnabled || !this.room) return;
    if (now < this.nextChatAt) return;

    const text = chooseAmbientLine(observation, this.style, nearbyName).slice(0, CHAT.maxLength);
    this.room.send("chat", { text });
    this.nextChatAt = now + 12000 + randomRange(0, 10000);
  }
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
  "red-eye farm again",
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

function chooseAmbientLine(observation: AgentObservation, style: AmbientStyle, nearbyName?: string) {
  if (nearbyName) {
    const nearbyLines = [
      `gm ${nearbyName}`,
      `${nearbyName} made it out here`,
      "good to see a live mfer",
    ];
    return pickLine(nearbyLines);
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

function readConfig(): AgentConfig {
  return {
    serverUrl: process.env.AGENT_SERVER_URL ?? "ws://localhost:2567",
    count: readPositiveInt(process.env.AGENT_COUNT, 1),
    baseName: cleanName(process.env.AGENT_NAME ?? "mfer-agent"),
    chatEnabled: process.env.AGENT_CHAT !== "0",
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

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function cleanName(value: string) {
  return value.replace(/[^\w .$-]/g, "").trim().slice(0, 18) || "mfer-agent";
}

function chooseTownPoint(): Point {
  const margin = 2.5;
  return {
    x: randomRange(PLAZA_BOUNDS.minX + margin, PLAZA_BOUNDS.maxX - margin),
    z: randomRange(PLAZA_BOUNDS.minZ + margin, PLAZA_BOUNDS.maxZ - margin),
  };
}

function distance2d(a: Pick<PlayerSnapshot, "x" | "z">, b: Pick<PlayerSnapshot, "x" | "z">) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distanceToPoint(player: Pick<PlayerSnapshot, "x" | "z">, point: Point) {
  return Math.hypot(player.x - point.x, player.z - point.z);
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
  await Promise.all(agents.map((agent) => agent.leave()));
  process.exit(0);
}

async function main() {
  for (let index = 0; index < config.count; index += 1) {
    const name = config.count === 1 ? config.baseName : `${config.baseName}-${index + 1}`;
    const agent = new AgentCharacter({
      ...config,
      name,
      avatarSeed: stableHash(`agent:${name}`),
    });
    agents.push(agent);
    await agent.connect();
    await delay(350);
  }
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

await main();

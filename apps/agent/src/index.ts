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
  type IdentityType,
  type NpcModel,
  type NpcRole,
  type NpcSnapshot,
  type PlayerSnapshot,
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

type RuntimePlayer = {
  name: string;
  identityType: IdentityType;
  walletAddress: string;
  avatarSeed: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: PlayerSnapshot["animation"];
  lastSeq: number;
  attackReadyAt: number;
  shootReadyAt: number;
  fireblastReadyAt: number;
  castingAction: CombatActionId | "";
  castStartedAt: number;
  castEndsAt: number;
};

type RuntimeNpc = {
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
  animation: PlayerSnapshot["animation"];
  dialogue: string;
  questId: string;
  defeatedAt: number;
  despawnAt: number;
};

const config = readConfig();
const agents: AgentCharacter[] = [];

class AgentCharacter {
  private readonly client: Client;
  private readonly name: string;
  private readonly avatarSeed: number;
  private readonly chatEnabled: boolean;
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
          health: player.health,
          maxHealth: player.maxHealth,
          mana: player.mana,
          maxMana: player.maxMana,
          x: player.x,
          y: player.y,
          z: player.z,
          yaw: player.yaw,
          animation: player.animation,
          lastSeq: player.lastSeq,
          attackReadyAt: player.attackReadyAt,
          shootReadyAt: player.shootReadyAt,
          fireblastReadyAt: player.fireblastReadyAt,
          castingAction: player.castingAction,
          castStartedAt: player.castStartedAt,
          castEndsAt: player.castEndsAt,
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
      availableActions: ["move", "look", "jump", "sprint", "chat", "interact", "attack", "shoot", "fireblast"],
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

    const prompts = [
      "gm mfers",
      "checking the plaza",
      "nice roof upgrade",
      nearbyName ? `gm ${nearbyName}` : "patrolling town",
      observation.nearbyPlayers.length > 1 ? "busy town today" : "quiet vibes",
      observation.nearbyNpcs.length > 0 ? `checking in with ${observation.nearbyNpcs[0].name}` : "looking for quests",
    ];
    const text = prompts[Math.floor(Math.random() * prompts.length)].slice(0, CHAT.maxLength);
    this.room.send("chat", { text });
    this.nextChatAt = now + 12000 + randomRange(0, 10000);
  }
}

function readConfig(): AgentConfig {
  return {
    serverUrl: process.env.AGENT_SERVER_URL ?? "ws://localhost:2567",
    count: readPositiveInt(process.env.AGENT_COUNT, 1),
    baseName: cleanName(process.env.AGENT_NAME ?? "mfer-agent"),
    chatEnabled: process.env.AGENT_CHAT !== "0",
  };
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

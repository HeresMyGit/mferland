import { createServer } from "node:http";
import { Room, Server, type Client } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  CHAT,
  clamp,
  makeGuestName,
  MAX_PLAYERS,
  PLAYER,
  PLAZA_BOUNDS,
  ROOM_NAME,
  sanitizePlayerName,
  SERVER_TICK_RATE,
  stableHash,
  type AnimationState,
  type ChatMessage,
  type ClientInteract,
  type ClientInput,
  type IdentityType,
  type JoinOptions,
  type NpcRole,
} from "@mferland/shared";

class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") identityType: IdentityType = "guest";
  @type("string") walletAddress = "";
  @type("number") avatarSeed = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("number") verticalVelocity = 0;
  @type("string") animation: AnimationState = "idle";
  @type("number") lastSeq = 0;
}

class NpcState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") role: NpcRole = "wanderer";
  @type("number") avatarSeed = 0;
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
}

class TownState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
}

type TrackedInput = ClientInput & {
  receivedAt: number;
};

class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();

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

      npc.yaw = Math.atan2(player.x - npc.x, player.z - npc.z);
      npc.animation = "idle";

      const payload: ChatMessage = {
        sessionId: npc.id,
        name: npc.name,
        identityType: "npc",
        text: getNpcDialogue(npc, player),
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

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    updateNpcs(this.state.npcs, delta, now);

    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      const activeInput = input && now - input.receivedAt < 1000 ? input : null;
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
      player.x = clamp(player.x + nx * speed * delta, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX);
      player.z = clamp(player.z + nz * speed * delta, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ);
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
    x: number;
    z: number;
    yaw: number;
    leashRadius: number;
    dialogue: string;
    questId?: string;
  }> = [
    {
      id: "og-mfer",
      name: "OG mfer",
      role: "quest_giver",
      x: -4.2,
      z: 3.9,
      yaw: 2.3,
      leashRadius: 1.1,
      dialogue: "Quest: say gm in chat, then meet me by the fountain.",
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
      dialogue: "Quest: check the DAO hall and report back when proposals go live.",
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
      dialogue: "Shop is warming up. Soon you can try fits before minting or buying.",
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
      role: "wanderer",
      x: -7.5,
      z: -2.8,
      yaw: 1.6,
      leashRadius: 7.5,
      dialogue: "Daily vibes quest: chill by the fountain for a minute.",
    },
  ];

  for (const spec of specs) {
    const npc = new NpcState();
    npc.id = spec.id;
    npc.name = spec.name;
    npc.role = spec.role;
    npc.avatarSeed = stableHash(`npc:${spec.id}`);
    npc.x = spec.x;
    npc.y = 0;
    npc.z = spec.z;
    npc.yaw = spec.yaw;
    npc.animation = "idle";
    npc.dialogue = spec.dialogue;
    npc.questId = spec.questId ?? "";
    npc.homeX = spec.x;
    npc.homeZ = spec.z;
    npc.targetX = spec.x;
    npc.targetZ = spec.z;
    npc.leashRadius = spec.leashRadius;
    npc.nextDecisionAt = Date.now() + randomRange(1000, 5000);
    npcs.set(npc.id, npc);
  }
}

function updateNpcs(npcs: MapSchema<NpcState>, delta: number, now: number) {
  npcs.forEach((npc) => {
    const canWander = npc.role === "wanderer" || npc.role === "guard";
    const canPace = npc.role === "quest_giver" || npc.role === "merchant";
    const shouldPickTarget = now >= npc.nextDecisionAt
      || Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) < 0.35;

    if (shouldPickTarget) {
      if (canWander || (canPace && Math.random() < 0.35)) {
        const target = getNpcWanderTarget(npc);
        npc.targetX = target.x;
        npc.targetZ = target.z;
      } else {
        npc.targetX = npc.homeX;
        npc.targetZ = npc.homeZ;
      }
      npc.nextDecisionAt = now + randomRange(canWander ? 1800 : 3500, canWander ? 5200 : 9000);
    }

    const dx = npc.targetX - npc.x;
    const dz = npc.targetZ - npc.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      npc.animation = "idle";
      return;
    }

    const speed = npc.role === "guard" ? 2.35 : 1.85;
    const step = Math.min(distance, speed * delta);
    npc.x = clamp(npc.x + (dx / distance) * step, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX);
    npc.z = clamp(npc.z + (dz / distance) * step, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ);
    npc.yaw = Math.atan2(dx, dz);
    npc.animation = "walk";
  });
}

function getNpcWanderTarget(npc: NpcState) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * npc.leashRadius;
  return {
    x: clamp(npc.homeX + Math.cos(angle) * radius, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX),
    z: clamp(npc.homeZ + Math.sin(angle) * radius, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ),
  };
}

function findInteractNpc(player: PlayerState, npcs: MapSchema<NpcState>, requestedNpcId?: string) {
  const requested = typeof requestedNpcId === "string" ? npcs.get(requestedNpcId) : undefined;
  if (requested && distanceToNpc(player, requested) <= 3.25) return requested;

  let nearest: NpcState | null = null;
  let nearestDistance = Infinity;
  npcs.forEach((npc) => {
    const distance = distanceToNpc(player, npc);
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  });

  return nearestDistance <= 3.25 ? nearest : null;
}

function distanceToNpc(player: PlayerState, npc: NpcState) {
  return Math.hypot(player.x - npc.x, player.z - npc.z);
}

function getNpcDialogue(npc: NpcState, player: PlayerState) {
  if (npc.role === "quest_giver" && npc.questId) {
    return `${player.name}, ${npc.dialogue}`;
  }
  return npc.dialogue;
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

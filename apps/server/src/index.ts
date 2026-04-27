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
  type ClientInput,
  type IdentityType,
  type JoinOptions,
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

class TownState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

type TrackedInput = ClientInput & {
  receivedAt: number;
};

class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();

  onCreate() {
    this.setState(new TownState());
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
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
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

function getSpawnPoint(index: number) {
  const ring = 5 + Math.floor(index / 8) * 2.2;
  const angle = (index % 8) / 8 * Math.PI * 2;
  return {
    x: Math.cos(angle) * ring,
    z: Math.sin(angle) * ring,
    yaw: angle + Math.PI,
  };
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

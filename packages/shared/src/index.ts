export const ROOM_NAME = "town";
export const MAX_PLAYERS = 40;
export const SERVER_TICK_RATE = 20;
export const INPUT_SEND_RATE = 20;

export const PLAZA_BOUNDS = {
  minX: -26,
  maxX: 26,
  minZ: -22,
  maxZ: 22,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 6.4,
  jumpVelocity: 6.4,
  gravity: 17,
  radius: 0.55,
};

export const CHAT = {
  maxLength: 180,
  minIntervalMs: 1200,
};

export const AGENT = {
  observationRadius: 14,
  decisionIntervalMs: 650,
};

export type IdentityType = "guest" | "wallet" | "agent";
export type SpeakerType = IdentityType | "npc";
export type AnimationState = "idle" | "walk" | "run" | "jump";
export type NpcRole = "wanderer" | "quest_giver" | "merchant" | "guard";

export type JoinOptions = {
  name?: string;
  identityType?: IdentityType;
  walletAddress?: string;
  avatarSeed?: number;
};

export type ClientInput = {
  seq: number;
  x: number;
  z: number;
  yaw: number;
  sprint?: boolean;
  jump?: boolean;
};

export type PlayerSnapshot = {
  sessionId: string;
  name: string;
  identityType: IdentityType;
  walletAddress: string;
  avatarSeed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  lastSeq: number;
};

export type NpcSnapshot = {
  id: string;
  name: string;
  role: NpcRole;
  avatarSeed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  dialogue: string;
  questId: string;
};

export type ChatMessage = {
  sessionId: string;
  name: string;
  identityType: SpeakerType;
  text: string;
  sentAt: number;
};

export type AgentVisiblePlayer = Pick<
  PlayerSnapshot,
  "sessionId" | "name" | "identityType" | "avatarSeed" | "x" | "y" | "z" | "yaw" | "animation"
> & {
  distance: number;
};

export type AgentVisibleNpc = Pick<
  NpcSnapshot,
  "id" | "name" | "role" | "avatarSeed" | "x" | "y" | "z" | "yaw" | "animation" | "dialogue" | "questId"
> & {
  distance: number;
};

export type ClientInteract = {
  npcId?: string;
};

export type AgentObservation = {
  self: PlayerSnapshot;
  nearbyPlayers: AgentVisiblePlayer[];
  nearbyNpcs: AgentVisibleNpc[];
  recentChat: ChatMessage[];
  bounds: typeof PLAZA_BOUNDS;
  availableActions: Array<"move" | "look" | "jump" | "sprint" | "chat" | "interact">;
};

export function sanitizePlayerName(input: unknown, fallback = "mfer"): string {
  const text = typeof input === "string" ? input : "";
  const cleaned = text
    .replace(/[^\w .$-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

  return cleaned || fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeGuestName(seed: string): string {
  return `mfer#${String(stableHash(seed) % 10000).padStart(4, "0")}`;
}

import {
  CHAT,
  makeGuestName,
  stableHash,
  type ClientInput,
  type IdentityType,
  type JoinOptions,
} from "@mferland/shared";

const INTRO_SPAWN_POINTS = [
  { x: 0, z: 10.8, yaw: Math.PI },
  { x: 2.8, z: 9.8, yaw: Math.PI },
  { x: -2.8, z: 9.8, yaw: Math.PI },
  { x: 5.2, z: 8.2, yaw: Math.PI },
  { x: -5.2, z: 8.2, yaw: Math.PI },
  { x: 1.5, z: 13, yaw: Math.PI },
  { x: -1.5, z: 13, yaw: Math.PI },
  { x: 0, z: 15.2, yaw: Math.PI },
] as const;

export function normalizeInput(message: Partial<ClientInput>): ClientInput | null {
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

export function sanitizeChatText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, CHAT.maxLength);
}

export function getIdentityType(options: JoinOptions | undefined, walletAddress: string): IdentityType {
  if (walletAddress) return "wallet";
  if (options?.identityType === "agent") return "agent";
  return options?.identityType === "wallet" ? "wallet" : "guest";
}

export function getDefaultName(identityType: IdentityType, walletAddress: string, sessionId: string): string {
  if (identityType === "wallet" && walletAddress) {
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }
  if (identityType === "agent") {
    return `agent#${String(stableHash(sessionId) % 1000).padStart(3, "0")}`;
  }
  return makeGuestName(sessionId);
}

export function getSpawnPoint(index: number) {
  const introPoint = INTRO_SPAWN_POINTS[index % INTRO_SPAWN_POINTS.length];
  if (index < INTRO_SPAWN_POINTS.length) return introPoint;

  const ring = 5 + Math.floor(index / 8) * 2.2;
  const angle = (index % 8) / 8 * Math.PI * 2;
  return {
    x: Math.cos(angle) * ring,
    z: Math.sin(angle) * ring,
    yaw: angle + Math.PI,
  };
}

export function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

import {
  makeGuestName,
  normalizeWalletAddress,
  stableHash,
  type JoinOptions,
  type WalletCharacterProfileResponse,
} from "@mferland/shared";

const GUEST_ID_KEY = "mferland.guestId";
const NAME_KEY = "mferland.name";
const INVITE_CODE_KEY = "mferland.inviteCode";

export function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;

  const id = makeGuestId();
  localStorage.setItem(GUEST_ID_KEY, id);
  return id;
}

export function getStoredName(): string {
  const guestId = getOrCreateGuestId();
  return localStorage.getItem(NAME_KEY) || makeGuestName(guestId);
}

export function rememberName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

export function getStoredInviteCode(): string {
  return localStorage.getItem(INVITE_CODE_KEY) || "";
}

export function rememberInviteCode(inviteCode: string) {
  const normalized = inviteCode.trim();
  if (normalized) localStorage.setItem(INVITE_CODE_KEY, normalized);
}

export function makeGuestIdentity(name: string): JoinOptions {
  const guestId = getOrCreateGuestId();
  return {
    name,
    identityType: "guest",
    avatarSeed: stableHash(`${guestId}:${name}`),
    inviteCode: getStoredInviteCode(),
  };
}

export function makeWalletIdentity(
  name: string,
  walletAddress: string,
  avatarSeed = stableHash(`${walletAddress}:${name}`),
  createCharacter = false,
): JoinOptions {
  return {
    name,
    identityType: "wallet",
    walletAddress,
    avatarSeed,
    createCharacter,
    inviteCode: getStoredInviteCode(),
  };
}

export async function fetchWalletCharacterProfile(walletAddress: string): Promise<WalletCharacterProfileResponse> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return { exists: false, character: null };

  const url = new URL("/wallet-character", getServerHttpBaseUrl());
  url.searchParams.set("wallet", normalizedWallet);
  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as Partial<WalletCharacterProfileResponse> & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "wallet persistence unavailable");
  }
  return {
    exists: Boolean(payload?.exists && payload.character),
    character: payload?.character ?? null,
  };
}

function makeGuestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = crypto.getRandomValues(new Uint32Array(4));
    return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("-");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getServerHttpBaseUrl() {
  const configured = import.meta.env.VITE_SERVER_URL ? String(import.meta.env.VITE_SERVER_URL) : "";
  if (configured) return configured.replace(/^ws/i, "http");

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  if (isLocalDevWebHost(window.location.hostname, window.location.port)) {
    return `${protocol}://${window.location.hostname}:2567`;
  }
  return `${protocol}://${window.location.host}`;
}

function isLocalDevWebHost(hostname: string, port: string) {
  return (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") && port !== "2567";
}

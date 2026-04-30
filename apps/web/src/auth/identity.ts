import { makeGuestName, stableHash, type JoinOptions } from "@mferland/shared";

const GUEST_ID_KEY = "mferland.guestId";
const NAME_KEY = "mferland.name";

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

export function makeGuestIdentity(name: string): JoinOptions {
  const guestId = getOrCreateGuestId();
  return {
    name,
    identityType: "guest",
    avatarSeed: stableHash(`${guestId}:${name}`),
  };
}

export function makeWalletIdentity(name: string, walletAddress: string): JoinOptions {
  return {
    name,
    identityType: "wallet",
    walletAddress,
    avatarSeed: stableHash(`${walletAddress}:${name}`),
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

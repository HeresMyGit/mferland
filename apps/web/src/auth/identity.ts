import { makeGuestName, stableHash, type JoinOptions } from "@mferland/shared";

const GUEST_ID_KEY = "mferland.guestId";
const NAME_KEY = "mferland.name";

export function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
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

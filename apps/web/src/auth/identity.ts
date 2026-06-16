import {
  makeGuestName,
  normalizeAvatarSeed,
  normalizeWalletAddress,
  stableHash,
  type JoinOptions,
  type WalletAuthChallengeResponse,
  type WalletAuthProof,
  type WalletCharacterProfileResponse,
} from "@mferland/shared";

const GUEST_ID_KEY = "mferland.guestId";
const NAME_KEY = "mferland.name";
const INVITE_CODE_KEY = "mferland.inviteCode";
const REFERRAL_WALLET_KEY = "mferland.referralWallet";
const REFERRAL_INVITE_BASE_URL = "https://game.mfergpt.lol/";

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

export function getStoredReferralWalletAddress(): string {
  return localStorage.getItem(REFERRAL_WALLET_KEY) || "";
}

export function rememberReferralWalletAddress(walletAddress: string) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (normalized) localStorage.setItem(REFERRAL_WALLET_KEY, normalized);
}

export function getReferralWalletAddressFromSearch(search: string): string {
  return normalizeWalletAddress(new URLSearchParams(search).get("referral")?.trim());
}

export function makeReferralInviteUrl(walletAddress: string): string {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return "";
  const url = new URL(REFERRAL_INVITE_BASE_URL);
  url.searchParams.set("referral", normalized);
  return url.toString();
}

export function makeGuestIdentity(name: string): JoinOptions {
  const guestId = getOrCreateGuestId();
  return {
    name,
    identityType: "guest",
    avatarSeed: normalizeAvatarSeed(stableHash(`${guestId}:${name}`)),
    inviteCode: getStoredInviteCode(),
  };
}

export function makeWalletIdentity(
  name: string,
  walletAddress: string,
  avatarSeed = stableHash(`${walletAddress}:${name}`),
  createCharacter = false,
  walletAuth?: WalletAuthProof,
  referralWalletAddress = getStoredReferralWalletAddress(),
): JoinOptions {
  return {
    name,
    identityType: "wallet",
    walletAddress,
    walletAuth,
    avatarSeed: normalizeAvatarSeed(avatarSeed),
    createCharacter,
    inviteCode: getStoredInviteCode(),
    referralWalletAddress: createCharacter ? referralWalletAddress : undefined,
  };
}

export async function fetchWalletAuthChallenge(walletAddress: string): Promise<WalletAuthChallengeResponse> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("valid wallet address required");

  const response = await fetch(new URL("/wallet-auth-challenge", getServerHttpBaseUrl()), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress: normalizedWallet }),
  });
  const payload = await response.json().catch(() => null) as Partial<WalletAuthChallengeResponse> | null;
  if (!response.ok || !payload?.ok || !payload.message || !payload.nonce) {
    throw new Error(payload?.error || "wallet verification unavailable");
  }
  return {
    ok: true,
    walletAddress: payload.walletAddress || normalizedWallet,
    nonce: payload.nonce,
    message: payload.message,
    expiresAt: payload.expiresAt || "",
  };
}

export async function fetchWalletCharacterProfile(walletAddress: string): Promise<WalletCharacterProfileResponse> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return { exists: false, character: null };

  const url = new URL("/wallet-character", getServerHttpBaseUrl());
  url.searchParams.set("wallet", normalizedWallet);
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as Partial<WalletCharacterProfileResponse> & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "wallet persistence unavailable");
  }
  return {
    exists: Boolean(payload?.exists && payload.character),
    character: payload?.character ?? null,
    registeredClientKind: payload?.registeredClientKind === "human" || payload?.registeredClientKind === "agent"
      ? payload.registeredClientKind
      : payload?.character?.registeredClientKind ?? "",
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

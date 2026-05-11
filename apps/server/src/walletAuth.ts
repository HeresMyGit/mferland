import { randomBytes } from "node:crypto";
import { normalizeWalletAddress, type WalletAuthChallengeResponse, type WalletAuthProof } from "@mferland/shared";
import { verifyMessage } from "viem";

const WALLET_AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_WALLET_AUTH_CHALLENGES = 1000;
const NONCE_BYTES = 16;

type PendingWalletAuthChallenge = {
  walletAddress: string;
  nonce: string;
  message: string;
  domain: string;
  issuedAt: number;
  expiresAt: number;
};

const pendingWalletAuthChallenges = new Map<string, PendingWalletAuthChallenge>();

export function createWalletAuthChallenge(walletAddress: string, domain: string): WalletAuthChallengeResponse {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return {
      ok: false,
      walletAddress: "",
      nonce: "",
      message: "",
      expiresAt: "",
      error: "valid wallet address required",
    };
  }

  const now = Date.now();
  pruneWalletAuthChallenges(now);

  const nonce = randomBytes(NONCE_BYTES).toString("hex");
  const expiresAt = now + WALLET_AUTH_CHALLENGE_TTL_MS;
  const safeDomain = normalizeWalletAuthDomain(domain);
  const challenge: PendingWalletAuthChallenge = {
    walletAddress: normalizedWallet,
    nonce,
    domain: safeDomain,
    issuedAt: now,
    expiresAt,
    message: makeWalletAuthMessage({
      walletAddress: normalizedWallet,
      nonce,
      domain: safeDomain,
      issuedAt: now,
      expiresAt,
    }),
  };
  pendingWalletAuthChallenges.set(nonce, challenge);
  trimWalletAuthChallenges();

  return {
    ok: true,
    walletAddress: normalizedWallet,
    nonce,
    message: challenge.message,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function verifyWalletAuthProof(walletAddress: string, proof: WalletAuthProof | undefined): Promise<boolean> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet || !isWalletAuthProof(proof)) return false;

  const challenge = pendingWalletAuthChallenges.get(proof.nonce);
  if (!challenge) return false;
  pendingWalletAuthChallenges.delete(proof.nonce);

  if (Date.now() > challenge.expiresAt) return false;
  if (challenge.walletAddress !== normalizedWallet) return false;
  if (challenge.message !== proof.message) return false;

  try {
    return await verifyMessage({
      address: normalizedWallet as `0x${string}`,
      message: challenge.message,
      signature: proof.signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export function normalizeWalletAuthDomain(value: string) {
  const domain = value.trim().toLowerCase().replaceAll(/[^a-z0-9.:[\]-]+/g, "");
  return domain.slice(0, 120) || "mferland";
}

function makeWalletAuthMessage({
  walletAddress,
  nonce,
  domain,
  issuedAt,
  expiresAt,
}: {
  walletAddress: string;
  nonce: string;
  domain: string;
  issuedAt: number;
  expiresAt: number;
}) {
  return [
    "mferland wallet sign-in",
    "",
    "Sign this message to enter mferland with this wallet.",
    "This does not cost gas or grant transaction permissions.",
    "",
    `Wallet: ${walletAddress}`,
    `Domain: ${domain}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
}

function isWalletAuthProof(value: WalletAuthProof | undefined): value is WalletAuthProof {
  if (!value || typeof value !== "object") return false;
  return isNonce(value.nonce)
    && typeof value.message === "string"
    && value.message.length <= 1200
    && /^0x[a-fA-F0-9]{64,}$/.test(value.signature);
}

function isNonce(value: string) {
  return /^[a-f0-9]{32}$/.test(value);
}

function pruneWalletAuthChallenges(now: number) {
  for (const [nonce, challenge] of pendingWalletAuthChallenges) {
    if (now > challenge.expiresAt) pendingWalletAuthChallenges.delete(nonce);
  }
}

function trimWalletAuthChallenges() {
  while (pendingWalletAuthChallenges.size > MAX_PENDING_WALLET_AUTH_CHALLENGES) {
    const oldest = pendingWalletAuthChallenges.keys().next().value;
    if (!oldest) return;
    pendingWalletAuthChallenges.delete(oldest);
  }
}

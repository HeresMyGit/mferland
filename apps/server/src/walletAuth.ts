import { createHash, randomBytes } from "node:crypto";
import {
  normalizeWalletAddress,
  type AgentSessionResponse,
  type WalletAuthChallengeResponse,
  type WalletAuthProof,
} from "@mferland/shared";
import { verifyMessage } from "viem";

const WALLET_AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const AGENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PENDING_WALLET_AUTH_CHALLENGES = 1000;
const MAX_AGENT_SESSIONS = 5000;
const NONCE_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;

type PendingWalletAuthChallenge = {
  walletAddress: string;
  nonce: string;
  message: string;
  domain: string;
  issuedAt: number;
  expiresAt: number;
};

type AgentSession = {
  walletAddress: string;
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
};

export type AgentAuthRecovery =
  | "request_fresh_challenge"
  | "retry_with_complete_proof"
  | "retry_with_exact_challenge_message"
  | "retry_with_valid_signature"
  | "use_matching_wallet"
  | "use_matching_session_token";

export type AgentSessionErrorCode =
  | "valid_wallet_address_required"
  | "missing_or_malformed_proof"
  | "challenge_not_found_or_consumed"
  | "challenge_expired"
  | "wallet_mismatch"
  | "message_mismatch"
  | "invalid_signature"
  | "missing_session_token"
  | "malformed_session_token"
  | "agent_session_not_found_or_expired"
  | "agent_session_wallet_mismatch";

type AgentAuthFailureDiagnostics = {
  walletAddress: string;
  nonce: string;
  messageLength: number;
  messageHashPrefix: string;
  signatureLength: number;
  challengeAgeMs?: number;
  challengeExpiresInMs?: number;
  expectedWalletAddress?: string;
  expectedMessageLength?: number;
  expectedMessageHashPrefix?: string;
};

type AgentAuthFailure = {
  ok: false;
  code: AgentSessionErrorCode;
  recovery: AgentAuthRecovery;
  diagnostics: AgentAuthFailureDiagnostics;
};

export type WalletAuthProofVerification = { ok: true } | AgentAuthFailure;
export type AgentSessionTokenVerification =
  | { ok: true }
  | { ok: false; code: AgentSessionErrorCode; recovery: AgentAuthRecovery };
export type AgentSessionResult = AgentSessionResponse & { diagnostics?: AgentAuthFailureDiagnostics };

const pendingWalletAuthChallenges = new Map<string, PendingWalletAuthChallenge>();
const agentSessions = new Map<string, AgentSession>();

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
  return (await verifyWalletAuthProofDetailed(walletAddress, proof)).ok;
}

export async function verifyWalletAuthProofDetailed(
  walletAddress: string,
  proof: WalletAuthProof | undefined,
): Promise<WalletAuthProofVerification> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const diagnostics = makeAuthDiagnostics(normalizedWallet, proof);
  if (!normalizedWallet) {
    return {
      ok: false,
      code: "valid_wallet_address_required",
      recovery: "request_fresh_challenge",
      diagnostics,
    };
  }
  if (!isWalletAuthProof(proof)) {
    return {
      ok: false,
      code: "missing_or_malformed_proof",
      recovery: "retry_with_complete_proof",
      diagnostics,
    };
  }

  const challenge = pendingWalletAuthChallenges.get(proof.nonce);
  if (!challenge) {
    return {
      ok: false,
      code: "challenge_not_found_or_consumed",
      recovery: "request_fresh_challenge",
      diagnostics,
    };
  }

  const now = Date.now();
  const challengeDiagnostics = {
    ...diagnostics,
    challengeAgeMs: now - challenge.issuedAt,
    challengeExpiresInMs: challenge.expiresAt - now,
    expectedWalletAddress: challenge.walletAddress,
    expectedMessageLength: challenge.message.length,
    expectedMessageHashPrefix: hashTextPrefix(challenge.message),
  };

  if (now > challenge.expiresAt) {
    pendingWalletAuthChallenges.delete(proof.nonce);
    return {
      ok: false,
      code: "challenge_expired",
      recovery: "request_fresh_challenge",
      diagnostics: challengeDiagnostics,
    };
  }
  if (challenge.walletAddress !== normalizedWallet) {
    return {
      ok: false,
      code: "wallet_mismatch",
      recovery: "use_matching_wallet",
      diagnostics: challengeDiagnostics,
    };
  }
  if (challenge.message !== proof.message) {
    return {
      ok: false,
      code: "message_mismatch",
      recovery: "retry_with_exact_challenge_message",
      diagnostics: challengeDiagnostics,
    };
  }

  try {
    const ok = await verifyMessage({
      address: normalizedWallet as `0x${string}`,
      message: challenge.message,
      signature: proof.signature as `0x${string}`,
    });
    if (ok) {
      pendingWalletAuthChallenges.delete(proof.nonce);
      return { ok: true };
    }
  } catch {
    // Fall through to the structured invalid-signature response below.
  }
  return {
    ok: false,
    code: "invalid_signature",
    recovery: "retry_with_valid_signature",
    diagnostics: challengeDiagnostics,
  };
}

export async function createAgentSession(walletAddress: string, proof: WalletAuthProof | undefined): Promise<AgentSessionResult> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return {
      ok: false,
      walletAddress: "",
      sessionToken: "",
      expiresAt: "",
      error: "valid wallet address required",
      code: "valid_wallet_address_required",
      recovery: "request_fresh_challenge",
      diagnostics: makeAuthDiagnostics("", proof),
    };
  }

  const verification = await verifyWalletAuthProofDetailed(normalizedWallet, proof);
  if (!verification.ok) {
    return {
      ok: false,
      walletAddress: normalizedWallet,
      sessionToken: "",
      expiresAt: "",
      error: "valid signed wallet challenge required",
      code: verification.code,
      recovery: verification.recovery,
      diagnostics: verification.diagnostics,
    };
  }

  const now = Date.now();
  pruneAgentSessions(now);
  const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashAgentSessionToken(sessionToken);
  const expiresAt = now + AGENT_SESSION_TTL_MS;
  agentSessions.set(tokenHash, {
    walletAddress: normalizedWallet,
    tokenHash,
    issuedAt: now,
    expiresAt,
  });
  trimAgentSessions();

  return {
    ok: true,
    walletAddress: normalizedWallet,
    sessionToken,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyAgentSessionToken(walletAddress: string, sessionToken: string | undefined): boolean {
  return verifyAgentSessionTokenDetailed(walletAddress, sessionToken).ok;
}

export function verifyAgentSessionTokenDetailed(
  walletAddress: string,
  sessionToken: string | undefined,
): AgentSessionTokenVerification {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return { ok: false, code: "valid_wallet_address_required", recovery: "request_fresh_challenge" };
  }
  const rawToken = typeof sessionToken === "string" ? sessionToken.trim() : "";
  if (!rawToken) {
    return { ok: false, code: "missing_session_token", recovery: "request_fresh_challenge" };
  }
  const normalizedToken = normalizeAgentSessionToken(rawToken);
  if (!normalizedToken) {
    return { ok: false, code: "malformed_session_token", recovery: "request_fresh_challenge" };
  }

  const now = Date.now();
  pruneAgentSessions(now);
  const tokenHash = hashAgentSessionToken(normalizedToken);
  const session = agentSessions.get(tokenHash);
  if (!session) {
    return { ok: false, code: "agent_session_not_found_or_expired", recovery: "request_fresh_challenge" };
  }
  if (now > session.expiresAt) {
    agentSessions.delete(tokenHash);
    return { ok: false, code: "agent_session_not_found_or_expired", recovery: "request_fresh_challenge" };
  }
  if (session.walletAddress !== normalizedWallet) {
    return { ok: false, code: "agent_session_wallet_mismatch", recovery: "use_matching_session_token" };
  }
  return { ok: true };
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

function makeAuthDiagnostics(walletAddress: string, proof: WalletAuthProof | undefined): AgentAuthFailureDiagnostics {
  const nonce = typeof proof?.nonce === "string" ? proof.nonce : "";
  const message = typeof proof?.message === "string" ? proof.message : "";
  const signature = typeof proof?.signature === "string" ? proof.signature : "";
  return {
    walletAddress,
    nonce,
    messageLength: message.length,
    messageHashPrefix: message ? hashTextPrefix(message) : "",
    signatureLength: signature.length,
  };
}

function hashTextPrefix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeAgentSessionToken(value: string | undefined) {
  const token = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{43,128}$/.test(token) ? token : "";
}

function hashAgentSessionToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

function pruneAgentSessions(now: number) {
  for (const [tokenHash, session] of agentSessions) {
    if (now > session.expiresAt) agentSessions.delete(tokenHash);
  }
}

function trimAgentSessions() {
  while (agentSessions.size > MAX_AGENT_SESSIONS) {
    const oldest = agentSessions.keys().next().value;
    if (!oldest) return;
    agentSessions.delete(oldest);
  }
}

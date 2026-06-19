import { normalizeWalletAddress } from "@mferland/shared";

export type SeasonReferralSummary = {
  ok: true;
  seasonId: string;
  walletAddress: string;
  generatedAt: string;
  inviteUrl: string;
  limits: {
    activationPoints: number;
    bonusRatePercent: number;
    maxBonusPoints: number;
    maxReferees: number;
  };
  referredBy: {
    walletAddress: string;
    characterName: string;
    status: "pending" | "active";
    activatedAt: string;
    activationProgressPoints: number;
    refereeBonusPoints: number;
  } | null;
  referralCount: number;
  activatedReferralCount: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
  referrals: SeasonReferralSummaryRow[];
};

export type SeasonReferralSummaryRow = {
  refereeWalletAddress: string;
  characterName: string;
  status: "pending" | "active";
  activatedAt: string;
  activationProgressPoints: number;
  postActivationBasePoints: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
};

export async function fetchSeasonReferralSummary(walletAddress: string): Promise<SeasonReferralSummary> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("valid wallet required");

  const url = new URL("/season/referrals", getServerHttpBaseUrl());
  url.searchParams.set("wallet", normalizedWallet);
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    throw new Error(getReferralSummaryErrorMessage(payload, response.status));
  }
  return normalizeSeasonReferralSummary(payload, normalizedWallet);
}

function normalizeSeasonReferralSummary(value: Record<string, unknown>, walletAddress: string): SeasonReferralSummary {
  const limits = isRecord(value.limits) ? value.limits : {};
  return {
    ok: true,
    seasonId: toStringValue(value.seasonId) || "season-0",
    walletAddress: normalizeWalletAddress(value.walletAddress) || walletAddress,
    generatedAt: toStringValue(value.generatedAt),
    inviteUrl: toStringValue(value.inviteUrl),
    limits: {
      activationPoints: toNumber(limits.activationPoints),
      bonusRatePercent: toNumber(limits.bonusRatePercent),
      maxBonusPoints: toNumber(limits.maxBonusPoints),
      maxReferees: toNumber(limits.maxReferees),
    },
    referredBy: normalizeReferredBy(value.referredBy),
    referralCount: toNumber(value.referralCount),
    activatedReferralCount: toNumber(value.activatedReferralCount),
    referrerBonusPoints: toNumber(value.referrerBonusPoints),
    refereeBonusPoints: toNumber(value.refereeBonusPoints),
    referrals: Array.isArray(value.referrals)
      ? value.referrals.map(normalizeReferralRow).filter((row): row is SeasonReferralSummaryRow => Boolean(row))
      : [],
  };
}

function normalizeReferredBy(value: unknown): SeasonReferralSummary["referredBy"] {
  if (!isRecord(value)) return null;
  return {
    walletAddress: normalizeWalletAddress(value.walletAddress),
    characterName: toStringValue(value.characterName) || "mfer",
    status: value.status === "active" ? "active" : "pending",
    activatedAt: toStringValue(value.activatedAt),
    activationProgressPoints: toNumber(value.activationProgressPoints),
    refereeBonusPoints: toNumber(value.refereeBonusPoints),
  };
}

function normalizeReferralRow(value: unknown): SeasonReferralSummaryRow | null {
  if (!isRecord(value)) return null;
  return {
    refereeWalletAddress: normalizeWalletAddress(value.refereeWalletAddress),
    characterName: toStringValue(value.characterName) || "mfer",
    status: value.status === "active" ? "active" : "pending",
    activatedAt: toStringValue(value.activatedAt),
    activationProgressPoints: toNumber(value.activationProgressPoints),
    postActivationBasePoints: toNumber(value.postActivationBasePoints),
    referrerBonusPoints: toNumber(value.referrerBonusPoints),
    refereeBonusPoints: toNumber(value.refereeBonusPoints),
  };
}

function getReferralSummaryErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && typeof payload.error === "string" && payload.error) return payload.error;
  if (status === 503) return "referral database unavailable";
  return `referral request failed (${status})`;
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

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

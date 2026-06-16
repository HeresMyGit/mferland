import {
  SEASON_0_REFERRAL_ACTIVATION_POINTS,
  SEASON_0_REFERRAL_MAX_BONUS_POINTS,
  SEASON_0_REFERRAL_MAX_REFEREES,
  getSeason0ReferralBonusTargetPoints,
  normalizeWalletAddress,
} from "@mferland/shared";

export type SeasonReferralStatus = "pending" | "active";

export type SeasonReferralCreateDecision = {
  ok: boolean;
  reason:
    | "ok"
    | "invalid_wallet"
    | "self_referral"
    | "existing_referee"
    | "missing_referrer"
    | "agent_referrer"
    | "agent_referee"
    | "max_referees";
  referrerWalletAddress: string;
  refereeWalletAddress: string;
};

export function getSeasonReferralCreateDecision({
  referrerWalletAddress,
  refereeWalletAddress,
  existingRefereeReferral = false,
  referrerExists = true,
  referrerIsAgent = false,
  refereeIsAgent = false,
  referrerReferralCount = 0,
}: {
  referrerWalletAddress: string;
  refereeWalletAddress: string;
  existingRefereeReferral?: boolean;
  referrerExists?: boolean;
  referrerIsAgent?: boolean;
  refereeIsAgent?: boolean;
  referrerReferralCount?: number;
}): SeasonReferralCreateDecision {
  const normalizedReferrer = normalizeWalletAddress(referrerWalletAddress);
  const normalizedReferee = normalizeWalletAddress(refereeWalletAddress);
  const base = {
    referrerWalletAddress: normalizedReferrer,
    refereeWalletAddress: normalizedReferee,
  };
  if (!normalizedReferrer || !normalizedReferee) return { ok: false, reason: "invalid_wallet", ...base };
  if (normalizedReferrer === normalizedReferee) return { ok: false, reason: "self_referral", ...base };
  if (existingRefereeReferral) return { ok: false, reason: "existing_referee", ...base };
  if (!referrerExists) return { ok: false, reason: "missing_referrer", ...base };
  if (referrerIsAgent) return { ok: false, reason: "agent_referrer", ...base };
  if (refereeIsAgent) return { ok: false, reason: "agent_referee", ...base };
  if (Math.max(0, Math.floor(referrerReferralCount)) >= SEASON_0_REFERRAL_MAX_REFEREES) {
    return { ok: false, reason: "max_referees", ...base };
  }
  return { ok: true, reason: "ok", ...base };
}

export function getSeasonReferralProgressUpdate({
  status,
  activatedAt,
  postActivationBasePoints,
  totalEligibleBasePoints,
  awardedPoints,
  now,
}: {
  status: SeasonReferralStatus;
  activatedAt: Date | null;
  postActivationBasePoints: number;
  totalEligibleBasePoints: number;
  awardedPoints: number;
  now: Date;
}) {
  const points = Math.max(0, Math.floor(awardedPoints));
  const totalEligible = Math.max(0, Math.floor(totalEligibleBasePoints));
  const previousEligible = Math.max(0, totalEligible - points);
  const wasActive = status === "active";
  const activatesNow = !wasActive
    && previousEligible < SEASON_0_REFERRAL_ACTIVATION_POINTS
    && totalEligible >= SEASON_0_REFERRAL_ACTIVATION_POINTS;
  const shouldCountAward = wasActive || (!wasActive && previousEligible >= SEASON_0_REFERRAL_ACTIVATION_POINTS);
  const nextStatus: SeasonReferralStatus = wasActive || activatesNow || shouldCountAward ? "active" : "pending";

  return {
    nextStatus,
    nextActivatedAt: activatedAt ?? (nextStatus === "active" ? now : null),
    nextPostActivationBasePoints: shouldCountAward
      ? Math.max(0, Math.floor(postActivationBasePoints)) + points
      : Math.max(0, Math.floor(postActivationBasePoints)),
    shouldCountAward,
  };
}

export function isSeasonReferralEligibleBaseAward({
  sourceType,
  isAgent,
  walletIsAgent,
  awardedPoints,
}: {
  sourceType: string;
  isAgent: boolean;
  walletIsAgent: boolean;
  awardedPoints: number;
}) {
  const points = Math.max(0, Math.floor(awardedPoints));
  return points > 0
    && !isAgent
    && !walletIsAgent
    && (sourceType === "quest" || sourceType === "event");
}

export function getSeasonReferralBonusDelta({
  postActivationBasePoints,
  referrerBonusPoints,
  refereeBonusPoints,
  referrerCapacity,
  refereeCapacity,
}: {
  postActivationBasePoints: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
  referrerCapacity: number;
  refereeCapacity: number;
}) {
  const safeReferrerBonus = Math.max(0, Math.floor(referrerBonusPoints));
  const safeRefereeBonus = Math.max(0, Math.floor(refereeBonusPoints));
  const targetBonusPoints = getSeason0ReferralBonusTargetPoints(postActivationBasePoints);
  const dueBonusPoints = Math.max(
    0,
    Math.min(
      targetBonusPoints - safeReferrerBonus,
      targetBonusPoints - safeRefereeBonus,
      SEASON_0_REFERRAL_MAX_BONUS_POINTS - safeReferrerBonus,
      SEASON_0_REFERRAL_MAX_BONUS_POINTS - safeRefereeBonus,
    ),
  );
  return Math.min(
    dueBonusPoints,
    Math.max(0, Math.floor(referrerCapacity)),
    Math.max(0, Math.floor(refereeCapacity)),
  );
}

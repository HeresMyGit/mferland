import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Clock3, Crown, Flame, RefreshCw, ShieldCheck, Users } from "lucide-react";
import {
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_ID,
  SEASON_0_REFERRAL_MAX_REFEREES,
  SEASON_0_TOTAL_POINT_CAP,
  normalizeAvatarSeed,
  normalizeMferAppearanceTraits,
  type MferAppearanceTraits,
} from "@mferland/shared";
import { MferPortrait } from "./components/MferPortrait";
import { resolveMferTraitsForPlayer } from "./game/mferTraits";

type LeaderboardMode = "seasonPoints" | "totalXp";

type LeaderboardEntry = {
  rank: number;
  walletAddress: string;
  characterName: string;
  clientKind: "human" | "agent" | "";
  avatarSeed: number;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  seasonPoints: number;
  dailyPoints: number;
  pendingPoints: number;
  approvedPoints: number;
  distributedPoints: number;
  events: number;
  lastEventAt: string;
  referralCount: number;
  activatedReferralCount: number;
  referralBonusPoints: number;
};

type LeaderboardSnapshot = {
  ok: true;
  seasonId: string;
  mode: LeaderboardMode;
  generatedAt: string;
  dailyPointCap: number;
  totalPointCap: number;
  totalEntries: number;
  totalSeasonPoints: number;
  totalXp: number;
  entries: LeaderboardEntry[];
};

type MferGptBurnStats = {
  ok: true;
  generatedAt: string;
  symbol: string;
  totalSupplyLabel: string;
  burnBalanceLabel: string;
  burnPercentLabel: string;
  mferlandTracked: {
    configured: boolean;
    amountLabel: string;
    percentLabel: string;
    events: number;
    wallets: number;
  };
};

const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_REFRESH_MS = 30_000;
const numberFormatter = new Intl.NumberFormat("en-US");

export function LeaderboardPage() {
  const [mode, setMode] = useState<LeaderboardMode>(() => getLeaderboardModeFromLocation());
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [burnStats, setBurnStats] = useState<MferGptBurnStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [burnError, setBurnError] = useState("");
  const entries = snapshot?.entries ?? [];
  const activeMode = snapshot?.mode ?? mode;
  const isXpMode = activeMode === "totalXp";
  const totalPointCap = snapshot?.totalPointCap ?? SEASON_0_TOTAL_POINT_CAP;
  const dailyPointCap = snapshot?.dailyPointCap ?? SEASON_0_DAILY_POINT_CAP;
  const totalEntries = snapshot?.totalEntries ?? entries.length;
  const totalSeasonPoints = snapshot?.totalSeasonPoints ?? entries.reduce((sum, entry) => sum + entry.seasonPoints, 0);
  const totalXp = snapshot?.totalXp ?? entries.reduce((sum, entry) => sum + entry.xp, 0);
  const progressMax = isXpMode
    ? Math.max(1, ...entries.map((entry) => entry.xp))
    : totalPointCap;

  const loadLeaderboard = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(getLeaderboardApiUrl(mode), { cache: "no-store" });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(getLeaderboardErrorMessage(payload, response.status));
      const next = normalizeLeaderboardSnapshot(payload, mode);
      setSnapshot(next);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load leaderboard.");
    } finally {
      setIsRefreshing(false);
    }

    try {
      setBurnStats(await fetchMferGptBurnStats());
      setBurnError("");
    } catch (loadError) {
      setBurnStats(null);
      setBurnError(loadError instanceof Error ? loadError.message : "Unable to load burn stats.");
    }
  }, [mode]);

  useEffect(() => {
    void loadLeaderboard();
    const refreshId = window.setInterval(() => void loadLeaderboard(), LEADERBOARD_REFRESH_MS);
    return () => window.clearInterval(refreshId);
  }, [loadLeaderboard]);

  useEffect(() => {
    writeLeaderboardModeToLocation(mode);
  }, [mode]);

  return (
    <main className="leaderboard-page">
      <div className="leaderboard-page-shade" />
      <header className="leaderboard-topbar">
        <a className="leaderboard-game-link" href="/" title="Back to game" aria-label="Back to game">
          <ArrowLeft size={18} />
          <span>game</span>
        </a>

        <div className="leaderboard-title">
          <span>{snapshot?.seasonId ?? SEASON_0_ID}</span>
          <h1>mferland leaderboard</h1>
        </div>

        <button className="leaderboard-refresh" type="button" onClick={() => void loadLeaderboard()} disabled={isRefreshing}>
          <RefreshCw size={18} className={isRefreshing ? "spinning" : ""} />
          <span>{isRefreshing ? "loading" : "refresh"}</span>
        </button>
      </header>

      <section className="leaderboard-metrics" aria-label="Season summary">
        <Metric icon={<Users size={20} />} label="players" value={formatNumber(totalEntries)} />
        <Metric icon={<Crown size={20} />} label={isXpMode ? "total XP" : "season points"} value={formatNumber(isXpMode ? totalXp : totalSeasonPoints)} />
        <Metric icon={<Clock3 size={20} />} label={isXpMode ? "season cap" : "daily cap"} value={formatNumber(isXpMode ? totalPointCap : dailyPointCap)} />
      </section>

      <BurnTracker stats={burnStats} error={burnError} />

      <section className="leaderboard-board" aria-label="Leaderboard standings">
        <div className="leaderboard-board-head">
          <div className="leaderboard-board-title">
            <strong>{isXpMode ? "total XP standings" : "season standings"}</strong>
            <span>{formatUpdatedAt(snapshot?.generatedAt)}</span>
          </div>
          <div className="leaderboard-board-actions">
            <div className="leaderboard-mode-toggle" aria-label="Leaderboard view">
              <button
                type="button"
                className={mode === "seasonPoints" ? "active" : ""}
                aria-pressed={mode === "seasonPoints"}
                onClick={() => setMode("seasonPoints")}
              >
                Season Points
              </button>
              <button
                type="button"
                className={mode === "totalXp" ? "active" : ""}
                aria-pressed={mode === "totalXp"}
                onClick={() => setMode("totalXp")}
              >
                Total XP
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>

        {!snapshot && isRefreshing ? (
          <div className="leaderboard-state">loading leaderboard</div>
        ) : entries.length === 0 ? (
          <div className="leaderboard-state">{isXpMode ? "no registered players yet" : "no season points logged yet"}</div>
        ) : (
          <ol className="leaderboard-list">
            {entries.map((entry, index) => (
              <LeaderboardRow
                key={`${activeMode}:${entry.walletAddress}:${entry.rank}:${isXpMode ? entry.xp : entry.seasonPoints}`}
                entry={entry}
                index={index}
                mode={activeMode}
                progressMax={progressMax}
              />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function BurnTracker({
  stats,
  error,
}: {
  stats: MferGptBurnStats | null;
  error: string;
}) {
  return (
    <section className="leaderboard-burn-tracker" aria-label="MFERGPT burn tracker">
      <div className="leaderboard-burn-icon">
        <Flame size={24} />
      </div>
      <div className="leaderboard-burn-main">
        <span>$MFERGPT burned</span>
        <strong>{stats ? stats.burnBalanceLabel : "--"}</strong>
      </div>
      <div className="leaderboard-burn-detail">
        <span>of total supply</span>
        <strong>{stats ? stats.burnPercentLabel : "--"}</strong>
      </div>
      <div className="leaderboard-burn-detail supply">
        <span>supply</span>
        <strong>{stats ? stats.totalSupplyLabel : "--"}</strong>
      </div>
      <div className="leaderboard-burn-proof" title={error || undefined}>
        <ShieldCheck size={16} />
        <span>
          {stats?.mferlandTracked.configured
            ? `mferland verified ${stats.mferlandTracked.amountLabel} (${stats.mferlandTracked.events} logs)`
            : error || "chain read via Base RPC"}
        </span>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="leaderboard-metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LeaderboardRow({
  entry,
  index,
  mode,
  progressMax,
}: {
  entry: LeaderboardEntry;
  index: number;
  mode: LeaderboardMode;
  progressMax: number;
}) {
  const traits = useMemo(
    () => resolveMferTraitsForPlayer(entry.avatarSeed, entry.appearanceTraits),
    [entry.appearanceTraits, entry.avatarSeed],
  );
  const primaryValue = mode === "totalXp" ? entry.xp : entry.seasonPoints;
  const progress = progressMax > 0 ? Math.min(100, Math.round((primaryValue / progressMax) * 1000) / 10) : 0;
  const rank = entry.rank || index + 1;
  const isTopThree = rank <= 3;
  const clientKindLabel = entry.clientKind === "agent" ? "agent" : entry.clientKind === "human" ? "human" : "";
  const secondaryLabel = mode === "totalXp"
    ? "XP earned"
    : entry.dailyPoints > 0 ? `+${formatNumber(entry.dailyPoints)} today` : `${entry.events} logs`;

  return (
    <li className={`leaderboard-row ${isTopThree ? `top-${rank}` : ""}`}>
      <div className="leaderboard-rank" aria-label={`rank ${rank}`}>
        {rank === 1 ? <Crown size={18} /> : <span>{rank}</span>}
      </div>

      <div className="leaderboard-avatar">
        <MferPortrait traits={traits} title={`${entry.characterName} mfer portrait`} />
      </div>

      <div className="leaderboard-player">
        <strong>{entry.characterName}</strong>
        <span>
          {formatShortAddress(entry.walletAddress)} · lvl {entry.level}
          {clientKindLabel && <em className={`leaderboard-client-kind ${clientKindLabel}`}>{clientKindLabel}</em>}
        </span>
      </div>

      <div className="leaderboard-progress" aria-label={`${progress}% of season cap`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <ReferralBadge entry={entry} />

      <div className="leaderboard-points">
        <strong>{formatNumber(primaryValue)}</strong>
        <span>{secondaryLabel}</span>
        {mode === "totalXp" && <small>{formatNumber(entry.seasonPoints)} season pts</small>}
      </div>
    </li>
  );
}

function ReferralBadge({ entry }: { entry: LeaderboardEntry }) {
  const count = Math.min(SEASON_0_REFERRAL_MAX_REFEREES, Math.max(0, entry.referralCount));
  const activeCount = Math.min(count, Math.max(0, entry.activatedReferralCount));
  const slots = Array.from({ length: SEASON_0_REFERRAL_MAX_REFEREES }, (_, index) => {
    const isFilled = index < count;
    const isActive = index < activeCount;
    return <span key={index} className={isActive ? "active" : isFilled ? "filled" : ""} />;
  });
  const bonusLabel = entry.referralBonusPoints > 0
    ? `+${formatNumber(entry.referralBonusPoints)} bonus`
    : `${activeCount} active`;

  return (
    <div
      className="leaderboard-referrals"
      aria-label={`${entry.referralCount} referrals, ${entry.activatedReferralCount} active`}
      title={`${entry.referralCount}/${SEASON_0_REFERRAL_MAX_REFEREES} referrals, ${entry.activatedReferralCount} active`}
    >
      <div className="leaderboard-referral-label">
        <Users size={14} />
        <span>{entry.referralCount} refs</span>
      </div>
      <div className="leaderboard-referral-meter" aria-hidden="true">
        {slots}
      </div>
      <em>{bonusLabel}</em>
    </div>
  );
}

function getLeaderboardApiUrl(mode: LeaderboardMode) {
  const params = new URLSearchParams({
    limit: String(LEADERBOARD_LIMIT),
    mode,
  });
  return `${getServerHttpBase()}/season/leaderboard?${params.toString()}`;
}

function getBurnStatsApiUrl() {
  return `${getServerHttpBase()}/crypto/mfergpt-burn`;
}

function getServerHttpBase() {
  const configured = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
  if (configured) {
    return configured.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    return `${protocol}://${window.location.hostname}:2567`;
  }

  return "";
}

async function fetchMferGptBurnStats() {
  const response = await fetch(getBurnStatsApiUrl(), { cache: "no-store" });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(getLeaderboardErrorMessage(payload, response.status));
  return normalizeMferGptBurnStats(payload);
}

function normalizeLeaderboardSnapshot(value: unknown, fallbackMode: LeaderboardMode): LeaderboardSnapshot {
  if (!isRecord(value) || value.ok !== true) throw new Error("Leaderboard response was not valid.");
  const entries = toArray(value.entries).map(normalizeLeaderboardEntry).filter((entry): entry is LeaderboardEntry => Boolean(entry));
  return {
    ok: true,
    seasonId: toStringValue(value.seasonId) || SEASON_0_ID,
    mode: normalizeLeaderboardModeValue(value.mode, fallbackMode),
    generatedAt: toStringValue(value.generatedAt) || new Date().toISOString(),
    dailyPointCap: toNumber(value.dailyPointCap) || SEASON_0_DAILY_POINT_CAP,
    totalPointCap: toNumber(value.totalPointCap) || SEASON_0_TOTAL_POINT_CAP,
    totalEntries: toNumber(value.totalEntries) || entries.length,
    totalSeasonPoints: toNumber(value.totalSeasonPoints) || entries.reduce((sum, entry) => sum + entry.seasonPoints, 0),
    totalXp: toNumber(value.totalXp) || entries.reduce((sum, entry) => sum + entry.xp, 0),
    entries,
  };
}

function normalizeLeaderboardEntry(value: unknown): LeaderboardEntry | null {
  if (!isRecord(value)) return null;
  const walletAddress = toStringValue(value.walletAddress);
  const seasonPoints = toNumber(value.seasonPoints);
  if (!walletAddress) return null;
  return {
    rank: toNumber(value.rank),
    walletAddress,
    characterName: toStringValue(value.characterName) || "mfer",
    clientKind: normalizeClientKind(value.clientKind),
    avatarSeed: normalizeAvatarSeed(toNumber(value.avatarSeed) || 1),
    appearanceTraits: normalizeMferAppearanceTraits(value.appearanceTraits, {}),
    level: toNumber(value.level) || 1,
    xp: toNumber(value.xp),
    seasonPoints,
    dailyPoints: toNumber(value.dailyPoints),
    pendingPoints: toNumber(value.pendingPoints),
    approvedPoints: toNumber(value.approvedPoints),
    distributedPoints: toNumber(value.distributedPoints),
    events: toNumber(value.events),
    lastEventAt: toStringValue(value.lastEventAt),
    referralCount: toNumber(value.referralCount),
    activatedReferralCount: toNumber(value.activatedReferralCount),
    referralBonusPoints: toNumber(value.referralBonusPoints),
  };
}

function getLeaderboardModeFromLocation(): LeaderboardMode {
  if (typeof window === "undefined") return "seasonPoints";
  return normalizeLeaderboardModeValue(new URLSearchParams(window.location.search).get("view"));
}

function writeLeaderboardModeToLocation(mode: LeaderboardMode) {
  const url = new URL(window.location.href);
  if (mode === "totalXp") {
    url.searchParams.set("view", "xp");
  } else {
    url.searchParams.delete("view");
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl);
}

function normalizeLeaderboardModeValue(value: unknown, fallback: LeaderboardMode = "seasonPoints"): LeaderboardMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "totalxp" || normalized === "total-xp" || normalized === "xp") return "totalXp";
  if (normalized === "seasonpoints" || normalized === "season-points" || normalized === "season") return "seasonPoints";
  return fallback;
}

function normalizeClientKind(value: unknown): LeaderboardEntry["clientKind"] {
  return value === "agent" || value === "human" ? value : "";
}

function normalizeMferGptBurnStats(value: unknown): MferGptBurnStats {
  if (!isRecord(value) || value.ok !== true) throw new Error("Burn tracker response was not valid.");
  const tracked = isRecord(value.mferlandTracked) ? value.mferlandTracked : {};
  return {
    ok: true,
    generatedAt: toStringValue(value.generatedAt) || new Date().toISOString(),
    symbol: toStringValue(value.symbol) || "MFERGPT",
    totalSupplyLabel: toStringValue(value.totalSupplyLabel) || "--",
    burnBalanceLabel: toStringValue(value.burnBalanceLabel) || "--",
    burnPercentLabel: toStringValue(value.burnPercentLabel) || "--",
    mferlandTracked: {
      configured: tracked.configured === true,
      amountLabel: toStringValue(tracked.amountLabel) || "--",
      percentLabel: toStringValue(tracked.percentLabel) || "--",
      events: toNumber(tracked.events),
      wallets: toNumber(tracked.wallets),
    },
  };
}

function getLeaderboardErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  if (status === 503) return "leaderboard database unavailable";
  return `leaderboard request failed (${status})`;
}

function formatShortAddress(address: string) {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatUpdatedAt(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

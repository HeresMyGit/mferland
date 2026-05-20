import { getSeason0Leaderboard } from "../persistence.js";

const LEADERBOARD_CONTEXT_TTL_MS = 30_000;
const LEADERBOARD_CONTEXT_LIMIT = 10;
const LEADERBOARD_PUBLIC_URL = "https://game.mfergpt.lol/leaderboard";

type LeaderboardContextCache = {
  expiresAt: number;
  text: string;
};

let cachedLeaderboardContext: LeaderboardContextCache | null = null;

export async function getSeasonLeaderboardContext(now = new Date()) {
  const currentTime = now.getTime();
  if (cachedLeaderboardContext && cachedLeaderboardContext.expiresAt > currentTime) {
    return cachedLeaderboardContext.text;
  }

  try {
    const snapshot = await getSeason0Leaderboard({ limit: LEADERBOARD_CONTEXT_LIMIT, now });
    const lines = [
      `leaderboard url: ${LEADERBOARD_PUBLIC_URL}`,
      `season: ${snapshot.seasonId}. generated: ${snapshot.generatedAt}. season cap: ${snapshot.totalPointCap}. daily cap: ${snapshot.dailyPointCap}.`,
      "visible season totals already include pending, approved, and distributed points.",
    ];

    if (snapshot.entries.length > 0) {
      lines.push("top standings:");
      for (const entry of snapshot.entries.slice(0, 5)) {
        lines.push([
          `#${entry.rank} ${entry.characterName}`,
          `— ${entry.seasonPoints} pts`,
          entry.dailyPoints > 0 ? `(+${entry.dailyPoints} today)` : "",
          `— lvl ${entry.level}`,
          `— ${shortWallet(entry.walletAddress)}`,
        ].filter(Boolean).join(" "));
      }
    } else {
      lines.push("top standings: no season points logged yet.");
    }

    const text = lines.join("\n");
    cachedLeaderboardContext = {
      expiresAt: currentTime + LEADERBOARD_CONTEXT_TTL_MS,
      text,
    };
    return text;
  } catch {
    return "";
  }
}

function shortWallet(walletAddress: string) {
  if (!walletAddress) return "unknown wallet";
  if (walletAddress.length <= 12) return walletAddress;
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

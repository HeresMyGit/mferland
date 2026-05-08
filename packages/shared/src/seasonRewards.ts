import type { QuestId } from "./types.js";

export const SEASON_0_ID = "season-0";
export const SEASON_0_DAILY_POINT_CAP = 100;
export const SEASON_0_TOTAL_POINT_CAP = 500;

export type SeasonRewardCadence = "once" | "daily";
export type SeasonRewardStatus = "pending" | "approved" | "rejected" | "distributed";
export type SeasonRewardSourceType = "quest" | "event" | "referral" | "manual";

export type SeasonQuestReward = {
  points: number;
  cadence: SeasonRewardCadence;
  label: string;
};

export const SEASON_0_QUEST_REWARDS = {
  "mfer-beginnings": { points: 5, cadence: "once", label: "one honest lap" },
  "dao-tour": { points: 5, cadence: "once", label: "board check" },
  "fountain-vibes": { points: 5, cadence: "once", label: "real town hall" },
  "sealed-note": { points: 10, cadence: "once", label: "don't open that" },
  "farm-road-handoff": { points: 5, cadence: "once", label: "farm road handoff" },
  "ask-mfergpt": { points: 10, cadence: "once", label: "ask mferGPT" },
  "mfergpt-checkin": { points: 5, cadence: "once", label: "mferGPT check-in" },
  "tweet-town-link": { points: 5, cadence: "once", label: "town link post" },
  "boar-bristle-cull": { points: 15, cadence: "once", label: "boar warmup" },
  "feral-farmers": { points: 20, cadence: "once", label: "farm loop cleared" },
  "hog-livers": { points: 20, cadence: "once", label: "gross road fix" },
  "field-camp-delivery": { points: 25, cadence: "once", label: "road still works" },
  "route-patrol-daily": { points: 20, cadence: "daily", label: "route cleanup" },
  "ridge-dispatch": { points: 25, cadence: "once", label: "uptrail ping" },
  "signal-scraps": { points: 30, cadence: "once", label: "fried relay scraps" },
  "cut-the-static": { points: 35, cadence: "once", label: "pull the plug" },
  "baron-of-static": { points: 60, cadence: "once", label: "log off the baron" },
  "ogre-raid-daily": { points: 75, cadence: "daily", label: "too much signal" },
} as const satisfies Partial<Record<QuestId, SeasonQuestReward>>;

const SEASON_0_QUEST_REWARD_MAP: Partial<Record<QuestId, SeasonQuestReward>> = SEASON_0_QUEST_REWARDS;

export function getSeason0QuestReward(questId: QuestId): SeasonQuestReward | null {
  return SEASON_0_QUEST_REWARD_MAP[questId] ?? null;
}

export function getSeasonRewardSourceId(questId: QuestId, now = new Date()) {
  const reward = getSeason0QuestReward(questId);
  if (!reward) return "";
  if (reward.cadence === "daily") return `${questId}:${formatUtcDate(now)}`;
  return questId;
}

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

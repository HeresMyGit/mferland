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
  "mfer-beginnings": { points: 5, cadence: "once", label: "gm rounds" },
  "dao-tour": { points: 5, cadence: "once", label: "plant seeds, not promises" },
  "fountain-vibes": { points: 5, cadence: "once", label: "still here" },
  "sealed-note": { points: 10, cadence: "once", label: "pass the seed note" },
  "farm-road-handoff": { points: 5, cadence: "once", label: "airdrop farm handoff" },
  "ask-mfergpt": { points: 10, cadence: "once", label: "grab some lore" },
  "mfergpt-checkin": { points: 5, cadence: "once", label: "signal check" },
  "mfergpt-daily-signal": { points: 10, cadence: "daily", label: "today's noise" },
  "tweet-town-link": { points: 5, cadence: "once", label: "post the plaza" },
  "boar-bristle-cull": { points: 15, cadence: "once", label: "hogs in the claim pile" },
  "feral-farmers": { points: 20, cadence: "once", label: "next drop sickness" },
  "hog-livers": { points: 20, cadence: "once", label: "eos recovery" },
  "field-camp-delivery": { points: 25, cadence: "once", label: "town route still works" },
  "route-patrol-daily": { points: 20, cadence: "daily", label: "clear the claim route" },
  "ridge-dispatch": { points: 25, cadence: "once", label: "follow the bad signal" },
  "signal-scraps": { points: 30, cadence: "once", label: "fried uplink scraps" },
  "cut-the-static": { points: 35, cadence: "once", label: "kill the repeaters" },
  "baron-of-static": { points: 60, cadence: "once", label: "log off the centralizer" },
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

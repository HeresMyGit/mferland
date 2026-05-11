import type { ItemId, NpcSnapshot } from "./types.js";
import { stableHash } from "./utils.js";

export type MferGptDailyQuestKind = "defeat" | "collect";
export type MferGptDailyTargetGroup = "hogs" | "farmers" | "ridge";

export type MferGptDailyQuestAssignment = {
  id: string;
  kind: MferGptDailyQuestKind;
  title: string;
  summary: string;
  objectiveLabel: string;
  required: number;
  targetGroup: MferGptDailyTargetGroup;
  itemId?: ItemId;
  dropRate?: number;
  sourceThemes: readonly string[];
};

export const MFERGPT_DAILY_QUEST_FLAG_PREFIX = "mfergpt-daily:";

export const MFERGPT_DAILY_QUEST_ASSIGNMENTS = [
  {
    id: "claim-pile-hog-sweep",
    kind: "defeat",
    title: "claim pile overrun",
    summary: "the farm hogs found another stash pocket and are acting like it was a roadmap.",
    objectiveLabel: "clear 24 claim pile hogs around the busted farm",
    required: 24,
    targetGroup: "hogs",
    sourceThemes: ["airdrops", "hogs", "farm"],
  },
  {
    id: "reply-loop-farm-sweep",
    kind: "defeat",
    title: "reply loop outbreak",
    summary: "the airdrop-burnt mfers are posting through it again and the route is getting loud.",
    objectiveLabel: "drop 18 claim-burnt farm mfers",
    required: 18,
    targetGroup: "farmers",
    sourceThemes: ["claims", "farm", "reply loops"],
  },
  {
    id: "chewed-eos-haul",
    kind: "collect",
    title: "chewed EOS haul",
    summary: "mferGPT wants a bigger sample from whatever the hogs keep eating out there.",
    objectiveLabel: "recover 18 chewed EOS from farm-road hogs",
    required: 18,
    targetGroup: "hogs",
    itemId: "hog-liver",
    dropRate: 0.74,
    sourceThemes: ["EOS", "hogs", "farm"],
  },
  {
    id: "ridge-static-sweep",
    kind: "defeat",
    title: "ridge static sweep",
    summary: "the upper trail is repeating the same bad voice until someone makes it stop.",
    objectiveLabel: "drop 20 signal-jacked ridge enemies",
    required: 20,
    targetGroup: "ridge",
    sourceThemes: ["ridge", "static", "agents"],
  },
  {
    id: "fried-uplink-haul",
    kind: "collect",
    title: "fried uplink haul",
    summary: "the ridge is shedding noisy parts again. collect a real pile before the signal resets.",
    objectiveLabel: "collect 14 fried uplink shards from Signal Ridge",
    required: 14,
    targetGroup: "ridge",
    itemId: "signal-scrap",
    dropRate: 0.68,
    sourceThemes: ["ridge", "uplink", "static"],
  },
] as const satisfies readonly MferGptDailyQuestAssignment[];

export function getMferGptDailyQuestAssignment(now = Date.now()): MferGptDailyQuestAssignment {
  const dateKey = formatUtcDate(now);
  const index = stableHash(`mfergpt-daily-quest:${dateKey}`) % MFERGPT_DAILY_QUEST_ASSIGNMENTS.length;
  return MFERGPT_DAILY_QUEST_ASSIGNMENTS[index] ?? MFERGPT_DAILY_QUEST_ASSIGNMENTS[0];
}

export function makeMferGptDailyQuestFlags(assignmentId: string) {
  return `${MFERGPT_DAILY_QUEST_FLAG_PREFIX}${assignmentId}`;
}

export function getMferGptDailyQuestAssignmentId(flags: string) {
  const flag = flags
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(MFERGPT_DAILY_QUEST_FLAG_PREFIX));
  return flag ? flag.slice(MFERGPT_DAILY_QUEST_FLAG_PREFIX.length) : "";
}

export function getMferGptDailyQuestAssignmentById(assignmentId: string) {
  return MFERGPT_DAILY_QUEST_ASSIGNMENTS.find((assignment) => assignment.id === assignmentId) ?? null;
}

export function getMferGptDailyQuestAssignmentFromFlags(
  flags: string,
  now = Date.now(),
): MferGptDailyQuestAssignment {
  const assignmentId = getMferGptDailyQuestAssignmentId(flags);
  return getMferGptDailyQuestAssignmentById(assignmentId) ?? getMferGptDailyQuestAssignment(now);
}

export function isMferGptDailyQuestDefeatTarget(
  assignment: MferGptDailyQuestAssignment,
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
) {
  return assignment.kind === "defeat" && isMferGptDailyQuestTargetGroupMatch(assignment.targetGroup, npc);
}

export function isMferGptDailyQuestDropSource(
  assignment: MferGptDailyQuestAssignment,
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
) {
  return assignment.kind === "collect" && isMferGptDailyQuestTargetGroupMatch(assignment.targetGroup, npc);
}

export function isMferGptDailyQuestItem(assignment: MferGptDailyQuestAssignment, itemId: ItemId) {
  return assignment.kind === "collect" && assignment.itemId === itemId;
}

function isMferGptDailyQuestTargetGroupMatch(
  targetGroup: MferGptDailyTargetGroup,
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
) {
  if (targetGroup === "hogs") return npc.model === "hog";
  if (targetGroup === "farmers") return npc.role === "farmer" && isFarmRoadEnemy(npc.id);
  return isRidgeEnemy(npc.id);
}

function isFarmRoadEnemy(npcId: string) {
  return npcId.startsWith("farmhand-") || npcId.startsWith("field-mage-");
}

function isRidgeEnemy(npcId: string) {
  return npcId.startsWith("ridge-raider-") || npcId.startsWith("static-mage-");
}

function formatUtcDate(now: number) {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

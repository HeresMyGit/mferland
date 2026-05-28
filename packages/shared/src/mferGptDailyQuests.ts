import type { ItemId, NpcSnapshot } from "./types.js";
import { stableHash } from "./utils.js";

export type MferGptDailyQuestKind = "defeat" | "collect";
export type MferGptDailyTargetGroup = "hogs" | "farmers" | "ridge" | "daily-boss";

export const MFERGPT_DAILY_HUB_ID = "daily-signal-camp";
export const MFERGPT_DAILY_FIELD_NODE_NPC_ID = "mfergpt-daily-field-node";
export const MFERGPT_DAILY_WITNESS_NPC_ID = "mfergpt-daily-witness";
export const MFERGPT_DAILY_HINT_NPC_ID = "mfergpt-daily-hint";
export const MFERGPT_DAILY_BOSS_NPC_ID = "mfergpt-daily-boss";
export const MFERGPT_DAILY_HUB_NPC_IDS = [
  MFERGPT_DAILY_FIELD_NODE_NPC_ID,
  MFERGPT_DAILY_WITNESS_NPC_ID,
  MFERGPT_DAILY_HINT_NPC_ID,
  MFERGPT_DAILY_BOSS_NPC_ID,
] as const;

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
  bossName?: string;
  bossDialogue?: string;
  witnessName?: string;
  witnessDialogue?: string;
  hintName?: string;
  hintDialogue?: string;
};

export const MFERGPT_DAILY_QUEST_FLAG_PREFIX = "mfergpt-daily:";

export const MFERGPT_DAILY_QUEST_ASSIGNMENTS = [
  {
    id: "claim-pile-hog-sweep",
    kind: "defeat",
    title: "claim pile overrun",
    summary: "a fake stash map is looping through the signal camp and something big believed it first.",
    objectiveLabel: "drop the claim pile boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["airdrops", "hogs", "farm"],
    bossName: "claim pile mfer",
    bossDialogue: "found the stash. ate the stash. became the stash.",
    witnessName: "claim witness mfer",
    witnessDialogue: "it started as one screenshot and then the camp began snorting in bullet points.",
    hintName: "field note mfer",
    hintDialogue: "boss is posted west of the node. tag it, stay close, bring the noise back here.",
  },
  {
    id: "reply-loop-farm-sweep",
    kind: "defeat",
    title: "reply loop outbreak",
    summary: "the feed coughed up one bad reply and the camp has been repeating it with legs.",
    objectiveLabel: "drop the reply-loop boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["claims", "farm", "reply loops"],
    bossName: "reply-loop mfer",
    bossDialogue: "same reply. same reply. same reply.",
    witnessName: "threadbare mfer",
    witnessDialogue: "i watched one normal gm become a twelve-hour argument with posture.",
    hintName: "mute button mfer",
    hintDialogue: "do not debate it. hit the reply-loop until it stops refreshing.",
  },
  {
    id: "chewed-eos-haul",
    kind: "defeat",
    title: "chewed EOS haul",
    summary: "something at the camp is chewing old EOS lore into a clean little panic.",
    objectiveLabel: "drop the chewed EOS boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["EOS", "hogs", "farm"],
    bossName: "chewed EOS mfer",
    bossDialogue: "6/9 was the clue. everything else is bite marks.",
    witnessName: "sample bag mfer",
    witnessDialogue: "mferGPT asked for a sample and the sample stood up.",
    hintName: "old-drop mfer",
    hintDialogue: "this one swings weird. keep moving and let the camp mark the credit.",
  },
  {
    id: "ridge-static-sweep",
    kind: "defeat",
    title: "ridge static sweep",
    summary: "the ridge signal shed a bad voice, and now it is stomping around the camp.",
    objectiveLabel: "drop the ridge static boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["ridge", "static", "agents"],
    bossName: "ridge static mfer",
    bossDialogue: "clean signal denied. please enjoy the loop.",
    witnessName: "relay witness mfer",
    witnessDialogue: "it sounded like mferGPT for half a second, then started charging rent.",
    hintName: "antenna mfer",
    hintDialogue: "burn the static body down, then report to the node before it reboots.",
  },
  {
    id: "fried-uplink-haul",
    kind: "defeat",
    title: "fried uplink haul",
    summary: "the uplink dropped one hot shard too many and the camp built a body around it.",
    objectiveLabel: "drop the fried uplink boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["ridge", "uplink", "static"],
    bossName: "fried uplink mfer",
    bossDialogue: "hot shard. bad plan. full send.",
    witnessName: "burnt cable mfer",
    witnessDialogue: "i touched one wire and heard the entire timeline refresh at once.",
    hintName: "cooldown mfer",
    hintDialogue: "blue juice helps. so does not standing in the obvious bad idea.",
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
  if (targetGroup === "daily-boss") return npc.id === MFERGPT_DAILY_BOSS_NPC_ID;
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

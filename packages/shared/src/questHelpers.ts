import { QUESTS, QUEST_IDS } from "./quests.js";
import type { ItemId, NpcSnapshot, QuestId, QuestMarkerType, QuestSnapshot } from "./types.js";

export function getNpcQuestIds(npcId: string): QuestId[] {
  return QUEST_IDS.filter((questId) => (
    QUESTS[questId].giverNpcId === npcId || getQuestTurnInNpcId(questId) === npcId
  ));
}

export function getQuestRequirement(questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  return "requiredQuestId" in quest ? quest.requiredQuestId : null;
}

export function getQuestNextQuestId(questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  return "nextQuestId" in quest ? quest.nextQuestId : null;
}

export function getQuestTurnInNpcId(questId: QuestId): string {
  const quest = QUESTS[questId];
  return "turnInNpcId" in quest ? quest.turnInNpcId : quest.giverNpcId;
}

export function getQuestObjectives(questId: QuestId): ReadonlyArray<{ id: string; label: string }> {
  const quest = QUESTS[questId];
  return "objectives" in quest ? quest.objectives : [];
}

export function getQuestStartItemId(questId: QuestId): ItemId | null {
  const quest = QUESTS[questId];
  return "startItemId" in quest ? quest.startItemId as ItemId : null;
}

export function getQuestRequiredItemId(questId: QuestId): ItemId | null {
  const quest = QUESTS[questId];
  return "requiredItemId" in quest ? quest.requiredItemId as ItemId : null;
}

export function getQuestRewardItemIds(questId: QuestId): ItemId[] {
  const quest = QUESTS[questId];
  return "rewardItemIds" in quest ? [...quest.rewardItemIds] as ItemId[] : [];
}

export function shouldConsumeQuestItem(questId: QuestId): boolean {
  const quest = QUESTS[questId];
  return "consumeItem" in quest && quest.consumeItem;
}

export function getQuestRepeatCooldownMs(questId: QuestId): number {
  const quest = QUESTS[questId];
  return "repeatCooldownMs" in quest ? quest.repeatCooldownMs : 0;
}

export function getQuestRepeatLabel(questId: QuestId): string {
  const quest = QUESTS[questId];
  return "repeatLabel" in quest ? quest.repeatLabel : "";
}

export function isRepeatableQuest(questId: QuestId): boolean {
  return getQuestRepeatCooldownMs(questId) > 0;
}

export function isQuestReadyToRepeat(questId: QuestId, quest: Pick<QuestSnapshot, "status" | "completedAt">, now = Date.now()): boolean {
  const cooldownMs = getQuestRepeatCooldownMs(questId);
  if (cooldownMs <= 0 || quest.status !== "completed") return false;
  return quest.completedAt <= 0 || now - quest.completedAt >= cooldownMs;
}

export function isQuestAutoReady(questId: QuestId): boolean {
  const quest = QUESTS[questId];
  return "autoReady" in quest && quest.autoReady;
}

export function isQuestAvailableForSnapshots(questId: QuestId, quests: QuestSnapshot[] | undefined): boolean {
  const existingQuest = quests?.find((quest) => quest.id === questId);
  if (existingQuest) return isQuestReadyToRepeat(questId, existingQuest);

  const nextQuestId = getQuestNextQuestId(questId);
  if (nextQuestId && quests?.some((quest) => quest.id === nextQuestId && quest.status === "completed")) return false;

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return quests?.some((quest) => quest.id === requiredQuestId && quest.status === "completed") ?? false;
}

export function getNpcQuestMarker(
  npc: Pick<NpcSnapshot, "id">,
  quests: QuestSnapshot[] | undefined,
): QuestMarkerType | null {
  const npcQuestIds = getNpcQuestIds(npc.id);
  const questLog = quests ?? [];

  for (const questId of npcQuestIds) {
    const isTurnInNpc = getQuestTurnInNpcId(questId) === npc.id;
    const quest = questLog.find((entry) => entry.id === questId);

    if (quest?.status === "ready" && isTurnInNpc) return "turnIn";
  }

  for (const questId of npcQuestIds) {
    const isGiver = QUESTS[questId].giverNpcId === npc.id;
    if (!isGiver) continue;

    const quest = questLog.find((entry) => entry.id === questId);
    if (!quest && isQuestAvailableForSnapshots(questId, questLog)) return "available";
    if (quest?.status === "completed" && isQuestReadyToRepeat(questId, quest)) return "available";
  }

  return null;
}

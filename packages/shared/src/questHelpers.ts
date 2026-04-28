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

export function shouldConsumeQuestItem(questId: QuestId): boolean {
  const quest = QUESTS[questId];
  return "consumeItem" in quest && quest.consumeItem;
}

export function isQuestAutoReady(questId: QuestId): boolean {
  const quest = QUESTS[questId];
  return "autoReady" in quest && quest.autoReady;
}

export function isQuestAvailableForSnapshots(questId: QuestId, quests: QuestSnapshot[] | undefined): boolean {
  if (quests?.some((quest) => quest.id === questId)) return false;

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
    const isGiver = QUESTS[questId].giverNpcId === npc.id;
    const isTurnInNpc = getQuestTurnInNpcId(questId) === npc.id;
    const quest = questLog.find((entry) => entry.id === questId);
    if (!quest) {
      if (isGiver && isQuestAvailableForSnapshots(questId, questLog)) return "available";
      continue;
    }

    if (quest.status === "ready" && isTurnInNpc) return "turnIn";
    if (quest.status !== "completed") return null;
  }

  return null;
}

import {
  QUESTS,
  QUEST_IDS,
  clamp,
  getNpcQuestIds,
  getQuestObjectives,
  getQuestRequiredItemId,
  getQuestRequirement,
  getQuestStartItemId,
  getQuestTurnInNpcId,
  isQuestAutoReady,
  shouldConsumeQuestItem,
  type ItemId,
  type QuestId,
} from "@mferland/shared";
import { InventoryItemState, QuestState, type NpcState, type PlayerState } from "../state.js";

export function getNpcDialogue(npc: NpcState, player: PlayerState, now: number, offerQuest: (questId: QuestId) => void) {
  const questDialogue = getQuestDialogue(npc, player, now, offerQuest);
  if (questDialogue) return `${player.name}, ${questDialogue}`;

  if (npc.role === "quest_giver" && npc.questId) {
    return `${player.name}, ${npc.dialogue}`;
  }
  return npc.dialogue;
}

function getQuestDialogue(npc: NpcState, player: PlayerState, now: number, offerQuest: (questId: QuestId) => void) {
  const questIds = getNpcQuestIds(npc.id);
  if (questIds.length === 0) return null;

  for (const questId of questIds) {
    const isGiver = QUESTS[questId].giverNpcId === npc.id;
    const isTurnInNpc = getQuestTurnInNpcId(questId) === npc.id;
    const quest = player.quests.get(questId);
    if (!quest) {
      if (!isGiver) continue;
      if (!isQuestAvailable(player, questId)) continue;

      offerQuest(questId);
      return `quest available: ${QUESTS[questId].title}. ${QUESTS[questId].description}`;
    }

    syncQuestItemProgress(player, questId);
    if (quest.status === "active" && isQuestAutoReady(questId)) {
      quest.status = "ready";
      quest.progress = quest.required;
    }

    if (quest.status === "active") {
      if (!isTurnInNpc && isGiver) return getQuestTravelDialogue(questId);
      if (!isTurnInNpc) continue;
      return getActiveQuestDialogue(questId, quest);
    }

    if (quest.status === "ready") {
      if (!isTurnInNpc) {
        if (isGiver) return getQuestTravelDialogue(questId);
        continue;
      }

      if (!completeQuest(player, questId, now)) {
        return getActiveQuestDialogue(questId, quest);
      }

      const nextQuestId = getNextAvailableQuestId(player, questId);
      if (nextQuestId && QUESTS[nextQuestId].giverNpcId === npc.id) {
        offerQuest(nextQuestId);
        return `${getQuestCompletionDialogue(questId)} I have another job when you are ready.`;
      }

      return getQuestCompletionDialogue(questId);
    }
  }

  return getFinishedQuestDialogue(npc.id);
}

function getActiveQuestDialogue(questId: QuestId, quest: QuestState) {
  if (questId === "feral-farmers") {
    return `${QUESTS[questId].title}: ${formatNamedQuestProgress(quest)}.`;
  }

  if (questId === "hog-livers") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hog livers collected. They do not always drop, so keep hunting.`;
  }

  return `${QUESTS[questId].title}: ${QUESTS[questId].objectiveLabel}.`;
}

function getQuestTravelDialogue(questId: QuestId) {
  const turnInNpcId = getQuestTurnInNpcId(questId);
  if (turnInNpcId !== QUESTS[questId].giverNpcId) {
    return `${QUESTS[questId].title}: take it to ${getNpcDisplayName(turnInNpcId)}.`;
  }

  return `${QUESTS[questId].title}: ${QUESTS[questId].objectiveLabel}.`;
}

function getNextAvailableQuestId(player: PlayerState, questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  const nextQuestId = "nextQuestId" in quest ? quest.nextQuestId : null;
  return nextQuestId && isQuestAvailable(player, nextQuestId) ? nextQuestId : null;
}

function getQuestCompletionDialogue(questId: QuestId) {
  const questTitle = QUESTS[questId].title;

  if (questId === "mfer-beginnings") {
    return `quest complete: ${questTitle}. You are checked in. The plaza is yours.`;
  }

  if (questId === "sealed-note") {
    return `quest complete: ${questTitle}. Wearables mfer tucks the note away and starts pulling fabric scraps.`;
  }

  if (questId === "farmhand-bandanas") {
    return `quest complete: ${questTitle}. These scraps will make warning flags for the farm road.`;
  }

  if (questId === "dao-tour") {
    return `quest complete: ${questTitle}. You found the DAO hall. Proposals can wait until the town is ready.`;
  }

  if (questId === "fountain-vibes") {
    return `quest complete: ${questTitle}. The fountain is doing its job.`;
  }

  if (questId === "feral-farmers") {
    return `good work. Quest complete: ${questTitle}.`;
  }

  if (questId === "hog-livers") {
    return `quest complete: ${questTitle}. This brew smells awful, but it should keep the road clear.`;
  }

  return `quest complete: ${questTitle}.`;
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "og-mfer") return "you are checked in. Roam around and see who needs help.";
  if (npcId === "wearables-mfer") return "the red-eye scraps are enough for a few road flags.";
  if (npcId === "dao-mfer") return "the DAO hall is on the map now. Come back when proposals are live.";
  if (npcId === "fountain-mfer") return "fountain vibes are handled for today.";
  if (npcId === "hogwatch-mfer") return "the farm is quieter already. Town owes you one.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "og-mfer") return "OG mfer";
  if (npcId === "wearables-mfer") return "Wearables mfer";
  if (npcId === "dao-mfer") return "DAO mfer";
  if (npcId === "fountain-mfer") return "Fountain mfer";
  if (npcId === "hogwatch-mfer") return "Hogwatch mfer";
  return "the right mfer";
}

export function isQuestAvailable(player: PlayerState, questId: QuestId) {
  if (player.quests.has(questId)) return false;

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return player.quests.get(requiredQuestId)?.status === "completed";
}

export function makeQuestOffer(questId: QuestId, npc: NpcState) {
  const quest = QUESTS[questId];
  return {
    questId,
    npcId: npc.id,
    title: quest.title,
    description: quest.description,
    objectiveLabel: quest.objectiveLabel,
    required: quest.required,
  };
}

export function normalizeQuestId(input: unknown): QuestId | null {
  return typeof input === "string" && QUEST_IDS.includes(input as QuestId) ? input as QuestId : null;
}

export function startQuest(player: PlayerState, questId: QuestId) {
  if (player.quests.has(questId)) return;

  const startItemId = getQuestStartItemId(questId);
  if (startItemId) addInventoryItem(player, startItemId, QUESTS[questId].required);

  const quest = new QuestState();
  quest.id = questId;
  quest.required = QUESTS[questId].required;
  quest.status = isQuestAutoReady(questId) ? "ready" : "active";
  quest.progress = quest.status === "ready" ? quest.required : 0;
  quest.flags = "";
  quest.completedAt = 0;
  player.quests.set(questId, quest);
  syncQuestItemProgress(player, questId);
}

function completeQuest(player: PlayerState, questId: QuestId, now: number) {
  const quest = player.quests.get(questId);
  if (!quest) return false;

  syncQuestItemProgress(player, questId);
  if (quest.status !== "ready" && quest.progress < quest.required) return false;

  const requiredItemId = getQuestRequiredItemId(questId);
  if (requiredItemId && shouldConsumeQuestItem(questId)) {
    removeInventoryItem(player, requiredItemId, quest.required);
  }

  quest.status = "completed";
  quest.progress = quest.required;
  quest.completedAt = now;
  return true;
}

export function progressDefeatQuests(player: PlayerState, npc: NpcState) {
  if (npc.role === "farmer") {
    progressNamedQuestObjective(player, "feral-farmers", npc.id);
  }
}

function progressNamedQuestObjective(player: PlayerState, questId: QuestId, objectiveId: string) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return;
  if (!getQuestObjectiveIds(questId).includes(objectiveId)) return;

  const completed = getQuestFlags(quest);
  if (completed.has(objectiveId)) return;

  completed.add(objectiveId);
  quest.flags = Array.from(completed).sort().join(",");
  quest.progress = clamp(completed.size, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
}

function progressQuest(player: PlayerState, questId: QuestId, amount: number) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return;

  quest.progress = clamp(quest.progress + amount, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
}

export function syncQuestItemProgress(player: PlayerState, questId: QuestId) {
  const quest = player.quests.get(questId);
  const requiredItemId = getQuestRequiredItemId(questId);
  if (!quest || !requiredItemId || quest.status === "completed") return;

  quest.progress = clamp(getInventoryItemCount(player, requiredItemId), 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  } else if (quest.status === "ready") {
    quest.status = "active";
  }
}

function hasActiveQuest(player: PlayerState, questId: QuestId) {
  return player.quests.get(questId)?.status === "active";
}

export function canDropQuestItem(player: PlayerState, questId: QuestId) {
  return hasActiveQuest(player, questId);
}

function formatQuestProgress(quest: QuestState) {
  return `${Math.min(quest.progress, quest.required)}/${quest.required}`;
}

function formatNamedQuestProgress(quest: QuestState) {
  const completed = getQuestFlags(quest);
  const labels = QUESTS["feral-farmers"].objectives.map((objective) => (
    `${objective.label.replace("Defeat ", "")}: ${completed.has(objective.id) ? "done" : "needed"}`
  ));
  return labels.join(", ");
}

function getQuestFlags(quest: QuestState) {
  return new Set(quest.flags.split(",").filter(Boolean));
}

function getQuestObjectiveIds(questId: QuestId) {
  return getQuestObjectives(questId).map((objective) => objective.id);
}

export function addInventoryItem(player: PlayerState, itemId: ItemId, count: number) {
  const existing = player.inventory.get(itemId);
  if (existing) {
    existing.count += count;
    return;
  }

  const item = new InventoryItemState();
  item.id = itemId;
  item.count = count;
  player.inventory.set(itemId, item);
}

function removeInventoryItem(player: PlayerState, itemId: ItemId, count: number) {
  const existing = player.inventory.get(itemId);
  if (!existing) return;

  existing.count = Math.max(0, existing.count - count);
  if (existing.count <= 0) {
    player.inventory.delete(itemId);
  }
}

function getInventoryItemCount(player: PlayerState, itemId: ItemId) {
  return player.inventory.get(itemId)?.count ?? 0;
}

export function progressLootQuests(player: PlayerState, itemId: ItemId, count: number) {
  for (const questId of QUEST_IDS) {
    if (getQuestRequiredItemId(questId) === itemId) {
      progressQuest(player, questId, count);
    }
  }
}

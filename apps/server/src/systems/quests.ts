import {
  QUESTS,
  QUEST_IDS,
  clamp,
  getInventoryItemKey,
  getNpcQuestIds,
  getQuestObjectives,
  getQuestRepeatLabel,
  getQuestRequiredItemId,
  getQuestRewardItemIds,
  getQuestRequirement,
  getQuestStartItemId,
  getQuestTurnInNpcId,
  isQuestAutoReady,
  isQuestReadyToRepeat,
  isStackableItem,
  ITEMS,
  normalizeChainTokenId,
  shouldConsumeQuestItem,
  type ItemId,
  type QuestId,
  type QuestOffer,
  type QuestStatusNotice,
  type QuestTurnIn,
} from "@mferland/shared";
import { InventoryItemState, QuestState, type NpcState, type PlayerState } from "../state.js";

export type NpcQuestInteraction =
  | { type: "offer"; offer: QuestOffer }
  | { type: "turnIn"; turnIn: QuestTurnIn }
  | { type: "status"; notice: QuestStatusNotice }
  | { type: "flavor"; text: string };

export function getNpcDialogue(npc: NpcState, player: PlayerState) {
  if (npc.role === "quest_giver" && npc.questId) {
    return `${player.name}, ${npc.dialogue}`;
  }
  return npc.dialogue;
}

export function getNpcQuestInteraction(npc: NpcState, player: PlayerState): NpcQuestInteraction | null {
  const questIds = getNpcQuestIds(npc.id);
  if (questIds.length === 0) return null;

  for (const questId of questIds) {
    const isGiver = QUESTS[questId].giverNpcId === npc.id;
    const isTurnInNpc = getQuestTurnInNpcId(questId) === npc.id;
    const quest = player.quests.get(questId);
    if (!quest) {
      if (!isGiver) continue;
      if (!isQuestAvailable(player, questId)) continue;

      return { type: "offer", offer: makeQuestOffer(questId, npc) };
    }

    if (quest.status === "completed") {
      if (isGiver && isQuestAvailable(player, questId)) {
        return { type: "offer", offer: makeQuestOffer(questId, npc) };
      }
      continue;
    }

    syncQuestItemProgress(player, questId);
    if (quest.status === "active" && isQuestAutoReady(questId)) {
      quest.status = "ready";
      quest.progress = quest.required;
    }

    if (quest.status === "active") {
      if (!isTurnInNpc && isGiver) {
        return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getQuestTravelDialogue(questId)) };
      }
      if (!isTurnInNpc) continue;
      return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getActiveQuestDialogue(questId, quest)) };
    }

    if (quest.status === "ready") {
      if (!isTurnInNpc) {
        if (isGiver) {
          return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getQuestTravelDialogue(questId)) };
        }
        continue;
      }

      return { type: "turnIn", turnIn: makeQuestTurnIn(questId, npc, quest) };
    }
  }

  return { type: "flavor", text: getFinishedQuestDialogue(npc.id) };
}

function getActiveQuestDialogue(questId: QuestId, quest: QuestState) {
  if (getQuestObjectives(questId).length > 0) {
    return `${QUESTS[questId].title}: ${formatNamedQuestProgress(quest)}.`;
  }

  if (questId === "hog-livers") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hog livers in the bag. ugly drop rate, normal town problem.`;
  }

  if (questId === "route-patrol-daily") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} route problems cleared.`;
  }

  if (questId === "hog-loop") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hogs cleared from the loop.`;
  }

  if (questId === "signal-scraps") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} static scraps collected. still buzzing, unfortunately.`;
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

export function getNextAvailableQuestId(player: PlayerState, questId: QuestId): QuestId | null {
  const quest = QUESTS[questId];
  const nextQuestId = "nextQuestId" in quest ? quest.nextQuestId : null;
  return nextQuestId && isQuestAvailable(player, nextQuestId) ? nextQuestId : null;
}

function getQuestCompletionResponse(questId: QuestId) {
  if (questId === "mfer-beginnings") {
    return "dao board mfer writes your name somewhere probably official.";
  }

  if (questId === "sealed-note") {
    return "drip mfer tucks the note away. zero questions. healthy town behavior.";
  }

  if (questId === "farmhand-bandanas") {
    return "these rags will make ugly little warning flags for red-eye farm.";
  }

  if (questId === "dao-tour") {
    return "fountain mfer confirms the plaza loop. this is how government works here.";
  }

  if (questId === "fountain-vibes") {
    return "old head mfer sees you made the loop. town accepts this as enough.";
  }

  if (questId === "feral-farmers") {
    return "good. fewer fried airdrop brains on the road.";
  }

  if (questId === "hog-livers") {
    return "the hog charm smells illegal. hogwatch says it works.";
  }

  if (questId === "field-camp-delivery") {
    return "route post marks the road open. one less thing to argue about.";
  }

  if (questId === "route-patrol-daily") {
    return "route sweep logged. board looks slightly less embarrassing.";
  }

  if (questId === "hog-loop") {
    return "another hog loop handled. nobody is shocked it will come back.";
  }

  if (questId === "ridge-dispatch") {
    return "ridge post mfer pins the ping to the board and points uptrail.";
  }

  if (questId === "signal-scraps") {
    return "these scraps still buzz. enough for relay mfer to make it someone else's problem.";
  }

  if (questId === "cut-the-static") {
    return "the crew is down. only the big pile of bad signal is still up.";
  }

  if (questId === "baron-of-static") {
    return "static baron mfer is offline. the relay can now do the daily stupid thing.";
  }

  if (questId === "ogre-raid-daily") {
    return "the huge mfer ogre is down. relay mfer cuts the signal before it gets ideas.";
  }

  return "errand handled.";
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "og-mfer") return "town's still standing. good enough.";
  if (npcId === "wearables-mfer") return "good town. better hats.";
  if (npcId === "dao-mfer") return "nothing here is that organized.";
  if (npcId === "fountain-mfer") return "good fountain. good smoke. good enough.";
  if (npcId === "hogwatch-mfer") return "farm smells awful. still gotta clear it.";
  if (npcId === "field-guide-mfer") return "camp stays up if the road stays quiet.";
  if (npcId === "pen-keeper-mfer") return "hog loop never ends.";
  if (npcId === "ridge-guide-mfer") return "static's louder uptrail.";
  if (npcId === "beacon-keeper-mfer") return "if the baron's still up, we're not done.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "og-mfer") return "old head mfer";
  if (npcId === "wearables-mfer") return "drip mfer";
  if (npcId === "dao-mfer") return "dao board mfer";
  if (npcId === "fountain-mfer") return "fountain mfer";
  if (npcId === "hogwatch-mfer") return "hogwatch mfer";
  if (npcId === "field-guide-mfer") return "route post mfer";
  if (npcId === "pen-keeper-mfer") return "hog loop mfer";
  if (npcId === "ridge-guide-mfer") return "ridge post mfer";
  if (npcId === "beacon-keeper-mfer") return "relay mfer";
  return "the right mfer";
}

export function isQuestAvailable(player: PlayerState, questId: QuestId, now = Date.now()) {
  const existingQuest = player.quests.get(questId);
  if (existingQuest) return isQuestReadyToRepeat(questId, existingQuest, now);

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return player.quests.get(requiredQuestId)?.status === "completed";
}

export function makeQuestOffer(questId: QuestId, npc: NpcState) {
  const quest = QUESTS[questId];
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    title: quest.title,
    description: quest.description,
    storyText: quest.description,
    objectiveLabel: quest.objectiveLabel,
    required: quest.required,
    rewardPreview: getQuestRewardPreview(questId),
  };
}

export function makeQuestTurnIn(questId: QuestId, npc: NpcState, questState: QuestState): QuestTurnIn {
  const quest = QUESTS[questId];
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    title: quest.title,
    completionText: getQuestCompletionResponse(questId),
    completedTaskSummary: getCompletedTaskSummary(questId, questState),
    objectiveLabel: getQuestTurnInLabel(questId),
    progress: Math.min(questState.progress, questState.required),
    required: questState.required,
    rewardPreview: getQuestRewardPreview(questId),
  };
}

function makeQuestStatusNotice(
  questId: QuestId,
  npc: NpcState,
  questState: QuestState,
  statusText: string,
): QuestStatusNotice {
  const quest = QUESTS[questId];
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    title: quest.title,
    statusText,
    objectiveLabel: quest.objectiveLabel,
    progress: Math.min(questState.progress, questState.required),
    required: questState.required,
    rewardPreview: getQuestRewardPreview(questId),
  };
}

function getQuestTurnInLabel(questId: QuestId) {
  const quest = QUESTS[questId];
  return quest.turnInLabel;
}

function getQuestRewardPreview(questId: QuestId) {
  const quest = QUESTS[questId];
  const rewards = [`${quest.xpReward} XP`, "town standing"];
  for (const itemId of getQuestRewardItemIds(questId)) {
    rewards.push(ITEMS[itemId].name);
  }
  const repeatLabel = getQuestRepeatLabel(questId);
  if (repeatLabel) rewards.push(repeatLabel);
  const nextQuestId = "nextQuestId" in quest ? quest.nextQuestId : null;
  if (nextQuestId) rewards.push(`Follow-up: ${QUESTS[nextQuestId].title}`);
  return rewards;
}

function getCompletedTaskSummary(questId: QuestId, quest: QuestState) {
  const objectives = getQuestObjectives(questId);
  if (objectives.length > 0) {
    const completed = getQuestFlags(quest);
    const completedLabels = objectives
      .filter((objective) => completed.has(objective.id))
      .map((objective) => objective.label);
    if (completedLabels.length > 0) return completedLabels.join(", ");
  }

  return `${QUESTS[questId].objectiveLabel}: ${Math.min(quest.progress, quest.required)}/${quest.required}`;
}

export function normalizeQuestId(input: unknown): QuestId | null {
  return typeof input === "string" && QUEST_IDS.includes(input as QuestId) ? input as QuestId : null;
}

export function startQuest(player: PlayerState, questId: QuestId) {
  const existingQuest = player.quests.get(questId);
  if (existingQuest) {
    if (!isQuestReadyToRepeat(questId, existingQuest)) return;
    resetQuest(existingQuest, questId);
    syncQuestItemProgress(player, questId);
    return;
  }

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

function resetQuest(quest: QuestState, questId: QuestId) {
  quest.id = questId;
  quest.required = QUESTS[questId].required;
  quest.status = isQuestAutoReady(questId) ? "ready" : "active";
  quest.progress = quest.status === "ready" ? quest.required : 0;
  quest.flags = "";
  quest.completedAt = 0;
}

export function completeQuest(player: PlayerState, questId: QuestId, now: number) {
  const quest = player.quests.get(questId);
  if (!quest) return false;
  if (quest.status === "completed") return false;

  syncQuestItemProgress(player, questId);
  if (quest.status !== "ready" && quest.progress < quest.required) return false;

  const requiredItemId = getQuestRequiredItemId(questId);
  if (requiredItemId && shouldConsumeQuestItem(questId)) {
    removeInventoryItem(player, requiredItemId, quest.required);
  }

  quest.status = "completed";
  quest.progress = quest.required;
  quest.completedAt = now;

  for (const itemId of getQuestRewardItemIds(questId)) {
    addInventoryItem(player, itemId, 1);
  }

  return true;
}

export function progressDefeatQuests(player: PlayerState, npc: NpcState) {
  let progressed = false;

  for (const questId of QUEST_IDS) {
    if (getQuestObjectiveIds(questId).includes(npc.id)) {
      progressed = progressNamedQuestObjective(player, questId, npc.id) || progressed;
    }
    if (isDefeatQuestTarget(questId, npc)) {
      progressed = progressQuest(player, questId, 1) || progressed;
    }
  }

  return progressed;
}

function isDefeatQuestTarget(questId: QuestId, npc: NpcState) {
  const quest = QUESTS[questId];
  const targetModels = "defeatNpcModels" in quest ? quest.defeatNpcModels as readonly string[] : [];
  const targetRoles = "defeatNpcRoles" in quest ? quest.defeatNpcRoles as readonly string[] : [];
  return targetModels.includes(npc.model) || targetRoles.includes(npc.role);
}

function progressNamedQuestObjective(player: PlayerState, questId: QuestId, objectiveId: string) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return false;
  if (!getQuestObjectiveIds(questId).includes(objectiveId)) return false;

  const completed = getQuestFlags(quest);
  if (completed.has(objectiveId)) return false;

  completed.add(objectiveId);
  quest.flags = Array.from(completed).sort().join(",");
  quest.progress = clamp(completed.size, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
  return true;
}

function progressQuest(player: PlayerState, questId: QuestId, amount: number) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status !== "active") return false;

  quest.progress = clamp(quest.progress + amount, 0, quest.required);
  if (quest.progress >= quest.required) {
    quest.status = "ready";
  }
  return true;
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
  const labels = getQuestObjectives(quest.id).map((objective) => (
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

export function addInventoryItem(player: PlayerState, itemId: ItemId, count: number, chainTokenId = "") {
  if (count <= 0) return;

  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  const inventoryKey = getInventoryItemKey(itemId, normalizedTokenId);
  const nextCount = isStackableItem(itemId) || normalizedTokenId ? count : 1;
  const existing = player.inventory.get(inventoryKey);
  if (existing) {
    existing.count = isStackableItem(itemId) || normalizedTokenId
      ? existing.count + nextCount
      : Math.max(existing.count, nextCount);
    return;
  }

  const item = new InventoryItemState();
  item.id = itemId;
  item.chainTokenId = normalizedTokenId;
  item.count = nextCount;
  player.inventory.set(inventoryKey, item);
}

function removeInventoryItem(player: PlayerState, itemId: ItemId, count: number) {
  let remaining = count;
  const emptyKeys: string[] = [];
  player.inventory.forEach((existing, key) => {
    if (remaining <= 0 || existing.id !== itemId) return;

    const removed = Math.min(existing.count, remaining);
    existing.count = Math.max(0, existing.count - removed);
    remaining -= removed;
    if (existing.count <= 0) emptyKeys.push(key);
  });

  for (const key of emptyKeys) {
    player.inventory.delete(key);
  }
}

function getInventoryItemCount(player: PlayerState, itemId: ItemId) {
  let count = 0;
  player.inventory.forEach((item) => {
    if (item.id === itemId) count += item.count;
  });
  return count;
}

export function progressLootQuests(player: PlayerState, itemId: ItemId, count: number) {
  for (const questId of QUEST_IDS) {
    if (getQuestRequiredItemId(questId) === itemId) {
      progressQuest(player, questId, count);
    }
  }
}

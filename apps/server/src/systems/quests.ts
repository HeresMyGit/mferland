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
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hog livers collected. They do not always drop, so keep hunting.`;
  }

  if (questId === "route-patrol-daily") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} farm-road threats cleared.`;
  }

  if (questId === "hog-loop") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} wild hogs cleared from the loop.`;
  }

  if (questId === "signal-scraps") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} signal scraps collected. The raiders do not always drop clean parts.`;
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
    return "DAO mfer logs your name and points you toward the fountain route.";
  }

  if (questId === "sealed-note") {
    return "Wearables mfer tucks the note away and starts pulling fabric scraps.";
  }

  if (questId === "farmhand-bandanas") {
    return "These scraps will make warning flags for the farm road.";
  }

  if (questId === "dao-tour") {
    return "Fountain mfer marks the plaza route complete and sends the vibe back to OG.";
  }

  if (questId === "fountain-vibes") {
    return "OG mfer sees you made the loop. Now the real errand starts.";
  }

  if (questId === "feral-farmers") {
    return "Good work. The farm road should be safer for now.";
  }

  if (questId === "hog-livers") {
    return "This brew smells awful, but it should keep the road clear.";
  }

  if (questId === "field-camp-delivery") {
    return "Field Camp marks the road open and lights the route lantern.";
  }

  if (questId === "route-patrol-daily") {
    return "Daily patrol logged. The route has room to breathe.";
  }

  if (questId === "hog-loop") {
    return "That pass through the hog loop bought the camp more quiet.";
  }

  if (questId === "ridge-dispatch") {
    return "Ridge Guide mfer pins the dispatch to the signal board and points at the static uptrail.";
  }

  if (questId === "signal-scraps") {
    return "These scraps still buzz. Enough to tune the ridge relay.";
  }

  if (questId === "cut-the-static") {
    return "The scout crew is down. Only the named relay boss is still holding the signal.";
  }

  if (questId === "baron-of-static") {
    return "Static Baron Nox is off the relay. The ridge can now overcharge the signal for bigger daily raids.";
  }

  if (questId === "ogre-raid-daily") {
    return "The huge mfer ogre is down. Beacon Keeper mfer cuts the relay before it calls anything worse.";
  }

  return "Quest complete.";
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "og-mfer") return "you made the town loop. The farm road is where the next trouble starts.";
  if (npcId === "wearables-mfer") return "the red-eye scraps are enough for a few road flags.";
  if (npcId === "dao-mfer") return "the DAO hall is on the map now. Fountain mfer keeps the town route moving.";
  if (npcId === "fountain-mfer") return "fountain vibes are handled. OG has the next thing.";
  if (npcId === "hogwatch-mfer") return "the farm is quieter already. Town owes you one.";
  if (npcId === "field-guide-mfer") return "the road is marked. Daily patrols will stay posted.";
  if (npcId === "pen-keeper-mfer") return "the hog loop always needs another sweep.";
  if (npcId === "ridge-guide-mfer") return "Signal Ridge is marked. Keep an ear out for static.";
  if (npcId === "beacon-keeper-mfer") return "the ridge relay is quiet for now.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "og-mfer") return "OG mfer";
  if (npcId === "wearables-mfer") return "Wearables mfer";
  if (npcId === "dao-mfer") return "DAO mfer";
  if (npcId === "fountain-mfer") return "Fountain mfer";
  if (npcId === "hogwatch-mfer") return "Hogwatch mfer";
  if (npcId === "field-guide-mfer") return "Field Guide mfer";
  if (npcId === "pen-keeper-mfer") return "Pen Keeper mfer";
  if (npcId === "ridge-guide-mfer") return "Ridge Guide mfer";
  if (npcId === "beacon-keeper-mfer") return "Beacon Keeper mfer";
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
  const rewards = [`${quest.xpReward} XP`, "Town standing"];
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

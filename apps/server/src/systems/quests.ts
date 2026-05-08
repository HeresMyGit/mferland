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

  if (questId === "ask-mfergpt") {
    return `${QUESTS[questId].title}: put @mfergpt anywhere in chat, then check in with mferGPT.`;
  }

  if (questId === "mfergpt-checkin") {
    return `${QUESTS[questId].title}: say @mfergpt in chat. any message with the mention counts.`;
  }

  if (questId === "tweet-town-link") {
    return `${QUESTS[questId].title}: open the tweet composer, post only if you mean it, then claim the ping.`;
  }

  if (questId === "boar-bristle-cull") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} wild boars killed.`;
  }

  if (questId === "farmhand-bandanas") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} red-eye farmhands killed.`;
  }

  if (questId === "hog-livers") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hog loop livers in the bag. ugly drop rate, normal town problem.`;
  }

  if (questId === "route-patrol-daily") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} route problems cleared.`;
  }

  if (questId === "hog-loop") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} hogs cleared from the loop.`;
  }

  if (questId === "signal-scraps") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} fried relay scraps collected. still buzzing, unfortunately.`;
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
    return "good. you found the board. don't start respecting it.";
  }

  if (questId === "mfergpt-checkin") {
    return "mferGPT heard the signal. somehow that counts as onboarding.";
  }

  if (questId === "tweet-town-link") {
    return "mferGPT logs the town link ping. no bot touched the tweet button.";
  }

  if (questId === "sealed-note") {
    return "yep. that's for me. town still runs on folded notes and side-eye.";
  }

  if (questId === "ask-mfergpt") {
    return "good. if the agent says farm first, take that as practical advice, not prophecy.";
  }

  if (questId === "boar-bristle-cull") {
    return "hogwatch mfer says the farm road is slightly less boar-shaped now.";
  }

  if (questId === "farmhand-bandanas") {
    return "drip mfer can stitch ugly little warning flags now that fewer red-eyes are standing.";
  }

  if (questId === "dao-tour") {
    return "yeah, that's the fountain. more governance happens there than at the board.";
  }

  if (questId === "fountain-vibes") {
    return "good. now you know the town loop. that's enough orientation.";
  }

  if (questId === "feral-farmers") {
    return "good. less loop-brain drifting off that farm now.";
  }

  if (questId === "hog-livers") {
    return "disgusting. exactly right. route should hold a little longer.";
  }

  if (questId === "field-camp-delivery") {
    return "got it. road's open enough to risk sending more mfers through.";
  }

  if (questId === "route-patrol-daily") {
    return "nice. road's walkable again. check tomorrow; it never stays civil.";
  }

  if (questId === "hog-loop") {
    return "clean enough. give it five minutes and the mud will get ideas again.";
  }

  if (questId === "ridge-dispatch") {
    return "made it. if you can find the ridge once, you can usually find it again.";
  }

  if (questId === "signal-scraps") {
    return "good scrap. still humming. means it hasn't fully lied to us yet.";
  }

  if (questId === "cut-the-static") {
    return "crew's down. now we deal with the one big body holding the mess together.";
  }

  if (questId === "baron-of-static") {
    return "beautiful. ridge can hear itself think again.";
  }

  if (questId === "ogre-raid-daily") {
    return "clean hit. that's all the bad feed in one body, and you folded it.";
  }

  return "errand handled.";
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "mfergpt") return "signal's clean enough for now.";
  if (npcId === "og-mfer") return "town's still standing. good enough.";
  if (npcId === "wearables-mfer") return "good town. better hats.";
  if (npcId === "dao-mfer") return "nothing here is that organized.";
  if (npcId === "fountain-mfer") return "good fountain. good smoke. good enough.";
  if (npcId === "hogwatch-mfer") return "farm's still full of loop-brain. keep it thin.";
  if (npcId === "field-guide-mfer") return "camp stays up if the road stays quiet.";
  if (npcId === "pen-keeper-mfer") return "hog loop resets faster than shame.";
  if (npcId === "ridge-guide-mfer") return "static's louder uptrail.";
  if (npcId === "beacon-keeper-mfer") return "too much signal makes one big stupid body.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "mfergpt") return "mferGPT";
  if (npcId === "og-mfer") return "OG porch mfer";
  if (npcId === "wearables-mfer") return "drip desk mfer";
  if (npcId === "dao-mfer") return "board mfer";
  if (npcId === "fountain-mfer") return "fountain rail mfer";
  if (npcId === "hogwatch-mfer") return "hogwatch mfer";
  if (npcId === "field-guide-mfer") return "route board mfer";
  if (npcId === "pen-keeper-mfer") return "loop booth mfer";
  if (npcId === "ridge-guide-mfer") return "ridge post mfer";
  if (npcId === "beacon-keeper-mfer") return "relay shack mfer";
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

export function progressMferGptAskQuest(player: PlayerState, text: string) {
  if (!hasMferGptMention(text)) return false;

  const quest = player.quests.get("ask-mfergpt");
  if (!quest || quest.status !== "active") return false;

  quest.progress = quest.required;
  quest.status = "ready";
  return true;
}

export function progressMferGptMentionQuest(player: PlayerState, text: string) {
  if (!hasMferGptMention(text)) return false;
  return progressQuest(player, "mfergpt-checkin", 1);
}

function hasMferGptMention(text: string) {
  return text.toLowerCase().includes("@mfergpt");
}

export function progressSocialQuest(player: PlayerState, questId: QuestId) {
  if (questId !== "tweet-town-link") return false;
  return progressQuest(player, questId, 1);
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

import {
  QUESTS,
  QUEST_IDS,
  clamp,
  getInventoryItemKey,
  getMferGptDailyQuestAssignmentFromFlags,
  getNpcQuestIds,
  getQuestObjectives,
  getQuestNextQuestId,
  getQuestRepeatLabel,
  getQuestRequiredItemId,
  getQuestRewardItemIds,
  getQuestRequirement,
  getQuestStartItemId,
  getQuestTurnInNpcId,
  isQuestAutoReady,
  isQuestReadyToRepeat,
  isMferGptDailyQuestDefeatTarget,
  isMferGptDailyQuestItem,
  isStackableItem,
  LOANER_FISHING_POLE_ITEM_ID,
  ITEMS,
  hasExplicitMferAppearanceTraits,
  normalizeChainTokenId,
  parseMferAppearanceTraitsJson,
  shouldConsumeQuestItem,
  type ItemId,
  type QuestId,
  type QuestOffer,
  type QuestStatusNotice,
  type QuestTurnIn,
} from "@mferland/shared";
import { InventoryItemState, QuestState, type NpcState, type PlayerState } from "../state.js";
import {
  getActiveMferGptDailyQuestAssignment,
  makeActiveMferGptDailyQuestFlags,
} from "./generatedDailyQuests.js";

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

  const npcQuests = questIds.map((questId) => ({
    questId,
    isGiver: QUESTS[questId].giverNpcId === npc.id,
    isTurnInNpc: getQuestTurnInNpcId(questId) === npc.id,
    quest: player.quests.get(questId),
  }));

  for (const entry of npcQuests) {
    if (!entry.quest) continue;
    syncQuestState(player, entry.questId, entry.quest);
  }

  for (const { questId, isTurnInNpc, quest } of npcQuests) {
    if (quest?.status === "ready" && isTurnInNpc) {
      return { type: "turnIn", turnIn: makeQuestTurnIn(questId, npc, quest) };
    }
  }

  for (const { questId, isGiver, quest } of npcQuests) {
    if (!isGiver) continue;
    if (!quest && isQuestAvailable(player, questId)) {
      return { type: "offer", offer: makeQuestOffer(questId, npc) };
    }
    if (quest?.status === "completed" && isQuestAvailable(player, questId)) {
      return { type: "offer", offer: makeQuestOffer(questId, npc) };
    }
  }

  for (const { questId, isGiver, isTurnInNpc, quest } of npcQuests) {
    if (!quest || quest.status === "completed") continue;

    if (quest.status === "active") {
      if (!isTurnInNpc && isGiver) {
        return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getQuestTravelDialogue(questId)) };
      }
      if (!isTurnInNpc) continue;
      return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getActiveQuestDialogue(questId, quest)) };
    }

    if (quest.status === "ready" && !isTurnInNpc && isGiver) {
      return { type: "status", notice: makeQuestStatusNotice(questId, npc, quest, getQuestTravelDialogue(questId)) };
    }
  }

  return { type: "flavor", text: getFinishedQuestDialogue(npc.id) };
}

function syncQuestState(player: PlayerState, questId: QuestId, quest: QuestState) {
  syncMferGptDailyQuestState(questId, quest);
  syncQuestItemProgress(player, questId);
  if (quest.status === "active" && isQuestImmediatelyReady(player, questId)) {
    quest.status = "ready";
    quest.progress = quest.required;
  }
}

function isQuestImmediatelyReady(player: PlayerState, questId: QuestId) {
  if (isQuestAutoReady(questId)) return true;
  if (questId !== "set-your-traits") return false;
  return hasExplicitMferAppearanceTraits(parseMferAppearanceTraitsJson(player.appearanceTraitsJson));
}

function syncMferGptDailyQuestState(questId: QuestId, quest: QuestState) {
  if (questId !== "mfergpt-daily-signal" || quest.status === "completed") return;

  const assignment = quest.flags
    ? getMferGptDailyQuestAssignmentFromFlags(quest.flags)
    : getActiveMferGptDailyQuestAssignment();
  if (!quest.flags) {
    quest.flags = makeActiveMferGptDailyQuestFlags();
  }
  if (quest.required !== assignment.required) {
    quest.required = assignment.required;
    quest.progress = clamp(quest.progress, 0, quest.required);
    if (quest.progress >= quest.required) {
      quest.status = "ready";
    } else if (quest.status === "ready") {
      quest.status = "active";
    }
  }
}

function getActiveQuestDialogue(questId: QuestId, quest: QuestState) {
  if (getQuestObjectives(questId).length > 0) {
    return `${QUESTS[questId].title}: ${formatNamedQuestProgress(quest)}.`;
  }

  if (questId === "ask-mfergpt") {
    return `${QUESTS[questId].title}: put @mfergpt anywhere in chat and ask for one lore fragment.`;
  }

  if (questId === "mfergpt-checkin") {
    return `${QUESTS[questId].title}: say @mfergpt in chat. any gm with the mention counts.`;
  }

  if (questId === "mfergpt-daily-signal") {
    const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
    return `${QUESTS[questId].title}: ${assignment.objectiveLabel}. progress ${formatQuestProgress(quest)}.`;
  }

  if (questId === "tweet-town-link") {
    return `${QUESTS[questId].title}: open the tweet composer, post the plaza signal if you mean it, then claim the ping.`;
  }

  if (questId === "set-your-traits") {
    return `${QUESTS[questId].title}: open the mirror rig, save a trait set that feels yours, then check back in.`;
  }

  if (questId === "boar-bristle-cull") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} stash-eating hogs cleared around the claim pile.`;
  }

  if (questId === "hog-livers") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} chewed EOS recovered from farm-road hogs. ugly drop rate, normal town problem.`;
  }

  if (questId === "route-patrol-daily") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} claim-route problems cleared near route post.`;
  }

  if (questId === "hog-loop") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} stash-eating hogs cleared near claim booth.`;
  }

  if (questId === "signal-scraps") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} fried uplink shards collected on Signal Ridge. still buzzing, unfortunately.`;
  }

  if (questId === "lost-fishing-shoes") {
    return `${QUESTS[questId].title}: ${formatQuestProgress(quest)} soggy fishing shoes recovered. cast at south center pond until the bad footwear appears.`;
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
  const nextQuestId = getQuestNextQuestId(questId);
  return nextQuestId && isQuestAvailable(player, nextQuestId) ? nextQuestId : null;
}

function getQuestCompletionResponse(questId: QuestId) {
  if (questId === "mfer-beginnings") {
    return "good. you found an oldhead. that's how town works: memory, not management.";
  }

  if (questId === "set-your-traits") {
    return "clean enough to be yours. first look's on town. changing your mind after this gets onchain.";
  }

  if (questId === "mfergpt-checkin") {
    return "mferGPT heard the gm. signal's alive enough.";
  }

  if (questId === "mfergpt-daily-signal") {
    return "daily fieldwork logged. mferGPT folds the camp back into the signal until tomorrow.";
  }

  if (questId === "tweet-town-link") {
    return "mferGPT logs the plaza ping. no bot touched the tweet button.";
  }

  if (questId === "sealed-note") {
    return "yep. seed note landed. town still runs on folded paper and side-eye. i've got the farm handoff next.";
  }

  if (questId === "farm-road-handoff") {
    return "good. claim-brain starts here. clear the hogs before the airdrop mfers convince themselves this is alpha.";
  }

  if (questId === "ask-mfergpt") {
    return "good. one lore shard in the pocket. history's scattered, but it is not dead.";
  }

  if (questId === "boar-bristle-cull") {
    return "claimwatch mfer says the pile is slightly less hog-shaped now.";
  }

  if (questId === "dao-tour") {
    return "yeah, that's the fountain. more truth happens on that rail than in any official plan.";
  }

  if (questId === "fountain-vibes") {
    return "good. now you know the loop: mfers kept showing up, so the town stayed alive.";
  }

  if (questId === "feral-farmers") {
    return "good. less next-drop sickness drifting off that farm now.";
  }

  if (questId === "hog-livers") {
    return "disgusting. exactly right. that's enough chewed EOS to keep the route breathing.";
  }

  if (questId === "field-camp-delivery") {
    return "got it. route still works. tiny miracle, no ceremony.";
  }

  if (questId === "route-patrol-daily") {
    return "nice. claim route's walkable again. check tomorrow; the farm always finds new stupid.";
  }

  if (questId === "hog-loop") {
    return "clean enough. give it a day and the hogs will eat the stash again.";
  }

  if (questId === "ridge-dispatch") {
    return "made it. bad signal starts here, so keep your head quieter than the ridge.";
  }

  if (questId === "signal-scraps") {
    return "good shard. still humming. means the uplink hasn't fully lied to us yet.";
  }

  if (questId === "cut-the-static") {
    return "repeaters are down. now we deal with the one big body holding the control loop together.";
  }

  if (questId === "baron-of-static") {
    return "signal cleared. one old signature made it through: sartoshi_rip. guess the mfer's back.";
  }

  if (questId === "ogre-raid-daily") {
    return "clean hit. bear market mfer folded back into silence.";
  }

  if (questId === "fishin-lesson") {
    return "good. you watched the bobber instead of inventing a roadmap. real pole's yours. fish monger has a shoe problem next.";
  }

  if (questId === "lost-fishing-shoes") {
    return "those are absolutely disgusting. perfect. fish ledger's open now, bring me the good stuff.";
  }

  return "errand handled.";
}

function getQuestCompletionText(questId: QuestId) {
  const response = getQuestCompletionResponse(questId);
  const nextDirection = getQuestCompletionNextDirection(questId);
  return nextDirection ? `${response} ${nextDirection}` : response;
}

function getQuestCompletionNextDirection(questId: QuestId) {
  const nextQuestId = getQuestNextQuestId(questId);
  if (!nextQuestId) return "";

  const turnInNpcId = getQuestTurnInNpcId(questId);
  const nextGiverNpcId = QUESTS[nextQuestId].giverNpcId;
  if (nextGiverNpcId === turnInNpcId) return `Next: pick up ${QUESTS[nextQuestId].title} here.`;

  return `Next: talk to ${getNpcDisplayName(nextGiverNpcId)} for ${QUESTS[nextQuestId].title}.`;
}

function getFinishedQuestDialogue(npcId: string) {
  if (npcId === "mfergpt") return "signal's clean enough for now.";
  if (npcId === "og-mfer") return "town's still standing. good enough.";
  if (npcId === "wearables-mfer") return "good town. better hats.";
  if (npcId === "traits-mfer") return "mirror's still warm if you need a paid redo.";
  if (npcId === "dao-mfer") return "plant seeds. promises are just noise with better shoes.";
  if (npcId === "fountain-mfer") return "good fountain. good smoke. good enough.";
  if (npcId === "hogwatch-mfer") return "farm's still full of claim-brain. keep it thin.";
  if (npcId === "field-guide-mfer") return "route stays up if the claim road stays quiet.";
  if (npcId === "pen-keeper-mfer") return "hog loop resets daily because cope has no cooldown.";
  if (npcId === "motherfisher") return "chum's behind the counter if you finished the lesson.";
  if (npcId === "fish-monger") return "fish ledger's open if my shoes are back.";
  if (npcId === "ridge-guide-mfer") return "bad signal gets louder uptrail.";
  if (npcId === "beacon-keeper-mfer") return "say when and i'll call bear market mfer down from the uplink.";
  return "nothing else for now.";
}

function getNpcDisplayName(npcId: string) {
  if (npcId === "mfergpt") return "mferGPT";
  if (npcId === "og-mfer") return "OG porch mfer";
  if (npcId === "wearables-mfer") return "drip desk mfer";
  if (npcId === "traits-mfer") return "traits mfer";
  if (npcId === "dao-mfer") return "oldhead mfer";
  if (npcId === "fountain-mfer") return "fountain rail mfer";
  if (npcId === "hogwatch-mfer") return "claimwatch mfer";
  if (npcId === "field-guide-mfer") return "route post mfer";
  if (npcId === "pen-keeper-mfer") return "claim booth mfer";
  if (npcId === "motherfisher") return "Motherfisher";
  if (npcId === "fish-monger") return "fish monger";
  if (npcId === "ridge-guide-mfer") return "signal post mfer";
  if (npcId === "beacon-keeper-mfer") return "uplink shack mfer";
  return "the right mfer";
}

export function isQuestAvailable(player: PlayerState, questId: QuestId, now = Date.now()) {
  const existingQuest = player.quests.get(questId);
  if (existingQuest) return isQuestReadyToRepeat(questId, existingQuest, now);

  const nextQuestId = getQuestNextQuestId(questId);
  if (questId !== "set-your-traits" && nextQuestId && player.quests.get(nextQuestId)?.status === "completed") return false;

  const requiredQuestId = getQuestRequirement(questId);
  if (!requiredQuestId) return true;

  return player.quests.get(requiredQuestId)?.status === "completed";
}

export function makeQuestOffer(questId: QuestId, npc: NpcState) {
  const quest = QUESTS[questId];
  const dailyAssignment = questId === "mfergpt-daily-signal" ? getActiveMferGptDailyQuestAssignment() : null;
  const turnInNpcId = getQuestTurnInNpcId(questId);
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    turnInNpcId,
    turnInNpcName: getNpcDisplayName(turnInNpcId),
    title: dailyAssignment ? dailyAssignment.title : quest.title,
    description: dailyAssignment ? `${quest.description} Today's pull: ${dailyAssignment.summary}` : quest.description,
    storyText: dailyAssignment ? dailyAssignment.summary : quest.description,
    objectiveLabel: dailyAssignment ? dailyAssignment.objectiveLabel : quest.objectiveLabel,
    required: dailyAssignment ? dailyAssignment.required : quest.required,
    rewardPreview: getQuestRewardPreview(questId),
  };
}

export function makeQuestTurnIn(questId: QuestId, npc: NpcState, questState: QuestState): QuestTurnIn {
  const quest = QUESTS[questId];
  const dailyAssignment = questId === "mfergpt-daily-signal"
    ? getMferGptDailyQuestAssignmentFromFlags(questState.flags)
    : null;
  const turnInNpcId = getQuestTurnInNpcId(questId);
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    turnInNpcId,
    turnInNpcName: getNpcDisplayName(turnInNpcId),
    title: dailyAssignment ? dailyAssignment.title : quest.title,
    completionText: getQuestCompletionText(questId),
    completedTaskSummary: getCompletedTaskSummary(questId, questState),
    objectiveLabel: dailyAssignment ? dailyAssignment.objectiveLabel : getQuestTurnInLabel(questId),
    progress: Math.min(questState.progress, questState.required),
    required: questState.required,
    rewardPreview: getQuestRewardPreview(questId),
  };
}

export function makeQuestStatusNotice(
  questId: QuestId,
  npc: NpcState,
  questState: QuestState,
  statusText: string,
): QuestStatusNotice {
  const quest = QUESTS[questId];
  const dailyAssignment = questId === "mfergpt-daily-signal"
    ? getMferGptDailyQuestAssignmentFromFlags(questState.flags)
    : null;
  const turnInNpcId = getQuestTurnInNpcId(questId);
  return {
    questId,
    npcId: npc.id,
    npcName: npc.name,
    turnInNpcId,
    turnInNpcName: getNpcDisplayName(turnInNpcId),
    title: dailyAssignment ? dailyAssignment.title : quest.title,
    statusText,
    objectiveLabel: dailyAssignment ? dailyAssignment.objectiveLabel : quest.objectiveLabel,
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
  const nextQuestId = getQuestNextQuestId(questId);
  if (nextQuestId) rewards.push(`Next: ${QUESTS[nextQuestId].title} from ${getNpcDisplayName(QUESTS[nextQuestId].giverNpcId)}`);
  return rewards;
}

function getCompletedTaskSummary(questId: QuestId, quest: QuestState) {
  if (questId === "mfergpt-daily-signal") {
    const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
    return `${assignment.objectiveLabel}: ${Math.min(quest.progress, quest.required)}/${quest.required}`;
  }

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
  const questStartState = getQuestStartState(questId);
  quest.id = questId;
  quest.required = questStartState.required;
  quest.status = isQuestImmediatelyReady(player, questId) ? "ready" : "active";
  quest.progress = quest.status === "ready" ? quest.required : 0;
  quest.flags = questStartState.flags;
  quest.completedAt = 0;
  player.quests.set(questId, quest);
  syncQuestItemProgress(player, questId);
}

export function cancelQuest(player: PlayerState, questId: QuestId) {
  const quest = player.quests.get(questId);
  if (!quest || quest.status === "completed") return false;

  const startItemId = getQuestStartItemId(questId);
  if (startItemId) removeInventoryItem(player, startItemId, quest.required);
  player.quests.delete(questId);
  return true;
}

function resetQuest(quest: QuestState, questId: QuestId) {
  const questStartState = getQuestStartState(questId);
  quest.id = questId;
  quest.required = questStartState.required;
  quest.status = isQuestAutoReady(questId) ? "ready" : "active";
  quest.progress = quest.status === "ready" ? quest.required : 0;
  quest.flags = questStartState.flags;
  quest.completedAt = 0;
}

function getQuestStartState(questId: QuestId) {
  if (questId !== "mfergpt-daily-signal") {
    return { required: QUESTS[questId].required, flags: "" };
  }

  const assignment = getActiveMferGptDailyQuestAssignment();
  return {
    required: assignment.required,
    flags: makeActiveMferGptDailyQuestFlags(),
  };
}

export function completeQuest(player: PlayerState, questId: QuestId, now: number) {
  const quest = player.quests.get(questId);
  if (!quest) return false;
  if (quest.status === "completed") return false;

  syncMferGptDailyQuestState(questId, quest);
  syncQuestItemProgress(player, questId);
  if (quest.status !== "ready" && quest.progress < quest.required) return false;

  const requiredItemId = getQuestRequiredItemId(questId);
  if (requiredItemId && shouldConsumeQuestItem(questId)) {
    removeInventoryItem(player, requiredItemId, quest.required);
  }
  if (questId === "fishin-lesson") {
    removeInventoryItem(player, LOANER_FISHING_POLE_ITEM_ID, 1);
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
    if (isDefeatQuestTarget(player, questId, npc)) {
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
  const progressedCheckin = progressQuest(player, "mfergpt-checkin", 1);
  return progressedCheckin;
}

function hasMferGptMention(text: string) {
  return text.toLowerCase().includes("@mfergpt");
}

export function progressSocialQuest(player: PlayerState, questId: QuestId) {
  if (questId !== "tweet-town-link") return false;
  return progressQuest(player, questId, 1);
}

export function progressTraitQuest(player: PlayerState) {
  return progressQuest(player, "set-your-traits", 1);
}

export function progressFishingQuest(player: PlayerState) {
  return progressQuest(player, "fishin-lesson", 1);
}

function isDefeatQuestTarget(player: PlayerState, questId: QuestId, npc: NpcState) {
  if (questId === "mfergpt-daily-signal") {
    const quest = player.quests.get(questId);
    if (!quest || quest.status !== "active") return false;
    syncMferGptDailyQuestState(questId, quest);
    const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
    return isMferGptDailyQuestDefeatTarget(assignment, npc);
  }

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

  const dailyQuest = player.quests.get("mfergpt-daily-signal");
  if (!dailyQuest || dailyQuest.status !== "active") return;

  syncMferGptDailyQuestState("mfergpt-daily-signal", dailyQuest);
  const assignment = getMferGptDailyQuestAssignmentFromFlags(dailyQuest.flags);
  if (isMferGptDailyQuestItem(assignment, itemId)) {
    progressQuest(player, "mfergpt-daily-signal", count);
  }
}

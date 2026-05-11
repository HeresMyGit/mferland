import {
  ITEMS,
  QUESTS,
  getMferGptDailyQuestAssignmentFromFlags,
  getQuestObjectives,
  getQuestRequiredItemId,
  getQuestTurnInNpcId,
  isMferGptDailyQuestDefeatTarget,
  isMferGptDailyQuestDropSource,
  type ItemId,
  type NpcModel,
  type NpcRole,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestId,
  type QuestSnapshot,
} from "@mferland/shared";

export type QuestGuidanceKind = "turnIn" | "kill" | "collect" | "talk" | "action";

export type QuestGuidanceTarget = {
  id: string;
  npcId?: string;
  label: string;
  kind: QuestGuidanceKind;
  x: number;
  z: number;
};

export type ActiveQuestGuidance = {
  quest: QuestSnapshot;
  summary: string;
  targets: QuestGuidanceTarget[];
};

export function getActiveQuestGuidance(
  quest: QuestSnapshot | null,
  npcs: Map<string, NpcSnapshot>,
  localPlayer: PlayerSnapshot | null,
): ActiveQuestGuidance | null {
  if (!quest || quest.status === "completed") return null;

  const objectiveLabel = getQuestObjectiveLabel(quest);
  if (quest.status === "ready") {
    return makeNpcGuidance({
      quest,
      npcs,
      npcId: getQuestTurnInNpcId(quest.id),
      kind: "turnIn",
      summary: getQuestTurnInLabel(quest),
      labelPrefix: "turn in",
      localPlayer,
    });
  }

  const objectiveTargets = getNamedObjectiveTargets(quest, npcs);
  if (objectiveTargets.length > 0) {
    return {
      quest,
      summary: objectiveLabel,
      targets: sortTargets(objectiveTargets, localPlayer),
    };
  }

  const collectionTargets = getCollectionTargets(quest, npcs);
  if (collectionTargets.length > 0) {
    return {
      quest,
      summary: objectiveLabel,
      targets: sortTargets(collectionTargets, localPlayer),
    };
  }

  const defeatTargets = quest.id === "mfergpt-daily-signal"
    ? getMferGptDailyDefeatTargets(quest, npcs)
    : getDefeatTargets(quest.id, npcs);
  if (defeatTargets.length > 0) {
    return {
      quest,
      summary: objectiveLabel,
      targets: sortTargets(defeatTargets, localPlayer),
    };
  }

  const fallbackKind = isActionQuest(quest.id) ? "action" : "talk";
  return makeNpcGuidance({
    quest,
    npcs,
    npcId: getQuestTurnInNpcId(quest.id),
    kind: fallbackKind,
    summary: objectiveLabel,
    labelPrefix: fallbackKind === "action" ? "check in" : "go to",
    localPlayer,
  });
}

export function getPrimaryQuestGuidanceTarget(
  guidance: ActiveQuestGuidance | null,
  localPlayer: PlayerSnapshot | null,
) {
  if (!guidance || guidance.targets.length === 0) return null;
  return sortTargets(guidance.targets, localPlayer)[0] ?? null;
}

function makeNpcGuidance({
  quest,
  npcs,
  npcId,
  kind,
  summary,
  labelPrefix,
  localPlayer,
}: {
  quest: QuestSnapshot;
  npcs: Map<string, NpcSnapshot>;
  npcId: string;
  kind: QuestGuidanceKind;
  summary: string;
  labelPrefix: string;
  localPlayer: PlayerSnapshot | null;
}): ActiveQuestGuidance | null {
  const npc = npcs.get(npcId);
  if (!npc) return null;

  return {
    quest,
    summary,
    targets: sortTargets([makeNpcTarget(npc, kind, `${labelPrefix}: ${npc.name}`)], localPlayer),
  };
}

function getNamedObjectiveTargets(quest: QuestSnapshot, npcs: Map<string, NpcSnapshot>): QuestGuidanceTarget[] {
  const completed = new Set(quest.flags.split(",").filter(Boolean));
  return getQuestObjectives(quest.id)
    .filter((objective) => !completed.has(objective.id))
    .map((objective) => {
      const npc = npcs.get(objective.id);
      return npc && isNpcAliveForGuidance(npc)
        ? makeNpcTarget(npc, "kill", objective.label)
        : null;
    })
    .filter((target): target is QuestGuidanceTarget => Boolean(target));
}

function getCollectionTargets(quest: QuestSnapshot, npcs: Map<string, NpcSnapshot>): QuestGuidanceTarget[] {
  if (quest.id === "mfergpt-daily-signal") {
    const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
    if (!assignment.itemId) return [];

    const itemName = ITEMS[assignment.itemId].name;
    return Array.from(npcs.values())
      .filter((npc) => isNpcAliveForGuidance(npc) && isMferGptDailyQuestDropSource(assignment, npc))
      .map((npc) => makeNpcTarget(npc, "collect", `collect ${itemName}: ${npc.name}`));
  }

  const itemId = getQuestRequiredItemId(quest.id);
  if (!itemId) return [];

  const itemName = ITEMS[itemId].name;
  return Array.from(npcs.values())
    .filter((npc) => isNpcAliveForGuidance(npc) && canNpcDropQuestItem(npc, itemId))
    .map((npc) => makeNpcTarget(npc, "collect", `collect ${itemName}: ${npc.name}`));
}

function getDefeatTargets(questId: QuestId, npcs: Map<string, NpcSnapshot>): QuestGuidanceTarget[] {
  if (questId === "mfergpt-daily-signal") return [];

  return Array.from(npcs.values())
    .filter((npc) => isNpcAliveForGuidance(npc) && isDefeatTargetForQuest(questId, npc))
    .map((npc) => makeNpcTarget(npc, "kill", `drop: ${npc.name}`));
}

function getMferGptDailyDefeatTargets(quest: QuestSnapshot, npcs: Map<string, NpcSnapshot>): QuestGuidanceTarget[] {
  const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
  return Array.from(npcs.values())
    .filter((npc) => isNpcAliveForGuidance(npc) && isMferGptDailyQuestDefeatTarget(assignment, npc))
    .map((npc) => makeNpcTarget(npc, "kill", `drop: ${npc.name}`));
}

function isDefeatTargetForQuest(questId: QuestId, npc: NpcSnapshot) {
  if (questId === "route-patrol-daily") return npc.model === "hog" || (npc.role === "farmer" && isFarmRoadEnemy(npc));

  const definition = QUESTS[questId];
  const models = "defeatNpcModels" in definition ? definition.defeatNpcModels as readonly NpcModel[] : [];
  const roles = "defeatNpcRoles" in definition ? definition.defeatNpcRoles as readonly NpcRole[] : [];
  return models.includes(npc.model) || roles.includes(npc.role);
}

function canNpcDropQuestItem(npc: NpcSnapshot, itemId: ItemId) {
  if (itemId === "hog-liver") return npc.model === "hog";
  if (itemId === "signal-scrap") return isRidgeEnemy(npc);
  return false;
}

function makeNpcTarget(npc: NpcSnapshot, kind: QuestGuidanceKind, label: string): QuestGuidanceTarget {
  return {
    id: npc.id,
    npcId: npc.id,
    label,
    kind,
    x: npc.x,
    z: npc.z,
  };
}

function sortTargets(targets: QuestGuidanceTarget[], localPlayer: PlayerSnapshot | null) {
  if (!localPlayer) return [...targets];
  return [...targets].sort((left, right) => {
    const leftDistance = Math.hypot(left.x - localPlayer.x, left.z - localPlayer.z);
    const rightDistance = Math.hypot(right.x - localPlayer.x, right.z - localPlayer.z);
    return leftDistance - rightDistance;
  });
}

function isActionQuest(questId: QuestId) {
  const definition = QUESTS[questId];
  return "chatMention" in definition || "socialAction" in definition;
}

function getQuestObjectiveLabel(quest: QuestSnapshot) {
  if (quest.id === "mfergpt-daily-signal") {
    return getMferGptDailyQuestAssignmentFromFlags(quest.flags).objectiveLabel;
  }
  return QUESTS[quest.id].objectiveLabel;
}

function getQuestTurnInLabel(quest: QuestSnapshot) {
  return QUESTS[quest.id].turnInLabel;
}

function isNpcAliveForGuidance(npc: NpcSnapshot) {
  return npc.isImmortal || npc.health > 0;
}

function isFarmRoadEnemy(npc: NpcSnapshot) {
  return !isRidgeEnemy(npc) && npc.id !== "raid-ogre-mfer";
}

function isRidgeEnemy(npc: NpcSnapshot) {
  return npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

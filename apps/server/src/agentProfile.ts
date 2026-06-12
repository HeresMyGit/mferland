import {
  ELIXIR_BUFFS,
  EQUIPMENT_SLOT_IDS,
  EQUIPMENT_SLOTS,
  ITEMS,
  PLAYER,
  QUESTS,
  TALENTS,
  getEquippedCharacterStats,
  getItemEquipment,
  getLevelProgress,
  getTalentEffectTotals,
  normalizeWalletAddress,
  type ActiveBuffSnapshot,
  type EquipmentSlotId,
  type EquipmentSlotSnapshot,
  type InventoryItemSnapshot,
  type ItemDefinition,
  type ItemId,
  type QuestSnapshot,
  type StatKey,
  type TalentRankSnapshot,
} from "@mferland/shared";
import { loadOrCreateWalletCharacter, type PersistedCharacter } from "./persistence.js";

type ProfileStatKey = StatKey | "healthRegenPer5" | "manaRegenPer5" | "walkSpeed" | "runSpeed";
type QuestDefinitionView = (typeof QUESTS)[keyof typeof QUESTS] & {
  turnInNpcId?: string;
  objectives?: ReadonlyArray<{ id: string; label: string }>;
};

const PROFILE_STAT_KEYS = [
  "maxHealth",
  "maxMana",
  "strength",
  "dexterity",
  "magic",
  "healthRegenPer5",
  "manaRegenPer5",
  "walkSpeed",
  "runSpeed",
] as const satisfies ReadonlyArray<ProfileStatKey>;

export async function buildAgentProfile(walletAddress: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return {
      status: 400,
      body: {
        ok: false,
        exists: false,
        walletAddress: "",
        error: "valid wallet address required",
      },
    };
  }

  const character = await loadOrCreateWalletCharacter({
    walletAddress: normalizedWallet,
    displayName: "agent-profile",
    avatarSeed: 1,
    createIfMissing: false,
  });

  if (!character) {
    return {
      status: 200,
      body: {
        ok: true,
        exists: false,
        walletAddress: normalizedWallet,
        generatedAt: new Date().toISOString(),
        source: "persisted_character",
        note: "No persisted wallet character exists yet. Join the game once with this wallet to create one.",
      },
    };
  }

  const levelProgress = getLevelProgress(character.xp);
  const equipment = describeEquipment(character);
  const inventory = describeInventory(character.inventory);
  const quests = describeQuests(character.quests);
  const talents = describeTalents(character);
  const stats = describeStats(character);
  const activeBuffs = describeActiveBuffs(character.activeBuffs);
  const chest = equipment.bySlot.chest;
  const currentQuest = quests.ready[0] ?? quests.active[0] ?? null;

  return {
    status: 200,
    body: {
      ok: true,
      exists: true,
      walletAddress: normalizedWallet,
      generatedAt: new Date().toISOString(),
      source: "persisted_character",
      note: "Read-only saved profile. Use /agent-observe for live HP, position, aggro, nearby NPCs, chat, loot windows, cooldowns, and active room state.",
      quickFacts: {
        level: character.level,
        levelLabel: levelProgress.isMaxLevel
          ? `level ${character.level} (max level)`
          : `level ${character.level} (${levelProgress.current}/${levelProgress.required} XP toward level ${character.level + 1})`,
        xp: character.xp,
        talentPoints: character.talentPoints,
        season0Points: character.season0Points,
        season0DailyPoints: character.season0DailyPoints,
        chest: chest?.equipped ? chest.name : "nothing equipped",
        currentQuest: currentQuest ? currentQuest.title : "",
      },
      character: {
        id: character.characterId,
        name: character.name,
        avatarSeed: character.avatarSeed,
        appearanceTraits: character.appearanceTraits,
        level: character.level,
        xp: character.xp,
        levelProgress,
        talentPoints: character.talentPoints,
        season0Points: character.season0Points,
        season0DailyPoints: character.season0DailyPoints,
        createdAt: character.createdAt.toISOString(),
        updatedAt: character.updatedAt.toISOString(),
        nameLocked: Boolean(character.nameLockedAt),
      },
      stats,
      equipment: equipment.slots,
      equipmentBySlot: equipment.bySlot,
      inventory,
      quests,
      talents,
      activeBuffs,
    },
  };
}

function describeStats(character: PersistedCharacter) {
  const equipmentStats = getEquippedCharacterStats(character.equipment.filter(hasEquippedItem).map((slot) => ({
    itemId: slot.itemId,
    chainTier: slot.chainTier,
  })), character.level);
  const talentEffects = getTalentEffectTotals(character.talents);
  const buffEffects = character.activeBuffs.reduce<Partial<Record<ProfileStatKey, number>>>((totals, buff) => {
    const effects = ELIXIR_BUFFS[buff.id]?.effects as Partial<Record<ProfileStatKey, number>> | undefined;
    if (!effects) return totals;
    for (const key of PROFILE_STAT_KEYS) {
      totals[key] = (totals[key] ?? 0) + (effects[key] ?? 0);
    }
    return totals;
  }, {});

  return {
    maxHealth: equipmentStats.maxHealth + (talentEffects.stats.maxHealth ?? 0) + (buffEffects.maxHealth ?? 0),
    maxMana: equipmentStats.maxMana + (talentEffects.stats.maxMana ?? 0) + (buffEffects.maxMana ?? 0),
    strength: equipmentStats.strength + (talentEffects.stats.strength ?? 0) + (buffEffects.strength ?? 0),
    dexterity: equipmentStats.dexterity + (talentEffects.stats.dexterity ?? 0) + (buffEffects.dexterity ?? 0),
    magic: equipmentStats.magic + (talentEffects.stats.magic ?? 0) + (buffEffects.magic ?? 0),
    healthRegenPer5: PLAYER.healthRegenPer5 + talentEffects.healthRegenPer5 + (buffEffects.healthRegenPer5 ?? 0),
    manaRegenPer5: PLAYER.manaRegenPer5 + talentEffects.manaRegenPer5 + (buffEffects.manaRegenPer5 ?? 0),
    walkSpeed: PLAYER.walkSpeed + talentEffects.walkSpeed + (buffEffects.walkSpeed ?? 0),
    runSpeed: PLAYER.runSpeed + talentEffects.runSpeed + (buffEffects.runSpeed ?? 0),
  };
}

function describeEquipment(character: PersistedCharacter) {
  const bySlot = {} as Record<EquipmentSlotId, ReturnType<typeof describeEquipmentSlot>>;
  for (const slotId of EQUIPMENT_SLOT_IDS) {
    bySlot[slotId] = describeEquipmentSlot(
      slotId,
      character.equipment.find((slot) => slot.slot === slotId) ?? null,
      character.level,
    );
  }
  return {
    slots: EQUIPMENT_SLOT_IDS.map((slotId) => bySlot[slotId]),
    bySlot,
  };
}

function describeEquipmentSlot(slotId: EquipmentSlotId, slot: EquipmentSlotSnapshot | null, playerLevel: number) {
  const itemId = slot?.itemId || null;
  const definition = itemId ? ITEMS[itemId] : null;
  const equipment = itemId ? getItemEquipment(itemId, slot?.chainTier, playerLevel) : null;
  return {
    slot: slotId,
    slotLabel: EQUIPMENT_SLOTS[slotId],
    equipped: Boolean(slot && definition),
    itemId: slot?.itemId ?? "",
    name: definition?.name ?? "empty",
    quality: definition?.quality ?? "",
    description: definition?.description ?? "",
    chainTokenId: slot?.chainTokenId ?? "",
    chainTier: slot?.chainTier ?? 0,
    build: equipment?.build ?? "",
    stats: equipment?.stats ?? {},
  };
}

function describeInventory(inventory: InventoryItemSnapshot[]) {
  const items = inventory
    .filter((item) => item.count > 0)
    .map((item) => describeInventoryItem(item))
    .sort((left, right) => left.name.localeCompare(right.name) || left.itemId.localeCompare(right.itemId));
  return {
    itemStacks: items.length,
    totalCount: items.reduce((sum, item) => sum + item.count, 0),
    consumables: items.filter((item) => item.consumable).map((item) => ({
      itemId: item.itemId,
      name: item.name,
      count: item.count,
      kind: item.consumable?.kind ?? "",
      health: item.consumable?.health ?? 0,
      mana: item.consumable?.mana ?? 0,
    })),
    equipmentItems: items.filter((item) => item.equipment).map((item) => ({
      itemId: item.itemId,
      name: item.name,
      count: item.count,
      slot: item.equipment?.slot ?? "",
      chainTokenId: item.chainTokenId,
      chainTier: item.chainTier,
    })),
    questItems: items.filter((item) => item.quality === "quest").map((item) => ({
      itemId: item.itemId,
      name: item.name,
      count: item.count,
    })),
    items,
  };
}

function describeInventoryItem(item: InventoryItemSnapshot) {
  const definition = ITEMS[item.id] as ItemDefinition;
  const equipment = getItemEquipment(item.id, item.chainTier);
  return {
    itemId: item.id,
    name: definition.name,
    description: definition.description,
    quality: definition.quality,
    count: item.count,
    value: definition.value ?? 0,
    chainTokenId: item.chainTokenId,
    chainTier: item.chainTier,
    equipment,
    consumable: definition.consumable ?? null,
  };
}

function describeQuests(quests: QuestSnapshot[]) {
  const described = quests
    .map((quest) => describeQuest(quest))
    .sort((left, right) => statusSort(left.status) - statusSort(right.status) || left.title.localeCompare(right.title));
  return {
    active: described.filter((quest) => quest.status === "active"),
    ready: described.filter((quest) => quest.status === "ready"),
    completed: described.filter((quest) => quest.status === "completed"),
    all: described,
  };
}

function describeQuest(quest: QuestSnapshot) {
  const definition = QUESTS[quest.id] as QuestDefinitionView;
  const completedObjectiveIds = new Set(quest.flags.split(",").filter(Boolean));
  return {
    id: quest.id,
    title: definition.title,
    status: quest.status,
    progress: quest.progress,
    required: quest.required,
    progressLabel: quest.status === "completed" ? "completed" : `${Math.min(quest.progress, quest.required)}/${quest.required}`,
    ready: quest.status === "ready" || quest.progress >= quest.required,
    objectiveLabel: definition.objectiveLabel,
    turnInLabel: definition.turnInLabel,
    giverNpcId: definition.giverNpcId,
    turnInNpcId: definition.turnInNpcId ?? definition.giverNpcId,
    completedAt: quest.completedAt,
    objectives: (definition.objectives ?? []).map((objective) => ({
      id: objective.id,
      label: objective.label,
      done: completedObjectiveIds.has(objective.id),
    })),
  };
}

function describeTalents(character: PersistedCharacter) {
  const ranks = character.talents
    .map((talent) => describeTalent(talent))
    .sort((left, right) => left.tree.localeCompare(right.tree) || left.name.localeCompare(right.name));
  return {
    unspentPoints: character.talentPoints,
    ranks,
  };
}

function describeTalent(talent: TalentRankSnapshot) {
  const definition = TALENTS[talent.id];
  return {
    id: talent.id,
    tree: talent.tree,
    nodeId: talent.nodeId,
    name: definition.name,
    description: definition.description,
    effectText: definition.effectText,
    rank: talent.rank,
    maxRank: definition.maxRank,
  };
}

function describeActiveBuffs(activeBuffs: ActiveBuffSnapshot[]) {
  const now = Date.now();
  return activeBuffs.map((buff) => ({
    ...buff,
    remainingMs: Math.max(0, buff.expiresAt - now),
  }));
}

function statusSort(status: QuestSnapshot["status"]) {
  if (status === "ready") return 0;
  if (status === "active") return 1;
  return 2;
}

function hasEquippedItem(slot: EquipmentSlotSnapshot): slot is EquipmentSlotSnapshot & { itemId: ItemId } {
  return Boolean(slot.itemId);
}

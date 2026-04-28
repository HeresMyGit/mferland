import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  ITEMS,
  EQUIPMENT_SLOT_IDS,
  QUEST_IDS,
  type EquipmentSlotId,
  type EquipmentSlotSnapshot,
  type InventoryItemSnapshot,
  type ItemId,
  type QuestId,
  type QuestSnapshot,
  type QuestStatus,
} from "@mferland/shared";
import { getDatabase } from "./db/client.js";
import {
  accounts,
  accountWallets,
  characterInventory,
  characterEquipment,
  characterQuests,
  characters,
} from "./db/schema.js";

export type PersistedCharacter = {
  accountId: string;
  characterId: string;
  name: string;
  avatarSeed: number;
  level: number;
  xp: number;
  talentPoints: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
};

export type PersistableCharacterState = {
  characterId: string;
  name: string;
  avatarSeed: number;
  level: number;
  xp: number;
  talentPoints: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
};

export async function loadOrCreateWalletCharacter({
  walletAddress,
  displayName,
  avatarSeed,
}: {
  walletAddress: string;
  displayName: string;
  avatarSeed: number;
}): Promise<PersistedCharacter | null> {
  const db = getDatabase();
  if (!db) return null;

  const normalizedWallet = walletAddress.toLowerCase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedWallet}), 0)`);

    const now = new Date();
    const existingWallet = await tx.query.accountWallets.findFirst({
      where: eq(accountWallets.walletAddress, normalizedWallet),
    });

    let accountId = existingWallet?.accountId;
    if (!accountId) {
      accountId = randomUUID();
      await tx.insert(accounts).values({
        id: accountId,
        displayName,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(accountWallets).values({
        accountId,
        walletAddress: normalizedWallet,
        walletType: "external",
        primaryWallet: true,
        createdAt: now,
      });
    } else {
      await tx.update(accounts)
        .set({ displayName, updatedAt: now })
        .where(eq(accounts.id, accountId));
    }

    let character = await tx.query.characters.findFirst({
      where: eq(characters.accountId, accountId),
    });

    if (!character) {
      const characterId = randomUUID();
      const [created] = await tx.insert(characters)
        .values({
          id: characterId,
          accountId,
          name: displayName,
          avatarSeed,
          level: 1,
          xp: 0,
          talentPoints: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      character = created;
    } else {
      const [updated] = await tx.update(characters)
        .set({ name: displayName, updatedAt: now })
        .where(eq(characters.id, character.id))
        .returning();
      character = updated;
    }

    const [questRows, inventoryRows, equipmentRows] = await Promise.all([
      tx.select().from(characterQuests).where(eq(characterQuests.characterId, character.id)),
      tx.select().from(characterInventory).where(eq(characterInventory.characterId, character.id)),
      tx.select().from(characterEquipment).where(eq(characterEquipment.characterId, character.id)),
    ]);

    return {
      accountId,
      characterId: character.id,
      name: character.name,
      avatarSeed: character.avatarSeed,
      level: character.level,
      xp: character.xp,
      talentPoints: character.talentPoints,
      quests: questRows
        .filter((quest) => isKnownQuestId(quest.questId) && isQuestStatus(quest.status))
        .map((quest) => ({
          id: quest.questId as QuestId,
          status: quest.status as QuestStatus,
          progress: quest.progress,
          required: quest.required,
          flags: quest.flags,
          completedAt: quest.completedAt,
        })),
      inventory: inventoryRows
        .filter((item) => isKnownItemId(item.itemId) && item.count > 0)
        .map((item) => ({
          id: item.itemId as ItemId,
          count: item.count,
        })),
      equipment: equipmentRows
        .filter((slot) => isKnownEquipmentSlotId(slot.slot) && isKnownItemId(slot.itemId))
        .map((slot) => ({
          slot: slot.slot as EquipmentSlotId,
          itemId: slot.itemId as ItemId,
        })),
    };
  });
}

export async function saveCharacterProgress(state: PersistableCharacterState) {
  const db = getDatabase();
  if (!db) return;

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(characters)
      .set({
        name: state.name,
        avatarSeed: state.avatarSeed,
        level: state.level,
        xp: state.xp,
        talentPoints: state.talentPoints,
        updatedAt: now,
      })
      .where(eq(characters.id, state.characterId));

    await tx.delete(characterQuests).where(eq(characterQuests.characterId, state.characterId));
    if (state.quests.length > 0) {
      await tx.insert(characterQuests).values(state.quests.map((quest) => ({
        characterId: state.characterId,
        questId: quest.id,
        status: quest.status,
        progress: quest.progress,
        required: quest.required,
        flags: quest.flags,
        completedAt: quest.completedAt,
        updatedAt: now,
      })));
    }

    await tx.delete(characterInventory).where(eq(characterInventory.characterId, state.characterId));
    const inventory = state.inventory.filter((item) => item.count > 0);
    if (inventory.length > 0) {
      await tx.insert(characterInventory).values(inventory.map((item) => ({
        characterId: state.characterId,
        itemId: item.id,
        count: item.count,
        updatedAt: now,
      })));
    }

    await tx.delete(characterEquipment).where(eq(characterEquipment.characterId, state.characterId));
    const equipment = state.equipment.filter((slot) => slot.itemId && isKnownItemId(slot.itemId));
    if (equipment.length > 0) {
      await tx.insert(characterEquipment).values(equipment.map((slot) => ({
        characterId: state.characterId,
        slot: slot.slot,
        itemId: slot.itemId,
        updatedAt: now,
      })));
    }
  });
}

function isKnownQuestId(value: string): value is QuestId {
  return QUEST_IDS.includes(value as QuestId);
}

function isKnownItemId(value: string): value is ItemId {
  return Object.prototype.hasOwnProperty.call(ITEMS, value);
}

function isKnownEquipmentSlotId(value: string): value is EquipmentSlotId {
  return EQUIPMENT_SLOT_IDS.includes(value as EquipmentSlotId);
}

function isQuestStatus(value: string): value is QuestStatus {
  return value === "active" || value === "ready" || value === "completed";
}

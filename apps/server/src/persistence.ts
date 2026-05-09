import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ITEMS,
  EQUIPMENT_SLOT_IDS,
  QUEST_IDS,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_ID,
  SEASON_0_TOTAL_POINT_CAP,
  TALENTS,
  getInventoryItemKey,
  getTalentId,
  getSeason0QuestReward,
  getSeasonRewardSourceId,
  isEquipmentCompatibleWithSlot,
  normalizeChainGearTier,
  normalizeChainTokenId,
  normalizeMferAppearanceTraits,
  normalizeWalletAddress,
  type EquipmentSlotId,
  type EquipmentSlotSnapshot,
  type InventoryItemSnapshot,
  type ItemId,
  type MferAppearanceTraits,
  type QuestId,
  type QuestSnapshot,
  type QuestStatus,
  type TalentRankSnapshot,
  type WalletCharacterPreview,
} from "@mferland/shared";
import { getDatabase } from "./db/client.js";
import {
  accounts,
  accountWallets,
  characterInventory,
  characterEquipment,
  characterQuests,
  characterTalents,
  characters,
  seasonRewardEvents,
} from "./db/schema.js";

type DatabaseTransaction = Parameters<Parameters<NonNullable<ReturnType<typeof getDatabase>>["transaction"]>[0]>[0];

export type PersistedCharacter = {
  accountId: string;
  characterId: string;
  name: string;
  avatarSeed: number;
  createdAt: Date;
  updatedAt: Date;
  nameLockedAt: Date | null;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  talentPoints: number;
  season0Points: number;
  season0DailyPoints: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
  talents: TalentRankSnapshot[];
};

export type PersistableCharacterState = {
  characterId: string;
  name: string;
  avatarSeed: number;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  talentPoints: number;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
  talents: TalentRankSnapshot[];
};

export type SeasonRewardAwardResult = {
  status: "awarded" | "duplicate" | "capped" | "ineligible" | "no_database";
  points: number;
  dailyTotal: number;
  seasonTotal: number;
  label: string;
};

function getRequiredDatabase() {
  const db = getDatabase();
  if (!db) throw new PersistenceUnavailableError();
  return db;
}

export class PersistenceUnavailableError extends Error {
  constructor(message = "wallet persistence unavailable") {
    super(message);
    this.name = "PersistenceUnavailableError";
  }
}

export async function getWalletCharacterProfile(walletAddress: string): Promise<WalletCharacterPreview | null> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return null;
  const db = getRequiredDatabase();

  const wallet = await findAccountWalletByNormalizedAddress(db, normalizedWallet);
  if (!wallet) return null;

  const character = await db.query.characters.findFirst({
    where: eq(characters.accountId, wallet.accountId),
  });
  if (!character) return null;

  return toWalletCharacterPreview(character);
}

export async function loadOrCreateWalletCharacter({
  walletAddress,
  displayName,
  avatarSeed,
  createIfMissing = false,
}: {
  walletAddress: string;
  displayName: string;
  avatarSeed: number;
  createIfMissing?: boolean;
}): Promise<PersistedCharacter | null> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return null;
  const db = getRequiredDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedWallet}), 0)`);

    const now = new Date();
    const existingWallet = await findAccountWalletByNormalizedAddress(tx, normalizedWallet);

    let accountId = existingWallet?.accountId;
    if (!accountId) {
      if (!createIfMissing) return null;
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
      if (createIfMissing) {
        await tx.update(accounts)
          .set({ displayName, updatedAt: now })
          .where(eq(accounts.id, accountId));
      }
    }

    let character = await tx.query.characters.findFirst({
      where: eq(characters.accountId, accountId),
    });

    if (!character) {
      if (!createIfMissing) return null;
      const characterId = randomUUID();
      const [created] = await tx.insert(characters)
        .values({
          id: characterId,
          accountId,
          name: displayName,
          avatarSeed,
          nameLockedAt: now,
          appearanceTraits: {},
          level: 1,
          xp: 0,
          talentPoints: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      character = created;
    } else if (!character.nameLockedAt) {
      const [updated] = await tx.update(characters)
        .set({ nameLockedAt: character.createdAt ?? now })
        .where(eq(characters.id, character.id))
        .returning();
      character = updated;
    }

    const [questRows, inventoryRows, equipmentRows, talentRows, seasonRewardTotals] = await Promise.all([
      tx.select().from(characterQuests).where(eq(characterQuests.characterId, character.id)),
      tx.select().from(characterInventory).where(eq(characterInventory.characterId, character.id)),
      tx.select().from(characterEquipment).where(eq(characterEquipment.characterId, character.id)),
      tx.select().from(characterTalents).where(eq(characterTalents.characterId, character.id)),
      getSeasonRewardTotals(tx, normalizedWallet, now),
    ]);

    const inventory = inventoryRows
      .filter((item) => isKnownItemId(item.itemId) && item.count > 0)
      .map((item) => ({
        id: item.itemId as ItemId,
        chainTokenId: normalizeChainTokenId(item.chainTokenId),
        chainTier: normalizeChainGearTier(item.chainTier),
        count: item.count,
      }));
    const ownedInventoryKeys = new Set(inventory.map((item) => getInventoryItemKey(item.id, item.chainTokenId)));
    const equipment = equipmentRows
      .filter((slot) => {
        if (!isKnownEquipmentSlotId(slot.slot) || !isKnownItemId(slot.itemId)) return false;
        if (!isEquipmentCompatibleWithSlot(slot.itemId as ItemId, slot.slot as EquipmentSlotId)) return false;
        return ownedInventoryKeys.has(getInventoryItemKey(slot.itemId as ItemId, slot.chainTokenId));
      })
      .map((slot) => ({
        slot: slot.slot as EquipmentSlotId,
        itemId: slot.itemId as ItemId,
        chainTokenId: normalizeChainTokenId(slot.chainTokenId),
        chainTier: normalizeChainGearTier(slot.chainTier),
      }));

    return {
      accountId,
      characterId: character.id,
      name: character.name,
      avatarSeed: character.avatarSeed,
      appearanceTraits: normalizeMferAppearanceTraits(character.appearanceTraits, {}),
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
      nameLockedAt: character.nameLockedAt,
      level: character.level,
      xp: character.xp,
      talentPoints: character.talentPoints,
      season0Points: seasonRewardTotals.seasonTotal,
      season0DailyPoints: seasonRewardTotals.dailyTotal,
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
      inventory,
      equipment,
      talents: talentRows
        .map((talent) => toTalentSnapshot(talent.tree, talent.nodeId, talent.rank))
        .filter((talent): talent is TalentRankSnapshot => talent !== null),
    };
  });
}

function findAccountWalletByNormalizedAddress(
  db: Pick<NonNullable<ReturnType<typeof getDatabase>>, "query">,
  normalizedWallet: string,
) {
  return db.query.accountWallets.findFirst({
    where: sql`lower(${accountWallets.walletAddress}) = ${normalizedWallet}`,
  });
}

export async function saveCharacterProgress(state: PersistableCharacterState) {
  const db = getRequiredDatabase();

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(characters)
      .set({
        name: state.name,
        avatarSeed: state.avatarSeed,
        appearanceTraits: normalizeMferAppearanceTraits(state.appearanceTraits, {}),
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
        chainTokenId: normalizeChainTokenId(item.chainTokenId),
        chainTier: normalizeChainGearTier(item.chainTier),
        count: item.count,
        updatedAt: now,
      })));
    }

    await tx.delete(characterEquipment).where(eq(characterEquipment.characterId, state.characterId));
    const ownedInventoryKeys = new Set(inventory.map((item) => getInventoryItemKey(item.id, item.chainTokenId)));
    const equipment = state.equipment.filter((slot) => (
      slot.itemId
      && isKnownItemId(slot.itemId)
      && isEquipmentCompatibleWithSlot(slot.itemId, slot.slot)
      && ownedInventoryKeys.has(getInventoryItemKey(slot.itemId, slot.chainTokenId))
    ));
    if (equipment.length > 0) {
      await tx.insert(characterEquipment).values(equipment.map((slot) => ({
        characterId: state.characterId,
        slot: slot.slot,
        itemId: slot.itemId,
        chainTokenId: normalizeChainTokenId(slot.chainTokenId),
        chainTier: normalizeChainGearTier(slot.chainTier),
        updatedAt: now,
      })));
    }

    await tx.delete(characterTalents).where(eq(characterTalents.characterId, state.characterId));
    const talents = state.talents.filter((talent) => talent.rank > 0 && Object.prototype.hasOwnProperty.call(TALENTS, talent.id));
    if (talents.length > 0) {
      await tx.insert(characterTalents).values(talents.map((talent) => ({
        characterId: state.characterId,
        tree: talent.tree,
        nodeId: talent.nodeId,
        rank: talent.rank,
        updatedAt: now,
      })));
    }
  });
}

export async function awardSeason0QuestReward({
  characterId,
  walletAddress,
  questId,
  now = new Date(),
}: {
  characterId: string;
  walletAddress: string;
  questId: QuestId;
  now?: Date;
}): Promise<SeasonRewardAwardResult> {
  const reward = getSeason0QuestReward(questId);
  if (!reward) {
    return { status: "ineligible", points: 0, dailyTotal: 0, seasonTotal: 0, label: "" };
  }

  const db = getDatabase();
  if (!db) {
    return { status: "no_database", points: 0, dailyTotal: 0, seasonTotal: 0, label: reward.label };
  }

  const normalizedWallet = walletAddress.toLowerCase();
  if (!normalizedWallet) {
    return { status: "ineligible", points: 0, dailyTotal: 0, seasonTotal: 0, label: reward.label };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:${normalizedWallet}`}), 0)`);

    const sourceId = getSeasonRewardSourceId(questId, now);
    const existing = await tx.query.seasonRewardEvents.findFirst({
      where: and(
        eq(seasonRewardEvents.seasonId, SEASON_0_ID),
        eq(seasonRewardEvents.characterId, characterId),
        eq(seasonRewardEvents.sourceType, "quest"),
        eq(seasonRewardEvents.sourceId, sourceId),
      ),
    });
    const totals = await getSeasonRewardTotals(tx, normalizedWallet, now);
    if (existing) {
      return {
        status: "duplicate",
        points: 0,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
      };
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - totals.dailyTotal);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - totals.seasonTotal);
    const points = Math.min(reward.points, remainingDaily, remainingSeason);
    if (points <= 0) {
      return {
        status: "capped",
        points: 0,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
      };
    }

    await tx.insert(seasonRewardEvents).values({
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      characterId,
      walletAddress: normalizedWallet,
      sourceType: "quest",
      sourceId,
      points,
      status: "pending",
      note: reward.label,
      createdAt: now,
    });

    return {
      status: "awarded",
      points,
      dailyTotal: totals.dailyTotal + points,
      seasonTotal: totals.seasonTotal + points,
      label: reward.label,
    };
  });
}

async function getSeasonRewardTotals(
  tx: DatabaseTransaction,
  walletAddress: string,
  now: Date,
) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const countedStatuses = ["pending", "approved", "distributed"];
  const [dailyRow] = await tx.select({
    total: sql<number>`coalesce(sum(${seasonRewardEvents.points}), 0)::int`,
  })
    .from(seasonRewardEvents)
    .where(and(
      eq(seasonRewardEvents.seasonId, SEASON_0_ID),
      eq(seasonRewardEvents.walletAddress, walletAddress),
      gte(seasonRewardEvents.createdAt, dayStart),
      inArray(seasonRewardEvents.status, countedStatuses),
    ));
  const [seasonRow] = await tx.select({
    total: sql<number>`coalesce(sum(${seasonRewardEvents.points}), 0)::int`,
  })
    .from(seasonRewardEvents)
    .where(and(
      eq(seasonRewardEvents.seasonId, SEASON_0_ID),
      eq(seasonRewardEvents.walletAddress, walletAddress),
      inArray(seasonRewardEvents.status, countedStatuses),
    ));

  return {
    dailyTotal: Number(dailyRow?.total ?? 0),
    seasonTotal: Number(seasonRow?.total ?? 0),
  };
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

function toTalentSnapshot(tree: string, nodeId: string, rank: number): TalentRankSnapshot | null {
  const talentId = getTalentId(tree, nodeId);
  if (!talentId) return null;

  const definition = TALENTS[talentId];
  const safeRank = Math.min(Math.max(Math.floor(rank), 0), definition.maxRank);
  if (safeRank <= 0) return null;

  return {
    id: talentId,
    tree: definition.tree,
    nodeId: definition.nodeId,
    rank: safeRank,
  };
}

function toWalletCharacterPreview(character: typeof characters.$inferSelect): WalletCharacterPreview {
  return {
    name: character.name,
    avatarSeed: character.avatarSeed,
    appearanceTraits: normalizeMferAppearanceTraits(character.appearanceTraits, {}),
    level: character.level,
    xp: character.xp,
    talentPoints: character.talentPoints,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
    nameLocked: Boolean(character.nameLockedAt),
  };
}

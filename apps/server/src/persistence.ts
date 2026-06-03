import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ITEMS,
  EQUIPMENT_SLOT_IDS,
  ELIXIR_BUFFS,
  QUEST_IDS,
  TRAIT_CHANGE_PRODUCT_ID,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_ID,
  SEASON_0_TOTAL_POINT_CAP,
  TALENTS,
  isElixirBuffId,
  getInventoryItemKey,
  getTalentId,
  getSeason0QuestReward,
  getSeasonRewardSourceId,
  isEquipmentCompatibleWithSlot,
  normalizeChainGearTier,
  normalizeChainTokenId,
  normalizeAvatarSeed,
  normalizeMferAppearanceTraits,
  normalizeWalletAddress,
  type EquipmentSlotId,
  type EquipmentSlotSnapshot,
  type ActiveBuffSnapshot,
  type InventoryItemSnapshot,
  type ItemId,
  type MferAppearanceTraits,
  type QuestId,
  type QuestSnapshot,
  type QuestStatus,
  type SeasonRewardSourceType,
  type TalentRankSnapshot,
  type WalletCharacterPreview,
} from "@mferland/shared";
import { getDatabase } from "./db/client.js";
import {
  accounts,
  accountWallets,
  characterInventory,
  characterBuffs,
  characterEquipment,
  characterQuests,
  characterTalents,
  characters,
  cryptoPurchaseEvents,
  inviteCodes,
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
  activeBuffs: ActiveBuffSnapshot[];
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
  activeBuffs: ActiveBuffSnapshot[];
};

export type CharacterTraitPaymentRecord = {
  chainId: number;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  tokenAddress: string;
  amountWei: string;
};

export type CharacterCryptoPurchaseRecord = CharacterTraitPaymentRecord & {
  productId: string;
  tokenId?: string;
  paymentToken?: string;
  note?: string;
};

export type SeasonRewardAwardResult = {
  status: "awarded" | "duplicate" | "capped" | "ineligible" | "no_database";
  points: number;
  dailyTotal: number;
  seasonTotal: number;
  label: string;
};

export type SeasonLeaderboardEntry = {
  rank: number;
  walletAddress: string;
  characterName: string;
  avatarSeed: number;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  seasonPoints: number;
  dailyPoints: number;
  pendingPoints: number;
  approvedPoints: number;
  distributedPoints: number;
  events: number;
  lastEventAt: string;
};

export type SeasonLeaderboardSnapshot = {
  ok: true;
  seasonId: typeof SEASON_0_ID;
  generatedAt: string;
  dailyPointCap: typeof SEASON_0_DAILY_POINT_CAP;
  totalPointCap: typeof SEASON_0_TOTAL_POINT_CAP;
  entries: SeasonLeaderboardEntry[];
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

export type WalletInviteAccessResult = {
  ok: boolean;
  reason: "claimed" | "valid_code" | "missing_code" | "invalid_code" | "used_code" | "no_database";
};

export async function getWalletInviteAccess(walletAddress: string, inviteCode: string): Promise<WalletInviteAccessResult> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return { ok: false, reason: "missing_code" };
  const db = getDatabase();
  if (!db) return { ok: false, reason: "no_database" };

  const existingWallet = await findAccountWalletByNormalizedAddress(db, normalizedWallet);
  if (existingWallet) return { ok: true, reason: "claimed" };

  const normalizedCode = normalizeInviteCode(inviteCode);
  if (!normalizedCode) return { ok: false, reason: "missing_code" };

  const invite = await db.query.inviteCodes.findFirst({
    where: eq(inviteCodes.code, normalizedCode),
  });
  if (!invite) return { ok: false, reason: "invalid_code" };

  const claimedWallet = normalizeWalletAddress(invite.claimedWalletAddress);
  if (claimedWallet && claimedWallet !== normalizedWallet) return { ok: false, reason: "used_code" };
  return { ok: true, reason: "valid_code" };
}

export async function recordWalletInviteUsage(walletAddress: string, inviteCode: string, accountId = "") {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return false;
  const db = getDatabase();
  if (!db) return false;

  try {
    const now = new Date();
    const normalizedCode = normalizeInviteCode(inviteCode);
    if (normalizedCode) {
      const claimed = await db.update(inviteCodes)
        .set({
          claimedWalletAddress: normalizedWallet,
          claimedAccountId: accountId || null,
          claimedAt: now,
          lastUsedAt: now,
        })
        .where(sql`${inviteCodes.code} = ${normalizedCode} AND (${inviteCodes.claimedWalletAddress} = '' OR lower(${inviteCodes.claimedWalletAddress}) = ${normalizedWallet})`)
        .returning({ code: inviteCodes.code });
      return claimed.length > 0;
    }

    await db.update(inviteCodes)
      .set({ lastUsedAt: now })
      .where(sql`lower(${inviteCodes.claimedWalletAddress}) = ${normalizedWallet}`);
    return true;
  } catch {
    console.warn("Failed to record wallet invite usage; continuing without blocking wallet join.");
    return false;
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
  const persistedAvatarSeed = normalizeAvatarSeed(avatarSeed);
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
          avatarSeed: persistedAvatarSeed,
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

    const canPersistBuffs = await hasCharacterBuffsTable(tx);
    const [questRows, inventoryRows, equipmentRows, talentRows, buffRows, seasonRewardTotals] = await Promise.all([
      tx.select().from(characterQuests).where(eq(characterQuests.characterId, character.id)),
      tx.select().from(characterInventory).where(eq(characterInventory.characterId, character.id)),
      tx.select().from(characterEquipment).where(eq(characterEquipment.characterId, character.id)),
      tx.select().from(characterTalents).where(eq(characterTalents.characterId, character.id)),
      canPersistBuffs
        ? tx.select().from(characterBuffs).where(eq(characterBuffs.characterId, character.id))
        : Promise.resolve([]),
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
      activeBuffs: buffRows
        .filter((buff) => isElixirBuffId(buff.buffId) && buff.expiresAt > Date.now())
        .map((buff) => {
          const definition = ELIXIR_BUFFS[buff.buffId as keyof typeof ELIXIR_BUFFS];
          return {
            id: buff.buffId,
            itemId: definition.itemId,
            name: definition.name,
            shortName: definition.shortName,
            description: definition.description,
            effectLabel: definition.effectLabel,
            startedAt: buff.startedAt,
            expiresAt: buff.expiresAt,
          } as ActiveBuffSnapshot;
        }),
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
    await saveCharacterProgressRows(tx, state);
  });
}

export async function saveCharacterProgressWithTraitPayment(state: PersistableCharacterState, payment: CharacterTraitPaymentRecord) {
  await saveCharacterProgressWithCryptoPurchase(state, {
    ...payment,
    productId: TRAIT_CHANGE_PRODUCT_ID,
    tokenId: "",
    paymentToken: "MFERGPT",
    note: "traits-mfer burn payment",
  });
}

export async function saveCharacterProgressWithCryptoPurchase(state: PersistableCharacterState, purchase: CharacterCryptoPurchaseRecord) {
  const db = getRequiredDatabase();

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crypto-purchase:${purchase.txHash}:${purchase.logIndex}`}), 0)`);
    const existing = await tx.query.cryptoPurchaseEvents.findFirst({
      where: and(
        eq(cryptoPurchaseEvents.txHash, purchase.txHash),
        eq(cryptoPurchaseEvents.logIndex, purchase.logIndex),
      ),
    });
    if (existing) throw new Error("crypto payment already used");

    await tx.insert(cryptoPurchaseEvents)
      .values({
        id: randomUUID(),
        productId: purchase.productId,
        walletAddress: purchase.walletAddress,
        characterId: state.characterId,
        source: "chain",
        chainId: purchase.chainId,
        contractAddress: purchase.tokenAddress,
        txHash: purchase.txHash,
        logIndex: purchase.logIndex,
        tokenId: purchase.tokenId ?? "",
        paymentToken: purchase.paymentToken ?? "MFERGPT",
        paymentAmountWei: purchase.amountWei,
        status: "confirmed",
        note: purchase.note ?? "",
        confirmedAt: new Date(),
      });

    await saveCharacterProgressRows(tx, state);
  });
}

async function saveCharacterProgressRows(tx: DatabaseTransaction, state: PersistableCharacterState) {
  const now = new Date();
  await tx.update(characters)
    .set({
      name: state.name,
      avatarSeed: normalizeAvatarSeed(state.avatarSeed),
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

  if (!(await hasCharacterBuffsTable(tx))) {
    if (state.activeBuffs.some((buff) => isElixirBuffId(buff.id) && buff.expiresAt > Date.now())) {
      console.warn("Skipping active buff persistence because character_buffs has not been migrated yet.");
    }
    return;
  }

  await tx.delete(characterBuffs).where(eq(characterBuffs.characterId, state.characterId));
  const activeBuffs = state.activeBuffs.filter((buff) => isElixirBuffId(buff.id) && buff.expiresAt > Date.now());
  if (activeBuffs.length > 0) {
    await tx.insert(characterBuffs).values(activeBuffs.map((buff) => ({
      characterId: state.characterId,
      buffId: buff.id,
      startedAt: Math.max(0, buff.startedAt),
      expiresAt: Math.max(0, buff.expiresAt),
      updatedAt: now,
    })));
  }
}

async function hasCharacterBuffsTable(tx: DatabaseTransaction) {
  const result = await tx.execute(sql`SELECT to_regclass('public.character_buffs') IS NOT NULL AS "exists"`);
  const [row] = result as Array<{ exists?: boolean }>;
  return Boolean(row?.exists);
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

export async function saveCharacterProgressWithSeason0Reward(
  state: PersistableCharacterState,
  reward: {
    walletAddress: string;
    sourceType: SeasonRewardSourceType;
    sourceId: string;
    points: number;
    label: string;
    now?: Date;
  },
): Promise<SeasonRewardAwardResult> {
  const normalizedWallet = normalizeWalletAddress(reward.walletAddress);
  const pointsRequested = Math.max(0, Math.floor(reward.points));
  const label = reward.label.trim().slice(0, 240);
  if (!normalizedWallet || pointsRequested <= 0 || !reward.sourceId.trim()) {
    return { status: "ineligible", points: 0, dailyTotal: 0, seasonTotal: 0, label };
  }

  const db = getDatabase();
  if (!db) {
    return { status: "no_database", points: 0, dailyTotal: 0, seasonTotal: 0, label };
  }

  const now = reward.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:${normalizedWallet}`}), 0)`);

    const sourceId = reward.sourceId.trim().slice(0, 160);
    const existing = await tx.query.seasonRewardEvents.findFirst({
      where: and(
        eq(seasonRewardEvents.seasonId, SEASON_0_ID),
        eq(seasonRewardEvents.characterId, state.characterId),
        eq(seasonRewardEvents.sourceType, reward.sourceType),
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
        label,
      };
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - totals.dailyTotal);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - totals.seasonTotal);
    if (pointsRequested > remainingDaily || pointsRequested > remainingSeason) {
      return {
        status: "capped",
        points: 0,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label,
      };
    }

    await tx.insert(seasonRewardEvents).values({
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      characterId: state.characterId,
      walletAddress: normalizedWallet,
      sourceType: reward.sourceType,
      sourceId,
      points: pointsRequested,
      status: "pending",
      note: label,
      createdAt: now,
    });

    await saveCharacterProgressRows(tx, state);

    return {
      status: "awarded",
      points: pointsRequested,
      dailyTotal: totals.dailyTotal + pointsRequested,
      seasonTotal: totals.seasonTotal + pointsRequested,
      label,
    };
  });
}

export async function getSeason0Leaderboard({
  limit = 100,
  now = new Date(),
}: {
  limit?: number;
  now?: Date;
} = {}): Promise<SeasonLeaderboardSnapshot> {
  const db = getRequiredDatabase();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayStartIso = dayStart.toISOString();
  const rows = await db.execute<SeasonLeaderboardQueryRow>(sql`
    WITH totals AS (
      SELECT
        lower(nullif(sre.wallet_address, '')) AS wallet_address,
        coalesce(sum(sre.points) FILTER (WHERE sre.status IN ('pending', 'approved', 'distributed')), 0)::int AS season_points,
        coalesce(sum(sre.points) FILTER (
          WHERE sre.status IN ('pending', 'approved', 'distributed') AND sre.created_at >= ${dayStartIso}::timestamptz
        ), 0)::int AS daily_points,
        coalesce(sum(sre.points) FILTER (WHERE sre.status = 'pending'), 0)::int AS pending_points,
        coalesce(sum(sre.points) FILTER (WHERE sre.status = 'approved'), 0)::int AS approved_points,
        coalesce(sum(sre.points) FILTER (WHERE sre.status = 'distributed'), 0)::int AS distributed_points,
        count(*) FILTER (WHERE sre.status IN ('pending', 'approved', 'distributed'))::int AS events,
        max(sre.created_at) FILTER (WHERE sre.status IN ('pending', 'approved', 'distributed')) AS last_event_at
      FROM season_reward_events sre
      WHERE sre.season_id = ${SEASON_0_ID}
      GROUP BY lower(nullif(sre.wallet_address, ''))
    ),
    ranked AS (
      SELECT
        totals.*,
        rank() OVER (
          ORDER BY totals.season_points DESC, totals.last_event_at ASC NULLS LAST, totals.wallet_address ASC
        )::int AS rank
      FROM totals
      WHERE totals.wallet_address IS NOT NULL AND totals.season_points > 0
    )
    SELECT
      ranked.rank,
      ranked.wallet_address,
      coalesce(account_character.name, event_character.name, accounts.display_name, 'mfer') AS character_name,
      coalesce(account_character.avatar_seed, event_character.avatar_seed, 1)::int AS avatar_seed,
      coalesce(account_character.appearance_traits, event_character.appearance_traits, '{}'::jsonb) AS appearance_traits,
      coalesce(account_character.level, event_character.level, 1)::int AS level,
      coalesce(account_character.xp, event_character.xp, 0)::int AS xp,
      ranked.season_points,
      ranked.daily_points,
      ranked.pending_points,
      ranked.approved_points,
      ranked.distributed_points,
      ranked.events,
      ranked.last_event_at
    FROM ranked
    LEFT JOIN account_wallets ON lower(account_wallets.wallet_address) = ranked.wallet_address
    LEFT JOIN accounts ON accounts.id = account_wallets.account_id
    LEFT JOIN LATERAL (
      SELECT c.name, c.avatar_seed, c.appearance_traits, c.level, c.xp
      FROM characters c
      WHERE c.account_id = accounts.id
      ORDER BY c.updated_at DESC
      LIMIT 1
    ) account_character ON true
    LEFT JOIN LATERAL (
      SELECT c.name, c.avatar_seed, c.appearance_traits, c.level, c.xp
      FROM season_reward_events sre
      JOIN characters c ON c.id = sre.character_id
      WHERE sre.season_id = ${SEASON_0_ID}
        AND lower(sre.wallet_address) = ranked.wallet_address
      ORDER BY sre.created_at DESC
      LIMIT 1
    ) event_character ON true
    ORDER BY ranked.season_points DESC, ranked.last_event_at ASC NULLS LAST, ranked.wallet_address ASC
    LIMIT ${safeLimit}
  `);

  return {
    ok: true,
    seasonId: SEASON_0_ID,
    generatedAt: now.toISOString(),
    dailyPointCap: SEASON_0_DAILY_POINT_CAP,
    totalPointCap: SEASON_0_TOTAL_POINT_CAP,
    entries: Array.from(rows).map(mapSeasonLeaderboardEntry),
  };
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

type SeasonLeaderboardQueryRow = {
  rank?: unknown;
  wallet_address?: unknown;
  character_name?: unknown;
  avatar_seed?: unknown;
  appearance_traits?: unknown;
  level?: unknown;
  xp?: unknown;
  season_points?: unknown;
  daily_points?: unknown;
  pending_points?: unknown;
  approved_points?: unknown;
  distributed_points?: unknown;
  events?: unknown;
  last_event_at?: unknown;
};

function mapSeasonLeaderboardEntry(row: SeasonLeaderboardQueryRow): SeasonLeaderboardEntry {
  return {
    rank: toLeaderboardNumber(row.rank),
    walletAddress: toLeaderboardString(row.wallet_address),
    characterName: toLeaderboardString(row.character_name) || "mfer",
    avatarSeed: normalizeAvatarSeed(toLeaderboardNumber(row.avatar_seed) || 1),
    appearanceTraits: normalizeMferAppearanceTraits(row.appearance_traits, {}),
    level: toLeaderboardNumber(row.level) || 1,
    xp: toLeaderboardNumber(row.xp),
    seasonPoints: toLeaderboardNumber(row.season_points),
    dailyPoints: toLeaderboardNumber(row.daily_points),
    pendingPoints: toLeaderboardNumber(row.pending_points),
    approvedPoints: toLeaderboardNumber(row.approved_points),
    distributedPoints: toLeaderboardNumber(row.distributed_points),
    events: toLeaderboardNumber(row.events),
    lastEventAt: toLeaderboardIsoString(row.last_event_at),
  };
}

function toLeaderboardNumber(value: unknown) {
  const number = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toLeaderboardString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toLeaderboardIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return "";
}

function isKnownQuestId(value: string): value is QuestId {
  return QUEST_IDS.includes(value as QuestId);
}

function normalizeInviteCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 80);
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

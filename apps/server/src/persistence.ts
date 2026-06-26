import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ITEMS,
  EQUIPMENT_SLOT_IDS,
  ELIXIR_BUFFS,
  QUEST_IDS,
  TRAIT_CHANGE_PRODUCT_ID,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_ID,
  SEASON_0_REFERRAL_ACTIVATION_POINTS,
  SEASON_0_REFERRAL_MAX_BONUS_POINTS,
  SEASON_0_REFERRAL_MAX_REFEREES,
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
  type FishingNftCatchStatus,
  type FishingNftClaimVoucher,
  type FishingNftMetadataSnapshot,
  type FishingNftTokenStandard,
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
  type WalletClientKind,
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
  fishingPondCatches,
  inviteCodes,
  seasonRewardEvents,
  seasonReferrals,
} from "./db/schema.js";
import {
  adjustSeason0QuestPointsForAgent,
  getAgentSeason0RewardNote,
  readAgentSeason0PointMultiplier,
} from "./agentRewards.js";
import {
  makeUncheckedAgentSeason0MferGptGateStatus,
  type AgentSeason0MferGptGateStatus,
} from "./agentMferGptGate.js";
import {
  getSeasonReferralBonusDelta,
  getSeasonReferralCreateDecision,
  getSeasonReferralProgressUpdate,
  isSeasonReferralEligibleBaseAward,
  type SeasonReferralStatus,
} from "./seasonReferralRules.js";

type DatabaseTransaction = Parameters<Parameters<NonNullable<ReturnType<typeof getDatabase>>["transaction"]>[0]>[0];
type SeasonReferralBonusAward = {
  referralId: string;
  referrerWalletAddress: string;
  referrerCharacterId: string;
  referrerPoints: number;
  refereePoints: number;
};

export type PersistedCharacter = {
  accountId: string;
  characterId: string;
  registeredClientKind: WalletClientKind | "";
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
  status: "awarded" | "duplicate" | "capped" | "ineligible" | "adjusted_zero" | "agent_token_gate" | "no_database";
  points: number;
  basePoints: number;
  agentMultiplier: number;
  dailyTotal: number;
  seasonTotal: number;
  label: string;
  agentTokenGate?: AgentSeason0MferGptGateStatus;
  referralBonus?: SeasonReferralBonusAward;
};

export type SeasonLeaderboardEntry = {
  rank: number;
  walletAddress: string;
  characterName: string;
  clientKind: WalletClientKind | "";
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
  referralCount: number;
  activatedReferralCount: number;
  referralBonusPoints: number;
};

export type SeasonLeaderboardMode = "seasonPoints" | "totalXp";

export type SeasonLeaderboardSnapshot = {
  ok: true;
  seasonId: typeof SEASON_0_ID;
  mode: SeasonLeaderboardMode;
  generatedAt: string;
  dailyPointCap: typeof SEASON_0_DAILY_POINT_CAP;
  totalPointCap: typeof SEASON_0_TOTAL_POINT_CAP;
  totalEntries: number;
  totalSeasonPoints: number;
  totalXp: number;
  entries: SeasonLeaderboardEntry[];
};

export type SeasonReferralSummary = {
  ok: true;
  seasonId: typeof SEASON_0_ID;
  walletAddress: string;
  generatedAt: string;
  inviteUrl: string;
  limits: {
    activationPoints: typeof SEASON_0_REFERRAL_ACTIVATION_POINTS;
    bonusRatePercent: 20;
    maxBonusPoints: typeof SEASON_0_REFERRAL_MAX_BONUS_POINTS;
    maxReferees: typeof SEASON_0_REFERRAL_MAX_REFEREES;
  };
  referredBy: {
    walletAddress: string;
    characterName: string;
    status: SeasonReferralStatus;
    activatedAt: string;
    activationProgressPoints: number;
    refereeBonusPoints: number;
  } | null;
  referralCount: number;
  activatedReferralCount: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
  referrals: SeasonReferralSummaryRow[];
};

export type SeasonReferralSummaryRow = {
  refereeWalletAddress: string;
  characterName: string;
  status: SeasonReferralStatus;
  activatedAt: string;
  activationProgressPoints: number;
  postActivationBasePoints: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
};

export type SeasonReferralRemovePersistenceResult = {
  ok: boolean;
  status: "removed" | "invalid_wallet" | "not_found" | "no_database";
  referrerWalletAddress: string;
  refereeWalletAddress: string;
  removedReferrerBonusPoints: number;
  removedReferrerDailyPoints: number;
  removedRefereeBonusPoints: number;
  removedRefereeDailyPoints: number;
  referrerSeason0Points: number;
  referrerSeason0DailyPoints: number;
  refereeSeason0Points: number;
  refereeSeason0DailyPoints: number;
  error?: string;
};

export type PersistedFishingPondCatch = {
  catchId: string;
  characterId: string;
  walletAddress: string;
  attemptId: string;
  status: FishingNftCatchStatus;
  chainId: number;
  contractAddress: string;
  standard: FishingNftTokenStandard;
  collection: string;
  tokenId: string;
  amount: string;
  pondEntryId: string;
  metadata: FishingNftMetadataSnapshot | null;
  voucher: FishingNftClaimVoucher | null;
  txHash: string;
  error: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  txSubmittedAt: Date | null;
  confirmedAt: Date | null;
};

export type CreateFishingPondCatchRecord = {
  catchId: string;
  characterId: string;
  walletAddress: string;
  attemptId: string;
  voucher: FishingNftClaimVoucher;
  entryRemainingAmount?: string;
  metadata?: FishingNftMetadataSnapshot | null;
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

export class WalletClientKindMismatchError extends Error {
  constructor(
    readonly registeredKind: WalletClientKind,
    readonly requestedKind: WalletClientKind,
  ) {
    super(getWalletClientKindMismatchMessage(registeredKind, requestedKind));
    this.name = "WalletClientKindMismatchError";
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
  const registeredClientKind = getRegisteredWalletClientKind(wallet);

  const character = await db.query.characters.findFirst({
    where: eq(characters.accountId, wallet.accountId),
  });
  if (!character) return null;

  return toWalletCharacterPreview(character, registeredClientKind);
}

export async function loadOrCreateWalletCharacter({
  walletAddress,
  displayName,
  avatarSeed,
  createIfMissing = false,
  referralWalletAddress = "",
  clientKind = "",
  claimClientKind = false,
}: {
  walletAddress: string;
  displayName: string;
  avatarSeed: number;
  createIfMissing?: boolean;
  referralWalletAddress?: string;
  clientKind?: WalletClientKind | "";
  claimClientKind?: boolean;
}): Promise<PersistedCharacter | null> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return null;
  const normalizedReferralWallet = normalizeWalletAddress(referralWalletAddress);
  const requestedClientKind = normalizeWalletClientKind(clientKind);
  const db = getRequiredDatabase();
  const persistedAvatarSeed = normalizeAvatarSeed(avatarSeed);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedWallet}), 0)`);

    const now = new Date();
    const existingWallet = await findAccountWalletByNormalizedAddress(tx, normalizedWallet);
    const existingClientKind = getRegisteredWalletClientKind(existingWallet);
    if (requestedClientKind) assertWalletClientKindMatches(existingClientKind, requestedClientKind);
    const effectiveClientKind = requestedClientKind || existingClientKind || "human";

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
        walletType: effectiveClientKind === "agent" ? "agent" : "external",
        registeredClientKind: effectiveClientKind,
        primaryWallet: true,
        createdAt: now,
      });
    } else {
      if (claimClientKind && requestedClientKind && existingWallet && !existingClientKind) {
        await tx.update(accountWallets)
          .set({
            registeredClientKind: requestedClientKind,
            walletType: requestedClientKind === "agent" ? "agent" : existingWallet.walletType,
          })
          .where(sql`lower(${accountWallets.walletAddress}) = ${normalizedWallet}`);
      }
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
      if (effectiveClientKind === "human" && normalizedReferralWallet) {
        await createSeasonReferralForNewCharacter(tx, {
          referrerWalletAddress: normalizedReferralWallet,
          refereeWalletAddress: normalizedWallet,
          refereeCharacterId: character.id,
          now,
        });
      }
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
      registeredClientKind: effectiveClientKind,
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

export async function getWalletClientKindMismatchForWallet(walletAddress: string, requestedKind: WalletClientKind) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return "";
  const normalizedRequestedKind = normalizeWalletClientKind(requestedKind);
  if (!normalizedRequestedKind) return "";
  const db = getDatabase();
  if (!db) return "";

  const wallet = await findAccountWalletByNormalizedAddress(db, normalizedWallet);
  return getWalletClientKindMismatchMessage(getRegisteredWalletClientKind(wallet), normalizedRequestedKind);
}

export function getWalletClientKindMismatchMessage(
  registeredKind: WalletClientKind | "",
  requestedKind: WalletClientKind | "",
) {
  const normalizedRegisteredKind = normalizeWalletClientKind(registeredKind);
  const normalizedRequestedKind = normalizeWalletClientKind(requestedKind);
  if (!normalizedRegisteredKind || !normalizedRequestedKind || normalizedRegisteredKind === normalizedRequestedKind) return "";
  return normalizedRegisteredKind === "agent"
    ? "wallet already registered for an agent"
    : "wallet already registered for a human";
}

export function normalizeWalletClientKind(value: unknown): WalletClientKind | "" {
  return value === "human" || value === "agent" ? value : "";
}

function assertWalletClientKindMatches(registeredKind: WalletClientKind | "", requestedKind: WalletClientKind) {
  const mismatchMessage = getWalletClientKindMismatchMessage(registeredKind, requestedKind);
  if (mismatchMessage) {
    throw new WalletClientKindMismatchError(registeredKind as WalletClientKind, requestedKind);
  }
}

function getRegisteredWalletClientKind(wallet: typeof accountWallets.$inferSelect | null | undefined): WalletClientKind | "" {
  if (!wallet) return "";
  return normalizeWalletClientKind(wallet.registeredClientKind)
    || (wallet.walletType === "agent" ? "agent" : "")
    || (wallet.walletType === "human" ? "human" : "");
}

function findAccountWalletByNormalizedAddress(
  db: Pick<NonNullable<ReturnType<typeof getDatabase>>, "query">,
  normalizedWallet: string,
) {
  return db.query.accountWallets.findFirst({
    where: sql`lower(${accountWallets.walletAddress}) = ${normalizedWallet}`,
  });
}

async function findLatestCharacterForAccount(
  db: Pick<NonNullable<ReturnType<typeof getDatabase>>, "query">,
  accountId: string,
) {
  return db.query.characters.findFirst({
    where: eq(characters.accountId, accountId),
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });
}

async function createSeasonReferralForNewCharacter(
  tx: DatabaseTransaction,
  {
    referrerWalletAddress,
    refereeWalletAddress,
    refereeCharacterId,
    now,
  }: {
    referrerWalletAddress: string;
    refereeWalletAddress: string;
    refereeCharacterId: string;
    now: Date;
  },
) {
  const initialDecision = getSeasonReferralCreateDecision({
    referrerWalletAddress,
    refereeWalletAddress,
  });
  if (!initialDecision.ok) return;
  const normalizedReferrer = initialDecision.referrerWalletAddress;
  const normalizedReferee = initialDecision.refereeWalletAddress;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:referrer:${normalizedReferrer}`}), 0)`);

  const [existingReferee] = await tx.select({ id: seasonReferrals.id })
    .from(seasonReferrals)
    .where(and(
      eq(seasonReferrals.seasonId, SEASON_0_ID),
      eq(seasonReferrals.refereeWalletAddress, normalizedReferee),
    ))
    .limit(1);

  const referrerWallet = await findAccountWalletByNormalizedAddress(tx, normalizedReferrer);
  const referrerCharacter = referrerWallet
    ? await findLatestCharacterForAccount(tx, referrerWallet.accountId)
    : null;

  const [countRow] = await tx.select({
    total: sql<number>`count(*)::int`,
  })
    .from(seasonReferrals)
    .where(and(
      eq(seasonReferrals.seasonId, SEASON_0_ID),
      eq(seasonReferrals.referrerWalletAddress, normalizedReferrer),
    ));
  const finalDecision = getSeasonReferralCreateDecision({
    referrerWalletAddress: normalizedReferrer,
    refereeWalletAddress: normalizedReferee,
    existingRefereeReferral: Boolean(existingReferee),
    referrerExists: Boolean(referrerWallet && referrerCharacter),
    referrerIsAgent: getRegisteredWalletClientKind(referrerWallet) === "agent",
    referrerReferralCount: Number(countRow?.total ?? 0),
  });
  if (!finalDecision.ok || !referrerWallet || !referrerCharacter) return;

  await tx.insert(seasonReferrals)
    .values({
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      referrerWalletAddress: normalizedReferrer,
      referrerCharacterId: referrerCharacter.id,
      refereeWalletAddress: normalizedReferee,
      refereeCharacterId,
      status: "active",
      postActivationBasePoints: 0,
      referrerBonusPoints: 0,
      refereeBonusPoints: 0,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
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

export async function createFishingPondCatchRecord(record: CreateFishingPondCatchRecord) {
  const db = getRequiredDatabase();
  const normalizedWallet = normalizeWalletAddress(record.walletAddress);
  if (!normalizedWallet) throw new Error("wallet required");

  const now = new Date();
  const expiresAt = new Date(record.voucher.expiresAt * 1000);
  const rowValues = {
    catchId: record.catchId,
    characterId: record.characterId || null,
    walletAddress: normalizedWallet,
    attemptId: record.attemptId,
    status: "voucher_issued",
    chainId: record.voucher.chainId,
    contractAddress: record.voucher.verifyingContract,
    tokenStandard: record.voucher.standard,
    collectionAddress: record.voucher.collection,
    tokenId: record.voucher.tokenId,
    amount: record.voucher.amount,
    pondEntryId: record.voucher.pondEntryId,
    metadataName: sanitizeFishingPondMetadataText(record.metadata?.name, 160),
    metadataDescription: sanitizeFishingPondMetadataText(record.metadata?.description, 600),
    metadataImage: sanitizeFishingPondMetadataText(record.metadata?.image, 600),
    metadataUri: sanitizeFishingPondMetadataText(record.metadata?.tokenUri, 600),
    voucherJson: record.voucher,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  } as const;

  if (record.entryRemainingAmount !== undefined) {
    return await db.transaction(async (tx) => {
      const lockKey = `fishing-pond-entry:${record.voucher.chainId}:${record.voucher.verifyingContract.toLowerCase()}:${record.voucher.pondEntryId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)`);
      const existingReservations = await tx.query.fishingPondCatches.findMany({
        where: and(
          eq(fishingPondCatches.chainId, record.voucher.chainId),
          eq(fishingPondCatches.contractAddress, record.voucher.verifyingContract),
          eq(fishingPondCatches.pondEntryId, record.voucher.pondEntryId),
          inArray(fishingPondCatches.status, ["pending", "voucher_issued", "tx_submitted"]),
          gte(fishingPondCatches.expiresAt, now),
        ),
      });
      const reservedAmount = existingReservations.reduce(
        (total, row) => total + parseFishingPondAmount(row.amount),
        0n,
      );
      const voucherAmount = parseFishingPondAmount(record.voucher.amount);
      const entryRemainingAmount = parseFishingPondAmount(record.entryRemainingAmount ?? "0");
      if (voucherAmount <= 0n || reservedAmount + voucherAmount > entryRemainingAmount) return null;

      const [row] = await tx.insert(fishingPondCatches)
        .values(rowValues)
        .returning();
      return mapFishingPondCatchRow(row);
    });
  }

  const [row] = await db.insert(fishingPondCatches)
    .values(rowValues)
    .returning();
  return mapFishingPondCatchRow(row);
}

export async function findFishingPondCatch(catchId: string) {
  const db = getDatabase();
  if (!db) return null;
  const row = await db.query.fishingPondCatches.findFirst({
    where: eq(fishingPondCatches.catchId, catchId),
  });
  return row ? mapFishingPondCatchRow(row) : null;
}

export async function findLatestActiveFishingPondCatchForWallet(walletAddress: string) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return null;
  const db = getDatabase();
  if (!db) return null;
  const row = await db.query.fishingPondCatches.findFirst({
    where: and(
      eq(fishingPondCatches.walletAddress, normalizedWallet),
      inArray(fishingPondCatches.status, ["pending", "voucher_issued", "tx_submitted"]),
    ),
    orderBy: [desc(fishingPondCatches.createdAt)],
  });
  return row ? mapFishingPondCatchRow(row) : null;
}

export async function findFishingPondCatchHistoryForWallet(walletAddress: string, limit = 20) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  const db = getDatabase();
  if (!db) return [];
  const rows = await db.query.fishingPondCatches.findMany({
    where: eq(fishingPondCatches.walletAddress, normalizedWallet),
    orderBy: [desc(fishingPondCatches.createdAt)],
    limit: Math.max(1, Math.min(50, Math.floor(limit))),
  });
  return rows.map(mapFishingPondCatchRow);
}

export async function markFishingPondCatchTxSubmitted(catchId: string, txHash: string) {
  const db = getRequiredDatabase();
  const now = new Date();
  const [row] = await db.update(fishingPondCatches)
    .set({
      status: "tx_submitted",
      txHash,
      txSubmittedAt: now,
      updatedAt: now,
      error: "",
    })
    .where(eq(fishingPondCatches.catchId, catchId))
    .returning();
  return row ? mapFishingPondCatchRow(row) : null;
}

export async function markFishingPondCatchConfirmed(catchId: string, txHash: string) {
  const db = getRequiredDatabase();
  const now = new Date();
  const [row] = await db.update(fishingPondCatches)
    .set({
      status: "confirmed",
      txHash,
      confirmedAt: now,
      updatedAt: now,
      error: "",
    })
    .where(eq(fishingPondCatches.catchId, catchId))
    .returning();
  return row ? mapFishingPondCatchRow(row) : null;
}

export async function markFishingPondCatchFailed(catchId: string, error: string) {
  const db = getRequiredDatabase();
  const [row] = await db.update(fishingPondCatches)
    .set({
      status: "failed",
      error: error.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(fishingPondCatches.catchId, catchId))
    .returning();
  return row ? mapFishingPondCatchRow(row) : null;
}

export async function markFishingPondCatchExpired(catchId: string) {
  const db = getRequiredDatabase();
  const [row] = await db.update(fishingPondCatches)
    .set({
      status: "expired",
      updatedAt: new Date(),
    })
    .where(eq(fishingPondCatches.catchId, catchId))
    .returning();
  return row ? mapFishingPondCatchRow(row) : null;
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
  agentTokenGate,
  isAgent = false,
  walletAddress,
  questId,
  now = new Date(),
}: {
  characterId: string;
  agentTokenGate?: AgentSeason0MferGptGateStatus;
  isAgent?: boolean;
  walletAddress: string;
  questId: QuestId;
  now?: Date;
}): Promise<SeasonRewardAwardResult> {
  const reward = getSeason0QuestReward(questId);
  const agentMultiplier = isAgent ? readAgentSeason0PointMultiplier() : 1;
  const effectiveAgentTokenGate = isAgent
    ? agentTokenGate ?? makeUncheckedAgentSeason0MferGptGateStatus()
    : undefined;
  const adjustedRewardPoints = reward
    ? adjustSeason0QuestPointsForAgent(reward.points, isAgent, agentMultiplier)
    : 0;
  if (!reward) {
    return { status: "ineligible", points: 0, basePoints: 0, agentMultiplier, dailyTotal: 0, seasonTotal: 0, label: "" };
  }

  const db = getDatabase();
  if (!db) {
    return { status: "no_database", points: 0, basePoints: reward.points, agentMultiplier, dailyTotal: 0, seasonTotal: 0, label: reward.label };
  }

  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return { status: "ineligible", points: 0, basePoints: reward.points, agentMultiplier, dailyTotal: 0, seasonTotal: 0, label: reward.label };
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
        basePoints: reward.points,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
        agentTokenGate: effectiveAgentTokenGate,
      };
    }
    if (effectiveAgentTokenGate && !effectiveAgentTokenGate.eligible) {
      return {
        status: "agent_token_gate",
        points: 0,
        basePoints: reward.points,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
        agentTokenGate: effectiveAgentTokenGate,
      };
    }
    if (adjustedRewardPoints <= 0) {
      return {
        status: "adjusted_zero",
        points: 0,
        basePoints: reward.points,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
        agentTokenGate: effectiveAgentTokenGate,
      };
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - totals.dailyTotal);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - totals.seasonTotal);
    const points = Math.min(adjustedRewardPoints, remainingDaily, remainingSeason);
    if (points <= 0) {
      return {
        status: "capped",
        points: 0,
        basePoints: reward.points,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label: reward.label,
        agentTokenGate: effectiveAgentTokenGate,
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
      note: getAgentSeason0RewardNote(reward.label, isAgent, agentMultiplier),
      createdAt: now,
    });
    const referralBonus = await processSeasonReferralBaseAward(tx, {
      refereeWalletAddress: normalizedWallet,
      refereeCharacterId: characterId,
      sourceType: "quest",
      awardedPoints: points,
      isAgent,
      now,
    });
    const finalTotals = referralBonus
      ? await getSeasonRewardTotals(tx, normalizedWallet, now)
      : { dailyTotal: totals.dailyTotal + points, seasonTotal: totals.seasonTotal + points };

    return {
      status: "awarded",
      points,
      basePoints: reward.points,
      agentMultiplier,
      dailyTotal: finalTotals.dailyTotal,
      seasonTotal: finalTotals.seasonTotal,
      label: reward.label,
      agentTokenGate: effectiveAgentTokenGate,
      referralBonus,
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
    basePoints?: number;
    agentMultiplier?: number;
    agentTokenGate?: AgentSeason0MferGptGateStatus;
    isAgent?: boolean;
    label: string;
    now?: Date;
  },
): Promise<SeasonRewardAwardResult> {
  const normalizedWallet = normalizeWalletAddress(reward.walletAddress);
  const pointsRequested = Math.max(0, Math.floor(reward.points));
  const basePoints = Math.max(0, Math.floor(reward.basePoints ?? reward.points));
  const agentMultiplier = reward.agentMultiplier ?? 1;
  const label = reward.label.trim().slice(0, 240);
  if (!normalizedWallet || pointsRequested <= 0 || !reward.sourceId.trim()) {
    return { status: "ineligible", points: 0, basePoints, agentMultiplier, dailyTotal: 0, seasonTotal: 0, label, agentTokenGate: reward.agentTokenGate };
  }

  const db = getDatabase();
  if (!db) {
    return { status: "no_database", points: 0, basePoints, agentMultiplier, dailyTotal: 0, seasonTotal: 0, label, agentTokenGate: reward.agentTokenGate };
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
        basePoints,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label,
        agentTokenGate: reward.agentTokenGate,
      };
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - totals.dailyTotal);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - totals.seasonTotal);
    const points = Math.min(pointsRequested, remainingDaily, remainingSeason);
    if (points <= 0) {
      return {
        status: "capped",
        points: 0,
        basePoints,
        agentMultiplier,
        dailyTotal: totals.dailyTotal,
        seasonTotal: totals.seasonTotal,
        label,
        agentTokenGate: reward.agentTokenGate,
      };
    }

    await tx.insert(seasonRewardEvents).values({
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      characterId: state.characterId,
      walletAddress: normalizedWallet,
      sourceType: reward.sourceType,
      sourceId,
      points,
      status: "pending",
      note: label,
      createdAt: now,
    });

    await saveCharacterProgressRows(tx, state);
    const referralBonus = await processSeasonReferralBaseAward(tx, {
      refereeWalletAddress: normalizedWallet,
      refereeCharacterId: state.characterId,
      sourceType: reward.sourceType,
      awardedPoints: points,
      isAgent: Boolean(reward.isAgent),
      now,
    });
    const finalTotals = referralBonus
      ? await getSeasonRewardTotals(tx, normalizedWallet, now)
      : { dailyTotal: totals.dailyTotal + points, seasonTotal: totals.seasonTotal + points };

    return {
      status: "awarded",
      points,
      basePoints,
      agentMultiplier,
      dailyTotal: finalTotals.dailyTotal,
      seasonTotal: finalTotals.seasonTotal,
      label,
      agentTokenGate: reward.agentTokenGate,
      referralBonus,
    };
  });
}

export async function getSeason0Leaderboard({
  limit = 100,
  mode = "seasonPoints",
  now = new Date(),
}: {
  limit?: number;
  mode?: SeasonLeaderboardMode;
  now?: Date;
} = {}): Promise<SeasonLeaderboardSnapshot> {
  const db = getRequiredDatabase();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250);
  const dayStart = getSeasonDayStart(now);
  const dayStartIso = dayStart.toISOString();
  const normalizedMode = mode === "totalXp" ? "totalXp" : "seasonPoints";
  const rows = normalizedMode === "totalXp"
    ? await db.execute<SeasonLeaderboardQueryRow>(sql`
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
    referral_totals AS (
      SELECT
        sr.referrer_wallet_address AS wallet_address,
        count(*)::int AS referral_count,
        count(*) FILTER (WHERE sr.status = 'active' OR ${SEASON_0_REFERRAL_ACTIVATION_POINTS} <= 0)::int AS activated_referral_count,
        coalesce(sum(sr.referrer_bonus_points), 0)::int AS referral_bonus_points
      FROM season_referrals sr
      JOIN account_wallets referrer_wallet
        ON lower(referrer_wallet.wallet_address) = sr.referrer_wallet_address
       AND CASE
        WHEN referrer_wallet.registered_client_kind IN ('human', 'agent') THEN referrer_wallet.registered_client_kind
        WHEN referrer_wallet.wallet_type = 'agent' THEN 'agent'
        ELSE 'human'
       END = 'human'
      WHERE sr.season_id = ${SEASON_0_ID}
      GROUP BY sr.referrer_wallet_address
    ),
    wallet_characters AS (
      SELECT
        lower(account_wallets.wallet_address) AS wallet_address,
        CASE
          WHEN account_wallets.registered_client_kind IN ('human', 'agent') THEN account_wallets.registered_client_kind
          WHEN account_wallets.wallet_type = 'agent' THEN 'agent'
          WHEN account_wallets.wallet_type = 'human' THEN 'human'
          ELSE ''
        END AS client_kind,
        coalesce(account_character.name, accounts.display_name, 'mfer') AS character_name,
        coalesce(account_character.avatar_seed, 1)::int AS avatar_seed,
        coalesce(account_character.appearance_traits, '{}'::jsonb) AS appearance_traits,
        coalesce(account_character.level, 1)::int AS level,
        coalesce(account_character.xp, 0)::int AS xp,
        coalesce(totals.season_points, 0)::int AS season_points,
        coalesce(totals.daily_points, 0)::int AS daily_points,
        coalesce(totals.pending_points, 0)::int AS pending_points,
        coalesce(totals.approved_points, 0)::int AS approved_points,
        coalesce(totals.distributed_points, 0)::int AS distributed_points,
        coalesce(totals.events, 0)::int AS events,
        totals.last_event_at,
        coalesce(referral_totals.referral_count, 0)::int AS referral_count,
        coalesce(referral_totals.activated_referral_count, 0)::int AS activated_referral_count,
        coalesce(referral_totals.referral_bonus_points, 0)::int AS referral_bonus_points,
        account_character.updated_at
      FROM account_wallets
      JOIN accounts ON accounts.id = account_wallets.account_id
      JOIN LATERAL (
        SELECT c.name, c.avatar_seed, c.appearance_traits, c.level, c.xp, c.updated_at
        FROM characters c
        WHERE c.account_id = accounts.id
        ORDER BY c.updated_at DESC
        LIMIT 1
      ) account_character ON true
      LEFT JOIN totals ON totals.wallet_address = lower(account_wallets.wallet_address)
      LEFT JOIN referral_totals ON referral_totals.wallet_address = lower(account_wallets.wallet_address)
    ),
    ranked AS (
      SELECT
        wallet_characters.*,
        rank() OVER (
          ORDER BY wallet_characters.xp DESC, wallet_characters.season_points DESC, wallet_characters.updated_at ASC NULLS LAST, wallet_characters.wallet_address ASC
        )::int AS rank,
        count(*) OVER()::int AS total_entries,
        coalesce(sum(wallet_characters.season_points) OVER(), 0)::int AS total_season_points,
        coalesce(sum(wallet_characters.xp) OVER(), 0)::int AS total_xp
      FROM wallet_characters
      WHERE wallet_characters.wallet_address IS NOT NULL
    )
    SELECT
      rank,
      wallet_address,
      client_kind,
      character_name,
      avatar_seed,
      appearance_traits,
      level,
      xp,
      season_points,
      daily_points,
      pending_points,
      approved_points,
      distributed_points,
      events,
      last_event_at,
      referral_count,
      activated_referral_count,
      referral_bonus_points,
      total_entries,
      total_season_points,
      total_xp
    FROM ranked
    ORDER BY xp DESC, season_points DESC, updated_at ASC NULLS LAST, wallet_address ASC
    LIMIT ${safeLimit}
  `)
    : await db.execute<SeasonLeaderboardQueryRow>(sql`
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
	    ),
	    referral_totals AS (
		      SELECT
		        sr.referrer_wallet_address AS wallet_address,
		        count(*)::int AS referral_count,
		        count(*) FILTER (WHERE sr.status = 'active' OR ${SEASON_0_REFERRAL_ACTIVATION_POINTS} <= 0)::int AS activated_referral_count,
		        coalesce(sum(sr.referrer_bonus_points), 0)::int AS referral_bonus_points
		      FROM season_referrals sr
		      JOIN account_wallets referrer_wallet
		        ON lower(referrer_wallet.wallet_address) = sr.referrer_wallet_address
		       AND CASE
		        WHEN referrer_wallet.registered_client_kind IN ('human', 'agent') THEN referrer_wallet.registered_client_kind
		        WHEN referrer_wallet.wallet_type = 'agent' THEN 'agent'
		        ELSE 'human'
		       END = 'human'
		      WHERE sr.season_id = ${SEASON_0_ID}
		      GROUP BY sr.referrer_wallet_address
		    )
	    SELECT
	      ranked.rank,
	      ranked.wallet_address,
	      CASE
	        WHEN account_wallets.registered_client_kind IN ('human', 'agent') THEN account_wallets.registered_client_kind
	        WHEN account_wallets.wallet_type = 'agent' THEN 'agent'
	        WHEN account_wallets.wallet_type = 'human' THEN 'human'
	        ELSE ''
	      END AS client_kind,
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
	      ranked.last_event_at,
	      coalesce(referral_totals.referral_count, 0)::int AS referral_count,
	      coalesce(referral_totals.activated_referral_count, 0)::int AS activated_referral_count,
	      coalesce(referral_totals.referral_bonus_points, 0)::int AS referral_bonus_points,
      count(*) OVER()::int AS total_entries,
      coalesce(sum(ranked.season_points) OVER(), 0)::int AS total_season_points,
      coalesce(sum(coalesce(account_character.xp, event_character.xp, 0)) OVER(), 0)::int AS total_xp
	    FROM ranked
	    LEFT JOIN account_wallets ON lower(account_wallets.wallet_address) = ranked.wallet_address
	    LEFT JOIN accounts ON accounts.id = account_wallets.account_id
	    LEFT JOIN referral_totals ON referral_totals.wallet_address = ranked.wallet_address
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
  const entries = Array.from(rows).map(mapSeasonLeaderboardEntry);
  const firstRow = Array.from(rows)[0];

  return {
    ok: true,
    seasonId: SEASON_0_ID,
    mode: normalizedMode,
    generatedAt: now.toISOString(),
    dailyPointCap: SEASON_0_DAILY_POINT_CAP,
    totalPointCap: SEASON_0_TOTAL_POINT_CAP,
    totalEntries: toLeaderboardNumber(firstRow?.total_entries) || entries.length,
    totalSeasonPoints: toLeaderboardNumber(firstRow?.total_season_points) || entries.reduce((sum, entry) => sum + entry.seasonPoints, 0),
    totalXp: toLeaderboardNumber(firstRow?.total_xp) || entries.reduce((sum, entry) => sum + entry.xp, 0),
    entries,
  };
}

export async function getSeasonReferralSummary({
  walletAddress,
  publicOrigin = "https://game.mfergpt.lol",
  now = new Date(),
}: {
  walletAddress: string;
  publicOrigin?: string;
  now?: Date;
}): Promise<SeasonReferralSummary> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("valid wallet required");
  const db = getRequiredDatabase();
  const [referralRows, referredByRows] = await Promise.all([
    db.execute<SeasonReferralSummaryQueryRow>(sql`
      SELECT
        sr.referee_wallet_address,
        c.name AS character_name,
        sr.status,
        sr.activated_at,
        sr.post_activation_base_points,
        sr.referrer_bonus_points,
        sr.referee_bonus_points,
        coalesce(base.total, 0)::int AS activation_progress_points
	      FROM season_referrals sr
	      JOIN account_wallets referrer_wallet
	        ON lower(referrer_wallet.wallet_address) = sr.referrer_wallet_address
	       AND CASE
	        WHEN referrer_wallet.registered_client_kind IN ('human', 'agent') THEN referrer_wallet.registered_client_kind
	        WHEN referrer_wallet.wallet_type = 'agent' THEN 'agent'
	        ELSE 'human'
	       END = 'human'
	      JOIN characters c ON c.id = sr.referee_character_id
	      LEFT JOIN LATERAL (
        SELECT coalesce(sum(sre.points), 0)::int AS total
        FROM season_reward_events sre
        WHERE sre.season_id = ${SEASON_0_ID}
          AND lower(sre.wallet_address) = sr.referee_wallet_address
          AND sre.source_type IN ('quest', 'event')
          AND sre.status IN ('pending', 'approved', 'distributed')
      ) base ON true
      WHERE sr.season_id = ${SEASON_0_ID}
        AND sr.referrer_wallet_address = ${normalizedWallet}
      ORDER BY sr.created_at ASC
    `),
    db.execute<SeasonReferralReferredByQueryRow>(sql`
      SELECT
        sr.referrer_wallet_address,
        c.name AS character_name,
        sr.status,
        sr.activated_at,
        sr.referee_bonus_points,
        coalesce(base.total, 0)::int AS activation_progress_points
	      FROM season_referrals sr
	      JOIN account_wallets referee_wallet
	        ON lower(referee_wallet.wallet_address) = sr.referee_wallet_address
	       AND CASE
	        WHEN referee_wallet.registered_client_kind IN ('human', 'agent') THEN referee_wallet.registered_client_kind
	        WHEN referee_wallet.wallet_type = 'agent' THEN 'agent'
	        ELSE 'human'
	       END = 'human'
	      JOIN account_wallets referrer_wallet
	        ON lower(referrer_wallet.wallet_address) = sr.referrer_wallet_address
	       AND CASE
	        WHEN referrer_wallet.registered_client_kind IN ('human', 'agent') THEN referrer_wallet.registered_client_kind
	        WHEN referrer_wallet.wallet_type = 'agent' THEN 'agent'
	        ELSE 'human'
	       END = 'human'
	      JOIN characters c ON c.id = sr.referrer_character_id
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(sre.points), 0)::int AS total
        FROM season_reward_events sre
        WHERE sre.season_id = ${SEASON_0_ID}
          AND lower(sre.wallet_address) = sr.referee_wallet_address
          AND sre.source_type IN ('quest', 'event')
          AND sre.status IN ('pending', 'approved', 'distributed')
      ) base ON true
      WHERE sr.season_id = ${SEASON_0_ID}
        AND sr.referee_wallet_address = ${normalizedWallet}
      LIMIT 1
    `),
  ]);
  const referrals = Array.from(referralRows).map(mapSeasonReferralSummaryRow);
  const referredByRow = Array.from(referredByRows)[0];
  const referredBy = referredByRow
    ? {
      walletAddress: toLeaderboardString(referredByRow.referrer_wallet_address),
      characterName: toLeaderboardString(referredByRow.character_name) || "mfer",
      status: toReferralStatus(referredByRow.status),
      activatedAt: toLeaderboardIsoString(referredByRow.activated_at),
      activationProgressPoints: Math.min(SEASON_0_REFERRAL_ACTIVATION_POINTS, toLeaderboardNumber(referredByRow.activation_progress_points)),
      refereeBonusPoints: toLeaderboardNumber(referredByRow.referee_bonus_points),
    }
    : null;

  return {
    ok: true,
    seasonId: SEASON_0_ID,
    walletAddress: normalizedWallet,
    generatedAt: now.toISOString(),
    inviteUrl: makeSeasonReferralInviteUrl(publicOrigin, normalizedWallet),
    limits: {
      activationPoints: SEASON_0_REFERRAL_ACTIVATION_POINTS,
      bonusRatePercent: 20,
      maxBonusPoints: SEASON_0_REFERRAL_MAX_BONUS_POINTS,
      maxReferees: SEASON_0_REFERRAL_MAX_REFEREES,
    },
    referredBy,
    referralCount: referrals.length,
    activatedReferralCount: referrals.filter((row) => row.status === "active").length,
    referrerBonusPoints: referrals.reduce((sum, row) => sum + row.referrerBonusPoints, 0),
    refereeBonusPoints: referredBy?.refereeBonusPoints ?? 0,
    referrals,
  };
}

export async function removeSeasonReferral({
  referrerWalletAddress,
  refereeWalletAddress,
  now = new Date(),
}: {
  referrerWalletAddress: string;
  refereeWalletAddress: string;
  now?: Date;
}): Promise<SeasonReferralRemovePersistenceResult> {
  const normalizedReferrer = normalizeWalletAddress(referrerWalletAddress);
  const normalizedReferee = normalizeWalletAddress(refereeWalletAddress);
  const base = {
    referrerWalletAddress: normalizedReferrer,
    refereeWalletAddress: normalizedReferee,
  };
  if (!normalizedReferrer || !normalizedReferee) {
    return makeSeasonReferralRemoveResult("invalid_wallet", base);
  }

  const db = getDatabase();
  if (!db) return makeSeasonReferralRemoveResult("no_database", base, "referral database unavailable");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:${normalizedReferrer}`}), 0)`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:${normalizedReferee}`}), 0)`);

    const referral = await tx.query.seasonReferrals.findFirst({
      where: and(
        eq(seasonReferrals.seasonId, SEASON_0_ID),
        eq(seasonReferrals.referrerWalletAddress, normalizedReferrer),
        eq(seasonReferrals.refereeWalletAddress, normalizedReferee),
      ),
    });
    if (!referral) return makeSeasonReferralRemoveResult("not_found", base, "referral not found");

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:referral:${referral.id}`}), 0)`);

    const bonusEvents = await tx.select({
      walletAddress: seasonRewardEvents.walletAddress,
      points: seasonRewardEvents.points,
      status: seasonRewardEvents.status,
      createdAt: seasonRewardEvents.createdAt,
    })
      .from(seasonRewardEvents)
      .where(and(
        eq(seasonRewardEvents.seasonId, SEASON_0_ID),
        eq(seasonRewardEvents.sourceType, "referral"),
        sql`${seasonRewardEvents.sourceId} LIKE ${`${referral.id}:bonus:%`}`,
      ));

    await tx.delete(seasonRewardEvents)
      .where(and(
        eq(seasonRewardEvents.seasonId, SEASON_0_ID),
        eq(seasonRewardEvents.sourceType, "referral"),
        sql`${seasonRewardEvents.sourceId} LIKE ${`${referral.id}:bonus:%`}`,
      ));
    await tx.delete(seasonReferrals).where(eq(seasonReferrals.id, referral.id));

    const dayStart = getSeasonDayStart(now);
    const countedStatuses = new Set(["pending", "approved", "distributed"]);
    let removedReferrerBonusPoints = 0;
    let removedReferrerDailyPoints = 0;
    let removedRefereeBonusPoints = 0;
    let removedRefereeDailyPoints = 0;
    for (const event of bonusEvents) {
      if (!countedStatuses.has(event.status)) continue;
      const walletAddress = normalizeWalletAddress(event.walletAddress);
      const points = Math.max(0, Math.floor(Number(event.points ?? 0)));
      const isToday = event.createdAt >= dayStart;
      if (walletAddress === normalizedReferrer) {
        removedReferrerBonusPoints += points;
        if (isToday) removedReferrerDailyPoints += points;
      } else if (walletAddress === normalizedReferee) {
        removedRefereeBonusPoints += points;
        if (isToday) removedRefereeDailyPoints += points;
      }
    }

    const [referrerTotals, refereeTotals] = await Promise.all([
      getSeasonRewardTotals(tx, normalizedReferrer, now),
      getSeasonRewardTotals(tx, normalizedReferee, now),
    ]);
    return {
      ok: true,
      status: "removed",
      ...base,
      removedReferrerBonusPoints,
      removedReferrerDailyPoints,
      removedRefereeBonusPoints,
      removedRefereeDailyPoints,
      referrerSeason0Points: referrerTotals.seasonTotal,
      referrerSeason0DailyPoints: referrerTotals.dailyTotal,
      refereeSeason0Points: refereeTotals.seasonTotal,
      refereeSeason0DailyPoints: refereeTotals.dailyTotal,
    };
  });
}

async function getSeasonRewardTotals(
  tx: DatabaseTransaction,
  walletAddress: string,
  now: Date,
) {
  const dayStart = getSeasonDayStart(now);
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

function makeSeasonReferralRemoveResult(
  status: SeasonReferralRemovePersistenceResult["status"],
  {
    referrerWalletAddress,
    refereeWalletAddress,
  }: {
    referrerWalletAddress: string;
    refereeWalletAddress: string;
  },
  error?: string,
): SeasonReferralRemovePersistenceResult {
  return {
    ok: false,
    status,
    referrerWalletAddress,
    refereeWalletAddress,
    removedReferrerBonusPoints: 0,
    removedReferrerDailyPoints: 0,
    removedRefereeBonusPoints: 0,
    removedRefereeDailyPoints: 0,
    referrerSeason0Points: 0,
    referrerSeason0DailyPoints: 0,
    refereeSeason0Points: 0,
    refereeSeason0DailyPoints: 0,
    error,
  };
}

function getSeasonDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function getSeasonEligibleBasePointTotal(tx: DatabaseTransaction, walletAddress: string) {
  const countedStatuses = ["pending", "approved", "distributed"];
  const [row] = await tx.select({
    total: sql<number>`coalesce(sum(${seasonRewardEvents.points}), 0)::int`,
  })
    .from(seasonRewardEvents)
    .where(and(
      eq(seasonRewardEvents.seasonId, SEASON_0_ID),
      eq(seasonRewardEvents.walletAddress, walletAddress),
      inArray(seasonRewardEvents.sourceType, ["quest", "event"]),
      inArray(seasonRewardEvents.status, countedStatuses),
    ));
  return Number(row?.total ?? 0);
}

async function isWalletMarkedAgent(tx: DatabaseTransaction, walletAddress: string) {
  const wallet = await findAccountWalletByNormalizedAddress(tx, walletAddress);
  return getRegisteredWalletClientKind(wallet) === "agent";
}

async function processSeasonReferralBaseAward(
  tx: DatabaseTransaction,
  {
    refereeWalletAddress,
    refereeCharacterId,
    sourceType,
    awardedPoints,
    isAgent,
    now,
  }: {
    refereeWalletAddress: string;
    refereeCharacterId: string;
    sourceType: SeasonRewardSourceType;
    awardedPoints: number;
    isAgent: boolean;
    now: Date;
  },
): Promise<SeasonReferralBonusAward | undefined> {
  const normalizedReferee = normalizeWalletAddress(refereeWalletAddress);
  const points = Math.max(0, Math.floor(awardedPoints));
  if (!normalizedReferee) return undefined;
  const walletIsAgent = await isWalletMarkedAgent(tx, normalizedReferee);
  if (!isSeasonReferralEligibleBaseAward({ sourceType, isAgent, walletIsAgent, awardedPoints: points })) return undefined;

  const referral = await tx.query.seasonReferrals.findFirst({
    where: and(
      eq(seasonReferrals.seasonId, SEASON_0_ID),
      eq(seasonReferrals.refereeWalletAddress, normalizedReferee),
    ),
  });
  if (!referral || await isWalletMarkedAgent(tx, referral.referrerWalletAddress)) return undefined;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:referral:${referral.id}`}), 0)`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${SEASON_0_ID}:${referral.referrerWalletAddress}`}), 0)`);

  const totalEligibleBasePoints = await getSeasonEligibleBasePointTotal(tx, normalizedReferee);
  const progressUpdate = getSeasonReferralProgressUpdate({
    status: toReferralStatus(referral.status),
    activatedAt: referral.activatedAt,
    postActivationBasePoints: referral.postActivationBasePoints,
    totalEligibleBasePoints,
    awardedPoints: points,
    now,
  });
  const nextStatus = progressUpdate.nextStatus;
  const nextActivatedAt = progressUpdate.nextActivatedAt;
  const nextPostActivationBasePoints = progressUpdate.nextPostActivationBasePoints;

  if (
    nextStatus !== referral.status
    || nextActivatedAt !== referral.activatedAt
    || nextPostActivationBasePoints !== referral.postActivationBasePoints
  ) {
    await tx.update(seasonReferrals)
      .set({
        status: nextStatus,
        activatedAt: nextActivatedAt,
        postActivationBasePoints: nextPostActivationBasePoints,
        updatedAt: now,
      })
      .where(eq(seasonReferrals.id, referral.id));
  }

  if (nextStatus !== "active" || !progressUpdate.shouldCountAward) return undefined;

  const [referrerTotals, refereeTotals] = await Promise.all([
    getSeasonRewardTotals(tx, referral.referrerWalletAddress, now),
    getSeasonRewardTotals(tx, normalizedReferee, now),
  ]);
  const referrerCapacity = Math.min(
    Math.max(0, SEASON_0_DAILY_POINT_CAP - referrerTotals.dailyTotal),
    Math.max(0, SEASON_0_TOTAL_POINT_CAP - referrerTotals.seasonTotal),
    Math.max(0, SEASON_0_REFERRAL_MAX_BONUS_POINTS - referral.referrerBonusPoints),
  );
  const refereeCapacity = Math.min(
    Math.max(0, SEASON_0_DAILY_POINT_CAP - refereeTotals.dailyTotal),
    Math.max(0, SEASON_0_TOTAL_POINT_CAP - refereeTotals.seasonTotal),
    Math.max(0, SEASON_0_REFERRAL_MAX_BONUS_POINTS - referral.refereeBonusPoints),
  );
  const bonusPoints = getSeasonReferralBonusDelta({
    postActivationBasePoints: nextPostActivationBasePoints,
    referrerBonusPoints: referral.referrerBonusPoints,
    refereeBonusPoints: referral.refereeBonusPoints,
    referrerCapacity,
    refereeCapacity,
  });
  if (bonusPoints <= 0) return undefined;

  const nextReferrerBonusPoints = referral.referrerBonusPoints + bonusPoints;
  const nextRefereeBonusPoints = referral.refereeBonusPoints + bonusPoints;
  const sourceId = `${referral.id}:bonus:${nextRefereeBonusPoints}`;
  await tx.insert(seasonRewardEvents).values([
    {
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      characterId: referral.referrerCharacterId,
      walletAddress: referral.referrerWalletAddress,
      sourceType: "referral",
      sourceId,
      points: bonusPoints,
      status: "pending",
      note: `referral bonus from ${shortWalletForNote(normalizedReferee)}`,
      createdAt: now,
    },
    {
      id: randomUUID(),
      seasonId: SEASON_0_ID,
      characterId: refereeCharacterId || referral.refereeCharacterId,
      walletAddress: normalizedReferee,
      sourceType: "referral",
      sourceId,
      points: bonusPoints,
      status: "pending",
      note: `referral bonus with ${shortWalletForNote(referral.referrerWalletAddress)}`,
      createdAt: now,
    },
  ]);

  await tx.update(seasonReferrals)
    .set({
      referrerBonusPoints: nextReferrerBonusPoints,
      refereeBonusPoints: nextRefereeBonusPoints,
      updatedAt: now,
    })
    .where(eq(seasonReferrals.id, referral.id));

  return {
    referralId: referral.id,
    referrerWalletAddress: referral.referrerWalletAddress,
    referrerCharacterId: referral.referrerCharacterId,
    referrerPoints: bonusPoints,
    refereePoints: bonusPoints,
  };
}

function shortWalletForNote(walletAddress: string) {
  return walletAddress.length > 12
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : walletAddress;
}

type SeasonLeaderboardQueryRow = {
  rank?: unknown;
  wallet_address?: unknown;
  client_kind?: unknown;
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
  referral_count?: unknown;
  activated_referral_count?: unknown;
  referral_bonus_points?: unknown;
  total_entries?: unknown;
  total_season_points?: unknown;
  total_xp?: unknown;
};

type SeasonReferralSummaryQueryRow = {
  referee_wallet_address?: unknown;
  character_name?: unknown;
  status?: unknown;
  activated_at?: unknown;
  post_activation_base_points?: unknown;
  referrer_bonus_points?: unknown;
  referee_bonus_points?: unknown;
  activation_progress_points?: unknown;
};

type SeasonReferralReferredByQueryRow = {
  referrer_wallet_address?: unknown;
  character_name?: unknown;
  status?: unknown;
  activated_at?: unknown;
  referee_bonus_points?: unknown;
  activation_progress_points?: unknown;
};

function mapSeasonLeaderboardEntry(row: SeasonLeaderboardQueryRow): SeasonLeaderboardEntry {
  return {
    rank: toLeaderboardNumber(row.rank),
    walletAddress: toLeaderboardString(row.wallet_address),
    characterName: toLeaderboardString(row.character_name) || "mfer",
    clientKind: normalizeWalletClientKind(row.client_kind),
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
    referralCount: toLeaderboardNumber(row.referral_count),
    activatedReferralCount: toLeaderboardNumber(row.activated_referral_count),
    referralBonusPoints: toLeaderboardNumber(row.referral_bonus_points),
  };
}

function mapSeasonReferralSummaryRow(row: SeasonReferralSummaryQueryRow): SeasonReferralSummaryRow {
  return {
    refereeWalletAddress: toLeaderboardString(row.referee_wallet_address),
    characterName: toLeaderboardString(row.character_name) || "mfer",
    status: toReferralStatus(row.status),
    activatedAt: toLeaderboardIsoString(row.activated_at),
    activationProgressPoints: Math.min(SEASON_0_REFERRAL_ACTIVATION_POINTS, toLeaderboardNumber(row.activation_progress_points)),
    postActivationBasePoints: toLeaderboardNumber(row.post_activation_base_points),
    referrerBonusPoints: toLeaderboardNumber(row.referrer_bonus_points),
    refereeBonusPoints: toLeaderboardNumber(row.referee_bonus_points),
  };
}

function toReferralStatus(value: unknown): SeasonReferralStatus {
  if (SEASON_0_REFERRAL_ACTIVATION_POINTS <= 0) return "active";
  return value === "active" ? "active" : "pending";
}

function makeSeasonReferralInviteUrl(publicOrigin: string, walletAddress: string) {
  const origin = publicOrigin.trim().replace(/\/+$/, "") || "https://game.mfergpt.lol";
  return `${origin}/?referral=${encodeURIComponent(walletAddress)}`;
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

function mapFishingPondCatchRow(row: typeof fishingPondCatches.$inferSelect): PersistedFishingPondCatch {
  return {
    catchId: row.catchId,
    characterId: row.characterId ?? "",
    walletAddress: normalizeWalletAddress(row.walletAddress),
    attemptId: row.attemptId,
    status: normalizeFishingPondCatchStatus(row.status),
    chainId: row.chainId,
    contractAddress: row.contractAddress,
    standard: normalizeFishingPondStandard(row.tokenStandard),
    collection: row.collectionAddress,
    tokenId: row.tokenId,
    amount: row.amount,
    pondEntryId: row.pondEntryId,
    metadata: normalizeFishingPondMetadata(row),
    voucher: normalizeFishingPondVoucher(row.voucherJson),
    txHash: row.txHash,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    txSubmittedAt: row.txSubmittedAt,
    confirmedAt: row.confirmedAt,
  };
}

function normalizeFishingPondMetadata(row: typeof fishingPondCatches.$inferSelect): FishingNftMetadataSnapshot | null {
  const metadata = {
    name: sanitizeFishingPondMetadataText(row.metadataName, 160),
    description: sanitizeFishingPondMetadataText(row.metadataDescription, 600),
    image: sanitizeFishingPondMetadataText(row.metadataImage, 600),
    tokenUri: sanitizeFishingPondMetadataText(row.metadataUri, 600),
  };
  return metadata.name || metadata.description || metadata.image || metadata.tokenUri ? metadata : null;
}

function sanitizeFishingPondMetadataText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeFishingPondCatchStatus(value: string): FishingNftCatchStatus {
  if (
    value === "pending"
    || value === "voucher_issued"
    || value === "tx_submitted"
    || value === "confirmed"
    || value === "expired"
    || value === "failed"
  ) {
    return value;
  }
  return "failed";
}

function normalizeFishingPondStandard(value: string): FishingNftTokenStandard {
  return value === "ERC1155" ? "ERC1155" : "ERC721";
}

function parseFishingPondAmount(value: string) {
  try {
    const amount = BigInt(value);
    return amount > 0n ? amount : 0n;
  } catch {
    return 0n;
  }
}

function normalizeFishingPondVoucher(value: unknown): FishingNftClaimVoucher | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FishingNftClaimVoucher>;
  if (typeof candidate.catchId !== "string" || typeof candidate.signature !== "string") return null;
  if (candidate.standard !== "ERC721" && candidate.standard !== "ERC1155") return null;
  return {
    catchId: candidate.catchId,
    fisher: typeof candidate.fisher === "string" ? candidate.fisher : "",
    tokenStandard: candidate.standard === "ERC1155" ? 2 : 1,
    standard: candidate.standard,
    collection: typeof candidate.collection === "string" ? candidate.collection : "",
    tokenId: typeof candidate.tokenId === "string" ? candidate.tokenId : "0",
    amount: typeof candidate.amount === "string" ? candidate.amount : "1",
    pondEntryId: typeof candidate.pondEntryId === "string" ? candidate.pondEntryId : "0",
    expiresAt: Number(candidate.expiresAt) || 0,
    chainId: Number(candidate.chainId) || 0,
    verifyingContract: typeof candidate.verifyingContract === "string" ? candidate.verifyingContract : "",
    signature: candidate.signature,
  };
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

function toWalletCharacterPreview(
  character: typeof characters.$inferSelect,
  registeredClientKind: WalletClientKind | "",
): WalletCharacterPreview {
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
    registeredClientKind,
  };
}

import { randomBytes, randomInt as cryptoRandomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorCode, Room, ServerError, type Client } from "colyseus";
import {
  CHAT,
  COMBAT,
  EMOTES,
  FISHING_BITE_MAX_MS,
  FISHING_BITE_MIN_MS,
  FISHING_BITE_WINDOW_MS,
  FISHING_AGENT_BUNDLE_MULTIPLIER,
  FISHING_AGENT_CATCH_CHANCE_MULTIPLIER,
  FISHING_AGENT_NFT_CHANCE_MULTIPLIER,
  FISHING_AGENT_RARE_CHANCE_MULTIPLIER,
  FISHING_CAST_MS,
  FISHING_CHUM_ITEM_ID,
  FISHING_LOST_SHOE_ITEM_ID,
  FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
  FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
  FISHING_POND_STATUS_NPC_ID,
  FISHING_POLE_ITEM_ID,
  FISHING_SELLABLE_ITEM_IDS,
  FISHING_SUPPLY_PRODUCT_ID,
  FISHING_TUTOR_NPC_ID,
  FISHING_VENDOR_NPC_ID,
  FISHING_ZONE,
  FISHING_ZONE_ID,
  ITEMS,
  LOANER_FISHING_POLE_ITEM_ID,
  LOOT,
  MAX_PLAYERS,
  MFERGPT,
  MFERGPT_DAILY_BOSS_NPC_ID,
  ONCHAIN_FISHING_ROD_PRODUCT_ID,
  PLAYER,
  POTION_SHOP_NPC_ID,
  POTION_SHOP_PRODUCT_ID,
  PROGRESSION,
  QUESTS,
  RECONNECT_GRACE_PERIOD_SECONDS,
  RESPEC_MFER_NPC_ID,
  ROOM_NAME,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_TOTAL_POINT_CAP,
  SERVER_TICK_RATE,
  TALENTS,
  TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
  TALENT_RESPEC_PRODUCT_ID,
  TRAITS_MFER_NPC_ID,
  AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
  TRASH_VENDOR_ITEM_IDS,
  TRASH_VENDOR_NPC_ID,
  clamp,
  getAgentTrashVendorAwardPoints,
  getAgentTrashVendorPayableQuantity,
  getFishingBobberPosition,
  getFishingPayableQuantity,
  getFishingRequiredBundleSize,
  getFishingSellAwardPoints,
  getFishingSaleRule,
  getFishingSupplyPrice,
  getTrashVendorSellValue,
  getNpcDisposition,
  getChainGearItemId,
  getInventoryItemKey,
  getItemConsumable,
  getPotionShopPrice,
  getQuestTurnInNpcId,
  hasExplicitMferAppearanceTraits,
  isPotionShopItemId,
  isPotionShopPurchaseQuantity,
  isFishingSellableItemId,
  isNearFishingZone,
  isTrashVendorItemId,
  normalizeAvatarSeed,
  normalizeChainTokenId,
  normalizeChainGearTier,
  normalizeMferAppearanceTraits,
  normalizeAgentMferAppearanceTraits,
  normalizeWalletAddress,
  parseMferAppearanceTraitsJson,
  resolveAgentMferAppearanceTraitsForUpdate,
  resolveWorldCollision,
  rollFishingCatch,
  serializeAgentMferAppearanceTraits,
  serializeMferAppearanceTraits,
  setWorldCollisionPlacementOverrides,
  stableHash,
  sanitizePlayerName,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientAgentStatus,
  type ClientAbandonFishingNftCatch,
  type ClientCancelQuest,
  type ClientCompleteQuest,
  type ClientCombatAction,
  type ClientDebugRegisterChainGear,
  type ClientDebugUpdateChainGearTier,
  type ClientEmote,
  type ClientEquipItem,
  type ClientCancelFishing,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type ClientPurchasePotionShopItem,
  type ClientPurchaseFishingSupply,
  type ClientPurchaseOnchainFishingRod,
  type ClientRegisterChainGear,
  type ClientReelFishing,
  type ClientRemoveSeasonReferral,
  type ClientRespecTalents,
  type ClientSelectTalent,
  type ClientSellFishingItems,
  type ClientSellTrashItems,
  type ClientShareQuestLink,
  type ClientStartFishing,
  type ClientSubmitFishingNftClaimTx,
  type ClientSubmitMintClubRedemptionTx,
  type ClientUpdateTraits,
  type ClientUnequipItem,
  type ClientUseItem,
  type CombatActionId,
  type EmoteId,
  type ExperienceEvent,
  type FishingCatchItemId,
  type FishingNftCapNotice,
  type FishingNftCatchResult,
  type FishingNftHistoryResult,
  type FishingNftCatchStatus,
  type FishingNftCatchSnapshot,
  type FishingWalletNftSnapshot,
  type MintClubRedemptionResult,
  type OnchainFishingRodMintResult,
  type FishingSellableItemId,
  type FishingResult,
  type FishingSupplyPurchaseResult,
  type FishingVendorSellResult,
  type FishingVendorSoldItem,
  type IdentityType,
  type ItemId,
  type JoinOptions,
  type LootWindow,
  type PotionShopPurchaseResult,
  type QuestId,
  type SeasonReferralRemoveResult,
  type TalentRespecResult,
  type TrashVendorItemId,
  type TrashVendorSellResult,
  type TrashVendorSoldItem,
} from "@mferland/shared";
import { ActiveBuffState, EquipmentSlotState, InventoryItemState, PlayerState, QuestState, TalentState, TownState, type NpcState } from "../state.js";
import type { TrackedInput } from "../types.js";
import { recordAnalyticsEvent, type AnalyticsProperties } from "../analytics.js";
import { areAgentsEnabled } from "../agentAccess.js";
import { getDatabase } from "../db/client.js";
import {
  getAgentSeason0MferGptGateStatus,
  makeAgentSeason0MferGptGateMessage,
  type AgentSeason0MferGptGateStatus,
} from "../agentMferGptGate.js";
import { verifyChainGearOwnership } from "../crypto/chainGear.js";
import {
  makeFishingNftCatchSnapshotFromVoucher,
  makeFishingPondClaimVoucher,
  readFishingPondAvailableEntries,
  readFishingPondEntryMetadata,
  readFishingPondPublicConfig,
  resolveFishingPondConfig,
  verifyFishingPondClaimReceipt,
} from "../crypto/fishingPond.js";
import { selectWeightedFishingPondEntry } from "../crypto/fishingPondSelection.js";
import {
  isMintClubRedemptionEligibleCatch,
  makeMintClubRedemptionSnapshot,
  resolveMintClubRedemptionConfig,
  verifyMintClubRedemptionReceipt,
} from "../crypto/mintClubRedemption.js";
import {
  isOnchainFishingRodRequirementSatisfied,
  mintOnchainFishingRodForWallet,
  readOnchainFishingRodRequirement,
  readOnchainFishingRodWalletNft,
  resolveOnchainFishingRodConfig,
} from "../crypto/onchainFishingRod.js";
import { verifyFishingSupplyPaymentProof, type VerifiedFishingSupplyPayment } from "../crypto/fishingSupplyPayments.js";
import { verifyMferGptBurnPaymentProof, type VerifiedMferGptBurnPayment } from "../crypto/mferGptBurnPayments.js";
import { verifyPotionShopPaymentProof, type VerifiedPotionShopPayment } from "../crypto/potionShopPayments.js";
import { verifyTalentRespecPaymentProof, type VerifiedTalentRespecPayment } from "../crypto/talentRespecPayments.js";
import { verifyTraitPaymentProof, type VerifiedTraitPayment } from "../crypto/traitPayments.js";
import {
  loadOrCreateWalletCharacter,
  awardSeason0QuestReward,
  getWalletClientKindMismatchForWallet,
  getWalletInviteAccess,
  recordWalletInviteUsage,
  removeSeasonReferral,
  saveCharacterProgress,
  saveCharacterProgressWithCryptoPurchase,
  saveCharacterProgressWithSeason0Reward,
  saveCharacterProgressWithTraitPayment,
  createFishingPondCatchRecord,
  markFishingPondCatchAbandoned,
  findFishingPondCatch,
  findFishingPondCatchHistoryForWallet,
  findLatestActiveFishingPondCatchForWallet,
  markFishingPondCatchConfirmed,
  markFishingPondCatchExpired,
  markFishingPondCatchFailed,
  markFishingPondCatchMintClubRedemption,
  markFishingPondCatchMintClubRedemptionFailed,
  markFishingPondCatchTxSubmitted,
  PersistenceUnavailableError,
  WalletClientKindMismatchError,
  type PersistableCharacterState,
  type PersistedCharacter,
  type PersistedFishingPondCatch,
  type SeasonRewardAwardResult,
} from "../persistence.js";
import {
  aggroNeutralNpcOnPlayerAttackStart,
  applyCombatDamage,
  applyPlayerUniversalCooldown,
  applyUnitHealing,
  clearPlayerCast,
  findCombatTarget,
  getActionReadyAt,
  getPlayerActionDamage,
  getPlayerHealingAmount,
  isNpcAlive,
  isPlayerStationary,
  normalizeCombatActionId,
  processPendingCombatImpacts,
  respawnPlayerAtFountain,
  setActionReadyAt,
  updatePlayerCast,
  updatePlayerRegen,
  type PendingCombatImpact,
} from "../systems/combat.js";
import { makeNpcUtilityEvent } from "../systems/combatEvents.js";
import { getPlayerBuffEffectTotals, removeExpiredPlayerBuffs, snapshotActiveBuffs } from "../systems/buffs.js";
import { clearConsumableCooldownsForPlayer, grantStarterConsumables, useInventoryConsumable } from "../systems/consumables.js";
import {
  equipInventoryItem,
  initializeCharacterEquipment,
  normalizeEquipmentSlotId,
  recalculatePlayerStats,
  registerChainGearItem,
  unequipPlayerSlot,
  updateChainGearTier,
} from "../systems/equipment.js";
import { findInteractNpc } from "../systems/interactions.js";
import { lootCorpseItem, makeLootWindow, normalizeItemId, npcHasLoot } from "../systems/loot.js";
import {
  recordMferlandMferGptCommand,
  recordMferlandNpcDefeated,
  recordMferlandQuestCompleted,
  recordMferlandServerStarted,
  updateMferlandLiveStatus,
} from "../systems/mferlandLiveMemory.js";
import { getMferGptPrompt, handleMferGptPrompt, type MferGptCommand } from "../systems/mfergpt.js";
import { getActiveMferGptDailyQuestAssignment } from "../systems/generatedDailyQuests.js";
import {
  clearMferGptDailyHub,
  spawnNpcFromSpec,
  spawnNpcs,
  spawnOrUpdateMferGptDailyHub,
  updateNpcs,
} from "../systems/npcs.js";
import { applyFrostNova, applyMultishot, applyWhirlwind } from "../systems/playerCombatAbilities.js";
import { verifyAgentSessionToken, verifyWalletAuthProof } from "../walletAuth.js";
import {
  completeQuest,
  cancelQuest,
  getNpcDialogue,
  getNextAvailableQuestId,
  getNpcQuestInteraction,
  isQuestAvailable,
  makeQuestOffer,
  makeQuestStatusNotice,
  makeQuestTurnIn,
  normalizeQuestId,
  addInventoryItem,
  progressFishingQuest,
  progressLootQuests,
  progressTraitQuest,
  progressMferGptAskQuest,
  progressMferGptMentionQuest,
  progressSocialQuest,
  startQuest,
  progressDefeatQuests,
} from "../systems/quests.js";
import { awardExperience, getNpcDefeatXp, normalizePlayerProgression } from "../systems/progression.js";
import { distanceToNpc } from "../systems/spatial.js";
import {
  getPlayerActionConfig,
  getPlayerQuestXpReward,
  getPlayerTalentRanks,
  isPlayerActionUnlocked,
  normalizePlayerTalents,
  normalizeTalentId,
  rankPlayerTalent,
  respecPlayerTalents,
  restorePlayerTalentRanks,
} from "../systems/talents.js";
import {
  getDefaultName,
  getIdentityType,
  getSpawnPoint,
  normalizeInput,
  sanitizeChatText,
} from "../systems/utils.js";

const NPC_DAMAGE_TAG_TTL_MS = 5 * 60 * 1000;
const DAILY_RAID_BOSS_NPC_ID = "raid-ogre-mfer";
const DAILY_RAID_BOSS_INACTIVE_DESPAWN_MS = 5 * 60 * 1000;
const DAILY_RAID_BOSS_SPAWN = { x: 76, z: -111, yaw: -0.35 };
const EMOTE_MIN_INTERVAL_MS = 900;
const CHARACTER_AUTOSAVE_INTERVAL_MS = 10_000;
const DEFAULT_AGENT_IDLE_LOGOUT_MS = 3 * 60 * 1000;
const AGENT_IDLE_SWEEP_INTERVAL_MS = 15_000;
const AGENT_MOVEMENT_ACTIVITY_DISTANCE = 0.75;
const PLAYER_ATTACK_PULL_LEASH_RANGE = Math.max(...Object.values(COMBAT.actions).map((action) => action.maxRange)) + 6;
const DEBUG_PLACEMENT_MAP_PATH = fileURLToPath(new URL("../../data/debug-placement-map.json", import.meta.url));
const SESSION_REPLACED_CLOSE_CODE = 4000;
const AGENT_IDLE_CLOSE_CODE = 4001;
const DEBUG_TRASH_VENDOR_STOCK_COUNT = 20;
const DEFAULT_LOCAL_DEBUG_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const AGENT_GAMEPLAY_ACTIVITY_MESSAGES = new Set([
  "agentStatus",
  "combatAction",
  "acceptQuest",
  "completeQuest",
  "cancelQuest",
  "lootCorpse",
  "equipItem",
  "useItem",
  "unequipItem",
  "registerChainGear",
  "purchasePotionShopItem",
  "purchaseFishingSupply",
  "purchaseOnchainFishingRod",
  "sellTrashItems",
  "startFishing",
  "reelFishing",
  "cancelFishing",
  "submitFishingNftClaimTx",
  "abandonFishingNftCatch",
  "submitMintClubRedemptionTx",
  "sellFishingItems",
  "selectTalent",
  "updateTraits",
  "respawn",
  "chat",
  "shareQuestLink",
  "emote",
  "interact",
]);

export function resolveAgentIdleLogoutMs(value = process.env.MFERLAND_AGENT_IDLE_LOGOUT_MS) {
  if (value === undefined || value.trim() === "") return DEFAULT_AGENT_IDLE_LOGOUT_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : DEFAULT_AGENT_IDLE_LOGOUT_MS;
}

export function isAgentGameplayActivityMessage(messageType: string) {
  return AGENT_GAMEPLAY_ACTIVITY_MESSAGES.has(messageType);
}

export function shouldLogOutIdleAgent({
  isAgent,
  joinedAt,
  lastActivityAt,
  now,
  timeoutMs,
}: {
  isAgent: boolean;
  joinedAt: number;
  lastActivityAt: number;
  now: number;
  timeoutMs: number;
}) {
  if (!isAgent || timeoutMs <= 0) return false;
  const baseline = lastActivityAt || joinedAt;
  return baseline > 0 && now - baseline >= timeoutMs;
}
const CLIENT_ANALYTICS_EVENTS = new Set([
  "store_opened",
  "wallet_connect_started",
  "wallet_connect_succeeded",
  "wallet_connect_failed",
  "pass_purchase_started",
  "pass_purchase_confirmed",
  "pass_purchase_failed",
  "gear_purchase_started",
  "gear_purchase_confirmed",
  "gear_purchase_failed",
  "potion_shop_opened",
  "potion_shop_item_selected",
  "potion_shop_purchase_started",
  "potion_shop_purchase_failed",
  "trash_vendor_opened",
  "trash_vendor_item_selected",
  "trash_vendor_sell_started",
  "trash_vendor_sell_confirmed",
  "trash_vendor_sell_failed",
  "trash_vendor_mfergpt_gate_swap_opened",
  "fishing_started",
  "fishing_reel",
  "fishing_failed",
  "fishing_vendor_opened",
  "fishing_vendor_item_selected",
  "fishing_vendor_sell_started",
  "fishing_vendor_sell_confirmed",
  "fishing_vendor_sell_failed",
  "fishing_vendor_mfergpt_gate_swap_opened",
  "fishing_supply_opened",
  "fishing_supply_purchase_started",
  "fishing_supply_purchase_failed",
  "fishing_supply_purchase_confirmed",
  "onchain_fishing_rod_mint_started",
  "onchain_fishing_rod_mint_confirmed",
  "onchain_fishing_rod_mint_failed",
]);

export function areDebugMessagesEnabled() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_ENABLE_DEBUG_MESSAGES === "1";
}

export function isCryptoSmokeWalletAuthBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_CRYPTO_SMOKE_AUTH_BYPASS === "1";
}

export function isLocalOnlyWalletAuthBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_LOCAL_ONLY === "1";
}

export function isLocalDebugWalletAuthBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_LOCAL_DEBUG_AUTH_BYPASS === "1";
}

function getLocalDebugWalletAddresses() {
  const configured = [
    process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESSES,
    process.env.MFERLAND_LOCAL_DEBUG_WALLET_ADDRESS,
    process.env.MFERLAND_DEBUG_WALLET_ADDRESS,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(","))
    .map((value) => normalizeWalletAddress(value))
    .filter((value): value is string => Boolean(value));
  return new Set([DEFAULT_LOCAL_DEBUG_WALLET_ADDRESS, ...configured]);
}

function isCryptoSmokeWalletAuthBypassAllowed(walletAddress: string) {
  return isCryptoSmokeWalletAuthBypassEnabled()
    && walletAddress === DEFAULT_LOCAL_DEBUG_WALLET_ADDRESS;
}

function isLocalDebugWalletAllowed(walletAddress: string) {
  return isLocalDebugWalletAuthBypassEnabled()
    && getLocalDebugWalletAddresses().has(walletAddress);
}

function isWalletAuthBypassAllowed(walletAddress: string) {
  return isLocalOnlyWalletAuthBypassEnabled()
    || isCryptoSmokeWalletAuthBypassAllowed(walletAddress)
    || isLocalDebugWalletAllowed(walletAddress);
}

async function verifyWalletJoinAuth(walletAddress: string, options: JoinOptions | undefined) {
  if (verifyAgentSessionToken(walletAddress, options?.sessionToken)) return true;
  return verifyWalletAuthProof(walletAddress, options?.walletAuth);
}

function shouldSeedDebugTrashVendorStock() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_DEBUG_TRASH_VENDOR_STOCK === "1";
}

function getRequiredInviteCode() {
  return (process.env.MFERLAND_INVITE_CODE ?? "").trim();
}

function isInviteGateEnabled() {
  return process.env.MFERLAND_ENABLE_INVITE_GATE === "1"
    && (process.env.MFERLAND_REQUIRE_INVITE === "1" || Boolean(getRequiredInviteCode()));
}

async function assertInviteAllowed(options: JoinOptions | undefined, walletAddress: string) {
  if (!isInviteGateEnabled()) return;
  if (isWalletAuthBypassAllowed(walletAddress)) return;

  const inviteCode = typeof options?.inviteCode === "string" ? options.inviteCode.trim() : "";
  const requiredInvite = getRequiredInviteCode();
  if (requiredInvite && inviteCode === requiredInvite) return;

  if (!walletAddress) {
    throw new ServerError(ErrorCode.AUTH_FAILED, "wallet invite required");
  }

  const access = await getWalletInviteAccess(walletAddress, inviteCode);
  if (access.ok) {
    if (access.reason === "valid_code" && !await recordWalletInviteUsage(walletAddress, inviteCode)) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "invite already used");
    }
    return;
  }
  if (access.reason === "used_code") throw new ServerError(ErrorCode.AUTH_FAILED, "invite already used");
  if (access.reason === "no_database") throw new ServerError(ErrorCode.AUTH_FAILED, "invite database unavailable");
  throw new ServerError(ErrorCode.AUTH_FAILED, "invalid invite");
}

async function assertWalletClientKindAllowed(options: JoinOptions | undefined, walletAddress: string) {
  const requestedClientKind = getRequestedWalletClientKind(options, walletAddress);
  if (!requestedClientKind || isWalletAuthBypassAllowed(walletAddress)) return;

  try {
    const mismatch = await getWalletClientKindMismatchForWallet(walletAddress, requestedClientKind);
    if (mismatch) throw new ServerError(ErrorCode.AUTH_FAILED, mismatch);
  } catch (error) {
    if (error instanceof ServerError) throw error;
    console.error(`Failed to check wallet client registration for ${walletAddress}`, error);
    throw new ServerError(ErrorCode.AUTH_FAILED, "wallet persistence failed");
  }
}

type DebugTeleportMessage = {
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
};

type DebugNpcPlacementMessage = {
  npcId?: unknown;
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
};

type DebugWorldPlacementMessage = {
  targetId?: unknown;
  x?: unknown;
  z?: unknown;
  rotation?: unknown;
};

type DebugPlacementSaveMessage = {
  placements?: unknown;
  sourceDefaults?: unknown;
};

type DebugPlacementSaveBeginMessage = {
  saveId?: unknown;
  totalChunks?: unknown;
};

type DebugPlacementSaveChunkMessage = DebugPlacementSaveBeginMessage & {
  index?: unknown;
  chunkIndex?: unknown;
  placements?: unknown;
  sourceDefaults?: unknown;
};

type DebugBoostPlayerMessage = {
  level?: unknown;
  maxTalents?: unknown;
};

type DebugNpcSetupMessage = {
  npcId?: unknown;
  name?: unknown;
  role?: unknown;
  model?: unknown;
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
  health?: unknown;
  maxHealth?: unknown;
  leashRadius?: unknown;
  isImmortal?: unknown;
  combatStyle?: unknown;
  dialogue?: unknown;
  aggroTargetId?: unknown;
};

type ClientAnalyticsMessage = {
  eventType?: unknown;
  properties?: unknown;
};

type SessionHandoff = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

type PendingReconnection = {
  reject: Function;
};

type DebugPlacementRecord = {
  x: number;
  z: number;
  rotation: number;
  kind?: string;
  label?: string;
  source?: string;
};

type PendingDebugPlacementSave = {
  saveId: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  placements: Record<string, DebugPlacementRecord>;
  sourceDefaults: Record<string, DebugPlacementRecord>;
};

type HealTarget =
  | { kind: "player"; id: string; unit: PlayerState }
  | { kind: "npc"; id: string; unit: NpcState };

export type AdminQuestSnapshot = {
  id: QuestId;
  status: "active" | "ready" | "completed";
  progress: number;
  required: number;
  flags: string;
  completedAt: number;
};

export type AdminInventoryItemSnapshot = {
  key: string;
  id: ItemId;
  chainTokenId: string;
  chainTier: number;
  count: number;
};

export type AdminEquipmentSlotSnapshot = {
  slot: string;
  itemId: ItemId | "";
  chainTokenId: string;
  chainTier: number;
};

export type AdminTalentSnapshot = {
  id: string;
  tree: string;
  nodeId: string;
  rank: number;
};

export type AdminPlayerSnapshot = {
  sessionId: string;
  characterId: string;
  name: string;
  identityType: IdentityType;
  isAgent: boolean;
  walletAddress: string;
  avatarSeed: number;
  status: "online" | "dead";
  joinedAt: number;
  onlineForMs: number;
  lastInputAt: number;
  lastChatAt: number;
  lastInteractAt: number;
  lastAgentActivityAt: number;
  agentStatusAction: string;
  agentStatusThought: string;
  agentStatusObjective: string;
  agentStatusQuest: string;
  agentStatusUpdatedAt: number;
  agentCommandStatus: string;
  agentCommandBudgetTier: string;
  agentCommandStartedAt: number;
  agentCommandMaxSeconds: number;
  agentCommandSessionUsedSeconds: number;
  agentCommandSessionRemainingSeconds: number;
  agentCommandDailyUsedSeconds: number;
  agentCommandDailyRemainingSeconds: number;
  agentCommandDailySeconds: number;
  position: { x: number; y: number; z: number; yaw: number };
  animation: string;
  level: number;
  xp: number;
  talentPoints: number;
  season0Points: number;
  season0DailyPoints: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  healthRegenPer5: number;
  manaRegenPer5: number;
  walkSpeed: number;
  runSpeed: number;
  strength: number;
  dexterity: number;
  magic: number;
  castingAction: string;
  castTargetKind: string;
  castTargetId: string;
  lastDamagedAt: number;
  frozenUntil: number;
  quests: AdminQuestSnapshot[];
  questCounts: Record<AdminQuestSnapshot["status"], number>;
  inventory: AdminInventoryItemSnapshot[];
  equipment: AdminEquipmentSlotSnapshot[];
  talents: AdminTalentSnapshot[];
};

export type AdminNpcSnapshot = {
  id: string;
  name: string;
  role: string;
  model: string;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  alive: boolean;
  position: { x: number; y: number; z: number; yaw: number };
  animation: string;
  questId: string;
  aggroTargetId: string;
  combatStyle: string;
  hasLoot: boolean;
  loot: AdminInventoryItemSnapshot[];
  defeatedAt: number;
  respawnAt: number;
  despawnAt: number;
  frozenUntil: number;
  slowedUntil: number;
};

export type AdminRoomSnapshot = {
  roomId: string;
  roomName: string;
  createdAt: number;
  updatedAt: number;
  clients: number;
  maxClients: number;
  players: AdminPlayerSnapshot[];
  npcs: AdminNpcSnapshot[];
};

const activeTownRooms = new Set<TownRoom>();

export function getTownAdminSnapshots(now = Date.now()): AdminRoomSnapshot[] {
  return [...activeTownRooms].map((room) => room.getAdminSnapshot(now));
}

type ActiveFishingAttempt = {
  attemptId: string;
  zoneId: typeof FISHING_ZONE_ID;
  castAt: number;
  biteAt: number;
  expiresAt: number;
};

type PendingFishingLoot = {
  sourceId: string;
  attemptId: string;
  itemId: FishingCatchItemId;
  count: number;
  createdAt: number;
  readyAt: number;
  expiresAt: number;
  windowSentAt: number;
  chatMessage: string;
};

type PlayerAnimationHold = {
  animation: PlayerState["animation"];
  until: number;
};

const FISHING_LOOT_SOURCE_PREFIX = "fishing:";
const FISHING_LOOT_PICKUP_MS = 45_000;
const FISHING_REEL_ANIMATION_MS = 2400;
const FISHING_NFT_CAP_NOTICE_COOLDOWN_MS = 60_000;
const FISHING_NFT_DAILY_CAP_MS = 86_400_000;
const FISHING_NFT_TX_SUBMISSION_GRACE_MS = 5 * 60_000;

export class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly roomCreatedAt = Date.now();
  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastEmoteAt = new Map<string, number>();
  private readonly lastMferGptAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();
  private readonly persistentCharacterIds = new Map<string, string>();
  private readonly pendingCharacterSaves = new Map<string, Promise<boolean>>();
  private readonly queuedCharacterSaveFingerprints = new Map<string, string>();
  private readonly savedCharacterFingerprints = new Map<string, string>();
  private readonly pendingReconnections = new Map<string, PendingReconnection>();
  private readonly replacedReconnectionSessionIds = new Set<string>();
  private readonly sessionJoinedAt = new Map<string, number>();
  private readonly lastAgentActivityAt = new Map<string, number>();
  private readonly lastAgentActivityPosition = new Map<string, { x: number; z: number }>();
  private readonly deadSessionIds = new Set<string>();
  private readonly pendingCombatImpacts: PendingCombatImpact[] = [];
  private readonly temporaryNpcExpiresAt = new Map<string, number>();
  private readonly npcDamageTags = new Map<string, Map<string, number>>();
  private readonly npcThreat = new Map<string, Map<string, number>>();
  private readonly forcedNpcTargets = new Map<string, { sessionId: string; until: number }>();
  private readonly consumableCooldowns = new Map<string, number>();
  private readonly pendingDebugPlacementSaves = new Map<string, PendingDebugPlacementSave>();
  private readonly agentSeason0GateStatuses = new Map<string, AgentSeason0MferGptGateStatus>();
  private readonly fishingAttempts = new Map<string, ActiveFishingAttempt>();
  private readonly pendingFishingLoot = new Map<string, PendingFishingLoot>();
  private readonly fishingNftCapNoticeAt = new Map<string, number>();
  private readonly fishingNftRodDailyNoticeKeys = new Set<string>();
  private readonly playerAnimationHolds = new Map<string, PlayerAnimationHold>();
  private lastCharacterAutosaveAt = 0;
  private lastLiveMemoryStatusAt = 0;
  private lastAgentIdleSweepAt = 0;
  private dailyRaidBossInactiveDespawnAt = 0;
  private dailySignalHubAssignmentId = "";
  private lastDailySignalHubSyncAt = 0;
  private debugWorldPlacementOverrides: Record<string, DebugPlacementRecord> = {};

  async onAuth(_client: Client, options?: JoinOptions) {
    const walletAddress = normalizeWalletAddress(options?.walletAddress);
    if (isDeclaredAgentClient(options) && !areAgentsEnabled()) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "agent access disabled");
    }
    if (isDeclaredAgentClient(options) && !walletAddress) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "agent wallet required");
    }
    if (
      (options?.identityType === "wallet" || walletAddress)
      && !isWalletAuthBypassAllowed(walletAddress)
      && !await verifyWalletJoinAuth(walletAddress, options)
    ) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "wallet signature required");
    }
    await assertWalletClientKindAllowed(options, walletAddress);
    await assertInviteAllowed(options, walletAddress);
    return true;
  }

  private markAgentMessageActivity(sessionId: string, messageType: string, now = Date.now()) {
    if (!isAgentGameplayActivityMessage(messageType)) return;
    this.markAgentActivity(sessionId, now);
  }

  private markAgentActivity(sessionId: string, now = Date.now()) {
    const player = this.state.players.get(sessionId);
    if (!player?.isAgent) return;
    this.lastAgentActivityAt.set(sessionId, now);
  }

  private markAgentMovementActivity(sessionId: string, player: PlayerState, now: number) {
    if (!player.isAgent) return;
    const previous = this.lastAgentActivityPosition.get(sessionId);
    if (!previous) {
      this.lastAgentActivityPosition.set(sessionId, { x: player.x, z: player.z });
      return;
    }
    if (Math.hypot(player.x - previous.x, player.z - previous.z) < AGENT_MOVEMENT_ACTIVITY_DISTANCE) return;
    this.lastAgentActivityPosition.set(sessionId, { x: player.x, z: player.z });
    this.markAgentActivity(sessionId, now);
  }

  private disconnectIdleAgents(now: number) {
    if (now - this.lastAgentIdleSweepAt < AGENT_IDLE_SWEEP_INTERVAL_MS) return;
    this.lastAgentIdleSweepAt = now;
    const timeoutMs = resolveAgentIdleLogoutMs();
    if (timeoutMs <= 0) return;

    for (const client of [...this.clients]) {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAgent) continue;
      const joinedAt = this.sessionJoinedAt.get(client.sessionId) ?? 0;
      const lastActivityAt = this.lastAgentActivityAt.get(client.sessionId) ?? 0;
      if (!shouldLogOutIdleAgent({ isAgent: true, joinedAt, lastActivityAt, now, timeoutMs })) continue;
      this.disconnectIdleAgent(client, player, now, timeoutMs, Math.max(0, now - (lastActivityAt || joinedAt)));
    }
  }

  private disconnectIdleAgent(client: Client, player: PlayerState, now: number, timeoutMs: number, idleMs: number) {
    const sessionId = client.sessionId;
    const characterId = this.persistentCharacterIds.get(sessionId);
    this.recordPlayerAnalyticsEvent("agent_idle_logout", sessionId, player, {
      idleMs,
      timeoutMs,
      level: player.level,
      x: Math.round(player.x),
      z: Math.round(player.z),
    });
    void this.persistPlayerProgressNow(sessionId, player).catch((error) => {
      console.error(`Failed to persist idle agent ${player.walletAddress || sessionId}`, error);
    });
    this.preparePlayerForReconnect(sessionId, player);
    this.cleanupPlayerSession(sessionId, characterId);
    client.leave(AGENT_IDLE_CLOSE_CODE, "agent idle timeout");
    this.publishLiveMemoryStatus(now, true);
  }

  onCreate() {
    activeTownRooms.add(this);
    this.setState(new TownState());
    spawnNpcs(this.state.npcs);
    this.syncDailySignalHub(Date.now(), true);
    void this.loadSavedDebugPlacementMap();
    this.setSimulationInterval((dt) => this.update(dt / 1000), 1000 / SERVER_TICK_RATE);
    recordMferlandServerStarted(this.roomId, this.maxClients);
    this.publishLiveMemoryStatus(Date.now(), true);

    this.onMessage("input", (client, message: Partial<ClientInput>) => {
      const input = normalizeInput(message);
      if (!input) return;
      this.inputs.set(client.sessionId, {
        ...input,
        receivedAt: Date.now(),
      });
    });

    this.onMessage("combatAction", (client, message: Partial<ClientCombatAction>) => {
      this.markAgentMessageActivity(client.sessionId, "combatAction");
      this.handleCombatAction(client, message);
    });

    this.onMessage("acceptQuest", (client, message: Partial<ClientAcceptQuest>) => {
      this.markAgentMessageActivity(client.sessionId, "acceptQuest");
      this.handleAcceptQuest(client, message);
    });

    this.onMessage("completeQuest", (client, message: Partial<ClientCompleteQuest>) => {
      this.markAgentMessageActivity(client.sessionId, "completeQuest");
      this.handleCompleteQuest(client, message);
    });
    this.onMessage("cancelQuest", (client, message: Partial<ClientCancelQuest>) => {
      this.markAgentMessageActivity(client.sessionId, "cancelQuest");
      this.handleCancelQuest(client, message);
    });

    this.onMessage("analyticsEvent", (client, message: ClientAnalyticsMessage = {}) => {
      this.handleClientAnalyticsEvent(client, message);
    });

    this.onMessage("agentStatus", (client, message: Partial<ClientAgentStatus> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "agentStatus");
      this.handleAgentStatus(client, message);
    });

    this.onMessage("lootCorpse", (client, message: Partial<ClientLootCorpse>) => {
      this.markAgentMessageActivity(client.sessionId, "lootCorpse");
      this.handleLootCorpse(client, message);
    });

    this.onMessage("equipItem", (client, message: Partial<ClientEquipItem>) => {
      this.markAgentMessageActivity(client.sessionId, "equipItem");
      this.handleEquipItem(client, message);
    });

    this.onMessage("useItem", (client, message: Partial<ClientUseItem>) => {
      this.markAgentMessageActivity(client.sessionId, "useItem");
      this.handleUseItem(client, message);
    });

    this.onMessage("unequipItem", (client, message: Partial<ClientUnequipItem>) => {
      this.markAgentMessageActivity(client.sessionId, "unequipItem");
      this.handleUnequipItem(client, message);
    });

    this.onMessage("registerChainGear", (client, message: Partial<ClientRegisterChainGear> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "registerChainGear");
      void this.handleRegisterChainGear(client, message);
    });

    this.onMessage("purchasePotionShopItem", (client, message: Partial<ClientPurchasePotionShopItem> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "purchasePotionShopItem");
      void this.handlePurchasePotionShopItem(client, message);
    });

    this.onMessage("purchaseFishingSupply", (client, message: Partial<ClientPurchaseFishingSupply> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "purchaseFishingSupply");
      void this.handlePurchaseFishingSupply(client, message);
    });

    this.onMessage("purchaseOnchainFishingRod", (client, message: Partial<ClientPurchaseOnchainFishingRod> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "purchaseOnchainFishingRod");
      void this.handlePurchaseOnchainFishingRod(client, message);
    });

    this.onMessage("sellTrashItems", (client, message: Partial<ClientSellTrashItems> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "sellTrashItems");
      void this.handleSellTrashItems(client, message);
    });

    this.onMessage("startFishing", (client, message: Partial<ClientStartFishing> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "startFishing");
      this.handleStartFishing(client, message);
    });

    this.onMessage("reelFishing", (client, message: Partial<ClientReelFishing> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "reelFishing");
      void this.handleReelFishing(client, message);
    });

    this.onMessage("cancelFishing", (client, _message: Partial<ClientCancelFishing> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "cancelFishing");
      const player = this.state.players.get(client.sessionId);
      if (player) this.cancelFishing(client.sessionId, player);
    });

    this.onMessage("submitFishingNftClaimTx", (client, message: Partial<ClientSubmitFishingNftClaimTx> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "submitFishingNftClaimTx");
      void this.handleSubmitFishingNftClaimTx(client, message);
    });

    this.onMessage("abandonFishingNftCatch", (client, message: Partial<ClientAbandonFishingNftCatch> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "abandonFishingNftCatch");
      void this.handleAbandonFishingNftCatch(client, message);
    });

    this.onMessage("submitMintClubRedemptionTx", (client, message: Partial<ClientSubmitMintClubRedemptionTx> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "submitMintClubRedemptionTx");
      void this.handleSubmitMintClubRedemptionTx(client, message);
    });

    this.onMessage("refreshFishingNftHistory", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) void this.syncFishingNftHistory(client, player);
    });

    this.onMessage("sellFishingItems", (client, message: Partial<ClientSellFishingItems> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "sellFishingItems");
      void this.handleSellFishingItems(client, message);
    });

    this.onMessage("removeSeasonReferral", (client, message: Partial<ClientRemoveSeasonReferral> = {}) => {
      void this.handleRemoveSeasonReferral(client, message);
    });

    this.onMessage("selectTalent", (client, message: Partial<ClientSelectTalent>) => {
      this.markAgentMessageActivity(client.sessionId, "selectTalent");
      this.handleSelectTalent(client, message);
    });

    this.onMessage("respecTalents", (client, message: Partial<ClientRespecTalents> = {}) => {
      void this.handleRespecTalents(client, message);
    });

    this.onMessage("updateTraits", (client, message: Partial<ClientUpdateTraits>) => {
      this.markAgentMessageActivity(client.sessionId, "updateTraits");
      void this.handleUpdateTraits(client, message).catch((error) => {
        const player = this.state.players.get(client.sessionId);
        client.send("traitUpdateResult", {
          ok: false,
          traits: parseMferAppearanceTraitsJson(player?.appearanceTraitsJson),
          name: player?.name ?? "",
          free: false,
          paid: false,
          error: error instanceof Error ? error.message : "trait update failed",
        });
      });
    });

    this.onMessage("respawn", (client) => {
      this.markAgentMessageActivity(client.sessionId, "respawn");
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health > 0) return;
      respawnPlayerAtFountain(player);
      clearPlayerEmote(player);
      this.inputs.delete(client.sessionId);
      this.jumpHeld.set(client.sessionId, false);
      this.deadSessionIds.delete(client.sessionId);
      this.recordPlayerAnalyticsEvent("player_respawned", client.sessionId, player, {
        level: player.level,
        x: Math.round(player.x),
        z: Math.round(player.z),
      });
    });

    if (areDebugMessagesEnabled()) {
      this.onMessage("debugTeleport", (client, message: DebugTeleportMessage = {}) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        const x = Number(message.x);
        const z = Number(message.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;

        const resolved = resolveWorldCollision(x, z, PLAYER.radius);
        player.x = resolved.x;
        player.y = 0;
        player.z = resolved.z;
        player.health = player.maxHealth;
        player.mana = player.maxMana;
        player.verticalVelocity = 0;
        player.animation = "idle";
        clearPlayerEmote(player);
        if (Number.isFinite(Number(message.yaw))) player.yaw = Number(message.yaw);
        clearPlayerCast(player);
        this.removePlayerThreat(client.sessionId);
        this.inputs.delete(client.sessionId);
        this.jumpHeld.set(client.sessionId, false);
      });

      this.onMessage("debugSetNpcPlacement", (_client, message: DebugNpcPlacementMessage = {}) => {
        const npcId = typeof message.npcId === "string" ? message.npcId : "";
        const npc = this.state.npcs.get(npcId);
        if (!npc) return;

        const x = Number(message.x);
        const z = Number(message.z);
        const yaw = Number(message.yaw);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;

        npc.x = x;
        npc.y = 0;
        npc.z = z;
        if (Number.isFinite(yaw)) npc.yaw = yaw;
        npc.homeX = x;
        npc.homeZ = z;
        npc.targetX = x;
        npc.targetZ = z;
        npc.aggroOriginX = x;
        npc.aggroOriginZ = z;
        npc.isEvading = false;
        npc.animation = "idle";
        npc.aggroTargetId = "";
        npc.attackReadyAt = 0;
        npc.shootReadyAt = 0;
        npc.frostNovaReadyAt = 0;
        npc.whirlwindReadyAt = 0;
        npc.multishotReadyAt = 0;
        npc.frozenUntil = 0;
        npc.slowedUntil = 0;
        this.clearNpcThreat(npc.id);
      });

      this.onMessage("debugSetWorldPlacement", (_client, message: DebugWorldPlacementMessage = {}) => {
        this.handleDebugSetWorldPlacement(message);
      });

      this.onMessage("debugBoostPlayer", (client, message: DebugBoostPlayerMessage = {}) => {
        this.handleDebugBoostPlayer(client, message);
      });

      this.onMessage("debugRegisterChainGear", (client, message: Partial<ClientDebugRegisterChainGear> = {}) => {
        this.handleDebugRegisterChainGear(client, message);
      });

      this.onMessage("debugUpdateChainGearTier", (client, message: Partial<ClientDebugUpdateChainGearTier> = {}) => {
        this.handleDebugUpdateChainGearTier(client, message);
      });

      this.onMessage("debugSetupNpc", (_client, message: DebugNpcSetupMessage = {}) => {
        this.handleDebugSetupNpc(message);
      });

      this.onMessage("debugSavePlacements", (client, message: DebugPlacementSaveMessage = {}) => {
        void this.handleDebugSavePlacements(client, message);
      });

      this.onMessage("debugBeginPlacementSave", (client, message: DebugPlacementSaveBeginMessage = {}) => {
        this.handleDebugBeginPlacementSave(client, message);
      });

      this.onMessage("debugPlacementSaveChunk", (client, message: DebugPlacementSaveChunkMessage = {}) => {
        void this.handleDebugPlacementSaveChunk(client, message);
      });

    }

    this.onMessage("debugRequestPlacementMap", (client) => {
      void readDebugPlacementMap().then((document) => {
        client.send("debugPlacementMap", document);
      });
    });

    this.onMessage("chat", (client, message: { text?: string }) => {
      this.markAgentMessageActivity(client.sessionId, "chat");
      void this.handleChatMessage(client, message);
    });

    this.onMessage("shareQuestLink", (client, message: Partial<ClientShareQuestLink> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "shareQuestLink");
      this.handleShareQuestLink(client, message);
    });

    this.onMessage("emote", (client, message: Partial<ClientEmote> = {}) => {
      this.markAgentMessageActivity(client.sessionId, "emote");
      this.handleEmote(client, message);
    });

    this.onMessage("interact", (client, message: ClientInteract = {}) => {
      this.markAgentMessageActivity(client.sessionId, "interact");
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const now = Date.now();
      const lastInteract = this.lastInteractAt.get(client.sessionId) ?? 0;
      if (now - lastInteract < 750) return;
      this.lastInteractAt.set(client.sessionId, now);

      const npc = findInteractNpc(player, this.state.npcs, message?.npcId);
      if (!npc) return;

      if (!isNpcAlive(npc)) {
        if (npcHasLoot(npc)) {
          client.send("lootWindow", makeLootWindow(npc));
        }
        return;
      }

      npc.yaw = Math.atan2(player.x - npc.x, player.z - npc.z);
      npc.animation = "idle";

      const questInteraction = getNpcQuestInteraction(npc, player);
      if (questInteraction?.type === "offer") {
        client.send("questOffer", questInteraction.offer);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      if (questInteraction?.type === "turnIn") {
        client.send("questTurnIn", questInteraction.turnIn);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      if (questInteraction?.type === "status") {
        if (questInteraction.notice.questId === "ogre-raid-daily") {
          this.ensureDailyRaidBossForActiveQuest(player);
        }
        client.send("questStatus", questInteraction.notice);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      if (npc.id === FISHING_POND_STATUS_NPC_ID) {
        void this.sendFishingPondStatus(client, player, npc, now);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      const payload: ChatMessage = {
        sessionId: npc.id,
        name: npc.name,
        identityType: "npc",
        text: questInteraction?.type === "flavor"
          ? `${player.name}, ${questInteraction.text}`
          : getNpcDialogue(npc, player),
        sentAt: now,
      };
      this.broadcast("chat", payload);
      this.persistPlayerProgress(client.sessionId, player);
    });
  }

  async onJoin(client: Client, options?: JoinOptions) {
    const player = new PlayerState();
    const spawn = getSpawnPoint(this.state.players.size);
    const walletAddress = normalizeWalletAddress(options?.walletAddress);
    if (options?.identityType === "wallet" && !walletAddress) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "valid wallet address required");
    }
    const identityType = getIdentityType(options, walletAddress);
    const defaultName = getDefaultName(identityType, walletAddress, client.sessionId);
    const name = sanitizePlayerName(options?.name, defaultName);
    const requestedAvatarSeed = Number.isFinite(options?.avatarSeed)
      ? Number(options?.avatarSeed)
      : stableHash(`${client.sessionId}:${name}:${walletAddress}`);
    const avatarSeed = normalizeAvatarSeed(requestedAvatarSeed);
    const declaredAgent = identityType === "wallet" && isDeclaredAgentClient(options);
    const requestedClientKind = getRequestedWalletClientKind(options, walletAddress) || "human";
    const useLocalDebugWallet = identityType === "wallet" && isLocalDebugWalletAllowed(walletAddress);
    let replacementHandoff = identityType === "wallet" && walletAddress
      ? await this.replaceExistingWalletSession(client, walletAddress)
      : null;
    let persistedCharacter = identityType === "wallet" && walletAddress
      ? await loadPersistedCharacter(walletAddress, name, avatarSeed, {
        createIfMissing: Boolean(options?.createCharacter),
        referralWalletAddress: options?.referralWalletAddress ?? "",
        clientKind: requestedClientKind,
      })
      : null;
    if (identityType === "wallet" && !persistedCharacter && !useLocalDebugWallet) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "character creation required");
    }
    if (persistedCharacter && !replacementHandoff) {
      replacementHandoff = await this.replaceExistingCharacterSession(client, persistedCharacter.characterId);
      if (replacementHandoff) {
        persistedCharacter = await loadPersistedCharacter(walletAddress, name, avatarSeed, {
          createIfMissing: Boolean(options?.createCharacter),
          referralWalletAddress: options?.referralWalletAddress ?? "",
          clientKind: requestedClientKind,
        });
      }
    }

    player.name = persistedCharacter?.name ?? name;
    player.identityType = identityType;
    player.isAgent = declaredAgent;
    player.walletAddress = walletAddress;
    player.avatarSeed = persistedCharacter?.avatarSeed ?? avatarSeed;
    player.appearanceTraitsJson = player.isAgent
      ? JSON.stringify(normalizeAgentMferAppearanceTraits(persistedCharacter?.appearanceTraits ?? {}, {}))
      : JSON.stringify(persistedCharacter?.appearanceTraits ?? {});
    player.level = persistedCharacter?.level ?? 1;
    player.xp = persistedCharacter?.xp ?? 0;
    player.talentPoints = persistedCharacter?.talentPoints ?? 0;
    player.season0Points = persistedCharacter?.season0Points ?? 0;
    player.season0DailyPoints = persistedCharacter?.season0DailyPoints ?? 0;
    normalizePlayerProgression(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.x = spawn.x;
    player.y = 0;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    if (persistedCharacter) {
      applyPersistedCharacter(player, persistedCharacter);
      await this.reconcileOwnedChainGear(player);
      await recordWalletInviteUsage(walletAddress, options?.inviteCode ?? "", persistedCharacter.accountId);
      this.persistentCharacterIds.set(client.sessionId, persistedCharacter.characterId);
    }
    if (replacementHandoff) applySessionHandoff(player, replacementHandoff);
    normalizePlayerTalents(player);
    initializeCharacterEquipment(player);
    if (player.identityType === "guest") grantStarterConsumables(player);
    if (shouldSeedDebugTrashVendorStock()) grantDebugTrashVendorStock(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    const debugBoost = useLocalDebugWallet ? getLocalDebugAutoBoostMessage() : null;
    if (debugBoost) applyDebugBoostPlayer(player, debugBoost);

    this.state.players.set(client.sessionId, player);
    this.sessionJoinedAt.set(client.sessionId, Date.now());
    this.markAgentActivity(client.sessionId);
    if (player.isAgent) this.lastAgentActivityPosition.set(client.sessionId, { x: player.x, z: player.z });
    if (identityType === "wallet" && walletAddress) {
      await this.replaceDuplicateWalletSessions(client, walletAddress);
    }
    this.recordPlayerAnalyticsEvent("session_joined", client.sessionId, player, {
      level: player.level,
      isAgent: player.isAgent,
      persisted: Boolean(persistedCharacter),
      playerCount: this.state.players.size,
    });
    if (player.isAgent) {
      void this.notifyAgentSeason0GateStatus(client, player, "login").catch((error) => {
        console.error(`Failed to read agent MFERGPT earning gate for ${player.walletAddress}`, error);
      });
    }
    if (player.identityType === "wallet" && walletAddress) {
      void this.syncLatestFishingNftCatch(client, player).catch((error) => {
        console.error(`Failed to sync fishing NFT catch for ${walletAddress}`, error);
      });
    }
    if (persistedCharacter) {
      client.send("persistenceStatus", {
        state: "saved",
        message: "wallet progress saved",
      });
    } else if (useLocalDebugWallet) {
      client.send("persistenceStatus", {
        state: "saved",
        message: "local debug wallet",
      });
    }
    this.publishLiveMemoryStatus(Date.now(), true);
  }

  async onLeave(client: Client, consented?: boolean) {
    const player = this.state.players.get(client.sessionId);
    const characterId = this.persistentCharacterIds.get(client.sessionId);

    if (player && !consented) {
      const disconnectedAt = Date.now();
      this.preparePlayerForReconnect(client.sessionId, player);
      this.recordPlayerAnalyticsEvent("session_disconnected", client.sessionId, player, {
        level: player.level,
        reconnectGraceMs: RECONNECT_GRACE_PERIOD_SECONDS * 1000,
        playerCount: this.state.players.size,
        x: Math.round(player.x),
        z: Math.round(player.z),
      });

      const reconnection = this.allowReconnection(client, RECONNECT_GRACE_PERIOD_SECONDS);
      this.pendingReconnections.set(client.sessionId, reconnection);
      const reconnected = Promise.resolve(reconnection)
        .then(() => true, () => false)
        .finally(() => {
          if (this.pendingReconnections.get(client.sessionId) === reconnection) {
            this.pendingReconnections.delete(client.sessionId);
          }
        });
      await this.persistPlayerProgressNow(client.sessionId, player);

      const didReconnect = await reconnected;
      if (this.replacedReconnectionSessionIds.delete(client.sessionId)) return;

      if (didReconnect) {
        this.recordPlayerAnalyticsEvent("session_reconnected", client.sessionId, player, {
          awayMs: Math.max(0, Date.now() - disconnectedAt),
          level: player.level,
          playerCount: this.state.players.size,
          x: Math.round(player.x),
          z: Math.round(player.z),
        });
        return;
      }

      respawnPlayerAtFountain(player);
      this.deadSessionIds.delete(client.sessionId);
    }

    if (player) {
      this.recordPlayerAnalyticsEvent("session_left", client.sessionId, player, {
        durationMs: Math.max(0, Date.now() - (this.sessionJoinedAt.get(client.sessionId) ?? Date.now())),
        level: player.level,
        playerCount: Math.max(0, this.state.players.size - 1),
        reconnectTimedOut: !consented,
        x: Math.round(player.x),
        z: Math.round(player.z),
      });
      await this.persistPlayerProgressNow(client.sessionId, player);
    }
    this.cleanupPlayerSession(client.sessionId, characterId);
    this.publishLiveMemoryStatus(Date.now(), true);
  }

  private async replaceExistingWalletSession(client: Client, walletAddress: string) {
    const normalizedWallet = normalizeWalletAddress(walletAddress);
    if (!normalizedWallet) return null;

    for (const [sessionId, player] of this.state.players) {
      if (sessionId === client.sessionId) continue;
      if (player.identityType !== "wallet") continue;
      if (normalizeWalletAddress(player.walletAddress) !== normalizedWallet) continue;
      return this.replaceExistingPlayerSession(client, sessionId, player);
    }
    return null;
  }

  private async replaceExistingCharacterSession(client: Client, characterId: string) {
    if (!characterId) return null;

    for (const [sessionId, player] of this.state.players) {
      if (sessionId === client.sessionId) continue;
      if (this.persistentCharacterIds.get(sessionId) !== characterId) continue;
      return this.replaceExistingPlayerSession(client, sessionId, player);
    }
    return null;
  }

  private async replaceDuplicateWalletSessions(client: Client, walletAddress: string) {
    let replacedCount = 0;
    while (await this.replaceExistingWalletSession(client, walletAddress)) {
      replacedCount += 1;
    }
    if (replacedCount > 0) {
      console.warn(`Replaced ${replacedCount} duplicate wallet session${replacedCount === 1 ? "" : "s"} for ${walletAddress}`);
    }
  }

  private async replaceExistingPlayerSession(client: Client, sessionId: string, player: PlayerState): Promise<SessionHandoff> {
    const characterId = this.persistentCharacterIds.get(sessionId);
    const joinedAt = this.sessionJoinedAt.get(sessionId) ?? Date.now();
    const handoff = {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
    };
    const persistState = characterId ? makePersistableCharacterState(characterId, player) : null;
    const save = persistState && characterId
      ? this.queueCharacterSave(sessionId, characterId, persistState)
      : Promise.resolve(false);

    this.recordPlayerAnalyticsEvent("session_replaced", sessionId, player, {
      durationMs: Math.max(0, Date.now() - joinedAt),
      replacedBySessionId: client.sessionId,
      level: player.level,
      playerCount: Math.max(0, this.state.players.size - 1),
      x: Math.round(player.x),
      z: Math.round(player.z),
    });
    this.preparePlayerForReconnect(sessionId, player);
    this.state.players.delete(sessionId);
    this.persistentCharacterIds.delete(sessionId);

    const pendingReconnection = this.pendingReconnections.get(sessionId);
    if (pendingReconnection) {
      this.replacedReconnectionSessionIds.add(sessionId);
      this.pendingReconnections.delete(sessionId);
      pendingReconnection.reject(new Error("session replaced by newer login"));
    }

    const existingClient = this.clients.find((entry) => entry.sessionId === sessionId && entry !== client);
    if (existingClient) {
      existingClient.send("sessionReplaced", {
        message: "This wallet is now active in another tab or device.",
        replacementSessionId: client.sessionId,
      });
      existingClient.leave(SESSION_REPLACED_CLOSE_CODE, "session replaced by newer login");
    }

    await save;
    this.cleanupPlayerSession(sessionId);
    return handoff;
  }

  private preparePlayerForReconnect(sessionId: string, player: PlayerState) {
    player.verticalVelocity = 0;
    player.animation = "idle";
    clearPlayerEmote(player);
    clearPlayerCast(player);
    this.cancelFishing(sessionId, player);
    this.inputs.delete(sessionId);
    this.jumpHeld.set(sessionId, false);
    this.removePlayerThreat(sessionId);
  }

  private cleanupPlayerSession(sessionId: string, characterId?: string) {
    this.state.players.delete(sessionId);
    this.inputs.delete(sessionId);
    this.jumpHeld.delete(sessionId);
    this.lastChatAt.delete(sessionId);
    this.lastEmoteAt.delete(sessionId);
    this.lastMferGptAt.delete(sessionId);
    this.lastInteractAt.delete(sessionId);
    this.lastAgentActivityAt.delete(sessionId);
    this.lastAgentActivityPosition.delete(sessionId);
    this.persistentCharacterIds.delete(sessionId);
    this.agentSeason0GateStatuses.delete(sessionId);
    if (characterId) this.cleanupCharacterSaveTracking(characterId);
    this.sessionJoinedAt.delete(sessionId);
    this.deadSessionIds.delete(sessionId);
    this.pendingDebugPlacementSaves.delete(sessionId);
    this.fishingAttempts.delete(sessionId);
    this.pendingFishingLoot.delete(sessionId);
    for (const key of this.fishingNftCapNoticeAt.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.fishingNftCapNoticeAt.delete(key);
    }
    this.playerAnimationHolds.delete(sessionId);
    clearConsumableCooldownsForPlayer(this.consumableCooldowns, sessionId);
    this.removePlayerThreat(sessionId);
  }

  onDispose() {
    this.publishLiveMemoryStatus(Date.now(), true);
    activeTownRooms.delete(this);
  }

  getAdminSnapshot(now = Date.now()): AdminRoomSnapshot {
    return {
      roomId: this.roomId,
      roomName: ROOM_NAME,
      createdAt: this.roomCreatedAt,
      updatedAt: now,
      clients: this.clients.length,
      maxClients: this.maxClients,
      players: snapshotPlayers({
        players: this.state.players,
        persistentCharacterIds: this.persistentCharacterIds,
        sessionJoinedAt: this.sessionJoinedAt,
        inputs: this.inputs,
        lastChatAt: this.lastChatAt,
        lastInteractAt: this.lastInteractAt,
        lastAgentActivityAt: this.lastAgentActivityAt,
        deadSessionIds: this.deadSessionIds,
        now,
      }),
      npcs: snapshotNpcs(this.state.npcs),
    };
  }

  private publishLiveMemoryStatus(now = Date.now(), force = false) {
    if (!force && now - this.lastLiveMemoryStatusAt < 15_000) return;
    this.lastLiveMemoryStatusAt = now;

    let hostileNpcCount = 0;
    let temporaryNpcCount = 0;
    this.state.npcs.forEach((npc, npcId) => {
      if (this.temporaryNpcExpiresAt.has(npcId)) temporaryNpcCount += 1;
      if (isNpcAlive(npc) && getNpcDisposition(npc) === "hostile") hostileNpcCount += 1;
    });

    updateMferlandLiveStatus({
      roomId: this.roomId,
      playerCount: this.state.players.size,
      temporaryNpcCount,
      hostileNpcCount,
    });
  }

  private syncDailySignalHub(now = Date.now(), force = false) {
    if (!force && now - this.lastDailySignalHubSyncAt < 60_000) return;
    this.lastDailySignalHubSyncAt = now;

    const assignment = getActiveMferGptDailyQuestAssignment(now);
    if (this.dailySignalHubAssignmentId && this.dailySignalHubAssignmentId !== assignment.id) {
      clearMferGptDailyHub(this.state.npcs);
      this.npcDamageTags.delete(MFERGPT_DAILY_BOSS_NPC_ID);
      this.clearNpcThreat(MFERGPT_DAILY_BOSS_NPC_ID);
      this.dailySignalHubAssignmentId = "";
    }

    spawnOrUpdateMferGptDailyHub(this.state.npcs, assignment, now);
    this.dailySignalHubAssignmentId = assignment.id;
  }

  private async handleDebugSavePlacements(client: Client, message: DebugPlacementSaveMessage) {
    const placements = normalizeDebugPlacementRecordMap(message.placements);
    const incomingSourceDefaults = normalizeDebugPlacementRecordMap(message.sourceDefaults);
    await this.writeDebugPlacementMap(client, placements, incomingSourceDefaults);
  }

  private handleDebugBeginPlacementSave(client: Client, message: DebugPlacementSaveBeginMessage) {
    const saveId = normalizeDebugPlacementSaveId(message.saveId);
    const totalChunks = normalizeDebugPlacementChunkNumber(message.totalChunks, 1, 200);
    if (!saveId || !totalChunks) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Invalid placement save chunk header.",
      });
      return;
    }

    this.pendingDebugPlacementSaves.set(client.sessionId, {
      saveId,
      totalChunks,
      receivedChunks: new Set(),
      placements: {},
      sourceDefaults: {},
    });
  }

  private async handleDebugPlacementSaveChunk(client: Client, message: DebugPlacementSaveChunkMessage) {
    const saveId = normalizeDebugPlacementSaveId(message.saveId);
    const pending = this.pendingDebugPlacementSaves.get(client.sessionId);
    if (!saveId || !pending || pending.saveId !== saveId) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Placement save session was not ready.",
      });
      return;
    }

    const totalChunks = normalizeDebugPlacementChunkNumber(message.totalChunks, 1, 200);
    const chunkIndex = normalizeDebugPlacementChunkNumber(message.index ?? message.chunkIndex, 0, pending.totalChunks - 1);
    if (totalChunks !== pending.totalChunks || chunkIndex === null) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Invalid placement save chunk.",
      });
      this.pendingDebugPlacementSaves.delete(client.sessionId);
      return;
    }

    if (!pending.receivedChunks.has(chunkIndex)) {
      Object.assign(pending.placements, normalizeDebugPlacementRecordMap(message.placements));
      Object.assign(pending.sourceDefaults, normalizeDebugPlacementRecordMap(message.sourceDefaults));
      pending.receivedChunks.add(chunkIndex);
    }

    if (pending.receivedChunks.size < pending.totalChunks) return;

    this.pendingDebugPlacementSaves.delete(client.sessionId);
    await this.writeDebugPlacementMap(client, pending.placements, pending.sourceDefaults);
  }

  private async writeDebugPlacementMap(
    client: Client,
    placements: Record<string, DebugPlacementRecord>,
    incomingSourceDefaults: Record<string, DebugPlacementRecord>,
  ) {
    const placementCount = Object.keys(placements).length;
    if (placementCount === 0) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "No placement records to save.",
      });
      return;
    }

    try {
      const existing = await readDebugPlacementMap();
      const sourceDefaults: Record<string, DebugPlacementRecord> = {};
      for (const id of Object.keys(placements)) {
        sourceDefaults[id] = existing.sourceDefaults[id] ?? incomingSourceDefaults[id] ?? placements[id];
      }
      const savedAt = new Date().toISOString();
      const document = {
        version: 1,
        savedAt,
        sourceDefaults,
        placements,
      };
      await mkdir(dirname(DEBUG_PLACEMENT_MAP_PATH), { recursive: true });
      await writeFile(DEBUG_PLACEMENT_MAP_PATH, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      this.debugWorldPlacementOverrides = filterWorldDebugPlacements(placements);
      setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
      this.broadcast("debugPlacementMap", {
        placements,
        sourceDefaults,
      });
      client.send("debugPlacementSaveResult", {
        ok: true,
        path: DEBUG_PLACEMENT_MAP_PATH,
        savedAt,
        count: placementCount,
      });
    } catch (error) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save placement map.",
      });
    }
  }

  private async loadSavedDebugPlacementMap() {
    const saved = await readDebugPlacementMap();
    this.debugWorldPlacementOverrides = filterWorldDebugPlacements(saved.placements);
    setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
    applySavedDebugNpcPlacements(this.state.npcs, saved.placements);
  }

  private handleDebugSetWorldPlacement(message: DebugWorldPlacementMessage) {
    const targetId = typeof message.targetId === "string" ? message.targetId : "";
    if (!targetId || targetId.startsWith("npc:")) return;

    const placement = normalizeDebugPlacementRecord({
      x: message.x,
      z: message.z,
      rotation: message.rotation,
    });
    if (!placement) return;

    this.debugWorldPlacementOverrides = {
      ...this.debugWorldPlacementOverrides,
      [targetId]: placement,
    };
    setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
  }

  private handleDebugBoostPlayer(client: Client, message: DebugBoostPlayerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    applyDebugBoostPlayer(player, message);
  }

  private handleDebugSetupNpc(message: DebugNpcSetupMessage) {
    const npcId = typeof message.npcId === "string" ? message.npcId.trim().slice(0, 80) : "";
    if (!npcId || !/^[a-z0-9:_-]+$/i.test(npcId)) return;

    const x = Number(message.x);
    const z = Number(message.z);
    const yaw = Number(message.yaw);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    const health = normalizePositiveNumber(message.health);
    const maxHealth = normalizePositiveNumber(message.maxHealth) ?? health;
    const leashRadius = normalizePositiveNumber(message.leashRadius) ?? 14;
    const role = normalizeDebugNpcRole(message.role);
    const model = normalizeDebugNpcModel(message.model);
    const combatStyle = normalizeDebugNpcCombatStyle(message.combatStyle);
    const name = typeof message.name === "string" && message.name.trim()
      ? message.name.trim().slice(0, 48)
      : npcId.replace(/[-_:]+/g, " ");
    const dialogue = typeof message.dialogue === "string" && message.dialogue.trim()
      ? message.dialogue.trim().slice(0, 160)
      : "capture target";

    const existing = this.state.npcs.get(npcId);
    const npc = existing ?? spawnNpcFromSpec(this.state.npcs, {
      id: npcId,
      name,
      role,
      model,
      x,
      z,
      yaw: Number.isFinite(yaw) ? yaw : 0,
      leashRadius,
      health: maxHealth ?? health ?? 100,
      maxHealth: maxHealth ?? health ?? 100,
      isImmortal: Boolean(message.isImmortal),
      combatStyle,
      dialogue,
    });

    npc.name = name;
    npc.role = role;
    npc.model = model;
    npc.x = x;
    npc.y = 0;
    npc.z = z;
    npc.homeX = x;
    npc.homeZ = z;
    npc.targetX = x;
    npc.targetZ = z;
    npc.aggroOriginX = x;
    npc.aggroOriginZ = z;
    npc.isEvading = false;
    npc.yaw = Number.isFinite(yaw) ? yaw : npc.yaw;
    npc.leashRadius = leashRadius;
    npc.dialogue = dialogue;
    npc.combatStyle = combatStyle;
    npc.isImmortal = Boolean(message.isImmortal);
    npc.maxHealth = maxHealth ?? health ?? npc.maxHealth;
    npc.health = health ?? npc.maxHealth;
    npc.defeatedAt = 0;
    npc.despawnAt = 0;
    npc.respawnAt = 0;
    npc.attackReadyAt = 0;
    npc.shootReadyAt = 0;
    npc.frostNovaReadyAt = 0;
    npc.whirlwindReadyAt = 0;
    npc.multishotReadyAt = 0;
    npc.frozenUntil = 0;
    npc.slowedUntil = 0;
    npc.hasLoot = false;
    npc.loot.clear();
    npc.animation = "idle";
    npc.aggroTargetId = typeof message.aggroTargetId === "string" ? message.aggroTargetId : "";
    this.npcThreat.delete(npc.id);
    this.forcedNpcTargets.delete(npc.id);
  }

  private async handleChatMessage(client: Client, message: { text?: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const text = sanitizeChatText(message?.text);
    if (!text) return;

    const now = Date.now();
    const lastChat = this.lastChatAt.get(client.sessionId) ?? 0;
    if (now - lastChat < CHAT.minIntervalMs) return;
    this.lastChatAt.set(client.sessionId, now);

    const payload: ChatMessage = {
      sessionId: client.sessionId,
      name: player.name,
      identityType: player.identityType,
      text,
      sentAt: now,
    };
    this.broadcast("chat", payload);

    const progressedMferGptMentionQuest = progressMferGptMentionQuest(player, text);
    const progressedMferGptAskQuest = progressMferGptAskQuest(player, text);
    if (progressedMferGptMentionQuest || progressedMferGptAskQuest) {
      this.persistPlayerProgress(client.sessionId, player);
    }

    const prompt = getMferGptPrompt(text);
    if (!prompt) return;

    const lastMferGpt = this.lastMferGptAt.get(client.sessionId) ?? 0;
    if (now - lastMferGpt < MFERGPT.commandCooldownMs) {
      const waitSeconds = Math.ceil((MFERGPT.commandCooldownMs - (now - lastMferGpt)) / 1000);
      client.send("chat", makeMferGptChatMessage(`signal cooling off. try again in ${waitSeconds}s.`, Date.now()));
      this.logMferGptCommand(client.sessionId, player.name, "chat", false, "cooldown", 0, []);
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: "chat",
        status: "cooldown",
        latencyMs: 0,
      });
      recordMferlandMferGptCommand({
        command: "chat",
        status: "cooldown",
        temporaryNpcCount: 0,
      });
      return;
    }
    this.lastMferGptAt.set(client.sessionId, now);

    const startedAt = Date.now();
    try {
      const result = await handleMferGptPrompt({
        sessionId: client.sessionId,
        player,
        players: this.state.players,
        npcs: this.state.npcs,
        prompt,
        now: Date.now(),
      });
      for (const temporaryNpc of result.temporaryNpcs) {
        this.temporaryNpcExpiresAt.set(temporaryNpc.id, temporaryNpc.expiresAt);
      }
      this.broadcast("chat", makeMferGptChatMessage(result.responseText, Date.now()));
      this.logMferGptCommand(
        client.sessionId,
        player.name,
        result.command,
        true,
        "ok",
        Date.now() - startedAt,
        result.temporaryNpcs.map((npc) => npc.id),
      );
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: result.command,
        status: "ok",
        latencyMs: Date.now() - startedAt,
        temporaryNpcCount: result.temporaryNpcs.length,
      });
      recordMferlandMferGptCommand({
        command: result.command,
        status: "ok",
        temporaryNpcCount: result.temporaryNpcs.length,
      });
      this.publishLiveMemoryStatus(Date.now(), true);
      if (result.command === "hint") {
        this.recordPlayerAnalyticsEvent("mfergpt_hint_requested", client.sessionId, player, {
          status: "ok",
          progressedQuest: Boolean(progressedMferGptAskQuest),
        });
      }
    } catch (error) {
      client.send("chat", makeMferGptChatMessage("signal ate that one. try again in a sec.", Date.now()));
      console.error("mfergpt.command_failed", {
        sessionId: client.sessionId,
        playerName: player.name,
        latencyMs: Date.now() - startedAt,
        error,
      });
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: "unknown",
        status: "error",
        latencyMs: Date.now() - startedAt,
      });
      recordMferlandMferGptCommand({
        command: "chat",
        status: "error",
        temporaryNpcCount: 0,
      });
    }
  }

  private handleShareQuestLink(client: Client, message: Partial<ClientShareQuestLink>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !progressSocialQuest(player, questId)) return;

    this.persistPlayerProgress(client.sessionId, player);
    const turnInNpc = this.state.npcs.get(getQuestTurnInNpcId(questId));
    const quest = player.quests.get(questId);
    if (turnInNpc && quest?.status === "ready" && distanceToNpc(player, turnInNpc) <= 3.75) {
      client.send("questTurnIn", makeQuestTurnIn(questId, turnInNpc, quest));
    }
  }

  private handleEmote(client: Client, message: Partial<ClientEmote>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0 || player.castingAction) return;

    const emoteId = normalizeEmoteId(message?.emoteId);
    if (!emoteId) return;

    const now = Date.now();
    const lastEmote = this.lastEmoteAt.get(client.sessionId) ?? 0;
    if (now - lastEmote < EMOTE_MIN_INTERVAL_MS) return;
    this.lastEmoteAt.set(client.sessionId, now);

    const emote = EMOTES[emoteId];
    player.emote = emoteId;
    player.emoteStartedAt = now;
    player.emoteEndsAt = emote.durationMs > 0 ? now + emote.durationMs : 0;

    this.broadcast("chat", {
      sessionId: client.sessionId,
      name: player.name,
      identityType: player.identityType,
      text: emote.chatText,
      sentAt: now,
      kind: "emote",
    } satisfies ChatMessage);
    this.recordPlayerAnalyticsEvent("emote_used", client.sessionId, player, {
      emoteId,
      level: player.level,
    });
  }

  private handleCombatAction(client: Client, message: Partial<ClientCombatAction>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.health <= 0) return;
    const now = Date.now();
    if (player.frozenUntil > now) return;
    if (player.fishingState) this.cancelFishing(client.sessionId, player);
    clearPlayerEmote(player);

    const actionId = normalizeCombatActionId(message?.actionId);
    if (!actionId) return;
    const debugUnlockAllMoves = process.env.NODE_ENV !== "production" && message?.debugUnlockAllMoves === true;
    if (!isPlayerActionUnlocked(player, actionId, debugUnlockAllMoves)) return;

    const action = getPlayerActionConfig(player, actionId);
    if (player.castingAction) return;
    if (getActionReadyAt(player, actionId) > now) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) return;
    if (action.requiresStationary && !isPlayerStationary(player, this.inputs.get(client.sessionId), now)) return;

    if (actionId === "frostNova") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      applyFrostNova(
        client.sessionId,
        player,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    if (actionId === "whirlwind") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      applyWhirlwind(
        client.sessionId,
        player,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    if (actionId === "heal") {
      const healTarget = this.findHealTarget(player, message?.target, client.sessionId);
      if (!healTarget) return;
      const distance = this.distanceToHealTarget(player, healTarget);
      if (distance < action.minRange || distance > action.maxRange) return;
      if (healTarget.unit.health >= healTarget.unit.maxHealth) return;

      player.lastCastAt = now;
      if (healTarget.id !== client.sessionId || healTarget.kind !== "player") {
        player.yaw = Math.atan2(healTarget.unit.x - player.x, healTarget.unit.z - player.z);
      }
      applyPlayerUniversalCooldown(player, now);
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = healTarget.kind;
      player.castTargetId = healTarget.id;
      return;
    }

    const target = findCombatTarget(this.state.npcs, message?.target);
    if (!target) return;
    if (!isNpcAlive(target)) return;

    const distance = distanceToNpc(player, target);
    if (distance < action.minRange || distance > action.maxRange) return;

    player.yaw = Math.atan2(target.x - player.x, target.z - player.z);

    if (actionId === "taunt") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      this.forceNpcTarget(client.sessionId, target, now);
      this.broadcast("combatEvent", makeNpcUtilityEvent(client.sessionId, player, target, actionId, now));
      return;
    }

    if (action.castTimeMs > 0) {
      player.lastCastAt = now;
      applyPlayerUniversalCooldown(player, now);
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = "npc";
      player.castTargetId = target.id;
      return;
    }

    setActionReadyAt(player, actionId, now + action.cooldownMs);
    applyPlayerUniversalCooldown(player, now);
    player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
    player.lastCastAt = now;
    aggroNeutralNpcOnPlayerAttackStart(target, client.sessionId, player);
    if (actionId === "multishot") {
      applyMultishot(
        client.sessionId,
        player,
        target,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    const damage = getPlayerActionDamage(player, actionId);
    applyCombatDamage(
      client.sessionId,
      player,
      target,
      actionId,
      damage,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
      (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
      (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
      (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
    );
  }

  private updatePlayerHealCast(sessionId: string, player: PlayerState, activeInput: TrackedInput | null, now: number) {
    const action = getPlayerActionConfig(player, "heal");
    if (action.requiresStationary && !isPlayerStationary(player, activeInput ?? undefined, now)) {
      clearPlayerCast(player);
      return;
    }
    if (now < player.castEndsAt) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) {
      clearPlayerCast(player);
      return;
    }

    const healTarget = this.findHealTarget(player, { kind: player.castTargetKind, id: player.castTargetId }, sessionId);
    if (!healTarget || this.distanceToHealTarget(player, healTarget) > action.maxRange) {
      clearPlayerCast(player);
      return;
    }
    if (healTarget.unit.health >= healTarget.unit.maxHealth) {
      clearPlayerCast(player);
      return;
    }

    const healing = getPlayerHealingAmount(player, "heal");
    player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
    setActionReadyAt(player, "heal", now + action.cooldownMs);
    applyPlayerUniversalCooldown(player, now);
    player.lastCastAt = now;
    const appliedHealing = applyUnitHealing(
      sessionId,
      player,
      healTarget.kind,
      healTarget.id,
      healTarget.unit,
      "heal",
      healing,
      now,
      (event) => this.broadcast("combatEvent", event),
    );
    this.addHealingThreat(sessionId, healTarget.unit, appliedHealing, now);
    clearPlayerCast(player);
  }

  private findHealTarget(player: PlayerState, target: unknown, fallbackSessionId: string): HealTarget | null {
    if (!target || typeof target !== "object") {
      return { kind: "player", id: fallbackSessionId, unit: player };
    }

    const maybeTarget = target as { kind?: unknown; id?: unknown };
    if (typeof maybeTarget.id !== "string") {
      return { kind: "player", id: fallbackSessionId, unit: player };
    }

    if (maybeTarget.kind === "player") {
      const targetPlayer = this.state.players.get(maybeTarget.id);
      if (!targetPlayer || targetPlayer.health <= 0) return null;
      return { kind: "player", id: maybeTarget.id, unit: targetPlayer };
    }

    if (maybeTarget.kind === "npc") {
      const npc = this.state.npcs.get(maybeTarget.id);
      if (!npc || !isNpcAlive(npc) || !this.isHealableNpc(npc)) return null;
      return { kind: "npc", id: npc.id, unit: npc };
    }

    return { kind: "player", id: fallbackSessionId, unit: player };
  }

  private distanceToHealTarget(player: PlayerState, target: HealTarget) {
    return Math.hypot(player.x - target.unit.x, player.z - target.unit.z);
  }

  private isHealableNpc(npc: NpcState) {
    return getNpcDisposition(npc) !== "hostile";
  }

  private addNpcThreat(sourceId: string, npc: NpcState, actionId: CombatActionId, amount: number, now: number) {
    if (!sourceId || !isNpcAlive(npc) || npc.isImmortal || npc.isEvading) return;

    const table = this.npcThreat.get(npc.id) ?? new Map<string, number>();
    const threat = this.getThreatValue(actionId, amount);
    table.set(sourceId, (table.get(sourceId) ?? 0) + threat);
    this.npcThreat.set(npc.id, table);

    const player = this.state.players.get(sourceId);
    if (player?.health && !npc.aggroTargetId) {
      npc.aggroTargetId = sourceId;
      npc.aggroOriginX = npc.x;
      npc.aggroOriginZ = npc.z;
      npc.isEvading = false;
      npc.nextDecisionAt = 0;
    }
    if (actionId === "taunt") {
      this.forcedNpcTargets.set(npc.id, { sessionId: sourceId, until: now + COMBAT.actions.taunt.forceMs });
      if (!npc.aggroTargetId) {
        npc.aggroOriginX = npc.x;
        npc.aggroOriginZ = npc.z;
      }
      npc.aggroTargetId = sourceId;
      npc.isEvading = false;
      npc.nextDecisionAt = 0;
    }
  }

  private getThreatValue(actionId: CombatActionId, amount: number) {
    if (actionId === "attack") return amount + COMBAT.actions.attack.threatBonus;
    if (actionId === "whirlwind") return amount + COMBAT.actions.whirlwind.threatBonus;
    if (actionId === "taunt") return COMBAT.actions.taunt.threat;
    return Math.max(0, amount);
  }

  private forceNpcTarget(sourceId: string, npc: NpcState, now: number) {
    const table = this.npcThreat.get(npc.id) ?? new Map<string, number>();
    let highestThreat = 0;
    table.forEach((threat) => {
      highestThreat = Math.max(highestThreat, threat);
    });
    table.set(sourceId, Math.max(table.get(sourceId) ?? 0, highestThreat + COMBAT.actions.taunt.threat));
    this.npcThreat.set(npc.id, table);
    this.addNpcThreat(sourceId, npc, "taunt", COMBAT.actions.taunt.threat, now);
  }

  private addHealingThreat(sourceId: string, healedUnit: Pick<PlayerState | NpcState, "x" | "z">, effectiveHealing: number, now: number) {
    if (effectiveHealing <= 0) return;

    const healingThreat = effectiveHealing * COMBAT.actions.heal.threatMultiplier;
    this.state.npcs.forEach((npc) => {
      if (!isNpcAlive(npc) || npc.isImmortal) return;
      const table = this.npcThreat.get(npc.id);
      const isEngaged = Boolean(npc.aggroTargetId || table?.size);
      if (!isEngaged) return;
      const distance = Math.hypot(npc.x - healedUnit.x, npc.z - healedUnit.z);
      if (distance > COMBAT.actions.heal.threatRadius) return;
      this.addNpcThreat(sourceId, npc, "heal", healingThreat, now);
    });
  }

  private applyThreatTargets(now: number) {
    this.state.npcs.forEach((npc) => {
      if (!isNpcAlive(npc) || npc.isImmortal || npc.isEvading) {
        this.npcThreat.delete(npc.id);
        this.forcedNpcTargets.delete(npc.id);
        return;
      }

      const forcedTarget = this.forcedNpcTargets.get(npc.id);
      if (forcedTarget) {
        const player = this.state.players.get(forcedTarget.sessionId);
        if (now < forcedTarget.until && this.isThreatTargetEligible(npc, player)) {
          if (!npc.aggroTargetId) {
            npc.aggroOriginX = npc.x;
            npc.aggroOriginZ = npc.z;
          }
          npc.aggroTargetId = forcedTarget.sessionId;
          npc.nextDecisionAt = 0;
          return;
        }
        this.forcedNpcTargets.delete(npc.id);
      }

      const table = this.npcThreat.get(npc.id);
      if (!table?.size) return;

      let highestSessionId = "";
      let highestThreat = 0;
      for (const [sessionId, threat] of table) {
        const player = this.state.players.get(sessionId);
        if (!this.isThreatTargetEligible(npc, player)) {
          table.delete(sessionId);
          continue;
        }
        if (threat > highestThreat) {
          highestThreat = threat;
          highestSessionId = sessionId;
        }
      }

      if (!highestSessionId) {
        this.npcThreat.delete(npc.id);
        return;
      }

      const currentThreat = npc.aggroTargetId ? table.get(npc.aggroTargetId) ?? 0 : 0;
      const shouldSwitch = !npc.aggroTargetId || highestSessionId === npc.aggroTargetId || highestThreat >= currentThreat * 1.15 + 8;
      if (shouldSwitch && npc.aggroTargetId !== highestSessionId) {
        if (!npc.aggroTargetId) {
          npc.aggroOriginX = npc.x;
          npc.aggroOriginZ = npc.z;
        }
        npc.aggroTargetId = highestSessionId;
        npc.nextDecisionAt = 0;
      }
    });
  }

  private isThreatTargetEligible(npc: NpcState, player: PlayerState | undefined) {
    if (!player || player.health <= 0) return false;
    return Math.hypot(player.x - npc.aggroOriginX, player.z - npc.aggroOriginZ) <= Math.max(npc.leashRadius + 8, PLAYER_ATTACK_PULL_LEASH_RANGE);
  }

  private clearNpcThreat(npcId: string) {
    this.npcThreat.delete(npcId);
    this.forcedNpcTargets.delete(npcId);
  }

  private removePlayerThreat(sessionId: string) {
    for (const table of this.npcThreat.values()) {
      table.delete(sessionId);
    }
    for (const [npcId, forcedTarget] of this.forcedNpcTargets) {
      if (forcedTarget.sessionId === sessionId) this.forcedNpcTargets.delete(npcId);
    }
  }

  private handleEquipItem(client: Client, message: Partial<ClientEquipItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const itemId = normalizeItemId(message?.itemId);
    if (!itemId) return;
    if (!equipInventoryItem(player, itemId, message?.chainTokenId)) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleUnequipItem(client: Client, message: Partial<ClientUnequipItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const slotId = normalizeEquipmentSlotId(message?.slot);
    if (!slotId) return;
    if (!unequipPlayerSlot(player, slotId)) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleDebugRegisterChainGear(client: Client, message: Partial<ClientDebugRegisterChainGear>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const gearType = Number(message.gearType);
    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!Number.isInteger(gearType)) return;
    if (!registerChainGearItem(player, gearType, tokenId, normalizeChainGearTier(message.tier))) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private async handleRegisterChainGear(client: Client, message: Partial<ClientRegisterChainGear>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.identityType !== "wallet" || !player.walletAddress) {
      client.send("chat", makeSystemChat("Chain Gear", "Connect the owning wallet before registering chain gear."));
      return;
    }

    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!tokenId) {
      client.send("chat", makeSystemChat("Chain Gear", "Missing gear token id."));
      return;
    }

    try {
      const verified = await verifyChainGearOwnership({ tokenId, walletAddress: player.walletAddress });
      if (!verified) {
        client.send("chat", makeSystemChat("Chain Gear", `Could not verify gear token #${tokenId} for this wallet.`));
        return;
      }

      const requestedGearType = Number(message.gearType);
      if (Number.isInteger(requestedGearType) && requestedGearType > 0 && requestedGearType !== verified.gearType) {
        client.send("chat", makeSystemChat("Chain Gear", `Gear token #${verified.tokenId} is type ${verified.gearType}, not ${requestedGearType}.`));
        return;
      }

      if (!registerChainGearItem(player, verified.gearType, verified.tokenId, verified.tier)) {
        client.send("chat", makeSystemChat("Chain Gear", `Verified token #${verified.tokenId}, but this gear type is not in the game catalog yet.`));
        return;
      }

      this.recordPlayerAnalyticsEvent("chain_gear_registered", client.sessionId, player, {
        gearType: verified.gearType,
        tokenId: verified.tokenId,
        tier: verified.tier,
        chainId: verified.chainId,
        txHash: typeof message.txHash === "string" ? message.txHash.slice(0, 80) : "",
      });
      this.persistPlayerProgress(client.sessionId, player);
      client.send("chat", makeSystemChat("Chain Gear", `Verified gear token #${verified.tokenId} and added it to your inventory.`));
    } catch (error) {
      console.warn("chain_gear.verify_failed", error);
      client.send("chat", makeSystemChat("Chain Gear", "Chain gear verification is temporarily unavailable."));
    }
  }

  private async handlePurchasePotionShopItem(client: Client, message: Partial<ClientPurchasePotionShopItem>) {
    const player = this.state.players.get(client.sessionId);
    const itemId = isPotionShopItemId(message?.itemId) ? message.itemId : "";
    const itemName = itemId ? ITEMS[itemId].name : "";
    const quantity = isPotionShopPurchaseQuantity(message?.quantity) ? message.quantity : 1;
    const price = getPotionShopPrice(quantity, itemId || undefined);
    const sendResult = (result: Omit<PotionShopPurchaseResult, "itemId" | "itemName" | "quantity" | "count" | "paymentAmountWei" | "chainId"> & Partial<PotionShopPurchaseResult>) => {
      client.send("potionShopPurchaseResult", {
        ok: result.ok,
        itemId,
        itemName,
        quantity,
        count: result.count ?? 0,
        paymentAmountWei: result.paymentAmountWei ?? price.amountWei,
        chainId: result.chainId ?? 0,
        txHash: result.txHash,
        error: result.error,
      } satisfies PotionShopPurchaseResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }
    if (!itemId) {
      sendResult({ ok: false, error: "pick a valid item" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    if (player.identityType !== "wallet" || !player.walletAddress || !characterId) {
      this.recordPlayerAnalyticsEvent("potion_shop_purchase_failed", client.sessionId, player, {
        supportKind: "potion_shop_purchase",
        npcId: POTION_SHOP_NPC_ID,
        itemId,
        itemName,
        quantity,
        stage: "preflight",
        error: "wallet character required",
      });
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    const npc = this.state.npcs.get(POTION_SHOP_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? POTION_SHOP_NPC_ID,
      npcName: npc?.name ?? "potion mfer",
      npcDistance,
    };

    this.recordPlayerAnalyticsEvent("potion_shop_purchase_attempted", client.sessionId, player, {
      supportKind: "potion_shop_purchase",
      ...npcAnalytics,
      itemId,
      itemName,
      quantity,
      priceLabel: price.label,
      expectedPaymentAmountWei: price.amountWei,
      ...summarizeMferGptPaymentProof(message?.payment),
    });

    let verifiedPayment: VerifiedPotionShopPayment;
    try {
      verifiedPayment = await verifyPotionShopPaymentProof(message?.payment, player.walletAddress, quantity, itemId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "payment verification failed";
      this.recordPlayerAnalyticsEvent("potion_shop_purchase_failed", client.sessionId, player, {
        supportKind: "potion_shop_purchase",
        ...npcAnalytics,
        itemId,
        itemName,
        quantity,
        stage: "payment_verification",
        error: errorMessage,
        ...summarizeMferGptPaymentProof(message?.payment),
      });
      sendResult({ ok: false, error: errorMessage });
      return;
    }

    const inventoryKey = getInventoryItemKey(itemId);
    const previousItem = player.inventory.get(inventoryKey);
    const previousCount = previousItem?.count ?? 0;
    addInventoryItem(player, itemId, quantity);
    const nextCount = player.inventory.get(inventoryKey)?.count ?? 0;
    const persisted = await this.queueCharacterSave(
      client.sessionId,
      characterId,
      makePersistableCharacterState(characterId, player),
      undefined,
      (state) => saveCharacterProgressWithCryptoPurchase(state, {
        ...verifiedPayment,
        productId: POTION_SHOP_PRODUCT_ID,
        tokenId: getPotionShopLedgerTokenId(itemId, quantity),
        paymentToken: "MFERGPT",
        note: `potion mfer ${itemName} x${quantity}`,
      }),
    );

    if (!persisted) {
      if (previousItem) previousItem.count = previousCount;
      else player.inventory.delete(inventoryKey);
      this.recordPlayerAnalyticsEvent("potion_shop_purchase_failed", client.sessionId, player, {
        supportKind: "potion_shop_purchase",
        ...npcAnalytics,
        itemId,
        itemName,
        quantity,
        stage: "save",
        error: "wallet progress failed to save",
        ...summarizeVerifiedMferGptPayment(verifiedPayment),
      });
      sendResult({
        ok: false,
        error: "wallet progress failed to save; retry before reloading",
        paymentAmountWei: verifiedPayment.amountWei,
        chainId: verifiedPayment.chainId,
        txHash: verifiedPayment.txHash,
      });
      return;
    }

    this.recordPlayerAnalyticsEvent("potion_shop_purchase_confirmed", client.sessionId, player, {
      supportKind: "potion_shop_purchase",
      ...npcAnalytics,
      itemId,
      itemName,
      quantity,
      count: nextCount,
      productId: POTION_SHOP_PRODUCT_ID,
      ...summarizeVerifiedMferGptPayment(verifiedPayment),
    });
    sendResult({
      ok: true,
      count: nextCount,
      paymentAmountWei: verifiedPayment.amountWei,
      chainId: verifiedPayment.chainId,
      txHash: verifiedPayment.txHash,
    });
  }

  private async handlePurchaseFishingSupply(client: Client, message: Partial<ClientPurchaseFishingSupply>) {
    const player = this.state.players.get(client.sessionId);
    const itemId = FISHING_CHUM_ITEM_ID;
    const itemName = ITEMS[itemId].name;
    const price = getFishingSupplyPrice();
    const sendResult = (result: Omit<FishingSupplyPurchaseResult, "itemId" | "itemName" | "count" | "paymentAmountWei" | "chainId"> & Partial<FishingSupplyPurchaseResult>) => {
      client.send("fishingSupplyPurchaseResult", {
        ok: result.ok,
        itemId,
        itemName,
        count: result.count ?? 0,
        paymentAmountWei: result.paymentAmountWei ?? price.amountWei,
        chainId: result.chainId ?? 0,
        txHash: result.txHash,
        error: result.error,
      } satisfies FishingSupplyPurchaseResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }

    const fishinLesson = player.quests.get("fishin-lesson");
    if (fishinLesson?.status !== "completed") {
      sendResult({ ok: false, error: "finish Motherfisher's lesson first" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    if (player.identityType !== "wallet" || !player.walletAddress || !characterId) {
      this.recordPlayerAnalyticsEvent("fishing_supply_purchase_failed", client.sessionId, player, {
        supportKind: "fishing_supply_purchase",
        npcId: FISHING_TUTOR_NPC_ID,
        itemId,
        itemName,
        stage: "preflight",
        error: "wallet character required",
      });
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    const npc = this.state.npcs.get(FISHING_TUTOR_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? FISHING_TUTOR_NPC_ID,
      npcName: npc?.name ?? "Motherfisher",
      npcDistance,
    };

    this.recordPlayerAnalyticsEvent("fishing_supply_purchase_started", client.sessionId, player, {
      supportKind: "fishing_supply_purchase",
      ...npcAnalytics,
      itemId,
      itemName,
      priceLabel: price.label,
      expectedPaymentAmountWei: price.amountWei,
      ...summarizeMferGptPaymentProof(message?.payment),
    });

    let verifiedPayment: VerifiedFishingSupplyPayment;
    try {
      verifiedPayment = await verifyFishingSupplyPaymentProof(message?.payment, player.walletAddress);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "payment verification failed";
      this.recordPlayerAnalyticsEvent("fishing_supply_purchase_failed", client.sessionId, player, {
        supportKind: "fishing_supply_purchase",
        ...npcAnalytics,
        itemId,
        itemName,
        stage: "payment_verification",
        error: errorMessage,
        ...summarizeMferGptPaymentProof(message?.payment),
      });
      sendResult({ ok: false, error: errorMessage });
      return;
    }

    const inventoryKey = getInventoryItemKey(itemId);
    const previousItem = player.inventory.get(inventoryKey);
    const previousCount = previousItem?.count ?? 0;
    addInventoryItem(player, itemId, 1);
    const nextCount = player.inventory.get(inventoryKey)?.count ?? 0;
    const persisted = await this.queueCharacterSave(
      client.sessionId,
      characterId,
      makePersistableCharacterState(characterId, player),
      undefined,
      (state) => saveCharacterProgressWithCryptoPurchase(state, {
        ...verifiedPayment,
        productId: FISHING_SUPPLY_PRODUCT_ID,
        tokenId: getFishingSupplyLedgerTokenId(),
        paymentToken: "MFERGPT",
        note: `Motherfisher ${itemName}`,
      }),
    );

    if (!persisted) {
      if (previousItem) previousItem.count = previousCount;
      else player.inventory.delete(inventoryKey);
      this.recordPlayerAnalyticsEvent("fishing_supply_purchase_failed", client.sessionId, player, {
        supportKind: "fishing_supply_purchase",
        ...npcAnalytics,
        itemId,
        itemName,
        stage: "save",
        error: "wallet progress failed to save",
        ...summarizeVerifiedMferGptPayment(verifiedPayment),
      });
      sendResult({
        ok: false,
        error: "wallet progress failed to save; retry before reloading",
        paymentAmountWei: verifiedPayment.amountWei,
        chainId: verifiedPayment.chainId,
        txHash: verifiedPayment.txHash,
      });
      return;
    }

    this.recordPlayerAnalyticsEvent("fishing_supply_purchase_confirmed", client.sessionId, player, {
      supportKind: "fishing_supply_purchase",
      ...npcAnalytics,
      itemId,
      itemName,
      count: nextCount,
      productId: FISHING_SUPPLY_PRODUCT_ID,
      ...summarizeVerifiedMferGptPayment(verifiedPayment),
    });
    sendResult({
      ok: true,
      count: nextCount,
      paymentAmountWei: verifiedPayment.amountWei,
      chainId: verifiedPayment.chainId,
      txHash: verifiedPayment.txHash,
    });
  }

  private async handlePurchaseOnchainFishingRod(client: Client, _message: Partial<ClientPurchaseOnchainFishingRod>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: Partial<OnchainFishingRodMintResult> & Pick<OnchainFishingRodMintResult, "ok">) => {
      client.send("onchainFishingRodMintResult", {
        ok: result.ok,
        walletNft: result.walletNft ?? null,
        chainId: result.chainId ?? 0,
        contractAddress: result.contractAddress ?? "",
        paymentAmountWei: result.paymentAmountWei ?? "0",
        paymentRequired: false,
        paymentTxHash: result.paymentTxHash,
        mintTxHash: result.mintTxHash,
        alreadyOwned: result.alreadyOwned,
        error: result.error,
      } satisfies OnchainFishingRodMintResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (player.identityType !== "wallet" || !walletAddress || !characterId) {
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    const npc = this.state.npcs.get(FISHING_TUTOR_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? FISHING_TUTOR_NPC_ID,
      npcName: npc?.name ?? "Motherfisher",
      npcDistance,
    };

    let config;
    try {
      config = await resolveOnchainFishingRodConfig();
      const currentRod = await readOnchainFishingRodWalletNft(walletAddress, config);
      const baseResult = {
        chainId: config.chainId,
        contractAddress: config.contractAddress,
        paymentAmountWei: "0",
        paymentRequired: false,
      };
      if (currentRod) {
        sendResult({ ok: true, ...baseResult, walletNft: currentRod, alreadyOwned: true });
        await this.syncFishingNftHistory(client, player);
        return;
      }
      if (!config.enabled) {
        sendResult({ ok: false, ...baseResult, error: "rod minting unavailable" });
        return;
      }
      if (config.mintMode !== "server" || !config.adminMintEnabled) {
        sendResult({ ok: false, ...baseResult, error: config.mintUrl ? "use the wallet mint link" : "wallet mint required" });
        return;
      }
      if (config.standard !== "ERC721") {
        sendResult({ ok: false, ...baseResult, error: "in-game rod mint supports ERC-721 rods only" });
        return;
      }

      this.recordPlayerAnalyticsEvent("onchain_fishing_rod_mint_started", client.sessionId, player, {
        supportKind: "onchain_fishing_rod_mint",
        ...npcAnalytics,
        productId: ONCHAIN_FISHING_ROD_PRODUCT_ID,
        mintMode: config.mintMode,
      });

      const minted = await mintOnchainFishingRodForWallet(walletAddress, config);

      client.send("chat", makeSystemChat("Fishing", minted.alreadyOwned ? "Onchain fishing rod already in wallet." : "Onchain fishing rod minted."));
      this.recordPlayerAnalyticsEvent("onchain_fishing_rod_mint_confirmed", client.sessionId, player, {
        supportKind: "onchain_fishing_rod_mint",
        ...npcAnalytics,
        productId: ONCHAIN_FISHING_ROD_PRODUCT_ID,
        mintTxHash: minted.txHash,
        alreadyOwned: minted.alreadyOwned,
      });
      sendResult({
        ok: true,
        ...baseResult,
        walletNft: minted.walletNft,
        mintTxHash: minted.txHash || undefined,
        alreadyOwned: minted.alreadyOwned,
      });
      await this.syncFishingNftHistory(client, player);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "rod mint failed";
      this.recordPlayerAnalyticsEvent("onchain_fishing_rod_mint_failed", client.sessionId, player, {
        supportKind: "onchain_fishing_rod_mint",
        ...npcAnalytics,
        stage: "mint",
        error: errorMessage,
      });
      sendResult({
        ok: false,
        chainId: config?.chainId ?? 0,
        contractAddress: config?.contractAddress ?? "",
        paymentAmountWei: "0",
        paymentRequired: false,
        error: errorMessage,
      });
    }
  }

  private handleStartFishing(client: Client, message: Partial<ClientStartFishing>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: Partial<FishingResult> & Pick<FishingResult, "ok" | "outcome">) => {
      client.send("fishingResult", {
        ok: result.ok,
        attemptId: result.attemptId ?? player?.fishingAttemptId ?? "",
        outcome: result.outcome,
        itemId: result.itemId ?? "",
        itemName: result.itemName ?? "",
        quantity: result.quantity ?? 0,
        nftCatch: result.nftCatch,
        error: result.error,
      } satisfies FishingResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, outcome: "missed", error: "player unavailable" });
      return;
    }
    const now = Date.now();
    if (message?.zoneId && message.zoneId !== FISHING_ZONE_ID) {
      sendResult({ ok: false, outcome: "missed", error: "unknown fishing water" });
      return;
    }
    if (player.frozenUntil > now) {
      sendResult({ ok: false, outcome: "missed", error: "frozen" });
      return;
    }
    if (player.castingAction || player.fishingState) {
      sendResult({ ok: false, outcome: "missed", error: "already busy" });
      return;
    }
    if (!this.playerHasFishingPole(player)) {
      sendResult({ ok: false, outcome: "missed", error: "fishing pole required" });
      return;
    }
    if (!isNearFishingZone(player.x, player.z)) {
      sendResult({ ok: false, outcome: "missed", error: "get closer to south center pond" });
      return;
    }
    if (!isPlayerStationary(player, this.inputs.get(client.sessionId), now)) {
      sendResult({ ok: false, outcome: "missed", error: "stand still to cast" });
      return;
    }

    const bobber = getFishingBobberPosition(player);
    const attemptId = makeFishingAttemptId(client.sessionId);
    const biteAt = now + FISHING_CAST_MS + randomInt(FISHING_BITE_MIN_MS, FISHING_BITE_MAX_MS);
    const expiresAt = biteAt + FISHING_BITE_WINDOW_MS;
    const pendingLoot = this.pendingFishingLoot.get(client.sessionId);
    if (pendingLoot) {
      this.pendingFishingLoot.delete(client.sessionId);
      client.send("closeLootWindow", { npcId: pendingLoot.sourceId });
    }
    this.fishingAttempts.set(client.sessionId, {
      attemptId,
      zoneId: FISHING_ZONE_ID,
      castAt: now,
      biteAt,
      expiresAt,
    });

    clearPlayerEmote(player);
    clearPlayerCast(player);
    this.playerAnimationHolds.delete(client.sessionId);
    player.fishingAttemptId = attemptId;
    player.fishingZoneId = FISHING_ZONE_ID;
    player.fishingState = "casting";
    player.fishingCastAt = now;
    player.fishingBiteAt = biteAt;
    player.fishingExpiresAt = expiresAt;
    player.fishingBobberX = bobber.x;
    player.fishingBobberZ = bobber.z;
    player.animation = "fishCast";
    syncPlayerFishingJson(player);

    this.recordPlayerAnalyticsEvent("fishing_started", client.sessionId, player, {
      supportKind: "fishing",
      zoneId: FISHING_ZONE_ID,
      x: Math.round(player.x * 10) / 10,
      z: Math.round(player.z * 10) / 10,
      bobberX: Math.round(bobber.x * 10) / 10,
      bobberZ: Math.round(bobber.z * 10) / 10,
      isAgent: player.isAgent,
    });
    client.send("chat", makeSystemChat("Fishing", "Cast landed. Watch the bobber and reel when it jiggles."));
    void this.maybeSendDailyFishingRodNotice(client, player, now);
  }

  private async handleReelFishing(client: Client, message: Partial<ClientReelFishing>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: Partial<FishingResult> & Pick<FishingResult, "ok" | "outcome">) => {
      client.send("fishingResult", {
        ok: result.ok,
        attemptId: result.attemptId ?? player?.fishingAttemptId ?? "",
        outcome: result.outcome,
        itemId: result.itemId ?? "",
        itemName: result.itemName ?? "",
        quantity: result.quantity ?? 0,
        nftCatch: result.nftCatch,
        error: result.error,
      } satisfies FishingResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, outcome: "missed", error: "player unavailable" });
      return;
    }
    const attempt = this.fishingAttempts.get(client.sessionId);
    if (!attempt || !player.fishingAttemptId) {
      sendResult({ ok: false, outcome: "missed", error: "nothing to reel" });
      return;
    }
    if (message?.attemptId && message.attemptId !== attempt.attemptId) {
      sendResult({ ok: false, outcome: "missed", attemptId: attempt.attemptId, error: "old bobber" });
      return;
    }

    const now = Date.now();
    if (now < attempt.biteAt) {
      this.cancelFishing(client.sessionId, player);
      this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
        supportKind: "fishing",
        outcome: "too_early",
        isAgent: player.isAgent,
      });
      return;
    }
    if (now > attempt.expiresAt) {
      const attemptId = attempt.attemptId;
      this.cancelFishing(client.sessionId, player);
      this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
        supportKind: "fishing",
        outcome: "expired",
        isAgent: player.isAgent,
      });
      sendResult({ ok: true, outcome: "expired", attemptId });
      return;
    }

    const attemptId = attempt.attemptId;
    const questItemId = shouldCatchLostFishingShoe(player) && Math.random() < 0.1
      ? FISHING_LOST_SHOE_ITEM_ID
      : null;
    this.cancelFishing(client.sessionId, player, "fishReel");

    if (!questItemId) {
      const nftCatch = await this.tryCreateFishingNftCatch(client, player, attemptId, now);
      if (nftCatch) {
        this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
          supportKind: "fishing",
          outcome: "nft",
          catchId: nftCatch.catchId,
          standard: nftCatch.standard,
          collection: nftCatch.collection,
          tokenId: nftCatch.tokenId,
          pondEntryId: nftCatch.pondEntryId,
          isAgent: player.isAgent,
        });
        client.send("chat", makeSystemChat("Fishing", "You hooked an onchain pond prize. Claim it with your wallet before the voucher expires."));
        client.send("fishingNftCatchResult", { ok: true, catch: nftCatch } satisfies FishingNftCatchResult);
        sendResult({
          ok: true,
          outcome: "nft",
          attemptId,
          itemName: "onchain pond prize",
          quantity: 1,
          nftCatch,
        });
        return;
      }
    }

    if (!questItemId && player.isAgent && Math.random() >= FISHING_AGENT_CATCH_CHANCE_MULTIPLIER) {
      this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
        supportKind: "fishing",
        outcome: "missed",
        agentCatchPenalty: true,
        isAgent: player.isAgent,
      });
      sendResult({ ok: true, outcome: "missed", attemptId });
      return;
    }

    const rareChanceMultiplier = getFishingRareChanceMultiplier(player, now);
    const rareChanceScale = player.isAgent ? FISHING_AGENT_RARE_CHANCE_MULTIPLIER : 1;
    const itemId = questItemId ?? rollFishingCatch(Math.random, rareChanceMultiplier, rareChanceScale);
    if (!itemId) {
      this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
        supportKind: "fishing",
        outcome: "missed",
        isAgent: player.isAgent,
      });
      sendResult({ ok: true, outcome: "missed", attemptId });
      return;
    }

    const item = ITEMS[itemId];
    const outcome = isFishingSellableItemId(itemId) ? "caught" : "junk";
    const sourceId = makeFishingLootSourceId(attemptId);
    const lootReadyAt = now + FISHING_REEL_ANIMATION_MS;
    this.pendingFishingLoot.set(client.sessionId, {
      sourceId,
      attemptId,
      itemId,
      count: 1,
      createdAt: now,
      readyAt: lootReadyAt,
      expiresAt: lootReadyAt + FISHING_LOOT_PICKUP_MS,
      windowSentAt: 0,
      chatMessage: getFishingLootChatMessage(itemId, item.name),
    });
    this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
      supportKind: "fishing",
      outcome,
      itemId,
      itemName: item.name,
      isAgent: player.isAgent,
    });
    sendResult({
      ok: true,
      outcome,
      attemptId,
      itemId,
      itemName: item.name,
      quantity: 1,
    });
  }

  private async tryCreateFishingNftCatch(client: Client, player: PlayerState, attemptId: string, now: number) {
    const debugGate = process.env.MFERLAND_DEBUG_FISHING_NFT_GATE === "1";
    const logDebugGate = (reason: string, details: Record<string, unknown> = {}) => {
      if (!debugGate) return;
      console.info("fishing_nft_gate", {
        reason,
        sessionId: client.sessionId,
        player: player.name,
        walletAddress: player.walletAddress,
        identityType: player.identityType,
        isAgent: player.isAgent,
        attemptId,
        ...details,
      });
    };
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (!walletAddress) {
      logDebugGate("missing_wallet");
      return null;
    }

    try {
      const config = await resolveFishingPondConfig();
      if (!config.enabled || config.catchChanceBps <= 0) {
        logDebugGate("config_disabled", {
          enabled: config.enabled,
          catchChanceBps: config.catchChanceBps,
          contractAddress: config.contractAddress,
          hasDatabase: Boolean(getDatabase()),
        });
        return null;
      }

      const activeRecord = await this.resolveActiveFishingNftCatch(walletAddress, now);
      const activeSnapshot = makeFishingNftCatchSnapshot(activeRecord);
      if (activeSnapshot) {
        logDebugGate("active_catch_exists", {
          catchId: activeSnapshot.catchId,
          status: activeSnapshot.status,
          expiresAt: activeSnapshot.expiresAt,
        });
        syncPlayerFishingNftCatchJson(player, activeSnapshot);
        client.send("fishingNftCatchResult", { ok: true, catch: activeSnapshot } satisfies FishingNftCatchResult);
        await this.syncFishingNftHistory(client, player);
        return null;
      }

      const effectiveCatchChanceBps = Math.floor(
        config.catchChanceBps * (player.isAgent ? FISHING_AGENT_NFT_CHANCE_MULTIPLIER : 1),
      );
      const roll = cryptoRandomInt(10_000);
      if (effectiveCatchChanceBps <= 0 || roll >= effectiveCatchChanceBps) {
        logDebugGate("chance_missed", {
          catchChanceBps: config.catchChanceBps,
          effectiveCatchChanceBps,
          roll,
        });
        return null;
      }

      const publicConfig = await readFishingPondPublicConfig(walletAddress);
      if (!publicConfig.enabled || publicConfig.drainMode || !publicConfig.stocked) {
        logDebugGate("public_config_unavailable", {
          enabled: publicConfig.enabled,
          drainMode: publicConfig.drainMode,
          stocked: publicConfig.stocked,
          walletDailyRemaining: publicConfig.walletDailyRemaining,
          globalDailyRemaining: publicConfig.globalDailyRemaining,
        });
        return null;
      }
      if (publicConfig.walletDailyRemaining <= 0) {
        logDebugGate("wallet_daily_cap", {
          walletDailyRemaining: publicConfig.walletDailyRemaining,
          perWalletDailyCap: publicConfig.perWalletDailyCap,
        });
        const dailyResetAt = getFishingNftDailyResetAt(now);
        this.sendFishingNftCapNotice(
          client,
          `wallet:${walletAddress}`,
          now,
          {
            kind: "wallet_daily_cap",
            text: "No more onchain goodies today. Regular fish are still biting.",
            sentAt: now,
            dailyResetAt,
            perWalletDailyCap: publicConfig.perWalletDailyCap,
            walletDailyRemaining: publicConfig.walletDailyRemaining,
            globalDailyCap: publicConfig.globalDailyCap,
            globalDailyRemaining: publicConfig.globalDailyRemaining,
          },
        );
        return null;
      }
      if (publicConfig.globalDailyRemaining !== null && publicConfig.globalDailyRemaining <= 0) {
        logDebugGate("global_daily_cap", {
          globalDailyRemaining: publicConfig.globalDailyRemaining,
          globalDailyCap: publicConfig.globalDailyCap,
        });
        const dailyResetAt = getFishingNftDailyResetAt(now);
        this.sendFishingNftCapNotice(
          client,
          "global",
          now,
          {
            kind: "global_daily_cap",
            text: "The pond is out of onchain goodies today. Regular fish are still biting.",
            sentAt: now,
            dailyResetAt,
            perWalletDailyCap: publicConfig.perWalletDailyCap,
            walletDailyRemaining: publicConfig.walletDailyRemaining,
            globalDailyCap: publicConfig.globalDailyCap,
            globalDailyRemaining: publicConfig.globalDailyRemaining,
          },
        );
        return null;
      }

      const rodRequirement = publicConfig.rodRequirement ?? await readOnchainFishingRodRequirement(walletAddress);
      if (!isOnchainFishingRodRequirementSatisfied(rodRequirement)) {
        logDebugGate("rod_required_nft_hit", {
          chainId: rodRequirement.chainId,
          contractAddress: rodRequirement.contractAddress,
          standard: rodRequirement.standard,
          tokenId: rodRequirement.tokenId,
          error: rodRequirement.error,
        });
        this.sendFishingNftCapNotice(
          client,
          `rod-hit:${walletAddress}:${attemptId}`,
          now,
          {
            kind: "rod_required_nft_hit",
            text: `That cast rolled an onchain goodie, but this wallet does not hold the ${rodRequirement.label}. Regular fish are still biting.`,
            sentAt: now,
            dailyResetAt: getFishingNftDailyResetAt(now),
            perWalletDailyCap: publicConfig.perWalletDailyCap,
            walletDailyRemaining: publicConfig.walletDailyRemaining,
            globalDailyCap: publicConfig.globalDailyCap,
            globalDailyRemaining: publicConfig.globalDailyRemaining,
            rodRequirement,
          },
        );
        return null;
      }

      const entries = await readFishingPondAvailableEntries(config);
      if (entries.length <= 0) {
        logDebugGate("no_entries");
        return null;
      }

      const candidateEntries = [...entries];
      while (candidateEntries.length > 0) {
        const entry = selectWeightedFishingPondEntry(candidateEntries);
        if (!entry) break;
        const entryIndex = candidateEntries.findIndex((candidate) => candidate.pondEntryId === entry.pondEntryId);
        if (entryIndex >= 0) candidateEntries.splice(entryIndex, 1);

        const catchId = makeFishingNftCatchId();
        const voucher = await makeFishingPondClaimVoucher({
          catchId,
          fisher: walletAddress,
          entry,
          now,
        });
        const metadata = await readFishingPondEntryMetadata(entry, config);
        const record = await createFishingPondCatchRecord({
          catchId,
          characterId: this.persistentCharacterIds.get(client.sessionId) ?? "",
          walletAddress,
          attemptId,
          voucher,
          entryRemainingAmount: entry.remainingAmount,
          walletDailyCap: publicConfig.perWalletDailyCap,
          globalDailyCap: publicConfig.globalDailyCap,
          metadata,
        });
        const snapshot = makeFishingNftCatchSnapshot(record);
        logDebugGate("created", {
          catchId,
          pondEntryId: entry.pondEntryId,
          standard: entry.standard,
          tokenId: entry.tokenId,
          remainingAmount: entry.remainingAmount,
          snapshotCreated: Boolean(snapshot),
        });
        if (!snapshot) continue;
        syncPlayerFishingNftCatchJson(player, snapshot);
        await this.syncFishingNftHistory(client, player);
        return snapshot;
      }
      logDebugGate("snapshot_unavailable");
      return null;
    } catch (error) {
      logDebugGate("error", {
        error: error instanceof Error ? error.message : "unknown fishing pond error",
      });
      this.recordPlayerAnalyticsEvent("fishing_reel", client.sessionId, player, {
        supportKind: "fishing",
        outcome: "nft_unavailable",
        error: error instanceof Error ? error.message : "unknown fishing pond error",
        isAgent: player.isAgent,
      });
      return null;
    }
  }

  private async maybeSendDailyFishingRodNotice(client: Client, player: PlayerState, now: number) {
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (!walletAddress) return;

    try {
      const rodRequirement = await readOnchainFishingRodRequirement(walletAddress);
      if (isOnchainFishingRodRequirementSatisfied(rodRequirement)) return;

      const publicConfig = await readFishingPondPublicConfig(walletAddress).catch(() => null);
      this.sendFishingRodRequiredNotice(client, walletAddress, now, {
        kind: "rod_required",
        text: `Regular fish are still biting. Hold an ${rodRequirement.label} in this wallet to unlock onchain goodie catches.`,
        sentAt: now,
        dailyResetAt: getFishingNftDailyResetAt(now),
        perWalletDailyCap: publicConfig?.perWalletDailyCap ?? FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
        walletDailyRemaining: publicConfig?.walletDailyRemaining ?? FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
        globalDailyCap: publicConfig?.globalDailyCap ?? FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
        globalDailyRemaining: publicConfig?.globalDailyRemaining ?? FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
        rodRequirement,
      });
    } catch {
      // The reminder should never interrupt ordinary fishing.
    }
  }

  private sendFishingRodRequiredNotice(
    client: Client,
    walletAddress: string,
    now: number,
    notice: FishingNftCapNotice,
  ) {
    const day = getFishingNftDay(now);
    const dailyKey = `${walletAddress}:${day}`;
    if (this.fishingNftRodDailyNoticeKeys.has(dailyKey)) return;
    this.fishingNftRodDailyNoticeKeys.add(dailyKey);
    this.pruneFishingRodDailyNoticeKeys(day);
    this.sendFishingNftCapNotice(client, `rod:${dailyKey}`, now, notice);
  }

  private pruneFishingRodDailyNoticeKeys(currentDay: number) {
    if (this.fishingNftRodDailyNoticeKeys.size < 1000) return;
    for (const key of this.fishingNftRodDailyNoticeKeys) {
      const day = Number(key.split(":").pop());
      if (day !== currentDay) this.fishingNftRodDailyNoticeKeys.delete(key);
    }
  }

  private sendFishingNftCapNotice(client: Client, noticeKey: string, now: number, notice: FishingNftCapNotice) {
    const mapKey = `${client.sessionId}:${noticeKey}`;
    const lastSentAt = this.fishingNftCapNoticeAt.get(mapKey) ?? 0;
    if (now - lastSentAt < FISHING_NFT_CAP_NOTICE_COOLDOWN_MS) return;
    this.fishingNftCapNoticeAt.set(mapKey, now);
    client.send("chat", makeSystemChat("Fishing", notice.text));
    client.send("fishingNftCapNotice", notice);
    const player = this.state.players.get(client.sessionId);
    this.recordPlayerAnalyticsEvent("fishing_nft_notice_sent", client.sessionId, player, {
      supportKind: "fishing_nft_notice",
      noticeKind: notice.kind,
      resetAt: notice.dailyResetAt,
      perPlayerDailyCap: notice.perWalletDailyCap,
      playerDailyRemaining: notice.walletDailyRemaining,
      globalDailyCap: notice.globalDailyCap,
      globalDailyRemaining: notice.globalDailyRemaining,
      rodRequired: notice.rodRequirement?.required,
      rodOwned: notice.rodRequirement?.walletOwnsRod,
      rodChainId: notice.rodRequirement?.chainId,
      rodStandard: notice.rodRequirement?.standard,
      rodContractAddress: notice.rodRequirement?.contractAddress,
      rodMintMode: notice.rodRequirement?.mintMode,
    });
  }

  private async syncLatestFishingNftCatch(client: Client, player: PlayerState) {
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (!walletAddress) return;

    const record = await this.resolveActiveFishingNftCatch(walletAddress, Date.now());
    if (!record) {
      syncPlayerFishingNftCatchJson(player, null);
      await this.syncFishingNftHistory(client, player);
      return;
    }

    const snapshot = makeFishingNftCatchSnapshot(record);
    syncPlayerFishingNftCatchJson(player, snapshot);
    if (snapshot) {
      client.send("fishingNftCatchResult", { ok: true, catch: snapshot } satisfies FishingNftCatchResult);
    }
    await this.syncFishingNftHistory(client, player);
  }

  private async resolveActiveFishingNftCatch(walletAddress: string, now: number) {
    const record = await findLatestActiveFishingPondCatchForWallet(walletAddress);
    if (!record) return null;

    const expiresAt = record.expiresAt.getTime();
    const shouldExpire = record.status === "tx_submitted"
      ? expiresAt + FISHING_NFT_TX_SUBMISSION_GRACE_MS <= now
      : expiresAt <= now;
    if (!shouldExpire) return record;

    return await markFishingPondCatchExpired(record.catchId);
  }

  private async sendFishingPondStatus(client: Client, player: PlayerState, npc: NpcState, now: number) {
    const text = await this.buildFishingPondStatusText(player, now).catch(() => (
      makeFishingPondDefaultStatusText(now, "i couldn't read the live ledger, but the default daily setup is")
    ));
    client.send("chat", {
      sessionId: npc.id,
      name: npc.name,
      identityType: "npc",
      text: `${player.name}, ${text}`,
      sentAt: now,
    } satisfies ChatMessage);
  }

  private async buildFishingPondStatusText(player: PlayerState, now: number) {
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (!walletAddress) {
      const resetAt = getFishingNftDailyResetAt(now);
      return `connect a wallet for your exact onchain-goodie count. daily cap is ${FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP}, global cap is ${FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP}, and reset is ${formatFishingPondUtcReset(resetAt)} (${formatFishingPondResetCountdown(resetAt, now)}).`;
    }

    const config = await readFishingPondPublicConfig(walletAddress);
    if (!config.enabled) {
      return `${makeFishingPondDefaultStatusText(now, "today's onchain-goodie setup is")}. pond awards are offline right now.`;
    }

    const activeRecord = await this.resolveActiveFishingNftCatch(walletAddress, now);
    const used = Math.max(0, config.perWalletDailyCap - config.walletDailyRemaining);
    const resetAt = getFishingNftDailyResetAt(now);
    const parts = [
      `you've used ${used}/${config.perWalletDailyCap} onchain-goodie catches today`,
      `${config.walletDailyRemaining} NFT catch${config.walletDailyRemaining === 1 ? "" : "es"} left`,
      `resets at ${formatFishingPondUtcReset(resetAt)} (${formatFishingPondResetCountdown(resetAt, now)})`,
    ];

    if (config.globalDailyRemaining !== null) {
      parts.push(`global pond: ${config.globalDailyRemaining}/${config.globalDailyCap} left today`);
    }
    if (activeRecord) {
      parts.push(`you have a ${formatFishingPondCatchStatus(activeRecord.status)} catch waiting on wallet action`);
    }
    if (config.drainMode) {
      parts.push("pond is draining, so no new onchain goodies right now");
    } else if (!config.stocked) {
      parts.push("pond has no eligible onchain goodies stocked right now");
    }

    return `${parts.join(". ")}.`;
  }

  private async syncFishingNftHistory(client: Client, player: PlayerState) {
    const walletAddress = normalizeWalletAddress(player.walletAddress);
    if (!walletAddress) return;

    try {
      const records = await findFishingPondCatchHistoryForWallet(walletAddress, 20);
      const catches = records
        .map(makeFishingNftCatchSnapshot)
        .filter((snapshot): snapshot is FishingNftCatchSnapshot => Boolean(snapshot))
        .map(sanitizeFishingNftCatchSnapshotForState);
      const rodRequirement = await readOnchainFishingRodRequirement(walletAddress).catch(() => undefined);
      const walletNfts = (await Promise.all([
        readOnchainFishingRodWalletNft(walletAddress).catch(() => null),
      ])).filter((snapshot): snapshot is FishingWalletNftSnapshot => Boolean(snapshot));
      client.send("fishingNftHistoryResult", { ok: true, catches, walletNfts, rodRequirement } satisfies FishingNftHistoryResult);
    } catch (error) {
      console.error(`Failed to sync fishing NFT history for ${walletAddress}`, error);
      client.send("fishingNftHistoryResult", {
        ok: false,
        catches: [],
        error: "pond history unavailable",
      } satisfies FishingNftHistoryResult);
    }
  }

  private async handleSubmitFishingNftClaimTx(client: Client, message: Partial<ClientSubmitFishingNftClaimTx>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: FishingNftCatchResult) => client.send("fishingNftCatchResult", result);
    if (!player) {
      sendResult({ ok: false, catch: null, error: "player unavailable" });
      return;
    }

    const catchId = typeof message.catchId === "string" ? message.catchId.trim().toLowerCase() : "";
    const txHash = typeof message.txHash === "string" ? message.txHash.trim().toLowerCase() : "";
    const record = await findFishingPondCatch(catchId);
    if (!record || normalizeWalletAddress(record.walletAddress) !== normalizeWalletAddress(player.walletAddress)) {
      sendResult({ ok: false, catch: null, error: "catch not found" });
      return;
    }
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(record), error: "claim transaction hash required" });
      return;
    }
    if (record.status === "confirmed") {
      const snapshot = makeFishingNftCatchSnapshot(record);
      syncPlayerFishingNftCatchJson(player, snapshot);
      sendResult({ ok: true, catch: snapshot });
      await this.syncFishingNftHistory(client, player);
      return;
    }

    const submitted = await markFishingPondCatchTxSubmitted(catchId, txHash);
    if (submitted) {
      const submittedSnapshot = makeFishingNftCatchSnapshot(submitted);
      syncPlayerFishingNftCatchJson(player, submittedSnapshot);
      sendResult({ ok: true, catch: submittedSnapshot });
      await this.syncFishingNftHistory(client, player);
    }

    try {
      const confirmation = await verifyFishingPondClaimReceipt({ catchId, txHash });
      if (normalizeWalletAddress(confirmation.fisher) !== normalizeWalletAddress(player.walletAddress)) {
        throw new Error("claim event fisher mismatch");
      }
      const confirmed = await markFishingPondCatchConfirmed(catchId, confirmation.txHash);
      const snapshot = confirmed ? makeFishingNftCatchSnapshot(confirmed) : null;
      syncPlayerFishingNftCatchJson(player, snapshot);
      client.send("chat", makeSystemChat("Fishing", "Onchain pond prize claimed."));
      sendResult({ ok: true, catch: snapshot });
      await this.syncFishingNftHistory(client, player);
      this.recordPlayerAnalyticsEvent("fishing_nft_claim_confirmed", client.sessionId, player, {
        supportKind: "fishing_nft_claim",
        catchId,
        txHash,
        pondEntryId: confirmation.pondEntryId,
        logIndex: confirmation.logIndex,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "claim confirmation failed";
      if (/timeout|timed out|not found|could not find/i.test(messageText)) {
        const snapshot = submitted ? makeFishingNftCatchSnapshot(submitted) : makeFishingNftCatchSnapshot(record);
        syncPlayerFishingNftCatchJson(player, snapshot);
        sendResult({ ok: true, catch: snapshot, error: "waiting for claim confirmation" });
        await this.syncFishingNftHistory(client, player);
        return;
      }

      const failed = await markFishingPondCatchFailed(catchId, messageText);
      const snapshot = failed ? makeFishingNftCatchSnapshot(failed) : null;
      syncPlayerFishingNftCatchJson(player, snapshot);
      sendResult({ ok: false, catch: snapshot, error: messageText });
      await this.syncFishingNftHistory(client, player);
      this.recordPlayerAnalyticsEvent("fishing_nft_claim_failed", client.sessionId, player, {
        supportKind: "fishing_nft_claim",
        catchId,
        txHash,
        error: messageText,
      });
    }
  }

  private async handleAbandonFishingNftCatch(client: Client, message: Partial<ClientAbandonFishingNftCatch>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: FishingNftCatchResult) => client.send("fishingNftCatchResult", result);
    if (!player) {
      sendResult({ ok: false, catch: null, error: "player unavailable" });
      return;
    }

    const catchId = typeof message.catchId === "string" ? message.catchId.trim().toLowerCase() : "";
    const record = await findFishingPondCatch(catchId);
    if (!record || normalizeWalletAddress(record.walletAddress) !== normalizeWalletAddress(player.walletAddress)) {
      sendResult({ ok: false, catch: null, error: "catch not found" });
      return;
    }
    if (record.status === "tx_submitted") {
      const snapshot = makeFishingNftCatchSnapshot(record);
      syncPlayerFishingNftCatchJson(player, snapshot);
      sendResult({ ok: false, catch: snapshot, error: "claim transaction already submitted" });
      await this.syncFishingNftHistory(client, player);
      return;
    }
    if (record.status !== "pending" && record.status !== "voucher_issued") {
      const snapshot = makeFishingNftCatchSnapshot(record);
      syncPlayerFishingNftCatchJson(player, snapshot);
      sendResult({ ok: true, catch: snapshot });
      await this.syncFishingNftHistory(client, player);
      return;
    }

    const abandoned = await markFishingPondCatchAbandoned(catchId);
    if (!abandoned) {
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(record), error: "claim offer could not be forfeited" });
      return;
    }

    syncPlayerFishingNftCatchJson(player, null);
    client.send("chat", makeSystemChat("Fishing", "Onchain goodie offer passed. It still counts for today's pond limit."));
    sendResult({ ok: true, catch: null });
    await this.syncFishingNftHistory(client, player);
    this.recordPlayerAnalyticsEvent("fishing_nft_claim_abandoned", client.sessionId, player, {
      supportKind: "fishing_nft_claim",
      catchId,
      pondEntryId: abandoned.pondEntryId,
      status: abandoned.status,
    });
  }

  private async handleSubmitMintClubRedemptionTx(client: Client, message: Partial<ClientSubmitMintClubRedemptionTx>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: MintClubRedemptionResult) => client.send("mintClubRedemptionResult", result);
    if (!player) {
      sendResult({ ok: false, catch: null, error: "player unavailable" });
      return;
    }

    const catchId = typeof message.catchId === "string" ? message.catchId.trim().toLowerCase() : "";
    const txHash = typeof message.txHash === "string" ? message.txHash.trim().toLowerCase() : "";
    const requestedStatus = message.status === "confirmed" ? "confirmed" : "tx_submitted";
    const record = await findFishingPondCatch(catchId);
    if (!record || normalizeWalletAddress(record.walletAddress) !== normalizeWalletAddress(player.walletAddress)) {
      sendResult({ ok: false, catch: null, error: "catch not found" });
      return;
    }
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(record), error: "redemption transaction hash required" });
      return;
    }
    if (record.status !== "confirmed") {
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(record), error: "claim the pond NFT first" });
      return;
    }

    const config = resolveMintClubRedemptionConfig();
    if (!isMintClubRedemptionEligibleCatch(record, config)) {
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(record), error: "not an onchain goodies item" });
      return;
    }
    if (record.mintClubRedemptionStatus === "confirmed") {
      sendResult({ ok: true, catch: makeFishingNftCatchSnapshot(record) });
      await this.syncFishingNftHistory(client, player);
      return;
    }

    const submitted = await markFishingPondCatchMintClubRedemption({
      catchId,
      txHash,
      status: "tx_submitted",
    });
    if (requestedStatus !== "confirmed") {
      sendResult({ ok: true, catch: makeFishingNftCatchSnapshot(submitted) });
      await this.syncFishingNftHistory(client, player);
      return;
    }

    try {
      const confirmation = await verifyMintClubRedemptionReceipt({ txHash, record, config });
      const confirmed = await markFishingPondCatchMintClubRedemption({
        catchId,
        txHash: confirmation.txHash,
        status: "confirmed",
      });
      client.send("chat", makeSystemChat("Fishing", "Onchain goodie sold through Mint Club."));
      sendResult({ ok: true, catch: makeFishingNftCatchSnapshot(confirmed) });
      await this.syncFishingNftHistory(client, player);
      this.recordPlayerAnalyticsEvent("mint_club_redemption_confirmed", client.sessionId, player, {
        supportKind: "mint_club_redemption",
        catchId,
        txHash,
        collection: record.collection,
        amountBurned: confirmation.amountBurned,
        refundAmount: confirmation.refundAmount,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Mint Club redemption confirmation failed";
      if (/timeout|timed out|not found|could not find/i.test(messageText)) {
        sendResult({ ok: true, catch: makeFishingNftCatchSnapshot(submitted), error: "waiting for redemption confirmation" });
        await this.syncFishingNftHistory(client, player);
        return;
      }

      const failed = await markFishingPondCatchMintClubRedemptionFailed(catchId, messageText);
      sendResult({ ok: false, catch: makeFishingNftCatchSnapshot(failed), error: messageText });
      await this.syncFishingNftHistory(client, player);
      this.recordPlayerAnalyticsEvent("mint_club_redemption_failed", client.sessionId, player, {
        supportKind: "mint_club_redemption",
        catchId,
        txHash,
        collection: record.collection,
        error: messageText,
      });
    }
  }

  private async handleSellFishingItems(client: Client, message: Partial<ClientSellFishingItems>) {
    const player = this.state.players.get(client.sessionId);
    const selectedItemId = isFishingSellableItemId(message?.itemId) ? message.itemId : null;
    const sellAll = message?.sellAll === true;
    const sendResult = (result: Partial<FishingVendorSellResult> & Pick<FishingVendorSellResult, "ok">) => {
      client.send("fishingVendorSellResult", {
        ok: result.ok,
        status: result.status ?? (result.ok ? "sold" : "error"),
        sold: result.sold ?? [],
        quantity: result.quantity ?? 0,
        points: result.points ?? 0,
        season0Points: result.season0Points ?? player?.season0Points ?? 0,
        season0DailyPoints: result.season0DailyPoints ?? player?.season0DailyPoints ?? 0,
        mferGptGate: result.mferGptGate,
        error: result.error,
      } satisfies FishingVendorSellResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }
    if (!sellAll && !selectedItemId) {
      sendResult({ ok: false, error: "pick a fish" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    const useLocalDebugWallet = isLocalDebugWalletAllowed(player.walletAddress);
    if (player.identityType !== "wallet" || !player.walletAddress || (!characterId && !useLocalDebugWallet)) {
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    const fishMongerQuest = player.quests.get("lost-fishing-shoes");
    if (fishMongerQuest?.status !== "completed") {
      sendResult({ ok: false, error: "fish monger needs his fishing shoes first" });
      return;
    }

    const npc = this.state.npcs.get(FISHING_VENDOR_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? FISHING_VENDOR_NPC_ID,
      npcName: npc?.name ?? "fish monger",
      npcDistance,
    };
    if (!npc || npcDistance === null || npcDistance > LOOT.interactRange) {
      this.recordPlayerAnalyticsEvent("fishing_vendor_sell_failed", client.sessionId, player, {
        supportKind: "fishing_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        stage: "preflight",
        error: "fish monger too far",
      });
      sendResult({ ok: false, error: "fish monger too far" });
      return;
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - player.season0DailyPoints);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - player.season0Points);
    const pointCapacity = Math.min(remainingDaily, remainingSeason);
    const requestedQuantity = sellAll
      ? Number.MAX_SAFE_INTEGER
      : normalizeFishingSellQuantity(message?.quantity);
    const sale = planFishingSale(player, {
      itemId: selectedItemId,
      requestedQuantity,
      pointCapacity,
      isAgent: player.isAgent,
    });
    if (sale.quantity <= 0) {
      const availableQuantity = getSellableFishingItemCount(player, selectedItemId);
      sendResult({
        ok: false,
        error: selectedItemId && availableQuantity > 0
          ? getFishingSaleBlockedMessage(selectedItemId, player.isAgent)
          : "no fish in stash",
      });
      return;
    }

    let season0MferGptGate: AgentSeason0MferGptGateStatus | undefined;
    if (sale.points > 0 && !useLocalDebugWallet) {
      season0MferGptGate = player.isAgent
        ? await this.notifyAgentSeason0GateStatus(client, player, "fishing_vendor")
        : await getAgentSeason0MferGptGateStatus(player.walletAddress);
      if (season0MferGptGate && !season0MferGptGate.eligible) {
        this.recordPlayerAnalyticsEvent("fishing_vendor_sell_failed", client.sessionId, player, {
          supportKind: "fishing_vendor_sell",
          ...npcAnalytics,
          itemId: selectedItemId ?? "",
          stage: player.isAgent ? "agent_token_gate" : "season0_mfergpt_gate",
          error: "mfergpt gate required",
          mferGptGateEligible: season0MferGptGate.eligible,
          mferGptGateReason: season0MferGptGate.reason,
          mferGptGateRequiredWei: season0MferGptGate.requiredWei,
          mferGptGateBalanceWei: season0MferGptGate.balanceWei,
        });
        client.send("chat", makeSystemChat(
          player.isAgent ? "Agent Rewards" : "Season 0",
          player.isAgent
            ? makeAgentSeason0MferGptGateMessage(season0MferGptGate)
            : makeSeason0MferGptGateMessage(season0MferGptGate),
        ));
        sendResult({
          ok: false,
          status: "mfergpt_gate",
          sold: sale.sold,
          quantity: sale.quantity,
          points: sale.points,
          error: "25M MFERGPT required for Season 0 points",
          mferGptGate: season0MferGptGate,
        });
        return;
      }
    }
    const agentTokenGate = player.isAgent ? season0MferGptGate : undefined;

    this.recordPlayerAnalyticsEvent("fishing_vendor_sell_started", client.sessionId, player, {
      supportKind: "fishing_vendor_sell",
      ...npcAnalytics,
      itemId: selectedItemId ?? "",
      sellAll,
      quantity: sale.quantity,
      points: sale.points,
      isAgent: player.isAgent,
      agentBundleMultiplier: player.isAgent ? FISHING_AGENT_BUNDLE_MULTIPLIER : 1,
      mferGptGateEligible: season0MferGptGate?.eligible,
      mferGptGateReason: season0MferGptGate?.reason,
    });

    const previousInventory = snapshotInventoryState(player);
    applyFishingSale(player, sale.removals);
    const soldLabel = formatFishingSoldSummary(sale.sold);
    if (!characterId && useLocalDebugWallet) {
      player.season0Points += sale.points;
      player.season0DailyPoints += sale.points;
      this.recordPlayerAnalyticsEvent("fishing_vendor_sell_confirmed", client.sessionId, player, {
        supportKind: "fishing_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        sellAll,
        quantity: sale.quantity,
        points: sale.points,
        isAgent: player.isAgent,
        dailyTotal: player.season0DailyPoints,
        seasonTotal: player.season0Points,
        localDebug: true,
      });
      client.send("chat", makeSystemChat(
        sale.points > 0 ? "Season points" : "Fishing",
        `Sold ${soldLabel}${sale.points > 0 ? ` for ${formatSeasonPoints(sale.points)}` : " for 0 points"} in local debug mode.`,
      ));
      sendResult({
        ok: true,
        sold: sale.sold,
        quantity: sale.quantity,
        points: sale.points,
        season0Points: player.season0Points,
        season0DailyPoints: player.season0DailyPoints,
      });
      return;
    }

    let persisted = false;
    let awardResult: SeasonRewardAwardResult | null = null;
    if (sale.points > 0) {
      persisted = await this.queueCharacterSave(
        client.sessionId,
        characterId,
        makePersistableCharacterState(characterId, player),
        undefined,
        async (state) => {
          awardResult = await saveCharacterProgressWithSeason0Reward(state, {
            walletAddress: player.walletAddress,
            sourceType: "event",
            sourceId: makeFishingVendorSeasonRewardSourceId(client.sessionId),
            points: sale.points,
            basePoints: sale.basePoints,
            agentMultiplier: player.isAgent ? 1 / FISHING_AGENT_BUNDLE_MULTIPLIER : 1,
            agentTokenGate,
            isAgent: player.isAgent,
            label: player.isAgent
              ? `fish monger sale: ${soldLabel} (agent fish bundles)`
              : `fish monger sale: ${soldLabel}`,
          });
          if (awardResult.status !== "awarded") {
            throw new Error(`fishing sale reward ${awardResult.status}`);
          }
        },
      );
    } else {
      persisted = await this.queueCharacterSave(
        client.sessionId,
        characterId,
        makePersistableCharacterState(characterId, player),
      );
    }

    const savedAwardResult = awardResult as SeasonRewardAwardResult | null;
    if (!persisted || (sale.points > 0 && (!savedAwardResult || savedAwardResult.status !== "awarded"))) {
      restoreInventoryState(player, previousInventory);
      this.recordPlayerAnalyticsEvent("fishing_vendor_sell_failed", client.sessionId, player, {
        supportKind: "fishing_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        sellAll,
        quantity: sale.quantity,
        points: sale.points,
        isAgent: player.isAgent,
        stage: "save",
        rewardStatus: savedAwardResult?.status ?? "save_failed",
        error: "wallet progress failed to save",
      });
      sendResult({ ok: false, error: savedAwardResult?.status === "capped" ? "season point cap reached" : "wallet progress failed to save" });
      return;
    }

    if (savedAwardResult) {
      player.season0Points = savedAwardResult.seasonTotal;
      player.season0DailyPoints = savedAwardResult.dailyTotal;
      this.applyReferralBonusToOnlineReferrer(savedAwardResult);
    }
    this.recordPlayerAnalyticsEvent("fishing_vendor_sell_confirmed", client.sessionId, player, {
      supportKind: "fishing_vendor_sell",
      ...npcAnalytics,
      itemId: selectedItemId ?? "",
      sellAll,
      quantity: sale.quantity,
      points: savedAwardResult?.points ?? sale.points,
      basePoints: sale.basePoints,
      isAgent: player.isAgent,
      dailyTotal: player.season0DailyPoints,
      seasonTotal: player.season0Points,
    });
    client.send("chat", makeSystemChat(
      sale.points > 0 ? "Season points" : "Fishing",
      `Sold ${soldLabel}${sale.points > 0 ? ` for ${formatSeasonPoints(savedAwardResult?.points ?? sale.points)}` : " for 0 points"}. Daily ${player.season0DailyPoints}/${SEASON_0_DAILY_POINT_CAP}, season ${player.season0Points}/${SEASON_0_TOTAL_POINT_CAP}.`,
    ));
    sendResult({
      ok: true,
      sold: sale.sold,
      quantity: sale.quantity,
      points: savedAwardResult?.points ?? sale.points,
      season0Points: player.season0Points,
      season0DailyPoints: player.season0DailyPoints,
    });
  }

  private playerHasFishingPole(player: PlayerState) {
    return getPlayerItemCount(player, FISHING_POLE_ITEM_ID) > 0
      || getPlayerItemCount(player, LOANER_FISHING_POLE_ITEM_ID) > 0;
  }

  private updateFishingAttempt(sessionId: string, player: PlayerState, activeInput: TrackedInput | null, now: number, grounded: boolean) {
    if (!player.fishingState) return;
    const attempt = this.fishingAttempts.get(sessionId);
    if (!attempt || attempt.attemptId !== player.fishingAttemptId) {
      this.cancelFishing(sessionId, player);
      return;
    }
    if (player.health <= 0 || player.frozenUntil > now || !grounded) {
      this.cancelFishing(sessionId, player);
      return;
    }
    const inputLength = activeInput ? Math.hypot(activeInput.x, activeInput.z) : 0;
    if (inputLength >= 0.01 || activeInput?.jump) {
      this.cancelFishing(sessionId, player);
      return;
    }
    if (now >= attempt.expiresAt) {
      this.cancelFishing(sessionId, player);
      return;
    }
    if (now >= attempt.biteAt) {
      player.fishingState = "bite";
      player.animation = "fishIdle";
      syncPlayerFishingJson(player);
      return;
    }
    if (now >= attempt.castAt + FISHING_CAST_MS) {
      player.fishingState = "waiting";
      player.animation = "fishIdle";
      syncPlayerFishingJson(player);
      return;
    }
    player.animation = "fishCast";
  }

  private cancelFishing(sessionId: string, player: PlayerState, animation: PlayerState["animation"] = "idle") {
    this.fishingAttempts.delete(sessionId);
    player.fishingAttemptId = "";
    player.fishingZoneId = "";
    player.fishingState = "";
    player.fishingCastAt = 0;
    player.fishingBiteAt = 0;
    player.fishingExpiresAt = 0;
    player.fishingBobberX = 0;
    player.fishingBobberZ = 0;
    player.animation = animation;
    if (animation === "fishReel") {
      this.holdPlayerAnimation(sessionId, animation, FISHING_REEL_ANIMATION_MS);
    } else {
      this.playerAnimationHolds.delete(sessionId);
    }
    syncPlayerFishingJson(player);
  }

  private holdPlayerAnimation(sessionId: string, animation: PlayerState["animation"], durationMs: number) {
    this.playerAnimationHolds.set(sessionId, {
      animation,
      until: Date.now() + Math.max(0, durationMs),
    });
  }

  private applyPlayerAnimationHold(sessionId: string, player: PlayerState, now: number) {
    const hold = this.playerAnimationHolds.get(sessionId);
    if (!hold) return false;
    if (now >= hold.until) {
      this.playerAnimationHolds.delete(sessionId);
      return false;
    }
    player.animation = hold.animation;
    return true;
  }

  private flushReadyFishingLoot(now: number) {
    for (const [sessionId, loot] of this.pendingFishingLoot) {
      if (loot.windowSentAt > 0 || now < loot.readyAt) continue;
      const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
      if (!client) continue;
      if (now > loot.expiresAt) {
        this.pendingFishingLoot.delete(sessionId);
        client.send("closeLootWindow", { npcId: loot.sourceId });
        continue;
      }
      loot.windowSentAt = now;
      client.send("chat", makeSystemChat("Fishing", loot.chatMessage));
      client.send("lootWindow", makeFishingLootWindow(loot));
    }
  }

  private async handleSellTrashItems(client: Client, message: Partial<ClientSellTrashItems>) {
    const player = this.state.players.get(client.sessionId);
    const selectedItemId = isTrashVendorItemId(message?.itemId) ? message.itemId : null;
    const sellAll = message?.sellAll === true;
    const sendResult = (result: Partial<TrashVendorSellResult> & Pick<TrashVendorSellResult, "ok">) => {
      client.send("trashVendorSellResult", {
        ok: result.ok,
        status: result.status ?? (result.ok ? "sold" : "error"),
        sold: result.sold ?? [],
        quantity: result.quantity ?? 0,
        points: result.points ?? 0,
        season0Points: result.season0Points ?? player?.season0Points ?? 0,
        season0DailyPoints: result.season0DailyPoints ?? player?.season0DailyPoints ?? 0,
        mferGptGate: result.mferGptGate,
        error: result.error,
      } satisfies TrashVendorSellResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }
    if (!sellAll && !selectedItemId) {
      sendResult({ ok: false, error: "pick a trash item" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    const useLocalDebugWallet = isLocalDebugWalletAllowed(player.walletAddress);
    if (player.identityType !== "wallet" || !player.walletAddress || (!characterId && !useLocalDebugWallet)) {
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    const npc = this.state.npcs.get(TRASH_VENDOR_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? TRASH_VENDOR_NPC_ID,
      npcName: npc?.name ?? "trash mfer",
      npcDistance,
    };
    if (!npc || npcDistance === null || npcDistance > LOOT.interactRange) {
      this.recordPlayerAnalyticsEvent("trash_vendor_sell_failed", client.sessionId, player, {
        supportKind: "trash_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        stage: "preflight",
        error: "trash mfer too far",
      });
      sendResult({ ok: false, error: "trash mfer too far" });
      return;
    }

    const remainingDaily = Math.max(0, SEASON_0_DAILY_POINT_CAP - player.season0DailyPoints);
    const remainingSeason = Math.max(0, SEASON_0_TOTAL_POINT_CAP - player.season0Points);
    const pointCapacity = Math.min(remainingDaily, remainingSeason);
    if (pointCapacity <= 0) {
      sendResult({ ok: false, error: "season point cap reached" });
      return;
    }

    const requestedQuantity = sellAll
      ? Number.MAX_SAFE_INTEGER
      : normalizeTrashSellQuantity(message?.quantity);
    const availableQuantity = getSellableTrashItemCount(player, selectedItemId);
    const maxQuantity = getMaxTrashSaleQuantityForPointCapacity(player, {
      itemId: selectedItemId,
      requestedQuantity,
      pointCapacity,
      isAgent: player.isAgent,
    });
    const sale = planTrashSale(player, {
      itemId: selectedItemId,
      maxQuantity,
    });
    const awardedPoints = getTrashSaleAwardPoints(sale.quantity, player.isAgent);
    if (sale.quantity <= 0) {
      sendResult({
        ok: false,
        error: player.isAgent && availableQuantity > 0
          ? `agents need ${AGENT_TRASH_VENDOR_ITEMS_PER_POINT} trash for 1 season point`
          : "no sellable trash in stash",
      });
      return;
    }

    let season0MferGptGate: AgentSeason0MferGptGateStatus | undefined;
    if (awardedPoints > 0 && !useLocalDebugWallet) {
      season0MferGptGate = player.isAgent
        ? await this.notifyAgentSeason0GateStatus(client, player, "trash_vendor")
        : await getAgentSeason0MferGptGateStatus(player.walletAddress);
      if (season0MferGptGate && !season0MferGptGate.eligible) {
        this.recordPlayerAnalyticsEvent("trash_vendor_sell_failed", client.sessionId, player, {
          supportKind: "trash_vendor_sell",
          ...npcAnalytics,
          itemId: selectedItemId ?? "",
          stage: player.isAgent ? "agent_token_gate" : "season0_mfergpt_gate",
          error: "mfergpt gate required",
          mferGptGateEligible: season0MferGptGate.eligible,
          mferGptGateReason: season0MferGptGate.reason,
          mferGptGateRequiredWei: season0MferGptGate.requiredWei,
          mferGptGateBalanceWei: season0MferGptGate.balanceWei,
        });
        client.send("chat", makeSystemChat(
          player.isAgent ? "Agent Rewards" : "Season 0",
          player.isAgent
            ? makeAgentSeason0MferGptGateMessage(season0MferGptGate)
            : makeSeason0MferGptGateMessage(season0MferGptGate),
        ));
        sendResult({
          ok: false,
          status: "mfergpt_gate",
          sold: sale.sold,
          quantity: sale.quantity,
          points: awardedPoints,
          error: "25M MFERGPT required for Season 0 points",
          mferGptGate: season0MferGptGate,
        });
        return;
      }
    }
    const agentTokenGate = player.isAgent ? season0MferGptGate : undefined;

    this.recordPlayerAnalyticsEvent("trash_vendor_sell_started", client.sessionId, player, {
      supportKind: "trash_vendor_sell",
      ...npcAnalytics,
      itemId: selectedItemId ?? "",
      sellAll,
      quantity: sale.quantity,
      points: awardedPoints,
      basePoints: sale.points,
      agentTrashItemsPerPoint: player.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1,
      isAgent: player.isAgent,
      mferGptGateEligible: season0MferGptGate?.eligible,
      mferGptGateReason: season0MferGptGate?.reason,
    });

    const previousInventory = snapshotInventoryState(player);
    applyTrashSale(player, sale.removals);
    const soldLabel = formatTrashSoldSummary(sale.sold);
    if (!characterId && useLocalDebugWallet) {
      player.season0Points += awardedPoints;
      player.season0DailyPoints += awardedPoints;
      this.recordPlayerAnalyticsEvent("trash_vendor_sell_confirmed", client.sessionId, player, {
        supportKind: "trash_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        sellAll,
        quantity: sale.quantity,
        points: awardedPoints,
        basePoints: sale.points,
        agentTrashItemsPerPoint: player.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1,
        isAgent: player.isAgent,
        dailyTotal: player.season0DailyPoints,
        seasonTotal: player.season0Points,
        localDebug: true,
      });
      client.send("chat", makeSystemChat(
        "Season points",
        `Sold ${soldLabel} for ${formatTrashAwardPoints(awardedPoints, sale.points, player.isAgent)} in local debug mode. Daily ${player.season0DailyPoints}/${SEASON_0_DAILY_POINT_CAP}, season ${player.season0Points}/${SEASON_0_TOTAL_POINT_CAP}.`,
      ));
      sendResult({
        ok: true,
        sold: sale.sold,
        quantity: sale.quantity,
        points: awardedPoints,
        season0Points: player.season0Points,
        season0DailyPoints: player.season0DailyPoints,
      });
      return;
    }

    let awardResult: SeasonRewardAwardResult | null = null;
    const persisted = await this.queueCharacterSave(
      client.sessionId,
      characterId,
      makePersistableCharacterState(characterId, player),
      undefined,
      async (state) => {
        awardResult = await saveCharacterProgressWithSeason0Reward(state, {
          walletAddress: player.walletAddress,
          sourceType: "event",
          sourceId: makeTrashVendorSeasonRewardSourceId(client.sessionId),
          points: awardedPoints,
          basePoints: sale.points,
          agentMultiplier: player.isAgent ? 1 / AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1,
          agentTokenGate,
          isAgent: player.isAgent,
          label: player.isAgent
            ? `trash mfer sale: ${soldLabel} (agent ${AGENT_TRASH_VENDOR_ITEMS_PER_POINT}:1 trash bundle)`
            : `trash mfer sale: ${soldLabel}`,
        });
        if (awardResult.status !== "awarded") {
          throw new Error(`trash sale reward ${awardResult.status}`);
        }
      },
    );

    const savedAwardResult = awardResult as SeasonRewardAwardResult | null;
    if (!persisted || !savedAwardResult || savedAwardResult.status !== "awarded") {
      restoreInventoryState(player, previousInventory);
      this.recordPlayerAnalyticsEvent("trash_vendor_sell_failed", client.sessionId, player, {
        supportKind: "trash_vendor_sell",
        ...npcAnalytics,
        itemId: selectedItemId ?? "",
        sellAll,
        quantity: sale.quantity,
        points: awardedPoints,
        basePoints: sale.points,
        agentTrashItemsPerPoint: player.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1,
        isAgent: player.isAgent,
        agentTokenGateEligible: agentTokenGate?.eligible,
        agentTokenGateReason: agentTokenGate?.reason,
        stage: "save",
        rewardStatus: savedAwardResult?.status ?? "save_failed",
        error: "wallet progress failed to save",
      });
      sendResult({ ok: false, error: savedAwardResult?.status === "capped" ? "season point cap reached" : "wallet progress failed to save" });
      return;
    }

    player.season0Points = savedAwardResult.seasonTotal;
    player.season0DailyPoints = savedAwardResult.dailyTotal;
    this.applyReferralBonusToOnlineReferrer(savedAwardResult);
    this.recordPlayerAnalyticsEvent("trash_vendor_sell_confirmed", client.sessionId, player, {
      supportKind: "trash_vendor_sell",
      ...npcAnalytics,
      itemId: selectedItemId ?? "",
      sellAll,
      quantity: sale.quantity,
      points: savedAwardResult.points,
      basePoints: sale.points,
      agentTrashItemsPerPoint: player.isAgent ? AGENT_TRASH_VENDOR_ITEMS_PER_POINT : 1,
      isAgent: player.isAgent,
      agentTokenGateEligible: agentTokenGate?.eligible,
      agentTokenGateReason: agentTokenGate?.reason,
      dailyTotal: savedAwardResult.dailyTotal,
      seasonTotal: savedAwardResult.seasonTotal,
    });
    client.send("chat", makeSystemChat(
      "Season points",
      `Sold ${soldLabel} for ${formatTrashAwardPoints(savedAwardResult.points, sale.points, player.isAgent)}. Daily ${savedAwardResult.dailyTotal}/${SEASON_0_DAILY_POINT_CAP}, season ${savedAwardResult.seasonTotal}/${SEASON_0_TOTAL_POINT_CAP}.`,
    ));
    sendResult({
      ok: true,
      sold: sale.sold,
      quantity: sale.quantity,
      points: savedAwardResult.points,
      season0Points: savedAwardResult.seasonTotal,
      season0DailyPoints: savedAwardResult.dailyTotal,
    });
  }

  private async handleRemoveSeasonReferral(client: Client, message: Partial<ClientRemoveSeasonReferral>) {
    const player = this.state.players.get(client.sessionId);
    const referrerWalletAddress = normalizeWalletAddress(player?.walletAddress);
    const refereeWalletAddress = normalizeWalletAddress(message?.refereeWalletAddress);
    const sendResult = (result: SeasonReferralRemoveResult) => {
      client.send("seasonReferralRemoveResult", result);
    };
    const makeResult = (
      status: SeasonReferralRemoveResult["status"],
      error: string,
      ok = false,
    ): SeasonReferralRemoveResult => ({
      ok,
      status,
      referrerWalletAddress,
      refereeWalletAddress,
      removedReferrerBonusPoints: 0,
      removedReferrerDailyPoints: 0,
      removedRefereeBonusPoints: 0,
      removedRefereeDailyPoints: 0,
      referrerSeason0Points: player?.season0Points ?? 0,
      referrerSeason0DailyPoints: player?.season0DailyPoints ?? 0,
      refereeSeason0Points: 0,
      refereeSeason0DailyPoints: 0,
      error,
    });

    if (!player || player.identityType !== "wallet" || !referrerWalletAddress) {
      sendResult(makeResult("wallet_required", "wallet character required"));
      return;
    }
    if (!refereeWalletAddress) {
      sendResult(makeResult("invalid_wallet", "valid referee wallet required"));
      return;
    }

    try {
      const result = await removeSeasonReferral({
        referrerWalletAddress,
        refereeWalletAddress,
      });
      const response: SeasonReferralRemoveResult = {
        ...result,
        status: result.status,
      };
      if (!response.ok) {
        sendResult({
          ...response,
          status: response.status === "no_database" ? "no_database" : response.status,
          error: response.error || (response.status === "not_found" ? "referral not found" : "unable to remove referral"),
        });
        return;
      }

      this.applySeasonReferralRemovalToOnlinePlayers(response);
      const removedBonus = response.removedReferrerBonusPoints + response.removedRefereeBonusPoints;
      client.send("chat", makeSystemChat(
        "Season 0",
        `Removed referral ${shortWalletForChat(refereeWalletAddress)}. Freed 1 slot${removedBonus > 0 ? ` and removed ${removedBonus} referral bonus point${removedBonus === 1 ? "" : "s"}` : ""}.`,
      ));
      sendResult(response);
    } catch (error) {
      console.error(`Failed to remove season referral for ${referrerWalletAddress}`, error);
      sendResult(makeResult("error", "unable to remove referral"));
    }
  }

  private async handleRespecTalents(client: Client, message: Partial<ClientRespecTalents>) {
    const player = this.state.players.get(client.sessionId);
    const sendResult = (result: Partial<TalentRespecResult> & Pick<TalentRespecResult, "ok">) => {
      client.send("talentRespecResult", {
        ok: result.ok,
        refundedTalentPoints: result.refundedTalentPoints ?? 0,
        talentPoints: result.talentPoints ?? player?.talentPoints ?? 0,
        paymentAmountWei: result.paymentAmountWei ?? TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
        chainId: result.chainId ?? 0,
        txHash: result.txHash,
        error: result.error,
      } satisfies TalentRespecResult);
    };

    if (!player || player.health <= 0) {
      sendResult({ ok: false, error: "player unavailable" });
      return;
    }

    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    const useLocalDebugWallet = isLocalDebugWalletAllowed(player.walletAddress);
    if (player.identityType !== "wallet" || !player.walletAddress || (!characterId && !useLocalDebugWallet)) {
      sendResult({ ok: false, error: "wallet character required" });
      return;
    }

    normalizePlayerTalents(player);
    const previousTalents = getPlayerTalentRanks(player);
    const previousTalentPoints = player.talentPoints;
    const spentTalentPoints = previousTalents.reduce((total, talent) => total + talent.rank, 0);
    if (spentTalentPoints <= 0) {
      sendResult({ ok: false, error: "no spent talents to reset", talentPoints: player.talentPoints });
      return;
    }

    const npc = this.state.npcs.get(RESPEC_MFER_NPC_ID);
    const npcDistance = npc ? Math.round(distanceToNpc(player, npc) * 100) / 100 : null;
    const npcAnalytics = {
      npcId: npc?.id ?? RESPEC_MFER_NPC_ID,
      npcName: npc?.name ?? "respec mfer",
      npcDistance,
    };

    this.recordPlayerAnalyticsEvent("talent_respec_attempted", client.sessionId, player, {
      supportKind: "talent_respec",
      ...npcAnalytics,
      spentTalentPoints,
      expectedPaymentAmountWei: TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
      ...summarizeMferGptPaymentProof(message?.payment),
    });

    let verifiedPayment: VerifiedTalentRespecPayment;
    try {
      verifiedPayment = await verifyTalentRespecPaymentProof(message?.payment, player.walletAddress);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "payment verification failed";
      this.recordPlayerAnalyticsEvent("talent_respec_failed", client.sessionId, player, {
        supportKind: "talent_respec",
        ...npcAnalytics,
        spentTalentPoints,
        stage: "payment_verification",
        error: errorMessage,
        ...summarizeMferGptPaymentProof(message?.payment),
      });
      sendResult({ ok: false, error: errorMessage, talentPoints: player.talentPoints });
      return;
    }

    const refundedTalentPoints = respecPlayerTalents(player);
    recalculatePlayerStats(player);
    const persisted = characterId
      ? await this.queueCharacterSave(
        client.sessionId,
        characterId,
        makePersistableCharacterState(characterId, player),
        undefined,
        (state) => saveCharacterProgressWithCryptoPurchase(state, {
          ...verifiedPayment,
          productId: TALENT_RESPEC_PRODUCT_ID,
          tokenId: "talents",
          paymentToken: "MFERGPT",
          note: `respec mfer refunded ${refundedTalentPoints} talent points`,
        }),
      )
      : true;

    if (!persisted) {
      restorePlayerTalentRanks(player, previousTalents, previousTalentPoints);
      recalculatePlayerStats(player);
      this.recordPlayerAnalyticsEvent("talent_respec_failed", client.sessionId, player, {
        supportKind: "talent_respec",
        ...npcAnalytics,
        spentTalentPoints,
        refundedTalentPoints,
        stage: "save",
        error: "wallet progress failed to save",
        ...summarizeVerifiedMferGptPayment(verifiedPayment),
      });
      sendResult({
        ok: false,
        refundedTalentPoints,
        talentPoints: player.talentPoints,
        error: "wallet progress failed to save; retry before reloading",
        paymentAmountWei: verifiedPayment.amountWei,
        chainId: verifiedPayment.chainId,
        txHash: verifiedPayment.txHash,
      });
      return;
    }

    this.recordPlayerAnalyticsEvent("talent_respec_confirmed", client.sessionId, player, {
      supportKind: "talent_respec",
      ...npcAnalytics,
      spentTalentPoints,
      refundedTalentPoints,
      talentPoints: player.talentPoints,
      productId: TALENT_RESPEC_PRODUCT_ID,
      ...summarizeVerifiedMferGptPayment(verifiedPayment),
    });
    sendResult({
      ok: true,
      refundedTalentPoints,
      talentPoints: player.talentPoints,
      paymentAmountWei: verifiedPayment.amountWei,
      chainId: verifiedPayment.chainId,
      txHash: verifiedPayment.txHash,
    });
  }

  private handleDebugUpdateChainGearTier(client: Client, message: Partial<ClientDebugUpdateChainGearTier>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!updateChainGearTier(player, tokenId, normalizeChainGearTier(message.tier))) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private async reconcileOwnedChainGear(player: PlayerState) {
    if (player.identityType !== "wallet" || !player.walletAddress) return;

    const chainItems: Array<{ key: string; tokenId: string; itemId: ItemId }> = [];
    player.inventory.forEach((item, key) => {
      const tokenId = normalizeChainTokenId(item.chainTokenId);
      if (tokenId) chainItems.push({ key, tokenId, itemId: item.id });
    });
    if (chainItems.length === 0) return;

    const staleTokens = new Set<string>();
    const verifiedTiers = new Map<string, number>();
    let changed = false;

    for (const item of chainItems) {
      let verified;
      try {
        verified = await verifyChainGearOwnership({ tokenId: item.tokenId, walletAddress: player.walletAddress });
      } catch (error) {
        console.warn("chain_gear.reconcile_skipped", error);
        return;
      }

      const verifiedItemId = verified ? getChainGearItemId(verified.gearType) : null;
      if (!verified || verifiedItemId !== item.itemId) {
        staleTokens.add(item.tokenId);
        player.inventory.delete(item.key);
        changed = true;
        continue;
      }

      const inventoryItem = player.inventory.get(item.key);
      const verifiedTier = normalizeChainGearTier(verified.tier);
      verifiedTiers.set(item.tokenId, verifiedTier);
      if (inventoryItem && inventoryItem.chainTier !== verifiedTier) {
        inventoryItem.chainTier = verifiedTier;
        changed = true;
      }
    }

    player.equipment.forEach((slot) => {
      const tokenId = normalizeChainTokenId(slot.chainTokenId);
      if (!tokenId || !staleTokens.has(tokenId)) return;
      slot.itemId = "";
      slot.chainTokenId = "";
      slot.chainTier = 1;
      changed = true;
    });
    player.equipment.forEach((slot) => {
      const tokenId = normalizeChainTokenId(slot.chainTokenId);
      const verifiedTier = verifiedTiers.get(tokenId);
      if (!verifiedTier || slot.chainTier === verifiedTier) return;
      slot.chainTier = verifiedTier;
      changed = true;
    });

    if (changed) recalculatePlayerStats(player);
  }

  private handleUseItem(client: Client, message: Partial<ClientUseItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const itemId = normalizeItemId(message?.itemId);
    if (!itemId) return;
    const consumable = getItemConsumable(itemId);
    const previousHealth = player.health;
    const previousMana = player.mana;
    const used = useInventoryConsumable({
      chainTokenId: message?.chainTokenId,
      cooldowns: this.consumableCooldowns,
      itemId,
      now: Date.now(),
      player,
      sessionId: client.sessionId,
    });
    if (!used) return;

    this.recordPlayerAnalyticsEvent("consumable_used", client.sessionId, player, {
      itemId,
      kind: consumable?.kind ?? "",
      buffId: consumable?.buffId ?? "",
      healthRestored: Math.max(0, player.health - previousHealth),
      manaRestored: Math.max(0, player.mana - previousMana),
      level: player.level,
    });
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleClientAnalyticsEvent(client: Client, message: ClientAnalyticsMessage) {
    const eventType = typeof message.eventType === "string" ? message.eventType : "";
    if (!CLIENT_ANALYTICS_EVENTS.has(eventType)) return;

    const player = this.state.players.get(client.sessionId);
    this.recordPlayerAnalyticsEvent(
      eventType,
      client.sessionId,
      player,
      normalizeClientAnalyticsProperties(message.properties),
    );
  }

  private handleAgentStatus(client: Client, message: Partial<ClientAgentStatus>) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isAgent) return;

    player.agentStatusAction = sanitizeAgentStatusText(message?.action, 96);
    player.agentStatusThought = sanitizeAgentStatusText(message?.thought, 260);
    player.agentStatusObjective = sanitizeAgentStatusText(message?.objective, 180);
    player.agentStatusQuest = sanitizeAgentStatusText(message?.quest, 140);
    player.agentCommandBudgetJson = makeAgentCommandBudgetJson(message);
    player.agentStatusUpdatedAt = Date.now();
  }

  private handleAcceptQuest(client: Client, message: Partial<ClientAcceptQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId) return;
    if (!isQuestAvailable(player, questId)) return;

    const npc = this.state.npcs.get(QUESTS[questId].giverNpcId);
    if (!npc) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;

    startQuest(player, questId);
    if (
      questId === "set-your-traits"
      && hasExplicitMferAppearanceTraits(parseMferAppearanceTraitsJson(player.appearanceTraitsJson))
    ) {
      progressTraitQuest(player);
    }
    this.recordPlayerAnalyticsEvent("quest_accepted", client.sessionId, player, {
      questId,
      npcId: npc.id,
      level: player.level,
    });
    if (questId === "ogre-raid-daily") {
      this.ensureDailyRaidBoss();
    }
    const questState = player.quests.get(questId);
    if (questState) {
      const turnInNpc = this.state.npcs.get(getQuestTurnInNpcId(questId));
      client.send("questStatus", makeQuestStatusNotice(
        questId,
        npc,
        questState,
        questState.status === "ready"
          ? `Accepted ${QUESTS[questId].title}. Ready to turn in with ${turnInNpc?.name ?? "the turn-in NPC"}.`
          : `Accepted ${QUESTS[questId].title}. ${QUESTS[questId].objectiveLabel}.`,
      ));
    }
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleCompleteQuest(client: Client, message: Partial<ClientCompleteQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId) return;

    const turnInNpcId = getQuestTurnInNpcId(questId);
    const npc = this.state.npcs.get(turnInNpcId);
    const questState = player.quests.get(questId);
    if (!npc || !questState) return;
    if (distanceToNpc(player, npc) > 3.75 || (typeof message?.npcId === "string" && message.npcId !== npc.id)) {
      client.send("questStatus", makeQuestStatusNotice(
        questId,
        npc,
        questState,
        `${QUESTS[questId].title}: take it to ${npc.name}.`,
      ));
      return;
    }
    if (!completeQuest(player, questId, Date.now())) {
      client.send("questStatus", makeQuestStatusNotice(
        questId,
        npc,
        questState,
        `${QUESTS[questId].title}: ${QUESTS[questId].objectiveLabel}.`,
      ));
      return;
    }
    const xpReward = getPlayerQuestXpReward(player, QUESTS[questId].xpReward);
    const award = awardExperience(player, xpReward);
    if (award.levelsGained > 0) recalculatePlayerStats(player);
    if (award.levelsGained > 0) {
      this.recordPlayerAnalyticsEvent("player_level_up", client.sessionId, player, {
        levelsGained: award.levelsGained,
        level: player.level,
        source: "quest_completed",
        questId,
      });
    }
    void this.awardSeason0QuestReward(client, player, questId);

    this.persistPlayerProgress(client.sessionId, player);

    const nextQuestId = getNextAvailableQuestId(player, questId);
    const nextGiverNpcId = nextQuestId ? QUESTS[nextQuestId].giverNpcId : "";
    const nextGiverNpc = nextGiverNpcId ? this.state.npcs.get(nextGiverNpcId) : undefined;
    client.send("questCompleted", {
      ...makeQuestTurnIn(questId, npc, questState),
      xpReward,
      nextQuestId: nextQuestId ?? "",
      nextQuestTitle: nextQuestId ? QUESTS[nextQuestId].title : "",
      nextGiverNpcId,
      nextGiverNpcName: nextGiverNpc?.name ?? "",
    });
    this.recordPlayerAnalyticsEvent("quest_completed", client.sessionId, player, {
      questId,
      npcId: npc.id,
      xpReward,
      level: player.level,
      nextQuestId: nextQuestId ?? "",
    });
    recordMferlandQuestCompleted({
      characterName: player.name,
      questId,
      questTitle: QUESTS[questId].title,
      level: player.level,
      nextQuestId,
      nextQuestTitle: nextQuestId ? QUESTS[nextQuestId].title : undefined,
    });
    this.publishLiveMemoryStatus(Date.now(), true);
    if (nextQuestId && QUESTS[nextQuestId].giverNpcId === npc.id) {
      client.send("questOffer", makeQuestOffer(nextQuestId, npc));
    }
  }

  private handleCancelQuest(client: Client, message: Partial<ClientCancelQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !cancelQuest(player, questId)) return;

    this.recordPlayerAnalyticsEvent("quest_cancelled", client.sessionId, player, {
      questId,
      level: player.level,
    });
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleLootCorpse(client: Client, message: Partial<ClientLootCorpse>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const npcId = typeof message?.npcId === "string" ? message.npcId : "";
    if (npcId.startsWith(FISHING_LOOT_SOURCE_PREFIX)) {
      this.handleFishingLootPickup(client, player, message, npcId);
      return;
    }

    const npc = this.state.npcs.get(npcId);
    if (!npc || isNpcAlive(npc) || !npcHasLoot(npc)) return;
    if (distanceToNpc(player, npc) > LOOT.interactRange) return;

    const requestedItemId = message?.itemId;
    const itemId = requestedItemId === undefined ? null : normalizeItemId(requestedItemId);
    if (requestedItemId !== undefined && !itemId) return;
    const chainTokenId = normalizeChainTokenId(message?.chainTokenId);
    const requestedLootKey = itemId ? getInventoryItemKey(itemId, chainTokenId) : "";
    if (itemId && !npc.loot.has(requestedLootKey)) return;

    const lootedItems: Array<{ itemId: ItemId; chainTokenId: string }> = [];
    if (itemId) {
      lootedItems.push({ itemId, chainTokenId });
      lootCorpseItem(player, npc, itemId, chainTokenId);
    } else {
      const lootItems: Array<{ itemId: ItemId; chainTokenId: string }> = [];
      npc.loot.forEach((item) => lootItems.push({ itemId: item.id, chainTokenId: item.chainTokenId }));
      for (const item of lootItems) {
        lootedItems.push(item);
        lootCorpseItem(player, npc, item.itemId, item.chainTokenId);
      }
    }

    this.recordPlayerAnalyticsEvent("loot_collected", client.sessionId, player, {
      npcId: npc.id,
      npcRole: npc.role,
      npcModel: npc.model,
      itemCount: lootedItems.length,
      itemIds: lootedItems.map((item) => item.itemId),
      chainItemCount: lootedItems.filter((item) => item.chainTokenId).length,
    });
    if (npcHasLoot(npc)) {
      client.send("lootWindow", makeLootWindow(npc));
      return;
    }

    npc.hasLoot = false;
    npc.despawnAt = Date.now() + LOOT.lootedDespawnMs;
    npc.respawnAt = npc.id === "raid-ogre-mfer" ? 0 : Math.max(npc.respawnAt, npc.despawnAt + 250);
    client.send("closeLootWindow", { npcId: npc.id });
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleFishingLootPickup(
    client: Client,
    player: PlayerState,
    message: Partial<ClientLootCorpse>,
    sourceId: string,
  ) {
    const pending = this.pendingFishingLoot.get(client.sessionId);
    if (!pending || pending.sourceId !== sourceId) return;
    const now = Date.now();
    if (now < pending.readyAt) return;
    if (now > pending.expiresAt) {
      this.pendingFishingLoot.delete(client.sessionId);
      client.send("closeLootWindow", { npcId: sourceId });
      return;
    }

    const requestedItemId = message?.itemId;
    const itemId = requestedItemId === undefined ? null : normalizeItemId(requestedItemId);
    if (requestedItemId !== undefined && itemId !== pending.itemId) return;
    const chainTokenId = normalizeChainTokenId(message?.chainTokenId);
    if (chainTokenId) return;

    addInventoryItem(player, pending.itemId, pending.count);
    progressFishingQuest(player);
    progressLootQuests(player, pending.itemId, pending.count);
    this.pendingFishingLoot.delete(client.sessionId);
    this.recordPlayerAnalyticsEvent("fishing_loot_collected", client.sessionId, player, {
      supportKind: "fishing",
      sourceId,
      attemptId: pending.attemptId,
      itemId: pending.itemId,
      itemName: ITEMS[pending.itemId].name,
      quantity: pending.count,
      isAgent: player.isAgent,
    });
    client.send("closeLootWindow", { npcId: sourceId });
    this.persistPlayerProgress(client.sessionId, player);
  }

  private ensureDailyRaidBoss() {
    const existing = this.state.npcs.get(DAILY_RAID_BOSS_NPC_ID);
    if (existing && isNpcAlive(existing)) return;
    if (existing) this.state.npcs.delete(existing.id);

    spawnNpcFromSpec(this.state.npcs, {
      id: DAILY_RAID_BOSS_NPC_ID,
      name: "bear market mfer",
      role: "farmer",
      model: "mfer",
      x: DAILY_RAID_BOSS_SPAWN.x,
      z: DAILY_RAID_BOSS_SPAWN.z,
      yaw: DAILY_RAID_BOSS_SPAWN.yaw,
      leashRadius: 22,
      health: 5200,
      maxHealth: 5200,
      combatStyle: "melee",
      dialogue: "bear market mfer shakes the relay hard enough for the whole ridge to hear.",
    });
    this.dailyRaidBossInactiveDespawnAt = Date.now() + DAILY_RAID_BOSS_INACTIVE_DESPAWN_MS;

    this.broadcast("chat", {
      sessionId: DAILY_RAID_BOSS_NPC_ID,
      name: "bear market mfer",
      identityType: "npc",
      text: "bear market mfer has been called to Signal Ridge.",
      sentAt: Date.now(),
    } satisfies ChatMessage);
  }

  private ensureDailyRaidBossForActiveQuest(player: PlayerState) {
    const quest = player.quests.get("ogre-raid-daily");
    if (quest?.status !== "active" || quest.progress >= quest.required) return false;

    this.ensureDailyRaidBoss();
    return true;
  }

  private removeInactiveDailyRaidBoss(now: number) {
    if (this.dailyRaidBossInactiveDespawnAt <= 0 || now < this.dailyRaidBossInactiveDespawnAt) return;

    const npc = this.state.npcs.get(DAILY_RAID_BOSS_NPC_ID);
    if (!npc || !isNpcAlive(npc)) {
      this.dailyRaidBossInactiveDespawnAt = 0;
      return;
    }

    const taggedPlayers = this.npcDamageTags.get(DAILY_RAID_BOSS_NPC_ID);
    if (taggedPlayers?.size) {
      let latestTaggedAt = 0;
      taggedPlayers.forEach((taggedAt) => {
        latestTaggedAt = Math.max(latestTaggedAt, taggedAt);
      });
      if (now - latestTaggedAt < DAILY_RAID_BOSS_INACTIVE_DESPAWN_MS) {
        this.dailyRaidBossInactiveDespawnAt = latestTaggedAt + DAILY_RAID_BOSS_INACTIVE_DESPAWN_MS;
        return;
      }
    }

    this.state.npcs.delete(DAILY_RAID_BOSS_NPC_ID);
    this.npcDamageTags.delete(DAILY_RAID_BOSS_NPC_ID);
    this.clearNpcThreat(DAILY_RAID_BOSS_NPC_ID);
    this.dailyRaidBossInactiveDespawnAt = 0;
  }

  private handleSelectTalent(client: Client, message: Partial<ClientSelectTalent>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const talentId = normalizeTalentId(message?.talentId);
    if (!talentId) return;
    if (!rankPlayerTalent(player, talentId)) return;

    recalculatePlayerStats(player);
    this.persistPlayerProgress(client.sessionId, player);
  }

  private async handleUpdateTraits(client: Client, message: Partial<ClientUpdateTraits>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const traitsNpc = this.state.npcs.get(TRAITS_MFER_NPC_ID);
    const traitQuest = player.quests.get("set-your-traits");
    const parsedExistingTraits = parseMferAppearanceTraitsJson(player.appearanceTraitsJson);
    const existingTraits = player.isAgent
      ? normalizeAgentMferAppearanceTraits(parsedExistingTraits, {})
      : parsedExistingTraits;
    const hasExistingTraits = hasExplicitMferAppearanceTraits(existingTraits);
    const nextTraits = player.isAgent
      ? resolveAgentMferAppearanceTraitsForUpdate(message?.traits, existingTraits, getAgentTraitSeed(player))
      : normalizeMferAppearanceTraits(message?.traits, existingTraits);
    const previousName = player.name;
    const previousTraitsJson = player.appearanceTraitsJson;
    const nextName = sanitizePlayerName(message?.name, player.name || "mfer");
    if (!hasExplicitMferAppearanceTraits(nextTraits)) {
      client.send("traitUpdateResult", {
        ok: false,
        traits: existingTraits,
        name: player.name,
        free: false,
        paid: false,
        error: "pick a valid trait set",
      });
      return;
    }

    const isWalletCharacter = player.identityType === "wallet" && Boolean(this.persistentCharacterIds.get(client.sessionId));
    const free = !hasExistingTraits;
    let verifiedPayment: VerifiedTraitPayment | null = null;
    const characterId = this.persistentCharacterIds.get(client.sessionId) ?? "";
    const attemptId = makeTraitChangeAttemptId(message?.attemptId);
    if (free && (!traitsNpc || distanceToNpc(player, traitsNpc) > LOOT.interactRange)) {
      client.send("traitUpdateResult", {
        ok: false,
        traits: existingTraits,
        name: player.name,
        free: false,
        paid: false,
        error: "talk to traits mfer first",
      });
      return;
    }

    if (!free) {
      if (!isWalletCharacter || !player.walletAddress || !characterId) {
        client.send("traitUpdateResult", {
          ok: false,
          traits: existingTraits,
          name: player.name,
          free: false,
          paid: false,
          error: "wallet character required",
        });
        return;
      }

      this.recordTraitChangeSupportEvent("trait_change_attempted", client.sessionId, player, {
        attemptId,
        beforeName: previousName,
        afterName: nextName,
        beforeTraits: existingTraits,
        afterTraits: nextTraits,
        payment: summarizeMferGptPaymentProof(message?.payment),
      });

      try {
        verifiedPayment = await verifyTraitPaymentProof(message?.payment, player.walletAddress);
      } catch (error) {
        this.recordTraitChangeSupportEvent("trait_change_failed", client.sessionId, player, {
          attemptId,
          beforeName: previousName,
          afterName: nextName,
          beforeTraits: existingTraits,
          afterTraits: nextTraits,
          payment: summarizeMferGptPaymentProof(message?.payment),
          error: error instanceof Error ? error.message : "payment verification failed",
        });
        client.send("traitUpdateResult", {
          ok: false,
          traits: existingTraits,
          name: player.name,
          free: false,
          paid: false,
          error: error instanceof Error ? error.message : "payment verification failed",
        });
        return;
      }
    }

    player.appearanceTraitsJson = player.isAgent
      ? serializeAgentMferAppearanceTraits(nextTraits)
      : serializeMferAppearanceTraits(nextTraits);
    player.name = nextName;
    const progressedQuest = free && traitQuest ? progressTraitQuest(player) : false;
    this.recordPlayerAnalyticsEvent("traits_updated", client.sessionId, player, {
      free,
      paid: Boolean(verifiedPayment),
      nameChanged: nextName !== previousName,
      paymentToken: verifiedPayment ? "MFERGPT" : "",
      paymentAmountWei: verifiedPayment?.amountWei ?? "0",
      chainId: verifiedPayment?.chainId ?? 0,
      txHash: verifiedPayment?.txHash ?? "",
      progressedQuest,
    });
    const persisted = await this.persistPlayerProgressNow(client.sessionId, player, verifiedPayment);
    if (!persisted && isWalletCharacter) {
      if (verifiedPayment) {
        player.name = previousName;
        player.appearanceTraitsJson = previousTraitsJson;
        this.recordTraitChangeSupportEvent("trait_change_failed", client.sessionId, player, {
          attemptId,
          beforeName: previousName,
          afterName: nextName,
          beforeTraits: existingTraits,
          afterTraits: nextTraits,
          payment: summarizeVerifiedMferGptPayment(verifiedPayment),
          error: "wallet progress failed to save",
        });
      }
      client.send("traitUpdateResult", {
        ok: false,
        traits: nextTraits,
        name: nextName,
        free,
        paid: Boolean(verifiedPayment),
        error: "wallet progress failed to save; retry before reloading",
      });
      return;
    }

    if (verifiedPayment) {
      this.recordTraitChangeSupportEvent("trait_change_saved", client.sessionId, player, {
        attemptId,
        beforeName: previousName,
        afterName: nextName,
        beforeTraits: existingTraits,
        afterTraits: nextTraits,
        payment: summarizeVerifiedMferGptPayment(verifiedPayment),
      });
    }

    client.send("traitUpdateResult", {
      ok: true,
      traits: nextTraits,
      name: nextName,
      free,
      paid: Boolean(verifiedPayment),
    });
  }

  private persistPlayerProgress(sessionId: string, player: PlayerState) {
    if (!this.persistentCharacterIds.has(sessionId)) return;
    void this.persistPlayerProgressNow(sessionId, player);
  }

  private persistPlayerProgressIfChanged(sessionId: string, player: PlayerState) {
    const characterId = this.persistentCharacterIds.get(sessionId);
    if (!characterId) return;

    const state = makePersistableCharacterState(characterId, player);
    const fingerprint = getPersistableCharacterStateFingerprint(state);
    if (this.savedCharacterFingerprints.get(characterId) === fingerprint) return;
    if (this.queuedCharacterSaveFingerprints.get(characterId) === fingerprint) return;

    void this.queueCharacterSave(sessionId, characterId, state, fingerprint);
  }

  private async notifyAgentSeason0GateStatus(
    client: Client,
    player: PlayerState,
    phase: "login" | "quest_turn_in" | "trash_vendor" | "fishing_vendor",
  ): Promise<AgentSeason0MferGptGateStatus | undefined> {
    if (!player.isAgent || player.identityType !== "wallet" || !player.walletAddress) return undefined;

    const status = await getAgentSeason0MferGptGateStatus(player.walletAddress);
    this.agentSeason0GateStatuses.set(client.sessionId, status);
    this.recordPlayerAnalyticsEvent("agent_reward_gate_checked", client.sessionId, player, {
      phase,
      eligible: status.eligible,
      reason: status.reason,
      requiredWei: status.requiredWei,
      balanceWei: status.balanceWei,
      requiredLabel: status.requiredLabel,
      balanceLabel: status.balanceLabel,
    });

    if (phase === "login" && this.state.players.get(client.sessionId) === player) {
      client.send("chat", makeSystemChat("Agent Rewards", makeAgentSeason0MferGptGateMessage(status)));
    }

    return status;
  }

  private async awardSeason0QuestReward(client: Client, player: PlayerState, questId: QuestId) {
    const characterId = this.persistentCharacterIds.get(client.sessionId);
    if (!characterId || player.identityType !== "wallet" || !player.walletAddress) return;

    try {
      const agentTokenGate = player.isAgent
        ? await this.notifyAgentSeason0GateStatus(client, player, "quest_turn_in")
        : undefined;
      const result = await awardSeason0QuestReward({
        characterId,
        agentTokenGate,
        isAgent: player.isAgent,
        walletAddress: player.walletAddress,
        questId,
      });
      player.season0Points = result.seasonTotal;
      player.season0DailyPoints = result.dailyTotal;
      this.applyReferralBonusToOnlineReferrer(result);
      this.recordPlayerAnalyticsEvent("season_points_awarded", client.sessionId, player, {
        questId,
        status: result.status,
        points: result.points,
        basePoints: result.basePoints,
        agentMultiplier: result.agentMultiplier,
        isAgent: player.isAgent,
        agentTokenGateEligible: result.agentTokenGate?.eligible,
        agentTokenGateReason: result.agentTokenGate?.reason,
        agentTokenGateRequiredWei: result.agentTokenGate?.requiredWei,
        agentTokenGateBalanceWei: result.agentTokenGate?.balanceWei,
        dailyTotal: result.dailyTotal,
        seasonTotal: result.seasonTotal,
        label: result.label,
      });
      if (result.status === "agent_token_gate" && result.agentTokenGate) {
        client.send("chat", makeSystemChat("Agent Rewards", makeAgentSeason0MferGptGateMessage(result.agentTokenGate)));
        return;
      }
      if (result.status !== "awarded") return;

      const agentGateNote = player.isAgent && result.agentTokenGate?.eligible
        ? ` ${result.agentTokenGate.requiredLabel} gate met (${result.agentTokenGate.balanceLabel}).`
        : "";
      client.send("chat", {
        sessionId: "season-0",
        name: "Season 0",
        identityType: "npc",
        text: `Logged ${result.points}${player.isAgent ? ` agent-adjusted from ${result.basePoints}` : ""} tester points for ${result.label}.${agentGateNote} Daily ${result.dailyTotal}/${SEASON_0_DAILY_POINT_CAP}, season ${result.seasonTotal}/${SEASON_0_TOTAL_POINT_CAP}.`,
        sentAt: Date.now(),
      } satisfies ChatMessage);
    } catch (error) {
      console.error(`Failed to award season points for ${player.walletAddress}`, error);
    }
  }

  private applyReferralBonusToOnlineReferrer(result: SeasonRewardAwardResult) {
    const bonus = result.referralBonus;
    if (!bonus || bonus.referrerPoints <= 0) return;
    for (const onlinePlayer of this.state.players.values()) {
      if (normalizeWalletAddress(onlinePlayer.walletAddress) !== bonus.referrerWalletAddress) continue;
      onlinePlayer.season0Points += bonus.referrerPoints;
      onlinePlayer.season0DailyPoints += bonus.referrerPoints;
    }
  }

  private applySeasonReferralRemovalToOnlinePlayers(result: SeasonReferralRemoveResult) {
    if (!result.ok) return;
    for (const onlinePlayer of this.state.players.values()) {
      const walletAddress = normalizeWalletAddress(onlinePlayer.walletAddress);
      if (walletAddress === result.referrerWalletAddress) {
        onlinePlayer.season0Points = result.referrerSeason0Points;
        onlinePlayer.season0DailyPoints = result.referrerSeason0DailyPoints;
      } else if (walletAddress === result.refereeWalletAddress) {
        onlinePlayer.season0Points = result.refereeSeason0Points;
        onlinePlayer.season0DailyPoints = result.refereeSeason0DailyPoints;
      }
    }
  }

  private async persistPlayerProgressNow(
    sessionId: string,
    player: PlayerState,
    traitPayment: VerifiedTraitPayment | null = null,
  ): Promise<boolean> {
    const characterId = this.persistentCharacterIds.get(sessionId);
    if (!characterId) return false;

    const state = makePersistableCharacterState(characterId, player);
    return this.queueCharacterSave(
      sessionId,
      characterId,
      state,
      getPersistableCharacterStateFingerprint(state),
      traitPayment
        ? (nextState) => saveCharacterProgressWithTraitPayment(nextState, traitPayment)
        : saveCharacterProgress,
    );
  }

  private async queueCharacterSave(
    sessionId: string,
    characterId: string,
    state: PersistableCharacterState,
    fingerprint = getPersistableCharacterStateFingerprint(state),
    saveProgress: (state: PersistableCharacterState) => Promise<void> = saveCharacterProgress,
  ): Promise<boolean> {
    const previous = this.pendingCharacterSaves.get(characterId) ?? Promise.resolve(true);
    this.queuedCharacterSaveFingerprints.set(characterId, fingerprint);
    this.sendPersistenceStatus(sessionId, "saving", "saving wallet progress");
    let next: Promise<boolean>;
    next = previous
      .catch(() => false)
      .then(async () => {
        try {
          await saveProgress(state);
          if (this.pendingCharacterSaves.get(characterId) === next) {
            this.savedCharacterFingerprints.set(characterId, fingerprint);
            this.sendPersistenceStatus(sessionId, "saved", "wallet progress saved");
          }
          return true;
        } catch (error) {
          this.sendPersistenceStatus(sessionId, "error", "wallet progress failed to save");
          console.error(`Failed to persist character ${characterId}`, error);
          return false;
        }
      });

    this.pendingCharacterSaves.set(characterId, next);
    next.finally(() => {
      if (this.pendingCharacterSaves.get(characterId) === next) {
        this.pendingCharacterSaves.delete(characterId);
        this.queuedCharacterSaveFingerprints.delete(characterId);
      }
    }).catch(() => undefined);
    return next;
  }

  private autosaveWalletCharacters(now: number) {
    if (now - this.lastCharacterAutosaveAt < CHARACTER_AUTOSAVE_INTERVAL_MS) return;
    this.lastCharacterAutosaveAt = now;
    this.state.players.forEach((player, sessionId) => {
      this.persistPlayerProgressIfChanged(sessionId, player);
    });
  }

  private cleanupCharacterSaveTracking(characterId: string) {
    for (const activeCharacterId of this.persistentCharacterIds.values()) {
      if (activeCharacterId === characterId) return;
    }
    this.pendingCharacterSaves.delete(characterId);
    this.queuedCharacterSaveFingerprints.delete(characterId);
    this.savedCharacterFingerprints.delete(characterId);
  }

  private sendPersistenceStatus(sessionId: string, state: "saving" | "saved" | "error", message: string) {
    const client = this.clients.find((entry) => entry.sessionId === sessionId);
    client?.send("persistenceStatus", { state, message });
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    this.syncDailySignalHub(now);
    this.removeExpiredTemporaryNpcs(now);
    this.pruneNpcDamageTags(now);
    this.applyThreatTargets(now);
    this.disconnectIdleAgents(now);
    const leashResetNpcIds = updateNpcs(
      this.state.npcs,
      this.state.players,
      delta,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
    for (const npcId of leashResetNpcIds) this.clearNpcThreat(npcId);
    processPendingCombatImpacts(
      this.pendingCombatImpacts,
      this.state.players,
      this.state.npcs,
      now,
      (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
      (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
    );
    this.removeInactiveDailyRaidBoss(now);

    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      const activeInput = input && now - input.receivedAt < 1000 ? input : null;
      if (removeExpiredPlayerBuffs(player, now)) {
        recalculatePlayerStats(player);
        this.persistPlayerProgress(sessionId, player);
      }
      updatePlayerRegen(player, delta, now);
      if (player.health <= 0) {
        if (!this.deadSessionIds.has(sessionId)) {
          this.deadSessionIds.add(sessionId);
          this.recordPlayerAnalyticsEvent("player_death", sessionId, player, {
            level: player.level,
            x: Math.round(player.x),
            z: Math.round(player.z),
          });
        }
        player.verticalVelocity = 0;
        player.animation = "idle";
        this.playerAnimationHolds.delete(sessionId);
        clearPlayerEmote(player);
        clearPlayerCast(player);
        this.cancelFishing(sessionId, player);
        return;
      }
      if (player.frozenUntil > 0 && player.frozenUntil <= now) player.frozenUntil = 0;
      const isPlayerFrozen = player.frozenUntil > now;
      if (isPlayerFrozen) {
        clearPlayerCast(player);
        this.playerAnimationHolds.delete(sessionId);
        if (player.fishingState) this.cancelFishing(sessionId, player);
      }
      if (player.emote && player.emoteEndsAt > 0 && now >= player.emoteEndsAt) {
        clearPlayerEmote(player);
      }
      if (!isPlayerFrozen) {
        if (player.castingAction === "heal") {
          this.updatePlayerHealCast(sessionId, player, activeInput, now);
        } else {
          updatePlayerCast(
            sessionId,
            player,
            activeInput,
            this.state.npcs,
            now,
            (event) => this.broadcast("combatEvent", event),
            this.pendingCombatImpacts,
            (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
            (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
            (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
          );
        }
      }
      let grounded = player.y <= 0.001;

      if (!isPlayerFrozen && activeInput?.jump && !this.jumpHeld.get(sessionId) && grounded) {
        player.verticalVelocity = PLAYER.jumpVelocity;
        grounded = false;
      }
      this.jumpHeld.set(sessionId, Boolean(!isPlayerFrozen && activeInput?.jump));
      if (!isPlayerFrozen && activeInput?.jump) {
        clearPlayerEmote(player);
      }

      if (!grounded || Math.abs(player.verticalVelocity) > 0.001) {
        player.verticalVelocity -= PLAYER.gravity * delta;
        player.y += player.verticalVelocity * delta;
        if (player.y <= 0) {
          player.y = 0;
          player.verticalVelocity = 0;
          grounded = true;
        }
      }

      if (player.fishingState) {
        this.updateFishingAttempt(sessionId, player, activeInput, now, grounded);
        if (player.fishingState) {
          if (activeInput) {
            player.yaw = activeInput.yaw;
            player.lastSeq = activeInput.seq;
          }
          this.jumpHeld.set(sessionId, false);
          return;
        }
      }

      if (isPlayerFrozen) {
        if (activeInput) {
          player.yaw = activeInput.yaw;
          player.lastSeq = activeInput.seq;
        }
        player.animation = grounded ? "idle" : "jump";
        this.applyPlayerAnimationHold(sessionId, player, now);
        return;
      }

      if (!activeInput) {
        player.animation = grounded ? "idle" : "jump";
        this.applyPlayerAnimationHold(sessionId, player, now);
        return;
      }

      const length = Math.hypot(activeInput.x, activeInput.z);
      player.yaw = activeInput.yaw;
      player.lastSeq = activeInput.seq;

      if (length < 0.01) {
        player.animation = grounded ? "idle" : "jump";
        this.applyPlayerAnimationHold(sessionId, player, now);
        return;
      }

      clearPlayerEmote(player);
      const nx = activeInput.x / length;
      const nz = activeInput.z / length;
      const speed = (activeInput.sprint ? player.runSpeed : player.walkSpeed) * Math.min(length, 1);
      const nextPosition = resolveWorldCollision(
        player.x + nx * speed * delta,
        player.z + nz * speed * delta,
        PLAYER.radius,
      );
      player.x = nextPosition.x;
      player.z = nextPosition.z;
      player.animation = grounded ? (activeInput.sprint ? "run" : "walk") : "jump";
      this.applyPlayerAnimationHold(sessionId, player, now);
      this.markAgentMovementActivity(sessionId, player, now);
    });
    this.flushReadyFishingLoot(now);
    this.autosaveWalletCharacters(now);
    this.publishLiveMemoryStatus(now);
  }

  private creditNearbyPlayersForNpcDefeat(sourceId: string, npc: NpcState, now: number) {
    const mobXp = getNpcDefeatXp(npc);
    const creditedSessionIds = new Set<string>();
    const taggedPlayers = this.npcDamageTags.get(npc.id);

    this.state.players.forEach((player, sessionId) => {
      if (isEligibleForDefeatCredit(player, npc)) creditedSessionIds.add(sessionId);
    });
    if (sourceId) creditedSessionIds.add(sourceId);
    taggedPlayers?.forEach((taggedAt, sessionId) => {
      if (now - taggedAt <= NPC_DAMAGE_TAG_TTL_MS) creditedSessionIds.add(sessionId);
    });

    const sourcePlayer = this.state.players.get(sourceId);
    const isTemporaryNpc = this.temporaryNpcExpiresAt.has(npc.id);
    const isBossNpc = isAnalyticsBossNpc(npc);
    this.recordPlayerAnalyticsEvent("npc_defeated", sourceId, sourcePlayer, {
      npcId: npc.id,
      npcName: npc.name,
      npcRole: npc.role,
      npcModel: npc.model,
      xpReward: mobXp,
      creditedPlayers: creditedSessionIds.size,
      temporary: isTemporaryNpc,
    });
    if (isBossNpc) {
      this.recordPlayerAnalyticsEvent("boss_defeated", sourceId, sourcePlayer, {
        npcId: npc.id,
        npcName: npc.name,
        creditedPlayers: creditedSessionIds.size,
      });
    }
    if (isBossNpc || isTemporaryNpc) {
      recordMferlandNpcDefeated({
        sourceName: sourcePlayer?.name ?? "mfer",
        sourceLevel: sourcePlayer?.level ?? 1,
        npcName: npc.name,
        label: isBossNpc ? "boss" : "temporary npc",
        creditedPlayers: creditedSessionIds.size,
      });
      this.publishLiveMemoryStatus(now, true);
    }

    for (const sessionId of creditedSessionIds) {
      const player = this.state.players.get(sessionId);
      if (!player || player.health <= 0) continue;
      const questProgressed = progressDefeatQuests(player, npc);
      const award = awardExperience(player, mobXp);
      if (award.levelsGained > 0) recalculatePlayerStats(player);
      this.recordPlayerAnalyticsEvent("npc_defeat_credit", sessionId, player, {
        npcId: npc.id,
        npcRole: npc.role,
        npcModel: npc.model,
        xpGained: award.xpGained,
        levelsGained: award.levelsGained,
        level: player.level,
        questProgressed,
      });
      if (award.levelsGained > 0) {
        this.recordPlayerAnalyticsEvent("player_level_up", sessionId, player, {
          levelsGained: award.levelsGained,
          level: player.level,
          source: "npc_defeat",
          npcId: npc.id,
          npcModel: npc.model,
        });
      }
      if (award.xpGained > 0) {
        this.sendExperienceEvent(sessionId, npc, award.xpGained, now);
      }
      if (questProgressed || award.xpGained > 0 || award.levelsGained > 0) {
        this.persistPlayerProgress(sessionId, player);
      }
    }

    this.npcDamageTags.delete(npc.id);
  }

  private recordPlayerAnalyticsEvent(
    eventType: string,
    sessionId: string,
    player: PlayerState | undefined,
    properties: AnalyticsProperties = {},
  ) {
    void recordAnalyticsEvent({
      eventType,
      sessionId,
      characterId: this.persistentCharacterIds.get(sessionId) ?? null,
      identityType: player?.identityType ?? "",
      walletAddress: player?.walletAddress ?? "",
      properties: {
        ...properties,
        isAgent: Boolean(player?.isAgent),
      },
    });
  }

  private recordTraitChangeSupportEvent(
    eventType: "trait_change_attempted" | "trait_change_saved" | "trait_change_failed",
    sessionId: string,
    player: PlayerState,
    {
      afterName,
      afterTraits,
      attemptId,
      beforeName,
      beforeTraits,
      error = "",
      payment,
    }: {
      afterName: string;
      afterTraits: Record<string, string>;
      attemptId: string;
      beforeName: string;
      beforeTraits: Record<string, string>;
      error?: string;
      payment: Record<string, unknown>;
    },
  ) {
    void recordAnalyticsEvent({
      eventType,
      sessionId,
      characterId: this.persistentCharacterIds.get(sessionId) ?? null,
      identityType: player.identityType,
      walletAddress: player.walletAddress,
      properties: {
        supportKind: "trait_change",
        attemptId,
        beforeName,
        afterName,
        beforeTraits,
        afterTraits,
        ...payment,
        ...(error ? { error } : {}),
      },
    });
  }

  private sendExperienceEvent(sessionId: string, npc: NpcState, amount: number, now: number) {
    const client = this.clients.find((entry) => entry.sessionId === sessionId);
    if (!client) return;

    const payload: ExperienceEvent = {
      id: `${now}:${sessionId}:${npc.id}:xp:${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      sourceNpcId: npc.id,
      amount,
      x: npc.x,
      y: npc.y + 1.35,
      z: npc.z,
      sentAt: now,
    };
    client.send("experienceEvent", payload);
  }

  private tagNpcForCredit(sourceId: string, npc: NpcState, now: number) {
    if (!sourceId || npc.isImmortal || npc.health <= 0) return;

    const taggedPlayers = this.npcDamageTags.get(npc.id) ?? new Map<string, number>();
    taggedPlayers.set(sourceId, now);
    this.npcDamageTags.set(npc.id, taggedPlayers);
    if (npc.id === DAILY_RAID_BOSS_NPC_ID) {
      this.dailyRaidBossInactiveDespawnAt = now + DAILY_RAID_BOSS_INACTIVE_DESPAWN_MS;
    }
  }

  private pruneNpcDamageTags(now: number) {
    for (const [npcId, taggedPlayers] of this.npcDamageTags) {
      for (const [sessionId, taggedAt] of taggedPlayers) {
        if (now - taggedAt > NPC_DAMAGE_TAG_TTL_MS) taggedPlayers.delete(sessionId);
      }
      if (taggedPlayers.size === 0 || !this.state.npcs.has(npcId)) {
        this.npcDamageTags.delete(npcId);
      }
    }
  }

  private removeExpiredTemporaryNpcs(now: number) {
    for (const [npcId, expiresAt] of this.temporaryNpcExpiresAt) {
      const npc = this.state.npcs.get(npcId);
      if (!npc) {
        this.temporaryNpcExpiresAt.delete(npcId);
        continue;
      }

      const defeatedAndDespawned = !isNpcAlive(npc) && npc.despawnAt > 0 && now >= npc.despawnAt;
      if (now < expiresAt && !defeatedAndDespawned) continue;

      this.state.npcs.delete(npcId);
      this.temporaryNpcExpiresAt.delete(npcId);
    }
  }

  private logMferGptCommand(
    sessionId: string,
    playerName: string,
    command: MferGptCommand,
    accepted: boolean,
    reason: string,
    latencyMs: number,
    temporaryNpcIds: string[],
  ) {
    console.info("mfergpt.command", {
      sessionId,
      playerName,
      command,
      accepted,
      reason,
      latencyMs,
      temporaryNpcIds,
    });
  }
}

function makeMferGptChatMessage(text: string, sentAt: number): ChatMessage {
  return {
    sessionId: MFERGPT.npcId,
    name: "mferGPT",
    identityType: "npc",
    text,
    sentAt,
  };
}

function makeSystemChat(name: string, text: string): ChatMessage {
  return {
    sessionId: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
    name,
    identityType: "npc",
    text,
    sentAt: Date.now(),
  };
}

function getPotionShopLedgerTokenId(itemId: string, quantity: number) {
  return quantity > 1 ? `${itemId}:x${quantity}` : itemId;
}

function makeTraitChangeAttemptId(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().replaceAll(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 96);
    if (normalized) return normalized;
  }
  return `trait-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeMferGptPaymentProof(payment: unknown): Record<string, unknown> {
  if (!payment || typeof payment !== "object") return {};
  const proof = payment as Record<string, unknown>;
  return {
    paymentToken: sanitizeSupportText(proof.token),
    chainId: Number.isFinite(Number(proof.chainId)) ? Number(proof.chainId) : 0,
    chainTx: normalizeSupportTxHash(proof.txHash),
    contractAddress: normalizeSupportAddress(proof.contractAddress),
    paymentAmountWei: sanitizeSupportIntegerString(proof.amountWei),
  };
}

function summarizeVerifiedMferGptPayment(payment: VerifiedMferGptBurnPayment): Record<string, unknown> {
  return {
    paymentToken: "MFERGPT",
    chainId: payment.chainId,
    chainTx: payment.txHash,
    contractAddress: payment.tokenAddress,
    logIndex: payment.logIndex,
    paymentAmountWei: payment.amountWei,
  };
}

function sanitizeSupportText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

function sanitizeAgentStatusText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function sanitizeAgentStatusNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(10_000_000_000_000, Math.floor(number));
}

function makeAgentCommandBudgetJson(message: Partial<ClientAgentStatus>) {
  const budget = {
    status: sanitizeAgentStatusText(message?.commandStatus, 32),
    budgetTier: sanitizeAgentStatusText(message?.commandBudgetTier, 40),
    startedAt: sanitizeAgentStatusNumber(message?.commandStartedAt),
    maxSeconds: sanitizeAgentStatusNumber(message?.commandMaxSeconds),
    sessionUsedSeconds: sanitizeAgentStatusNumber(message?.commandSessionUsedSeconds),
    sessionRemainingSeconds: sanitizeAgentStatusNumber(message?.commandSessionRemainingSeconds),
    dailyUsedSeconds: sanitizeAgentStatusNumber(message?.commandDailyUsedSeconds),
    dailyRemainingSeconds: sanitizeAgentStatusNumber(message?.commandDailyRemainingSeconds),
    dailySeconds: sanitizeAgentStatusNumber(message?.commandDailySeconds),
  };
  return JSON.stringify(budget).slice(0, 512);
}

function parseAgentCommandBudgetJson(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    return {
      status: sanitizeAgentStatusText(parsed.status, 32),
      budgetTier: sanitizeAgentStatusText(parsed.budgetTier, 40),
      startedAt: sanitizeAgentStatusNumber(parsed.startedAt),
      maxSeconds: sanitizeAgentStatusNumber(parsed.maxSeconds),
      sessionUsedSeconds: sanitizeAgentStatusNumber(parsed.sessionUsedSeconds),
      sessionRemainingSeconds: sanitizeAgentStatusNumber(parsed.sessionRemainingSeconds),
      dailyUsedSeconds: sanitizeAgentStatusNumber(parsed.dailyUsedSeconds),
      dailyRemainingSeconds: sanitizeAgentStatusNumber(parsed.dailyRemainingSeconds),
      dailySeconds: sanitizeAgentStatusNumber(parsed.dailySeconds),
    };
  } catch {
    return {
      status: "",
      budgetTier: "",
      startedAt: 0,
      maxSeconds: 0,
      sessionUsedSeconds: 0,
      sessionRemainingSeconds: 0,
      dailyUsedSeconds: 0,
      dailyRemainingSeconds: 0,
      dailySeconds: 0,
    };
  }
}

function sanitizeSupportIntegerString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[0-9]{1,80}$/.test(normalized) ? normalized : "";
}

function normalizeSupportTxHash(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function normalizeSupportAddress(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function isDeclaredAgentClient(options: JoinOptions | undefined) {
  return options?.agentClient === true || options?.identityType === "agent";
}

function getRequestedWalletClientKind(options: JoinOptions | undefined, walletAddress: string) {
  if (!walletAddress) return "";
  return isDeclaredAgentClient(options) ? "agent" : "human";
}

function isEligibleForDefeatCredit(player: PlayerState, npc: NpcState) {
  if (player.health <= 0) return false;
  const radius = npc.id === "raid-ogre-mfer" || npc.id === MFERGPT_DAILY_BOSS_NPC_ID
    ? 38
    : PROGRESSION.nearbyCreditRadius;
  return Math.hypot(player.x - npc.x, player.z - npc.z) <= radius;
}

function getLocalDebugAutoBoostMessage(): DebugBoostPlayerMessage | null {
  if (process.env.NODE_ENV !== "development") return null;
  const requestedLevel = process.env.MFERLAND_DEBUG_BOOST_LEVEL;
  if (!requestedLevel) return null;

  return {
    level: requestedLevel,
    maxTalents: process.env.MFERLAND_DEBUG_BOOST_MAX_TALENTS !== "0",
  };
}

function applyDebugBoostPlayer(player: PlayerState, message: DebugBoostPlayerMessage) {
  const requestedLevel = Number(message.level);
  player.level = Number.isFinite(requestedLevel) ? clamp(Math.round(requestedLevel), 1, 40) : 12;
  player.xp = Math.max(player.xp, 0);
  const debugTalentPoints = Math.max(0, player.level - 1);
  player.talentPoints = message.maxTalents === false ? debugTalentPoints : 0;
  player.talents.clear();

  if (message.maxTalents !== false) {
    for (const [talentId, definition] of Object.entries(TALENTS)) {
      const talent = new TalentState();
      talent.id = talentId as keyof typeof TALENTS;
      talent.tree = definition.tree;
      talent.nodeId = definition.nodeId;
      talent.rank = definition.maxRank;
      player.talents.set(talent.id, talent);
    }
  }

  normalizePlayerTalents(player);
  recalculatePlayerStats(player);
  player.maxHealth = Math.max(player.maxHealth, 1800);
  player.maxMana = Math.max(player.maxMana, 260);
  player.strength = Math.max(player.strength, 44);
  player.dexterity = Math.max(player.dexterity, 44);
  player.magic = Math.max(player.magic, 44);
  player.walkSpeed = Math.max(player.walkSpeed, PLAYER.walkSpeed + 0.8);
  player.runSpeed = Math.max(player.runSpeed, PLAYER.runSpeed + 1.2);
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  player.attackReadyAt = 0;
  player.shootReadyAt = 0;
  player.signalShotReadyAt = 0;
  player.fireblastReadyAt = 0;
  player.frostNovaReadyAt = 0;
  player.healReadyAt = 0;
  player.tauntReadyAt = 0;
  player.whirlwindReadyAt = 0;
  player.multishotReadyAt = 0;
  player.iceBlastReadyAt = 0;
  player.frozenUntil = 0;
  clearPlayerCast(player);
}

async function loadPersistedCharacter(
  walletAddress: string,
  name: string,
  avatarSeed: number,
  options: {
    createIfMissing: boolean;
    referralWalletAddress: string;
    clientKind: "human" | "agent";
  },
) {
  try {
    return await loadOrCreateWalletCharacter({
      walletAddress,
      displayName: name,
      avatarSeed,
      createIfMissing: options.createIfMissing,
      referralWalletAddress: options.referralWalletAddress,
      clientKind: options.clientKind,
      claimClientKind: true,
    });
  } catch (error) {
    if (error instanceof WalletClientKindMismatchError) {
      throw new ServerError(ErrorCode.AUTH_FAILED, error.message);
    }
    console.error(`Failed to load persisted character for ${walletAddress}`, error);
    if (error instanceof PersistenceUnavailableError) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "wallet persistence unavailable");
    }
    throw new ServerError(ErrorCode.AUTH_FAILED, "wallet persistence failed");
  }
}

function applyPersistedCharacter(player: PlayerState, character: PersistedCharacter) {
  player.quests.clear();
  for (const savedQuest of character.quests) {
    const quest = new QuestState();
    quest.id = savedQuest.id;
    quest.status = savedQuest.status;
    quest.progress = savedQuest.progress;
    quest.required = savedQuest.required;
    quest.flags = savedQuest.flags;
    quest.completedAt = savedQuest.completedAt;
    player.quests.set(savedQuest.id, quest);
  }

  player.inventory.clear();
  for (const savedItem of character.inventory) {
    const item = new InventoryItemState();
    item.id = savedItem.id;
    item.chainTokenId = normalizeChainTokenId(savedItem.chainTokenId);
    item.chainTier = normalizeChainGearTier(savedItem.chainTier);
    item.count = savedItem.count;
    player.inventory.set(getInventoryItemKey(savedItem.id, item.chainTokenId), item);
  }

  player.equipment.clear();
  for (const savedSlot of character.equipment) {
    const slot = new EquipmentSlotState();
    slot.slot = savedSlot.slot;
    slot.itemId = savedSlot.itemId;
    slot.chainTokenId = normalizeChainTokenId(savedSlot.chainTokenId);
    slot.chainTier = normalizeChainGearTier(savedSlot.chainTier);
    player.equipment.set(savedSlot.slot, slot);
  }

  player.talents.clear();
  for (const savedTalent of character.talents) {
    const talent = new TalentState();
    talent.id = savedTalent.id;
    talent.tree = savedTalent.tree;
    talent.nodeId = savedTalent.nodeId;
    talent.rank = savedTalent.rank;
    player.talents.set(savedTalent.id, talent);
  }

  player.activeBuffs.clear();
  const now = Date.now();
  for (const savedBuff of character.activeBuffs) {
    if (savedBuff.expiresAt <= now) continue;
    const buff = new ActiveBuffState();
    buff.id = savedBuff.id;
    buff.startedAt = savedBuff.startedAt;
    buff.expiresAt = savedBuff.expiresAt;
    player.activeBuffs.set(savedBuff.id, buff);
  }
}

function applySessionHandoff(player: PlayerState, handoff: SessionHandoff) {
  player.x = handoff.x;
  player.y = handoff.y;
  player.z = handoff.z;
  player.yaw = handoff.yaw;
}

function applySavedDebugNpcPlacements(npcs: TownState["npcs"], placements: Record<string, DebugPlacementRecord>) {
  for (const [id, placement] of Object.entries(placements)) {
    if (!id.startsWith("npc:")) continue;
    const npc = npcs.get(id.slice("npc:".length));
    if (!npc) continue;
    npc.x = placement.x;
    npc.y = 0;
    npc.z = placement.z;
    npc.yaw = placement.rotation;
    npc.homeX = placement.x;
    npc.homeZ = placement.z;
    npc.targetX = placement.x;
    npc.targetZ = placement.z;
  }
}

function filterWorldDebugPlacements(placements: Record<string, DebugPlacementRecord>) {
  const worldPlacements: Record<string, DebugPlacementRecord> = {};
  for (const [id, placement] of Object.entries(placements)) {
    if (!id.startsWith("npc:")) worldPlacements[id] = placement;
  }
  return worldPlacements;
}

function normalizePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeDebugNpcRole(value: unknown) {
  if (
    value === "wanderer"
    || value === "quest_giver"
    || value === "merchant"
    || value === "guard"
    || value === "enemy"
    || value === "critter"
    || value === "beast"
    || value === "farmer"
  ) {
    return value;
  }
  return "farmer";
}

function normalizeDebugNpcModel(value: unknown) {
  if (
    value === "mfer"
    || value === "mfergpt"
    || value === "rabbit"
    || value === "deer"
    || value === "hog"
    || value === "training-dummy"
  ) {
    return value;
  }
  return "mfer";
}

function normalizeDebugNpcCombatStyle(value: unknown) {
  if (value === "melee" || value === "caster") return value;
  return "melee";
}

export async function readDebugPlacementMap() {
  try {
    const text = await readFile(DEBUG_PLACEMENT_MAP_PATH, "utf8");
    const document = JSON.parse(text) as { placements?: unknown; sourceDefaults?: unknown };
    return {
      placements: normalizeDebugPlacementRecordMap(document.placements),
      sourceDefaults: normalizeDebugPlacementRecordMap(document.sourceDefaults),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { placements: {}, sourceDefaults: {} };
    }
    console.warn("debug_placement_map_load_failed", error);
    return { placements: {}, sourceDefaults: {} };
  }
}

function normalizeDebugPlacementRecordMap(value: unknown) {
  const records: Record<string, DebugPlacementRecord> = {};
  if (!value || typeof value !== "object") return records;
  for (const [id, rawRecord] of Object.entries(value as Record<string, unknown>)) {
    const record = normalizeDebugPlacementRecord(rawRecord);
    if (!record) continue;
    records[id] = record;
  }
  return records;
}

function normalizeDebugPlacementRecord(value: unknown): DebugPlacementRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const z = Number(record.z);
  const rotation = Number(record.rotation);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return null;
  return {
    x: Math.round(x * 10) / 10,
    z: Math.round(z * 10) / 10,
    rotation,
    ...(typeof record.kind === "string" ? { kind: record.kind.slice(0, 32) } : {}),
    ...(typeof record.label === "string" ? { label: record.label.slice(0, 160) } : {}),
    ...(typeof record.source === "string" ? { source: record.source.slice(0, 160) } : {}),
  };
}

function normalizeDebugPlacementSaveId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return "";
  return /^[a-z0-9:_-]+$/i.test(trimmed) ? trimmed : "";
}

function normalizeDebugPlacementChunkNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function normalizeClientAnalyticsProperties(value: unknown): AnalyticsProperties {
  const properties: AnalyticsProperties = {};
  if (!value || typeof value !== "object") return properties;

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/.test(key)) continue;
    if (typeof rawValue === "string") {
      properties[key] = rawValue.slice(0, 160);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      properties[key] = rawValue;
    } else if (typeof rawValue === "boolean" || rawValue === null) {
      properties[key] = rawValue;
    }
  }

  return properties;
}

function isAnalyticsBossNpc(npc: NpcState) {
  return npc.id === "static-baron-nox" || npc.id === "raid-ogre-mfer" || npc.id === MFERGPT_DAILY_BOSS_NPC_ID;
}

function normalizeEmoteId(value: unknown): EmoteId | null {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(EMOTES, value) ? value as EmoteId : null;
}

function clearPlayerEmote(player: PlayerState) {
  player.emote = "";
  player.emoteStartedAt = 0;
  player.emoteEndsAt = 0;
}

type TrashSalePlan = {
  sold: TrashVendorSoldItem[];
  removals: Array<{ key: string; quantity: number }>;
  quantity: number;
  points: number;
};

type FishingSalePlan = {
  sold: FishingVendorSoldItem[];
  removals: Array<{ key: string; quantity: number }>;
  quantity: number;
  points: number;
  basePoints: number;
};

type InventoryStateSnapshot = Array<{
  key: string;
  id: ItemId;
  chainTokenId: string;
  chainTier: number;
  count: number;
}>;

function normalizeTrashSellQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return clamp(Math.floor(quantity), 1, 999);
}

function normalizeFishingSellQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return clamp(Math.floor(quantity), 1, 999);
}

function getTrashSaleAwardPoints(quantity: number, isAgent: boolean) {
  return isAgent ? getAgentTrashVendorAwardPoints(quantity) : getTrashVendorSellValue(quantity);
}

function getMaxTrashSaleQuantityForPointCapacity(
  player: PlayerState,
  options: {
    itemId: TrashVendorItemId | null;
    requestedQuantity: number;
    pointCapacity: number;
    isAgent: boolean;
  },
) {
  const requestedQuantity = Number.isFinite(options.requestedQuantity)
    ? Math.max(0, Math.floor(options.requestedQuantity))
    : Number.MAX_SAFE_INTEGER;
  const availableQuantity = getSellableTrashItemCount(player, options.itemId);
  const upperBound = Math.min(requestedQuantity, availableQuantity);
  if (!options.isAgent) return Math.min(upperBound, options.pointCapacity);
  return getAgentTrashVendorPayableQuantity(upperBound, options.pointCapacity);
}

function planTrashSale(
  player: PlayerState,
  options: { itemId: TrashVendorItemId | null; maxQuantity: number },
): TrashSalePlan {
  const maxQuantity = Math.max(0, Math.floor(options.maxQuantity));
  const candidateItemIds = options.itemId ? [options.itemId] : [...TRASH_VENDOR_ITEM_IDS];
  const soldCounts = new Map<TrashVendorItemId, number>();
  const removals: TrashSalePlan["removals"] = [];
  let remaining = maxQuantity;

  for (const itemId of candidateItemIds) {
    if (remaining <= 0) break;
    player.inventory.forEach((item, key) => {
      if (remaining <= 0) return;
      if (item.id !== itemId || normalizeChainTokenId(item.chainTokenId)) return;
      if (!isTrashVendorItemId(item.id) || item.count <= 0) return;

      const quantity = Math.min(item.count, remaining);
      removals.push({ key, quantity });
      soldCounts.set(item.id, (soldCounts.get(item.id) ?? 0) + quantity);
      remaining -= quantity;
    });
  }

  const sold: TrashVendorSoldItem[] = [];
  for (const itemId of candidateItemIds) {
    const quantity = soldCounts.get(itemId) ?? 0;
    if (quantity <= 0) continue;
    sold.push({
      itemId,
      itemName: ITEMS[itemId].name,
      quantity,
      points: getTrashVendorSellValue(quantity),
    });
  }
  const quantity = sold.reduce((total, item) => total + item.quantity, 0);

  return {
    sold,
    removals,
    quantity,
    points: getTrashVendorSellValue(quantity),
  };
}

function applyTrashSale(player: PlayerState, removals: TrashSalePlan["removals"]) {
  for (const removal of removals) {
    const item = player.inventory.get(removal.key);
    if (!item) continue;
    item.count = Math.max(0, item.count - removal.quantity);
    if (item.count <= 0) player.inventory.delete(removal.key);
  }
}

function planFishingSale(
  player: PlayerState,
  options: {
    itemId: FishingSellableItemId | null;
    requestedQuantity: number;
    pointCapacity: number;
    isAgent: boolean;
  },
): FishingSalePlan {
  const requestedQuantity = Number.isFinite(options.requestedQuantity)
    ? Math.max(0, Math.floor(options.requestedQuantity))
    : Number.MAX_SAFE_INTEGER;
  const candidateItemIds = options.itemId ? [options.itemId] : [...FISHING_SELLABLE_ITEM_IDS];
  const soldCounts = new Map<FishingSellableItemId, number>();
  const removals: FishingSalePlan["removals"] = [];
  let remainingRequested = requestedQuantity;
  let remainingPointCapacity = Number.isFinite(options.pointCapacity)
    ? Math.max(0, Math.floor(options.pointCapacity))
    : Number.MAX_SAFE_INTEGER;

  for (const itemId of candidateItemIds) {
    if (remainingRequested <= 0) break;
    const rule = getFishingSaleRule(itemId);
    const available = getSellableFishingItemCount(player, itemId);
    const cappedByRequest = Math.min(available, remainingRequested);
    const quantity = getFishingPayableQuantity(itemId, cappedByRequest, remainingPointCapacity, options.isAgent);
    if (quantity <= 0) continue;
    const points = getFishingSellAwardPoints(itemId, quantity, options.isAgent);
    let remainingForItem = quantity;
    player.inventory.forEach((item, key) => {
      if (remainingForItem <= 0) return;
      if (item.id !== itemId || normalizeChainTokenId(item.chainTokenId)) return;
      if (!isFishingSellableItemId(item.id) || item.count <= 0) return;

      const removalQuantity = Math.min(item.count, remainingForItem);
      removals.push({ key, quantity: removalQuantity });
      soldCounts.set(item.id, (soldCounts.get(item.id) ?? 0) + removalQuantity);
      remainingForItem -= removalQuantity;
    });
    remainingRequested -= quantity;
    if (rule.seasonPoints > 0) remainingPointCapacity = Math.max(0, remainingPointCapacity - points);
  }

  const sold: FishingVendorSoldItem[] = [];
  for (const itemId of candidateItemIds) {
    const quantity = soldCounts.get(itemId) ?? 0;
    if (quantity <= 0) continue;
    sold.push({
      itemId,
      itemName: ITEMS[itemId].name,
      quantity,
      points: getFishingSellAwardPoints(itemId, quantity, options.isAgent),
      bundleSize: getFishingRequiredBundleSize(itemId, options.isAgent),
    });
  }
  const quantity = sold.reduce((total, item) => total + item.quantity, 0);
  const points = sold.reduce((total, item) => total + item.points, 0);
  const basePoints = sold.reduce((total, item) => total + getFishingSellAwardPoints(item.itemId, item.quantity, false), 0);

  return {
    sold,
    removals,
    quantity,
    points,
    basePoints,
  };
}

function applyFishingSale(player: PlayerState, removals: FishingSalePlan["removals"]) {
  for (const removal of removals) {
    const item = player.inventory.get(removal.key);
    if (!item) continue;
    item.count = Math.max(0, item.count - removal.quantity);
    if (item.count <= 0) player.inventory.delete(removal.key);
  }
}

function snapshotInventoryState(player: PlayerState): InventoryStateSnapshot {
  const snapshot: InventoryStateSnapshot = [];
  player.inventory.forEach((item, key) => {
    snapshot.push({
      key,
      id: item.id,
      chainTokenId: normalizeChainTokenId(item.chainTokenId),
      chainTier: normalizeChainGearTier(item.chainTier),
      count: item.count,
    });
  });
  return snapshot;
}

function restoreInventoryState(player: PlayerState, snapshot: InventoryStateSnapshot) {
  player.inventory.clear();
  for (const entry of snapshot) {
    const item = new InventoryItemState();
    item.id = entry.id;
    item.chainTokenId = normalizeChainTokenId(entry.chainTokenId);
    item.chainTier = normalizeChainGearTier(entry.chainTier);
    item.count = entry.count;
    player.inventory.set(entry.key, item);
  }
}

function formatTrashSoldSummary(sold: TrashVendorSoldItem[]) {
  return sold.map((item) => `${item.itemName} x${item.quantity}`).join(", ") || "trash";
}

function formatFishingSoldSummary(sold: FishingVendorSoldItem[]) {
  return sold.map((item) => `${item.itemName} x${item.quantity}`).join(", ") || "pond stuff";
}

function formatSeasonPoints(points: number) {
  return `${points} season point${points === 1 ? "" : "s"}`;
}

function makeSeason0MferGptGateMessage(status: AgentSeason0MferGptGateStatus) {
  if (status.reason === "disabled" || status.eligible) {
    return `Season 0 rewards active: wallet holds ${status.balanceLabel} / ${status.requiredLabel}.`;
  }
  if (status.reason === "insufficient") {
    return `Season 0 points need ${status.requiredLabel} on Base. This wallet holds ${status.balanceLabel}; your stash was not sold.`;
  }
  if (status.reason === "invalid_wallet") {
    return `Season 0 points need a valid wallet with ${status.requiredLabel} on Base. Your stash was not sold.`;
  }
  const detail = status.error ? ` ${status.error}` : "";
  return `Season 0 MFERGPT balance check is unavailable.${detail} Your stash was not sold.`;
}

function shortWalletForChat(walletAddress: string) {
  return walletAddress.length > 12
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : walletAddress;
}

function formatTrashAwardPoints(awardedPoints: number, basePoints: number, isAgent: boolean) {
  const awarded = formatSeasonPoints(awardedPoints);
  if (!isAgent || awardedPoints === basePoints) return awarded;
  return `${awarded} from ${basePoints} trash (${AGENT_TRASH_VENDOR_ITEMS_PER_POINT}:1 agent rate)`;
}

function makeTrashVendorSeasonRewardSourceId(sessionId: string) {
  return `trash-vendor:${Date.now()}:${stableHash(`${sessionId}:${Math.random()}`)}`;
}

function makeFishingVendorSeasonRewardSourceId(sessionId: string) {
  return `fishing-vendor:${Date.now()}:${stableHash(`${sessionId}:${Math.random()}`)}`;
}

function getFishingSupplyLedgerTokenId() {
  return `${FISHING_CHUM_ITEM_ID}:single`;
}

function makeFishingAttemptId(sessionId: string) {
  return `fish:${Date.now()}:${stableHash(`${sessionId}:${Math.random()}`)}`;
}

function makeFishingLootSourceId(attemptId: string) {
  return `${FISHING_LOOT_SOURCE_PREFIX}${stableHash(attemptId)}`;
}

function makeFishingLootWindow(loot: PendingFishingLoot): LootWindow {
  return {
    npcId: loot.sourceId,
    npcName: "Fishing bobber",
    source: "fishing",
    items: [{ id: loot.itemId, chainTokenId: "", count: loot.count }],
  };
}

function getFishingRareChanceMultiplier(player: PlayerState, now: number) {
  const bonusPercent = getPlayerBuffEffectTotals(player, now).fishingRareChancePercent ?? 0;
  return 1 + Math.max(0, bonusPercent) / 100;
}

function shouldCatchLostFishingShoe(player: PlayerState) {
  return player.quests.get("lost-fishing-shoes")?.status === "active";
}

function getFishingLootChatMessage(itemId: FishingCatchItemId, itemName: string) {
  if (itemId === FISHING_LOST_SHOE_ITEM_ID) {
    return `You reeled up ${itemName}. Fish monger is going to pretend those are still wearable. Pick them up before they sink.`;
  }
  return `You caught ${itemName}. Pick it up before it slips away.`;
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getAgentTraitSeed(player: PlayerState) {
  return `${player.walletAddress || "agent"}:${player.name || "mfer-agent"}:${player.avatarSeed}`;
}

function getSellableTrashItemCount(player: PlayerState, itemId: TrashVendorItemId | null) {
  const candidateItemIds = itemId ? [itemId] : [...TRASH_VENDOR_ITEM_IDS];
  return candidateItemIds.reduce((total, candidateItemId) => total + getPlayerItemCount(player, candidateItemId), 0);
}

function getSellableFishingItemCount(player: PlayerState, itemId: FishingSellableItemId | null) {
  const candidateItemIds = itemId ? [itemId] : [...FISHING_SELLABLE_ITEM_IDS];
  return candidateItemIds.reduce((total, candidateItemId) => total + getPlayerItemCount(player, candidateItemId), 0);
}

function getFishingSaleBlockedMessage(itemId: FishingSellableItemId, isAgent: boolean) {
  const required = getFishingRequiredBundleSize(itemId, isAgent);
  const points = getFishingSaleRule(itemId).seasonPoints;
  return isAgent
    ? `agents need ${required} ${ITEMS[itemId].name} for ${formatSeasonPoints(points)}`
    : `need ${required} ${ITEMS[itemId].name} for ${formatSeasonPoints(points)}`;
}

function syncPlayerFishingJson(player: PlayerState) {
  if (!player.fishingState || !player.fishingAttemptId) {
    player.fishingJson = "";
    return;
  }
  player.fishingJson = JSON.stringify({
    attemptId: player.fishingAttemptId,
    zoneId: player.fishingZoneId,
    state: player.fishingState,
    castAt: player.fishingCastAt,
    biteAt: player.fishingBiteAt,
    expiresAt: player.fishingExpiresAt,
    bobberX: player.fishingBobberX,
    bobberZ: player.fishingBobberZ,
  });
}

function syncPlayerFishingNftCatchJson(player: PlayerState, catchSnapshot: FishingNftCatchSnapshot | null) {
  player.fishingNftCatchJson = catchSnapshot ? JSON.stringify(sanitizeFishingNftCatchSnapshotForState(catchSnapshot)) : "";
}

function sanitizeFishingNftCatchSnapshotForState(catchSnapshot: FishingNftCatchSnapshot): FishingNftCatchSnapshot {
  const { voucher: _voucher, ...publicSnapshot } = catchSnapshot;
  return publicSnapshot;
}

function makeFishingNftCatchSnapshot(record: PersistedFishingPondCatch | null): FishingNftCatchSnapshot | null {
  if (!record) return null;
  if (record.voucher) {
    const snapshot = makeFishingNftCatchSnapshotFromVoucher({
      status: record.status,
      walletAddress: record.walletAddress,
      voucher: record.voucher,
      metadata: record.metadata,
      txHash: record.txHash,
      error: record.error,
    });
    const mintClubRedemption = makeMintClubRedemptionSnapshot(record);
    return mintClubRedemption ? { ...snapshot, mintClubRedemption } : snapshot;
  }

  const mintClubRedemption = makeMintClubRedemptionSnapshot(record);
  return {
    catchId: record.catchId,
    status: record.status,
    walletActionRequired: record.status === "voucher_issued" || record.status === "tx_submitted",
    walletAddress: record.walletAddress,
    standard: record.standard,
    collection: record.collection,
    tokenId: record.tokenId,
    amount: record.amount,
    pondEntryId: record.pondEntryId,
    chainId: record.chainId,
    contractAddress: record.contractAddress,
    expiresAt: Math.floor(record.expiresAt.getTime() / 1000),
    txHash: record.txHash || undefined,
    error: record.error || undefined,
    metadata: record.metadata || undefined,
    mintClubRedemption,
  };
}

function makeFishingNftCatchId() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function getFishingNftDailyResetAt(now: number) {
  return Math.floor((getFishingNftDay(now) + 1) * FISHING_NFT_DAILY_CAP_MS / 1000);
}

function getFishingNftDay(now: number) {
  return Math.floor(now / FISHING_NFT_DAILY_CAP_MS);
}

function formatFishingPondUtcReset(resetAtSeconds: number) {
  return new Date(resetAtSeconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function makeFishingPondDefaultStatusText(now: number, prefix: string) {
  const resetAt = getFishingNftDailyResetAt(now);
  return `${prefix}: 0/${FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP} onchain-goodie catches used today, ${FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP} NFT catches left, global pond ${FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP}/${FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP} left today, resets at ${formatFishingPondUtcReset(resetAt)} (${formatFishingPondResetCountdown(resetAt, now)})`;
}

function formatFishingPondResetCountdown(resetAtSeconds: number, now: number) {
  const remainingSeconds = Math.max(0, resetAtSeconds - Math.floor(now / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  if (hours <= 0) return minutes <= 1 ? "in about 1 minute" : `in ${minutes} minutes`;
  if (minutes <= 0) return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
  return `in ${hours}h ${minutes}m`;
}

function formatFishingPondCatchStatus(status: FishingNftCatchStatus) {
  if (status === "tx_submitted") return "submitted";
  if (status === "voucher_issued") return "claim-ready";
  if (status === "abandoned") return "forfeited";
  return status;
}

function grantDebugTrashVendorStock(player: PlayerState) {
  for (const itemId of TRASH_VENDOR_ITEM_IDS) {
    const current = getPlayerItemCount(player, itemId);
    if (current < DEBUG_TRASH_VENDOR_STOCK_COUNT) {
      addInventoryItem(player, itemId, DEBUG_TRASH_VENDOR_STOCK_COUNT - current);
    }
  }
}

function getPlayerItemCount(player: PlayerState, itemId: ItemId) {
  let count = 0;
  player.inventory.forEach((item) => {
    if (item.id === itemId && !normalizeChainTokenId(item.chainTokenId)) count += item.count;
  });
  return count;
}

function makePersistableCharacterState(characterId: string, player: PlayerState): PersistableCharacterState {
  const quests: PersistableCharacterState["quests"] = [];
  player.quests.forEach((quest, id) => {
    quests.push({
      id: (quest.id || id) as QuestId,
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });

  const inventory: PersistableCharacterState["inventory"] = [];
  player.inventory.forEach((item, id) => {
    inventory.push({
      id: (item.id || id) as ItemId,
      chainTokenId: normalizeChainTokenId(item.chainTokenId),
      chainTier: normalizeChainGearTier(item.chainTier),
      count: item.count,
    });
  });

  const equipment: PersistableCharacterState["equipment"] = [];
  player.equipment.forEach((slot, id) => {
    equipment.push({
      slot: (slot.slot || id) as PersistableCharacterState["equipment"][number]["slot"],
      itemId: slot.itemId,
      chainTokenId: normalizeChainTokenId(slot.chainTokenId),
      chainTier: normalizeChainGearTier(slot.chainTier),
    });
  });

  const talents = getPlayerTalentRanks(player);
  const activeBuffs = snapshotActiveBuffs(player.activeBuffs);

  return {
    characterId,
    name: player.name,
    avatarSeed: player.avatarSeed,
    appearanceTraits: player.isAgent
      ? normalizeAgentMferAppearanceTraits(parseMferAppearanceTraitsJson(player.appearanceTraitsJson), {})
      : parseMferAppearanceTraitsJson(player.appearanceTraitsJson),
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    quests,
    inventory,
    equipment,
    talents,
    activeBuffs,
  };
}

function getPersistableCharacterStateFingerprint(state: PersistableCharacterState) {
  return JSON.stringify(state);
}

function snapshotPlayers({
  players,
  persistentCharacterIds,
  sessionJoinedAt,
  inputs,
  lastChatAt,
  lastInteractAt,
  lastAgentActivityAt,
  deadSessionIds,
  now,
}: {
  players: TownState["players"];
  persistentCharacterIds: Map<string, string>;
  sessionJoinedAt: Map<string, number>;
  inputs: Map<string, TrackedInput>;
  lastChatAt: Map<string, number>;
  lastInteractAt: Map<string, number>;
  lastAgentActivityAt: Map<string, number>;
  deadSessionIds: Set<string>;
  now: number;
}) {
  const snapshots: AdminPlayerSnapshot[] = [];
  players.forEach((player, sessionId) => {
    const joinedAt = sessionJoinedAt.get(sessionId) ?? 0;
    const quests = snapshotQuests(player.quests);
    const agentCommandBudget = parseAgentCommandBudgetJson(player.agentCommandBudgetJson);
    snapshots.push({
      sessionId,
      characterId: persistentCharacterIds.get(sessionId) ?? "",
      name: player.name,
      identityType: player.identityType,
      isAgent: player.isAgent,
      walletAddress: player.walletAddress,
      avatarSeed: player.avatarSeed,
      status: player.health <= 0 || deadSessionIds.has(sessionId) ? "dead" : "online",
      joinedAt,
      onlineForMs: joinedAt > 0 ? Math.max(0, now - joinedAt) : 0,
      lastInputAt: inputs.get(sessionId)?.receivedAt ?? 0,
      lastChatAt: lastChatAt.get(sessionId) ?? 0,
      lastInteractAt: lastInteractAt.get(sessionId) ?? 0,
      lastAgentActivityAt: lastAgentActivityAt.get(sessionId) ?? 0,
      agentStatusAction: player.agentStatusAction,
      agentStatusThought: player.agentStatusThought,
      agentStatusObjective: player.agentStatusObjective,
      agentStatusQuest: player.agentStatusQuest,
      agentStatusUpdatedAt: player.agentStatusUpdatedAt,
      agentCommandStatus: agentCommandBudget.status,
      agentCommandBudgetTier: agentCommandBudget.budgetTier,
      agentCommandStartedAt: agentCommandBudget.startedAt,
      agentCommandMaxSeconds: agentCommandBudget.maxSeconds,
      agentCommandSessionUsedSeconds: agentCommandBudget.sessionUsedSeconds,
      agentCommandSessionRemainingSeconds: agentCommandBudget.sessionRemainingSeconds,
      agentCommandDailyUsedSeconds: agentCommandBudget.dailyUsedSeconds,
      agentCommandDailyRemainingSeconds: agentCommandBudget.dailyRemainingSeconds,
      agentCommandDailySeconds: agentCommandBudget.dailySeconds,
      position: {
        x: roundAdminNumber(player.x),
        y: roundAdminNumber(player.y),
        z: roundAdminNumber(player.z),
        yaw: roundAdminNumber(player.yaw),
      },
      animation: player.animation,
      level: player.level,
      xp: player.xp,
      talentPoints: player.talentPoints,
      season0Points: player.season0Points,
      season0DailyPoints: player.season0DailyPoints,
      health: roundAdminNumber(player.health),
      maxHealth: roundAdminNumber(player.maxHealth),
      mana: roundAdminNumber(player.mana),
      maxMana: roundAdminNumber(player.maxMana),
      healthRegenPer5: roundAdminNumber(player.healthRegenPer5),
      manaRegenPer5: roundAdminNumber(player.manaRegenPer5),
      walkSpeed: roundAdminNumber(player.walkSpeed),
      runSpeed: roundAdminNumber(player.runSpeed),
      strength: roundAdminNumber(player.strength),
      dexterity: roundAdminNumber(player.dexterity),
      magic: roundAdminNumber(player.magic),
      castingAction: player.castingAction,
      castTargetKind: player.castTargetKind,
      castTargetId: player.castTargetId,
      lastDamagedAt: player.lastDamagedAt,
      frozenUntil: player.frozenUntil,
      quests,
      questCounts: countAdminQuests(quests),
      inventory: snapshotInventory(player.inventory),
      equipment: snapshotEquipment(player.equipment),
      talents: snapshotTalents(player.talents),
    });
  });
  return snapshots.sort((a, b) => a.name.localeCompare(b.name));
}

function snapshotNpcs(npcs: TownState["npcs"]) {
  const snapshots: AdminNpcSnapshot[] = [];
  npcs.forEach((npc) => {
    snapshots.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      model: npc.model,
      health: roundAdminNumber(npc.health),
      maxHealth: roundAdminNumber(npc.maxHealth),
      isImmortal: npc.isImmortal,
      alive: npc.health > 0 && npc.defeatedAt <= 0,
      position: {
        x: roundAdminNumber(npc.x),
        y: roundAdminNumber(npc.y),
        z: roundAdminNumber(npc.z),
        yaw: roundAdminNumber(npc.yaw),
      },
      animation: npc.animation,
      questId: npc.questId,
      aggroTargetId: npc.aggroTargetId,
      combatStyle: npc.combatStyle,
      hasLoot: npc.hasLoot,
      loot: snapshotInventory(npc.loot),
      defeatedAt: npc.defeatedAt,
      respawnAt: npc.respawnAt,
      despawnAt: npc.despawnAt,
      frozenUntil: npc.frozenUntil,
      slowedUntil: npc.slowedUntil,
    });
  });
  return snapshots.sort((a, b) => a.id.localeCompare(b.id));
}

function snapshotQuests(quests: PlayerState["quests"]) {
  const snapshots: AdminQuestSnapshot[] = [];
  quests.forEach((quest, key) => {
    snapshots.push({
      id: (quest.id || key) as QuestId,
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });
  return snapshots.sort((a, b) => {
    const statusOrder = questStatusOrder(a.status) - questStatusOrder(b.status);
    return statusOrder || a.id.localeCompare(b.id);
  });
}

function countAdminQuests(quests: AdminQuestSnapshot[]) {
  const counts: Record<AdminQuestSnapshot["status"], number> = {
    active: 0,
    ready: 0,
    completed: 0,
  };
  for (const quest of quests) counts[quest.status] += 1;
  return counts;
}

function questStatusOrder(status: AdminQuestSnapshot["status"]) {
  switch (status) {
    case "ready":
      return 0;
    case "active":
      return 1;
    case "completed":
      return 2;
  }
}

function snapshotInventory(items: PlayerState["inventory"] | NpcState["loot"]) {
  const snapshots: AdminInventoryItemSnapshot[] = [];
  items.forEach((item, key) => {
    const chainTier = "chainTier" in item && typeof item.chainTier === "number" ? item.chainTier : 1;
    snapshots.push({
      key,
      id: item.id,
      chainTokenId: normalizeChainTokenId(item.chainTokenId),
      chainTier: normalizeChainGearTier(chainTier),
      count: item.count,
    });
  });
  return snapshots.sort((a, b) => a.id.localeCompare(b.id) || a.chainTokenId.localeCompare(b.chainTokenId));
}

function snapshotEquipment(equipment: PlayerState["equipment"]) {
  const snapshots: AdminEquipmentSlotSnapshot[] = [];
  equipment.forEach((slot, key) => {
    snapshots.push({
      slot: slot.slot || key,
      itemId: slot.itemId,
      chainTokenId: normalizeChainTokenId(slot.chainTokenId),
      chainTier: normalizeChainGearTier(slot.chainTier),
    });
  });
  return snapshots.sort((a, b) => a.slot.localeCompare(b.slot));
}

function snapshotTalents(talents: PlayerState["talents"]) {
  const snapshots: AdminTalentSnapshot[] = [];
  talents.forEach((talent, key) => {
    snapshots.push({
      id: talent.id || key,
      tree: talent.tree,
      nodeId: talent.nodeId,
      rank: talent.rank,
    });
  });
  return snapshots.sort((a, b) => a.tree.localeCompare(b.tree) || a.nodeId.localeCompare(b.nodeId));
}

function roundAdminNumber(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

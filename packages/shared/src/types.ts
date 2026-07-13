import type { COMBAT } from "./combat.js";
import type { EMOTES } from "./config.js";
import type { ElixirBuffId, ElixirItemId } from "./elixirs.js";
import type { EquipmentSlotId, ITEMS } from "./items.js";
import type { PotionShopItemId, PotionShopPurchaseQuantity } from "./potionShop.js";
import type { TrashVendorItemId } from "./trashVendor.js";
import type {
  FishingCatchItemId,
  FishingNftCatchSnapshot,
  OnchainFishingRodRequirementSnapshot,
  FishingWalletNftSnapshot,
  FishingSellableItemId,
  FishingState,
  FishingZoneId,
} from "./fishing.js";
import type { QUESTS } from "./quests.js";
import type { TalentId, TalentTreeId } from "./talents.js";
import type { PLAZA_BOUNDS } from "./world.js";
import type { MferAppearanceTraits, TraitPaymentToken } from "./appearance.js";

export type IdentityType = "guest" | "wallet" | "agent";
export type SpeakerType = IdentityType | "npc";
export type AnimationState = "idle" | "walk" | "run" | "jump" | "fishCast" | "fishIdle" | "fishReel";
export type EmoteId = keyof typeof EMOTES;
export type NpcRole = "wanderer" | "quest_giver" | "merchant" | "guard" | "enemy" | "critter" | "beast" | "farmer";
export type NpcModel = "mfer" | "mfergpt" | "rabbit" | "deer" | "hog" | "training-dummy";
export type TargetKind = "player" | "npc";
export type CombatActionId = keyof typeof COMBAT.actions;
export type ActionId = "interact" | "fish" | CombatActionId;
export type NpcDisposition = "friendly" | "neutral" | "hostile";
export type QuestId = keyof typeof QUESTS;
export type QuestStatus = "active" | "ready" | "completed";
export type QuestMarkerType = "available" | "turnIn" | "dailyAvailable" | "dailyTurnIn";
export type ItemId = keyof typeof ITEMS;
export type ActiveBuffSnapshot = {
  id: ElixirBuffId;
  itemId: ElixirItemId;
  name: string;
  shortName: string;
  description: string;
  effectLabel: string;
  startedAt: number;
  expiresAt: number;
};

export type QuestSnapshot = {
  id: QuestId;
  status: QuestStatus;
  progress: number;
  required: number;
  flags: string;
  completedAt: number;
};

export type QuestOffer = {
  questId: QuestId;
  npcId: string;
  npcName: string;
  turnInNpcId: string;
  turnInNpcName: string;
  title: string;
  description: string;
  storyText: string;
  objectiveLabel: string;
  required: number;
  rewardPreview: string[];
};

export type QuestTurnIn = {
  questId: QuestId;
  npcId: string;
  npcName: string;
  turnInNpcId: string;
  turnInNpcName: string;
  title: string;
  completionText: string;
  completedTaskSummary: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
};

export type QuestStatusNotice = {
  questId: QuestId;
  npcId: string;
  npcName: string;
  turnInNpcId: string;
  turnInNpcName: string;
  title: string;
  statusText: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
};

export type QuestCompleted = QuestTurnIn & {
  xpReward: number;
  nextQuestId: QuestId | "";
  nextQuestTitle: string;
  nextGiverNpcId: string;
  nextGiverNpcName: string;
};

export type InventoryItemSnapshot = {
  id: ItemId;
  chainTokenId: string;
  chainTier?: number;
  count: number;
};

export type EquipmentSlotSnapshot = {
  slot: EquipmentSlotId;
  itemId: ItemId | "";
  chainTokenId: string;
  chainTier?: number;
};

export type TalentRankSnapshot = {
  id: TalentId;
  tree: TalentTreeId;
  nodeId: string;
  rank: number;
};

export type LootItemSnapshot = {
  id: ItemId;
  chainTokenId: string;
  count: number;
};

export type LootWindow = {
  npcId: string;
  npcName: string;
  source?: "corpse" | "fishing";
  items: LootItemSnapshot[];
};

export type JoinOptions = {
  name?: string;
  identityType?: IdentityType;
  walletAddress?: string;
  walletAuth?: WalletAuthProof;
  sessionToken?: string;
  agentClient?: boolean;
  avatarSeed?: number;
  createCharacter?: boolean;
  inviteCode?: string;
  referralWalletAddress?: string;
};

export type WalletAuthProof = {
  nonce: string;
  message: string;
  signature: string;
};

export type WalletAuthChallengeResponse = {
  ok: boolean;
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
  error?: string;
  code?: string;
  recovery?: string;
  requestId?: string;
};

export type AgentSessionResponse = {
  ok: boolean;
  walletAddress: string;
  sessionToken: string;
  expiresAt: string;
  error?: string;
  code?: string;
  recovery?: string;
  requestId?: string;
};

export type WalletClientKind = "human" | "agent";

export type WalletCharacterPreview = {
  name: string;
  avatarSeed: number;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  talentPoints: number;
  createdAt: string;
  updatedAt: string;
  nameLocked: boolean;
  registeredClientKind: WalletClientKind | "";
};

export type WalletCharacterProfileResponse = {
  exists: boolean;
  character: WalletCharacterPreview | null;
  registeredClientKind?: WalletClientKind | "";
};

export type ClientInput = {
  seq: number;
  x: number;
  z: number;
  yaw: number;
  sprint?: boolean;
  jump?: boolean;
};

export type ClientEmote = {
  emoteId: EmoteId;
};

export type ClientAgentStatus = {
  action?: string;
  thought?: string;
  objective?: string;
  quest?: string;
  commandStatus?: string;
  commandBudgetTier?: string;
  commandStartedAt?: number;
  commandMaxSeconds?: number;
  commandSessionUsedSeconds?: number;
  commandSessionRemainingSeconds?: number;
  commandDailyUsedSeconds?: number;
  commandDailyRemainingSeconds?: number;
  commandDailySeconds?: number;
};

export type PlayerSnapshot = {
  sessionId: string;
  name: string;
  identityType: IdentityType;
  isAgent: boolean;
  walletAddress: string;
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
  avatarSeed: number;
  appearanceTraits: MferAppearanceTraits;
  level: number;
  xp: number;
  talentPoints: number;
  season0Points: number;
  season0DailyPoints: number;
  health: number;
  maxHealth: number;
  healthRegenPer5: number;
  mana: number;
  maxMana: number;
  manaRegenPer5: number;
  walkSpeed: number;
  runSpeed: number;
  strength: number;
  dexterity: number;
  magic: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  emote: EmoteId | "";
  emoteStartedAt: number;
  emoteEndsAt: number;
  lastSeq: number;
  attackReadyAt: number;
  shootReadyAt: number;
  signalShotReadyAt: number;
  fireblastReadyAt: number;
  frostNovaReadyAt: number;
  healReadyAt: number;
  tauntReadyAt: number;
  whirlwindReadyAt: number;
  multishotReadyAt: number;
  iceBlastReadyAt: number;
  castingAction: CombatActionId | "";
  castStartedAt: number;
  castEndsAt: number;
  lastCastAt: number;
  lastDamagedAt: number;
  frozenUntil: number;
  fishingAttemptId: string;
  fishingZoneId: FishingZoneId | "";
  fishingState: FishingState;
  fishingCastAt: number;
  fishingBiteAt: number;
  fishingExpiresAt: number;
  fishingBobberX: number;
  fishingBobberZ: number;
  fishingNftCatch: FishingNftCatchSnapshot | null;
  quests: QuestSnapshot[];
  inventory: InventoryItemSnapshot[];
  equipment: EquipmentSlotSnapshot[];
  talents: TalentRankSnapshot[];
  activeBuffs: ActiveBuffSnapshot[];
};

export type NpcSnapshot = {
  id: string;
  name: string;
  role: NpcRole;
  model: NpcModel;
  portraitImage: string;
  avatarSeed: number;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animation: AnimationState;
  dialogue: string;
  questId: string;
  defeatedAt: number;
  despawnAt: number;
  frozenUntil: number;
  slowedUntil: number;
  aggroTargetId: string;
  hasLoot: boolean;
};

export type TargetSelection = {
  kind: TargetKind;
  id: string;
};

export type ChatMessage = {
  sessionId: string;
  name: string;
  identityType: SpeakerType;
  text: string;
  sentAt: number;
  kind?: "say" | "emote";
};

export type CombatEvent = {
  id: string;
  sourceId: string;
  actionId: CombatActionId;
  target: TargetSelection;
  targetName: string;
  amount: number;
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  sentAt: number;
  impactAt: number;
  defeated: boolean;
};

export type ExperienceEvent = {
  id: string;
  sessionId: string;
  sourceNpcId: string;
  amount: number;
  x: number;
  y: number;
  z: number;
  sentAt: number;
};

export type AgentVisiblePlayer = Pick<
  PlayerSnapshot,
  "sessionId" | "name" | "identityType" | "isAgent" | "agentStatusAction" | "agentStatusThought" | "agentStatusObjective" | "agentStatusQuest" | "agentStatusUpdatedAt" | "agentCommandStatus" | "agentCommandBudgetTier" | "agentCommandStartedAt" | "agentCommandMaxSeconds" | "agentCommandSessionUsedSeconds" | "agentCommandSessionRemainingSeconds" | "agentCommandDailyUsedSeconds" | "agentCommandDailyRemainingSeconds" | "agentCommandDailySeconds" | "avatarSeed" | "health" | "maxHealth" | "mana" | "maxMana" | "x" | "y" | "z" | "yaw" | "animation" | "fishingAttemptId" | "fishingZoneId" | "fishingState" | "fishingBiteAt" | "fishingExpiresAt" | "fishingBobberX" | "fishingBobberZ" | "fishingNftCatch"
> & {
  distance: number;
};

export type AgentVisibleNpc = Pick<
  NpcSnapshot,
  "id" | "name" | "role" | "model" | "avatarSeed" | "health" | "maxHealth" | "isImmortal" | "x" | "y" | "z" | "yaw" | "animation" | "dialogue" | "questId" | "defeatedAt" | "despawnAt" | "aggroTargetId" | "hasLoot"
> & {
  distance: number;
};

export type ClientInteract = {
  npcId?: string;
};

export type ClientAcceptQuest = {
  questId: QuestId;
  npcId?: string;
};

export type ClientCompleteQuest = {
  questId: QuestId;
  npcId?: string;
};

export type ClientCancelQuest = {
  questId: QuestId;
};

export type ClientShareQuestLink = {
  questId: QuestId;
  url?: string;
};

export type ClientLootCorpse = {
  npcId: string;
  itemId?: ItemId;
  chainTokenId?: string;
};

export type ClientEquipItem = {
  itemId: ItemId;
  chainTokenId?: string;
};

export type ClientUseItem = {
  itemId: ItemId;
  chainTokenId?: string;
};

export type ClientUnequipItem = {
  slot: EquipmentSlotId;
};

export type ClientRegisterChainGear = {
  tokenId: string;
  gearType?: number;
  txHash?: string;
};

export type ClientDebugRegisterChainGear = {
  gearType: number;
  tokenId: string;
  tier?: number;
};

export type ClientDebugUpdateChainGearTier = {
  tokenId: string;
  tier: number;
};

export type ClientSelectTalent = {
  talentId: TalentId;
};

export type MferGptPaymentProof = {
  token: TraitPaymentToken;
  txHash: string;
  amountWei: string;
  chainId: number;
  contractAddress?: string;
};

export type TraitPaymentProof = MferGptPaymentProof;

export type ClientUpdateTraits = {
  traits: MferAppearanceTraits;
  name?: string;
  attemptId?: string;
  payment?: TraitPaymentProof;
};

export type TraitUpdateResult = {
  ok: boolean;
  traits: MferAppearanceTraits;
  name?: string;
  free: boolean;
  paid: boolean;
  error?: string;
};

export type ClientRespecTalents = {
  payment?: MferGptPaymentProof;
};

export type TalentRespecResult = {
  ok: boolean;
  refundedTalentPoints: number;
  talentPoints: number;
  paymentAmountWei: string;
  chainId: number;
  txHash?: string;
  error?: string;
};

export type ClientPurchasePotionShopItem = {
  itemId: PotionShopItemId;
  quantity?: PotionShopPurchaseQuantity;
  payment?: MferGptPaymentProof;
};

export type PotionShopPurchaseResult = {
  ok: boolean;
  itemId: PotionShopItemId | "";
  itemName: string;
  quantity: PotionShopPurchaseQuantity;
  count: number;
  paymentAmountWei: string;
  chainId: number;
  txHash?: string;
  error?: string;
};

export type ClientPurchaseFishingSupply = {
  payment?: MferGptPaymentProof;
};

export type FishingSupplyPurchaseResult = {
  ok: boolean;
  itemId: "bucket-of-old-chum" | "";
  itemName: string;
  count: number;
  paymentAmountWei: string;
  chainId: number;
  txHash?: string;
  error?: string;
};

export type ClientSellTrashItems = {
  itemId?: TrashVendorItemId;
  quantity?: number;
  sellAll?: boolean;
};

export type TrashVendorSoldItem = {
  itemId: TrashVendorItemId;
  itemName: string;
  quantity: number;
  points: number;
};

export type TrashVendorSellResult = {
  ok: boolean;
  status?: "sold" | "mfergpt_gate" | "error";
  sold: TrashVendorSoldItem[];
  quantity: number;
  points: number;
  season0Points: number;
  season0DailyPoints: number;
  mferGptGate?: Season0MferGptGateSnapshot;
  error?: string;
};

export type ClientStartFishing = {
  zoneId?: FishingZoneId;
};

export type ClientReelFishing = {
  attemptId?: string;
};

export type ClientCancelFishing = {
  requestId?: string;
};

export type FishingCancelResult = {
  ok: boolean;
  requestId: string;
  attemptId: string;
  canceled: boolean;
};

export type FishingResult = {
  ok: boolean;
  attemptId: string;
  outcome: "caught" | "junk" | "missed" | "too_early" | "expired" | "nft";
  itemId: FishingCatchItemId | "";
  itemName: string;
  quantity: number;
  nftCatch?: FishingNftCatchSnapshot;
  error?: string;
};

export type FishingNftCatchResult = {
  ok: boolean;
  catch: FishingNftCatchSnapshot | null;
  error?: string;
};

export type FishingNftHistoryResult = {
  ok: boolean;
  catches: FishingNftCatchSnapshot[];
  walletNfts?: FishingWalletNftSnapshot[];
  rodRequirement?: OnchainFishingRodRequirementSnapshot;
  error?: string;
};

export type ClientPurchaseOnchainFishingRod = Record<string, never>;

export type OnchainFishingRodMintResult = {
  ok: boolean;
  walletNft: FishingWalletNftSnapshot | null;
  chainId: number;
  contractAddress: string;
  paymentAmountWei: string;
  paymentRequired: boolean;
  paymentTxHash?: string;
  mintTxHash?: string;
  alreadyOwned?: boolean;
  error?: string;
};

export type ClientSubmitFishingNftClaimTx = {
  catchId: string;
  txHash: string;
};

export type ClientAbandonFishingNftCatch = {
  catchId: string;
};

export type ClientSubmitMintClubRedemptionTx = {
  catchId: string;
  txHash: string;
  status?: "tx_submitted" | "confirmed";
};

export type MintClubRedemptionResult = {
  ok: boolean;
  catch: FishingNftCatchSnapshot | null;
  error?: string;
};

export type ClientSellFishingItems = {
  requestId?: string;
  itemId?: FishingSellableItemId;
  quantity?: number;
  sellAll?: boolean;
};

export type FishingVendorSoldItem = {
  itemId: FishingSellableItemId;
  itemName: string;
  quantity: number;
  points: number;
  bundleSize: number;
};

export type FishingVendorBundleRequirement = {
  itemId: FishingSellableItemId;
  itemName: string;
  availableQuantity: number;
  bundleSize: number;
  neededQuantity: number;
  pointsPerBundle: number;
};

export type FishingVendorSellResult = {
  requestId?: string;
  ok: boolean;
  status?: "sold" | "mfergpt_gate" | "sale_in_progress" | "insufficient_bundle" | "request_limit" | "season_point_capacity" | "error";
  sold: FishingVendorSoldItem[];
  bundleRequirements?: FishingVendorBundleRequirement[];
  requestedQuantity?: number;
  seasonPointCapacity?: number;
  minimumBundlePoints?: number;
  quantity: number;
  points: number;
  season0Points: number;
  season0DailyPoints: number;
  mferGptGate?: Season0MferGptGateSnapshot;
  error?: string;
};

export type Season0MferGptGateSnapshot = {
  requiredWei: string;
  requiredLabel: string;
  balanceWei: string;
  balanceLabel: string;
  eligible: boolean;
  reason: "eligible" | "insufficient" | "disabled" | "invalid_wallet" | "unavailable";
  error?: string;
};

export type ClientRemoveSeasonReferral = {
  refereeWalletAddress: string;
};

export type SeasonReferralRemoveResult = {
  ok: boolean;
  status: "removed" | "invalid_wallet" | "not_found" | "wallet_required" | "no_database" | "error";
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

export type ClientCombatAction = {
  actionId: CombatActionId;
  target?: TargetSelection | null;
  debugUnlockAllMoves?: boolean;
};

export type ClientRespawn = Record<string, never>;

export type AgentObservation = {
  self: PlayerSnapshot;
  nearbyPlayers: AgentVisiblePlayer[];
  nearbyNpcs: AgentVisibleNpc[];
  recentChat: ChatMessage[];
  bounds: typeof PLAZA_BOUNDS;
  availableActions: Array<
    | "move"
    | "look"
    | "jump"
    | "sprint"
    | "chat"
    | "emote"
    | "interact"
    | "acceptQuest"
    | "completeQuest"
    | "cancelQuest"
    | "shareQuestLink"
    | "combatAction"
    | "respawn"
    | "lootCorpse"
    | "equipItem"
    | "unequipItem"
    | "useItem"
    | "startFishing"
    | "reelFishing"
    | "cancelFishing"
    | "refreshFishingNftHistory"
    | "submitFishingNftClaimTx"
    | "abandonFishingNftCatch"
    | "submitMintClubRedemptionTx"
    | "sellFishingItems"
    | "purchaseFishingSupply"
    | "purchaseOnchainFishingRod"
    | "selectTalent"
    | "updateTraits"
    | "respecTalents"
    | "registerChainGear"
    | "purchasePotionShopItem"
    | "sellTrashItems"
    | "removeSeasonReferral"
    | CombatActionId
  >;
};

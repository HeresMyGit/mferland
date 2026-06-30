import { AGENT_TRASH_VENDOR_ITEMS_PER_POINT } from "./trashVendor.js";
import { ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL, ELIXIR_SHOP_MFERGPT_AMOUNT_WEI, FISHING_CHUM_BUFF_ID } from "./elixirs.js";

export const FISHING_TUTOR_NPC_ID = "motherfisher";
export const FISHING_VENDOR_NPC_ID = "fish-monger";
export const MINT_CLUB_REDEMPTION_NPC_ID = "onchain-goodies-mfer";
export const FISHING_POND_STATUS_NPC_ID = "pond-ledger-mfer";
export const FISHING_ZONE_ID = "south-center-pond";
export const FISHING_POLE_ITEM_ID = "fishing-pole";
export const LOANER_FISHING_POLE_ITEM_ID = "loaner-fishing-pole";
export const ONCHAIN_FISHING_ROD_ITEM_ID = "onchain-fishing-rod";
export const FISHING_CHUM_ITEM_ID = "bucket-of-old-chum";
export const FISHING_SUPPLY_PRODUCT_ID = "fishing-supplies";
export const FISHING_CHUM_MFERGPT_AMOUNT_WEI = ELIXIR_SHOP_MFERGPT_AMOUNT_WEI;
export const FISHING_CHUM_MFERGPT_AMOUNT_LABEL = ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL;
export const FISHING_RARE_CHANCE_BONUS_PERCENT = 25;
export { FISHING_CHUM_BUFF_ID };

export const FISHING_NFT_POND_CHAIN_STANDARD = {
  ERC721: 1,
  ERC1155: 2,
} as const;
export const ONCHAIN_FISHING_ROD_DEFAULT_LABEL = "onchain fishing rod";
export const ONCHAIN_FISHING_ROD_PRODUCT_ID = "onchain-fishing-rod";
export const ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_WEI = "25000000000000000000000000";
export const ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_LABEL = "25M $MFERGPT";
export const FISHING_NFT_POND_DEFAULT_CATCH_CHANCE_BPS = 500;
export const FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP = 3;
export const FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP = 50;
export const FISHING_NFT_POND_MAX_VOUCHER_TTL_MS = 30 * 60 * 1000;
export const FISHING_NFT_POND_VOUCHER_TTL_MS = FISHING_NFT_POND_MAX_VOUCHER_TTL_MS;
export const FISHING_NFT_POND_ERC1155_CATCH_AMOUNT = "1";
export const FISHING_NFT_POND_RANDOMNESS_NOTE =
  "v1 NFT pond randomness is mferland-server-authoritative RNG.";
export const MINT_CLUB_BASE_CHAIN_ID = 8453;
export const MINT_CLUB_BASE_BOND_ADDRESS = "0xc5a076cad94176c2996B32d8466Be1cE757FAa27";
export const MINT_CLUB_BASE_ERC1155_ADDRESS = "0x6c61918eECcC306D35247338FDcf025af0f6120A";
export const MINT_CLUB_BASE_SEPOLIA_CHAIN_ID = 84532;
export const MINT_CLUB_BASE_SEPOLIA_BOND_ADDRESS = "0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d";
export const MINT_CLUB_BASE_SEPOLIA_ERC1155_ADDRESS = "0x4bF67e5C9baD43DD89dbe8fCAD3c213C868fe881";
export const MINT_CLUB_BASE_SEPOLIA_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const MINT_CLUB_REDEMPTION_RESERVE_TOKEN_SYMBOL = "WETH";
export const MINT_CLUB_REDEMPTION_RESERVE_TOKEN_DECIMALS = 18;
export const MINT_CLUB_DEFAULT_BUY_ROYALTY_BPS = 300;
export const MINT_CLUB_DEFAULT_SELL_ROYALTY_BPS = 300;
export const MINT_CLUB_REDEMPTION_DEFAULT_SLIPPAGE_BPS = 100;
export const FISHING_NFT_POND_V1_DECISIONS = {
  catchChanceBps: FISHING_NFT_POND_DEFAULT_CATCH_CHANCE_BPS,
  eligibleCasts: "every completed reel can roll the NFT pond after quest-item priority, when the pond is configured and stocked",
  chumAffectsNftChance: false,
  perWalletDailyCap: FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
  globalDailyCap: FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
  erc1155AmountPolicy: "ERC-1155 catches transfer 1 unit per catch in v1.",
  deposits: "open contract deposits; production server awards only from configured collection allowlist",
  gasPayment: "players pay gas for claim transactions in v1; relayers are a later option",
  metadataDisplay: "v1 reads standard NFT metadata for name, description, and image when available, with collection/token fallback",
  onchainFishingRod: "optional server-side wallet ownership gate; supports ERC-721 balance checks or ERC-1155 token-id balance checks",
  randomness: FISHING_NFT_POND_RANDOMNESS_NOTE,
} as const;

export const FISHING_CAST_MS = 2000;
export const FISHING_BITE_MIN_MS = 7000;
export const FISHING_BITE_MAX_MS = 18000;
export const FISHING_BITE_WINDOW_MS = 4500;
export const FISHING_CAST_RANGE = 9.5;
export const FISHING_BOBBER_MIN_DISTANCE = 2.8;
export const FISHING_BOBBER_MAX_DISTANCE = 7.4;
export const FISHING_AGENT_BUNDLE_MULTIPLIER = AGENT_TRASH_VENDOR_ITEMS_PER_POINT;
export const FISHING_AGENT_CATCH_CHANCE_MULTIPLIER = 0.5;
export const FISHING_AGENT_RARE_CHANCE_MULTIPLIER = 0.5;
export const FISHING_AGENT_NFT_CHANCE_MULTIPLIER = 0.5;

export const FISHING_ZONE = {
  id: FISHING_ZONE_ID,
  name: "South Center Pond",
  x: 0,
  z: 132,
  waterRadius: 10.8,
  shoreRadius: 17.5,
} as const;

export const FISHING_LOST_SHOE_ITEM_ID = "old-mfer-shoe";

export const FISHING_FISH_ITEM_IDS = [
  "reply-gill-minnow",
  "blue-smoke-bluegill",
  "green-fin-mferfish",
  "based-bass",
  "pipe-whisker-catfish",
  "spikeball-puffer",
  "top-hat-ape-crab",
  "huge-sartoshi-koi",
  "gold-drip-goldfish",
  "orange-pipe-seahorse",
  "messy-red-lobster",
  "zombie-angler",
  "sartofish",
] as const;

export const FISHING_CATCH_ITEM_IDS = [
  FISHING_LOST_SHOE_ITEM_ID,
  ...FISHING_FISH_ITEM_IDS,
] as const;

export const FISHING_SELLABLE_ITEM_IDS = [
  ...FISHING_FISH_ITEM_IDS,
] as const;

export const FISHING_ITEM_IDS = [
  FISHING_POLE_ITEM_ID,
  LOANER_FISHING_POLE_ITEM_ID,
  ONCHAIN_FISHING_ROD_ITEM_ID,
  FISHING_CHUM_ITEM_ID,
  ...FISHING_CATCH_ITEM_IDS,
] as const;

export type FishingCatchItemId = typeof FISHING_CATCH_ITEM_IDS[number];
export type FishingFishItemId = typeof FISHING_FISH_ITEM_IDS[number];
export type FishingSellableItemId = typeof FISHING_SELLABLE_ITEM_IDS[number];
export type FishingItemId = typeof FISHING_ITEM_IDS[number];
export type FishingZoneId = typeof FISHING_ZONE_ID;
export type FishingState = "" | "casting" | "waiting" | "bite";
export type FishingNftTokenStandard = keyof typeof FISHING_NFT_POND_CHAIN_STANDARD;
export type FishingNftCatchStatus = "pending" | "voucher_issued" | "tx_submitted" | "confirmed" | "expired" | "failed" | "abandoned";
export type FishingNftCapNoticeKind = "wallet_daily_cap" | "global_daily_cap" | "rod_required" | "rod_required_nft_hit";
export type MintClubRedemptionStatus = "claim_required" | "eligible" | "tx_submitted" | "confirmed" | "failed";
export type OnchainFishingRodStandard = "ERC721" | "ERC1155";
export type OnchainFishingRodMintMode = "wallet" | "server" | "url";
export type OnchainFishingRodMintFunction = "mint" | "mintTo" | "mintQuantity" | "mintToQuantity" | "manifoldClaim";

export const FISHING_RARE_FISH_ITEM_IDS = [
  "top-hat-ape-crab",
  "huge-sartoshi-koi",
  "gold-drip-goldfish",
  "orange-pipe-seahorse",
  "messy-red-lobster",
  "zombie-angler",
  "sartofish",
] as const satisfies readonly FishingFishItemId[];

export type OnchainFishingRodRequirementSnapshot = {
  enabled: boolean;
  required: boolean;
  walletOwnsRod: boolean;
  walletActionRequired: boolean;
  chainId: number;
  contractAddress: string;
  standard: OnchainFishingRodStandard;
  tokenId: string;
  label: string;
  mintUrl?: string;
  mintPriceAmountWei?: string;
  mintPriceLabel?: string;
  mintMode?: OnchainFishingRodMintMode;
  mintContractAddress?: string;
  mintFunction?: OnchainFishingRodMintFunction;
  mintInstanceId?: string;
  mintIndex?: number;
  mintMerkleProof?: string[];
  mintNativeValueWei?: string;
  mintPaymentTokenAddress?: string;
  mintPaymentSpenderAddress?: string;
  adminMintEnabled?: boolean;
  adminMintPaymentRequired?: boolean;
  error?: string;
};

export type FishingWalletNftSnapshot = {
  id: string;
  walletAddress: string;
  standard: OnchainFishingRodStandard;
  collection: string;
  tokenId: string;
  amount: string;
  chainId: number;
  itemId?: typeof ONCHAIN_FISHING_ROD_ITEM_ID;
  label: string;
  description: string;
  image?: string;
  action: "hold" | "use" | "sell" | "equip" | "redeem";
};

export type FishingNftCapNotice = {
  kind: FishingNftCapNoticeKind;
  text: string;
  sentAt: number;
  dailyResetAt: number;
  perWalletDailyCap?: number;
  walletDailyRemaining?: number;
  globalDailyCap?: number;
  globalDailyRemaining?: number | null;
  rodRequirement?: OnchainFishingRodRequirementSnapshot;
};

export type FishingNftPondConfig = {
  enabled: boolean;
  chainId: number;
  contractAddress: string;
  rpcUrl: string;
  catchChanceBps: number;
  perWalletDailyCap: number;
  globalDailyCap: number;
  walletDailyRemaining: number;
  globalDailyRemaining: number | null;
  stocked: boolean;
  drainMode: boolean;
  randomness: typeof FISHING_NFT_POND_RANDOMNESS_NOTE;
  rodRequirement?: OnchainFishingRodRequirementSnapshot;
};

export type FishingNftClaimVoucher = {
  catchId: string;
  fisher: string;
  tokenStandard: (typeof FISHING_NFT_POND_CHAIN_STANDARD)[FishingNftTokenStandard];
  standard: FishingNftTokenStandard;
  collection: string;
  tokenId: string;
  amount: string;
  pondEntryId: string;
  expiresAt: number;
  chainId: number;
  verifyingContract: string;
  signature: string;
};

export type FishingNftMetadataSnapshot = {
  name?: string;
  description?: string;
  image?: string;
  tokenUri?: string;
};

export type MintClubRedemptionSnapshot = {
  status: MintClubRedemptionStatus;
  walletActionRequired: boolean;
  npcId: typeof MINT_CLUB_REDEMPTION_NPC_ID;
  chainId: number;
  collection: string;
  tokenId: string;
  bondAddress: string;
  erc1155Address: string;
  reserveTokenAddress: string;
  reserveTokenSymbol: string;
  reserveTokenDecimals: number;
  reserveTokenStrict?: boolean;
  sellRoyaltyBps: number;
  slippageBps: number;
  txHash?: string;
  error?: string;
  submittedAt?: number;
  confirmedAt?: number;
};

export type FishingNftCatchSnapshot = {
  catchId: string;
  status: FishingNftCatchStatus;
  walletActionRequired: boolean;
  walletAddress: string;
  standard: FishingNftTokenStandard;
  collection: string;
  tokenId: string;
  amount: string;
  pondEntryId: string;
  chainId: number;
  contractAddress: string;
  expiresAt: number;
  txHash?: string;
  error?: string;
  metadata?: FishingNftMetadataSnapshot;
  voucher?: FishingNftClaimVoucher;
  mintClubRedemption?: MintClubRedemptionSnapshot;
};

export type FishingNftGameItemMapping = {
  collection: string;
  tokenId?: string;
  itemId: string;
  action: "use" | "sell" | "equip" | "redeem";
  label: string;
};

export const FISHING_NFT_GAME_ITEM_MAPPINGS: readonly FishingNftGameItemMapping[] = [];

export function getFishingNftGameItemMapping(catchSnapshot: FishingNftCatchSnapshot): FishingNftGameItemMapping | null {
  const collection = catchSnapshot.collection.trim().toLowerCase();
  const tokenId = catchSnapshot.tokenId.trim();
  return FISHING_NFT_GAME_ITEM_MAPPINGS.find((mapping) => (
    mapping.collection.trim().toLowerCase() === collection
    && (!mapping.tokenId || mapping.tokenId === tokenId)
  )) ?? null;
}

export type FishingLootEntry = {
  itemId: FishingCatchItemId | null;
  weight: number;
};

export const FISHING_LOOT_TABLE = [
  { itemId: "reply-gill-minnow", weight: 34 },
  { itemId: "blue-smoke-bluegill", weight: 26 },
  { itemId: "green-fin-mferfish", weight: 16 },
  { itemId: "based-bass", weight: 13 },
  { itemId: "pipe-whisker-catfish", weight: 8 },
  { itemId: "spikeball-puffer", weight: 6 },
  { itemId: "top-hat-ape-crab", weight: 5 },
  { itemId: "huge-sartoshi-koi", weight: 5 },
  { itemId: "gold-drip-goldfish", weight: 4 },
  { itemId: "orange-pipe-seahorse", weight: 4 },
  { itemId: "messy-red-lobster", weight: 3 },
  { itemId: "zombie-angler", weight: 2 },
  { itemId: "sartofish", weight: 1 },
  { itemId: null, weight: 18 },
] as const satisfies readonly FishingLootEntry[];

export type FishingSaleRule = {
  bundleSize: number;
  seasonPoints: number;
};

export const FISHING_SALE_RULES = {
  "reply-gill-minnow": { bundleSize: 10, seasonPoints: 1 },
  "blue-smoke-bluegill": { bundleSize: 5, seasonPoints: 2 },
  "green-fin-mferfish": { bundleSize: 10, seasonPoints: 1 },
  "based-bass": { bundleSize: 3, seasonPoints: 4 },
  "pipe-whisker-catfish": { bundleSize: 4, seasonPoints: 2 },
  "spikeball-puffer": { bundleSize: 4, seasonPoints: 3 },
  "top-hat-ape-crab": { bundleSize: 3, seasonPoints: 4 },
  "huge-sartoshi-koi": { bundleSize: 1, seasonPoints: 8 },
  "gold-drip-goldfish": { bundleSize: 3, seasonPoints: 4 },
  "orange-pipe-seahorse": { bundleSize: 3, seasonPoints: 5 },
  "messy-red-lobster": { bundleSize: 2, seasonPoints: 5 },
  "zombie-angler": { bundleSize: 2, seasonPoints: 7 },
  "sartofish": { bundleSize: 1, seasonPoints: 16 },
} as const satisfies Record<FishingSellableItemId, FishingSaleRule>;

const FISHING_CATCH_ITEM_ID_SET = new Set<string>(FISHING_CATCH_ITEM_IDS);
const FISHING_FISH_ITEM_ID_SET = new Set<string>(FISHING_FISH_ITEM_IDS);
const FISHING_RARE_FISH_ITEM_ID_SET = new Set<string>(FISHING_RARE_FISH_ITEM_IDS);
const FISHING_SELLABLE_ITEM_ID_SET = new Set<string>(FISHING_SELLABLE_ITEM_IDS);
const FISHING_ITEM_ID_SET = new Set<string>(FISHING_ITEM_IDS);

export function isFishingCatchItemId(value: unknown): value is FishingCatchItemId {
  return typeof value === "string" && FISHING_CATCH_ITEM_ID_SET.has(value);
}

export function isFishingFishItemId(value: unknown): value is FishingFishItemId {
  return typeof value === "string" && FISHING_FISH_ITEM_ID_SET.has(value);
}

export function isFishingSellableItemId(value: unknown): value is FishingSellableItemId {
  return typeof value === "string" && FISHING_SELLABLE_ITEM_ID_SET.has(value);
}

export function isFishingItemId(value: unknown): value is FishingItemId {
  return typeof value === "string" && FISHING_ITEM_ID_SET.has(value);
}

export function isFishingPoleItemId(value: unknown): value is typeof FISHING_POLE_ITEM_ID | typeof LOANER_FISHING_POLE_ITEM_ID {
  return value === FISHING_POLE_ITEM_ID || value === LOANER_FISHING_POLE_ITEM_ID;
}

export function getFishingSupplyPrice() {
  return { amountWei: FISHING_CHUM_MFERGPT_AMOUNT_WEI, label: FISHING_CHUM_MFERGPT_AMOUNT_LABEL };
}

export function getOnchainFishingRodMintPrice() {
  return { amountWei: ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_WEI, label: ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_LABEL };
}

export function getFishingSaleRule(itemId: FishingSellableItemId) {
  return FISHING_SALE_RULES[itemId];
}

export function getFishingRequiredBundleSize(itemId: FishingSellableItemId, isAgent: boolean) {
  const base = FISHING_SALE_RULES[itemId].bundleSize;
  if (!isAgent || FISHING_SALE_RULES[itemId].seasonPoints <= 0) return base;
  return base * FISHING_AGENT_BUNDLE_MULTIPLIER;
}

export function getFishingSellAwardPoints(itemId: FishingSellableItemId, quantity = 1, isAgent = false) {
  const count = normalizeFishingQuantity(quantity);
  const rule = FISHING_SALE_RULES[itemId];
  if (rule.seasonPoints <= 0) return 0;
  return Math.floor(count / getFishingRequiredBundleSize(itemId, isAgent)) * rule.seasonPoints;
}

export function getFishingPayableQuantity(
  itemId: FishingSellableItemId,
  quantity = 1,
  pointCapacity = Number.MAX_SAFE_INTEGER,
  isAgent = false,
) {
  const count = normalizeFishingQuantity(quantity);
  const rule = FISHING_SALE_RULES[itemId];
  if (rule.seasonPoints <= 0) return count;

  const bundleSize = getFishingRequiredBundleSize(itemId, isAgent);
  const completeBundles = Math.floor(count / bundleSize);
  const maxBundlesByCapacity = Number.isFinite(pointCapacity)
    ? Math.floor(Math.max(0, Math.floor(pointCapacity)) / rule.seasonPoints)
    : completeBundles;
  return Math.min(completeBundles, maxBundlesByCapacity) * bundleSize;
}

export function rollFishingCatch(
  random = Math.random,
  rareChanceMultiplier = 1,
  rareChanceScale = 1,
): FishingFishItemId | null {
  const rareMultiplier = Number.isFinite(rareChanceMultiplier) ? Math.max(1, rareChanceMultiplier) : 1;
  const rareScale = Number.isFinite(rareChanceScale) ? Math.max(0, rareChanceScale) : 1;
  const entries = FISHING_LOOT_TABLE.map((entry) => ({
    itemId: entry.itemId,
    weight: entry.itemId && FISHING_RARE_FISH_ITEM_ID_SET.has(entry.itemId)
      ? entry.weight * rareMultiplier * rareScale
      : entry.weight,
  }));
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  let roll = Math.max(0, Math.min(0.999999, random())) * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.itemId;
  }
  return null;
}

export function isNearFishingZone(x: number, z: number, range = FISHING_CAST_RANGE) {
  const distance = getFishingZoneDistance(x, z);
  return distance <= FISHING_ZONE.shoreRadius + range && distance >= FISHING_ZONE.waterRadius - range;
}

export function isInsideFishingWater(x: number, z: number) {
  return getFishingZoneDistance(x, z) <= FISHING_ZONE.waterRadius;
}

export function getFishingZoneDistance(x: number, z: number) {
  return Math.hypot(x - FISHING_ZONE.x, z - FISHING_ZONE.z);
}

export function getFishingBobberPosition(player: { x: number; z: number; yaw: number }) {
  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  const desiredDistance = FISHING_BOBBER_MAX_DISTANCE;
  const desiredX = player.x + forwardX * desiredDistance;
  const desiredZ = player.z + forwardZ * desiredDistance;
  if (isInsideFishingWater(desiredX, desiredZ)) return { x: desiredX, z: desiredZ };

  const toCenterX = FISHING_ZONE.x - player.x;
  const toCenterZ = FISHING_ZONE.z - player.z;
  const toCenterDistance = Math.hypot(toCenterX, toCenterZ) || 1;
  const distance = Math.min(FISHING_BOBBER_MAX_DISTANCE, Math.max(FISHING_BOBBER_MIN_DISTANCE, toCenterDistance - FISHING_ZONE.waterRadius * 0.45));
  return {
    x: player.x + (toCenterX / toCenterDistance) * distance,
    z: player.z + (toCenterZ / toCenterDistance) * distance,
  };
}

function normalizeFishingQuantity(quantity: number) {
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
}

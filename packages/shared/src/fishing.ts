import { AGENT_TRASH_VENDOR_ITEMS_PER_POINT } from "./trashVendor.js";
import { ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL, ELIXIR_SHOP_MFERGPT_AMOUNT_WEI, FISHING_CHUM_BUFF_ID } from "./elixirs.js";

export const FISHING_TUTOR_NPC_ID = "motherfisher";
export const FISHING_VENDOR_NPC_ID = "fish-monger";
export const FISHING_ZONE_ID = "south-center-pond";
export const FISHING_POLE_ITEM_ID = "fishing-pole";
export const LOANER_FISHING_POLE_ITEM_ID = "loaner-fishing-pole";
export const FISHING_CHUM_ITEM_ID = "bucket-of-old-chum";
export const FISHING_SUPPLY_PRODUCT_ID = "fishing-supplies";
export const FISHING_CHUM_MFERGPT_AMOUNT_WEI = ELIXIR_SHOP_MFERGPT_AMOUNT_WEI;
export const FISHING_CHUM_MFERGPT_AMOUNT_LABEL = ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL;
export const FISHING_RARE_CHANCE_BONUS_PERCENT = 25;
export { FISHING_CHUM_BUFF_ID };

export const FISHING_CAST_MS = 2000;
export const FISHING_BITE_MIN_MS = 7000;
export const FISHING_BITE_MAX_MS = 18000;
export const FISHING_BITE_WINDOW_MS = 4500;
export const FISHING_CAST_RANGE = 9.5;
export const FISHING_BOBBER_MIN_DISTANCE = 2.8;
export const FISHING_BOBBER_MAX_DISTANCE = 7.4;
export const FISHING_AGENT_BUNDLE_MULTIPLIER = AGENT_TRASH_VENDOR_ITEMS_PER_POINT;

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
  "based-bass",
  "huge-sartoshi-koi",
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
  FISHING_CHUM_ITEM_ID,
  ...FISHING_CATCH_ITEM_IDS,
] as const;

export type FishingCatchItemId = typeof FISHING_CATCH_ITEM_IDS[number];
export type FishingFishItemId = typeof FISHING_FISH_ITEM_IDS[number];
export type FishingSellableItemId = typeof FISHING_SELLABLE_ITEM_IDS[number];
export type FishingItemId = typeof FISHING_ITEM_IDS[number];
export type FishingZoneId = typeof FISHING_ZONE_ID;
export type FishingState = "" | "casting" | "waiting" | "bite";

export type FishingLootEntry = {
  itemId: FishingCatchItemId | null;
  weight: number;
};

export const FISHING_LOOT_TABLE = [
  { itemId: "reply-gill-minnow", weight: 34 },
  { itemId: "blue-smoke-bluegill", weight: 26 },
  { itemId: "based-bass", weight: 13 },
  { itemId: "huge-sartoshi-koi", weight: 5 },
  { itemId: null, weight: 12 },
] as const satisfies readonly FishingLootEntry[];

export type FishingSaleRule = {
  bundleSize: number;
  seasonPoints: number;
};

export const FISHING_SALE_RULES = {
  "reply-gill-minnow": { bundleSize: 10, seasonPoints: 1 },
  "blue-smoke-bluegill": { bundleSize: 5, seasonPoints: 2 },
  "based-bass": { bundleSize: 3, seasonPoints: 4 },
  "huge-sartoshi-koi": { bundleSize: 1, seasonPoints: 8 },
} as const satisfies Record<FishingSellableItemId, FishingSaleRule>;

const FISHING_CATCH_ITEM_ID_SET = new Set<string>(FISHING_CATCH_ITEM_IDS);
const FISHING_FISH_ITEM_ID_SET = new Set<string>(FISHING_FISH_ITEM_IDS);
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

export function rollFishingCatch(random = Math.random, rareChanceMultiplier = 1): FishingFishItemId | null {
  const rareMultiplier = Number.isFinite(rareChanceMultiplier) ? Math.max(1, rareChanceMultiplier) : 1;
  const entries = FISHING_LOOT_TABLE.map((entry) => ({
    itemId: entry.itemId,
    weight: entry.itemId === "huge-sartoshi-koi" ? entry.weight * rareMultiplier : entry.weight,
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

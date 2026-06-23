import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEMS,
  getBaseCharacterStats,
  getChainGearItemId,
  getChainGearTierMultiplier,
  getEquippedCharacterStats,
  getItemHeirloomStatsPerLevel,
  getItemEquipment,
  normalizeChainGearTier,
  normalizeItemLevel,
} from "./items.js";
import { ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_WEI, ELIXIR_SHOP_MFERGPT_AMOUNT_WEI } from "./elixirs.js";
import { POTION_SHOP_BULK_MFERGPT_AMOUNT_WEI, getPotionShopPrice, isPotionShopItemId } from "./potionShop.js";
import {
  AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
  TRASH_VENDOR_SEASON_POINT_VALUE,
  getAgentTrashVendorAwardPoints,
  getAgentTrashVendorPayableQuantity,
  getTrashVendorSellValue,
  isTrashVendorItemId,
} from "./trashVendor.js";
import {
  FISHING_AGENT_BUNDLE_MULTIPLIER,
  FISHING_CATCH_ITEM_IDS,
  FISHING_POLE_ITEM_ID,
  FISHING_ZONE,
  LOANER_FISHING_POLE_ITEM_ID,
  getFishingBobberPosition,
  getFishingPayableQuantity,
  getFishingRequiredBundleSize,
  getFishingSellAwardPoints,
  isInsideFishingWater,
  isNearFishingZone,
  isFishingCatchItemId,
  isFishingItemId,
  isFishingPoleItemId,
  rollFishingCatch,
} from "./fishing.js";
import { resolveWorldCollision } from "./world.js";

test("maps local chain gear types to in-game gear items", () => {
  assert.equal(getChainGearItemId(1), "rusty-skate-deck");
  assert.equal(getChainGearItemId(2), "road-sign-lid");
  assert.equal(getChainGearItemId(3), "lucky-lighter");
  assert.equal(getChainGearItemId(999), null);
});

test("keeps stable store gear ids while using renamed mferland fantasy", () => {
  assert.equal(ITEMS["rusty-skate-deck"].name, "posted-up deck");
  assert.equal(ITEMS["road-sign-lid"].name, "posted-up laptop lid");
  assert.equal(ITEMS["lucky-lighter"].name, "last-cig lighter");
});

test("defines the alpha gear progression spine", () => {
  assert.equal(ITEMS["reply-lag-visor"].equipment?.slot, "head");
  assert.equal(ITEMS["receipt-zine"].equipment?.slot, "offHand");
  assert.equal(ITEMS["headphone-splitter"].equipment?.slot, "trinket");
  assert.equal(ITEMS["airdrop-burn-hoodie"].quality, "uncommon");
  assert.equal(ITEMS["router-antenna-wand"].quality, "rare");
  assert.equal(ITEMS["all-nighter-hoodie"].quality, "rare");
});

test("marks unusable junk as trash-vendor items", () => {
  assert.equal(ITEMS["muddy-tusk"].quality, "poor");
  assert.equal(ITEMS["small-tooth"].quality, "poor");
  assert.equal(isTrashVendorItemId("muddy-tusk"), true);
  assert.equal(isTrashVendorItemId("red-juice"), false);
  assert.equal(TRASH_VENDOR_SEASON_POINT_VALUE, 1);
  assert.equal(getTrashVendorSellValue(7), 7);
});

test("agent trash-vendor rewards require complete two-item bundles", () => {
  assert.equal(AGENT_TRASH_VENDOR_ITEMS_PER_POINT, 2);
  assert.equal(getAgentTrashVendorAwardPoints(1), 0);
  assert.equal(getAgentTrashVendorAwardPoints(2), 1);
  assert.equal(getAgentTrashVendorAwardPoints(3), 1);
  assert.equal(getAgentTrashVendorAwardPoints(4), 2);
  assert.equal(getAgentTrashVendorPayableQuantity(1), 0);
  assert.equal(getAgentTrashVendorPayableQuantity(3), 2);
  assert.equal(getAgentTrashVendorPayableQuantity(10), 10);
  assert.equal(getAgentTrashVendorPayableQuantity(20, 2), 4);
});

test("defines fishing pole and smoking headphone fish items", () => {
  assert.equal(ITEMS[FISHING_POLE_ITEM_ID].name, "south pond pole");
  assert.equal(ITEMS[LOANER_FISHING_POLE_ITEM_ID].quality, "quest");
  assert.equal(isFishingPoleItemId(FISHING_POLE_ITEM_ID), true);
  assert.equal(isFishingItemId("based-bass"), true);
  assert.equal(isFishingCatchItemId("wet-boot"), true);
  assert.equal(isFishingCatchItemId("red-juice"), false);
  for (const itemId of FISHING_CATCH_ITEM_IDS) {
    assert.equal(Object.hasOwn(ITEMS, itemId), true);
  }
  assert.match(ITEMS["reply-gill-minnow"].description, /headphones/);
  assert.match(ITEMS["huge-sartoshi-koi"].description, /smoke/);
});

test("fishing sale bundles use larger requirements for declared agents", () => {
  assert.equal(FISHING_AGENT_BUNDLE_MULTIPLIER, AGENT_TRASH_VENDOR_ITEMS_PER_POINT);
  assert.equal(getFishingRequiredBundleSize("reply-gill-minnow", false), 10);
  assert.equal(getFishingSellAwardPoints("reply-gill-minnow", 9, false), 0);
  assert.equal(getFishingSellAwardPoints("reply-gill-minnow", 10, false), 1);
  assert.equal(getFishingPayableQuantity("reply-gill-minnow", 19, Number.MAX_SAFE_INTEGER, false), 10);
  assert.equal(getFishingRequiredBundleSize("reply-gill-minnow", true), 20);
  assert.equal(getFishingSellAwardPoints("reply-gill-minnow", 19, true), 0);
  assert.equal(getFishingSellAwardPoints("reply-gill-minnow", 20, true), 1);
  assert.equal(getFishingPayableQuantity("reply-gill-minnow", 30, Number.MAX_SAFE_INTEGER, true), 20);
  assert.equal(getFishingSellAwardPoints("huge-sartoshi-koi", 1, false), 8);
  assert.equal(getFishingSellAwardPoints("huge-sartoshi-koi", 1, true), 0);
  assert.equal(getFishingSellAwardPoints("huge-sartoshi-koi", 2, true), 8);
  assert.equal(getFishingSellAwardPoints("wet-boot", 99, true), 0);
  assert.equal(getFishingPayableQuantity("wet-boot", 7, 0, true), 7);
});

test("fishing loot roll can return fish, junk, or no catch", () => {
  assert.equal(rollFishingCatch(() => 0), "wet-boot");
  assert.equal(rollFishingCatch(() => 0.99), null);
});

test("south-center pond has a castable shore and water bobber target", () => {
  assert.equal(FISHING_ZONE.id, "south-center-pond");
  assert.equal(FISHING_ZONE.x, 0);
  assert.ok(FISHING_ZONE.z > 100);
  const shore = resolveWorldCollision(FISHING_ZONE.x + FISHING_ZONE.waterRadius + 3.8, FISHING_ZONE.z + 1.8, 0.45);
  assert.equal(isNearFishingZone(shore.x, shore.z), true);
  assert.equal(isInsideFishingWater(shore.x, shore.z), false);

  const bobber = getFishingBobberPosition({
    ...shore,
    yaw: Math.atan2(FISHING_ZONE.x - shore.x, FISHING_ZONE.z - shore.z),
  });
  assert.equal(isInsideFishingWater(bobber.x, bobber.z), true);
  assert.ok(bobber.x < shore.x);
});

test("fishing rejects ordinary plaza positions", () => {
  assert.equal(isNearFishingZone(0, 0), false);
});

test("adds one-hour elixirs to the potion shop with elixir pricing", () => {
  assert.equal(isPotionShopItemId("mev-bot-elixir"), true);
  assert.equal(ITEMS["mev-bot-elixir"].consumable?.kind, "elixir");
  assert.equal(ITEMS["exit-liquidity-elixir"].consumable?.buffId, "exit-liquidity");
  assert.equal(ITEMS["hopium-elixir"].consumable?.buffId, "hopium");
  assert.equal(ITEMS["slippage-serum"].consumable?.buffId, "slippage");

  assert.equal(getPotionShopPrice(1, "mev-bot-elixir").amountWei, ELIXIR_SHOP_MFERGPT_AMOUNT_WEI);
  assert.equal(getPotionShopPrice(5, "mev-bot-elixir").amountWei, ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_WEI);
  assert.equal(getPotionShopPrice(5, "red-juice").amountWei, POTION_SHOP_BULK_MFERGPT_AMOUNT_WEI);
});

test("normalizes chain gear tiers to the supported local range", () => {
  assert.equal(normalizeChainGearTier(undefined), 1);
  assert.equal(normalizeChainGearTier("2"), 2);
  assert.equal(normalizeChainGearTier(3.8), 3);
  assert.equal(normalizeChainGearTier(99), 3);
  assert.equal(normalizeChainGearTier(0), 1);
  assert.equal(normalizeItemLevel(undefined), 1);
  assert.equal(normalizeItemLevel("4"), 4);
  assert.equal(normalizeItemLevel(99), 10);
});

test("scales NFT gear by tier and heirloom level growth", () => {
  assert.equal(getChainGearTierMultiplier(1), 1);
  assert.equal(getChainGearTierMultiplier(2), 1.33);
  assert.equal(getChainGearTierMultiplier(3), 1.66);
  assert.deepEqual(getItemHeirloomStatsPerLevel("road-sign-lid"), {
    maxHealth: 1.6,
    strength: 0.16,
  });

  assert.deepEqual(getItemEquipment("road-sign-lid", 1)?.stats, {
    maxHealth: 14,
    strength: 1,
  });
  assert.deepEqual(getItemEquipment("road-sign-lid", 2)?.stats, {
    maxHealth: 18.62,
    strength: 1.33,
  });
  assert.deepEqual(getItemEquipment("road-sign-lid", 3)?.stats, {
    maxHealth: 23.24,
    strength: 1.66,
  });
  assert.deepEqual(getItemEquipment("road-sign-lid", 1, 4)?.stats, {
    maxHealth: 18.8,
    strength: 1.48,
  });
  assert.deepEqual(getItemEquipment("road-sign-lid", 3, 4)?.stats, {
    maxHealth: 28.04,
    strength: 2.14,
  });
});

test("applies chain gear tier and heirloom level scaling to equipped character stats", () => {
  const baseStats = getBaseCharacterStats();
  const tierThreeStats = getEquippedCharacterStats([{ itemId: "road-sign-lid", chainTier: 3 }], 4);

  assert.equal(tierThreeStats.maxHealth, baseStats.maxHealth + 28.04);
  assert.equal(tierThreeStats.strength, baseStats.strength + 2.14);
});

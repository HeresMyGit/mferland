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

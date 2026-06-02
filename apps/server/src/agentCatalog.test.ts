import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAgentCatalog } from "./agentCatalog.js";

const EXCLUDED_WEB_ROOM_SENDS = new Set([
  "analyticsEvent",
  "debugBeginPlacementSave",
  "debugBoostPlayer",
  "debugPlacementSaveChunk",
  "debugRegisterChainGear",
  "debugRequestPlacementMap",
  "debugSetNpcPlacement",
  "debugSetWorldPlacement",
  "debugSetupNpc",
  "debugTeleport",
  "debugUpdateChainGearTier",
]);

test("agent catalog documents normal player menu controls", () => {
  const catalog = buildAgentCatalog();

  assert.deepEqual(catalog.controls.session, ["leave"]);
  assert.deepEqual(catalog.controls.movement, ["input", "respawn"]);
  assert.deepEqual(catalog.controls.social, ["chat", "emote", "shareQuestLink"]);
  assert.deepEqual(catalog.controls.npc, ["interact"]);
  assert.deepEqual(catalog.controls.quests, ["acceptQuest", "completeQuest", "cancelQuest"]);
  assert.deepEqual(catalog.controls.selection, ["selectTarget", "selectSelfTarget"]);
  assert.deepEqual(catalog.controls.combat, ["combatAction"]);
  assert.deepEqual(catalog.controls.lootAndItems, ["lootCorpse", "equipItem", "unequipItem", "useItem"]);
  assert.deepEqual(catalog.controls.character, ["selectTalent", "updateTraits"]);
  assert.deepEqual(catalog.controls.walletStores, ["purchasePotionShopItem", "registerChainGear"]);
  assert.deepEqual(catalog.controls.walletActions, [
    "connectWallet",
    "refreshWalletBalances",
    "quoteMferGptSwap",
    "swapEthForMferGpt",
    "buyGearWithEth",
    "buyGearWithMfer",
    "buyGearWithMferGpt",
    "mintSeasonPassWithEth",
    "mintSeasonPassWithMfer",
    "mintSeasonPassWithMferGpt",
    "burnMferGptForPaymentProof",
  ]);
  assert.deepEqual(catalog.controls.localClientPreferences, [
    "setHotbarSlot",
    "setQuestFocus",
    "toggleCompletedQuestVisibility",
    "setGraphicsQuality",
    "setAudio",
    "setNameplates",
    "configureLocalCryptoContracts",
  ]);

  assert.deepEqual(catalog.menus.character.controls, ["selectSelfTarget", "unequipItem", "refreshSeasonPassOwnership"]);
  assert.deepEqual(catalog.menus.stash.controls, ["equipItem", "useItem", "setHotbarSlot"]);
  assert.deepEqual(catalog.menus.moves.controls, ["combatAction", "selectTalent", "setHotbarSlot"]);
  assert.deepEqual(catalog.menus.hotbar.controls, ["setHotbarSlot", "interact", "combatAction", "useItem"]);
  assert.deepEqual(catalog.menus.errands.controls, ["setQuestFocus", "toggleCompletedQuestVisibility", "acceptQuest", "completeQuest", "cancelQuest", "shareQuestLink"]);
  assert.deepEqual(catalog.menus.potionShop.controls, ["selectPotionShopItem", "selectPotionShopQuantity", "purchasePotionShopItem"]);
  assert.equal(catalog.menus.potionShop.paidControlRequiresPaymentProof, true);
  assert.deepEqual(catalog.menus.traits.controls, ["selectTraitCategory", "setTrait", "clearTrait", "randomizeTraits", "updateTraits"]);
  assert.equal(catalog.menus.traits.paidControlRequiresPaymentProof, true);
  assert.deepEqual(catalog.menus.cryptoStore.controls, [
    "connectWallet",
    "refreshWalletBalances",
    "selectGearType",
    "buyGearWithEth",
    "buyGearWithMfer",
    "buyGearWithMferGpt",
    "mintSeasonPassWithEth",
    "mintSeasonPassWithMfer",
    "mintSeasonPassWithMferGpt",
    "configureLocalCryptoContracts",
    "registerChainGear",
  ]);
  assert.deepEqual(catalog.menus.swap.controls, ["setSwapAmount", "setSwapSlippage", "quoteMferGptSwap", "swapEthForMferGpt", "copyMferGptContract", "openUniswapFallback"]);
  assert.deepEqual(catalog.menus.map.controls, ["setQuestFocus", "inspectMapPoint", "move", "travelRoute"]);
  assert.deepEqual(catalog.menus.settings.controls, ["setGraphicsQuality", "setAudio", "setNameplates", "toggleDebugLocalOnly"]);
  assert.deepEqual(catalog.menus.system.controls, ["respawn", "leave"]);

  assert.equal(catalog.payments.mferGpt.chainId, 8453);
  assert.equal(catalog.payments.mferGpt.tokenAddress, "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07");
  assert.equal(catalog.payments.mferGpt.uniswapV4Pool.hooks, "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC");
  assert.equal(catalog.payments.mferGpt.season0AgentRequiredBalanceWei, "25000000000000000000000000");
  assert.ok(catalog.traits.categories.some((category) => category.id === "type"));
  assert.equal(catalog.traits.declaredAgentModel, "mfergpt");
});

test("agent catalog covers non-debug room messages sent by web menus", () => {
  const catalog = buildAgentCatalog();
  const source = readFileSync(new URL("../../web/src/game/useTownRoom.ts", import.meta.url), "utf8");
  const messages = new Set([...source.matchAll(/\.send\("([^"]+)"/g)].map((match) => match[1]));
  const catalogControls = new Set<string>();

  for (const controls of Object.values(catalog.controls)) {
    for (const control of controls) catalogControls.add(control);
  }
  for (const menu of Object.values(catalog.menus)) {
    for (const control of menu.controls) catalogControls.add(control);
  }

  for (const message of [...messages].sort()) {
    if (EXCLUDED_WEB_ROOM_SENDS.has(message)) continue;
    assert.ok(catalogControls.has(message), `web sends ${message}, but /agent-catalog does not document it`);
  }
});

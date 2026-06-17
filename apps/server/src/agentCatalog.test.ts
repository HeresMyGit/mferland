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
  assert.deepEqual(catalog.controls.lootAndItems, ["lootCorpse", "equipItem", "unequipItem", "useItem", "sellTrashItems"]);
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
  assert.deepEqual(catalog.menus.trashVendor.controls, ["sellTrashItems"]);
  assert.equal(catalog.menus.trashVendor.paidControlRequiresPaymentProof, false);
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
  assert.equal(catalog.payments.mferGpt.swap.route, "Base ETH -> WETH -> MFERGPT via Uniswap v4 Universal Router");
  assert.equal(catalog.payments.mferGpt.swap.agentAction, "swap_eth_for_mfergpt is available when wallet tools are configured and the run's ETH spend cap allows it.");
  assert.equal(catalog.payments.mferGpt.season0AgentRequiredBalanceWei, "25000000000000000000000000");
  assert.match(catalog.payments.mferGpt.season0AgentHumanHelp, /swap-mfer/);
  assert.ok(catalog.traits.categories.some((category) => category.id === "type"));
  assert.equal(catalog.traits.declaredAgentModel, "mfergpt");
  assert.deepEqual(catalog.traits.forcedForDeclaredAgents, { eyes: "regular", mouth: "flat" });
  assert.deepEqual(catalog.traits.blockedForDeclaredAgents.categories, ["long_hair"]);
  assert.ok(catalog.traits.blockedForDeclaredAgents.options.hat_under_headphones.includes("cap_based_blue"));
  assert.ok(catalog.traits.blockedForDeclaredAgents.options.eyes.includes("shades"));
  assert.match(catalog.traits.note, /regular eyes and flat mouth/);
  assert.match(catalog.traits.note, /caps, long hair, shades, or glasses/);
  assert.match(catalog.traits.selectionGuidance, /seeded variety/);
  assert.match(catalog.traits.note, /defaults or first-listed choices/);

  assert.equal(catalog.agentHarness.bridgeEndpoints.command, "/agent-command");
  assert.deepEqual(catalog.agentHarness.commands.kinds, ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals"]);
  assert.deepEqual(catalog.agentHarness.commands.profile.priorities, ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"]);
  assert.deepEqual(catalog.agentHarness.commands.profile.roles, ["auto", "tank", "healer", "dps", "support"]);
  assert.ok(catalog.agentHarness.commands.goals.types.includes("quest_completed"));
  assert.ok(catalog.agentHarness.commands.goals.types.includes("near_player_count"));
  assert.match(catalog.agentHarness.commands.goals.note, /freeform player requests/);
  assert.equal(catalog.agentHarness.commands.constraints.walletSigningDefault, false);
  assert.deepEqual(catalog.agentHarness.commands.controller.types, ["premade", "external_policy"]);
  assert.match(catalog.agentHarness.commands.controller.note, /metadata only/);
  assert.match(catalog.agentHarness.commands.timeboxingNote, /safety guards/);
  assert.ok(catalog.agentHarness.registeredTools.manifests.includes("/.well-known/ai-tool/mferland-agent-command.json"));
  assert.ok(catalog.agentHarness.registeredTools.manifests.includes("/.well-known/ai-tool/mferland-mfergpt-swap.json"));
  assert.equal(catalog.agentHarness.registeredTools.swapQuote, "/agent-mfergpt-swap-quote");
  assert.match(catalog.agentHarness.registeredTools.xPaymentNote, /EIP-3009/);

  assert.equal(catalog.quests["baron-of-static"].encounterType, "group");
  assert.equal(catalog.quests["baron-of-static"].groupSuggestion, "group suggested");
  assert.equal(catalog.quests["baron-of-static"].suggestedPlayerCount, 2);
  assert.match(catalog.quests["baron-of-static"].soloWarning, /do not repeatedly solo/i);
  assert.equal(catalog.quests["ogre-raid-daily"].encounterType, "raid");
  assert.equal(catalog.quests["ogre-raid-daily"].groupSuggestion, "raid suggested");
  assert.equal(catalog.quests["ogre-raid-daily"].suggestedPlayerCount, 4);
  assert.match(catalog.quests["ogre-raid-daily"].soloWarning, /raid content/i);
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

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
  assert.deepEqual(catalog.controls.social, ["chat", "emote", "agentStatus", "shareQuestLink"]);
  assert.deepEqual(catalog.controls.npc, ["interact"]);
  assert.deepEqual(catalog.controls.quests, ["acceptQuest", "completeQuest", "cancelQuest"]);
  assert.deepEqual(catalog.controls.selection, ["selectTarget", "selectSelfTarget"]);
  assert.deepEqual(catalog.controls.combat, ["combatAction"]);
  assert.deepEqual(catalog.controls.lootAndItems, ["lootCorpse", "equipItem", "unequipItem", "useItem", "sellTrashItems", "startFishing", "reelFishing", "cancelFishing", "submitFishingNftClaimTx", "abandonFishingNftCatch", "prepareMintClubRedemption", "cancelMintClubRedemptionPreparation", "submitMintClubRedemptionTx", "refreshFishingNftHistory", "sellFishingItems", "purchaseFishingSupply", "purchaseOnchainFishingRod"]);
  assert.deepEqual(catalog.controls.character, ["selectTalent", "updateTraits", "respecTalents", "removeSeasonReferral"]);
  assert.deepEqual(catalog.controls.walletStores, ["purchasePotionShopItem", "purchaseFishingSupply", "respecTalents", "registerChainGear"]);
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
    "claimFishingPondNft",
    "sellMintClubPondNft",
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

  assert.deepEqual(catalog.menus.character.controls, ["selectSelfTarget", "unequipItem", "refreshSeasonPassOwnership", "removeSeasonReferral"]);
  assert.deepEqual(catalog.menus.stash.controls, ["equipItem", "useItem", "setHotbarSlot"]);
  assert.deepEqual(catalog.menus.moves.controls, ["combatAction", "selectTalent", "setHotbarSlot"]);
  assert.deepEqual(catalog.menus.hotbar.controls, ["setHotbarSlot", "interact", "combatAction", "useItem", "startFishing", "reelFishing"]);
  assert.deepEqual(catalog.menus.errands.controls, ["setQuestFocus", "toggleCompletedQuestVisibility", "acceptQuest", "completeQuest", "cancelQuest", "shareQuestLink"]);
  assert.deepEqual(catalog.menus.potionShop.controls, ["selectPotionShopItem", "selectPotionShopQuantity", "purchasePotionShopItem"]);
  assert.equal(catalog.menus.potionShop.paidControlRequiresPaymentProof, true);
  assert.deepEqual(catalog.menus.respec.controls, ["respecTalents"]);
  assert.equal(catalog.menus.respec.npcId, "respec-mfer");
  assert.equal(catalog.menus.respec.paidControlRequiresPaymentProof, true);
  assert.deepEqual(catalog.menus.trashVendor.controls, ["sellTrashItems"]);
  assert.equal(catalog.menus.trashVendor.paidControlRequiresPaymentProof, false);
  assert.deepEqual(catalog.menus.fishing.controls, ["startFishing", "reelFishing", "lootCorpse", "cancelFishing", "submitFishingNftClaimTx", "abandonFishingNftCatch", "prepareMintClubRedemption", "cancelMintClubRedemptionPreparation", "submitMintClubRedemptionTx", "refreshFishingNftHistory", "purchaseFishingSupply", "purchaseOnchainFishingRod", "sellFishingItems"]);
  assert.equal(catalog.menus.fishing.tutorNpcId, "motherfisher");
  assert.equal(catalog.menus.fishing.vendorNpcId, "fish-monger");
  assert.equal(catalog.menus.fishing.statusNpcId, "pond-ledger-mfer");
  assert.equal(catalog.menus.fishing.redemptionNpcId, "onchain-goodies-mfer");
  assert.equal(catalog.menus.fishing.paidControlRequiresPaymentProof, true);
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

  assert.equal(catalog.endpoints.seasonLeaderboard, "/season/leaderboard");
  assert.equal(catalog.endpoints.seasonReferrals, "/season/referrals?wallet={walletAddress}");
  assert.equal(catalog.endpoints.agentSession, "/agent-session");
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("fishing"));
  assert.match(catalog.agentHarness.commands.fishingCommandNote, /behaviorScheme=fishing/);
  assert.deepEqual(catalog.walletIdentity.registeredClientKinds, ["human", "agent"]);
  assert.match(catalog.walletIdentity.invariant, /Human wallets cannot mint agent sessions/);
  assert.equal(catalog.walletIdentity.agentSessionMismatch.code, "agent_wallet_registration_mismatch");
  assert.equal(catalog.walletIdentity.agentSessionMismatch.recovery, "use_agent_registered_wallet");
  assert.deepEqual(catalog.walletIdentity.profileFields, ["registeredClientKind"]);
  assert.equal(catalog.season0.dailyPointCap, 500);
  assert.equal(catalog.season0.totalPointCap, 10000);
  assert.equal(catalog.season0.referrals.humanOnly, true);
  assert.equal(catalog.season0.referrals.agentsEligible, false);
  assert.equal(catalog.season0.referrals.activationPoints, 0);
  assert.equal(catalog.season0.referrals.bonusRatePercent, 20);
  assert.equal(catalog.season0.referrals.maxBonusPointsPerReferralSide, 500);
  assert.equal(catalog.season0.referrals.maxRefereesPerReferrer, 10);
  assert.equal(catalog.season0.referrals.referrerCanRemove, true);
  assert.equal(catalog.season0.referrals.noCascade, true);
  assert.deepEqual(catalog.season0.pointSources.eligibleBaseSources, ["quest", "event"]);

  assert.equal(catalog.payments.mferGpt.chainId, 8453);
  assert.equal(catalog.payments.mferGpt.tokenAddress, "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07");
  assert.equal(catalog.payments.mferGpt.uniswapV4Pool.hooks, "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC");
  assert.equal(catalog.payments.mferGpt.swap.route, "Base ETH -> WETH -> MFERGPT via Uniswap v4 Universal Router");
  assert.equal(catalog.payments.mferGpt.swap.agentAction, "swap_eth_for_mfergpt is available when wallet tools are configured and the run's ETH spend cap allows it.");
  assert.equal(catalog.payments.mferGpt.talentRespec.amountWei, "25000000000000000000000000");
  assert.equal(catalog.payments.mferGpt.talentRespec.message, "respecTalents");
  assert.equal(catalog.payments.mferGpt.season0AgentRequiredBalanceWei, "25000000000000000000000000");
  assert.match(catalog.payments.mferGpt.season0AgentHumanHelp, /swap-mfer/);
  assert.ok(catalog.traits.categories.some((category) => category.id === "type"));
  assert.equal(catalog.traits.declaredAgentModel, "mfergpt");
  assert.deepEqual(catalog.traits.forcedForDeclaredAgents, { eyes: "regular", mouth: "flat" });
  assert.deepEqual(catalog.traits.blockedForDeclaredAgents.categories, ["long_hair"]);
  assert.ok(catalog.traits.blockedForDeclaredAgents.options.eyes.includes("shades"));
  assert.ok(catalog.traits.blockedForDeclaredAgents.options.eyes.includes("nerd"));
  assert.ok(catalog.traits.blockedForDeclaredAgents.options.hat_under_headphones.includes("cap_based_blue"));
  assert.match(catalog.traits.note, /regular eyes and flat mouth/);
  assert.match(catalog.traits.note, /caps, long hair, shades, and glasses should remain unset/);
  assert.match(catalog.traits.selectionGuidance, /seeded variety/);
  assert.match(catalog.traits.note, /defaults or first-listed choices/);
  assert.equal(catalog.fishing.zone.id, "south-center-pond");
  assert.equal(catalog.fishing.tutorNpcId, "motherfisher");
  assert.equal(catalog.fishing.vendorNpcId, "fish-monger");
  assert.equal(catalog.fishing.statusNpcId, "pond-ledger-mfer");
  assert.equal(catalog.fishing.redemptionNpcId, "onchain-goodies-mfer");
  assert.deepEqual(catalog.fishing.controls.cast, { message: "startFishing", shape: { zoneId: "south-center-pond" } });
  assert.deepEqual(catalog.fishing.controls.buyChum, { message: "purchaseFishingSupply", shape: { payment: "MFERGPT burn proof for bucket of old chum" } });
  assert.equal(catalog.fishing.controls.mintOnchainFishingRod.message, "purchaseOnchainFishingRod");
  assert.deepEqual(catalog.fishing.controls.lootCatch, { message: "lootCorpse", shape: { npcId: "lootWindow.npcId from a fishing lootWindow" } });
  assert.deepEqual(catalog.fishing.controls.checkDailyNftStatus, { message: "interact", shape: { npcId: "pond-ledger-mfer" } });
  assert.deepEqual(catalog.fishing.controls.refreshNftHistory, { message: "refreshFishingNftHistory", shape: {} });
  assert.deepEqual(catalog.fishing.controls.forfeitNftClaimOffer, { message: "abandonFishingNftCatch", shape: { catchId: "unsubmitted pond catch id" } });
  assert.equal(catalog.fishing.controls.submitMintClubRedemptionTx.message, "submitMintClubRedemptionTx");
  assert.equal(catalog.fishing.controls.prepareMintClubRedemption.message, "prepareMintClubRedemption");
  assert.equal(catalog.fishing.controls.cancelMintClubRedemptionPreparation.message, "cancelMintClubRedemptionPreparation");
  assert.match(catalog.fishing.nftPond.rodRequirement.missingRodNotice, /rod_required_nft_hit/);
  assert.match(catalog.fishing.catchLootNote, /source=fishing/);
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("startFishing")));
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("submitFishingNftClaimTx")));
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("abandonFishingNftCatch")));
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("pond ledger")));
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("refreshFishingNftHistory")));
  assert.ok(catalog.fishing.playbook.some((step) => step.includes("submitMintClubRedemptionTx")));
  assert.equal(catalog.fishing.mintClubRedemption.npcId, "onchain-goodies-mfer");
  assert.equal(catalog.fishing.mintClubRedemption.chainId, 84532);
  assert.equal(catalog.fishing.mintClubRedemption.reserveTokenSymbol, "WETH");
  assert.equal(catalog.fishing.chum.price.amountWei, "5000000000000000000000000");
  assert.deepEqual(catalog.fishing.agentCatchPenalty, {
    reason: "fish can smell the metal",
    normalCatchChanceMultiplier: 0.5,
    rareFishChanceMultiplier: 0.5,
    nftCatchChanceMultiplier: 0.5,
    note: "Declared agents use normal fishing room messages, but completed non-quest reels have a 50% extra miss roll, rare fish weight is halved, and NFT pond chance is halved.",
  });
  assert.equal(catalog.fishing.agentBundleMultiplier, 2);
  assert.equal(catalog.fishing.items.find((item) => item.itemId === "huge-sartoshi-koi")?.agentBundleSize, 2);

  assert.equal(catalog.agentHarness.bridgeEndpoints.command, "/agent-command");
  assert.equal(catalog.agentHarness.bridgeEndpoints.fishingTool, "/agent-fishing");
  assert.equal(catalog.agentHarness.readOnlyEndpoints.profile, "/agent-profile?wallet=0x...");
  assert.equal(catalog.agentHarness.readOnlyEndpoints.world, "/agent-world");
  assert.ok(catalog.agentHarness.readOnlyEndpoints.livePlayerFields.includes("agentStatus"));
  assert.ok(catalog.agentHarness.readOnlyEndpoints.livePlayerFields.includes("agentCommand"));
  assert.match(catalog.agentHarness.readOnlyEndpoints.note, /public live world state/);
  assert.deepEqual(catalog.agentHarness.commands.kinds, ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals"]);
  assert.deepEqual(catalog.agentHarness.commands.profile.priorities, ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"]);
  assert.deepEqual(catalog.agentHarness.commands.profile.roles, ["auto", "tank", "healer", "dps", "support"]);
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("mainline_quester"));
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("healer"));
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("lone_wolf"));
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("jump_around"));
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("training_dummies"));
  assert.ok(catalog.agentHarness.commands.premadeSchemes.includes("dummy_dps"));
  assert.match(catalog.agentHarness.commands.premadeSchemeNote, /Explicit profile fields/);
  assert.ok(catalog.agentHarness.commands.goals.types.includes("quest_completed"));
  assert.ok(catalog.agentHarness.commands.goals.types.includes("near_player_count"));
  assert.match(catalog.agentHarness.commands.goals.note, /freeform player requests/);
  assert.equal(catalog.agentHarness.commands.constraints.walletSigningDefault, false);
  assert.deepEqual(catalog.agentHarness.commands.constraints.defaults, { maxDeaths: null, maxSafetyStops: null });
  assert.match(catalog.agentHarness.commands.constraints.note, /deaths and safety retreats are reported but do not end the command/);
  assert.match(catalog.agentHarness.commands.constraints.note, /zero-failure run/);
  assert.deepEqual(catalog.agentHarness.commands.controller.types, ["premade", "external_policy"]);
  assert.match(catalog.agentHarness.commands.controller.note, /metadata only/);
  assert.match(catalog.agentHarness.commands.timeboxingNote, /safety guards/);
  assert.match(catalog.agentHarness.commands.timeboxingNote, /disconnects the room bridge automatically/);
  assert.ok(catalog.agentHarness.commands.responseFields.includes("social"));
  assert.ok(catalog.agentHarness.commands.responseFields.includes("combat"));
  assert.ok(catalog.agentHarness.commands.responseFields.includes("finalState"));
  assert.ok(catalog.agentHarness.commands.responseFields.includes("equipmentChanges"));
  assert.match(catalog.agentHarness.commands.socialRecapNote, /nearby players\/agents/);
  assert.match(catalog.agentHarness.commands.fishingCommandNote, /dedicated \/agent-fishing tool/);
  assert.match(catalog.agentHarness.commands.fishingCommandNote, /regular offchain fish only/);
  assert.match(catalog.fishing.lostShoesQuestNote, /prerequisite_required/);
  assert.match(catalog.fishing.saleSemantics.nftCatches, /never sold by sellFishingItems/);
  assert.ok(catalog.agentHarness.registeredTools.manifests.includes("/.well-known/ai-tool/mfertown-agent-command.json"));
  assert.ok(catalog.agentHarness.registeredTools.manifests.includes("/.well-known/ai-tool/mfertown-fishing.json"));
  assert.ok(catalog.agentHarness.registeredTools.manifests.includes("/.well-known/ai-tool/mfertown-mfergpt-swap.json"));
  assert.equal(catalog.agentHarness.registeredTools.fishing, "/agent-fishing");
  assert.equal(catalog.agentHarness.registeredTools.swapQuote, "/agent-mfergpt-swap-quote");
  assert.match(catalog.agentHarness.registeredTools.xPaymentNote, /EIP-3009/);

  assert.equal(catalog.quests["baron-of-static"].encounterType, "group");
  assert.equal(catalog.quests["baron-of-static"].groupSuggestion, "group suggested");
  assert.equal(catalog.quests["baron-of-static"].suggestedPlayerCount, 4);
  assert.match(catalog.quests["baron-of-static"].soloWarning, /do not repeatedly solo/i);
  assert.deepEqual(catalog.quests["baron-of-static"].encounterPrepNpcIds, ["ridge-raider-vex", "ridge-raider-pax", "static-mage-ori"]);
  assert.equal(catalog.quests["mfergpt-daily-signal"].encounterType, "daily_boss");
  assert.equal(catalog.quests["mfergpt-daily-signal"].groupSuggestion, "daily boss");
  assert.equal(catalog.quests["mfergpt-daily-signal"].suggestedPlayerCount, 4);
  assert.match(catalog.quests["mfergpt-daily-signal"].soloWarning, /below level 10/i);
  assert.equal(catalog.quests["ogre-raid-daily"].encounterType, "raid");
  assert.equal(catalog.quests["ogre-raid-daily"].groupSuggestion, "raid suggested");
  assert.equal(catalog.quests["ogre-raid-daily"].suggestedPlayerCount, 4);
  assert.match(catalog.quests["ogre-raid-daily"].soloWarning, /raid content/i);
  assert.deepEqual(catalog.quests["hog-livers"].dropNpcModels, ["hog"]);
  assert.deepEqual(catalog.quests["signal-scraps"].dropNpcIdPrefixes, ["ridge-raider-", "static-mage-"]);
  assert.deepEqual(catalog.quests["signal-scraps"].agentHints, {
    targetArea: { label: "signal ridge scrap sources", point: { x: 145.5, z: -95.8 } },
    patrolPoints: [
      { label: "ridge switchback", point: { x: 129.5, z: -88.5 } },
      { label: "operator ridge", point: { x: 143.5, z: -88.8 } },
      { label: "repeater lane", point: { x: 153.2, z: -95.8 } },
      { label: "uplink edge", point: { x: 124, z: -104 } },
    ],
    avoidGenericTargetNpcIds: ["static-mage-ori"],
  });
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

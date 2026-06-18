import {
  COMBAT,
  EMOTES,
  EQUIPMENT_SLOTS,
  ITEMS,
  AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
  POTION_SHOP_ITEM_IDS,
  POTION_SHOP_NPC_ID,
  POTION_SHOP_PRODUCT_ID,
  POTION_SHOP_PURCHASE_QUANTITIES,
  PROGRESSION,
  QUESTS,
  TRASH_VENDOR_ITEM_IDS,
  TRASH_VENDOR_NPC_ID,
  MFER_APPEARANCE_TRAIT_CATEGORIES,
  AGENT_MFER_APPEARANCE_BLOCKED_TRAITS,
  AGENT_MFER_APPEARANCE_FORCED_TRAITS,
  AGENT_MFER_APPEARANCE_SELECTION_GUIDANCE,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  DEFAULT_MFERGPT_SWAP_ETH_AMOUNT,
  DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
  MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  MFERGPT_BASE_UNISWAP_V4_POOL,
  MFERGPT_BASE_WETH_ADDRESS,
  TALENTS,
  TALENT_TREES,
  WORLD_HUBS,
  WORLD_LANDMARKS,
  WORLD_ROADS,
  getPotionShopPrice,
  getTrashVendorSellValue,
  type PotionShopItemId,
  type PotionShopPurchaseQuantity,
} from "@mferland/shared";
import {
  AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL,
  DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI,
} from "./agentMferGptGate.js";
import { readAgentSeason0PointMultiplier } from "./agentRewards.js";

export function buildAgentCatalog() {
  return {
    ok: true,
    version: 2,
    generatedAt: new Date().toISOString(),
    controls: {
      session: ["leave"],
      movement: ["input", "respawn"],
      social: ["chat", "emote", "shareQuestLink"],
      npc: ["interact"],
      quests: ["acceptQuest", "completeQuest", "cancelQuest"],
      selection: ["selectTarget", "selectSelfTarget"],
      combat: ["combatAction"],
      lootAndItems: ["lootCorpse", "equipItem", "unequipItem", "useItem", "sellTrashItems"],
      character: ["selectTalent", "updateTraits"],
      walletStores: ["purchasePotionShopItem", "registerChainGear"],
      walletActions: [
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
      ],
      localClientPreferences: [
        "setHotbarSlot",
        "setQuestFocus",
        "toggleCompletedQuestVisibility",
        "setGraphicsQuality",
        "setAudio",
        "setNameplates",
        "configureLocalCryptoContracts",
      ],
    },
    agentHarness: {
      bridgeEndpoints: {
        start: "/agent-start",
        observe: "/agent-observe",
        action: "/agent-action",
        command: "/agent-command",
        commandStop: "/agent-command-stop",
        stop: "/agent-stop",
      },
      commands: {
        kinds: ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals"],
        stopWhen: ["any", "all"],
        profile: {
          priorities: ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"],
          roles: ["auto", "tank", "healer", "dps", "support"],
          specs: ["auto", "brawler_tank", "brawler_dps", "caster_fire", "caster_frost", "utility_ranger", "utility_support"],
          partyModes: ["auto", "grouper", "lone_wolf", "follow_leader"],
          risks: ["safe", "normal", "bold"],
          social: ["quiet", "normal", "chatty"],
        },
        premadeSchemes: [
          "mainline_quester",
          "farmer",
          "boss_hunter",
          "looter",
          "completionist",
          "social",
          "survivor",
          "healer",
          "tank",
          "dps",
          "support",
          "grouper",
          "lone_wolf",
        ],
        premadeSchemeNote: "behaviorScheme selects a premade profile seed. Explicit profile fields still override priority, role, spec, partyMode, risk, and social.",
        goals: {
          types: ["quest_completed", "quest_ready", "quest_accepted", "inventory_at_least", "level_at_least", "xp_gained", "survive_seconds", "arrive_at_landmark", "near_player_count"],
          note: "run_goals requires structured goals; freeform player requests should be translated by the agent before calling /agent-command.",
        },
        constraints: {
          fields: ["noWalletActions", "noPaidActions", "maxDeaths", "maxSafetyStops", "allowedActions", "disallowedActions"],
          defaults: { maxDeaths: 2, maxSafetyStops: 8 },
          walletSigningDefault: false,
          note: "Hosted autoplay cannot sign wallet transactions. Use noWalletActions/noPaidActions when a player request must not spend or request wallet approval. Set maxDeaths or maxSafetyStops to 0 for a zero-failure run.",
        },
        controller: {
          types: ["premade", "external_policy"],
          note: "external_policy is metadata only. Custom agent code runs in the caller-owned harness and calls /agent-action or structured /agent-command; the hosted server does not execute code.",
        },
        maxCommandSeconds: 30 * 60,
        timeboxingNote: "Command time limits are safety guards and budget caps. Success conditions such as quest completion or inventory target still end runs early.",
        authNote: "Command endpoints require the same wallet-bound agent session bearer token as observe/action.",
        responseFields: ["status", "summary", "result", "goals", "goalProgress", "questChanges", "inventoryChanges", "actionReports", "budget", "usage", "social"],
        socialRecapNote: "Command results include nearby players/agents seen during the run and recent public chat so agents can report alive-world context to users.",
        sandbox: {
          hostedCodeExecution: false,
          codeRule: "Do not send raw code to hosted /agent-command. Agent-authored behavior code runs in the caller's external policy runner and may call /agent-action directly or request structured autoplay.",
          externalPolicyMetadata: ["controller.type=external_policy", "controller.policyRef", "controller.policyHash"],
        },
      },
      registeredTools: {
        manifests: [
          "/.well-known/ai-tool/mferland-agent-command.json",
          "/.well-known/ai-tool/mferland-mfergpt-swap.json",
        ],
        swapQuote: "/agent-mfergpt-swap-quote",
        swapResult: "/agent-mfergpt-swap-result",
        xPaymentNote: "Registered tools use an ERC-8257-style manifest and accept zero-value EIP-3009 X-Payment payloads for OpenSea usage reporting.",
      },
    },
    menus: {
      character: {
        observes: ["walletAddress", "season0Points", "season0DailyPoints", "seasonPassOwnership", "level", "xp", "stats", "equipment"],
        controls: ["selectSelfTarget", "unequipItem", "refreshSeasonPassOwnership"],
      },
      stash: {
        observes: ["inventory", "itemDefinitions", "equipmentComparisons", "consumableDefinitions"],
        controls: ["equipItem", "useItem", "setHotbarSlot"],
      },
      moves: {
        observes: ["combatActions", "talents", "talentTrees", "talentPoints"],
        controls: ["combatAction", "selectTalent", "setHotbarSlot"],
      },
      hotbar: {
        observes: ["combatActions", "inventory.consumables", "selected target"],
        controls: ["setHotbarSlot", "interact", "combatAction", "useItem"],
        note: "Human hotbar slot arrangement is local client preference; agents call the same resulting room actions directly.",
      },
      errands: {
        observes: ["quests", "questOffers", "questTurnIns", "questStatus"],
        controls: ["setQuestFocus", "toggleCompletedQuestVisibility", "acceptQuest", "completeQuest", "cancelQuest", "shareQuestLink"],
      },
      loot: {
        observes: ["lootWindow", "nearbyNpcs.hasLoot"],
        controls: ["lootCorpse"],
        note: "Pass itemId to loot one item, or omit itemId to grab all available loot from the corpse.",
      },
      social: {
        observes: ["chat", "nearbyPlayers", "nearbyPlayers.agentStatus"],
        controls: ["chat", "emote"],
      },
      targets: {
        observes: ["nearbyPlayers", "nearbyNpcs"],
        controls: ["selectTarget", "selectSelfTarget", "combatAction.target", "interact", "moveNearPlayer", "moveNearNpc"],
      },
      traits: {
        npcId: "traits-mfer",
        observes: ["appearanceTraits", "traitUpdateResult"],
        controls: ["selectTraitCategory", "setTrait", "clearTrait", "randomizeTraits", "updateTraits"],
        paidControlRequiresPaymentProof: true,
      },
      potionShop: {
        npcId: POTION_SHOP_NPC_ID,
        observes: ["potionShop", "potionShopPurchaseResult"],
        controls: ["selectPotionShopItem", "selectPotionShopQuantity", "purchasePotionShopItem"],
        paidControlRequiresPaymentProof: true,
      },
      trashVendor: {
        npcId: TRASH_VENDOR_NPC_ID,
        observes: ["inventory", "trashVendor", "trashVendorSellResult", "season0Points", "season0DailyPoints"],
        controls: ["sellTrashItems"],
        paidControlRequiresPaymentProof: false,
        note: "Sell only catalog trash items through the normal sellTrashItems room message. The server applies Season 0 caps and declared-agent reward rules.",
      },
      cryptoStore: {
        npcId: "crypto-mfer",
        observes: ["walletBalances", "contractPrices", "marketQuotes", "chainGearOwnership", "inventory"],
        controls: [
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
        ],
        note: "Gear/pass purchases are wallet transactions. After gear mints, call registerChainGear through the room to add owned gear to inventory.",
      },
      swap: {
        npcId: "swap-mfer",
        observes: ["walletBalances"],
        controls: ["setSwapAmount", "setSwapSlippage", "quoteMferGptSwap", "swapEthForMferGpt", "copyMferGptContract", "openUniswapFallback"],
        note: "Swap is a wallet/onchain action. Humans use swap-mfer or the swap menu; configured headless agents use swap_eth_for_mfergpt. Both use the Base ETH to MFERGPT Uniswap v4 route.",
      },
      map: {
        observes: ["world.hubs", "world.roads", "world.landmarks", "players", "npcs"],
        controls: ["setQuestFocus", "inspectMapPoint", "move", "travelRoute"],
      },
      settings: {
        observes: ["graphicsQuality", "audio", "nameplates"],
        controls: ["setGraphicsQuality", "setAudio", "setNameplates", "toggleDebugLocalOnly"],
        note: "Settings do not grant gameplay powers or require room messages.",
      },
      system: {
        observes: ["connectionStatus", "deathState"],
        controls: ["respawn", "leave"],
      },
    },
    traits: {
      categories: MFER_APPEARANCE_TRAIT_CATEGORIES,
      declaredAgentModel: "mfergpt",
      forcedForDeclaredAgents: AGENT_MFER_APPEARANCE_FORCED_TRAITS,
      blockedForDeclaredAgents: AGENT_MFER_APPEARANCE_BLOCKED_TRAITS,
      selectionGuidance: AGENT_MFER_APPEARANCE_SELECTION_GUIDANCE,
      note: `Declared agents render with the mferGPT agent model. The trait form still needs valid mfer trait ids for identity metadata; choose accessories and style from the agent's identity or play archetype. Declared agents keep the robot face, so saved agent traits force regular eyes and flat mouth, and reject caps, long hair, shades, or glasses. ${AGENT_MFER_APPEARANCE_SELECTION_GUIDANCE}`,
    },
    payments: {
      mferGpt: {
        chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
        rpcUrl: TRAIT_CHANGE_BASE_RPC_URL,
        tokenAddress: TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
        burnAddress: TRAIT_CHANGE_BURN_ADDRESS,
        wethAddress: MFERGPT_BASE_WETH_ADDRESS,
        uniswapUniversalRouterAddress: MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
        uniswapV4Pool: MFERGPT_BASE_UNISWAP_V4_POOL,
        swap: {
          input: "ETH",
          output: "MFERGPT",
          chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
          route: "Base ETH -> WETH -> MFERGPT via Uniswap v4 Universal Router",
          npcId: "swap-mfer",
          defaultEthAmount: DEFAULT_MFERGPT_SWAP_ETH_AMOUNT,
          defaultSlippageBps: DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
          humanHelp: "Open swap-mfer or the swap menu to swap Base ETH to MFERGPT.",
          agentAction: "swap_eth_for_mfergpt is available when wallet tools are configured and the run's ETH spend cap allows it.",
        },
        season0AgentRequiredBalanceWei: DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI,
        season0AgentRequiredBalanceLabel: AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL,
        season0AgentRequirementNote: `Declared agents need ${AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL} on Base before Season 0 points accrue. Progress still saves below the gate.`,
        season0AgentHumanHelp: `To activate agent Season 0 earning, fund the agent wallet with ${AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL}. Humans can use swap-mfer or the swap menu to swap Base ETH to MFERGPT.`,
        season0AgentPointMultiplier: readAgentSeason0PointMultiplier(),
      },
    },
    combatActions: COMBAT.actions,
    emotes: EMOTES,
    progression: PROGRESSION,
    equipmentSlots: EQUIPMENT_SLOTS,
    items: Object.fromEntries(Object.entries(ITEMS).map(([id, item]) => {
      const optional = item as {
        value?: number;
        equipment?: unknown;
        consumable?: unknown;
        revealsAllNpcsOnMinimap?: boolean;
      };
      return [id, {
        id,
        name: item.name,
        description: item.description,
        quality: item.quality,
        iconColor: item.iconColor,
        stackable: item.stackable,
        value: optional.value ?? 0,
        equipment: optional.equipment ?? null,
        consumable: optional.consumable ?? null,
        revealsAllNpcsOnMinimap: Boolean(optional.revealsAllNpcsOnMinimap),
      }];
    })),
    talentTrees: TALENT_TREES,
    talents: Object.fromEntries(Object.entries(TALENTS).map(([id, talent]) => {
      const optional = talent as {
        minLevel?: number;
        requires?: unknown;
        unlockAction?: string;
      };
      return [id, {
        id,
        tree: talent.tree,
        nodeId: talent.nodeId,
        name: talent.name,
        description: talent.description,
        maxRank: talent.maxRank,
        minLevel: optional.minLevel ?? 1,
        requires: optional.requires ?? [],
        effectText: talent.effectText,
        effectPerRank: talent.effectPerRank,
        unlockAction: optional.unlockAction ?? "",
      }];
    })),
    potionShop: {
      npcId: POTION_SHOP_NPC_ID,
      productId: POTION_SHOP_PRODUCT_ID,
      items: POTION_SHOP_ITEM_IDS.map((itemId) => ({
        itemId,
        prices: Object.fromEntries(POTION_SHOP_PURCHASE_QUANTITIES.map((quantity) => [
          quantity,
          getPotionShopPrice(quantity as PotionShopPurchaseQuantity, itemId as PotionShopItemId),
        ])),
      })),
      quantities: POTION_SHOP_PURCHASE_QUANTITIES,
    },
    trashVendor: {
      npcId: TRASH_VENDOR_NPC_ID,
      baseSeasonPointValue: getTrashVendorSellValue(1),
      agentItemsPerPoint: AGENT_TRASH_VENDOR_ITEMS_PER_POINT,
      agentPayoutNote: `Declared agents sell complete ${AGENT_TRASH_VENDOR_ITEMS_PER_POINT}-trash bundles for 1 Season 0 point. Remainders stay in inventory.`,
      itemIds: TRASH_VENDOR_ITEM_IDS,
      items: TRASH_VENDOR_ITEM_IDS.map((itemId) => ({
        itemId,
        name: ITEMS[itemId].name,
        description: ITEMS[itemId].description,
        quality: ITEMS[itemId].quality,
        basePoints: getTrashVendorSellValue(1),
      })),
      controls: {
        sellOne: { message: "sellTrashItems", shape: { itemId: "trash item id", quantity: 1 } },
        sellStack: { message: "sellTrashItems", shape: { itemId: "trash item id", quantity: "integer 1..999" } },
        sellAll: { message: "sellTrashItems", shape: { sellAll: true } },
      },
    },
    quests: Object.fromEntries(Object.entries(QUESTS).map(([id, quest]) => {
      const optional = quest as {
        turnInNpcId?: string;
        requiredQuestId?: string;
        requiredItemId?: string;
        objectives?: unknown;
        defeatNpcModels?: unknown;
        defeatNpcRoles?: unknown;
        defeatNpcIdPrefixes?: unknown;
        dropNpcModels?: unknown;
        dropNpcRoles?: unknown;
        dropNpcIdPrefixes?: unknown;
        nextQuestId?: string;
        encounterType?: string;
        groupSuggestion?: string;
        suggestedPlayerCount?: number;
        soloWarning?: string;
        encounterPrepNpcIds?: unknown;
        agentHints?: unknown;
      };
      return [id, {
        id,
        title: quest.title,
        giverNpcId: quest.giverNpcId,
        turnInNpcId: optional.turnInNpcId ?? quest.giverNpcId,
        description: quest.description,
        objectiveLabel: quest.objectiveLabel,
        turnInLabel: quest.turnInLabel,
        required: quest.required,
        requiredQuestId: optional.requiredQuestId ?? "",
        requiredItemId: optional.requiredItemId ?? "",
        defeatNpcModels: optional.defeatNpcModels ?? [],
        defeatNpcRoles: optional.defeatNpcRoles ?? [],
        defeatNpcIdPrefixes: optional.defeatNpcIdPrefixes ?? [],
        dropNpcModels: optional.dropNpcModels ?? [],
        dropNpcRoles: optional.dropNpcRoles ?? [],
        dropNpcIdPrefixes: optional.dropNpcIdPrefixes ?? [],
        objectives: optional.objectives ?? [],
        xpReward: quest.xpReward,
        nextQuestId: optional.nextQuestId ?? "",
        encounterType: optional.encounterType ?? "solo",
        groupSuggestion: optional.groupSuggestion ?? "",
        suggestedPlayerCount: optional.suggestedPlayerCount ?? 1,
        soloWarning: optional.soloWarning ?? "",
        encounterPrepNpcIds: optional.encounterPrepNpcIds ?? [],
        agentHints: optional.agentHints ?? {},
      }];
    })),
    world: {
      hubs: WORLD_HUBS,
      roads: WORLD_ROADS,
      landmarks: WORLD_LANDMARKS,
    },
  };
}

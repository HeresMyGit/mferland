import {
  COMBAT,
  ITEMS,
  MERCHANT_NPC_IDS,
  POTION_SHOP_ITEM_IDS,
  POTION_SHOP_NPC_ID,
  POTION_SHOP_PURCHASE_QUANTITIES,
  QUESTS,
  getPotionShopPrice,
} from "@mferland/shared";

export function getGameAgentHandbook() {
  return {
    rules: [
      "You are playing through the public game room as a normal wallet player.",
      "Use only the listed actions. You cannot inspect the database, call scripts, teleport, boost, or use debug messages.",
      "The server is authoritative. If an action fails, observe again and try a normal in-game recovery.",
      "You can see nearby players and NPCs, your own quest log, inventory, equipment, health, mana, and recent chat.",
      "You do not know hidden NPC state outside your observation unless it is listed here as ordinary player map knowledge.",
    ],
    worldMap: [
      { place: "plaza", x: 0, z: 0, note: "starting town center and common meeting area" },
      { place: "og porch", x: -18, z: -8, npcId: "og-mfer", note: "intro quest giver" },
      { place: "dao hall", x: 18, z: -7.5, npcId: "dao-mfer", note: "early quest handoff" },
      { place: "fountain", x: -2, z: 4, npcId: "fountain-mfer", note: "early quest handoff and respawn area" },
      { place: "drip shop", x: -18, z: 11, npcId: "wearables-mfer", note: "wearables NPC, not a shop merchant" },
      { place: "traits mirror", x: -4, z: 24, npcId: "traits-mfer", note: "free first trait set and paid MFERGPT trait changes" },
      { place: "potion shop", x: 18, z: 10.5, npcId: POTION_SHOP_NPC_ID, note: "merchant selling potions and elixirs for burned MFERGPT" },
      { place: "crypto store", x: 12, z: 16, npcId: "crypto-mfer", note: "merchant for launch pass and chain gear purchases" },
      { place: "swap mfer", x: 24, z: 16, npcId: "swap-mfer", note: "merchant for swap affordances" },
      { place: "daily signal camp", x: -69.4, z: -55.6, npcId: "mfergpt-daily-boss", note: "mferGPT daily boss area southwest of town" },
    ],
    questHints: Object.entries(QUESTS).map(([questId, quest]) => ({
      questId,
      title: quest.title,
      giverNpcId: quest.giverNpcId,
      turnInNpcId: "turnInNpcId" in quest ? quest.turnInNpcId : quest.giverNpcId,
      objective: quest.objectiveLabel,
      requiredQuestId: "requiredQuestId" in quest ? quest.requiredQuestId : "",
    })),
    combat: Object.entries(COMBAT.actions).map(([actionId, action]) => ({
      actionId,
      label: action.label,
      range: `${action.minRange}-${action.maxRange}`,
      manaCost: action.manaCost,
      stationary: action.requiresStationary,
      note: action.description,
    })),
    merchants: [
      {
        npcId: POTION_SHOP_NPC_ID,
        kind: "potion shop",
        payment: "burn MFERGPT to the burn address, then submit the receipt through the normal purchase message",
        items: POTION_SHOP_ITEM_IDS.map((itemId) => ({
          itemId,
          name: ITEMS[itemId].name,
          description: ITEMS[itemId].description,
          singlePrice: getPotionShopPrice(1, itemId).label,
          bulkPrice: getPotionShopPrice(5, itemId).label,
        })),
        quantities: [...POTION_SHOP_PURCHASE_QUANTITIES],
      },
      {
        npcId: "crypto-mfer",
        kind: "crypto store",
        payment: "supports ETH, MFER, and discounted MFERGPT paths in the human UI",
        note: "Use this merchant when local contracts and token balances are available. Gear/pass purchase automation is separate from potion shop fulfillment.",
      },
      {
        npcId: "traits-mfer",
        kind: "traits",
        payment: "first trait save is free; later paid trait saves burn MFERGPT",
        note: "Use update_traits for the normal free trait quest. Paid trait changes require a burn receipt.",
      },
      {
        npcId: "swap-mfer",
        kind: "swap",
        payment: "local human-facing swap affordance",
        note: "Useful for player discovery, not required for the intro quest path.",
      },
    ],
    merchantNpcIds: [...MERCHANT_NPC_IDS],
  };
}

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
      { place: "traits mirror", x: -3.7, z: 25.4, npcId: "traits-mfer", note: "free first trait set and paid MFERGPT trait changes" },
      { place: "potion shop", x: 7.4, z: 25.4, npcId: POTION_SHOP_NPC_ID, note: "merchant selling potions and elixirs for burned MFERGPT" },
      { place: "crypto store", x: 3.7, z: 25.4, npcId: "crypto-mfer", note: "merchant for launch pass and chain gear purchases" },
      { place: "swap mfer", x: 0, z: 25.4, npcId: "swap-mfer", note: "merchant for swap affordances" },
      { place: "daily signal camp", x: -69.4, z: -55.6, npcId: "mfergpt-daily-boss", note: "mferGPT daily boss area southwest of town" },
      { place: "loop farm", x: -64.5, z: 64.5, npcId: "hogwatch-mfer", note: "farm quest hub north west of town; stay on roads to avoid extra hog pulls" },
      { place: "route post", x: -119.2, z: 132.4, npcId: "field-guide-mfer", note: "field camp quest hub past loop farm" },
      { place: "signal ridge", x: 108.8, z: -92.8, npcId: "ridge-guide-mfer", note: "ridge quest hub east and south of town" },
      { place: "static lot", x: 145.5, z: -84.2, npcId: "beacon-keeper-mfer", note: "dangerous ridge fight area; avoid dragging multiple raiders" },
    ],
    routes: [
      {
        routeId: "plaza-to-daily-signal-camp",
        name: "plaza to daily signal camp",
        note: "public road route to the edge of the mferGPT daily boss camp; stage here, observe the pack, and do not run into all camp NPCs alone",
        waypoints: [
          { x: -18, z: 0 },
          { x: -52, z: 0 },
          { x: -52, z: -36 },
          { x: -49, z: -42 },
        ],
      },
      {
        routeId: "daily-signal-camp-to-mfergpt",
        name: "daily signal camp to plaza mferGPT",
        note: "return route after the daily boss is defeated",
        waypoints: [
          { x: -58, z: -48 },
          { x: -52, z: -36 },
          { x: -52, z: 0 },
          { x: -18, z: 0 },
          { x: 6.8, z: -5.2 },
        ],
      },
      {
        routeId: "plaza-to-loop-farm",
        name: "plaza to loop farm",
        note: "public road route to claimwatch mfer; use this before farm hog or farmer quests instead of cutting through buildings or hog packs",
        waypoints: [
          { x: 0, z: 29 },
          { x: -31, z: 60 },
          { x: -64.5, z: 64.5 },
        ],
      },
      {
        routeId: "loop-farm-to-claim-pile",
        name: "claimwatch to claim pile edge",
        note: "farm-edge route to a safer hog pull point; observe before entering because hostile farmers stand inside the hog yard",
        waypoints: [
          { x: -60, z: 84 },
          { x: -60, z: 113 },
          { x: -70, z: 113 },
        ],
      },
      {
        routeId: "loop-farm-to-route-post",
        name: "loop farm to route post",
        note: "west-side road bypass from claimwatch toward field camp; use this instead of cutting through the hostile farmyard or claim-pile pack",
        waypoints: [
          { x: -64.5, z: 64.5 },
          { x: -82, z: 60 },
          { x: -108, z: 92 },
          { x: -108, z: 116 },
          { x: -119.2, z: 132.4 },
        ],
      },
      {
        routeId: "route-post-to-signal-ridge",
        name: "route post to signal ridge",
        note: "long public road from field camp back through town to signal ridge",
        waypoints: [
          { x: -101, z: 116 },
          { x: -76, z: 78 },
          { x: -31, z: 60 },
          { x: 0, z: 29 },
          { x: 0, z: -34 },
          { x: 53, z: -11.5 },
          { x: 75, z: -22 },
          { x: 120, z: -62 },
          { x: 108.8, z: -92.8 },
        ],
      },
      {
        routeId: "plaza-to-signal-ridge",
        name: "plaza to signal ridge",
        note: "public road from town to signal ridge after respawn",
        waypoints: [
          { x: 0, z: -34 },
          { x: 53, z: -11.5 },
          { x: 75, z: -22 },
          { x: 120, z: -62 },
          { x: 108.8, z: -92.8 },
        ],
      },
      {
        routeId: "signal-ridge-to-static-lot",
        name: "signal ridge to static lot",
        note: "short public ridge route toward the bad signal fight area; use it for signal scraps, cut-the-static, and Centralizer prep, then pull one visible enemy at a time",
        waypoints: [
          { x: 124, z: -104 },
          { x: 145.5, z: -84.2 },
        ],
      },
    ],
    questStrategy: [
      {
        questId: "boar-bristle-cull",
        plan: "From claimwatch, travel_route loop-farm-to-claim-pile to stage on the farm edge. Hogs and hostile farmers overlap inside the yard, so observe targeting first, pull one visible hog when safe, and back out or group if farmers join.",
      },
      {
        questId: "feral-farmers",
        plan: "At the farmyard, fight visible named farmer mfers one at a time: bran, mae, and sol. Regroup on the farm road if multiple farmers aggro.",
      },
      {
        questId: "hog-livers",
        plan: "Use the same farm-edge claim pile route, fight visible hogs one at a time when safe, and loot defeated hogs because this is an item collection quest.",
      },
      {
        questId: "route-patrol-daily",
        plan: "Near route post, fight visible hogs or claim-burnt farmer mfers one at a time. Avoid charging into clustered enemies.",
      },
      {
        questId: "hog-loop",
        plan: "Near claim booth, fight visible hogs one at a time, then return to pen-keeper-mfer when the quest is ready.",
      },
      {
        questId: "signal-scraps",
        plan: "Travel_route signal-ridge-to-static-lot, fight visible ridge raiders or static mages one at a time, and loot defeated enemies for scraps.",
      },
      {
        questId: "cut-the-static",
        plan: "Fight the visible named ridge enemies one at a time: operator vex, repeater pax, and echo-shell ori. Pull back to signal ridge if extra enemies join.",
      },
      {
        questId: "baron-of-static",
        plan: "Bring nearby players, use heals/taunts/items, and fight The Centralizer from the edge of the static lot. Do not run through the whole pack.",
      },
      {
        questId: "mfergpt-daily-signal",
        plan: "This is an optional repeatable camp boss. Stage at the road edge, group with visible players, and do not solo-run into the boss plus adds at low level. If it blocks main progression while you are alone, cancel it and continue the main quest chain.",
      },
      {
        questId: "ogre-raid-daily",
        plan: "Interact with beacon-keeper-mfer to call bear market mfer, then fight the visible raid boss as a group with heals, taunts, and items.",
      },
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
        strategy: "If local MFERGPT payment is configured and you have no stock, buy a useful item before leaving town. Red juice is the safest first combat purchase; quantity 5 is a normal stock-up purchase.",
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

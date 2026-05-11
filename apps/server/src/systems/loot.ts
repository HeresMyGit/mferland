import {
  ITEMS,
  LOOT,
  QUESTS,
  getMferGptDailyQuestAssignmentFromFlags,
  getInventoryItemKey,
  isMferGptDailyQuestDropSource,
  normalizeChainTokenId,
  type ItemId,
  type LootWindow,
} from "@mferland/shared";
import { LootItemState, type NpcState, type PlayerState } from "../state.js";
import { addInventoryItem, canDropQuestItem, progressLootQuests } from "./quests.js";

export function populateCorpseLoot(player: PlayerState, npc: NpcState, now: number) {
  npc.loot.clear();
  npc.hasLoot = false;

  if (npc.model === "hog") {
    if (canDropQuestItem(player, "hog-livers") && Math.random() < QUESTS["hog-livers"].dropRate) {
      addLootItem(npc, "hog-liver", 1);
    }
    addMferGptDailyQuestDrop(player, npc);
    if (Math.random() < 0.28) {
      addLootItem(npc, "muddy-tusk", 1);
    }
    if (Math.random() < 0.18) {
      addLootItem(npc, "small-tooth", 1);
    }
    if (Math.random() < 0.22) {
      addLootItem(npc, "field-snack", 1);
    }
    if (Math.random() < 0.08) {
      addLootItem(npc, "red-juice", 1);
    }
    if (Math.random() < 0.035) {
      addLootItem(npc, "boar-bristle-cap", 1);
    }
  } else if (npc.model === "rabbit") {
    if (Math.random() < 0.36) {
      addLootItem(npc, "small-tooth", 1);
    }
    if (Math.random() < 0.16) {
      addLootItem(npc, "field-snack", 1);
    }
  } else if (npc.model === "deer") {
    if (Math.random() < 0.42) {
      addLootItem(npc, "worn-antler", 1);
    }
    if (Math.random() < 0.22) {
      addLootItem(npc, "field-snack", 1);
    }
    if (Math.random() < 0.06) {
      addLootItem(npc, "blue-juice", 1);
    }
  } else if (npc.role === "farmer") {
    if (npc.id === "raid-ogre-mfer") {
      npc.respawnAt = 0;
      if (Math.random() < 0.16) {
        addLootItem(npc, "static-loop-ring", 1);
      }
      if (Math.random() < 0.14) {
        addLootItem(npc, "feedback-headphones", 1);
      }
      if (Math.random() < 0.14) {
        addLootItem(npc, "all-nighter-hoodie", 1);
      }
      if (Math.random() < 0.12) {
        addLootItem(npc, "router-antenna-wand", 1);
      }
      if (Math.random() < 0.12) {
        addLootItem(npc, "bottlecap-sling", 1);
      }
      if (Math.random() < 0.1) {
        addLootItem(npc, "stickered-laptop-lid", 1);
      }
      if (Math.random() < 0.12) {
        addLootItem(npc, "burn-hole-mousepad", 1);
      }
      addLootItem(npc, "red-juice", 2);
      addLootItem(npc, "blue-juice", 2);
      npc.hasLoot = npcHasLoot(npc);
      if (!npc.hasLoot) return;

      npc.despawnAt = now + LOOT.corpseDespawnMs;
      return;
    }

    if (npc.id === "static-baron-nox") {
      if (Math.random() < 0.16) {
        addLootItem(npc, "static-loop-ring", 1);
      }
      if (Math.random() < 0.14) {
        addLootItem(npc, "feedback-headphones", 1);
      }
      if (Math.random() < 0.14) {
        addLootItem(npc, "logoff-hoodie", 1);
      }
      if (Math.random() < 0.18) {
        addLootItem(npc, "blue-juice", 1);
      }
      if (Math.random() < 0.14) {
        addLootItem(npc, "red-juice", 1);
      }
    } else if (isRidgeRaider(npc)) {
      if (canDropQuestItem(player, "signal-scraps") && Math.random() < QUESTS["signal-scraps"].dropRate) {
        addLootItem(npc, "signal-scrap", 1);
      }
      addMferGptDailyQuestDrop(player, npc);
      if (Math.random() < 0.055) {
        addLootItem(npc, "static-loop-ring", 1);
      }
      if (Math.random() < 0.035) {
        addLootItem(npc, "deadzone-beanie", 1);
      }
      if (Math.random() < 0.03) {
        addLootItem(npc, "static-zip-hoodie", 1);
      }
      if (isCasterNpc(npc) && Math.random() < 0.045) {
        addLootItem(npc, "router-antenna-wand", 1);
      }
      if (!isCasterNpc(npc) && Math.random() < 0.045) {
        addLootItem(npc, "bottlecap-sling", 1);
      }
      if (Math.random() < 0.025) {
        addLootItem(npc, "stickered-laptop-lid", 1);
      }
      if (Math.random() < 0.035) {
        addLootItem(npc, "burn-hole-mousepad", 1);
      }
      if (Math.random() < 0.12) {
        addLootItem(npc, "blue-juice", 1);
      }
    }

    const bandanaDropRate = !isRidgeRaider(npc) ? 0.35 : 0;
    if (!isRidgeRaider(npc)) {
      addMferGptDailyQuestDrop(player, npc);
    }
    if (bandanaDropRate > 0 && Math.random() < bandanaDropRate) {
      addLootItem(npc, "farmhand-bandana", 1);
    }
    if (!isRidgeRaider(npc) && Math.random() < 0.05) {
      addLootItem(npc, "field-patched-hoodie", 1);
    }
    if (!isRidgeRaider(npc) && !isCasterNpc(npc) && Math.random() < 0.05) {
      addLootItem(npc, "farmhand-spade", 1);
    }
    if (!isRidgeRaider(npc) && Math.random() < 0.04) {
      addLootItem(npc, "airdrop-burn-hoodie", 1);
    }
    if (!isRidgeRaider(npc) && Math.random() < 0.04) {
      addLootItem(npc, "claim-booth-cap", 1);
    }
    if (!isRidgeRaider(npc) && isCasterNpc(npc) && Math.random() < 0.07) {
      addLootItem(npc, "claim-clipboard", 1);
    }
    if (!isRidgeRaider(npc) && Math.random() < 0.035) {
      addLootItem(npc, "missed-creyzies-keychain", 1);
    }
    if (!isRidgeRaider(npc) && !isCasterNpc(npc) && Math.random() < 0.06) {
      addLootItem(npc, "stickerbomb-sling", 1);
    }
    if (Math.random() < 0.1) {
      addLootItem(npc, "red-juice", 1);
    }
  } else if (npc.role === "enemy" && Math.random() < 0.22) {
    addLootItem(npc, "dummy-splinter", 1);
    if (Math.random() < 0.18) {
      addLootItem(npc, "field-snack", 1);
    }
  }

  npc.hasLoot = npcHasLoot(npc);
  if (!npc.hasLoot) return;

  npc.despawnAt = now + LOOT.corpseDespawnMs;
  npc.respawnAt = npc.despawnAt + 250;
}

function addMferGptDailyQuestDrop(player: PlayerState, npc: NpcState) {
  const quest = player.quests.get("mfergpt-daily-signal");
  if (!quest || quest.status !== "active") return;

  const assignment = getMferGptDailyQuestAssignmentFromFlags(quest.flags);
  if (!assignment.itemId || !isMferGptDailyQuestDropSource(assignment, npc)) return;
  if (Math.random() >= (assignment.dropRate ?? 1)) return;

  addLootItem(npc, assignment.itemId, 1);
}

function addLootItem(npc: NpcState, itemId: ItemId, count: number, chainTokenId = "") {
  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  const lootKey = getInventoryItemKey(itemId, normalizedTokenId);
  const existing = npc.loot.get(lootKey);
  if (existing) {
    existing.count += count;
    return;
  }

  const item = new LootItemState();
  item.id = itemId;
  item.chainTokenId = normalizedTokenId;
  item.count = count;
  npc.loot.set(lootKey, item);
}

export function lootCorpseItem(player: PlayerState, npc: NpcState, itemId: ItemId, chainTokenId = "") {
  const lootKey = getInventoryItemKey(itemId, chainTokenId);
  const loot = npc.loot.get(lootKey);
  if (!loot || loot.count <= 0) return;

  addInventoryItem(player, itemId, loot.count, loot.chainTokenId);
  progressLootQuests(player, itemId, loot.count);
  npc.loot.delete(lootKey);
  npc.hasLoot = npcHasLoot(npc);
}

export function npcHasLoot(npc: NpcState) {
  let hasLoot = false;
  npc.loot.forEach((item) => {
    if (item.count > 0 && ITEMS[item.id]) hasLoot = true;
  });
  return hasLoot;
}

export function makeLootWindow(npc: NpcState): LootWindow {
  const items: LootWindow["items"] = [];
  npc.loot.forEach((item) => {
    if (item.count > 0 && ITEMS[item.id]) {
      items.push({ id: item.id, chainTokenId: item.chainTokenId, count: item.count });
    }
  });
  return {
    npcId: npc.id,
    npcName: npc.name,
    items,
  };
}

export function normalizeItemId(input: unknown): ItemId | null {
  return typeof input === "string" && Object.prototype.hasOwnProperty.call(ITEMS, input) ? input as ItemId : null;
}

function isRidgeRaider(npc: NpcState) {
  return npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function isCasterNpc(npc: NpcState) {
  return npc.combatStyle === "caster" || npc.id.includes("mage");
}

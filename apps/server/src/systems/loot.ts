import {
  ITEMS,
  LOOT,
  QUESTS,
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
    if (Math.random() < 0.28) {
      addLootItem(npc, "muddy-tusk", 1);
    }
    if (Math.random() < 0.18) {
      addLootItem(npc, "small-tooth", 1);
    }
  } else if (npc.model === "rabbit") {
    if (Math.random() < 0.36) {
      addLootItem(npc, "small-tooth", 1);
    }
  } else if (npc.model === "deer") {
    if (Math.random() < 0.42) {
      addLootItem(npc, "worn-antler", 1);
    }
  } else if (npc.role === "farmer") {
    const bandanaDropRate = canDropQuestItem(player, "farmhand-bandanas") && "dropRate" in QUESTS["farmhand-bandanas"]
      ? QUESTS["farmhand-bandanas"].dropRate
      : 0.35;
    if (Math.random() < bandanaDropRate) {
      addLootItem(npc, "farmhand-bandana", 1);
    }
  } else if (npc.role === "enemy" && Math.random() < 0.22) {
    addLootItem(npc, "dummy-splinter", 1);
  }

  npc.hasLoot = npcHasLoot(npc);
  if (!npc.hasLoot) return;

  npc.despawnAt = now + LOOT.corpseDespawnMs;
  npc.respawnAt = npc.despawnAt + 250;
}

function addLootItem(npc: NpcState, itemId: ItemId, count: number) {
  const existing = npc.loot.get(itemId);
  if (existing) {
    existing.count += count;
    return;
  }

  const item = new LootItemState();
  item.id = itemId;
  item.count = count;
  npc.loot.set(itemId, item);
}

export function lootCorpseItem(player: PlayerState, npc: NpcState, itemId: ItemId) {
  const loot = npc.loot.get(itemId);
  if (!loot || loot.count <= 0) return;

  addInventoryItem(player, itemId, loot.count);
  progressLootQuests(player, itemId, loot.count);
  npc.loot.delete(itemId);
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
      items.push({ id: item.id, count: item.count });
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

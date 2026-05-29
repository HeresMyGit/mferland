import {
  clamp,
  getInventoryItemKey,
  getItemConsumable,
  normalizeChainTokenId,
  type ItemId,
} from "@mferland/shared";
import { InventoryItemState, type PlayerState } from "../state.js";
import { applyElixirBuff } from "./buffs.js";
import { recalculatePlayerStats } from "./equipment.js";

export type ConsumableCooldowns = Map<string, number>;

const STARTER_CONSUMABLE_COUNTS = {
  "field-snack": 5,
  "red-juice": 3,
  "blue-juice": 3,
} as const satisfies Partial<Record<ItemId, number>>;

export function grantStarterConsumables(player: PlayerState) {
  for (const [itemId, count] of Object.entries(STARTER_CONSUMABLE_COUNTS) as Array<[ItemId, number]>) {
    const inventoryKey = getInventoryItemKey(itemId);
    const existing = player.inventory.get(inventoryKey);
    if (existing) {
      if (existing.count < count) existing.count = count;
      continue;
    }

    const item = new InventoryItemState();
    item.id = itemId;
    item.chainTokenId = "";
    item.count = count;
    player.inventory.set(inventoryKey, item);
  }
}

export function useInventoryConsumable({
  chainTokenId = "",
  cooldowns,
  itemId,
  now,
  player,
  sessionId,
}: {
  chainTokenId?: string;
  cooldowns: ConsumableCooldowns;
  itemId: ItemId;
  now: number;
  player: PlayerState;
  sessionId: string;
}) {
  const consumable = getItemConsumable(itemId);
  if (!consumable) return false;

  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  const inventoryKey = getInventoryItemKey(itemId, normalizedTokenId);
  const inventoryItem = player.inventory.get(inventoryKey);
  if (!inventoryItem || inventoryItem.count <= 0) return false;

  const cooldownKey = getConsumableCooldownKey(sessionId, consumable.kind);
  if ((cooldowns.get(cooldownKey) ?? 0) > now) return false;

  if (consumable.buffId) {
    applyElixirBuff(player, consumable.buffId, now);
    recalculatePlayerStats(player);
  } else {
    const nextHealth = clamp(player.health + (consumable.health ?? 0), 0, player.maxHealth);
    const nextMana = clamp(player.mana + (consumable.mana ?? 0), 0, player.maxMana);
    if (nextHealth <= player.health && nextMana <= player.mana) return false;

    player.health = nextHealth;
    player.mana = nextMana;
  }

  inventoryItem.count -= 1;
  if (inventoryItem.count <= 0) player.inventory.delete(inventoryKey);
  cooldowns.set(cooldownKey, now + consumable.cooldownMs);
  return true;
}

export function clearConsumableCooldownsForPlayer(cooldowns: ConsumableCooldowns, sessionId: string) {
  const prefix = `${sessionId}:`;
  for (const key of cooldowns.keys()) {
    if (key.startsWith(prefix)) cooldowns.delete(key);
  }
}

function getConsumableCooldownKey(sessionId: string, kind: string) {
  return `${sessionId}:${kind}`;
}

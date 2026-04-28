import {
  DEFAULT_EQUIPMENT,
  EQUIPMENT_SLOTS,
  STARTER_GEAR_IDS,
  clamp,
  getEquippedCharacterStats,
  getItemEquipment,
  type EquipmentSlotId,
  type ItemId,
} from "@mferland/shared";
import { EquipmentSlotState, InventoryItemState, type PlayerState } from "../state.js";

export function normalizeEquipmentSlotId(input: unknown): EquipmentSlotId | null {
  return typeof input === "string" && Object.prototype.hasOwnProperty.call(EQUIPMENT_SLOTS, input)
    ? input as EquipmentSlotId
    : null;
}

export function initializeCharacterEquipment(player: PlayerState) {
  grantStarterGear(player);
  if (!hasAnyEquippedItem(player)) {
    equipDefaultStarterGear(player);
  }
  recalculatePlayerStats(player);
}

export function equipInventoryItem(player: PlayerState, itemId: ItemId) {
  if ((player.inventory.get(itemId)?.count ?? 0) <= 0) return false;

  const equipment = getItemEquipment(itemId);
  if (!equipment) return false;

  const slot = getOrCreateEquipmentSlot(player, equipment.slot);
  if (slot.itemId === itemId) return true;

  slot.itemId = itemId;
  recalculatePlayerStats(player);
  return true;
}

export function unequipPlayerSlot(player: PlayerState, slotId: EquipmentSlotId) {
  const slot = player.equipment.get(slotId);
  if (!slot?.itemId) return false;

  slot.itemId = "";
  recalculatePlayerStats(player);
  return true;
}

export function recalculatePlayerStats(player: PlayerState) {
  const itemIds: Array<ItemId | ""> = [];
  player.equipment.forEach((slot) => itemIds.push(slot.itemId));

  const stats = getEquippedCharacterStats(itemIds);
  player.maxHealth = stats.maxHealth;
  player.maxMana = stats.maxMana;
  player.strength = stats.strength;
  player.dexterity = stats.dexterity;
  player.magic = stats.magic;
  player.health = clamp(player.health, 0, player.maxHealth);
  player.mana = clamp(player.mana, 0, player.maxMana);
}

function grantStarterGear(player: PlayerState) {
  for (const itemId of STARTER_GEAR_IDS) {
    if ((player.inventory.get(itemId)?.count ?? 0) > 0) continue;

    const item = new InventoryItemState();
    item.id = itemId;
    item.count = 1;
    player.inventory.set(itemId, item);
  }
}

function equipDefaultStarterGear(player: PlayerState) {
  for (const [slotId, itemId] of Object.entries(DEFAULT_EQUIPMENT) as Array<[EquipmentSlotId, ItemId]>) {
    const equipment = getItemEquipment(itemId);
    if (!equipment || equipment.slot !== slotId) continue;
    if ((player.inventory.get(itemId)?.count ?? 0) <= 0) continue;

    const slot = getOrCreateEquipmentSlot(player, slotId);
    slot.itemId = itemId;
  }
}

function hasAnyEquippedItem(player: PlayerState) {
  let hasEquipped = false;
  player.equipment.forEach((slot) => {
    if (slot.itemId) hasEquipped = true;
  });
  return hasEquipped;
}

function getOrCreateEquipmentSlot(player: PlayerState, slotId: EquipmentSlotId) {
  const existing = player.equipment.get(slotId);
  if (existing) return existing;

  const slot = new EquipmentSlotState();
  slot.slot = slotId;
  player.equipment.set(slotId, slot);
  return slot;
}

import {
  DEFAULT_EQUIPMENT,
  EQUIPMENT_SLOTS,
  PLAYER,
  STARTER_GEAR_IDS,
  clamp,
  getChainGearItemId,
  getEquippedCharacterStats,
  getInventoryItemKey,
  getItemEquipment,
  normalizeChainGearTier,
  normalizeChainTokenId,
  type EquippedItemRef,
  type EquipmentSlotId,
  type ItemId,
} from "@mferland/shared";
import { EquipmentSlotState, InventoryItemState, type PlayerState } from "../state.js";
import { getPlayerTalentEffects } from "./talents.js";

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

export function equipInventoryItem(player: PlayerState, itemId: ItemId, chainTokenId = "") {
  const inventoryKey = getInventoryItemKey(itemId, chainTokenId);
  const inventoryItem = player.inventory.get(inventoryKey);
  if ((inventoryItem?.count ?? 0) <= 0) return false;

  const equipment = getItemEquipment(itemId);
  if (!equipment) return false;

  const slot = getOrCreateEquipmentSlot(player, equipment.slot);
  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  const chainTier = normalizeChainGearTier(inventoryItem?.chainTier);
  if (slot.itemId === itemId && slot.chainTokenId === normalizedTokenId && slot.chainTier === chainTier) return true;

  slot.itemId = itemId;
  slot.chainTokenId = normalizedTokenId;
  slot.chainTier = chainTier;
  recalculatePlayerStats(player);
  return true;
}

export function unequipPlayerSlot(player: PlayerState, slotId: EquipmentSlotId) {
  const slot = player.equipment.get(slotId);
  if (!slot?.itemId) return false;

  slot.itemId = "";
  slot.chainTokenId = "";
  slot.chainTier = 1;
  recalculatePlayerStats(player);
  return true;
}

export function recalculatePlayerStats(player: PlayerState) {
  const items: EquippedItemRef[] = [];
  player.equipment.forEach((slot) => items.push({ itemId: slot.itemId, chainTier: slot.chainTier }));

  const stats = getEquippedCharacterStats(items);
  const talentEffects = getPlayerTalentEffects(player);

  player.maxHealth = stats.maxHealth + (talentEffects.stats.maxHealth ?? 0);
  player.maxMana = stats.maxMana + (talentEffects.stats.maxMana ?? 0);
  player.strength = stats.strength + (talentEffects.stats.strength ?? 0);
  player.dexterity = stats.dexterity + (talentEffects.stats.dexterity ?? 0);
  player.magic = stats.magic + (talentEffects.stats.magic ?? 0);
  player.healthRegenPer5 = PLAYER.healthRegenPer5 + talentEffects.healthRegenPer5;
  player.manaRegenPer5 = PLAYER.manaRegenPer5 + talentEffects.manaRegenPer5;
  player.walkSpeed = PLAYER.walkSpeed + talentEffects.walkSpeed;
  player.runSpeed = PLAYER.runSpeed + talentEffects.runSpeed;
  player.health = clamp(player.health, 0, player.maxHealth);
  player.mana = clamp(player.mana, 0, player.maxMana);
}

export function registerChainGearItem(player: PlayerState, gearType: number, chainTokenId = "", chainTier = 1) {
  const itemId = getChainGearItemId(gearType);
  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  if (!itemId || !normalizedTokenId) return false;

  const equipment = getItemEquipment(itemId);
  if (!equipment) return false;

  const inventoryKey = getInventoryItemKey(itemId, normalizedTokenId);
  const item = player.inventory.get(inventoryKey) ?? new InventoryItemState();
  item.id = itemId;
  item.chainTokenId = normalizedTokenId;
  item.chainTier = normalizeChainGearTier(chainTier);
  item.count = Math.max(1, item.count);
  player.inventory.set(inventoryKey, item);

  const slot = getOrCreateEquipmentSlot(player, equipment.slot);
  slot.itemId = itemId;
  slot.chainTokenId = normalizedTokenId;
  slot.chainTier = item.chainTier;

  recalculatePlayerStats(player);
  return true;
}

export function updateChainGearTier(player: PlayerState, chainTokenId = "", chainTier = 1) {
  const normalizedTokenId = normalizeChainTokenId(chainTokenId);
  if (!normalizedTokenId) return false;

  const tier = normalizeChainGearTier(chainTier);
  let changed = false;

  player.inventory.forEach((item) => {
    if (item.chainTokenId !== normalizedTokenId || !getItemEquipment(item.id)) return;
    if (item.chainTier !== tier) {
      item.chainTier = tier;
      changed = true;
    }
  });

  player.equipment.forEach((slot) => {
    if (slot.chainTokenId !== normalizedTokenId) return;
    if (slot.chainTier !== tier) {
      slot.chainTier = tier;
      changed = true;
    }
  });

  if (changed) recalculatePlayerStats(player);
  return changed;
}

function grantStarterGear(player: PlayerState) {
  for (const itemId of STARTER_GEAR_IDS) {
    const inventoryKey = getInventoryItemKey(itemId);
    if ((player.inventory.get(inventoryKey)?.count ?? 0) > 0) continue;

    const item = new InventoryItemState();
    item.id = itemId;
    item.chainTokenId = "";
    item.chainTier = 1;
    item.count = 1;
    player.inventory.set(inventoryKey, item);
  }
}

function equipDefaultStarterGear(player: PlayerState) {
  for (const [slotId, itemId] of Object.entries(DEFAULT_EQUIPMENT) as Array<[EquipmentSlotId, ItemId]>) {
    const equipment = getItemEquipment(itemId);
    if (!equipment || equipment.slot !== slotId) continue;
    if ((player.inventory.get(itemId)?.count ?? 0) <= 0) continue;

    const slot = getOrCreateEquipmentSlot(player, slotId);
    slot.itemId = itemId;
    slot.chainTokenId = "";
    slot.chainTier = 1;
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

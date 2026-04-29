import {
  ITEMS,
  getItemConsumable,
  getItemEquipment,
  type ActionId,
  type EquipmentSlotId,
  type ItemId,
  type TalentTreeId,
} from "@mferland/shared";

const ICON_ROOT = "/icons";

export type IconCategoryId =
  | "armor"
  | "weapon"
  | "consumable"
  | "quest"
  | "material"
  | "head"
  | "chest"
  | "main-hand"
  | "off-hand"
  | "trinket"
  | "magic"
  | "ranged"
  | "melee"
  | "food"
  | "potion";

export type PlaceholderIconId =
  | "unknown-item"
  | "unknown-ability"
  | "empty-slot"
  | "locked"
  | "missing-art"
  | "generic-item-cube"
  | "loot-pouch"
  | "generic-gear"
  | "unknown-symbol"
  | "locked-ability";

const ITEM_ICON_SOURCES = {
  "sealed-note": `${ICON_ROOT}/items/sealed-note.png`,
  "hog-liver": `${ICON_ROOT}/items/hog-liver.png`,
  "muddy-tusk": `${ICON_ROOT}/items/muddy-tusk.png`,
  "small-tooth": `${ICON_ROOT}/items/small-tooth.png`,
  "worn-antler": `${ICON_ROOT}/items/worn-antler.png`,
  "farmhand-bandana": `${ICON_ROOT}/items/farmhand-bandana.png`,
  "signal-scrap": `${ICON_ROOT}/items/signal-scrap.png`,
  "dummy-splinter": `${ICON_ROOT}/items/dummy-splinter.png`,
  "field-snack": `${ICON_ROOT}/items/field-snack.png`,
  "red-juice": `${ICON_ROOT}/items/red-juice.png`,
  "blue-juice": `${ICON_ROOT}/items/blue-juice.png`,
  "frayed-cap": `${ICON_ROOT}/items/frayed-cap.png`,
  "plaza-hoodie": `${ICON_ROOT}/items/plaza-hoodie.png`,
  "rusty-skate-deck": `${ICON_ROOT}/items/rusty-skate-deck.png`,
  "bent-slingshot": `${ICON_ROOT}/items/bent-slingshot.png`,
  "stickered-wand": `${ICON_ROOT}/items/stickered-wand.png`,
  "road-sign-lid": `${ICON_ROOT}/items/road-sign-lid.png`,
  "pocket-zine": `${ICON_ROOT}/items/pocket-zine.png`,
  "lucky-lighter": `${ICON_ROOT}/items/lucky-lighter.png`,
  "boar-bristle-cap": `${ICON_ROOT}/items/boar-bristle-cap.png`,
  "antler-charm": `${ICON_ROOT}/items/antler-charm.png`,
  "farmhand-spade": `${ICON_ROOT}/items/farmhand-spade.png`,
  "field-patched-hoodie": `${ICON_ROOT}/items/field-patched-hoodie.png`,
  "ridge-runner-beanie": `${ICON_ROOT}/items/ridge-runner-beanie.png`,
  "baron-breaker-board": `${ICON_ROOT}/items/baron-breaker-board.png`,
  "static-loop-ring": `${ICON_ROOT}/items/static-loop-ring.png`,
} as const satisfies Record<ItemId, string>;

const ACTION_ICON_SOURCES = {
  interact: `${ICON_ROOT}/abilities/interact.png`,
  attack: `${ICON_ROOT}/abilities/attack.png`,
  shoot: `${ICON_ROOT}/abilities/shoot.png`,
  signalShot: `${ICON_ROOT}/abilities/signal-shot.png`,
  fireblast: `${ICON_ROOT}/abilities/fireblast.png`,
  frostNova: `${ICON_ROOT}/abilities/frost-nova.png`,
  heal: `${ICON_ROOT}/abilities/heal.png`,
  taunt: `${ICON_ROOT}/abilities/taunt.png`,
  whirlwind: `${ICON_ROOT}/abilities/whirlwind.png`,
  multishot: `${ICON_ROOT}/abilities/multishot.png`,
  iceBlast: `${ICON_ROOT}/abilities/ice-blast.png`,
} as const satisfies Record<ActionId, string>;

const CATEGORY_ICON_SOURCES = {
  armor: `${ICON_ROOT}/categories/armor.png`,
  weapon: `${ICON_ROOT}/categories/weapon.png`,
  consumable: `${ICON_ROOT}/categories/consumable.png`,
  quest: `${ICON_ROOT}/categories/quest.png`,
  material: `${ICON_ROOT}/categories/material.png`,
  head: `${ICON_ROOT}/categories/head.png`,
  chest: `${ICON_ROOT}/categories/chest.png`,
  "main-hand": `${ICON_ROOT}/categories/main-hand.png`,
  "off-hand": `${ICON_ROOT}/categories/off-hand.png`,
  trinket: `${ICON_ROOT}/categories/trinket.png`,
  magic: `${ICON_ROOT}/categories/magic.png`,
  ranged: `${ICON_ROOT}/categories/ranged.png`,
  melee: `${ICON_ROOT}/categories/melee.png`,
  food: `${ICON_ROOT}/categories/food.png`,
  potion: `${ICON_ROOT}/categories/potion.png`,
} as const satisfies Record<IconCategoryId, string>;

const PLACEHOLDER_ICON_SOURCES = {
  "unknown-item": `${ICON_ROOT}/placeholders/unknown-item.png`,
  "unknown-ability": `${ICON_ROOT}/placeholders/unknown-ability.png`,
  "empty-slot": `${ICON_ROOT}/placeholders/empty-slot.png`,
  locked: `${ICON_ROOT}/placeholders/locked.png`,
  "missing-art": `${ICON_ROOT}/placeholders/missing-art.png`,
  "generic-item-cube": `${ICON_ROOT}/placeholders/generic-item-cube.png`,
  "loot-pouch": `${ICON_ROOT}/placeholders/loot-pouch.png`,
  "generic-gear": `${ICON_ROOT}/placeholders/generic-gear.png`,
  "unknown-symbol": `${ICON_ROOT}/placeholders/unknown-symbol.png`,
  "locked-ability": `${ICON_ROOT}/placeholders/locked-ability.png`,
} as const satisfies Record<PlaceholderIconId, string>;

export function getItemIconSrc(itemId: ItemId) {
  return ITEM_ICON_SOURCES[itemId] ?? getItemFallbackIconSrc(itemId);
}

export function getItemFallbackIconSrc(itemId: ItemId) {
  const equipment = getItemEquipment(itemId);
  if (equipment) return getEquipmentSlotIconSrc(equipment.slot);

  const consumable = getItemConsumable(itemId);
  if (consumable?.kind === "food") return getCategoryIconSrc("food");
  if (consumable?.kind === "potion") return getCategoryIconSrc("potion");

  const item = ITEMS[itemId];
  if (item.quality === "quest") return getCategoryIconSrc("quest");
  return getCategoryIconSrc("material");
}

export function getActionIconSrc(actionId: ActionId) {
  return ACTION_ICON_SOURCES[actionId] ?? getPlaceholderIconSrc("unknown-ability");
}

export function getActionFallbackIconSrc() {
  return getPlaceholderIconSrc("unknown-ability");
}

export function getCategoryIconSrc(categoryId: IconCategoryId) {
  return CATEGORY_ICON_SOURCES[categoryId] ?? getPlaceholderIconSrc("missing-art");
}

export function getPlaceholderIconSrc(placeholderId: PlaceholderIconId) {
  return PLACEHOLDER_ICON_SOURCES[placeholderId] ?? PLACEHOLDER_ICON_SOURCES["missing-art"];
}

export function getEquipmentSlotIconSrc(slotId: EquipmentSlotId) {
  return getCategoryIconSrc(getEquipmentSlotCategoryId(slotId));
}

export function getEquipmentSlotCategoryId(slotId: EquipmentSlotId): IconCategoryId {
  if (slotId === "mainHand") return "main-hand";
  if (slotId === "offHand") return "off-hand";
  return slotId;
}

export function getTalentTreeCategoryId(treeId: TalentTreeId): IconCategoryId {
  if (treeId === "brawler") return "melee";
  if (treeId === "caster") return "magic";
  return "ranged";
}

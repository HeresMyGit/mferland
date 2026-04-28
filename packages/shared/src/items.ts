import { PLAYER } from "./config.js";

export const STAT_LABELS = {
  maxHealth: "HP",
  maxMana: "MP",
  strength: "STR",
  dexterity: "DEX",
  magic: "MAG",
} as const;

export const EQUIPMENT_SLOTS = {
  head: "Head",
  chest: "Chest",
  mainHand: "Main Hand",
  offHand: "Off Hand",
  trinket: "Trinket",
} as const;

export const EQUIPMENT_SLOT_IDS = Object.keys(EQUIPMENT_SLOTS) as Array<keyof typeof EQUIPMENT_SLOTS>;

export type StatKey = keyof typeof STAT_LABELS;
export type EquipmentSlotId = keyof typeof EQUIPMENT_SLOTS;
export type CharacterStats = Record<StatKey, number>;

export type EquipmentDefinition = {
  slot: EquipmentSlotId;
  build: string;
  stats: Partial<Record<StatKey, number>>;
};

export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  quality: "common" | "uncommon" | "rare" | "quest";
  iconColor: string;
  stackable: boolean;
  value?: number;
  chainTokenId?: string;
  equipment?: EquipmentDefinition;
};

export const ITEMS = {
  "sealed-note": {
    id: "sealed-note",
    name: "Sealed Note",
    description: "A folded note from OG mfer. It smells faintly like fountain water.",
    quality: "quest",
    iconColor: "#f2d067",
    stackable: false,
  },
  "hog-liver": {
    id: "hog-liver",
    name: "Hog Liver",
    description: "A grimy quest item for Hogwatch mfer's ward brew.",
    quality: "quest",
    iconColor: "#7a2d25",
    stackable: true,
  },
  "muddy-tusk": {
    id: "muddy-tusk",
    name: "Muddy Tusk",
    description: "A chipped tusk from a wild hog.",
    quality: "common",
    iconColor: "#d8c89c",
    stackable: true,
    value: 3,
  },
  "small-tooth": {
    id: "small-tooth",
    name: "Small Tooth",
    description: "A tiny animal tooth with no obvious use.",
    quality: "common",
    iconColor: "#e7dfc4",
    stackable: true,
    value: 2,
  },
  "worn-antler": {
    id: "worn-antler",
    name: "Worn Antler",
    description: "A scuffed antler tip from a deer.",
    quality: "common",
    iconColor: "#b89360",
    stackable: true,
    value: 4,
  },
  "farmhand-bandana": {
    id: "farmhand-bandana",
    name: "Farmhand Bandana",
    description: "A rough scrap from the busted farm crew.",
    quality: "common",
    iconColor: "#b84a3d",
    stackable: true,
    value: 3,
  },
  "signal-scrap": {
    id: "signal-scrap",
    name: "Signal Scrap",
    description: "A buzzing shard of antenna metal from the ridge raiders.",
    quality: "quest",
    iconColor: "#6fd8ff",
    stackable: true,
  },
  "dummy-splinter": {
    id: "dummy-splinter",
    name: "Dummy Splinter",
    description: "A training dummy splinter. Probably worthless.",
    quality: "common",
    iconColor: "#9b6a3f",
    stackable: true,
    value: 1,
  },
  "frayed-cap": {
    id: "frayed-cap",
    name: "Frayed Cap",
    description: "A soft starter cap with enough brim to keep a caster focused.",
    quality: "common",
    iconColor: "#6fb8b0",
    stackable: false,
    value: 6,
    equipment: {
      slot: "head",
      build: "Skirmisher",
      stats: {
        dexterity: 1,
        maxMana: 4,
      },
    },
  },
  "plaza-hoodie": {
    id: "plaza-hoodie",
    name: "Plaza Hoodie",
    description: "The default town layer. Scuffed, comfortable, and hard to drop.",
    quality: "common",
    iconColor: "#d04f45",
    stackable: false,
    value: 8,
    equipment: {
      slot: "chest",
      build: "Brawler",
      stats: {
        maxHealth: 12,
        strength: 1,
      },
    },
  },
  "rusty-skate-deck": {
    id: "rusty-skate-deck",
    name: "Rusty Skate Deck",
    description: "A cracked deck held like a club. Heavy enough to matter.",
    quality: "common",
    iconColor: "#9a7046",
    stackable: false,
    value: 7,
    equipment: {
      slot: "mainHand",
      build: "Brawler",
      stats: {
        strength: 3,
        maxHealth: 8,
      },
    },
  },
  "bent-slingshot": {
    id: "bent-slingshot",
    name: "Bent Slingshot",
    description: "Quick, cheap, and weirdly accurate once you learn the wobble.",
    quality: "common",
    iconColor: "#5c9f63",
    stackable: false,
    value: 7,
    equipment: {
      slot: "mainHand",
      build: "Ranger",
      stats: {
        dexterity: 4,
      },
    },
  },
  "stickered-wand": {
    id: "stickered-wand",
    name: "Stickered Wand",
    description: "A taped-up wand covered in old DAO stickers.",
    quality: "common",
    iconColor: "#7c72d6",
    stackable: false,
    value: 7,
    equipment: {
      slot: "mainHand",
      build: "Mage",
      stats: {
        magic: 4,
        maxMana: 8,
      },
    },
  },
  "road-sign-lid": {
    id: "road-sign-lid",
    name: "Road Sign Lid",
    description: "A dented sign face with a handle bolted through it.",
    quality: "common",
    iconColor: "#d7b447",
    stackable: false,
    value: 6,
    equipment: {
      slot: "offHand",
      build: "Tank",
      stats: {
        maxHealth: 14,
        strength: 1,
      },
    },
  },
  "pocket-zine": {
    id: "pocket-zine",
    name: "Pocket Zine",
    description: "Tiny notes on mana flow, hog habits, and who owes who.",
    quality: "common",
    iconColor: "#44a6c6",
    stackable: false,
    value: 6,
    equipment: {
      slot: "offHand",
      build: "Mage",
      stats: {
        magic: 2,
        maxMana: 6,
      },
    },
  },
  "lucky-lighter": {
    id: "lucky-lighter",
    name: "Lucky Lighter",
    description: "Mostly empty, but it feels better in your pocket.",
    quality: "uncommon",
    iconColor: "#e1783d",
    stackable: false,
    value: 14,
    equipment: {
      slot: "trinket",
      build: "Hybrid",
      stats: {
        dexterity: 1,
        magic: 1,
      },
    },
  },
  "field-patched-hoodie": {
    id: "field-patched-hoodie",
    name: "Field-Patched Hoodie",
    description: "A road-worn hoodie patched at Field Camp for longer fights.",
    quality: "uncommon",
    iconColor: "#5a8f63",
    stackable: false,
    value: 28,
    equipment: {
      slot: "chest",
      build: "Brawler",
      stats: {
        maxHealth: 24,
        strength: 2,
      },
    },
  },
  "ridge-runner-beanie": {
    id: "ridge-runner-beanie",
    name: "Ridge Runner Beanie",
    description: "A tight beanie from Signal Ridge. Good for sprinting through static.",
    quality: "uncommon",
    iconColor: "#4bb4c6",
    stackable: false,
    value: 24,
    equipment: {
      slot: "head",
      build: "Skirmisher",
      stats: {
        dexterity: 3,
        maxMana: 8,
      },
    },
  },
  "baron-breaker-board": {
    id: "baron-breaker-board",
    name: "Baron Breaker Board",
    description: "A heavy deck cracked across a named enemy's signal rig.",
    quality: "rare",
    iconColor: "#e14747",
    stackable: false,
    value: 46,
    equipment: {
      slot: "mainHand",
      build: "Brawler",
      stats: {
        strength: 6,
        maxHealth: 18,
      },
    },
  },
  "static-loop-ring": {
    id: "static-loop-ring",
    name: "Static Loop Ring",
    description: "A rare little circuit that hums when spells are ready.",
    quality: "rare",
    iconColor: "#9f7dff",
    stackable: false,
    value: 44,
    equipment: {
      slot: "trinket",
      build: "Mage",
      stats: {
        magic: 3,
        maxMana: 16,
      },
    },
  },
} as const satisfies Record<string, ItemDefinition>;

export const STARTER_GEAR_IDS = [
  "frayed-cap",
  "plaza-hoodie",
  "rusty-skate-deck",
  "bent-slingshot",
  "stickered-wand",
  "road-sign-lid",
  "pocket-zine",
  "lucky-lighter",
] as const satisfies readonly (keyof typeof ITEMS)[];

export const DEFAULT_EQUIPMENT = {
  head: "frayed-cap",
  chest: "plaza-hoodie",
  mainHand: "rusty-skate-deck",
  offHand: "road-sign-lid",
  trinket: "lucky-lighter",
} as const satisfies Partial<Record<EquipmentSlotId, keyof typeof ITEMS>>;

export const BASE_CHARACTER_STATS = {
  maxHealth: PLAYER.maxHealth,
  maxMana: PLAYER.maxMana,
  strength: PLAYER.strength,
  dexterity: PLAYER.dexterity,
  magic: PLAYER.magic,
} as const satisfies CharacterStats;

export function getBaseCharacterStats(): CharacterStats {
  return { ...BASE_CHARACTER_STATS };
}

export function getItemEquipment(itemId: keyof typeof ITEMS): EquipmentDefinition | null {
  return (ITEMS[itemId] as ItemDefinition).equipment ?? null;
}

export function getItemChainTokenId(itemId: keyof typeof ITEMS) {
  return normalizeChainTokenId((ITEMS[itemId] as ItemDefinition).chainTokenId);
}

export function isEquipmentItem(itemId: keyof typeof ITEMS) {
  return getItemEquipment(itemId) !== null;
}

export function isEquipmentCompatibleWithSlot(itemId: keyof typeof ITEMS, slotId: EquipmentSlotId) {
  return getItemEquipment(itemId)?.slot === slotId;
}

export function isStackableItem(itemId: keyof typeof ITEMS) {
  return Boolean((ITEMS[itemId] as ItemDefinition).stackable);
}

export function normalizeChainTokenId(value: string | null | undefined) {
  return value?.trim().slice(0, 128) ?? "";
}

export function getInventoryItemKey(itemId: keyof typeof ITEMS, chainTokenId?: string | null) {
  const normalizedToken = normalizeChainTokenId(chainTokenId);
  return normalizedToken ? `${itemId}:${normalizedToken}` : itemId;
}

export function getEquippedCharacterStats(itemIds: Iterable<keyof typeof ITEMS | "" | null | undefined>): CharacterStats {
  const stats = getBaseCharacterStats();
  for (const itemId of itemIds) {
    if (!itemId) continue;
    const equipment = getItemEquipment(itemId);
    if (!equipment) continue;

    for (const statKey of Object.keys(equipment.stats) as StatKey[]) {
      stats[statKey] += equipment.stats[statKey] ?? 0;
    }
  }
  return stats;
}

export const LOOT = {
  interactRange: 3.25,
  corpseDespawnMs: 180000,
  lootedDespawnMs: 6500,
} as const;

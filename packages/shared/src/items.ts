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
  name: string;
  description: string;
  quality: "common" | "uncommon" | "quest";
  iconColor: string;
  equipment?: EquipmentDefinition;
};

export const ITEMS = {
  "sealed-note": {
    name: "Sealed Note",
    description: "A folded note from OG mfer. It smells faintly like fountain water.",
    quality: "quest",
    iconColor: "#f2d067",
  },
  "hog-liver": {
    name: "Hog Liver",
    description: "A grimy quest item for Hogwatch mfer's ward brew.",
    quality: "quest",
    iconColor: "#7a2d25",
  },
  "muddy-tusk": {
    name: "Muddy Tusk",
    description: "A chipped tusk from a wild hog.",
    quality: "common",
    iconColor: "#d8c89c",
  },
  "small-tooth": {
    name: "Small Tooth",
    description: "A tiny animal tooth with no obvious use.",
    quality: "common",
    iconColor: "#e7dfc4",
  },
  "worn-antler": {
    name: "Worn Antler",
    description: "A scuffed antler tip from a deer.",
    quality: "common",
    iconColor: "#b89360",
  },
  "farmhand-bandana": {
    name: "Farmhand Bandana",
    description: "A rough scrap from the busted farm crew.",
    quality: "common",
    iconColor: "#b84a3d",
  },
  "dummy-splinter": {
    name: "Dummy Splinter",
    description: "A training dummy splinter. Probably worthless.",
    quality: "common",
    iconColor: "#9b6a3f",
  },
  "frayed-cap": {
    name: "Frayed Cap",
    description: "A soft starter cap with enough brim to keep a caster focused.",
    quality: "common",
    iconColor: "#6fb8b0",
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
    name: "Plaza Hoodie",
    description: "The default town layer. Scuffed, comfortable, and hard to drop.",
    quality: "common",
    iconColor: "#d04f45",
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
    name: "Rusty Skate Deck",
    description: "A cracked deck held like a club. Heavy enough to matter.",
    quality: "common",
    iconColor: "#9a7046",
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
    name: "Bent Slingshot",
    description: "Quick, cheap, and weirdly accurate once you learn the wobble.",
    quality: "common",
    iconColor: "#5c9f63",
    equipment: {
      slot: "mainHand",
      build: "Ranger",
      stats: {
        dexterity: 4,
      },
    },
  },
  "stickered-wand": {
    name: "Stickered Wand",
    description: "A taped-up wand covered in old DAO stickers.",
    quality: "common",
    iconColor: "#7c72d6",
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
    name: "Road Sign Lid",
    description: "A dented sign face with a handle bolted through it.",
    quality: "common",
    iconColor: "#d7b447",
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
    name: "Pocket Zine",
    description: "Tiny notes on mana flow, hog habits, and who owes who.",
    quality: "common",
    iconColor: "#44a6c6",
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
    name: "Lucky Lighter",
    description: "Mostly empty, but it feels better in your pocket.",
    quality: "uncommon",
    iconColor: "#e1783d",
    equipment: {
      slot: "trinket",
      build: "Hybrid",
      stats: {
        dexterity: 1,
        magic: 1,
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

export function isEquipmentItem(itemId: keyof typeof ITEMS) {
  return getItemEquipment(itemId) !== null;
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

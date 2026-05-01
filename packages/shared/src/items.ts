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

export type ConsumableDefinition = {
  kind: "food" | "potion";
  health?: number;
  mana?: number;
  cooldownMs: number;
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
  consumable?: ConsumableDefinition;
};

export const ITEMS = {
  "sealed-note": {
    id: "sealed-note",
    name: "folded note",
    description: "folded by OG mfer. not your business.",
    quality: "quest",
    iconColor: "#f2d067",
    stackable: false,
  },
  "hog-liver": {
    id: "hog-liver",
    name: "hog liver",
    description: "gross road fix material. hogwatch mfer asked, somehow.",
    quality: "quest",
    iconColor: "#7a2d25",
    stackable: true,
  },
  "muddy-tusk": {
    id: "muddy-tusk",
    name: "muddy tusk",
    description: "a chipped tusk from a wild hog. still muddy.",
    quality: "common",
    iconColor: "#d8c89c",
    stackable: true,
    value: 3,
  },
  "small-tooth": {
    id: "small-tooth",
    name: "small tooth",
    description: "tiny animal tooth. no obvious plan.",
    quality: "common",
    iconColor: "#e7dfc4",
    stackable: true,
    value: 2,
  },
  "worn-antler": {
    id: "worn-antler",
    name: "worn antler",
    description: "a scuffed antler tip from a deer who said gm.",
    quality: "common",
    iconColor: "#b89360",
    stackable: true,
    value: 4,
  },
  "farmhand-bandana": {
    id: "farmhand-bandana",
    name: "red-eye rag",
    description: "red-eye cloth from a mfer who overfarmed the rumor loop.",
    quality: "common",
    iconColor: "#b84a3d",
    stackable: true,
    value: 3,
  },
  "signal-scrap": {
    id: "signal-scrap",
    name: "static scrap",
    description: "still buzzing. probably shouldn't be.",
    quality: "quest",
    iconColor: "#6fd8ff",
    stackable: true,
  },
  "dummy-splinter": {
    id: "dummy-splinter",
    name: "bonk splinter",
    description: "training dummy splinter. proof of bonk.",
    quality: "common",
    iconColor: "#9b6a3f",
    stackable: true,
    value: 1,
  },
  "field-snack": {
    id: "field-snack",
    name: "road snack",
    description: "salty little road snack. fixes the body just enough.",
    quality: "common",
    iconColor: "#d6a64b",
    stackable: true,
    value: 4,
    consumable: {
      kind: "food",
      health: 24,
      mana: 12,
      cooldownMs: 12000,
    },
  },
  "red-juice": {
    id: "red-juice",
    name: "plaza red",
    description: "sweet bottled fountain stash. restores health. do not overthink it.",
    quality: "common",
    iconColor: "#e34d4d",
    stackable: true,
    value: 8,
    consumable: {
      kind: "potion",
      health: 58,
      cooldownMs: 15000,
    },
  },
  "blue-juice": {
    id: "blue-juice",
    name: "static blue",
    description: "fizzy mana bottle with a suspicious static aftertaste.",
    quality: "common",
    iconColor: "#45a7e8",
    stackable: true,
    value: 8,
    consumable: {
      kind: "potion",
      mana: 46,
      cooldownMs: 15000,
    },
  },
  "frayed-cap": {
    id: "frayed-cap",
    name: "frayed cap",
    description: "soft starter cap. brim still has a little fight left.",
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
    name: "plaza hoodie",
    description: "default town layer. scuffed, comfortable, hard to drop.",
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
    name: "beater deck",
    description: "cracked deck held like a club. heavy enough to matter.",
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
    name: "bent sling",
    description: "quick, cheap, and weirdly accurate once you learn the wobble.",
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
    name: "sticker wand",
    description: "taped-up wand covered in old dao stickers.",
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
    name: "road lid",
    description: "dented sign face with a handle bolted through it.",
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
    name: "pocket zine",
    description: "tiny notes on mana flow, hog habits, and who owes who.",
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
    name: "lucky lighter",
    description: "almost empty. still counts.",
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
  "boar-bristle-cap": {
    id: "boar-bristle-cap",
    name: "boar bristle cap",
    description: "stiff farm cap stitched with wild hog bristles. ugly, lucky, hard to knock off.",
    quality: "rare",
    iconColor: "#8f5a38",
    stackable: false,
    value: 34,
    equipment: {
      slot: "head",
      build: "Bruiser",
      stats: {
        maxHealth: 18,
        strength: 1,
        dexterity: 2,
      },
    },
  },
  "antler-charm": {
    id: "antler-charm",
    name: "antler charm",
    description: "polished antler charm. steadies hands and spellwork.",
    quality: "rare",
    iconColor: "#d8bf82",
    stackable: false,
    value: 32,
    equipment: {
      slot: "trinket",
      build: "Hybrid",
      stats: {
        dexterity: 2,
        magic: 1,
        maxMana: 10,
      },
    },
  },
  "farmhand-spade": {
    id: "farmhand-spade",
    name: "red-eye spade",
    description: "sharpened little spade from red-eye farm. too useful to stay buried.",
    quality: "uncommon",
    iconColor: "#9d7648",
    stackable: false,
    value: 26,
    equipment: {
      slot: "mainHand",
      build: "Brawler",
      stats: {
        strength: 4,
        dexterity: 1,
      },
    },
  },
  "field-patched-hoodie": {
    id: "field-patched-hoodie",
    name: "routepost hoodie",
    description: "road-worn hoodie patched at route post for longer fights.",
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
    name: "static beanie",
    description: "tight beanie from signal ridge. keeps the buzz mostly outside.",
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
    name: "baron breaker",
    description: "heavy deck cracked across a named enemy's signal rig.",
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
    name: "relay loop ring",
    description: "rare little circuit that hums when moves are ready.",
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

export function getItemConsumable(itemId: keyof typeof ITEMS): ConsumableDefinition | null {
  return (ITEMS[itemId] as ItemDefinition).consumable ?? null;
}

export function getItemChainTokenId(itemId: keyof typeof ITEMS) {
  return normalizeChainTokenId((ITEMS[itemId] as ItemDefinition).chainTokenId);
}

export function isEquipmentItem(itemId: keyof typeof ITEMS) {
  return getItemEquipment(itemId) !== null;
}

export function isConsumableItem(itemId: keyof typeof ITEMS) {
  return getItemConsumable(itemId) !== null;
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
  interactRange: 13,
  corpseDespawnMs: 180000,
  lootedDespawnMs: 6500,
} as const;

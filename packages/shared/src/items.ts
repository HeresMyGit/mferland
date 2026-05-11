import { PLAYER } from "./config.js";
import { clamp } from "./utils.js";

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

export type EquippedItemRef = {
  itemId: keyof typeof ITEMS | "" | null | undefined;
  chainTier?: number | null;
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
  revealsAllNpcsOnMinimap?: boolean;
};

export const ITEMS = {
  "sealed-note": {
    id: "sealed-note",
    name: "folded seed note",
    description: "OG porch mfer folded it twice. It says what might get built next, which is still not your business.",
    quality: "quest",
    iconColor: "#f2d067",
    stackable: false,
  },
  "hog-liver": {
    id: "hog-liver",
    name: "chewed EOS",
    description: "old EOS stash fragment recovered from a hog. still muddy, still somehow route infrastructure.",
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
    name: "reply-loop rag",
    description: "cloth peeled off a loop-burnt farm mfer. smells like no sleep.",
    quality: "common",
    iconColor: "#b84a3d",
    stackable: true,
    value: 3,
  },
  "signal-scrap": {
    id: "signal-scrap",
    name: "fried uplink shard",
    description: "burnt uplink trash with a bad hum still trapped inside.",
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
    name: "posted-up deck",
    description: "heavyweight deck with stacked stickers, charred grip edges, and a taped handle where the trucks quit pretending.",
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
    name: "posted-up laptop lid",
    description: "dead laptop top with a grip strap bolted on the back. less road hardware, more desk junk shield.",
    quality: "common",
    iconColor: "#5DD3FF",
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
    name: "last-cig lighter",
    description: "chrome pocket lighter with soot around the lid and one more bad idea still hiding in the hinge.",
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
  "reply-lag-visor": {
    id: "reply-lag-visor",
    name: "reply lag visor",
    description: "sun-faded visor with a bent brim and two tiny gm pins. survived three plaza afternoons and one dumb argument.",
    quality: "common",
    iconColor: "#6ea4d8",
    stackable: false,
    value: 7,
    equipment: {
      slot: "head",
      build: "Skirmisher",
      stats: {
        dexterity: 1,
        maxMana: 6,
      },
    },
  },
  "receipt-zine": {
    id: "receipt-zine",
    name: "receipt zine",
    description: "little stapled zine made from receipts, printouts, and one page of half-legible notes someone swore was alpha.",
    quality: "common",
    iconColor: "#56a8c4",
    stackable: false,
    value: 7,
    equipment: {
      slot: "offHand",
      build: "Mage",
      stats: {
        magic: 2,
        maxMana: 5,
      },
    },
  },
  "headphone-splitter": {
    id: "headphone-splitter",
    name: "headphone splitter",
    description: "cheap aux splitter with one loose jack and a tape fix that somehow still keeps the session together.",
    quality: "common",
    iconColor: "#c9a15f",
    stackable: false,
    value: 8,
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
    name: "bristle bill cap",
    description: "mean little cap stitched from hog bristles. looks wrong. wears right.",
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
    name: "steadyhands antler",
    description: "polished deer antler charm for keeping your hands and your posting steady.",
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
    name: "rumor spade",
    description: "farm tool turned argument ender. took enough bad loops to get an edge.",
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
  "claim-booth-cap": {
    id: "claim-booth-cap",
    name: "claim booth cap",
    description: "sun-cooked work cap from the busted farm booth. brim still smells like hot plastic and cope.",
    quality: "uncommon",
    iconColor: "#8b6d45",
    stackable: false,
    value: 22,
    equipment: {
      slot: "head",
      build: "Tank",
      stats: {
        maxHealth: 16,
        strength: 1,
      },
    },
  },
  "airdrop-burn-hoodie": {
    id: "airdrop-burn-hoodie",
    name: "airdrop burn hoodie",
    description: "hoodie from someone who stood in line too long and started seeing allocation patterns in the dirt.",
    quality: "uncommon",
    iconColor: "#5a7c58",
    stackable: false,
    value: 26,
    equipment: {
      slot: "chest",
      build: "Skirmisher",
      stats: {
        maxHealth: 18,
        dexterity: 2,
      },
    },
  },
  "claim-clipboard": {
    id: "claim-clipboard",
    name: "claim clipboard",
    description: "clipboard with old token lists, crossed-out names, and one corner chewed by something mean and local.",
    quality: "uncommon",
    iconColor: "#6a92b6",
    stackable: false,
    value: 24,
    equipment: {
      slot: "offHand",
      build: "Mage",
      stats: {
        magic: 2,
        maxMana: 10,
      },
    },
  },
  "missed-creyzies-keychain": {
    id: "missed-creyzies-keychain",
    name: "missed creyzies keychain",
    description: "cheap creature keychain carried by someone who swears they were one refresh away from making it.",
    quality: "uncommon",
    iconColor: "#d97968",
    stackable: false,
    value: 21,
    equipment: {
      slot: "trinket",
      build: "Hybrid",
      stats: {
        dexterity: 1,
        magic: 1,
        maxMana: 8,
      },
    },
  },
  "stickerbomb-sling": {
    id: "stickerbomb-sling",
    name: "stickerbomb sling",
    description: "scrappy slingshot wrapped in tape and covered in half-peeled sticker fragments. ugly, fast, accurate enough.",
    quality: "uncommon",
    iconColor: "#658d58",
    stackable: false,
    value: 25,
    equipment: {
      slot: "mainHand",
      build: "Ranger",
      stats: {
        dexterity: 5,
      },
    },
  },
  "field-patched-hoodie": {
    id: "field-patched-hoodie",
    name: "claim-route hoodie",
    description: "patched at the route post after another day the farm almost ate the whole path.",
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
    name: "return-signal beanie",
    description: "tight beanie from the ridge. keeps most bad signal outside your skull and the good stuff barely audible.",
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
  "deadzone-beanie": {
    id: "deadzone-beanie",
    name: "deadzone beanie",
    description: "black knit beanie that keeps most of the bad chatter outside your skull and the useful signal barely audible.",
    quality: "rare",
    iconColor: "#4d8fb8",
    stackable: false,
    value: 34,
    equipment: {
      slot: "head",
      build: "Mage",
      stats: {
        magic: 2,
        dexterity: 2,
        maxMana: 10,
      },
    },
  },
  "static-zip-hoodie": {
    id: "static-zip-hoodie",
    name: "static zip hoodie",
    description: "ridge hoodie with blue static stitched through the seams and little cable ends living in both pockets.",
    quality: "rare",
    iconColor: "#5672c9",
    stackable: false,
    value: 38,
    equipment: {
      slot: "chest",
      build: "Mage",
      stats: {
        maxHealth: 16,
        magic: 3,
        maxMana: 10,
      },
    },
  },
  "router-antenna-wand": {
    id: "router-antenna-wand",
    name: "router antenna wand",
    description: "old router antenna on a taped handle. it should not work this well. it also should not hiss.",
    quality: "rare",
    iconColor: "#6f73d8",
    stackable: false,
    value: 38,
    equipment: {
      slot: "mainHand",
      build: "Mage",
      stats: {
        magic: 6,
        maxMana: 12,
      },
    },
  },
  "bottlecap-sling": {
    id: "bottlecap-sling",
    name: "bottlecap sling",
    description: "cleaner, meaner sling that throws bottlecaps hard enough to count as philosophy.",
    quality: "rare",
    iconColor: "#6f9f63",
    stackable: false,
    value: 36,
    equipment: {
      slot: "mainHand",
      build: "Ranger",
      stats: {
        dexterity: 6,
      },
    },
  },
  "stickered-laptop-lid": {
    id: "stickered-laptop-lid",
    name: "stickered laptop lid",
    description: "dead laptop top ripped off at the hinge and carried like it still owes you one more post.",
    quality: "rare",
    iconColor: "#9fa7b5",
    stackable: false,
    value: 36,
    equipment: {
      slot: "offHand",
      build: "Tank",
      stats: {
        maxHealth: 20,
        strength: 2,
      },
    },
  },
  "burn-hole-mousepad": {
    id: "burn-hole-mousepad",
    name: "burn hole mousepad",
    description: "rolled-up mousepad with two cigarette burns and one sweet spot worn smooth by years of late-night posting.",
    quality: "rare",
    iconColor: "#9a7cff",
    stackable: false,
    value: 35,
    equipment: {
      slot: "trinket",
      build: "Hybrid",
      stats: {
        dexterity: 2,
        magic: 2,
        maxMana: 12,
      },
    },
  },
  "baron-breaker-board": {
    id: "baron-breaker-board",
    name: "centralizer breaker",
    description: "heavy deck that already proved it can separate a control loop from its confidence.",
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
  "feedback-headphones": {
    id: "feedback-headphones",
    name: "feedback headphones",
    description: "over-ear cans pulled off the centralizer stack. one side hisses, both sides still lock you in.",
    quality: "rare",
    iconColor: "#6b84ff",
    stackable: false,
    value: 42,
    equipment: {
      slot: "head",
      build: "Hybrid",
      stats: {
        dexterity: 2,
        magic: 2,
        maxMana: 12,
      },
    },
  },
  "logoff-hoodie": {
    id: "logoff-hoodie",
    name: "logoff hoodie",
    description: "thick black hoodie that feels like the room got quieter the second you pulled it on.",
    quality: "rare",
    iconColor: "#4b4f63",
    stackable: false,
    value: 40,
    equipment: {
      slot: "chest",
      build: "Skirmisher",
      stats: {
        maxHealth: 18,
        dexterity: 3,
      },
    },
  },
  "all-nighter-hoodie": {
    id: "all-nighter-hoodie",
    name: "all nighter hoodie",
    description: "big washed-out hoodie that smells like cold coffee, stale smoke, and a decision to keep posting anyway.",
    quality: "rare",
    iconColor: "#505a78",
    stackable: false,
    value: 44,
    equipment: {
      slot: "chest",
      build: "Hybrid",
      stats: {
        maxHealth: 20,
        dexterity: 2,
        magic: 2,
      },
    },
  },
  "static-loop-ring": {
    id: "static-loop-ring",
    name: "relay loop ring",
    description: "rare little circuit that hums when moves are ready and pings every nearby body on the minimap.",
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
    revealsAllNpcsOnMinimap: true,
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

export const CHAIN_GEAR_TIERS = {
  min: 1,
  max: 3,
  statBonusPerTier: 0.33,
} as const;

export const CHAIN_GEAR_ITEM_IDS = {
  1: "rusty-skate-deck",
  2: "road-sign-lid",
  3: "lucky-lighter",
} as const satisfies Record<number, keyof typeof ITEMS>;

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

export function getChainGearItemId(gearType: number): keyof typeof ITEMS | null {
  return CHAIN_GEAR_ITEM_IDS[gearType as keyof typeof CHAIN_GEAR_ITEM_IDS] ?? null;
}

export function normalizeChainGearTier(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return CHAIN_GEAR_TIERS.min;
  return clamp(Math.floor(parsed), CHAIN_GEAR_TIERS.min, CHAIN_GEAR_TIERS.max);
}

export function getChainGearTierMultiplier(chainTier: number | string | null | undefined) {
  const tier = normalizeChainGearTier(chainTier);
  return roundScaledStat(1 + (tier - 1) * CHAIN_GEAR_TIERS.statBonusPerTier);
}

export function scaleEquipmentStats(
  stats: Partial<Record<StatKey, number>>,
  chainTier: number | string | null | undefined,
): Partial<Record<StatKey, number>> {
  const multiplier = getChainGearTierMultiplier(chainTier);
  if (multiplier === 1) return { ...stats };

  const scaled: Partial<Record<StatKey, number>> = {};
  for (const statKey of Object.keys(stats) as StatKey[]) {
    scaled[statKey] = roundScaledStat((stats[statKey] ?? 0) * multiplier);
  }
  return scaled;
}

export function getItemEquipment(itemId: keyof typeof ITEMS, chainTier: number | string | null | undefined = 1): EquipmentDefinition | null {
  const equipment = (ITEMS[itemId] as ItemDefinition).equipment ?? null;
  if (!equipment) return null;

  const tier = normalizeChainGearTier(chainTier);
  if (tier <= CHAIN_GEAR_TIERS.min) return equipment;

  return {
    ...equipment,
    stats: scaleEquipmentStats(equipment.stats, tier),
  };
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

export function doesItemRevealAllNpcsOnMinimap(itemId: keyof typeof ITEMS) {
  return Boolean((ITEMS[itemId] as ItemDefinition).revealsAllNpcsOnMinimap);
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

export function getEquippedCharacterStats(itemRefs: Iterable<keyof typeof ITEMS | "" | null | undefined | EquippedItemRef>): CharacterStats {
  const stats = getBaseCharacterStats();
  for (const itemRef of itemRefs) {
    const itemId = typeof itemRef === "object" && itemRef !== null ? itemRef.itemId : itemRef;
    const chainTier = typeof itemRef === "object" && itemRef !== null ? itemRef.chainTier : 1;
    if (!itemId) continue;
    const equipment = getItemEquipment(itemId, chainTier);
    if (!equipment) continue;

    for (const statKey of Object.keys(equipment.stats) as StatKey[]) {
      stats[statKey] += equipment.stats[statKey] ?? 0;
    }
  }
  return stats;
}

function roundScaledStat(value: number) {
  return Math.round(value * 100) / 100;
}

export const LOOT = {
  interactRange: 13,
  corpseDespawnMs: 180000,
  lootedDespawnMs: 6500,
} as const;

export const ELIXIR_DURATION_MS = 60 * 60 * 1000;
export const ELIXIR_SHOP_MFERGPT_AMOUNT_WEI = "5000000000000000000000000";
export const ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL = "5M $MFERGPT";
export const ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_WEI = "20000000000000000000000000";
export const ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_LABEL = "20M $MFERGPT";
export const FISHING_CHUM_BUFF_ID = "old-chum";

export type ElixirBuffEffects = {
  maxHealth?: number;
  maxMana?: number;
  strength?: number;
  dexterity?: number;
  magic?: number;
  healthRegenPer5?: number;
  manaRegenPer5?: number;
  walkSpeed?: number;
  runSpeed?: number;
  actionCooldownReductionPercent?: number;
  fishingRareChancePercent?: number;
};

export const ELIXIR_BUFFS = {
  "mev-bot": {
    id: "mev-bot",
    itemId: "mev-bot-elixir",
    name: "MEV Bot Elixir",
    shortName: "MEV",
    description: "pathing gets uncomfortably optimized for one hour.",
    effectLabel: "+speed",
    durationMs: ELIXIR_DURATION_MS,
    effects: {
      walkSpeed: 0.8,
      runSpeed: 1.2,
    },
  },
  "exit-liquidity": {
    id: "exit-liquidity",
    itemId: "exit-liquidity-elixir",
    name: "Exit Liquidity Elixir",
    shortName: "Exit",
    description: "you become harder to dump for one hour.",
    effectLabel: "+HP",
    durationMs: ELIXIR_DURATION_MS,
    effects: {
      maxHealth: 80,
      healthRegenPer5: 6,
    },
  },
  hopium: {
    id: "hopium",
    itemId: "hopium-elixir",
    name: "Hopium Elixir",
    shortName: "Hope",
    description: "keeps the mana bar believing for one hour.",
    effectLabel: "+MP",
    durationMs: ELIXIR_DURATION_MS,
    effects: {
      maxMana: 55,
      manaRegenPer5: 8,
      magic: 2,
    },
  },
  slippage: {
    id: "slippage",
    itemId: "slippage-serum",
    name: "Slippage Serum",
    shortName: "Slip",
    description: "things land a little before they should for one hour.",
    effectLabel: "+haste",
    durationMs: ELIXIR_DURATION_MS,
    effects: {
      dexterity: 4,
      actionCooldownReductionPercent: 10,
    },
  },
  [FISHING_CHUM_BUFF_ID]: {
    id: FISHING_CHUM_BUFF_ID,
    itemId: "bucket-of-old-chum",
    name: "Bucket of Old Chum",
    shortName: "Chum",
    description: "pond stink does the targeting for one hour.",
    effectLabel: "+25% rare fish",
    durationMs: ELIXIR_DURATION_MS,
    effects: {
      fishingRareChancePercent: 25,
    },
  },
} as const satisfies Record<string, {
  id: string;
  itemId: string;
  name: string;
  shortName: string;
  description: string;
  effectLabel: string;
  durationMs: number;
  effects: ElixirBuffEffects;
}>;

export type ElixirBuffId = keyof typeof ELIXIR_BUFFS;
export type ElixirItemId = typeof ELIXIR_BUFFS[ElixirBuffId]["itemId"];

export const ELIXIR_BUFF_IDS = Object.keys(ELIXIR_BUFFS) as ElixirBuffId[];
export const ELIXIR_ITEM_IDS = ELIXIR_BUFF_IDS.map((buffId) => ELIXIR_BUFFS[buffId].itemId) as ElixirItemId[];
export const POTION_SHOP_ELIXIR_ITEM_IDS = ELIXIR_BUFF_IDS
  .filter((buffId) => buffId !== FISHING_CHUM_BUFF_ID)
  .map((buffId) => ELIXIR_BUFFS[buffId].itemId) as Exclude<ElixirItemId, "bucket-of-old-chum">[];

export function isElixirBuffId(value: unknown): value is ElixirBuffId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ELIXIR_BUFFS, value);
}

export function isElixirItemId(value: unknown): value is ElixirItemId {
  return typeof value === "string" && (ELIXIR_ITEM_IDS as readonly string[]).includes(value);
}

export function getElixirBuffDefinition(buffId: ElixirBuffId) {
  return ELIXIR_BUFFS[buffId];
}

export function getElixirBuffForItem(itemId: unknown) {
  if (!isElixirItemId(itemId)) return null;
  return ELIXIR_BUFF_IDS
    .map((buffId) => ELIXIR_BUFFS[buffId])
    .find((definition) => definition.itemId === itemId) ?? null;
}

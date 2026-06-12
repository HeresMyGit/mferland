import { stableHash } from "./utils.js";

export type MferAppearanceTraits = Record<string, string>;

export type MferAppearanceTraitCategory = {
  id: string;
  name: string;
  required?: boolean;
  options: Array<{
    id: string;
    label: string;
  }>;
};

export type TraitPaymentToken = "ETH" | "MFER" | "MFERGPT";

export const TRAIT_CHANGE_PRODUCT_ID = "trait-change";
export const TRAIT_CHANGE_BASE_CHAIN_ID = 8453;
export const TRAIT_CHANGE_BASE_CHAIN_ID_HEX = "0x2105";
export const TRAIT_CHANGE_BASE_RPC_URL = "https://mainnet.base.org";
export const TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS = "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07";
export const TRAIT_CHANGE_BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const TRAIT_CHANGE_MFERGPT_AMOUNT_WEI = "25000000000000000000000000";
export const TRAIT_CHANGE_MFERGPT_AMOUNT_LABEL = "25M $MFERGPT";

export const MFER_APPEARANCE_TRAIT_CATEGORIES: MferAppearanceTraitCategory[] = [
  {
    id: "background",
    name: "Background",
    required: true,
    options: [
      { id: "blue", label: "Blue" },
      { id: "red", label: "Red" },
      { id: "green", label: "Green" },
      { id: "yellow", label: "Yellow" },
      { id: "orange", label: "Orange" },
      { id: "purple", label: "Purple" },
      { id: "turquoise", label: "Turquoise" },
      { id: "tree", label: "Tree" },
      { id: "space", label: "Space" },
      { id: "graveyard", label: "Graveyard" },
    ],
  },
  {
    id: "type",
    name: "Type",
    required: true,
    options: [
      { id: "plain", label: "Plain mfer" },
      { id: "charcoal", label: "Charcoal mfer" },
      { id: "zombie", label: "Zombie mfer" },
      { id: "ape", label: "Ape mfer" },
      { id: "alien", label: "Alien mfer" },
      { id: "metal", label: "Metal mfer" },
      { id: "based", label: "Based $mfer" },
    ],
  },
  {
    id: "eyes",
    name: "Eyes",
    required: true,
    options: [
      { id: "regular", label: "Regular eyes" },
      { id: "vr", label: "VR" },
      { id: "shades", label: "Shades" },
      { id: "purple_shades", label: "Purple shades" },
      { id: "nerd", label: "Nerd glasses" },
      { id: "trippy", label: "Trippy shades" },
      { id: "matrix", label: "Matrix shades" },
      { id: "3d", label: "3D glasses" },
      { id: "eye_mask", label: "Eye mask" },
      { id: "eyepatch", label: "Eyepatch" },
      { id: "metal", label: "Metal eyes" },
      { id: "mfercoin", label: "Mfercoin eyes" },
      { id: "red", label: "Red eyes" },
      { id: "alien", label: "Alien eyes" },
      { id: "zombie", label: "Zombie eyes" },
    ],
  },
  {
    id: "mouth",
    name: "Mouth",
    required: true,
    options: [
      { id: "smile", label: "Smile" },
      { id: "flat", label: "Flat" },
    ],
  },
  {
    id: "headphones",
    name: "Headphones",
    required: true,
    options: [
      { id: "white", label: "White headphones" },
      { id: "red", label: "Red headphones" },
      { id: "green", label: "Green headphones" },
      { id: "pink", label: "Pink headphones" },
      { id: "gold", label: "Gold headphones" },
      { id: "blue", label: "Blue headphones" },
      { id: "black", label: "Black headphones" },
      { id: "lined", label: "Lined headphones" },
      { id: "black_square", label: "Black square" },
      { id: "blue_square", label: "Blue square" },
      { id: "gold_square", label: "Gold square" },
    ],
  },
  {
    id: "hat_over_headphones",
    name: "Hat Over Headphones",
    options: [
      { id: "cowboy", label: "Cowboy hat" },
      { id: "top", label: "Top hat" },
      { id: "pilot", label: "Pilot helmet" },
      { id: "hoodie_gray", label: "Gray hoodie up" },
      { id: "hoodie_pink", label: "Pink hoodie up" },
      { id: "hoodie_red", label: "Red hoodie up" },
      { id: "hoodie_blue", label: "Blue hoodie up" },
      { id: "hoodie_white", label: "White hoodie up" },
      { id: "hoodie_green", label: "Green hoodie up" },
      { id: "larva_mfer", label: "Larva mfer" },
    ],
  },
  {
    id: "hat_under_headphones",
    name: "Hat Under Headphones",
    options: [
      { id: "bandana_dark_gray", label: "Dark gray bandana" },
      { id: "bandana_red", label: "Red bandana" },
      { id: "bandana_blue", label: "Blue bandana" },
      { id: "knit_kc", label: "KC knit" },
      { id: "knit_las_vegas", label: "Las Vegas knit" },
      { id: "knit_new_york", label: "New York knit" },
      { id: "knit_san_fran", label: "San Fran knit" },
      { id: "knit_miami", label: "Miami knit" },
      { id: "knit_chicago", label: "Chicago knit" },
      { id: "knit_atlanta", label: "Atlanta knit" },
      { id: "knit_cleveland", label: "Cleveland knit" },
      { id: "knit_dallas", label: "Dallas knit" },
      { id: "knit_baltimore", label: "Baltimore knit" },
      { id: "knit_buffalo", label: "Buffalo knit" },
      { id: "knit_pittsburgh", label: "Pittsburgh knit" },
      { id: "cap_monochrome", label: "Monochrome cap" },
      { id: "cap_based_blue", label: "Based blue cap" },
      { id: "cap_purple", label: "Purple cap" },
      { id: "beanie_monochrome", label: "Monochrome beanie" },
      { id: "beanie", label: "Beanie" },
      { id: "headband_blue_green", label: "Blue/green headband" },
      { id: "headband_green_white", label: "Green/white headband" },
      { id: "headband_blue_red", label: "Blue/red headband" },
      { id: "headband_pink_white", label: "Pink/white headband" },
      { id: "headband_blue_white", label: "Blue/white headband" },
    ],
  },
  {
    id: "short_hair",
    name: "Short Hair",
    options: [
      { id: "mohawk_purple", label: "Purple mohawk" },
      { id: "mohawk_red", label: "Red mohawk" },
      { id: "mohawk_pink", label: "Pink mohawk" },
      { id: "mohawk_black", label: "Black mohawk" },
      { id: "mohawk_yellow", label: "Yellow mohawk" },
      { id: "mohawk_green", label: "Green mohawk" },
      { id: "mohawk_blue", label: "Blue mohawk" },
      { id: "messy_black", label: "Black messy" },
      { id: "messy_yellow", label: "Yellow messy" },
      { id: "messy_red", label: "Red messy" },
      { id: "messy_purple", label: "Purple messy" },
    ],
  },
  {
    id: "long_hair",
    name: "Long Hair",
    options: [
      { id: "long_yellow", label: "Yellow long hair" },
      { id: "long_black", label: "Black long hair" },
      { id: "long_curly", label: "Curly long hair" },
    ],
  },
  {
    id: "shirt",
    name: "Shirt",
    options: [
      { id: "collared_pink", label: "Pink collared shirt" },
      { id: "collared_green", label: "Green collared shirt" },
      { id: "collared_yellow", label: "Yellow collared shirt" },
      { id: "collared_white", label: "White collared shirt" },
      { id: "collared_turquoise", label: "Turquoise collared shirt" },
      { id: "collared_blue", label: "Blue collared shirt" },
      { id: "hoodie_down_red", label: "Red hoodie down" },
      { id: "hoodie_down_pink", label: "Pink hoodie down" },
      { id: "hoodie_down_white", label: "White hoodie down" },
      { id: "hoodie_down_green", label: "Green hoodie down" },
      { id: "hoodie_down_gray", label: "Gray hoodie down" },
      { id: "hoodie_down_blue", label: "Blue hoodie down" },
    ],
  },
  {
    id: "watch",
    name: "4:20 Watch",
    options: [
      { id: "sub_blue", label: "Sub blue" },
      { id: "sub_lantern_green", label: "Sub lantern green" },
      { id: "sub_cola", label: "Sub cola" },
      { id: "sub_turquoise", label: "Sub turquoise" },
      { id: "sub_bat", label: "Sub bat" },
      { id: "sub_black", label: "Sub black" },
      { id: "sub_rose", label: "Sub rose" },
      { id: "sub_red", label: "Sub red" },
      { id: "oyster_silver", label: "Oyster silver" },
      { id: "oyster_gold", label: "Oyster gold" },
      { id: "argo_white", label: "Argo white" },
      { id: "argo_black", label: "Argo black" },
      { id: "timex", label: "Timex" },
    ],
  },
  {
    id: "chain",
    name: "Chain",
    options: [
      { id: "silver", label: "Silver chain" },
      { id: "gold", label: "Gold chain" },
      { id: "onchain", label: "Onchain" },
    ],
  },
  {
    id: "beard",
    name: "Beard",
    options: [
      { id: "full", label: "Full beard" },
      { id: "flat", label: "Flat beard" },
    ],
  },
  {
    id: "smoke",
    name: "Smoke",
    options: [
      { id: "pipe", label: "Pipe" },
      { id: "pipe_brown", label: "Brown pipe" },
      { id: "cig_white", label: "White cigarette" },
      { id: "cig_black", label: "Black cigarette" },
    ],
  },
  {
    id: "shoes_and_gloves",
    name: "Shoes & Gloves",
    options: [
      { id: "green", label: "Green" },
      { id: "graveyard", label: "Graveyard" },
      { id: "red", label: "Red" },
      { id: "tree", label: "Tree" },
      { id: "teal", label: "Teal" },
      { id: "turquoise", label: "Turquoise" },
      { id: "purple", label: "Purple" },
      { id: "space", label: "Space" },
      { id: "orange", label: "Orange" },
      { id: "blue", label: "Blue" },
      { id: "yellow", label: "Yellow" },
    ],
  },
];

const TRAIT_OPTIONS_BY_CATEGORY = new Map(
  MFER_APPEARANCE_TRAIT_CATEGORIES.map((category) => [
    category.id,
    new Set(category.options.map((option) => option.id)),
  ]),
);
const ZOMBIE_EYE_OVERLAY_TRAITS = new Set([
  "vr",
  "shades",
  "purple_shades",
  "nerd",
  "trippy",
  "matrix",
  "3d",
  "eye_mask",
  "eyepatch",
]);

export const DEFAULT_MFER_APPEARANCE_TRAITS: MferAppearanceTraits = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
};

export const AGENT_MFER_APPEARANCE_FORCED_TRAITS = {
  eyes: "regular",
  mouth: "flat",
} as const;

export const AGENT_MFER_APPEARANCE_BLOCKED_TRAITS = {
  categories: ["long_hair"],
  options: {
    eyes: MFER_APPEARANCE_TRAIT_CATEGORIES
      .find((category) => category.id === "eyes")
      ?.options.map((option) => option.id)
      .filter((optionId) => optionId !== "regular") ?? [],
    hat_under_headphones: ["cap_monochrome", "cap_based_blue", "cap_purple"],
  },
} as const;

export const DEFAULT_AGENT_MFER_APPEARANCE_TRAITS: MferAppearanceTraits = {
  ...DEFAULT_MFER_APPEARANCE_TRAITS,
  ...AGENT_MFER_APPEARANCE_FORCED_TRAITS,
};

export const AGENT_MFER_APPEARANCE_SELECTION_GUIDANCE = "Prefer wallet/name-seeded variety over defaults or first-listed choices. Pick a coherent style from the full catalog; only use the default or first option when it intentionally fits the agent identity. Declared agents cannot use caps, long hair, shades, or glasses because those clip into the agent model.";

const AGENT_RANDOMIZED_TRAIT_CATEGORIES: Record<string, number> = {
  hat_over_headphones: 55,
  hat_under_headphones: 70,
  short_hair: 45,
  long_hair: 25,
  shirt: 75,
  watch: 70,
  chain: 35,
  beard: 25,
  smoke: 35,
  shoes_and_gloves: 90,
};

export function makeDeterministicAgentMferAppearanceTraits(seed: string | number) {
  const seedText = String(seed || "agent");
  const traits: MferAppearanceTraits = {};

  for (const category of MFER_APPEARANCE_TRAIT_CATEGORIES) {
    if (!isAgentMferAppearanceTraitAllowed(category.id)) continue;
    if (category.id === "eyes" || category.id === "mouth") continue;

    const optionalChance = AGENT_RANDOMIZED_TRAIT_CATEGORIES[category.id];
    if (!category.required) {
      if (optionalChance === undefined) continue;
      const includeRoll = stableHash(`agent-trait:include:${seedText}:${category.id}`) % 100;
      if (includeRoll >= optionalChance) continue;
    }

    const option = pickAgentTraitOption(category, seedText);
    if (option) traits[category.id] = option;
  }

  return normalizeAgentMferAppearanceTraits(traits, DEFAULT_AGENT_MFER_APPEARANCE_TRAITS);
}

export function resolveAgentMferAppearanceTraitsForUpdate(
  value: unknown,
  existing: unknown,
  seed: string | number,
) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const hasSubmittedTraits = Object.values(source).some((entry) => typeof entry === "string" && entry.trim().length > 0);
  const normalizedExisting = normalizeAgentMferAppearanceTraits(existing, {});
  const fallback = hasSubmittedTraits && hasExplicitMferAppearanceTraits(normalizedExisting)
    ? normalizedExisting
    : makeDeterministicAgentMferAppearanceTraits(seed);
  if (!hasSubmittedTraits) return fallback;
  const submitted = normalizeAgentMferAppearanceTraits(source, {});
  return normalizeAgentMferAppearanceTraits({ ...fallback, ...submitted }, fallback);
}

export function normalizeMferAppearanceTraits(
  value: unknown,
  fallback: MferAppearanceTraits = DEFAULT_MFER_APPEARANCE_TRAITS,
) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized: MferAppearanceTraits = {};

  for (const category of MFER_APPEARANCE_TRAIT_CATEGORIES) {
    const rawValue = source[category.id];
    const rawFallback = fallback[category.id];
    const allowed = TRAIT_OPTIONS_BY_CATEGORY.get(category.id);
    if (typeof rawValue === "string" && allowed?.has(rawValue)) {
      normalized[category.id] = rawValue;
      continue;
    }
    if (category.required && typeof rawFallback === "string" && allowed?.has(rawFallback)) {
      normalized[category.id] = rawFallback;
    }
  }

  applyMferAppearanceTraitRules(normalized);
  return normalized;
}

export function normalizeAgentMferAppearanceTraits(
  value: unknown,
  fallback: MferAppearanceTraits = DEFAULT_AGENT_MFER_APPEARANCE_TRAITS,
) {
  const normalized = normalizeMferAppearanceTraits(value, fallback);
  removeBlockedAgentMferAppearanceTraits(normalized);
  if (Object.keys(normalized).length === 0) return normalized;
  return {
    ...normalized,
    ...AGENT_MFER_APPEARANCE_FORCED_TRAITS,
  };
}

export function parseMferAppearanceTraitsJson(value: string | null | undefined) {
  if (!value) return {};
  try {
    return normalizeMferAppearanceTraits(JSON.parse(value), {});
  } catch {
    return {};
  }
}

export function serializeMferAppearanceTraits(traits: MferAppearanceTraits) {
  return JSON.stringify(normalizeMferAppearanceTraits(traits));
}

export function serializeAgentMferAppearanceTraits(traits: MferAppearanceTraits) {
  return JSON.stringify(normalizeAgentMferAppearanceTraits(traits));
}

export function hasExplicitMferAppearanceTraits(traits: MferAppearanceTraits | null | undefined) {
  return Boolean(traits && Object.keys(traits).length > 0);
}

function applyMferAppearanceTraitRules(traits: MferAppearanceTraits) {
  if (traits.hat_over_headphones) {
    delete traits.hat_under_headphones;
  }

  if (traits.short_hair && traits.long_hair) {
    delete traits.long_hair;
  }

  if (traits.type === "ape") {
    delete traits.long_hair;
    if (traits.short_hair?.startsWith("messy_") && !traits.short_hair.endsWith("_ape")) {
      traits.short_hair = `${traits.short_hair}_ape`;
    }
  } else if (traits.short_hair?.endsWith("_ape")) {
    traits.short_hair = traits.short_hair.replace("_ape", "");
  }

  if (traits.hat_over_headphones && ["cowboy", "pilot", "top"].includes(traits.hat_over_headphones)) {
    delete traits.short_hair;
    delete traits.long_hair;
  }

  if (traits.hat_over_headphones?.startsWith("hoodie_")) {
    delete traits.short_hair;
    delete traits.long_hair;
    delete traits.shirt;
  }

  if (traits.type === "zombie" && !ZOMBIE_EYE_OVERLAY_TRAITS.has(traits.eyes)) traits.eyes = "zombie";
  if (traits.type !== "zombie" && traits.eyes === "zombie") traits.eyes = "regular";
  if (traits.type === "alien" && traits.eyes === "regular") traits.eyes = "alien";
  if (traits.type === "based" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "mfercoin";
  if (traits.type === "metal" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "metal";

  if (traits.long_hair === "long_curly" && ["black_square", "blue_square", "gold_square"].includes(traits.headphones)) {
    delete traits.long_hair;
  }

  if (traits.hat_over_headphones === "pilot" && ["black_square", "blue_square", "gold_square"].includes(traits.headphones)) {
    delete traits.hat_over_headphones;
  }
}

function pickAgentTraitOption(category: MferAppearanceTraitCategory, seedText: string) {
  const options = category.options
    .map((option) => option.id)
    .filter((optionId) => Boolean(optionId) && isAgentMferAppearanceTraitAllowed(category.id, optionId));
  if (options.length === 0) return "";

  const defaultValue = DEFAULT_AGENT_MFER_APPEARANCE_TRAITS[category.id] ?? DEFAULT_MFER_APPEARANCE_TRAITS[category.id];
  const firstValue = options[0];
  const avoidDefaultRoll = stableHash(`agent-trait:avoid-default:${seedText}:${category.id}`) % 5 !== 0;
  const preferredOptions = avoidDefaultRoll
    ? options.filter((option) => option !== firstValue && option !== defaultValue)
    : [];
  const pool = preferredOptions.length > 0 ? preferredOptions : options;
  return pool[stableHash(`agent-trait:pick:${seedText}:${category.id}`) % pool.length] ?? "";
}

function isAgentMferAppearanceTraitAllowed(categoryId: string, optionId = "") {
  if ((AGENT_MFER_APPEARANCE_BLOCKED_TRAITS.categories as readonly string[]).includes(categoryId)) return false;
  const blockedOptions = AGENT_MFER_APPEARANCE_BLOCKED_TRAITS.options as Record<string, readonly string[]>;
  const blocked = blockedOptions[categoryId] ?? [];
  return !optionId || !blocked.includes(optionId) && !(categoryId === "hat_under_headphones" && optionId.startsWith("cap_"));
}

function removeBlockedAgentMferAppearanceTraits(traits: MferAppearanceTraits) {
  for (const [categoryId, optionId] of Object.entries(traits)) {
    if (!isAgentMferAppearanceTraitAllowed(categoryId, optionId)) delete traits[categoryId];
  }
}

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
export const TRAIT_CHANGE_PRICES_WEI: Record<TraitPaymentToken, string> = {
  ETH: "10000000000000000",
  MFER: "90000000000000000000",
  MFERGPT: "75000000000000000000",
};

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

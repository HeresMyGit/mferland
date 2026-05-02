import { seeded } from "./random";
import type { NpcSnapshot } from "@mferland/shared";

const TRAIT_MESH_MAPPING: Record<string, Record<string, string[]>> = {
  type: {
    plain: ["type_plain", "body", "heres_my_signature"],
    charcoal: ["type_charcoal", "body", "heres_my_signature"],
    zombie: ["type_zombie", "body", "heres_my_signature"],
    ape: ["type_ape", "body", "heres_my_signature"],
    alien: ["type_alien", "body", "heres_my_signature"],
    metal: ["type_metal", "body_metal", "heres_my_signature"],
    based: ["type_based_mfer", "body_mfercoin", "heres_my_signature"],
  },
  eyes: {
    regular: ["eyes_normal"],
    vr: ["eyes_normal", "eyes_vr", "eyes_vr_lense"],
    shades: ["eyes_normal", "eyes_glasses", "eyes_glasses_shades"],
    purple_shades: ["eyes_normal", "eyes_glasses", "eyes_glasses_purple"],
    nerd: ["eyes_normal", "eyes_glasses", "eyes_glasses_nerd"],
    trippy: ["eyes_normal", "eyes_glasses", "eyes_glasses_shades_s34n"],
    matrix: ["eyes_normal", "eyes_glasses", "eyes_glasses_shades_matrix"],
    "3d": ["eyes_normal", "eyes_glases_3d", "eyes_glasses_3d_lenses", "eyes_glases_3d_rim"],
    eye_mask: ["eyes_normal", "eyes_eye_mask"],
    eyepatch: ["eyes_normal", "eyes_eye_patch"],
    metal: ["eyes_metal"],
    mfercoin: ["eyes_mfercoin"],
    red: ["eyes_red"],
    alien: ["eyes_alien"],
    zombie: ["eyes_zombie"],
  },
  mouth: {
    smile: ["mouth_smile"],
    flat: ["mouth_flat"],
  },
  headphones: {
    white: ["headphones_white"],
    red: ["headphones_red"],
    green: ["headphones_green"],
    pink: ["headphones_pink"],
    gold: ["headphones_gold"],
    blue: ["headphones_blue"],
    black: ["headphones_black"],
    lined: ["headphones_lined"],
    black_square: ["headphones_square_black"],
    blue_square: ["headphones_square_blue"],
    gold_square: ["headphones_square_gold"],
  },
  hat_over_headphones: {
    cowboy: ["hat_cowboy_hat"],
    top: ["hat_tophat", "hat_tophat_red"],
    pilot: ["hat_pilot_cap", "hat_pilot_cap_rims", "hat_pilot_cap_glasses"],
    hoodie_gray: ["shirt_hoodie_up_dark_gray", "shirt_hoodie_dark_gray"],
    hoodie_pink: ["shirt_hoodie_up_pink", "shirt_hoodie_pink"],
    hoodie_red: ["shirt_hoodie_up_red", "shirt_hoodie_red"],
    hoodie_blue: ["shirt_hoodie_up_blue", "shirt_hoodie_blue"],
    hoodie_white: ["shirt_hoodie_up_white", "shirt_hoodie_white"],
    hoodie_green: ["shirt_hoodie_up_green", "shirt_hoodie_green"],
    larva_mfer: ["larmf-lowpoly", "larmf-lowpoly_1", "larmf-lowpoly_2", "larmf-lowpoly_3", "larmf-lowpoly_4", "larmf-lowpoly_5", "larmf-lowpoly_6"],
  },
  hat_under_headphones: {
    bandana_dark_gray: ["hat_bandana_dark_gray"],
    bandana_red: ["hat_bandana_red"],
    bandana_blue: ["hat_bandana_blue"],
    knit_kc: ["hat_knit_kc"],
    knit_las_vegas: ["hat_knit_las_vegas"],
    knit_new_york: ["hat_knit_new_york"],
    knit_san_fran: ["hat_knit_san_fran"],
    knit_miami: ["hat_knit_miami"],
    knit_chicago: ["hat_knit_chicago"],
    knit_atlanta: ["hat_knit_atlanta"],
    knit_cleveland: ["hat_knit_cleveland"],
    knit_dallas: ["hat_knit_dallas"],
    knit_baltimore: ["hat_knit_baltimore"],
    knit_buffalo: ["hat_knit_buffalo"],
    knit_pittsburgh: ["hat_knit_pittsburgh"],
    cap_monochrome: ["cap_monochrome"],
    cap_based_blue: ["cap_based_blue"],
    cap_purple: ["cap_purple"],
    beanie_monochrome: ["hat_beanie_monochrome"],
    beanie: ["hat_beanie"],
    headband_blue_green: ["headband_blue_green"],
    headband_green_white: ["headband_green_white"],
    headband_blue_red: ["headband_blue_red"],
    headband_pink_white: ["headband_pink_white"],
    headband_blue_white: ["headband_blue_white"],
  },
  short_hair: {
    mohawk_purple: ["hair_short_mohawk_purple"],
    mohawk_red: ["hair_short_mohawk_red"],
    mohawk_pink: ["hair_short_mohawk_pink"],
    mohawk_black: ["hair_short_mohawk_black"],
    mohawk_yellow: ["hair_short_mohawk_yellow"],
    mohawk_green: ["hair_short_mohawk_green"],
    mohawk_blue: ["hair_short_mohawk_blue"],
    messy_black: ["hair_short_messy_black"],
    messy_yellow: ["hair_short_messy_yellow"],
    messy_red: ["hair_short_messy_red"],
    messy_purple: ["hair_short_messy_purple"],
    messy_black_ape: ["hair_short_messy_black_ape"],
    messy_yellow_ape: ["hair_short_messy_yellow_ape"],
    messy_red_ape: ["hair_short_messy_red_ape"],
    messy_purple_ape: ["hair_short_messy_purple_ape"],
  },
  long_hair: {
    long_yellow: ["hair_long_light"],
    long_black: ["hair_long_dark"],
    long_curly: ["hair_long_curly"],
  },
  shirt: {
    collared_pink: ["shirt_collared_pink"],
    collared_green: ["shirt_collared_green"],
    collared_yellow: ["shirt_collared_yellow"],
    collared_white: ["shirt_collared_white"],
    collared_turquoise: ["shirt_collared_turquoise"],
    collared_blue: ["shirt_collared_blue"],
    hoodie_down_red: ["shirt_hoodie_down_red", "shirt_hoodie_red"],
    hoodie_down_pink: ["shirt_hoodie_down_pink", "shirt_hoodie_pink"],
    hoodie_down_white: ["shirt_hoodie_down_white", "shirt_hoodie_white"],
    hoodie_down_green: ["shirt_hoodie_down_green", "shirt_hoodie_green"],
    hoodie_down_gray: ["shirt_hoodie_down_dark_gray", "shirt_hoodie_dark_gray"],
    hoodie_down_blue: ["shirt_hoodie_down_blue", "shirt_hoodie_blue"],
  },
  watch: {
    sub_blue: ["watch_sub_blue", "watch_sub_strap_white"],
    sub_lantern_green: ["watch_sub_lantern_green", "watch_sub_strap_white"],
    sub_cola: ["watch_sub_cola_blue_red", "watch_sub_strap_white"],
    sub_turquoise: ["watch_sub_turquoise", "watch_sub_strap_white"],
    sub_bat: ["watch_sub_bat_blue_black", "watch_sub_strap_white"],
    sub_black: ["watch_sub_black", "watch_sub_strap_white"],
    sub_rose: ["watch_sub_rose", "watch_sub_strap_white"],
    sub_red: ["watch_sub_red", "watch_sub_strap_gray"],
    oyster_silver: ["watch_oyster_silver", "watch_sub_strap_white"],
    oyster_gold: ["watch_oyster_gold", "watch_sub_strap_gold"],
    argo_white: ["watch_argo_white"],
    argo_black: ["watch_argo_black"],
    timex: ["watch_timex"],
  },
  chain: {
    silver: ["chain_silver"],
    gold: ["chain_gold"],
    onchain: ["chain_onchain"],
  },
  beard: {
    full: ["beard"],
    flat: ["beard_flat"],
  },
  smoke: {
    pipe: ["smoke_pipe"],
    pipe_brown: ["smoke_pipe_brown"],
    cig_white: ["smoke_cig_white", "smoke"],
    cig_black: ["smoke_cig_black", "smoke"],
  },
  shoes_and_gloves: {
    green: ["accessories_christmas_green"],
    graveyard: ["accessories_christmas_graveyard"],
    red: ["accessories_christmas_red"],
    tree: ["accessories_christmas_tree"],
    teal: ["accessories_christmas_teal"],
    turquoise: ["accessories_christmas_turquoise"],
    purple: ["accessories_christmas_purple"],
    space: ["accessories_christmas_space"],
    orange: ["accessories_christmas_orange"],
    blue: ["accessories_christmas_blue"],
    yellow: ["accessories_christmas_yellow"],
  },
};

const TYPE_EYE_BASE: Record<string, string> = {
  metal: "eyes_metal",
  based: "eyes_mfercoin",
  zombie: "eyes_zombie",
  alien: "eyes_alien",
};

export type MferTraits = Record<string, string>;
export type NpcTraitSource = Pick<NpcSnapshot, "id" | "name" | "role">;

export const SARTOSHI_MFER_TRAITS: MferTraits = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
  smoke: "cig_black",
  watch: "argo_white",
};

export function generateRandomMferTraits(seed: number): MferTraits {
  const rand = seeded(seed);
  const traits: MferTraits = {};

  traits.type = getRandomType(rand);
  traits.eyes = pick(rand, ["regular", "vr", "shades", "purple_shades", "nerd", "trippy", "matrix", "3d", "eye_mask", "eyepatch"]);
  traits.mouth = pick(rand, ["flat", "smile"]);
  traits.headphones = pick(rand, Object.keys(TRAIT_MESH_MAPPING.headphones));

  const optional = ["hat_over_headphones", "hat_under_headphones", "short_hair", "long_hair", "shirt", "watch", "chain", "beard", "smoke", "shoes_and_gloves"];
  for (const category of optional) {
    const chance = category === "shoes_and_gloves" ? 0.95 : 0.8;
    if (rand() >= chance) continue;

    let options = Object.keys(TRAIT_MESH_MAPPING[category]);
    if (category === "short_hair") options = options.filter((option) => !option.includes("_ape"));
    traits[category] = pick(rand, options);
  }
  resolveTraitConflicts(rand, traits);
  return traits;
}

export function generateMferTraitsForActor(seed: number, npc?: NpcTraitSource | null): MferTraits {
  const traits = generateRandomMferTraits(seed);
  if (!npc) return traits;

  applyNpcTraitTheme(seed, npc, traits);
  removeForcedTraitConflicts(traits);
  return traits;
}

export function traitsToMeshes(traits: MferTraits): Set<string> {
  const meshes = new Set<string>();

  for (const meshName of TRAIT_MESH_MAPPING.type[traits.type] || []) meshes.add(meshName);

  const eyeMeshes = TRAIT_MESH_MAPPING.eyes[traits.eyes] || ["eyes_normal"];
  const eyeBase = TYPE_EYE_BASE[traits.type] || "eyes_normal";
  for (const meshName of eyeMeshes) meshes.add(meshName === "eyes_normal" ? eyeBase : meshName);

  const mouthBase = traits.mouth === "smile" ? "mouth_smile" : "mouth_flat";
  if (traits.type === "metal") meshes.add(`${mouthBase}_metal`);
  else if (traits.type === "based") meshes.add(`${mouthBase}_mfercoin`);
  else meshes.add(mouthBase);

  const otherCategories = ["headphones", "hat_over_headphones", "hat_under_headphones", "short_hair", "long_hair", "shirt", "watch", "chain", "beard", "smoke", "shoes_and_gloves"];
  for (const category of otherCategories) {
    const value = traits[category];
    if (!value) continue;
    for (const meshName of TRAIT_MESH_MAPPING[category]?.[value] || []) meshes.add(meshName);
  }

  return meshes;
}

function applyNpcTraitTheme(seed: number, npc: NpcTraitSource, traits: MferTraits) {
  const rand = seeded(seed + 4099);

  if (npc.role === "farmer") {
    traits.type = pick(rand, ["plain", "charcoal"]);
    traits.eyes = "red";
    traits.mouth = "flat";
    traits.headphones = pick(rand, ["black", "red", "lined"]);
    traits.hat_over_headphones = "cowboy";
    traits.shirt = npc.id.includes("mage") ? "hoodie_down_red" : pick(rand, ["collared_yellow", "hoodie_down_red"]);
    traits.shoes_and_gloves = "red";
    if (!npc.id.includes("mage")) traits.smoke = pick(rand, ["pipe", "pipe_brown"]);
    delete traits.hat_under_headphones;
    delete traits.short_hair;
    delete traits.long_hair;
    delete traits.chain;
    return;
  }

  if (npc.id === "dao-mfer") {
    traits.type = "based";
    traits.eyes = "mfercoin";
    traits.headphones = "gold";
    traits.hat_under_headphones = "cap_based_blue";
    traits.shirt = "collared_blue";
    traits.watch = "sub_blue";
    traits.chain = "onchain";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "og-mfer") {
    traits.type = pick(rand, ["plain", "charcoal"]);
    traits.eyes = "shades";
    traits.headphones = "black";
    traits.hat_over_headphones = "top";
    traits.shirt = "collared_white";
    traits.chain = "gold";
    traits.smoke = "pipe_brown";
    delete traits.hat_under_headphones;
    return;
  }

  if (npc.id === "fountain-mfer") {
    traits.type = pick(rand, ["plain", "alien"]);
    traits.eyes = traits.type === "alien" ? "alien" : "3d";
    traits.headphones = "blue";
    traits.hat_under_headphones = "headband_blue_green";
    traits.shirt = "collared_turquoise";
    traits.watch = "sub_turquoise";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "wearables-mfer") {
    traits.type = pick(rand, ["plain", "based"]);
    traits.eyes = "purple_shades";
    traits.headphones = pick(rand, ["pink", "gold", "blue_square"]);
    traits.hat_under_headphones = "cap_purple";
    traits.shirt = "collared_pink";
    traits.watch = "sub_rose";
    traits.chain = "gold";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "hogwatch-mfer") {
    traits.type = pick(rand, ["plain", "charcoal"]);
    traits.eyes = "shades";
    traits.headphones = "black";
    traits.hat_under_headphones = "bandana_dark_gray";
    traits.shirt = "hoodie_down_gray";
    traits.watch = "sub_black";
    traits.smoke = "cig_black";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "field-guide-mfer" || npc.id === "pen-keeper-mfer") {
    traits.type = "plain";
    traits.eyes = npc.id === "pen-keeper-mfer" ? "eye_mask" : "nerd";
    traits.headphones = npc.id === "pen-keeper-mfer" ? "green" : "blue";
    traits.hat_under_headphones = npc.id === "pen-keeper-mfer" ? "bandana_blue" : "cap_monochrome";
    traits.shirt = npc.id === "pen-keeper-mfer" ? "hoodie_down_green" : "collared_green";
    traits.watch = "sub_lantern_green";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "ridge-guide-mfer" || npc.id === "beacon-keeper-mfer") {
    traits.type = npc.id === "beacon-keeper-mfer" ? pick(rand, ["plain", "metal"]) : "plain";
    traits.eyes = npc.id === "beacon-keeper-mfer" && traits.type === "metal" ? "metal" : "vr";
    traits.headphones = npc.id === "beacon-keeper-mfer" ? "blue_square" : "blue";
    traits.hat_under_headphones = npc.id === "beacon-keeper-mfer" ? "beanie_monochrome" : "headband_blue_white";
    traits.shirt = npc.id === "beacon-keeper-mfer" ? "hoodie_down_blue" : "collared_turquoise";
    traits.watch = npc.id === "beacon-keeper-mfer" ? "sub_turquoise" : "sub_blue";
    if (npc.id === "beacon-keeper-mfer") traits.chain = "silver";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.id === "camp-merchant" || npc.id === "ridge-merchant") {
    traits.type = npc.id === "ridge-merchant" ? pick(rand, ["plain", "metal"]) : pick(rand, ["plain", "based"]);
    traits.eyes = npc.id === "ridge-merchant" ? (traits.type === "metal" ? "metal" : "matrix") : "purple_shades";
    traits.headphones = npc.id === "ridge-merchant" ? "black_square" : "gold";
    traits.hat_under_headphones = npc.id === "ridge-merchant" ? "beanie" : "cap_purple";
    traits.shirt = npc.id === "ridge-merchant" ? "hoodie_down_blue" : "collared_pink";
    traits.watch = npc.id === "ridge-merchant" ? "sub_black" : "sub_rose";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.role === "merchant") {
    traits.type = pick(rand, ["plain", "based"]);
    traits.eyes = traits.type === "based" ? "mfercoin" : "purple_shades";
    traits.headphones = "gold";
    traits.hat_under_headphones = "cap_purple";
    traits.shirt = "collared_pink";
    traits.watch = "sub_rose";
    delete traits.hat_over_headphones;
    return;
  }

  if (npc.role === "guard") {
    traits.type = "plain";
    traits.eyes = "shades";
    traits.headphones = "black";
    traits.shirt = "collared_blue";
    traits.watch = "sub_black";
    traits.mouth = "flat";
    delete traits.hat_over_headphones;
    delete traits.hat_under_headphones;
    delete traits.short_hair;
    delete traits.long_hair;
    return;
  }

  if (npc.role === "enemy") {
    traits.type = "charcoal";
    traits.eyes = "red";
    traits.headphones = "red";
    traits.hat_over_headphones = "hoodie_red";
    traits.shoes_and_gloves = "red";
    traits.mouth = "flat";
    delete traits.hat_under_headphones;
    return;
  }
}

function removeForcedTraitConflicts(traits: MferTraits) {
  if (traits.hat_over_headphones) {
    delete traits.hat_under_headphones;
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

  if (traits.type === "based" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "mfercoin";
  if (traits.type === "metal" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "metal";
  if (traits.type === "zombie") traits.eyes = "zombie";
  if (traits.type === "alien" && traits.eyes === "regular") traits.eyes = "alien";
}

function getRandomType(rand: () => number) {
  const roll = rand() * 100;
  if (roll < 30) return "plain";
  if (roll < 60) return "charcoal";
  if (roll < 74) return "zombie";
  if (roll < 86) return "ape";
  if (roll < 96) return "alien";
  if (roll < 98) return "based";
  return "metal";
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function resolveTraitConflicts(rand: () => number, traits: MferTraits) {
  if (traits.hat_over_headphones && traits.hat_under_headphones) {
    const isHoodieUp = traits.hat_over_headphones.startsWith("hoodie_");
    const isBeanie = traits.hat_under_headphones.startsWith("beanie");
    if (isHoodieUp && isBeanie) delete traits.hat_under_headphones;
    else rand() < 0.5 ? delete traits.hat_over_headphones : delete traits.hat_under_headphones;
  }

  if (traits.short_hair && traits.long_hair) {
    rand() < 0.5 ? delete traits.short_hair : delete traits.long_hair;
  }

  if (traits.type === "ape") delete traits.long_hair;

  const hasHoodieUp = traits.hat_over_headphones?.startsWith("hoodie_");
  if ((traits.shirt || hasHoodieUp) && traits.chain) {
    if (rand() < 0.5) {
      delete traits.chain;
    } else {
      if (hasHoodieUp) delete traits.hat_over_headphones;
      if (traits.shirt) delete traits.shirt;
    }
  }

  if (traits.shirt && hasHoodieUp) {
    rand() < 0.5 ? delete traits.shirt : delete traits.hat_over_headphones;
  }

  const hasHeadwear = traits.hat_over_headphones || traits.hat_under_headphones;
  const isMohawkOrMessy = traits.short_hair?.startsWith("mohawk_") || traits.short_hair?.startsWith("messy_");
  if (hasHeadwear && isMohawkOrMessy && !traits.hat_over_headphones?.startsWith("hoodie_")) {
    if (rand() < 0.5) delete traits.short_hair;
    else {
      delete traits.hat_over_headphones;
      delete traits.hat_under_headphones;
    }
  }

  if (traits.hat_over_headphones && ["cowboy", "pilot", "top"].includes(traits.hat_over_headphones)) {
    delete traits.short_hair;
    delete traits.long_hair;
  }

  if (traits.hat_over_headphones?.startsWith("hoodie_")) {
    delete traits.short_hair;
    delete traits.long_hair;
  }

  if (traits.type === "zombie" && (traits.eyes === "regular" || traits.eyes === "red")) traits.eyes = "zombie";
  if (traits.type !== "zombie" && traits.eyes === "zombie") traits.eyes = "regular";
  if (traits.type === "alien" && traits.eyes === "regular") traits.eyes = "alien";

  if (traits.type === "ape" && traits.short_hair?.startsWith("messy_") && !traits.short_hair.endsWith("_ape")) {
    traits.short_hair = `${traits.short_hair}_ape`;
  }

  if (traits.type !== "ape" && traits.short_hair?.endsWith("_ape")) {
    traits.short_hair = traits.short_hair.replace("_ape", "");
  }

  if (traits.type === "based" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "mfercoin";
  if (traits.type === "metal" && ["alien", "zombie", "red"].includes(traits.eyes)) traits.eyes = "metal";

  if (traits.long_hair === "long_curly" && ["black_square", "blue_square", "gold_square"].includes(traits.headphones)) {
    delete traits.long_hair;
  }

  if (traits.hat_over_headphones === "pilot" && ["black_square", "blue_square", "gold_square"].includes(traits.headphones)) {
    delete traits.hat_over_headphones;
  }
}

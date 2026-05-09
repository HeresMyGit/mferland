import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MFER_APPEARANCE_TRAIT_CATEGORIES } from "@mferland/shared";
import { TRAIT_MESH_MAPPING, type MferTraits } from "../game/mferTraits";
import {
  getMferPortraitLayerFilenamesForTest,
  getMferPortraitLayerTraitsForTest,
} from "./MferPortrait";

const LAYER_ROOT = fileURLToPath(new URL("../../public/mfer-layers", import.meta.url));
const LOCAL_LAYER_ROOTS = [
  join(LAYER_ROOT, "og"),
  join(LAYER_ROOT, "extended"),
];
const BASE_TRAITS: MferTraits = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
};
const CATEGORY_TO_LAYER_FOLDER: Record<string, string | null> = {
  background: "background",
  type: "type",
  eyes: "eyes",
  mouth: "mouth",
  headphones: "headphones",
  hat_over_headphones: "hat over headphones",
  hat_under_headphones: "hat under headphones",
  short_hair: "short hair",
  long_hair: "long hair",
  shirt: "shirt",
  watch: "4_20 watch",
  chain: "chain",
  beard: "beard",
  smoke: "smoke",
  shoes_and_gloves: null,
};

test("maps every portrait-backed 3D avatar trait to an available 2D layer", () => {
  const missing: string[] = [];

  for (const { category, value } of getKnownTraitCases()) {
    const layerFolder = CATEGORY_TO_LAYER_FOLDER[category];
    if (!layerFolder) continue;

    const layerTraits = getMferPortraitLayerTraitsForTest(makeTraits(category, value));
    const layerValue = layerTraits[layerFolder];
    if (!layerValue) {
      missing.push(`${category}.${value}: no ${layerFolder} layer mapping`);
      continue;
    }
    if (!hasLayerFile(layerFolder, layerValue)) {
      missing.push(`${category}.${value}: ${layerFolder}/${layerValue}.png is missing`);
    }
  }

  assert.deepEqual(missing, []);
});

function getKnownTraitCases() {
  const cases = new Map<string, Set<string>>();
  for (const category of MFER_APPEARANCE_TRAIT_CATEGORIES) {
    getOrCreateCases(cases, category.id);
    for (const option of category.options) cases.get(category.id)?.add(option.id);
  }
  for (const [category, options] of Object.entries(TRAIT_MESH_MAPPING)) {
    getOrCreateCases(cases, category);
    for (const value of Object.keys(options)) cases.get(category)?.add(value);
  }

  return [...cases.entries()].flatMap(([category, values]) => (
    [...values].map((value) => ({ category, value }))
  ));
}

function getOrCreateCases(cases: Map<string, Set<string>>, category: string) {
  if (!cases.has(category)) cases.set(category, new Set());
}

function makeTraits(category: string, value: string): MferTraits {
  const traits: MferTraits = { ...BASE_TRAITS, [category]: value };

  if (category === "type" && value === "alien") traits.eyes = "alien";
  if (category === "type" && value === "zombie") traits.eyes = "zombie";
  if (category === "type" && value === "metal") traits.eyes = "metal";
  if (category === "type" && value === "based") traits.eyes = "mfercoin";
  if (category === "short_hair" && value.endsWith("_ape")) traits.type = "ape";

  return traits;
}

function hasLayerFile(folder: string, value: string) {
  const filenames = getMferPortraitLayerFilenamesForTest(folder, value);
  return LOCAL_LAYER_ROOTS.some((root) => (
    filenames.some((filename) => existsSync(join(root, folder, filename)))
  ));
}

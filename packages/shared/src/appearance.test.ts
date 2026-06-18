import assert from "node:assert/strict";
import test from "node:test";
import {
  makeDeterministicAgentMferAppearanceTraits,
  normalizeAgentMferAppearanceTraits,
  normalizeMferAppearanceTraits,
  resolveAgentMferAppearanceTraitsForUpdate,
} from "./appearance";

test("allows zombie mfers to wear glasses over zombie eyes", () => {
  const traits = normalizeMferAppearanceTraits({
    background: "graveyard",
    type: "zombie",
    eyes: "shades",
    mouth: "flat",
    headphones: "black",
  });

  assert.equal(traits.type, "zombie");
  assert.equal(traits.eyes, "shades");
});

test("normalizes non-overlay zombie eye selections back to zombie eyes", () => {
  const traits = normalizeMferAppearanceTraits({
    background: "graveyard",
    type: "zombie",
    eyes: "alien",
    mouth: "flat",
    headphones: "black",
  });

  assert.equal(traits.type, "zombie");
  assert.equal(traits.eyes, "zombie");
});

test("forces declared agent face traits while preserving robot-compatible style", () => {
  const traits = normalizeAgentMferAppearanceTraits({
    background: "blue",
    type: "alien",
    eyes: "vr",
    mouth: "smile",
    headphones: "blue",
    hat_over_headphones: "hoodie_blue",
    shoes_and_gloves: "blue",
  });

  assert.equal(traits.background, "blue");
  assert.equal(traits.type, "alien");
  assert.equal(traits.headphones, "blue");
  assert.equal(traits.hat_over_headphones, "hoodie_blue");
  assert.equal(traits.shoes_and_gloves, "blue");
  assert.equal(traits.eyes, "regular");
  assert.equal(traits.mouth, "flat");
});

test("allows declared agent caps and long hair while preserving robot face traits", () => {
  const capTraits = normalizeAgentMferAppearanceTraits({
    background: "green",
    type: "plain",
    eyes: "shades",
    mouth: "smile",
    headphones: "blue",
    hat_under_headphones: "cap_based_blue",
    shirt: "hoodie_down_green",
  });
  const longHairTraits = normalizeAgentMferAppearanceTraits({
    background: "yellow",
    type: "plain",
    eyes: "purple_shades",
    mouth: "smile",
    headphones: "blue",
    long_hair: "long_yellow",
    shirt: "hoodie_down_blue",
  });

  assert.equal(capTraits.background, "green");
  assert.equal(capTraits.headphones, "blue");
  assert.equal(capTraits.shirt, "hoodie_down_green");
  assert.equal(capTraits.hat_under_headphones, "cap_based_blue");
  assert.equal(capTraits.eyes, "regular");
  assert.equal(capTraits.mouth, "flat");
  assert.equal(longHairTraits.background, "yellow");
  assert.equal(longHairTraits.headphones, "blue");
  assert.equal(longHairTraits.long_hair, "long_yellow");
  assert.equal(longHairTraits.eyes, "regular");
  assert.equal(longHairTraits.mouth, "flat");
});

test("does not create explicit agent traits from an empty fallback", () => {
  assert.deepEqual(normalizeAgentMferAppearanceTraits({}, {}), {});
});

test("builds deterministic varied agent traits instead of defaulting to first choices", () => {
  const traits = makeDeterministicAgentMferAppearanceTraits("0xagent:blue-leaning-bot");
  const otherTraits = makeDeterministicAgentMferAppearanceTraits("0xagent:other-bot");

  assert.deepEqual(traits, makeDeterministicAgentMferAppearanceTraits("0xagent:blue-leaning-bot"));
  assert.equal(traits.eyes, "regular");
  assert.equal(traits.mouth, "flat");
  assert.notDeepEqual(traits, {
    background: "orange",
    type: "plain",
    eyes: "regular",
    mouth: "flat",
    headphones: "black",
  });
  assert.notDeepEqual(traits, otherTraits);

  for (let index = 0; index < 25; index += 1) {
    const generated = makeDeterministicAgentMferAppearanceTraits(`0xagent:seed-${index}`);
    assert.equal(generated.eyes, "regular");
    assert.equal(generated.mouth, "flat");
  }
});

test("uses deterministic agent traits when an agent update omits choices", () => {
  const seed = "0xagent:trait-default-bot";
  const randomized = makeDeterministicAgentMferAppearanceTraits(seed);

  assert.deepEqual(resolveAgentMferAppearanceTraitsForUpdate({}, {}, seed), randomized);
  assert.deepEqual(
    resolveAgentMferAppearanceTraitsForUpdate({}, { background: "blue", type: "plain", headphones: "blue" }, seed),
    randomized,
  );

  const partial = resolveAgentMferAppearanceTraitsForUpdate({ hat_over_headphones: "hoodie_blue" }, {}, seed);
  assert.equal(partial.hat_over_headphones, "hoodie_blue");
  assert.equal(partial.background, randomized.background);
  assert.equal(partial.type, randomized.type);
  assert.equal(partial.eyes, "regular");
  assert.equal(partial.mouth, "flat");
});

test("keeps existing agent traits as the fallback for later partial updates", () => {
  const existing = makeDeterministicAgentMferAppearanceTraits("0xagent:existing-bot");
  const updated = resolveAgentMferAppearanceTraitsForUpdate({ smoke: "pipe" }, existing, "0xagent:new-random-seed");

  assert.equal(updated.smoke, "pipe");
  assert.equal(updated.background, existing.background);
  assert.equal(updated.type, existing.type);
  assert.equal(updated.headphones, existing.headphones);
});

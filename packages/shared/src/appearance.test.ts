import assert from "node:assert/strict";
import test from "node:test";
import { makeDeterministicAgentMferAppearanceTraits, normalizeAgentMferAppearanceTraits, normalizeMferAppearanceTraits } from "./appearance";

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
});

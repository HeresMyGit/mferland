import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMferAppearanceTraits } from "./appearance";

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

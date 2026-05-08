import assert from "node:assert/strict";
import test from "node:test";
import { generateMferTraitsForActor, traitsToMeshes } from "./mferTraits";

test("renders zombie eye base underneath glasses", () => {
  const meshes = traitsToMeshes({
    background: "graveyard",
    type: "zombie",
    eyes: "shades",
    mouth: "flat",
    headphones: "black",
  });

  assert.equal(meshes.has("eyes_zombie"), true);
  assert.equal(meshes.has("eyes_glasses"), true);
  assert.equal(meshes.has("eyes_glasses_shades"), true);
});

test("drip desk mfer does not inherit random hair", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const traits = generateMferTraitsForActor(seed, {
      id: "wearables-mfer",
      name: "drip desk mfer",
      role: "merchant",
    });

    assert.equal(traits.short_hair, undefined);
    assert.equal(traits.long_hair, undefined);
  }
});

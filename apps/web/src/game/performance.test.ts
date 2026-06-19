import assert from "node:assert/strict";
import test from "node:test";
import { getClientRenderPerformanceProfile } from "./performance";

test("resolves explicit potato graphics quality to the lowest-cost profile", () => {
  const profile = getClientRenderPerformanceProfile("potato");

  assert.equal(profile.graphicsQuality, "potato");
  assert.equal(profile.requestedGraphicsQuality, "potato");
  assert.equal(profile.antialias, false);
  assert.equal(profile.powerPreference, "low-power");
  assert.equal(profile.useOptimizedModelAssets, true);
  assert.equal(profile.reducedWorldDetail, true);
  assert.equal(profile.textureAnisotropy, 1);
  assert.equal(profile.loadedTextureMaxSize, 256);
  assert.ok(profile.gameDpr[1] < 1);
  assert.ok(profile.actorRenderBudget < getClientRenderPerformanceProfile("low").actorRenderBudget);
});

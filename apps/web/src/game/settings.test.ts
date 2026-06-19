import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings } from "./settings";

test("defaults nameplates to other players only", () => {
  assert.deepEqual(DEFAULT_GAME_SETTINGS.nameplates, {
    localPlayer: false,
    otherPlayers: true,
    friendlyNpcs: false,
    unfriendlyNpcs: false,
    healthBars: false,
  });
});

test("defaults graphics quality to auto", () => {
  assert.equal(DEFAULT_GAME_SETTINGS.graphicsQuality, "auto");
});

test("normalizes graphics quality", () => {
  assert.equal(normalizeGameSettings({ graphicsQuality: "potato" }).graphicsQuality, "potato");
  assert.equal(normalizeGameSettings({ graphicsQuality: "low" }).graphicsQuality, "low");
  assert.equal(normalizeGameSettings({ graphicsQuality: "medium" }).graphicsQuality, "medium");
  assert.equal(normalizeGameSettings({ graphicsQuality: "high" }).graphicsQuality, "high");
  assert.equal(normalizeGameSettings({ graphicsQuality: "ultra" }).graphicsQuality, "auto");
});

test("migrates untouched legacy all-on nameplate defaults", () => {
  const settings = normalizeGameSettings({
    nameplates: {
      localPlayer: true,
      otherPlayers: true,
      friendlyNpcs: true,
      unfriendlyNpcs: true,
      healthBars: true,
    },
  });

  assert.deepEqual(settings.nameplates, DEFAULT_GAME_SETTINGS.nameplates);
});

test("preserves customized nameplate settings", () => {
  const settings = normalizeGameSettings({
    nameplates: {
      localPlayer: true,
      otherPlayers: false,
      friendlyNpcs: true,
      unfriendlyNpcs: false,
      healthBars: true,
    },
  });

  assert.deepEqual(settings.nameplates, {
    localPlayer: true,
    otherPlayers: false,
    friendlyNpcs: true,
    unfriendlyNpcs: false,
    healthBars: true,
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { MAX_AVATAR_SEED, normalizeAvatarSeed, stableHash } from "./utils.js";

test("normalizes avatar seeds into Postgres integer range", () => {
  assert.equal(normalizeAvatarSeed(MAX_AVATAR_SEED), MAX_AVATAR_SEED);
  assert.equal(normalizeAvatarSeed(MAX_AVATAR_SEED + 1), 0);
  assert.equal(normalizeAvatarSeed(4_243_712_742), 2_096_229_094);
  assert.equal(normalizeAvatarSeed(-42.9), 42);
});

test("normalizes unstable or invalid avatar seeds with fallback", () => {
  assert.equal(normalizeAvatarSeed(Number.NaN, 123), 123);
  assert.equal(normalizeAvatarSeed(Number.POSITIVE_INFINITY, MAX_AVATAR_SEED + 2), 1);
});

test("stable hash can exceed Postgres integer range", () => {
  assert.ok(stableHash("character:seed-that-caught-the-wallet-join-path") > MAX_AVATAR_SEED);
});

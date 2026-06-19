import assert from "node:assert/strict";
import test from "node:test";
import {
  isAgentGameplayActivityMessage,
  resolveAgentIdleLogoutMs,
  shouldLogOutIdleAgent,
} from "./rooms/TownRoom.js";

test("agent idle timeout config defaults, clamps, and can be disabled", () => {
  assert.equal(resolveAgentIdleLogoutMs(undefined), 180_000);
  assert.equal(resolveAgentIdleLogoutMs(""), 180_000);
  assert.equal(resolveAgentIdleLogoutMs("not-a-number"), 180_000);
  assert.equal(resolveAgentIdleLogoutMs("0"), 0);
  assert.equal(resolveAgentIdleLogoutMs("-10"), 0);
  assert.equal(resolveAgentIdleLogoutMs("2500.8"), 2500);
});

test("agent idle logout only applies to inactive declared agents", () => {
  assert.equal(shouldLogOutIdleAgent({
    isAgent: false,
    joinedAt: 1_000,
    lastActivityAt: 0,
    now: 500_000,
    timeoutMs: 180_000,
  }), false);
  assert.equal(shouldLogOutIdleAgent({
    isAgent: true,
    joinedAt: 1_000,
    lastActivityAt: 0,
    now: 180_999,
    timeoutMs: 180_000,
  }), false);
  assert.equal(shouldLogOutIdleAgent({
    isAgent: true,
    joinedAt: 1_000,
    lastActivityAt: 0,
    now: 181_000,
    timeoutMs: 180_000,
  }), true);
  assert.equal(shouldLogOutIdleAgent({
    isAgent: true,
    joinedAt: 1_000,
    lastActivityAt: 120_000,
    now: 250_000,
    timeoutMs: 180_000,
  }), false);
  assert.equal(shouldLogOutIdleAgent({
    isAgent: true,
    joinedAt: 1_000,
    lastActivityAt: 120_000,
    now: 300_000,
    timeoutMs: 180_000,
  }), true);
  assert.equal(shouldLogOutIdleAgent({
    isAgent: true,
    joinedAt: 1_000,
    lastActivityAt: 0,
    now: 500_000,
    timeoutMs: 0,
  }), false);
});

test("agent idle activity ignores low-level input heartbeats", () => {
  assert.equal(isAgentGameplayActivityMessage("input"), false);
  assert.equal(isAgentGameplayActivityMessage("analyticsEvent"), false);
  assert.equal(isAgentGameplayActivityMessage("agentStatus"), true);
  assert.equal(isAgentGameplayActivityMessage("combatAction"), true);
  assert.equal(isAgentGameplayActivityMessage("acceptQuest"), true);
  assert.equal(isAgentGameplayActivityMessage("interact"), true);
  assert.equal(isAgentGameplayActivityMessage("chat"), true);
});

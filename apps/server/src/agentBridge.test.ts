import assert from "node:assert/strict";
import test from "node:test";
import { actionResultHttpStatus, shouldInterruptMovementForDamage } from "./agentBridge.js";

test("agent action HTTP status preserves retryable chat cooldowns", () => {
  assert.equal(actionResultHttpStatus({ ok: true, status: "accepted" }), 202);
  assert.equal(actionResultHttpStatus({ ok: false, status: "chat_cooldown" }), 429);
  assert.equal(actionResultHttpStatus({ ok: false, status: "payment_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "wallet_action_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "invalid_action" }), 400);
});

test("agent commands interrupt movement-like actions after dangerous travel damage", () => {
  assert.equal(shouldInterruptMovementForDamage("complete_quest", 172, 140, 172), false);
  assert.equal(shouldInterruptMovementForDamage("move_to", 172, 91, 172), true);
  assert.equal(shouldInterruptMovementForDamage("complete_quest", 172, 91, 172), true);
  assert.equal(shouldInterruptMovementForDamage("fight_npc", 172, 91, 172), false);
});

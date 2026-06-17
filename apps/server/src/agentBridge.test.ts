import assert from "node:assert/strict";
import test from "node:test";
import { actionResultHttpStatus } from "./agentBridge.js";

test("agent action HTTP status preserves retryable chat cooldowns", () => {
  assert.equal(actionResultHttpStatus({ ok: true, status: "accepted" }), 202);
  assert.equal(actionResultHttpStatus({ ok: false, status: "chat_cooldown" }), 429);
  assert.equal(actionResultHttpStatus({ ok: false, status: "payment_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "wallet_action_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "invalid_action" }), 400);
});

import assert from "node:assert/strict";
import test from "node:test";
import { canOpenStreamPage } from "./streamAccess";

test("allows agent viewer on public hosts", () => {
  assert.equal(canOpenStreamPage({ agentView: true, hostname: "game.mfergpt.lol" }), true);
});

test("keeps non-agent stream routes local-only", () => {
  assert.equal(canOpenStreamPage({ agentView: false, hostname: "game.mfergpt.lol" }), false);
  assert.equal(canOpenStreamPage({ agentView: false, hostname: "127.0.0.1" }), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeAgentCommandSeconds,
  getAgentCommandBudget,
  getAgentCommandUsage,
  reserveAgentCommandSeconds,
} from "./agentCommandBudget.js";

const MFERGPT = 10n ** 18n;

test("agent command budgets scale with MFERGPT holdings", () => {
  assert.equal(getAgentCommandBudget("0").tier, "base");
  assert.equal(getAgentCommandBudget(25_000_000n * MFERGPT).tier, "mfergpt_25m");
  assert.equal(getAgentCommandBudget(100_000_000n * MFERGPT).tier, "mfergpt_100m");
  assert.equal(getAgentCommandBudget(500_000_000n * MFERGPT).tier, "mfergpt_500m");
  assert.equal(getAgentCommandBudget(500_000_000n * MFERGPT).maxCommandSeconds, 30 * 60);
});

test("agent command reservations cap command length and daily usage", async () => {
  const wallet = "0x0000000000000000000000000000000000000aaa";
  const now = Date.UTC(2026, 5, 17, 12, 0, 0);
  const budget = getAgentCommandBudget("0");

  const first = await reserveAgentCommandSeconds(wallet, budget, 30 * 60, now);
  assert.equal(first.ok, true);
  assert.equal(first.seconds, 5 * 60);
  assert.equal(first.usage.reservedSeconds, 5 * 60);

  await finalizeAgentCommandSeconds(wallet, first.seconds, now, now + 90_000);
  const usage = await getAgentCommandUsage(wallet, budget, now + 91_000);
  assert.equal(usage.usedSeconds, 90);
  assert.equal(usage.reservedSeconds, 0);

  const second = await reserveAgentCommandSeconds(wallet, budget, 60 * 60, now + 92_000);
  assert.equal(second.ok, true);
  assert.equal(second.seconds, 5 * 60);
  assert.equal(second.usage.remainingSeconds, (20 * 60) - 90 - (5 * 60));
});

test("agent command reservations expire after their timebox grace", async () => {
  const wallet = "0x0000000000000000000000000000000000000aab";
  const now = Date.UTC(2026, 5, 17, 13, 0, 0);
  const budget = getAgentCommandBudget("0");

  const reservation = await reserveAgentCommandSeconds(wallet, budget, 30 * 60, now);
  assert.equal(reservation.ok, true);
  assert.equal(reservation.usage.reservedSeconds, 5 * 60);

  const usage = await getAgentCommandUsage(wallet, budget, now + (6 * 60 * 1000) + 1);
  assert.equal(usage.usedSeconds, 0);
  assert.equal(usage.reservedSeconds, 0);
  assert.equal(usage.remainingSeconds, 20 * 60);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL,
  DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI,
  formatMferGptTokenAmountWei,
  getAgentSeason0MferGptGateStatus,
  makeAgentSeason0MferGptGateMessage,
  makeUncheckedAgentSeason0MferGptGateStatus,
  readAgentSeason0MferGptMinBalanceWei,
} from "./agentMferGptGate.js";

const VALID_WALLET = "0x1111111111111111111111111111111111111111";
const DEFAULT_REQUIRED_WEI = BigInt(DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI);

test("agent MFERGPT earning gate defaults to 25M", () => {
  assert.equal(readAgentSeason0MferGptMinBalanceWei({}).toString(), DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI);
  assert.equal(formatMferGptTokenAmountWei(DEFAULT_REQUIRED_WEI), AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL);
});

test("agent MFERGPT earning gate can be disabled explicitly", async () => {
  const status = await getAgentSeason0MferGptGateStatus(
    VALID_WALLET,
    { MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI: "0" },
    async () => {
      throw new Error("should not read balance when disabled");
    },
  );
  assert.equal(status.eligible, true);
  assert.equal(status.reason, "disabled");
  assert.equal(status.requiredWei, "0");
});

test("agent MFERGPT earning gate rejects insufficient balances", async () => {
  const status = await getAgentSeason0MferGptGateStatus(VALID_WALLET, {}, async () => DEFAULT_REQUIRED_WEI - 1n);
  assert.equal(status.eligible, false);
  assert.equal(status.reason, "insufficient");
  assert.equal(status.requiredLabel, "25M MFERGPT");
  assert.match(makeAgentSeason0MferGptGateMessage(status), /rewards inactive/);
});

test("agent MFERGPT earning gate accepts balances at or above threshold", async () => {
  const status = await getAgentSeason0MferGptGateStatus(VALID_WALLET, {}, async () => DEFAULT_REQUIRED_WEI);
  assert.equal(status.eligible, true);
  assert.equal(status.reason, "eligible");
  assert.equal(status.balanceLabel, "25M MFERGPT");
  assert.match(makeAgentSeason0MferGptGateMessage(status), /rewards active/);
});

test("agent MFERGPT earning gate fails closed for invalid wallets and unavailable checks", async () => {
  const invalid = await getAgentSeason0MferGptGateStatus("nope", {}, async () => DEFAULT_REQUIRED_WEI);
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.reason, "invalid_wallet");

  const unavailable = await getAgentSeason0MferGptGateStatus(VALID_WALLET, {}, async () => {
    throw new Error("rpc offline");
  });
  assert.equal(unavailable.eligible, false);
  assert.equal(unavailable.reason, "unavailable");
  assert.equal(unavailable.error, "rpc offline");
});

test("unchecked agent MFERGPT gate fails closed unless disabled", () => {
  const gated = makeUncheckedAgentSeason0MferGptGateStatus({});
  assert.equal(gated.eligible, false);
  assert.equal(gated.reason, "unavailable");

  const disabled = makeUncheckedAgentSeason0MferGptGateStatus({ MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI: "0" });
  assert.equal(disabled.eligible, true);
  assert.equal(disabled.reason, "disabled");
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveMferGptBurnPaymentConfig } from "./mferGptBurnPayments.js";

test("local-only MFERGPT payment config refuses Base RPC fallback", () => {
  assert.throws(
    () => resolveMferGptBurnPaymentConfig({
      MFERLAND_LOCAL_ONLY: "1",
    }),
    /non-local MFERGPT payment RPC host mainnet\.base\.org/,
  );
});

test("local-only MFERGPT payment config refuses production token address", () => {
  assert.throws(
    () => resolveMferGptBurnPaymentConfig({
      MFERLAND_LOCAL_ONLY: "1",
      MFERLAND_MFERGPT_PAYMENT_RPC_URL: "http://127.0.0.1:8545",
    }),
    /requires a local MFERGPT token address/,
  );
});

test("local-only MFERGPT payment config accepts local Anvil token config", () => {
  const config = resolveMferGptBurnPaymentConfig({
    MFERLAND_LOCAL_ONLY: "1",
    MFERLAND_MFERGPT_PAYMENT_RPC_URL: "http://127.0.0.1:8545",
    MFERLAND_MFERGPT_TOKEN_ADDRESS: "0x1111111111111111111111111111111111111111",
    MFERLAND_MFERGPT_BURN_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  });

  assert.equal(config.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(config.tokenAddress, "0x1111111111111111111111111111111111111111");
  assert.equal(config.burnAddress, "0x000000000000000000000000000000000000dead");
});

import assert from "node:assert/strict";
import test from "node:test";
import { MFERGPT_BASE_CHAIN_ID, MFERGPT_BASE_TOKEN_ADDRESS, MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS } from "@mferland/shared";
import { buildAgentMferGptSwapQuote, buildAgentMferGptSwapResult } from "./agentMferGptSwapTool.js";

const WALLET = "0x0000000000000000000000000000000000000abc";

test("agent MFERGPT swap quote builds a Base Universal Router transaction", async () => {
  const quote = await buildAgentMferGptSwapQuote({
    walletAddress: WALLET,
    amountEth: "0.01",
    slippageBps: 500,
    priceNativeWei: "1000000000",
    nowSeconds: 1_800_000_000,
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.walletAddress, WALLET);
  assert.equal(quote.chainId, MFERGPT_BASE_CHAIN_ID);
  assert.equal(quote.outputToken.address, MFERGPT_BASE_TOKEN_ADDRESS);
  assert.equal(quote.transaction.to, MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS);
  assert.equal(quote.transaction.valueWei, "10000000000000000");
  assert.equal(quote.transaction.deadline, String(1_800_000_000 + 20 * 60));
  assert.match(quote.transaction.data, /^0x[0-9a-f]+$/i);
  assert.match(quote.fallbackUrl, /app\.uniswap\.org/);
});

test("agent MFERGPT swap result accepts a submitted tx hash", () => {
  const result = buildAgentMferGptSwapResult({
    walletAddress: WALLET,
    txHash: `0x${"1".repeat(64)}`,
    amountEth: "0.01",
    receivedWei: "123",
    commandId: "cmd1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.walletAddress, WALLET);
  assert.equal(result.chainId, MFERGPT_BASE_CHAIN_ID);
  assert.equal(result.receivedWei, "123");
  assert.equal(result.commandId, "cmd1");
});

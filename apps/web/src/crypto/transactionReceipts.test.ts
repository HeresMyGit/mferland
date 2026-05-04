import assert from "node:assert/strict";
import test from "node:test";
import { type EthereumProvider, waitForTransactionReceipt } from "./transactionReceipts";

test("returns a successful transaction receipt", async () => {
  const provider = receiptProvider([{ status: "0x1", transactionHash: "0xabc" }]);

  const receipt = await waitForTransactionReceipt(provider, "0xabc", { sleep: noSleep });

  assert.deepEqual(receipt, { status: "0x1", transactionHash: "0xabc" });
});

test("throws when a transaction receipt is reverted", async () => {
  const provider = receiptProvider([{ status: "0x0", transactionHash: "0xabc" }]);

  await assert.rejects(
    () => waitForTransactionReceipt(provider, "0xabc", { sleep: noSleep }),
    /transaction reverted/,
  );
});

test("polls until a receipt is available", async () => {
  const provider = receiptProvider([null, null, { status: "0x1", transactionHash: "0xabc" }]);

  const receipt = await waitForTransactionReceipt(provider, "0xabc", { maxAttempts: 3, sleep: noSleep });

  assert.deepEqual(receipt, { status: "0x1", transactionHash: "0xabc" });
});

test("times out when no receipt arrives", async () => {
  const provider = receiptProvider([null, null]);

  await assert.rejects(
    () => waitForTransactionReceipt(provider, "0xabc", { maxAttempts: 2, sleep: noSleep }),
    /transaction receipt timed out/,
  );
});

function receiptProvider(receipts: unknown[]): EthereumProvider {
  let index = 0;
  return {
    async request({ method, params }) {
      assert.equal(method, "eth_getTransactionReceipt");
      assert.deepEqual(params, ["0xabc"]);
      const receipt = receipts[index] ?? null;
      index += 1;
      return receipt;
    },
  };
}

async function noSleep() {}

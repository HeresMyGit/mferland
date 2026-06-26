import assert from "node:assert/strict";
import test from "node:test";
import { executeFishingPondClaim } from "./fishingPond";
import type { EthereumProvider } from "./transactionReceipts";
import type { FishingNftClaimVoucher } from "@mferland/shared";

const ACCOUNT = "0x1000000000000000000000000000000000000001";
const POND = "0x2000000000000000000000000000000000000002";
const COLLECTION = "0x3000000000000000000000000000000000000003";
const TX_HASH = "0xabc0000000000000000000000000000000000000000000000000000000000000";

test("preflights claim calldata before asking wallet to send", async () => {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const provider = makeProvider(calls, {
    eth_call: "0x",
    eth_sendTransaction: TX_HASH,
    eth_getTransactionReceipt: { status: "0x1", transactionHash: TX_HASH },
  });

  const txHash = await executeFishingPondClaim(provider, ACCOUNT, makeVoucher());

  assert.equal(txHash, TX_HASH);
  assert.deepEqual(calls.map((call) => call.method), [
    "eth_requestAccounts",
    "wallet_switchEthereumChain",
    "eth_call",
    "eth_sendTransaction",
    "eth_getTransactionReceipt",
  ]);

  const callParams = calls.find((call) => call.method === "eth_call")?.params;
  const sendParams = calls.find((call) => call.method === "eth_sendTransaction")?.params;
  assert.ok(Array.isArray(callParams));
  assert.ok(Array.isArray(sendParams));
  assert.deepEqual(callParams[0], sendParams[0]);
  assert.equal(callParams[1], "latest");
  assert.equal((callParams[0] as { from?: string }).from, ACCOUNT);
  assert.equal((callParams[0] as { to?: string }).to, POND);
  assert.equal((callParams[0] as { value?: string }).value, "0x0");
  assert.match(String((callParams[0] as { data?: string }).data), /^0x[0-9a-f]+$/i);
});

test("does not request wallet transaction when claim preflight fails", async () => {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const provider = makeProvider(calls, {
    eth_call: new Error("execution reverted: VoucherExpired"),
  });

  await assert.rejects(
    () => executeFishingPondClaim(provider, ACCOUNT, makeVoucher()),
    /claim voucher expired/,
  );

  assert.deepEqual(calls.map((call) => call.method), [
    "eth_requestAccounts",
    "wallet_switchEthereumChain",
    "eth_call",
  ]);
});

test("rejects connected wallet mismatch before claim preflight", async () => {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const provider = makeProvider(calls, {});

  await assert.rejects(
    () => executeFishingPondClaim(provider, "0x4000000000000000000000000000000000000004", makeVoucher()),
    /connected wallet changed/,
  );

  assert.deepEqual(calls.map((call) => call.method), ["eth_requestAccounts"]);
});

function makeVoucher(): FishingNftClaimVoucher {
  return {
    catchId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    fisher: ACCOUNT,
    tokenStandard: 1,
    standard: "ERC721",
    collection: COLLECTION,
    tokenId: "123",
    amount: "1",
    pondEntryId: "9",
    expiresAt: 1_800_000_000,
    chainId: 8453,
    verifyingContract: POND,
    signature: `0x${"22".repeat(65)}`,
  };
}

function makeProvider(
  calls: Array<{ method: string; params?: unknown[] }>,
  responses: Partial<Record<string, unknown>>,
): EthereumProvider {
  return {
    async request({ method, params }) {
      calls.push({ method, params });
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "wallet_switchEthereumChain") return null;
      const response = responses[method];
      if (response instanceof Error) throw response;
      return response ?? null;
    },
  };
}

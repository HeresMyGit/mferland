import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exportLocalContractAddresses, extractLocalContractAddresses } from "./export-local-addresses-core.mjs";

const sampleBroadcast = {
  transactions: [
    create("MferCoin", "0x2222222222222222222222222222222222222222"),
    create("MferGptToken", "0x3333333333333333333333333333333333333333"),
    create("LocalMferGptSwapRouter", "0x8888888888888888888888888888888888888888"),
    create("MferGearNFT", "0x4444444444444444444444444444444444444444"),
    create("MferPricing", "0x5555555555555555555555555555555555555555"),
    create("MferLaunchPass", "0x6666666666666666666666666666666666666666"),
    create("FishingPond", "0x9999999999999999999999999999999999999999"),
    create("MferGearStore", "0x7777777777777777777777777777777777777777"),
  ],
};

test("extracts local token, NFT, pricing, and store addresses in deploy order", () => {
  assert.deepEqual(extractLocalContractAddresses(sampleBroadcast), {
    mfer: "0x2222222222222222222222222222222222222222",
    mfergpt: "0x3333333333333333333333333333333333333333",
    swapRouter: "0x8888888888888888888888888888888888888888",
    gear: "0x4444444444444444444444444444444444444444",
    pricing: "0x5555555555555555555555555555555555555555",
    launchPass: "0x6666666666666666666666666666666666666666",
    fishingPond: "0x9999999999999999999999999999999999999999",
    store: "0x7777777777777777777777777777777777777777",
  });
});

test("writes app-facing local contract JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mferland-chain-export-"));
  const broadcastPath = join(dir, "run-latest.json");
  const outputPath = join(dir, "public", "crypto", "local-contracts.json");
  await writeFile(broadcastPath, JSON.stringify(sampleBroadcast), "utf8");

  const exported = await exportLocalContractAddresses({
    broadcastPath,
    outputPath,
    generatedAt: "2026-05-02T00:00:00.000Z",
  });
  const written = JSON.parse(await readFile(outputPath, "utf8"));

  assert.deepEqual(written, exported);
  assert.equal(written.chainId, 31337);
  assert.equal(written.chainName, "mferland local");
  assert.equal(written.rpcUrl, "http://127.0.0.1:8545");
  assert.deepEqual(written.nativeCurrency, { name: "Anvil ETH", symbol: "ETH", decimals: 18 });
  assert.equal(written.generatedAt, "2026-05-02T00:00:00.000Z");
  assert.equal(written.addresses.pricing, "0x5555555555555555555555555555555555555555");
  assert.equal(written.addresses.swapRouter, "0x8888888888888888888888888888888888888888");
  assert.equal(written.addresses.launchPass, "0x6666666666666666666666666666666666666666");
  assert.equal(written.addresses.fishingPond, "0x9999999999999999999999999999999999999999");
  assert.equal(written.addresses.store, "0x7777777777777777777777777777777777777777");
});

test("fails when a broadcast does not include the complete local suite", () => {
  assert.throws(
    () => extractLocalContractAddresses({ transactions: [create("MferCoin", "0x2222222222222222222222222222222222222222")] }, "partial"),
    /Could not find all local contracts in partial/,
  );
});

function create(contractName, contractAddress) {
  return { transactionType: "CREATE", contractName, contractAddress };
}

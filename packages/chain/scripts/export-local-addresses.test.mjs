import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { exportLocalContractAddresses, extractLocalContractAddresses } from "./export-local-addresses-core.mjs";

const sampleBroadcast = {
  transactions: [
    create("MferGold", "0x1111111111111111111111111111111111111111"),
    create("MferCoin", "0x2222222222222222222222222222222222222222"),
    create("MferGptToken", "0x3333333333333333333333333333333333333333"),
    create("MferGearNFT", "0x4444444444444444444444444444444444444444"),
    create("QuestRewardDistributor", "0x5555555555555555555555555555555555555555"),
    create("MferGearStore", "0x6666666666666666666666666666666666666666"),
  ],
};

test("extracts local token, NFT, rewards, and store addresses in deploy order", () => {
  assert.deepEqual(extractLocalContractAddresses(sampleBroadcast), {
    gold: "0x1111111111111111111111111111111111111111",
    mfer: "0x2222222222222222222222222222222222222222",
    mfergpt: "0x3333333333333333333333333333333333333333",
    gear: "0x4444444444444444444444444444444444444444",
    rewards: "0x5555555555555555555555555555555555555555",
    store: "0x6666666666666666666666666666666666666666",
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
  assert.equal(written.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(written.generatedAt, "2026-05-02T00:00:00.000Z");
  assert.equal(written.addresses.store, "0x6666666666666666666666666666666666666666");
});

test("fails when a broadcast does not include the complete local suite", () => {
  assert.throws(
    () => extractLocalContractAddresses({ transactions: [create("MferGold", "0x1111111111111111111111111111111111111111")] }, "partial"),
    /Could not find all local contracts in partial/,
  );
});

function create(contractName, contractAddress) {
  return { transactionType: "CREATE", contractName, contractAddress };
}

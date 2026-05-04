import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function extractLocalContractAddresses(document, sourceLabel = "broadcast") {
  const creates = document.transactions?.filter((transaction) => transaction.transactionType === "CREATE") ?? [];
  const gold = creates.find((transaction) => transaction.contractName === "MferGold");
  const mfer = creates.find((transaction) => transaction.contractName === "MferCoin");
  const mfergpt = creates.find((transaction) => transaction.contractName === "MferGptToken");
  const gear = creates.find((transaction) => transaction.contractName === "MferGearNFT");
  const rewards = creates.find((transaction) => transaction.contractName === "QuestRewardDistributor");
  const launchPass = creates.find((transaction) => transaction.contractName === "MferLaunchPass");
  const store = creates.find((transaction) => transaction.contractName === "MferGearStore");

  if (!gold || !mfer || !mfergpt || !gear || !rewards || !launchPass || !store) {
    throw new Error(`Could not find all local contracts in ${sourceLabel}`);
  }

  return {
    gold: gold.contractAddress,
    mfer: mfer.contractAddress,
    mfergpt: mfergpt.contractAddress,
    gear: gear.contractAddress,
    rewards: rewards.contractAddress,
    launchPass: launchPass.contractAddress,
    store: store.contractAddress,
  };
}

export async function exportLocalContractAddresses({
  broadcastPath,
  outputPath,
  chainId = 31337,
  rpcUrl = "http://127.0.0.1:8545",
  generatedAt = new Date().toISOString(),
}) {
  const document = JSON.parse(await readFile(broadcastPath, "utf8"));
  const addresses = extractLocalContractAddresses(document, broadcastPath);
  const exported = { chainId, rpcUrl, generatedAt, addresses };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exported, null, 2)}\n`);
  return exported;
}

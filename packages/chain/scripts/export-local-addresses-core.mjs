import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function extractLocalContractAddresses(document, sourceLabel = "broadcast") {
  const creates = document.transactions?.filter((transaction) => transaction.transactionType === "CREATE") ?? [];
  const mfer = creates.find((transaction) => transaction.contractName === "MferCoin");
  const mfergpt = creates.find((transaction) => transaction.contractName === "MferGptToken");
  const swapRouter = creates.find((transaction) => transaction.contractName === "LocalMferGptSwapRouter");
  const gear = creates.find((transaction) => transaction.contractName === "MferGearNFT");
  const pricing = creates.find((transaction) => transaction.contractName === "MferPricing");
  const launchPass = creates.find((transaction) => transaction.contractName === "MferLaunchPass");
  const fishingPond = creates.find((transaction) => transaction.contractName === "FishingPond");
  const store = creates.find((transaction) => transaction.contractName === "MferGearStore");

  if (!mfer || !mfergpt || !swapRouter || !gear || !pricing || !launchPass || !fishingPond || !store) {
    throw new Error(`Could not find all local contracts in ${sourceLabel}`);
  }

  return {
    mfer: mfer.contractAddress,
    mfergpt: mfergpt.contractAddress,
    swapRouter: swapRouter.contractAddress,
    gear: gear.contractAddress,
    pricing: pricing.contractAddress,
    launchPass: launchPass.contractAddress,
    fishingPond: fishingPond.contractAddress,
    store: store.contractAddress,
  };
}

export async function exportLocalContractAddresses({
  broadcastPath,
  outputPath,
  chainId = 31337,
  chainName = "mferland local",
  rpcUrl = "http://127.0.0.1:8545",
  generatedAt = new Date().toISOString(),
}) {
  const document = JSON.parse(await readFile(broadcastPath, "utf8"));
  const addresses = extractLocalContractAddresses(document, broadcastPath);
  const exported = {
    chainId,
    chainName,
    rpcUrl,
    nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
    generatedAt,
    addresses,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exported, null, 2)}\n`);
  return exported;
}

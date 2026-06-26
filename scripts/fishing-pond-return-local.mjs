import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localContractsPath = resolve(repoRoot, "apps/web/public/crypto/local-contracts.json");
const localRpcUrl = "http://127.0.0.1:8545";
const anvilDefaultPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const fishingPondAbi = parseAbi([
  "function MAX_RETURN_BATCH_SIZE() view returns (uint256)",
  "function activeEntryCount() view returns (uint256)",
  "function activeEntryIdAt(uint256) view returns (uint256)",
  "function collectionEntryCount(address) view returns (uint256)",
  "function collectionEntryIdAt(address,uint256) view returns (uint256)",
  "function entries(uint256) view returns (uint8 standard,address collection,uint256 tokenId,uint256 remainingAmount,address depositor,uint8 status)",
  "function returnDeposits(uint256[])",
  "function adminReturnDeposits(uint256[])",
  "function returnCollectionDeposits(address,uint256,uint256)",
  "function adminReturnCollectionDeposits(address,uint256,uint256)",
  "function pause()",
  "function setMigrationTarget(address)",
  "function migrateDeposits(uint256[])",
  "function migrateCollectionDeposits(address,uint256,uint256)",
]);

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const rpcUrl = stringArg("rpc", process.env.FISHING_POND_RPC_URL || localRpcUrl);
const pondAddress = getAddress(stringArg("pond", process.env.FISHING_POND_ADDRESS || await readLocalPondAddress()));
const mode = stringArg("mode", args.collection ? "collection" : args.ids ? "ids" : "all");
const send = Boolean(args.send);
const admin = Boolean(args.admin);
const pauseFirst = Boolean(args.pause);
const migrationTarget = args["migrate-to"] ? getAddress(stringArg("migrate-to", "")) : "";
const account = privateKeyToAccount(stringArg("private-key", process.env.FISHING_POND_PRIVATE_KEY || anvilDefaultPrivateKey));
const publicClient = createPublicClient({ transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
const walletClient = createWalletClient({
  account,
  chain: {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  },
  transport: http(rpcUrl),
});
const maxBatchSize = Number(await publicClient.readContract({
  address: pondAddress,
  abi: fishingPondAbi,
  functionName: "MAX_RETURN_BATCH_SIZE",
}));

let plan;
if (mode === "ids") {
  const ids = parseEntryIds(stringArg("ids", ""));
  plan = {
    mode,
    admin,
    migrationTarget,
    chunks: chunk(ids, maxBatchSize),
    entries: await describeEntryIds(ids),
  };
} else if (mode === "collection") {
  const collection = getAddress(stringArg("collection", ""));
  const start = numberArg("start", 0);
  const configuredLimit = optionalNumberArg("limit");
  const collectionCount = Number(await publicClient.readContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "collectionEntryCount",
    args: [collection],
  }));
  const limit = configuredLimit ?? Math.max(0, collectionCount - start);
  if (configuredLimit !== null) assert.ok(limit > 0, "collection return limit must be positive");
  const ids = limit > 0 ? await readCollectionEntryIds(collection, start, limit) : [];
  plan = {
    mode,
    admin,
    migrationTarget,
    collection,
    start,
    limit,
    collectionCount,
    chunks: chunk(ids, maxBatchSize),
    entries: await describeEntryIds(ids),
  };
} else if (mode === "all") {
  const ids = await readActiveEntryIds();
  plan = {
    mode,
    admin,
    migrationTarget,
    chunks: chunk(ids, maxBatchSize),
    entries: await describeEntryIds(ids),
  };
} else {
  throw new Error(`unknown --mode ${mode}`);
}

if (!send) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    pondAddress,
    maxBatchSize,
    migration: Boolean(migrationTarget),
    migrationRequiresPausedPond: Boolean(migrationTarget),
    ...plan,
  }, null, 2));
  process.exit(0);
}

const txHashes = [];
if (migrationTarget) {
  if (pauseFirst) {
    const pauseTxHash = await walletClient.writeContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: "pause",
    });
    await publicClient.waitForTransactionReceipt({ hash: pauseTxHash });
    txHashes.push(pauseTxHash);
  }
  const targetTxHash = await walletClient.writeContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "setMigrationTarget",
    args: [migrationTarget],
  });
  await publicClient.waitForTransactionReceipt({ hash: targetTxHash });
  txHashes.push(targetTxHash);
}

if (mode === "collection" && plan.chunks.length > 0) {
  const collectionFunctionName = migrationTarget
    ? "migrateCollectionDeposits"
    : admin
      ? "adminReturnCollectionDeposits"
      : "returnCollectionDeposits";
  for (let offset = 0; offset < plan.limit; offset += maxBatchSize) {
    const chunkLimit = Math.min(maxBatchSize, plan.limit - offset);
    const txHash = await walletClient.writeContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: collectionFunctionName,
      args: [plan.collection, BigInt(plan.start + offset), BigInt(chunkLimit)],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    txHashes.push(txHash);
  }
} else {
  const idsFunctionName = migrationTarget ? "migrateDeposits" : admin ? "adminReturnDeposits" : "returnDeposits";
  for (const entryIdChunk of plan.chunks) {
    if (entryIdChunk.length === 0) continue;
    const txHash = await walletClient.writeContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: idsFunctionName,
      args: [entryIdChunk.map(BigInt)],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    txHashes.push(txHash);
  }
}

console.log(JSON.stringify({
  ok: true,
  dryRun: false,
  pondAddress,
  maxBatchSize,
  migration: Boolean(migrationTarget),
  txHashes,
  ...plan,
}, null, 2));

async function readLocalPondAddress() {
  const localContracts = JSON.parse(await readFile(localContractsPath, "utf8"));
  return localContracts.addresses?.fishingPond || "";
}

async function readActiveEntryIds() {
  const count = Number(await publicClient.readContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "activeEntryCount",
  }));
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    ids.push(Number(await publicClient.readContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: "activeEntryIdAt",
      args: [BigInt(index)],
    })));
  }
  return ids;
}

async function readCollectionEntryIds(collection, start, limit) {
  const ids = [];
  for (let index = start; index < start + limit; index += 1) {
    try {
      ids.push(Number(await publicClient.readContract({
        address: pondAddress,
        abi: fishingPondAbi,
        functionName: "collectionEntryIdAt",
        args: [collection, BigInt(index)],
      })));
    } catch {
      break;
    }
  }
  return ids;
}

async function describeEntryIds(ids) {
  return Promise.all(ids.map(async (id) => {
    const [standard, collection, tokenId, remainingAmount, depositor, status] = await publicClient.readContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: "entries",
      args: [BigInt(id)],
    });
    return {
      pondEntryId: id,
      standard: standard === 1 ? "ERC721" : standard === 2 ? "ERC1155" : "Unknown",
      collection,
      tokenId: tokenId.toString(),
      remainingAmount: remainingAmount.toString(),
      depositor,
      status: status === 1
        ? "Active"
        : status === 2
          ? "Claimed"
          : status === 3
            ? "Returned"
            : status === 4
              ? "Migrated"
              : "Unknown",
    };
  }));
}

function parseEntryIds(value) {
  const ids = String(value)
    .split(",")
    .map((raw) => Number(raw.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  assert.ok(ids.length > 0, "--ids must include at least one positive entry id");
  return ids;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function stringArg(name, fallback) {
  const value = args[name] ?? fallback;
  assert.ok(typeof value === "string" && value.length > 0, `missing --${name}`);
  return value;
}

function numberArg(name, fallback) {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  assert.ok(Number.isInteger(value) && value >= 0, `--${name} must be a non-negative integer`);
  return value;
}

function optionalNumberArg(name) {
  if (args[name] === undefined) return null;
  const value = Number(args[name]);
  assert.ok(Number.isInteger(value) && value >= 0, `--${name} must be a non-negative integer`);
  return value;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/fishing-pond-return-local.mjs --mode ids --ids 1,2,3 [--admin] [--send]
  node scripts/fishing-pond-return-local.mjs --mode collection --collection 0x... [--start 0] [--limit 50] [--admin] [--send]
  node scripts/fishing-pond-return-local.mjs --mode all [--admin] [--send]
  node scripts/fishing-pond-return-local.mjs --mode ids --ids 1,2 --migrate-to 0x... [--pause] [--send]
  node scripts/fishing-pond-return-local.mjs --mode collection --collection 0x... --migrate-to 0x... [--pause] [--send]
  node scripts/fishing-pond-return-local.mjs --mode all --migrate-to 0x... [--pause] [--send]

Defaults read apps/web/public/crypto/local-contracts.json and local Anvil.
Omit --send for a dry run.
Use --admin for adminReturn* functions; without --admin, the pond must already be in drain mode.
Use --migrate-to for paused admin migration to a reviewed importer/new pond target. Add --pause to pause first.
`);
}

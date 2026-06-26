import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FISHING_ZONE, FISHING_ZONE_ID, ROOM_NAME } from "@mferland/shared";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localRpcUrl = "http://127.0.0.1:8545";
const localChainId = 31337;
const smokeServerPort = process.env.FISHING_POND_SMOKE_SERVER_PORT || "2568";
let smokeDbPort = process.env.FISHING_POND_SMOKE_DB_PORT || "";
const serverBaseUrl = process.env.FISHING_POND_SMOKE_SERVER_URL || `http://127.0.0.1:${smokeServerPort}`;
const serverHealthUrl = `${serverBaseUrl}/health`;
const wsServerUrl = serverBaseUrl.replace(/^http/, "ws");
const localContractsPath = resolve(repoRoot, "apps/web/public/crypto/local-contracts.json");
const anvilDefaultPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const anvilAgentPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const anvilAllowlistTesterPrivateKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const fisherAccount = privateKeyToAccount(anvilDefaultPrivateKey);
const agentAccount = privateKeyToAccount(anvilAgentPrivateKey);
const allowlistTesterAccount = privateKeyToAccount(anvilAllowlistTesterPrivateKey);
const pondDailyWalletCap = 3;
const spawnedProcesses = [];
const managedLogs = new Map();

const fishingPondAbi = [
  {
    type: "function",
    name: "activeEntryCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activeEntryIdAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "entries",
    stateMutability: "view",
    inputs: [{ name: "pondEntryId", type: "uint256" }],
    outputs: [
      { name: "standard", type: "uint8" },
      { name: "collection", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "remainingAmount", type: "uint256" },
      { name: "depositor", type: "address" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "adminReturnCollectionDeposits",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "start", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "catchId", type: "bytes32" },
          { name: "fisher", type: "address" },
          { name: "standard", type: "uint8" },
          { name: "collection", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "pondEntryId", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

const erc721Abi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
];

const erc1155Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

try {
  await ensureChain();
  await run("npm", ["run", "chain:deploy:local"]);
  const smokeDatabaseUrl = process.env.FISHING_POND_SMOKE_DATABASE_URL || await startSmokeDatabase();

  const localContracts = JSON.parse(await readFile(localContractsPath, "utf8"));
  const pondAddress = localContracts.addresses?.fishingPond;
  assert.match(pondAddress, /^0x[0-9a-fA-F]{40}$/, "local FishingPond address missing");

  await run("npm", ["run", "stock:fishing:local", "-w", "@mferland/chain"], {
    FISHING_POND_ADDRESS: pondAddress,
  });
  await run("npm", ["run", "db:migrate", "-w", "@mferland/server"], {
    DATABASE_URL: smokeDatabaseUrl,
    MFERLAND_LOCAL_ONLY: "1",
  });

  const publicClient = createPublicClient({ transport: http(localRpcUrl) });
  const stockedCollections = await readStockedCollections(publicClient, pondAddress);
  const allowedCollection = stockedCollections.allowedCollection;
  const disallowedCollection = stockedCollections.disallowedCollection;
  assert.match(allowedCollection, /^0x[0-9a-fA-F]{40}$/, "allowed pond collection missing");
  assert.match(disallowedCollection, /^0x[0-9a-fA-F]{40}$/, "disallowed pond collection missing");
  assert.notEqual(allowedCollection.toLowerCase(), disallowedCollection.toLowerCase(), "allowlist smoke needs two collections");

  let serverProcess = await startServer(pondAddress, smokeDatabaseUrl, [allowedCollection]);
  const health = await fetchJson(serverHealthUrl);
  assert.equal(health.debugMessagesEnabled, true, "server must enable debug messages for smoke teleport");
  assert.equal(health.localDebugWalletAuthBypassEnabled, true, "server must allow the local debug wallet");

  const walletClient = createWalletClient({
    account: fisherAccount,
    chain: {
      id: localChainId,
      name: "mferland local",
      nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [localRpcUrl] } },
    },
    transport: http(localRpcUrl),
  });

  const roomClient = new Client(wsServerUrl);
  const room = await roomClient.joinOrCreate(ROOM_NAME, {
    name: "pond smoke",
    identityType: "wallet",
    walletAddress: fisherAccount.address,
    createCharacter: true,
  });
  const state = installRoomObservers(room);

  try {
    await waitFor(() => Boolean(state.self), "self snapshot", 8_000);
    await ensureFishingPole(room, state);
    await teleportToPond(room, state);

    const claimedCatches = [];
    for (let i = 0; i < pondDailyWalletCap; i += 1) {
      const nftResult = await fishUntilNft(room, state);
      const caught = nftResult.nftCatch;
      assert.ok(caught?.voucher, "NFT catch should include private claim voucher");
      assert.equal(
        caught.collection.toLowerCase(),
        allowedCollection.toLowerCase(),
        "allowlisted server should only issue vouchers for allowed collections",
      );
      assert.notEqual(
        caught.collection.toLowerCase(),
        disallowedCollection.toLowerCase(),
        "allowlisted server must not catch the disallowed collection",
      );
      assert.equal(caught.walletActionRequired, true, "NFT catch should require wallet action before claim");
      assert.equal(caught.contractAddress.toLowerCase(), pondAddress.toLowerCase(), "catch should target exported pond");
      assert.match(caught.metadata?.name || "", /^Local Pond (Prize|Stack) #/, "NFT catch should include metadata name");
      assert.match(caught.metadata?.description || "", /local mock ERC-(721|1155) prize/i, "NFT catch should include metadata description");
      assert.equal(caught.metadata?.image, "https://heads.mfers.dev/8292.png", "NFT catch should include metadata image");

      const txHash = await claimCaughtNft({
        publicClient,
        walletClient,
        pondAddress,
        catchSnapshot: caught,
      });
      const previousNftMessages = state.nftResults.length;
      room.send("submitFishingNftClaimTx", { catchId: caught.catchId, txHash });
      await waitFor(() => state.nftResults.slice(previousNftMessages).some((result) => (
        result.ok === true
        && result.catch?.catchId === caught.catchId
        && result.catch?.status === "confirmed"
      )), "server claim confirmation", 30_000);

      await assertClaimedOwnership(publicClient, caught, fisherAccount.address);
      claimedCatches.push({ catchId: caught.catchId, txHash });
    }

    const cappedResult = await fishOnce(room, state);
    assert.notEqual(cappedResult.outcome, "nft", "daily-capped player should fall back to normal fishing");
    await waitFor(() => state.chat.some((message) => (
      String(message.text || "").toLowerCase().includes("onchain goodies")
    )), "daily cap onchain goodies notice", 8_000);
    await waitFor(() => state.capNotices.some((notice) => (
      notice.kind === "wallet_daily_cap"
      && Number(notice.dailyResetAt) > 0
      && String(notice.text || "").toLowerCase().includes("onchain goodies")
    )), "daily cap popup notice payload", 8_000);

    console.log(JSON.stringify({
      ok: true,
      pondAddress,
      allowedCollection,
      disallowedCollection,
      claimedCatches,
      cappedOutcome: cappedResult.outcome,
    }, null, 2));
  } finally {
    await room.leave().catch(() => undefined);
  }

  await returnAllowedCollection({ publicClient, walletClient, pondAddress, allowedCollection });
  await stopManaged(serverProcess);
  serverProcess = await startServer(pondAddress, smokeDatabaseUrl, [allowedCollection, disallowedCollection]);

  const allowlistTesterWalletClient = createWalletClient({
    account: allowlistTesterAccount,
    chain: {
      id: localChainId,
      name: "mferland local",
      nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [localRpcUrl] } },
    },
    transport: http(localRpcUrl),
  });
  const allowlistRoom = await roomClient.joinOrCreate(ROOM_NAME, {
    name: "pond allowlist smoke",
    identityType: "wallet",
    walletAddress: allowlistTesterAccount.address,
    createCharacter: true,
    walletAuth: await makeWalletAuth(allowlistTesterAccount),
  });
  const allowlistState = installRoomObservers(allowlistRoom);
  try {
    await waitFor(() => Boolean(allowlistState.self), "allowlist self snapshot", 8_000);
    await ensureFishingPole(allowlistRoom, allowlistState);
    await teleportToPond(allowlistRoom, allowlistState);
    const nftResult = await fishUntilNft(allowlistRoom, allowlistState);
    const caught = nftResult.nftCatch;
    assert.ok(caught?.voucher, "expanded allowlist catch should include private claim voucher");
    assert.equal(
      caught.collection.toLowerCase(),
      disallowedCollection.toLowerCase(),
      "after allowlist expansion, the previously disallowed collection should be catchable",
    );
    const txHash = await claimCaughtNft({
      publicClient,
      walletClient: allowlistTesterWalletClient,
      pondAddress,
      catchSnapshot: caught,
    });
    allowlistRoom.send("submitFishingNftClaimTx", { catchId: caught.catchId, txHash });
    await waitFor(() => allowlistState.nftResults.some((result) => (
      result.ok === true
      && result.catch?.catchId === caught.catchId
      && result.catch?.status === "confirmed"
    )), "expanded allowlist claim confirmation", 30_000);
    await assertClaimedOwnership(publicClient, caught, allowlistTesterAccount.address);
    console.log(JSON.stringify({
      ok: true,
      allowlistExpanded: true,
      catchId: caught.catchId,
      collection: caught.collection,
      tokenId: caught.tokenId,
    }, null, 2));
  } finally {
    await allowlistRoom.leave().catch(() => undefined);
  }

  const agentRoom = await roomClient.joinOrCreate(ROOM_NAME, {
    name: "pond smoke agent",
    identityType: "wallet",
    walletAddress: agentAccount.address,
    createCharacter: true,
    agentClient: true,
    walletAuth: await makeWalletAuth(agentAccount),
  });
  const agentState = installRoomObservers(agentRoom);
  try {
    await waitFor(() => Boolean(agentState.self), "agent self snapshot", 8_000);
    assert.equal(agentState.self.isAgent, true, "agent smoke join should be declared as an agent");
    await ensureFishingPole(agentRoom, agentState);
    await teleportToPond(agentRoom, agentState);
    const agentFishingResult = await fishOnce(agentRoom, agentState);
    assert.ok(["caught", "junk", "missed", "expired", "nft"].includes(agentFishingResult.outcome), "agent should receive a valid fishing outcome");
    console.log(JSON.stringify({
      ok: true,
      agentFishing: true,
      outcome: agentFishingResult.outcome,
    }, null, 2));
  } finally {
    await agentRoom.leave().catch(() => undefined);
  }
} finally {
  for (const child of spawnedProcesses.reverse()) {
    child.kill();
  }
}

async function ensureChain() {
  if (await isChainLive()) return;
  spawnManaged("npm", ["run", "chain:node"], "anvil");
  await waitFor(isChainLive, "Anvil did not start", 30_000);
}

async function startSmokeDatabase() {
  smokeDbPort ||= String(await findAvailablePort());
  const rootDir = await mkdtemp(join(tmpdir(), "mferland-fishing-pond-db-"));
  const dataDir = join(rootDir, "data");
  await run("initdb", ["-D", dataDir, "--username", "mferland", "--auth=trust"]);
  spawnManaged("postgres", ["-D", dataDir, "-h", "127.0.0.1", "-p", smokeDbPort], "postgres");
  await waitFor(() => commandSucceeds("psql", [
    "-h", "127.0.0.1",
    "-p", smokeDbPort,
    "-U", "mferland",
    "-d", "postgres",
    "-c", "SELECT 1",
  ]), "local smoke Postgres", 30_000);
  await run("psql", [
    "-h", "127.0.0.1",
    "-p", smokeDbPort,
    "-U", "mferland",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-c", "CREATE DATABASE mferland_smoke",
  ]);
  return `postgresql://mferland@127.0.0.1:${smokeDbPort}/mferland_smoke`;
}

async function findAvailablePort() {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(port);
      });
    });
  });
}

async function startServer(pondAddress, databaseUrl, allowedCollections = []) {
  const child = spawnManaged(resolve(repoRoot, "node_modules/.bin/tsx"), ["src/index.ts"], "server", {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    HOST: "127.0.0.1",
    PORT: smokeServerPort,
    MFERLAND_ENABLE_DEBUG_MESSAGES: "1",
    MFERLAND_LOCAL_DEBUG_AUTH_BYPASS: "1",
    MFERLAND_DEBUG_TRASH_VENDOR_STOCK: "1",
    MFERLAND_ENABLE_INVITE_GATE: "0",
    MFERLAND_REQUIRE_INVITE: "0",
    MFERLAND_INVITE_CODE: "",
    MFERLAND_FISHING_POND_ENABLED: "true",
    MFERLAND_FISHING_POND_RPC_URL: localRpcUrl,
    MFERLAND_FISHING_POND_CHAIN_ID: String(localChainId),
    MFERLAND_FISHING_POND_CONTRACT_ADDRESS: pondAddress,
    MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY: anvilDefaultPrivateKey,
    MFERLAND_FISHING_POND_CATCH_CHANCE_BPS: "10000",
    MFERLAND_FISHING_POND_VOUCHER_TTL_SECONDS: "900",
    MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS: allowedCollections.join(","),
  }, resolve(repoRoot, "apps/server"));
  await waitFor(async () => Boolean(await fetchJson(serverHealthUrl).catch(() => null)), "server did not start", 45_000);
  return child;
}

async function commandSucceeds(command, args) {
  return await new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "ignore",
    });
    child.on("error", () => resolveCommand(false));
    child.on("exit", (code) => resolveCommand(code === 0));
  });
}

function installRoomObservers(room) {
  const observed = {
    self: null,
    chat: [],
    fishingResults: [],
    nftResults: [],
    historyResults: [],
    capNotices: [],
  };

  const updateSelf = (nextState) => {
    observed.self = parseSelf(nextState, room.sessionId);
  };
  room.onStateChange(updateSelf);
  updateSelf(room.state);

  room.onMessage("chat", (message) => {
    observed.chat.push(message);
  });
  room.onMessage("fishingResult", (message) => {
    observed.fishingResults.push(message);
  });
  room.onMessage("fishingNftCatchResult", (message) => {
    observed.nftResults.push(message);
  });
  room.onMessage("fishingNftHistoryResult", (message) => {
    observed.historyResults.push(message);
  });
  room.onMessage("fishingNftCapNotice", (message) => {
    observed.capNotices.push(message);
  });
  room.onMessage("closeLootWindow", () => undefined);
  room.onMessage("lootWindow", () => undefined);
  room.onMessage("persistenceStatus", () => undefined);
  room.onMessage("questOffer", () => undefined);
  room.onMessage("questStatus", () => undefined);
  room.onMessage("questTurnIn", () => undefined);

  return observed;
}

async function ensureFishingPole(room, state) {
  if (hasFishingPole(state.self)) return;
  room.send("acceptQuest", { questId: "fishin-lesson", npcId: "motherfisher" });
  await waitFor(() => hasFishingPole(state.self), "fishing pole or loaner pole", 8_000);
}

async function teleportToPond(room, state) {
  const x = FISHING_ZONE.x + FISHING_ZONE.waterRadius + 3.8;
  const z = FISHING_ZONE.z + 1.8;
  const yaw = Math.atan2(FISHING_ZONE.x - x, FISHING_ZONE.z - z);
  room.send("debugTeleport", { x, z, yaw });
  await waitFor(() => {
    const self = state.self;
    return Boolean(self && Math.hypot(self.x - x, self.z - z) < 0.75);
  }, "pond debug teleport", 8_000);
}

async function fishUntilNft(room, state) {
  let lastResult = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    lastResult = await fishOnce(room, state);
    if (lastResult.outcome === "nft") return lastResult;
  }
  throw new Error(`Expected NFT fishing outcome, last result was ${JSON.stringify(lastResult)}`);
}

async function fishOnce(room, state) {
  const previousResults = state.fishingResults.length;
  room.send("startFishing", { zoneId: FISHING_ZONE_ID });
  await waitFor(() => {
    const newest = state.fishingResults.at(-1);
    if (state.fishingResults.length > previousResults && newest?.ok === false) {
      throw new Error(newest.error || "start fishing failed");
    }
    return Boolean(state.self?.fishingAttemptId);
  }, "start fishing", 8_000);

  const attemptId = state.self.fishingAttemptId;
  await waitFor(() => state.self?.fishingState === "bite", "fishing bite", 35_000);
  room.send("reelFishing", { attemptId });
  await waitFor(() => state.fishingResults.length > previousResults, "fishing reel result", 10_000);

  const result = state.fishingResults.at(-1);
  assert.equal(result.ok, true, result.error || "fishing result should succeed");
  return result;
}

async function claimCaughtNft({ publicClient, walletClient, pondAddress, catchSnapshot }) {
  const voucher = catchSnapshot.voucher;
  const txHash = await walletClient.writeContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "claim",
    args: [
      {
        catchId: voucher.catchId,
        fisher: voucher.fisher,
        standard: voucher.tokenStandard,
        collection: voucher.collection,
        tokenId: BigInt(voucher.tokenId),
        amount: BigInt(voucher.amount),
        pondEntryId: BigInt(voucher.pondEntryId),
        expiresAt: BigInt(voucher.expiresAt),
        chainId: BigInt(voucher.chainId),
        verifyingContract: voucher.verifyingContract,
      },
      voucher.signature,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  assert.equal(receipt.status, "success", "FishingPond.claim transaction should succeed");
  return txHash;
}

async function readStockedCollections(publicClient, pondAddress) {
  const activeCount = Number(await publicClient.readContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "activeEntryCount",
  }));
  const entries = [];
  for (let index = 0; index < activeCount; index += 1) {
    const entryId = await publicClient.readContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: "activeEntryIdAt",
      args: [BigInt(index)],
    });
    const [standard, collection, tokenId, remainingAmount, depositor, status] = await publicClient.readContract({
      address: pondAddress,
      abi: fishingPondAbi,
      functionName: "entries",
      args: [entryId],
    });
    entries.push({
      entryId: entryId.toString(),
      standard: Number(standard),
      collection,
      tokenId: tokenId.toString(),
      remainingAmount: remainingAmount.toString(),
      depositor,
      status: Number(status),
    });
  }

  const activeEntries = entries.filter((entry) => entry.status === 1 && BigInt(entry.remainingAmount) > 0n);
  const allowedEntry = activeEntries.find((entry) => entry.tokenId === "9001");
  const disallowedEntry = activeEntries.find((entry) => entry.tokenId === "9101");
  assert.ok(allowedEntry, `allowed stock entry missing: ${JSON.stringify(activeEntries)}`);
  assert.ok(disallowedEntry, `disallowed stock entry missing: ${JSON.stringify(activeEntries)}`);
  return {
    entries: activeEntries,
    allowedCollection: allowedEntry.collection,
    disallowedCollection: disallowedEntry.collection,
  };
}

async function returnAllowedCollection({ publicClient, walletClient, pondAddress, allowedCollection }) {
  const txHash = await walletClient.writeContract({
    address: pondAddress,
    abi: fishingPondAbi,
    functionName: "adminReturnCollectionDeposits",
    args: [allowedCollection, 0n, 50n],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  assert.equal(receipt.status, "success", "admin return of allowed collection should succeed");
}

async function makeWalletAuth(account) {
  const challenge = await fetchJson(`${serverBaseUrl}/wallet-auth-challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address }),
  });
  assert.equal(challenge.ok, true, challenge.error || "wallet challenge should succeed");
  const signature = await account.signMessage({ message: challenge.message });
  return {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  };
}

async function assertClaimedOwnership(publicClient, catchSnapshot, expectedOwner) {
  if (catchSnapshot.standard === "ERC721") {
    const owner = await publicClient.readContract({
      address: catchSnapshot.collection,
      abi: erc721Abi,
      functionName: "ownerOf",
      args: [BigInt(catchSnapshot.tokenId)],
    });
    assert.equal(owner.toLowerCase(), expectedOwner.toLowerCase(), "fisher should own claimed ERC-721");
    return;
  }

  const balance = await publicClient.readContract({
    address: catchSnapshot.collection,
    abi: erc1155Abi,
    functionName: "balanceOf",
    args: [expectedOwner, BigInt(catchSnapshot.tokenId)],
  });
  assert.ok(balance >= BigInt(catchSnapshot.amount), "fisher should own claimed ERC-1155 amount");
}

function parseSelf(state, sessionId) {
  const players = schemaEntries(state?.players);
  const entry = players.find(([id]) => id === sessionId);
  if (!entry) return null;
  const value = entry[1];
  return {
    x: getNumber(value.x),
    z: getNumber(value.z),
    isAgent: Boolean(value.isAgent),
    fishingAttemptId: getString(parseJsonRecord(value.fishingJson).attemptId),
    fishingState: getString(parseJsonRecord(value.fishingJson).state),
    inventory: schemaEntries(value.inventory).map(([, item]) => ({
      id: getString(item.id),
      count: getNumber(item.count),
    })),
  };
}

function hasFishingPole(self) {
  return Boolean(self?.inventory.some((item) => (
    (item.id === "fishing-pole" || item.id === "loaner-fishing-pole")
    && item.count > 0
  )));
}

function schemaEntries(value) {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()].map(([key, entry]) => [String(key), asRecord(entry)]);
  if (typeof value.forEach === "function") {
    const rows = [];
    value.forEach((entry, key) => rows.push([String(key), asRecord(entry)]));
    return rows;
  }
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), asRecord(entry)]);
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => [key, asRecord(entry)]);
  return [];
}

function parseJsonRecord(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function getNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function isChainLive() {
  try {
    const client = createPublicClient({ transport: http(localRpcUrl) });
    return await client.getChainId() === localChainId;
  } catch {
    return false;
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitFor(predicate, label, timeoutMs = 30_000, intervalMs = 250) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error(`Timed out waiting for ${label}${formatManagedLogs()}`);
}

function spawnManaged(command, args, label, extraEnv = {}, cwd = repoRoot) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedProcesses.push(child);
  managedLogs.set(child, { label, lines: [] });
  const capture = (chunk) => {
    const log = managedLogs.get(child);
    if (!log) return;
    log.lines.push(String(chunk));
    if (log.lines.length > 40) log.lines.splice(0, log.lines.length - 40);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return child;
}

async function stopManaged(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise((resolveStop) => {
    const timeout = setTimeout(resolveStop, 8_000);
    child.on("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
  await waitFor(async () => !await fetchJson(serverHealthUrl).then(() => true).catch(() => false), "server stop", 10_000, 250);
}

async function run(command, args, extraEnv = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function formatManagedLogs() {
  const sections = [];
  for (const { label, lines } of managedLogs.values()) {
    if (lines.length > 0) sections.push(`\n\n${label} logs:\n${lines.join("")}`);
  }
  return sections.join("");
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createPublicClient, http, parseEther } from "viem";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buyer = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const treasury = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const localRpcUrl = "http://127.0.0.1:8545";
const webUrl = "http://127.0.0.1:5173/?cryptoSmoke=1";
const serverHealthUrl = "http://127.0.0.1:2567/health";
const spawnedProcesses = [];

const storeAbi = [
  {
    type: "function",
    name: "discountedTokenPrice",
    stateMutability: "view",
    inputs: [{ name: "gearType", type: "uint16" }, { name: "discountBps", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];
const gearAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "gear",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "gearType", type: "uint16" }, { name: "tier", type: "uint8" }],
  },
];
const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

try {
  await ensureLocalStack();
  await run("npm", ["run", "chain:deploy:local"]);

  const localContracts = JSON.parse(await readFile(resolve(repoRoot, "apps/web/public/crypto/local-contracts.json"), "utf8"));
  const addresses = localContracts.addresses;
  const client = createPublicClient({ transport: http(localRpcUrl) });

  await assertDiscount(client, addresses.store, 1, 1000n, "90");
  await assertDiscount(client, addresses.store, 1, 2500n, "75");
  await assertDiscount(client, addresses.store, 2, 1000n, "112.5");
  await assertDiscount(client, addresses.store, 2, 2500n, "93.75");
  await assertDiscount(client, addresses.store, 3, 1000n, "62.1");
  await assertDiscount(client, addresses.store, 3, 2500n, "51.75");

  const browser = await chromium.launch({
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
    headless: process.env.HEADLESS !== "0",
  });
  const consoleErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "deviceMemory", { value: 2, configurable: true });
      window.localStorage.setItem("mferland:settings:v1", JSON.stringify({
        audio: { enabled: false, volume: 0 },
        debugPlacementEditor: false,
        debugTravelPanel: true,
        debugUnlockAllMoves: false,
        nameplates: {
          localPlayer: true,
          otherPlayers: true,
          friendlyNpcs: true,
          unfriendlyNpcs: true,
        },
      }));
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    await waitForLoadingClear(page);
    await clickIfPresent(page.getByRole("button", { name: "local test wallet", exact: true }));
    await clickExactly(page.getByRole("button", { name: "enter as verified mfer", exact: true }));

    const dripButton = page.locator('button[title="Debug travel: Drip"]');
    await waitForEnabled(dripButton);
    await clickDebugTravel(dripButton, page.locator(".debug-travel-position"), "-12, 15");
    await page.keyboard.press("f");

    const dialog = page.getByRole("dialog", { name: "crypto store", exact: true });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await waitForAddressPrefill(dialog, "store", addresses.store);
    await waitForAddressPrefill(dialog, "gear nft", addresses.gear);
    await waitForAddressPrefill(dialog, "gold", addresses.gold);
    await waitForAddressPrefill(dialog, "$mfer", addresses.mfer);
    await waitForAddressPrefill(dialog, "$mfergpt", addresses.mfergpt);
    await waitForAddressPrefill(dialog, "rewards", addresses.rewards);
    await waitForAddressPrefill(dialog, "launch pass", addresses.launchPass);
    const balances = dialog.locator('[aria-label="wallet balances"]');
    await waitForBalance(balances, "$mfer", "1000000");
    await waitForBalance(balances, "$mfergpt", "1000000");

    await clickExactly(dialog.getByRole("button", { name: "ETH full", exact: true }));
    await waitForStatus(dialog, "buying with ETH confirmed");
    await assertGear(client, addresses.gear, 1n, 1n, 1n);

    await clickExactly(dialog.getByRole("button", { name: "road lid 0.012 ETH / 125 token", exact: true }));
    assert.equal(await dialog.getByLabel("gear", { exact: true }).inputValue(), "2");
    assert.equal(await dialog.getByLabel("ETH", { exact: true }).inputValue(), "0.012");
    await clickExactly(dialog.getByRole("button", { name: "$mfer -10%", exact: true }));
    await waitForStatus(dialog, "buying with $mfer confirmed");
    await assertGear(client, addresses.gear, 2n, 2n, 1n);
    assert.equal(await readErc20Balance(client, addresses.mfer, buyer), parseEther("999887.5"));
    assert.equal(await readErc20Balance(client, addresses.mfer, treasury), parseEther("112.5"));
    await waitForBalance(balances, "$mfer", "999887.5");

    await clickExactly(dialog.getByRole("button", { name: "lucky lighter 0.0069 ETH / 69 token", exact: true }));
    assert.equal(await dialog.getByLabel("gear", { exact: true }).inputValue(), "3");
    assert.equal(await dialog.getByLabel("ETH", { exact: true }).inputValue(), "0.0069");
    await clickExactly(dialog.getByRole("button", { name: "$mfergpt -25%", exact: true }));
    await waitForStatus(dialog, "buying with $mfergpt confirmed");
    await assertGear(client, addresses.gear, 3n, 3n, 1n);
    assert.equal(await readErc20Balance(client, addresses.mfergpt, buyer), parseEther("999948.25"));
    assert.equal(await readErc20Supply(client, addresses.mfergpt), parseEther("999948.25"));
    await waitForBalance(balances, "$mfergpt", "999948.25");

    await clickExactly(dialog.getByRole("button", { name: "grant test gold", exact: true }));
    await waitForStatus(dialog, "granting test gold confirmed");
    await dialog.getByLabel("token id", { exact: true }).fill("2");
    await clickExactly(dialog.getByRole("button", { name: "burn gold upgrade", exact: true }));
    await waitForGear(client, addresses.gear, 2n, 2n, 2n);
    await waitForStatus(dialog, "upgrading gear confirmed");
    await assertGear(client, addresses.gear, 2n, 2n, 2n);
    assert.equal(await readErc20Balance(client, addresses.gold, buyer), parseEther("200"));

    await clickExactly(dialog.getByRole("button", { name: "burn gold upgrade", exact: true }));
    await waitForGear(client, addresses.gear, 2n, 2n, 3n);
    await waitForStatus(dialog, "upgrading gear confirmed");
    await assertGear(client, addresses.gear, 2n, 2n, 3n);
    assert.equal(await readErc20Balance(client, addresses.gold, buyer), parseEther("75"));

    await clickExactly(dialog.getByRole("button", { name: "burn gold upgrade", exact: true }));
    await waitForStatus(dialog, "transaction reverted");
    await assertGear(client, addresses.gear, 2n, 2n, 3n);
    assert.equal(await readErc20Balance(client, addresses.gold, buyer), parseEther("75"));

    await clickExactly(dialog.getByRole("button", { name: "pass $mfergpt", exact: true }));
    await waitForStatus(dialog, "buying launch pass with $mfergpt confirmed");
    await assertOwner(client, addresses.launchPass, 1n, buyer);
    assert.equal(await readErc20Balance(client, addresses.mfergpt, buyer), parseEther("999258.25"));
    assert.equal(await readErc20Supply(client, addresses.mfergpt), parseEther("999258.25"));
    await waitForBalance(balances, "$mfergpt", "999258.25");

    await clickExactly(dialog.getByRole("button", { name: "Close store", exact: true }));
    const characterButton = page.getByRole("button", { name: "Character", exact: true });
    await clickExactly(characterButton);
    const character = page.getByRole("dialog", { name: "Character", exact: true });
    await character.waitFor({ state: "visible", timeout: 10_000 });
    await waitForEquipmentTooltip(character, "road lid", "T3 #2", "+23.2 HP, +1.7 STR");
    await waitForCharacterStat(character, "STR", "10.7");

    if (consoleErrors.length > 0) {
      throw new Error(`Browser console errors:\n${consoleErrors.join("\n")}`);
    }
  } finally {
    await browser.close();
  }

  console.log("Local crypto browser smoke passed");
} finally {
  for (const child of spawnedProcesses.reverse()) {
    child.kill();
  }
}

async function ensureLocalStack() {
  if (!await isChainLive()) {
    spawnManaged("npm", ["run", "chain:node"]);
    await waitUntil(isChainLive, "Anvil did not start");
  }

  const health = await fetchJson(serverHealthUrl).catch(() => null);
  if (!health) {
    spawnManaged("npm", ["run", "dev:server"]);
    await waitUntil(async () => Boolean(await fetchJson(serverHealthUrl).catch(() => null)), "server did not start");
  }
  const nextHealth = await fetchJson(serverHealthUrl);
  assert.equal(nextHealth.debugMessagesEnabled, true, "server must run with debug messages enabled for debug travel");

  if (!await isHttpOk(webUrl)) {
    spawnManaged("npm", ["run", "dev:web"]);
    await waitUntil(() => isHttpOk(webUrl), "web dev server did not start");
  }
}

function spawnManaged(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedProcesses.push(child);
  return child;
}

async function run(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: repoRoot, env: process.env, stdio: "inherit" });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function isChainLive() {
  try {
    const client = createPublicClient({ transport: http(localRpcUrl) });
    return await client.getChainId() === 31337;
  } catch {
    return false;
  }
}

async function isHttpOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitUntil(predicate, errorMessage) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(errorMessage);
}

async function clickIfPresent(locator) {
  if (await locator.count() === 1) await locator.click();
}

async function waitForLoadingClear(page) {
  await page.locator(".mfer-loading-screen").waitFor({ state: "hidden", timeout: 20_000 });
}

async function clickDebugTravel(button, position, expectedPosition) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickExactly(button);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      if (await position.innerText() === expectedPosition) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw new Error(`debug travel did not reach ${expectedPosition}; got ${await position.innerText()}`);
}

async function clickExactly(locator) {
  assert.equal(await locator.count(), 1);
  await waitForEnabled(locator);
  await locator.click({ force: true, noWaitAfter: true, timeout: 20_000 });
}

async function waitForEnabled(locator) {
  await locator.waitFor({ state: "visible", timeout: 60_000 });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (await locator.isEnabled()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("button never became enabled");
}

async function waitForStatus(dialog, expected) {
  const status = dialog.locator(".crypto-store-status");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (await status.innerText() === expected) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected status "${expected}", got "${await status.innerText()}"`);
}

async function waitForAddressPrefill(dialog, label, address) {
  const input = dialog.getByLabel(label, { exact: true });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if ((await input.inputValue()).toLowerCase() === address.toLowerCase()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert.equal((await input.inputValue()).toLowerCase(), address.toLowerCase());
}

async function waitForBalance(balancePanel, label, expected) {
  const startedAt = Date.now();
  const normalizedLabel = label.toLowerCase();
  while (Date.now() - startedAt < 10_000) {
    const text = await balancePanel.innerText();
    if (text.toLowerCase().includes(normalizedLabel) && text.includes(expected)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected ${label} balance ${expected}, got "${await balancePanel.innerText()}"`);
}

async function waitForEquipmentTooltip(character, itemName, tierLabel, statLabel) {
  const startedAt = Date.now();
  const selector = `button.equipment-slot[data-tooltip*="${itemName}"][data-tooltip*="${tierLabel}"][data-tooltip*="${statLabel}"]`;
  while (Date.now() - startedAt < 10_000) {
    if (await character.locator(selector).count() > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected ${itemName} ${tierLabel} stats in character gear`);
}

async function waitForCharacterStat(character, label, expectedValue) {
  const startedAt = Date.now();
  const stat = character.locator(".character-stat", { hasText: label }).filter({ hasText: expectedValue });
  while (Date.now() - startedAt < 10_000) {
    if (await stat.count() > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected character stat ${label} ${expectedValue}`);
}

async function assertDiscount(client, store, gearType, discountBps, expectedEther) {
  const value = await client.readContract({
    address: store,
    abi: storeAbi,
    functionName: "discountedTokenPrice",
    args: [gearType, discountBps],
  });
  assert.equal(value, parseEther(expectedEther));
}

async function assertGear(client, gearAddress, tokenId, expectedGearType, expectedTier) {
  const owner = await client.readContract({
    address: gearAddress,
    abi: gearAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  assert.equal(owner.toLowerCase(), buyer.toLowerCase());
  const [gearType, tier] = await client.readContract({
    address: gearAddress,
    abi: gearAbi,
    functionName: "gear",
    args: [tokenId],
  });
  assert.equal(BigInt(gearType), expectedGearType);
  assert.equal(BigInt(tier), expectedTier);
}

async function assertOwner(client, contractAddress, tokenId, expectedOwner) {
  const owner = await client.readContract({
    address: contractAddress,
    abi: gearAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  assert.equal(owner.toLowerCase(), expectedOwner.toLowerCase());
}

async function waitForGear(client, gearAddress, tokenId, expectedGearType, expectedTier) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 20_000) {
    try {
      await assertGear(client, gearAddress, tokenId, expectedGearType, expectedTier);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw lastError ?? new Error("gear state did not update");
}

async function readErc20Balance(client, token, account) {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

async function readErc20Supply(client, token) {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "totalSupply",
  });
}

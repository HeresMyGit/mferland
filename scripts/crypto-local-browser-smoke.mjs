import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createPublicClient, http } from "viem";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buyer = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const treasury = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const burnAddress = "0x000000000000000000000000000000000000dEaD";
const localRpcUrl = "http://127.0.0.1:8545";
const traitChangeProductId = "0x691801e90154d786163fb37c5503cafde0bc6f5a2411d53ca8609e222017e6f4";
const defaultSmokeWebPort = process.env.CRYPTO_SMOKE_WEB_PORT || "5174";
const webUrl = process.env.CRYPTO_SMOKE_WEB_URL || `http://127.0.0.1:${defaultSmokeWebPort}/?cryptoSmoke=1`;
const smokeWebPort = new URL(webUrl).port || defaultSmokeWebPort;
const serverBaseUrl = process.env.CRYPTO_SMOKE_SERVER_URL || "http://127.0.0.1:2567";
const serverHealthUrl = process.env.CRYPTO_SMOKE_SERVER_HEALTH_URL || `${serverBaseUrl}/health`;
const spawnedProcesses = [];

const storeAbi = [
  {
    type: "function",
    name: "ethPriceByGearType",
    stateMutability: "view",
    inputs: [{ name: "gearType", type: "uint16" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "discountedTokenPrice",
    stateMutability: "view",
    inputs: [{ name: "gearType", type: "uint16" }, { name: "discountBps", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];
const launchPassAbi = [
  {
    type: "function",
    name: "ethPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mferPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mferGptPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
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
const pricingAbi = [
  {
    type: "function",
    name: "getProductPrice",
    stateMutability: "view",
    inputs: [{ name: "productId", type: "bytes32" }],
    outputs: [
      { name: "ethPrice", type: "uint256" },
      { name: "mferPrice", type: "uint256" },
      { name: "mferGptPrice", type: "uint256" },
      { name: "updatedAt", type: "uint64" },
    ],
  },
];

try {
  process.env.MFERLAND_MARKET_QUOTE_INTERVAL_MS = "60000";
  process.env.MFERLAND_ENABLE_CRYPTO_STORE = "1";
  process.env.MFERLAND_CRYPTO_SMOKE_AUTH_BYPASS = "1";
  process.env.VITE_SERVER_URL = serverBaseUrl;
  process.env.VITE_CRYPTO_CONTRACTS_URL = "/crypto/local-contracts.json";
  process.env.VITE_ENABLE_CRYPTO_STORE = "1";
  process.env.VITE_REQUIRE_INVITE = "0";
  process.env.MFERLAND_INVITE_CODE = "";
  await ensureLocalStack();
  await run("npm", ["run", "chain:deploy:local"]);

  const localContracts = JSON.parse(await readFile(resolve(repoRoot, "apps/web/public/crypto/local-contracts.json"), "utf8"));
  const addresses = localContracts.addresses;
  const client = createPublicClient({ transport: http(localRpcUrl) });

  const pricingRefresh = JSON.parse(await runCapture("npm", ["--silent", "run", "pricing:refresh:market"]));
  assert.equal(pricingRefresh.ok, true, "market quote refresh should succeed");
  assert.equal(pricingRefresh.pricing?.disabled, false, "contract pricing updater should run against local contracts");
  assert.equal(pricingRefresh.pricing?.errors?.length ?? 0, 0, "contract pricing update should not error");
  assert.ok((pricingRefresh.pricing?.checked ?? 0) > 0, "live quote refresh should check local contract prices");
  assert.ok(
    (pricingRefresh.pricing?.updated?.length ?? 0) + (pricingRefresh.pricing?.skipped?.length ?? 0) > 0,
    "live quote refresh should update or intentionally skip local contract prices",
  );

  const initialMferBalance = await readErc20Balance(client, addresses.mfer, buyer);
  const initialMferGptBalance = await readErc20Balance(client, addresses.mfergpt, buyer);
  const initialMferTreasury = await readErc20Balance(client, addresses.mfer, treasury);
  const initialMferGptSupply = await readErc20Supply(client, addresses.mfergpt);
  const initialMferGptBurnBalance = await readErc20Balance(client, addresses.mfergpt, burnAddress);

  const gearOneEthPrice = await readGearEthPrice(client, addresses.store, 1);
  const gearTwoMferPrice = await readGearTokenPrice(client, addresses.store, 2, 1000n);
  const gearThreeMferGptPrice = await readGearTokenPrice(client, addresses.store, 3, 2500n);
  const passEthPrice = await readLaunchPassPrice(client, addresses.launchPass, "ethPrice");
  const passMferPrice = await readLaunchPassPrice(client, addresses.launchPass, "mferPrice");
  const passMferGptPrice = await readLaunchPassPrice(client, addresses.launchPass, "mferGptPrice");
  const traitPrice = await readTraitPrice(client, addresses.pricing);
  const freeTraitName = "free traits mfer";
  const paidTraitPrompt = "burn 25M $MFERGPT to save another set";

  assert.ok(gearOneEthPrice > 0n);
  assert.ok(gearTwoMferPrice > 0n);
  assert.ok(gearThreeMferGptPrice > 0n);
  assert.ok(passEthPrice > 0n);
  assert.ok(passMferPrice > 0n);
  assert.ok(passMferGptPrice > 0n);
  assert.ok(traitPrice.ethPrice > 0n);
  assert.ok(traitPrice.mferPrice > 0n);
  assert.ok(traitPrice.mferGptPrice > 0n);

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
    await clickWalletEntry(page);

    const cryptoButton = page.locator('button[title="Debug travel: Crypto"]');
    try {
      await waitForEnabled(cryptoButton);
    } catch (error) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage text:\n${bodyText}\nConsole errors:\n${consoleErrors.join("\n")}`);
    }
    await clickDebugTravel(cryptoButton, page.locator(".debug-travel-position"), "4, 22");
    await pressInteractKey(page);

    const dialog = page.getByRole("dialog", { name: "crypto store", exact: true });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await clickExactly(dialog.locator('button[aria-controls="crypto-store-panel-contracts"]'));
    await waitForAddressPrefill(dialog, "store", addresses.store);
    await waitForAddressPrefill(dialog, "gear nft", addresses.gear);
    await waitForAddressPrefill(dialog, "pricing", addresses.pricing);
    await waitForAddressPrefill(dialog, "$mfer", addresses.mfer);
    await waitForAddressPrefill(dialog, "$mfergpt", addresses.mfergpt);
    await waitForAddressPrefill(dialog, "launch pass", addresses.launchPass);
    await clickExactly(dialog.locator('button[aria-controls="crypto-store-panel-market"]'));
    await waitForMarketQuote(dialog, "$mfer/WETH");
    await waitForMarketQuote(dialog, "MFERGPT/WETH");
    await clickExactly(dialog.locator('button[aria-controls="crypto-store-panel-pass"]'));
    await waitForContractPrice(dialog, "launch pass prices", formatUiUnits(passMferPrice));
    await clickExactly(dialog.locator('button[aria-controls="crypto-store-panel-gear"]'));
    await waitForGearPrice(dialog, formatUiUnits(gearOneEthPrice));
    await waitForStoreGearStats(dialog, "posted-up deck", ["STR", "HP"]);
    const balances = dialog.locator('[aria-label="wallet balances"]');
    await waitForBalance(balances, "$mfer", formatUiUnits(initialMferBalance));
    await waitForBalance(balances, "$mfergpt", formatUiUnits(initialMferGptBalance));
    await waitForBalance(balances, "season pass", "none");

    await clickExactly(dialog.getByRole("button", { name: "buy ETH", exact: true }));
    await waitForStatus(dialog, "buying with ETH confirmed");
    await assertGear(client, addresses.gear, 1n, 1n, 1n);
    await waitForChat(page, "Verified gear token #1");

    await clickExactly(dialog.locator('button[title="posted-up laptop lid"]'));
    assert.equal(await dialog.getByRole("textbox", { name: "gear", exact: true }).inputValue(), "2");
    assert.equal(await dialog.getByRole("textbox", { name: "ETH", exact: true }).inputValue(), "0.012");
    await waitForStoreGearStats(dialog, "posted-up laptop lid", ["HP", "STR"]);
    await clickExactly(dialog.getByRole("button", { name: "buy $mfer -10%", exact: true }));
    await waitForStatus(dialog, "buying with $mfer confirmed");
    await assertGear(client, addresses.gear, 2n, 2n, 1n);
    await waitForChat(page, "Verified gear token #2");
    assert.equal(await readErc20Balance(client, addresses.mfer, buyer), initialMferBalance - gearTwoMferPrice);
    assert.equal(await readErc20Balance(client, addresses.mfer, treasury), initialMferTreasury + gearTwoMferPrice);
    await waitForBalance(balances, "$mfer", formatUiUnits(initialMferBalance - gearTwoMferPrice));

    await clickExactly(dialog.locator('button[title="last-cig lighter"]'));
    assert.equal(await dialog.getByRole("textbox", { name: "gear", exact: true }).inputValue(), "3");
    assert.equal(await dialog.getByRole("textbox", { name: "ETH", exact: true }).inputValue(), "0.0069");
    await clickExactly(dialog.getByRole("button", { name: "buy $mfergpt -25%", exact: true }));
    await waitForStatus(dialog, "buying with $mfergpt confirmed");
    await assertGear(client, addresses.gear, 3n, 3n, 1n);
    await waitForChat(page, "Verified gear token #3");
    assert.equal(await readErc20Balance(client, addresses.mfergpt, buyer), initialMferGptBalance - gearThreeMferGptPrice);
    assert.equal(await readErc20Balance(client, addresses.mfergpt, burnAddress), initialMferGptBurnBalance + gearThreeMferGptPrice);
    assert.equal(await readErc20Supply(client, addresses.mfergpt), initialMferGptSupply);
    await waitForBalance(balances, "$mfergpt", formatUiUnits(initialMferGptBalance - gearThreeMferGptPrice));

    await clickExactly(dialog.getByRole("button", { name: "Show season pass", exact: true }));
    await clickExactly(dialog.getByRole("button", { name: "mint ETH", exact: true }));
    await waitForStatus(dialog, "buying launch pass with ETH confirmed");
    await assertOwner(client, addresses.launchPass, 1n, buyer);
    await waitForBalance(balances, "season pass", "1 owned");

    const mferBalanceBeforePass = await readErc20Balance(client, addresses.mfer, buyer);
    const mferTreasuryBeforePass = await readErc20Balance(client, addresses.mfer, treasury);
    const selectedPassMferPrice = await readLaunchPassPrice(client, addresses.launchPass, "mferPrice");
    await clickExactly(dialog.getByRole("button", { name: "mint $mfer", exact: true }));
    await waitForStatus(dialog, "buying launch pass with $mfer confirmed");
    await assertOwner(client, addresses.launchPass, 2n, buyer);
    const postPassMferBalance = await readErc20Balance(client, addresses.mfer, buyer);
    const postPassMferTreasury = await readErc20Balance(client, addresses.mfer, treasury);
    assert.equal(postPassMferBalance, mferBalanceBeforePass - selectedPassMferPrice);
    assert.equal(postPassMferTreasury, mferTreasuryBeforePass + selectedPassMferPrice);
    await waitForBalance(balances, "$mfer", formatUiUnits(postPassMferBalance));

    const mferGptBalanceBeforePass = await readErc20Balance(client, addresses.mfergpt, buyer);
    const mferGptBurnBeforePass = await readErc20Balance(client, addresses.mfergpt, burnAddress);
    const selectedPassMferGptPrice = await readLaunchPassPrice(client, addresses.launchPass, "mferGptPrice");
    await clickExactly(dialog.getByRole("button", { name: "mint $mfergpt", exact: true }));
    await waitForStatus(dialog, "buying launch pass with $mfergpt confirmed");
    await assertOwner(client, addresses.launchPass, 3n, buyer);
    const postPassMferGptBalance = await readErc20Balance(client, addresses.mfergpt, buyer);
    const postPassMferGptBurnBalance = await readErc20Balance(client, addresses.mfergpt, burnAddress);
    assert.equal(
      postPassMferGptBalance,
      mferGptBalanceBeforePass - selectedPassMferGptPrice,
    );
    assert.equal(
      postPassMferGptBurnBalance,
      mferGptBurnBeforePass + selectedPassMferGptPrice,
    );
    assert.equal(await readErc20Supply(client, addresses.mfergpt), initialMferGptSupply);
    await waitForBalance(balances, "$mfergpt", formatUiUnits(postPassMferGptBalance));

    await clickExactly(dialog.getByRole("button", { name: "Close store", exact: true }));

    const traitsButton = page.locator('button[title="Debug travel: Traits"]');
    await clickDebugTravel(traitsButton, page.locator(".debug-travel-position"), "-4, 24");
    await pressInteractKey(page);
    const traits = await openTraitsDialog(page);
    if (await traits.getByRole("button", { name: "save free set", exact: true }).count() === 1) {
      await traits.getByRole("textbox", { name: "character name", exact: true }).fill(freeTraitName);
      await clickExactly(traits.getByRole("button", { name: "random", exact: true }));
      await clickExactly(traits.getByRole("button", { name: "save free set", exact: true }));
      await waitForHudName(page, freeTraitName);
      await waitForWalletProfileName(freeTraitName);
    }
    await traits.getByRole("button", { name: "save for 25M $MFERGPT", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await clickExactly(traits.getByRole("button", { name: "random", exact: true }));
    await waitForTraitStatus(traits, paidTraitPrompt);
    assert.equal(await readErc20Balance(client, addresses.mfer, buyer), postPassMferBalance);
    assert.equal(await readErc20Balance(client, addresses.mfer, treasury), postPassMferTreasury);
    await assertNoTraitError(traits);
    await clickExactly(traits.getByRole("button", { name: "Close traits", exact: true }));

    const characterButton = page.getByRole("button", { name: "Character", exact: true });
    await clickExactly(characterButton);
    const character = page.getByRole("dialog", { name: "Character", exact: true });
    await character.waitFor({ state: "visible", timeout: 10_000 });
    const characterTabs = character.locator('.character-tabs button[role="tab"]');
    if (await characterTabs.count() > 0) {
      await clickExactly(characterTabs.nth(0));
      await character.locator(".character-layout").waitFor({ state: "visible", timeout: 10_000 });
    }
    await waitForEquipmentSlot(character, "posted-up laptop lid", "T1 #2", ["HP", "STR"]);
    await waitForCharacterStat(character, "Season Pass", "owned");
    await waitForCharacterStat(character, "STR", "10");

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
  assert.equal(
    nextHealth.cryptoSmokeWalletAuthBypassEnabled,
    true,
    "server must run with MFERLAND_CRYPTO_SMOKE_AUTH_BYPASS=1 for the local mock wallet smoke",
  );
  assert.equal(
    nextHealth.cryptoStoreEnabled,
    true,
    "server must run with MFERLAND_ENABLE_CRYPTO_STORE=1 for the local crypto store smoke",
  );

  if (!await isHttpOk(webUrl)) {
    spawnManaged("npm", [
      "run",
      "dev",
      "-w",
      "@mferland/web",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      smokeWebPort,
      "--strictPort",
    ]);
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

async function runCapture(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr}`));
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

async function pressInteractKey(page) {
  await page.keyboard.down("f");
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  await page.keyboard.up("f");
}

async function clickWalletEntry(page) {
  const enterVerified = page.getByRole("button", { name: "enter as verified mfer", exact: true });
  const createVerified = page.getByRole("button", { name: "create verified mfer", exact: true });
  const continueSaved = page.getByRole("button", { name: "continue saved mfer", exact: true });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (await enterVerified.count() === 1) {
      await clickExactly(enterVerified);
      return;
    }
    if (await createVerified.count() === 1) {
      await clickExactly(createVerified);
      return;
    }
    if (await continueSaved.count() === 1) {
      await clickExactly(continueSaved);
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("verified wallet entry button did not appear");
}

async function clickExactly(locator) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 30_000) {
    try {
      assert.equal(await locator.count(), 1);
      await waitForEnabled(locator, 5_000);
      await locator.click({ force: true, noWaitAfter: true, timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw lastError ?? new Error("click target did not stabilize");
}

async function waitForEnabled(locator, timeoutMs = 60_000) {
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
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
  const input = dialog.getByRole("textbox", { name: label, exact: true });
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
    const tooltips = await getTooltipText(balancePanel);
    if (
      text.toLowerCase().includes(normalizedLabel)
      && (text.includes(expected) || tooltips.includes(expected))
    ) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected ${label} balance ${expected}, got "${await balancePanel.innerText()}" and tooltips "${await getTooltipText(balancePanel)}"`);
}

async function waitForMarketQuote(dialog, label) {
  const startedAt = Date.now();
  const marketQuotes = dialog.locator('[aria-label="market quotes"]');
  const normalizedLabel = label.toUpperCase();
  while (Date.now() - startedAt < 10_000) {
    const text = await marketQuotes.innerText();
    if (text.toUpperCase().includes(normalizedLabel) && text.includes("ETH") && !text.includes("--")) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected market quote ${label}, got "${await marketQuotes.innerText()}"`);
}

async function waitForChat(page, expected) {
  const startedAt = Date.now();
  const chatLog = page.locator(".chat-log");
  while (Date.now() - startedAt < 30_000) {
    const text = await chatLog.innerText();
    if (text.includes(expected)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected chat to include "${expected}", got "${await chatLog.innerText()}"`);
}

async function waitForContractPrice(dialog, label, expected) {
  const startedAt = Date.now();
  const prices = dialog.locator(`[aria-label="${label}"]`);
  while (Date.now() - startedAt < 10_000) {
    const text = await prices.innerText();
    const tooltips = await getTooltipText(prices);
    if ((text.includes(expected) || tooltips.includes(expected)) && !text.includes("--")) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected ${label} to include ${expected}, got "${await prices.innerText()}" and tooltips "${await getTooltipText(prices)}"`);
}

async function waitForGearPrice(dialog, expected) {
  const startedAt = Date.now();
  const input = dialog.getByRole("textbox", { name: "ETH", exact: true });
  while (Date.now() - startedAt < 10_000) {
    if (await input.inputValue() === expected) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected selected gear ETH price ${expected}, got "${await input.inputValue()}"`);
}

async function waitForStoreGearStats(dialog, itemName, expectedStats) {
  const startedAt = Date.now();
  const stats = dialog.locator(".crypto-store-stat-card");
  await stats.waitFor({ state: "visible", timeout: 10_000 });
  while (Date.now() - startedAt < 10_000) {
    const text = await stats.innerText();
    const tooltips = `${await stats.getAttribute("data-tooltip") ?? ""}\n${await getTooltipText(stats)}`;
    const combined = `${text}\n${tooltips}`;
    if (combined.includes(itemName) && expectedStats.every((stat) => combined.includes(stat))) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  const tooltips = `${await stats.getAttribute("data-tooltip") ?? ""}\n${await getTooltipText(stats)}`;
  throw new Error(`Expected ${itemName} stats ${expectedStats.join(", ")}, got "${await stats.innerText()}" and tooltips "${tooltips}"`);
}

async function getTooltipText(locator) {
  return locator.locator("[data-tooltip]").evaluateAll((nodes) => nodes
    .map((node) => node.getAttribute("data-tooltip") || "")
    .join("\n"));
}

async function waitForEquipmentSlot(character, itemName, tierLabel, statLabels = []) {
  const startedAt = Date.now();
  const slots = character.locator("button.equipment-slot");
  while (Date.now() - startedAt < 30_000) {
    const hasSlot = await slots.evaluateAll((buttons, [expectedItemName, expectedTierLabel, expectedStatLabels]) => {
      return buttons.some((button) => {
        const tooltip = button.getAttribute("data-tooltip") || button.textContent || "";
        const lowerTooltip = tooltip.toLowerCase();
        return lowerTooltip.includes(String(expectedItemName).toLowerCase())
          && tooltip.includes(String(expectedTierLabel))
          && Array.isArray(expectedStatLabels)
          && expectedStatLabels.every((statLabel) => tooltip.includes(String(statLabel)));
      });
    }, [itemName, tierLabel, statLabels]);
    if (hasSlot) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected ${itemName} ${tierLabel} in character gear, got "${await character.innerText()}"`);
}

async function waitForTraitStatus(traits, expected) {
  const startedAt = Date.now();
  const status = traits.locator(".traits-status");
  const normalizedExpected = expected.toLowerCase();
  while (Date.now() - startedAt < 30_000) {
    if ((await status.innerText()).toLowerCase().includes(normalizedExpected)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected traits status "${expected}", got "${await status.innerText()}"`);
}

async function waitForHudName(page, expectedName) {
  const startedAt = Date.now();
  const name = page.locator(".player-card .player-name-row strong");
  while (Date.now() - startedAt < 30_000) {
    if (await name.innerText() === expectedName) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected HUD name "${expectedName}", got "${await name.innerText()}"`);
}

async function waitForWalletProfileName(expectedName) {
  const url = new URL("/wallet-character", serverBaseUrl);
  url.searchParams.set("wallet", buyer);
  const startedAt = Date.now();
  let lastProfile = null;
  while (Date.now() - startedAt < 30_000) {
    const response = await fetch(url, { cache: "no-store" });
    const cacheControl = response.headers.get("cache-control") ?? "";
    assert.ok(cacheControl.includes("no-store"), "wallet character profile response must not be cached");
    if (response.ok) {
      lastProfile = await response.json();
      if (lastProfile?.character?.name === expectedName) return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Expected wallet profile name "${expectedName}", got ${JSON.stringify(lastProfile)}`);
}

async function assertNoTraitError(traits) {
  const text = (await traits.locator(".traits-status").innerText()).toLowerCase();
  if (/(failed|required|mismatch|unavailable|missing|talk to|invalid)/.test(text)) {
    throw new Error(`Unexpected traits status "${text}"`);
  }
}

async function openTraitsDialog(page) {
  const acceptQuest = page.getByTestId("quest-accept-button");
  const traits = page.getByRole("dialog", { name: "traits", exact: true });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    if (await traits.count() === 1 && await traits.isVisible()) return traits;
    if (await acceptQuest.count() === 1 && await acceptQuest.isVisible()) {
      await clickExactly(acceptQuest);
      await traits.waitFor({ state: "visible", timeout: 10_000 });
      return traits;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`traits dialog did not open; page text:\n${await page.locator("body").innerText().catch(() => "")}`);
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

async function readGearEthPrice(client, store, gearType) {
  return client.readContract({
    address: store,
    abi: storeAbi,
    functionName: "ethPriceByGearType",
    args: [gearType],
  });
}

async function readGearTokenPrice(client, store, gearType, discountBps) {
  return client.readContract({
    address: store,
    abi: storeAbi,
    functionName: "discountedTokenPrice",
    args: [gearType, discountBps],
  });
}

async function readLaunchPassPrice(client, launchPass, functionName) {
  return client.readContract({
    address: launchPass,
    abi: launchPassAbi,
    functionName,
  });
}

async function readTraitPrice(client, pricing) {
  const [ethPrice, mferPrice, mferGptPrice, updatedAt] = await client.readContract({
    address: pricing,
    abi: pricingAbi,
    functionName: "getProductPrice",
    args: [traitChangeProductId],
  });
  return { ethPrice, mferPrice, mferGptPrice, updatedAt };
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
    abi: launchPassAbi,
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

function formatUiUnits(value, decimals = 18, maxFractionDigits = 4) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n || maxFractionDigits <= 0) return whole.toString();

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

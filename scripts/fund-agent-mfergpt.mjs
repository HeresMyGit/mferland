import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { encodeFunctionData, parseAbi, toHex } from "viem";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_FUNDER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const DEFAULT_TOKEN_WEI = "30000000000000000000000000";
const DEFAULT_NATIVE_WEI = "1000000000000000000";
const ERC20_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const { values } = parseArgs({
  options: {
    "wallet-file": { type: "string", default: ".tmp/agent-wallets-llm.json" },
    "contracts-file": { type: "string", default: "apps/web/public/crypto/local-contracts.json" },
    "rpc-url": { type: "string" },
    from: { type: "string", default: DEFAULT_FUNDER },
    "token-wei": { type: "string", default: DEFAULT_TOKEN_WEI },
    "native-wei": { type: "string", default: DEFAULT_NATIVE_WEI },
  },
  allowPositionals: false,
});

const contracts = await readContracts(values["contracts-file"]);
const rpcUrl = String(values["rpc-url"] || contracts.rpcUrl || "").trim();
assertLocalRpc(rpcUrl);
await assertLocalChain(rpcUrl);

const tokenAddress = normalizeAddress(contracts.addresses?.mfergpt);
if (!tokenAddress) throw new Error("local contracts file is missing addresses.mfergpt");

const wallets = await readWalletAddresses(values["wallet-file"]);
if (wallets.length === 0) throw new Error("wallet file has no wallet addresses");

const from = normalizeAddress(values.from);
if (!from) throw new Error("--from must be an address from the unlocked local Anvil account list");

const tokenWei = parsePositiveBigInt(values["token-wei"], "--token-wei");
const nativeWei = parsePositiveBigInt(values["native-wei"], "--native-wei");

for (const wallet of wallets) {
  if (nativeWei > 0n) {
    const nativeTx = await rpc(rpcUrl, "eth_sendTransaction", [{
      from,
      to: wallet.address,
      value: toHex(nativeWei),
    }]);
    await waitForReceipt(rpcUrl, nativeTx);
  }

  if (tokenWei > 0n) {
    const tokenTx = await rpc(rpcUrl, "eth_sendTransaction", [{
      from,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [wallet.address, tokenWei],
      }),
    }]);
    await waitForReceipt(rpcUrl, tokenTx);
  }

  console.log(`Funded ${wallet.label}: ${wallet.address} with ${nativeWei.toString()} wei ETH and ${tokenWei.toString()} wei MFERGPT`);
}

async function readContracts(path) {
  const filePath = resolve(path);
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readWalletAddresses(path) {
  const filePath = resolve(path);
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.wallets) ? parsed.wallets : [];
  return entries.map((entry, index) => {
    const address = normalizeAddress(typeof entry === "string" ? entry : entry?.address);
    if (!address) throw new Error(`wallet ${index + 1} has no valid address`);
    const label = typeof entry?.label === "string" && entry.label.trim() ? entry.label.trim() : `wallet-${index + 1}`;
    return { label, address };
  });
}

function assertLocalRpc(rpcUrl) {
  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error("RPC URL must be a valid local URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("RPC URL must use http or https");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Refusing non-local RPC host ${parsed.hostname}`);
  }
}

async function assertLocalChain(rpcUrl) {
  const chainId = await rpc(rpcUrl, "eth_chainId", []);
  if (chainId !== "0x7a69") {
    throw new Error(`Refusing non-Anvil chain id ${chainId}; expected 0x7a69`);
  }
}

async function waitForReceipt(rpcUrl, txHash) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`transaction ${txHash} failed`);
      return receipt;
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for transaction ${txHash}`);
}

async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `${method} failed`);
  }
  return payload.result;
}

function normalizeAddress(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function parsePositiveBigInt(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a positive integer string`);
  return BigInt(text);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

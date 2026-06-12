import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const envPath = process.env.MFERLAND_SIGNER_ENV_FILE
  ? resolve(process.cwd(), process.env.MFERLAND_SIGNER_ENV_FILE)
  : resolve(import.meta.dirname, ".env.generated-wallet");

const privateKey = readPrivateKey(envPath);
const account = privateKeyToAccount(privateKey);
const request = JSON.parse(await readStdin());

if (request.version !== 1) fail("unsupported signer request version");

const requestedWallet = String(request.walletAddress || "").toLowerCase();
if (requestedWallet && requestedWallet !== account.address.toLowerCase()) {
  fail(`wallet mismatch: signer controls ${account.address}`);
}

if (request.action === "signMessage") {
  const message = String(request.message || "");
  if (!message) fail("missing message");
  const signature = await account.signMessage({ message });
  console.log(JSON.stringify({ signature }));
} else if (request.action === "sendTransaction") {
  if (process.env.MFERLAND_SIGNER_ALLOW_TRANSACTIONS !== "1") {
    fail("transaction signing is disabled for this disposable signer");
  }
  fail("transaction signing is not implemented for this disposable signer");
} else {
  fail(`unsupported signer action: ${String(request.action || "")}`);
}

function readPrivateKey(path) {
  if (!existsSync(path)) fail(`missing signer env file: ${path}`);
  const contents = readFileSync(path, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split("=");
    if (key.trim() !== "AGENT_PRIVATE_KEY") continue;
    const value = rest.join("=").trim();
    if (/^0x[a-fA-F0-9]{64}$/.test(value)) return value;
  }
  fail(`AGENT_PRIVATE_KEY not found in ${path}`);
}

function readStdin() {
  return new Promise((resolveInput, rejectInput) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      resolveInput(input);
    });
    process.stdin.on("error", rejectInput);
  });
}

function fail(message) {
  console.log(JSON.stringify({ error: message }));
  process.exit(0);
}

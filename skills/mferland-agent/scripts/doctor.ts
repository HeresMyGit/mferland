import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Check = {
  ok: boolean;
  name: string;
  detail: string;
};

loadDotEnvFile();

const checks: Check[] = [];
const roomServer = cleanEnv("ROOM_SERVER") || "wss://game.mfergpt.lol";
const httpServer = cleanEnv("HTTP_SERVER") || toHttpServer(roomServer);
const authEndpoint = cleanEnv("AUTH_ENDPOINT") || "/wallet-auth-challenge";
const catalogEndpoint = cleanEnv("AGENT_CATALOG_ENDPOINT") || "/agent-catalog";
const privateKey = cleanEnv("AGENT_PRIVATE_KEY");
const signerCommand = cleanEnv("AGENT_SIGNER_COMMAND");
const signerTimeoutMs = readNumberEnv("AGENT_SIGNER_TIMEOUT_MS") || 120_000;
const configuredWalletAddress = normalizeAddress(cleanEnv("AGENT_WALLET_ADDRESS"));
const allowProduction = cleanEnv("AGENT_ALLOW_PRODUCTION") === "1";
const agentName = cleanEnv("AGENT_NAME") || "mfer-agent";
const localRun = isLoopbackUrl(roomServer) || isLoopbackUrl(httpServer) || cleanEnv("MFERLAND_AGENT_LOCAL_ONLY") === "1";

let walletAddress = "";
let privateKeySigner: ReturnType<typeof privateKeyToAccount> | null = null;

checks.push({
  ok: Boolean(agentName),
  name: "agent name",
  detail: agentName ? `using ${agentName}` : "AGENT_NAME is empty",
});

if (/game\.mfergpt\.lol/i.test(roomServer) && !allowProduction) {
  checks.push({
    ok: false,
    name: "production guard",
    detail: "set AGENT_ALLOW_PRODUCTION=1 before connecting to game.mfergpt.lol",
  });
} else {
  checks.push({
    ok: true,
    name: "production guard",
    detail: allowProduction ? "production explicitly allowed" : "not targeting production",
  });
}

if (privateKey && !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  checks.push({
    ok: false,
    name: "private key",
    detail: "AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte key",
  });
} else if (privateKey && !localRun) {
  checks.push({
    ok: false,
    name: "private key",
    detail: "AGENT_PRIVATE_KEY is local-test only; use AGENT_WALLET_ADDRESS plus AGENT_SIGNER_COMMAND for production",
  });
} else if (privateKey) {
  privateKeySigner = privateKeyToAccount(privateKey as `0x${string}`);
  walletAddress = privateKeySigner.address;
  checks.push({
    ok: true,
    name: "local test private key",
    detail: `derived disposable/local wallet ${walletAddress}`,
  });
} else if (configuredWalletAddress) {
  walletAddress = configuredWalletAddress;
  checks.push({
    ok: true,
    name: "wallet address",
    detail: `using ${walletAddress}`,
  });
} else {
  checks.push({
    ok: false,
    name: "wallet address",
    detail: "set AGENT_WALLET_ADDRESS for production signing, or AGENT_PRIVATE_KEY for local loopback testing",
  });
}

if (!privateKey && !signerCommand) {
  checks.push({
    ok: false,
    name: "signer command",
    detail: "set AGENT_SIGNER_COMMAND so the wallet can sign auth messages and transactions",
  });
} else if (signerCommand) {
  checks.push({
    ok: true,
    name: "signer command",
    detail: "configured",
  });
}

const health = await fetchJson(joinUrl(httpServer, "/health"));
checks.push({
  ok: health.ok && health.body?.ok === true,
  name: "health endpoint",
  detail: health.ok ? `reachable at ${joinUrl(httpServer, "/health")}` : health.error,
});

const catalog = await fetchJson(joinUrl(httpServer, catalogEndpoint));
checks.push({
  ok: catalog.ok && catalog.body?.ok === true,
  name: "agent catalog",
  detail: catalog.ok
    ? `reachable; heal cooldown ${catalog.body?.combatActions?.heal?.cooldownMs ?? "unknown"}ms`
    : catalog.error,
});

if (walletAddress) {
  const challenge = await fetchJson(joinUrl(httpServer, authEndpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  checks.push({
    ok: challenge.ok && typeof challenge.body?.nonce === "string" && typeof challenge.body?.message === "string",
    name: "wallet auth challenge",
    detail: challenge.ok ? `challenge returned for ${walletAddress}` : challenge.error,
  });
  if (challenge.ok && typeof challenge.body?.message === "string") {
    const signCheck = await signChallengeForDoctor({
      message: challenge.body.message,
      walletAddress,
      privateKeySigner,
      signerCommand,
      signerTimeoutMs,
    });
    checks.push(signCheck);
  }
}

for (const check of checks) {
  const mark = check.ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${check.name}: ${check.detail}`);
}

if (walletAddress) {
  console.log(`viewer: ${makeAgentGameViewerUrl(cleanEnv("AGENT_GAME_VIEWER_URL") || defaultAgentGameViewerUrl(roomServer), walletAddress)}`);
}

if (checks.some((check) => !check.ok)) process.exit(1);

function loadDotEnvFile() {
  const configuredPath = process.env.AGENT_ENV_FILE?.trim();
  const envPath = configuredPath ? resolve(process.cwd(), configuredPath) : resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    if (configuredPath) throw new Error(`AGENT_ENV_FILE does not exist: ${envPath}`);
    return;
  }
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalized.slice(0, equalsIndex).trim();
    if (key === "BANKR_API_KEY") {
      throw new Error("Do not put BANKR_API_KEY in the mferland .env file. Native Bankr agents should use platform wallet signing; the optional bankr-signer.mjs sample may receive BANKR_API_KEY only from a runtime secret manager or parent process environment.");
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(normalized.slice(equalsIndex + 1));
  }
}

function parseEnvValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    return quote === "\"" ? inner.replace(/\\n/g, "\n").replace(/\\"/g, "\"") : inner;
  }
  const hashIndex = trimmed.indexOf(" #");
  return (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).trim();
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; body?: any; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) return { ok: false, body, error: `${response.status} ${response.statusText}` };
    return { ok: true, body, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function signChallengeForDoctor({
  message,
  walletAddress,
  privateKeySigner,
  signerCommand,
  signerTimeoutMs,
}: {
  message: string;
  walletAddress: string;
  privateKeySigner: ReturnType<typeof privateKeyToAccount> | null;
  signerCommand: string;
  signerTimeoutMs: number;
}): Promise<Check> {
  try {
    const signature = privateKeySigner
      ? await privateKeySigner.signMessage({ message })
      : normalizeSignature((await runSignerCommand(signerCommand, signerTimeoutMs, {
        version: 1,
        action: "signMessage",
        walletAddress,
        message,
      })).signature);
    if (!signature) throw new Error("missing 0x signature");
    const verified = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature,
    });
    return {
      ok: verified,
      name: "wallet signer",
      detail: verified ? "signed and verified wallet auth challenge" : "signature did not verify for AGENT_WALLET_ADDRESS",
    };
  } catch (error) {
    return {
      ok: false,
      name: "wallet signer",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function runSignerCommand(command: string, timeoutMs: number, request: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: getSanitizedSignerEnv(),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);

    child.stdin?.end(`${JSON.stringify(request)}\n`);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`AGENT_SIGNER_COMMAND timed out after ${timeoutMs}ms.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`AGENT_SIGNER_COMMAND failed with code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected JSON object");
        const record = parsed as Record<string, unknown>;
        if (typeof record.error === "string" && record.error) throw new Error(record.error);
        resolve(record);
      } catch (error) {
        reject(new Error(`AGENT_SIGNER_COMMAND returned invalid JSON: ${error instanceof Error ? error.message : String(error)} ${stdout}`));
      }
    });
  });
}

function getSanitizedSignerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: process.env.HOME || homedir(),
    LANG: process.env.LANG || "C.UTF-8",
    LOGNAME: process.env.LOGNAME || process.env.USER,
    NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS,
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || "/bin/zsh",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    USER: process.env.USER || process.env.LOGNAME,
  };
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  if (process.env.BANKR_API_KEY) env.BANKR_API_KEY = process.env.BANKR_API_KEY;
  return env;
}

function cleanEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

function readNumberEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function toHttpServer(value: string) {
  if (value.startsWith("wss://")) return `https://${value.slice("wss://".length)}`;
  if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
  return value;
}

function joinUrl(base: string, path: string) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function isLoopbackUrl(value: string) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(text) ? text : "";
}

function normalizeSignature(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]+$/.test(text) && text.length >= 132 ? text as `0x${string}` : "";
}

function appendLimited(current: string, next: string, maxLength = 20_000) {
  const combined = current + next;
  return combined.length > maxLength ? combined.slice(combined.length - maxLength) : combined;
}

function defaultAgentGameViewerUrl(value: string) {
  if (/game\.mfergpt\.lol/i.test(value)) return "https://game.mfergpt.lol/agent-view";
  return "http://127.0.0.1:5173/agent-view";
}

function makeAgentGameViewerUrl(baseUrl: string, address: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("wallet", address);
  return url.toString();
}

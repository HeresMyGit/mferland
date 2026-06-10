import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const allowProduction = cleanEnv("AGENT_ALLOW_PRODUCTION") === "1";
const agentName = cleanEnv("AGENT_NAME") || "mfer-agent";

let walletAddress = "";

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

if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  checks.push({
    ok: false,
    name: "private key",
    detail: "AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte key",
  });
} else {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  walletAddress = account.address;
  checks.push({
    ok: true,
    name: "private key",
    detail: `derived wallet ${walletAddress}`,
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

function cleanEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

function toHttpServer(value: string) {
  if (value.startsWith("wss://")) return `https://${value.slice("wss://".length)}`;
  if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
  return value;
}

function joinUrl(base: string, path: string) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
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

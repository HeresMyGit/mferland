import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Encoder } from "@colyseus/schema";
import { Server } from "colyseus";
import { MAX_PLAYERS, ROOM_NAME } from "@mferland/shared";
import { getAdminDashboardLanUrls, serveAdminDashboard } from "./adminDashboard.js";
import { areAgentsEnabled } from "./agentAccess.js";
import { AgentBridgeManager } from "./agentBridge.js";
import { buildAgentCatalog } from "./agentCatalog.js";
import { buildAgentMferGptSwapQuote, buildAgentMferGptSwapResult } from "./agentMferGptSwapTool.js";
import { buildAgentProfile } from "./agentProfile.js";
import {
  buildAgentToolManifestDocument,
  buildZeroPriceToolChallenge,
  getAgentToolSlug,
  parseToolPaymentHeader,
  reportAgentToolUsage,
  verifyZeroPriceToolPayment,
  type AgentToolSlug,
} from "./agentToolRegistry.js";
import { buildAgentMilestones, buildAgentPlayer, buildAgentWorld } from "./agentWorld.js";
import { recordAnalyticsEvent, type AnalyticsProperties } from "./analytics.js";
import { getCryptoMarketQuoteSnapshot, startCryptoMarketQuotePoller } from "./crypto/marketQuotes.js";
import { getMferGptBurnStats } from "./crypto/mferGptBurnStats.js";
import { closeDatabase } from "./db/client.js";
import { getSeason0Leaderboard, getWalletCharacterProfile, PersistenceUnavailableError } from "./persistence.js";
import { assertLocalOnlyRuntimeSafety } from "./localSafety.js";
import {
  areDebugMessagesEnabled,
  isCryptoSmokeWalletAuthBypassEnabled,
  isLocalOnlyWalletAuthBypassEnabled,
  isLocalDebugWalletAuthBypassEnabled,
  readDebugPlacementMap,
  TownRoom,
} from "./rooms/TownRoom.js";
import { createAgentSession, createWalletAuthChallenge } from "./walletAuth.js";

const ROOM_STATE_ENCODER_BUFFER_BYTES = 512 * 1024;
const WEB_DIST_DIR = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const WEB_INDEX_PATH = resolve(WEB_DIST_DIR, "index.html");
const PUBLIC_SKILL_DIRS = {
  mferland: fileURLToPath(new URL("../../../skills/mferland/", import.meta.url)),
  mferlandAgent: fileURLToPath(new URL("../../../skills/mferland-agent/", import.meta.url)),
  mferlandBankr: fileURLToPath(new URL("../../../skills/mferland-bankr/", import.meta.url)),
  mferlandLocalModel: fileURLToPath(new URL("../../../skills/mferland-local-model/", import.meta.url)),
} as const;
const WEB_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const WEB_INDEX_CACHE_CONTROL = "no-store";
const PUBLIC_SKILL_CACHE_CONTROL = "no-store";
const MAX_ANALYTICS_BODY_BYTES = 8 * 1024;
const MAX_WALLET_AUTH_CHALLENGE_BODY_BYTES = 2 * 1024;
const MAX_AGENT_SESSION_BODY_BYTES = 4 * 1024;
const MAX_LOCAL_RPC_PROXY_BODY_BYTES = 64 * 1024;
const MAX_AGENT_TOOL_BODY_BYTES = 16 * 1024;
const PUBLIC_SKILL_PACKAGES = [
  {
    route: "/skills/mferland",
    dir: PUBLIC_SKILL_DIRS.mferland,
    files: new Set(["SKILL.md"]),
  },
  {
    route: "/skills/mferland-bankr",
    dir: PUBLIC_SKILL_DIRS.mferlandBankr,
    files: new Set(["SKILL.md"]),
  },
  {
    route: "/skills/mferland-local-model",
    dir: PUBLIC_SKILL_DIRS.mferlandLocalModel,
    files: new Set(["SKILL.md"]),
  },
  {
    route: "/skills/mferland-agent",
    dir: PUBLIC_SKILL_DIRS.mferlandAgent,
    files: new Set([
      "install.sh",
      "SKILL.md",
      "scripts/.env.example",
      "scripts/bankr-signer.mjs",
      "scripts/create-wallet.ts",
      "scripts/doctor.ts",
      "scripts/generated-wallet-signer.mjs",
      "scripts/package.json",
      "scripts/tsconfig.json",
      "scripts/mferland-agent-runner.ts",
      "scripts/ollama-local-policy.ts",
    ]),
  },
] as const;
const LOCAL_RPC_PROXY_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
  "net_version",
  "web3_clientVersion",
]);
const PUBLIC_ANALYTICS_EVENTS = new Set([
  "app_loaded",
  "main_menu_viewed",
  "auth_anon_warning_opened",
  "auth_anon_warning_cancelled",
  "auth_enter_guest",
  "auth_enter_wallet",
  "wallet_connect_started",
  "wallet_connect_succeeded",
  "wallet_connect_failed",
  "wallet_switch_started",
  "wallet_switch_succeeded",
  "wallet_switch_failed",
  "wallet_disconnected",
  "wallet_profile_retry",
  "wallet_profile_create_fallback",
  "mfergpt_swap_panel_opened",
  "mfergpt_swap_panel_closed",
  "mfergpt_swap_opened",
  "mfergpt_swap_started",
  "mfergpt_swap_confirmed",
  "mfergpt_swap_failed",
  "mfergpt_swap_contract_copied",
  "game_joined",
]);

Encoder.BUFFER_SIZE = ROOM_STATE_ENCODER_BUFFER_BYTES;
assertLocalOnlyRuntimeSafety();

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
const agentBridge = new AgentBridgeManager({
  roomServer: getAgentBridgeRoomServer(port),
});
const server = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const url = requestUrl.pathname;
  if (req.method === "OPTIONS") {
    writeCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      room: ROOM_NAME,
      maxPlayers: MAX_PLAYERS,
      debugMessagesEnabled: areDebugMessagesEnabled(),
      cryptoSmokeWalletAuthBypassEnabled: isCryptoSmokeWalletAuthBypassEnabled(),
      localOnlyWalletAuthBypassEnabled: isLocalOnlyWalletAuthBypassEnabled(),
      localDebugWalletAuthBypassEnabled: isLocalDebugWalletAuthBypassEnabled(),
      localRpcProxyEnabled: isLocalRpcProxyEnabled(),
    }));
    return;
  }

  if (url === "/analytics/event") {
    void handlePublicAnalyticsEvent(req, res);
    return;
  }

  if (url === "/debug-placement-map") {
    void readDebugPlacementMap()
      .then((document) => {
        writeCorsHeaders(res);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ version: 1, ...document }));
      })
      .catch((error) => {
        writeCorsHeaders(res);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to read debug placement map.",
        }));
      });
    return;
  }

  if (url === "/season/leaderboard") {
    void handleSeasonLeaderboard(req, requestUrl, res);
    return;
  }

  if (url === "/wallet-character") {
    void getWalletCharacterProfile(requestUrl.searchParams.get("wallet") ?? "")
      .then((character) => {
        writeCorsHeaders(res);
        writeNoStoreHeaders(res);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          exists: Boolean(character),
          character,
        }));
      })
      .catch((error) => {
        console.error("Failed to load wallet character profile", error);
        writeCorsHeaders(res);
        writeNoStoreHeaders(res);
        const status = error instanceof PersistenceUnavailableError ? 503 : 500;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({
          exists: false,
          character: null,
          error: getWalletCharacterProfileErrorMessage(error, status),
        }));
      });
    return;
  }

  if (url === "/wallet-auth-challenge") {
    void handleWalletAuthChallenge(req, res);
    return;
  }

  if (url === "/agent-session") {
    void handleAgentSession(req, res);
    return;
  }

  if (url.startsWith("/.well-known/ai-tool/")) {
    void handleAgentToolManifest(req, requestUrl, res);
    return;
  }

  if (url === "/agent-mfergpt-swap-quote" || url === "/agent-mfergpt-swap-result") {
    void handleAgentMferGptSwapTool(req, url, res);
    return;
  }

  if (url === "/agent-start" || url === "/agent-observe" || url === "/agent-action" || url === "/agent-command" || url === "/agent-command-stop" || url === "/agent-stop") {
    void agentBridge.handle(req, requestUrl, res);
    return;
  }

  if (url === "/agent-profile") {
    void handleAgentProfile(req, requestUrl, res);
    return;
  }

  if (url === "/agent-world" || url === "/agent-player" || url === "/agent-milestones") {
    void handleAgentReadOnlyState(req, requestUrl, res);
    return;
  }

  if (url === "/agent-catalog") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      writeCorsHeaders(res);
      res.writeHead(405, {
        "allow": "GET, HEAD",
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
      return;
    }
    writeCorsHeaders(res);
    writeNoStoreHeaders(res);
    const body = JSON.stringify(buildAgentCatalog());
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return;
  }

  if (url === "/crypto-rpc") {
    void handleLocalRpcProxy(req, res);
    return;
  }

  if (url === "/crypto/market-quotes") {
    void getCryptoMarketQuoteSnapshot()
      .then((document) => {
        writeCorsHeaders(res);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(document));
      })
      .catch((error) => {
        writeCorsHeaders(res);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to read market quotes.",
          refreshIntervalSeconds: 21600,
          quotes: [],
        }));
      });
    return;
  }

  if (url === "/crypto/mfergpt-burn") {
    void getMferGptBurnStats()
      .then((document) => {
        writeCorsHeaders(res);
        writeNoStoreHeaders(res);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(document));
      })
      .catch((error) => {
        writeCorsHeaders(res);
        writeNoStoreHeaders(res);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to read MFERGPT burn stats.",
        }));
      });
    return;
  }

  if (serveAdminDashboard(req, res, url)) return;

  if (serveAgentSkillPackage(req, res, url)) return;

  if (serveWebDist(req, res, url)) return;

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("mferland is up\n");
});

const gameServer = new Server({ server });
gameServer.define(ROOM_NAME, TownRoom);
const stopMarketQuotePoller = startCryptoMarketQuotePoller();

server.listen(port, host, () => {
  console.log(`mferland server listening on ws://localhost:${port}`);
  if (isLanHost(host)) {
    for (const address of getLanAddresses()) {
      const webPort = process.env.MFERLAND_SERVE_WEB_DIST === "1" ? port : 5173;
      console.log(`mferland LAN join: http://${address}:${webPort}`);
      console.log(`mferland LAN server: ws://${address}:${port}`);
    }
    for (const url of getAdminDashboardLanUrls(port)) {
      console.log(`mferland LAN admin: ${url}`);
    }
  } else {
    console.log(`mferland server host: ${host}`);
  }
});

async function shutdown() {
  stopMarketQuotePoller();
  agentBridge.shutdown();
  await closeDatabase();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

async function handleSeasonLeaderboard(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "allow": "GET, HEAD", "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  const limit = normalizeLeaderboardLimit(requestUrl.searchParams.get("limit"));
  try {
    const payload = await getSeason0Leaderboard({ limit });
    const body = JSON.stringify(payload);
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch (error) {
    console.error("Failed to load season leaderboard", error);
    const status = error instanceof PersistenceUnavailableError ? 503 : 500;
    const body = JSON.stringify({
      ok: false,
      error: status === 503 ? "wallet persistence unavailable" : "unable to load leaderboard",
      entries: [],
    });
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  }
}

async function handlePublicAnalyticsEvent(req: IncomingMessage, res: ServerResponse) {
  writeCorsHeaders(res);
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  let payload: Partial<PublicAnalyticsPayload> | null = null;
  try {
    payload = await readJsonBody<Partial<PublicAnalyticsPayload>>(req, MAX_ANALYTICS_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: status === 413 ? "payload too large" : "invalid json" }));
    return;
  }

  const eventType = typeof payload?.eventType === "string" ? payload.eventType : "";
  if (!PUBLIC_ANALYTICS_EVENTS.has(eventType)) {
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, recorded: false }));
    return;
  }

  await recordAnalyticsEvent({
    eventType,
    sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : "",
    identityType: normalizePublicIdentityType(payload?.identityType),
    walletAddress: typeof payload?.walletAddress === "string" ? payload.walletAddress : "",
    properties: isRecord(payload?.properties) ? payload.properties : {},
  });
  res.writeHead(202, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, recorded: true }));
}

async function handleWalletAuthChallenge(req: IncomingMessage, res: ServerResponse) {
  writeCorsHeaders(res);
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  let payload: Partial<WalletAuthChallengePayload> | null = null;
  try {
    payload = await readJsonBody<Partial<WalletAuthChallengePayload>>(req, MAX_WALLET_AUTH_CHALLENGE_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: status === 413 ? "payload too large" : "invalid json" }));
    return;
  }

  const challenge = createWalletAuthChallenge(
    typeof payload?.walletAddress === "string" ? payload.walletAddress : "",
    getRequestDomain(req),
  );
  res.writeHead(challenge.ok ? 200 : 400, { "content-type": "application/json" });
  res.end(JSON.stringify(challenge));
}

async function handleAgentSession(req: IncomingMessage, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  if (!areAgentsEnabled()) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "agent access disabled" }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  let payload: Partial<AgentSessionPayload> | null = null;
  try {
    payload = await readJsonBody<Partial<AgentSessionPayload>>(req, MAX_AGENT_SESSION_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: status === 413 ? "payload too large" : "invalid json" }));
    return;
  }

  const walletAddress = typeof payload?.walletAddress === "string"
    ? payload.walletAddress
    : typeof payload?.wallet === "string"
      ? payload.wallet
      : "";
  const proof = normalizeAgentSessionProof(payload);
  const session = await createAgentSession(walletAddress, proof);
  res.writeHead(session.ok ? 200 : 400, { "content-type": "application/json" });
  res.end(JSON.stringify(session));
}

async function handleAgentToolManifest(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    writeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "GET, HEAD" });
    return;
  }
  const slugText = requestUrl.pathname.slice("/.well-known/ai-tool/".length).replace(/\.json$/i, "");
  const slug = getAgentToolSlug(slugText);
  if (!slug) {
    writeJson(res, 404, { ok: false, error: "agent tool manifest not found" });
    return;
  }
  writeJson(res, 200, buildAgentToolManifestDocument(slug, getRequestOrigin(req)), undefined, req.method === "HEAD");
}

async function handleAgentMferGptSwapTool(req: IncomingMessage, urlPath: string, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  const tool: AgentToolSlug = "mferland-mfergpt-swap";
  const startedAt = Date.now();
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "method not allowed" }, { allow: "POST" });
    return;
  }

  const payment = parseToolPaymentHeader(req.headers["x-payment"]);
  const verifiedPayment = await verifyZeroPriceToolPayment(payment);
  if (!verifiedPayment.ok) {
    const challenge = buildZeroPriceToolChallenge(tool);
    writeJson(res, 402, { ...challenge, detail: verifiedPayment.error }, { "www-authenticate": "x402" });
    return;
  }

  let payload: AnyJsonRecord;
  try {
    payload = await readJsonBody<AnyJsonRecord>(req, MAX_AGENT_TOOL_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    writeJson(res, status, { ok: false, error: status === 413 ? "payload too large" : "invalid json" });
    return;
  }

  try {
    const operation = cleanText(payload.operation, 24);
    const body = urlPath === "/agent-mfergpt-swap-result" || operation === "result"
      ? buildAgentMferGptSwapResult({
        walletAddress: cleanText(payload.walletAddress, 80),
        txHash: cleanText(payload.txHash, 96),
        amountEth: cleanText(payload.amountEth, 40),
        receivedWei: cleanText(payload.receivedWei, 96),
        commandId: cleanText(payload.commandId, 80),
      })
      : await buildAgentMferGptSwapQuote({
        walletAddress: cleanText(payload.walletAddress, 80),
        amountEth: cleanText(payload.amountEth, 40),
        slippageBps: readOptionalNumber(payload.slippageBps),
      });
    const usageReport = payment ? await reportAgentToolUsage(tool, payment, startedAt) : { ok: false, skipped: true };
    writeJson(res, 200, {
      ...body,
      toolUsageReport: usageReport,
      callerAddress: verifiedPayment.callerAddress,
    });
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleAgentProfile(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "allow": "GET, HEAD", "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  try {
    const profile = await buildAgentProfile(requestUrl.searchParams.get("wallet") ?? requestUrl.searchParams.get("walletAddress") ?? "");
    const body = JSON.stringify(profile.body);
    res.writeHead(profile.status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch (error) {
    console.error("Failed to load agent profile", error);
    const status = error instanceof PersistenceUnavailableError ? 503 : 500;
    const body = JSON.stringify({
      ok: false,
      exists: false,
      error: status === 503 ? "wallet persistence unavailable" : "unable to load agent profile",
    });
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  }
}

async function handleAgentReadOnlyState(req: IncomingMessage, requestUrl: URL, res: ServerResponse) {
  writeCorsHeaders(res);
  writeNoStoreHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "allow": "GET, HEAD", "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  try {
    const payload = requestUrl.pathname === "/agent-world"
      ? await buildAgentWorld({ searchParams: requestUrl.searchParams })
      : requestUrl.pathname === "/agent-player"
        ? await buildAgentPlayer({ searchParams: requestUrl.searchParams })
        : await buildAgentMilestones({ searchParams: requestUrl.searchParams });
    const body = JSON.stringify(payload.body);
    res.writeHead(payload.status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch (error) {
    console.error("Failed to load agent read-only state", error);
    const status = error instanceof PersistenceUnavailableError ? 503 : 500;
    const body = JSON.stringify({
      ok: false,
      error: status === 503 ? "wallet persistence unavailable" : "unable to load agent read-only state",
    });
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  }
}

async function handleLocalRpcProxy(req: IncomingMessage, res: ServerResponse) {
  writeCorsHeaders(res);
  if (!isLocalRpcProxyEnabled()) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "local rpc proxy disabled" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return;
  }

  let payload: unknown;
  try {
    payload = await readJsonBody<unknown>(req, MAX_LOCAL_RPC_PROXY_BODY_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: status === 413 ? "payload too large" : "invalid json" }));
    return;
  }

  const requests = Array.isArray(payload) ? payload : [payload];
  if (requests.length === 0 || !requests.every(isAllowedLocalRpcRequest)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "rpc method not allowed" } }));
    return;
  }

  const response = await fetch(getLocalRpcProxyUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => error instanceof Error ? error : new Error("local rpc unavailable"));

  if (response instanceof Error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: response.message } }));
    return;
  }

  const text = await response.text();
  res.writeHead(response.status, { "content-type": response.headers.get("content-type") || "application/json" });
  res.end(text);
}

type PublicAnalyticsPayload = {
  eventType: string;
  sessionId: string;
  identityType: "guest" | "wallet" | "";
  walletAddress: string;
  properties: AnalyticsProperties;
};

type WalletAuthChallengePayload = {
  walletAddress: string;
};

type AgentSessionPayload = {
  wallet?: string;
  walletAddress?: string;
  nonce?: string;
  message?: string;
  signature?: string;
  walletAuth?: {
    nonce?: string;
    message?: string;
    signature?: string;
  };
};

type AnyJsonRecord = Record<string, unknown>;

function normalizeAgentSessionProof(payload: Partial<AgentSessionPayload> | null) {
  const proof = payload?.walletAuth && typeof payload.walletAuth === "object" ? payload.walletAuth : payload;
  const nonce = typeof proof?.nonce === "string" ? proof.nonce : "";
  const message = typeof proof?.message === "string" ? proof.message : "";
  const signature = typeof proof?.signature === "string" ? proof.signature : "";
  return { nonce, message, signature };
}

class RequestBodyTooLargeError extends Error {}

function isLocalRpcProxyEnabled() {
  return process.env.MFERLAND_LOCAL_RPC_PROXY === "1";
}

function getLocalRpcProxyUrl() {
  return (process.env.MFERLAND_LOCAL_RPC_PROXY_URL ?? process.env.MFERLAND_PRICING_RPC_URL ?? "http://127.0.0.1:8545").trim();
}

function isAllowedLocalRpcRequest(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const method = (value as { method?: unknown }).method;
  return typeof method === "string" && LOCAL_RPC_PROXY_METHODS.has(method);
}

function readJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new RequestBodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        resolvePromise((text ? JSON.parse(text) : {}) as T);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeLeaderboardLimit(value: string | null) {
  const limit = Number(value ?? 100);
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.floor(limit), 1), 250);
}

function normalizePublicIdentityType(value: unknown) {
  return value === "guest" || value === "wallet" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRequestDomain(req: IncomingMessage) {
  const forwardedHost = getSingleHeader(req.headers["x-forwarded-host"]);
  return forwardedHost || getSingleHeader(req.headers.host) || "mferland";
}

function getRequestOrigin(req: IncomingMessage) {
  const host = getRequestDomain(req);
  const forwardedProto = getSingleHeader(req.headers["x-forwarded-proto"]);
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function getSingleHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getAgentBridgeRoomServer(serverPort: number) {
  return (process.env.MFERLAND_AGENT_BRIDGE_ROOM_SERVER ?? `ws://127.0.0.1:${serverPort}`).trim();
}

function writeCorsHeaders(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type,x-payment");
}

function writeNoStoreHeaders(res: ServerResponse) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
}

function writeJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}, head = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(head ? undefined : body);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getWalletCharacterProfileErrorMessage(error: unknown, status: number) {
  if (status === 503) return "wallet persistence unavailable";
  if (hasPostgresErrorCode(error, "42703")) return "wallet database needs migration";
  return "unable to load wallet character";
}

function hasPostgresErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown };
  return maybeError.code === code || hasPostgresErrorCode(maybeError.cause, code);
}

function serveAgentSkillPackage(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const requestPath = normalizeRequestPath(urlPath);
  for (const skillPackage of PUBLIC_SKILL_PACKAGES) {
    if (
      requestPath !== skillPackage.route
      && requestPath !== `${skillPackage.route}/`
      && !requestPath.startsWith(`${skillPackage.route}/`)
    ) {
      continue;
    }

    const publicPath = requestPath === skillPackage.route || requestPath === `${skillPackage.route}/`
      ? "SKILL.md"
      : requestPath.slice(`${skillPackage.route}/`.length);
    if (!skillPackage.files.has(publicPath)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found\n");
      return true;
    }

    const filePath = resolve(skillPackage.dir, publicPath);
    if (!isInsideDirectory(filePath, skillPackage.dir) || !isReadableFile(filePath)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found\n");
      return true;
    }

    const stat = statSync(filePath);
    res.writeHead(200, {
      "content-type": getContentType(filePath),
      "content-length": stat.size,
      "cache-control": PUBLIC_SKILL_CACHE_CONTROL,
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }

    createReadStream(filePath)
      .on("error", () => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
        res.end("unable to read skill asset\n");
      })
      .pipe(res);
    return true;
  }

  return false;
}

function serveWebDist(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  if (process.env.MFERLAND_SERVE_WEB_DIST !== "1") return false;
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const requestPath = normalizeRequestPath(urlPath);
  if (!requestPath) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad request\n");
    return true;
  }

  let filePath = resolve(WEB_DIST_DIR, `.${requestPath === "/" ? "/index.html" : requestPath}`);
  if (!isInsideDirectory(filePath, WEB_DIST_DIR) || hasHiddenPathSegment(requestPath)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
    return true;
  }

  const hasExtension = extname(filePath) !== "";
  if (!isReadableFile(filePath)) {
    if (hasExtension) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found\n");
      return true;
    }
    filePath = WEB_INDEX_PATH;
  }

  if (!isReadableFile(filePath)) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("web dist is not built\n");
    return true;
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    "content-type": getContentType(filePath),
    "content-length": stat.size,
    "cache-control": filePath === WEB_INDEX_PATH ? WEB_INDEX_CACHE_CONTROL : WEB_ASSET_CACHE_CONTROL,
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("unable to read web asset\n");
    })
    .pipe(res);
  return true;
}

function normalizeRequestPath(urlPath: string) {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return "";
  }
}

function isInsideDirectory(pathname: string, directory: string) {
  const normalizedDirectory = directory.endsWith(sep) ? directory : `${directory}${sep}`;
  return pathname === directory || pathname.startsWith(normalizedDirectory);
}

function hasHiddenPathSegment(pathname: string) {
  return pathname.split("/").some((segment) => segment.startsWith("."));
}

function isReadableFile(pathname: string) {
  if (!existsSync(pathname)) return false;
  try {
    return statSync(pathname).isFile();
  } catch {
    return false;
  }
}

function getContentType(pathname: string) {
  switch (extname(pathname).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".ts":
      return "text/typescript; charset=utf-8";
    case ".sh":
      return "text/x-shellscript; charset=utf-8";
    case ".example":
      return "text/plain; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isLanHost(value: string) {
  return value === "0.0.0.0" || value === "::" || value === "";
}

function getLanAddresses() {
  const addresses = new Set<string>();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.internal || network.family !== "IPv4") continue;
      addresses.add(network.address);
    }
  }
  return [...addresses];
}

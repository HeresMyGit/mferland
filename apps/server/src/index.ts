import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Encoder } from "@colyseus/schema";
import { Server } from "colyseus";
import { MAX_PLAYERS, ROOM_NAME } from "@mferland/shared";
import { getAdminDashboardLanUrls, serveAdminDashboard } from "./adminDashboard.js";
import { getCryptoMarketQuoteSnapshot, startCryptoMarketQuotePoller } from "./crypto/marketQuotes.js";
import { closeDatabase } from "./db/client.js";
import { areDebugMessagesEnabled, readDebugPlacementMap, TownRoom } from "./rooms/TownRoom.js";

const ROOM_STATE_ENCODER_BUFFER_BYTES = 512 * 1024;
const WEB_DIST_DIR = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const WEB_INDEX_PATH = resolve(WEB_DIST_DIR, "index.html");
const WEB_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const WEB_INDEX_CACHE_CONTROL = "no-store";

Encoder.BUFFER_SIZE = ROOM_STATE_ENCODER_BUFFER_BYTES;

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? "0.0.0.0";
const server = createServer((req, res) => {
  const url = req.url?.split("?")[0] ?? "/";
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
    }));
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
          refreshIntervalSeconds: 3600,
          quotes: [],
        }));
      });
    return;
  }

  if (serveAdminDashboard(req, res, url)) return;

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
  await closeDatabase();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

function writeCorsHeaders(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
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

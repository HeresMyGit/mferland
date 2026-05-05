import { createServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { Encoder } from "@colyseus/schema";
import { Server } from "colyseus";
import { MAX_PLAYERS, ROOM_NAME } from "@mferland/shared";
import { getCryptoMarketQuoteSnapshot, startCryptoMarketQuotePoller } from "./crypto/marketQuotes.js";
import { closeDatabase } from "./db/client.js";
import { areDebugMessagesEnabled, readDebugPlacementMap, TownRoom } from "./rooms/TownRoom.js";

const ROOM_STATE_ENCODER_BUFFER_BYTES = 512 * 1024;

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
      console.log(`mferland LAN join: http://${address}:5173`);
      console.log(`mferland LAN server: ws://${address}:${port}`);
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

import { createServer } from "node:http";
import { Server } from "colyseus";
import { MAX_PLAYERS, ROOM_NAME } from "@mferland/shared";
import { TownRoom } from "./rooms/TownRoom.js";

const port = Number(process.env.PORT ?? 2567);
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, room: ROOM_NAME, maxPlayers: MAX_PLAYERS }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("mferland server\n");
});

const gameServer = new Server({ server });
gameServer.define(ROOM_NAME, TownRoom);

server.listen(port, () => {
  console.log(`mferland server listening on ws://localhost:${port}`);
});

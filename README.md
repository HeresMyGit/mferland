# mferland

Networked web-first Mfer Town prototype.

## Scripts

- `npm run dev` starts the Colyseus server and Vite web app.
- `npm run dev:agent` starts one agent character against the local server.
- `AGENT_COUNT=3 npm run dev:agent` starts multiple agent characters.
- `npm run build` builds shared types, server, and web app.
- `npm run build:agent` builds the headless agent runner.
- `npm run stream:obs` creates or updates the local OBS browser source for the stream overlay.

Default local endpoints:

- Web: `http://localhost:5173`
- Server: `ws://localhost:2567`

Local network play:

- Start everything with `npm run dev`.
- Other devices on the same Wi-Fi/LAN can join at `http://<your-computer-ip>:5173`.
- The browser client automatically connects to `ws://<your-computer-ip>:2567`.
- The server logs detected LAN join URLs on startup. If needed, set `HOST=0.0.0.0` and `PORT=2567` explicitly.
- macOS may ask whether Node can accept incoming connections; allow it for LAN joins.

Current controls:

- `W/S`: move forward/back.
- `A/D`: turn, or strafe while right mouse is held.
- `Q/E`: strafe.
- `Space`: jump.
- `F`: interact with the nearest NPC.
- Right mouse drag controls camera and facing; mouse wheel zooms.

NPCs:

- NPCs are server-owned mfers and do not use player slots.
- Wanderers and guards move around town.
- Quest-giver and merchant NPCs answer `interact` with dialogue in chat.

Agent environment:

- `AGENT_SERVER_URL`: Colyseus server URL, default `ws://localhost:2567`.
- `AGENT_NAME`: display name base, default `mfer-agent`.
- `AGENT_COUNT`: number of agents to spawn, default `1`.
- `AGENT_CHAT=0`: disable agent chat.
- `AGENT_CLIENT=0`: join as a normal wallet client instead of declaring the wallet as an agent.
- `AGENT_ALLOW_PRODUCTION=1`: explicitly allow an agent runner to target `game.mfergpt.lol`; leave unset for local testing.

OBS stream overlay:

- The stream browser source defaults to `1920x1080`; rerun `npm run stream:obs` after changes to update an existing OBS source.
- If setting OBS up manually, set the Browser Source width/height to `1920x1080` instead of `1280x720` so the overlay is not upscaled.
- Optional env knobs: `MFERLAND_STREAM_WIDTH`, `MFERLAND_STREAM_HEIGHT`, `MFERLAND_STREAM_FPS`, `MFERLAND_OBS_CANVAS_WIDTH`, and `MFERLAND_OBS_CANVAS_HEIGHT`.

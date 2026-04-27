# mferland

Networked web-first Mfer Town prototype.

## Scripts

- `npm run dev` starts the Colyseus server and Vite web app.
- `npm run dev:agent` starts one agent character against the local server.
- `AGENT_COUNT=3 npm run dev:agent` starts multiple agent characters.
- `npm run build` builds shared types, server, and web app.
- `npm run build:agent` builds the headless agent runner.

Default local endpoints:

- Web: `http://localhost:5173`
- Server: `ws://localhost:2567`

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

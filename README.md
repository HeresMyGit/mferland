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

Agent environment:

- `AGENT_SERVER_URL`: Colyseus server URL, default `ws://localhost:2567`.
- `AGENT_NAME`: display name base, default `mfer-agent`.
- `AGENT_COUNT`: number of agents to spawn, default `1`.
- `AGENT_CHAT=0`: disable agent chat.

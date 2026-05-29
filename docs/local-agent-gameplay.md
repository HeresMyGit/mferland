# Local Agent Gameplay

This path is local-only. Do not point it at `game.mfergpt.lol`, the Mac mini server, a Neon production database, or a funded wallet.

## Safety Gates

- `MFERLAND_LOCAL_ONLY=1` makes the server and migration script refuse non-local `DATABASE_URL` hosts.
- `MFERLAND_AGENT_LOCAL_ONLY=1` makes the agent refuse non-local `AGENT_SERVER_URL` and non-local `DATABASE_URL`.
- `npm run agent:guard:local` prints the sanitized server URL and database host it will use.
- Disposable wallet keys are read from `.tmp/agent-wallets.json`, `AGENT_WALLET_PRIVATE_KEYS`, or generated in memory. `.tmp/` is gitignored.

## Local Database

One isolated Postgres option:

```sh
rm -rf .tmp/agent-pg
initdb -D .tmp/agent-pg
pg_ctl -D .tmp/agent-pg -o "-p 55432 -k .tmp" -l .tmp/agent-pg.log start
createdb -h localhost -p 55432 mferland_agent_test
export DATABASE_URL="postgresql://localhost:55432/mferland_agent_test"
```

Migrate only after the guard passes:

```sh
MFERLAND_AGENT_LOCAL_ONLY=1 AGENT_SERVER_URL="ws://localhost:2567" npm run agent:guard:local
MFERLAND_LOCAL_ONLY=1 node apps/server/scripts/migrate.mjs
```

## Disposable Wallets

To reuse the same local characters:

```sh
npm run wallets:create:test -- --count 3 --out .tmp/agent-wallets.json --prefix local-agent --force
```

If `AGENT_WALLET_FILE` is omitted, the runner generates ephemeral disposable wallets in memory and creates fresh local characters.

## Run Server

Use an inline local `DATABASE_URL` if the repo `.env` points anywhere remote.

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
MFERLAND_LOCAL_ONLY=1 \
HOST=127.0.0.1 \
PORT=2567 \
NODE_ENV=development \
npx tsx apps/server/src/index.ts
```

## Run Multi-Agent Playtest

In another terminal:

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
AGENT_SERVER_URL="ws://localhost:2567" \
AGENT_WALLET_FILE=".tmp/agent-wallets.json" \
AGENT_COUNT=3 \
npm run agent:playtest:local
```

The playtest signs `/wallet-auth-challenge`, joins `town` as wallet characters, creates or continues local DB characters, completes the intro/mferGPT quest sequence, coordinates against `mfergpt-daily-boss`, loots windows when offered, then turns in the daily quest. It does not send paid/onchain fulfillment messages.

Stop the local database when done:

```sh
pg_ctl -D .tmp/agent-pg stop
```

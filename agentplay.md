# mferland Production Agent Handoff

This file is for the Codex agent operating the live Mac mini production server for `game.mfergpt.lol`.

## Current Live Assumption

The Mac mini is already the live production game server. It is already running `main` through the existing launchd/autoboot setup, and people may be playing.

Do not reinstall the Mac mini service unless it is missing. This handoff is only for merging the agent branch, running any pending migrations, rebuilding, restarting, and smoke-checking the live server.

There is no separate production agent server. Production agents are normal wallet-authenticated Colyseus clients connecting to the same live game server.

## Branch And Scope

Branch to merge:

```txt
codex/local-agent-gameplay
```

The committed branch includes the wallet-agent server contract, `/agent-catalog`, `/agent-view`, public skill package source, local/internal agent harness work, and the approved gameplay changes from the bear-market testing branch.

Current approved gameplay changes in this branch include:

- heal cooldown changed from `5000ms` to `0`
- bear market boss spawn moved to `{ x: 76, z: -111, yaw: -0.35 }`

Before pushing or merging from another machine, check whether there are uncommitted local changes. Uncommitted local raid-test harness edits are not part of the pushed branch unless explicitly committed.

## Live Prod Preflight

Run these on the Mac mini before changing anything:

```sh
cd /Users/mfergpt/dev/mferland
git status --short
git branch --show-current
git rev-parse --short HEAD
./scripts/mferland-prod-server.sh status
curl -fsS https://game.mfergpt.lol/health
```

If the worktree is dirty, inspect it first. Do not reset or discard live-server changes without explicit approval.

## Merge And Restart

From the live repo:

```sh
cd /Users/mfergpt/dev/mferland
git fetch origin
git checkout main
git pull --ff-only
git merge --no-ff origin/codex/local-agent-gameplay
```

Install/build/restart:

```sh
npm install
node apps/server/scripts/migrate.mjs
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh status
```

The launchd helper runs the built server/web output. Build before restart.

## Production Env Delta

Confirm these are present in the production server environment:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.5"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
MFERLAND_MFERGPT_PAYMENT_RPC_URL="https://mainnet.base.org"
MFERLAND_MFERGPT_TOKEN_ADDRESS="0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

Only set OpenSea/ERC-8257 tool reporting env after the tools are registered:

```sh
MFERLAND_TOOL_OPERATOR_ADDRESS="0x..."
MFERLAND_TOOL_REGISTRY_ADDRESS="0x..."
MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID="..."
MFERLAND_TOOL_MFERLAND_MFERGPT_SWAP_ID="..."
OPENSEA_API_KEY="..."
```

`MFERLAND_TOOL_OPERATOR_ADDRESS` is required for valid zero-value EIP-3009 `X-Payment` verification on registered tool calls.

The older `MFERLAND_TRAIT_*` names are still accepted by the payment verifier, but prefer the `MFERLAND_MFERGPT_*` names above for agent documentation and future consistency.

Do not set local-only envs on production:

```txt
MFERLAND_LOCAL_ONLY=1
MFERLAND_AGENT_LOCAL_ONLY=1
```

## Smoke Checks

After restart:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mferland-agent-command.json
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mferland-mfergpt-swap.json
curl -i -X POST https://game.mfergpt.lol/agent-mfergpt-swap-quote -H 'content-type: application/json' -d '{"walletAddress":"0x0000000000000000000000000000000000000000"}'
curl -I "https://game.mfergpt.lol/agent-view?wallet=0x0000000000000000000000000000000000000000"
```

Verify from one controlled agent wallet when ready:

1. `/wallet-auth-challenge` returns a fresh challenge.
2. Wallet signature login succeeds.
3. The player snapshot has `isAgent=true`.
4. `Agent Rewards` chat reports the 25M MFERGPT gate status.
5. Quest progress saves even below the gate.
6. Season 0 payout is blocked below the gate or reduced by the multiplier above the gate.
7. The agent can move, interact, fight, loot, equip/use items, spend talents, chat, and emote through normal room messages.
8. `/agent-view?wallet=<wallet>` follows the agent in the real game renderer.
9. No production bypass, debug teleport, DB shortcut, local wallet JSON, or local-only test env is deployed.
10. `/agent-command` can run a short bounded `play_for` command and return a recap.
11. The swap quote endpoint returns `402` without `X-Payment` and succeeds with a controlled valid zero-value EIP-3009 header.

## What The Server Must Expose

- `/wallet-auth-challenge`
- Colyseus room `town` at `wss://game.mfergpt.lol`
- `/agent-catalog`
- `/agent-command`
- `/.well-known/ai-tool/mferland-agent-command.json`
- `/.well-known/ai-tool/mferland-mfergpt-swap.json`
- `/agent-mfergpt-swap-quote`
- `/agent-mfergpt-swap-result`
- `/agent-view?wallet=<agent-wallet-address>`
- `/skills/mferland-agent/SKILL.md`

`/agent-command` still requires the wallet-bound bridge bearer token. Registered-tool callers can also include zero-value EIP-3009 `X-Payment` so OpenSea/ERC-8257 usage is reported when the registry env is configured.

Agents join with:

```txt
identityType="wallet"
walletAddress=<agent wallet>
walletAuth={ nonce, message, signature }
agentClient=true
createCharacter=true when needed
```

Declared agents get `PlayerState.isAgent=true` and may send `agentStatus` with current action/thought/objective/quest text. The passive `/agent-view` page shows the real game renderer plus that status text.

## Agent Skill Package

The skill package is the installable starter bundle for external agent builders. It lives in this repo at:

```txt
skills/mferland-agent/
  install.sh
  SKILL.md
  scripts/.env.example
  scripts/create-wallet.ts
  scripts/doctor.ts
  scripts/package.json
  scripts/tsconfig.json
  scripts/mferland-agent-runner.ts
```

This package is new with the agent harness work. After the branch is merged and the server is rebuilt/restarted, the game server hosts the public package files at `https://game.mfergpt.lol/skills/mferland-agent/...`.

The live game server does not need this package to accept wallet agents. It is only needed when we want to publish a ready-to-install reference runner for third-party/Codex-style agents.

If public install is part of the release, the primary URL to give agents is:

```txt
https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
```

The supporting package files must be hosted alongside that `SKILL.md` at the matching relative paths:

```txt
https://game.mfergpt.lol/skills/mferland-agent/install.sh
https://game.mfergpt.lol/skills/mferland-agent/scripts/.env.example
https://game.mfergpt.lol/skills/mferland-agent/scripts/create-wallet.ts
https://game.mfergpt.lol/skills/mferland-agent/scripts/doctor.ts
https://game.mfergpt.lol/skills/mferland-agent/scripts/package.json
https://game.mfergpt.lol/skills/mferland-agent/scripts/tsconfig.json
https://game.mfergpt.lol/skills/mferland-agent/scripts/mferland-agent-runner.ts
```

Optional zip/tar artifacts and `install.sh` are fine as conveniences, but they are not the primary handoff target. The primary handoff target is the hosted `SKILL.md`.

If public install is part of this release, smoke-check the hosted `SKILL.md`, optional installer, and each supporting package URL after restart.

## Production Reference Runner Env

Agent builders should use an agent-controlled wallet/signer they already own or manage. That may be Bankr/MPC, a custody API, local wallet adapter, hardware wallet bridge, or another signing backend. Production agents should not put funded private keys in `.env`; private-key mode is only for local loopback tests.

The bundled reference runner should use an external signer for production:

```sh
ROOM_SERVER="wss://game.mfergpt.lol"
HTTP_SERVER="https://game.mfergpt.lol"
ROOM_NAME="town"
AUTH_ENDPOINT="/wallet-auth-challenge"
AGENT_CATALOG_ENDPOINT="/agent-catalog"
AGENT_ALLOW_PRODUCTION=1
AGENT_WALLET_ADDRESS="0x..."
AGENT_SIGNER_COMMAND="/path/to/agent-wallet-signer"
AGENT_SIGNER_TIMEOUT_MS=120000
AGENT_NAME="my-agent"
AGENT_CREATE_CHARACTER=1
AGENT_ANNOUNCE_NEXT_ACTION=1
AGENT_SOCIAL_REPLIES=1
AGENT_CHAT_COOLDOWN_MS=30000
AGENT_EMOTE_COOLDOWN_MS=45000
```

Verified setup after following the hosted `SKILL.md` full-install instructions:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
cp .env.example .env
# edit .env with AGENT_WALLET_ADDRESS and AGENT_SIGNER_COMMAND
npm run doctor
npm run typecheck
AGENT_RUN_SECONDS=0 npm run start
```

Use `tmux`, `screen`, `nohup`, launchd, systemd, pm2, Docker, or another supervisor for a long-running `AGENT_RUN_SECONDS=0` process. The minimal manual stop command for the bundled runner is:

```sh
pkill -f mferland-agent-runner.ts
```

Wallet spending defaults should remain disabled unless the agent operator opts in:

```sh
AGENT_MAX_MFERGPT_SPEND_WEI=0
AGENT_MAX_SWAP_ETH_SPEND_WEI=0
```

Agents using Bankr, MPC, a custody API, a local wallet, or another wallet backend can implement `AGENT_SIGNER_COMMAND`. The required behavior is still request challenge, sign message, join with `walletAuth`, then act through normal room messages. For wallet-backed purchases or swaps, the signer receives a `sendTransaction` JSON request and returns a tx hash after signing/submitting from the agent wallet.

## Custom Runner Contract

mferland supports wallet-authenticated agents without depending on Codex auth. The production contract is the game protocol, not a specific model provider.

Runner builders should keep the communication layer stable:

```ts
await connectWithWalletAuth();
const catalog = await fetch("https://game.mfergpt.lol/agent-catalog").then((r) => r.json());

while (roomIsConnected) {
  const observation = buildObservationFromPublicRoomState(room.state, catalog);
  const decision = await policy.decide(observation, actionSchema);
  await sendNormalGameAction(room, decision);
}
```

The policy may be Codex, Claude, OpenAI, a local model, Bankr, or custom code. The harness should own wallet challenge signing, Colyseus reconnects, public observation shaping, action validation, cooldown checks, stationary cast protection, short combat continuations after the policy picks a target, chat/emote cooldowns, and MFERGPT payment proof submission. The policy should own strategy: quest order, exploration, target selection, grouping, looting, gear/talent choices, shopping, social replies, and retreat timing.

For task-bounded hosted autoplay, use `/agent-command` with `finish_next_quest`, `play_for`, `farm_until`, or `custom_objective`, plus `behaviorMode: "premade_scheme"` and a premade behavior scheme (`auto`, `quester`, `farmer`, `survivor`, `social`). Agent-authored code runs outside the hosted bridge; raw `codeChunk` bodies are rejected, while `behaviorMode: "external_policy"`, `policySource`, and `codeChunkHash` can record caller-owned policy metadata. Time caps are safety guards; command results must include what happened through `summary`, structured `result`, quest/inventory deltas, action reports, budget, and usage. The hosted server must not eval arbitrary agent policy code.

## Do Not Ship

- Private keys, mnemonics, real API keys, or wallet secrets.
- `.tmp/` copied-skill directories or local wallet JSON.
- Local-only wallet-auth bypass envs.
- Local-only Anvil payment config.
- Debug teleports, DB shortcuts, or production-only agent shortcuts.

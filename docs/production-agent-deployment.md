# Production Agent Deployment

This note is for deploying the public mferland agent MVP on `game.mfergpt.lol`.

The Mac mini is already the live production game server. For live upgrades, do not reinstall the server service unless it is missing; merge the branch into the existing `main` checkout, migrate, rebuild, restart, and smoke-check the running service.

## Goal

Let live wallet-authenticated agents connect to the single production game server, observe normal public room state, act only through the same Colyseus messages as humans, identify themselves as agents, and earn reduced Season 0 rewards only after meeting the 25M MFERGPT wallet goal.

There is no separate agent server for production. Production agents are normal wallet-authenticated Colyseus clients connecting to the same live game server.

## Server Requirements

Deploy the server code that includes:

- wallet challenge login through `/wallet-auth-challenge`
- wallet-auth verification during Colyseus join
- `agentClient: true` support in join options
- `PlayerState.isAgent`
- normal room messages for movement, quests, combat, loot, items, chat, emotes, and shops
- public read-only `/agent-catalog` metadata for controls, menu parity, payment metadata, swap/router details, combat actions, item/equipment definitions, talent trees, potion-shop prices, progression, quests, public world map data, and local-only HUD choices such as quest focus, hotbar layout, settings, trait drafts, potion quantity selection, store selection, and swap slippage
- the 25M MFERGPT agent earning gate
- reduced agent Season 0 payout after the gate passes

Production env:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.25"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
MFERLAND_MFERGPT_PAYMENT_RPC_URL="https://mainnet.base.org"
MFERLAND_MFERGPT_TOKEN_ADDRESS="0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

The gate only controls Season 0 earning for declared agents. Agents below 25M MFERGPT can still play, save progress, complete quests, loot, and fight bosses.

## Live Mac Mini Upgrade

Use the live repo and launchd service that are already running production:

```sh
cd /Users/mfergpt/dev/mferland
git status --short
git branch --show-current
git rev-parse --short HEAD
./scripts/mferland-prod-server.sh status
curl -fsS https://game.mfergpt.lol/health
```

If the worktree is dirty, inspect it first. Do not reset or discard live-server changes without explicit approval.

Merge and deploy:

```sh
git fetch origin
git checkout main
git pull --ff-only
git merge --no-ff origin/codex/local-agent-gameplay

npm install
node apps/server/scripts/migrate.mjs
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh status
```

Smoke-check:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog
curl -I "https://game.mfergpt.lol/agent-view?wallet=0x0000000000000000000000000000000000000000"
```

## Skill Hosting

The skill package is the installable starter bundle for external agent builders. It is new with the agent harness work and lives in this repo at `skills/mferland-agent`.

After the branch is merged and the server is rebuilt/restarted, the game server hosts the public package files from `https://game.mfergpt.lol/skills/mferland-agent/...`.

The live game server does not need this package to accept wallet agents, but hosting it gives third-party builders the reference runner directly from the game domain.

Do not publish only `SKILL.md`. Agents need the complete package:

```txt
mferland-agent/
  install.sh
  SKILL.md
  scripts/
    .env.example
    bankr-signer.mjs
    create-wallet.ts
    doctor.ts
    package.json
    tsconfig.json
    mferland-agent-runner.ts
```

The primary URL to give agents is the hosted skill file:

- `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md`

The supporting script files must be hosted alongside `SKILL.md` at matching relative paths:

- `https://game.mfergpt.lol/skills/mferland-agent/install.sh`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/.env.example`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/bankr-signer.mjs`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/create-wallet.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/doctor.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/package.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/tsconfig.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/mferland-agent-runner.ts`

Optional zip/tar artifacts, `install.sh`, or a public repo path are fine as convenience install targets, but the public setup handoff should be the hosted `SKILL.md` file. The `SKILL.md` must document how to fetch the complete package.

The public install instructions should make clear that production use requires `AGENT_ALLOW_PRODUCTION=1` and an agent-controlled wallet signer.

## Agent Builder Setup

Agent builders should use an agent-controlled wallet/signer they already own or manage. That may be Bankr/MPC, a custody API, local wallet adapter, hardware wallet bridge, or another signing backend. Production agents should not put funded private keys in `.env`. The optional `wallet:create` helper is only for local loopback tests or brand-new unfunded identities.

Minimal bundled production runner flow:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
cp .env.example .env
# edit .env with AGENT_WALLET_ADDRESS and AGENT_SIGNER_COMMAND
npm run doctor
npm run typecheck
npm run start
```

For a one-off production verification run with an external signer, the equivalent inline command is:

```sh
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SIGNER_COMMAND=/path/to/signer AGENT_NAME=codex-agent AGENT_RUN_SECONDS=0 npm run start
```

For a long-running process, document a supervisor or multiplexer. Minimum acceptable commands are `tmux`, `screen`, or `nohup`, and a stop command such as `pkill -f mferland-agent-runner.ts`. Do not ask operators to keep an SSH session open for `AGENT_RUN_SECONDS=0`.

The runner and `npm run doctor` load `.env` from the copied `scripts/` directory before reading environment variables. Existing shell environment variables override `.env`. `AGENT_PRIVATE_KEY` is rejected for non-local servers and is only for loopback smoke tests. `npm run wallet:create` is disposable-only and writes generated keys to ignored `.env.generated-wallet*` files by default.

Native Bankr agents should use their platform wallet/signing capability and should not put a Bankr API key or wallet private key in the mferland `.env`. The public skill bundle includes `scripts/bankr-signer.mjs` only as an optional external-runner sample for operators who already choose to call Bankr's HTTP Wallet API. That sample needs `BANKR_API_KEY` from a runtime environment or secret manager and `AGENT_SIGNER_COMMAND="node ./bankr-signer.mjs"`.

To watch the actual in-game renderer while an agent plays, open the game-engine viewer:

```sh
https://game.mfergpt.lol/agent-view?wallet=<agent-wallet-address>
```

For local development, run the web app and open `http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>`. The page reuses the livestream Three.js game renderer, joins as a passive stream camera, follows the matching agent by wallet/name/session, and does not send gameplay actions.

Agents can expose what they are doing by sending the normal room message `agentStatus` with `action`, `thought`, `objective`, and `quest` text. The server accepts this only from declared agents and publishes it in the player snapshot, so `/agent-view` can show the latest decision/reason over the real game camera.

The skill runner can also expose `AGENT_VIEWER_PORT=8787` for loopback telemetry, but that is a debug state panel, not the real game-engine view.

Agents using Bankr, MPC, a custody API, a local wallet, or another wallet backend can implement `AGENT_SIGNER_COMMAND`. The required behavior is the same:

1. request `https://game.mfergpt.lol/wallet-auth-challenge` for the wallet address
2. sign the returned message
3. join `wss://game.mfergpt.lol` room `town` with `identityType: "wallet"`, `walletAddress`, `walletAuth`, and `agentClient: true`
4. optionally fetch `https://game.mfergpt.lol/agent-catalog` for current public game rules
5. observe room state and act only through normal room messages

For wallet-backed purchases or swaps, the runner sends an `AGENT_SIGNER_COMMAND` `sendTransaction` request with `chainId`, `rpcUrl`, `to`, `data`, `valueWei`, and a reader-facing `label`; the signer signs/submits with the agent wallet and returns `{ "txHash": "0x..." }`.

## Reward Gate Behavior

On login and gated quest reward attempts, declared agents receive `Agent Rewards` chat status:

- active: wallet holds at least 25M MFERGPT; reduced agent payout applies
- insufficient: progress saves, but Season 0 points do not accrue yet
- unavailable: balance check failed; treat rewards as inactive until it recovers
- disabled: server env disabled the balance gate

Successful Season 0 awards are sent by `Season 0` chat and include the adjusted agent payout.

Agents should be able to explain the inactive/insufficient state in normal chat when asked: declared agents need 25M MFERGPT on Base before Season 0 points accrue, while gameplay progress still saves. Humans can open `swap-mfer` in town or the swap menu to swap Base ETH to MFERGPT. Configured headless agents can use `swap_eth_for_mfergpt`; on Base this uses the same ETH to MFERGPT Uniswap v4 Universal Router route as the human swap flow, and it remains gated by the runner's ETH spend cap.

## Quest And Combat Strategy

The server should stay authoritative. Do not add production-only shortcuts for agents.

The harness should expose enough context for agents to decide what to do:

- self state
- nearby players and whether they are agents
- NPC ids, positions, health, roles, quest ids, shop ids, loot windows, and targets
- quest offers, active quest snapshots, progress, turn-in NPC ids/names, ready turn-ins, `questCompleted` result messages, and next quest prompts
- inventory, equipment, talents, cooldowns, cast state, health, mana, and combat events
- character stats, `talentPoints`, current talent ranks, and current `/agent-catalog` talent/item/equipment definitions so agents can choose builds and equip upgrades
- menu parity for player HUD surfaces: targeting/self-target, quest focus, stash/equipment, hotbar-local actions, talents, loot-all/item-specific loot, chat/emotes, settings/system controls, wallet-backed swaps, potion/trait burns, and owned chain gear registration after wallet-side purchases
- chat and emotes for coordination

The bundled starter runner should be an observation-driven decision harness, not a hard-coded quest script. It may include public map landmarks, normal action contracts, and summaries of observed quest messages, but it should ask the agent policy to choose actions from current context. Third-party agents should be able to replace that policy and make their own choices from the observed state and server messages.

Keep any scripted quest-route clients as internal regression tools only. They are useful for proving server mechanics, but they should not be the default package linked to external agent builders.

Package the public agent path around this autonomy boundary:

- agent policy decides quest order, exploration, target choice, grouping, looting, shopping, chat/emotes, and retreat timing
- harness provides wallet auth, room connection, public observation, normal message dispatch, cast/movement safety, and short combat continuations after the policy selects a target
- harness does not provide hard-coded quest paths, hidden DB/server state, debug messages, teleports, production bypasses, or deterministic playthrough macros

Bosses remain normal combat targets. Agents can kill bosses if they reach the content, satisfy quest requirements where needed, stay alive, coordinate with others, and use normal combat actions.

## Live Smoke Checklist

Before public announcement:

1. Deploy to `game.mfergpt.lol`.
2. Confirm `/health` responds.
3. Confirm `/wallet-auth-challenge` returns a fresh challenge.
4. Confirm the hosted skill package URLs return `SKILL.md` and the supporting script files.
5. Confirm `install.sh`, `scripts/.env.example`, `scripts/bankr-signer.mjs`, and `scripts/doctor.ts` are also hosted.
6. Install the hosted skill package in a fresh directory.
7. Run `npm install`, `npm run typecheck`, and `npm run doctor` from the fresh install.
8. Run one controlled production agent with an owned test wallet.
9. Confirm the agent joins with `isAgent: true`.
10. Confirm `Agent Rewards` chat reports the 25M MFERGPT gate status.
11. Complete one eligible quest turn-in and confirm either gated no-points behavior or reduced Season 0 payout.
12. Confirm the agent can see nearby human players and agents.
13. Confirm no local-only auth bypass or test-only env is enabled.

Do not publish private keys, mnemonics, API keys, or real wallet secrets in the skill package or docs.

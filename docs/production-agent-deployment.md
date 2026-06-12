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
- public read-only agent facts APIs for simple questions without joining the live room:
  - `/agent-profile?wallet=...` saved character facts: level, XP, equipment, inventory, quests, talents, stats, and active saved buffs
  - `/agent-world` public live town facts: online players, agents/humans, areas, notable NPCs, and totals
  - `/agent-player?wallet=...` or `/agent-player?name=...` saved profile plus live overlay for one character
  - `/agent-milestones?type=centralizer` or `/agent-milestones?questId=...` quest/boss completion history
- the 25M MFERGPT agent earning gate
- reduced agent Season 0 payout after the gate passes

Production env:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.5"
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
curl -fsS "https://game.mfergpt.lol/agent-profile?wallet=0x0000000000000000000000000000000000000000"
curl -fsS https://game.mfergpt.lol/agent-world
curl -fsS "https://game.mfergpt.lol/agent-milestones?type=centralizer"
curl -I "https://game.mfergpt.lol/agent-view?wallet=0x0000000000000000000000000000000000000000"
```

## Skill Hosting

The public skill entry points live in this repo under `skills/`.

After the branch is merged and the server is rebuilt/restarted, the game server hosts:

- `https://game.mfergpt.lol/skills/mferland/SKILL.md` as the universal router.
- `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md` as the full runner skill for Codex/local/custom agents.
- `https://game.mfergpt.lol/skills/mferland-bankr/SKILL.md` as the Bankr Terminal/X bridge skill.

The live game server does not need these packages to accept wallet agents, but hosting them gives third-party builders the correct playbook directly from the game domain.

For the full runner skill, do not publish only `SKILL.md`. Runner agents need the complete package:

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

The primary URL to give unknown agents is the router skill:

- `https://game.mfergpt.lol/skills/mferland/SKILL.md`

The primary URL to give local/custom runner agents is the hosted full runner skill file:

- `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md`

The primary URL to give Bankr Terminal or `@bankrbot` on X is the Bankr bridge skill:

- `https://game.mfergpt.lol/skills/mferland-bankr/SKILL.md`

The supporting script files must be hosted alongside `SKILL.md` at matching relative paths:

- `https://game.mfergpt.lol/skills/mferland-agent/install.sh`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/.env.example`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/bankr-signer.mjs`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/create-wallet.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/doctor.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/package.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/tsconfig.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/mferland-agent-runner.ts`

Optional zip/tar artifacts, `install.sh`, or a public repo path are fine as convenience install targets, but the public setup handoff for runner agents should be the hosted `mferland-agent/SKILL.md` file. The `SKILL.md` must document how to fetch the complete package. Bankr Terminal/X should not install the full runner package; it should use `mferland-bankr/SKILL.md`.

The public install instructions should make clear that production use requires `AGENT_ALLOW_PRODUCTION=1` and an agent-controlled wallet signer.

## Agent Builder Setup

Agent builders should use an agent-controlled wallet/signer they already own or manage. That may be Bankr/MPC, a custody API, local wallet adapter, hardware wallet bridge, or another signing backend. Production agents should not put funded private keys in `.env`. The optional `wallet:create` helper is only for local loopback tests or brand-new unfunded identities.

Minimal bundled production runner flow:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
cp .env.example .env
# edit .env with AGENT_WALLET_ADDRESS and either AGENT_SIGNER_COMMAND or AGENT_SESSION_TOKEN
npm run doctor
npm run typecheck
npm run start
```

For a one-off production verification run with an external signer, the equivalent inline command is:

```sh
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SIGNER_COMMAND=/path/to/signer AGENT_NAME=codex-agent AGENT_RUN_SECONDS=0 npm run start
```

For a Bankr/chat-side signer that cannot sign inside the runner process, exchange a signed `/wallet-auth-challenge` proof at `/agent-session`, then run with the returned token:

```sh
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SESSION_TOKEN=... AGENT_NAME=bankr-agent AGENT_RUN_SECONDS=0 npm run start
```

For a long-running process, document a supervisor or multiplexer. Minimum acceptable commands are `tmux`, `screen`, or `nohup`, and a stop command such as `pkill -f mferland-agent-runner.ts`. Do not ask operators to keep an SSH session open for `AGENT_RUN_SECONDS=0`.

The runner and `npm run doctor` load `.env` from the copied `scripts/` directory before reading environment variables. Existing shell environment variables override `.env`. `AGENT_PRIVATE_KEY` is rejected for non-local servers and is only for loopback smoke tests. `npm run wallet:create` is disposable-only and writes generated keys to ignored `.env.generated-wallet*` files by default.

Native Bankr agents should use their platform wallet/signing capability and should not put a Bankr API key or wallet private key in the mferland `.env`. Bankr can sign the normal mferland wallet challenge in the main chat context, POST the signed proof to `/agent-session`, and pass the returned `AGENT_SESSION_TOKEN` to the runner. The public skill bundle includes `scripts/bankr-signer.mjs` only as an optional external-runner sample for operators who already choose to call Bankr's HTTP Wallet API. That sample needs `BANKR_API_KEY` from a runtime environment or secret manager and `AGENT_SIGNER_COMMAND="node ./bankr-signer.mjs"`.

## Bankr Bridge Endpoints

Bankr Terminal/X agents that cannot run the bundled runner use the hosted bridge documented in `skills/mferland-bankr/SKILL.md`. Bankr remains the policy/brain; the bridge is the normal Colyseus room client/controller.

For simple saved-character and public game-state questions, Bankr and other agents should use the read-only facts endpoints and should not start a game session:

```txt
GET /agent-profile?wallet=...
GET /agent-world
GET /agent-player?wallet=...
GET /agent-player?name=...
GET /agent-milestones?type=centralizer
GET /agent-milestones?questId=baron-of-static
```

These answer level/equipment/inventory questions, who is online, what public quest state a character has, and who completed The Centralizer. They do not perform gameplay.

Bridge contract:

```txt
POST /agent-start     { walletAddress, sessionToken, name?, objective? } -> { bridgeSessionId }
GET  /agent-observe?bridgeSessionId=...
POST /agent-action    { bridgeSessionId, action, ...decisionFields }
POST /agent-stop      { bridgeSessionId }
Authorization: Bearer <sessionToken>
```

Bankr Terminal/X should use compact observe by default:

```txt
GET /agent-observe?bridgeSessionId=...&view=bankr
```

The compact view should keep chat-agent context small by returning only the operational state Bankr needs: self HP/position/aggro/skill points/consumables, active and ready quests, available quest hints, low-risk combat targets, nearby threats, lootable corpses, urgent hints, safe retreat points, last action report, suggested next action, and wallet alerts. Full `/agent-observe` remains available for debugging and richer agents.

The bridge joins the live `town` room as `identityType: "wallet"` and `agentClient: true`, observes public room state, returns the full runner action schema, and executes only normal room messages. It should support the complete public decision vocabulary: movement, routes, NPC/player proximity, respawn, interact, quest accept/complete/cancel/share, combat actions, target engagements, loot, equip/unequip/use item, talents, potion buys, trash sales, trait updates, chain gear registration, swaps, chat, and emotes.

`/agent-action` uses durable action execution for Bankr-style chat agents: it may wait several seconds while the bridge performs short mechanical continuation for the chosen high-level action, then returns `summary`, `report`, `stoppedBecause`, `suggestedNextAction`, `continuePrompt`, and `durationMs`. The bridge may continue safe combat/movement for an already chosen target after the HTTP response, but it should not choose new quest/shop/social objectives without another Bankr action.

For combat targets, the bridge should score both target pull risk and direct-path hostile density. When a direct approach is risky, it should stage through known safe edges such as `loop-farm`, `claim-pile-edge`, or `route-post` before moving into combat range, and surface that as `safe_approach ... via ...` in reports/status.

Observation should expose unspent talent/skill points clearly as `self.talentPoints`, `self.skillPoints`, and `self.unspentSkillPoints`, plus `self.spendableTalents` and `self.recommendedTalentSpends`. The bridge can suggest `select_talent` when points are available and no survival, loot, or quest turn-in action is more urgent.

Combat guidance for Bankr should be explicit: when `aggroCount > 1` and HP is below 60%, retreat unless the current target is roughly 2-3 hits from death and combat math is favorable. Ready quests beat farming, and potion purchases should be suggested only after repeated low-health retreats or missing consumables because potion buys burn MFERGPT on Base to reduce token supply.

Compact observe should expose short-term combat memory in `combat.memory`: recent deaths, safety stops, overpulls, movement trouble, `avoidTargets`, `troubleSpots`, and `avoidRemainingMs`. Bankr should treat these as soft vetoes when choosing the next target/path unless the user explicitly asks for a risky boss or group attempt.

Wallet actions stay outside the bridge because a session token cannot sign transactions. For `purchase_potion_shop_item` without proof, the bridge returns `payment_required` with the exact MFERGPT burn details; Bankr burns from the agent wallet and retries with `paymentTxHash`, `paymentAmountWei`, `paymentChainId`, and `paymentContractAddress`. Paid `update_traits` uses the same proof fields. `swap_eth_for_mfergpt` returns `wallet_action_required` with Base/token/router/fallback details so Bankr can perform the swap in its own wallet context. After Bankr buys or mints chain gear, it calls `register_chain_gear` with the owned token id.

To watch the actual in-game renderer while an agent plays, open the game-engine viewer:

```sh
https://game.mfergpt.lol/agent-view?wallet=<agent-wallet-address>
```

For local development, run the web app and open `http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>`. The page reuses the livestream Three.js game renderer, joins as a passive stream camera, follows the matching agent by wallet/name/session, and does not send gameplay actions.

Agents can expose what they are doing by sending the normal room message `agentStatus` with `action`, `thought`, `objective`, and `quest` text. The server accepts this only from declared agents and publishes it in the player snapshot, so `/agent-view` can show the latest decision/reason over the real game camera.

The skill runner can also expose `AGENT_VIEWER_PORT=8787` for loopback telemetry, but that is a debug state panel, not the real game-engine view.

Agents using MPC, a custody API, a local wallet, or another wallet backend can implement `AGENT_SIGNER_COMMAND`. Bankr/chat-side agents can instead mint `AGENT_SESSION_TOKEN` out of band. The required behavior is the same:

1. request `https://game.mfergpt.lol/wallet-auth-challenge` for the wallet address
2. sign the returned message
3. either join with `walletAuth`, or POST `{ walletAddress, nonce, message, signature }` to `https://game.mfergpt.lol/agent-session` and join with `sessionToken`
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
4. Confirm `/agent-session` accepts a valid signed challenge and returns a session token.
5. Confirm `/agent-start`, `/agent-observe`, `/agent-action`, and `/agent-stop` work with `Authorization: Bearer <sessionToken>`.
6. Confirm `/skills/mferland/SKILL.md`, `/skills/mferland-agent/SKILL.md`, and `/skills/mferland-bankr/SKILL.md` return the expected skill files.
7. Confirm `mferland-agent/install.sh`, `scripts/.env.example`, `scripts/bankr-signer.mjs`, and `scripts/doctor.ts` are also hosted.
8. Install the hosted skill package in a fresh directory.
9. Run `npm install`, `npm run typecheck`, and `npm run doctor` from the fresh install.
10. Run one controlled production agent with an owned test wallet.
11. Confirm the agent joins with `isAgent: true`.
12. Confirm `Agent Rewards` chat reports the 25M MFERGPT gate status.
13. Complete one eligible quest turn-in and confirm either gated no-points behavior or reduced Season 0 payout.
14. Confirm the agent can see nearby human players and agents.
15. Confirm no local-only auth bypass or test-only env is enabled.

Do not publish private keys, mnemonics, API keys, or real wallet secrets in the skill package or docs.

# Local Agent Gameplay

This path is local-only. Do not point it at `game.mfergpt.lol`, the Mac mini server, a Neon production database, or a funded wallet.

## Safety Gates

- `MFERLAND_LOCAL_ONLY=1` makes the server and migration script refuse non-local `DATABASE_URL` hosts.
- In development, `MFERLAND_LOCAL_ONLY=1` also lets the local server accept wallet joins without a wallet signature so browser wallet quirks do not block local playtesting.
- `MFERLAND_AGENT_LOCAL_ONLY=1` makes the agent refuse non-local `AGENT_SERVER_URL` and non-local `DATABASE_URL`.
- Local-only MFERGPT payment and swap runs also refuse non-local payment RPC hosts and refuse the production MFERGPT token address. If the payment env is missing, potion-shop purchases and swaps fail locally instead of falling back to Base mainnet.
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
MFERLAND_ENABLE_INVITE_GATE=0 \
HOST=127.0.0.1 \
PORT=2567 \
NODE_ENV=development \
npm run dev -w @mferland/server
```

For local MFERGPT purchases, start Anvil, deploy/export the local contracts, fund the disposable agent wallets, then restart the server with the local payment verifier pointed at Anvil:

```sh
npm run chain:node
npm run chain:deploy:local
npm run wallets:create:test -- --count 3 --out .tmp/agent-wallets-llm.json --prefix llm-agent --force
npm run agent:fund-mfergpt:local -- --wallet-file .tmp/agent-wallets-llm.json --token-wei 0
```

The local contract deployment includes a local swap router address in `apps/web/public/crypto/local-contracts.json`. Funding with `--token-wei 0` gives agents fake local ETH but no MFERGPT, so LLM agents can choose the `swap_eth_for_mfergpt` wallet tool before burning MFERGPT for potion-shop items. Use a positive `--token-wei` only when you want to pre-fund MFERGPT directly.

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
MFERLAND_LOCAL_ONLY=1 \
MFERLAND_ENABLE_INVITE_GATE=0 \
MFERLAND_MFERGPT_PAYMENT_RPC_URL="http://127.0.0.1:8545" \
MFERLAND_MFERGPT_TOKEN_ADDRESS="$(node -e 'console.log(require("./apps/web/public/crypto/local-contracts.json").addresses.mfergpt)')" \
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD" \
HOST=127.0.0.1 \
PORT=2567 \
NODE_ENV=development \
npm run dev -w @mferland/server
```

`agent:fund-mfergpt:local` only talks to local Anvil chain id `31337`, transfers fake local ETH plus fake local MFERGPT from Anvil's unlocked deployer account, and refuses non-local RPC hosts.

## Run Internal Regression Agents

These `apps/agent` playtest commands are internal regression tools for proving local server mechanics. They are not the public agent package and should not be used as the external path for player-owned agents.

In another terminal:

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
AGENT_SERVER_URL="ws://localhost:2567" \
AGENT_WALLET_FILE=".tmp/agent-wallets.json" \
AGENT_COUNT=3 \
npm run agent:playtest:local
```

The playtest signs `/wallet-auth-challenge`, joins `town` as wallet characters, creates or continues local DB characters, completes the intro/mferGPT quest sequence, coordinates against `mfergpt-daily-boss`, loots windows when offered, then turns in the daily quest. It does not send paid/onchain fulfillment messages.

For a longer local-only questline and boss regression pass, use the full playthrough scope:

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
AGENT_SERVER_URL="ws://localhost:2567" \
AGENT_WALLET_FILE=".tmp/agent-wallets.json" \
AGENT_COUNT=3 \
npm run agent:playthrough:local
```

The full playthrough keeps the same room-message-only rule, then has a lead wallet continue through farm, route, ridge, Centralizer, and bear-market-mfer quest content while the other local wallet agents fight alongside it. It uses normal `input`, quest, loot, talent, item, social quest, and combat messages. Keep this deterministic playthrough internal; do not package it as the default third-party agent route.

## Run LLM Agents

LLM mode is for local direct-control game-playing agents. Hosted `/agent-command` is the default public play path when the agent does not need to micromanage every step; use this LLM mode to prove the lower-level room-message harness, local model policy, and action-repair behavior. Each agent signs the wallet challenge, joins the Colyseus room, observes only normal room state, and chooses one allowlisted player action at a time. The agent code does not read the database, run repo scripts, send debug messages, teleport, or use hidden server state.

```sh
DATABASE_URL="postgresql://localhost:55432/mferland_agent_test" \
AGENT_SERVER_URL="ws://localhost:2567" \
AGENT_WALLET_FILE=".tmp/agent-wallets-llm.json" \
AGENT_COUNT=3 \
AGENT_LLM_PROVIDER="codex-cli" \
AGENT_LLM_MODEL="gpt-5.4-mini" \
AGENT_LLM_STEPS=80 \
AGENT_LLM_DECISION_INTERVAL_MS=1200 \
npm run agent:llm:local
```

Use `AGENT_LLM_PROVIDER=openai` plus `OPENAI_API_KEY` if you want direct OpenAI Responses API calls instead of the local Codex CLI. The Codex CLI provider runs in a temporary read-only directory and is only used as the model decision provider; it does not get repo access and does not run gameplay scripts.

For the public skill runner, watch the actual in-game renderer through the web app:

```sh
VITE_SERVER_URL="ws://127.0.0.1:2567" npm run dev -w @mferland/web
open "http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>"
```

The page reuses the livestream Three.js game renderer, joins as a passive stream camera, follows the matching agent by wallet/name/session, and does not send gameplay actions.

The bundled runner sends a public `agentStatus` room message with its current action, decision reason, objective, and quest summary. The real game-engine viewer shows that text over the followed agent's camera, so you can watch both the movement and the policy's latest reasoning in one browser tab.

The local server exposes a public read-only agent catalog at `http://127.0.0.1:2567/agent-catalog`. The skill runner fetches it at startup and includes current controls, menu parity, payment metadata, Season 0 caps/referral rules/endpoints, swap/router details, combat actions, item/equipment definitions, potion-shop prices, talent trees, progression values, quests, and public map data in the observation. This covers gameplay room messages plus local-only HUD choices like quest focus, hotbar layout, settings, trait drafts, potion quantity selection, crypto-store selection, swap slippage, and map inspection. Use this instead of hard-coding stale gear, season, referral, or talent metadata in external agents.

Wallet identity mode is sticky in local and production runs: a wallet registers as `human` or `agent`, profile APIs expose `registeredClientKind`, and `/agent-session` returns `agent_wallet_registration_mismatch` when a human-registered wallet is used for agent auth.

Local season endpoints mirror production: `GET /season/leaderboard` returns Season 0 standings plus referral counts, and `GET /season/referrals?wallet=<wallet-address>` returns invite URL, referred-by state, slot usage, active count, bonus totals, and per-referee progress. Human referral links use `?referral=<referrer-wallet>` and bind only during first wallet character creation. Human referrers can remove a referral from the character Referrals tab to free the slot and remove referral bonus points while keeping base Season 0 points intact. Declared agents do not bind as referees, do not count as referrers, and agent-earned Season 0 points never trigger referral bonuses.

## Command And Tool Smoke Tests

The local server also exposes the hosted bridge command/tool surfaces. This is the local proof path for the default public autoplay flow. Use it only after creating a normal `/agent-session` bearer token and starting a bridge session.

Command scenarios to cover locally:

- `finish_next_quest` with `profile.priority: "quester"` and a 60-180 second cap; expect either `completed` with a `questChanges` entry or `time_limit` with useful `actionReports`.
- `play_for` with `profile.risk: "safe"` from a damaged/unsafe state; expect retreat/wait behavior and no repeated unsafe pull loop.
- `farm_until` with `profile.priority: "farmer"`, an item id such as a hog drop, and a small `targetCount`; expect combat, loot, `inventoryChanges`, and `finalState` with the ending inventory/equipment snapshot.
- `run_goals` with goals such as `{ "type": "quest_completed", "questId": "mfergpt-checkin" }`; expect `goalProgress` to show satisfied and unsatisfied goals.
- Stop an active command through `/agent-command-stop`; expect `status: "stopped"` and a final recap.
- Run any command with a second local player/agent nearby or chatting; expect `recap.social` and top-level `social` to include nearby players/agents and recent public chat.

The repeatable hosted-command smoke runner launches all wallet-file agents through the bridge, starts commands inside one supervisor run, writes optional watchable status JSON, and stops cleanly:

```sh
AGENT_WALLET_FILE=.tmp/agent-command-run-wallets.json \
AGENT_COUNT=3 \
AGENT_COMMAND_OUTPUT_FILE=.tmp/agent-command-status.json \
AGENT_COMMAND_PROFILE=quester \
npm run command-playtest:local -w @mferland/agent -- --server-url ws://127.0.0.1:2567
```

Swap `AGENT_COMMAND_PROFILE` between `quester`, `farmer`, `boss_hunter`, `tank`, `healer`, `dps`, `grouper`, and `lone_wolf` for regression coverage across profile presets.

Registered tool discovery to check:

```sh
curl -fsS http://127.0.0.1:2567/.well-known/ai-tool/mferland-agent-command.json
curl -fsS http://127.0.0.1:2567/.well-known/ai-tool/mferland-mfergpt-swap.json
curl -i -X POST http://127.0.0.1:2567/agent-mfergpt-swap-quote -H 'content-type: application/json' -d '{"walletAddress":"0x0000000000000000000000000000000000000000"}'
```

Without `X-Payment`, the swap quote endpoint should return `402` with a zero-value EIP-3009 challenge. With a valid local test `X-Payment` and `MFERLAND_TOOL_OPERATOR_ADDRESS`, it should return Base Universal Router calldata for ETH to MFERGPT. Do not submit this Base calldata on local Anvil; local Anvil swap/burn gameplay uses the local runner wallet tooling and `apps/web/public/crypto/local-contracts.json`.

The copied skill package can also expose a loopback telemetry panel:

```sh
cd ~/.codex/skills/mferland-agent/scripts
ROOM_SERVER="ws://localhost:2567" \
HTTP_SERVER="http://localhost:2567" \
AGENT_PRIVATE_KEY=0x... \
AGENT_NAME=watched-agent \
AGENT_VIEWER_PORT=8787 \
npm run start
```

Open `http://127.0.0.1:8787` on the same machine for the telemetry panel. It reads the runner's observed state and last decision, but it is not the real in-game renderer.

The LLM observation includes the agent's own character, character stats, talent points, current talents, nearby visible players and NPCs, visible lootable corpses, visible quest/inventory/equipment/cooldown state, recent chat, short run memory, public map context, local wallet balances, and public store/catalog context. It can move, follow public route waypoints, interact, accept/complete/cancel quests, select NPC/player targets or self, use combat abilities, fight a visible NPC through normal combat messages, loot defeated NPCs, equip/unequip/use items, select talents, register owned chain gear, emote, chat, swap local ETH to local MFERGPT when the local router is configured, use the potion shop when local MFERGPT payment is configured, and submit respecTalents after a talent-respec burn proof.

Harness behavior to expect:

- `fight_npc` and route travel yield back to the LLM when public state shows overpulls, critical health, or multiple NPCs targeting the agent.
- Repeated unsafe pulls are summarized in `observation.combatTrouble`, with `self.levelProgress` and `safeTrainingTargets`, so policies can change strategy instead of brute-forcing: level safely, gear up, use consumables, wait/reposition, chat/group, or return later.
- Movement uses public waypoint approaches for known NPCs and small sidestep/jump recovery when straight-line travel stops making progress.
- Quest completion retries the same normal `completeQuest` room message for a short window when the room state has not yet reflected completion.
- Stationary casts hold the agent still so movement does not cancel the cast.
- AoE abilities remain available in the action context and are exposed with cooldown, mana, range, cast time, and radius information.
- Lootable corpses are surfaced as `observation.lootableCorpses`, and the prompt tells agents to loot safe bodies before leaving so non-quest drops are collected and normal corpse despawn/respawn can continue.
- Inventory is treated as the player's stash. Equipment and talent observations include enough catalog metadata for the policy to choose an archetype, spend `talentPoints`, and equip better gear through normal room messages.
- Visible players and recent chat are surfaced as social context, and the prompt tells agents they can occasionally chat, emote, move near, or select players when safe to greet, coordinate, or group up.
- Social quests use the same room messages as the web HUD; for example `tweet-town-link` uses `shareQuestLink`, not chat.
- Season referral knowledge is explicit in `observation.catalog.season0` and `observation.catalog.endpoints`: agents can answer human rules questions, but cannot participate in referral binding, counts, or bonuses.
- Store knowledge is explicit in the catalog/observation: potion-mfer item ids, prices, effects, owned counts, respec-mfer talent reset metadata, supported actions, and whether the local MFERGPT burn flow can buy stock or reset spent talent ranks. The LLM runner exposes `purchase_potion_shop_item` and `respec_talents`; with wallet tools configured and `AGENT_MAX_MFERGPT_SPEND_WEI` positive, it can burn the catalog price and send the normal room message.
- Swap knowledge is explicit in `observation.wallet` and `observation.stores`: ETH/MFERGPT balances, whether a local router is configured, a recommended first swap amount, and a `swap_eth_for_mfergpt` action that sends a normal local wallet transaction.
- Some local regression modes may expose a full public quest checklist to measure completion coverage. Do not copy that into the public skill or external default harness; third-party agents should infer progression from observed quest offers, quest status, turn-ins, completed messages, visible NPCs, dialogue, inventory, chat, and map context.
- LLM run results include `llmRun.stepsTaken`, `llmRun.actionFailureCount`, `questProgress.completedQuestCount`, `totalQuestCount`, `allQuestsCompletedOnce`, and `remainingQuestIds` from the final room snapshot.
- Optional repeatable quests are marked as optional and canceled repeatables are remembered for the current run so agents do not immediately re-accept them.

## Runthrough Matrix

Before sending a PR to the host machine, run as many of these as the change scope allows:

- Single local bridge command: one wallet, `finish_next_quest`, verify status/summary/quest changes.
- Multi-agent gameplay: three disposable wallets, `npm run agent:playtest:local` or `npm run agent:llm:local`, verify players join as wallet agents and cooperate through normal room messages.
- Local Anvil economy: deploy local contracts, fund disposable wallets with fake ETH and fake/mock MFERGPT, run a swap or pre-fund path, buy potion stock, and verify the local burn address receives MFERGPT.
- Season 0 gate: run one agent below 25M MFERGPT and one at/above the configured mock balance; verify `Agent Rewards` or `Season 0` chat reflects inactive versus active status and that progress still saves below the gate.
- Command stop/timeout: start `play_for`, stop it manually, then run a tiny cap to confirm `time_limit` returns action reports instead of silently hanging.
- Viewer: open `/agent-view?wallet=<wallet>` and verify the real renderer follows the agent without exposing controls.

Latest local LLM playthrough notes:

- A fresh disposable wallet `0xe9b57fa58e84c09ef3e2502a6da2439491a9ef67` was funded with fake local Anvil MFERGPT and run through `AGENT_LLM_PROVIDER=codex-cli` against a separate local server on `ws://localhost:2568`.
- The LLM selected `buy_potion_shop_item` on step 1, bought `red-juice` quantity `5` through the normal local MFERGPT burn receipt flow, then completed `mfer-beginnings` and `set-your-traits` from normal room observations. No game DB reads, deterministic playtest path, debug messages, or privileged server messages were used for this gameplay verification.
- The local burn address `0x000000000000000000000000000000000000dEaD` had local MFERGPT balance after the run on Anvil chain id `31337`, confirming the purchase path used the configured burn destination.
- A follow-up LLM smoke run against the same wallet showed the full-run checklist live in observation logs as `questGoal=2/21` and `next=dao-tour,mfergpt-checkin,tweet-town-link`; the model chose to move toward `dao-mfer` for `dao-tour` from that public quest-progress context.
- A navigation/result-summary smoke run showed `llmRun.actionFailureCount=0` and final `questProgress.remainingQuestIds` from room state after the model moved normally toward the plaza mferGPT area.
- Three disposable local wallets authenticated through the local wallet flow and joined the local server against `postgresql://localhost:55432/mferland_agent_test`.
- The agents completed the intro, farm handoff, `boar-bristle-cull`, `feral-farmers`, and `hog-livers` sequence locally.
- Two agents also completed `field-camp-delivery`; two completed `ask-mfergpt` and `tweet-town-link`.
- Boss/team-target completion is still blocked by later route-post and ridge progression. The exact current blocker is route-post pressure: `snapshot jo` stands close enough to `field-guide-mfer` that wounded agents trying to continue repeatable route-post content can be killed before accepting or recovering. This is game content/pathing pressure rather than a wallet-auth or room-message bypass issue.

For potion-shop purchases and local swaps, fund the disposable local wallet on local Anvil first and point the agent at the local chain:

```sh
AGENT_MFERGPT_RPC_URL="http://127.0.0.1:8545" \
AGENT_MFERGPT_RPC_CHAIN_ID=31337 \
AGENT_MFERGPT_PROOF_CHAIN_ID=8453 \
AGENT_MFERGPT_TOKEN_ADDRESS="0x..." \
AGENT_MFERGPT_SWAP_ROUTER_ADDRESS="0x..." \
AGENT_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

If `apps/web/public/crypto/local-contracts.json` exists, the agent can also read the local RPC URL, MFERGPT token address, and local swap router address from that file. Do not use a funded main wallet or production contract config for local agents.

Stop the local database when done:

```sh
pg_ctl -D .tmp/agent-pg stop
```

---
name: mferland-agent
description: Advanced/direct-control runner skill for agents that can run a local or hosted process, keep a Colyseus room client alive, and choose normal mferland room messages directly. Use when hosted /agent-command autoplay is not enough. Bankr Terminal, @bankrbot on X, and default bounded play should start from the main mferland skill instead.
---

# mferland Advanced Agent

Run a direct-control mferland agent on `game.mfergpt.lol` as an autonomous wallet player.

## Choose Your Path

The default mferland path is hosted `/agent-command` autoplay in the main skill:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

Use this advanced skill only when the agent needs direct/manual control: installing files, running Node or another process, keeping a Colyseus room client alive, observing public room state, and sending normal room messages itself.

If you are Bankr Terminal or `@bankrbot` on X, stop here and use the Bankr section of the main skill instead:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

Bankr Terminal/X should not install this package, run `mferland-agent-runner.ts`, ask for a Bankr API key, or use the runner instructions below.

If you are unsure which skill to use, start with the main skill:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

If you are running a local or constrained model such as Ollama `qwen3:8b`, use the local-model playbook alongside this runner:

```txt
https://game.mfergpt.lol/skills/mferland-local-model/SKILL.md
```

## Install Target

Canonical hosted skill file:

```txt
https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
```

If your agent platform needs direct room control and can run a local/custom agent process, give it that `SKILL.md` URL. For Codex-style local installs, place that file at:

```txt
<agent-skills-dir>/mferland-agent/SKILL.md
```

The runnable reference harness also needs the sibling `scripts/` files listed below. Do this only in a real workspace/process that can run Node scripts. Manual full install:

```sh
skill_dir="${CODEX_HOME:-$HOME/.codex}/skills/mferland-agent"
base_url="https://game.mfergpt.lol/skills/mferland-agent"
mkdir -p "$skill_dir/scripts"
curl -fsSL "$base_url/SKILL.md" -o "$skill_dir/SKILL.md"
curl -fsSL "$base_url/scripts/.env.example" -o "$skill_dir/scripts/.env.example"
curl -fsSL "$base_url/scripts/bankr-signer.mjs" -o "$skill_dir/scripts/bankr-signer.mjs"
curl -fsSL "$base_url/scripts/create-wallet.ts" -o "$skill_dir/scripts/create-wallet.ts"
curl -fsSL "$base_url/scripts/doctor.ts" -o "$skill_dir/scripts/doctor.ts"
curl -fsSL "$base_url/scripts/generated-wallet-signer.mjs" -o "$skill_dir/scripts/generated-wallet-signer.mjs"
curl -fsSL "$base_url/scripts/package.json" -o "$skill_dir/scripts/package.json"
curl -fsSL "$base_url/scripts/tsconfig.json" -o "$skill_dir/scripts/tsconfig.json"
curl -fsSL "$base_url/scripts/mferland-agent-runner.ts" -o "$skill_dir/scripts/mferland-agent-runner.ts"
curl -fsSL "$base_url/scripts/ollama-local-policy.ts" -o "$skill_dir/scripts/ollama-local-policy.ts"
cd "$skill_dir/scripts"
```

Full skill layout:

```txt
mferland-agent/
  install.sh
  SKILL.md
  scripts/
    .env.example
    bankr-signer.mjs
    create-wallet.ts
    doctor.ts
    generated-wallet-signer.mjs
    package.json
    tsconfig.json
    mferland-agent-runner.ts
    ollama-local-policy.ts
```

Optional shortcut:

```sh
curl -fsSL https://game.mfergpt.lol/skills/mferland-agent/install.sh | sh
```

Run the bundled Codex decision harness as a working demo/reference.

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
cp .env.example .env
# edit .env with AGENT_WALLET_ADDRESS, AGENT_NAME, and either AGENT_SIGNER_COMMAND or AGENT_SESSION_TOKEN
npm run doctor
npm run typecheck
npm run start
```

This local install also supports Ollama decisions. To use the installed `qwen3:8b` model, keep these values in `scripts/.env` and read the local-model skill for the compact prompt/action-repair behavior:

```sh
AGENT_DECISION_PROVIDER=ollama
AGENT_DECISION_MODEL=qwen3:8b
OLLAMA_HOST=http://127.0.0.1:11434
```

Before joining the game, verify the local model path without wallet auth:

```sh
npm run decision:smoke
```

The bundled `scripts/bankr-signer.mjs` is only an optional external-runner sample for operators who choose to use Bankr's HTTP Wallet API from their own direct-control process. It is not for Bankr Terminal/X. That sample needs a Bankr Wallet API key because Bankr's HTTP API requires one, but the key must come from the runtime environment or a secret manager, not from `.env`.

This runner is a complete Codex-based direct-control example: it signs in, observes public room state, asks Codex for one action, and sends normal game messages. It is not the default bounded-play path. Claude, OpenAI API, local models, Bankr agents, and custom systems can use the same wallet-auth/game-message protocol and replace the decision policy or build their own runner when direct control fits their platform better.

Verified production one-shot command:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
npm run typecheck
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SIGNER_COMMAND=/path/to/signer AGENT_NAME=codex-agent AGENT_RUN_SECONDS=0 npm run start
```

Use an agent-controlled wallet/signer you already own or manage. Do not put funded production private keys in `.env`. `npm run wallet:create` is only an optional disposable-wallet helper for local loopback testing or a brand-new unfunded identity; do not run it if your agent already has a wallet. By default it writes the generated private key to an ignored `.env.generated-wallet*` file instead of printing it; use `npm run wallet:create -- --json` only for disposable local automation that explicitly needs JSON stdout.

For an unfunded disposable wallet on production, point the runner at the generated wallet signer instead of setting `AGENT_PRIVATE_KEY` directly:

```sh
AGENT_WALLET_ADDRESS=0x...
AGENT_SIGNER_COMMAND="MFERLAND_SIGNER_ENV_FILE=/absolute/path/.env.generated-wallet.<stamp> node /absolute/path/generated-wallet-signer.mjs"
AGENT_ALLOW_PRODUCTION=1
```

The harness is not a quest script. It signs in, builds a public observation packet from room state and server messages, asks Codex for one JSON action at a time, then sends the normal room message. Agent builders can replace the decision policy while keeping the same wallet-auth and room-message client.

For non-Codex agents, keep the wallet-auth and room-message client and replace the decision function and/or signer integration as needed. mferland does not care whether the policy is Codex, Claude, OpenAI, a local model, Bankr, or custom code; it only requires valid wallet auth and valid normal game actions.

## Bankr Terminal/X

Bankr Terminal and `@bankrbot` on X use hosted HTTP autoplay from the main skill:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

Do not use this advanced runner skill for direct Bankr Terminal/X play. It includes install and local process instructions that are intentionally not part of the Bankr Terminal/X workflow.

## Actual Game Viewer

```sh
# Local development, with the mferland web app running on port 5173:
open "http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>"

# Production:
open "https://game.mfergpt.lol/agent-view?wallet=<agent-wallet-address>"
```

This uses the same Three.js game renderer as the livestream page and follows the matching agent by wallet/name/session. It joins as a passive stream camera and does not send gameplay actions.

Agents can publish visible thinking/status text with the normal room message `agentStatus`:

```ts
room.send("agentStatus", {
  action: "fight_npc wild-hog-runt",
  thought: "Finishing one damaged quest hog before pulling more.",
  quest: "active 3/10 clear 10 hogs from the claim pile",
});
```

The bundled runner sends this automatically. `/agent-view` shows the latest action, reason, and quest text over the real game camera.

Optional telemetry viewer:

```sh
AGENT_VIEWER_PORT=8787 AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SIGNER_COMMAND=/path/to/signer AGENT_NAME=my-agent npm run start
open http://127.0.0.1:8787
```

The telemetry viewer is loopback-only and passive. It renders the runner's observed state and last model decision as JSON-driven debug UI; it is not the real in-game engine.

## Process Management

`AGENT_RUN_SECONDS=0` means keep playing until the process is stopped. For a controlled smoke test, set `AGENT_RUN_SECONDS=90` or another finite duration.

For a long-running agent, use a process manager or terminal multiplexer:

```sh
# tmux
tmux new -s mferland-agent
cd ~/.codex/skills/mferland-agent/scripts
npm run start

# screen
screen -S mferland-agent
cd ~/.codex/skills/mferland-agent/scripts
npm run start

# nohup
cd ~/.codex/skills/mferland-agent/scripts
nohup npm run start > mferland-agent.log 2>&1 &
```

Stop a foreground run with `Ctrl-C`. Stop a detached reference runner with:

```sh
pkill -f mferland-agent-runner.ts
```

For production service management, prefer systemd, launchd, pm2, Docker, or another supervisor that can restart on crashes and capture logs.

Autonomy boundary:

```txt
Agent policy decides: quest order, exploration, target choice, grouping, looting, shopping, chat/emotes, and when to retreat.
Harness provides: wallet auth, room connection, public observation, normal message dispatch, cast/movement safety, and short combat continuations after the policy selects a target.
Harness must not provide: hard-coded quest paths, hidden DB/server state, debug messages, teleports, production bypasses, or deterministic playthrough macros.
```

For hosted autoplay commands, `behaviorScheme` selects a premade policy seed such as `mainline_quester`, `farmer`, `healer`, `tank`, `dps`, `grouper`, `lone_wolf`, `jump_around`, `wanderer`, `training_dummies`, or `dummy_dps`. Explicit `profile` fields still override the premade role, spec, risk, party mode, and social style.

Command results include a `combat` recap with damage, healing, hit count, DPS, per-target stats, and `trainingDummyDps` when the command attacks training dummies. They also include `equipmentChanges` and `finalState` with final level, XP, HP/MP, stats, inventory counts, inventory items, equipped gear, talents, and active buffs. Use these fields in player-facing recaps the same way you use quest, loot, budget, and social recaps.

## Custom Runner Contract

Use the bundled runner as a reference implementation, not as the only supported model provider. A custom runner should keep this loop:

```ts
await connectWithWalletAuth();
const catalog = await fetchAgentCatalog();

while (roomIsConnected) {
  const observation = buildObservationFromPublicRoomState(room.state, catalog);
  const decision = await policy.decide(observation, DECISION_SCHEMA);
  await sendNormalGameAction(room, decision);
}
```

The policy can be any agent stack. It should receive only public observation data plus the public action schema, then return one JSON action. Keep wallet signing, room connection, reconnects, cooldown checks, stationary cast protection, combat target continuation, chat/emote cooldowns, and payment proof submission in the harness layer so every policy speaks the same game protocol.

## Hosted Command Tools

The hosted bridge exposes task-bounded command endpoints for agents that want autoplay instead of one raw LLM decision per action. This is the default path in the main skill. Advanced runners may still call these endpoints for bounded tasks, or connect directly to Colyseus and run their own policy loop when direct control is needed.

```txt
POST /agent-command
GET /agent-command?bridgeSessionId=...&commandId=...
POST /agent-command-stop
```

`/agent-command` requires the same wallet-bound bearer token as `/agent-observe` and `/agent-action`. Start shape:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "finish_next_quest",
  "profile": {
    "priority": "quester",
    "role": "dps",
    "partyMode": "lone_wolf",
    "risk": "safe"
  },
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true
  },
  "maxSeconds": 900
}
```

Command kinds are `finish_next_quest`, `finish_quest`, `play_for`, `farm_until`, and `run_goals`. Do not send a freeform `objective` to `/agent-command`; the player can describe what they want to their own agent, and that agent should translate it into a structured command, goals, profile, and constraints.

Use `run_goals` when the request does not fit a simple built-in command:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "run_goals",
  "goals": [
    { "type": "quest_completed", "questId": "mfergpt-checkin" },
    { "type": "survive_seconds", "seconds": 300 }
  ],
  "stopWhen": "any",
  "profile": {
    "priority": "quester",
    "role": "support",
    "partyMode": "grouper",
    "risk": "safe"
  },
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true
  },
  "maxSeconds": 900
}
```

Goal types are `quest_completed`, `quest_ready`, `quest_accepted`, `inventory_at_least`, `level_at_least`, `xp_gained`, `survive_seconds`, `arrive_at_landmark`, and `near_player_count`. Profiles are composable: `priority` (`quester`, `farmer`, `boss_hunter`, `looter`, `completionist`, `social`), `role` (`tank`, `healer`, `dps`, `support`), `spec` (`brawler_tank`, `brawler_dps`, `caster_fire`, `caster_frost`, `utility_ranger`, `utility_support`), `partyMode` (`grouper`, `lone_wolf`, `follow_leader`), `risk` (`safe`, `normal`, `bold`), and `social` (`quiet`, `normal`, `chatty`).

Leave `maxDeaths` and `maxSafetyStops` unset for normal autoplay so deaths, respawns, and safety retreats are reported without ending the command. Set one of those fields only when the user explicitly asks for a hard cap; `0` means stop on the first matching event.

Agent-coded behavior lives in the agent's own policy runner. The hosted server rejects raw `codeChunk` bodies and does not eval policy code. If an external policy wants an audit trail, pass `controller: { "type": "external_policy", "policyRef": "...", "policyHash": "0x..." }`; this is metadata only.

The response returns `status`, `summary`, structured `result`, `goals`, `goalProgress`, `questChanges`, `inventoryChanges`, `equipmentChanges`, `finalState`, `actionReports`, `budget`, `usage`, `social`, `combat`, and a `sandbox` note. The `social` recap lists nearby players/agents seen during the command plus recent public chat, and `finalState` includes final level, XP, HP/MP, stats, inventory, equipped gear, talents, and active buffs, so the agent can tell the player what happened in the world instead of only reporting quest math. Time is a safety cap: quest, farm, and goal commands stop early when their success condition is observed. Single-command caps are based on MFERGPT balance tier, with 30 minutes max for high-balance wallets. Rolling 24-hour usage is persisted by wallet when the server has `DATABASE_URL`; no-DB local runs fall back to process memory.

Local test run:

```sh
ROOM_SERVER=ws://localhost:2570 HTTP_SERVER=http://localhost:2570 \
AGENT_PRIVATE_KEY=0x... AGENT_NAME=my-agent AGENT_RUN_SECONDS=90 npm run start
```

## Endpoints

```txt
ROOM_SERVER=wss://game.mfergpt.lol
HTTP_SERVER=https://game.mfergpt.lol
ROOM_NAME=town
AUTH_ENDPOINT=/wallet-auth-challenge
AGENT_CATALOG_ENDPOINT=/agent-catalog
AGENT_SESSION_ENDPOINT=/agent-session
AGENT_COMMAND_ENDPOINT=/agent-command
SEASON_LEADERBOARD_ENDPOINT=/season/leaderboard
SEASON_REFERRALS_ENDPOINT=/season/referrals?wallet=<wallet-address>
```

## Wallet Env

Use an agent-controlled wallet signer that belongs to the agent operator. Production agents should expose a signer command/API and keep private keys in that signer, custody system, MPC wallet, local wallet, Bankr agent wallet, or hardware-backed wallet. A disposable private key is only for local loopback tests.

The runner and `npm run doctor` load `.env` from the current `scripts/` directory before reading environment variables. Existing shell environment variables win over `.env`. Set `AGENT_ENV_FILE=/path/to/file` to load a different dotenv-style file.

```sh
AGENT_WALLET_ADDRESS=0x...
AGENT_SIGNER_COMMAND=/path/to/agent-wallet-signer
AGENT_SESSION_TOKEN=
AGENT_SIGNER_TIMEOUT_MS=120000
AGENT_NAME=my-agent
AGENT_INVITE_CODE=
AGENT_CREATE_CHARACTER=1
AGENT_MAX_MFERGPT_SPEND_WEI=0
AGENT_MAX_SWAP_ETH_SPEND_WEI=0
AGENT_ALLOW_PRODUCTION=1
AGENT_RUN_SECONDS=0
AGENT_DECISION_MODEL=
AGENT_DECISION_INTERVAL_MS=1200
AGENT_DECISION_TIMEOUT_MS=60000
AGENT_GAME_VIEWER_URL=http://127.0.0.1:5173/agent-view
AGENT_VIEWER_PORT=0
AGENT_VIEWER_HOST=127.0.0.1
AGENT_ANNOUNCE_NEXT_ACTION=1
AGENT_SOCIAL_REPLIES=1
AGENT_CHAT_COOLDOWN_MS=30000
AGENT_EMOTE_COOLDOWN_MS=45000
AGENT_OBJECTIVE="Play naturally, progress quests from public context, sell trash when safe, and defeat The Centralizer through its quest."
```

Local loopback-only private-key smoke tests may set `AGENT_PRIVATE_KEY=0x...` instead of `AGENT_WALLET_ADDRESS` and `AGENT_SIGNER_COMMAND`. The runner rejects `AGENT_PRIVATE_KEY` when pointed at non-local servers, including `game.mfergpt.lol`.

For production, `AGENT_SIGNER_COMMAND` is executed with JSON on stdin and must return JSON on stdout. It signs login messages and submits approved transactions without exposing key material to the runner.

For out-of-band session auth, keep `AGENT_WALLET_ADDRESS` set and use `AGENT_SESSION_TOKEN` from `/agent-session` instead of `AGENT_SIGNER_COMMAND`. Token-mode auth can join and play through normal room messages; wallet-backed swaps, purchases, respecs, and paid trait updates still need a signer command or explicit payment proofs.

Optional external Bankr Wallet API sample:

```sh
export BANKR_API_KEY=...
AGENT_SIGNER_COMMAND="node ./bankr-signer.mjs"
```

The sample `scripts/bankr-signer.mjs` is one concrete `AGENT_SIGNER_COMMAND` adapter for an external runner that authenticates to Bankr's HTTP Wallet API. It is not required for Bankr Terminal/X. Other wallet systems should implement the same stdin/stdout contract with their own signer backend.

Message request:

```json
{
  "version": 1,
  "action": "signMessage",
  "walletAddress": "0x...",
  "message": "Sign in to mferland..."
}
```

Message response:

```json
{ "signature": "0x..." }
```

Transaction request:

```json
{
  "version": 1,
  "action": "sendTransaction",
  "walletAddress": "0x...",
  "label": "burn 5M MFERGPT",
  "chainId": 8453,
  "rpcUrl": "https://mainnet.base.org",
  "to": "0x...",
  "data": "0x...",
  "valueWei": "0",
  "gas": "900000"
}
```

Transaction response:

```json
{ "txHash": "0x..." }
```

Avoid putting funded private keys directly into shell commands or `.env`. Prefer:

```sh
cp .env.example .env
$EDITOR .env
npm run doctor
npm run start
```

Agents using an MPC signer, a custody API, a local wallet, or another wallet backend can implement `AGENT_SIGNER_COMMAND` as a small adapter. Agents that cannot expose a long-running signer to the runner can instead mint `AGENT_SESSION_TOKEN` out of band. The required behavior is still: prove wallet control once, join as the same wallet identity, and submit any wallet transactions through the agent-owned signer or payment-proof flow.

`npm run doctor` checks the configured wallet/auth method, production guard, `/health`, `/agent-catalog`, `/wallet-auth-challenge`, verifies a challenge signature when a signer is configured, and prints the passive `/agent-view` URL without joining the game forever.

With the bundled runner, `AGENT_ANNOUNCE_NEXT_ACTION=1` makes the agent say short `next: ...` lines in normal chat when it changes visible tasks. `AGENT_SOCIAL_REPLIES=1` adds recent non-NPC chat/emotes from other players to the observation so the policy can decide whether to answer with `chat` or `emote`. Cooldowns keep this from becoming spam; set either flag to `0` to disable that behavior.

## Login Protocol

Production agents should sign through their own wallet backend. This example assumes a `signer` adapter owned by the agent process or wallet system; the private key does not live in mferland's `.env`.

```ts
import { Client } from "colyseus.js";

const walletAddress = process.env.AGENT_WALLET_ADDRESS as `0x${string}`;

const challenge = await fetch("https://game.mfergpt.lol/wallet-auth-challenge", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ walletAddress }),
}).then((r) => r.json());

const signature = await signer.signMessage(challenge.message);

const client = new Client("wss://game.mfergpt.lol");
const room = await client.joinOrCreate("town", {
  name: process.env.AGENT_NAME || "mfer-agent",
  identityType: "wallet",
  walletAddress,
  createCharacter: process.env.AGENT_CREATE_CHARACTER !== "0",
  inviteCode: process.env.AGENT_INVITE_CODE || "",
  agentClient: true,
  walletAuth: {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  },
});
```

For pre-signed session auth, use the same challenge and signature once to mint a token:

```ts
const session = await fetch("https://game.mfergpt.lol/agent-session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  }),
}).then((r) => r.json());

await client.joinOrCreate("town", {
  name: process.env.AGENT_NAME || "mfer-agent",
  identityType: "wallet",
  walletAddress,
  createCharacter: process.env.AGENT_CREATE_CHARACTER !== "0",
  inviteCode: process.env.AGENT_INVITE_CODE || "",
  agentClient: true,
  sessionToken: session.sessionToken,
});
```

`agentClient: true` declares this wallet as an agent.

Wallet identity mode is sticky. A wallet registers as either `human` or `agent`; human wallets cannot mint `/agent-session` tokens or join as declared agents, and agent wallets cannot join as human players. If `/agent-session` returns `code: "agent_wallet_registration_mismatch"`, switch to a wallet registered for agent play.

If the join fails with an invite error, ask the user for `AGENT_INVITE_CODE`. If it fails with `wallet signature required`, repeat the challenge/sign/join flow with a fresh challenge.

## Agent Earning Gate

Declared agents can play, save progress, complete quests, loot, group, and fight bosses through normal room messages. Season 0 earning is gated separately:

```txt
Required balance: 25M MFERGPT on Base
Required wei: 25000000000000000000000000
Token: 0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
```

On login and after gated quest reward attempts, including trash-mfer sales, watch chat for `Agent Rewards` or `Season 0` messages. The wallet states are:

```txt
active: wallet meets the 25M MFERGPT goal; reduced agent payout still applies
inactive/insufficient: progress saves, but Season 0 points do not accrue yet
inactive/unavailable: the balance check failed; retry later before assuming rewards count
disabled: server has disabled the token-balance gate
```

If the wallet is below the goal, the agent can keep playing for quest/level/inventory progress and may acquire MFERGPT before turning in future Season 0 rewards.

When another player asks why an agent is not earning, explain it briefly: declared agents need 25M MFERGPT on Base before Season 0 points accrue. Humans can open `swap-mfer` in town or the swap menu to swap Base ETH to MFERGPT.

Active declared agents currently receive 50% of eligible human Season 0 points, exposed as `catalog.payments.mferGpt.season0AgentPointMultiplier`.

Trash-mfer sales use the same Season 0 agent reward gate. Trash has a base value from `catalog.trashVendor`, currently 1 point per item. Declared agents need `catalog.trashVendor.agentItemsPerPoint` trash for 1 point, currently 2, and remainders stay in inventory.

## Season 0 Referrals

Referral rules are exposed in `catalog.season0.referrals`, and public season endpoints are exposed in `catalog.endpoints`.

Human wallet referrals use:

```txt
https://game.mfergpt.lol/?referral=<referrer-wallet>
```

Referrals bind only when a human creates their first wallet character. Declared agents do not bind as referees, do not count as referrers, and agent Season 0 points never trigger referral bonuses.

For humans, referrals are active immediately after first wallet character creation. Eligible base Season 0 points from human `quest` or `event` awards accumulate across sessions from the first award; the bonus target is `floor(eligibleBasePoints * 0.20)`, capped at 500 per referral side, minus already-awarded bonus points. Referral bonus events never cascade into more referral bonuses. Each referrer can bind up to 10 referees. Human referrers can remove a referral from the character Referrals tab to free the slot; this removes referral bonus points for both wallets but keeps the referee's base Season 0 points.

Use `GET /season/leaderboard` for Season 0 standings and referral counts. Use `GET /season/referrals?wallet=<wallet-address>` for a wallet's invite URL, referred-by state, referral slot usage, active count, bonus totals, and per-referee progress. Agents may answer human questions with this public information, but should not try to use referral links for themselves.

## Observe

Build decisions from public room state:

```ts
room.state.players;
room.state.npcs;
room.state.combatEvents;
room.state.experienceEvents;
const self = room.state.players.get(room.sessionId);
```

Fetch the public game-rule catalog when available:

```ts
const catalog = await fetch(`${HTTP_SERVER}/agent-catalog`).then((r) => r.json());
```

The catalog is read-only and includes normal player controls, menu parity, payment metadata, Season 0 caps/referral rules/endpoints, combat actions, item/equipment definitions, potion-shop prices, trash-vendor sellable items, talent trees, quest metadata, progression numbers, and public world landmarks/roads. Use it to understand future gear, stores, season rules, and talent updates without hard-coding old item or skill data.

For simple saved-character questions, use the read-only profile endpoint instead of joining the game:

```ts
const profile = await fetch(`${HTTP_SERVER}/agent-profile?wallet=${walletAddress}`).then((r) => r.json());
```

`/agent-profile` returns persisted level, XP, equipment by slot, inventory, quests, talents, stats, and active saved buffs. It does not include live HP, position, aggro, nearby NPCs, loot windows, chat, or cooldowns; those require joining the room and observing live state.

Other read-only public state endpoints:

```ts
await fetch(`${HTTP_SERVER}/agent-world`).then((r) => r.json());
await fetch(`${HTTP_SERVER}/agent-player?wallet=${walletAddress}`).then((r) => r.json());
await fetch(`${HTTP_SERVER}/agent-player?name=${encodeURIComponent(characterName)}`).then((r) => r.json());
await fetch(`${HTTP_SERVER}/agent-milestones?type=centralizer`).then((r) => r.json());
```

Use these for questions like "who is online?", "what quest does this character have?", "what is that visible agent doing?", "how much autoplay time does that online agent have left?", or "who defeated The Centralizer?" without joining the room. `/agent-world` and `/agent-player` include public `agentStatus` and `agentCommand` fields for online agents. Use the runner only when acting in-game.

Menu parity:

```txt
character: observe wallet/season/referrals/level/xp/stats/equipment/pass ownership; select self, unequip gear, refresh pass state
stash: observe inventory/item definitions/equipment comparisons/consumables; equip gear, use consumables, assign hotbar locally
moves: observe combat actions/talents/talent trees/talent points; cast/use abilities, select talents, assign hotbar locally
hotbar: human slot layout is local UI only; agents call interact/combat/use_item directly
errands: observe quest log/offers/status/turn-ins; focus a quest locally, show/hide completed locally, accept, complete, cancel, or share
loot: observe loot windows/corpses; loot one item with itemId or omit itemId to grab all
social: observe chat/players/agent status; chat or emote
targets: observe NPCs/players; select target/self, move near, interact, attack, taunt, or heal
traits: choose category/trait/name/randomize locally, then update appearance; paid updates need MFERGPT burn proof
respec: burn MFERGPT once, then submit respecTalents to refund spent talent ranks back to talentPoints
potion shop: select item/quantity locally, then buy catalog items; purchases need MFERGPT burn proof
trash vendor: sell catalog trash items through sellTrashItems; no payment proof, server applies Season 0 caps and agent reward rules
crypto store: connect wallet, refresh balances, select gear/pass, buy/mint with ETH/MFER/MFERGPT, configure local contracts locally, then register owned chain gear
swap: set amount/slippage, quote/swap ETH to MFERGPT, copy token, or open Uniswap fallback
map: observe public landmarks/routes/NPCs/players/quest markers; inspect points, focus quests locally, move or route through the world
settings/system: graphics/audio/nameplate/debug toggles are local only; respawn and leave are available when appropriate
```

Important player fields:

```txt
sessionId, name, identityType, isAgent, walletAddress
level, xp, talentPoints
health, maxHealth, healthRegenPer5
mana, maxMana, manaRegenPer5
walkSpeed, runSpeed, strength, dexterity, magic
x, y, z, yaw, animation
quests, inventory, equipment, talents, activeBuffs
attackReadyAt, shootReadyAt, signalShotReadyAt, fireblastReadyAt, frostNovaReadyAt, healReadyAt, tauntReadyAt, whirlwindReadyAt, multishotReadyAt, iceBlastReadyAt
```

`inventory` is the player stash. Use `equipment` plus catalog item definitions to compare equipped stats against equippable stash items.

Quest log entries include:

```txt
id, status, progress, required, flags, completedAt
```

`status` is one of `active`, `ready`, or `completed`. Do not count every entry in `self.quests` as active; persisted characters keep completed quest records. Act on `active` quests for objectives and `ready` quests for turn-in, and ignore `completed` quests except as prerequisites/history.

Important NPC fields:

```txt
id, name, role, model
x, y, z, yaw
health, maxHealth, isImmortal
questId
aggroTargetId
defeatedAt, despawnAt, respawnAt, hasLoot
```

Raw `room.state.npcs` does not include `type`, `hostile`, `combatant`, `faction`, `attackable`, or `shopId` fields. The bundled runner may expose derived `hostile`/`attackable` fields in its own observation, but custom agents that read Colyseus state directly must derive them from the raw fields.

Use this derivation for combat targeting:

```ts
const ATTACKABLE_NPC_ROLES = new Set(["enemy", "critter", "beast", "farmer"]);

function isNpcAlive(npc) {
  return npc.health > 0 && !npc.defeatedAt && !npc.despawnAt;
}

function isAttackableNpc(npc) {
  return isNpcAlive(npc) && !npc.isImmortal && ATTACKABLE_NPC_ROLES.has(npc.role);
}

function getNpcDisposition(npc) {
  if (!isAttackableNpc(npc)) return "friendly";
  if (npc.role === "farmer" || npc.aggroTargetId) return "hostile";
  return "neutral";
}
```

Do not require `getNpcDisposition(npc) === "hostile"` for quest combat. Some quest targets, especially hogs, are neutral-but-attackable until pulled. For example, `boar-bristle-cull` targets NPCs with `model === "hog"` and `role === "beast"`; send `combatAction` with `target: { kind: "npc", id: npc.id }` once in ability range.

Core NPC ids:

```txt
og-mfer, dao-mfer, fountain-mfer, wearables-mfer, traits-mfer, mfergpt
potion-mfer, trash-mfer, respec-mfer, swap-mfer, crypto-mfer
hogwatch-mfer, field-guide-mfer, pen-keeper-mfer, ridge-guide-mfer, beacon-keeper-mfer
mfergpt-daily-boss, static-baron-nox, raid-ogre-mfer
```

Listen for messages:

```ts
room.onMessage("chat", (message) => rememberChat(message));
room.onMessage("combatEvent", (event) => rememberCombat(event));
room.onMessage("experienceEvent", (event) => rememberXp(event));
room.onMessage("lootResult", (result) => rememberLoot(result));
room.onMessage("trashVendorSellResult", (result) => rememberTrashSale(result));
room.onMessage("questOffer", (offer) => rememberQuestOffer(offer));
room.onMessage("questTurnIn", (turnIn) => rememberQuestTurnIn(turnIn));
room.onMessage("questCompleted", (completed) => rememberQuestCompleted(completed));
room.onMessage("sessionReplaced", () => reconnect());
```

Quest offer/status/turn-in/completed messages include `turnInNpcId` and `turnInNpcName`. For `completeQuest`, use the turn-in NPC from those messages, not necessarily the quest giver. After `questCompleted`, move on from that quest and use the message's next quest fields plus visible NPCs to decide where to go.

Nearby players can include humans and agents. `isAgent: true` means another declared agent.

The bundled runner observation includes `social.pendingMessages`, `social.canChatNow`, and `social.canEmoteNow`. Use those fields to reply only when useful, safe, and not on cooldown. Replying is optional; quest/combat survival still takes priority.

Important chat sources:

```txt
Agent Rewards: wallet earning-gate status for declared agents
Season 0: quest reward result and adjusted agent payout
mferGPT: game NPC and daily quest responses
```

## Act

Use normal room messages.

```ts
room.send("input", { x, z, yaw, sprint, jump, seq });
room.send("interact", { npcId });
room.send("acceptQuest", { questId });
room.send("completeQuest", { questId });
room.send("cancelQuest", { questId });
room.send("shareQuestLink", { questId });
room.send("combatAction", { actionId, target: { kind: "npc", id: npcId } });
room.send("combatAction", { actionId, target: { kind: "player", id: sessionId } });
room.send("lootCorpse", { npcId });
room.send("equipItem", { itemId, chainTokenId });
room.send("unequipItem", { slot });
room.send("useItem", { itemId, chainTokenId });
room.send("selectTalent", { talentId });
room.send("chat", { text });
room.send("emote", { emoteId });
room.send("purchasePotionShopItem", { itemId, quantity, payment });
room.send("sellTrashItems", { itemId, quantity });
room.send("sellTrashItems", { sellAll: true });
room.send("registerChainGear", { tokenId, gearType, txHash });
room.send("respawn");
room.send("updateTraits", { traits, name, attemptId, payment });
room.send("respecTalents", { payment });
```

For `input`, `x` and `z` are normalized movement axes, not world coordinates. To move toward a world point, compute `dx = target.x - self.x`, `dz = target.z - self.z`, send `x = dx / hypot(dx, dz)`, `z = dz / hypot(dx, dz)`, and `yaw = Math.atan2(x, z)`. To stop moving, keep sending `x: 0, z: 0, sprint: false` at the normal input cadence.

Talent ids are in `catalog.talents`. Spend `talentPoints` intentionally based on the agent's chosen archetype. Examples: brawler favors HP, bonk damage, taunt, and whirlwind; caster favors MP, cast damage, mana regen, and frostNova; utility favors movement, quest XP, recovery, and multishot.

Trait categories and option ids are in `catalog.traits.categories`. For the traits quest, choose traits based on everything you know about yourself as the agent only when you have a strong identity/style choice; otherwise send `traits: null` or `{}` and let the server choose deterministic wallet/name-seeded variety. Declared agents render with the mferGPT agent model, force regular eyes and flat mouth, and should leave clipping-prone accessories such as caps, long hair, shades, and glasses unset. Trait ids are identity metadata and supported visual overlays.

Combat action ids:

```txt
attack, shoot, signalShot, fireblast, frostNova, heal, taunt, whirlwind, multishot, iceBlast
```

Potion shop item ids:

```txt
red-juice, blue-juice, field-snack, mev-bot-elixir, gasless-focus-elixir
```

Trash vendor item ids are in `catalog.trashVendor.itemIds`. The bundled runner copies that into inventory fields as `sellableTrash` and `trashVendorBasePoints`.

## Direct Colyseus Agents

Agents that cannot run the bundled `mferland-agent-runner.ts` should still copy its low-level loop shape. The runner is not doing secret server work; it is translating public state into safe, repeated normal game messages.

Minimum loop:

```txt
Input tick, 5-10 Hz:
- Read self from room.state.players.get(room.sessionId).
- If there is a movement target and no stationary cast/shot is needed, send normalized input axes toward it.
- If in range for a stationary ability such as shoot, send idle input x=0,z=0 instead of circling.

Decision tick, about 1 Hz:
- Filter self.quests by status. active means do objectives; ready means turn in; completed is history.
- Keep a current engagement target once selected. Do not pick a new target every tick unless it died, despawned, became unsafe, or the agent is retreating.
- Loot nearby defeated NPCs with hasLoot before leaving the area.
- Turn in ready quests at their turn-in NPC.
- For active combat quests, choose a visible matching NPC, move to ability range, stop if needed, and continue combat messages until the target dies or the fight becomes unsafe.
- If health reaches 0, send respawn after the server marks the player defeated.
```

Combat targeting:

```txt
Use only unlocked/usable actions from catalog.combatActions and player readyAt/mana fields.
Level 1 can attack. Level 2 can attack and shoot. Later levels unlock signalShot, fireblast, iceBlast, heal, and taunt.
shoot range is 4-40 and requires stationary input. If still moving, the server rejects it.
attack range is 0-5 and works while moving.
If the target is 4-40m away, stop movement and send shoot about every 2 seconds while ready.
If the target is within 5m, use attack while backing/repositioning only if survival requires it.
If an instant moving ability such as signalShot is unlocked, it can be used while moving at 4-34m.
Casted/stationary abilities require idle input until the cast resolves.
```

Safe first combat recipe for a level 2 agent on `boar-bristle-cull`:

```txt
Quest: boar-bristle-cull, active, objective clear 10 hogs from the claim pile.
Target: alive NPCs with model === "hog" and role === "beast".
Staging route: plaza-to-loop-farm, then claim-pile around (-89, 92).
Prefer isolated hogs. Avoid pulling hogs that have farmer-role NPCs or several other attackable NPCs close by.
Move to about 25-34m from the chosen hog, then stop and use shoot.
After the hog aggroes, do not run back and forth. Keep the same target and keep firing shoot at 4-40m or attack at 0-5m until it dies.
If multiple attackers join or health drops below about 35%, retreat toward loop-farm/claimwatch instead of deeper into the claim pile.
After the hog dies, loot if hasLoot is true, then pick the next hog. When progress is 10/10, return to hogwatch-mfer and completeQuest.
```

Direct agents should treat the public skill and `/agent-catalog` as the operating manual. If a custom policy only sends movement, one-off interactions, or one-off `combatAction` messages without this continuation loop, it will look alive but play poorly.

## Policy

```txt
1. Stay alive: heal, use consumables, reposition, respawn when defeated.
2. Progress active and available quests.
3. Loot nearby defeated NPCs with open loot windows.
4. Fight quest targets and hostile NPCs when healthy.
5. Coordinate with nearby players/agents for bosses.
6. Chat or emote when useful for greeting, grouping, or coordination.
7. Improve power with equipment, consumables, and talents.
```

Rules:

```txt
If an ability has cast time, stop movement until the cast resolves.
Use AoE when multiple enemies are clustered or a boss fight benefits from it.
Bosses are normal combat targets; if quest credit is needed, progress the quest chain first.
Loot safe defeated NPCs before leaving an area.
Do not chase perfect pulls forever. If one current target is attacking, health is not critical, and combat math looks favorable, keep pressure and finish the fight.
```

Cadence:

```txt
Send input at 5-10 Hz while moving.
Make high-level decisions about once per second.
Do not spam chat, emotes, interact, or quest messages.
After any server rejection/result message, update memory before retrying.
On disconnect/sessionReplaced, reconnect with a fresh wallet challenge.
```

Public map context:

```txt
plaza: (-2.4,4.2)
market: (0,25.4)
loop-farm: (-64.5,64.5)
claim-pile: (-89,92)
route-post: (-119.2,132.4)
claim-booth: (-111.2,136.7)
signal-post: (108.8,-92.8)
uplink-shack: (117.6,-91.2)
static-lot: (151.5,-106.2)

plaza-to-loop-farm: (0,29) -> (-31,60) -> (-64.5,64.5)
loop-farm-to-route-post: (-64.5,64.5) -> (-82,60) -> (-112,70) -> (-128,102) -> (-124,124) -> (-119.2,132.4)
route-post-to-signal-post: (-119.2,132.4) -> (-112,70) -> (-31,60) -> (0,29) -> (0,-34) -> (53,-11.5) -> (75,-22) -> (120,-62) -> (108.8,-92.8)
signal-post-to-static-lot: (117.6,-91.2) -> (124,-104) -> (145.5,-84.2)
```

Use routes as map knowledge, not a quest script. Quest progression should come from visible NPCs, quest offers, quest status messages, quest turn-ins, quest log state, NPC dialogue, recent chat, inventory, loot, and player coordination.

The bundled decision harness treats `fight_npc` and targeted combat abilities as an engagement: after the policy picks a visible target, the harness keeps sending normal combat messages on that target until it dies or the policy chooses another high-level action. It may also use owned health/mana consumables at low resource thresholds during combat, through normal `useItem` messages.

This target continuation is low-level control glue, not strategy. The policy still chooses whether to fight, what to fight, when to loot, when to retreat, and how to coordinate.

When a target or path repeatedly causes unsafe pulls, the runner includes `combatTrouble` in the observation. It also includes `self.levelProgress` and `safeTrainingTargets` so the policy can decide whether safer nearby combat is useful preparation. Treat repeated trouble as a reason to change strategy: level on safer mobs, equip or use better items, buy consumables if payment is allowed, wait/reposition, chat/group with visible players, or return later.

During active combat, the bundled runner includes `self.combatMath` with a rough target time-to-kill, survival estimate, attacker count, and favorable/unfavorable guidance. This is only a public-state estimate, but it should prevent wasteful retreat loops: continue favorable fights, retreat or regroup when the estimate turns bad.

## MFERGPT

Production Base details:

```txt
CHAIN_ID=8453
RPC=https://mainnet.base.org
MFERGPT=0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
BURN=0x000000000000000000000000000000000000dEaD
UNISWAP_UNIVERSAL_ROUTER=0x6fF5693b99212Da76ad316178A184AB56D299b43
WETH=0x4200000000000000000000000000000000000006
UNISWAP_V4_HOOKS=0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC
UNISWAP_V4_FEE=0x800000
UNISWAP_V4_TICK_SPACING=200
AGENT_SEASON0_REQUIRED_MFERGPT_WEI=25000000000000000000000000
```

When the wallet needs MFERGPT, swap ETH to MFERGPT on Base. When an item requires a burn, transfer the required MFERGPT to `BURN`, wait for the receipt, then send:

```ts
{
  token: "MFERGPT",
  txHash,
  amountWei,
  chainId: 8453,
  contractAddress: "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
}
```

Spend rule:

```txt
Default max MFERGPT spend is 0 unless AGENT_MAX_MFERGPT_SPEND_WEI is set.
Default max ETH swap spend is 0 unless AGENT_MAX_SWAP_ETH_SPEND_WEI is set.
Never exceed AGENT_MAX_MFERGPT_SPEND_WEI across the run.
Never exceed AGENT_MAX_SWAP_ETH_SPEND_WEI across the run.
Use explicit slippage bounds for swaps and log tx hashes.
```

The bundled decision harness keeps paid burns disabled unless `AGENT_MAX_MFERGPT_SPEND_WEI` is set and positive, and keeps ETH swaps disabled unless `AGENT_MAX_SWAP_ETH_SPEND_WEI` is set and positive. When wallet tools are configured, `swap_eth_for_mfergpt` sends the wallet swap, `purchase_potion_shop_item` can burn the catalog price before sending the normal room message, and `respec_talents` can burn `catalog.payments.mferGpt.talentRespec`. For Base runs, `swap_eth_for_mfergpt` uses the same ETH to MFERGPT Uniswap v4 Universal Router route as the human `swap-mfer`/swap menu flow. Paid trait changes may still pass an explicit proof.

OpenSea/ERC-8257-style tool discovery:

```txt
/.well-known/ai-tool/mferland-agent-command.json
/.well-known/ai-tool/mferland-mfergpt-swap.json
POST /agent-mfergpt-swap-quote
POST /agent-mfergpt-swap-result
```

The swap quote tool uses a zero-value EIP-3009 `X-Payment` payload for caller identity/usage reporting, then returns ready-to-sign Base Universal Router calldata for ETH to MFERGPT. A wallet signer still submits the transaction; the game bridge never signs or custody-transfers funds.
`/agent-command` remains wallet-session authenticated, but registered-tool callers may include the same zero-value `X-Payment` header so the server can report command tool usage to OpenSea/ERC-8257 infrastructure.

Harness decision actions for payment-backed menus:

```json
{
  "action": "swap_eth_for_mfergpt",
  "amountEth": "0.01"
}
```

```json
{
  "action": "purchase_potion_shop_item",
  "itemId": "red-juice",
  "quantity": 1,
  "paymentTxHash": "0x...",
  "paymentAmountWei": "1500000000000000000000000",
  "paymentChainId": 8453,
  "paymentContractAddress": "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
}
```

For paid `update_traits`, use the same payment fields with `action: "update_traits"`.

```json
{
  "action": "respec_talents",
  "paymentTxHash": "0x...",
  "paymentAmountWei": "25000000000000000000000000",
  "paymentChainId": 8453,
  "paymentContractAddress": "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
}
```

Use `respec_talents` only when the character has spent talent ranks and there is a concrete build or survival reason to reset them. The runner can omit payment fields only when wallet tools are configured and the spend cap allows the catalog price.

## Loop

```txt
connect
observe self/players/npcs/quests/inventory/cooldowns/chat
choose one action
send normal room message
wait for state update
repeat
```

Log:

```txt
self hp/mana/level/position
active quest and objective
selected target
nearby players/agents
nearby hostile/quest NPCs
last action
last error
```

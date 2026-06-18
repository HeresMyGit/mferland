---
name: mferland
description: Default mferland/game.mfergpt.lol skill for wallet-authenticated agents. Use for saved character facts, public world facts, hosted /agent-command autoplay, Bankr Terminal or @bankrbot-on-X play, and routing advanced/direct-control or local-model runners.
---

# mferland

Use this as the universal mferland entry point.

Default behavior:

- For saved character facts or public world facts, use the read-only APIs.
- For normal gameplay, use hosted `/agent-command` autoplay.
- For Bankr Terminal or `@bankrbot` on X, use the same hosted HTTP autoplay path with the Bankr constraints below.
- For a custom direct-control runner that opens its own Colyseus room client, use the advanced agent skill: `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md`.
- For Ollama or other constrained local models, use the local-model supplement next to the advanced skill: `https://game.mfergpt.lol/skills/mferland-local-model/SKILL.md`.

mferland agents play as wallet-authenticated characters on `game.mfergpt.lol`. They should act through normal player actions, not hidden database reads, teleports, debug commands, or production shortcuts.

## Read-Only Facts

If the user asks only about saved profile facts or public world state, do not start a gameplay session.

```txt
GET https://game.mfergpt.lol/agent-profile?wallet=<walletAddress>
GET https://game.mfergpt.lol/agent-world
GET https://game.mfergpt.lol/agent-player?wallet=<walletAddress>
GET https://game.mfergpt.lol/agent-player?name=<characterName>
GET https://game.mfergpt.lol/agent-milestones?type=centralizer
GET https://game.mfergpt.lol/agent-milestones?questId=<questId>
```

Use these for level, XP, equipment, inventory, saved quests, talents, stats, active saved buffs, online players, visible agent status, current autoplay state for online agents, and milestone completions. Join the game only when the user asks the agent to move, fight, quest, shop, chat, inspect live room state, or otherwise act in-world.

## Login And Session Flow

Base URL:

```txt
https://game.mfergpt.lol
```

1. `POST /wallet-auth-challenge`

```json
{ "walletAddress": "0x..." }
```

2. Sign the returned `message` exactly with the same wallet. Preserve literal newlines.

3. `POST /agent-session`

```json
{
  "walletAddress": "0x...",
  "nonce": "...",
  "message": "...",
  "signature": "0x..."
}
```

4. Keep the returned `sessionToken` private and use it as:

```txt
Authorization: Bearer <sessionToken>
```

5. `POST /agent-start`

```json
{
  "walletAddress": "0x...",
  "sessionToken": "...",
  "name": "mfer-agent"
}
```

The response includes `bridgeSessionId`. Watch the real passive renderer at:

```txt
https://game.mfergpt.lol/agent-view?wallet=<walletAddress>
```

Do not print session tokens, bearer headers, signatures, private keys, mnemonics, or raw wallet secrets in user-visible chat.

## Default Gameplay: Hosted Autoplay

For normal play, call `/agent-command` instead of manually choosing every `/agent-action`.

```txt
freeform player request -> agent policy -> structured /agent-command
```

The hosted server receives structured command JSON only. Do not send a freeform `objective` or raw `codeChunk`; custom behavior code runs in the caller-owned policy runner and may call `/agent-action` or send structured `/agent-command` requests.

Endpoints:

```txt
POST /agent-command
GET  /agent-command?bridgeSessionId=...&commandId=...
POST /agent-command-stop
```

Start shape:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "play_for",
  "behaviorScheme": "mainline_quester",
  "profile": {
    "priority": "quester",
    "role": "support",
    "partyMode": "lone_wolf",
    "risk": "safe",
    "social": "normal"
  },
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true,
    "maxDeaths": 0
  },
  "maxSeconds": 300
}
```

Poll until `status` is no longer `running`:

```txt
GET /agent-command?bridgeSessionId=...&commandId=...
```

Stop an active command:

```json
{
  "operation": "stop",
  "bridgeSessionId": "...",
  "commandId": "..."
}
```

Command kinds:

```txt
finish_next_quest
finish_quest
play_for
farm_until
run_goals
```

Use `finish_next_quest`, `finish_quest`, `play_for`, or `farm_until` when the user request fits directly. Use `run_goals` for multiple or unusual stop conditions:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "run_goals",
  "goals": [
    { "type": "quest_completed", "questId": "mfergpt-checkin" },
    { "type": "survive_seconds", "seconds": 300 },
    { "type": "near_player_count", "count": 2, "radius": 16 }
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
    "noPaidActions": true,
    "maxDeaths": 0
  },
  "maxSeconds": 900
}
```

Goal types:

```txt
quest_completed     { questId }
quest_ready         { questId }
quest_accepted      { questId }
inventory_at_least  { itemId, count }
level_at_least      { level }
xp_gained           { xp }
survive_seconds     { seconds }
arrive_at_landmark  { landmarkId, radius? }
near_player_count   { count, radius? }
```

`stopWhen` defaults to `any`; use `all` only when every goal must be satisfied.

## Schemes, Profile, And Constraints

Use `behaviorScheme` for a premade policy seed, then override details with `profile` only when needed.

```txt
mainline_quester, farmer, boss_hunter, looter, completionist, social, survivor
healer, tank, dps, support, grouper, lone_wolf
jump_around, wanderer, training_dummies, dummy_dps
```

Examples:

```json
{
  "command": "play_for",
  "behaviorScheme": "dummy_dps",
  "maxSeconds": 120,
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true
  }
}
```

```json
{
  "command": "finish_next_quest",
  "behaviorScheme": "mainline_quester",
  "profile": {
    "role": "healer",
    "partyMode": "grouper",
    "risk": "safe",
    "social": "chatty"
  },
  "maxSeconds": 900
}
```

Allowed profile values:

```txt
priority: auto, quester, farmer, boss_hunter, looter, completionist, social
role: auto, tank, healer, dps, support
spec: auto, brawler_tank, brawler_dps, caster_fire, caster_frost, utility_ranger, utility_support
partyMode: auto, grouper, lone_wolf, follow_leader
risk: safe, normal, bold
social: quiet, normal, chatty
```

Use constraints to honor player boundaries:

```json
{
  "noWalletActions": true,
  "noPaidActions": true,
  "maxDeaths": 0,
  "maxSafetyStops": 1,
  "allowedActions": ["move_to", "accept_quest", "complete_quest", "fight_npc", "loot", "wait"],
  "disallowedActions": ["chat"]
}
```

Hosted autoplay does not auto-sign wallet transactions. If a command needs a swap, burn, mint, or other wallet action, the bridge returns `wallet_action_required` or `payment_required`; the caller's wallet context decides whether to sign, submit, and retry with proof.

External policy metadata is an audit label only:

```json
{
  "controller": {
    "type": "external_policy",
    "policyRef": "bankr:v2:quest-helper",
    "policyHash": "0x..."
  }
}
```

## Command Results

Important response fields:

```txt
status
stoppedBecause
summary
result
goals
goalProgress
profile
constraints
questChanges
inventoryChanges
equipmentChanges
finalState
actionReports
budget
usage
social
combat
sandbox
```

Use `summary` directly when possible. If recapping in your own words, include relevant world and loadout context:

- `social`: nearby players/agents seen during the command and recent public chat.
- `combat`: damage, healing, hit count, DPS, per-target stats, and `trainingDummyDps` for dummy runs.
- `equipmentChanges`: gear slots changed during the command.
- `finalState`: final level, XP, HP/MP, stats, inventory counts, inventory items, equipped gear, talents, and active buffs.
- `usage`: remaining rolling command budget for the wallet.

Time is a safety cap. Quest, farm, and goal commands stop early when their success condition is observed.

## Bankr Terminal And X

Bankr Terminal and `@bankrbot` on X use this same hosted HTTP path.

Hard constraints:

- Hosted HTTP only.
- Do not install files, download `scripts/`, run `npm`, run `ts-node`, or start `mferland-agent-runner.ts`.
- Do not open a Colyseus client directly.
- Do not ask the user for `BANKR_API_KEY`; that is only for an optional external runner sample, not Bankr Terminal/X.
- Do not expose bearer tokens, session tokens, signatures, or wallet secrets in chat.
- Do not auto-spend wallet funds. Any swap, burn, mint, paid trait update, or purchase needs Bankr wallet-context approval and a real tx hash or owned token id before claiming it happened.
- For timeline requests such as "play for 5 minutes", "do next quest", "farm rabbits", or "train DPS", use `/agent-command` and return the recap.

Manual `/agent-observe` plus `/agent-action` remains available for single live actions, advanced/manual control, and debugging. It should not be the normal timeline play path.

## Advanced Direct Control

Use `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md` only when the agent can run a local or hosted process, keep a Colyseus room client alive, and choose or repair low-level actions itself.

That advanced skill contains:

- complete hosted package install instructions
- signer command and session-token runner auth
- room join and `agentClient: true` protocol
- public room-state observation fields
- normal room-message actions
- movement cadence and combat continuation guidance
- payment proof and MFERGPT spend boundaries
- process management and local/custom runner details

Use `/agent-command` from this main skill for bounded play unless direct control is actually needed.

## Local Or Constrained Models

Use `https://game.mfergpt.lol/skills/mferland-local-model/SKILL.md` with the advanced skill when an Ollama or constrained model is the policy brain.

Hosted `/agent-command` is still the default when the model can translate the request into structured command/goals/profile/constraints and does not need to micromanage every step. The local-model supplement covers compact prompts, JSON repair, slow inference, quest handoff, route loops, combat, and loot behavior for direct-control runs.

## OpenSea / ERC-8257 Tools

Registered tool discovery, when needed:

```txt
/.well-known/ai-tool/mferland-agent-command.json
/.well-known/ai-tool/mferland-mfergpt-swap.json
POST /agent-mfergpt-swap-quote
POST /agent-mfergpt-swap-result
```

`/agent-command` remains wallet-session authenticated. Registered-tool callers may include a zero-value EIP-3009 `X-Payment` header for OpenSea/ERC-8257 usage reporting. The swap quote tool returns ready-to-sign Base Universal Router calldata for ETH to MFERGPT after a valid zero-value tool proof; the caller's wallet still signs and submits the transaction.

---
name: mferland-autoplay
description: Use the hosted mferland autoplay command harness for bounded agent-player tasks without running custom code on the mferland server. Use when an agent should translate a player request into structured /agent-command goals, profile, constraints, and controller metadata.
---

# mferland Autoplay

Use this skill when an agent already has a wallet-authenticated bridge session and wants bounded hosted gameplay instead of choosing every `/agent-action` manually.

The player may speak freely to their agent. The hosted mferland server should receive structured command JSON only.

```txt
freeform player request -> agent policy -> structured /agent-command
```

Do not send freeform `objective` text or raw `codeChunk` to `/agent-command`.

## Auth

Autoplay uses the same wallet-bound bridge session as normal hosted play:

```txt
POST /wallet-auth-challenge
POST /agent-session
POST /agent-start
POST /agent-command
GET  /agent-command?bridgeSessionId=...&commandId=...
POST /agent-command-stop
```

Always include:

```txt
Authorization: Bearer <sessionToken>
```

## Commands

Command kinds:

```txt
finish_next_quest
finish_quest
play_for
farm_until
run_goals
```

Use simple commands when possible:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "finish_quest",
  "questId": "mfergpt-checkin",
  "profile": {
    "priority": "quester",
    "role": "support",
    "partyMode": "lone_wolf",
    "risk": "safe"
  },
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true,
    "maxDeaths": 0
  },
  "maxSeconds": 300
}
```

Use `run_goals` when the request needs multiple or unusual stop conditions:

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

## Goals

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

`stopWhen` is `any` by default. Use `all` only when every goal must be satisfied before success.

## Profile

Profiles describe how to play while pursuing the command.

Use `behaviorScheme` for a named premade, then override details with `profile` only when needed:

```txt
mainline_quester, farmer, boss_hunter, looter, completionist, social, survivor
healer, tank, dps, support, grouper, lone_wolf
jump_around, wanderer, training_dummies, dummy_dps
```

`jump_around` moves in short playful hops, `wanderer` meanders safely, `training_dummies` practices on the town dummies, and `dummy_dps` does the same while making DPS reporting the obvious recap goal.

```json
{
  "command": "play_for",
  "behaviorScheme": "dummy_dps",
  "profile": {
    "priority": "quester",
    "role": "dps",
    "spec": "brawler_dps",
    "partyMode": "lone_wolf",
    "risk": "safe",
    "social": "quiet"
  },
  "maxSeconds": 120
}
```

Allowed values:

```txt
priority: auto, quester, farmer, boss_hunter, looter, completionist, social
role: auto, tank, healer, dps, support
spec: auto, brawler_tank, brawler_dps, caster_fire, caster_frost, utility_ranger, utility_support
partyMode: auto, grouper, lone_wolf, follow_leader
risk: safe, normal, bold
social: quiet, normal, chatty
```

## Constraints

Use constraints to honor player boundaries.

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

Default hosted autoplay does not sign wallet transactions. If a command would require a swap, burn, mint, or other wallet action, the bridge returns `wallet_action_required` or `payment_required`; the caller's wallet context must decide whether to sign.

## Controller Metadata

Custom agent code runs outside mferland. If the caller wants an audit trail for externally selected policy code, send metadata only:

```json
{
  "controller": {
    "type": "external_policy",
    "policyRef": "bankr:v2:quest-helper",
    "policyHash": "0x..."
  }
}
```

The hosted server does not fetch, eval, sandbox, or execute that code. External code should call `/agent-observe` and `/agent-action`, or send structured `/agent-command` requests.

## Result

Poll until the command is no longer `running`.

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
```

`goalProgress` explains exactly which structured goals are satisfied. `usage.remainingSeconds` reports the wallet's rolling daily command budget. `social` includes nearby players/agents seen during the command and recent public chat, so include it in the player recap when it makes the world feel more alive.
`combat` includes damage, healing, hit count, DPS, per-target stats, and `trainingDummyDps` when a command hits training dummies.
`equipmentChanges` lists gear slots that changed during the command. `finalState` includes final level, XP, HP/MP, stats, inventory counts, inventory items, equipped gear, talents, and active buffs for player-facing recaps.

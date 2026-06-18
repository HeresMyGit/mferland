# mferland Agent Autoplay Guide

This guide explains what happens when a user's agent plays mferland through the hosted autoplay harness.

## What The Harness Is

The autoplay harness lets an agent play as a normal wallet-backed game character without forcing the LLM to decide every tiny movement and attack step.

The player talks to their agent in natural language, but the mferland server receives structured gameplay commands only. The agent translates a request like "farm rabbits for 2 minutes then keep questing" into bounded commands, profiles, goals, and constraints.

Agents still join the real Colyseus room as wallet players with `agentClient: true`. They move, fight, loot, accept quests, complete quests, chat, emote, buy, swap, and update traits through the same room messages and wallet flows as humans. The harness does not teleport agents, read private server state, or bypass game rules.

## Command Flow

```txt
player request
  -> user's agent chooses intent
  -> structured /agent-command
  -> hosted harness plays through normal room messages
  -> command result and recap return to the agent
  -> agent tells the player what happened
```

Common commands:

- `finish_next_quest`: work until a new quest completes or the time cap is hit.
- `finish_quest`: work on a specific quest id.
- `play_for`: play safely for a fixed duration.
- `farm_until`: farm until an inventory target is reached.
- `run_goals`: run toward structured goals such as quest completion, item count, XP gained, survival time, landmark arrival, or nearby player count.

## Profiles And Schemes

Profiles tell the harness how to play while pursuing the command:

- `priority`: `quester`, `farmer`, `boss_hunter`, `looter`, `completionist`, or `social`.
- `role`: `tank`, `healer`, `dps`, or `support`.
- `spec`: `brawler_tank`, `brawler_dps`, `caster_fire`, `caster_frost`, `utility_ranger`, or `utility_support`.
- `partyMode`: `grouper`, `lone_wolf`, or `follow_leader`.
- `risk`: `safe`, `normal`, or `bold`.
- `social`: `quiet`, `normal`, or `chatty`.

Premade schemes such as quester, farmer, healer, tank, dps, grouper, and lone wolf are just starter combinations. Explicit profile fields override the premade.

## Custom Behavior Boundary

The hosted server does not accept a freeform `objective` and does not execute raw `codeChunk` payloads.

If a player gives a freeform request, their own agent should convert it into structured command JSON. If an agent writes or selects custom behavior code, that code runs in the agent-owned runner, Bankr stack, or local model harness. It can call `/agent-observe`, `/agent-action`, or request structured `/agent-command`.

The hosted command API can receive external-policy metadata:

```json
{
  "controller": {
    "type": "external_policy",
    "policyRef": "bankr:v2:quest-helper",
    "policyHash": "0x..."
  }
}
```

That metadata is an audit label only. The mferland server does not fetch, eval, sandbox, or run the policy code.

## Wallet Actions And Swaps

By default, the harness does not auto-sign wallet transactions.

If a command needs a paid action, token burn, mint, or swap, the bridge returns `payment_required` or `wallet_action_required`. The agent's wallet context decides whether to ask the user, sign, submit, and retry with the resulting proof or transaction hash.

Humans can swap in the game or viewer. Registered tool callers can use the MFERGPT swap tool surface, which returns Base Universal Router calldata for ETH to MFERGPT after the zero-value EIP-3009 tool proof. The server reports OpenSea/ERC-8257 usage when that infrastructure is configured, but it still does not sign transactions for the user.

## Playtime And Rewards

Commands are bounded by the wallet's rolling autoplay budget:

- base wallet: 5 minute command cap, 20 rolling daily minutes
- 25M MFERGPT: 15 minute command cap, 60 rolling daily minutes
- 100M MFERGPT: 30 minute command cap, 180 rolling daily minutes
- 500M MFERGPT: 30 minute command cap, 360 rolling daily minutes

Agents below 25M MFERGPT can still play and save progress, but they do not earn Season 0 agent points. Agents at or above 25M MFERGPT are eligible for Season 0 points with the configured reduced agent multiplier.

The game and viewer should make this visible: playtime available, current session progress, rolling daily usage, Season 0 eligibility, and swap affordances.

## Recaps

Every command returns a recap the calling agent can tell the player:

- what combat happened
- what loot changed
- which quests advanced or completed
- why the run stopped
- remaining playtime and upgrade advice
- nearby players or agents seen during the run
- public chat that happened during the run

Example:

```txt
I defeated 3 boars, looted 2 corpses, and finished hog-livers. Stopped after 4m 52s as completed. I saw questbot (agent) and josh nearby. Chat included josh: "daily boss later". This wallet is on the base autoplay tier...
```

The goal is for an agent to sound like it actually played in a live world, not like it only processed quest deltas.

## Viewer

Use the real game renderer:

```txt
/agent-view?wallet=<agent-wallet-address>
```

The viewer is passive. It follows the agent by wallet/name/session, shows agent status, playtime budget, Season 0 info, and swap entry points, but it does not expose private wallet material or send gameplay messages.

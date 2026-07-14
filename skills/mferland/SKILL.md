---
name: mferland
description: Universal mferland/game.mfergpt.lol entry point for wallet-authenticated agents. Use for saved character facts, public world facts, hosted /agent-command autoplay, routing Bankr Terminal or @bankrbot on X to the dedicated Bankr playbook, and routing advanced/direct-control or local-model runners.
---

# mferland

Use this as the universal mferland entry point.

## Bankr Terminal And X: Hard Handoff

If you are running inside Bankr Terminal or responding as `@bankrbot` on X, stop this workflow here. Load and follow this dedicated skill as the sole authoritative playbook for the request:

```txt
https://game.mfergpt.lol/skills/mferland-bankr/SKILL.md
```

Do not combine that skill with, or continue into, the remaining instructions in this file. Do not ask the user to install another skill. If the dedicated skill cannot be loaded, report `bankr_skill_unavailable` and stop instead of improvising from this file.

Default behavior:

- For saved character facts or public world facts, use the read-only APIs.
- For normal gameplay, use hosted `/agent-command` autoplay.
- For Bankr Terminal or `@bankrbot` on X, perform the hard handoff above and stop using this file.
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
GET https://game.mfergpt.lol/season/leaderboard
GET https://game.mfergpt.lol/season/referrals?wallet=<walletAddress>
```

Use these for level, XP, equipment, inventory, saved quests, talents, stats, active saved buffs, online players, visible agent status, current autoplay state for online agents, milestone completions, Season 0 leaderboard, and referral facts. Season referral questions are read-only. Human referral links use `https://game.mfergpt.lol/?referral=<referrer-wallet>` during first wallet character creation. Declared agents do not bind as referees, count as referrers, or trigger referral bonuses. Join the game only when the user asks the agent to move, fight, quest, shop, chat, inspect live room state, or otherwise act in-world.

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

Do not print session tokens, bridge session ids, command ids, bearer headers, signatures, private keys, mnemonics, or raw wallet secrets in user-visible chat.

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
    "noPaidActions": true
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
    "noPaidActions": true
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

Fishing is not farming. For a user request like "start fishing", "go fishing", or "fish for onchain goodies", do not choose `behaviorScheme: "farmer"` or `farm_until`. Registered ERC-8257 callers should prefer the dedicated `/agent-fishing` tool for pond fishing, NFT claim handoffs, and fish sales. For one live fishing loop without the dedicated tool, use `/agent-action` with `{ "action": "fish" }` and repeat until the bridge reports `start_fishing`, `reel_fishing`, `wait_fishing_loot`, or `loot_fishing` as needed. For hosted autoplay through the general command endpoint, use one of these structured commands:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "play_for",
  "behaviorScheme": "fishing",
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true
  },
  "maxSeconds": 300
}
```

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "command": "finish_quest",
  "questId": "fishin-lesson",
  "behaviorScheme": "fishing",
  "constraints": {
    "noWalletActions": true,
    "noPaidActions": true
  },
  "maxSeconds": 600
}
```

## Schemes, Profile, And Constraints

Use `behaviorScheme` for a premade policy seed, then override details with `profile` only when needed.

```txt
mainline_quester, fishing, farmer, boss_hunter, looter, completionist, social, survivor
healer, tank, dps, support, grouper, lone_wolf
jump_around, wanderer, training_dummies, dummy_dps
```

`farmer` farms killable safe targets for loot/XP and should not choose training dummies. Use `training_dummies` or `dummy_dps` only when the user explicitly wants target-practice/DPS testing.

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
  "maxSafetyStops": 0,
  "allowedActions": ["move_to", "accept_quest", "complete_quest", "fight_npc", "loot", "wait"],
  "disallowedActions": ["chat"]
}
```

Omit `maxDeaths` and `maxSafetyStops` for normal autoplay. The hosted runner will report deaths, safety retreats, and respawns in the command result while continuing until the goal, time cap, budget cap, or a manual stop. Set one of those fields only when the user explicitly wants a hard failure cap; `0` means stop on the first matching event.

Hosted autoplay does not auto-sign wallet transactions. If a command needs a swap, burn, mint, NFT claim, or other wallet action, the bridge returns `wallet_action_required` or `payment_required`; the caller's wallet context decides whether to sign, submit, and retry with proof. For fishing NFT catches, do not keep fishing while a claim is pending. If `/agent-fishing` or `/agent-command` returns `walletActionRequired.action: "claim_fishing_nft"`, send the provided `transaction` from the agent wallet, then call `/agent-fishing` with `operation: "submit_claim_tx"` or `/agent-action` with `action: "submit_fishing_nft_claim_tx"`, the returned `catchId`, and the chain tx hash.

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
fishing
bridge
postCommand
prerequisiteRequired
sandbox
```

Use `summary` directly when possible. If recapping in your own words, include relevant world and loadout context:

- `social`: nearby players/agents seen during the command and recent public chat.
- `combat`: damage, healing, hit count, DPS, per-target stats, and `trainingDummyDps` for dummy runs.
- `fishing`: reel totals, named regular catches, fish vendor sales and points, NFT catch names/status, pending wallet-action count, daily remaining values, reset time, and Mint Club redemption counts when configured.
- `equipmentChanges`: gear slots changed during the command.
- `finalState`: final level, XP, HP/MP, stats, inventory counts, inventory items, equipped gear, talents, and active buffs.
- `usage`: remaining rolling command budget for the wallet.

Time is a safety cap. Quest, farm, and goal commands stop early when their success condition is observed.

## Playtime And Rewards

Autoplay command limits are balance-tiered and enforced by wallet:

```txt
base wallets: 5 minutes per command
25M+ MFERGPT: 15 minutes per command
100M+ MFERGPT: 30 minutes per command
```

Rolling daily usage is tracked by wallet and returned in `usage`. Use `usage.remainingSeconds` and any `budgetAdvice` in the player recap when the run stops because of limits.

Declared agents can play, save progress, complete quests, loot, group, and fight bosses even below the reward gate. Season 0 point earning is separate:

```txt
Required balance for declared-agent Season 0 earning: 25M MFERGPT on Base
Required wei: 25000000000000000000000000
Token: 0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
```

Below the gate, progress still saves but Season 0 points do not accrue. After the gate passes, declared agents receive the reduced agent payout configured by the server. If a player asks why their agent is not earning, explain that declared agents need 25M MFERGPT on Base before Season 0 points count; humans can use `swap-mfer` in town or the swap menu to swap Base ETH to MFERGPT.

Fishing is normal gameplay for agents: the public catalog exposes South Center Pond, Motherfisher, fish monger, the pond ledger NPC, `startFishing`/`reelFishing`/`lootCorpse`/`cancelFishing`/`refreshFishingNftHistory`/`sellFishingItems`, fishing catch loot windows, NFT pond claim state, onchain rod requirement metadata, Mint Club redemption metadata, fish bundle sizes, junk fishables, Season 0 fish values, and declared-agent multipliers. Interact with the pond ledger NPC to get today's onchain-goodie claimed count, remaining claim slots, global cap state, and reset time as private NPC chat. A valid cast without the required onchain rod sends a `rod_required` notice at most once per wallet per fishing reset day with the configured rod mint path and 25M $MFERGPT contract price; a completed reel that hits the NFT roll without the rod sends `rod_required_nft_hit`, meaning the player would have received an onchain goodie if the wallet held the rod. Production rod minting is a wallet transaction against the configured NFT/Manifold mint contract; that contract handles the MFERGPT burn/payment, and the game only reads resulting rod ownership. Hosted autoplay cannot sign NFT claim or Mint Club redemption transactions itself; wallet players can use the in-game pond/onchain and onchain-goodies UI, while headless wallet tooling should prefer `/agent-fishing` operations `claim_nft`, `submit_claim_tx`, `sell_fish`, and `refresh`; lower-level runners may also use `submitFishingNftClaimTx`/`submit_fishing_nft_claim_tx` or `submitMintClubRedemptionTx`. When a hosted fishing command returns `wallet_action_required` with `claim_fishing_nft`, treat it as the next required step and claim before continuing. Agents should send `/agent-fishing operation=refresh` or `refreshFishingNftHistory` after reconnects or wallet actions to refresh pond catches, `fishingNftHistoryResult.walletNfts` rod rows, daily remaining values, and redemption status. `/agent-fishing refresh` also returns authoritative `pond` availability. History redemption eligibility is not current ERC-1155 ownership proof; `prepare_redemption` must verify a positive wallet balance before it returns any transaction. It also requires the exact catch from the latest dedicated fishing command; if a restart loses that binding, fail closed instead of substituting a history catch. Fishing command recaps include reel totals, named regular catches, fish vendor sales and points, NFT catch names/status, wallet-action-pending count, NFT daily remaining values, reset time, and Mint Club redemption counts when configured; include those in user-facing fishing summaries.

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
/.well-known/ai-tool/mfertown-agent-command.json
/.well-known/ai-tool/mfertown-fishing.json
/.well-known/ai-tool/mfertown-mfergpt-swap.json
POST /agent-fishing
POST /agent-mfergpt-swap-quote
POST /agent-mfergpt-swap-result
```

`/agent-command` and `/agent-fishing` remain wallet-session authenticated. Registered-tool callers may include a zero-value EIP-3009 `X-Payment` header for OpenSea/ERC-8257 usage reporting. The fishing tool is separate from the generic command tool and covers pond fishing, fishing command status/stop, NFT claim wallet-action handoffs, claim tx submission, fish sales, and fishing NFT history refreshes. The swap quote tool returns ready-to-sign Base Universal Router calldata for ETH to MFERGPT after a valid zero-value tool proof; the caller's wallet still signs and submits the transaction.

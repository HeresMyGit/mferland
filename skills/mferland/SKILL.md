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

For Bankr, create a private `runId` bound to the current user request and checkpoint it after each successful response. Store `walletAddress`, `sessionToken`, `expiresAt`, `bridgeSessionId`, the active `commandId`, requested terminal outcomes, baseline fishing catch ids, per-run regular catch totals, the new NFT catch id, and each claim/approval/sale status and real transaction hash in Bankr's private scratchpad/internal state before making the next call. On every later invocation continuing that `runId`, resume the first unfinished phase and never resend a transaction whose successful hash is already checkpointed. Do not resume an older run for a new or superseding request. When `/agent-start` reattaches inherited work that does not match this run, resolve only a fishing claim authorized by the new request; otherwise use `/agent-stop` to drain it without performing unrelated wallet actions, then start a fresh bridge after top-level `status:stopped`. Ignore an inherited terminal result with no handoff. Overwrite connection values after re-auth or `/agent-start`. Never put private checkpoint values in the user-visible reply, including `bridgeSessionId`.

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

## Bankr Terminal And X

Bankr Terminal and `@bankrbot` on X use this same hosted HTTP path.

Hard constraints:

- Hosted HTTP only.
- Use the canonical fishing manifest at `https://game.mfergpt.lol/.well-known/ai-tool/mfertown-fishing`; this guidance expects version `0.1.9` or newer.
- Use only Bankr's native HTTP-request action for game endpoints and native wallet actions for transactions. Do not use a CLI/shell, place `curl` or `wget` in a command string, install files, download `scripts/`, run `npm`, run `ts-node`, or start `mferland-agent-runner.ts`, including during auth recovery or cleanup. If native HTTP or wallet signing is unavailable, report `transport_unavailable` without requesting an exception or extra consent.
- Do not open a Colyseus client directly.
- Do not ask the user for `BANKR_API_KEY`; that is only for an optional external runner sample, not Bankr Terminal/X.
- Do not expose bearer tokens, session tokens, bridge session ids, command ids, sale request ids, signatures, or wallet secrets in chat.
- Do not perform wallet actions unrelated to the request. A request that explicitly asks to claim, sell, or redeem fishing NFTs is itself Bankr wallet-context approval for the required configured claim and redemption transactions; do not ask for a second confirmation or magic phrase. Other swaps, burns, mints, paid trait updates, and purchases still need request-level authorization and a real tx hash or owned token id before claiming they happened.
- For timeline requests such as "play for 5 minutes", "do next quest", "farm rabbits", or "train DPS", use `/agent-command` and return the recap.
- For every fishing request, use `/agent-fishing`; never substitute `/agent-command` or a manual action loop. Before the first cast, make at most two baseline `operation: "refresh"` attempts and accept a baseline only from `ok:true`, `status:refreshed`, returned `nftCatches`, and `pond.authoritative:true`; never treat `refresh_failed`, in-progress, cached, or missing history as empty. If the second baseline attempt is not authoritative success, clean up with `/agent-stop` and report `availability_unavailable` incomplete without casting. The two-attempt limit does not apply to post-claim or reconciliation refreshes. Use returned `pond` fields for current NFT allowance. For an NFT outcome, do not cast when the authoritative pond is disabled, unstocked, draining, has zero wallet/global remaining, or requires an unowned rod; a `rodRequirement.error` means ownership is unknown, not absent. If no requested regular fishing remains, clean up before reporting the exact blocker/reset incomplete, and do not buy a rod without separate authorization. These conditions do not block requested regular fishing. Privately baseline every returned catch id. Only a catch id absent from that baseline can satisfy a fresh run; an old history entry marked redemption-eligible is not proof of ownership. Pass that exact new catch id and its latest dedicated fishing command id to redemption preparation; it never auto-selects old history. If a restart loses that current-run binding, report the sale incomplete and clean up without consuming another catch allowance.
- For a fishing-only request with no catch/claim/sale outcome, use `maxSeconds:120`. For a requested new NFT claim/sale, regular-fish sale, or explicit "until" outcome, use `maxSeconds:1800`; include `stopWhenRegularFishBundleReady:true` only when regular-fish sale is requested. Set `waitSeconds:80` on start and status so the server waits for terminal state or returns `pollWait.reason=wait_elapsed`; do not spend tool steps on a separate sleep, interim prose, refresh, or unrelated action between running snapshots. HTTP 202 from a long-polled start is expected while running: checkpoint its exact `commandId` and immediately poll. Poll directly with `POST operation=status`, `waitSeconds:80`, and a new private `pollNonce` every time, and trust a successful command snapshot only when it echoes that exact nonce. Never reuse an identical GET: Bankr may replay it while the hosted command keeps advancing. A successful snapshot with a missing/mismatched echo is stale evidence, so retry with a new nonce without asking the user; explicit auth/session/not-found HTTP errors remain authoritative recovery signals. If `commandId` was lost, omit it from a fresh nonce-bearing status POST; accept recovery only when `commandRecovery.recovered:true`, `commandRecovery.selected` is `active_fishing_command` or `latest_fishing_command`, and `commandRecovery.commandId` matches the top-level and nested command ids. An authoritative missing bridge session or expired/not-found token triggers automatic re-auth plus `/agent-start`; start idempotently reattaches an existing wallet run and returns `resume`, never replaces it. For a missing/mismatched bearer, follow the returned recovery. The dedicated server stops after a current-run catch lands and completes a declared-agent bundle, while an NFT wallet handoff takes priority. Bundle readiness is not Season reward eligibility; `sell_fish` remains authoritative. Save `commandId` immediately and obey `postCommand` when terminal.
- Treat `time_limit` as finished only for a bounded fishing-only request. For a requested claim/sale outcome, no catch or no complete sale bundle is nonterminal: obey cleanup, preserve the baseline, start a clean bridge, and continue without asking. Never reuse a disconnected bridge or old command result as fresh evidence. The daily NFT cap limits NFT offers only; `walletDailyRemaining:0` never blocks regular fishing.
- To stop a running fishing command, call `operation=stop` once. A 202 response with command `status:running` and `stopDrain.status=settling` means cancellation, an in-flight reel, or the authoritative post-loot inventory observation is still reconciling; poll the same command with a new verified nonce until terminal, and trust the stopped recap only with `stopDrain.status=settled|not_needed`. A late `wallet_action_required` outranks the stop. Treat `stopDrain.status=timed_out` as recoverable but `incomplete`: retain the bridge and poll the same command with another fresh nonce. After any other terminal result, call `/agent-stop` when no wallet handoff or requested continuation remains. Cleanup may itself return HTTP 202 `command_settling` or HTTP 409 for an unresolved fishing wallet handoff or `reconciliation_timeout`; in those cases it has retained the bridge, so process or poll `commandStop` and retry cleanup only after reconciliation. Report cleanup only from top-level `status:stopped`, checkpointing its terminal `commandStop` first. `handoffResolution.status:resolved` authoritatively clears only a historical fishing claim, so do not repeat that transaction. `unretained_unverified` means a generic wallet/payment instruction was not verified by cleanup and must not be reported complete. A requested terminal outcome and its transaction authorization persist across Bankr reply/tool limits: never ask whether to continue or ask for consent again. If a platform limit forces a reply, label it `incomplete`, checkpoint the exact next operation, and resume it first on the next invocation.
- Only when continuing the same known user request, if its checkpoint is missing but `/agent-player?wallet=...` shows the wallet online, recover with native HTTP + Bankr message signing: mint a fresh agent session and call `/agent-start` once. It reattaches the wallet's old bridge and returns `resume`; follow that checkpoint, and stop only after the command and wallet handoffs are terminal. `resume.command.status:handoff_resolved` or `resume.handoffResolution.status:resolved` is authoritative proof that the frozen fishing claim handoff is already terminal: do not poll or rebroadcast it; follow `nextOperation:agent_stop`. For a new request, drain inherited work under the fresh-run rule instead. Do not use CLI recovery.
- Map vague requests literally. "Start fishing and sell the NFTs" means fish, then claim and sell/redeem only NFT catches through the configured flows. That phrase already authorizes those necessary NFT transactions. It does not authorize `sell_fish`, `sell_trash_items`, or unrelated assets. `noPaidActions:true` limits autonomous gameplay, not those separately authorized NFT claim/approval/redemption transactions.
- When both regular-fish and NFT outcomes were explicitly requested, require the current run's `fishing.caughtItems`/catch events to prove at least one named regular catch, then require that a current-run item reaches an agent bundle and appears in matched `fishSale.sold`. One named catch alone may be below its bundle threshold. If an NFT handoff arrives first, finish its authorized wallet chain, then resume only dedicated fishing with `stopWhenRegularFishBundleReady:true`. Process another handoff only for plural/uncapped NFT authorization; after an explicitly capped NFT quantity is satisfied, leave an extra catch untouched and report the regular outcome `incomplete` rather than claim, sell, or abandon it. Complete all requested outcomes before `/agent-stop`.
- `operation: "sell_fish"` sells regular offchain fish for Season points only and is used only when regular-fish sale was requested. Confirm it only from the current request's matched `fishSale` success with item quantities and points. On `insufficient_bundle`, the fish remain held: checkpoint exact `bundleRequirements`, do not resubmit against unchanged inventory, and resume dedicated fishing with `maxSeconds:1800` plus `stopWhenRegularFishBundleReady:true`; retry the sale only after `fishing_regular_bundle_ready:<itemId>` and a fresh caught/inventory delta. On `season_point_capacity`, `mfergpt_gate`, or `request_limit`, stop retrying and report the structured blocker. On `approach_incomplete`, retry `sell_fish` because no sale was sent. On `in_progress`, checkpoint `requestId` and poll `operation=sell_fish_status` with a new verified `pollNonce` every time; never submit another sale while that id is pending or timed out, and report `incomplete` if it cannot be reconciled. On `fishSale.status=sale_in_progress`, resume the earlier checkpointed request if known or report `incomplete` with an unknown in-flight sale; never retry blindly. It requires completed `lost-fishing-shoes`. On `prerequisite_required`, follow `prerequisiteRequired.nextRequest` exactly: `/agent-fishing` `operation=start`, `questId=lost-fishing-shoes`, `maxSeconds=300`; poll until that terminal quest completes, allowing only its catalog-declared fishing prerequisites such as `fishin-lesson`, then retry `sell_fish`. If the scoped command times out first, repeat only that scoped request without asking until completion, `agent_command_budget_exhausted`, or unrecoverable error. Never use `/agent-command`, `play_for`, `finish_next_quest`, an unrelated quest, or trash-mfer.
- NFT catches use `claim_nft` and `submit_claim_tx`. A confirmed Mint Club redemption is a separate wallet sale/burn flow. When the request asks to claim, sell, or redeem a newly caught NFT, proceed through claim, any required approval, redemption, and game persistence without asking again. Redemption preparation atomically reserves the catch before returning sell calldata: checkpoint and broadcast that transaction once. `prepared`/`redemption_preparation_pending` returns no second transaction; resume only the checkpointed one. If it was lost, fail closed, clean up, and report incomplete. `tx_hash_conflict` or `state_conflict` must be reconciled without another sale because one burn hash cannot confirm multiple catches. Report success only with real transaction hashes and confirmed endpoint status.
- Never use `sell_trash_items` unless the player explicitly asked to sell trash.
- If the dedicated tool is unavailable, report `transport_unavailable`; do not translate fishing to generic autoplay, a manual loop, or `farmer`.

Every final fishing reply must state: `complete` only when every requested outcome is confirmed, otherwise `incomplete` with the blocking reason and checkpointed next operation; command status and duration; named regular catches; matched regular fish sales/points; new NFT catch and claim/redemption status; transaction hashes or "none"; and bridge cleanup status. Reconcile the latest authoritative evidence tied to this run; an earlier transient error cannot replace a later matched success. Treat only `questChanges`, `inventoryChanges`, and `equipmentChanges` as progress. `finalState` is a closing snapshot, so never say its level, XP, or quest was gained/completed during the run unless a corresponding change field proves it. Never invent why a sale was blocked: use `fishSale.bundleRequirements` and inventory evidence, and never blame the NFT daily cap or unrelated quests for regular-fish inventory.

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
/.well-known/ai-tool/mfertown-agent-command.json
/.well-known/ai-tool/mfertown-fishing.json
/.well-known/ai-tool/mfertown-mfergpt-swap.json
POST /agent-fishing
POST /agent-mfergpt-swap-quote
POST /agent-mfergpt-swap-result
```

`/agent-command` and `/agent-fishing` remain wallet-session authenticated. Registered-tool callers may include a zero-value EIP-3009 `X-Payment` header for OpenSea/ERC-8257 usage reporting. The fishing tool is separate from the generic command tool and covers pond fishing, fishing command status/stop, NFT claim wallet-action handoffs, claim tx submission, fish sales, and fishing NFT history refreshes. The swap quote tool returns ready-to-sign Base Universal Router calldata for ETH to MFERGPT after a valid zero-value tool proof; the caller's wallet still signs and submits the transaction.

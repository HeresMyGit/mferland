---
name: mferland-bankr
description: Bankr Terminal and @bankrbot-on-X playbook for mferland. Use when Bankr should play game.mfergpt.lol through the hosted HTTP bridge without installing files, downloading scripts, running Node, using a Bankr API key, or maintaining its own Colyseus room client.
---

# mferland Bankr Bridge

You are Bankr Terminal or `@bankrbot` on X. Use the hosted HTTP bridge only.

Hard rules:

- Do not install, download, curl, or run `mferland-agent` files.
- Do not run `npm`, `ts-node`, `mferland-agent-runner.ts`, or a Colyseus client.
- Do not ask the user for `BANKR_API_KEY`; that is only for external runners, not Bankr Terminal/X.
- Do not stop after `/agent-start`. Starting only logs the bridge player in; playing requires an observe/action loop.
- Use one action per poll. Treat HTTP `202` action responses as accepted/in progress, then keep observing.
- Do not print `sessionToken`, signatures, or bearer headers in user-visible chat.

## Auth

Base URL:

```txt
https://game.mfergpt.lol
```

1. POST `/wallet-auth-challenge`:

```json
{ "walletAddress": "0x..." }
```

2. Sign the returned `message` exactly with the same Bankr wallet. Preserve literal newlines.

3. POST `/agent-session`:

```json
{
  "walletAddress": "0x...",
  "nonce": "...",
  "message": "...",
  "signature": "0x..."
}
```

4. Use the returned `sessionToken` as:

```txt
Authorization: Bearer <sessionToken>
```

If Bankr truly has no arbitrary message-signing tool in the current surface, report that exact auth limitation. Do not invent an API-key requirement.

Auth errors return stable `code`, `recovery`, and `requestId` fields. On `/agent-session` failure, follow `recovery`:

```txt
valid_wallet_address_required -> send a valid 0x walletAddress.
missing_or_malformed_proof -> send nonce, exact message, and 0x signature.
challenge_not_found_or_consumed -> request a fresh /wallet-auth-challenge.
challenge_expired -> request a fresh /wallet-auth-challenge.
wallet_mismatch -> sign with the same walletAddress used for the challenge.
message_mismatch -> retry with the exact returned message, preserving literal newlines.
invalid_signature -> sign the exact returned message again.
```

If a returned code is not listed, follow the `recovery` value literally and keep `requestId` for support.

## Read-Only Profile

For simple questions about saved character or public world facts, do not start a bridge session or log into the game.

Use:

```txt
GET /agent-profile?wallet=<walletAddress>
```

This endpoint does not require wallet signing. It returns persisted profile facts such as `quickFacts.level`, `quickFacts.chest`, `character.level`, `equipmentBySlot`, `inventory`, `quests`, `talents`, `stats`, and `activeBuffs`.

Use `/agent-profile` for questions like:

```txt
what level are you?
what chest piece are you wearing?
what quests do you have saved?
how many talent points do you have?
what consumables are in your inventory?
```

Only start `/agent-start` when the user asks you to play, move, fight, interact, shop, chat in-game, or inspect live room state. `/agent-profile` is saved state; live HP, position, aggro, nearby NPCs, loot windows, chat, and cooldowns still require `/agent-observe` after `/agent-start`.

Use these broader read-only endpoints for public game-state questions:

```txt
GET /agent-world
GET /agent-player?wallet=<walletAddress>
GET /agent-player?name=<characterName>
GET /agent-milestones?type=centralizer
GET /agent-milestones?questId=baron-of-static
GET /season/leaderboard
GET /season/referrals?wallet=<walletAddress>
```

Examples:

```txt
who is online right now? -> /agent-world
what quest does heresmy.eth have? -> /agent-player?name=heresmy.eth
who killed The Centralizer? -> /agent-milestones?type=centralizer
what is my referral link? -> /season/referrals?wallet=<walletAddress>
```

These endpoints are read-only and do not perform gameplay. If the user asks a question, answer from these APIs. If the user asks you to act in-game, use the bridge play loop below.

Season referral questions are read-only. Human referral links use `https://game.mfergpt.lol/?referral=<referrer-wallet>` during first wallet character creation. Declared agents do not bind as referees, count as referrers, or trigger referral bonuses.

## Start

POST `/agent-start` with the bearer token:

```json
{
  "walletAddress": "0x...",
  "sessionToken": "...",
  "name": "bankr-agent",
  "objective": "Play mferland naturally, progress quests, survive, loot, use shops when worth it."
}
```

The response returns:

```json
{ "bridgeSessionId": "...", "observeUrl": "/agent-observe?bridgeSessionId=..." }
```

Watch with:

```txt
https://game.mfergpt.lol/agent-view?wallet=<walletAddress>
```

## Play Loop

For the requested duration, repeat:

```txt
GET /agent-observe?bridgeSessionId=...&view=bankr
choose exactly one action from actionSchema/availableActions/hints/current quest state
POST /agent-action
wait about 2-3 seconds
repeat
```

Always include:

```txt
Authorization: Bearer <sessionToken>
```

Action request shape:

```json
{
  "bridgeSessionId": "...",
  "action": "fight_npc",
  "reason": "Quest target is isolated and safe.",
  "npcRef": "wild-hog-grub"
}
```

Bankr-friendly aliases are accepted: `npcId` for `npcRef`, `playerId` for `playerRef`, `abilityId` for `actionId`, `routeId` for `text`, and `tokenId` for `text` on `register_chain_gear`.

`/agent-action` is durable. The bridge treats high-level actions as permission to handle short mechanical continuation with normal game messages: move into range, stop for stationary casts, keep a selected fight target, route to quest turn-ins, loot a defeated target, and use emergency survival reflexes. The HTTP response may wait several seconds before returning a report.

For `fight_npc`, prefer targets with low `approachRiskScore` and `pullRiskScore`, even if another target is a little closer. The bridge may report `safe_approach ... via loop-farm`, `claim-pile-edge`, `route-post`, or another staging point before fighting. That is expected: it is avoiding a direct run through hostile density while still executing Bankr's chosen target.

Read these response fields:

```txt
summary
stoppedBecause
report
suggestedNextAction
continuePrompt
durationMs
```

If `status` is `in_progress`, the bridge is still carrying out the chosen action. Observe again or continue with `suggestedNextAction` if step budget allows. If `status` is `completed`, pick the next action from `suggestedNextAction`, `hints`, or fresh observe state. If `status` is `safety_stop`, observe before pulling another enemy.

## Context Boundary

Do not load or follow the full `mferland-agent` runner skill unless the user explicitly asks about building a local runner. That skill contains Node install steps, raw Colyseus schema notes, movement-axis math, process management, and external signer examples that Bankr Terminal/X should not use.

For Bankr gameplay, compact observe is the source of truth:

```txt
GET /agent-observe?bridgeSessionId=...&view=bankr
```

Use this compact view by default to avoid context and step-limit blowups. It returns only the fields Bankr usually needs: self summary, active/ready quests, low-risk targets, nearby threats, loot, urgent hints, last report, suggested next action, wallet/talent alerts, and safe retreat routes. Fetch full `/agent-observe` only for debugging or when the compact view is missing something specific.

Full observe returns the curated live game state plus:

```txt
actionSchema, availableActions, actionAliases
walletActions
questStateGuide
catalog
hints
```

Use those fields when uncertain. `catalog` carries current game metadata such as quests, items, talents, shops, routes, combat actions, swap/payment details, Season 0 referral rules/endpoints, and reward gates. `questStateGuide` explains how to interpret accepted quests, available quest hints, and quest offers.

Quest status rules:

```txt
active = do objectives
ready = turn in
completed = history/prerequisite; do not keep trying to complete it
```

If an active quest has `progress >= required` or appears in `quests.ready`, turn it in before farming more. Do not keep killing quest mobs after a quest is ready unless survival requires clearing immediate aggro.

The bridge handles low-level movement/combat continuations after high-level actions such as `fight_npc`, `travel_route`, `accept_quest`, and `complete_quest`. Bankr still needs to keep polling and choosing the next high-level action until the requested play time ends.

The bridge automatically publishes visible agent status from each action's `reason`, objective, and current quest. Use `chat` or `emote` only when it adds useful social context; do not spam.

Canonical actions:

```txt
wait, move_to, travel_route, move_near_npc, move_near_player, respawn,
interact_npc, accept_quest, complete_quest, cancel_quest,
use_ability, fight_npc, loot,
equip_item, unequip_item, use_item, select_talent,
swap_eth_for_mfergpt, register_chain_gear,
purchase_potion_shop_item, sell_trash_items, update_traits,
respec_talents,
emote, chat, share_quest_link
```

## Decision Policy

Use the observation, not a fixed quest script.

Priority order:

1. If dead, `respawn`.
2. If `self.aggroCount > 1` and health is below 60%, retreat immediately unless the current target is roughly 2-3 hits from death and combat math is favorable. Retreat behavior should be expressed as `move_to`, `travel_route`, or a defensive `use_ability` if available.
3. Loot nearby `lootableCorpses`.
4. Complete ready quests.
5. If `self.unspentSkillPoints > 0`, spend a recommended talent before entering a combat zone unless survival, nearby loot, or ready quest turn-in is more urgent.
6. Accept available quests from `availableQuestHints` or quest-giver NPCs.
7. Fight quest targets, preferring named objective targets from `self.quests[].objectives`.
8. Equip upgrades, use consumables, sell trash, and use shops when safe and affordable.
9. Chat or emote briefly when useful; survival and quest progress come first.
10. For `update_traits`, prefer wallet/name-seeded variety over defaults or first-listed choices. Declared agents keep the robot face, so saved traits force `eyes: "regular"` and `mouth: "flat"`.
11. Use `respec_talents` only when spent talent ranks should be reset for a concrete build or survival reason and the wallet can provide a real MFERGPT burn proof.
12. Agents may explain human referral rules from `/season/referrals` and `/season/leaderboard`, but they do not participate in referral binding, counts, or bonuses.

Helpful observation fields:

```txt
self.hp, self.position, self.level, self.quests, self.inventory, self.equipment, self.talents
self.talentPoints, self.skillPoints, self.unspentSkillPoints
self.spendableTalents, self.recommendedTalentSpends
self.quests[].progressLabel
self.quests[].objectives = [{ id, label, done }]
nearbyNpcs[].distance and dist
nearbyNpcs[].pullRiskScore, approachRiskScore, threatLevel
lootableCorpses = [{ id, npcId, name, distance, items }]
combat.memory.summary, combat.memory.recentDeaths, combat.memory.avoidTargets, combat.memory.troubleSpots
hints = [{ action, priority, reason, npcRef?, questId? }]
availableQuestHints
questOffers
recentMessages
lastActionResult
```

If `self.unspentSkillPoints > 0`, consider `select_talent` before starting a risky combat pull. Use `self.recommendedTalentSpends[0].talentId` or a `select_talent` hint unless survival, ready quest turn-in, or nearby loot is more urgent.

## Combat Survival

For multi-NPC aggro, preserve the run instead of trying to finish every kill:

```txt
if self.aggroCount > 1 and healthRatio < 0.60:
  retreat unless current target is about 2-3 hits from death and combatMath.favorable is true
```

Near the farm/claim-pile, safe fallback points are:

```txt
loop-farm / hogwatch area: (-64.5, 64.5) — safest farm fallback
claim-pile-edge: (-89, 92) — staging edge, not a place to linger while overpulled
route-post: (-119.2, 132.4) — safe edge for field movement
plaza: (-2.4, 4.2) — central town fallback
```

Use `combat.safeRetreats` from `view=bankr` when available. Near claim-pile danger, prefer retreating to `loop-farm`.

Kiting intent:

```txt
Pull from max range with signalShot/shoot when available.
Let the bridge handle exact movement, stopping, and casts during durable fight_npc.
If overpull happens, retreat; do not manually spam more fight_npc actions into a bad pull.
```

For hog/farm pulls, prefer `combat.safeTargets` or NPCs with low `approachRiskScore` and `pullRiskScore`. Avoid targets whose direct path crosses the middle of the hostile farm.

Use `combat.memory` as short-term survival memory. If `combat.memory.avoidTargets` names an NPC or `combat.memory.troubleSpots` names an area/path, treat that as a soft veto until `avoidRemainingMs` clears. Switch to a safer target, route through a safe waypoint, heal/shop/gear/talent, or change quest focus. Only override combat memory when the user explicitly wants a risky boss/group attempt, and say that you are overriding the risk.

## Wallet Actions

The bridge cannot sign wallet transactions from a session token. Bankr signs/swaps/burns/mints in its wallet context, then sends proof back through `/agent-action`.

- `purchase_potion_shop_item` without proof returns HTTP `409` `payment_required` with exact Base MFERGPT burn details. Potion shop purchases cost MFERGPT and burn those tokens to reduce supply. Burn exactly that amount from the agent wallet, then retry the same action with `paymentTxHash`, `paymentAmountWei`, `paymentChainId: 8453`, and `paymentContractAddress`.
- Paid `update_traits` uses the same proof fields. First trait setup may be free if the server allows it.
- `respec_talents` uses the same proof fields. Burn the exact MFERGPT amount returned by the action or listed in `catalog.payments.mferGpt.talentRespec`, then retry with `paymentTxHash`, `paymentAmountWei`, `paymentChainId: 8453`, and `paymentContractAddress`.
- `swap_eth_for_mfergpt` returns HTTP `409` `wallet_action_required` with Base/token/router/fallback details. Execute the swap from the Bankr wallet context, then continue observing and acting.
- `register_chain_gear` is for gear already bought or minted by the wallet. After purchase/mint, send `register_chain_gear` with `tokenId` or `text`.
- Never claim a burn, swap, mint, or purchase happened unless Bankr has an actual transaction hash or owned token id.

Potion shop awareness:

```txt
If repeated low-health retreats happen, no health consumables remain, and the wallet can pay MFERGPT, consider potion-mfer before more combat.
Do not buy potions casually; purchases burn MFERGPT and require real wallet proof.
```

## Step Limits

If a 5-minute request risks Bankr's step limit, play in 60-90 second chunks rather than failing. Keep the same `bridgeSessionId` and `sessionToken` internally if still valid, report concise progress without exposing auth material, and ask the user to say `continue` for the next chunk.

Store `bridgeSessionId` in scratchpad/session state after `/agent-start`. Reuse it across turns with compact observe; do not restart auth or re-read the full skill unless the bridge returns `401`, `404`, or the user asks for a reset.

Do not restart auth unless the session is expired or the bridge returns `401`/`404`.

Recovery by bridge error code:

```txt
valid_wallet_address_required -> send a valid 0x walletAddress to /agent-start.
bridge_session_id_required -> reuse the stored bridgeSessionId, or call /agent-start if none exists.
bridge_session_not_found -> call /agent-start with the existing sessionToken.
missing_session_token -> request a fresh /wallet-auth-challenge and /agent-session.
missing_bearer_token -> reuse the original Authorization: Bearer <sessionToken>.
bridge_bearer_mismatch -> reuse the original sessionToken for that bridgeSessionId.
agent_session_not_found_or_expired -> request a fresh /wallet-auth-challenge and /agent-session.
malformed_session_token -> request a fresh /wallet-auth-challenge and /agent-session.
agent_session_wallet_mismatch -> use the sessionToken minted for this walletAddress, or re-auth this wallet.
internal_bridge_error -> retry once, then report requestId if it repeats.
```

When ending a chat turn, report only what actually happened in-game during that turn. Do not say "I'm starting to play", "I'll keep playing", or imply background gameplay will continue after the LLM turn ends unless an active `/agent-action` report says the bridge is still running that action. End with a concrete CTA such as "say `continue` and I will reuse this bridgeSessionId for the next chunk."

At the end of the requested play time, POST `/agent-stop` unless the user asked to keep the agent online.

---
name: mferland-bankr
description: Play mferland/mfertown from Bankr Terminal or @bankrbot on X through hosted HTTP. Use whenever a user asks Bankr to fish, catch or sell fishing NFTs/onchain goodies, play, quest, fight, farm, or act in mfertown/game.mfergpt.lol, including vague prompts such as "start fishing in mfertown and sell the NFTs."
---

# mferland for Bankr

Use Bankr's wallet and native HTTP/message-signing capabilities with the hosted game API at `https://game.mfergpt.lol`.

The canonical fishing tool manifest is `https://game.mfergpt.lol/.well-known/ai-tool/mfertown-fishing`; this skill expects manifest version `0.1.7` or newer.

This skill is self-contained. Do not install, load, or follow another mferland skill or runner.

## Hard boundaries

- Use hosted HTTPS only.
- Never use a CLI, shell, downloaded script, `npm`, `ts-node`, local process, or direct Colyseus client.
- Invoke only Bankr's native HTTP-request action for game endpoints and Bankr's native wallet actions for signing and sending transactions. Never put `curl`, `wget`, or an HTTP request inside a command string. If native HTTP or wallet signing is unavailable, stop with `transport_unavailable`; do not request an exception, API key, special phrase, or additional consent.
- Never ask for `BANKR_API_KEY`.
- Never expose a session token, bearer header, signature, bridge session id, command id, sale request id, private key, mnemonic, or wallet secret in visible chat.
- Do not perform wallet actions unrelated to the request.
- A user request to claim, sell, or redeem fishing NFTs/onchain goodies is itself authorization for the configured claim, approval, and Mint Club sell transactions required to do that. Do not ask for a second confirmation, special phrase, or repeated consent.
- Require a real transaction hash and successful receipt before reporting a claim or sale as complete.

## Authenticate and start

Base URL:

```txt
https://game.mfergpt.lol
```

1. `POST /wallet-auth-challenge` with `{ "walletAddress": "0x..." }`.
2. Sign the returned `message` exactly with the same Bankr wallet, preserving literal newlines.
3. `POST /agent-session` with:

```json
{
  "walletAddress": "0x...",
  "nonce": "...",
  "message": "...",
  "signature": "0x..."
}
```

4. Keep `sessionToken` private and send it as `Authorization: Bearer <sessionToken>`.
5. `POST /agent-start` with:

```json
{
  "walletAddress": "0x...",
  "sessionToken": "...",
  "name": "bankr-mfer"
}
```

Immediately create a private `runId` bound to the current user request and checkpoint it with `walletAddress`, `sessionToken`, `expiresAt`, and `bridgeSessionId` in Bankr's private scratchpad. Checkpoint `commandId` immediately after starting a command. Also checkpoint the normalized terminal outcomes, baseline catch ids, per-run regular catch totals, newly caught NFT catch id, and each claim, approval, regular-sale, and NFT-sale status and real transaction hash. On every later Bankr invocation that continues the same `runId`, load this checkpoint first and resume the first unfinished phase. Do not resume an older run for a new or superseding request. Never resend a transaction whose successful hash is already checkpointed. Overwrite connection values after re-authentication or a new bridge start. Never show private checkpoint values to the user.

## Establish the run contract and freshness baseline

A request that asks to claim/sell an NFT or to catch/sell regular fish is a terminal-outcome request. Continue until every requested outcome is confirmed, or until the game reports an actual command-budget block or an unrecoverable transport/wallet error. One no-catch or below-bundle time limit is not completion.

If the user explicitly requests both regular-fish and NFT sales, track both as required terminal outcomes. A regular catch is fresh only when the current run's command `fishing.caughtItems`/catch events name it; old inventory does not satisfy "catch regular fish." One named catch may be below the declared-agent sale bundle and is not sale completion. Require the matched `fishSale.sold` result to include at least one item id caught during this run. If an NFT wallet handoff arrives before a current-run catch completes a regular-fish bundle, finish the authorized NFT chain first, then resume clean dedicated fishing with `stopWhenRegularFishBundleReady: true`. If that session produces another NFT handoff, process it under the same authorization only when the request covered plural or uncapped caught NFTs. If the user explicitly capped the NFT quantity and it is already satisfied, do not claim, sell, or abandon the extra catch; checkpoint it and report the regular-catch outcome `incomplete` because casting is blocked by an unrequested extra NFT. Otherwise, "sell the NFTs" never implies a regular-fish sale.

Before the first cast, call `/agent-fishing` with `operation: "refresh"`. Trust the baseline only when that call returns `ok: true`, `status: "refreshed"`, and `nftCatches`; retry a failed or in-progress refresh instead of treating cached or missing history as empty. Privately record every returned `nftCatches[].catchId`. A catch is new for this run only if its catch id was absent from that baseline and appears in this run's command result or wallet handoff. Preserve the baseline across reconnects. Never use an older eligible, confirmed, or redeemable history entry to satisfy a fresh fishing request.

The original terminal outcomes and wallet authorization persist across Bankr reply/tool limits. Never ask "should I continue?" or request fresh consent. If a platform limit forces an intermediate reply, label it `incomplete`, checkpoint the exact next operation, and resume it on the next invocation before doing anything else.

## Interpret fishing requests literally

Prompts such as these all select the dedicated fishing flow:

```txt
start fishing
go fishing in mfertown
fish for onchain goodies
hey start up fishing in mfertown and sell the nfts!
```

For the last example, do exactly this:

1. Run hosted pond fishing.
2. If an NFT is caught, claim that NFT from the Bankr wallet.
3. If the confirmed catch exposes configured Mint Club redemption, approve the Bond if required and sell one caught ERC-1155.
4. Do not sell regular fish, trash, or unrelated wallet assets.

`sell_fish` means regular offchain fish only. `sell_trash_items` means trash only. Neither can claim or sell NFTs, so never use them for a request to "sell the NFTs." Never use the fish monger or trash-mfer as an NFT fallback.

## Start a bounded fishing session

Use only `POST /agent-fishing`:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "maxSeconds": 120,
  "stopWhenRegularFishBundleReady": true,
  "constraints": {
    "noPaidActions": true
  }
}
```

Include `stopWhenRegularFishBundleReady: true` only when selling regular fish is a requested terminal outcome; otherwise omit it. This dedicated mode stops after a fish caught in this command has landed in authoritative inventory and the total held count reaches its declared-agent bundle size. This proves only bundle readiness; `sell_fish` remains authoritative for Season-point capacity and MFERGPT eligibility. A pending NFT wallet handoff takes priority.

If the user gives a duration, use it within the endpoint limit. For a fishing-only request with no requested catch/claim/sale outcome, use 120 seconds. For a requested new NFT claim/sale, regular-fish sale, or an explicit "until" request, use `maxSeconds: 1800`; the server enforces the wallet's actual command cap and stops early on the requested bundle-ready condition or an NFT wallet handoff. Do not split a terminal request into repeated 120-second commands unless the server capped the prior command. Do not translate fishing into `farmer`, `farm_until`, `/agent-command`, a generic manual action loop, or a CLI command.

For a short bounded request, poll about every 15-20 seconds. For a terminal-outcome request, poll about every 45-60 seconds so the server-side command keeps working without exhausting Bankr's per-turn tool calls. Use `POST`, and create a new private `pollNonce` for every call (for example, a timestamp plus random suffix):

```json
{
  "operation": "status",
  "bridgeSessionId": "...",
  "commandId": "...",
  "pollNonce": "status-1720900000000-a1b2c3"
}
```

Trust a successful HTTP 200 command snapshot only when it echoes the exact current `pollNonce` and `bridgeSessionId`. When `commandId` was supplied, also require its exact echo. When it was omitted for recovery, require `commandRecovery.recovered: true`, require `commandRecovery.selected` to be `active_fishing_command` or `latest_fishing_command`, and require `commandRecovery.commandId` to match both the top-level and nested command ids before checkpointing it. Never reuse a nonce or repeatedly issue an identical GET: Bankr's HTTP action may replay a cached tool result even though the server sends no-store headers and the hosted command continues. A successful snapshot with an absent or mismatched echo is stale evidence; poll again with a new nonce rather than calling the game stalled or asking the user to continue. Explicit auth, missing-session, and not-found HTTP errors remain authoritative recovery signals even though they do not echo a nonce. GET remains compatibility-only and must include a unique `pollNonce` query parameter whose echo is verified.

If Bankr loses the private `commandId`, do not guess, truncate, ask the user, or immediately replace the bridge. Send `POST operation=status` on the authenticated bridge with a new `pollNonce` and omit `commandId`; the endpoint recovers the active fishing command or latest retained fishing recap and returns its real id. Verify the recovery fields above, checkpoint that returned id, and continue. Re-authenticate and call `/agent-start` automatically and without new consent only when an authoritative response reports a missing bridge session or an expired/not-found agent-session token; for a missing or mismatched bearer, follow the endpoint's returned recovery rather than guessing.

Continue until `status` is not `running`. `time_limit` is a completed bounded session and auto-disconnects the bridge. Do not issue manual follow-up gameplay actions on that disconnected bridge.

When stopping a running fishing command, send `operation: "stop"` exactly once. Stop is drain-aware: it forbids another cast, obtains an authoritative cancellation acknowledgement even when a just-dispatched cast is not visible yet, and reconciles any reel already dispatched plus its post-loot inventory observation or NFT handoff. HTTP 202 with command `status: "running"` and `stopDrain.status: "settling"` is not a terminal recap; poll the same command with a fresh verified `pollNonce` until terminal. Trust a stopped recap only when `stopDrain.status` is `settled` or `not_needed`. If the drain instead yields `wallet_action_required`, that handoff outranks the stop and must be completed. `stopDrain.status: "timed_out"` is `incomplete` but recoverable: preserve the bridge and evidence, do not clean up or report the earlier reel count as final, and poll the same command with another fresh nonce so reconciliation can resume.

The pond's daily NFT count limits only new NFT offers. `walletDailyRemaining: 0` never prevents regular fishing casts and is not a blocker for a requested regular-fish bundle or sale.

If the result contains `walletActionRequired.action: "claim_fishing_nft"`, stop fishing and complete the wallet handoff below. Do not keep casting while a voucher is pending.

## Sell regular fish when explicitly requested

Call `operation: "sell_fish"` only when regular-fish sale is a requested outcome. Its response is authoritative only when `fishSale` for the current request shows `ok: true`, `status: "sold"`, sold item names and quantities, and awarded points. If it returns `insufficient_bundle`, the fish are held, not empty or consumed: checkpoint `fishSale.bundleRequirements`, do not resubmit against unchanged inventory, and resume `/agent-fishing start` with `maxSeconds: 1800` plus `stopWhenRegularFishBundleReady: true`. Retry `sell_fish` only after that command reports a new caught item/inventory increase and stops with `fishing_regular_bundle_ready:<itemId>`. A `time_limit` before a bundle is ready is nonterminal; obey cleanup, reconnect, and repeat without asking. If it returns `season_point_capacity`, `mfergpt_gate`, or `request_limit`, do not keep fishing or resubmit: report the authoritative blocker and its structured capacity, gate, or requested-quantity details. If it returns `approach_incomplete`, retry `sell_fish` to continue toward fish monger; no sale was sent. If it returns `in_progress`, privately checkpoint its `requestId` and poll `/agent-fishing` with `operation: "sell_fish_status"` plus that id and a new `pollNonce` on every call; trust only a response echoing that exact nonce. If `fishSale.status` is `sale_in_progress`, do not retry blindly: resume the earlier checkpointed sale request if known, otherwise report `incomplete` with an unknown in-flight sale. Never submit another sale while a matched request is pending or timed out; keep reconciling that same id, and report `incomplete` if it cannot be reconciled.

Do not invent a cause for a blocked sale. Only explicit `questChanges` prove a quest changed during this command, and regular fishing inventory must be described from `fishing.caughtItems`, `inventoryChanges`, `finalState.inventoryCounts`, and `fishSale.bundleRequirements`. An NFT daily cap cannot explain missing regular fish.

If it returns `prerequisite_required` for `lost-fishing-shoes`, follow `prerequisiteRequired.nextRequest` exactly. It resolves to only this dedicated request:

```json
{
  "operation": "start",
  "bridgeSessionId": "...",
  "questId": "lost-fishing-shoes",
  "maxSeconds": 300,
  "constraints": {
    "noPaidActions": true
  }
}
```

Poll until non-running, stop as soon as `lost-fishing-shoes` is completed, verify that exact terminal quest completion, then retry `sell_fish`. The scoped runner may first complete `fishin-lesson` or another catalog-declared fishing prerequisite; that is in scope. If the command reaches `time_limit` without completing the terminal quest, clean up and repeat only the same scoped request without asking; stop only on completion, `agent_command_budget_exhausted`, or an unrecoverable error. Never use `/agent-command`, `play_for`, `finish_next_quest`, an unrelated quest, or unrelated autoplay to unlock a fish sale. Profile or Season-point totals may corroborate a sale but cannot replace the current request's `fishSale` result.

## Claim a caught NFT

Once a new catch creates a wallet handoff, proceed through claim, any required approval, redemption, and persistence without pausing for user confirmation. The original claim/sell request authorizes every configured transaction in this chain.

If needed, obtain the current ready transaction:

```json
{
  "operation": "claim_nft",
  "bridgeSessionId": "...",
  "catchId": "..."
}
```

Submit exactly the returned `walletActionRequired.transaction` from the same Bankr wallet on its stated chain. Wait for a successful receipt, then report the real hash to the game:

```json
{
  "operation": "submit_claim_tx",
  "bridgeSessionId": "...",
  "catchId": "...",
  "txHash": "0x..."
}
```

Call `operation: "refresh"` after submission. Continue only when the catch status is `confirmed`; do not infer confirmation from a submitted transaction alone.

## Sell a confirmed NFT

For a request that asks to sell/redeem the caught NFT, call:

```json
{
  "operation": "prepare_redemption",
  "bridgeSessionId": "...",
  "catchId": "..."
}
```

The server reads the configured Mint Club Bond, current approval, and current sell estimate, then returns exactly one next transaction:

- `phase: "approval_required"`: submit the returned ERC-1155 approval transaction, wait for a successful receipt, and call `prepare_redemption` again. Do not pass an approval hash to `submit_redemption_tx`.
- `phase: "sell_required"`: submit the returned Mint Club Bond sell/burn transaction and wait for a successful receipt.
- `status: "confirmed"`: the catch was already sold and no wallet transaction is needed.

After the sell receipt succeeds, report its real hash to the game:

```json
{
  "operation": "submit_redemption_tx",
  "bridgeSessionId": "...",
  "catchId": "...",
  "txHash": "0x..."
}
```

This submission is mandatory and must happen before `/agent-stop` or the final recap. Success requires the endpoint to return the catch redemption status `confirmed`. A successful wallet activity row, successful Burn receipt, submitted approval, pending sell, or invented hash is not proof that mferland persisted the sale. If the Burn succeeded but persistence is not confirmed, reconnect through hosted HTTP, submit the same real sale hash, verify `confirmed`, and only then stop.

## No-catch and cleanup behavior

If a bounded session catches no NFT and no NFT terminal outcome was requested:

- Perform no wallet transaction.
- Report the named regular catches and that claim/sale hashes are `none`.
- Obey `postCommand`; `time_limit` already disconnected the bridge.
- For another terminal state, call `POST /agent-stop` unless a claim/redemption handoff is still active.

For a caught NFT, the mandatory wallet order is: claim receipt -> `submit_claim_tx` confirmed -> prepare/approve if needed -> sell receipt -> `submit_redemption_tx` confirmed. For an NFT-only request, then call `/agent-stop` and recap. For a multi-outcome request, complete every remaining requested catch or regular-sale outcome before `/agent-stop`. Never move cleanup or recap ahead of NFT persistence confirmation or another requested outcome.

If claim or redemption is a requested terminal outcome, a no-catch session is nonterminal. Obey `postCommand`, start a clean authenticated bridge, preserve the original baseline, and continue without asking the user. Never reuse a disconnected bridge or a prior command result as evidence of a new attempt. Stop only for success, an actual game command-budget block, or an unrecoverable transport/wallet error.

If Bankr loses its private checkpoint while the public player endpoint shows the wallet online, recover with native HTTP and message signing: create a fresh agent session, call `/agent-start` once to replace the old wallet bridge, then immediately call `/agent-stop`. Do not use a CLI for recovery.

Call cleanup as `POST /agent-stop` with `{ "bridgeSessionId": "..." }` and require top-level `status: "stopped"` before reporting bridge cleanup complete. Cleanup itself is drain-guarded: HTTP 202 `command_settling` retains the bridge and returns `commandStop`, so poll that command with fresh nonces and retry cleanup only after reconciliation. HTTP 409 with top-level `wallet_action_required`, `payment_required`, or `reconciliation_timeout` also retains the bridge and must not be described as stopped. A 200 response with top-level `status: "stopped"` is authoritative after `handoffResolution.status: "resolved"`; its frozen `commandStop` may still preserve the historical wallet handoff, so do not repeat that transaction. Checkpoint the returned terminal `commandStop` before the final recap because it may contain a catch or reel that completed during cleanup.

## Other mfertown requests

For non-fishing play, use hosted `POST /agent-command`, poll its command id, return its recap, and clean up. Manual `/agent-observe` plus `/agent-action` is for a genuinely requested single action or debugging only, not the default play path.

## Final report

Report `complete` only when every requested terminal outcome is confirmed. Reconcile each phase from its latest authoritative evidence tied to this run; an earlier transient error cannot replace a later matched success. If anything remains unfinished, report `incomplete`, the blocking reason, and the exact checkpointed next operation. Do not phrase continuation as a question.

Every fishing reply must include:

- terminal command status and duration;
- named regular catches and quantities;
- regular fish sale/points status, normally `none` for an NFT-sale request;
- new NFT catch name and catch id, or `none`;
- claim status and real claim hash, or `none`;
- Mint Club redemption status and real sell hash, or `none`;
- bridge cleanup status.

Use returned endpoint evidence. `finalState` is only a closing snapshot; only `questChanges`, `inventoryChanges`, and `equipmentChanges` prove progress during a run.

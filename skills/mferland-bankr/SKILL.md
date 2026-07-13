---
name: mferland-bankr
description: Play mferland/mfertown from Bankr Terminal or @bankrbot on X through hosted HTTP. Use whenever a user asks Bankr to fish, catch or sell fishing NFTs/onchain goodies, play, quest, fight, farm, or act in mfertown/game.mfergpt.lol, including vague prompts such as "start fishing in mfertown and sell the NFTs."
---

# mferland for Bankr

Use Bankr's wallet and native HTTP/message-signing capabilities with the hosted game API at `https://game.mfergpt.lol`.

This skill is self-contained. Do not install, load, or follow another mferland skill or runner.

## Hard boundaries

- Use hosted HTTPS only.
- Never use a CLI, shell, downloaded script, `npm`, `ts-node`, local process, or direct Colyseus client.
- Never ask for `BANKR_API_KEY`.
- Never expose a session token, bearer header, signature, bridge session id, command id, private key, mnemonic, or wallet secret in visible chat.
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

Immediately checkpoint `walletAddress`, `sessionToken`, `expiresAt`, and `bridgeSessionId` in Bankr's private scratchpad. Checkpoint `commandId` immediately after starting a command. Overwrite the checkpoint after re-authentication or a new bridge start. Never show checkpoint values to the user.

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
  "constraints": {
    "noPaidActions": true
  }
}
```

If the user gives a duration, use it within the endpoint limit. Otherwise use 120 seconds. Do not translate fishing into `farmer`, `farm_until`, a generic manual action loop, or a CLI command.

Poll about every 15-20 seconds:

```txt
GET /agent-fishing?bridgeSessionId=...&commandId=...
```

Continue until `status` is not `running`. `time_limit` is a completed bounded session and auto-disconnects the bridge. Do not issue manual follow-up gameplay actions on that disconnected bridge.

If the result contains `walletActionRequired.action: "claim_fishing_nft"`, stop fishing and complete the wallet handoff below. Do not keep casting while a voucher is pending.

## Claim a caught NFT

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

Success requires the endpoint to return the catch redemption status `confirmed`. A submitted approval, a pending sell, a wallet activity row, or invented hash is not proof of sale.

## No-catch and cleanup behavior

If the bounded session catches no NFT:

- Perform no wallet transaction.
- Report the named regular catches and that claim/sale hashes are `none`.
- Obey `postCommand`; `time_limit` already disconnected the bridge.
- For another terminal state, call `POST /agent-stop` unless a claim/redemption handoff is still active.

If the user explicitly asked to continue until a catch, start another clean authenticated bridge and bounded fishing session after cleanup. Never reuse a disconnected bridge or a prior command result as evidence of a new attempt.

If Bankr loses its private checkpoint while the public player endpoint shows the wallet online, recover with native HTTP and message signing: create a fresh agent session, call `/agent-start` once to replace the old wallet bridge, then immediately call `/agent-stop`. Do not use a CLI for recovery.

## Other mfertown requests

For non-fishing play, use hosted `POST /agent-command`, poll its command id, return its recap, and clean up. Manual `/agent-observe` plus `/agent-action` is for a genuinely requested single action or debugging only, not the default play path.

## Final report

Every fishing reply must include:

- terminal command status and duration;
- named regular catches and quantities;
- regular fish sale/points status, normally `none` for an NFT-sale request;
- new NFT catch name and catch id, or `none`;
- claim status and real claim hash, or `none`;
- Mint Club redemption status and real sell hash, or `none`;
- bridge cleanup status.

Use returned endpoint evidence. `finalState` is only a closing snapshot; only `questChanges`, `inventoryChanges`, and `equipmentChanges` prove progress during a run.

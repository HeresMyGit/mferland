# Bankr Agent Auth Handoff

Date: 2026-06-10

## Context

Goal: get the `mfertown` / `mferland` agent harness working with actual Bankr as a service on Twitter / private terminal, not the Bankr API-key subprocess signer path.

Core problem from Bankr, in one sentence:

> Bankr agents can't sign arbitrary messages from inside a CLI subprocess - signing requires Bankr's wallet infrastructure which only runs in the main agent context (the user's chat with Bankr).

## What Bankr Said It Needs

Bankr proposed these server-side options:

### Option A — pre-signed session token (recommended by Bankr)

Add an endpoint like:

```txt
POST /agent-session
body: { walletAddress: "0x...", nonce: "...", message: "...", signature: "0x..." }
returns: { sessionToken: "...", expiresAt: ... }
```

Flow:

1. Fetch the challenge from the mferland server.
2. Sign it in Bankr chat via Bankr's wallet tool.
3. POST the signature to `/agent-session` and receive a `sessionToken`.
4. Pass `sessionToken` to the runner via env var.
5. Runner uses the token for all WebSocket auth; no signer needed at runtime.

### Option B — API key auth for trusted agents

Support:

```txt
X-Agent-Key: <secret>
```

on the WebSocket join. Bankr stores the key as an env var and the runner passes it directly. No signing flow.

### Option C — Bankr webhook signer

The mferland server calls a Bankr-hosted signing endpoint on behalf of a wallet. Bankr says it already has an HTTP signing API, so the server could wire the challenge flow to that signer and remove the need for a local signer in the runner.

### Option D — expose a REST action API (no WebSocket)

Add simple REST endpoints:

```txt
POST /agent/action { wallet, sessionToken, action: "attack|quest|move|interact", params: {} }
GET /agent/state { wallet, sessionToken }
```

Bankr would call these directly from chat each turn. No persistent process needed.

## Current mferland Reality

Current auth flow in the harness:

1. `POST /wallet-auth-challenge`
2. Sign the returned message
3. Join Colyseus `town` with:

```json
{
  "walletAuth": {
    "nonce": "...",
    "message": "...",
    "signature": "0x..."
  }
}
```

Current production runner assumption:

- the runner has a signer available at runtime
- the server verifies wallet auth in `TownRoom.onAuth()`
- this works great for local/private-key or API-backed signer paths
- this does not fit Bankr's "sign only in main chat context" constraint

Relevant local references:

- `skills/mferland-agent/scripts/mferland-agent-runner.ts`
- `apps/server/src/walletAuth.ts`
- `apps/server/src/rooms/TownRoom.ts`

## Recommendation

Chosen path: **Option A first**.

Secondary follow-up worth considering later: **Option D**.

## Why Option A

Option A is the cleanest fit for the existing mferland architecture.

Reasons:

- It matches the current challenge/sign-in model almost exactly.
- It preserves wallet-based identity instead of replacing it with a shared secret.
- It moves signing into the one place Bankr can actually do it: the main Bankr chat context.
- It avoids requiring a runtime signer inside the long-running runner process.
- It should require relatively small protocol changes compared with a full transport redesign.

Practical shape:

1. Keep `/wallet-auth-challenge` as the source of truth.
2. Add `/agent-session` that verifies a signed challenge once.
3. Mint a short-lived server session token bound to the wallet.
4. Let the runner join/auth using that session token instead of providing a live signature each time.

That keeps Bankr as just another signer source, rather than hardwiring the game to Bankr-specific custody.

Implementation shape:

- `POST /agent-session` accepts either top-level `{ walletAddress, nonce, message, signature }` or `{ walletAddress, walletAuth: { nonce, message, signature } }`.
- The returned `sessionToken` is passed to the Colyseus join options as `sessionToken` alongside the same `walletAddress`, `identityType: "wallet"`, and `agentClient: true`.
- The public runner uses `AGENT_SESSION_TOKEN` when present and skips `/wallet-auth-challenge` signing at runtime.
- Token-mode auth only proves game identity. Wallet-backed swaps or purchases still need `AGENT_SIGNER_COMMAND` or an explicit server-accepted payment proof.

## Why Not Option B As The Main Path

Option B is the fastest hack, but not the best long-term rail.

Problems:

- `X-Agent-Key` proves the runner has a secret, not that it controls the wallet identity.
- You end up creating a separate secret-to-wallet mapping layer anyway.
- It weakens the current wallet-auth model.
- Fine as an internal/admin fallback, not ideal as the main Bankr integration path.

Possible use:

- acceptable as a tightly scoped fallback for one trusted internal agent
- not the preferred generalized solution

## Why Not Option C First

Option C could work, but it couples mferland directly to Bankr's signing service.

Problems:

- It makes the server auth path Bankr-specific.
- It pushes custody/signing integration into the game backend instead of keeping it at the auth edge.
- It reduces portability for other agent stacks that may want the same session pattern later.

Conclusion:

- better to keep the session/token abstraction on the mferland side
- let Bankr provide the signature out-of-band

## Why Option D Is Interesting, But Second

Option D is the most Bankr-native UX for turn-based chat operation.

Upside:

- fits conversational agents well
- no persistent process required
- clean for "do one thing, observe state, do next thing" loops

Downside:

- bigger product and protocol shift
- creates a second control plane beyond the existing WebSocket/room model
- more than just an auth fix

Conclusion:

- worth exploring after Option A if the goal becomes Bankr-first turn control
- not the smallest path to get Bankr working with the existing harness

## Final Decision

Recommended order:

1. Implement **Option A** now.
2. Optionally keep **Option B** as a narrow internal fallback if needed.
3. Explore **Option D** later if Bankr-native turn-by-turn control becomes the real target UX.
4. Skip **Option C** unless there is a strong reason to make Bankr own the signing/session flow end to end.

## Important Note

There is already a local helper at:

```txt
skills/mferland-agent/scripts/bankr-signer.mjs
```

But that helper uses the Bankr API-key signing path, which is not the same constraint profile as actual Bankr agents on Twitter/private terminal.

So the missing piece for Bankr-the-service is not "another subprocess signer."

The missing piece is: **server-issued session auth after an out-of-band signature**.

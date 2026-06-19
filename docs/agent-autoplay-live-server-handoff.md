# Agent Autoplay Live Server Handoff

This branch is ready for host-machine validation, but it should not be deployed from this development computer. The live server operator should pull or merge the branch on the host that owns `game.mfergpt.lol`, run the checks below, and deploy only after the smoke tests pass.

## Scope

Branch:

```txt
codex/update-agent-harness-autoplay
```

Relevant surfaces:

- `/agent-start`
- `/agent-observe`
- `/agent-action`
- `/agent-command`
- `/agent-command-stop`
- `/agent-stop`
- `/agent-catalog`
- `/.well-known/ai-tool/mferland-agent-command.json`
- `/.well-known/ai-tool/mferland-mfergpt-swap.json`
- `/agent-mfergpt-swap-quote`
- `/agent-mfergpt-swap-result`
- `/agent-view?wallet=...`
- hosted skill files under `/skills/mferland`, `/skills/mferland-agent`, `/skills/mferland-local-model`, `/skills/mferland-autoplay`, and `/skills/mferland-bankr`

## Required Host Config

Confirm these are set correctly on the host before deployment:

```txt
DATABASE_URL
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI=25000000000000000000000000
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER
BASE_RPC_URL or configured Base RPC provider
MFERLAND_MFERGPT_TOKEN_ADDRESS
MFERLAND_TOOL_CREATOR_ADDRESS
MFERLAND_TOOL_OPERATOR_ADDRESS
MFERLAND_TOOL_REGISTRY_ADDRESS
OPENSEA_API_KEY
MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID
MFERLAND_TOOL_MFERLAND_MFERGPT_SWAP_ID
```

Tool registry variables can be absent in local/dev mode, but production OpenSea/ERC-8257 usage reporting requires the OpenSea key, registry/tool ids, operator address, and valid zero-value EIP-3009 `X-Payment` headers.

## Pre-Deploy Checks On Host

Run from the repo root after pulling the branch:

```sh
npm install
npm run typecheck
npm run test -w @mferland/server
npm run test -w @mferland/shared
npm run test -w @mferland/web
npm run build
```

If the host uses a narrower production build path, still run the server test suite and the top-level typecheck before switching traffic.

## Endpoint Smoke Tests

After starting the candidate server on the host, but before public announcement:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mferland-agent-command.json
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mferland-mfergpt-swap.json
curl -fsS https://game.mfergpt.lol/skills/mferland/SKILL.md
curl -fsS https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
curl -fsS https://game.mfergpt.lol/skills/mferland-agent/scripts/mferland-agent-runner.ts
```

Expected:

- `/agent-catalog` lists command kinds, profiles, schemes, goals, constraints, controller metadata, swap/router details, and Season 0 agent balance requirements.
- both `.well-known/ai-tool` manifests return stable JSON without self-referential hash fields; validate and hash the exact served files with `npx @opensea/tool-sdk validate` and `npx @opensea/tool-sdk hash` before registering them onchain.
- hosted skills include the main default skill, compatibility skill URLs, plus the advanced runner `SKILL.md`, runner scripts, package file, and tsconfig.

## Gameplay Smoke Tests

Use an owned disposable/test wallet. Do not publish the private key.

1. Request `/wallet-auth-challenge`.
2. Sign the returned message on the host-controlled test wallet.
3. POST to `/agent-session`.
4. POST to `/agent-start` with `agentClient: true` behavior through the bridge.
5. Open `/agent-view?wallet=<wallet>` and confirm the real renderer follows the agent.
6. Confirm login chat reports `Agent Rewards` state.
7. Start a short `/agent-command` `play_for` or `finish_next_quest`.
8. Confirm the agent acts through normal room messages and the viewer shows motion/status.
9. Confirm the command result includes:
   - `summary`
   - `recap`
   - `social`
   - `social.nearbyPlayers`
   - `social.recentChat`
   - `combat`
   - `equipmentChanges`
   - `finalState`
   - `budget`
   - rolling `usage`
10. Put a second player or agent nearby and send public chat, then verify the next command recap mentions that world context.
11. Confirm a base wallet stops at the configured base tier and returns upgrade copy.
12. Confirm a wallet below 25M MFERGPT can save progress but does not earn Season 0 agent points.
13. Confirm a wallet at or above 25M MFERGPT receives eligible Season 0 agent reward behavior with the reduced multiplier.

## Wallet And Swap Boundary

Verify the harness does not auto-sign wallet transactions:

- paid trait updates or potion burns without proof must return `payment_required`
- swaps must return `wallet_action_required` or registered-tool calldata, not silently submit a tx
- `/agent-mfergpt-swap-quote` without `X-Payment` should return the expected zero-value EIP-3009 challenge
- `/agent-mfergpt-swap-quote` with valid test `X-Payment` should return Base ETH to MFERGPT Universal Router calldata
- `/agent-mfergpt-swap-result` should record submitted tx hashes for reporting/recap purposes

## Rollback

Keep the previous production artifact available until:

- `/agent-catalog` and skills are confirmed
- bridge session auth works
- at least one command returns a complete recap
- viewer works for the command wallet
- Season 0 gate behavior is verified
- swap/tool endpoints fail closed when payment/tool env is missing or invalid

Rollback should be a normal service rollback to the previous build. Do not delete persisted agent profiles, command usage rows, or season point records as part of rollback unless a separate data repair is approved.

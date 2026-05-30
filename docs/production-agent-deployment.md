# Production Agent Deployment

This note is for deploying the public mferland agent MVP on `game.mfergpt.lol`.

## Goal

Let live wallet-authenticated agents connect to the single production game server, observe normal public room state, act only through the same Colyseus messages as humans, identify themselves as agents, and earn reduced Season 0 rewards only after meeting the 25M MFERGPT wallet goal.

There is no separate agent server for production.

## Server Requirements

Deploy the server code that includes:

- wallet challenge login through `/wallet-auth-challenge`
- wallet-auth verification during Colyseus join
- `agentClient: true` support in join options
- `PlayerState.isAgent`
- normal room messages for movement, quests, combat, loot, items, chat, emotes, and shops
- the 25M MFERGPT agent earning gate
- reduced agent Season 0 payout after the gate passes

Production env:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.25"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
MFERLAND_MFERGPT_PAYMENT_RPC_URL="https://mainnet.base.org"
MFERLAND_MFERGPT_TOKEN_ADDRESS="0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

The gate only controls Season 0 earning for declared agents. Agents below 25M MFERGPT can still play, save progress, complete quests, loot, and fight bosses.

## Skill Hosting

Do not publish only `SKILL.md`. Agents need the complete package:

```txt
mferland-agent/
  SKILL.md
  scripts/
    create-wallet.ts
    package.json
    tsconfig.json
    mferland-agent-runner.ts
```

Host one of these production install targets:

- `https://game.mfergpt.lol/skills/mferland-agent.tar.gz`
- `https://game.mfergpt.lol/skills/mferland-agent.zip`
- static file paths under `https://game.mfergpt.lol/skills/mferland-agent/...`
- a public repo path that agent runners can install from

The public install instructions should make clear that production use requires `AGENT_ALLOW_PRODUCTION=1` and an agent-controlled wallet signer.

## Agent Builder Setup

Minimal runner flow:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
AGENT_ALLOW_PRODUCTION=1 \
AGENT_PRIVATE_KEY=0x... \
AGENT_NAME=my-agent \
npm run start
```

Agents using Bankr, MPC, or another wallet backend can replace the private-key signer. The required behavior is the same:

1. request `https://game.mfergpt.lol/wallet-auth-challenge` for the wallet address
2. sign the returned message
3. join `wss://game.mfergpt.lol` room `town` with `identityType: "wallet"`, `walletAddress`, `walletAuth`, and `agentClient: true`
4. observe room state and act only through normal room messages

## Reward Gate Behavior

On login and gated quest reward attempts, declared agents receive `Agent Rewards` chat status:

- active: wallet holds at least 25M MFERGPT; reduced agent payout applies
- insufficient: progress saves, but Season 0 points do not accrue yet
- unavailable: balance check failed; treat rewards as inactive until it recovers
- disabled: server env disabled the balance gate

Successful Season 0 awards are sent by `Season 0` chat and include the adjusted agent payout.

## Quest And Combat Strategy

The server should stay authoritative. Do not add production-only shortcuts for agents.

The harness should expose enough context for agents to decide what to do:

- self state
- nearby players and whether they are agents
- NPC ids, positions, health, roles, quest ids, shop ids, loot windows, and targets
- quest offers, active quest snapshots, progress, ready turn-ins, and result messages
- inventory, equipment, talents, cooldowns, cast state, health, mana, and combat events
- chat and emotes for coordination

The bundled starter runner may include sample quest hints and routes to prove the harness works. Treat those as example client policy, not required gameplay infrastructure. Third-party agents should be able to replace that policy and make their own choices from the observed state and server messages.

Bosses remain normal combat targets. Agents can kill bosses if they reach the content, satisfy quest requirements where needed, stay alive, coordinate with others, and use normal combat actions.

## Live Smoke Checklist

Before public announcement:

1. Deploy to `game.mfergpt.lol`.
2. Confirm `/health` responds.
3. Confirm `/wallet-auth-challenge` returns a fresh challenge.
4. Install the hosted skill package in a fresh directory.
5. Run one controlled production agent with an owned test wallet.
6. Confirm the agent joins with `isAgent: true`.
7. Confirm `Agent Rewards` chat reports the 25M MFERGPT gate status.
8. Complete one eligible quest turn-in and confirm either gated no-points behavior or reduced Season 0 payout.
9. Confirm the agent can see nearby human players and agents.
10. Confirm no local-only auth bypass or test-only env is enabled.

Do not publish private keys, mnemonics, API keys, or real wallet secrets in the skill package or docs.

# mferland Production Agent Playbook

This file is for the production server/operator that pulls the agent gameplay harness onto `game.mfergpt.lol`.

## Ship Target

Use branch `codex/local-agent-gameplay`.

Agent harness commit already made locally:

```txt
21eb703 Build local agent gameplay harness
```

Do not include unrelated local quest shortcut edits unless you deliberately want them in production.

## Production Server Env

Set these on the production game server:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.25"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
MFERLAND_MFERGPT_PAYMENT_RPC_URL="https://mainnet.base.org"
MFERLAND_MFERGPT_TOKEN_ADDRESS="0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

MFERGPT Base/onchain details exposed to agents:

```txt
CHAIN_ID=8453
MFERGPT=0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
BURN=0x000000000000000000000000000000000000dEaD
WETH=0x4200000000000000000000000000000000000006
UNISWAP_UNIVERSAL_ROUTER=0x6fF5693b99212Da76ad316178A184AB56D299b43
UNISWAP_V4_HOOKS=0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC
UNISWAP_V4_FEE=0x800000
UNISWAP_V4_TICK_SPACING=200
```

Do not enable local-only wallet-auth bypasses or local-only test envs on production.

## What The Server Must Expose

- `/wallet-auth-challenge`
- Colyseus room `town` at `wss://game.mfergpt.lol`
- `/agent-catalog`
- `/agent-view?wallet=<agent-wallet-address>`

Agents join with:

```txt
identityType="wallet"
walletAddress=<agent wallet>
walletAuth={ nonce, message, signature }
agentClient=true
createCharacter=true when needed
```

Declared agents get `PlayerState.isAgent=true` and may send `agentStatus` with current action/thought/objective/quest text. The passive `/agent-view` page shows the real game renderer plus that status text.

## Agent Skill Hosting

Host the whole skill package, not only `SKILL.md`:

```txt
skills/mferland-agent/
  SKILL.md
  scripts/create-wallet.ts
  scripts/package.json
  scripts/tsconfig.json
  scripts/mferland-agent-runner.ts
```

Good production install targets:

```txt
https://game.mfergpt.lol/skills/mferland-agent.tar.gz
https://game.mfergpt.lol/skills/mferland-agent.zip
https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
```

## Agent Runner Env

Production agent runners should use:

```sh
ROOM_SERVER="wss://game.mfergpt.lol"
HTTP_SERVER="https://game.mfergpt.lol"
ROOM_NAME="town"
AUTH_ENDPOINT="/wallet-auth-challenge"
AGENT_CATALOG_ENDPOINT="/agent-catalog"
AGENT_ALLOW_PRODUCTION=1
AGENT_PRIVATE_KEY="0x..."
AGENT_NAME="my-agent"
AGENT_CREATE_CHARACTER=1
```

Wallet spending defaults to disabled unless the agent operator opts in:

```sh
AGENT_MAX_MFERGPT_SPEND_WEI=0
AGENT_MAX_SWAP_ETH_SPEND_WEI=0
```

Agents using Bankr, MPC, or another wallet backend can replace `AGENT_PRIVATE_KEY`; the required behavior is still request challenge, sign message, join with `walletAuth`, then act through normal room messages.

## MVP Acceptance Checks

After deploy/restart:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog
```

Then run one controlled production agent with an owned test wallet and verify:

1. Wallet challenge/signature login succeeds.
2. Character creates or resumes.
3. Player snapshot has `isAgent=true`.
4. `Agent Rewards` chat reports the 25M MFERGPT gate status.
5. Quest progress saves even below the gate.
6. Season 0 payout is blocked below the gate or reduced by the multiplier above the gate.
7. Agent can observe nearby human players and other agents.
8. Agent can move, interact, accept/complete quests, fight, loot, equip/use items, spend talents, chat, and emote through normal room messages.
9. `/agent-view?wallet=<wallet>` follows the agent in the real game renderer.
10. No production bypass, debug teleport, DB shortcut, or local testing wallet material is deployed.

## Current Local Playthrough Evidence

Fresh copied-skill run used wallet `0xaE1b254321ECA2E1F6fBf5623eBAc3736aa8Bd6B` against the local server only.

The agent autonomously completed early mainline quests through observed quest offers/status/turn-ins, reached `boar-bristle-cull`, killed the final hog from 9/10 to 10/10, turned it in, accepted `feral-farmers`, and started adapting to farmer overpull risk by choosing safer fights for XP. It did not reach Centralizer before we stopped the local run.

## Do Not Ship

- Private keys, mnemonics, real API keys, or wallet secrets.
- `.tmp/` copied-skill directories or local wallet JSON.
- Local-only wallet-auth bypass envs.
- The current unstaged ogre-raid quest prerequisite shortcut unless intentionally approved for production.

# Live Agent MVP

This is the minimum production-shaped path for wallet-authenticated agents. Do not use the production game server until the exact rollout is intentional.

## Contract Details

- Network: Base mainnet, chain id `8453`.
- RPC default: `https://mainnet.base.org`.
- MFERGPT token: `0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07`.
- Burn address: `0x000000000000000000000000000000000000dEaD`.
- Uniswap Universal Router on Base: `0x6fF5693b99212Da76ad316178A184AB56D299b43`.
- WETH on Base: `0x4200000000000000000000000000000000000006`.

The token address also lives in `TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS`; the web swap path uses it as `MFERGPT_BASE_TOKEN_ADDRESS`.

## Server MVP

Set this on the live server env when agents are allowed:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.25"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
```

Declared agents still play through the authoritative Colyseus room. They do not get a server-side gameplay API. They send the same `input`, quest, target, combat, item, loot, chat, emote, store, and payment messages as humans.

On join, agents must use wallet identity and a wallet auth proof:

```ts
{
  identityType: "wallet",
  walletAddress,
  walletAuth: { nonce, message, signature },
  createCharacter: true,
  agentClient: true
}
```

The server rejects declared agents without a wallet, marks the player state as `isAgent`, exposes that bit in snapshots/admin/player UI, and applies the Season 0 point multiplier when an eligible quest reward is awarded. Set the multiplier to `0` for no Season 0 points, `1` for full human points, or leave unset for the default `0.25`.

Declared agents only earn Season 0 quest points when their wallet holds at least 25M MFERGPT on Base. The gate is configured by `MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI`, defaults to `25000000000000000000000000`, and can be set to `0` to disable the balance gate. Quest progress still saves when the wallet is below the goal; Season 0 points start once the wallet meets the goal, then the reduced agent payout still applies.

Agents receive an `Agent Rewards` chat message on login and after gated quest reward attempts so the agent can tell whether the wallet is active, insufficient, disabled, or temporarily unavailable.

## Agent MVP

External agents only need a Colyseus client plus an agent-controlled wallet signer. A disposable wallet is useful for local tests, but production agents may use their own wallet, Bankr signer, or another signer implementation as long as they can sign the wallet auth challenge. The flow is:

1. Request `/wallet-auth-challenge` for the wallet address.
2. Sign the returned challenge message.
3. Join `town` with `identityType: "wallet"`, the wallet address, `walletAuth`, and `agentClient: true`.
4. Observe room state and act only through normal room messages.

For production, the runner requires an explicit guard:

```sh
AGENT_ALLOW_PRODUCTION=1 \
AGENT_SERVER_URL="wss://game.mfergpt.lol" \
AGENT_WALLET_FILE=".tmp/agent-wallets.json" \
npm run dev -w @mferland/agent
```

Do not set `MFERLAND_AGENT_LOCAL_ONLY=1` for production, because local-only mode intentionally refuses remote servers and remote databases.

## Bosses

Agents can still fight bosses and team targets. The `isAgent` flag only changes declared-agent visibility and Season 0 quest point awards. Boss defeat credit, loot windows, quest requirements, and turn-ins still use the same room logic as humans, so an agent still needs the relevant quest unlocked or active when a quest requires that boss.

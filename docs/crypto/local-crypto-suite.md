# Local Crypto Suite

This suite is for testing mferland's crypto economy locally before any Base deployment.

It currently models:

- `GOLD`: the in-game ERC-20 reward token.
- `MGEAR`: ERC-721-ish NFT gear items.
- `$mfer`: alternate payment token with a 10% store discount.
- `$mfergpt`: alternate payment token with a 25% store discount and burn-on-pay.
- quest reward distribution with per-wallet quest replay protection.
- `MFPASS0`: a capped Season 0 launch pass NFT that can be bought with ETH or by burning `$mfergpt`.
- gear upgrades from tier 1 to tier 3 by burning `GOLD`.

The contracts are intentionally simple and local-first. They are not audited production contracts.

## Requirements

Install Foundry on any new computer:

```sh
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Then install repo dependencies:

```sh
npm install
```

## Run The Tests

From the repo root:

```sh
npm run chain:test
```

That runs the Solidity test suite under `packages/chain/test`.
It also runs the Node export tests under `packages/chain/scripts` so the generated app prefill file stays compatible with the web client.

The suite verifies:

- a local ERC-20 token can be deployed and minted.
- quest rewards mint `GOLD` once per wallet plus quest id.
- the store clerk can mint NFT gear from the starter gear collection.
- ETH purchases require the full price.
- exact 10% and 25% discount math across listed gear prices.
- `$mfer` purchases get a 10% discount and send payment to treasury.
- `$mfergpt` purchases get a 25% discount and burn the payment.
- discounted ERC-20 purchases require the exact discounted allowance.
- the Season 0 launch pass can be minted with exact ETH payment or exact `$mfergpt` burn allowance.
- the Season 0 launch pass rejects wrong ETH prices, missing `$mfergpt` allowance, and sold-out mints.
- `GOLD` can be burned to upgrade any owned gear through tiers 1, 2, and 3.
- minted NFT gear is registered into the local game inventory, auto-equipped, and tier upgrades scale the in-game item stats.
- unauthorized reward distribution, unauthorized gear minting, and non-owner gear upgrades are blocked.
- local deployment broadcasts export all addresses the in-game store needs.

The web receipt-state tests can be run with:

```sh
npm run web:test
```

The full local crypto test path, including a headless browser pass through the in-game merchant UI, can be run with:

```sh
npm run crypto:test:local
```

That command starts any missing local services, deploys fresh local contracts, opens the game in a browser, connects the dev wallet, opens `drip mfer`, buys the starter gear collection through the merchant, checks onchain balances and NFT tiers, verifies reverted max-tier upgrades show as failures in the UI, and confirms an upgraded NFT is visible in the character screen with scaled stats.

## Pricing Model

The token payment price is calculated by `MferGearStore`, not by trusting the browser. The owner lists each gear type with:

```solidity
listGear(gearType, ethPrice, tokenPrice)
```

For the current local collection:

- `beater deck`: `0.01 ETH` or `100` token base.
- `road lid`: `0.012 ETH` or `125` token base.
- `lucky lighter`: `0.0069 ETH` or `69` token base.

The contract uses basis points:

```txt
discounted price = tokenPrice * (10_000 - discountBps) / 10_000
```

So:

- `$mfer` uses `1_000` bps discount, which is 10% off.
- `$mfergpt` uses `2_500` bps discount, which is 25% off.

The UI reads `discountedTokenPrice(gearType, discountBps)` before approval so it can approve exactly the expected payment amount. The buy functions also recalculate the same price onchain, so editing the browser cannot make the store undercharge.

Current payment behavior:

- ETH: exact native price is forwarded to treasury.
- `$mfer`: discounted token price is transferred to treasury.
- `$mfergpt`: discounted token price is burned from the buyer.

## Season 0 Launch Pass

`MferLaunchPass` is the selected first paid soft-launch surface for local testing.
It is intentionally separate from combat gear so early testers can exercise a real crypto purchase without buying power.

Current local terms:

- Collection: `mferland Season 0 Pass`
- Symbol: `MFPASS0`
- Max supply: `500`
- ETH price: `0.0069 ETH`
- `$mfergpt` price: `690 MFERGPT`, burned from the buyer
- Treasury: the same local treasury as the gear store

The pass has owner-controlled price and treasury setters, but mints still enforce exact ETH payment, exact `$mfergpt` allowance/burn, and the supply cap onchain.
This contract is a local proof path for the first tester purchase surface, not yet an audited production deployment.

## Base Token Parity

The local test tokens intentionally mirror the Base token metadata and payment functions we rely on:

| Token | Base address | Local metadata | Payment surface |
| --- | --- | --- | --- |
| `$mfer` | `0xe3086852a4b125803c815a158249ae468a3254ca` | `name=mfercoin`, `symbol=$mfer`, `decimals=18` | ERC-20 transfer/approve/transferFrom, `burn`, no `burnFrom` |
| `$mfergpt` | `0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07` | `name=mferGPT`, `symbol=MFERGPT`, `decimals=18` | ERC-20 transfer/approve/transferFrom, `burn`, `burnFrom`, permit/nonces/domain separator |

The store only transfers `$mfer` to treasury, because the live Base `$mfer` bytecode does not expose `burnFrom`. The `$mfergpt` local mock keeps `burnFrom`, matching the live Base `$mfergpt` payment path.

## Real Chain Setup Notes

On Base Sepolia or Base mainnet, this setup does not require new app API keys just to work.

Minimum real-chain requirements:

- a funded deployer wallet.
- a Base RPC URL.
- deployed addresses for `GOLD`, gear NFT, rewards distributor, and store.
- the real `$mfer` / `$mfergpt` token addresses above if we use existing tokens instead of local mocks.
- a frontend address config file for the target chain, similar to `apps/web/public/crypto/local-contracts.json`.

The current local `$mfergpt` mock supports `burnFrom`, so the store can burn the discounted payment directly. The Base `$mfergpt` contract also exposes `burnFrom`. A different existing ERC-20 may not expose that method, or may not allow the store to call it. For any new token, confirm the actual token contract behavior first. If direct burning is not available, switch the store path to `transferFrom` into a burn address or a treasury/sink address.

Base public RPC URLs currently include:

- Base mainnet: `https://mainnet.base.org`
- Base Sepolia: `https://sepolia.base.org`

Those public RPCs are fine for dev and early testing, but Base documents them as rate-limited and not suitable for production traffic. For production, use a node provider. That may involve an API key, but it is an infrastructure reliability choice, not a contract requirement.

For deployment, Foundry can use a local secure keystore via `cast wallet import deployer --interactive`, then deploy with `--account deployer --broadcast`. Contract source verification on BaseScan/Etherscan is optional for runtime, but it usually needs an explorer API key if we automate it from Foundry.

## Start A Local Testnet

Terminal 1:

```sh
npm run chain:node
```

This starts Anvil on:

```txt
http://127.0.0.1:8545
chain id: 31337
```

Terminal 2:

```sh
npm run chain:deploy:local
```

The deploy script creates local versions of:

- `MferGold`
- `$mfer`
- `$mfergpt`
- `MferGearNFT`
- `QuestRewardDistributor`
- `MferLaunchPass`
- `MferGearStore`

It authorizes the quest reward distributor to mint `GOLD`, authorizes the store to mint gear NFTs, lists a small starter gear collection, mints local `$mfer` / `$mfergpt` balances to the deployer, and exports the latest local contract addresses to:

```txt
apps/web/public/crypto/local-contracts.json
```

The local deploy script uses Anvil's first unlocked dev account as the sender. Do not reuse Anvil dev accounts or local seed phrases on any public network.

For local payment tests, the store treasury is Anvil's second unlocked dev account. That makes `$mfer` payments and ETH payments visibly leave the buyer account instead of transferring back to itself.

## In-Game Store Clerk UI

The game client now has a local crypto store panel for merchant NPCs. Start the game normally, interact with a merchant, and the panel opens in the HUD.

Use it after deploying the local suite:

1. Run `npm run chain:node`.
2. Run `npm run chain:deploy:local`.
3. Connect a wallet pointed at `http://127.0.0.1:8545` with chain id `31337`.
4. Open a merchant in-game. The panel pre-fills `MferGearStore`, `MferGearNFT`, `MferGold`, `$mfer`, `$mfergpt`, and `QuestRewardDistributor` from `apps/web/public/crypto/local-contracts.json`.
5. Pick an item from the local starter collection: `beater deck`, `road lid`, or `lucky lighter`.
6. Buy gear with ETH, `$mfer`, or `$mfergpt`. In the local dev suite, the minted token id is registered into the game inventory and auto-equipped into its matching gear slot.
7. In dev, use `grant test gold` to mint local quest-reward `GOLD` through `QuestRewardDistributor`, then burn `GOLD` to upgrade a token id. The upgraded tier is read from `MferGearNFT` and sent to the local game state.

The contract fields also persist in local storage for manual overrides, but the generated local deployment file is loaded first when available.
The `grant test gold` button is only for local gameplay testing; real quest rewards should come from the server reward flow.

## Standalone Debug Store UI

There is a tiny standalone test UI at:

```txt
packages/chain/ui/store-clerk.html
```

Use it only as a fallback when debugging wallet calls outside the game:

1. Open the HTML file in a browser.
2. Connect a wallet pointed at `http://127.0.0.1:8545` with chain id `31337`.
3. Copy the deployed `MferGearStore`, `MferGold`, `$mfer`, and `$mfergpt` addresses from the deploy output or `packages/chain/broadcast/.../run-latest.json`.
4. Use the buttons to buy gear with ETH, `$mfer`, or `$mfergpt`, then burn `GOLD` to upgrade a token id.

The page is intentionally raw. It exists so we can test wallet prompts and local contract calls when the game UI is not running.

## Current Contract Layout

```txt
packages/chain/
  foundry.toml
  package.json
  src/
    MferGold.sol
    MferGearNFT.sol
    MferGearStore.sol
    MferLaunchPass.sol
    QuestRewardDistributor.sol
  test/
    CryptoSuite.t.sol
  script/
    DeployLocalSuite.s.sol
  ui/
    store-clerk.html
```

## Economy Decisions Captured For Now

`GOLD` is onchain in this first version. There is no separate offchain gold balance in this suite.

Quest completion is represented by the game/server calling `QuestRewardDistributor.distributeQuestReward(player, questId, amount)`. The contract prevents the same wallet from claiming the same quest id twice.

Store purchases are modeled as:

- ETH: full native price.
- `$mfer`: token price minus 10%, paid to treasury.
- `$mfergpt`: token price minus 25%, burned from the buyer.

Gear upgrades are modeled as `GOLD` burns:

- tier 1 to tier 2 costs `50 GOLD`.
- tier 2 to tier 3 costs `125 GOLD`.
- tier 3 is the current max.

For now, each tier above tier 1 increases that item's stat bonuses by 33%. Tier 2 uses `1.33x` item stats and tier 3 uses `1.66x` item stats. Those scaled STR, DEX, MAG, HP, and MP bonuses flow through the normal character stat and combat damage formulas.

## Useful Next Tests

Add these before productionizing:

- signed reward claims so the server does not need to submit every reward transaction.
- EIP-712 replay protection across chain id, contract address, wallet, quest id, and amount.
- store inventory limits or unlimited mint policy, whichever design wins.
- production server verification that the connected wallet owns the NFT and that the reported tier matches the chain.
- gear metadata URI and expanded item id mapping beyond the local starter collection in `packages/shared/src/items.ts`.
- withdrawal tests for any treasury-held ERC-20 balances.
- Base Sepolia deployment scripts and address export for the web app.
- fork tests against real `$mfer` / `$mfergpt` token contracts once final addresses are chosen.

# Local Crypto Suite

This suite is for testing mferland's crypto economy locally before any Base deployment.

It currently models:

- `MferPricing`: the central onchain price catalog for pass and gear products.
- `MGEAR`: ERC-721-ish NFT gear items.
- `$mfer`: alternate payment token with a 10% discount that pays treasury.
- `$mfergpt`: alternate payment token with a 25% store discount and burn-on-pay.
- `MFPASS0`: a capped Season 0 launch pass NFT that can be bought with ETH, discounted `$mfer` to treasury, or by burning `$mfergpt`.
- verified gear registration from the gear NFT into the game inventory.

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

- local ERC-20 payment tokens deploy with the expected Base-token shape.
- central pricing stores separate ETH, `$mfer`, and `$mfergpt` prices for each product.
- the store clerk can mint NFT gear from the starter gear collection.
- ETH purchases require the full price.
- `$mfer` purchases use the central `$mfer` price and send payment to treasury.
- `$mfergpt` purchases use the central `$mfergpt` price and burn the payment.
- discounted ERC-20 purchases require the exact discounted allowance.
- the Season 0 launch pass can be minted with exact ETH payment, exact discounted `$mfer` treasury payment, or exact `$mfergpt` burn allowance.
- the Season 0 launch pass rejects wrong ETH prices, missing ERC-20 allowances, and sold-out mints.
- central price updates cannot pull more token payment than the user's quoted maximum.
- minted NFT gear is verified against `ownerOf` plus `gear(tokenId)` before the game inventory accepts it.
- unauthorized gear minting is blocked.
- local deployment broadcasts export all addresses the in-game store needs.

The web receipt-state tests can be run with:

```sh
npm run web:test
```

The full local crypto test path, including a headless browser pass through the in-game merchant UI, can be run with:

```sh
npm run crypto:test:local
```

That command starts any missing local services, deploys fresh local contracts, refreshes live market quotes into the local price catalog, opens the game in a browser, connects the dev wallet, opens `drip desk mfer`, buys gear with ETH, mock `$mfer`, and mock `$mfergpt`, mints the launch pass with ETH, mock `$mfer`, and mock `$mfergpt`, saves the first trait set, pays for a mock `$mfer` trait change, checks onchain balances, burns, and NFT ownership, and confirms verified gear is visible in the character screen. The browser smoke enables `MFERLAND_CRYPTO_SMOKE_AUTH_BYPASS=1` only for the standard Anvil buyer wallet so a mock connector can enter the room; `/health` reports that flag so an already-running server without the smoke settings fails early.

## Pricing Model

The authored price lives in `MferPricing`, not in the browser. `MferLaunchPass` and `MferGearStore` read the central catalog at purchase time. The owner sets each product's ETH, `$mfer`, and `$mfergpt` prices in one contract:

```solidity
setSeason0PassPrice(ethPrice, mferPrice, mferGptPrice)
setGearPrice(gearType, ethPrice, mferPrice, mferGptPrice)
```

For the current local collection:

- `posted-up deck`: `0.01 ETH`, `90 $mfer`, or `75 MFERGPT`.
- `posted-up laptop lid`: `0.012 ETH`, `112.5 $mfer`, or `93.75 MFERGPT`.
- `last-cig lighter`: `0.0069 ETH`, `62.1 $mfer`, or `51.75 MFERGPT`.

The UI reads the onchain price before approval so it can approve exactly the expected payment amount. Token buy functions also take that quote as a max payment and reread central pricing onchain, so editing the browser cannot make the store undercharge and a price update cannot pull more than the quoted amount.

Current payment behavior:

- ETH: exact native price is forwarded to treasury.
- `$mfer`: discounted token price is transferred to treasury, and the store verifies the treasury balance increased by the exact amount. Fee-on-transfer or no-op payment tokens are rejected.
- `$mfergpt`: discounted token price is burned from the buyer with exact balance/supply checks.

## Season 0 Launch Pass

`MferLaunchPass` is the selected first paid soft-launch surface for local testing.
It is intentionally separate from combat gear so early testers can exercise a real crypto purchase without buying power.
The support export path treats a confirmed `season0-pass` purchase or manual grant as the eligibility gate for any reviewed token distribution.

Current local terms:

- Collection: `mferland Season 0 Pass`
- Symbol: `MFPASS0`
- Max supply: `500`
- ETH price: `0.0069 ETH`
- `$mfer` price: `621 $mfer`, paid to treasury
- `$mfergpt` price: `517.5 MFERGPT`, sent from the buyer to `0x000000000000000000000000000000000000dEaD`
- Treasury: the same local treasury as the gear store

The pass has owner-controlled price and treasury setters, but mints still enforce exact ETH payment, user-supplied max token payment limits, exact `$mfer` treasury receipt, exact `$mfergpt` burn-address receipt, and the supply cap onchain.
This contract is a local proof path for the first tester purchase surface, not yet an audited production deployment.

## Base Token Parity

The local test tokens intentionally mirror the Base token metadata and payment functions we rely on:

| Token | Base address | Local metadata | Payment surface |
| --- | --- | --- | --- |
| `$mfer` | `0xe3086852a4b125803c815a158249ae468a3254ca` | `name=mfercoin`, `symbol=$mfer`, `decimals=18` | ERC-20 transfer/approve/transferFrom, `burn`, no `burnFrom` |
| `$mfergpt` | `0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07` | `name=mferGPT`, `symbol=MFERGPT`, `decimals=18` | ERC-20 transfer/approve/transferFrom, `burn`, `burnFrom`, permit/nonces/domain separator |

The store transfers `$mfer` to treasury and transfers `$mfergpt` to `0x000000000000000000000000000000000000dEaD`. The live Base `$mfergpt` contract exposes `burn`/`burnFrom`, but the app uses the burn-address path for explorer-visible payment sinks.

## Real Chain Setup Notes

On Base Sepolia or Base mainnet, this setup does not require new app API keys just to work.

Minimum real-chain requirements:

- a funded deployer wallet.
- a Base RPC URL.
- deployed addresses for `MferPricing`, launch pass, gear NFT, and gear store.
- the real `$mfer` / `$mfergpt` token addresses above if we use existing tokens instead of local mocks.
- a frontend address config file for the target chain, similar to `apps/web/public/crypto/local-contracts.json`.

The current local `$mfergpt` mock still supports `burn`/`burnFrom`, matching the live Base ABI, but store, pass, and trait payments intentionally use ERC-20 transfer/transferFrom into the burn address. A different existing ERC-20 may not expose burn methods, so the burn-address path is the safer default for token compatibility.

Base public RPC URLs currently include:

- Base mainnet: `https://mainnet.base.org`
- Base Sepolia: `https://sepolia.base.org`

Those public RPCs are fine for dev and early testing, but Base documents them as rate-limited and not suitable for production traffic. For production, use a node provider. That may involve an API key, but it is an infrastructure reliability choice, not a contract requirement.

For deployment, Foundry can use a local secure keystore via `cast wallet import deployer --interactive`, then deploy with `--account deployer --broadcast`. Contract source verification on BaseScan/Etherscan is optional for runtime, but it usually needs an explorer API key if we automate it from Foundry.

## Local Crypto Backend Requirements

A machine that runs the full crypto test loop needs:

- Foundry installed with `foundryup`, which provides `forge`, `cast`, `anvil`, and `chisel`.
- Postgres available for local or staging `DATABASE_URL` migrations and `crypto_market_quotes`.
- Playwright's Chromium browser installed for `npm run crypto:browser:local`.

One-time setup on a Mac:

```sh
curl -L https://foundry.paradigm.xyz | bash
source ~/.zshenv
foundryup
brew install postgresql@17
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb mferland_test
npx playwright install chromium
```

Local `.env`:

```txt
DATABASE_URL="postgresql://USER@localhost:5432/mferland_test"
VITE_SERVER_URL="http://localhost:2567"
VITE_CRYPTO_CONTRACTS_URL="/crypto/local-contracts.json"
MFERLAND_MARKET_QUOTE_INTERVAL_MS="60000"
MFERLAND_CONTRACT_PRICE_UPDATE_INTERVAL_MS="21600000"
MFERLAND_CONTRACT_PRICE_DRIFT_BPS="2500"
```

Then:

```sh
npm run db:migrate -w @mferland/server
npm run pricing:refresh:market
npm run crypto:test:local
```

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

- `$mfer`
- `$mfergpt`
- `MferPricing`
- `MferGearNFT`
- `MferLaunchPass`
- `MferGearStore`

It sets central prices, authorizes the store to mint gear NFTs, lists a small starter gear collection, mints local `$mfer` / `$mfergpt` balances to the deployer, and exports the latest local contract addresses to:

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
4. Open a merchant in-game. The panel pre-fills `MferGearStore`, `MferGearNFT`, `MferPricing`, `$mfer`, `$mfergpt`, and `MferLaunchPass` from `apps/web/public/crypto/local-contracts.json`.
5. Pick an item from the local starter collection: `posted-up deck`, `posted-up laptop lid`, or `last-cig lighter`.
6. Buy the Season 0 pass with ETH, discounted `$mfer` paid to treasury, or `$mfergpt` burn.
7. Buy gear with ETH, `$mfer`, or `$mfergpt`. The game verifies the minted token id against `MferGearNFT.ownerOf` and `MferGearNFT.gear` before adding it to inventory and auto-equipping it.

The contract fields also persist in local storage for manual overrides, but the generated local deployment file is loaded first when available.

## Live Quote Contract Pricing

For real-data testing with mock tokens, the server now refreshes live Base `$mfer/WETH` and `MFERGPT/WETH` quotes every 60 seconds when `DATABASE_URL` is configured. In local development, if `apps/web/public/crypto/local-contracts.json` points at Anvil chain `31337`, the server can use those live quotes to update the local `MferPricing` contract while purchases still spend the locally deployed mock `$mfer` and mock `MFERGPT` tokens.

The updater recalculates token amounts from each product's onchain ETH price:

- `$mfer`: 10% discount against the ETH price.
- `MFERGPT`: 25% discount against the ETH price.

It writes `MferPricing` only when either condition is true:

- the product's onchain price is at least 6 hours old.
- the newly calculated `$mfer` or `MFERGPT` amount differs by at least 25% from the current smart contract amount.

Useful env knobs:

```txt
MFERLAND_MARKET_QUOTE_INTERVAL_MS="60000"
MFERLAND_CONTRACT_PRICING_DISABLED="0"
MFERLAND_CONTRACT_PRICING_UPDATER="" # blank allows local auto; set 1 only for explicit configured environments
MFERLAND_CONTRACT_PRICE_UPDATE_INTERVAL_MS="21600000"
MFERLAND_CONTRACT_PRICE_DRIFT_BPS="2500"
MFERLAND_PRICING_OWNER_ADDRESS="" # optional unlocked RPC account override
MFERLAND_PRICING_OWNER_PRIVATE_KEY="" # only for private local/staging env files, never commit
```

Base/mainnet contract writes are not automatic. For any non-local chain, set the pricing contract/RPC/owner env explicitly and only after the deployment gate is reopened.

In production builds the same panel defaults to `/crypto/production-contracts.json`, or `VITE_CRYPTO_CONTRACTS_URL` if configured. The production config needs `pricing`, `launchPass`, `$mfer`, and `$mfergpt` for the pass surface; gear and store addresses can stay blank until production gear minting is live.

## Standalone Debug Store UI

There is a tiny standalone test UI at:

```txt
packages/chain/ui/store-clerk.html
```

Use it only as a fallback when debugging wallet calls outside the game:

1. Open the HTML file in a browser.
2. Connect a wallet pointed at `http://127.0.0.1:8545` with chain id `31337`.
3. Copy the deployed `MferGearStore`, `MferPricing`, `$mfer`, and `$mfergpt` addresses from the deploy output or `packages/chain/broadcast/.../run-latest.json`.
4. Use the buttons to buy gear with ETH, `$mfer`, or `$mfergpt`.

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
    MferPricing.sol
    QuestRewardDistributor.sol
  test/
    CryptoSuite.t.sol
  script/
    DeployLocalSuite.s.sol
  ui/
    store-clerk.html
```

## Economy Decisions Captured For Now

`MferGold` and `QuestRewardDistributor` remain in the repo as inactive legacy contracts, but they are no longer deployed by the local suite or used by the active product flow.

Quest completion is represented by offchain Season Points in the game database. Wallet players can collect points, and confirmed Season 0 pass ownership or a manual pass grant is the eligibility gate for airdrop/export flows.

Store purchases are modeled as:

- ETH: full native price.
- `$mfer`: token price minus 10%, paid to treasury.
- `$mfergpt`: token price minus 25%, burned from the buyer.

Gear upgrades are intentionally out of the active alpha scope. Premium gear mints as ERC-721 gear, and the game inventory accepts it only after ownership verification.

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

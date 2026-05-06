# Mac Mini Soft Launch Runbook

Use this from the Mac mini when it becomes the launch machine. Keep secrets in local env files or shell session only. Do not commit `.env`, private keys, RPC keys, or generated production config containing unreviewed addresses.

## 0. Pull The Prep Branch

```sh
cd /Users/joshclarke/dev/mferland
git fetch origin
git checkout codex/soft-launch-prep
git pull --ff-only
npm install
```

Run the local non-secret checks first:

```sh
npm run typecheck
npm run build
npm run build:agent
```

## 1. Configure Local Secrets

Create the launch-machine `.env` from the template:

```sh
cp docs/launch/mac-mini-env.example .env
```

Fill:

```txt
DATABASE_URL="postgresql://..."
VITE_SERVER_URL="https://..."
VITE_CRYPTO_CONTRACTS_URL="/crypto/production-contracts.json"
VITE_GA_MEASUREMENT_ID=""
```

Set chain deployment secrets only in the shell session or a private local env file:

```sh
export BASE_RPC_URL="https://..."
export DEPLOYER_PRIVATE_KEY="0x..."
export PASS_OWNER="0x..."
export PASS_TREASURY="0x..."
export MFER_TOKEN="0x..."
export MFERGPT_TOKEN="0x..."
export PASS_ETH_PRICE_WEI="6900000000000000"
export PASS_MFERGPT_PRICE_WEI="690000000000000000000"
export PASS_MAX_SUPPLY="500"
```

Do not paste these into chat or commit them.

## 2. Quote The `$mfer` Price

Use Dex Screener's free Base token-pairs API to quote the current `$mfer/WETH` price:

```sh
npm run pricing:quote:mfer-pass -- \
  --dexscreener-token 0xe3086852a4b125803c815a158249ae468a3254ca \
  --min-liquidity-usd 1000
```

Copy `requiredMferWei` into:

```sh
export PASS_MFER_PRICE_WEI="<requiredMferWei>"
```

Sanity-check the selected pair, liquidity, and required `$mfer` amount before deploying. If the quote looks wrong, stop.

## 3. Apply Production DB Migrations

Confirm `.env` points at the intended Neon production branch. Then:

```sh
npm run db:migrate -w @mferland/server
npm run support:admin -- season-summary
npm run support:admin -- purchase-summary
npm run support:admin -- analytics-summary --since 24h
```

If these commands hit the test DB by accident, stop and fix `DATABASE_URL`.

## 4. Deploy The Season 0 Pass

Dry-run compile first:

```sh
npm run chain:build
```

Deploy:

```sh
npm run chain:deploy:pass:base
```

Record the deployed `MferLaunchPass` address from Foundry output. Keep the broadcast/cache folders uncommitted; they are ignored.

## 5. Create Production Web Contract Config

Copy the example:

```sh
cp apps/web/public/crypto/production-contracts.example.json apps/web/public/crypto/production-contracts.json
```

Fill:

- `chainId`: `8453`
- `chainName`: `Base`
- `rpcUrl`: production-safe RPC URL if wallets may need chain-add metadata, otherwise `""`
- `addresses.mfer`: Base `$mfer`
- `addresses.mfergpt`: Base `$mfergpt`
- `addresses.launchPass`: deployed `MferLaunchPass`

Leave local-only suite addresses blank unless production versions exist:

- `addresses.gold`
- `addresses.gear`
- `addresses.rewards`
- `addresses.store`

Validate:

```sh
npm run crypto:config:check -- --file apps/web/public/crypto/production-contracts.json
```

## 6. Build And Start Launch Stack

```sh
npm run typecheck
npm run build
npm run build:agent
```

Start the server/web process using the Mac mini's normal process manager or terminal workflow. Before inviting anyone, open the launch URL and confirm:

- wallet entry works.
- Character panel shows wallet and Season Gold.
- merchant opens.
- pass address is prefilled from `/crypto/production-contracts.json`.
- wallet is on Base.
- ETH, `$mfer`, and `$mfergpt` pass buttons show wallet prompts.
- `npm run support:admin -- analytics-summary --since 24h` shows a `session_joined` row after a wallet/guest smoke.

Do not perform a real purchase from Josh's main wallet during smoke. Use a disposable wallet or a manual grant if needed.

## 7. Record Or Grant The First Pass

If a tester buys the pass, record the chain purchase:

```sh
npm run support:admin -- purchase-record \
  --wallet 0x... \
  --chain 8453 \
  --contract 0x... \
  --tx 0x... \
  --log-index 0 \
  --token-id 1 \
  --payment-token MFER \
  --payment-amount <wei> \
  --status confirmed \
  --note "season 0 pass"
```

For manual eligibility:

```sh
npm run support:admin -- purchase-grant --wallet 0x... --note "trusted tester grant"
```

## 8. Final Gate Before Invites

Run:

```sh
npm run support:admin -- season-export --status approved --require-product season0-pass
npm run support:admin -- season-payout-export --pool 1000 --per-wallet-cap 100 --minimum-points 1
```

Expected before testers: headers only or known manual smoke rows only.

Then fill:

- launch URL in `docs/soft-launch-tester-brief.md`
- feedback channel
- deployed pass address
- reward pool

Invite 10-25 respected testers only after the launch URL, DB, pass, config, and support commands all agree.

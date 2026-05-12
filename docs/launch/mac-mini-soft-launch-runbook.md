# Mac Mini Soft Launch Runbook

Use this from the Mac mini when it becomes the launch machine. Keep secrets in local env files or shell session only. Do not commit `.env`, private keys, RPC keys, or generated production config containing unreviewed addresses.

Current decision: keep mainnet/Base deployment paused. Use the real staging tools, but not production infrastructure: Neon staging/test DB, Cloudflare Tunnel for `game.mfergpt.lol`, local-only game server binding, and no exposed local chain RPC. Base deployment stays paused until Josh explicitly approves it.

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

## 0.5. Local/Staging Market Quote Cache

Point `DATABASE_URL` at the intended local or staging DB, not production. Then apply local/staging migrations:

```sh
npm run db:migrate -w @mferland/server
```

The server refreshes Dex Screener market quotes into `crypto_market_quotes` on startup and then every 60 seconds. To refresh manually:

```sh
npm run pricing:refresh:market
```

The web crypto store reads `/crypto/market-quotes` from the game server and shows cached `$mfer/WETH` and `MFERGPT/WETH` labels. It also reads contract prices every 60 seconds so the pass and item checkout amounts show the actual ETH, `$mfer`, and `MFERGPT` amounts the smart contracts accept.

For real-data testing with mock tokens, local Anvil pricing can auto-update from live Base token quotes. The updater writes the local `MferPricing` contract only every 6 hours or when a recalculated token amount differs by at least 25% from the current smart contract amount. Keep non-local/Base contract writes disabled unless Josh explicitly reopens the deployment gate.

## 0.75. Remote Test Network Shape

Use Cloudflare Tunnel for off-LAN testers. Do not port-forward the router, do not bind the game server to a public interface, and do not expose Anvil or any local RPC to the internet.

Target shape:

```txt
tester browser -> https://game.mfergpt.lol -> Cloudflare Tunnel -> http://127.0.0.1:2567
```

The Node game server can serve the built web app and the Colyseus WebSocket on the same local port when `MFERLAND_SERVE_WEB_DIST=1`.

Configure the existing tunnel ingress so `game.mfergpt.lol` points at the local server:

```yaml
ingress:
  - hostname: game.mfergpt.lol
    service: http://127.0.0.1:2567
```

Keep the final catch-all ingress as `http_status:404`. Create or refresh the DNS route:

```sh
cloudflared tunnel route dns mfergpt-x402 game.mfergpt.lol
cloudflared tunnel ingress validate
```

Restart the tunnel service only after validating the config. Preserve any existing hostnames in the tunnel config.

## 1. Configure Local Secrets

Create the launch-machine `.env` from the template:

```sh
cp docs/launch/mac-mini-env.example .env
```

Fill:

```txt
DATABASE_URL="postgresql://..." # Neon staging/test until production cutover is approved
VITE_SERVER_URL="wss://game.mfergpt.lol"
VITE_CRYPTO_CONTRACTS_URL="/crypto/local-contracts.json"
VITE_REQUIRE_INVITE="1"
VITE_ENABLE_CRYPTO_STORE="0"
MFERLAND_ENABLE_CRYPTO_STORE="0"
MFERLAND_INVITE_CODE="REPLACE_WITH_PRIVATE_DM_CODE"
MFERLAND_SERVE_WEB_DIST="1"
MFERLAND_MARKET_QUOTE_INTERVAL_MS="60000"
MFERLAND_CONTRACT_PRICE_UPDATE_INTERVAL_MS="21600000"
MFERLAND_CONTRACT_PRICE_DRIFT_BPS="2500"
VITE_GA_MEASUREMENT_ID=""
```

Use `https://game.mfergpt.lol/?invite=REPLACE_WITH_PRIVATE_DM_CODE` as the DM link. The static page is not secret, but room joins are rejected unless the invite code matches. Rotate `MFERLAND_INVITE_CODE` if the link leaks. Do not commit the invite code.

Keep `VITE_ENABLE_CRYPTO_STORE="0"` and `MFERLAND_ENABLE_CRYPTO_STORE="0"` while the crypto merchant is hidden from the main game. For mock-token crypto testing, set both flags to `"1"` and keep `VITE_CRYPTO_CONTRACTS_URL="/crypto/local-contracts.json"` so the UI points at the latest local deployment exported by `npm run chain:deploy:local`. This is test data; public wallet purchase testing should still use disposable wallets and avoid Josh's main wallet.

Keep Base deployment secrets unset while mainnet/Base is paused. When production deployment is explicitly approved later, set chain deployment secrets only in the shell session or a private local env file:

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

## 2. Quote Crypto Prices

For the paused mainnet/Base launch path, use the DB-backed market quote cache for `$mfer/WETH` and `MFERGPT/WETH` display labels:

```sh
npm run pricing:refresh:market
```

For future Base pass deployment only, use Dex Screener's free Base token-pairs API to quote the current `$mfer/WETH` price:

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

## 3. Apply Neon Staging/Test DB Migrations

Use Neon for the remote friend test, but use a staging/test branch. Do not point `.env` at the production branch yet.

```sh
npm run db:migrate -w @mferland/server
npm run pricing:refresh:market
npm run support:admin -- season-summary
npm run support:admin -- purchase-summary
```

If these commands hit the wrong DB, stop and fix `DATABASE_URL`.

## 3.5. Apply Production DB Migrations

Paused. Do not run production DB migrations until Josh explicitly approves production cutover.

Confirm `.env` points at the intended Neon production branch. Then:

```sh
npm run db:migrate -w @mferland/server
npm run support:admin -- season-summary
npm run support:admin -- purchase-summary
npm run support:admin -- analytics-summary --since 24h
```

If these commands hit the test DB by accident, stop and fix `DATABASE_URL`.

## 4. Deploy The Season 0 Pass

Paused for mainnet/Base. For local rehearsal, use the local suite instead:

```sh
npm run chain:node
npm run chain:deploy:local
```

Only continue with Base deployment after explicit approval.

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

Paused while mainnet/Base deployment is paused. The current tester build uses `apps/web/public/crypto/local-contracts.json`, generated by `npm run chain:deploy:local`, through `VITE_CRYPTO_CONTRACTS_URL="/crypto/local-contracts.json"`.

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
- `addresses.pricing`: deployed `MferPricing`
- `addresses.launchPass`: deployed `MferLaunchPass`

Leave local-only suite addresses blank unless production versions exist:

- `addresses.gear`
- `addresses.store`

Validate:

```sh
npm run crypto:config:check -- --file apps/web/public/crypto/production-contracts.json
```

## 6. Build And Start Remote Test Stack

```sh
npm run typecheck
npm run launch:build
npm run launch:server
```

`launch:server` binds the game process to `0.0.0.0`, serves `apps/web/dist` through the same HTTP server as the WebSocket, and exposes the local/LAN-only admin dashboard at `http://<mac-lan-ip>:2567/admin`. The dashboard rejects public hostnames such as `game.mfergpt.lol`; keep it on loopback or your private LAN only. Before inviting anyone, open `https://game.mfergpt.lol/?invite=...` and confirm:

- wallet entry works.
- Character panel shows wallet and Season Points.
- merchant opens.
- pass address is prefilled from `/crypto/local-contracts.json` for local rehearsal.
- wallet is on the configured local chain.
- `$mfer/WETH` and `MFERGPT/WETH` market labels show cached DB quotes or a clear cache error.
- pass and gear checkout prices show actual contract amounts in ETH, `$mfer`, and `$mfergpt`.
- ETH, `$mfer`, and `$mfergpt` pass buttons show wallet prompts.
- local dashboard loads from `http://<mac-lan-ip>:2567/admin` on your LAN and is blocked through the public game hostname.
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
- deployed pass address, or `paused`
- reward pool

Invite 10-25 respected testers only after the launch URL, DB, config, and support commands all agree. If the crypto store remains disabled, mark the pass as paused and use manual grants for any tester eligibility.

# Fishing Pond NFT Prizes

This is the v1 plan and runbook for rare onchain NFT catches in the existing mferland fishing loop.

## V1 Model

Normal fish, junk, chum, fishmonger items, and quest items stay offchain in the current fishing system.

NFT catches are different:

- The game server chooses whether a completed fishing attempt hit an NFT prize.
- The game server signs an EIP-712 claim voucher with the configured award signer.
- The player signs and pays for the onchain `FishingPond.claim` transaction from their own wallet.
- The contract holds deposited NFTs and verifies the voucher before transferring a caught prize.

V1 randomness is mferland-server-authoritative, not trustless. There is no Chainlink VRF in v1.

The server does not custody deposited NFTs and does not have arbitrary drain power. Depositors sign their own deposit transactions. During drain mode, anyone can process returns, but each remaining NFT is always returned to its recorded original depositor.

Admins can also return specific active deposits, or all entries for a collection address, to their original depositors without draining the whole pond. This is for curation mistakes, spam cleanup, or depositor support. It still does not let the admin choose an arbitrary recipient.

Admins can pause and migrate selected remaining assets to a configured migration target for a future pond/importer. This is not the same trust profile as depositor returns: the target must be reviewed and controlled as the intended v2 pond/importer, voucher issuance should be stopped first, and the migration target receives transfer data containing the old entry id and original depositor so a v2 importer can preserve accounting.

The first intended prize class is low-value mint.club NFTs that players can burn for MFERGPT through mint.club. Mferland v1 does not implement that burn or redemption flow; it only handles pond custody, fishing awards, player claims, and catch history.

## Contract

`FishingPond` accepts ERC-721 and ERC-1155 deposits. Each deposit creates a pond entry with:

- token standard
- collection address
- token id
- remaining amount
- original depositor
- status

ERC-721 deposits always use amount `1`. ERC-1155 catches transfer `1` unit at a time in v1.

Claims use an EIP-712 `ClaimVoucher`:

- `catchId`
- `fisher`
- `standard`
- `collection`
- `tokenId`
- `amount`
- `pondEntryId`
- `expiresAt`
- `chainId`
- `verifyingContract`

The contract verifies the award signer role, `msg.sender == fisher`, expiry, chain id, contract address, unused catch id, active entry, token match, available amount, per-wallet daily cap, and optional global daily cap.

Claim vouchers are intentionally short-lived. The contract rejects vouchers with `expiresAt` more than `30 minutes` in the future, and the server clamps `MFERLAND_FISHING_POND_VOUCHER_TTL_SECONDS` to that maximum.

The contract also verifies NFT transfer effects after deposits and claims. ERC-721 custody and delivery are checked with `ownerOf`, and ERC-1155 custody and delivery are checked with `balanceOf`. If a non-compliant or malicious collection pretends a transfer succeeded without moving the asset, the transaction reverts and the pond does not burn the catch id or entry.

Drain mode is for contract migration or shutdown:

- Admin calls `startDrain()`.
- Drain pauses deposits and claims.
- Anyone can call `returnDeposits(entryIds)` in batches of up to `50`.
- Anyone can call `returnCollectionDeposits(collection, start, limit)` in drain mode to return a collection-address slice.
- Remaining ERC-721s and ERC-1155 balances return to the original recorded depositor.
- The server must stop issuing vouchers before drain starts.

For targeted curation or support, admins can call `adminReturnDeposits(entryIds)` or `adminReturnCollectionDeposits(collection, start, limit)` without drain mode. Those entries are marked returned and can no longer be claimed.

For v2 migration, admins call `pause()`, `setMigrationTarget(target)`, then `migrateDeposits(entryIds)` or `migrateCollectionDeposits(collection, start, limit)`. Migrated entries are marked inactive before transfers. The migration target must be a reviewed importer/new pond; sending to a plain receiver can move assets without creating new pond entries.

The contract also exposes `activeEntryCount/activeEntryIdAt` and `collectionEntryCount/collectionEntryIdAt`. The server uses active-entry reads to select available prizes instead of scanning only recent ids.

## Server

The server stores NFT catches durably in `fishing_pond_catches` so pending catches survive restarts. Catch states are:

- `pending`
- `voucher_issued`
- `tx_submitted`
- `confirmed`
- `expired`
- `failed`

The server issues unique catch ids, signs vouchers, sends the private voucher only to the owning client, and exposes a sanitized public catch snapshot in player state. Confirmation requires a transaction receipt containing the `CatchClaimed` event for the catch id.

Local/test env:

```sh
MFERLAND_FISHING_POND_ENABLED="true"
MFERLAND_FISHING_POND_RPC_URL="http://127.0.0.1:8545"
MFERLAND_FISHING_POND_CHAIN_ID="31337"
MFERLAND_FISHING_POND_CONTRACT_ADDRESS="0x..."
MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY="0x..."
MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS="0x...,0x..."
MFERLAND_FISHING_POND_CATCH_CHANCE_BPS="500"
```

Production env uses Base and must be persisted in the live repo root `.env` before the server restart:

```sh
MFERLAND_FISHING_POND_ENABLED="true"
MFERLAND_FISHING_POND_RPC_URL="https://mainnet.base.org"
MFERLAND_FISHING_POND_CHAIN_ID="8453"
MFERLAND_FISHING_POND_CONTRACT_ADDRESS="0x..."
MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY="0x..."
MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS="0x...,0x..."
MFERLAND_FISHING_POND_CATCH_CHANCE_BPS="500"
MFERLAND_FISHING_POND_VOUCHER_TTL_SECONDS="900"
```

Useful tuning env:

```sh
MFERLAND_FISHING_POND_CATCH_CHANCE_BPS="500"
MFERLAND_FISHING_POND_VOUCHER_TTL_SECONDS="900"
MFERLAND_FISHING_POND_MAX_SCAN_ENTRIES="512"
```

The server also accepts `MFERLAND_FISHING_NFT_POND_*` aliases for those pond-specific env vars.
`MFERLAND_FISHING_POND_VOUCHER_TTL_SECONDS` defaults to `1800` and cannot exceed the contract's `30 minutes` max.
`MFERLAND_FISHING_POND_MAX_SCAN_ENTRIES` limits how many currently active pond entries the server reads per availability check. If the active pond is larger, the server rotates the read window by minute.
`MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS` is a comma or whitespace separated list of collection addresses the server is allowed to award from. Deposits remain open on the contract, but the game only issues vouchers for allowlisted collections. Empty allowlists are only for local/open testing; production-like runtimes require a non-empty allowlist before the pond can issue catches.

The server will also read the local exported chain suite address when `MFERLAND_FISHING_POND_CONTRACT_ADDRESS` is unset.

The pond is disabled unless the server has both an award signer and durable database access for `fishing_pond_catches`.

The server award allowlist is not the stash/display mapping. `MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS` controls which deposited collections can be fished up. `FISHING_NFT_GAME_ITEM_MAPPINGS` in `packages/shared/src/fishing.ts` controls whether a caught NFT becomes a usable/sellable/equippable/redeemable stash item. That mapping is empty for v1 launch, so all caught NFTs currently appear in the stash pond tab and fishing history only.

Use a dedicated award signer. Do not reuse the deployer, admin, treasury, or agent wallet key. The current v1 server config expects `MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY`; if launch requires KMS, Bankr API, or signer-command custody for pond vouchers, implement that adapter before live enablement. If the signer leaks, stop voucher issuance, rotate the signer role on the contract, and consider pausing or draining depending on how long the key was exposed.

The admin owner and award signer are intentionally different:

- The admin owner controls pause/unpause, daily caps, signer-role rotation, support returns, drain, and migration target configuration.
- The award signer only signs EIP-712 catch vouchers. A valid voucher still has to match the fisher, pond entry, chain id, contract address, token, amount, expiry, unused catch id, and daily caps before the contract transfers anything.

An optional anti-spam gate is still a launch decision. The clean v1 path is likely a small MFERGPT holding requirement for NFT eligibility; a burnable onchain fishing pole is more game-like, but needs a token/item contract and UX.

## Fishing And UI

The existing loop remains unchanged: cast, wait, reel, then show loot or a claim prompt.

Outcome priority in v1:

1. Existing quest-item fishing outcomes.
2. Rare NFT catch, if the pond is enabled, stocked, not drained, the player has a wallet, and daily caps allow it.
3. Existing fish or junk roll.

NFT catches show a distinct claim panel. Claiming requires an injected wallet transaction. If there is no NFT catch, normal offchain fish and junk loot works as before.

Before opening the wallet transaction prompt, the web client preflights the exact `FishingPond.claim` calldata with `eth_call` from the connected wallet. If the voucher is expired, stale, paused, already claimed, over cap, or otherwise invalid, the UI stops before asking the player to spend gas.

When a prize token exposes standard ERC-721 `tokenURI` or ERC-1155 `uri` JSON metadata, the server reads and persists display `name`, `description`, and `image` fields for the claim panel, pond log, player state, and agent observations. If metadata is unavailable or blocked by URL safety checks, the UI falls back to token standard, collection address, token id, and entry id.

When a player has hit their daily NFT cap, the game tells them there are no more onchain goodies from the pond today and keeps regular fishing available.

If a wallet already has an active unclaimed pond catch, later reels resurface that pending claim instead of issuing another voucher. Regular offchain fishing can still continue while the wallet action is pending.

## Agents

Agents see pond availability and pending claim state through catalog and observations. The harness only exposes normal room messages and wallet-action metadata. Agents should use the player's wallet to claim and then report the submitted tx with `submitFishingNftClaimTx`.

Declared agents use the same `startFishing`, `reelFishing`, `lootCorpse`, and `submitFishingNftClaimTx` room messages as players. `/agent-catalog` includes a fishing playbook:

- get a loaner or real fishing pole from fishin-lesson/Motherfisher if needed
- move to the south-center pond shore
- cast, wait for `self.fishing.state = bite`, then reel before the bite window expires
- collect fishing loot windows with `lootCorpse`
- for NFT catches, sign the wallet claim externally and submit the tx hash through the normal room message

Declared agents have lower odds because the fish can smell the metal:

- normal non-quest reels get an extra 50% miss roll
- rare fish weight is multiplied by `0.5`
- NFT pond chance is multiplied by `0.5`

## Current V1 Decisions

- NFT chance defaults to `500` basis points, or `5%`, per eligible completed reel.
- Every normal completed reel can hit an NFT after quest-item priority.
- Chum does not affect NFT chance in v1.
- Wallet daily cap defaults to `3`.
- Global daily cap defaults to `50`.
- ERC-1155 catches transfer `1` unit.
- Deposits are open by contract default; server awards are restricted by `MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS` in production.
- First beta prizes are mint.club NFTs burnable for MFERGPT through mint.club, outside mferland.
- Declared agents have a 50% normal-catch penalty, 50% rare-fish penalty, and 50% NFT-catch penalty.
- Players pay claim gas in v1; relayers can be evaluated later.
- Metadata display reads ERC-721/1155 token metadata server-side for name, description, and image, with token standard/address/id fallback.

## Admin List

These values need to be decided before live enablement and should not drift silently after launch:

1. Base `FishingPond` contract address. V1 needs a fresh Base deployment. Default owner of this task: production operator/agent.
2. Contract admin owner. Decide whether admin power is held by a Bankr-controlled wallet, a new wallet, hardware wallet, or multisig. This key can pause, set caps, rotate signers, return deposits, drain, and configure migration. Default: not the award signer.
3. Award signer address and custody. This is different from the admin owner: it is the server voucher signer for individual catches. Default: dedicated low-privilege signer, separate from deployer/admin/treasury. Current server config expects a private key; signer-command/KMS/Bankr API support can be added if chosen.
4. Initial prize collection allowlist. Decide the first mint.club NFT collection addresses that the server may award. Default: a small allowlist of low-value mint.club prize collections.
5. Open deposits policy. Decide whether anyone can deposit any NFT to the contract. Default: open deposits stay allowed, but only allowlisted collections can be awarded by the server.
6. NFT catch chance. Decide `MFERLAND_FISHING_POND_CATCH_CHANCE_BPS`. Default: `500` bps, meaning `5%`, for production.
7. Per-wallet daily NFT cap. Decide the wallet daily catch cap. Default: `3`.
8. Global daily NFT cap. Decide whether the whole pond needs a daily max. Default: `50` for launch, adjustable with `setDailyCaps`.
9. Voucher TTL. Decide how long a signed claim voucher stays usable. Default: `900` seconds; contract maximum is `1800` seconds.
10. ERC-1155 catch amount. Decide how many units transfer per ERC-1155 catch. Default: `1` unit per catch.
11. Claim gas policy. Decide who pays gas for `FishingPond.claim`. Default: player-paid in v1; relayers are later.
12. Metadata display policy. Decide whether to rely on token metadata for name/image/description. Default: read standard metadata server-side and fall back to collection/token id if unavailable.
13. Drain/admin-return owner. Decide who can run support returns, drain workflows, and v2 migration workflows. Default: admin can return specific entries or collection slices; full drain is reserved for migration/shutdown; migration requires paused pond plus a reviewed migration target.
14. First live prize batch. Decide the actual NFTs to seed for launch and how many to deposit. Default: small batch first, verify human and agent claims, then add more.
15. Launch timing and monitoring. Decide the launch window and who watches logs/events. Default: launch while an operator is available to pause issuance, rotate signer, or return deposits if needed.
16. Anti-spam gate. Decide whether NFT eligibility requires a small MFERGPT holding or a burned/onchain fishing pole. Default for this branch: no gate enforced until token/amount/item details are decided.

Admin needs to choose the live contract/admin/signer/caps/allowlist/chance values, fund any needed deployer or admin gas, and approve launch timing. Codex can deploy or verify the contract once those values exist, set or check env, run migrations/builds/smokes, and monitor logs during the first pond session.

## Production Deployment Commands

Stop here until all Admin List values are filled in and a deployer/admin has Base ETH.

Deploy the pond on Base:

```sh
export BASE_RPC_URL="https://mainnet.base.org"
export DEPLOYER_PRIVATE_KEY="0x..."
export FISHING_POND_ADMIN="0x..."
export FISHING_POND_AWARD_SIGNER="0x..."
export FISHING_POND_WALLET_DAILY_CAP="3"
export FISHING_POND_GLOBAL_DAILY_CAP="50"
npm run deploy:fishing:base -w @mferland/chain
```

Record the deployed address, then verify roles and caps:

```sh
export FISHING_POND_ADDRESS="0x..."
export DEFAULT_ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"
export AWARD_SIGNER_ROLE="$(cast keccak "AWARD_SIGNER_ROLE")"
cast call "$FISHING_POND_ADDRESS" "hasRole(bytes32,address)(bool)" "$DEFAULT_ADMIN_ROLE" "$FISHING_POND_ADMIN" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "hasRole(bytes32,address)(bool)" "$AWARD_SIGNER_ROLE" "$FISHING_POND_AWARD_SIGNER" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "perWalletDailyCatchCap()(uint256)" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "globalDailyCatchCap()(uint256)" --rpc-url "$BASE_RPC_URL"
```

Optional BaseScan verification:

```sh
(
  cd packages/chain
  forge verify-contract \
    --chain 8453 \
    --watch \
    --constructor-args "$(cast abi-encode "constructor(address,address,uint256,uint256)" "$FISHING_POND_ADMIN" "$FISHING_POND_AWARD_SIGNER" "$FISHING_POND_WALLET_DAILY_CAP" "$FISHING_POND_GLOBAL_DAILY_CAP")" \
    "$FISHING_POND_ADDRESS" \
    src/FishingPond.sol:FishingPond \
    --etherscan-api-key "$BASESCAN_API_KEY"
)
```

Seed the first prize batch from the depositor wallet:

```sh
cast send "$PRIZE_721_COLLECTION" "approve(address,uint256)" "$FISHING_POND_ADDRESS" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "depositERC721(address,uint256)" "$PRIZE_721_COLLECTION" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"

cast send "$PRIZE_1155_COLLECTION" "setApprovalForAll(address,bool)" "$FISHING_POND_ADDRESS" true --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "depositERC1155(address,uint256,uint256)" "$PRIZE_1155_COLLECTION" "$TOKEN_ID" "$AMOUNT" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
```

Before enabling server awards, verify active entries and custody:

```sh
cast call "$FISHING_POND_ADDRESS" "activeEntryCount()(uint256)" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "collectionEntryCount(address)(uint256)" "$PRIZE_721_COLLECTION" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "collectionEntryCount(address)(uint256)" "$PRIZE_1155_COLLECTION" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "entries(uint256)(uint8,address,uint256,uint256,address,uint8)" "$ENTRY_ID" --rpc-url "$BASE_RPC_URL"
cast call "$PRIZE_721_COLLECTION" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL"
cast call "$PRIZE_1155_COLLECTION" "balanceOf(address,uint256)(uint256)" "$FISHING_POND_ADDRESS" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL"
```

For the first monitored production smoke, it is okay to temporarily set `MFERLAND_FISHING_POND_CATCH_CHANCE_BPS="10000"` in the live root `.env`, restart, complete one low-value human test claim, then restore the launch value and restart. This uses normal config, not `MFERLAND_DEBUG_FISHING_NFT_GATE`. Declared agents still apply the intended 50% NFT catch multiplier, so an agent NFT claim may need multiple completed reels.

After a live claim, verify both chain event and server history:

```sh
cast logs \
  --rpc-url "$BASE_RPC_URL" \
  --address "$FISHING_POND_ADDRESS" \
  "CatchClaimed(bytes32,address,uint256,uint8,address,uint256,uint256,uint256)" \
  --from-block "$DEPLOY_BLOCK"

psql "$DATABASE_URL" -c "select catch_id, wallet_address, status, token_standard, collection_address, token_id, pond_entry_id, tx_hash, error, created_at, updated_at from fishing_pond_catches order by updated_at desc limit 20;"
```

Emergency disable path:

1. Set `MFERLAND_FISHING_POND_ENABLED="0"` in the live repo root `.env`, or remove the award signer/private key and allowlist env.
2. Restart with `./scripts/mferland-prod-server.sh restart`.
3. If deposits/claims must stop immediately, pause onchain:

```sh
cast send "$FISHING_POND_ADDRESS" "pause()" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

4. For support cleanup, return entries or a collection slice to recorded depositors:

```sh
cast send "$FISHING_POND_ADDRESS" "adminReturnDeposits(uint256[])" "[1,2]" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "adminReturnCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

5. For migration to a reviewed v2 pond, pause first, set the migration target, then move exact entries or collection slices in batches of up to `50`:

```sh
cast send "$FISHING_POND_ADDRESS" "pause()" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "setMigrationTarget(address)" "$NEW_POND_ADDRESS" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "migrateDeposits(uint256[])" "[1,2]" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "migrateCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

If full drain mode is started and a non-admin operator processes public returns, that caller still needs to pay gas even though the assets always return to original depositors:

```sh
cast send "$FISHING_POND_ADDRESS" "returnCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$PROCESSOR_PRIVATE_KEY"
```

## Local Validation

Run contract tests with mock ERC-721 and ERC-1155 prizes:

```sh
npm run test -w @mferland/chain
```

That suite covers:

- ERC-721 deposit -> signed claim -> fisher receives token
- ERC-1155 deposit -> signed one-unit claim -> remaining units stay in pond
- duplicate catch-id rejection
- over-claim rejection
- wrong signer rejection
- unauthorized sender, forged voucher field, wrong chain, and wrong contract rejection
- equivalent-entry replay rejection
- expired voucher and paused claim rejection without burning catch state
- malformed and high-s signature rejection
- reentrant receiver cannot claim a second voucher during transfer
- reverting receiver does not burn the catch id or entry
- malicious/no-op ERC-721 and ERC-1155 transfers fail on deposit and claim
- per-wallet and global daily caps
- active and collection entry indexing
- drain start -> batch return to original depositors
- drain collection return to original depositors
- admin return of specific active deposits without drain mode
- admin collection return without drain mode
- paused admin migration of specific deposits to a migration target
- paused admin migration of collection deposits to a migration target
- oversized drain/admin return batches rejected

Dry-run or execute pond returns from local chain exports:

```sh
npm run fishing:pond:return:local -- --mode ids --ids 1,2
npm run fishing:pond:return:local -- --mode collection --collection 0x... --admin
npm run fishing:pond:return:local -- --mode all --admin
npm run fishing:pond:return:local -- --mode ids --ids 1,2 --migrate-to 0x... --pause
npm run fishing:pond:return:local -- --mode collection --collection 0x... --migrate-to 0x... --pause
npm run fishing:pond:return:local -- --mode all --migrate-to 0x... --pause
```

Add `--send` to execute. Without `--admin`, return calls require drain mode. The script chunks large `collection` and `all` returns into contract-safe batches.
Migration calls require the admin key and a paused pond. `--pause` sends `pause()` before setting the migration target and migrating.

For a local app testnet:

```sh
npm run chain:node
npm run chain:deploy:local
npm run smoke:fishing -w @mferland/chain
npm run fishing:pond:smoke:local
```

The contract smoke script deploys a fresh local pond with mock ERC-721 and ERC-1155 NFTs, deposits from an unlocked depositor account, claims from an unlocked fisher account with award-signer vouchers, performs an admin collection return, starts drain, and returns the remaining ERC-1155 units to the original depositor by collection address.

The room-level smoke starts a local server with Fishing Pond env, stocks the exported pond with metadata-bearing mock NFTs, joins with a local wallet, fishes until NFT catches appear, verifies metadata name/description/image, submits player-signed `FishingPond.claim` transactions, verifies server confirmation, confirms the daily cap falls back to regular fishing, proves a non-allowlisted collection cannot be caught, expands the server allowlist, proves that collection can then be caught, and rejoins as a declared agent for a fishing cast/reel cycle.

For UI testing, set the Fishing Pond env above, run the server migration, start the server and web app, deposit an NFT into the exported local pond contract, fish until an NFT catch appears, claim it from the wallet UI, and verify the server marks the catch confirmed after observing `CatchClaimed`.

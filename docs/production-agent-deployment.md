# Production Agent Deployment

This note is for deploying the public mferland agent autoplay harness on `game.mfergpt.lol`.

The Mac mini is already the live production game server. For live upgrades, do not reinstall the server service unless it is missing; merge the branch into the existing `main` checkout, migrate, rebuild, restart, and smoke-check the running service.

## Goal

Let live wallet-authenticated agents connect to the single production game server, observe normal public room state, act only through the same Colyseus messages as humans, identify themselves as agents, and earn reduced Season 0 rewards only after meeting the 25M MFERGPT wallet goal.

There is no separate agent server for production. Production agents are normal wallet-authenticated Colyseus clients connecting to the same live game server.

## Server Requirements

Deploy the server code that includes:

- wallet challenge login through `/wallet-auth-challenge`
- wallet-auth verification during Colyseus join
- `agentClient: true` support in join options
- `PlayerState.isAgent`
- sticky wallet identity mode through `account_wallets.registered_client_kind` (`human` or `agent`); `/agent-session` returns `agent_wallet_registration_mismatch` when a human-registered wallet tries to mint an agent token
- normal room messages for movement, quests, combat, loot, items, chat, emotes, fishing, and shops
- public read-only `/agent-catalog` metadata for controls, menu parity, payment metadata, Season 0 caps/referral rules/endpoints, swap/router details, combat actions, item/equipment definitions, talent trees, potion-shop prices, fishing pond/fish/vendor rules, progression, quests, public world map data, and local-only HUD choices such as quest focus, hotbar layout, settings, trait drafts, potion quantity selection, store selection, and swap slippage
- bounded bridge command endpoints: `/agent-command` and `/agent-command-stop`
- ERC-8257/OpenSea-style tool manifests and swap tool endpoints: `/.well-known/ai-tool/mfertown-agent-command.json`, `/.well-known/ai-tool/mfertown-mfergpt-swap.json`, `/agent-mfergpt-swap-quote`, and `/agent-mfergpt-swap-result`
- public read-only agent facts APIs for simple questions without joining the live room:
  - `/agent-profile?wallet=...` saved character facts: level, XP, equipment, inventory, quests, talents, stats, and active saved buffs
  - `/agent-world` public live town facts: online players, agents/humans, areas, notable NPCs, and totals
  - `/agent-player?wallet=...` or `/agent-player?name=...` saved profile plus live overlay for one character
  - `/agent-milestones?type=centralizer` or `/agent-milestones?questId=...` quest/boss completion history
- the 25M MFERGPT agent earning gate
- reduced agent Season 0 payout after the gate passes

Production env:

```sh
MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER="0.5"
MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"
MFERLAND_MFERGPT_PAYMENT_RPC_URL="https://mainnet.base.org"
MFERLAND_MFERGPT_TOKEN_ADDRESS="0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
MFERLAND_MFERGPT_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"
```

Set these before fetching, hashing, and registering the final OpenSea/ERC-8257 manifests:

```sh
MFERLAND_TOOL_CREATOR_ADDRESS="0x..."
MFERLAND_TOOL_OPERATOR_ADDRESS="0x..."
```

Set these after the registration transactions assign tool IDs:

```sh
MFERLAND_TOOL_REGISTRY_ADDRESS="0x..."
MFERLAND_TOOL_MFERTOWN_AGENT_COMMAND_ID="..."
MFERLAND_TOOL_MFERTOWN_MFERGPT_SWAP_ID="..."
OPENSEA_API_KEY="..."
```

Existing deployments that still use `MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID` and `MFERLAND_TOOL_MFERLAND_MFERGPT_SWAP_ID` continue to work; the `MFERTOWN` names are the preferred aliases after the tool metadata rename.

`MFERLAND_TOOL_CREATOR_ADDRESS` must match the wallet used for `register`; it is part of the manifest hash and should not change after registration without an `update-metadata` transaction. `MFERLAND_TOOL_OPERATOR_ADDRESS` must be the `payTo` address used in the zero-value EIP-3009 `X-Payment` challenge and the zero-price x402 pricing recipient in the manifest. Without it, the manifest can still be served with a zero-address fallback, but the tools should not be considered production-callable.

The gate only controls Season 0 earning for declared agents. Agents below 25M MFERGPT can still play, save progress, complete quests, loot, and fight bosses.

## Fishing Pond NFT Handoff

The Fishing Pond feature is a normal live-server gameplay surface. Production agents must connect to `game.mfergpt.lol` as wallet-authenticated players, declare `agentClient: true`, and use the same room messages as humans. There is no separate pond server and no agent-only claim bypass.

Server env for live pond enablement:

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

Persist production pond env in the live repo root `.env` on the Mac mini. `npm run start -w @mferland/server` loads that file through `node --env-file-if-exists=../../.env`; the launchd plist only supplies generic server env such as `HOST` and `MFERLAND_SERVE_WEB_DIST`.

Do not set `MFERLAND_DEBUG_FISHING_NFT_GATE` on production. Use a dedicated award signer; do not reuse deployer, admin, treasury, or agent wallet keys. Production-like runtimes require `MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS` to be non-empty before the server can issue pond vouchers. Deposits can still be open onchain, but the server only awards from allowlisted collections.

That server award allowlist is separate from the stash/display mapping. `MFERLAND_FISHING_POND_ALLOWED_COLLECTIONS` controls which deposited collections can be fished up. `FISHING_NFT_GAME_ITEM_MAPPINGS` in shared code controls whether a caught NFT is promoted to a usable/sellable/equippable/redeemable stash item. That mapping is intentionally empty for v1 launch, so caught NFTs show in the stash pond tab and history only.

The current v1 server config expects `MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY`. If the launch needs KMS, Bankr API, or `AGENT_SIGNER_COMMAND`-style custody for pond vouchers, stop before live enablement and implement that signer adapter first.

Stop before live enablement if any of these are missing: deployed Base pond address, admin owner, award signer address and key custody, non-empty collection allowlist, launch caps/chance/TTL, first prize batch/deposit plan, funded deployer/admin gas, monitored launch window, one human test wallet with Base ETH, and one declared-agent test wallet/signing path with Base ETH.

Deploy the Base pond after the admin owner, award signer, and caps are final:

```sh
cd /Users/mfergpt/dev/mferland
export BASE_RPC_URL="https://mainnet.base.org"
export DEPLOYER_PRIVATE_KEY="0x..."
export FISHING_POND_ADMIN="0x..."
export FISHING_POND_AWARD_SIGNER="0x..."
export FISHING_POND_WALLET_DAILY_CAP="3"
export FISHING_POND_GLOBAL_DAILY_CAP="50"
npm run deploy:fishing:base -w @mferland/chain
```

Record the deployed `FishingPond` address from the broadcast output, then verify roles and caps:

```sh
export FISHING_POND_ADDRESS="0x..."
export DEFAULT_ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"
export AWARD_SIGNER_ROLE="$(cast keccak "AWARD_SIGNER_ROLE")"
cast call "$FISHING_POND_ADDRESS" "hasRole(bytes32,address)(bool)" "$DEFAULT_ADMIN_ROLE" "$FISHING_POND_ADMIN" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "hasRole(bytes32,address)(bool)" "$AWARD_SIGNER_ROLE" "$FISHING_POND_AWARD_SIGNER" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "perWalletDailyCatchCap()(uint256)" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "globalDailyCatchCap()(uint256)" --rpc-url "$BASE_RPC_URL"
```

If BaseScan verification is part of the launch gate:

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

Use the admin wallet for role rotation only. Add the new role first, verify it, then revoke the old one:

```sh
cast send "$FISHING_POND_ADDRESS" "grantRole(bytes32,address)" "$AWARD_SIGNER_ROLE" "$NEW_AWARD_SIGNER" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast call "$FISHING_POND_ADDRESS" "hasRole(bytes32,address)(bool)" "$AWARD_SIGNER_ROLE" "$NEW_AWARD_SIGNER" --rpc-url "$BASE_RPC_URL"
cast send "$FISHING_POND_ADDRESS" "revokeRole(bytes32,address)" "$AWARD_SIGNER_ROLE" "$OLD_AWARD_SIGNER" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

Seed a small first prize batch from the depositor wallet. Depositors sign their own approvals and deposits:

```sh
# ERC-721 prize
cast send "$PRIZE_721_COLLECTION" "approve(address,uint256)" "$FISHING_POND_ADDRESS" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "depositERC721(address,uint256)" "$PRIZE_721_COLLECTION" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"

# ERC-1155 prize batch
cast send "$PRIZE_1155_COLLECTION" "setApprovalForAll(address,bool)" "$FISHING_POND_ADDRESS" true --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "depositERC1155(address,uint256,uint256)" "$PRIZE_1155_COLLECTION" "$TOKEN_ID" "$AMOUNT" --rpc-url "$BASE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY"
```

Before enabling server awards, verify that the pond sees active entries and actually holds custody:

```sh
cast call "$FISHING_POND_ADDRESS" "activeEntryCount()(uint256)" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "collectionEntryCount(address)(uint256)" "$PRIZE_721_COLLECTION" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "collectionEntryCount(address)(uint256)" "$PRIZE_1155_COLLECTION" --rpc-url "$BASE_RPC_URL"
cast call "$FISHING_POND_ADDRESS" "entries(uint256)(uint8,address,uint256,uint256,address,uint8)" "$ENTRY_ID" --rpc-url "$BASE_RPC_URL"
cast call "$PRIZE_721_COLLECTION" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL"
cast call "$PRIZE_1155_COLLECTION" "balanceOf(address,uint256)(uint256)" "$FISHING_POND_ADDRESS" "$TOKEN_ID" --rpc-url "$BASE_RPC_URL"
```

Agent playbook:

- Get a fishing pole through the normal fishing flow if needed.
- Move to the south-center pond shore.
- Send `startFishing`, wait for observed fishing state `bite`, then send `reelFishing` before the bite expires.
- Collect normal fish/junk loot windows with `lootCorpse`.
- If an NFT catch appears, read the `fishingNftCatch` observation and wallet-action metadata, sign the `FishingPond.claim` transaction with the agent-controlled wallet, then send `submitFishingNftClaimTx` with `{ catchId, txHash }`.
- If the wallet hits the daily NFT cap, continue regular fishing; the cap only stops pond NFT awards.

Declared agents have reduced fishing odds: normal non-quest reels get an extra 50% miss roll, rare fish chance is multiplied by `0.5`, and NFT pond chance is multiplied by `0.5`.

Agent command recaps include fishing totals, NFT catch counts, pending wallet-action count, current wallet/global daily remaining values, and the daily reset timestamp when the pond is configured. Agents should include those fields when reporting a fishing run.

Live admin list:

1. Choose the Base `FishingPond` contract address.
2. Choose the contract admin owner, preferably multisig or hardware-backed.
3. Choose the dedicated award signer and custody path. This is different from the admin owner; it signs catch vouchers only.
4. Choose the initial mint.club prize collection allowlist.
5. Choose launch catch chance, wallet cap, global cap, and voucher TTL. Current defaults are `500` bps, wallet cap `3`, global cap `50`, and TTL `900` seconds.
6. Approve open deposits with server-side award curation, or request a stricter contract policy before launch.
7. Approve the first live prize batch and deposit plan.
8. Fund any deployer/admin signer needed for Base transactions.
9. Pick the launch window and monitoring owner.
10. Decide whether NFT eligibility requires MFERGPT holding or a burned/onchain fishing pole before launch.
11. Let Codex run migrations, builds, contract verification, env checks, local and production smoke tests, catalog/docs updates, and log monitoring after the values are known.

Live smoke after deploy:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog | jq '.fishing.pond'
curl -fsS "https://game.mfergpt.lol/agent-profile?wallet=0x0000000000000000000000000000000000000000"
```

For the first real pond session, keep a small allowlist and cap, deposit low-value mint.club NFTs, run one human claim and one declared-agent fishing pass, then check the `FishingPond.CatchClaimed` event and server catch history before raising caps or adding more collections.

The default `500` bps catch chance can make the first human smoke noisy. For a monitored launch smoke only, temporarily set `MFERLAND_FISHING_POND_CATCH_CHANCE_BPS="10000"` in the live root `.env`, restart, complete one low-value human test claim, then restore the launch value and restart again. This uses the normal production config path and does not require `MFERLAND_DEBUG_FISHING_NFT_GATE`. Declared agents still apply the intended 50% NFT catch multiplier, so an agent NFT claim may need multiple completed reels; a declared-agent fishing pass is enough to prove the agent playbook if a claim is not required.

```sh
cast logs \
  --rpc-url "$BASE_RPC_URL" \
  --address "$FISHING_POND_ADDRESS" \
  "CatchClaimed(bytes32,address,uint256,uint8,address,uint256,uint256,uint256)" \
  --from-block "$DEPLOY_BLOCK"

psql "$DATABASE_URL" -c "select catch_id, wallet_address, status, token_standard, collection_address, token_id, pond_entry_id, tx_hash, error, created_at, updated_at from fishing_pond_catches order by updated_at desc limit 20;"
```

Rollback or pause issuance:

1. Stop new vouchers first: set `MFERLAND_FISHING_POND_ENABLED="0"` in the live repo root `.env`, or remove the award signer/private key and allowlist values, then restart the service.
2. Pause the contract if claims/deposits must stop immediately:

```sh
cast send "$FISHING_POND_ADDRESS" "pause()" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh logs
```

3. For support cleanup without full drain, return exact entries or a collection slice to original depositors:

```sh
cast send "$FISHING_POND_ADDRESS" "adminReturnDeposits(uint256[])" "[1,2]" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "adminReturnCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

4. For shutdown without a replacement pond, call `startDrain()` only after voucher issuance is stopped, then process depositor returns in batches of up to `50` entries:

```sh
cast send "$FISHING_POND_ADDRESS" "startDrain()" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "returnCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$PROCESSOR_PRIVATE_KEY"
```

5. For migration to a reviewed v2 pond, pause first, set the migration target, then move exact entries or collection slices. Migration keeps the original depositor in the transfer data sent to the new receiver:

```sh
cast send "$FISHING_POND_ADDRESS" "pause()" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "setMigrationTarget(address)" "$NEW_POND_ADDRESS" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "migrateDeposits(uint256[])" "[1,2]" --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
cast send "$FISHING_POND_ADDRESS" "migrateCollectionDeposits(address,uint256,uint256)" "$PRIZE_COLLECTION" 0 50 --rpc-url "$BASE_RPC_URL" --private-key "$ADMIN_PRIVATE_KEY"
```

## OpenSea / ERC-8257 Tool Registration

Register the public OpenSea tools after the `.well-known` manifests are deployed and smoke-tested. For now, register two tools:

- `mfertown-agent-command`: the single gameplay command tool. It covers `start`, `status`, and `stop` operations for bounded autoplay.
- `mfertown-mfergpt-swap`: the wallet-action swap helper. It covers quote and result reporting for Base ETH to MFERGPT swaps.

Do not register every read-only facts endpoint as a separate tool unless OpenSea or Bankr specifically asks for that later. The read-only APIs remain useful public context, but the durable agent tool surface should stay focused on actions that need attribution and usage reporting.

Fetch, validate, hash, and register the exact manifest JSON served by production:

```sh
# Configure and restart production first so MFERLAND_TOOL_CREATOR_ADDRESS
# and MFERLAND_TOOL_OPERATOR_ADDRESS are present in the served manifests.

curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mfertown-agent-command.json > /tmp/mfertown-agent-command.json
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mfertown-mfergpt-swap.json > /tmp/mfertown-mfergpt-swap.json

npx @opensea/tool-sdk validate /tmp/mfertown-agent-command.json
npx @opensea/tool-sdk validate /tmp/mfertown-mfergpt-swap.json
npx @opensea/tool-sdk verify https://game.mfergpt.lol/.well-known/ai-tool/mfertown-agent-command.json
npx @opensea/tool-sdk verify https://game.mfergpt.lol/.well-known/ai-tool/mfertown-mfergpt-swap.json
npx @opensea/tool-sdk hash /tmp/mfertown-agent-command.json
npx @opensea/tool-sdk hash /tmp/mfertown-mfergpt-swap.json

PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org npx @opensea/tool-sdk register \
  --metadata https://game.mfergpt.lol/.well-known/ai-tool/mfertown-agent-command.json \
  --network base

PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org npx @opensea/tool-sdk register \
  --metadata https://game.mfergpt.lol/.well-known/ai-tool/mfertown-mfergpt-swap.json \
  --network base
```

The manifest hash is computed over the full served manifest, so the served JSON must not include a self-referential hash field. Use the SDK `hash` output and the registration transaction/logs as the source of truth for the onchain `manifestHash` and assigned `toolId`.

For metadata-only changes such as renaming `mferland` tools to `mfertown`, keep the existing tool IDs and run `update-metadata` after the new manifests are deployed:

```sh
npx @opensea/tool-sdk update-metadata \
  --tool-id 145 \
  --metadata https://game.mfergpt.lol/.well-known/ai-tool/mfertown-agent-command.json \
  --network base \
  --wallet-provider bankr \
  --rpc-url https://mainnet.base.org

npx @opensea/tool-sdk update-metadata \
  --tool-id 146 \
  --metadata https://game.mfergpt.lol/.well-known/ai-tool/mfertown-mfergpt-swap.json \
  --network base \
  --wallet-provider bankr \
  --rpc-url https://mainnet.base.org
```

After registration, set these production variables and restart the server once:

```sh
MFERLAND_TOOL_REGISTRY_ADDRESS="0x..."
MFERLAND_TOOL_MFERTOWN_AGENT_COMMAND_ID="..."
MFERLAND_TOOL_MFERTOWN_MFERGPT_SWAP_ID="..."
OPENSEA_API_KEY="..."
```

With those set, callers can retry tool requests with a pre-signed zero-value EIP-3009 `X-Payment` header. The signature must use the Base USDC EIP-712 domain `name: "USD Coin"`, `version: "2"`, chain id `8453`, and verifying contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. The server verifies the signature locally, executes the tool, and reports usage to OpenSea with `verification_type: "eip3009_authorization"` and `eip3009.chain_id`. Missing or failed usage reporting must not fail a successful gameplay or swap response.

## Live Mac Mini Upgrade

Use the live repo and launchd service that are already running production:

```sh
cd /Users/mfergpt/dev/mferland
git status --short
git branch --show-current
git rev-parse --short HEAD
./scripts/mferland-prod-server.sh status
curl -fsS https://game.mfergpt.lol/health
```

If the worktree is dirty, inspect it first. Do not reset or discard live-server changes without explicit approval.

Merge and deploy only when the launch code is not already present in the live checkout. If the live checkout already contains the launch commit, skip the merge and continue at `npm install`; otherwise set `DEPLOY_BRANCH` explicitly before running this block.

```sh
git fetch origin
git checkout main
git pull --ff-only
DEPLOY_BRANCH="${DEPLOY_BRANCH:-origin/codex/add-fishing-pond-nft-prizes}"
git merge --no-ff "$DEPLOY_BRANCH"

npm install
node apps/server/scripts/migrate.mjs
./scripts/mferland-prod-server.sh build
./scripts/mferland-prod-server.sh restart
./scripts/mferland-prod-server.sh status
```

Smoke-check:

```sh
curl -fsS https://game.mfergpt.lol/health
curl -fsS https://game.mfergpt.lol/agent-catalog
curl -fsS "https://game.mfergpt.lol/season/leaderboard?limit=5"
curl -fsS "https://game.mfergpt.lol/season/referrals?wallet=0x0000000000000000000000000000000000000000"
curl -fsS "https://game.mfergpt.lol/agent-profile?wallet=0x0000000000000000000000000000000000000000"
curl -fsS https://game.mfergpt.lol/agent-world
curl -fsS "https://game.mfergpt.lol/agent-milestones?type=centralizer"
curl -fsS https://game.mfergpt.lol/skills/mferland/SKILL.md
curl -fsS https://game.mfergpt.lol/skills/mferland-autoplay/SKILL.md
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mfertown-agent-command.json
curl -fsS https://game.mfergpt.lol/.well-known/ai-tool/mfertown-mfergpt-swap.json
curl -i -X POST https://game.mfergpt.lol/agent-mfergpt-swap-quote -H 'content-type: application/json' -d '{"walletAddress":"0x0000000000000000000000000000000000000000"}'
curl -I "https://game.mfergpt.lol/agent-view?wallet=0x0000000000000000000000000000000000000000"
```

The unauthenticated swap quote smoke should return HTTP `402` with a zero-value EIP-3009 payment challenge. A full tool-call smoke needs a valid `X-Payment` header and should be done from a controlled wallet/tool client.

## Skill Hosting

The public skill entry points live in this repo under `skills/`.

After the branch is merged and the server is rebuilt/restarted, the game server hosts:

- `https://game.mfergpt.lol/skills/mferland/SKILL.md` as the universal default skill for read-only facts, hosted `/agent-command` autoplay, Bankr Terminal/X constraints, and routing to advanced/local-model supplements.
- `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md` as the advanced/direct-control runner skill for Codex/local/custom agents that need a local process and Colyseus room client.
- `https://game.mfergpt.lol/skills/mferland-local-model/SKILL.md` as the local or constrained model supplement for direct-control runners.
- `https://game.mfergpt.lol/skills/mferland-autoplay/SKILL.md` as a compatibility entry point for old hosted-autoplay URLs.
- `https://game.mfergpt.lol/skills/mferland-bankr/SKILL.md` as a compatibility entry point for old Bankr URLs.

The live game server does not need these packages to accept wallet agents, but hosting them gives third-party builders the correct playbook directly from the game domain.

For the advanced/direct-control runner skill, do not publish only `SKILL.md`. Runner agents need the complete package:

```txt
mferland-agent/
  install.sh
  SKILL.md
  scripts/
    .env.example
    bankr-signer.mjs
    create-wallet.ts
    doctor.ts
    generated-wallet-signer.mjs
    package.json
    tsconfig.json
    mferland-agent-runner.ts
    ollama-local-policy.ts
```

The primary URL to give unknown agents, hosted command/autoplay agents, and Bankr Terminal or `@bankrbot` on X is the universal default skill:

- `https://game.mfergpt.lol/skills/mferland/SKILL.md`

The primary URL to give local/custom direct-control runner agents is the hosted advanced runner skill file:

- `https://game.mfergpt.lol/skills/mferland-agent/SKILL.md`

The primary URL to give Ollama or constrained local-model runners is the local-model supplement, used next to the advanced runner skill:

- `https://game.mfergpt.lol/skills/mferland-local-model/SKILL.md`

Keep the old `mferland-autoplay` and `mferland-bankr` URLs hosted as compatibility stubs so external agents with saved skill URLs do not break.

The supporting script files must be hosted alongside `SKILL.md` at matching relative paths:

- `https://game.mfergpt.lol/skills/mferland-agent/install.sh`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/.env.example`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/bankr-signer.mjs`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/create-wallet.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/doctor.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/generated-wallet-signer.mjs`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/package.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/tsconfig.json`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/mferland-agent-runner.ts`
- `https://game.mfergpt.lol/skills/mferland-agent/scripts/ollama-local-policy.ts`

Optional zip/tar artifacts, `install.sh`, or a public repo path are fine as convenience install targets, but the public setup handoff for direct-control runner agents should be the hosted `mferland-agent/SKILL.md` file. The `SKILL.md` must document how to fetch the complete package. Bankr Terminal/X should not install the full runner package; it should use `mferland/SKILL.md`.

The public install instructions should make clear that production use requires `AGENT_ALLOW_PRODUCTION=1` and an agent-controlled wallet signer.

## Agent Builder Setup

Agent builders should use an agent-controlled wallet/signer they already own or manage. That may be Bankr/MPC, a custody API, local wallet adapter, hardware wallet bridge, or another signing backend. Production agents should not put funded private keys in `.env`. The optional `wallet:create` helper is only for local loopback tests or brand-new unfunded identities.

Minimal bundled production runner flow:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
cp .env.example .env
# edit .env with AGENT_WALLET_ADDRESS and either AGENT_SIGNER_COMMAND or AGENT_SESSION_TOKEN
npm run doctor
npm run typecheck
npm run start
```

For a one-off production verification run with an external signer, the equivalent inline command is:

```sh
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SIGNER_COMMAND=/path/to/signer AGENT_NAME=codex-agent AGENT_RUN_SECONDS=0 npm run start
```

For a Bankr/chat-side signer that cannot sign inside the runner process, exchange a signed `/wallet-auth-challenge` proof at `/agent-session`, then run with the returned token:

```sh
AGENT_ALLOW_PRODUCTION=1 AGENT_WALLET_ADDRESS=0x... AGENT_SESSION_TOKEN=... AGENT_NAME=bankr-agent AGENT_RUN_SECONDS=0 npm run start
```

For a long-running process, document a supervisor or multiplexer. Minimum acceptable commands are `tmux`, `screen`, or `nohup`, and a stop command such as `pkill -f mferland-agent-runner.ts`. Do not ask operators to keep an SSH session open for `AGENT_RUN_SECONDS=0`.

The runner and `npm run doctor` load `.env` from the copied `scripts/` directory before reading environment variables. Existing shell environment variables override `.env`. `AGENT_PRIVATE_KEY` is rejected for non-local servers and is only for loopback smoke tests. `npm run wallet:create` is disposable-only and writes generated keys to ignored `.env.generated-wallet*` files by default.

Native Bankr agents should use their platform wallet/signing capability and should not put a Bankr API key or wallet private key in the mferland `.env`. Bankr can sign the normal mferland wallet challenge in the main chat context, POST the signed proof to `/agent-session`, and pass the returned `AGENT_SESSION_TOKEN` to the runner. The public skill bundle includes `scripts/bankr-signer.mjs` only as an optional external-runner sample for operators who already choose to call Bankr's HTTP Wallet API. That sample needs `BANKR_API_KEY` from a runtime environment or secret manager and `AGENT_SIGNER_COMMAND="node ./bankr-signer.mjs"`.

## Bankr Bridge Endpoints

Bankr Terminal/X agents that cannot run the bundled runner use hosted HTTP autoplay documented in `skills/mferland/SKILL.md`. Bankr remains the policy/brain; the bridge is the normal Colyseus room client/controller.

For simple saved-character and public game-state questions, Bankr and other agents should use the read-only facts endpoints and should not start a game session:

```txt
GET /agent-profile?wallet=...
GET /agent-world
GET /agent-player?wallet=...
GET /agent-player?name=...
GET /agent-milestones?type=centralizer
GET /agent-milestones?questId=baron-of-static
```

These answer level/equipment/inventory questions, who is online, what public quest state a character has, what visible agents are doing, current autoplay command/playtime state for online agents, and who completed The Centralizer. They do not perform gameplay.

Bridge contract for manual/debug actions:

```txt
POST /agent-start     { walletAddress, sessionToken, name?, objective? } -> { bridgeSessionId }
GET  /agent-observe?bridgeSessionId=...
POST /agent-action    { bridgeSessionId, action, ...decisionFields }
POST /agent-stop      { bridgeSessionId }
Authorization: Bearer <sessionToken>
```

Bankr Terminal/X should use compact observe by default:

```txt
GET /agent-observe?bridgeSessionId=...&view=bankr
```

The compact view should keep chat-agent context small by returning only the operational state Bankr needs: self HP/position/aggro/skill points/consumables, active and ready quests, available quest hints, low-risk combat targets, nearby threats, lootable corpses, urgent hints, safe retreat points, last action report, suggested next action, and wallet alerts. Full `/agent-observe` remains available for debugging and richer agents.

The bridge joins the live `town` room as `identityType: "wallet"` and `agentClient: true`, observes public room state, returns the full runner action schema, and executes only normal room messages. It should support the complete public decision vocabulary: movement, routes, NPC/player proximity, respawn, interact, quest accept/complete/cancel/share, combat actions, target engagements, loot, equip/unequip/use item, talents, potion buys, trash sales, fishing cast/reel/loot/cancel/fish sales, trait updates, chain gear registration, swaps, chat, and emotes.

`/agent-action` uses durable action execution for Bankr-style chat agents: it may wait several seconds while the bridge performs short mechanical continuation for the chosen high-level action, then returns `summary`, `report`, `stoppedBecause`, `suggestedNextAction`, `continuePrompt`, and `durationMs`. The bridge may continue safe combat/movement for an already chosen target after the HTTP response, but it should not choose new quest/shop/social objectives without another Bankr action.

`/agent-command` is the default autoplay surface for bounded tasks. It uses the same bridge session and normal room messages, and returns `status`, `summary`, structured `result`, `goals`, `goalProgress`, `questChanges`, `inventoryChanges`, `equipmentChanges`, `finalState`, `actionReports`, `budget`, `usage`, `social`, and `combat`. `social` includes nearby players/agents seen during the command and recent public chat so calling agents can give alive-world recaps. `combat` includes damage, healing, hit count, DPS, per-target stats, and training-dummy DPS when relevant. `finalState` includes final level, XP, HP/MP, stats, inventory, equipped gear, talents, and active buffs. Command kinds are `finish_next_quest`, `finish_quest`, `play_for`, `farm_until`, and `run_goals`. The command API does not accept a freeform `objective`; agents translate player requests into structured command/goals/profile/constraints before calling it. Profiles are composable through `priority`, `role`, `spec`, `partyMode`, `risk`, and `social`. The server rejects raw `codeChunk` bodies and does not execute arbitrary policy code; external agent code should run in the caller's policy runner and can pass `controller: { type: "external_policy", policyRef, policyHash }` metadata. Time caps are safety guards and budget controls, not the main success condition. By default deaths, respawns, and safety retreats are reported in command output but do not end the command; set `maxDeaths` or `maxSafetyStops` only when the caller wants a hard failure cap, with `0` meaning stop on the first matching event. When a command caller also provides a valid zero-value EIP-3009 `X-Payment`, the server reports OpenSea tool usage for the registered command tool, but normal wallet-authenticated bridge commands still work without `X-Payment`.

Single-command caps are balance-tiered: base wallets get 5 minutes, 25M MFERGPT wallets get 15 minutes, and 100M+ MFERGPT wallets get 30 minutes. Rolling 24-hour command usage is stored in Postgres in `agent_command_usage`, and reserved seconds expire after the reserved command time plus a short grace period so crashed commands do not pin quota indefinitely.

For combat targets, the bridge should score both target pull risk and direct-path hostile density. When a direct approach is risky, it should stage through known safe edges such as `loop-farm`, `claim-pile-edge`, or `route-post` before moving into combat range, and surface that as `safe_approach ... via ...` in reports/status.

Observation should expose unspent talent/skill points clearly as `self.talentPoints`, `self.skillPoints`, and `self.unspentSkillPoints`, plus `self.spendableTalents` and `self.recommendedTalentSpends`. The bridge can suggest `select_talent` when points are available and no survival, loot, or quest turn-in action is more urgent.

Combat guidance for Bankr should be explicit: when `aggroCount > 1` and HP is below 60%, retreat unless the current target is roughly 2-3 hits from death and combat math is favorable. Ready quests beat farming, and potion purchases should be suggested only after repeated low-health retreats or missing consumables because potion buys burn MFERGPT on Base to reduce token supply.

Compact observe should expose short-term combat memory in `combat.memory`: recent deaths, safety stops, overpulls, movement trouble, `avoidTargets`, `troubleSpots`, and `avoidRemainingMs`. Bankr should treat these as soft vetoes when choosing the next target/path unless the user explicitly asks for a risky boss or group attempt.

Wallet actions stay outside the bridge because a session token cannot sign transactions. For `purchase_potion_shop_item` without proof, the bridge returns `payment_required` with the exact MFERGPT burn details; Bankr burns from the agent wallet and retries with `paymentTxHash`, `paymentAmountWei`, `paymentChainId`, and `paymentContractAddress`. Paid `update_traits` uses the same proof fields. `swap_eth_for_mfergpt` returns `wallet_action_required` with Base/token/router/fallback details so Bankr can perform the swap in its own wallet context. After Bankr buys or mints chain gear, it calls `register_chain_gear` with the owned token id.

For tool-registry swap flows, `/agent-mfergpt-swap-quote` returns ready-to-sign Base Universal Router calldata for ETH to MFERGPT after the caller provides a valid zero-value EIP-3009 `X-Payment` identity proof. `/agent-mfergpt-swap-result` records a submitted tx hash for reports/recaps. The server reports command and swap tool usage to OpenSea when `OPENSEA_API_KEY`, registry address, onchain tool ids, and a valid `X-Payment` are present; failed reporting must not fail a successful tool call.

To watch the actual in-game renderer while an agent plays, open the game-engine viewer:

```sh
https://game.mfergpt.lol/agent-view?wallet=<agent-wallet-address>
```

For local development, run the web app and open `http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>`. The page reuses the livestream Three.js game renderer, joins as a passive stream camera, follows the matching agent by wallet/name/session, and does not send gameplay actions.

Agents can expose what they are doing by sending the normal room message `agentStatus` with `action`, `thought`, `objective`, and `quest` text. The server accepts this only from declared agents and publishes it in the player snapshot, so `/agent-view` can show the latest decision/reason over the real game camera.

The skill runner can also expose `AGENT_VIEWER_PORT=8787` for loopback telemetry, but that is a debug state panel, not the real game-engine view.

Agents using MPC, a custody API, a local wallet, or another wallet backend can implement `AGENT_SIGNER_COMMAND`. Bankr/chat-side agents can instead mint `AGENT_SESSION_TOKEN` out of band. The required behavior is the same:

1. request `https://game.mfergpt.lol/wallet-auth-challenge` for the wallet address
2. sign the returned message
3. either join with `walletAuth`, or POST `{ walletAddress, nonce, message, signature }` to `https://game.mfergpt.lol/agent-session` and join with `sessionToken`
4. optionally fetch `https://game.mfergpt.lol/agent-catalog` for current public game rules
5. observe room state and act only through normal room messages

For wallet-backed purchases or swaps, the runner sends an `AGENT_SIGNER_COMMAND` `sendTransaction` request with `chainId`, `rpcUrl`, `to`, `data`, `valueWei`, and a reader-facing `label`; the signer signs/submits with the agent wallet and returns `{ "txHash": "0x..." }`.

## Reward Gate Behavior

On login and gated quest reward attempts, declared agents receive `Agent Rewards` chat status:

- active: wallet holds at least 25M MFERGPT; reduced agent payout applies
- insufficient: progress saves, but Season 0 points do not accrue yet
- unavailable: balance check failed; treat rewards as inactive until it recovers
- disabled: server env disabled the balance gate

Successful Season 0 awards are sent by `Season 0` chat and include the adjusted agent payout.

Agents should be able to explain the inactive/insufficient state in normal chat when asked: declared agents need 25M MFERGPT on Base before Season 0 points accrue, while gameplay progress still saves. Humans can open `swap-mfer` in town or the swap menu to swap Base ETH to MFERGPT. Configured headless agents can use `swap_eth_for_mfergpt`; on Base this uses the same ETH to MFERGPT Uniswap v4 Universal Router route as the human swap flow, and it remains gated by the runner's ETH spend cap.

Fish sales use the same reward gate. `catalog.fishing` exposes South Center Pond metadata, Motherfisher, timing, item ids, bundle sizes, zero-point junk, Season 0 point values, and the declared-agent bundle multiplier. Successful reels open a normal `lootWindow` with `source=fishing`; agents collect it with `lootCorpse` before inventory or quest progress changes.

## Season Referral Knowledge

The public catalog exposes `season0` and `endpoints` blocks so agents can answer Season 0 questions from current server metadata. Season standings are available at `GET /season/leaderboard`, and wallet referral summaries are available at `GET /season/referrals?wallet=<wallet-address>`.

Human referrals use `https://game.mfergpt.lol/?referral=<referrer-wallet>` and bind only during first wallet character creation. Referrals are active immediately. Eligible human base Season 0 points from `quest` or `event` awards accumulate across sessions from the first award and create a cumulative 20% bonus for both sides, capped at 500 bonus points per side per referral, with 10 referee slots per referrer. Referral bonus events never cascade. Human referrers can remove a referral from the character Referrals tab to free the slot; this removes referral bonus points for both wallets but keeps base Season 0 points intact.

Declared agents do not participate in human referrals: they cannot bind as referees, cannot count as referrers, and agent-earned Season 0 points do not trigger referral bonuses. Agents may explain the rules to humans, but should not try to use referral links for themselves.

## Quest And Combat Strategy

The server should stay authoritative. Do not add production-only shortcuts for agents.

The harness should expose enough context for agents to decide what to do:

- self state
- nearby players and whether they are agents
- NPC ids, positions, health, roles, quest ids, shop ids, loot windows, and targets
- quest offers, active quest snapshots, progress, turn-in NPC ids/names, ready turn-ins, `questCompleted` result messages, and next quest prompts
- inventory, equipment, talents, cooldowns, cast state, health, mana, and combat events
- character stats, `talentPoints`, current talent ranks, current `/agent-catalog` season/referral/talent/item/equipment definitions, and public season endpoints so agents can answer rules questions and choose builds/upgrades
- menu parity for player HUD surfaces: targeting/self-target, quest focus, stash/equipment, hotbar-local actions, talents, loot-all/item-specific loot, chat/emotes, settings/system controls, wallet-backed swaps, potion/trait/respec burns, and owned chain gear registration after wallet-side purchases
- chat and emotes for coordination

The bundled starter runner should be an observation-driven decision harness, not a hard-coded quest script. It may include public map landmarks, normal action contracts, and summaries of observed quest messages, but it should ask the agent policy to choose actions from current context. Third-party agents should be able to replace that policy and make their own choices from the observed state and server messages.

Keep any scripted quest-route clients as internal regression tools only. They are useful for proving server mechanics, but they should not be the default package linked to external agent builders.

Package the public agent path around this autonomy boundary:

- agent policy decides quest order, exploration, target choice, grouping, looting, shopping, chat/emotes, and retreat timing
- harness provides wallet auth, room connection, public observation, normal message dispatch, cast/movement safety, and short combat continuations after the policy selects a target
- harness does not provide hard-coded quest paths, hidden DB/server state, debug messages, teleports, production bypasses, or deterministic playthrough macros

Bosses remain normal combat targets. Agents can kill bosses if they reach the content, satisfy quest requirements where needed, stay alive, coordinate with others, and use normal combat actions.

## Live Smoke Checklist

Before public announcement:

1. Deploy to `game.mfergpt.lol`.
2. Confirm `/health` responds.
3. Confirm `/wallet-auth-challenge` returns a fresh challenge.
4. Confirm `/agent-session` accepts a valid signed challenge and returns a session token.
5. Confirm `/agent-start`, `/agent-observe`, `/agent-action`, and `/agent-stop` work with `Authorization: Bearer <sessionToken>`.
6. Confirm `/skills/mferland/SKILL.md`, `/skills/mferland-agent/SKILL.md`, `/skills/mferland-local-model/SKILL.md`, `/skills/mferland-autoplay/SKILL.md`, and `/skills/mferland-bankr/SKILL.md` return the expected skill files.
7. Confirm `mferland-agent/install.sh`, `scripts/.env.example`, `scripts/bankr-signer.mjs`, and `scripts/doctor.ts` are also hosted.
8. Install the hosted skill package in a fresh directory.
9. Run `npm install`, `npm run typecheck`, and `npm run doctor` from the fresh install.
10. Run one controlled production agent with an owned test wallet.
11. Confirm the agent joins with `isAgent: true`.
12. Confirm `Agent Rewards` chat reports the 25M MFERGPT gate status.
13. Complete one eligible quest turn-in and confirm either gated no-points behavior or reduced Season 0 payout.
14. Confirm the agent can see nearby human players and agents.
15. Confirm no local-only auth bypass or test-only env is enabled.
16. Confirm both `.well-known/ai-tool` manifests validate with `npx @opensea/tool-sdk validate` and produce the expected SDK hashes.
17. Confirm `/agent-mfergpt-swap-quote` returns `402` without `X-Payment` and succeeds with a controlled valid zero-value EIP-3009 header.
18. Confirm `/agent-command` can start a short `play_for` command, return status, and stop cleanly.
19. Confirm a command recap includes `social.nearbyPlayers`, `social.recentChat`, and a readable `summary` when another player or agent is nearby or chatting.

Do not publish private keys, mnemonics, API keys, or real wallet secrets in the skill package or docs.

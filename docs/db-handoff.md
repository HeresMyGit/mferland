# DB Handoff

## Current DB State

- Wallet character persistence code is checked in.
- Commit: `eebf71c Add wallet character persistence foundation`
- Local `.env` exists and currently points `DATABASE_URL` at local Postgres for safe local testing. Point it at a Neon staging/test branch before off-LAN testers.
- `.env` and `.env.*` are ignored by git. Do not commit real connection strings, API keys, tokens, wallet keys, or private keys.
- `.env.example` contains placeholders only.
- The broken Drizzle metadata-dependent migrate command has been replaced with a repo-local SQL migration runner.
- Checked-in migrations were applied to the current local `DATABASE_URL`.
- On 2026-05-04, `0004_chain_gear_tiers.sql`, `0005_season_reward_events.sql`, and `0006_crypto_purchase_events.sql` were applied to the configured local/test `DATABASE_URL`.
- On 2026-05-05, `0007_crypto_market_quotes.sql` was added for the Dex Screener quote cache and must be applied to the Neon staging/test branch before the remote friend test.
- Wallet persistence was smoke-tested with a synthetic wallet for level/XP/talent points, quest state, inventory, equipment, and talents.

## Neon Staging/Test Branch

- Project ID: `shy-frog-66739604`
- Database: `neondb`
- Staging project default branch ID: `br-hidden-firefly-aqy5jojx`
- Remote friend-test branch ID: `br-autumn-rice-aqv3ie10`
- Remote friend-test branch name: `remote-friend-test-2026-05-05`

This staging project is separate from production. On 2026-05-05, the remote friend-test branch was migrated through `0007_crypto_market_quotes.sql` and seeded with cached Dex Screener quotes for remote testing.

## Current Checked-In Migrations

- `0001_character_foundation.sql`: accounts, wallet mapping, characters, quests, inventory, talents.
- `0002_character_equipment.sql`: character equipment slots.
- `0003_item_chain_tokens.sql`: chain token IDs on inventory/equipment and inventory primary-key update.
- `0004_chain_gear_tiers.sql`: persisted NFT gear tier fields.
- `0005_season_reward_events.sql`: capped offchain Season 0 reward eligibility ledger.
- `0006_crypto_purchase_events.sql`: launch-pass purchase reconciliation, manual grant, reject, and revoke ledger.
- `0007_crypto_market_quotes.sql`: DB-backed cached Dex Screener market quotes for `$mfer/WETH` and `MFERGPT/WETH` display labels.

## How To Test Locally

1. Start the app with `npm run dev`.
2. Open `http://localhost:5173`.
3. Enter with wallet, not guest.
4. Accept a quest, loot an item, or otherwise change character state.
5. Leave/refresh/re-enter with the same wallet.
6. Confirm quest/inventory/character state persists.

Guest mode does not persist yet.

## Production Cutover

1. Re-check for secrets before committing or pushing:
   `git grep -n -E "postgresql://|postgres://|API_KEY|SECRET|PRIVATE_KEY|TOKEN|npg_" -- . ':!package-lock.json'`
2. Wait until Josh is on the Mac mini.
3. Decide the final Neon dev/prod branch layout.
4. Apply all checked-in migrations through `0007_crypto_market_quotes.sql` to the production branch/DB from that launch machine.
5. Point the Mac mini at production `DATABASE_URL` through local/deploy secrets only.
6. Keep `.env` local-only.
7. Run wallet persistence, Season 0 reward, and purchase-ledger smoke tests against production before inviting external testers.

## Later DB/Auth Work

- Keep tester auth wallet-only for now. Privy and `accounts.privy_user_id` mapping are deferred until wallet-only testing proves they are needed.
- Decide final character progression tables for XP, talent trees, and gear.
- Keep rare/onchain items separate later; current character/account/quest/inventory state is regular DB.
- Add automatic onchain receipt ingestion after the manual purchase-ledger path proves sufficient for the first tester group.

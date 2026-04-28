# Next Steps

## Current DB State

- Wallet character persistence code is checked in.
- Commit: `eebf71c Add wallet character persistence foundation`
- Local `.env` exists and points `DATABASE_URL` at the Neon test branch.
- `.env` and `.env.*` are ignored by git. Do not commit real connection strings, API keys, tokens, or wallet/private keys.
- `.env.example` contains placeholders only.

## Neon Test Branch

- Project ID: `odd-scene-22957189`
- Database: `neondb`
- Temporary test branch ID: `br-floral-shape-a46wjdc8`
- Temporary test branch name: `mcp-migration-2026-04-28T04-34-32`
- Migration ID: `8707261c-c914-47c4-a67e-bd6c77b6f021`

This branch has the character/account schema and is safe for temporary testing. Neon main has not been migrated yet.

## How To Test Locally

1. Start the app with `npm run dev`.
2. Open `http://localhost:5173`.
3. Enter with wallet, not guest.
4. Accept a quest, loot an item, or otherwise change character state.
5. Leave/refresh/re-enter with the same wallet.
6. Confirm quest/inventory/character state persists.

Guest mode does not persist yet.

## When Ready To Keep DB Work

1. Re-check for secrets before committing or pushing:
   `git grep -n -E "postgresql://|postgres://|API_KEY|SECRET|PRIVATE_KEY|TOKEN|npg_" -- . ':!package-lock.json'`
2. Apply the verified Neon migration to main.
3. Replace local/deploy `DATABASE_URL` with the Neon main branch connection string in secret/env settings only.
4. Keep `.env` local-only.

## Later DB/Auth Work

- Add Privy auth and map Privy users to `accounts.privy_user_id`.
- Decide final character progression tables for XP, talent trees, and gear.
- Keep rare/onchain items separate later; current character/account/quest/inventory state is regular DB.
- Add admin/debug tooling for looking up a wallet character without exposing secrets.

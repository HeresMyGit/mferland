# Soft Launch Plan

Date: 2026-05-04
Branch: `codex/soft-launch-prep`

This is the working plan for an invite-only soft launch to respected testers. The goal is not a public token campaign yet. The goal is to prove that real players can enter, understand the loop, persist progress, and hit one controlled crypto surface without support chaos.

## Current Launch Position

- `main` has been fast-forwarded to `origin/main`.
- `codex/crypto-wallet-updates` has been merged into `codex/soft-launch-prep`.
- The merged crypto suite adds local Foundry contracts, a local merchant UI, test scripts, chain-token item support, and crypto docs.
- The selected first paid surface is now a Season 0 launch pass, kept separate from combat power so respected testers can exercise a real purchase path without turning early access into pay-to-win testing.
- The crypto suite is still local-first. It is not audited and is not a production Base deployment.
- Production DB cutover is still blocked until the final Neon branch layout is chosen and migrations are applied from the launch machine.

## Soft-Launch Scope

The first respected-tester session should support only this loop:

1. Enter with wallet identity.
2. Spawn in the starter mfer town.
3. Talk to starter NPCs and/or mferGPT.
4. Complete the intro/farm combat loop.
5. Earn XP, regular DB-backed gear, and normal in-game rewards.
6. Earn capped Season 0 reward points or tickets, not an uncapped live-token faucet.
7. Buy or receive the Season 0 pass if they want eligibility for any reviewed token distribution.
8. Reconnect with the same wallet and confirm progress persists.

Out of scope for this soft launch:

- Public launch.
- Infinite liquid `$mferGPT` quest emissions.
- Deep itemization, crafting, or full loot-table redesign.
- Broad questline expansion before the mfer-centric rewrite.
- Unreviewed user-generated assets or maps.
- Real-money combat dominance.

## Crypto Positioning

`$mferGPT` should be used as a controlled launch utility token, not as the normal game economy.

Use it for:

- Season 0 tester rewards after review.
- Founder/tester badge or pass discounts.
- mferGPT-themed cosmetics.
- Optional burn-to-upgrade cosmetic/status mechanics.
- Event or boss prize pools with hard caps.

Do not use it for:

- Every kill.
- Every repeatable daily forever.
- Uncapped quest farming.
- Rewards before wallet legitimacy checks.
- Marketing that implies financial return.

Normal gameplay rewards should remain DB-backed. Rare/onchain behavior should be narrow and verifiable.

## Season 0 Reward Model

Use offchain points first, then reviewed claim/distribution later.

Recommended mechanics:

- `season_id`: `season-0`
- `points`: earned from selected quests, events, referrals, and group boss participation.
- `daily cap`: hard per-wallet cap for liquid-reward eligibility.
- `season cap`: hard per-wallet cap for liquid-reward eligibility.
- `review state`: pending, approved, rejected, distributed.
- `distribution`: manual CSV or claim contract only after review.
- `eligibility gate`: approved points are only exported for wallets with a confirmed `season0-pass` purchase or manual grant.

This keeps the launch from becoming a bot faucet while still letting the `$mferGPT` stash attract real testers.

## Required Launch Gates

### Gate 1: Repo And Build

- `npm run typecheck`
- `npm run build`
- `npm run build:agent`
- `npm run crypto:test:local`
- `git diff --check`
- secret scan before any commit or push

### Gate 2: Production Persistence

- Production Neon branch selected.
- Checked-in migrations applied to production.
- `DATABASE_URL` configured through secrets only.
- Wallet reconnect preserves quest state, XP, inventory, equipment, and talents.
- Backup/export path confirmed.

### Gate 3: Crypto Purchase Path

- Base Sepolia or local equivalent purchase test passes.
- User pays with ETH or `$mferGPT`.
- Transaction receipt is tracked.
- Purchased item/pass is granted once.
- Failed/reverted transaction does not grant anything.
- Refresh/disconnect during transaction can be reconciled.

### Gate 4: Reward Abuse

- Same quest cannot produce duplicate Season 0 eligibility.
- Daily and season caps apply.
- Two tabs cannot double-award.
- Wallet switch does not move rewards to a different character.
- Suspicious claims can be rejected before token distribution.

### Gate 5: Tester Experience

- New tester can enter and find the first task without chat help.
- Starter town visually reads as mfer town, not an empty prototype.
- Combat feedback is readable enough for the first farm loop.
- Death/respawn is understandable.
- Merchant/reward UI is understandable.
- Mobile can at least move, interact, fight, and open core HUD panels.

## Step Status

1. Freeze scope: done in this document.
2. Sync repo and merge crypto branch: done on `codex/soft-launch-prep`.
3. Production DB cutover: local/test migrations through `0006_crypto_purchase_events.sql` applied; production remains blocked on final Neon production branch/deploy-machine secret setup.
4. Season 0 reward mechanics: initial capped offchain quest-point ledger implemented.
5. Paid crypto surface: Season 0 launch pass selected and scaffolded locally as `MferLaunchPass`; local in-game pass purchase UI exists with ETH, discounted `$mfer` to treasury, and `$mfergpt` burn paths. Production deployment still pending, and manual reconciliation tooling is available.
6. Admin/support tooling: wallet lookup, Season 0 reward review/export, purchase reconciliation, and manual pass grant/revoke are available through `npm run support:admin`.
7. Season Gold visibility and payout tooling: wallet players see Season Gold totals in the Character panel, and `season-payout-export` can convert approved pass-gated points into proposed `$mfergpt` payouts under a fixed pool and per-wallet cap.
8. Abuse testing: pending after Season 0 mechanics exist.
9. First-10-minute polish: partially covered by current queue; needs focused verification.
10. Internal rehearsal: pending after gates 1-4.
11. Invite-only soft launch: pending.

## Verification Log

### 2026-05-04 Local Prep Branch

- `npm run db:migrate -w @mferland/server`: applied `0004_chain_gear_tiers.sql` and `0005_season_reward_events.sql` to the configured local/test database.
- `npm run test -w @mferland/shared`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite emitted existing large-chunk and upstream pure-annotation warnings.
- `npm run build:agent`: passed.
- `npm run chain:test`: passed.
- `npm run web:test`: passed.
- `npm run crypto:test:local`: passed, including local browser crypto merchant smoke.
- `npm run support:admin -- season-summary`: passed against the configured local/test database.
- `npm run support:admin -- season-export --status approved`: passed against the configured local/test database.
- Season 0 DB smoke: created a throwaway wallet character, awarded `mfer-beginnings`, confirmed duplicate award was blocked, then deleted the throwaway account.
- `npm run chain:test`: passed after adding `MferLaunchPass`, including ETH mint, `$mfergpt` burn mint, wrong-price rejection, allowance rejection, sold-out rejection, and local address export coverage.
- `npm run crypto:test:local`: passed after adding `MferLaunchPass`, including deploy/export and local browser merchant smoke.
- `npm run typecheck`: passed after the launch-pass update.
- `npm run build`: passed after the launch-pass update. Vite emitted existing large-chunk and upstream pure-annotation warnings.
- `npm run build:agent`: passed after the launch-pass update.
- `git diff --check`: passed after the launch-pass update.
- Secret scan: first pass only hit the placeholder `DATABASE_URL` in `.env.example`; the scan excluding documented/placeholding fixtures returned no hits.
- `npm run db:migrate -w @mferland/server`: applied `0006_crypto_purchase_events.sql` to the configured local/test database.
- `npm run support:admin -- --help`: passed and showed the purchase support commands.
- Purchase admin smoke: manually granted a Season 0 pass, recorded a chain purchase receipt, listed/exported confirmed rows, revoked by wallet, listed revoked rows, and deleted the disposable smoke rows.
- Direct wallet persistence and reward-abuse smoke: created a synthetic wallet character, persisted quest/inventory/equipment/talent state, reloaded it by wallet, then fired two concurrent Season 0 `mfer-beginnings` awards and confirmed one award plus one duplicate. The synthetic account was deleted afterward.
- Desktop browser smoke: started the local dev stack, entered as anon, moved, opened/closed Character, stash, and errand log panels, debug-traveled to Farm, pressed target/attack inputs, and saw no browser console errors.
- Mobile browser smoke: entered at an iPhone-sized touch viewport, confirmed the mobile movement stick rendered and activated, opened/closed Character, stash, and errand log panels, and saw no browser console errors.
- `npm run support:admin -- season-export --status approved --require-product season0-pass`: pass-gated reward export path added for token distribution eligibility.
- Pass-gated export smoke: approved points did not export before a confirmed pass grant, then exported after `purchase-grant`, and the synthetic account/purchase rows were deleted.
- `npm run crypto:test:local`: passed after adding the pass purchase UI, including `$mfergpt` pass mint, pass ownership check, and updated burn balance/supply assertions.
- `npm run typecheck`, `npm run build`, and `npm run build:agent`: passed after the pass eligibility update.
- `npm run crypto:test:local`: passed after adding discounted `$mfer` pass mint, including treasury balance checks and a second `$mfergpt` pass mint.
- `npm run typecheck`, `npm run build`, `npm run build:agent`, `git diff --check`, and secret scan: passed after the discounted `$mfer` pass update.
- `npm run support:admin -- --help`: passed after adding `season-payout-export`.
- `npm run support:admin -- season-payout-export --pool 1000 --per-wallet-cap 100 --minimum-points 1`: smoke-tested against disposable approved reward rows and a manual pass grant; output was capped and pass-gated, then smoke rows were deleted.
- `npm run typecheck`, `npm run build`, `npm run build:agent`, and `npm run crypto:browser:local`: passed after adding Character panel Season Gold totals, payout export, and production pricing docs.
- `npm run pricing:quote:mfer-pass -- --mfer-eth 0.00001`: passed and returned `621` `$mfer` / `621000000000000000000` wei for the current local assumption.
- `npm run pricing:quote:mfer-pass -- --dexscreener-token 0xe3086852a4b125803c815a158249ae468a3254ca --min-liquidity-usd 1000`: passed against Dex Screener's free Base token-pairs API and selected the highest-liquidity `$mfer/WETH` pair.

## Remaining Launch Gates

- Production Neon branch layout and cutover from the launch machine.
- Production deployer wallet, RPC provider, and Season 0 pass deployment.
- Production address config for the deployed pass.
- Production `$mfer` pass quote from [docs/crypto/production-pricing.md](crypto/production-pricing.md); local `621 $mfer` is only the current test assumption.
- Final production launch gate after the production DB and pass deployment are live.
- Optional Base Sepolia rehearsal is documented in [docs/crypto/base-sepolia-dry-run.md](crypto/base-sepolia-dry-run.md), but local remains the stronger full-path `$mfergpt` test until a public-testnet mock token is needed.

## Tester Brief

Use [docs/soft-launch-tester-brief.md](soft-launch-tester-brief.md) for the first respected-tester invite copy, reward rules, known limits, feedback asks, and internal support commands.

## Open Decisions

These need Josh before production launch, but not before continuing local implementation:

- Final Season 0 `$mferGPT` reward pool size.
- Final per-wallet daily and season caps.
- Production Neon branch layout.
- Production deployer wallet and RPC provider.

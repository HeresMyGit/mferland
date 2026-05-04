# Season Gold Redemption Strategy

Use this as the current Season 0 stance for gold/points-to-`$mfergpt` rewards.

## Recommendation

Ship friend testing with reviewed offchain Season Gold points first, then graduate to a refillable onchain claim vault after the game loop survives testers.

Do not launch a direct always-open `$GOLD -> $mfergpt` swap for the first respected-tester build.

## Why

The game needs onchain flavor, but an always-open liquid swap makes every gameplay bug an immediately monetizable faucet. A small top-off vault limits maximum loss, but it still turns botting, duplicate rewards, replay bugs, and balance mistakes into a live extraction game.

The current safer flow is:

1. Players earn DB-backed Season Gold or Season 0 points.
2. The server applies daily and season caps.
3. Support reviews/rejects suspicious rows.
4. Confirmed Season 0 pass ownership gates eligibility.
5. Approved points export into a proposed `$mfergpt` distribution.
6. Distribution happens during announced windows.

This is less exciting than instant onchain redemption, but it keeps the first launch from becoming a faucet-debugging job.

## If We Want Onchain Redemption

The right onchain version is a refillable claim vault, not a raw swap pool.

Contract shape:

- treasury/admin deposits a fixed amount of `$mfergpt` into a vault for a redemption window.
- owner publishes a Merkle root or signed allocation set from reviewed Season Gold points.
- wallet claims at most its approved allocation.
- claim requires holding or having bought the Season 0 pass.
- each allocation can be claimed once.
- vault can be paused.
- unclaimed `$mfergpt` can be swept after the window.
- per-wallet cap and total-window cap are enforced by the exported allocation, not by trusting client state.

This still feels onchain to players because claiming is a real transaction, but the game server remains authoritative about what gameplay is worth.

## About Onchain GOLD

The repo already has local onchain `GOLD` for crypto-suite testing and gear upgrades. That is useful for local store behavior, but production quest rewards should not become a freely transferable liquid token until the exploit surface is better understood.

If production needs onchain gold, prefer one of these:

- non-transferable or restricted Season Gold receipt token.
- claim-only reward voucher NFT.
- refillable `$mfergpt` claim vault based on reviewed offchain points.

Avoid a transferable ERC-20 `GOLD` with automatic redemption during Season 0 unless the goal is explicitly to run an economic experiment instead of a game test.

## Mint Club Option

Mint Club is better framed as a later experiment than as the Season 0 reward rail. Its docs describe bonding-curve-backed ERC-20/ERC-1155 assets where buyers pay a base ERC-20 into the curve pool, and sellers can burn the asset to receive base tokens back along the curve.

That can be fun for a separate mferland artifact, meme item, or social market. It is probably too much machinery for tester reward redemption because it introduces curve design, market behavior, creator royalties, holder expectations, and extra external protocol dependency before the core game loop is proven.

References:

- https://docs.mint.club/
- https://docs.mint.club/create/token
- https://docs.mint.club/mintburn/mint-burn-overview

## Current Next Build

Add visible Season Gold in the HUD/profile and a support command that converts approved pass-gated points into a proposed `$mfergpt` payout under:

- fixed reward pool.
- per-wallet cap.
- minimum points threshold.
- CSV export for review.

That gives testers a visible reward loop now and preserves a clean path to an onchain claim vault later.

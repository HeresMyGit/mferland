# MFERLAND Season Pass Notes

working draft — not final

## Current direction

Keep the season pass simple.

- Use a **Season Pass NFT** (eventually proper ERC-721)
- Funds from purchases go straight to treasury
- Avoid complicated onchain reward accounting for now
- Handle season points / multipliers **offchain in the game/server**
- Keep utility focused on **season point boosting + reward eligibility**
- Do **not** promise lots of extra cosmetics, quests, or other work-heavy features unless we explicitly decide to later

## Core utility

The simplest useful version:

- Each pass increases **future season points earned**
- Boost is **not retroactive**
- Pass ownership also gates eligibility for season-end rewards / airdrops
- Rewards can be decided later

Suggested framing:

- buy passes to support the game
- earn more season points going forward
- qualify for season-end rewards
- no guaranteed ROI / money-back promise

## Stacking

Current leaning:

- Passes should be **stackable**
- Only count up to **3 max** (possible alternative: 5 max, but 3 feels cleaner)
- Avoid uncapped stacking
- Avoid linear whale-dominant leaderboard distortion

Reasoning:

- uncapped flat % stacking makes leaderboard feel bought
- capped stacking still gives people a reason to buy more than one
- simpler to explain and safer for game balance

## Multiplier shape

Not finalized, but keep it simple.

Possible approaches:

### Option A — literal 1x / 2x / 3x
- 1 pass = 1x earned points
- 2 passes = 2x earned points
- 3 passes = 3x earned points

This is very aggressive and may be too strong.

### Option B — softer boost (preferred if fairness matters)
- 0 pass = 1.0x
- 1 pass = 1.25x
- 2 passes = 1.5x
- 3 passes = 2.0x max

This keeps the pass meaningful without making the whole season purely pay-driven.

## Reward direction

No hard promises yet.

Current rough idea:

- season-end airdrop/reward pool based on **top point holders**
- likely only wallets with at least one season pass are eligible
- distribution weighted by **season points**, not equal split

Example structure discussed:

- reward pool = **1% of token supply**
- market cap example = **$100,000**
- token supply example = **100,000,000,000**
- 1% pool = **1,000,000,000 tokens**
- at $100k mc, pool value ≈ **$1,000**

If distributed to **top 25**, flat split would be about:

- **40,000,000 tokens each**
- ≈ **$40 each** at $100k market cap

But preferred structure is **point-weighted payout**, meaning:

- payout = `(player points / total points of qualified winners) × reward pool`
- top few players could get meaningfully more
- lower ranks would get less

## Important positioning

Do **not** frame the season pass as:

- guaranteed money back
- guaranteed profitable ticket
- direct ROI instrument

Better framing:

- supporter / competitor pass
- boosts your season progress
- makes you eligible for season-end rewards
- upside depends on participation, rank, and whatever reward pool is later chosen

## NFT vs simpler receipt

Current leaning:

- make it an NFT, not just a generic fund-management contract

Why:

- cleaner product identity
- visible proof someone bought in
- collectible / season artifact
- future utility possible if wanted

But keep logic simple:

- mint pass
- wallet owns pass
- server reads balance
- server applies multiplier

## Trading / transferability

Not decided.

Two possible directions:

### transferable
- cooler crypto object
- tradable / collectible
- but creates weird edge cases for season scoring

### non-transferable or transfer-restricted during season
- simpler for fairness
- less abuse / pass-renting / gaming the ladder

If transfers are enabled, scoring rules must be very clear.

## Recommended simple v1

If we want the lowest-complexity version:

- Season Pass = ERC-721 NFT
- Purchases go straight to treasury
- Count max **3 per wallet**
- Points multiplier based on pass count
- Multiplier applies only to **future** earned points
- At least **1 pass required** for season-end reward eligibility
- Reward pool / token drop amount decided later
- No extra obligations beyond pass + multiplier + eligibility

## Open questions

- 3 max or 5 max?
- aggressive multipliers or softer multipliers?
- transferable during season or not?
- must hold at least 1 pass to qualify, or can non-pass holders rank but not claim?
- top 25 / top 50 / top 100 for season rewards?
- 1% reward pool or something else?

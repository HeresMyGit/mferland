# Production Pricing

Use this for the production Season 0 pass pricing model.

## Target

The ETH pass price is currently `0.0069 ETH`.

The `$mfer` pass price should target a 10% discount against ETH:

```txt
target_mfer_value_eth = 0.0069 ETH * 0.9 = 0.00621 ETH
```

The local test value of `621 $mfer` only makes sense if `1 $mfer = 0.00001 ETH`. That is a local assumption, not a production rule.

To calculate the exact rounded onchain amount from a chosen quote:

```sh
npm run pricing:quote:mfer-pass -- --mfer-eth 0.00001
```

To use the free Dex Screener API against the Base `$mfer` token:

```sh
npm run pricing:quote:mfer-pass -- \
  --dexscreener-token 0xe3086852a4b125803c815a158249ae468a3254ca \
  --min-liquidity-usd 1000
```

This fetches Base token pairs, filters to `$mfer` as the base token with `WETH` as the quote token, requires the liquidity floor, selects the highest-liquidity eligible pair, reads `priceNative`, and rounds the required `$mfer` amount up.

## Formula

For an 18-decimal `$mfer` token:

```txt
required_mfer = ceil(target_mfer_value_eth / mfer_eth_price)
```

In integer contract terms:

```txt
required_mfer_wei = ceil(target_eth_wei * 10^18 / mfer_eth_price_wei)
```

Round up, not down, so the treasury never receives less than the target value because of integer truncation.

## Soft Launch Recommendation

For friend-test production, keep the contract price owner-set and update it from a trusted admin quote before launch or before each invite window.

That means:

- keep `ethPrice`, `mferPrice`, and `mferGptPrice` as explicit contract fields.
- compute `$mfer` offchain from a conservative DEX quote/TWAP.
- for a free soft-launch quote, use `npm run pricing:quote:mfer-pass -- --dexscreener-token ...` and sanity-check the selected pair/liquidity before calling `setPricing(...)`.
- call `setPricing(...)` before the invite window.
- record the quote source, timestamp, `$mfer/ETH` rate, and resulting `mferPrice` in the launch notes.
- use a short invite window if `$mfer` is volatile.
- pause or stop advertising the `$mfer` button if the quote is stale.

This is boring, but it is the right first production surface. It avoids putting a half-tested oracle path into the payment contract while still making `$mfer` feel native.

## Later Onchain Quote

If this becomes a real public mint, move from owner-set `$mfer` price to a contract that reads a time-weighted price.

The strongest simple version:

- read `$mfer/WETH` from a liquid Uniswap v3 pool.
- use `observe(...)` over a TWAP window instead of current spot price.
- require enough historical observations and liquidity.
- reject if the pool or observation window is not initialized.
- round required `$mfer` up.
- keep owner pause and emergency fixed-price fallback.
- add min/max bounds so a broken quote cannot demand nonsense.

Uniswap v3 pools can expose historical observations through `observe(...)`, which is why they can be used for TWAP-style pricing. Uniswap v4 does not include built-in oracle functionality, so v3 is the cleaner reference if we use Uniswap directly.

References:

- https://docs.dexscreener.com/api/reference
- https://developers.uniswap.org/docs/protocols/v3/concepts/price-oracles
- https://developers.uniswap.org/docs/sdks/v3/guides/price-oracle

## What Not To Do

Do not use the browser/UI as the authority for production pricing. The contract must enforce the exact accepted `$mfer` amount.

Do not use an always-current spot price from a thin pool. A buyer can manipulate a thin pool around the purchase, especially if the pass mint is economically meaningful.

Do not leave the local `621 $mfer` assumption in production unless we intentionally decide that underpricing/overpricing risk is acceptable for a small closed test.

## Current Contract Fit

The current `MferLaunchPass` already fits the soft-launch recommendation:

- ETH price is fixed onchain.
- `$mfer` price is fixed onchain and paid to treasury.
- `$mfergpt` price is fixed onchain and burned.
- owner can update pricing with `setPricing(...)`.

Before production deployment, choose the actual `$mfer` quote and set the production constructor or post-deploy pricing accordingly.

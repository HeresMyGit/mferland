# Respected Tester Brief

Use this as the source copy for the first invite-only tester group. Send the launch URL by DM only. No email collection is required for this test.

## Who This Is For

Invite 10-25 people who can give useful feedback and will not treat the test as a public token farm.

Good testers:

- already understand wallet flows.
- can record a bug with device/browser/wallet/tx details.
- will play the first 10-20 minutes instead of only asking where rewards are.
- will not spam multi-wallet claims.

Do not send this to public channels yet.

## What Testers Should Do

1. Open the launch URL: `TBD`.
2. Enter as anon or with the wallet they may want tied to Season 0 eligibility later.
3. Play the starter mfer town loop.
4. Finish the intro/plaza/farm path as far as they reasonably can.
5. Reconnect with the same wallet and confirm progress persists.
6. Skip crypto/pass purchase unless Josh explicitly says the pass test is live.
7. Report bugs in the feedback channel: `TBD`.

## Reward Rules

Season 0 rewards are reviewed eligibility points, not instant liquid token emissions.

- Quest and event rewards create capped Season 0 points.
- Points can be rejected for botting, duplicate-wallet behavior, exploit farming, or fake feedback.
- Daily and season caps apply per wallet.
- Repeatable farming does not create uncapped `$mferGPT`.
- Final `$mferGPT` distribution amount is `TBD` and happens only after review.
- Approved points require a confirmed Season 0 pass purchase or manual grant before they can be exported for token distribution.
- Pass purchases and manual grants can be revoked if the underlying purchase is reversed, fraudulent, or attached to an abusive wallet.

Plain version to send testers:

> Play normally, report useful bugs, do not farm like a bot. Season 0 points are reviewed after the test. The pass is the eligibility gate for any token distribution. Nothing is an instant token faucet.

## Known Limits

- This is an invite-only soft launch, not a public launch.
- Combat and first-10-minute polish are still rough.
- Quests are functional but will be rewritten to be more mfer-centric later.
- Normal character state is DB-backed. Rare/onchain behavior is deliberately narrow.
- The Season 0 pass is paused until Josh explicitly turns on a public-chain test contract.
- If the pass UI is enabled later, save the transaction hash after purchase.

## What To Ask For In Feedback

Ask testers to include:

- wallet address used for the test.
- browser and device.
- whether they entered as wallet or anon.
- where they were in the world.
- what they clicked/pressed.
- screenshot or screen recording if possible.
- transaction hash for any pass purchase, only if pass testing is enabled.
- whether reconnect preserved progress.

High-signal feedback:

- could not enter.
- wallet connect failed.
- reconnect lost progress.
- quest accept/turn-in was unclear or broken.
- combat target/action did not work.
- pass purchase failed or gave unclear status.
- mobile could not move/interact/open HUD panels.

Low-signal feedback:

- vague "it feels early."
- token questions before gameplay feedback.
- requests for broad new systems during the first test.

## Internal Support Commands

Wallet lookup:

```sh
npm run support:admin -- wallet --wallet 0x...
```

Invite management:

```sh
npm run support:admin -- invite-create --count 40
npm run support:admin -- invite-summary
npm run support:admin -- invite-list --status open
npm run support:admin -- invite-list --status claimed
```

End-of-test stats:

```sh
npm run support:admin -- analytics-summary --since 7d
```

Season 0 review:

```sh
npm run support:admin -- season-summary
npm run support:admin -- season-list --wallet 0x...
npm run support:admin -- season-set-status --id <event_id> --status approved --note "useful tester"
npm run support:admin -- season-export --status approved --require-product season0-pass
```

Pass purchase reconciliation:

```sh
npm run support:admin -- purchase-summary
npm run support:admin -- purchase-list --wallet 0x...
npm run support:admin -- purchase-record --wallet 0x... --chain <chain_id> --contract 0x... --tx 0x... --log-index 0 --token-id <pass_id> --payment-token ETH --payment-amount <wei> --status confirmed
npm run support:admin -- purchase-grant --wallet 0x... --token-id manual:<reason> --note "manual tester grant"
npm run support:admin -- purchase-revoke --wallet 0x... --note "revoked reason"
npm run support:admin -- purchase-export --status confirmed
```

## Fill Before Invites

- Launch URL: `TBD`
- Feedback channel: `TBD`
- Neon DB branch: `TBD`
- Pass network: `paused`
- Pass contract: `paused`
- Pass price: `paused`
- Final Season 0 `$mferGPT` reward pool: `TBD`
- Initial invite list: `TBD`

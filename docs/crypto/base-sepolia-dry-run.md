# Base Sepolia Dry Run

Keep the current respected-tester launch on the test database and local crypto path until there is a concrete reason to rehearse external wallets on a public testnet.

Base Sepolia is useful for:

- wallet UX against a real public network.
- faucet-funded native ETH purchases.
- deployment rehearsal with disposable keys.
- proving the address-config shape before Base mainnet.

Base Sepolia is not better than local for the current `$mfergpt` path unless we also deploy a mock `$mfergpt` token there. The live `$mfergpt` token is on Base mainnet, not Base Sepolia, so local remains the cleaner full-path test for `$mfergpt` burn payments.

## Disposable Test Wallets

Generate local-only test wallets:

```sh
npm run wallets:create:test -- --count 3 --out .tmp/soft-launch-disposable-wallets.json
```

The output file is under `.tmp/`, which is ignored by git. Do not commit it. Do not fund these wallets with real assets.

Use the generated addresses for faucet claims. Import a generated private key only into a throwaway browser wallet profile.

## Faucet Notes

Base's current faucet documentation lists several Base Sepolia options, including Coinbase Developer Platform, thirdweb, Alchemy, Bware Labs, Chainstack, ethfaucet.com, QuickNode, LearnWeb3, and Ethereum Ecosystem faucets:

```txt
https://docs.base.org/base-chain/network-information/network-faucets
```

Base's RPC overview lists Base Sepolia as chain id `84532` with public RPC:

```txt
https://docs.base.org/base-chain/api-reference/rpc-overview
https://sepolia.base.org
```

Public RPCs and faucets are fine for rehearsal. They are not production reliability infrastructure.

## Recommended Path

1. Stay local for the full `$mfergpt` launch-pass burn test.
2. Use Base Sepolia only when we want a real wallet/network rehearsal.
3. Use disposable wallets for Base Sepolia.
4. Deploy mocks to Base Sepolia only if we specifically need public-testnet `$mfergpt` behavior.
5. Do not use Josh's real wallet keys for any dry run.

## Open Before Any Sepolia Deploy

- Decide whether the Sepolia pass accepts only ETH or also a mock `$mfergpt`.
- Decide the test treasury address from the disposable wallet file.
- Add a Sepolia address config file for the web app instead of reusing `local-contracts.json`.
- Run the same pass purchase smoke against the Sepolia config.

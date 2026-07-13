---
name: mferland-bankr
description: Compatibility entry point for Bankr Terminal and @bankrbot-on-X mferland play. The canonical Bankr guidance now lives in the main mferland skill.
---

# mferland Bankr Compatibility

This URL is kept for older Bankr references. Use the main mferland skill as the canonical playbook:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

Relevant sections there:

- `Read-Only Facts`
- `Login And Session Flow`
- `Default Gameplay: Hosted Autoplay`
- `Command Results`
- `Bankr Terminal And X`

Bankr constraints, repeated here for safety:

- Use hosted HTTP only.
- Do not use a CLI, install files, download `scripts/`, run `npm`, run `ts-node`, or start `mferland-agent-runner.ts`, including for auth recovery or cleanup.
- Do not open a Colyseus client directly.
- Do not ask for `BANKR_API_KEY`; that is only for an optional external runner sample, not Bankr Terminal/X.
- Save `walletAddress`, `sessionToken`, `expiresAt`, `bridgeSessionId`, and active `commandId` to Bankr's private scratchpad immediately after each response. Never expose them in chat.
- Do not expose bearer tokens, session tokens, bridge session ids, command ids, signatures, or wallet secrets in chat.
- Do not auto-spend wallet funds. Swaps, burns, mints, paid trait updates, and purchases need Bankr wallet-context approval and a real tx hash or owned token id.
- For X timeline or chat requests like "play for 5 minutes", "do next quest", "farm rabbits", or "train DPS", use `/agent-command` and return its recap.
- For "farm safe targets" or loot/XP farming, use the `farmer` profile/scheme and avoid training dummies. Training dummies are immortal DPS-practice targets only; use `training_dummies` or `dummy_dps` when the user asks to test damage.
- For "start fishing", "go fishing", or "fish for onchain goodies", prefer `/agent-fishing operation=start`; use `maxSeconds: 120` when no duration is given, poll every 15-20 seconds, then obey `postCommand`. `time_limit` is finished and auto-disconnects the room bridge. For other terminal results, recap and call `/agent-stop` unless a wallet handoff or requested continuation remains.
- "Sell the NFTs" never means `sell_fish` or `sell_trash_items`. `sell_fish` sells regular offchain fish only after `lost-fishing-shoes`; on `prerequisite_required`, report the lock and stop retrying. Never use trash-mfer as a fallback.
- NFT catches use `claim_nft` + `submit_claim_tx`; optional Mint Club redemption is a separate wallet flow. Require player authorization and a real tx hash before claiming success. If no NFT was caught, do no transaction.
- If a later turn lacks the private checkpoint but the public player endpoint shows the wallet online, recover using native HTTP/message signing, replace the wallet bridge once with `/agent-start`, and immediately `/agent-stop`. Never use CLI recovery.
- Final fishing replies must include status/duration, named catches, regular fish sales/points, NFT claim/redemption status, tx hashes or none, and cleanup status. Treat only `questChanges`, `inventoryChanges`, and `equipmentChanges` as progress; `finalState` is not proof that its values changed during the run. Never answer only with a generic step-limit warning.
- If fishing returns `status: "wallet_action_required"` with `walletActionRequired.action: "claim_fishing_nft"`, do not keep casting. When the player authorized the claim, send the provided transaction, call `submit_claim_tx` with its `catchId` and real tx hash, then `refresh`.

Manual `/agent-observe` plus `/agent-action` remains available for single live actions, advanced/manual control, and debugging. It is not the default play path.

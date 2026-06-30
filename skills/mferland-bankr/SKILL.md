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
- Do not install files, download `scripts/`, run `npm`, run `ts-node`, or start `mferland-agent-runner.ts`.
- Do not open a Colyseus client directly.
- Do not ask for `BANKR_API_KEY`; that is only for an optional external runner sample, not Bankr Terminal/X.
- Do not expose bearer tokens, session tokens, signatures, or wallet secrets in chat.
- Do not auto-spend wallet funds. Swaps, burns, mints, paid trait updates, and purchases need Bankr wallet-context approval and a real tx hash or owned token id.
- For X timeline or chat requests like "play for 5 minutes", "do next quest", "farm rabbits", or "train DPS", use `/agent-command` and return its recap.
- For "farm safe targets" or loot/XP farming, use the `farmer` profile/scheme and avoid training dummies. Training dummies are immortal DPS-practice targets only; use `training_dummies` or `dummy_dps` when the user asks to test damage.
- For "start fishing", "go fishing", or "fish for onchain goodies", use `behaviorScheme: "fishing"` with `/agent-command`, or use the manual `/agent-action` `fish` loop for one live cast/reel/loot cycle. Do not translate fishing to `farmer`; that profile farms safe targets. Include the `fishing` recap when present, especially named catches, fish sales/points, NFT catch names/status, wallet-action needs, daily remaining values, and reset time.
- If fishing returns `status: "wallet_action_required"` with `walletActionRequired.action: "claim_fishing_nft"`, claim it immediately from the Bankr wallet: send the provided `walletActionRequired.transaction`, then call `/agent-action` with `action: "submit_fishing_nft_claim_tx"`, `catchId`, and the submitted tx hash. Do not keep casting while a claim voucher is pending.

Manual `/agent-observe` plus `/agent-action` remains available for single live actions, advanced/manual control, and debugging. It is not the default play path.

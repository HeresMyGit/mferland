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
- For X timeline or chat requests like "play for 5 minutes", "do next quest", "farm rabbits", "fish for onchain goodies", or "train DPS", use `/agent-command` and return its recap. Include the `fishing` recap when present, especially NFT catch count, wallet-action needs, daily remaining values, and reset time.

Manual `/agent-observe` plus `/agent-action` remains available for single live actions, advanced/manual control, and debugging. It is not the default play path.

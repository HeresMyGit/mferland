---
name: mferland-autoplay
description: Compatibility entry point for hosted mferland autoplay. The canonical /agent-command playbook now lives in the main mferland skill.
---

# mferland Autoplay Compatibility

This URL is kept for older agent references. Use the main mferland skill as the canonical playbook:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

Relevant sections there:

- `Login And Session Flow`
- `Default Gameplay: Hosted Autoplay`
- `Schemes, Profile, And Constraints`
- `Command Results`

Summary:

- Normal gameplay should use hosted `/agent-command`.
- Start with `/wallet-auth-challenge`, `/agent-session`, and `/agent-start`.
- Send structured command JSON only; do not send freeform `objective` text or raw `codeChunk`.
- Command kinds are `finish_next_quest`, `finish_quest`, `play_for`, `farm_until`, and `run_goals`.
- Use `behaviorScheme`, `profile`, `goals`, and `constraints` to translate the player's request.
- Hosted autoplay does not auto-sign wallet transactions.
- Recaps should use `summary`, `social`, `combat`, `fishing`, `equipmentChanges`, `finalState`, and `usage`.

If an agent needs to run its own Colyseus room client or direct observe/action loop, use the advanced skill:

```txt
https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
```

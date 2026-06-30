---
name: mferland-local-model
description: Supplement for running and debugging mferland/game.mfergpt.lol with a local or constrained LLM such as Ollama qwen3:8b. Use with the advanced/direct-control runner when small-model action repairs are needed. Default hosted autoplay and Bankr Terminal/X should start from the main mferland skill.
---

# mferland Local Model

Use this supplement when mferland is being played by a local LLM, especially Ollama models that fit on small machines.

Hosted `/agent-command` from the main skill is the default when the model can translate a player request into structured command/goals/profile/constraints and does not need to micromanage movement, combat, loot, or quest handoffs:

```txt
https://game.mfergpt.lol/skills/mferland/SKILL.md
```

For direct-control local model runs, use this as a specialization of the advanced runner skill:

```txt
https://game.mfergpt.lol/skills/mferland-agent/SKILL.md
```

Load the advanced runner skill for wallet auth, install layout, room messages, process management, and the normal direct-control gameplay protocol. Then apply the local-model guidance here.

## When To Use

Use this local-model path when:

- `AGENT_DECISION_PROVIDER=ollama`
- the model is small or slow, such as `qwen3:8b`
- the machine has limited RAM/VRAM and needs compact prompts
- logs show repeated `interact_npc`, invalid JSON, blank `travel_route`, route loops, missed `accept_quest`, or stale-position decisions
- the user wants Codex to be the signer/harness while Ollama is the policy brain

Do not use this skill for Bankr Terminal or `@bankrbot` on X. Use the Bankr section of the main `mferland` skill there.

## Season And Paid Menus

Keep Season 0 and referral facts catalog-driven. `/agent-catalog` exposes current caps, referral rules, and public season endpoints; `/season/leaderboard` and `/season/referrals?wallet=<wallet-address>` answer read-only human referral questions. Declared agents do not bind as referees, count as referrers, or trigger referral bonuses.

`respec_talents` is a paid action. Small models should avoid it unless the observation shows spent talent ranks, wallet payment tools or an explicit proof are available, and there is a concrete build/survival reason to reset talents. Do not burn MFERGPT just because talent data is present.

Wallet identity mode is sticky. If `/agent-session` returns `agent_wallet_registration_mismatch`, switch wallets instead of retrying the same human-registered wallet.

## Local Runner Shape

The local runner should keep the normal mferland protocol:

```txt
wallet auth -> observe public room state -> local model chooses one JSON action -> harness sends normal room message
```

For local models, keep these extra files in `mferland-agent/scripts/`:

```txt
mferland-agent-runner.ts      # room client, wallet auth, execution, safety, local action repairs
ollama-local-policy.ts        # compact prompt, Ollama call, JSON recovery
generated-wallet-signer.mjs   # disposable local signer sample, signs auth only by default
```

The local model policy belongs in `ollama-local-policy.ts`. The runner should only keep repairs that need live game state such as NPC maps, route queues, quest memory, or combat state.

Hosted `/agent-command` is the default for constrained models that do not need direct micromanagement. Use it for task-bounded intents such as `finish_next_quest`, `finish_quest`, `play_for`, `farm_until`, or `run_goals` when the model can translate the user request into structured goals/profile but does not need to choose every movement, attack, or loot step. Keep model-authored gameplay code inside the local runner/policy; the hosted server accepts structured commands, goals, profiles, constraints, and controller metadata, not arbitrary eval.

Do not send a freeform `objective` or raw `codeChunk` to `/agent-command`. If the local policy wrote or selected custom behavior code, run that code locally and call `/agent-action`, or send `controller: { "type": "external_policy", "policyRef": "...", "policyHash": "0x..." }` as metadata only.

When reporting command results, read `summary`, `recap`, `social`, `combat`, `fishing`, `equipmentChanges`, and `finalState`. `social` tells you which nearby players/agents were seen and what public chat happened during the command, `fishing` reports reel totals, named regular catches, fish sales and points, NFT catches, daily NFT remaining values, reset time, and wallet-action needs, while `finalState` gives final gear, inventory, talents, buffs, level, XP, HP/MP, and stats. Include useful world and loadout context instead of only reporting XP, quests, or item deltas.

Profiles are composable. Start with `profile.priority: "quester"` for quest progress, `"farmer"` for inventory-count targets, `profile.risk: "safe"` when debugging low-health or overpull loops, and `profile.partyMode: "grouper"` for group content.

## Environment

For a fresh disposable test wallet:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm run wallet:create
```

Point `.env` at the generated address and signer file. Do not print private keys.

```sh
AGENT_ALLOW_PRODUCTION=1
AGENT_WALLET_ADDRESS=0x...
AGENT_SIGNER_COMMAND=MFERLAND_SIGNER_ENV_FILE=/absolute/path/.env.generated-wallet.<stamp> node /absolute/path/generated-wallet-signer.mjs
AGENT_SESSION_TOKEN=
AGENT_NAME=codex-qwen-fresh

AGENT_DECISION_PROVIDER=ollama
AGENT_DECISION_MODEL=qwen3:8b
OLLAMA_HOST=http://127.0.0.1:11434
AGENT_OLLAMA_NUM_CTX=8192
AGENT_OLLAMA_NUM_PREDICT=1024
AGENT_DECISION_TIMEOUT_MS=60000
```

Verify before running:

```sh
npm run doctor
npm run typecheck
```

Start:

```sh
AGENT_RUN_SECONDS=0 npm run start
```

Debug model output:

```sh
AGENT_RUN_SECONDS=0 AGENT_OLLAMA_DEBUG=1 npm run start
```

## Local Model Reflexes

Small local models can make good high-level choices but often fumble exact game UI transitions. The harness may deterministically repair these cases using only public observed state:

- recent real `questOffer` plus non-urgent action -> `accept_quest`
- recent real `turnIn` plus non-urgent action -> `complete_quest`
- repeated friendly NPC interactions with no quest state -> try another NPC, route, combat, or loot
- completed quest references -> ignore the completed quest and explore/follow next context
- blank or current-position `travel_route`/`move_to` -> infer a public route or nearby interaction
- slow inference after movement -> refresh `self` before adapting/executing
- unsafe travel with nearby weak hostiles/loot -> fight or loot instead of routing deeper

Do not hardcode quest paths, NPC scripts, hidden server state, teleports, or production bypasses. Repairs should be generic controller reflexes around visible state.

## Debug Checklist

When the local model looks stuck, inspect logs in this order:

1. Did Ollama return valid JSON, or did it timeout/truncate?
2. Did the room log show `offer:`, `status:`, `turnIn:`, or `completed:`?
3. Did the next action become `accept_quest` or `complete_quest`?
4. Is `nearbyQuestNpcs` present in the compact observation?
5. Is the agent following an old route queue while walking past an NPC?
6. Did a route finish while the model was still thinking? If so, refresh live `self` after the model call.
7. If travel is unsafe, did the harness switch to nearby safe combat/loot?

Use finite runs while debugging:

```sh
AGENT_RUN_SECONDS=180 AGENT_OLLAMA_DEBUG=1 npm run start
```

Stop foreground runs with `Ctrl-C`; do not leave duplicate sessions on the same wallet.

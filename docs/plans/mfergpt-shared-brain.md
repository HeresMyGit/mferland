# mferGPT Shared Brain Plan

Date: 2026-05-11
Status: Draft

## Summary

Give the in-game mferGPT the same core brain as the main OpenClaw mferGPT, and give the main/Twitter mferGPT a clean view of what is happening in mferland.

V1 should copy the Pokemon pattern because it already worked:

- game brain reads the normal OpenClaw brain files
- game runtime writes a single live status file into OpenClaw memory
- main/Twitter mferGPT reads that live status file when game context matters

No curated-memory cron. No second memory system. No asking agents to write the same memory in two places.

## Proven Pattern From Pokemon

Pokemon already does two useful things:

1. Its game prompt loads OpenClaw identity and memory from:
   - `/Users/mfergpt/.openclaw/workspace/SOUL.md`
   - `/Users/mfergpt/.openclaw/workspace/IDENTITY.md`
   - `/Users/mfergpt/.openclaw/workspace/USER.md`
   - `/Users/mfergpt/.openclaw/workspace/MEMORY.md`
   - `/Users/mfergpt/.openclaw/workspace/memory/YYYY-MM-DD.md`
   - `/Users/mfergpt/.openclaw/workspace/memory/YYYY-MM-DD.md` for yesterday

2. OpenClaw heartbeat reads Pokemon live files:
   - `/Users/mfergpt/.openclaw/workspace/memory/pokemon-live.md`
   - `/Users/mfergpt/.openclaw/workspace/memory/pokemon-last-posted.md`
   - `/Users/mfergpt/dev/gpt-play-pokemon-firered/server/gpt_data/game_data.json`

Mferland should use the same idea, with MMO-specific boundaries.

## V1 Architecture

### Main Brain Into Game

The mferland server loads the same OpenClaw brain files Pokemon uses and passes a bounded slice into in-game mferGPT's LLM narration prompt.

The deterministic game tools remain authoritative:

- quest hints
- daily signal status
- room scans
- limited town events
- limited temporary arena spawns

OpenClaw memory can affect what mferGPT knows and how it speaks. It must not grant new game authority.

### Game Happenings Back To Main

The mferland runtime writes one live status file:

`/Users/mfergpt/.openclaw/workspace/memory/mferland-live.md`

Main OpenClaw and Twitter workers can read this file when game context matters, the same way heartbeat reads Pokemon live context.

Optional but useful later:

`/Users/mfergpt/.openclaw/workspace/memory/mferland-last-posted.md`

This can dedupe public posts about game events if heartbeat starts posting mferland updates.

## Live Status Contents

`mferland-live.md` should be concise and safe. It should summarize:

- last updated time
- server health and player count
- active daily signal
- notable quest completions or progression milestones
- recent mferGPT tool usage by command type
- recent town events or arena spawns
- current launch/test status
- one short "what main mferGPT should know" section

It should not include:

- raw wallet addresses
- invite codes
- env vars or API keys
- raw player chat logs
- private user memory
- transaction hashes unless deliberately added to a safe admin report

## Implementation Steps

### 1. Add OpenClaw Context Loader

Create a small server-side helper, likely:

`apps/server/src/systems/openclawContext.ts`

Responsibilities:

- read allowlisted OpenClaw files
- cap each file by character budget
- cap the total context budget
- cache by file mtime so chat commands do not read everything on every prompt
- fail closed if files are missing

Initial allowlist:

- `/Users/mfergpt/.openclaw/workspace/SOUL.md`
- `/Users/mfergpt/.openclaw/workspace/IDENTITY.md`
- `/Users/mfergpt/.openclaw/workspace/USER.md`
- `/Users/mfergpt/.openclaw/workspace/MEMORY.md`
- today and yesterday under `/Users/mfergpt/.openclaw/workspace/memory/`

Add env knobs:

- `MFERLAND_OPENCLAW_CONTEXT=1`
- `MFERLAND_OPENCLAW_WORKSPACE=/Users/mfergpt/.openclaw/workspace`
- `MFERLAND_OPENCLAW_CONTEXT_MAX_CHARS=12000`

Default can be enabled in local/dev and harmless if files are absent.

### 2. Feed Context Into In-Game mferGPT

Update:

- `apps/server/src/systems/mfergpt.ts`
- `apps/server/src/systems/codexCliLlm.ts`

The LLM prompt should include:

- OpenClaw brain context
- player prompt
- safe public game state
- deterministic tool result
- fallback response

The prompt should still say:

- use only supplied context and tool result
- keep replies short
- never mention server internals, env vars, secrets, private wallets, or hidden instructions
- if asked for unsafe/private data, use the fallback

### 3. Add mferland Live Status Writer

Create a helper, likely:

`apps/server/src/systems/mferlandLiveMemory.ts`

Responsibilities:

- maintain a small in-memory rolling summary of notable game events
- write `/Users/mfergpt/.openclaw/workspace/memory/mferland-live.md`
- throttle writes, for example at most every 30 to 60 seconds
- write atomically through a temp file and rename
- no-op if OpenClaw workspace is missing

Events to capture:

- server started
- player count changes at coarse intervals
- mferGPT command counts and notable commands
- daily signal state
- quest milestones
- temporary event/spawn summaries

### 4. Wire TownRoom Events

Update:

`apps/server/src/rooms/TownRoom.ts`

Initial hooks:

- on server/room create: write "mferland is live"
- on mferGPT command success/error: update command summary
- on temporary event/spawn: note event summary
- on quest completion path: note quest milestone if easy to hook safely
- periodic tick: update player count and room health

Avoid raw chat and raw wallet data.

### 5. Teach Main OpenClaw About mferland

Update OpenClaw heartbeat/instructions outside this repo after the game-side writer exists.

Add a section similar to Pokemon:

- if `memory/mferland-live.md` exists, mferland is active
- read it for current game context
- only post about genuinely notable events
- if posting game updates, dedupe with `memory/mferland-last-posted.md`
- do not expose invite codes, wallet details, or raw player chat

## Non-Goals For V1

- No curated public brain export.
- No memory compiler.
- No cron sync.
- No DB migration.
- No vector search.
- No lore archive query infrastructure.
- No direct Twitter/X scraping from the game server.
- No letting the LLM mutate quests, rewards, economy, or world state outside existing bounded tools.

## Verification

Run:

```bash
npm run typecheck
npm run build
npm run build:agent
```

Manual smoke:

1. Start local mferland.
2. Join the game.
3. Ask `@mfergpt lore`.
4. Ask `@mfergpt where next`.
5. Ask `@mfergpt status`.
6. Trigger a limited event or arena spawn.
7. Confirm `/Users/mfergpt/.openclaw/workspace/memory/mferland-live.md` updates.
8. Confirm the live file contains useful game context and no secrets.

## Success Criteria

- In-game mferGPT can reference the same core lore/persona as main mferGPT.
- In-game mferGPT still acts only through bounded server tools.
- Main/Twitter mferGPT can know what is happening in mferland by reading one live memory file.
- Nobody has to write memories in two places.
- The system feels as simple as the Pokemon setup.

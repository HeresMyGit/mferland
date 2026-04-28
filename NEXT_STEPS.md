# Next Steps

## Current DB State

- Wallet character persistence code is checked in.
- Commit: `eebf71c Add wallet character persistence foundation`
- Local `.env` exists and points `DATABASE_URL` at the Neon test branch.
- `.env` and `.env.*` are ignored by git. Do not commit real connection strings, API keys, tokens, or wallet/private keys.
- `.env.example` contains placeholders only.

## Neon Test Branch

- Project ID: `odd-scene-22957189`
- Database: `neondb`
- Temporary test branch ID: `br-floral-shape-a46wjdc8`
- Temporary test branch name: `mcp-migration-2026-04-28T04-34-32`
- Migration ID: `8707261c-c914-47c4-a67e-bd6c77b6f021`

This branch has the character/account schema and is safe for temporary testing. Neon main has not been migrated yet.

## How To Test Locally

1. Start the app with `npm run dev`.
2. Open `http://localhost:5173`.
3. Enter with wallet, not guest.
4. Accept a quest, loot an item, or otherwise change character state.
5. Leave/refresh/re-enter with the same wallet.
6. Confirm quest/inventory/character state persists.

Guest mode does not persist yet.

## When Ready To Keep DB Work

1. Re-check for secrets before committing or pushing:
   `git grep -n -E "postgresql://|postgres://|API_KEY|SECRET|PRIVATE_KEY|TOKEN|npg_" -- . ':!package-lock.json'`
2. Apply the verified Neon migration to main.
3. Replace local/deploy `DATABASE_URL` with the Neon main branch connection string in secret/env settings only.
4. Keep `.env` local-only.

## Later DB/Auth Work

- Add Privy auth and map Privy users to `accounts.privy_user_id`.
- Decide final character progression tables for XP, talent trees, and gear.
- Keep rare/onchain items separate later; current character/account/quest/inventory state is regular DB.
- Add admin/debug tooling for looking up a wallet character without exposing secrets.

## Next Build Plan From Manual Playtest

Work in this order after the level 8 playtest. Keep the current milestone stable before expanding again.

### 1. Stabilize Current Milestone

- Fix the Colyseus schema buffer warning before committing. The warning means the encoded room-state patch can exceed Colyseus' default schema encoder buffer after the expanded player/NPC/quest/inventory state, which risks failed or incomplete state syncs as the room grows.
- Re-run `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Restart the local dev server and confirm the buffer warning no longer appears during normal play.
- Re-test wallet persistence after a fresh restart before applying the Neon migration to main.

### 2. Level 8-10 Capstone World Expansion

- Add the next hub and quest chain in the upper-right corner of the world so it balances the current lower-left hub.
- Re-center Mfer Town in the map composition and expand the grass/terrain several sections so the lower-left hub no longer spills off the playable-looking grass.
- Add a clear route from town to the upper-right hub, with enough landmarks and minimap support to make the path legible.
- Include a named enemy or small capstone encounter that carries players toward level 10.

### 3. Quest And Drop Based Gear

- Do not grant gear solely based on player level.
- Give meaningful gear through quest rewards.
- Add rare mob drop chances for normal gear so combat loops have a chase reward.
- Keep future rare/onchain item behavior separate from normal quest/drop gear.

### 4. Combat Feel

- Improve hit feedback, enemy tells, cooldown clarity, death/respawn polish, and combat readability.
- Add a small number of differentiated enemy behaviors before adding many more enemies.

### 5. mferGPT Codex Auth

- Wire mferGPT LLM calls through local Codex auth on the machine running the instance, using the logged-in Codex subscription instead of an API key.
- Keep the existing allowlist, cooldowns, logging, and safe-state restrictions around mferGPT tools.

### 6. Consumables

- Add food/potions after combat pressure and gear rewards are more meaningful.

## Hourly Agent Backlog

Work top-to-bottom. Keep changes small, shippable, and verified with `npm run typecheck`; use `npm run build` when touching shared/server/web contracts or UI.

### 1. Revamp Quest Giver UI - Finished 2026-04-28

- Replace quest offer/turn-in flow that relies on chat with a dedicated quest dialogue panel.
- Show NPC name, NPC response/story text, task/objective, reward preview, and Accept/Deny actions.
- Add a matching quest turn-in panel with completion response, completed task summary, reward preview, and Complete/Close actions.
- Keep chat only for special flavor lines, world chatter, and non-quest NPC interaction.
- Server should send structured quest offer and quest turn-in payloads instead of only chat text.
- Acceptance criteria: accepting and completing a quest can be understood entirely from UI with no chat dependency.

### 2. Character Progression - Finished 2026-04-28

- Add level cap 10.
- Add XP rewards from quests.
- Add XP rewards from mob defeats.
- Add radius-based mob XP and quest credit for nearby eligible players; no parties yet.
- Define XP curve for levels 1-10 in shared config.
- Persist level, XP, and talent points.
- Acceptance criteria: a guest or wallet player can kill mobs/complete quests, gain XP, level up, and see updated level/XP in UI.

### 3. Talent System - Finished 2026-04-28

- Add three trees: Brawler, Caster, Utility.
- Award talent points from levels.
- Add a talent UI on the character screen or adjacent panel.
- Persist selected talents in `character_talents`.
- Enforce rank limits and prerequisites server-side.
- Wire first-pass effects into existing stats/combat:
  - Brawler: melee damage, HP, melee cooldown.
  - Caster: MP, spell damage, mana regen.
  - Utility: movement, questing/QoL, regen.
- Acceptance criteria: selected talents persist across wallet reconnects and affect gameplay-visible stats or combat.

### 4. Equipment And Inventory Foundation - Finished 2026-04-28

- Finish equipment slots as DB-backed regular items.
- Add normal item definitions with stable ids, quality, slot, stat modifiers, stackability, and optional sell/value fields.
- Add `chain_token_id` support for rare onchain items later without making current starter gear onchain.
- Add item compare affordance in inventory/equipment UI.
- Add basic equip validation server-side for slot compatibility and ownership.
- Acceptance criteria: wallet character inventory/equipment persists through DB and can represent future onchain rare items.

### 5. First World Expansion - Finished 2026-04-28

- Move the farm farther out from the starter plaza.
- Add another small hub with NPCs, map/minimap support, and a clear travel route.
- Add dailies and repeatable mob-loop quests.
- Add spawn density and leash tuning for the expanded farm route.
- Acceptance criteria: the world has starter plaza -> travel route -> farm/combat area -> second hub flow.

### 6. Agent NPC: mferGPT - Finished 2026-04-28

- Move `mferGPT.glb` from repo root into the proper web public asset path.
- Add a visible mferGPT NPC using that model.
- Add `@mfergpt` chat/addressing support to route messages to the agent.
- Use Codex auth based LLM calls for responses.
- Give mferGPT special server tools in a controlled allowlist:
  - Spawn temporary bad guys near an arena/test area.
  - Offer hints for current quests.
  - Trigger limited town events.
  - Inspect safe public game state, never secrets/env.
- Add rate limiting and logging around agent commands.
- Acceptance criteria: players can address `@mfergpt`, receive an in-world response, and trigger at least one safe special action.

### 7. Deferred Until Core Loop Feels Good

- Consumables are not next; defer HP/MP food/potions until progression and quest UI feel good.
- Deep itemization, loot tables, sets, materials, and crafting are later polish.
- Rare/onchain item behavior is later; only add schema support now.

## Automation Verification Notes

### 2026-04-28 09:09 PDT - Stabilization Pass

- Added the manual playtest feedback as the next build plan: stabilize first, then upper-right level 8-10 expansion, quest/drop-based gear, combat feel, mferGPT Codex auth, and consumables later.
- Increased the Colyseus schema encoder buffer to prevent the expanded room state from overflowing the default 8 KB encoder buffer during sync.
- Verified with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Confirmed the dev server restarted cleanly and a guest browser smoke test connected/rendered without browser console errors or new schema buffer warnings.
- Still pending before Neon main migration: manual wallet persistence retest after a fresh app/server restart.

### 2026-04-28 06:04 PDT - Finished

- Confirmed Hourly Agent Backlog items 1-6 are already marked finished; item 7 remains explicitly deferred.
- Verified the current tree with `npm run typecheck` and `npm run build`.
- Attempted local dev playtest, but this sandbox blocks listening sockets for the server/Vite dev stack (`EPERM` on `127.0.0.1`/`0.0.0.0`).
- Attempted Codex browser playtest, but the in-app browser backend was not discovered in this session.
- Next manual playtest focus: wallet persistence after quest/inventory/equipment/XP/talent changes, quest panel turn-in flow, expanded plaza-to-farm-to-field-camp route, and `@mfergpt` hint/spawn cooldown behavior.

### 2026-04-28 07:04 PDT - Finished

- Confirmed with a spawned verifier agent that Hourly Agent Backlog items 1-6 remain finished and item 7 is still intentionally deferred.
- Verified the current tree with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Attempted local dev playtest with `npm run dev`, but this sandbox still blocks the server `tsx` IPC pipe and Vite's `0.0.0.0:5173` listener with `EPERM`.
- Attempted Codex browser playtest, but the in-app browser backend was not discovered in this session.
- Attempted a static-file Playwright smoke test of `apps/web/dist/index.html`, but Chromium launch is also blocked by macOS sandbox permissions.
- Next manual playtest focus remains wallet persistence, quest offer/turn-in panels, plaza-to-farm-to-field-camp route, progression/talent/equipment behavior, and `@mfergpt` command/cooldown behavior.

### 2026-04-28 08:04 PDT - Finished

- Confirmed with a spawned verifier agent that Hourly Agent Backlog items 1-6 remain finished and item 7 is still intentionally deferred.
- Verified the current tree with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Attempted local dev playtest with `npm run dev`, but this sandbox still blocks the server `tsx` IPC pipe and Vite's `0.0.0.0:5173` listener with `EPERM`.
- Attempted Codex browser playtest through the required IAB runtime, but no Codex IAB browser backend was discovered in this session.
- Next manual playtest focus remains wallet reconnect persistence, quest offer/turn-in panel clarity, plaza-to-farm-to-field-camp traversal, progression/talent/equipment behavior, and `@mfergpt` hint/spawn/cooldown behavior.

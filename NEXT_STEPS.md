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
- Done 2026-04-28: Reduce the quest log HUD footprint by collapsing the idle/no-active-quest tracker into a compact panel while keeping the full quest log button.
- Done 2026-04-28: Fix right-side HUD button alignment so icon and label content stays centered and unclipped on Character, Inventory, Quests, and Leave buttons, including narrow/mobile viewports.
- Done 2026-04-28: Quick-fix ranged quest/XP credit by tracking recent player damage tags on mobs, so tagged players share kill quest credit and XP even if they are outside the old death-radius check.
- Re-run `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Restart the local dev server and confirm the buffer warning no longer appears during normal play.
- Re-test wallet persistence after a fresh restart before applying the Neon migration to main.

### 2. Level 8-10 Capstone World Expansion

- Add the next hub and quest chain in the upper-right corner of the world so it balances the current lower-left hub.
- Done 2026-04-28: Quality pass the upper-right quest hub layout by moving Signal Ridge friendlies into a safe pocket and pushing raiders/bosses into a separate eastern static field.
- Done 2026-04-28: Re-center the town-to-field composition by shifting the Busted Farm east toward town, keeping Field Camp as the later hub, and expanding the ground margin around the playable area.
- Done 2026-04-28: Reposition the farm so it sits more between main town and the bottom-left hub instead of almost on top of Field Camp.
- Done 2026-04-28: Move the Hogwatcher questgiver closer to the repositioned farm approach.
- Done 2026-04-28: Add a clear route from town to the upper-right hub, with enough landmarks and minimap support to make the path legible.
- Done 2026-04-28: Include a large named mfer boss for the questline finale that should take at least 3 players.
- Done 2026-04-28: After players complete the finale, unlock a daily raid-spawn quest that calls a huge mfer ogre raid boss intended for 10+ players.

### 3. Quest And Drop Based Gear

- Do not grant gear solely based on player level.
- Give meaningful gear through quest rewards.
- Add rare mob drop chances for normal gear so combat loops have a chase reward.
- Keep future rare/onchain item behavior separate from normal quest/drop gear.

### 4. Combat Feel

- Improve hit feedback, enemy tells, cooldown clarity, death/respawn polish, and combat readability.
- Done 2026-04-28: Status bar pass: health is red, mana is blue, and XP is purple.
- Done 2026-04-28: Show a health bar on the character name tag; future settings toggle to hide/show it remains deferred.
- Done 2026-04-28: Add purple floating XP text such as `34 XP` when a mob dies and awards XP.
- Add a small number of differentiated enemy behaviors before adding many more enemies.
- Plan and implement party aggro/threat management: define how much threat each ability generates, track per-player threat on mobs, and allow mobs to switch targets based on threat like an MMO tank/DPS/healer loop.
- Plan newer role skills around the threat system:
  - Add a heal spell.
  - Add a taunt spell that forces the enemy to attack the taunter for about 3 seconds.
  - Consider a weaker attack that generates more aggro than the normal attack for tank-style play.
- Before implementing the new skills, write a small ability/threat plan so spell damage, healing threat, taunt behavior, cooldowns, and mob target switching rules fit together.

### 5. mferGPT Codex Auth

- Wire mferGPT LLM calls through local Codex auth on the machine running the instance, using the logged-in Codex subscription instead of an API key.
- Keep the existing allowlist, cooldowns, logging, and safe-state restrictions around mferGPT tools.

### 6. Consumables

- Add food/potions after combat pressure and gear rewards are more meaningful.

### 7. Later Redesign

Do this after the engine/system work is stable.

- Redesign the Character screen (`C`) with a better equipment UI.
- Break talent trees out into their own dedicated UI instead of keeping them inside the character screen.
- Separate inventory from character/equipment management so each screen has a clearer job.
- Add a spellbook/abilities menu so users can view and change their active abilities.

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

### 2026-04-28 09:32 PDT - Upper-Right Expansion Pass

- Added Signal Ridge as the upper-right hub with new terrain bounds, roads, minimap/world-map support, buildings, stalls, trees, banners, and a relay landmark.
- Added the level 8-10 quest continuation: Field Camp dispatch -> Signal Ridge scraps -> raider crew -> Static Baron Nox.
- Made Static Baron Nox a large mfer boss intended for 3+ players, with higher health, larger rendered scale, and adjusted attack/collision ranges.
- Added post-finale daily raid quest support: completing Static Baron Nox unlocks a repeatable daily that spawns Huge mfer ogre, a much larger mfer boss intended for 10+ players.
- Added quest reward gear and rare drop gear without level-gating: Field-Patched Hoodie, Ridge Runner Beanie, Baron Breaker Board, and Static Loop Ring.
- Reworked starter quests into a short town-intro chain instead of same-NPC instant turn-ins: OG -> DAO -> Fountain -> OG, then Sealed Note opens.
- Verified with `npm run typecheck`, `npm run build`, `npm run build:agent`, a quest-chain ID/reward sanity script, and a browser smoke test.
- Needs manual playtest: route readability to Signal Ridge, boss health/damage tuning for actual player counts, and the daily raid spawn loop after completing the finale.

### 2026-04-28 09:55 PDT - Stabilization Follow-Up

- Collapsed the no-active-quest HUD tracker into a compact `Quests` panel with the quest log button still available.
- Added server-side mob damage tags so players who recently damage a mob can receive quest/XP credit at death even when ranged attacks leave them outside the nearby-credit radius.
- Verified with `npm run typecheck`, `npm run build`, `npm run build:agent`, a direct server-side ranged-credit simulation, and an in-app browser HUD smoke test.

### 2026-04-28 10:04 PDT - Signal Ridge Safety Pass

- Split Signal Ridge into a safer north-side NPC pocket and a separate eastern Static Field combat pocket.
- Moved Ridge Guide, Beacon Keeper, Ridge merchant, and ridge stalls away from hostile aggro routes.
- Moved Raider Vex, Raider Pax, Static mage Ori, roaming raiders, Static Baron Nox, and the daily Huge mfer ogre spawn into the Static Field/relay combat area.
- Added Static Field to shared world roads/map data and added red boundary banners at the transition from safe hub to hostile field.

### 2026-04-28 10:06 PDT - HUD Dock Alignment

- Centered the right-side dock button icon/label stack with explicit grid rows and tighter label sizing.
- Increased narrow/mobile dock button width enough to avoid clipping `Character` and `Inventory`.

### 2026-04-28 10:12 PDT - Farm Composition Pass

- Shifted Busted Farm east toward town while keeping Field Camp in the lower-left as the later hub, and expanded the ground plane margin around the full playable area.
- Moved hogs and farmhand enemies with the farm so combat remains centered on the farmyard.
- Moved Hogwatcher to the new farm approach, closer to the relevant quest area.
- Updated shared road/hub/map data, farm collision solids, farm visuals, road edge decals, and ground smudges for the new farm position.

### 2026-04-28 10:23 PDT - Signal Ridge Route Pass

- Added an east-side dirt connector from town to the existing Ridge Fork path.
- Added shared ridge route landmarks so both the minimap and world map show the route breadcrumbs.
- Added visible 3D RIDGE/MILE/TURN/SIGNAL marker posts along the road to Signal Ridge.
- Updated the Signal Ridge dispatch quest copy and mferGPT hint text to point players toward the cyan ridge markers.

### 2026-04-28 10:35 PDT - XP Feedback Pass

- Added per-player XP award events sent only to the credited client after mob defeat.
- Rendered purple floating `{amount} XP` text from the awarded amount, so different players can see different numbers if XP is capped, split, or modified per player.
- Kept XP feedback out of the replicated room schema to avoid increasing baseline sync payload size.

### 2026-04-28 10:42 PDT - Combat Readability Pass

- Changed the HUD XP bar from yellow to purple so health, mana, and XP have distinct red/blue/purple reads.
- Added compact red health strips to actor nameplates for players, attackable mfer NPCs, mferGPT variants that are not immortal, and creature NPCs.

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

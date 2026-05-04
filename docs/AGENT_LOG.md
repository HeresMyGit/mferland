# Agent Log

Completed work and verification history lives here so [../NEXT_STEPS.md](../NEXT_STEPS.md) can stay focused on open work.

### 2026-05-04 13:52 PDT - Soft Launch Paid Surface

- Selected the first paid soft-launch surface as a Season 0 launch pass instead of combat gear, keeping the respected-tester purchase path separate from early power progression.
- Added `MferLaunchPass`, a capped ERC-721-ish pass contract with exact ETH payment to treasury, exact `$mfergpt` burn payment, supply-cap enforcement, and owner-controlled price/treasury setters.
- Updated the local deployment/export path so `MferLaunchPass` is deployed with the crypto suite and exported as `launchPass` for app-facing local config.
- Verified with `npm run chain:test`, covering the new contract behavior and the local address export tests.
- Verified the updated deploy/export path with `npm run crypto:test:local`, including the local browser merchant smoke after the pass contract was added to the suite.

### 2026-05-04 13:58 PDT - Purchase Reconciliation Tooling

- Added `crypto_purchase_events` as the support ledger for launch-pass purchases, manual grants, rejects, and revocations.
- Extended `npm run support:admin` with purchase summary, list, export, chain receipt record, manual grant, revoke, and status update commands.
- Applied `0006_crypto_purchase_events.sql` to the configured local/test database.
- Smoke-tested manual grant, chain purchase record, summary, list, export, and wallet revoke against a disposable wallet, then removed the smoke rows from the test database.

### 2026-05-04 14:09 PDT - Local Launch Gate Pass

- Re-ran the standard repo gates after the launch-pass and purchase-ledger work: `npm run typecheck`, `npm run build`, `npm run build:agent`, `npm run crypto:test:local`, `git diff --check`, and the secret scan.
- Ran a direct wallet persistence and Season 0 abuse smoke against the configured local/test database: create wallet character, persist quest/inventory/equipment/talent state, reload by wallet, and fire two concurrent `mfer-beginnings` reward awards; exactly one award and one duplicate were recorded, then the synthetic account was deleted.
- Started the local dev stack and ran a Playwright desktop/mobile smoke: enter game, move, open/close Character, stash, and errand log panels, debug travel to Farm, trigger target/attack input, confirm no browser console errors, and verify the mobile touch stick renders and enters active state.
- Stopped the local dev stack after the smoke. Production DB cutover and production pass deployment remain unresolved external launch gates.
- Drafted [soft-launch-tester-brief.md](soft-launch-tester-brief.md) with invite criteria, tester tasks, reward rules, known limits, feedback asks, and internal support commands.

## Completed Build Plan Items

### Stabilization

- Done 2026-04-28: Split combat event construction/projectile timing into `combatEvents.ts` so combat state rules are separated from network visual-event payloads.
- Done 2026-04-28: Increased the Colyseus schema encoder buffer to 512 KB and confirmed normal guest entry no longer logs the buffer warning after a fresh dev-server restart.
- Done 2026-04-28: Reduced first-click/first-target stalls by limiting actor raycasting to invisible hit cylinders, precomputing their bounds, clearing chat focus on canvas pointer down, and resetting movement input when the browser loses focus.
- Candidate fix 2026-04-28: Reduced the remaining movement-time hitch by moving map exploration/fog state updates off the normal running path unless the world map is open, and by lowering HUD cooldown/clock tick churn.
- Reverted 2026-04-28: Do not pin Mixamo hips/root Y motion globally; it made jump feel too low and did not solve the recurring hitch.
- Candidate fix 2026-04-28: Reduced idle HUD timer churn by making the HUD timer sleep until the next clock minute unless a cast/cooldown is active.
- Candidate fix 2026-04-28: Stopped room position/yaw-only patches from forcing React renders; actors now consume movement/animation changes in-frame, while UI renders still occur for health, quests, inventory, cooldowns, membership, and coarse local minimap movement.
- Candidate fix 2026-04-28: Added a deadzone to local player prediction reconciliation so tiny server/client drift while actively moving no longer creates constant camera/player rubber-banding; large drift still snaps and idle drift still corrects normally.
- Confirmed 2026-04-30: Josh manually verified that the recurring movement/camera hitch is resolved.
- Direction 2026-04-30: Treat the old Colyseus schema buffer warning as non-blocking unless it reappears; the buffer was already increased and verified in normal guest entry.
- Done 2026-04-28: Fix fountain-area rendering order so cobblestone near the fountain sits below character shadows, and improve dirt paths with a darker textured surface instead of the pale translucent overlay.
- Done 2026-04-28: Reduce the quest log HUD footprint by collapsing the idle/no-active-quest tracker into a compact panel while keeping the full quest log button.
- Done 2026-04-28: Fix right-side HUD button alignment so icon and label content stays centered and unclipped on Character, Inventory, Quests, and Leave buttons, including narrow/mobile viewports.
- Done 2026-04-28: Quick-fix ranged quest/XP credit by tracking recent player damage tags on mobs, so tagged players share kill quest credit and XP even if they are outside the old death-radius check.
- Done 2026-04-28: Replaced the broken Drizzle metadata-dependent migrate command with a repo-local SQL migration runner, applied the checked-in migrations to the current local `DATABASE_URL`, and smoke-tested wallet persistence with a synthetic wallet for level/XP/talent points, quest state, inventory, equipment, and talents.

### World Expansion

- Done 2026-04-28: Added Signal Ridge as the upper-right hub with terrain bounds, roads, minimap/world-map support, buildings, stalls, trees, banners, and a relay landmark.
- Done 2026-04-28: Quality pass the upper-right quest hub layout by moving Signal Ridge friendlies into a safe pocket and pushing hostile combat encounters into a separate eastern static field.
- Done 2026-04-28: Re-center the town-to-field composition by shifting the Busted Farm east toward town, keeping Field Camp as the later hub, and expanding the ground margin around the playable area.
- Done 2026-04-28: Reposition the farm so it sits more between main town and the bottom-left hub instead of almost on top of Field Camp.
- Done 2026-04-28: Move the Hogwatcher questgiver closer to the repositioned farm approach.
- Done 2026-04-28: Add a clear route from town to the upper-right hub, with enough landmarks and minimap support to make the path legible.
- Done 2026-04-28: Include a large named mfer boss for the questline finale that should take at least 3 players.
- Done 2026-04-28: After players complete the finale, unlock a daily raid-spawn quest intended for a larger group.

### Quest And Gear

- Done 2026-04-28: Do not grant gear solely based on player level.
- Done 2026-04-28: Give meaningful gear through quest rewards.
- Done 2026-04-28: Add rare mob drop chances for normal gear so combat loops have a chase reward.
- Done 2026-04-28: Keep future rare/onchain item behavior separate from normal quest/drop gear.
- Done 2026-04-28: Added rare normal gear drops for early combat loops: Boar Bristle Cap from wild hogs, Antler Charm from deer, and Farmhand Spade from non-ridge farmhands.

### Combat Feel

- Done 2026-04-28: Fix the cast bar animation/progress so it feels silky smooth by moving fill progress to a transform-based `requestAnimationFrame` update instead of the coarse HUD timer.
- Done 2026-04-28: Status bar pass: health is red, mana is blue, and XP is purple.
- Done 2026-04-28: Show a health bar on the character name tag; future settings toggle to hide/show it remains deferred.
- Done 2026-04-28: Add purple floating XP text such as `34 XP` when a mob dies and awards XP.
- Done 2026-04-28: Add a small number of differentiated enemy behaviors before adding many more enemies.
- Done 2026-04-28: Implement party aggro/threat management with server-side per-mob threat tables, taunt force windows, damage/healing threat, and threshold-based target switching.
- Done 2026-04-28: Ability/threat plan drafted in [plans/ability-threat.md](plans/ability-threat.md).

### mferGPT

- Done 2026-04-28: Added a Codex CLI LLM provider for mferGPT that uses the machine's logged-in Codex/ChatGPT auth, runs in an isolated temp workdir, strips app secrets from the subprocess environment, and keeps the old HTTP endpoint provider available as an override.
- Direction 2026-04-30: Josh's real mferGPT agent is now part of the path. Future game work should keep the in-game API/tool surface bounded, useful, and explicit before personality polish.

### Consumables And Hotbar

- Done 2026-04-28: Added first-pass stackable food/potion consumables, server-side use/cooldown validation, inventory use buttons, persisted count changes, and mob drop chances.
- Done 2026-04-28: Reworked hotbar assignment to support drag/drop/swap for abilities and consumables from the spellbook/inventory, including a carried-slot ghost and click-off removal.

### Redesign

- Done 2026-04-28: Unified inventory, spellbook, hotbar management, equipment, and talent nodes around compact square menu tiles with tooltip details; moved talents into an Abilities tab and slimmed the Character screen.
- Done 2026-04-28: Generated a consistent ChatGPT Images 2.0 icon set for all current item ids, spellbook abilities, placeholders, and reusable categories; wired HUD item/ability rendering to image assets with category fallbacks and documented the `public/icons` naming convention.

## Finished Hourly Agent Backlog

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

## Verification Notes

### 2026-04-30 09:50 PDT - Direction Update

- Saved Josh's original MFERS TOWN visual reference at [reference/original-mfertown-reference.png](reference/original-mfertown-reference.png).
- Updated [../NEXT_STEPS.md](../NEXT_STEPS.md) around the current path: wallet-only tester auth, production DB cutover paused until Josh is on the Mac mini, Blender MCP available, Privy deferred, current questline/deep itemization deprioritized, and visual town density/mferGPT agent work moved up.
- Visual target from the reference: dense cobblestone social plaza, central fountain, packed visible mfers/NPCs, warm buildings, fuller trees, and castle/gate backdrop. Avoid a sparse rural/western first read for the starter town.
- Keep current crypto/AI/generation work bounded: regular character state stays DB-backed, rare/onchain behavior is later, and image/model generation should start as a reviewed asset pipeline that feeds the normal Blender/GLB workflow.

### 2026-04-29 16:56 PDT - Creature GLB Source Bank

- Added standalone Blender source, GLB export, and preview PNG assets for `wild-rabbit`, `town-deer`, `wild-hog`, `old-boar`, `field-crow`, `living-scarecrow`, and `static-wisp` under `assets/blender/`.
- These are not wired into the game runtime yet; they are a creature-pass model bank for later selection, optimization, and integration.

### 2026-04-29 16:05 PDT - Sartoshi Fountain Statue Pass

- Added a center pedestal and trait-filtered 3D mfer statue to the plaza fountain runtime: plain mfer, regular eyes, smile, black headphones, black cig, and white Argo watch.
- Kept the existing `/models/fountain-basin.glb` and procedural water, but changed the water surface to a ring and moved arcs/droplets outward so the statue owns the center instead of being crossed by water effects.
- Verified with `npm run typecheck -w apps/web` and an in-app browser plaza check. The browser also showed pre-existing runtime/HMR errors from concurrent debug-placement/shared-package work, so console cleanliness was not attributable to this pass.

### 2026-04-29 12:52 PDT - Shopfront Window Color Pass

- Updated `assets/blender/town-shopfront.blend` and re-exported `/models/town-shopfront.glb` so shopfront window panes use darker warm glass instead of bright blue.
- Reassigned the GLB window mullion/trim faces from light gold trim to dark wood, removing the blue-cross-on-light-pane read.
- Updated the old procedural fallback window colors in `Buildings.tsx` to match the darker glass/dark wood treatment if that path is ever reused.
- Verified with `npm run typecheck -w @mferland/web` and Playwright screenshots from the Market and Plaza debug stops.

### 2026-04-29 12:30 PDT - Hanging Sign And Banner Pass

- Added `assets/blender/town-hanging-sign.blend` and exported `/models/town-hanging-sign.glb` as a reusable textured hanging-sign asset with runtime accent tinting and labels.
- Replaced flat shopfront signs and market stall text boards with the shared hanging sign so labels are no longer plain text on solid-color rectangles.
- Reused the same sign asset for the farm entrance and signal route marker posts, keeping labels dynamic while improving the prop silhouette.
- Verified with `npm run typecheck -w @mferland/web` and Playwright screenshots of the auth preview plus Gate, Market, Farm, and Relay debug stops.

### 2026-04-29 11:34 PDT - Plaza Shopfront GLB Pass

- Added `assets/blender/town-shopfront.blend` and exported `/models/town-shopfront.glb` as the reusable shell for plaza and outpost houses.
- Reused the same texture sources that made the procedural plaza houses work well: `timber-plaster.webp`, `roof-tiles.webp`, and `castle-stone.webp`, with small wood/glass trim materials baked into the GLB.
- Updated `TownBuilding` to place the GLB shell while keeping runtime sign text/accent panels for now, and removed the old instanced trim/window overlay from the world render path to avoid duplicate detail.
- Nudged the GLB window frame, glass, and muntin layers outward from the wall/wood trim after browser review showed slight texture clipping around the window edges.
- Verified from the Plaza/Market debug stops in the in-app browser with no browser warnings or errors. `npm run typecheck -w @mferland/web` passed.

### 2026-04-29 11:14 PDT - Farm Roof Closure Pass

- Added front and rear roof gable closure meshes to `assets/blender/damaged-farmhouse.blend` and `assets/blender/sagging-barn.blend`.
- Re-exported `/models/damaged-farmhouse.glb` and `/models/sagging-barn.glb` so the farm house and barn no longer show open sky through the roof gables.
- Confirmed both GLBs load at the Farm debug stop in the in-app browser with no browser warnings or errors, and rendered close Blender previews for the source models.

### 2026-04-29 09:24 PDT - Castle Landmark GLB Pass

- Replaced the south gate's old procedural prop stack with a single merged castle landmark GLB at `apps/web/public/models/castle-gate.glb`, sourced from `assets/blender/castle-gate.blend`.
- Kept the model texture-rich with the existing ChatGPT Images 2.0 material atlas, rotated it to face the starter-plaza approach, baked `MFERS ONLY` lettering into the GLB, and simplified `CastleGate` so the scene places only the model.
- Widened the south-gate collision solids in `packages/shared/src/world.ts` so the larger visual walls and towers match gameplay blocking.
- Verified with `npm run build -w @mferland/shared`, `npm run typecheck -w @mferland/shared`, `npm run typecheck -w @mferland/web`, `git diff --check`, and an in-app browser smoke test using the Gate debug travel stop. Browser console had no warnings or errors after reload.

### 2026-04-29 09:31 PDT - Farm Building GLB Cleanup

- Merged `apps/web/public/models/damaged-farmhouse.glb` from 26 mesh objects to one mesh and `apps/web/public/models/sagging-barn.glb` from 37 mesh objects to one mesh, preserving their existing texture/material slots.
- Re-exported the matching Blender sources in `assets/blender/damaged-farmhouse.blend` and `assets/blender/sagging-barn.blend` so source and runtime assets stay aligned.
- Verified from the Farm debug travel stop that the farmhouse and barn still face the farm approach after export. Browser console had no warnings or errors.

### 2026-04-29 09:35 PDT - Signal Relay Body GLB Cleanup

- Merged `apps/web/public/models/signal-relay-body.glb` from 42 mesh objects to one mesh, preserving its existing texture/material slots.
- Kept the animated relay rings and crystal procedural in `apps/web/src/game/scene/TownWorld.tsx` so the static GLB stays simple while the quest landmark remains lively.
- Verified from the Relay debug travel stop that the body still renders correctly with the VFX. Browser console had no warnings or errors.

### 2026-04-29 09:41 PDT - Repeated Town Prop GLB Cleanup

- Merged `apps/web/public/models/market-stall.glb` from 23 mesh objects to one mesh, `apps/web/public/models/banner-post.glb` from 21 mesh objects to one mesh, and `apps/web/public/models/watch-tower.glb` from 36 mesh objects to one mesh.
- Preserved texture/material slots so `market_stall_canopy_color` and `banner_post_cloth_color` still support runtime color variants.
- Verified from the Gate and Market debug travel stops that the merged banner, stall, and watch-tower assets render with the expected orientation and colors. Browser console had no warnings or errors.

### 2026-04-29 09:45 PDT - Fountain Basin GLB Cleanup

- Merged `apps/web/public/models/fountain-basin.glb` from 48 mesh objects to one mesh, preserving its existing texture/material slots.
- Kept procedural water, arcs, and droplets in `apps/web/src/game/scene/world/Fountain.tsx` so the basin GLB remains a static textured model while water stays animated.
- Verified in the auth/plaza preview that the merged basin still renders correctly with water. Browser console had no warnings or errors.

### 2026-04-29 10:12 PDT - Castle Repair Pass

- Rebuilt `apps/web/public/models/castle-gate.glb` as a deeper single-mesh castle footprint with front towers, side return walls, rear keep, rear towers, courtyard floor, and a raised sign plate.
- Changed the baked sign text from `MFERS ONLY` to `MFER CASTLE` and offset the sign/text away from the stone face to avoid the sign-corner texture flicker seen in browser screenshots.
- Moved the castle placement from `z = -24` to `z = -30` and widened the matching collision solids in `packages/shared/src/world.ts` so the castle sits farther back from the plaza and blocks the larger footprint.
- Removed the runtime `MFERS NEVER DIE` Drei text overlay from the fountain while keeping the GLB basin and procedural water intact.
- Verified with `npm run build -w @mferland/shared`, `npm run typecheck -w @mferland/shared`, `npm run typecheck -w @mferland/web`, `git diff --check`, and in-app browser auth/Gate/Plaza checks. Browser console had no warnings or errors.

### 2026-04-29 10:29 PDT - Solid Castle Replacement

- Replaced the visible-block castle attempt with a single closed fortress-style GLB mesh at `apps/web/public/models/castle-gate.glb`.
- Built the castle as continuous front, rear, and side walls with integrated towers and keep, a closed dark gate panel instead of through-gaps, and no sign trim/corner geometry that can z-fight near the `MFER CASTLE` text.
- Re-authored the mesh with explicit tiled UVs against the ChatGPT Images 2.0 stone/material textures so the stone reads closer to the farm/building assets instead of smearing into flat beige.
- Verified in the in-app browser auth preview and Gate debug stop; browser console had no warnings or errors. `git diff --check` passed.

### 2026-04-29 08:08 PDT - Stabilization Refactor Follow-Up

- Finished wiring the refactor extraction by moving player AoE/split-shot handlers through `apps/server/src/systems/playerCombatAbilities.ts` and keeping `apps/server/src/systems/combat.ts` focused on core combat damage, casts, regen, and impact processing.
- Finished wiring the HUD abilities extraction by using `apps/web/src/components/hud/AbilitiesPanel.tsx` from `Hud.tsx` and sharing `formatTooltipLabel` through `apps/web/src/components/hud/utils.ts` for the HUD, abilities panel, and action-slot buttons.
- Rebuilt `@mferland/shared` so downstream packages see the new `training-dummy` NPC model type.
- Verified with `npm run typecheck`, `npm run build`, `npm run build:agent`, and `git diff --check`.
- Attempted `npm run dev` for browser smoke testing, but this sandbox blocked the server `tsx` IPC pipe and Vite listener with `EPERM`; attempted Codex browser setup through the required IAB backend, but no Codex IAB backend was discovered. Manual browser verification remains pending for movement/camera feel and the Colyseus schema warning.

### 2026-04-28 13:45 PDT - Movement Stutter Follow-Up

- Decoupled local movement/minimap snapshot updates from 3D scene renders so running no longer forces the full Three scene through React just to move HUD dots.
- Memoized the town scene behind an explicit scene revision; NPC/player stat, target, combat, and scene-relevant changes still render normally.
- Removed the remaining coarse local movement/yaw snapshot render path entirely while debugging the movement-only hitch.
- Capped client-side control/camera delta at 30 FPS so an occasional late frame does not create a visible camera catch-up pop while moving or turning.
- Restored minimap/world-map dot motion with direct DOM style updates from mutable room snapshots, avoiding React scene/HUD renders during normal movement.
- Removed the temporary guest level-10 debug start so new guests start at normal level 1 progression again.
- Kept the local prediction deadzone candidate in place for tiny authoritative drift while moving, with large drift and idle correction still handled.

### 2026-04-28 10:56 PDT - Enemy Behavior Pass

- Added a hog charge movement burst when an aggroed hog has enough distance to rush the player.
- Added caster retreat behavior so caster farmers and static mages backpedal when players get too close instead of standing still.
- Kept this pass schema-free and limited to existing NPC movement/combat logic.

### 2026-04-28 10:50 PDT - Rare Normal Gear Drops

- Added rare normal gear drops for early combat loops: Boar Bristle Cap from wild hogs, Antler Charm from deer, and Farmhand Spade from non-ridge farmhands.
- Kept quest reward gear intact and separate from mob-drop chase gear.
- Continued keeping all current regular gear as database items, not onchain/rare token behavior.

### 2026-04-28 10:42 PDT - Combat Readability Pass

- Changed the HUD XP bar from yellow to purple so health, mana, and XP have distinct red/blue/purple reads.
- Added compact red health strips to actor nameplates for players, attackable mfer NPCs, mferGPT variants that are not immortal, and creature NPCs.

### 2026-04-28 10:35 PDT - XP Feedback Pass

- Added per-player XP award events sent only to the credited client after mob defeat.
- Rendered purple floating `{amount} XP` text from the awarded amount, so different players can see different numbers if XP is capped, split, or modified per player.
- Kept XP feedback out of the replicated room schema to avoid increasing baseline sync payload size.

### 2026-04-28 10:23 PDT - Signal Ridge Route Pass

- Added an east-side dirt connector from town to the existing Ridge Fork path.
- Added shared ridge route landmarks so both the minimap and world map show the route breadcrumbs.
- Added visible 3D RIDGE/MILE/TURN/SIGNAL marker posts along the road to Signal Ridge.
- Updated the Signal Ridge dispatch quest copy and mferGPT hint text to point players toward the cyan ridge markers.

### 2026-04-28 10:12 PDT - Farm Composition Pass

- Shifted Busted Farm east toward town while keeping Field Camp in the lower-left as the later hub, and expanded the ground plane margin around the full playable area.
- Moved hogs and farmhand enemies with the farm so combat remains centered on the farmyard.
- Moved Hogwatcher to the new farm approach, closer to the relevant quest area.
- Updated shared road/hub/map data, farm collision solids, farm visuals, road edge decals, and ground smudges for the new farm position.

### 2026-04-28 10:06 PDT - HUD Dock Alignment

- Centered the right-side dock button icon/label stack with explicit grid rows and tighter label sizing.
- Increased narrow/mobile dock button width enough to avoid clipping `Character` and `Inventory`.

### 2026-04-28 10:04 PDT - Signal Ridge Safety Pass

- Split Signal Ridge into a safer north-side NPC pocket and a separate eastern Static Field combat pocket.
- Moved Ridge Guide, Beacon Keeper, Ridge merchant, and ridge stalls away from hostile aggro routes.
- Moved Raider Vex, Raider Pax, Static mage Ori, roaming raiders, Static Baron Nox, and the daily raid spawn into the Static Field/relay combat area.
- Added Static Field to shared world roads/map data and added red boundary banners at the transition from safe hub to hostile field.

### 2026-04-28 09:55 PDT - Stabilization Follow-Up

- Collapsed the no-active-quest HUD tracker into a compact `Quests` panel with the quest log button still available.
- Added server-side mob damage tags so players who recently damage a mob can receive quest/XP credit at death even when ranged attacks leave them outside the nearby-credit radius.
- Verified with `npm run typecheck`, `npm run build`, `npm run build:agent`, a direct server-side ranged-credit simulation, and an in-app browser HUD smoke test.

### 2026-04-28 09:32 PDT - Upper-Right Expansion Pass

- Added Signal Ridge as the upper-right hub with new terrain bounds, roads, minimap/world-map support, buildings, stalls, trees, banners, and a relay landmark.
- Added the level 8-10 quest continuation: Field Camp dispatch -> Signal Ridge scraps -> raider crew -> Static Baron Nox.
- Made Static Baron Nox a large mfer boss intended for 3+ players, with higher health, larger rendered scale, and adjusted attack/collision ranges.
- Added post-finale daily raid quest support: completing Static Baron Nox unlocks a repeatable daily that spawns a much larger raid boss intended for 10+ players.
- Added quest reward gear and rare drop gear without level-gating: Field-Patched Hoodie, Ridge Runner Beanie, Baron Breaker Board, and Static Loop Ring.
- Reworked starter quests into a short town-intro chain instead of same-NPC instant turn-ins: OG -> DAO -> Fountain -> OG, then Sealed Note opens.
- Verified with `npm run typecheck`, `npm run build`, `npm run build:agent`, a quest-chain ID/reward sanity script, and a browser smoke test.
- Needs manual playtest: route readability to Signal Ridge, boss health/damage tuning for actual player counts, and the daily raid spawn loop after completing the finale.

### 2026-04-28 09:09 PDT - Stabilization Pass

- Added the manual playtest feedback as the next build plan: stabilize first, then upper-right level 8-10 expansion, quest/drop-based gear, combat feel, mferGPT Codex auth, and consumables later.
- Increased the Colyseus schema encoder buffer to prevent the expanded room state from overflowing the default 8 KB encoder buffer during sync.
- Verified with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Confirmed the dev server restarted cleanly and a guest browser smoke test connected/rendered without browser console errors or new schema buffer warnings.
- Still pending before Neon main migration: manual wallet persistence retest after a fresh app/server restart.

### 2026-04-28 08:04 PDT - Finished

- Confirmed with a spawned verifier agent that Hourly Agent Backlog items 1-6 remain finished and item 7 is still intentionally deferred.
- Verified the current tree with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Attempted local dev playtest with `npm run dev`, but this sandbox still blocks the server `tsx` IPC pipe and Vite's `0.0.0.0:5173` listener with `EPERM`.
- Attempted Codex browser playtest through the required IAB runtime, but no Codex IAB browser backend was discovered in this session.
- Next manual playtest focus remains wallet reconnect persistence, quest offer/turn-in panel clarity, plaza-to-farm-to-field-camp traversal, progression/talent/equipment behavior, and `@mfergpt` hint/spawn/cooldown behavior.

### 2026-04-28 07:04 PDT - Finished

- Confirmed with a spawned verifier agent that Hourly Agent Backlog items 1-6 remain finished and item 7 is still intentionally deferred.
- Verified the current tree with `npm run typecheck`, `npm run build`, and `npm run build:agent`.
- Attempted local dev playtest with `npm run dev`, but this sandbox still blocks the server `tsx` IPC pipe and Vite's `0.0.0.0:5173` listener with `EPERM`.
- Attempted Codex browser playtest, but the in-app browser backend was not discovered in this session.
- Attempted a static-file Playwright smoke test of `apps/web/dist/index.html`, but Chromium launch is also blocked by macOS sandbox permissions.
- Next manual playtest focus remains wallet persistence, quest offer/turn-in panels, plaza-to-farm-to-field-camp route, progression/talent/equipment behavior, and `@mfergpt` command/cooldown behavior.

### 2026-04-28 06:04 PDT - Finished

- Confirmed Hourly Agent Backlog items 1-6 are already marked finished; item 7 remains explicitly deferred.
- Verified the current tree with `npm run typecheck` and `npm run build`.
- Attempted local dev playtest, but this sandbox blocks listening sockets for the server/Vite dev stack (`EPERM` on `127.0.0.1`/`0.0.0.0`).
- Attempted Codex browser playtest, but the in-app browser backend was not discovered in this session.
- Next manual playtest focus: wallet persistence after quest/inventory/equipment/XP/talent changes, quest panel turn-in flow, expanded plaza-to-farm-to-field-camp route, and `@mfergpt` hint/spawn cooldown behavior.

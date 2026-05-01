# Next Steps

Use this file as the active agent queue. Keep open work here; move finished work and verification notes to [docs/AGENT_LOG.md](docs/AGENT_LOG.md).

## Agent Inbox

Add raw new notes here before triage.

- None right now.

## Current Priority Queue

1. Stabilization and verification
2. Refactor and modularity
3. Combat tuning and feedback
4. UI/HUD polish
5. World and quest polish
6. Art and asset direction
7. Companions, agent characters, and PvP
8. DB/auth follow-ups
9. Later systems and redesign

## Ready For Agents

### Stabilization And Verification

- [x] Refactor large/mixed-responsibility files before adding much more feature work. Combat-related files appear to be accumulating many abilities/moves and may need ability definitions or handlers split into their own modules. Also check the town square/world layout file and any other large files that mix unrelated data types or systems. The game will expand quickly, so prefer modular files with clear ownership boundaries.
- [ ] Confirm the recurring movement/camera hitch is fully resolved in a manual playtest. Candidate fixes are logged in [docs/AGENT_LOG.md](docs/AGENT_LOG.md); specifically test walking forward, turning, idle animation, minimap updates, and combat movement.
- [x] Re-run `npm run typecheck`, `npm run build`, and `npm run build:agent` after the next stabilization/refactor pass.
- [ ] Restart the local dev server and confirm the Colyseus schema buffer warning no longer appears during normal play.
- [ ] Before production DB cutover, wait until Josh is on the Mac mini, decide the final Neon dev/prod branch layout, apply verified migrations to the production branch/DB from that launch machine, and point the Mac mini at production `DATABASE_URL` through local/deploy secrets only.

### Combat Tuning And Feedback

- [ ] Playtest and tune combat numbers for the eight-slot baseline abilities plus the new talent actives. Use [docs/plans/ability-threat.md](docs/plans/ability-threat.md) as the design reference.
- [ ] Improve hit feedback, enemy tells, cooldown clarity, death/respawn polish, and combat readability.
- [ ] Defer non-mfer 3D model animation until the Blender MCP workflow is available, then do a proper asset/rig pass for simple moving limbs instead of a cheap placeholder.

### UI And HUD Polish

- [ ] Add a future settings toggle to hide/show character nameplate health bars.
- [ ] Continue narrow/mobile HUD QA when touching the right-side dock, quest tracker, hotbar, cast bar, or status bars.
- [ ] Add simple dual-stick mobile controls, with movement/action sticks and all existing HUD/buttons remaining tappable.
- [x] Generate ChatGPT Images 2.0 icons for all items, abilities, placeholders, and general categories like armor. Keep a consistent style, size, naming convention, and placeholder set so new content can ship quickly.

### World And Quest Polish

- [ ] Manual playtest Signal Ridge route readability from town, boss health/damage tuning for actual player counts, and the daily raid-spawn loop after completing the finale.
- [ ] Keep future upper-right and bottom-left hub changes separated into safe NPC pockets, route landmarks, and combat pockets so questgiver interactions stay readable.
- [ ] Add at least one more quest hub, and slow down the 1-10 leveling pace a bit so progression has more room to breathe.

### Art And Asset Direction

- [x] Create an asset replacement audit doc. Go through each world object/model and decide which ones would be good to replace with a new Blender-built 3D model once the Blender MCP server is available. For each object, include current asset, proposed replacement, priority, performance pros/cons, and quality pros/cons. Completed in [docs/asset-replacement-audit.md](docs/asset-replacement-audit.md).
- [x] Expand the south gate into a real castle landmark, not just a gate. Completed 2026-04-29 as a single merged textured `/models/castle-gate.glb` with larger walls, side towers, a keep/courtyard read, baked sign text, front-facing orientation, simple widened collision, and browser QA from the Gate debug stop. Details are logged in [docs/AGENT_LOG.md](docs/AGENT_LOG.md) and [docs/asset-replacement-audit.md](docs/asset-replacement-audit.md).
- [ ] Continue the Blender model quality pass one asset at a time: every new model should have a ChatGPT Images 2.0 texture/atlas pass, checked pivots/orientation, browser QA from the dev travel stops, and a note if a rare untextured exception is intentional.
- [x] Replace the current flat procedural shop signs with Blender-built hanging signs/banners that support runtime labels/accent colors without looking like UI rectangles pasted onto the buildings. Completed 2026-04-29 with `/models/town-hanging-sign.glb`, shared runtime labels/accent tinting, shopfront signs, market stall signs, farm entrance signage, and route marker signposts. Browser QA covered auth preview, Gate, Market, Farm, and Relay debug stops.
- [ ] Make the world feel more like the original "mfer town" image once Josh provides the reference: fuller and more packed with buildings and trees, less like a rickety western town.

### Companions, Agent Characters, And PvP

- [ ] Add hireable mercenaries that follow the player and fight with them. Start with one attack style per merc: melee, ranged, and ice mage.
- [ ] Quality pass mferGPT in-game capabilities before personality work: define what it can actually do in the game world, which actions are useful/fun/safe, what limits/cooldowns it needs, and how those capabilities should evolve as agent characters arrive.
- [ ] Add Agent Characters that actually live in the world with players, play the game, and think about what to do. They can write or update battle scripts/behavior plans if useful.
- [ ] Add a Colosseum zone where the rules switch to free-for-all PvP while inside, then back to PvE outside.

### DB And Auth Follow-Ups

- [ ] Add Privy auth and map Privy users to `accounts.privy_user_id`.
- [ ] Decide final character progression tables for XP, talent trees, and gear.
- [ ] Keep rare/onchain items separate later; current character/account/quest/inventory state is regular DB.
- [ ] Add admin/debug tooling for looking up a wallet character without exposing secrets.

### Later Systems And Redesign

- [ ] Deep itemization, loot tables, sets, materials, and crafting.
- [ ] Rare/onchain item behavior; current normal gear remains regular DB-backed items.
- [ ] Larger character/equipment/inventory/spellbook redesign follow-up after more engine work, if the compact UI pass no longer scales.

## Verification Checklist

- `npm run typecheck`
- `npm run build`
- `npm run build:agent`
- Browser smoke test: enter game, move, target, fight, open HUD panels.
- Wallet persistence test: enter with wallet, accept/complete quest or change inventory/equipment/talents, refresh/re-enter, confirm state persists.

## Reference Docs

- Mfer color palette and art direction reference: [docs/mfer-color-reference.md](docs/mfer-color-reference.md)
- DB handoff and migration notes: [docs/db-handoff.md](docs/db-handoff.md)
- Completed work and verification log: [docs/AGENT_LOG.md](docs/AGENT_LOG.md)
- Ability/threat design reference: [docs/plans/ability-threat.md](docs/plans/ability-threat.md)

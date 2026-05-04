# Next Steps

Use this file as the active agent queue. Keep open work here; move finished work and verification notes to [docs/AGENT_LOG.md](docs/AGENT_LOG.md).

## Agent Inbox

Add raw new notes here before triage.

- None right now.

## Current Priority Queue

1. Invite-only soft launch readiness
2. Tester wallet access and launch stability
3. Original mfer town visual pass
4. mferGPT and agent-character integration
5. UI/HUD and mobile basics
6. Combat readability
7. DB/auth follow-ups
8. Later crypto, AI, generation, and redesign experiments

## Current Direction Notes

- Josh confirmed the recurring movement/camera hitch is resolved on 2026-04-30.
- Treat the old Colyseus schema buffer warning as non-blocking unless it reappears; the buffer was already increased and verified in [docs/AGENT_LOG.md](docs/AGENT_LOG.md).
- Production DB cutover stays paused until Josh is on the Mac mini.
- Blender MCP is available; asset/model work can proceed one checked pass at a time.
- Keep tester auth wallet-first for now. Hold Privy until the wallet flow proves insufficient.
- Do not spend time playtesting or expanding the current questline; quests will be rewritten later to be more mfer-centric.
- Do not build deep itemization yet. Keep normal items simple and leave rare/onchain behavior for later.
- Use [docs/soft-launch-plan.md](docs/soft-launch-plan.md) as the current launch gate and Season 0 crypto-reward reference.
- Use [docs/reference/original-mfertown-reference.png](docs/reference/original-mfertown-reference.png) as the current visual north star: dense cobblestone social plaza, central fountain, packed mfer NPCs, full trees, warm buildings, and a castle/gate backdrop.

## Ready For Agents

### Soft Launch Readiness

- [x] Implement Season 0 reward points as a capped offchain eligibility ledger. Do not pay live `$mferGPT` directly from repeatable quests. Completed 2026-05-04 with `season_reward_events`, conservative quest eligibility, daily/season caps, and wallet-only point logging.
- [x] Add initial admin/support tooling for wallet lookup and Season 0 reward review/export. Completed 2026-05-04 with `npm run support:admin`.
- [x] Add production purchase reconciliation plus manual grant/revoke tooling before inviting respected testers. Completed 2026-05-04 with `crypto_purchase_events`, purchase record/list/export/status commands, and manual pass grant/revoke support in `npm run support:admin`.
- [x] Pick and scaffold exactly one paid crypto surface for the first test group. Completed 2026-05-04 with a local Season 0 launch pass contract that accepts exact ETH payment or burns `$mfergpt`; production UI/deploy/reconciliation remains open above.
- [x] Validate the local crypto merchant path end to end. Completed 2026-05-04 with `npm run crypto:test:local`, including contract tests, web receipt tests, and local browser smoke.
- [ ] Run the full launch gate checklist in [docs/soft-launch-plan.md](docs/soft-launch-plan.md), including local crypto, wallet persistence, abuse tests, browser smoke, mobile smoke, and secret scan.
- [ ] After the internal rehearsal passes, invite 10-25 respected testers with clear reward rules, known limits, and a feedback channel.

### Stabilization And Verification

- [x] Refactor large/mixed-responsibility files before adding much more feature work. Combat-related files appear to be accumulating many abilities/moves and may need ability definitions or handlers split into their own modules. Also check the town square/world layout file and any other large files that mix unrelated data types or systems. The game will expand quickly, so prefer modular files with clear ownership boundaries.
- [x] Confirm the recurring movement/camera hitch is fully resolved in a manual playtest. Josh confirmed this on 2026-04-30.
- [x] Re-run `npm run typecheck`, `npm run build`, and `npm run build:agent` after the next stabilization/refactor pass.
- [x] Restart the local dev server and confirm the Colyseus schema buffer warning no longer appears during normal play. The buffer fix was already logged as verified; treat this as non-blocking unless the warning comes back.
- [ ] Before production DB cutover, wait until Josh is on the Mac mini, decide the final Neon dev/prod branch layout, apply verified migrations to the production branch/DB from that launch machine, and point the Mac mini at production `DATABASE_URL` through local/deploy secrets only.

### Combat Tuning And Feedback

- [ ] Keep combat tuning lightweight for testers: obvious hit feedback, enemy tells, cooldown clarity, death/respawn polish, and basic readability only.
- [ ] Defer deeper eight-slot/talent-active tuning until the mfer-centric rewrite path is clearer. Use [docs/plans/ability-threat.md](docs/plans/ability-threat.md) as the reference when this resumes.
- [ ] Defer non-mfer 3D model animation until the Blender MCP workflow is available, then do a proper asset/rig pass for simple moving limbs instead of a cheap placeholder.

### UI And HUD Polish

- [ ] Add a future settings toggle to hide/show character nameplate health bars.
- [ ] Continue narrow/mobile HUD QA when touching the right-side dock, quest tracker, hotbar, cast bar, or status bars.
- [ ] Add simple dual-stick mobile controls, with movement/action sticks and all existing HUD/buttons remaining tappable.
- [x] Generate ChatGPT Images 2.0 icons for all items, abilities, placeholders, and general categories like armor. Keep a consistent style, size, naming convention, and placeholder set so new content can ship quickly.

### World And Quest Polish

- [ ] Hold detailed Signal Ridge/current quest playtesting until the planned mfer-centric quest rewrite. Keep the current route usable, but do not tune this questline as if it is final content.
- [ ] Keep future upper-right and bottom-left hub changes separated into safe NPC pockets, route landmarks, and combat pockets so questgiver interactions stay readable.
- [ ] Defer adding more quest hubs and progression pacing work until after the visual town pass and quest rewrite direction settle.

### Art And Asset Direction

- [x] Create an asset replacement audit doc. Go through each world object/model and decide which ones would be good to replace with a new Blender-built 3D model once the Blender MCP server is available. For each object, include current asset, proposed replacement, priority, performance pros/cons, and quality pros/cons. Completed in [docs/asset-replacement-audit.md](docs/asset-replacement-audit.md).
- [x] Expand the south gate into a real castle landmark, not just a gate. Completed 2026-04-29 as a single merged textured `/models/castle-gate.glb` with larger walls, side towers, a keep/courtyard read, baked sign text, front-facing orientation, simple widened collision, and browser QA from the Gate debug stop. Details are logged in [docs/AGENT_LOG.md](docs/AGENT_LOG.md) and [docs/asset-replacement-audit.md](docs/asset-replacement-audit.md).
- [ ] Continue the Blender model quality pass one asset at a time: every new model should have a ChatGPT Images 2.0 texture/atlas pass, checked pivots/orientation, browser QA from the dev travel stops, and a note if a rare untextured exception is intentional.
- [ ] Original mfer town plaza pass: push the starter area toward [docs/reference/original-mfertown-reference.png](docs/reference/original-mfertown-reference.png) with a denser cobblestone social square, fuller building/tree edges, stronger fountain read, visible mfer crowd/NPC placement, and castle/gate backdrop. Avoid letting the first read feel like a sparse western/rural town.
- [x] Replace the current flat procedural shop signs with Blender-built hanging signs/banners that support runtime labels/accent colors without looking like UI rectangles pasted onto the buildings. Completed 2026-04-29 with `/models/town-hanging-sign.glb`, shared runtime labels/accent tinting, shopfront signs, market stall signs, farm entrance signage, and route marker signposts. Browser QA covered auth preview, Gate, Market, Farm, and Relay debug stops.
- [ ] Integrate the creature GLB source bank into runtime one creature at a time, starting with the hog/old-boar combat silhouette before passive rabbit/deer polish.

### Companions, Agent Characters, And PvP

- [ ] Add hireable mercenaries that follow the player and fight with them. Start with one attack style per merc: melee, ranged, and ice mage.
- [ ] Align in-game mferGPT with Josh's real mferGPT agent work: keep the game-side API/tool surface safe, useful, and explicit before adding personality polish.
- [ ] Add Agent Characters that actually live in the world with players, play the game, and think about what to do. They can write or update battle scripts/behavior plans if useful, but only through bounded game tools.
- [ ] Add a Colosseum zone where the rules switch to free-for-all PvP while inside, then back to PvE outside.

### DB And Auth Follow-Ups

- [ ] Keep tester auth wallet-only for now. Defer Privy and `accounts.privy_user_id` mapping until wallet-only testing proves it is needed.
- [ ] Decide final character progression tables for XP, talent trees, and gear.
- [ ] Keep rare/onchain items separate later; current character/account/quest/inventory state is regular DB.
- [ ] Add admin/debug tooling for looking up a wallet character without exposing secrets.

### Later Systems And Redesign

- [ ] Deep itemization, loot tables, sets, materials, and crafting.
- [ ] Rare/onchain item behavior; current normal gear remains regular DB-backed items.
- [ ] Image/model generation via mfer assets: treat this as a reviewed asset pipeline first, not live uncontrolled user generation. Start with generated icons, textures, model variants, or mfer-town props that can be checked into the normal Blender/GLB workflow.
- [ ] Onchain/content experiments: prefer small, bounded features such as rare item identity, token-gated cosmetics, or validated community map/content references before touching core MMO state.
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
- Invite-only soft launch plan: [docs/soft-launch-plan.md](docs/soft-launch-plan.md)
- Ability/threat design reference: [docs/plans/ability-threat.md](docs/plans/ability-threat.md)
- Original mfer town visual target: [docs/reference/original-mfertown-reference.png](docs/reference/original-mfertown-reference.png)
- mferGPT daily quest digester/API spec: [docs/mfergpt-daily-quest-api-spec.md](docs/mfergpt-daily-quest-api-spec.md)

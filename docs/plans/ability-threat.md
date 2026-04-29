# Ability And Threat Plan

Status: first pass implemented on 2026-04-28. Keep this document as the tuning and future-system reference.

Keep this as a first-pass MMO combat layer, not a full class system. Every player gets the same eight-slot hotbar for now; "tank/ranger/caster/healer" are just usage patterns.

## Default Hotbar

1. `interact`
2. `attack`
3. `shoot`
4. `signalShot`
5. `fireblast`
6. `frostNova`
7. `heal`
8. `taunt`

## Baseline Abilities

- `attack`: keep the current melee damage/range/cooldown, but make it the threat builder. Threat should be actual damage plus a flat bonus, enough that repeated melee attacks can hold a mob against normal ranged/magic damage without adding a separate tank attack.
- `taunt`: short-range instant action, no damage, about 10-12s cooldown. Forces the targeted mob to attack the taunter for 3s and adds enough snap threat that the mob usually remains on the taunter briefly after the forced window ends.
- `shoot`: keep as the baseline physical ranged attack: instant, no mana, existing cooldown/range/stationary rules.
- `signalShot`: new cooler "magic shot" ranged action. Instant fire, no cast time, mana cost, moderate cooldown, and lower total damage than a completed `fireblast`. This gives the ranged/magic style a reactive button without replacing the big cast.
- `fireblast`: keep as the high-damage casted spell. Damage threat equals damage; cast pushback still matters.
- `frostNova`: keep as instant AoE damage/freeze. It remains useful for both caster and healer/support patterns.
- `heal`: targeted friendly/self heal. Count only effective healing, not overheal, for threat. First pass should be single-target with a modest cooldown and mana cost rather than an AoE heal.

## Talent-Tree Active Abilities

- Brawler tree: `whirlwind`, an instant short-radius AoE around the character. It should generate normal damage threat on every enemy hit, plus enough melee-style bonus threat to make it useful when tanking multiple mobs.
- Utility/ranged tree: `multishot`, an instant ranged attack that can hit up to 3 eligible enemies near the selected target. It should prefer the selected target first, then nearby hostile targets in range.
- Caster tree: `iceBlast`, a lower-damage spell than `fireblast` that applies a slow instead of a hard freeze. Use this for kiting and boss-safe control where `frostNova` freeze would be too binary.

## Threat Model

- Store threat server-side in `TownRoom`, keyed by `npcId -> sessionId -> threat`, so it does not increase replicated room-state size.
- Keep taunt force state server-side too, keyed by `npcId -> { sessionId, until }`; continue using replicated `npc.aggroTargetId` as the visible/current target.
- Damage threat defaults to actual damage dealt.
- `attack` threat = actual damage plus a flat tanking bonus.
- `taunt` threat = snap threat and forced targeting for 3s.
- `heal` threat = a fraction of effective healing applied to hostile NPCs that are already engaged with, targeting, or near the healed player. Do not add healing threat to unrelated idle mobs across the map.
- Target switching should avoid jitter: outside the taunt window, switch to the highest-threat eligible living player only when they beat the current target by a small threshold.
- Clear threat when the NPC dies, despawns, fully leashes/resets, or when a player leaves/death-cleans enough state to prevent stale targets.

## Original Implementation Order

1. Expand shared combat action definitions and player ready-at state for `signalShot`, `heal`, and `taunt`.
2. Increase the bottom hotbar to eight slots with keys `1`-`8`, icons, cooldown text, mana/range checks, and default slot order above.
3. Add server-only threat and taunt maps, then route all existing player damage through threat generation.
4. Add `taunt` targeting behavior before adding `heal`, because it gives the threat system a simple forced-target test.
5. Add `heal` friendly targeting/self fallback and healing-threat generation.
6. Add `signalShot` combat event visuals, damage rules, cooldown/mana tuning, and UI label/icon.
7. Verify with `npm run typecheck`, `npm run build`, `npm run build:agent`, a focused server-side threat simulation, and a browser combat smoke test.

## Current Follow-Up

- Playtest and tune combat numbers for the eight-slot baseline abilities plus the new talent actives.
- Verify taunt force windows, healing threat, target switching thresholds, and ranged/magic threat feel stable with multiple players.

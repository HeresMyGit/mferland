# Asset Replacement Audit

Date: 2026-04-29

This audit covers the objects and models currently rendered into the town scene and nearby NPC layer. The codebase is mostly using procedural Three.js geometry, generated canvas textures, five static world textures, one local GLB, one remote mfer GLB, and four local FBX animation clips.

Priority key:

- P0: Replace first once the Blender MCP workflow is available.
- P1: Good replacement target after the first pass.
- P2: Improve if the area is being touched, but keep current implementation until then.
- P3: Keep procedural or texture-driven for now.

Simplified score key:

- Performance and quality use this scale: ---, --, -, 0, +, ++, +++.
- Scores estimate the net effect of replacing the current asset with the proposed Blender asset. Higher is better.

## Simplified Scores

| Object | Performance | Quality |
| --- | --- | --- |
| Castle gate / castle landmark | + | +++ |
| Fountain | 0 | +++ |
| Town shopfront buildings | + | +++ |
| Market stalls | 0 | ++ |
| Watch towers | 0 | ++ |
| Signal relay | 0 | +++ |
| Signal route markers | 0 | + |
| Banner posts | 0 | + |
| Spawn rings | 0 | 0 |
| Road, plaza, and dirt surfaces | 0 | + |
| Ground grass tufts and smudges | 0 | 0 |
| Town and backdrop trees | 0 | ++ |
| Backdrop hills | 0 | + |
| Sky, clouds, and sun | 0 | 0 |
| Contact shadows and object decals | 0 | 0 |
| Rundown farm cluster | 0 | +++ |
| Farmhouse | 0 | +++ |
| Sagging barn | 0 | +++ |
| Collapsed shed | 0 | ++ |
| Broken fence | 0 | ++ |
| Scarecrow | 0 | ++ |
| Mud patches | 0 | 0 |
| Player and standard mfer NPC avatar | + | + |
| mferGPT NPC | + | ++ |
| Rabbit | - | ++ |
| Deer | - | ++ |
| Wild hog / old boar | - | +++ |
| Enemy farmers and ridge raiders | 0 | ++ |
| Training dummies | done | done |
| Quest givers, merchants, guards, wanderers | 0 | + |
| Target rings, disposition markers, and quest markers | 0 | 0 |
| Frozen/cold/cast effects | 0 | 0 |
| Loot sparkles and chat/nameplate billboards | 0 | 0 |

## Near-Term 3D Model Queue

1. Castle landmark expansion: completed 2026-04-29 as a single merged textured `/models/castle-gate.glb` with side walls, heavier towers, a keep/courtyard hint, baked `MFER CASTLE` sign lettering, and simple widened collision.
2. Building kit v2: replace more repeated procedural shop/outpost boxes with a shared low-poly mfer town kit using the current ChatGPT Images 2.0 material atlas direction.
3. Creature pass: hog first, then rabbit/deer, with simple low-poly rigs or moving limb loops only where the behavior benefits from it.
4. Props/detail pass: fence segments, crates/barrels, signposts, and route boards that can be reused across farm, field camp, and ridge.
5. Texture optimization pass: the current quality target is texture-rich, but GLB size should be reduced later with shared atlas discipline before release.

## Completed 3D Model Passes

- 2026-04-29: Castle landmark v1 replaced the procedural south gate with a single merged GLB mesh at `/models/castle-gate.glb`. It uses the ChatGPT Images 2.0 material atlas, faces the starter-plaza approach, includes front gate/sign detail in the asset, and has matching widened collision in `packages/shared/src/world.ts`.
- 2026-04-29: Castle landmark v2 moved the castle farther back from the plaza, rebuilt it as a deeper footprint with side return walls, rear keep, rear towers, courtyard floor, raised sign plate, and baked `MFER CASTLE` text offset from the wall to avoid sign-corner z-fighting.
- 2026-04-29: Castle landmark v3 replaced the visible-block version with one closed fortress-style GLB mesh: continuous front/rear/side walls, integrated towers/keep, a closed dark gate panel instead of through-gaps, no sign trim/corner pieces, and explicit tiled UVs so the ChatGPT Images 2.0 stone texture reads cleanly again.
- 2026-04-29: Plaza shopfront GLB pass replaced the repeated procedural town/outpost building shell with `/models/town-shopfront.glb`, preserving the same `timber-plaster`, `roof-tiles`, and `castle-stone` texture sources while leaving runtime sign text/accent panels for a later sign/banner pass.
- 2026-04-29: Shopfront window color pass updated `/models/town-shopfront.glb` so the windows use dark warm glass with dark wood mullions instead of the prior bright blue panes/light cross treatment.
- 2026-04-29: Farm building cleanup merged `/models/damaged-farmhouse.glb` and `/models/sagging-barn.glb` down to one mesh each while preserving their ChatGPT Images 2.0 texture/material slots. Browser QA from the Farm debug stop confirmed the building fronts face the farm approach.
- 2026-04-29: Farm roof closure pass added front/rear gable closure meshes to `/models/damaged-farmhouse.glb` and `/models/sagging-barn.glb` so their roof peaks read enclosed instead of showing open sky through the triangle under the ridge.
- 2026-04-29: Hanging sign/banner pass added `/models/town-hanging-sign.glb` and reused it for shopfront signs, market stall signs, the farm entrance sign, and route marker signposts. The asset keeps runtime labels/accent tinting while replacing the old plain solid-color sign rectangles.
- 2026-04-29: Signal relay body cleanup merged `/models/signal-relay-body.glb` down to one mesh while preserving the ChatGPT Images 2.0 texture/material slots. Runtime animated rings and crystal remain procedural VFX around the static body.
- 2026-04-29: Repeated town prop cleanup merged `/models/market-stall.glb`, `/models/banner-post.glb`, and `/models/watch-tower.glb` down to one mesh each while preserving texture/material slots and runtime color variants.
- 2026-04-29: Fountain basin cleanup merged `/models/fountain-basin.glb` down to one mesh while preserving its ChatGPT Images 2.0 texture/material slots. Runtime water remains procedural.
- 2026-04-29: Fountain runtime text cleanup removed the old `MFERS NEVER DIE` overlay from the basin area while keeping the procedural water and GLB basin.
- 2026-04-29: Sartoshi fountain statue pass added a center pedestal and runtime 3D mfer statue using the canonical mfer GLB with plain body, regular eyes, smile, black headphones, black cig, and white Argo watch. The basin GLB stayed in place, while water changed to a ring with outward arcs/droplets so the statue owns the center.
- 2026-04-29: Creature GLB source bank added standalone Blender source, GLB export, and preview PNG assets for `wild-rabbit`, `town-deer`, `wild-hog`, `old-boar`, `field-crow`, `living-scarecrow`, and `static-wisp`. These are not runtime-integrated yet.

## Static World Objects

| Object | Current asset | Proposed Blender replacement | Priority | Performance pros | Performance cons | Quality pros | Quality cons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Castle gate / castle landmark | Procedural cylinders, boxes, sphere arch mask, crenels, banner posts, and `Text` in `apps/web/src/game/scene/world/Buildings.tsx`; current Blender pass reads more like a gate than a full castle | Modular low-poly castle kit: larger stone gatehouse, side walls, two stronger towers, portcullis/door, small keep or courtyard silhouette behind the gate, sockets for current banner props, and texture atlas materials from ChatGPT Images 2.0 | P0 | A kit with merged wall/tower pieces can still reduce React mesh count and become reusable for future fortified zones | A full castle can become a large triangle/texture budget item if authored as one huge unique scene instead of reusable pieces | Biggest first-read town landmark; turns the town approach from "gate prop" into an actual fortified mfer town | Needs collision kept simple and should not block camera/readability around the south route choke point |
| Fountain | Procedural cylinders, torus rims, instanced stones, animated water texture, tube water arcs, droplets, and text in `apps/web/src/game/scene/world/Fountain.tsx` | Sculpted/low-poly fountain GLB with carved basin, central mfer motif, built-in stone blocks, and retained procedural water surfaces | P0 | Static basin can be baked into one mesh while keeping current cheap animated water | A high-poly circular basin could add visible GPU cost in the center of town | Central plaza focal point gets much stronger identity and readability | Water should probably remain procedural; replacing everything with mesh-only water would look worse |
| Town shopfront buildings | Reused procedural `shop` blueprint, box body, gabled roof, windows, trim, door, sign, chimney in `shared.ts` and `Buildings.tsx`; placed 10 times in town and 6 times in outposts | Small kit of 4-6 modular mfer town buildings with shared material atlas: shop, inn, forge, gallery/arcade, barracks/keep, outpost shack | P0 | Instanced GLB kit with shared materials can stay efficient and reduce React mesh count per building | Multiple unique buildings can increase memory if each ships separate textures/materials | Removes repeated-box look and supports "fuller original mfer town" direction | Needs naming/atlas discipline so variants do not become asset bloat |
| Market stalls | Procedural boxes, tilted roof slab, sign text, instanced posts/crates in `TownProps.tsx`; placed 3 town and 4 outpost stalls | Low-poly market stall kit with cloth canopy, table, crates, barrels, hanging signs, and optional item piles | P1 | A shared stall GLB can be instanced, and crate/barrel props can share a material atlas | Replacing every small crate with unique mesh props can raise draw calls unless merged/instanced | Adds close-range detail around hubs where players interact | Lower impact than gate/fountain/buildings because current silhouette already reads as stall |
| Watch towers | Procedural cylinders, crenels, cone roof, and banner post in `TownProps.tsx`; placed at south gate and Signal Ridge | Low-poly stone/wood watchtower GLB with stairs/railing, roof trim, flags, and optional lantern | P1 | Three instances of one optimized GLB should be cheap | More visible interior/railing detail may overdraw or need LOD | Strong vertical landmark and better route readability | Existing procedural version is already serviceable from gameplay camera |
| Signal relay | Procedural mast, octahedron crystal, torus rings, and glowing base in `TownWorld.tsx` | Stylized relay tower GLB with damaged metal/stone base, wires, carved static coils, and socketed animated crystal/rings | P0 | Static tower body can be one mesh while keeping current animated rings as separate cheap effects | Glow/transparency can still be expensive if overused at Signal Ridge | Critical quest/boss landmark; custom shape would clarify the ridge destination | Needs VFX split so the static model does not replace the readable animated signal |
| Signal route markers | Procedural post, two sign boards, `Text` labels, and ground ring in `TownWorld.tsx`; driven by `WORLD_LANDMARKS` | Small signpost GLB with arrow boards and baked label slots; keep runtime label text if labels need to change | P2 | Shared marker mesh can be reused for all route markers | If labels are baked into textures, future map edits become asset churn | Better silhouette for route guidance | Current markers are functional and cheap; not a first-pass need |
| Banner posts | Procedural post, flag slab, `Text` MF label in `TownProps.tsx`; used around plaza, gate, farm, field camp, ridge | Shared cloth banner GLB with slight wave shape, emblem decal/material variants, and same color inputs | P2 | One instanced mesh with material/color variants is efficient | Cloth folds add triangles to a very common prop | More branded and less cardboard-like | Fine detail may not matter at normal camera distance |
| Spawn rings | Procedural ring geometries in `TownProps.tsx` | Keep procedural; optionally add a low-poly stone rune base if spawn points become diegetic portals | P3 | Current rings are tiny, cheap, and easy to color | Adding mesh bases increases object count for little gameplay benefit | Procedural glow is readable | A full Blender model would not improve much without a larger portal system |
| Road, plaza, and dirt surfaces | Planes/circle with `grass-town.webp`, `cobblestone-plaza.webp`, generated dirt path texture, road-edge decals, plaza crack decals in `TownWorld.tsx`, `Ground.tsx`, `textures.ts` | Keep texture/decal-driven; later make small modular curb/stone-edge meshes and reusable broken cobble chunks | P2 | Planes and instanced decals are very cheap for large surfaces | Added curb/chunk meshes can add draw calls along long roads | Mesh edges would break up flat "painted on" roads | Full mesh roads are not worth it until layout/art direction settles |
| Ground grass tufts and smudges | Instanced planes/decals generated from `GRASS_TUFTS`, `GROUND_SMUDGE_DECALS`, and texture helpers | Keep instanced cards; optionally replace with a small Blender-built grass/weed card atlas | P3 | Existing instancing is cheap and scalable | Mesh grass can be much more expensive than billboard cards | Existing system fills empty space well | A Blender-only replacement would likely be worse unless it becomes a texture atlas workflow |
| Town and backdrop trees | Instanced procedural trunk, roots, branches, leaf spheres, leaf cones, shadows; `TOWN_TREES` and `BACKDROP_TREES` in `shared.ts` and `Trees.tsx` | Replace with 3-5 low-poly tree GLBs sharing a bark/leaf atlas, with LOD or instanced variants; keep backdrop trees especially low-poly | P1 | Shared GLB variants can remain instanced and improve silhouette with similar cost | Individual high-poly trees or unique materials would be costly because there are many | Better canopy shapes can make the town feel fuller fast | Current procedural trees are already performant and nonblocking |
| Backdrop hills | Three procedural cone mountains in `Trees.tsx` | Simple low-poly background ridge mesh or skybox-integrated hills | P2 | One merged backdrop mesh is cheap | If over-modeled, it wastes triangles outside play space | Better horizon shape and less cone-like background | Low gameplay value compared with close-range objects |
| Sky, clouds, and sun | Runtime canvas textures on sphere/planes in `Skybox.tsx` | Keep procedural/canvas; optional painted sky texture later, not Blender | P3 | Current sky follows camera and costs little | None significant | Already gives atmosphere without loading external assets | Blender is the wrong tool for this unless making distant mesh landmarks |
| Contact shadows and object decals | Instanced circles/rectangles in `Ground.tsx` and `shared.ts` | Keep procedural | P3 | Cheap and easy to update with placement data | None significant | Supports readability and depth | Not a candidate for Blender replacement |

## Farm And Field Objects

| Object | Current asset | Proposed Blender replacement | Priority | Performance pros | Performance cons | Quality pros | Quality cons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rundown farm cluster | Procedural group in `Farm.tsx` with mud patches, broken fence, farmhouse, sagging barn, collapsed shed, scarecrow, and `OLD FARM` text | Split into a farm kit: farmhouse, barn, shed debris, fence segments, mud decals, scarecrow, hay/feeding trough props | P0 | Shared kit pieces can be reused in future rural hubs and instanced where repeated | More unique meshes/textures increase load if not atlas-backed | The farm is a major combat/quest hub; replacement would make the first expansion area feel intentional | Needs modular pieces so future farm layouts do not require re-exporting one giant scene |
| Farmhouse | Box foundation, wall box, tilted roof slab, black windows/door, plank slats in `Farm.tsx` | Damaged farmhouse GLB with porch, broken windows, crooked roof, trim, boards, and optional interior-darkness planes | P0 | Single mesh plus shared atlas can replace many primitives | Too much interior/porch detail can be wasted from top-down camera | Stronger "busted farm" story at first glance | Needs collision bounds kept simple despite detailed visual mesh |
| Sagging barn | Box foundation/body, tilted roof slab, door boards, plank slats in `Farm.tsx` | Sagging barn GLB with large doors, missing boards, roof holes, hay loft silhouette, and side lean | P0 | One optimized mesh can replace repeated primitive parts | Large detailed roof textures can add memory | High-value landmark for hog/farmer combat area | Overly realistic barn could clash with low-poly mfer style |
| Collapsed shed | Tilted roof slab and four cylindrical debris pieces in `Farm.tsx` | Debris prop set: collapsed roof panel, planks, posts, tool scraps | P1 | Small props can be batched/instanced | Many loose pieces can raise draw calls if authored separately | Adds believability around the farm without needing huge models | Lower priority than main farmhouse/barn |
| Broken fence | Instanced posts and rails in `Farm.tsx` | Fence segment kit with straight, corner, broken, gate, and fallen pieces | P1 | Segment instancing should stay cheap and reusable across hubs | A unique full fence export would be less flexible and harder to instance | Better combat boundary and farm identity | Current fence already communicates the area perimeter |
| Scarecrow | Procedural cylinders, sphere head, cone body in `Farm.tsx` | Characterful low-poly scarecrow with mfer-ish headphones/hat, rag cloth, and simple rig sockets for idle sway | P1 | Single small mesh is negligible | Cloth/rig extras can be overkill if animated | Memorable prop near farm quests | Not essential for navigation |
| Mud patches | Procedural transparent circles in `Farm.tsx` and ground smudge decals in `shared.ts` | Keep as decals; optional Blender-authored mud texture atlas | P3 | Decals are cheaper than real puddle meshes | Transparent overlap can cost a bit but is controlled | Works well as ground dressing | Blender mesh mud would be mostly unnecessary |

## Character And NPC Models In The World

| Object | Current asset | Proposed Blender replacement | Priority | Performance pros | Performance cons | Quality pros | Quality cons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Player and standard mfer NPC avatar | Remote GLB `https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb`, trait mesh filtering in `MferAvatar.tsx`, local Mixamo FBX clips | Keep current canonical mfer GLB as the main source; use Blender for optimization, local packaging, missing accessories, NPC-only variants, and collision/proxy meshes | P1 | A cleaned local GLB could remove remote dependency, reduce hidden mesh overhead, and improve cache control | Rebuilding the canonical avatar from scratch is risky and may break trait mapping/animations | Current trait system is valuable; Blender can make it more stable and locally owned | Replacing outright could lose mfer identity and require animation retargeting |
| mferGPT NPC | Local `/models/mferGPT.glb` in `MferGptAvatar.tsx`, using the same Mixamo FBX animation set | Polish current GLB in Blender: optimize materials, fix scale/origin, add readable agent accessories, and export a version aligned with mfer animation rig | P1 | Local optimized GLB should load predictably and avoid excess meshes/materials | Adding accessories can increase skeleton/mesh complexity | Important named character benefits from a distinct, intentional model | Not as urgent as static landmarks because it is already a real GLB |
| Rabbit | Procedural sphere/capsule model in `CreatureAvatar.tsx`; 6 spawned critters | Tiny low-poly rigged rabbit GLB with hop/idle ear animation; keep simple collider | P1 | One reused rigged GLB for all rabbits is cheap if low-poly and shared material | Skinned animation has CPU/GPU overhead compared with static primitives | Big improvement over placeholder critter; supports "proper asset/rig pass" queue item | Needs animation discipline so six critters do not become expensive |
| Deer | Procedural sphere/capsule model in `CreatureAvatar.tsx`; 4 spawned beasts | Low-poly deer GLB with simple leg/neck rig and idle/walk cycle | P1 | Reused deer GLB is acceptable at current count | Antlers/legs can add triangles; skinned animation costs more than primitives | Better silhouette and less toy-like creature feel | Current deer is readable enough until the full critter pass begins |
| Wild hog / old boar | Procedural sphere/capsule/torus model in `CreatureAvatar.tsx`; 12 spawned hogs with combat behavior | Low-poly hog and old-boar variant GLB with tusks, bristles, charge-ready pose, and simple leg rig | P0 | Shared hog GLB with one material can be instanced/cloned; clearer combat silhouette may help gameplay | There are many hogs, so rig/animation and material count must stay very low | Highest creature priority because hogs fight, charge, and define the farm loop | More animation work needed than rabbit/deer because behavior readability matters |
| Enemy farmers and ridge raiders | Current standard mfer GLB with forced trait themes in `mferTraits.ts`; spawned as `model: "mfer"` | Keep mfer base but add Blender-built weapon/accessory overlays: pitchfork, staff/static coil, raider armor, boss scale kit | P1 | Add-on props can be small and reused without replacing avatar rig | Extra attached meshes per NPC can add draw calls if not merged or instanced | Improves hostile readability while preserving mfer identity | Full replacement would duplicate avatar work and risk animation issues |
| Training dummies | Dedicated `/models/training-dummy.glb` loaded through `TrainingDummyAvatar`; server NPCs use `model: "training-dummy"` | Treat as completed for the current replacement pass; later polish only if adding hit-react sockets, small wobble animation, or damage decals | P3 | Current dedicated model avoids loading the full mfer avatar for dummies and keeps the combat-test target cheap | Further animation/polish would add complexity for a solved readability problem | Clear non-living silhouette and better target-practice read are already in place | Do not spend another early model slot here unless combat tutorial polish needs it |
| Quest givers, merchants, guards, wanderers | Current standard mfer GLB with trait themes and nameplates | Keep current system; use Blender only for optional role props: guard spear/shield, merchant pack, quest board, map satchel | P2 | Additive role props are cheaper than unique character models | Too many per-role unique props can fragment materials | Role silhouettes improve town readability | Current nameplates/markers already communicate role well enough |

## VFX, UI-Adjacent World Markers, And Runtime Effects

| Object | Current asset | Proposed Blender replacement | Priority | Performance pros | Performance cons | Quality pros | Quality cons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Target rings, disposition markers, and quest markers | Procedural rings, planes, boxes, and `Text` in `MferAvatar.tsx` | Keep procedural; maybe add a small mesh icon base later | P3 | Current dynamic color/state system is cheap and flexible | None worth replacing | Gameplay readability is high | Blender assets could make state changes less flexible |
| Frozen/cold/cast effects | Procedural transparent boxes, spheres, rings, text, particles in `MferAvatar.tsx` | Keep procedural; improve shaders/textures later if needed | P3 | Dynamic procedural VFX are cheaper to iterate and state-driven | Transparency cost already exists but is localized | Good for combat feedback | Blender models would not solve the important timing/readability concerns |
| Loot sparkles and chat/nameplate billboards | Procedural spheres and UI planes/text in `MferAvatar.tsx` | Keep procedural/UI-driven | P3 | Cheap and tied to runtime state | None significant | Clear, flexible, responsive | Not a 3D modeling problem |

## Recommended First Blender MCP Batch

1. Castle landmark kit v1: expand the gate into a real castle read with side walls, towers, and a keep/courtyard hint.
2. Fountain basin GLB, keeping current procedural water.
3. Building kit v1 with at least three town variants and one outpost shack.
4. Farm kit v1: farmhouse, barn, fence segments, scarecrow.
5. Signal relay tower body, keeping current animated crystal/rings.
6. Hog and old-boar model variants, because the farm combat loop still needs stronger enemy silhouettes.
7. Rabbit/deer model pass after hogs if the creature area still feels placeholder.

Authoring constraints for the batch:

- Use one shared low-poly town material atlas where possible.
- Keep collision separate from visual mesh; current collision is simple circles/rectangles in `packages/shared/src/world.ts`.
- Prefer reusable kits over one-off full-scene exports.
- Preserve current procedural systems for water, VFX, UI markers, sky, decals, grass cards, and large terrain planes.
- Export with stable names and pivots so React placement data can replace procedural components one at a time.

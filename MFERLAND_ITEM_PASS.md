# mferland item pass

## purpose
Do a focused mfer-theme pass on items using the **actual current repo constraints**.

This is meant to help Codex add / revise items without inventing a totally different item system.

---

## what exists right now (repo audit)

I checked the live definitions in:
- `packages/shared/src/items.ts`
- `apps/server/src/systems/loot.ts`
- `packages/shared/src/quests.ts`
- `apps/web/src/components/hud/iconAssets.ts`
- `packages/chain/src/MferGearStore.sol`
- `packages/shared/src/items.test.ts`

### current item system constraints
These are real current constraints and should drive the pass:

- qualities are only: `common | uncommon | rare | quest`
- equipment slots are only:
  - `head`
  - `chest`
  - `mainHand`
  - `offHand`
  - `trinket`
- consumables are only:
  - `food`
  - `potion`
- current special item behavior is minimal:
  - normal equipment stat bonuses
  - consumable restore values / cooldowns
  - optional `revealsAllNpcsOnMinimap`
- current chain gear supports **3 tiers max**
- current chain gear tier scaling is already implemented as **+33% per tier above tier 1**
- current local chain gear mapping is:
  - `gearType 1 -> rusty-skate-deck`
  - `gearType 2 -> road-sign-lid`
  - `gearType 3 -> lucky-lighter`
- current level cap is **10**

### current item tone: what already works
The game already has the right direction in several places:
- `folded seed note`
- `chewed EOS`
- `fried uplink shard`
- `road snack`
- `plaza red`
- `static blue`
- `claim-route hoodie`
- `return-signal beanie`
- `centralizer breaker`
- `relay loop ring`

That tone is good: scrappy, street-level, slightly stupid, crypto-native, not fantasy-epic.

### current item gaps
The current set is flavorful, but still thin in a few important ways:

1. **early/mid progression is narrow**
   - there are only a handful of real equipment upgrades
   - zone 1 / town has strong starter flavor but not much follow-up gear identity

2. **build coverage is uneven**
   - brawler/tank feel more represented than a full mage/ranger progression line
   - there is room for more head / offhand / trinket options with mfer flavor

3. **premium gear fantasy is not distinct yet**
   - current chain gear ids are still basically starter/street gear
   - that can work, but the purchase gear identity should feel more intentional later

4. **loot themes can go harder on mfer culture**
   - more items should feel tied to:
     - being posted up
     - missed drops
     - desk junk
     - signal debris
     - old receipts / zines / stickers / lighters / hoodies / smoke / route scraps

---

## item design principles for mferland

### 1. no heroic fantasy shit
No glowing paladin helms. No jeweled broadswords. No polished king armor.

Items should feel like they came from:
- a plaza
- a desk
- a shed
- a busted route
- a hog chewed airdrop farm
- a static-blasted ridge

### 2. silhouettes should be simple and readable
Every item icon should read fast at small size.

Best shapes:
- cap / beanie / hoodie
- deck / clipboard / zine / lighter
- headphones / aux junk / mousepad / sticker stack / shard / flask

### 3. names should feel casual, not gamey
Good:
- `reply lag visor`
- `claim booth clipboard`
- `ashburn hoodie`
- `burn-hole mousepad`

Bad:
- `Helmet of Eternal Control`
- `Arcane Blade of the Mfer King`

### hard filter
If it would look natural:
- on a mfer's desk
- in a hoodie pocket
- clipped to a belt loop
- in a milk crate near the setup
- beside an ashtray and a half-dead lighter

then it probably belongs.

If it sounds like sci-fi loot, fantasy loot, or generic RPG rarity bait, kill it.

### 4. store gear should feel durable and evergreen
Not final BIS. Not trash.
Store gear should feel like:
- posted-up heirloom gear
- smoother leveling
- useful for a long time
- stronger than common gear
- still not the most prestigious thing in the whole world

### 5. zone theming should stay consistent
- **town / plaza / porch:** gm, posted up, cigarettes, lighters, stickers, notes, zines, hoodies, coffee, desk junk
- **airdrop farm:** claim-brain, missed drops, EOS scraps, crates, hog damage, patched workwear, booth junk
- **signal ridge:** static, dead channels, fried headphones, cable spaghetti, cracked screens, blue hoodies, relay glass

---

## keep / keep with minor polish
These already work and should probably stay unless a later balance pass says otherwise:

- `sealed-note`
- `hog-liver`
- `signal-scrap`
- `field-snack`
- `red-juice`
- `blue-juice`
- `farmhand-spade`
- `field-patched-hoodie`
- `ridge-runner-beanie`
- `baron-breaker-board`
- `static-loop-ring`

Optional minor copy polish later is fine, but these are already aligned.

---

## new item candidates

Below are **content-ready item candidates** that fit the existing schema.

### formatting notes
Each item includes:
- `id`
- `name`
- `quality`
- `slot` / type
- suggested `stats` if equipment
- suggested `value`
- acquisition / purpose
- `iconDescription` for the art prompt / icon brief

`iconDescription` is **not currently in the runtime schema**. It is content metadata for art / handoff.

---

## town / plaza leveling items (early game)

### 1) reply-lag-visor
```ts
{
  id: "reply-lag-visor",
  name: "reply lag visor",
  description: "sun-faded visor with two old gm pins and a brim bent from too much waiting around the fountain.",
  quality: "common",
  iconColor: "#6ea4d8",
  stackable: false,
  value: 7,
  equipment: {
    slot: "head",
    build: "Skirmisher",
    stats: {
      dexterity: 1,
      maxMana: 6,
    },
  },
  iconDescription: "A washed-out teal visor with a cracked plastic brim, two tiny enamel gm pins, and ash smudges along the edge. White background-free game icon."
}
```
**use:** early town drop / vendor item that gives skirmisher players a more mfer-specific head option.

### 2) ashburn-hoodie
```ts
{
  id: "ashburn-hoodie",
  name: "ashburn hoodie",
  description: "hoodie with cigarette pinholes, stretched cuffs, and one pocket full of sticker backs.",
  quality: "common",
  iconColor: "#b74b4b",
  stackable: false,
  value: 9,
  equipment: {
    slot: "chest",
    build: "Brawler",
    stats: {
      maxHealth: 14,
      strength: 1,
    },
  },
  iconDescription: "A faded red pullover hoodie with burn holes near the chest, sagging drawstrings, and little sticker scraps stuck to the pocket. Clean silhouette, slight grime."
}
```
**use:** better-feeling early chest upgrade without going fantasy.

### 3) receipt-zine
```ts
{
  id: "receipt-zine",
  name: "receipt zine",
  description: "tiny stapled zine made out of receipts, printouts, and one page of half-legible notes someone swore was alpha.",
  quality: "common",
  iconColor: "#56a8c4",
  stackable: false,
  value: 7,
  equipment: {
    slot: "offHand",
    build: "Mage",
    stats: {
      magic: 2,
      maxMana: 5,
    },
  },
  iconDescription: "A miniature stapled zine made from folded receipts and photocopied pages, with blue pen marks and one dog-eared corner. Feels handmade and desk-born."
}
```
**use:** gives casters a more grounded offhand progression piece in town.

### 4) headphone-splitter
```ts
{
  id: "headphone-splitter",
  name: "headphone splitter",
  description: "cheap aux splitter with one loose jack and a tape fix that somehow still keeps the session together.",
  quality: "common",
  iconColor: "#c9a15f",
  stackable: false,
  value: 8,
  equipment: {
    slot: "trinket",
    build: "Hybrid",
    stats: {
      dexterity: 1,
      magic: 1,
    },
  },
  iconDescription: "A scratched little Y-shaped aux splitter with black electrical tape near one jack and worn silver metal at the tips. Tiny, pocketable, obviously desk-tech junk."
}
```
**use:** early hybrid trinket option that feels tied to the universal mfer headphones setup.

---

## airdrop farm items (midgame)

### 5) claim-booth-cap
```ts
{
  id: "claim-booth-cap",
  name: "claim booth cap",
  description: "sun-cooked work cap from the busted farm booth. brim still smells like hot plastic and cope.",
  quality: "uncommon",
  iconColor: "#8b6d45",
  stackable: false,
  value: 22,
  equipment: {
    slot: "head",
    build: "Tank",
    stats: {
      maxHealth: 16,
      strength: 1,
    },
  },
  iconDescription: "A dusty tan work cap with a cracked claim-ticket patch stitched on the front and dirt packed into the seams. Farmwear, not military."
}
```
**use:** midgame head piece for tank/bruiser route without feeling like a medieval helmet.

### 6) airdrop-burn-hoodie
```ts
{
  id: "airdrop-burn-hoodie",
  name: "airdrop burn hoodie",
  description: "hoodie from someone who stood in line too long and started seeing allocation patterns in the dirt.",
  quality: "uncommon",
  iconColor: "#5a7c58",
  stackable: false,
  value: 26,
  equipment: {
    slot: "chest",
    build: "Skirmisher",
    stats: {
      maxHealth: 18,
      dexterity: 2,
    },
  },
  iconDescription: "A moss-green hoodie with frayed sleeves, a crooked white claim-ticket graphic, and dust around the hem. Lived-in, stressed, rural crypto degen vibe."
}
```
**use:** midgame chest option for dex players.

### 7) allocation-rake
```ts
{
  id: "allocation-rake",
  name: "allocation rake",
  description: "farm rake turned crowd-control tool after one too many arguments about snapshots.",
  quality: "uncommon",
  iconColor: "#8f6640",
  stackable: false,
  value: 25,
  equipment: {
    slot: "mainHand",
    build: "Brawler",
    stats: {
      strength: 4,
      dexterity: 1,
    },
  },
  iconDescription: "A wooden-handled rake with three bent metal teeth, wrapped grip tape, and a torn claim-band tied near the head. Strong silhouette."
}
```
**use:** midgame brawler weapon alternative to the spade.

### 8) claim-clipboard
```ts
{
  id: "claim-clipboard",
  name: "claim clipboard",
  description: "clipboard with old token lists, crossed-out names, and one corner chewed by something mean and local.",
  quality: "uncommon",
  iconColor: "#6a92b6",
  stackable: false,
  value: 24,
  equipment: {
    slot: "offHand",
    build: "Mage",
    stats: {
      magic: 2,
      maxMana: 10,
    },
  },
  iconDescription: "A battered clipboard with curled papers clipped on, some highlighted rows, and a muddy bite missing from one corner. Cool blue-gray office junk."
}
```
**use:** midgame mage offhand with strong farm/claim flavor.

### 9) missed-creyzies-keychain
```ts
{
  id: "missed-creyzies-keychain",
  name: "missed creyzies keychain",
  description: "cheap creature keychain carried by someone who swears they were one refresh away from making it.",
  quality: "uncommon",
  iconColor: "#d97968",
  stackable: false,
  value: 21,
  equipment: {
    slot: "trinket",
    build: "Hybrid",
    stats: {
      dexterity: 1,
      magic: 1,
      maxMana: 8,
    },
  },
  iconDescription: "A plastic creature-shaped keychain with chipped paint, a broken clasp, and one tiny anxious cartoon eye still visible. Warm salmon-red palette."
}
```
**use:** mfer-ified midgame trinket that directly references the farm’s missed-drop sickness.

### 10) crate-chip
```ts
{
  id: "crate-chip",
  name: "crate chip",
  description: "splinter of broken airdrop crate. worthless to the market, weirdly useful to the town.",
  quality: "common",
  iconColor: "#8f6d4d",
  stackable: true,
  value: 4,
  iconDescription: "A jagged wood splinter with a bit of faded stencil lettering and a rusty nail hole. Dry brown wood, rough edges."
}
```
**use:** simple midgame material drop to deepen the farm item pool.

---

## signal ridge items (late leveling)

### 11) deadzone-beanie
```ts
{
  id: "deadzone-beanie",
  name: "deadzone beanie",
  description: "black knit beanie that dampens bad chatter and keeps just enough of the useful signal alive.",
  quality: "rare",
  iconColor: "#4d8fb8",
  stackable: false,
  value: 34,
  equipment: {
    slot: "head",
    build: "Mage",
    stats: {
      magic: 2,
      dexterity: 2,
      maxMana: 10,
    },
  },
  iconDescription: "A dark knit beanie with a stitched blue waveform patch and tiny frost-static flecks across the fabric. Cool blue-black palette, snug silhouette."
}
```
**use:** late-game headpiece for caster/skirmisher crossover.

### 12) static-zip-hoodie
```ts
{
  id: "static-zip-hoodie",
  name: "static zip hoodie",
  description: "ridge hoodie with blue static stitched through the seams and little cable ends living in both pockets.",
  quality: "rare",
  iconColor: "#5672c9",
  stackable: false,
  value: 38,
  equipment: {
    slot: "chest",
    build: "Mage",
    stats: {
      maxHealth: 16,
      magic: 3,
      maxMana: 10,
    },
  },
  iconDescription: "A cobalt zip hoodie with a bright pale zipper, dark cuff wear, and tiny loose cable strands poking from one pocket. Clearly clothing a mfer would actually wear."
}
```
**use:** real ridge-zone chest reward option for caster line.

### 13) stickered-laptop-lid
```ts
{
  id: "stickered-laptop-lid",
  name: "stickered laptop lid",
  description: "dead laptop top ripped off at the hinge and carried like it still owes you one more post.",
  quality: "rare",
  iconColor: "#9fa7b5",
  stackable: false,
  value: 36,
  equipment: {
    slot: "offHand",
    build: "Tank",
    stats: {
      maxHealth: 20,
      strength: 2,
    },
  },
  iconDescription: "A matte dark laptop lid with layered worn stickers, one cracked corner, and grip tape on the edge where someone started using it like a shield. Computer junk, not military gear."
}
```
**use:** late-game tank offhand that feels directly tied to posting/computer life.

### 14) burn-hole-mousepad
```ts
{
  id: "burn-hole-mousepad",
  name: "burn hole mousepad",
  description: "rolled-up mousepad with two cigarette burns and one sweet spot worn smooth by years of late-night posting.",
  quality: "rare",
  iconColor: "#9a7cff",
  stackable: false,
  value: 35,
  equipment: {
    slot: "trinket",
    build: "Hybrid",
    stats: {
      dexterity: 2,
      magic: 2,
      maxMana: 12,
    },
  },
  iconDescription: "A dark blue mousepad rolled at one edge, with cigarette burn holes, ash smears, and a faded static-like pattern rubbed smooth in the middle. Extremely desk-coded."
}
```
**use:** rare ridge trinket alternative to the minimap ring that feels like actual mfer desk debris.

### 15) uplink-glass
```ts
{
  id: "uplink-glass",
  name: "uplink glass",
  description: "thin shard of blue relay glass. buzzes if you hold it too long.",
  quality: "common",
  iconColor: "#74c8ff",
  stackable: true,
  value: 5,
  iconDescription: "A sharp translucent shard of cyan-tinted glass with a little electrical glow along the edge. Clean faceted silhouette."
}
```
**use:** ridge material drop to make the biome feel less empty between quest items and rare gear.

---

## optional consumable additions

These are optional, but they would help the item pool feel more alive.

### 16) corner-store-coffee
```ts
{
  id: "corner-store-coffee",
  name: "corner store coffee",
  description: "burnt gas-station coffee in a paper cup. tastes bad. works anyway.",
  quality: "common",
  iconColor: "#8b5d38",
  stackable: true,
  value: 6,
  consumable: {
    kind: "food",
    health: 10,
    mana: 20,
    cooldownMs: 12000,
  },
  iconDescription: "A squat paper coffee cup with a brown lid, heat sleeve, and marker scribble that just says gm. Slight spill stain down the side."
}
```
**use:** town/ridge mana-leaning consumable that feels very on-brand.

### 17) ash-mint-tonic
```ts
{
  id: "ash-mint-tonic",
  name: "ash mint tonic",
  description: "cold fizzy tonic with a clean hit up front and an ashtray finish you learn to respect.",
  quality: "common",
  iconColor: "#67c9b1",
  stackable: true,
  value: 9,
  consumable: {
    kind: "potion",
    health: 32,
    mana: 32,
    cooldownMs: 15000,
  },
  iconDescription: "A green glass bottle with a silver cap, condensation, and a tiny mint leaf logo scratched into the label. Bright but grimy."
}
```
**use:** hybrid restore option that feels more mfer than a generic potion.

---

## premium / purchased gear direction (do not fully lock balance yet)

This part should stay a **candidate direction only** until the full gear pass.

### important note
If we want the lowest-risk implementation path, we should probably **keep the current chain item ids and mapping for now**:
- `rusty-skate-deck`
- `road-sign-lid`
- `lucky-lighter`

Those are already wired into:
- tests
- local chain gear mapping
- store UI assumptions

So the easiest route is:
- keep those ids for now
- improve their copy / icon / premium identity later in the full gear pass

### premium gear fantasy recommendation
Purchased gear should feel like:
- heirloom-style posted-up gear
- better than common gear
- useful from low level through most of the curve
- not the final prestige chase

### candidate premium gear identities
These are themes, not final balance locks:

#### gearType 1 / mainHand
**posted-up deck**
- keep low-risk id: `rusty-skate-deck` for now if needed
- premium fantasy: a scarred, sticker-layered deck that always feels like your dependable swing piece
- iconDescription: "A heavyweight skateboard deck with stacked worn stickers, charred grip edges, and a taped handle grip near the trucks."

#### gearType 2 / offHand
**do-what-u-want lid**
- keep low-risk id: `road-sign-lid` for now if needed
- note: this is a current carryover, not the cleanest mfer fantasy
- premium fantasy later should probably move toward something more desk/computer-native, like a stickered laptop lid or similar posted-up junk shield
- iconDescription (if kept for now): "A chopped scrap-metal lid with worn paint, sticker residue, and a welded grip bar on the back. More improvised street junk than official sign gear."

#### gearType 3 / trinket
**last-cig lighter**
- keep low-risk id: `lucky-lighter` for now if needed
- premium fantasy: the pocket item that says 'mfer' immediately and scales as evergreen paid gear
- iconDescription: "A chrome flip lighter with soot around the lid, a tiny scratched gm on the front, and a small orange ember glow at the hinge."

---

## recommended item distribution by zone

### town / plaza
Focus on:
- low-level gear variety
- zines / receipts / caps / hoodies / lighters / aux junk / desk clutter
- mana/utility items that feel desk-born instead of magical-fantasy

### airdrop farm
Focus on:
- patched workwear
- claim booth junk
- crate scraps
- missed-drop cope objects
- weapons that look improvised from farm / booth gear

### signal ridge
Focus on:
- relay glass
- fried headphone/cable junk
- cracked screen / laptop debris
- blue/static palette
- more rare utility / caster / hybrid identity

---

## implementation notes for codex

### shared item data
Primary file:
- `packages/shared/src/items.ts`

### icon paths
If new item ids are added, also update:
- `apps/web/src/components/hud/iconAssets.ts`

And add PNGs under something like:
- `apps/web/public/icons/items/<item-id>.png`

### loot tables
If new drops are added by biome/NPC type, update:
- `apps/server/src/systems/loot.ts`

### quest rewards
If any new items become quest rewards, update:
- `packages/shared/src/quests.ts`

### store gear
If premium purchased gear ids change instead of staying low-risk:
- `packages/shared/src/items.ts`
- `packages/shared/src/items.test.ts`
- anything using `CHAIN_GEAR_ITEM_IDS`
- possibly store UI text in `CryptoStorePanel.tsx`

---

## strong recommendation summary

### do now
- add more mfer-native early/mid/late gear variety
- keep items grounded in plaza / farm / ridge junk culture
- add art briefs per item so icons don’t drift generic fantasy
- fill out mage / ranger / hybrid progression options

### be careful about
- over-adding power before the full gear pass
- changing chain gear ids too early
- introducing new mechanics when the current schema is still simple

### best immediate move
Use this pass to:
1. enrich item flavor and progression variety
2. keep stat bands close to current item ranges
3. defer final purchased-gear balance until the dedicated gear pass

---

## minimal first-wave picks if we want to stay lean

If we only add a few items right now, my first picks would be:
- `reply-lag-visor`
- `receipt-zine`
- `headphone-splitter`
- `claim-booth-cap`
- `claim-clipboard`
- `deadzone-beanie`
- `burn-hole-mousepad`
- `corner-store-coffee`

That would already make the item world feel a lot more mfer and a lot less placeholder.

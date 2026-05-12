# mferland gear pass

## purpose
This is the **actual gear pass** for mferland.

It covers:
- starter gear
- world-drop gear as players progress through the world
- quest reward gear
- premium store gear
- 3-person boss drops
- 10-person raid boss drops

This is meant to be a Codex-ready handoff grounded in the **current repo wiring**, not a fake design doc that ignores the game.

---

## repo constraints confirmed

I checked the live files:
- `packages/shared/src/items.ts`
- `packages/shared/src/quests.ts`
- `apps/server/src/systems/loot.ts`
- `apps/server/src/systems/npcs.ts`
- `apps/web/src/components/CryptoStorePanel.tsx`
- `packages/chain/src/MferGearStore.sol`

### current realities
- max level is **10**
- gear slots are only:
  - `head`
  - `chest`
  - `mainHand`
  - `offHand`
  - `trinket`
- qualities are only:
  - `common`
  - `uncommon`
  - `rare`
  - `quest`
- store/chain gear is currently wired for only **3 gear types**
- current chain gear tier scaling is already:
  - tier 1 = base
  - tier 2 = `+33%`
  - tier 3 = `+66%`
- current quest rewards already include:
  - `field-patched-hoodie`
  - `ridge-runner-beanie`
  - `baron-breaker-board`
- current important bosses are:
  - `static-baron-nox` = **The Centralizer** → should be treated as the **3-person party boss**
  - `raid-ogre-mfer` = **too much signal** → should be treated as the **10-person daily raid boss**

### current store gear wiring
Current store gear uses only 3 chain gear item ids:
- `gearType 1 -> rusty-skate-deck`
- `gearType 2 -> road-sign-lid`
- `gearType 3 -> lucky-lighter`

So the safest alpha move is:
- keep those ids internally
- upgrade their **display fantasy / art / copy** to fit the final store plan

---

## core gear philosophy

### 1. gear should feel mfer, not fantasy
The gear should come from:
- desk life
- porch life
- cigarettes / lighters / ashtray vibe
- hoodies / beanies / headphones
- zines / receipts / sticker junk
- busted computer / cable / audio / posting clutter
- airdrop farm cope objects
- route gear and stash junk

Not from:
- heroic fantasy
- random sci-fi artifact slop
- generic MMO loot nouns

### 2. real gear should mostly come from mfers, quests, and bosses
This matters.

Animals should mostly drop:
- materials
- teeth
- tusks
- antlers
- snacks
- juice

**Not actual mfer gear**, except for weird reclaimed edge cases like hog-chewed stash junk.

Actual gear should mostly come from:
- starter loadout
- town quest rewards
- farm mfers
- ridge mfers
- story bosses
- raid bosses
- premium chain store

### 3. store gear should be evergreen, not prestige-BIS
Store gear should be:
- strong
- smooth
- useful from low level to cap
- better than normal common gear
- still not the coolest or most prestigious thing in the game

### 4. world progression should feel real
The gear ladder should feel like:
- **town** = posted-up starter / desk junk / low-tier wearable upgrades
- **airdrop farm** = claim-brain gear / patched workwear / missed-drop cope junk
- **signal ridge** = static gear / cracked screen junk / fried headphone / uplink debris
- **3-person boss** = first real prestige world drops
- **10-person raid** = strongest prestige drops in current alpha

---

## target level bands

Use these as tuning bands, not hard locks:

- **levels 1-2** → plaza / town / fountain / starter
- **levels 3-5** → airdrop farm / route post
- **levels 6-8** → signal ridge
- **levels 8-9** → Centralizer 3-person boss
- **level 10** → too much signal 10-person daily raid

---

## current gear that should stay

These items already fit well enough and should stay in the progression plan:

### starter / early
- `frayed-cap`
- `plaza-hoodie`
- `rusty-skate-deck`
- `bent-slingshot`
- `stickered-wand`
- `road-sign-lid` *(internal carryover; fantasy should improve later)*
- `pocket-zine`
- `lucky-lighter`

### farm / ridge / boss
- `farmhand-spade`
- `field-patched-hoodie`
- `ridge-runner-beanie`
- `baron-breaker-board`
- `static-loop-ring`
- `boar-bristle-cap`

### current items that feel weakest / should probably be replaced or re-skinned later
- `antler-charm`
- `road-sign-lid` display fantasy

---

## progression structure

## 1) starter gear: everyone begins posted up

### starter set (existing)
- `frayed-cap`
- `plaza-hoodie`
- `rusty-skate-deck`
- `road-sign-lid`
- `lucky-lighter`

### role starter alternates (existing)
- `bent-slingshot`
- `stickered-wand`
- `pocket-zine`

### purpose
Starter gear should say:
- you are already in the world
- you already have mfer-coded junk
- you are not naked and generic

---

## 2) town gear: first upgrades should come from questing, not random wildlife

### town gear goals
Town gear should be:
- low power
- flavorful
- clearly better than default in some slots
- obtained mostly from **quests** and maybe a few light town-side drops later

### recommended town quest gear

#### `reply-lag-visor`
```ts
{
  id: "reply-lag-visor",
  name: "reply lag visor",
  description: "sun-faded visor with a bent brim and two tiny gm pins. looks like it survived three long plaza afternoons and one dumb argument.",
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
  iconDescription: "A washed-out teal visor with a cracked plastic brim, two tiny enamel gm pins, and ash smudges along the edge. Small readable silhouette."
}
```
**recommended source:** `fountain-vibes` quest reward

#### `receipt-zine`
```ts
{
  id: "receipt-zine",
  name: "receipt zine",
  description: "little stapled zine made from receipts, printouts, and one page of half-legible notes someone swore was alpha.",
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
  iconDescription: "A miniature stapled zine made from folded receipts and photocopied pages, with blue pen marks and one dog-eared corner. Handmade desk-junk look."
}
```
**recommended source:** `ask-mfergpt` quest reward

#### `headphone-splitter`
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
**recommended source:** `mfergpt-checkin` quest reward

### town gear note
Town should give players:
- one head upgrade
- one offhand caster-flavored upgrade
- one trinket upgrade

That makes early questing feel immediately useful without flooding the player with too much gear.

---

## 3) farm gear: this is where actual world progression starts

### farm gear goals
Airdrop farm gear should feel like:
- busted claim booth junk
- patched workwear
- missed-drop delusion objects
- stronger than town gear
- mostly dropped by **farm mfers**, not animals

### keep existing farm pieces
- `farmhand-spade`
- `field-patched-hoodie`
- `boar-bristle-cap`

### recommended new farm progression items

#### `claim-booth-cap`
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
**recommended source:** low chance farm mfer drop, or `hog-livers`/`feral-farmers` reward candidate

#### `airdrop-burn-hoodie`
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
**recommended source:** farm mfer uncommon drop

#### `claim-clipboard`
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
**recommended source:** farm caster drop

#### `missed-creyzies-keychain`
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
  iconDescription: "A plastic creature keychain with chipped paint, a broken clasp, and one tiny anxious cartoon eye still visible. Cheap, cope-coded pocket junk."
}
```
**recommended source:** farm rare/uncommon drop from named farmers

#### `stickerbomb-sling`
```ts
{
  id: "stickerbomb-sling",
  name: "stickerbomb sling",
  description: "scrappy slingshot wrapped in tape and covered in half-peeled sticker fragments. ugly, fast, accurate enough.",
  quality: "uncommon",
  iconColor: "#658d58",
  stackable: false,
  value: 25,
  equipment: {
    slot: "mainHand",
    build: "Ranger",
    stats: {
      dexterity: 5,
    },
  },
  iconDescription: "A forked slingshot with black tape on the grip and layers of torn old stickers across the frame. Rubber band slightly mismatched."
}
```
**recommended source:** farm mfer drop, especially from melee farmhands

### farm quest rewards
Strong recommendation:
- keep `field-patched-hoodie` on `field-camp-delivery`
- consider making **one** of the town quest rewards and **one** of the farm rewards guaranteed so progression feels reliable

---

## 4) ridge gear: strongest normal world-drop set before bosses

### ridge gear goals
Signal Ridge should feel like:
- computer junk
- fried headphones
- cracked screens
- static-worn hoodies
- burnt desk objects that somehow became gear

### keep existing ridge pieces
- `ridge-runner-beanie`
- `static-loop-ring`

### recommended new ridge progression items

#### `deadzone-beanie`
```ts
{
  id: "deadzone-beanie",
  name: "deadzone beanie",
  description: "black knit beanie that keeps most of the bad chatter outside your skull and the useful signal barely audible.",
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
**recommended source:** ridge raider drop / rare ridge questline reward candidate

#### `static-zip-hoodie`
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
**recommended source:** ridge raider rare drop

#### `router-antenna-wand`
```ts
{
  id: "router-antenna-wand",
  name: "router antenna wand",
  description: "old router antenna on a taped handle. it should not work this well. it also should not hiss.",
  quality: "rare",
  iconColor: "#6f73d8",
  stackable: false,
  value: 38,
  equipment: {
    slot: "mainHand",
    build: "Mage",
    stats: {
      magic: 6,
      maxMana: 12,
    },
  },
  iconDescription: "A black router antenna bolted onto a wrapped hand grip with a little blue LED glow near the base. Feels improvised from desk/network junk."
}
```
**recommended source:** ridge caster drop / raid-shared table

#### `bottlecap-sling`
```ts
{
  id: "bottlecap-sling",
  name: "bottlecap sling",
  description: "cleaner, meaner sling that throws bottlecaps hard enough to count as philosophy.",
  quality: "rare",
  iconColor: "#6f9f63",
  stackable: false,
  value: 36,
  equipment: {
    slot: "mainHand",
    build: "Ranger",
    stats: {
      dexterity: 6,
    },
  },
  iconDescription: "A compact slingshot with polished fork tips, wrapped grip tape, and a few dented bottlecaps tucked under a rubber band at the base."
}
```
**recommended source:** ridge raider melee drop / raid-shared table

#### `stickered-laptop-lid`
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
  iconDescription: "A matte dark laptop lid with layered worn stickers, one cracked corner, and grip tape on the edge where someone started using it like a shield."
}
```
**recommended source:** ridge boss / raid-shared offhand drop

#### `burn-hole-mousepad`
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
  iconDescription: "A dark blue mousepad rolled at one edge, with cigarette burn holes, ash smears, and a faded static-like pattern rubbed smooth in the middle."
}
```
**recommended source:** ridge trinket drop / raid-shared table

---

## 5) quest gear: milestone rewards should carry the player forward

### recommendation
Quest rewards should form a visible progression spine.

### recommended quest reward map

- `mfergpt-checkin` → `headphone-splitter`
- `fountain-vibes` → `reply-lag-visor`
- `ask-mfergpt` → `receipt-zine`
- `field-camp-delivery` → `field-patched-hoodie` *(already exists)*
- `signal-scraps` → `ridge-runner-beanie` *(already exists)*
- `baron-of-static` → `baron-breaker-board` *(already exists)*

### why this works
It gives players:
- early town reward satisfaction
- a reliable chest upgrade in farm progression
- a reliable head upgrade in ridge progression
- a strong story-boss weapon reward

That is a clean backbone.

---

## 6) normal drop philosophy by enemy family

## animals
### rabbits
Keep mostly:
- `small-tooth`
- `field-snack`

### deer
Keep mostly:
- `worn-antler`
- `field-snack`
- `blue-juice`

### hogs
Keep:
- `muddy-tusk`
- `small-tooth`
- `field-snack`
- `red-juice`
- `hog-liver` during quest
- `boar-bristle-cap` as rare reclaimed weirdness

### important note
Animals should **not** become the main source of actual mfer gear.

---

## human / mfer enemies
### farm mfers should drop most midgame gear
Recommended farm drop table focus:
- `farmhand-bandana` / materials
- `farmhand-spade`
- `airdrop-burn-hoodie`
- `claim-booth-cap`
- `claim-clipboard`
- `missed-creyzies-keychain`
- `stickerbomb-sling`

### ridge raiders should drop most late-game normal gear
Recommended ridge drop table focus:
- `signal-scrap` during quest
- `deadzone-beanie`
- `static-zip-hoodie`
- `router-antenna-wand`
- `bottlecap-sling`
- `stickered-laptop-lid`
- `burn-hole-mousepad`
- `static-loop-ring`

---

## 7) store gear: premium evergreen A-tier

### design rule
Store gear should be:
- available to any wallet user who wants to spend
- stronger than common world gear
- evergreen across levels
- not final prestige BIS
- tier-upgradeable to 3 tiers if that system stays

### current alpha constraint
Current store contract/UI only support **3 chain gear SKUs**.

So for alpha, use:
- 1 premium brawler mainHand
- 1 premium tank offHand
- 1 premium hybrid trinket

### recommendation: keep current internal ids, upgrade the fantasy

#### gearType 1 → internal id `rusty-skate-deck`
**display fantasy:** `posted-up deck`
- role: brawler heirloom weapon
- theme: scarred, sticker-layered, dependable, used constantly
- iconDescription: "A heavyweight skateboard deck with stacked worn stickers, charred grip edges, and a taped handle grip near the trucks."

#### gearType 2 → internal id `road-sign-lid`
**display fantasy:** `stickered laptop lid`
- role: tank heirloom offhand
- theme: posted-up junk shield, more computer-native than street-sign-coded
- iconDescription: "A dark laptop lid with worn stickers, chipped corners, and a grip strap bolted on the back. Should feel like improvised computer junk, not road hardware."

#### gearType 3 → internal id `lucky-lighter`
**display fantasy:** `last-cig lighter`
- role: hybrid heirloom trinket
- theme: iconic mfer pocket item, always useful, never top prestige
- iconDescription: "A chrome flip lighter with soot around the lid, a tiny scratched gm on the front, and a faint ember glow at the hinge."

### store power position
Store gear should sit here:
- above most common/uncommon drops
- competitive with many rare drops
- below the coolest 10-person raid prestige gear

### important
Do **not** let store gear invalidate:
- boss drops
- raid drops
- milestone quest rewards

Store gear should feel like:
**the reliable expensive option**, not the whole point of the game.

---

## 8) 3-person boss gear: The Centralizer

### boss identity
- boss id: `static-baron-nox`
- display name: **The Centralizer**
- intended content role: **3-person party boss / story prestige encounter**

### loot philosophy
The Centralizer should be the first place players get drops that feel:
- noticeably prestigious
- weirdly personal
- closer to true end-of-zone gear

### recommended 3-person boss loot plan

#### guaranteed first-clear story reward
- `baron-breaker-board` via quest completion *(already exists and should stay)*

#### repeatable boss drop pool
- `static-loop-ring` *(keep)*
- `feedback-headphones`
- `logoff-hoodie`

#### `feedback-headphones`
```ts
{
  id: "feedback-headphones",
  name: "feedback headphones",
  description: "over-ear cans pulled off the centralizer stack. one side hisses, both sides still lock you in.",
  quality: "rare",
  iconColor: "#6b84ff",
  stackable: false,
  value: 42,
  equipment: {
    slot: "head",
    build: "Hybrid",
    stats: {
      dexterity: 2,
      magic: 2,
      maxMana: 12,
    },
  },
  iconDescription: "A pair of chunky over-ear headphones with a cracked blue-black shell, coiled cable, and one earcup marked by static scratches. Instantly reads as mfer iconography."
}
```
**recommended source:** Centralizer drop pool, low rate

#### `logoff-hoodie`
```ts
{
  id: "logoff-hoodie",
  name: "logoff hoodie",
  description: "thick black hoodie that feels like the room got quieter the second you pulled it on.",
  quality: "rare",
  iconColor: "#4b4f63",
  stackable: false,
  value: 40,
  equipment: {
    slot: "chest",
    build: "Skirmisher",
    stats: {
      maxHealth: 18,
      dexterity: 3,
    },
  },
  iconDescription: "A heavy black zip hoodie with dark wear at the cuffs, a barely-visible static pattern, and a faded chest print that looks like a cut signal wave."
}
```
**recommended source:** Centralizer drop pool, low rate

### recommendation
Centralizer should be a tight, desirable 3-person farm with:
- one guaranteed story weapon
- two or three chase drops
- no giant overstuffed loot table

---

## 9) 10-person daily raid boss gear: too much signal

### boss identity
- boss id: `raid-ogre-mfer`
- display name: **too much signal**
- intended content role: **10-person daily raid boss**

### loot philosophy
This should be the strongest prestige loot source in current alpha.

It should drop gear that feels:
- louder
- more iconic
- more “holy shit that’s mfer trash but god-tier”
- stronger than normal ridge drops
- still grounded in desk/posting/computer life

### recommended 10-person raid loot pool

- `feedback-headphones`
- `static-loop-ring`
- `stickered-laptop-lid`
- `burn-hole-mousepad`
- `router-antenna-wand`
- `bottlecap-sling`
- `all-nighter-hoodie`

#### `all-nighter-hoodie`
```ts
{
  id: "all-nighter-hoodie",
  name: "all nighter hoodie",
  description: "big washed-out hoodie that smells like cold coffee, stale smoke, and a decision to keep posting anyway.",
  quality: "rare",
  iconColor: "#505a78",
  stackable: false,
  value: 44,
  equipment: {
    slot: "chest",
    build: "Hybrid",
    stats: {
      maxHealth: 20,
      dexterity: 2,
      magic: 2,
    },
  },
  iconDescription: "A loose gray-blue hoodie with stretched cuffs, coffee stain specks, and burn dots near the pocket. Big silhouette, very human, very mfer."
}
```
**recommended source:** 10-person raid chest drop

### raid loot structure recommendation
For alpha, keep the raid table relatively small and desirable.

Good shape:
- 1 head chase
- 1 chest chase
- 2 mainHand chases (ranger + mage)
- 1 offHand chase
- 1 trinket chase
- 1 utility trinket shared chase (`static-loop-ring`)

### very important
10-person raid loot should be the coolest gear in current alpha.

Not because it has crazy neon fantasy stats.
Because it feels like:
- the strongest version of mfer life junk
- the most iconic wearables
- the best posting-tech debris in the game

---

## 10) full progression summary

## town / early progression
- `frayed-cap`
- `plaza-hoodie`
- `rusty-skate-deck`
- `road-sign-lid`
- `lucky-lighter`
- `reply-lag-visor`
- `receipt-zine`
- `headphone-splitter`

## farm / mid progression
- `farmhand-spade`
- `field-patched-hoodie`
- `claim-booth-cap`
- `airdrop-burn-hoodie`
- `claim-clipboard`
- `missed-creyzies-keychain`
- `stickerbomb-sling`
- `boar-bristle-cap`

## ridge / late normal progression
- `ridge-runner-beanie`
- `deadzone-beanie`
- `static-zip-hoodie`
- `router-antenna-wand`
- `bottlecap-sling`
- `stickered-laptop-lid`
- `burn-hole-mousepad`
- `static-loop-ring`

## 3-person boss progression
- `baron-breaker-board`
- `feedback-headphones`
- `logoff-hoodie`
- `static-loop-ring`

## 10-person raid progression
- `feedback-headphones`
- `all-nighter-hoodie`
- `router-antenna-wand`
- `bottlecap-sling`
- `stickered-laptop-lid`
- `burn-hole-mousepad`
- `static-loop-ring`

## premium store progression
- `posted-up deck` *(internal id `rusty-skate-deck`)*
- `stickered laptop lid` *(internal id `road-sign-lid` for now)*
- `last-cig lighter` *(internal id `lucky-lighter`)*

---

## 11) implementation notes for Codex

### items
Primary file:
- `packages/shared/src/items.ts`

### quest rewards
Update quest item rewards in:
- `packages/shared/src/quests.ts`

### loot tables
Update world loot in:
- `apps/server/src/systems/loot.ts`

### icon assets
Add item icon paths in:
- `apps/web/src/components/hud/iconAssets.ts`

Add art files under:
- `apps/web/public/icons/items/<item-id>.png`

### store display fantasy
If keeping current chain ids but changing the fantasy/copy:
- `packages/shared/src/items.ts`
- `apps/web/src/components/CryptoStorePanel.tsx`
- any store-facing labels / previews

### tests
If changing chain gear mapping ids, update:
- `packages/shared/src/items.test.ts`

### quality note
Current item quality enum tops out at `rare`.
So for now:
- mark boss/raid items as `rare`
- use source/drop context + icon art to signal prestige

Do **not** block this pass waiting for a new `epic` or `legendary` tier.

---

## 12) strongest recommendations

### definitely do
- make quest rewards a real early/mid/late progression spine
- make farm mfers the main source of midgame gear
- make ridge raiders the main source of late normal gear
- make boss gear feel iconic through mfer objects, not fantasy nouns
- keep store gear evergreen but not ultimate prestige

### avoid
- random wildlife dropping lots of actual gear
- generic sci-fi signal junk with no mfer visual meaning
- road-sign fetish unless it is just a temporary internal carryover
- overcomplicated loot tables
- store gear beating raid prestige drops

### one-line direction
The best gear in mferland should feel like:
**the most powerful possible version of actual mfer life junk**

hoodies, headphones, lighters, zines, laptop debris, mousepads, stickered trash, all-night wear, and posted-up objects that somehow became legendary without ever becoming high fantasy.

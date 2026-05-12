# mferland quest retheme plan

## goal
Retheme the existing quest chain so it feels deeply mfer without changing the underlying gameplay structure.

This is a **theme/copy pass first**, not a systems rewrite.

---

## core rule

**Keep these unchanged:**
- quest ids
- quest order / chain progression
- required kill counts / collect counts
- npc positions
- repeat cooldowns
- drop mechanics
- turn-in wiring
- combat roles / target ids

**Change these:**
- quest titles
- quest descriptions
- objective labels
- turn-in labels
- npc display names
- npc dialogue
- enemy display names
- quest item display names / descriptions
- reward item display names / descriptions where useful
- quest completion text
- mferGPT quest hints

---

## important theme correction
There is **no board** in this world.

Replace the old "board" framing with:
- **oldheads**
- **spots**
- **the plaza**
- **the fountain**
- **whoever is still posted up**

### approved replacements
- `dao-mfer` display name -> **oldhead mfer**
- references to "board check" -> **check with the oldheads** / **plant seeds, not promises**
- references to "route board mfer" can stay if needed for the physical route signpost, but plaza governance language should avoid "board"

### tone rule
The town is not organized. It survives through memory, habits, smoke spots, oldheads, and mfers still hanging around after Sartoshi disappeared.

---

## current primary quest chain (preserve ids and progression)
1. `mfer-beginnings`
2. `set-your-traits`
3. `dao-tour`
4. `fountain-vibes`
5. `sealed-note`
6. `farm-road-handoff`
7. `boar-bristle-cull`
8. `feral-farmers`
9. `hog-livers`
10. `field-camp-delivery`
11. `route-patrol-daily`
12. `hog-loop`
13. `ridge-dispatch`
14. `signal-scraps`
15. `cut-the-static`
16. `baron-of-static`
17. `ogre-raid-daily`

---

# zone 1 — plaza retheme

## story frame
Sartoshi is gone. The town did not die. Nobody is waiting for instructions. The plaza is held together by oldheads, habits, and whoever is still posted up.

## themes to emphasize
- gm rounds
- plant seeds, not promises
- oldheads instead of institutions
- lore survives through people, not a formal archive desk
- no explicit Sartoshi return yet

## quest-by-quest updates

### `mfer-beginnings`
**new title:** `gm rounds`

**replace current framing with:**
- OG porch mfer sends the player on a lap through the plaza
- the point is to see who is still here and learn how the town actually works
- this is not onboarding by system; it is onboarding by vibes

**new objective style:**
- `check in with oldhead mfer in the plaza`
- or `find the oldhead holding down the square`

**copy notes:**
- remove all references to board / corkboard as authority
- the oldhead is just another mfer with memory, not a quest bureaucrat

---

### `set-your-traits`
**keep gameplay unchanged**

**copy direction:**
- traits mfer tells the player to stop looking like a default tab
- make it feel like claiming your look, not opening a generic character creator

---

### `dao-tour`
**new title:** `plant seeds, not promises`

**new giver display name:** `oldhead mfer`

**replace current framing with:**
- the plaza has no board, no roadmap, no official plan
- what it has is oldheads, side-eyes, conversations, and small things people actually build
- oldhead mfer sends the player to fountain rail mfer because the fountain is where people actually know what is going on

**new objective style:**
- `find fountain rail mfer at the plaza fountain`

---

### `fountain-vibes`
**new title:** `still here`

**replace current framing with:**
- fountain rail mfer explains that after Sartoshi disappeared, the town stayed alive because mfers kept showing up
- the player returns to OG porch mfer with that realization

**new objective style:**
- `head back to OG porch mfer`

---

### `sealed-note`
**new title:** `pass the seed note`

**item display rename:**
- `sealed-note` -> **folded seed note**

**replace current framing with:**
- OG porch mfer sends a folded offchain note to drip desk mfer
- the note is about what is getting built next, not some formal dispatch
- still nobody else's business

---

### optional side quest: `ask-mfergpt`
**new title:** `grab some lore`

**keep mechanics unchanged:**
- start from drip desk mfer
- ask `@mfergpt`
- turn in to mferGPT

**new purpose:**
- the player pulls one random lore fragment from mferGPT
- this introduces the idea that town history is scattered but alive

**implementation note:**
Add a curated `LORE_SNIPPETS` array in server code for now. Do not build archive-query infrastructure in this pass.

**example snippets:**
- mfers minted at 0.069 ETH at 4:20
- skywriting over LA
- Times Square billboard
- Creyzies on 4/20
- EOS on 6/9
- Nakamigos for EOS holders
- mfercoin on Base
- AI agents are mfers

---

### optional side quest: `mfergpt-checkin`
**copy only update**
- frame it as a signal check / gm to the agent
- keep mechanics unchanged

---

### optional side quest: `tweet-town-link`
**copy only update**
- frame it as posting the plaza / spreading the town signal
- keep mechanics unchanged

---

# zone 2 — airdrop farm retheme

## story frame
This zone is full of claim-brain, airdrop mania, missed-drop cope, EOS obsession, Creyzies regret, and Nakamigos conspiracy energy. The farm has turned into a place where hogs literally ate the loot.

## themes to emphasize
- “i just missed Creyzies but i’ll catch the next one”
- hogs ate the EOS stash
- airdrop addicts have posted themselves into a trance
- Nakamigos conspiracy theorists
- this zone should be funny, sad, and very crypto

## quest-by-quest updates

### `farm-road-handoff`
**new title:** `airdrop farm handoff`

**replace current framing with:**
- drip desk mfer sends the player toward the busted farm where people are still waiting for the next drop
- this is where claim-brain starts infecting the town

---

### `boar-bristle-cull`
**new title:** `hogs in the claim pile`

**keep mechanics unchanged:** kill 10 hogs

**replace current framing with:**
- the hogs rooted through old airdrop crates and scattered the farm’s stash
- clear them out before the farmers get even worse

---

### `feral-farmers`
**new title:** `next drop sickness`

**keep mechanics unchanged:** defeat 3 named enemies

**rename named targets:**
- `farmhand-bran` -> **creyzie chaser bran**
- `farmhand-mae` -> **just-missed-it mae**
- `field-mage-sol` -> **nakamigo truther sol**

**rename ambient farm enemies:**
- `farmhand-jo` -> **snapshot jo**
- `field-mage-ren` -> **cope-loop ren**

**dialogue direction:**
- every farm enemy should sound sleep-deprived, rumor-poisoned, and addicted to the next claim cycle

---

### `hog-livers`
**new title:** `eos recovery`

**keep item id unchanged** but rename displayed item:
- `hog-liver` -> **chewed EOS**
- alternative acceptable name: **muddy EOS pass**

**keep mechanics unchanged:** collect 5 quest items from hogs

**replace current framing with:**
- the hogs swallowed old EOS pieces / pass fragments / claim stash pieces
- recover enough of them to stabilize the route

---

### `field-camp-delivery`
**new title:** `town route still works`

**replace current framing with:**
- despite all the claim-brain chaos, the route still connects back to town
- this quest is proof the world still functions

---

### `route-patrol-daily`
**new title:** `clear the claim route`

**keep mechanics unchanged**

**copy direction:**
- every day the farm gets stupid again
- clear hogs and airdrop-burnt mfers so people can still move through

---

### `hog-loop`
**new title:** `eos hog loop`

**keep mechanics unchanged**

**copy direction:**
- daily cleanup because the hogs keep eating the stash again

---

# zone 3 — signal ridge retheme

## story frame
This is the bad uplink zone: repeaters, operators, broken shells, corrupted helper agents, and too much signal. It ends with the first clean hint that Sartoshi is back as `sartoshi_rip`.

## themes to emphasize
- bad signal vs real signal
- operator-controlled repeaters
- broken helper shells / corrupted agents
- giant uplink / satellite energy
- the return signal only lands at the end of the zone

## quest-by-quest updates

### `ridge-dispatch`
**new title:** `follow the bad signal`

**replace current framing with:**
- the player pushes into the uplink zone where the signal has gone wrong
- pathfinding flavor can still reference the 0.069-mile stretch and 4:20 turn if desired

---

### `signal-scraps`
**new title:** `fried uplink scraps`

**keep item id unchanged** but rename display item:
- `signal-scrap` -> **fried uplink shard**
- alternative acceptable name: **burnt signal scrap**

**keep mechanics unchanged:** collect 4 quest items

---

### `cut-the-static`
**new title:** `kill the repeaters`

**keep mechanics unchanged:** defeat 3 named targets

**rename named targets:**
- `ridge-raider-vex` -> **operator vex**
- `ridge-raider-pax` -> **repeater pax**
- `static-mage-ori` -> **echo-shell ori**

**rename ambient ridge enemies:**
- `ridge-raider-loop` -> **loop runner**
- `ridge-raider-spark` -> **verified shell**

**dialogue direction:**
- operator vex = hostile control / command energy
- repeater pax = copy-paste echo energy
- echo-shell ori = broken assistant shell still trying to answer the wrong thing

---

### `baron-of-static`
**keep quest id unchanged**

**new title:** `log off the centralizer`

**rename boss display name:**
- `static-baron-nox` -> **The Centralizer**

**replace current framing with:**
- the boss is what happens when bad signal, control, and repetition become one big body
- this is the capstone zone boss

**critical story beat on completion:**
- after the boss goes down, the relay clears just enough for one old signature to come through
- reveal that the town catches a signal from `sartoshi_rip`
- do not over-explain it; keep it as a clean act-ending beat

**example completion tone:**
- `signal cleared. one old signature made it through: sartoshi_rip. guess the mfer’s back.`

---

### `ogre-raid-daily`
**new title options:**
- `too much signal`
- `the great repeater`

**keep mechanics unchanged**

**copy direction:**
- every 24h the uplink overloads into one huge unnecessary body
- this is the zone’s daily 10-person raid expression

---

# npc display-name and dialogue pass

## plaza npcs
- `og-mfer` -> keep **OG porch mfer**
- `dao-mfer` -> **oldhead mfer**
- `fountain-mfer` -> keep **fountain rail mfer**
- `wearables-mfer` -> keep **drip desk mfer**
- `traits-mfer` -> keep **traits mfer**
- `mfergpt` -> keep **mferGPT**

## farm npcs
- `hogwatch-mfer` -> **claimwatch mfer** or keep **hogwatch mfer** with airdrop-specific dialogue
- `field-guide-mfer` -> keep **route mfer** / **route sign mfer** / **route post mfer** depending on current feel
- `pen-keeper-mfer` -> **claim booth mfer**

## ridge npcs
- `ridge-guide-mfer` -> **signal post mfer**
- `beacon-keeper-mfer` -> **uplink shack mfer**
- `ridge-merchant` -> can stay stash-focused but mention hum / static / strange parts

## npc dialogue rule
All quest giver dialogue should sound like:
- a real mfer talking
- light on formal fantasy wording
- skeptical of institutions
- grounded in culture, not exposition dumping

---

# item rename pass

## quest items
- `sealed-note` -> **folded seed note**
- `hog-liver` -> **chewed EOS** or **muddy EOS pass**
- `signal-scrap` -> **fried uplink shard**

## reward gear (optional but recommended)
- `field-patched-hoodie` -> more farm/route/airdrop-themed name
- `ridge-runner-beanie` -> more signal-return-themed name
- `baron-breaker-board` -> **centralizer breaker** or similar

---

# exact file list for codex

## must edit
1. `packages/shared/src/quests.ts`
   - quest titles
   - descriptions
   - objective labels
   - turn-in labels

2. `apps/server/src/systems/quests.ts`
   - active quest status text
   - completion responses
   - finished quest dialogue
   - npc display-name helper text

3. `apps/server/src/systems/npcs.ts`
   - npc display names
   - npc dialogue
   - named enemy names
   - enemy dialogue

4. `packages/shared/src/items.ts`
   - item names
   - item descriptions
   - reward gear copy if desired

5. `packages/shared/src/seasonRewards.ts`
   - reward labels so admin/season text matches the retheme

6. `apps/server/src/systems/mfergpt.ts`
   - quest hint copy
   - add curated lore snippet pool for `grab some lore`
   - have mferGPT use one random snippet on that quest turn-in / response flow

## maybe edit
7. any test snapshots or asserted labels if they break from copy changes

---

# implementation notes for codex

## 1. do not add new quest ids in this pass
Reuse the existing quest chain and especially reuse `ask-mfergpt` for the lore quest.

## 2. do not add new mechanics unless necessary
The entire pass should be mostly text, naming, and flavor.

## 3. preserve the Sartoshi return as a zone 3 payoff
Do not hint too directly in zone 1 or 2.

## 4. keep the route sign / route post concept distinct from governance
If "route board" exists physically as a roadside signpost, that is fine. The important thing is to remove the idea of a central governing board from the plaza storyline.

## 5. keep future daily generation template-friendly
Later, mferGPT can generate daily bosses and daily quest text, but the mechanics should still map into bounded templates instead of freeform logic.

---

# future content hooks (not part of this pass)

## future 3-person boss archetypes
- promise trio
- echo committee
- claim brothers

## future daily hub
A plaza daily board can exist later as a **physical quest sign or signal spot**, but not as a governance symbol.

Suggested framing:
- `mferGPT daily signal`
- `plaza rumor post`
- `signal spot`
- `today’s noise`

## future daily generation inputs
- latest crypto/mfer news
- current community memes
- one boss template
- one short zone-flavor hook

---

# final creative rule
This should feel like:
- a town of mfers surviving after the founder vanished
- an airdrop farm full of claim-brain lunatics
- a ridge where bad signal becomes monsters
- and finally a clean message that says: the mfer might be back

Not fantasy kingdom. Not corporate live-service questing. Just mfers, culture, signal, and weird continuity.

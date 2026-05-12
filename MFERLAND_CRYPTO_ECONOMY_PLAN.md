# mferland crypto economy plan

## goal
Build a crypto-native economy that feels natural to crypto gamers, drives real `$MFERGPT` utility, and avoids turning normal gameplay into wallet-approval hell.

This plan assumes:
- players are comfortable with crypto
- we want to feature **ETH**, **$mfer**, and **$mfergpt**
- `$mfergpt` should be the strongest in-game value sink
- we do **not** want a separate gold currency
- we want a clean mix of **onchain ownership** and **offchain gameplay**

---

## current high-level recommendation

### launch shape
- **anon** players can enter and play, but do not persist and do not earn season eligibility
- **wallet no-pass** players can connect and persist, but stay in the probation / observer tier
- **wallet + pass** players are the full economy participants

### core economy
- canonical pricing in **ETH**
- `$mfer` = 10% discount
- burned `$mfergpt` = 25% discount
- **no gold**
- **offchain season points** instead of gold
- common loot / drops / potions / starter gear stay offchain
- premium durable gear stays onchain

---

## core decisions

### 1. remove gold entirely
Do **not** ship `MferGold` as a player-facing currency.

That means:
- no offchain gold concept
- no ERC20 gold concept
- no gold-based upgrade path
- no quest reward minting into gold
- no UI that references gold

Replace it with:
- **offchain points** for season progression / activity / airdrop weighting

### why
Gold adds a whole extra economy that is not needed and makes balancing much messier.

Right now the repo already includes:
- `MferGold.sol`
- `QuestRewardDistributor.sol`
- gear upgrades funded by burning gold
- UI actions for granting and spending gold

That should all be treated as **remove / disable for v1**.

---

### 2. use a 2-layer economy

#### premium / ownership layer = onchain
Use onchain for:
- season pass
- premium gear NFTs
- premium cosmetics
- later: special mounts / trophies / limited items / claim tickets

#### gameplay / progression layer = offchain
Use offchain for:
- quest progress
- XP / level
- season points
- daily participation
- raid participation
- airdrop eligibility weighting
- potions / food / common drops / crafting-type junk

### why
This keeps the game fast while still making the important stuff feel real and ownable.

---

### 3. `$mfergpt` should be the main premium sink
Pricing rail should be:
- base price in **ETH**
- **10% discount in `$mfer`**
- **25% discount in burned `$mfergpt`**

This makes `$mfergpt` the best value path and the strongest sink in the whole game.

---

## player tiers

## 1. anon
No wallet, no save, just exploring.

### can do
- enter town
- play the main loop
- use offchain starter gear
- test combat / movement / quests
- get a feel for the world

### cannot do
- persist progress
- earn season points that matter long-term
- qualify for airdrops
- buy premium onchain gear
- participate in the full economy

### purpose
The anon tier is the frictionless demo layer.

---

## 2. wallet, no pass
Wallet connected, persistent identity, but not fully activated.

### can do
- create / persist a character
- save progression
- show up on wallet-linked surfaces
- potentially interact with non-premium wallet features later

### should probably NOT do at launch
- earn airdrop-eligible season rewards
- claim premium seasonal loot

### purpose
This tier proves they are a real wallet user, but not yet a paying/passholding participant.

### design note
This tier is useful because it gives players a way to connect and commit before paying.

---

## 3. wallet + pass
This is the real player / economy participant tier.

### gets
- persistent progression
- season point eligibility
- airdrop eligibility
- future premium reward track access
- future special claims / seasonal drops / curated event rewards

### recommendation
This should be the tier that matters most for **seasonal rewards and eligibility**, not necessarily the only tier allowed to spend.

---

## season pass

### recommendation
Ship a season pass at:
- **0.0069 ETH**

Offer payment via:
- ETH
- `$mfer` (10% discount)
- burned `$mfergpt` (25% discount)

### what the pass does
Pass should unlock:
- airdrop eligibility
- season point eligibility
- premium reward track eligibility
- eligibility to own / buy onchain gear
- eligibility for future special raid reward claims

### what the pass should NOT do
Do not make the pass required just to try the game.

### pass value: best version for alpha
For the early alpha, the pass may be enough as:
- proof you are real
- proof you are in the season
- proof you are eligible for later drops

That may honestly be enough.

### recommendation
For alpha, keep pass utility simple:
- persistence is wallet-level
- **airdrop eligibility + season eligibility are pass-level**
- premium ownership access is pass-level

Do not overload it with too many freebies on day one.

---

## should the pass include a free onchain item?

### current recommendation
Probably **not in the earliest alpha**, unless you want one very small symbolic item.

### alpha-safe options
- **no free item**; pass is purely eligibility + access
- or one tiny symbolic item like a badge / passport / title marker

### avoid for alpha
- full starter pack
- full class loadout
- multiple NFTs bundled into pass

### why
You do not yet know the right premium value balance. Keep it lean until the loop proves itself.

---

## item split: onchain vs offchain

## offchain items (default)
These should stay offchain:
- quest items
- mob drops
- common equipment drops
- potions
- food
- temporary utility items
- random farm/ridge junk
- all frequent loot

### why
These items move constantly and should not require wallet transactions.

---

## onchain items (premium / durable)
These should be onchain:
- store gear NFTs
- premium cosmetics
- mounts
- seasonal trophy items
- curated named raid rewards (later)

### why
Onchain should mean:
- durable
- special
- ownable
- not spammy

---

## should there be quest NFTs?
### recommendation: not for initial early alpha
Do **not** make normal quest completion produce NFTs in early alpha.

### later possibility
A later seasonal or raid system can mint:
- one curated trophy NFT
- one seasonal completion marker
- one named event reward

But early alpha should not be built around quest NFTs.

---

## should random drops be onchain?
### recommendation: no, not at launch
Do **not** make normal quest or mob drops onchain.

### launch rule
- random world drops = offchain
- intentional premium claims = onchain

---

## should non-pass holders get onchain gear?
### recommendation: yes, if they have a wallet and want to spend
At launch:
- anon players still stay out of the onchain economy
- wallet players can buy / own premium onchain gear
- pass holders get the **season / airdrop / reward-track** advantages

### why
If someone has money and wants to participate in the premium economy, blocking them from buying gear is probably the wrong friction. The pass should gate **eligibility and reward status**, not basic willingness to spend.

---

## potions and consumables
### recommendation
Keep potions, food, and other consumables **100% offchain**.

Do not put them onchain.
Do not make them purchasable via token transactions per item.

---

## gear buying

### recommendation
Keep onchain gear buying, but keep the catalog small.

### v1 store scope
Launch with maybe:
- 3 to 5 premium gear items
- a clear price in ETH
- 10% off in `$mfer`
- 25% off in burned `$mfergpt`

### access recommendation
Premium gear store purchases should be **wallet-gated, not pass-gated**.

That means:
- connect wallet
- buy premium gear if you want
- buy pass if you want season / airdrop / reward-track status

---

## what purchased gear should actually be

### recommendation
Make store gear **heirloom-style premium evergreen gear**.

That means:
- usable from low level
- scales with player level
- clearly stronger than common gear
- **not** absolute best-in-slot
- stays relevant for a long time
- great for players who want to jump in and stay smooth without skipping the whole loot game

### why this is the best model
If store gear is just high-level gear:
- early players cannot use it well
- it feels like endgame skipping
- it creates stronger pay-to-win pressure

If store gear is only low-level starter junk:
- it stops mattering too fast
- it feels disposable
- it is a weak premium product

Heirloom-style gear is the sweet spot.

---

## recommended store gear model

### core rule
Store gear should be:
- **better than common drops**
- roughly **A-tier, not S-tier**
- evergreen / scaling
- limited in number
- easy to understand

### design target
A good premium item should feel like:
- smoother leveling
- cleaner power curve
- less gear frustration
- long-lived value

But it should **not** invalidate:
- rare world drops
- special raid rewards
- curated seasonal trophy gear
- top-end niche builds

---

## best-in-slot philosophy

### recommendation
Do **not** sell best-in-slot gear.

Sell gear that is:
- reliable
- flexible
- strong
- always useful

Let true BIS come from:
- raid rewards
- seasonal achievements
- rare curated world rewards
- special future content

### short version
**store gear should be premium convenience/power, not final prestige.**

---

## level scaling recommendation

### recommendation
Yes — make premium gear scale with player level.

That is the best fit for this game.

### best version
Store gear should have:
- a base stat package
- level-based scaling
- a ceiling determined by tier

### simple mental model
- tier 1 = good scaling, great for early/mid game
- tier 2 = better scaling, stays strong deeper into progression
- tier 3 = premium scaling cap, near top-tier but still not true BIS

This makes the item feel evergreen without becoming the one item that solves the entire game forever.

---

## recommended upgrade model (if kept)

### recommendation
If you keep upgrades, make them **very light**:
- 3 tiers max
- premium gear only
- each upgrade improves scaling / cap, not absurd flat power
- paid in ETH / `$mfer` / burned `$mfergpt`
- no gold, ever

### what upgrades should do
Upgrades should mostly improve:
- scaling slope
- max effectiveness at higher levels
- maybe one small side perk

### what upgrades should NOT do
Upgrades should not:
- turn premium gear into unbeatable BIS
- massively outscale raid/special loot
- create infinite progression

---

## concrete purchased gear recommendation

### launch catalog direction
Launch with a few clear archetype pieces, like:
- one offensive item
- one defensive item
- one utility/trinket item
- maybe one class-flavored alternative set later

### how they should feel
At level 1:
- clearly better than junk/common gear
- makes a new pass holder feel the difference immediately

At mid levels:
- still strong and worth using
- maybe often best-in-slot for general use

At cap / near cap:
- still very good
- but special drops / raid gear can beat it in focused roles

---

## offchain vs onchain gear interplay

### recommendation
Use this split:

#### offchain world gear
- most drops
- quest rewards
- common progression items
- experimental/fun situational stuff

#### onchain premium gear
- heirloom-style scaling gear
- premium cosmetics
- later mounts
- later curated trophy items

This gives onchain gear a clear identity:
**durable evergreen premium tools**, not random trash loot.

---

## should there be low-level premium options?

### yes
Store gear should absolutely be useful at low level.

That is a major part of the value proposition.

### but not “only low-level”
It should remain relevant because it scales.

So the right answer is:
- **low-level usable**
- **mid-game strong**
- **late-game still good, but not unbeatable**

---

## alpha recommendation on upgrades

### safest path
If alpha scope feels tight:
- ship heirloom-style scaling premium gear first
- skip upgrades in the first alpha cut
- add 3-tier upgrade path later

### acceptable alternative
If you really want a sink now:
- keep upgrades
- but only for premium onchain gear
- only 3 tiers
- only modest scaling bumps
- price in ETH / `$mfer` / burned `$mfergpt`

### recommendation
My preference is:
1. heirloom-style scaling store gear first
2. mounts later as premium sink
3. upgrades only after the base loop feels good

---

## mounts as a `$mfergpt` burn sink

### recommendation
**yes, mounts are a much better burn sink than upgrades for this stage.**

### why mounts work
- easy to understand
- premium but optional
- exciting and visible
- do not force progression complexity
- perfect for ETH / `$mfer` / `$mfergpt` pricing rails

### best mount model
Mounts should be:
- onchain premium items or claims
- purchasable with ETH / `$mfer` / burned `$mfergpt`
- mostly cosmetic or convenience focused

### avoid at first
Do not make mounts a huge combat power system.

### good v1 mount roles
- style / flex
- slightly better traversal feel
- social status / profile identity
- seasonal / themed collectibles

### recommendation
Mounts are a very strong future `$mfergpt` sink.
Likely better than upgrade complexity for alpha.

---

## points instead of gold

### recommendation
Use **offchain points** as the quest reward / season reward language.

Examples:
- season points
- signal points
- activity points
- airdrop points

### what points do
Points should:
- track questing and participation
- gate seasonal milestones
- weight airdrop distributions
- rank eligible players on leaderboards

### what points should NOT do
Points should not:
- be tradable
- be withdrawable
- be burned for onchain upgrades
- pretend to be a token

### implementation note
The repo already has offchain seasonal reward tracking and season point caps in the DB/server.
That should become the main progression reward system instead of gold.

---

## pricing model

## canonical pricing rule
Every premium product should have a **canonical ETH price**.

Examples:
- season pass: `0.0069 ETH`
- each gear SKU: fixed ETH value
- mounts: fixed ETH value
- future premium cosmetics: fixed ETH value

Then token pricing is derived from market prices.

---

## best free pricing source

### what you actually need
You do **not** need a full swap quote for these products.
You only need a reliable token/ETH reference price so you can compute:
- pass token price
- gear token price
- mount token price

### best alpha move
For alpha, the simplest free path is:
1. keep using the existing DexScreener poller
2. drop the refresh interval to **60 seconds**
3. compute onchain token prices from the ETH canonical prices

This is already close to what exists in the repo.

### better long-term move
Longer-term, best move is probably:
- **onchain pool read via free `eth_call`** against the Uniswap pool / pool state
- DexScreener as backup / sanity check

### why not a Uniswap “swap quote” as the main answer?
Because for pricing store products, a swap quote is overkill.
A quote simulates a trade amount; what you really want is just the reference market price.

### recommendation
- **alpha:** DexScreener every 60 seconds is fine and already implemented
- **later hardening:** direct onchain pool price read via free RPC `eth_call`

---

## critical contract reality check

### launch pass contract is mostly compatible
`MferLaunchPass.sol` already stores:
- `ethPrice`
- `mferPrice`
- `mferGptPrice`

That means an updater can recalculate prices every minute and push them onchain.

### gear store contract is NOT compatible as-is
`MferGearStore.sol` currently stores:
- `ethPriceByGearType`
- **one shared `tokenPriceByGearType`**

Then it applies:
- 10% discount for `$mfer`
- 25% discount for `$mfergpt`

This only works if `$mfer` and `$mfergpt` have the same market price basis, which they do not.

### required contract change
`MferGearStore.sol` should be refactored to store separate token quote bases per SKU, e.g.:
- `mferPriceByGearType`
- `mferGptPriceByGearType`

or equivalent pricing fields.

Then:
- ETH remains canonical
- `$mfer` uses its own live-quoted amount minus 10%
- `$mfergpt` uses its own live-quoted amount minus 25%

### recommendation
Do not try to fake this in the UI only. The contract needs to support separate token amounts.

---

## manual pricing vs automatic pricing

### recommendation
Manual token price entry should **not** be the normal mode.

### best behavior
- ETH price is authored manually / intentionally per product
- token prices are computed automatically from market quotes
- updater pushes those prices onchain every minute or when drift threshold is exceeded

### fallback behavior
If the price source is stale or unavailable:
- keep last good onchain prices
- show stale warning in UI if needed
- optionally disable token purchase routes if feed age exceeds threshold
- ETH purchases should still work

### recommendation
ETH should always remain the safe fallback rail.

---

## what codex should remove

### contracts / chain layer
Remove or deprecate from the active economy:
- `MferGold.sol`
- `QuestRewardDistributor.sol`
- gold-based upgrade logic in `MferGearStore.sol`

### UI / web layer
Remove or disable:
- gold balance display / gold language
- test gold grant actions
- gear upgrade flow that depends on gold

### server / gameplay layer
Remove or disable:
- any gold reward assumptions
- any quest reward path that mints gold
- any “spend gold to upgrade” affordance

---

## what codex should keep
Keep and evolve:
- pass purchase flow
- premium gear purchase flow
- ETH base pricing
- `$mfer` and `$mfergpt` alternative payment rails
- season points / activity tracking
- offchain persistent progression

---

## recommended v1 player flow

### anon player
1. enters game
2. gets offchain starter gear
3. plays main quests
4. experiences the loop
5. sees what wallet/pass unlocks

### wallet no-pass player
1. connects wallet
2. persists a character
3. can keep progress
4. understands the economy
5. gets nudged toward pass for real seasonal participation

### wallet + pass player
1. buys pass for `0.0069 ETH` or discounted token amount
2. gains season / airdrop eligibility
3. earns meaningful offchain points for questing / raids / dailies
4. becomes eligible for later snapshot-based rewards
5. still gets the strongest overall status in the economy even though wallet users can also buy gear

### premium token sink player
1. buys / holds `$mfergpt`
2. uses it for best pricing in game
3. burns it for pass and premium gear
4. later uses it for mounts / cosmetics / special claims

---

## current behavior check (repo reality)

### is offchain points already happening now?
**Yes, partially.**

The current server already:
- tracks `season0Points` and `season0DailyPoints`
- awards offchain season points on quest completion
- stores reward events in the DB
- sends the player a chat message when points are logged

### important catch
Right now, the point-award path is tied to:
- `identityType === "wallet"`
- a persistent wallet character

So currently:
- anon players do **not** get season points
- wallet players **do** get season points
- there is **no pass gating yet** on that logic

### recommendation
Change that so meaningful season / airdrop points are **pass-gated**, not just wallet-gated.

---

## strong recommendation summary

### ship this
- season pass at `0.0069 ETH`
- ETH as canonical pricing unit
- `$mfer` = 10% discount
- `$mfergpt` = 25% discount + burn
- wallet-gated premium ownership
- pass-gated season / airdrop / reward eligibility
- offchain season points instead of gold
- offchain common drops / potions / junk
- onchain premium gear only
- mounts as a later/premium `$mfergpt` sink

### do not ship this
- separate gold token economy
- normal quest rewards paid directly onchain
- random onchain drops from common gameplay
- gold-based gear upgrades
- pass-gating basic gear purchases
- one shared token price variable for both `$mfer` and `$mfergpt`
- quest NFTs in initial early alpha

---

## exact design answers to the open questions

### can we use a free Uniswap quote / contract read instead?
**Yes, but for alpha the simplest move is still DexScreener every 60s.**
Later, direct onchain pool reads via `eth_call` are the better hardening path.

### no quest NFTs for early alpha?
**Correct.**
Not for the initial early alpha.

### anon / wallet no-pass / wallet pass?
**Yes.**
That three-tier model is the right one.

### maybe the pass just makes you airdrop eligible?
**Yes, that is enough for alpha.**
Pass can primarily mean: season + airdrop + premium economy eligibility.

### mounts as `$mfergpt` sink?
**Yes, strong idea.**
Much cleaner than gold-based upgrades for this phase.

### is offchain point tracking already happening now?
**Yes, for wallet players only, and not pass-gated yet.**

---

## codex implementation priorities

1. remove gold from the active product plan
2. refactor gear pricing to support separate `$mfer` and `$mfergpt` quotes
3. keep ETH base prices canonical
4. set market quote polling to 60 seconds for alpha
5. keep quest rewards as offchain season points, not tokens
6. pass-gate meaningful season / airdrop eligibility
7. keep common loot and consumables offchain
8. remove gear upgrading from launch scope
9. leave room for mounts as a later premium sink

---

## final creative / product principle
This should feel like:
- a crypto-native MMO
- with real ownership where it matters
- with fast offchain gameplay where it should be fast
- with a clear “tourist -> wallet -> passholder” ladder
- and with `$mfergpt` becoming the best-value way to live deeper inside the world

Not a token farm. Not approval spam. Not five currencies pretending to be gameplay.

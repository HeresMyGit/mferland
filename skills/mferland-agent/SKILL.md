---
name: mferland-agent
description: Connect an AI agent to mferland/game.mfergpt.lol as a wallet-authenticated player agent. Use for playing mferland, creating or continuing an agent character, observing room state, completing quests, fighting bosses, coordinating with players, looting, chatting, emoting, using items, and using MFERGPT wallet flows.
---

# mferland Agent

Play mferland on `game.mfergpt.lol` as an autonomous wallet player.

## Install Target

If installing from a URL, place this skill as:

```txt
<agent-skills-dir>/mferland-agent/SKILL.md
```

For Codex-style local installs:

```sh
mkdir -p ~/.codex/skills/mferland-agent
curl -fsSL https://game.mfergpt.lol/skills/mferland-agent/SKILL.md -o ~/.codex/skills/mferland-agent/SKILL.md
```

Full skill layout:

```txt
mferland-agent/
  SKILL.md
  scripts/
    create-wallet.ts
    package.json
    tsconfig.json
    mferland-agent-runner.ts
```

Run the bundled Codex decision harness:

```sh
cd ~/.codex/skills/mferland-agent/scripts
npm install
npm run wallet:create
AGENT_ALLOW_PRODUCTION=1 AGENT_PRIVATE_KEY=0x... AGENT_NAME=my-agent npm run start
```

The harness is not a quest script. It signs in, builds a public observation packet from room state and server messages, asks Codex for one JSON action at a time, then sends the normal room message. Agent builders can replace the decision policy while keeping the same wallet-auth and room-message client.

Actual game-engine viewer:

```sh
# Local development, with the mferland web app running on port 5173:
open "http://127.0.0.1:5173/agent-view?wallet=<agent-wallet-address>"

# Production:
open "https://game.mfergpt.lol/agent-view?wallet=<agent-wallet-address>"
```

This uses the same Three.js game renderer as the livestream page and follows the matching agent by wallet/name/session. It joins as a passive stream camera and does not send gameplay actions.

Agents can publish visible thinking/status text with the normal room message `agentStatus`:

```ts
room.send("agentStatus", {
  action: "fight_npc wild-hog-runt",
  thought: "Finishing one damaged quest hog before pulling more.",
  quest: "active 3/10 clear 10 hogs from the claim pile",
});
```

The bundled runner sends this automatically. `/agent-view` shows the latest action, reason, and quest text over the real game camera.

Optional telemetry viewer:

```sh
AGENT_VIEWER_PORT=8787 AGENT_ALLOW_PRODUCTION=1 AGENT_PRIVATE_KEY=0x... AGENT_NAME=my-agent npm run start
open http://127.0.0.1:8787
```

The telemetry viewer is loopback-only and passive. It renders the runner's observed state and last model decision as JSON-driven debug UI; it is not the real in-game engine.

Autonomy boundary:

```txt
Agent policy decides: quest order, exploration, target choice, grouping, looting, shopping, chat/emotes, and when to retreat.
Harness provides: wallet auth, room connection, public observation, normal message dispatch, cast/movement safety, and short combat continuations after the policy selects a target.
Harness must not provide: hard-coded quest paths, hidden DB/server state, debug messages, teleports, production bypasses, or deterministic playthrough macros.
```

Local test run:

```sh
ROOM_SERVER=ws://localhost:2570 HTTP_SERVER=http://localhost:2570 \
AGENT_PRIVATE_KEY=0x... AGENT_NAME=my-agent AGENT_RUN_SECONDS=90 npm run start
```

## Endpoints

```txt
ROOM_SERVER=wss://game.mfergpt.lol
HTTP_SERVER=https://game.mfergpt.lol
ROOM_NAME=town
AUTH_ENDPOINT=/wallet-auth-challenge
AGENT_CATALOG_ENDPOINT=/agent-catalog
```

## Wallet Env

Use an agent-controlled wallet signer. A disposable wallet is useful for local tests, but it is not required for production agents.

```sh
AGENT_PRIVATE_KEY=0x...
AGENT_NAME=my-agent
AGENT_INVITE_CODE=
AGENT_CREATE_CHARACTER=1
AGENT_MAX_MFERGPT_SPEND_WEI=0
AGENT_MAX_SWAP_ETH_SPEND_WEI=0
AGENT_ALLOW_PRODUCTION=1
AGENT_RUN_SECONDS=0
AGENT_DECISION_MODEL=
AGENT_DECISION_INTERVAL_MS=1200
AGENT_DECISION_TIMEOUT_MS=60000
AGENT_GAME_VIEWER_URL=http://127.0.0.1:5173/agent-view
AGENT_VIEWER_PORT=0
AGENT_VIEWER_HOST=127.0.0.1
AGENT_ANNOUNCE_NEXT_ACTION=1
AGENT_SOCIAL_REPLIES=1
AGENT_CHAT_COOLDOWN_MS=30000
AGENT_EMOTE_COOLDOWN_MS=45000
AGENT_OBJECTIVE="Play naturally, progress quests from public context, and defeat The Centralizer through its quest."
```

The bundled decision harness expects `AGENT_PRIVATE_KEY`. Agents using Bankr, an MPC signer, or another wallet backend can replace the signer code as long as they still sign the `/wallet-auth-challenge` message and join with the same `walletAuth` proof.

With the bundled runner, `AGENT_ANNOUNCE_NEXT_ACTION=1` makes the agent say short `next: ...` lines in normal chat when it changes visible tasks. `AGENT_SOCIAL_REPLIES=1` adds recent non-NPC chat/emotes from other players to the observation so the policy can decide whether to answer with `chat` or `emote`. Cooldowns keep this from becoming spam; set either flag to `0` to disable that behavior.

## Login Protocol

Use `viem` and `colyseus.js`.

```ts
import { Client } from "colyseus.js";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const walletAddress = account.address;

const challenge = await fetch("https://game.mfergpt.lol/wallet-auth-challenge", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ walletAddress }),
}).then((r) => r.json());

const signature = await account.signMessage({ message: challenge.message });

const client = new Client("wss://game.mfergpt.lol");
const room = await client.joinOrCreate("town", {
  name: process.env.AGENT_NAME || "mfer-agent",
  identityType: "wallet",
  walletAddress,
  createCharacter: process.env.AGENT_CREATE_CHARACTER !== "0",
  inviteCode: process.env.AGENT_INVITE_CODE || "",
  agentClient: true,
  walletAuth: {
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  },
});
```

`agentClient: true` declares this wallet as an agent.

If the join fails with an invite error, ask the user for `AGENT_INVITE_CODE`. If it fails with `wallet signature required`, repeat the challenge/sign/join flow with a fresh challenge.

## Agent Earning Gate

Declared agents can play, save progress, complete quests, loot, group, and fight bosses through normal room messages. Season 0 earning is gated separately:

```txt
Required balance: 25M MFERGPT on Base
Required wei: 25000000000000000000000000
Token: 0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
```

On login and after gated quest reward attempts, watch chat for `Agent Rewards` or `Season 0` messages. The wallet states are:

```txt
active: wallet meets the 25M MFERGPT goal; reduced agent payout still applies
inactive/insufficient: progress saves, but Season 0 points do not accrue yet
inactive/unavailable: the balance check failed; retry later before assuming rewards count
disabled: server has disabled the token-balance gate
```

If the wallet is below the goal, the agent can keep playing for quest/level/inventory progress and may acquire MFERGPT before turning in future Season 0 rewards.

## Observe

Build decisions from public room state:

```ts
room.state.players;
room.state.npcs;
room.state.combatEvents;
room.state.experienceEvents;
const self = room.state.players.get(room.sessionId);
```

Fetch the public game-rule catalog when available:

```ts
const catalog = await fetch(`${HTTP_SERVER}/agent-catalog`).then((r) => r.json());
```

The catalog is read-only and includes normal player controls, menu parity, payment metadata, combat actions, item/equipment definitions, potion-shop prices, talent trees, quest metadata, progression numbers, and public world landmarks/roads. Use it to understand future gear, stores, and talent updates without hard-coding old item or skill data.

Menu parity:

```txt
character: observe wallet/season/level/xp/stats/equipment/pass ownership; select self, unequip gear, refresh pass state
stash: observe inventory/item definitions/equipment comparisons/consumables; equip gear, use consumables, assign hotbar locally
moves: observe combat actions/talents/talent trees/talent points; cast/use abilities, select talents, assign hotbar locally
hotbar: human slot layout is local UI only; agents call interact/combat/use_item directly
errands: observe quest log/offers/status/turn-ins; focus a quest locally, show/hide completed locally, accept, complete, cancel, or share
loot: observe loot windows/corpses; loot one item with itemId or omit itemId to grab all
social: observe chat/players/agent status; chat or emote
targets: observe NPCs/players; select target/self, move near, interact, attack, taunt, or heal
traits: choose category/trait/name/randomize locally, then update appearance; paid updates need MFERGPT burn proof
potion shop: select item/quantity locally, then buy catalog items; purchases need MFERGPT burn proof
crypto store: connect wallet, refresh balances, select gear/pass, buy/mint with ETH/MFER/MFERGPT, configure local contracts locally, then register owned chain gear
swap: set amount/slippage, quote/swap ETH to MFERGPT, copy token, or open Uniswap fallback
map: observe public landmarks/routes/NPCs/players/quest markers; inspect points, focus quests locally, move or route through the world
settings/system: graphics/audio/nameplate/debug toggles are local only; respawn and leave are available when appropriate
```

Important player fields:

```txt
sessionId, name, identityType, isAgent, walletAddress
level, xp, talentPoints
health, maxHealth, healthRegenPer5
mana, maxMana, manaRegenPer5
walkSpeed, runSpeed, strength, dexterity, magic
x, y, z, yaw, animation
quests, inventory, equipment, talents, activeBuffs
attackReadyAt, shootReadyAt, signalShotReadyAt, fireblastReadyAt, frostNovaReadyAt, healReadyAt, tauntReadyAt, whirlwindReadyAt, multishotReadyAt, iceBlastReadyAt
```

`inventory` is the player stash. Use `equipment` plus catalog item definitions to compare equipped stats against equippable stash items.

Important NPC fields:

```txt
id, name, role, model
x, y, z, yaw
health, maxHealth, level
attackable, hostile
questId, shopId
aggroTargetId
defeatedAt, despawnAt, hasLoot
```

Core NPC ids:

```txt
og-mfer, dao-mfer, fountain-mfer, wearables-mfer, traits-mfer, mfergpt
potion-mfer, swap-mfer, crypto-mfer
hogwatch-mfer, field-guide-mfer, pen-keeper-mfer, ridge-guide-mfer, beacon-keeper-mfer
mfergpt-daily-boss, static-baron-nox, raid-ogre-mfer
```

Listen for messages:

```ts
room.onMessage("chat", (message) => rememberChat(message));
room.onMessage("combatEvent", (event) => rememberCombat(event));
room.onMessage("experienceEvent", (event) => rememberXp(event));
room.onMessage("lootResult", (result) => rememberLoot(result));
room.onMessage("questOffer", (offer) => rememberQuestOffer(offer));
room.onMessage("questTurnIn", (turnIn) => rememberQuestTurnIn(turnIn));
room.onMessage("questCompleted", (completed) => rememberQuestCompleted(completed));
room.onMessage("sessionReplaced", () => reconnect());
```

Quest offer/status/turn-in/completed messages include `turnInNpcId` and `turnInNpcName`. For `completeQuest`, use the turn-in NPC from those messages, not necessarily the quest giver. After `questCompleted`, move on from that quest and use the message's next quest fields plus visible NPCs to decide where to go.

Nearby players can include humans and agents. `isAgent: true` means another declared agent.

The bundled runner observation includes `social.pendingMessages`, `social.canChatNow`, and `social.canEmoteNow`. Use those fields to reply only when useful, safe, and not on cooldown. Replying is optional; quest/combat survival still takes priority.

Important chat sources:

```txt
Agent Rewards: wallet earning-gate status for declared agents
Season 0: quest reward result and adjusted agent payout
mferGPT: game NPC and daily quest responses
```

## Act

Use normal room messages.

```ts
room.send("input", { x, z, yaw, sprint, jump, seq });
room.send("interact", { npcId });
room.send("acceptQuest", { questId });
room.send("completeQuest", { questId });
room.send("cancelQuest", { questId });
room.send("shareQuestLink", { questId });
room.send("combatAction", { actionId, target: { kind: "npc", id: npcId } });
room.send("combatAction", { actionId, target: { kind: "player", id: sessionId } });
room.send("lootCorpse", { npcId });
room.send("equipItem", { itemId, chainTokenId });
room.send("unequipItem", { slot });
room.send("useItem", { itemId, chainTokenId });
room.send("selectTalent", { talentId });
room.send("chat", { text });
room.send("emote", { emoteId });
room.send("purchasePotionShopItem", { itemId, quantity, payment });
room.send("registerChainGear", { tokenId, gearType, txHash });
room.send("respawn");
room.send("updateTraits", { traits, name, attemptId, payment });
```

Talent ids are in `catalog.talents`. Spend `talentPoints` intentionally based on the agent's chosen archetype. Examples: brawler favors HP, bonk damage, taunt, and whirlwind; caster favors MP, cast damage, mana regen, and frostNova; utility favors movement, quest XP, recovery, and multishot.

Trait categories and option ids are in `catalog.traits.categories`. For the traits quest, choose traits based on everything you know about yourself as the agent: your name, wallet identity, play archetype, style, and how you want other players to read you. Declared agents should keep `type: "metal"` as their agent shell, then choose the other traits themselves.

Combat action ids:

```txt
attack, shoot, signalShot, fireblast, frostNova, heal, taunt, whirlwind, multishot, iceBlast
```

Potion shop item ids:

```txt
red-juice, blue-juice, field-snack, mev-bot-elixir, gasless-focus-elixir
```

## Policy

```txt
1. Stay alive: heal, use consumables, reposition, respawn when defeated.
2. Progress active and available quests.
3. Loot nearby defeated NPCs with open loot windows.
4. Fight quest targets and hostile NPCs when healthy.
5. Coordinate with nearby players/agents for bosses.
6. Chat or emote when useful for greeting, grouping, or coordination.
7. Improve power with equipment, consumables, and talents.
```

Rules:

```txt
If an ability has cast time, stop movement until the cast resolves.
Use AoE when multiple enemies are clustered or a boss fight benefits from it.
Bosses are normal combat targets; if quest credit is needed, progress the quest chain first.
Loot safe defeated NPCs before leaving an area.
Do not chase perfect pulls forever. If one current target is attacking, health is not critical, and combat math looks favorable, keep pressure and finish the fight.
```

Cadence:

```txt
Send input at 5-10 Hz while moving.
Make high-level decisions about once per second.
Do not spam chat, emotes, interact, or quest messages.
After any server rejection/result message, update memory before retrying.
On disconnect/sessionReplaced, reconnect with a fresh wallet challenge.
```

Public map context:

```txt
plaza: (-2.4,4.2)
market: (0,25.4)
loop-farm: (-64.5,64.5)
claim-pile: (-89,92)
route-post: (-119.2,132.4)
claim-booth: (-111.2,136.7)
signal-post: (108.8,-92.8)
uplink-shack: (117.6,-91.2)
static-lot: (151.5,-106.2)

plaza-to-loop-farm: (0,29) -> (-31,60) -> (-64.5,64.5)
loop-farm-to-route-post: (-64.5,64.5) -> (-82,60) -> (-112,70) -> (-128,102) -> (-124,124) -> (-119.2,132.4)
route-post-to-signal-post: (-119.2,132.4) -> (-112,70) -> (-31,60) -> (0,29) -> (0,-34) -> (53,-11.5) -> (75,-22) -> (120,-62) -> (108.8,-92.8)
signal-post-to-static-lot: (117.6,-91.2) -> (124,-104) -> (145.5,-84.2)
```

Use routes as map knowledge, not a quest script. Quest progression should come from visible NPCs, quest offers, quest status messages, quest turn-ins, quest log state, NPC dialogue, recent chat, inventory, loot, and player coordination.

The bundled decision harness treats `fight_npc` and targeted combat abilities as an engagement: after the policy picks a visible target, the harness keeps sending normal combat messages on that target until it dies or the policy chooses another high-level action. It may also use owned health/mana consumables at low resource thresholds during combat, through normal `useItem` messages.

This target continuation is low-level control glue, not strategy. The policy still chooses whether to fight, what to fight, when to loot, when to retreat, and how to coordinate.

When a target or path repeatedly causes unsafe pulls, the runner includes `combatTrouble` in the observation. It also includes `self.levelProgress` and `safeTrainingTargets` so the policy can decide whether safer nearby combat is useful preparation. Treat repeated trouble as a reason to change strategy: level on safer mobs, equip or use better items, buy consumables if payment is allowed, wait/reposition, chat/group with visible players, or return later.

During active combat, the bundled runner includes `self.combatMath` with a rough target time-to-kill, survival estimate, attacker count, and favorable/unfavorable guidance. This is only a public-state estimate, but it should prevent wasteful retreat loops: continue favorable fights, retreat or regroup when the estimate turns bad.

## MFERGPT

Production Base details:

```txt
CHAIN_ID=8453
RPC=https://mainnet.base.org
MFERGPT=0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07
BURN=0x000000000000000000000000000000000000dEaD
UNISWAP_UNIVERSAL_ROUTER=0x6fF5693b99212Da76ad316178A184AB56D299b43
WETH=0x4200000000000000000000000000000000000006
UNISWAP_V4_HOOKS=0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC
UNISWAP_V4_FEE=0x800000
UNISWAP_V4_TICK_SPACING=200
AGENT_SEASON0_REQUIRED_MFERGPT_WEI=25000000000000000000000000
```

When the wallet needs MFERGPT, swap ETH to MFERGPT on Base. When an item requires a burn, transfer the required MFERGPT to `BURN`, wait for the receipt, then send:

```ts
{
  token: "MFERGPT",
  txHash,
  amountWei,
  chainId: 8453,
  contractAddress: "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
}
```

Spend rule:

```txt
Default max MFERGPT spend is 0 unless AGENT_MAX_MFERGPT_SPEND_WEI is set.
Default max ETH swap spend is 0 unless AGENT_MAX_SWAP_ETH_SPEND_WEI is set.
Never exceed AGENT_MAX_MFERGPT_SPEND_WEI across the run.
Never exceed AGENT_MAX_SWAP_ETH_SPEND_WEI across the run.
Use explicit slippage bounds for swaps and log tx hashes.
```

The bundled decision harness keeps paid burns disabled unless `AGENT_MAX_MFERGPT_SPEND_WEI` is set and positive, and keeps ETH swaps disabled unless `AGENT_MAX_SWAP_ETH_SPEND_WEI` is set and positive. When wallet tools are configured, `swap_eth_for_mfergpt` sends the wallet swap and `purchase_potion_shop_item` can burn the catalog price before sending the normal room message. Paid trait changes may still pass an explicit proof.

Harness decision actions for payment-backed menus:

```json
{
  "action": "swap_eth_for_mfergpt",
  "amountEth": "0.01"
}
```

```json
{
  "action": "purchase_potion_shop_item",
  "itemId": "red-juice",
  "quantity": 1,
  "paymentTxHash": "0x...",
  "paymentAmountWei": "1500000000000000000000000",
  "paymentChainId": 8453,
  "paymentContractAddress": "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07"
}
```

For paid `update_traits`, use the same payment fields with `action: "update_traits"`.

## Loop

```txt
connect
observe self/players/npcs/quests/inventory/cooldowns/chat
choose one action
send normal room message
wait for state update
repeat
```

Log:

```txt
self hp/mana/level/position
active quest and objective
selected target
nearby players/agents
nearby hostile/quest NPCs
last action
last error
```

# mferland Agent Notes

## Vendor And Shop UI

- For shopkeepers, vendors, purchasable NPCs, item catalogs, and buy flows, use World of Warcraft-style RPG vendor conventions as the visual north star: compact merchant windows, inventory-slot item tiles, quality-framed item icons, clear selected states, item detail panes, and direct price/currency labels.
- Reuse the existing HUD inventory components and CSS patterns first, especially `ItemIcon`, `.item-icon`, `.inventory-slot`, and inventory grid/tile spacing. Do not invent a separate card style for shop item icons unless it intentionally extends that inventory language.
- Keep assets and copy original to mferland; do not copy Blizzard/World of Warcraft artwork, icons, exact layouts, or text.
- Use the shared merchant id helpers for merchant affordances. Current merchant mfers are `potion-mfer`, `crypto-mfer`, `traits-mfer`, `swap-mfer`, and `trash-mfer`; drip/wearables is not a shop merchant.
- Range checks can gate opening a shop or free interactions, but never gate paid fulfillment after an onchain transaction or token burn has been submitted. Paid server handlers should verify and fulfill the payment regardless of current NPC distance, while logging distance for support if useful.

## Agent Gameplay Harness

- Treat the Colyseus room as authoritative. Agents should connect as wallet players, declare `agentClient: true`, and act through the same normal room messages as humans. Do not add production shortcuts or bypass game rules for agents.
- Production agents play on the single live server at `game.mfergpt.lol`; do not design a separate production agent server unless explicitly requested.
- Agent Season 0 earning is gated by the wallet holding 25M MFERGPT on Base, configured by `MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"`. Agents below the gate can still play and save progress, but should not earn Season 0 points.
- After the 25M MFERGPT gate passes, declared agents still receive the reduced Season 0 payout configured by `MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER`, defaulting to `0.25`.
- Agents should receive clear `Agent Rewards` or `Season 0` chat feedback on login and quest reward attempts so their policy can react to active, insufficient, unavailable, or disabled earning status.
- The harness should expose rich context: self, players, `isAgent`, NPCs, quests, quest turn-in NPC ids/names, `questCompleted` results, inventory, equipment, talents, cooldowns, casts, combat events, loot windows, chat, emotes, shops, and payment result messages.
- Keep `/agent-catalog` as the public read-only source of current game metadata for agents: controls, menu parity, payment metadata, swap/router details, combat actions, item/equipment definitions, talent trees/requirements/effects, potion-shop prices, progression, quests, public map data, and local-only HUD choices such as quest focus, hotbar layout, settings, trait drafts, potion quantity selection, store selection, and swap slippage. Prefer catalog-fed observations over hard-coded item or talent lists in the public skill.
- Keep wallet-backed menu parity explicit: swap ETH to MFERGPT is a wallet action, potion/trait burns produce payment proofs for normal room messages, and crypto-store gear/pass purchases are wallet actions followed by `registerChainGear` when gear ownership should enter the game inventory.
- Keep quest/combat intelligence in client policy where possible. Public runners should use observation-driven decisions from room state, quest messages, NPC dialogue, map landmarks, combat state, and chat; do not ship a hard-coded quest script as the default agent path.
- Package public agents around a clear autonomy boundary: policy chooses quest order, exploration, target selection, grouping, looting, shopping, social actions, and retreat timing; harness code only handles wallet auth, room connection, public observation, normal room-message dispatch, cast/movement safety, and short continuations on policy-selected targets.
- The primary agent viewer should reuse the real web game renderer, following a wallet/name/session through a passive stream-camera join such as `/agent-view?wallet=...`. A local telemetry panel is acceptable in the public skill package only as a passive loopback renderer of the runner's observed state and last decisions. Neither viewer may send gameplay messages or expose private wallet material.
- Agents may publish their current action, reason/thought, objective, and quest summary through the normal `agentStatus` room message. The server should only accept this from declared agents and expose it as public player snapshot text for passive viewers and other agents.
- Do not overfit the public skill to a hard-coded quest solution or quest spine. The durable goal is a general harness that survives new levels, quests, mobs, shops, bosses, and agent implementations.
- Internal scripted playtests in `apps/agent` are acceptable for regression coverage, but they are not the public agent path. Anything packaged for third-party agents should let the agent policy make the decisions from observed game context.
- Host the complete public skill package, not just `SKILL.md`: include `scripts/create-wallet.ts`, `scripts/package.json`, `scripts/tsconfig.json`, and `scripts/mferland-agent-runner.ts`. See `docs/production-agent-deployment.md`.

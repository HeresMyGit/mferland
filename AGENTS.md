# mferland Agent Notes

## Vendor And Shop UI

- For shopkeepers, vendors, purchasable NPCs, item catalogs, and buy flows, use World of Warcraft-style RPG vendor conventions as the visual north star: compact merchant windows, inventory-slot item tiles, quality-framed item icons, clear selected states, item detail panes, and direct price/currency labels.
- Reuse the existing HUD inventory components and CSS patterns first, especially `ItemIcon`, `.item-icon`, `.inventory-slot`, and inventory grid/tile spacing. Do not invent a separate card style for shop item icons unless it intentionally extends that inventory language.
- Keep assets and copy original to mferland; do not copy Blizzard/World of Warcraft artwork, icons, exact layouts, or text.
- Use the shared merchant id helpers for merchant affordances. Current merchant mfers are `potion-mfer`, `crypto-mfer`, `traits-mfer`, and `swap-mfer`; drip/wearables is not a shop merchant.
- Range checks can gate opening a shop or free interactions, but never gate paid fulfillment after an onchain transaction or token burn has been submitted. Paid server handlers should verify and fulfill the payment regardless of current NPC distance, while logging distance for support if useful.

## Agent Gameplay Harness

- Treat the Colyseus room as authoritative. Agents should connect as wallet players, declare `agentClient: true`, and act through the same normal room messages as humans. Do not add production shortcuts or bypass game rules for agents.
- Production agents play on the single live server at `game.mfergpt.lol`; do not design a separate production agent server unless explicitly requested.
- Agent Season 0 earning is gated by the wallet holding 25M MFERGPT on Base, configured by `MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI="25000000000000000000000000"`. Agents below the gate can still play and save progress, but should not earn Season 0 points.
- After the 25M MFERGPT gate passes, declared agents still receive the reduced Season 0 payout configured by `MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER`, defaulting to `0.25`.
- Agents should receive clear `Agent Rewards` or `Season 0` chat feedback on login and quest reward attempts so their policy can react to active, insufficient, unavailable, or disabled earning status.
- The harness should expose rich context: self, players, `isAgent`, NPCs, quests, inventory, equipment, talents, cooldowns, casts, combat events, loot windows, chat, emotes, shops, and payment result messages.
- Keep quest/combat intelligence in client policy where possible. Starter runners may include example quest hints and routes for smoke testing, but production infrastructure should let third-party agents read quest/NPC/player context and decide their own route, target selection, grouping, looting, and spending strategy.
- Do not overfit the public skill to a hard-coded quest solution. A reference quest spine is acceptable as documentation, but the durable goal is a general harness that survives new levels, quests, mobs, shops, bosses, and agent implementations.
- Host the complete public skill package, not just `SKILL.md`: include `scripts/create-wallet.ts`, `scripts/package.json`, `scripts/tsconfig.json`, and `scripts/mferland-agent-runner.ts`. See `docs/production-agent-deployment.md`.

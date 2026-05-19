# mferland Agent Notes

## Vendor And Shop UI

- For shopkeepers, vendors, purchasable NPCs, item catalogs, and buy flows, use World of Warcraft-style RPG vendor conventions as the visual north star: compact merchant windows, inventory-slot item tiles, quality-framed item icons, clear selected states, item detail panes, and direct price/currency labels.
- Reuse the existing HUD inventory components and CSS patterns first, especially `ItemIcon`, `.item-icon`, `.inventory-slot`, and inventory grid/tile spacing. Do not invent a separate card style for shop item icons unless it intentionally extends that inventory language.
- Keep assets and copy original to mferland; do not copy Blizzard/World of Warcraft artwork, icons, exact layouts, or text.
- Use the shared merchant id helpers for merchant affordances. Current merchant mfers are `potion-mfer`, `crypto-mfer`, `traits-mfer`, and `swap-mfer`; drip/wearables is not a shop merchant.
- Range checks can gate opening a shop or free interactions, but never gate paid fulfillment after an onchain transaction or token burn has been submitted. Paid server handlers should verify and fulfill the payment regardless of current NPC distance, while logging distance for support if useful.

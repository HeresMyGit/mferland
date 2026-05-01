# Mfer Color Reference

Use the original mfers NFT profile-picture background colors as the reference palette for mferland art direction, UI accents, icon backgrounds, and future derived color work.

## Official Backgrounds

```json
{
  "red": "#FF7278",
  "orange": "#FFB66E",
  "yellow": "#FFE260",
  "green": "#B7FF6D",
  "blue": "#5DD3FF",
  "graveyard": "#7C7C7C",
  "space": "#797A7A",
  "tree": "#FFE260"
}
```

## Usage Notes

- Treat these as the canonical source colors when a feature needs the mfer background palette.
- Runtime TypeScript code should import from `apps/web/src/game/mferPalette.ts` instead of hardcoding old accent hexes.
- CSS should use the `--mfer-bg-*` and derived `--mfer-*` variables in `apps/web/src/styles/mfer-ui.css`.
- It is fine to build tints, shades, borders, shadows, and muted UI washes from these colors, but keep the derived colors visibly connected to the originals.
- `tree` intentionally matches `yellow`.
- `graveyard` and `space` are close neutral grays; use them as grounding tones, not as permission to drift the whole UI into a generic gray theme.
- For generated icon or item art, prefer simple solid backgrounds based on this palette before inventing new color families.

export const ITEMS = {
  "sealed-note": {
    name: "Sealed Note",
    description: "A folded note from OG mfer. It smells faintly like fountain water.",
    quality: "quest",
    iconColor: "#f2d067",
  },
  "hog-liver": {
    name: "Hog Liver",
    description: "A grimy quest item for Hogwatch mfer's ward brew.",
    quality: "quest",
    iconColor: "#7a2d25",
  },
  "muddy-tusk": {
    name: "Muddy Tusk",
    description: "A chipped tusk from a wild hog.",
    quality: "common",
    iconColor: "#d8c89c",
  },
  "small-tooth": {
    name: "Small Tooth",
    description: "A tiny animal tooth with no obvious use.",
    quality: "common",
    iconColor: "#e7dfc4",
  },
  "worn-antler": {
    name: "Worn Antler",
    description: "A scuffed antler tip from a deer.",
    quality: "common",
    iconColor: "#b89360",
  },
  "farmhand-bandana": {
    name: "Farmhand Bandana",
    description: "A rough scrap from the busted farm crew.",
    quality: "common",
    iconColor: "#b84a3d",
  },
  "dummy-splinter": {
    name: "Dummy Splinter",
    description: "A training dummy splinter. Probably worthless.",
    quality: "common",
    iconColor: "#9b6a3f",
  },
} as const;

export const LOOT = {
  interactRange: 3.25,
  corpseDespawnMs: 180000,
  lootedDespawnMs: 6500,
} as const;

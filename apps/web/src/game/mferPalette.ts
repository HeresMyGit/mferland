export const MFER_BACKGROUND_COLORS = {
  red: "#FF7278",
  orange: "#FFB66E",
  yellow: "#FFE260",
  green: "#B7FF6D",
  blue: "#5DD3FF",
  graveyard: "#7C7C7C",
  space: "#797A7A",
  tree: "#FFE260",
} as const;

export type MferBackgroundColorName = keyof typeof MFER_BACKGROUND_COLORS;

export const MFER_COLORS = {
  local: MFER_BACKGROUND_COLORS.yellow,
  friendly: MFER_BACKGROUND_COLORS.green,
  neutral: MFER_BACKGROUND_COLORS.yellow,
  hostile: MFER_BACKGROUND_COLORS.red,
  player: MFER_BACKGROUND_COLORS.blue,
  agent: "#B69AFF",
  pink: "#FF96A7",
  questAvailable: MFER_BACKGROUND_COLORS.yellow,
  questTurnIn: MFER_BACKGROUND_COLORS.green,
  questDaily: MFER_BACKGROUND_COLORS.blue,
  loot: MFER_BACKGROUND_COLORS.yellow,
  lootHighlight: "#FFF0A6",
  health: MFER_BACKGROUND_COLORS.red,
  mana: MFER_BACKGROUND_COLORS.blue,
  signal: MFER_BACKGROUND_COLORS.blue,
  relay: "#B69AFF",
  debugBuilding: MFER_BACKGROUND_COLORS.orange,
  debugModel: "#B69AFF",
  fire: MFER_BACKGROUND_COLORS.orange,
  fireHot: MFER_BACKGROUND_COLORS.red,
  heal: MFER_BACKGROUND_COLORS.green,
  xp: "#C89BFF",
} as const;

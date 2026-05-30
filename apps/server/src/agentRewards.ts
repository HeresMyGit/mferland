export const DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER = 0.25;

export function readAgentSeason0PointMultiplier(env: NodeJS.ProcessEnv = process.env) {
  return normalizeAgentSeason0PointMultiplier(env.MFERLAND_AGENT_SEASON0_POINT_MULTIPLIER);
}

export function normalizeAgentSeason0PointMultiplier(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER;
  const multiplier = Number(text);
  if (!Number.isFinite(multiplier)) return DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER;
  return Math.min(1, Math.max(0, multiplier));
}

export function adjustSeason0QuestPointsForAgent(basePoints: number, isAgent: boolean, multiplier = DEFAULT_AGENT_SEASON0_POINT_MULTIPLIER) {
  const points = Math.max(0, Math.floor(basePoints));
  if (!isAgent) return points;
  if (points <= 0) return 0;
  const normalizedMultiplier = normalizeAgentSeason0PointMultiplier(String(multiplier));
  if (normalizedMultiplier <= 0) return 0;
  return Math.max(1, Math.floor(points * normalizedMultiplier));
}

export function getAgentSeason0RewardNote(label: string, isAgent: boolean, multiplier: number) {
  if (!isAgent) return label;
  return `${label} (agent x${formatRewardMultiplier(multiplier)})`;
}

export function formatRewardMultiplier(multiplier: number) {
  return normalizeAgentSeason0PointMultiplier(String(multiplier)).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function areAgentsEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.MFERLAND_AGENTS_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off" && value !== "no";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const PRODUCTION_HOSTS = new Set(["game.mfergpt.lol"]);
const PRODUCTION_PATTERNS = [
  /game\.mfergpt\.lol/i,
  /neon\.tech/i,
];

export function assertLocalOnlyRuntimeSafety(env: NodeJS.ProcessEnv = process.env) {
  if (!isLocalOnlyEnabled(env)) return;
  assertNoProductionUrl("DATABASE_URL", env.DATABASE_URL);
  assertLocalDatabaseUrl(env.DATABASE_URL);
}

export function assertLocalDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("MFERLAND_LOCAL_ONLY=1 requires DATABASE_URL to point at a local Postgres database.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("MFERLAND_LOCAL_ONLY=1 requires a valid DATABASE_URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("MFERLAND_LOCAL_ONLY=1 only allows postgres DATABASE_URL values.");
  }
  if (!isLocalHost(parsed.hostname)) {
    throw new Error(`MFERLAND_LOCAL_ONLY=1 refused non-local DATABASE_URL host ${parsed.hostname}.`);
  }
}

export function assertNoProductionUrl(label: string, value: string | undefined) {
  if (!value) return;
  if (PRODUCTION_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`${label} appears to target production; refusing local-only run.`);
  }
  try {
    const parsed = new URL(value);
    if (PRODUCTION_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(`${label} appears to target production; refusing local-only run.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("production")) throw error;
  }
}

export function isLocalOnlyEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.MFERLAND_LOCAL_ONLY === "1" || env.MFERLAND_AGENT_LOCAL_ONLY === "1";
}

function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

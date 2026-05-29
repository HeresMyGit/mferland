const serverUrl = process.env.AGENT_SERVER_URL || process.env.VITE_SERVER_URL || "ws://localhost:2567";
const databaseUrl = process.env.DATABASE_URL || "";

const checks = [
  assertLocalServerUrl(serverUrl),
  assertLocalDatabaseUrl(databaseUrl),
];

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  for (const check of failed) console.error(check.message);
  process.exit(1);
}

console.log(`Local agent server: ${summarizeUrl(serverUrl)}`);
console.log(`Local agent database: ${summarizeDatabaseUrl(databaseUrl)}`);

function assertLocalServerUrl(value) {
  if (looksProduction(value)) {
    return { ok: false, message: "AGENT_SERVER_URL/VITE_SERVER_URL appears to target production." };
  }
  const parsed = parseUrl(value, "AGENT_SERVER_URL/VITE_SERVER_URL");
  if (!parsed.ok) return parsed;
  if (!isLocalHost(parsed.url.hostname)) {
    return { ok: false, message: `AGENT_SERVER_URL/VITE_SERVER_URL host ${parsed.url.hostname} is not local.` };
  }
  return { ok: true };
}

function assertLocalDatabaseUrl(value) {
  if (!value) return { ok: false, message: "DATABASE_URL is required and must point at a local Postgres database." };
  if (looksProduction(value)) return { ok: false, message: "DATABASE_URL appears to target production." };
  const parsed = parseUrl(value, "DATABASE_URL");
  if (!parsed.ok) return parsed;
  if (!["postgres:", "postgresql:"].includes(parsed.url.protocol)) {
    return { ok: false, message: "DATABASE_URL must use postgres:// or postgresql://." };
  }
  if (!isLocalHost(parsed.url.hostname)) {
    return { ok: false, message: `DATABASE_URL host ${parsed.url.hostname} is not local.` };
  }
  return { ok: true };
}

function parseUrl(value, label) {
  try {
    return { ok: true, url: new URL(value) };
  } catch {
    return { ok: false, message: `${label} must be a valid URL.` };
  }
}

function looksProduction(value) {
  return /game\.mfergpt\.lol|neon\.tech/i.test(value);
}

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(hostname.toLowerCase());
}

function summarizeUrl(value) {
  const parsed = new URL(value);
  return `${parsed.protocol}//${parsed.host}`;
}

function summarizeDatabaseUrl(value) {
  const parsed = new URL(value);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
}

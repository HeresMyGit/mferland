const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function assertLocalAgentSafety({
  serverUrl,
  databaseUrl,
  localOnly,
}: {
  serverUrl: string;
  databaseUrl?: string;
  localOnly: boolean;
}) {
  assertNoProductionUrl("AGENT_SERVER_URL", serverUrl);
  if (databaseUrl) assertNoProductionUrl("DATABASE_URL", databaseUrl);

  if (!localOnly) return;

  assertLocalUrl("AGENT_SERVER_URL", serverUrl, ["ws:", "wss:", "http:", "https:"]);
  if (databaseUrl) assertLocalUrl("DATABASE_URL", databaseUrl, ["postgres:", "postgresql:"]);
}

export function toHttpServerUrl(serverUrl: string) {
  const parsed = new URL(serverUrl);
  if (parsed.protocol === "ws:") parsed.protocol = "http:";
  if (parsed.protocol === "wss:") parsed.protocol = "https:";
  return parsed.toString().replace(/\/$/, "");
}

export function toWsServerUrl(serverUrl: string) {
  const parsed = new URL(serverUrl);
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  return parsed.toString().replace(/\/$/, "");
}

export function summarizeDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) return "not set";
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
}

function assertNoProductionUrl(label: string, value: string) {
  if (/game\.mfergpt\.lol|neon\.tech/i.test(value)) {
    throw new Error(`${label} appears to target production; refusing to run the local agent.`);
  }
}

function assertLocalUrl(label: string, value: string, protocols: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${label} has unsupported protocol ${parsed.protocol}.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} host ${parsed.hostname} is not local.`);
  }
}

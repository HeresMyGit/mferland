import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalAgentSafety } from "./localSafety.js";

const TEST_NEON_DATABASE_URL = "postgresql://tester:example@ep-test-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

test("agent safety allows test Neon DB when not running in local-only mode", () => {
  assert.doesNotThrow(() => assertLocalAgentSafety({
    serverUrl: "ws://localhost:2567",
    databaseUrl: TEST_NEON_DATABASE_URL,
    localOnly: false,
  }));
});

test("agent safety requires explicit opt-in for the production game server", () => {
  assert.throws(
    () => assertLocalAgentSafety({
      serverUrl: "wss://game.mfergpt.lol",
      databaseUrl: TEST_NEON_DATABASE_URL,
      localOnly: false,
    }),
    /AGENT_SERVER_URL appears to target production/,
  );

  assert.doesNotThrow(() => assertLocalAgentSafety({
    serverUrl: "wss://game.mfergpt.lol",
    databaseUrl: TEST_NEON_DATABASE_URL,
    localOnly: false,
    allowProduction: true,
  }));
});

test("agent local-only mode still refuses remote server and database targets", () => {
  assert.throws(
    () => assertLocalAgentSafety({
      serverUrl: "ws://localhost:2567",
      databaseUrl: TEST_NEON_DATABASE_URL,
      localOnly: true,
    }),
    /DATABASE_URL appears to target production/,
  );

  assert.throws(
    () => assertLocalAgentSafety({
      serverUrl: "wss://game.mfergpt.lol",
      databaseUrl: "postgresql://localhost:55432/mferland_agent_test",
      localOnly: true,
      allowProduction: true,
    }),
    /AGENT_SERVER_URL appears to target production/,
  );
});

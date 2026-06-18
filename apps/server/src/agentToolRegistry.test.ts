import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentToolManifestDocument,
  buildToolUsageReport,
  buildZeroPriceToolChallenge,
  isZeroPriceToolPaymentUsable,
  parseToolPaymentHeader,
  verifyZeroPriceToolPayment,
} from "./agentToolRegistry.js";

const CALLER = "0x0000000000000000000000000000000000000abc";
const OPERATOR = "0x0000000000000000000000000000000000000def";

test("agent tool manifest documents command endpoint with keccak hash", () => {
  const manifest = buildAgentToolManifestDocument("mferland-agent-command", "https://game.mfergpt.lol/");

  assert.equal(manifest.url, "https://game.mfergpt.lol/agent-command");
  assert.match(manifest.manifest_hash, /^0x[0-9a-f]{64}$/);
  assert.equal(manifest.manifest_hash, manifest.manifest_hash_keccak256);
  assert.deepEqual(manifest.pricing, { type: "free", network: "base", maxAmountRequired: "0" });
  const input = manifest.input_schema as {
    properties: Record<string, { enum?: string[]; description?: string; maximum?: number; properties?: Record<string, { enum?: string[] }> }>;
  };
  assert.deepEqual(input.properties.command.enum, ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals"]);
  assert.match(input.properties.goals.description ?? "", /Freeform player objectives/);
  assert.ok(input.properties.behaviorScheme.enum?.includes("jump_around"));
  assert.ok(input.properties.behaviorScheme.enum?.includes("dummy_dps"));
  assert.deepEqual(input.properties.profile.properties?.role.enum, ["auto", "tank", "healer", "dps", "support"]);
  assert.deepEqual(input.properties.controller.properties?.type.enum, ["premade", "external_policy"]);
  assert.match(input.properties.controller.description ?? "", /Metadata only/);
  assert.equal(input.properties.objective, undefined);
  assert.equal(input.properties.codeChunk, undefined);
  assert.equal(input.properties.maxSeconds.maximum, 1800);
  const output = manifest.output_schema as { properties: Record<string, unknown> };
  assert.ok(output.properties.result);
  assert.ok(output.properties.usage);
  assert.ok(output.properties.social);
  assert.ok(output.properties.combat);
  assert.ok(output.properties.sandbox);
  assert.ok(output.properties.goalProgress);
  assert.ok(output.properties.behaviorScheme);
});

test("agent tool manifest documents MFERGPT swap route outputs", () => {
  const manifest = buildAgentToolManifestDocument("mferland-mfergpt-swap", "https://game.mfergpt.lol/");
  const output = manifest.output_schema as { properties: Record<string, unknown> };

  assert.equal(manifest.url, "https://game.mfergpt.lol/agent-mfergpt-swap-quote");
  assert.ok(output.properties.inputToken);
  assert.ok(output.properties.outputToken);
  assert.ok(output.properties.transaction);
  assert.ok(output.properties.fallbackUrl);
});

test("agent tool zero-price challenge uses Base USDC EIP-3009 shape", () => {
  const challenge = buildZeroPriceToolChallenge("mferland-mfergpt-swap", OPERATOR);

  assert.equal(challenge.ok, false);
  assert.equal(challenge.accepts[0].network, "base");
  assert.equal(challenge.accepts[0].payTo, OPERATOR);
  assert.equal(challenge.accepts[0].maxAmountRequired, "0");
  assert.equal(challenge.accepts[0].asset.symbol, "USDC");
});

test("agent tool payment parser accepts zero-value EIP-3009 payloads", async () => {
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: CALLER,
        to: OPERATOR,
        value: "0",
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: `0x${"2".repeat(64)}`,
      },
    },
  };
  const payment = parseToolPaymentHeader(Buffer.from(JSON.stringify(payload)).toString("base64url"));

  assert.ok(payment);
  assert.equal(payment.authorization.from, CALLER);
  assert.equal(payment.authorization.to, OPERATOR);
  assert.equal(isZeroPriceToolPaymentUsable(payment), true);

  const usage = buildToolUsageReport("mferland-mfergpt-swap", payment, Date.now() - 25);
  assert.equal(usage.verification_type, "eip3009_authorization");
  assert.equal(usage.eip3009.caller_address, CALLER);
  assert.equal(usage.eip3009.value, "0");

  process.env.MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID = "123";
  const commandUsage = buildToolUsageReport("mferland-agent-command", payment, Date.now() - 25);
  assert.equal(commandUsage.tool_onchain_id, "123");
  delete process.env.MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID;

  const verification = await verifyZeroPriceToolPayment(payment, "0x0000000000000000000000000000000000000001");
  assert.equal(verification.ok, false);
  if (verification.ok) assert.fail("expected payment verification to fail for the wrong operator");
  assert.match(verification.error ?? "", /not bound/);
});

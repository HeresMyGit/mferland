import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentToolManifestDocument,
  buildToolUsageReport,
  buildZeroPriceToolChallenge,
  getAgentToolSlug,
  isZeroPriceToolPaymentUsable,
  parseToolPaymentHeader,
  verifyZeroPriceToolPayment,
} from "./agentToolRegistry.js";

const CALLER = "0x0000000000000000000000000000000000000abc";
const OPERATOR = "0x0000000000000000000000000000000000000def";

type JsonSchema = {
  type?: string | string[];
  enum?: string[];
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
};

test("agent tool manifest documents command endpoint with OpenSea registry shape", () => {
  const manifest = buildAgentToolManifestDocument("mfertown-agent-command", "https://game.mfergpt.lol/");

  assert.equal(manifest.type, "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1");
  assert.equal(manifest.name, "mfertown-agent-command");
  assert.equal(manifest.endpoint, "https://game.mfergpt.lol/agent-command");
  assert.equal(manifest.image, "https://game.mfergpt.lol/agent-tools/icon.png");
  assert.equal(manifest.featuredImage, "https://game.mfergpt.lol/agent-tools/16x9.jpeg");
  assert.equal(manifest.creatorAddress, "0x0000000000000000000000000000000000000000");
  assert.equal("manifest_hash" in manifest, false);
  assert.equal("manifest_hash_keccak256" in manifest, false);
  assert.deepEqual(manifest.pricing, [{
    amount: "0",
    asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    recipient: "eip155:8453:0x0000000000000000000000000000000000000000",
    protocol: "x402",
  }]);
  const input = manifest.inputs as { properties: Record<string, JsonSchema> };
  assert.deepEqual(input.properties.command.enum, ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals", "fish", "fishing"]);
  assert.match(input.properties.goals.description ?? "", /Freeform player objectives/);
  assert.ok(input.properties.behaviorScheme.enum?.includes("jump_around"));
  assert.ok(input.properties.behaviorScheme.enum?.includes("dummy_dps"));
  assert.deepEqual(input.properties.profile.properties?.role.enum, ["auto", "tank", "healer", "dps", "support"]);
  assert.deepEqual(input.properties.controller.properties?.type.enum, ["premade", "external_policy"]);
  assert.match(input.properties.controller.description ?? "", /Metadata only/);
  assert.equal(input.properties.objective, undefined);
  assert.equal(input.properties.codeChunk, undefined);
  assert.equal(input.properties.pollNonce, undefined);
  assert.equal(input.properties.maxSeconds.maximum, 1800);
  const constraints = input.properties.constraints.properties ?? {};
  assert.deepEqual(constraints.maxDeaths.type, ["number", "null"]);
  assert.deepEqual(constraints.maxSafetyStops.type, ["number", "null"]);
  assert.equal(constraints.maxDeaths.maximum, 99);
  assert.match(constraints.maxDeaths.description ?? "", /normal autoplay/);
  const output = manifest.outputs as { properties: Record<string, unknown> };
  assert.ok(output.properties.result);
  assert.ok(output.properties.usage);
  assert.ok(output.properties.usageFinalization);
  assert.ok(output.properties.social);
  assert.ok(output.properties.combat);
  assert.ok(output.properties.fishing);
  assert.ok(output.properties.bridge);
  assert.ok(output.properties.postCommand);
  assert.ok(output.properties.prerequisiteRequired);
  assert.ok(output.properties.walletActionRequired);
  assert.ok(output.properties.finalState);
  assert.ok(output.properties.equipmentChanges);
  assert.ok(output.properties.sandbox);
  assert.ok(output.properties.goalProgress);
  assert.ok(output.properties.behaviorScheme);
});

test("agent tool manifest documents dedicated fishing endpoint", () => {
  const manifest = buildAgentToolManifestDocument("mfertown-fishing", "https://game.mfergpt.lol/");
  const input = manifest.inputs as { properties: Record<string, JsonSchema> };
  const output = manifest.outputs as { properties: Record<string, unknown> };

  assert.equal(manifest.name, "mfertown-fishing");
  assert.equal(manifest.version, "0.1.9");
  assert.equal(manifest.endpoint, "https://game.mfergpt.lol/agent-fishing");
  assert.ok(manifest.tags.includes("fishing"));
  assert.deepEqual(input.properties.operation.enum, ["start", "status", "stop", "fish_once", "claim_nft", "submit_claim_tx", "prepare_redemption", "submit_redemption_tx", "sell_fish", "sell_fish_status", "refresh"]);
  assert.deepEqual(input.properties.questId.enum, ["fishin-lesson", "lost-fishing-shoes"]);
  assert.match(input.properties.operation.description ?? "", /FishingPond\.claim/);
  assert.match(input.properties.operation.description ?? "", /Mint Club/);
  assert.match(input.properties.operation.description ?? "", /history eligibility alone is not ownership proof/);
  assert.match(input.properties.operation.description ?? "", /regular offchain fish only/);
  assert.match(input.properties.operation.description ?? "", /never sells NFTs or trash/);
  assert.match(input.properties.operation.description ?? "", /exact scoped \/agent-fishing request/);
  assert.match(input.properties.operation.description ?? "", /poll sell_fish_status/);
  assert.match(input.properties.operation.description ?? "", /insufficient_bundle/);
  assert.match(input.properties.operation.description ?? "", /stop is drain-aware/);
  assert.match(input.properties.operation.description ?? "", /stopDrain\.status=settling/);
  assert.equal(input.properties.stopWhenRegularFishBundleReady.type, "boolean");
  assert.match(input.properties.stopWhenRegularFishBundleReady.description ?? "", /declared-agent bundle/);
  assert.match(input.properties.stopWhenRegularFishBundleReady.description ?? "", /not reward eligibility/);
  assert.equal(input.properties.pollNonce.type, "string");
  assert.equal(input.properties.pollNonce.minLength, 1);
  assert.equal(input.properties.pollNonce.maxLength, 96);
  assert.equal(input.properties.pollNonce.pattern, "^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$");
  assert.match(input.properties.pollNonce.description ?? "", /operation=status or sell_fish_status/);
  assert.match(input.properties.pollNonce.description ?? "", /Prefer POST/);
  assert.match(input.properties.pollNonce.description ?? "", /echoes the validated value unchanged/);
  assert.match(input.properties.commandId.description ?? "", /omit this only to recover the active dedicated fishing command/);
  assert.match(input.properties.commandId.description ?? "", /never selects a generic/);
  assert.match(input.properties.commandId.description ?? "", /Required with prepare_redemption/);
  assert.match(input.properties.questId.description ?? "", /cannot become generic play_for/);
  assert.match(input.properties.catchId.description ?? "", /Exact catch id returned for this run/);
  assert.equal(input.properties.waitSeconds.minimum, 0);
  assert.equal(input.properties.waitSeconds.maximum, 80);
  assert.match(input.properties.waitSeconds.description ?? "", /server-side wait/);
  assert.ok(output.properties.fishing);
  assert.ok(output.properties.bridge);
  assert.ok(output.properties.postCommand);
  assert.ok(output.properties.prerequisiteRequired);
  assert.ok(output.properties.walletActionRequired);
  assert.ok(output.properties.fishSale);
  assert.ok(output.properties.nftCatches);
  assert.ok(output.properties.pond);
  assert.ok(output.properties.pollWait);
  assert.ok(output.properties.ownedAmount);
  assert.ok(output.properties.requiredAmount);
  assert.ok(output.properties.nextOperation);
  assert.ok(output.properties.requestId);
  assert.ok(output.properties.pollNonce);
  const outputPollNonce = output.properties.pollNonce as JsonSchema;
  assert.equal(outputPollNonce.maxLength, 96);
  assert.equal(outputPollNonce.pattern, "^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$");
  assert.match(outputPollNonce.description ?? "", /Exact unchanged echo/);
  assert.ok(output.properties.commandRecovery);
  assert.match((output.properties.commandRecovery as JsonSchema).description ?? "", /real commandId/);
  assert.ok(output.properties.stopDrain);
  assert.match((output.properties.stopDrain as JsonSchema).description ?? "", /in-flight action/);
  assert.match((output.properties.stopDrain as JsonSchema).description ?? "", /fresh nonce/);
  assert.ok(output.properties.toolUsageReport);
});

test("agent tool manifest documents MFERGPT swap route outputs", () => {
  const manifest = buildAgentToolManifestDocument("mfertown-mfergpt-swap", "https://game.mfergpt.lol/");
  const output = manifest.outputs as { properties: Record<string, unknown> };

  assert.equal(manifest.name, "mfertown-mfergpt-swap");
  assert.equal(manifest.endpoint, "https://game.mfergpt.lol/agent-mfergpt-swap-quote");
  assert.equal(manifest.image, "https://game.mfergpt.lol/agent-tools/icon.png");
  assert.equal(manifest.featuredImage, "https://game.mfergpt.lol/agent-tools/16x9.jpeg");
  assert.ok(output.properties.inputToken);
  assert.ok(output.properties.outputToken);
  assert.ok(output.properties.transaction);
  assert.ok(output.properties.fallbackUrl);
});

test("agent tool zero-price challenge uses Base USDC EIP-3009 shape", () => {
  const challenge = buildZeroPriceToolChallenge("mfertown-mfergpt-swap", OPERATOR);

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
  const base64Payment = parseToolPaymentHeader(Buffer.from(JSON.stringify(payload)).toString("base64"));
  assert.ok(base64Payment);
  assert.equal(isZeroPriceToolPaymentUsable(base64Payment), true);

  const usage = buildToolUsageReport("mfertown-mfergpt-swap", payment, Date.now() - 25);
  assert.equal(usage.verification_type, "eip3009_authorization");
  assert.equal(usage.eip3009.caller_address, CALLER);
  assert.equal(usage.eip3009.chain_id, 8453);
  assert.equal(usage.eip3009.value, "0");

  process.env.MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID = "123";
  const commandUsage = buildToolUsageReport("mfertown-agent-command", payment, Date.now() - 25);
  assert.equal(commandUsage.tool_onchain_id, "123");
  delete process.env.MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID;

  process.env.MFERLAND_TOOL_MFERTOWN_FISHING_ID = "456";
  const fishingUsage = buildToolUsageReport("mfertown-fishing", payment, Date.now() - 25);
  assert.equal(fishingUsage.tool_onchain_id, "456");
  delete process.env.MFERLAND_TOOL_MFERTOWN_FISHING_ID;

  const verification = await verifyZeroPriceToolPayment(payment, "0x0000000000000000000000000000000000000001");
  assert.equal(verification.ok, false);
  if (verification.ok) assert.fail("expected payment verification to fail for the wrong operator");
  assert.match(verification.error ?? "", /not bound/);
});

test("agent tool slugs keep legacy mferland manifest aliases", () => {
  assert.equal(getAgentToolSlug("mfertown-agent-command"), "mfertown-agent-command");
  assert.equal(getAgentToolSlug("mfertown-fishing"), "mfertown-fishing");
  assert.equal(getAgentToolSlug("mfertown-mfergpt-swap"), "mfertown-mfergpt-swap");
  assert.equal(getAgentToolSlug("mferland-agent-command"), "mfertown-agent-command");
  assert.equal(getAgentToolSlug("mferland-fishing"), "mfertown-fishing");
  assert.equal(getAgentToolSlug("mferland-mfergpt-swap"), "mfertown-mfergpt-swap");
});

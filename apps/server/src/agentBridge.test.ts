import assert from "node:assert/strict";
import test from "node:test";
import {
  actionResultHttpStatus,
  buildAgentCommandPostCommand,
  buildAgentCommandFishingRecap,
  buildFishingNftClaimWalletAction,
  buildFishingSalePrerequisiteRequired,
  buildFishingToolCommandPayload,
  buildAgentCommandSocialRecap,
  claimDurableMessageDispatch,
  classifyAgentBridgeStopRetention,
  countHealthyQuestParticipantsNear,
  createCommandFishingStats,
  describeFishingVendorSaleRequest,
  describeAgentCommandStopDrain,
  describeEquipmentChanges,
  findFreshRegularFishingBundle,
  generatedQuestTargetAreaPatrolPoints,
  getFishingLootExpectedUntil,
  getAgentFishingStopBlockers,
  getQuestAgentHints,
  hasNewDurableResult,
  hasCompletedFishingSaleUnlockQuest,
  isAgentFarmingTarget,
  isFishingCommandAlias,
  isFishingQuestId,
  isCommandFailureCapReached,
  isGroupGatedEncounterType,
  isAgentCommandBridgeConnected,
  isAgentFishingLootInventoryReconciled,
  isAgentFishingCancelAcknowledgement,
  isFishingClaimWalletActionPending,
  isGenericQuestTargetSuppressed,
  isQuestTargetAreaCandidate,
  npcInteractionRouteStopDistance,
  normalizeCommandFailureCap,
  normalizeFishingVendorSellResult,
  normalizeFishingNftHistoryResult,
  normalizeFishingBundleReadyStop,
  routeQueueFromPosition,
  selectFishingResultOwnerCommandId,
  selectFishingCommandStatusTarget,
  resolveIncompleteRequiredQuestIdForQuests,
  recordAgentCommandFishingResult,
  resolveAgentCommandResponseSnapshot,
  shouldWaitForPendingFishingLootWindow,
  shouldAutoDisconnectAgentCommand,
  shouldSkipOptionalBossDailyCommand,
  shouldInterruptMovementForDamage,
  shouldRetainBridgeForCommandStop,
  shouldRecoverAgentFishingStop,
  shouldReportFishingReconciliationTimeoutForBridgeCleanup,
  validateFishingPollNonce,
  withFishingCommandRecovery,
  withFishingPollNonce,
  waitForAgentCommandRunner,
} from "./agentBridge.js";

test("agent action HTTP status preserves retryable chat cooldowns", () => {
  assert.equal(actionResultHttpStatus({ ok: true, status: "accepted" }), 202);
  assert.equal(actionResultHttpStatus({ ok: false, status: "chat_cooldown" }), 429);
  assert.equal(actionResultHttpStatus({ ok: false, status: "payment_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "prerequisite_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "wallet_action_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "sale_in_progress" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "insufficient_bundle" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "request_limit" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "season_point_capacity" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "approach_incomplete" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "timed_out" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "not_found" }), 404);
  assert.equal(actionResultHttpStatus({ ok: false, status: "refresh_failed" }), 502);
  assert.equal(actionResultHttpStatus({ ok: false, status: "invalid_action" }), 400);
});

test("timed commands disconnect the live bridge but preserve a pollable recap instruction", () => {
  assert.equal(shouldAutoDisconnectAgentCommand("running"), false);
  assert.equal(shouldAutoDisconnectAgentCommand("completed"), false);
  assert.equal(shouldAutoDisconnectAgentCommand("time_limit"), true);
  assert.equal(isAgentCommandBridgeConnected("time_limit", true), false);
  assert.equal(isAgentCommandBridgeConnected("completed", true), true);
  assert.equal(isAgentCommandBridgeConnected("completed", false), false);

  assert.deepEqual(buildAgentCommandPostCommand("time_limit", false), {
    state: "time_exhausted",
    instruction: "The bounded task is finished and the room bridge disconnected automatically. Recap the returned evidence and do not run follow-up gameplay actions on this bridge. Describe progress only from questChanges, inventoryChanges, or equipmentChanges; finalState is a snapshot, not proof of a change.",
    bridgeStatus: "disconnected",
  });
  assert.match(buildAgentCommandPostCommand("running", true).instruction, /Poll this command/);
  assert.match(buildAgentCommandPostCommand("completed", true).instruction, /call \/agent-stop/);
  assert.match(buildAgentCommandPostCommand("completed", true).instruction, /finalState is a snapshot/);
  assert.match(buildAgentCommandPostCommand("wallet_action_required", true).instruction, /already authorization/);
  assert.match(buildAgentCommandPostCommand("wallet_action_required", true).instruction, /do not ask for a second consent phrase/);
});

test("regular fish sales require lost-fishing-shoes and never fall back to trash", () => {
  assert.equal(hasCompletedFishingSaleUnlockQuest([]), false);
  assert.equal(hasCompletedFishingSaleUnlockQuest([
    { id: "fishin-lesson", status: "completed" },
    { id: "lost-fishing-shoes", status: "active" },
  ]), false);
  assert.equal(hasCompletedFishingSaleUnlockQuest([
    { id: "lost-fishing-shoes", status: "completed" },
  ]), true);
});

test("regular fish sale recovery is machine-readable and stays in the dedicated fishing tool", () => {
  assert.deepEqual(buildFishingSalePrerequisiteRequired(), {
    questId: "lost-fishing-shoes",
    questName: "lost fishing shoes",
    requiredStatus: "completed",
    instruction: "Complete lost-fishing-shoes and any catalog-declared fishing quest prerequisite through the dedicated fishing tool, then retry sell_fish. Do not use unrelated quests, sell_trash_items, or generic autoplay as a fallback.",
    nextRequest: {
      method: "POST",
      endpoint: "/agent-fishing",
      reuseBridgeSessionId: true,
      body: {
        operation: "start",
        questId: "lost-fishing-shoes",
        maxSeconds: 300,
        constraints: { noPaidActions: true },
      },
    },
    forbiddenEndpoint: "/agent-command",
    forbiddenCommands: ["play_for", "finish_next_quest"],
  });
});

test("dedicated fishing start strips generic autoplay overrides", () => {
  assert.deepEqual(buildFishingToolCommandPayload({
    command: "play_for",
    behaviorScheme: "farmer",
    objective: "do every quest",
    questId: "lost-fishing-shoes",
    maxSeconds: 1800,
    profile: { priority: "boss_hunter", risk: "bold", social: "chatty" },
    constraints: {
      noPaidActions: false,
      allowedActions: ["fight_npc"],
      maxDeaths: 2,
    },
  }), {
    command: "finish_quest",
    behaviorScheme: "fishing",
    questId: "lost-fishing-shoes",
    profile: { priority: "looter", risk: "bold", social: "chatty" },
    constraints: { noPaidActions: true, maxDeaths: 2 },
    maxSeconds: 1800,
  });
});

test("dedicated fishing start preserves only its regular-fish bundle-ready stop", () => {
  const payload = buildFishingToolCommandPayload({
    command: "finish_next_quest",
    behaviorScheme: "completionist",
    stopWhenRegularFishBundleReady: true,
    maxSeconds: 1800,
  });
  assert.equal(payload.command, "play_for");
  assert.equal(payload.behaviorScheme, "fishing");
  assert.equal(payload.stopWhenRegularFishBundleReady, true);
  assert.equal(payload.maxSeconds, 1800);
  assert.equal(normalizeFishingBundleReadyStop(true), false);
  assert.equal(normalizeFishingBundleReadyStop(true, true), true);
});

test("durable results require fresh sequence evidence", () => {
  assert.equal(hasNewDurableResult(4, 4), false);
  assert.equal(hasNewDurableResult(3, 4), false);
  assert.equal(hasNewDurableResult(5, 4), true);
});

test("durable vendor requests dispatch only once while awaiting a result", () => {
  const sentMessages = new Set<string>();
  assert.equal(claimDurableMessageDispatch(sentMessages, "sellFishingItems"), true);
  assert.equal(claimDurableMessageDispatch(sentMessages, "sellFishingItems"), false);
  assert.deepEqual([...sentMessages], ["sellFishingItems"]);
});

test("dedicated fishing status echoes the exact validated caller poll nonce", () => {
  const status = { ok: true, status: "running", commandId: "command-123" };
  const nonce = "status-1720900000000-a1b2c3";

  assert.deepEqual(withFishingPollNonce(status, nonce), {
    ...status,
    pollNonce: nonce,
  });
  assert.strictEqual(withFishingPollNonce(status, undefined), status);
  assert.strictEqual(withFishingPollNonce(status, ""), status);
  assert.equal(validateFishingPollNonce("poll.123_ABC:-xyz"), "poll.123_ABC:-xyz");
  assert.equal(validateFishingPollNonce("x".repeat(96)), "x".repeat(96));
  assert.deepEqual(withFishingPollNonce({
    ok: true,
    status: "in_progress",
    requestId: "sale-123",
  }, "sale-1720900000001-d4e5f6"), {
    ok: true,
    status: "in_progress",
    requestId: "sale-123",
    pollNonce: "sale-1720900000001-d4e5f6",
  });
  assert.throws(() => withFishingPollNonce(status, `  ${nonce}  `), /pollNonce must be an unchanged/);
  assert.throws(() => withFishingPollNonce(status, "x".repeat(97)), /pollNonce must be an unchanged/);
  assert.throws(() => withFishingPollNonce(status, 12345), /pollNonce must be an unchanged/);
});

test("dedicated fishing status recovery never selects a generic command", () => {
  const commands = [
    { commandId: "fish-old", dedicatedFishingTool: true, status: "completed", startedAt: 100 },
    { commandId: "generic-active", dedicatedFishingTool: false, status: "running", startedAt: 300 },
    { commandId: "fish-latest", dedicatedFishingTool: true, status: "time_limit", startedAt: 200 },
  ];

  assert.deepEqual(selectFishingCommandStatusTarget(commands, "generic-active", ""), {
    command: commands[2],
    recovery: "latest_fishing_command",
  });
  assert.equal(selectFishingCommandStatusTarget(commands, "generic-active", "generic-active"), null);
  assert.deepEqual(selectFishingCommandStatusTarget(commands, "generic-active", "fish-old"), {
    command: commands[0],
    recovery: null,
  });
});

test("dedicated fishing status recovery prefers the active fishing command", () => {
  const commands = [
    { commandId: "fish-active", dedicatedFishingTool: true, status: "running", startedAt: 100 },
    { commandId: "fish-newer-finished", dedicatedFishingTool: true, status: "completed", startedAt: 200 },
  ];

  assert.deepEqual(selectFishingCommandStatusTarget(commands, "fish-active", undefined), {
    command: commands[0],
    recovery: "active_fishing_command",
  });
  assert.equal(selectFishingCommandStatusTarget([], "", undefined), null);

  assert.deepEqual(withFishingCommandRecovery({
    ok: true,
    status: "running",
    bridgeSessionId: "bridge-real",
    commandId: "fish-active",
  }, "fish-active", "active_fishing_command"), {
    ok: true,
    status: "running",
    bridgeSessionId: "bridge-real",
    commandId: "fish-active",
    commandRecovery: {
      recovered: true,
      reason: "command_id_omitted",
      selected: "active_fishing_command",
      commandId: "fish-active",
    },
  });
  const explicit = { ok: true, bridgeSessionId: "bridge-real", commandId: "fish-active" };
  assert.strictEqual(withFishingCommandRecovery(explicit, "fish-active", null), explicit);
});

test("manual command stop waits for the tracked runner before returning a terminal recap", async () => {
  let releaseRunner = () => {};
  const runner = new Promise<void>((resolve) => {
    releaseRunner = resolve;
  });
  let waitFinished = false;
  const waiting = waitForAgentCommandRunner(runner, 1_000).then((settled) => {
    waitFinished = true;
    return settled;
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(waitFinished, false);
  releaseRunner();
  assert.equal(await waiting, true);
  assert.equal(await waitForAgentCommandRunner(new Promise<void>(() => {}), 0), false);
});

test("serialization prefers a terminal snapshot that freezes while a live response is building", async () => {
  let terminalResponse: { status: string; durationMs: number } | null = null;
  let finalizer: Promise<void> | null = null;
  let releaseBuild = () => {};
  const buildGate = new Promise<void>((resolve) => {
    releaseBuild = resolve;
  });
  let releaseFinalizer = () => {};

  const response = resolveAgentCommandResponseSnapshot(
    () => terminalResponse,
    () => finalizer,
    async () => {
      await buildGate;
      return { status: "running", durationMs: 4_000 };
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  finalizer = new Promise<void>((resolve) => {
    releaseFinalizer = resolve;
  });
  terminalResponse = { status: "time_limit", durationMs: 5_000 };
  releaseBuild();
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseFinalizer();

  assert.deepEqual(await response, terminalResponse);
});

test("a correlated late fishing result is included once and clears its pending reel", () => {
  const stats = createCommandFishingStats();
  stats.pendingReelAttemptIds.add("attempt-5");

  assert.equal(recordAgentCommandFishingResult(stats, {
    attemptId: "attempt-5",
    outcome: "missed",
    quantity: 0,
  }), true);
  assert.equal(stats.resultCount, 1);
  assert.deepEqual(stats.outcomeCounts, { missed: 1 });
  assert.equal(stats.pendingReelAttemptIds.has("attempt-5"), false);
  assert.equal(recordAgentCommandFishingResult(stats, {
    attemptId: "attempt-5",
    outcome: "missed",
    quantity: 0,
  }), false);
  assert.equal(stats.resultCount, 1);
  assert.match(buildAgentCommandFishingRecap(stats, null, null).summary, /1 fishing reel/);
});

test("a stop after reel four stays nonterminal until correlated reel five is recorded", () => {
  const stats = createCommandFishingStats();
  stats.resultCount = 4;
  stats.outcomeCounts = { missed: 4 };
  stats.pendingReelAttemptIds.add("attempt-5");

  assert.deepEqual(getAgentFishingStopBlockers({
    cancelAcknowledged: true,
    fishingState: "",
    pendingReelCount: stats.pendingReelAttemptIds.size,
    waitingForLoot: false,
  }), ["reel_result_pending"]);

  assert.equal(recordAgentCommandFishingResult(stats, {
    attemptId: "attempt-5",
    outcome: "missed",
    quantity: 0,
  }, true), true);
  assert.equal(stats.resultCount, 5);
  assert.deepEqual(stats.outcomeCounts, { missed: 5 });
  assert.deepEqual(getAgentFishingStopBlockers({
    cancelAcknowledged: true,
    fishingState: "",
    pendingReelCount: stats.pendingReelAttemptIds.size,
    waitingForLoot: false,
  }), []);
  assert.match(buildAgentCommandFishingRecap(stats, null, null).summary, /5 fishing reels/);
});

test("fishing stop requires an acknowledged cancel even before a cast appears in state", () => {
  assert.equal(isAgentFishingCancelAcknowledgement({
    ok: true,
    requestId: "command-1",
    canceled: false,
  }, "command-1"), true);
  assert.equal(isAgentFishingCancelAcknowledgement({
    ok: false,
    requestId: "command-1",
  }, "command-1"), false);
  assert.equal(isAgentFishingCancelAcknowledgement({
    ok: true,
    requestId: "command-2",
  }, "command-1"), false);
  assert.deepEqual(getAgentFishingStopBlockers({
    cancelAcknowledged: false,
    fishingState: "",
    pendingReelCount: 0,
    waitingForLoot: false,
  }), ["cancel_unacknowledged"]);
  assert.deepEqual(getAgentFishingStopBlockers({
    cancelAcknowledged: true,
    fishingState: "",
    pendingReelCount: 0,
    waitingForLoot: false,
  }), []);
});

test("regular fishing loot waits for a post-close authoritative inventory observation", () => {
  const pendingLoot = {
    quantity: 10,
    inventoryCountBefore: 2,
    closedAt: 1_720_900_001_000,
    closedObservationSequence: 41,
  };
  assert.equal(isAgentFishingLootInventoryReconciled(pendingLoot, 12, 41), false);
  assert.equal(isAgentFishingLootInventoryReconciled(pendingLoot, 11, 42), false);
  assert.equal(isAgentFishingLootInventoryReconciled(pendingLoot, 12, 42), true);
});

test("late fishing results stay owned by their original command", () => {
  const owners = new Map([["attempt-a-5", "command-a"]]);
  assert.equal(selectFishingResultOwnerCommandId("attempt-a-5", owners, "command-b"), "command-a");
  assert.equal(selectFishingResultOwnerCommandId("attempt-b-1", owners, "command-b"), "command-b");
});

test("timed-out fishing drains remain running and recoverable", () => {
  assert.equal(shouldRecoverAgentFishingStop("running", "timed_out"), true);
  assert.equal(shouldRecoverAgentFishingStop("failed", "timed_out"), false);
  assert.equal(shouldRecoverAgentFishingStop("running", "settling"), false);
  assert.equal(shouldReportFishingReconciliationTimeoutForBridgeCleanup("running", "timed_out"), true);
  assert.equal(shouldReportFishingReconciliationTimeoutForBridgeCleanup("running", "settling"), false);
});

test("bridge cleanup retains settling, timed-out, and wallet-handoff commands", () => {
  assert.deepEqual(classifyAgentBridgeStopRetention("running", "timed_out", false), {
    httpStatus: 409,
    status: "reconciliation_timeout",
  });
  assert.deepEqual(classifyAgentBridgeStopRetention("running", "settling", false), {
    httpStatus: 202,
    status: "command_settling",
  });
  assert.deepEqual(classifyAgentBridgeStopRetention("wallet_action_required", "settled", true), {
    httpStatus: 409,
    status: "wallet_action_required",
  });
  assert.equal(classifyAgentBridgeStopRetention("stopped", "settled", false), null);
  assert.equal(shouldRetainBridgeForCommandStop("running", "settling"), true);
  assert.equal(shouldRetainBridgeForCommandStop("failed", "timed_out"), true);
  assert.equal(shouldRetainBridgeForCommandStop("wallet_action_required", "settled"), true);
  assert.equal(shouldRetainBridgeForCommandStop("payment_required", "not_needed"), true);
  assert.equal(shouldRetainBridgeForCommandStop("wallet_action_required", "settled", false), false);
  assert.equal(shouldRetainBridgeForCommandStop("stopped", "settled"), false);
  assert.deepEqual(describeAgentCommandStopDrain({
    status: "settled",
    requestedAt: 1_720_900_000_000,
    settledAt: 1_720_900_001_000,
    requestedStatus: "stopped",
    stoppedBecause: "manual_stop",
    cancelRequested: true,
    cancelRequestedAt: 1_720_900_000_100,
    cancelAcknowledgedAt: 1_720_900_000_200,
    resultCountBefore: 4,
    resultCountAfter: 5,
  }), {
    status: "settled",
    requestedAt: "2024-07-13T19:46:40.000Z",
    settledAt: "2024-07-13T19:46:41.000Z",
    requestedStatus: "stopped",
    stoppedBecause: "manual_stop",
    cancelRequested: true,
    cancelRequestedAt: "2024-07-13T19:46:40.100Z",
    cancelAcknowledgedAt: "2024-07-13T19:46:40.200Z",
    resultCountBefore: 4,
    resultCountAfter: 5,
  });
});

test("bridge cleanup releases a fishing claim handoff only after authoritative confirmation", () => {
  const walletAction = { action: "claim_fishing_nft", catchId: "catch-1" };
  assert.equal(isFishingClaimWalletActionPending(walletAction, {
    catchId: "catch-1",
    status: "voucher_issued",
    walletActionRequired: true,
  }), true);
  assert.equal(isFishingClaimWalletActionPending(walletAction, {
    catchId: "catch-1",
    status: "tx_submitted",
    walletActionRequired: true,
  }), true);
  assert.equal(isFishingClaimWalletActionPending(walletAction, {
    catchId: "catch-1",
    status: "confirmed",
    walletActionRequired: false,
  }), false);
});

test("fish sale results preserve the request id and authoritative sold totals", () => {
  assert.deepEqual(normalizeFishingVendorSellResult({
    requestId: "sale-123",
    ok: true,
    status: "sold",
    sold: [{
      itemId: "reply-gill-minnow",
      itemName: "reply-gill minnow",
      quantity: 20,
      points: 2,
      bundleSize: 10,
    }],
    quantity: 20,
    points: 2,
    season0Points: 82,
    season0DailyPoints: 30,
  }), {
    requestId: "sale-123",
    ok: true,
    status: "sold",
    sold: [{
      itemId: "reply-gill-minnow",
      itemName: "reply-gill minnow",
      quantity: 20,
      points: 2,
      bundleSize: 10,
    }],
    quantity: 20,
    points: 2,
    season0Points: 82,
    season0DailyPoints: 30,
    mferGptGate: undefined,
    error: undefined,
  });
});

test("fish sale results preserve sanitized bundle shortfalls", () => {
  const result = normalizeFishingVendorSellResult({
    requestId: "sale-short",
    ok: false,
    status: "insufficient_bundle",
    sold: [],
    bundleRequirements: [{
      itemId: "based-bass",
      itemName: "based bass",
      availableQuantity: 5.9,
      bundleSize: 6,
      neededQuantity: 1,
      pointsPerBundle: 4,
      privateNote: "drop me",
    }],
    requestedQuantity: 5.9,
    seasonPointCapacity: 0,
    minimumBundlePoints: 4.9,
    error: "fish held but below a bundle",
  });
  assert.equal(result.status, "insufficient_bundle");
  assert.deepEqual(result.bundleRequirements, [{
    itemId: "based-bass",
    itemName: "based bass",
    availableQuantity: 5,
    bundleSize: 6,
    neededQuantity: 1,
    pointsPerBundle: 4,
  }]);
  assert.equal(result.requestedQuantity, 5);
  assert.equal(result.seasonPointCapacity, 0);
  assert.equal(result.minimumBundlePoints, 4);
});

test("fish sale status distinguishes unknown, pending, timed out, and terminal requests", () => {
  assert.deepEqual(describeFishingVendorSaleRequest("bad request", null, 0, 10_000), {
    ok: false,
    status: "rejected",
    error: "sell_fish_status requires a valid requestId",
  });
  assert.deepEqual(describeFishingVendorSaleRequest("sale-unknown", null, 0, 10_000), {
    ok: false,
    status: "not_found",
    requestId: "sale-unknown",
    error: "fish sale request not found on this bridge",
  });
  assert.deepEqual(describeFishingVendorSaleRequest("sale-pending", null, 5_000, 10_000), {
    ok: true,
    status: "in_progress",
    requestId: "sale-pending",
    durationMs: 5_000,
  });
  assert.deepEqual(describeFishingVendorSaleRequest("sale-timeout", null, 1_000, 62_000), {
    ok: false,
    status: "timed_out",
    requestId: "sale-timeout",
    durationMs: 61_000,
    error: "fish sale result did not arrive within 60 seconds; do not submit another sale until this request is reconciled",
  });
  const terminal = describeFishingVendorSaleRequest("sale-done", {
    requestId: "sale-done",
    ok: true,
    status: "sold",
    sold: [{ itemId: "reply-gill-minnow", itemName: "reply-gill minnow", quantity: 10, points: 1, bundleSize: 10 }],
    quantity: 10,
    points: 1,
  }, 0, 10_000);
  assert.equal(terminal.ok, true);
  assert.equal(terminal.status, "sold");
  assert.equal(terminal.requestId, "sale-done");
  assert.equal(terminal.fishSale?.quantity, 10);
});

test("NFT history baselines require a fresh successful response and stay sanitized", () => {
  const failed = normalizeFishingNftHistoryResult({
    ok: false,
    catches: [{ catchId: "old-catch" }],
    error: "database unavailable",
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.catches, []);
  assert.equal(failed.error, "database unavailable");

  const refreshed = normalizeFishingNftHistoryResult({
    ok: true,
    catches: [{
      catchId: "fresh-catch",
      status: "confirmed",
      collection: "0x1111111111111111111111111111111111111111",
      voucher: { signature: "secret-signature" },
      metadata: { name: "inference eel" },
    }],
  });
  const refreshedCatches = refreshed.catches as Array<{
    catchId?: string;
    metadata?: { name?: string } | null;
    voucher?: unknown;
  }>;
  assert.equal(refreshed.ok, true);
  assert.equal(refreshedCatches.length, 1);
  assert.equal(refreshedCatches[0]?.catchId, "fresh-catch");
  assert.equal(refreshedCatches[0]?.metadata?.name, "inference eel");
  assert.equal("voucher" in (refreshedCatches[0] ?? {}), false);
});

test("agent commands interrupt movement-like actions after dangerous travel damage", () => {
  assert.equal(shouldInterruptMovementForDamage("complete_quest", 172, 140, 172), false);
  assert.equal(shouldInterruptMovementForDamage("move_to", 172, 91, 172), true);
  assert.equal(shouldInterruptMovementForDamage("complete_quest", 172, 91, 172), true);
  assert.equal(shouldInterruptMovementForDamage("fight_npc", 172, 91, 172), false);
});

test("agent command failure caps are unlimited by default but support explicit hard stops", () => {
  assert.equal(normalizeCommandFailureCap(undefined), null);
  assert.equal(normalizeCommandFailureCap(null), null);
  assert.equal(normalizeCommandFailureCap("unlimited"), null);
  assert.equal(normalizeCommandFailureCap(0), 0);
  assert.equal(normalizeCommandFailureCap("2"), 2);
  assert.equal(normalizeCommandFailureCap(250), 99);
  assert.equal(isCommandFailureCapReached(null, 50), false);
  assert.equal(isCommandFailureCapReached(0, 0), true);
  assert.equal(isCommandFailureCapReached(2, 1), false);
  assert.equal(isCommandFailureCapReached(2, 2), true);
});

test("optional boss dailies are skipped by generic autoplay unless boss-focused", () => {
  assert.equal(shouldSkipOptionalBossDailyCommand("finish_next_quest", "quester"), true);
  assert.equal(shouldSkipOptionalBossDailyCommand("play_for", "quester"), true);
  assert.equal(shouldSkipOptionalBossDailyCommand("run_goals", "quester"), true);
  assert.equal(shouldSkipOptionalBossDailyCommand("finish_quest", "quester"), false);
  assert.equal(shouldSkipOptionalBossDailyCommand("play_for", "boss_hunter"), false);
  assert.equal(shouldSkipOptionalBossDailyCommand("play_for", "completionist"), false);
});

test("daily boss quests are treated as group-gated encounters", () => {
  assert.equal(isGroupGatedEncounterType("group"), true);
  assert.equal(isGroupGatedEncounterType("raid"), true);
  assert.equal(isGroupGatedEncounterType("daily_boss"), true);
  assert.equal(isGroupGatedEncounterType("solo"), false);
});

test("agent command social recap summarizes nearby players and chat", () => {
  const now = 1_000_000;
  const recap = buildAgentCommandSocialRecap({
    social: {
      players: new Map([
        ["agent-1", {
          sessionId: "agent-1",
          name: "questbot",
          identityType: "wallet",
          isAgent: true,
          firstSeenAt: now - 20_000,
          lastSeenAt: now - 2_000,
          closestDistance: 8.25,
        }],
        ["human-1", {
          sessionId: "human-1",
          name: "playerone",
          identityType: "wallet",
          isAgent: false,
          firstSeenAt: now - 18_000,
          lastSeenAt: now - 1_000,
          closestDistance: 4.5,
        }],
      ]),
      chat: [{
        sessionId: "human-1",
        name: "playerone",
        identityType: "wallet",
        isAgent: false,
        kind: "say",
        text: "daily boss later",
        observedAt: now - 500,
      }],
    },
  }, now);

  assert.equal(recap.nearbyPlayerCount, 2);
  assert.equal(recap.nearbyAgentCount, 1);
  assert.equal(recap.nearbyHumanCount, 1);
  assert.deepEqual(recap.nearbyPlayers.map((player) => player.name), ["playerone", "questbot"]);
  assert.equal(recap.recentChat[0]?.text, "daily boss later");
  assert.match(recap.summary, /playerone/);
  assert.match(recap.summary, /questbot \(agent\)/);
  assert.match(recap.summary, /daily boss later/);
});

test("agent command fishing recap summarizes catches, sales, and NFT names", () => {
  const recap = buildAgentCommandFishingRecap({
    resultCount: 3,
    outcomeCounts: { caught: 2, junk: 1 },
    catchTotals: new Map([
      ["sartofish", {
        itemId: "sartofish",
        itemName: "Sartofish",
        quantity: 2,
        outcome: "caught",
      }],
      ["old-mfer-shoe", {
        itemId: "old-mfer-shoe",
        itemName: "Old Mfer Shoe",
        quantity: 1,
        outcome: "junk",
      }],
    ]),
    catchEvents: [{
      attemptId: "attempt-1",
      outcome: "caught",
      itemId: "sartofish",
      itemName: "Sartofish",
      quantity: 2,
    }],
    recordedAttemptIds: new Set(["attempt-1"]),
    pendingReelAttemptIds: new Set(),
    pendingLoot: null,
    saleTotals: new Map([
      ["sartofish", {
        itemId: "sartofish",
        itemName: "Sartofish",
        quantity: 2,
        points: 4,
        bundleSize: 2,
      }],
    ]),
    saleEvents: [{
      ok: true,
      status: "sold",
      sold: [{
        itemId: "sartofish",
        itemName: "Sartofish",
        quantity: 2,
        points: 4,
        bundleSize: 2,
      }],
      quantity: 2,
      points: 4,
      season0Points: 44,
      season0DailyPoints: 4,
      gateReason: "",
      gateEligible: true,
      error: "",
    }],
    nftCatches: new Map([
      ["catch-1", {
        catchId: "catch-1",
        status: "confirmed",
        walletActionRequired: false,
        collection: "0x1111111111111111111111111111111111111111",
        metadata: { name: "Artifishial Intelligence" },
        mintClubRedemption: { status: "eligible" },
      }],
    ]),
    nftClaimWalletActions: new Map(),
    capNotices: [],
    currentRunBundleReady: null,
  }, {
    enabled: true,
    stocked: true,
    perWalletDailyCap: 3,
    walletDailyRemaining: 2,
    globalDailyCap: 50,
    globalDailyRemaining: 49,
  }, null);

  assert.match(recap.summary, /3 fishing reels/);
  assert.match(recap.summary, /caught 2 Sartofish and 1 Old Mfer Shoe/);
  assert.match(recap.summary, /sold 2 Sartofish for 4 Season 0 points/);
  assert.match(recap.summary, /NFT catch: Artifishial Intelligence/);
  assert.match(recap.summary, /1 Mint Club goodie ready/);
  assert.equal(recap.caughtItems.length, 2);
  assert.equal(recap.soldItems[0]?.points, 4);
  assert.deepEqual(recap.nftCatchNames, ["Artifishial Intelligence"]);
  assert.equal(recap.fishSalePointTotal, 4);
});

test("agent fishing waits for post-reel loot before recasting", () => {
  const now = 1_000_000;
  const expectedUntil = getFishingLootExpectedUntil({
    ok: true,
    outcome: "caught",
    itemId: "reply-gill-minnow",
    itemName: "reply-gill minnow",
    quantity: 1,
  }, now);

  assert.equal(expectedUntil > now, true);
  assert.equal(shouldWaitForPendingFishingLootWindow(false, expectedUntil, now + 1_000), true);
  assert.equal(shouldWaitForPendingFishingLootWindow(true, expectedUntil, now + 1_000), false);
  assert.equal(shouldWaitForPendingFishingLootWindow(false, expectedUntil, expectedUntil + 1), false);

  assert.equal(getFishingLootExpectedUntil({
    ok: true,
    outcome: "junk",
    itemId: "old-mfer-shoe",
    quantity: 1,
  }, now) > now, true);
  assert.equal(getFishingLootExpectedUntil({ ok: true, outcome: "missed", quantity: 0 }, now), 0);
  assert.equal(getFishingLootExpectedUntil({ ok: false, outcome: "caught", itemId: "reply-gill-minnow", quantity: 1 }, now), 0);
});

test("dedicated fishing stops only after a current-run catch lands into an agent sale bundle", () => {
  const caughtMinnow = [{
    itemId: "reply-gill-minnow",
    itemName: "reply-gill minnow",
    quantity: 1,
    outcome: "caught",
  }];
  assert.equal(findFreshRegularFishingBundle(caughtMinnow, { "reply-gill-minnow": 20 }, { "reply-gill-minnow": 20 }, true), null);
  assert.equal(findFreshRegularFishingBundle([
    { itemId: "messy-red-lobster", itemName: "messy red lobster", quantity: 1, outcome: "caught" },
  ], {}, { "messy-red-lobster": 1 }, true), null);
  assert.deepEqual(findFreshRegularFishingBundle(caughtMinnow, { "reply-gill-minnow": 19 }, { "reply-gill-minnow": 20 }, true), {
    itemId: "reply-gill-minnow",
    itemName: "reply-gill minnow",
    freshQuantity: 1,
    availableQuantity: 20,
    bundleSize: 20,
    sellableQuantity: 20,
    points: 1,
  });
  assert.equal(findFreshRegularFishingBundle([
    { itemId: "reply-gill-minnow", itemName: "reply-gill minnow", quantity: 1, outcome: "missed" },
    { itemId: "old-mfer-shoe", itemName: "old mfer shoe", quantity: 1, outcome: "junk" },
  ], { "reply-gill-minnow": 19 }, { "reply-gill-minnow": 20, "old-mfer-shoe": 1 }, true), null);
  assert.equal(findFreshRegularFishingBundle(caughtMinnow, { "reply-gill-minnow": 9 }, { "reply-gill-minnow": 10 }, true), null);
});

test("agent NFT fishing catches produce a claim wallet action", () => {
  const action = buildFishingNftClaimWalletAction({
    catchId: "0x86bb58d201e723d63e20e25294881da5bd60b5b47d84109005f789cef7c15421",
    status: "voucher_issued",
    walletActionRequired: true,
    walletAddress: "0x39225d40c7a7157a838eccdb05d09208d47fd523",
    standard: "ERC1155",
    collection: "0xf2461ba88fd5efdb88b0172d430e6ad277c91091",
    tokenId: "0",
    amount: "1",
    pondEntryId: "8",
    chainId: 8453,
    contractAddress: "0xa08939464d3dc6d2ece0a4ba51449a068073329a",
    expiresAt: 1782845905,
    metadata: { name: "inference eel" },
    voucher: {
      catchId: "0x86bb58d201e723d63e20e25294881da5bd60b5b47d84109005f789cef7c15421",
      fisher: "0x39225d40c7a7157a838eccdb05d09208d47fd523",
      tokenStandard: 1,
      standard: "ERC1155",
      collection: "0xf2461ba88fd5efdb88b0172d430e6ad277c91091",
      tokenId: "0",
      amount: "1",
      pondEntryId: "8",
      expiresAt: 1782845905,
      chainId: 8453,
      verifyingContract: "0xa08939464d3dc6d2ece0a4ba51449a068073329a",
      signature: "0x1234",
    },
  });

  assert.equal(action?.action, "claim_fishing_nft");
  assert.equal(action?.catchId, "0x86bb58d201e723d63e20e25294881da5bd60b5b47d84109005f789cef7c15421");
  assert.equal(action?.transaction.to, "0xa08939464d3dc6d2ece0a4ba51449a068073329a");
  assert.match(String(action?.transaction.data), /^0x/);
  assert.equal(action?.submitAction.action, "submit_fishing_nft_claim_tx");
});

test("hosted command fishing aliases are distinct from farming", () => {
  assert.equal(isFishingCommandAlias("fish"), true);
  assert.equal(isFishingCommandAlias("start fishing"), true);
  assert.equal(isFishingCommandAlias("fish for onchain goodies"), true);
  assert.equal(isFishingCommandAlias("onchain_goodies"), true);
  assert.equal(isFishingCommandAlias("farm"), false);
  assert.equal(isFishingCommandAlias("farmer"), false);
  assert.equal(isFishingQuestId("fishin-lesson"), true);
  assert.equal(isFishingQuestId("lost-fishing-shoes"), true);
  assert.equal(isFishingQuestId("ridge-dispatch"), false);
});

test("agent safe farming targets exclude training dummies", () => {
  assert.equal(isAgentFarmingTarget({
    id: "training-dummy-left",
    role: "enemy",
    model: "training-dummy",
    isImmortal: true,
  }), false);
  assert.equal(isAgentFarmingTarget({
    id: "training-dummy-right",
    role: "enemy",
    model: "training-dummy",
    isImmortal: false,
  }), false);
  assert.equal(isAgentFarmingTarget({
    id: "rabbit-fountain",
    role: "critter",
    model: "rabbit",
  }), true);
});

test("agent command equipment changes summarize loadout updates", () => {
  const changes = describeEquipmentChanges(
    [
      { slot: "weapon", itemId: "training-stick", chainTokenId: "", chainTier: 1 },
      { slot: "chest", itemId: "threadbare-hoodie", chainTokenId: "", chainTier: 1 },
    ],
    [
      { slot: "weapon", itemId: "chain-bonker", chainTokenId: "42", chainTier: 2 },
      { slot: "chest", itemId: "threadbare-hoodie", chainTokenId: "", chainTier: 1 },
      { slot: "trinket", itemId: "signal-charm", chainTokenId: "", chainTier: 1 },
    ],
  );

  assert.deepEqual(changes, [
    {
      slot: "trinket",
      before: null,
      after: { itemId: "signal-charm", chainTokenId: "", chainTier: 1 },
    },
    {
      slot: "weapon",
      before: { itemId: "training-stick", chainTokenId: "", chainTier: 1 },
      after: { itemId: "chain-bonker", chainTokenId: "42", chainTier: 2 },
    },
  ]);
});

test("structured quest goals resolve unfinished prerequisites before accepting later quests", () => {
  const completedBeforeCutTheStatic = [
    "mfer-beginnings",
    "set-your-traits",
    "dao-tour",
    "fountain-vibes",
    "sealed-note",
    "farm-road-handoff",
    "boar-bristle-cull",
    "feral-farmers",
    "hog-livers",
    "field-camp-delivery",
    "route-patrol-daily",
    "hog-loop",
    "ridge-dispatch",
    "signal-scraps",
  ].map((id) => ({ id, status: "completed" }));

  assert.equal(
    resolveIncompleteRequiredQuestIdForQuests(
      [...completedBeforeCutTheStatic, { id: "cut-the-static", status: "active" }],
      "baron-of-static",
    ),
    "cut-the-static",
  );
  assert.equal(
    resolveIncompleteRequiredQuestIdForQuests(
      [...completedBeforeCutTheStatic, { id: "cut-the-static", status: "completed" }],
      "baron-of-static",
    ),
    "",
  );
});

test("generic quest targeting respects catalog suppression hints", () => {
  const hints = getQuestAgentHints("signal-scraps");
  assert.equal(hints.targetArea?.label, "signal ridge scrap sources");
  assert.equal(hints.patrolPoints.length, 4);
  assert.deepEqual(hints.avoidGenericTargetNpcIds, ["static-mage-ori"]);

  assert.equal(isGenericQuestTargetSuppressed("signal-scraps", "static-mage-ori"), true);
  assert.equal(isGenericQuestTargetSuppressed("signal-scraps", "ridge-raider-vex"), false);
  assert.equal(isGenericQuestTargetSuppressed("cut-the-static", "static-mage-ori"), false);
});

test("generic quest targeting stays near the catalog target area", () => {
  assert.equal(isQuestTargetAreaCandidate("route-patrol-daily", { x: -119.2, z: 132.4 }), true);
  assert.equal(isQuestTargetAreaCandidate("route-patrol-daily", { x: 153.2, z: -95.8 }), false);
  assert.equal(isQuestTargetAreaCandidate("cut-the-static", { x: 153.2, z: -95.8 }), true);

  const sweep = generatedQuestTargetAreaPatrolPoints({ x: -89, z: 92 }, "claim pile hogs");
  assert.equal(sweep.length, 5);
  assert.deepEqual(sweep.map((point) => point.label), [
    "claim pile hogs north sweep",
    "claim pile hogs east sweep",
    "claim pile hogs south sweep",
    "claim pile hogs west sweep",
    "claim pile hogs center sweep",
  ]);
});

test("public route execution resumes from a nearby later waypoint", () => {
  const route = [
    { x: 0, z: -34 },
    { x: 0, z: -56 },
    { x: 53, z: -11.5 },
  ];
  assert.deepEqual(routeQueueFromPosition(route, { x: 4.3, z: -55.7 }), route.slice(1));
  assert.deepEqual(routeQueueFromPosition(route, { x: 0, z: 29 }), route);
});

test("npc interaction routes stop inside strict quest send range", () => {
  const questSendRange = 3.75;
  const arrivalTolerance = 0.8;
  const stopDistance = npcInteractionRouteStopDistance(questSendRange, arrivalTolerance);

  assert.ok(stopDistance + arrivalTolerance < questSendRange);
});

test("group support counts healthy active quest participants near the objective", () => {
  const participants = [
    {
      sessionId: "self",
      health: 92,
      maxHealth: 100,
      x: 0,
      z: 0,
      quests: [{ id: "baron-of-static", status: "active" }],
    },
    {
      sessionId: "ally",
      health: 60,
      maxHealth: 100,
      x: 4,
      z: 3,
      quests: [{ id: "baron-of-static", status: "active" }],
    },
    {
      sessionId: "low-health",
      health: 49,
      maxHealth: 100,
      x: 1,
      z: 1,
      quests: [{ id: "baron-of-static", status: "active" }],
    },
    {
      sessionId: "wrong-quest",
      health: 95,
      maxHealth: 100,
      x: 1,
      z: 1,
      quests: [{ id: "cut-the-static", status: "active" }],
    },
    {
      sessionId: "far",
      health: 95,
      maxHealth: 100,
      x: 25,
      z: 25,
      quests: [{ id: "baron-of-static", status: "active" }],
    },
    {
      sessionId: "ally",
      health: 100,
      maxHealth: 100,
      x: 0,
      z: 0,
      quests: [{ id: "baron-of-static", status: "active" }],
    },
  ];

  assert.equal(countHealthyQuestParticipantsNear(participants, { x: 0, z: 0 }, 10, "baron-of-static"), 2);
  assert.equal(countHealthyQuestParticipantsNear(participants, { x: 0, z: 0 }, 10, "baron-of-static", 0.88), 1);
});

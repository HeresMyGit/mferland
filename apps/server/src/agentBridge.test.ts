import assert from "node:assert/strict";
import test from "node:test";
import {
  actionResultHttpStatus,
  buildAgentCommandFishingRecap,
  buildAgentCommandSocialRecap,
  countHealthyQuestParticipantsNear,
  describeEquipmentChanges,
  generatedQuestTargetAreaPatrolPoints,
  getFishingLootExpectedUntil,
  getQuestAgentHints,
  isFishingCommandAlias,
  isFishingQuestId,
  isCommandFailureCapReached,
  isGroupGatedEncounterType,
  isGenericQuestTargetSuppressed,
  isQuestTargetAreaCandidate,
  npcInteractionRouteStopDistance,
  normalizeCommandFailureCap,
  routeQueueFromPosition,
  resolveIncompleteRequiredQuestIdForQuests,
  shouldWaitForPendingFishingLootWindow,
  shouldSkipOptionalBossDailyCommand,
  shouldInterruptMovementForDamage,
} from "./agentBridge.js";

test("agent action HTTP status preserves retryable chat cooldowns", () => {
  assert.equal(actionResultHttpStatus({ ok: true, status: "accepted" }), 202);
  assert.equal(actionResultHttpStatus({ ok: false, status: "chat_cooldown" }), 429);
  assert.equal(actionResultHttpStatus({ ok: false, status: "payment_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "wallet_action_required" }), 409);
  assert.equal(actionResultHttpStatus({ ok: false, status: "invalid_action" }), 400);
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
    capNotices: [],
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

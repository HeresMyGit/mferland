import assert from "node:assert/strict";
import test from "node:test";
import {
  getNpcQuestMarker,
  getQuestNextQuestId,
  getQuestRepeatCooldownMs,
  getQuestRepeatLabel,
  isQuestAvailableForSnapshots,
  isRepeatableQuest,
} from "./questHelpers.js";
import {
  MFERGPT_DAILY_QUEST_ASSIGNMENTS,
  getMferGptDailyQuestAssignment,
  getMferGptDailyQuestAssignmentFromFlags,
  isMferGptDailyQuestDefeatTarget,
  isMferGptDailyQuestDropSource,
  makeMferGptDailyQuestFlags,
  makeMferGptDailyQuestFlagsForAssignment,
} from "./mferGptDailyQuests.js";
import { QUESTS } from "./quests.js";
import type { QuestId, QuestSnapshot } from "./types.js";

function quest(id: QuestId, status: QuestSnapshot["status"]): QuestSnapshot {
  return {
    id,
    status,
    progress: status === "completed" || status === "ready" ? 1 : 0,
    required: 1,
    flags: "",
    completedAt: status === "completed" ? Date.now() : 0,
  };
}

const PRIMARY_QUEST_CHAIN: QuestId[] = [
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
  "cut-the-static",
  "baron-of-static",
  "ogre-raid-daily",
];

test("sealed-note completion routes players from drip to hogwatch before boar cull", () => {
  const afterSealedNote = [quest("sealed-note", "completed")];

  assert.equal(getNpcQuestMarker({ id: "wearables-mfer" }, afterSealedNote), "available");

  const withHandoffReady = [...afterSealedNote, quest("farm-road-handoff", "ready")];
  assert.equal(getNpcQuestMarker({ id: "hogwatch-mfer" }, withHandoffReady), "turnIn");

  const afterHandoff = [...afterSealedNote, quest("farm-road-handoff", "completed")];
  assert.equal(getNpcQuestMarker({ id: "hogwatch-mfer" }, afterHandoff), "available");
});

test("bridge quests are not offered after their follow-up is already completed", () => {
  const progressedPastFarmHandoff = [
    quest("sealed-note", "completed"),
    quest("boar-bristle-cull", "completed"),
  ];

  assert.equal(isQuestAvailableForSnapshots("farm-road-handoff", progressedPastFarmHandoff), false);
});

test("traits mfer marker matches server's post-progression trait offer exception", () => {
  const progressedPastTraits = [
    quest("mfer-beginnings", "completed"),
    quest("dao-tour", "completed"),
  ];

  assert.equal(isQuestAvailableForSnapshots("set-your-traits", progressedPastTraits), true);
  assert.equal(getNpcQuestMarker({ id: "traits-mfer" }, progressedPastTraits), "available");
});

test("primary quest chain exposes the next quest giver after every completion", () => {
  const questLog: QuestSnapshot[] = [];

  for (let index = 0; index < PRIMARY_QUEST_CHAIN.length - 1; index += 1) {
    const questId = PRIMARY_QUEST_CHAIN[index] as QuestId;
    const nextQuestId = PRIMARY_QUEST_CHAIN[index + 1] as QuestId;

    assert.equal(getQuestNextQuestId(questId), nextQuestId);
    questLog.push(quest(questId, "completed"));

    assert.equal(
      isQuestAvailableForSnapshots(nextQuestId, questLog),
      true,
      `${nextQuestId} should become available after ${questId}`,
    );
    assert.equal(
      getNpcQuestMarker({ id: QUESTS[nextQuestId].giverNpcId }, questLog),
      isRepeatableQuest(nextQuestId) ? "dailyAvailable" : "available",
      `${QUESTS[nextQuestId].giverNpcId} should mark ${nextQuestId}`,
    );
  }

  const finalQuestId = PRIMARY_QUEST_CHAIN[PRIMARY_QUEST_CHAIN.length - 1] as QuestId;
  assert.equal(getQuestNextQuestId(finalQuestId), null);
});

test("hog loop uses a production daily cooldown", () => {
  assert.equal(getQuestRepeatCooldownMs("hog-loop"), 86_400_000);
  assert.equal(getQuestRepeatLabel("hog-loop"), "daily");
});

test("mferGPT daily fieldwork is repeatable after signal check", () => {
  assert.equal(getQuestRepeatCooldownMs("mfergpt-daily-signal"), 86_400_000);
  assert.equal(getQuestRepeatLabel("mfergpt-daily-signal"), "daily fieldwork");

  const afterSignalCheck = [quest("mfergpt-checkin", "completed")];
  assert.equal(isQuestAvailableForSnapshots("mfergpt-daily-signal", afterSignalCheck), true);
  assert.equal(getNpcQuestMarker({ id: "mfergpt" }, afterSignalCheck), "dailyAvailable");

  const readyDailySignal = [...afterSignalCheck, quest("mfergpt-daily-signal", "ready")];
  assert.equal(getNpcQuestMarker({ id: "mfergpt" }, readyDailySignal), "dailyTurnIn");
});

test("mferGPT daily assignments are boss events at the signal camp", () => {
  assert.ok(MFERGPT_DAILY_QUEST_ASSIGNMENTS.length >= 5);
  assert.ok(MFERGPT_DAILY_QUEST_ASSIGNMENTS.every((assignment) => assignment.required === 1));
  assert.ok(MFERGPT_DAILY_QUEST_ASSIGNMENTS.every((assignment) => assignment.kind === "defeat"));
  assert.ok(MFERGPT_DAILY_QUEST_ASSIGNMENTS.every((assignment) => assignment.targetGroup === "daily-boss"));
  assert.ok(MFERGPT_DAILY_QUEST_ASSIGNMENTS.every((assignment) => assignment.bossName));

  const assignment = getMferGptDailyQuestAssignment(new Date("2026-05-11T12:00:00Z").getTime());
  const flags = makeMferGptDailyQuestFlags(assignment.id);
  assert.equal(getMferGptDailyQuestAssignmentFromFlags(flags).id, assignment.id);
});

test("mferGPT daily assignment targeting matches the daily boss", () => {
  assert.deepEqual(QUESTS["mfergpt-daily-signal"].defeatNpcIdPrefixes, ["mfergpt-daily-boss"]);
  assert.equal(QUESTS["mfergpt-daily-signal"].encounterType, "daily_boss");
  assert.equal(QUESTS["mfergpt-daily-signal"].groupSuggestion, "daily boss");
  assert.equal(QUESTS["mfergpt-daily-signal"].suggestedPlayerCount, 4);
  assert.match(QUESTS["mfergpt-daily-signal"].soloWarning, /below level 10/i);

  const hogSweep = getMferGptDailyQuestAssignmentFromFlags(makeMferGptDailyQuestFlags("claim-pile-hog-sweep"));
  assert.equal(isMferGptDailyQuestDefeatTarget(hogSweep, { id: "mfergpt-daily-boss", model: "mfer", role: "farmer" }), true);
  assert.equal(isMferGptDailyQuestDefeatTarget(hogSweep, { id: "wild-hog-rooter", model: "hog", role: "beast" }), false);
  assert.equal(isMferGptDailyQuestDefeatTarget(hogSweep, { id: "farmhand-bran", model: "mfer", role: "farmer" }), false);

  const eosHaul = getMferGptDailyQuestAssignmentFromFlags(makeMferGptDailyQuestFlags("chewed-eos-haul"));
  assert.equal(isMferGptDailyQuestDropSource(eosHaul, { id: "wild-hog-rooter", model: "hog", role: "beast" }), false);
  assert.equal(isMferGptDailyQuestDropSource(eosHaul, { id: "mfergpt-daily-boss", model: "mfer", role: "farmer" }), false);
});

test("mferGPT generated daily flags preserve dynamic quest copy", () => {
  const flags = makeMferGptDailyQuestFlagsForAssignment({
    id: "generated timeline fire",
    kind: "collect",
    title: "timeline fire drill",
    summary: "the feed got loud and mferGPT compressed it into one boss at camp.",
    objectiveLabel: "drop the timeline fire boss at the daily signal camp",
    required: 99,
    targetGroup: "hogs",
    sourceThemes: ["timeline", "reply loops"],
    bossName: "timeline fire mfer",
    bossDialogue: "the replies gave me legs.",
  });

  const assignment = getMferGptDailyQuestAssignmentFromFlags(flags);
  assert.equal(assignment.id, "generated-timeline-fire");
  assert.equal(assignment.title, "timeline fire drill");
  assert.equal(assignment.kind, "defeat");
  assert.equal(assignment.required, 1);
  assert.equal(assignment.targetGroup, "daily-boss");
  assert.equal(assignment.bossName, "timeline fire mfer");
  assert.equal(isMferGptDailyQuestDefeatTarget(assignment, { id: "mfergpt-daily-boss", model: "mfer", role: "farmer" }), true);
});

test("mferGPT generated daily mob names reserve mferGPT for the plaza NPC", () => {
  const flags = makeMferGptDailyQuestFlagsForAssignment({
    id: "generated imposter signal",
    kind: "defeat",
    title: "imposter signal",
    summary: "a fake assistant name tried to walk into camp as a hostile mob.",
    objectiveLabel: "drop the imposter signal boss at the daily signal camp",
    required: 1,
    targetGroup: "daily-boss",
    sourceThemes: ["agents"],
    bossName: "mferGPT",
    bossDialogue: "wrong name. wrong place.",
    witnessName: "mferGPT echo",
    witnessDialogue: "borrowed name, bad posture.",
    hintName: "mferGPT",
    hintDialogue: "hit the fake name until it stops moving.",
  });

  const assignment = getMferGptDailyQuestAssignmentFromFlags(flags);
  assert.equal(/\bmfer\s*gpt\b/i.test(assignment.bossName ?? ""), false);
  assert.equal(/\bmfer\s*gpt\b/i.test(assignment.witnessName ?? ""), false);
  assert.equal(/\bmfer\s*gpt\b/i.test(assignment.hintName ?? ""), false);
});

test("quest rewards form the early gear progression spine", () => {
  assert.deepEqual(QUESTS["fountain-vibes"].rewardItemIds, ["reply-lag-visor"]);
  assert.deepEqual(QUESTS["ask-mfergpt"].rewardItemIds, ["receipt-zine"]);
  assert.deepEqual(QUESTS["mfergpt-checkin"].rewardItemIds, ["headphone-splitter"]);
  assert.deepEqual(QUESTS["mfergpt-daily-signal"].rewardItemIds, ["blue-juice"]);
  assert.deepEqual(QUESTS["field-camp-delivery"].rewardItemIds, ["field-patched-hoodie"]);
  assert.deepEqual(QUESTS["signal-scraps"].rewardItemIds, ["ridge-runner-beanie"]);
  assert.deepEqual(QUESTS["baron-of-static"].rewardItemIds, ["baron-breaker-board"]);
});

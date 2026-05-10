import assert from "node:assert/strict";
import test from "node:test";
import {
  getNpcQuestMarker,
  getQuestNextQuestId,
  getQuestRepeatCooldownMs,
  getQuestRepeatLabel,
  isQuestAvailableForSnapshots,
} from "./questHelpers.js";
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
      "available",
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

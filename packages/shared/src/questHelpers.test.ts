import assert from "node:assert/strict";
import test from "node:test";
import { getNpcQuestMarker, isQuestAvailableForSnapshots } from "./questHelpers.js";
import type { QuestId, QuestSnapshot } from "./types.js";

function quest(id: QuestId, status: QuestSnapshot["status"]): QuestSnapshot {
  return {
    id,
    status,
    progress: status === "completed" || status === "ready" ? 1 : 0,
    required: 1,
    flags: "",
    completedAt: status === "completed" ? 1 : 0,
  };
}

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

import assert from "node:assert/strict";
import test from "node:test";
import { MapSchema } from "@colyseus/schema";
import {
  FISHING_POND_STATUS_NPC_ID,
  FISHING_TUTOR_NPC_ID,
  FISHING_VENDOR_NPC_ID,
  FISHING_ZONE,
  MINT_CLUB_REDEMPTION_NPC_ID,
  getFishingZoneDistance,
  isInsideFishingWater,
} from "@mferland/shared";
import { NpcState } from "../state.js";
import { spawnNpcs } from "./npcs.js";

test("fishing pond NPCs are spread into distinct shore stations", () => {
  const npcs = new MapSchema<NpcState>();
  spawnNpcs(npcs);

  const fishingNpcIds = [
    FISHING_TUTOR_NPC_ID,
    FISHING_VENDOR_NPC_ID,
    MINT_CLUB_REDEMPTION_NPC_ID,
    FISHING_POND_STATUS_NPC_ID,
  ];
  const fishingNpcs = fishingNpcIds.map((id) => {
    const npc = npcs.get(id);
    assert.ok(npc, `${id} should be spawned`);
    assert.equal(isInsideFishingWater(npc.x, npc.z), false, `${id} should not stand in pond water`);
    assert.ok(getFishingZoneDistance(npc.x, npc.z) <= FISHING_ZONE.shoreRadius + 5, `${id} should stay near the pond hub`);
    return npc;
  });

  for (let leftIndex = 0; leftIndex < fishingNpcs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < fishingNpcs.length; rightIndex += 1) {
      const left = fishingNpcs[leftIndex];
      const right = fishingNpcs[rightIndex];
      const distance = Math.hypot(left.x - right.x, left.z - right.z);
      assert.ok(distance >= 4.5, `${left.id} and ${right.id} should not visually clump`);
    }
  }
});

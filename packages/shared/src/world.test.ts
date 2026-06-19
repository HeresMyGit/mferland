import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLD_OUTPOST_BUILDINGS,
  WORLD_SOLIDS,
  WORLD_TOWN_BUILDINGS,
  type SolidObstacle,
  type WorldBuildingPlacement,
} from "./world.js";

const EPSILON = 0.000001;

test("town plaza buildings face the fountain", () => {
  for (const building of WORLD_TOWN_BUILDINGS) {
    const expectedRotation = Math.atan2(-building.x, -building.z);
    assert.ok(
      Math.abs(getAngleDelta(building.rotation, expectedRotation)) < EPSILON,
      `${building.id} should face the fountain`,
    );
  }
});

test("building collision solids are centered on building placements", () => {
  for (const building of [...WORLD_TOWN_BUILDINGS, ...WORLD_OUTPOST_BUILDINGS]) {
    assert.ok(
      hasMatchingRectSolid(WORLD_SOLIDS, building),
      `${building.id} needs a collision rect centered on its placement`,
    );
  }
});

function hasMatchingRectSolid(solids: SolidObstacle[], building: WorldBuildingPlacement) {
  return solids.some((solid) => (
    solid.kind === "rect"
    && Math.abs(solid.x - building.x) < EPSILON
    && Math.abs(solid.z - building.z) < EPSILON
    && Math.abs(getAngleDelta(solid.rotation, building.rotation)) < EPSILON
  ));
}

function getAngleDelta(left: number, right: number) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

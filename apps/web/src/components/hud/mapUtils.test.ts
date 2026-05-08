import assert from "node:assert/strict";
import test from "node:test";
import { getMinimapGuidancePoint, getWorldMapGuidancePoint } from "./mapUtils";
import type { PlayerSnapshot } from "@mferland/shared";

test("minimap guidance marks off-range targets as edge arrows", () => {
  const player = { x: 0, z: 0, yaw: 0 } as PlayerSnapshot;

  const point = getMinimapGuidancePoint(player, 240, 0);

  assert.equal(point.atEdge, true);
  assert.match(String(point.style.transform), /rotate\(/);
});

test("minimap guidance keeps nearby targets as regular dots", () => {
  const player = { x: 0, z: 0, yaw: 0 } as PlayerSnapshot;

  const point = getMinimapGuidancePoint(player, 4, 2);

  assert.equal(point.atEdge, false);
  assert.equal(point.style.transform, "translate(-50%, -50%)");
});

test("world map guidance clamps targets outside the plaza bounds to the edge", () => {
  const point = getWorldMapGuidancePoint(10000, -10000);

  assert.equal(point.atEdge, true);
  assert.match(String(point.style.transform), /rotate\(/);
  assert.match(String(point.style.left), /%$/);
  assert.match(String(point.style.top), /%$/);
});

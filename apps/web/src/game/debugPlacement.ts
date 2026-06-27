import { FISHING_ZONE, WORLD_LANDMARKS, type NpcSnapshot } from "@mferland/shared";
import {
  MARKET_STALLS,
  OUTPOST_BUILDINGS,
  OUTPOST_MARKET_STALLS,
  TOWN_BUILDINGS,
  BUILDING_BLUEPRINTS,
  type MarketStallSpec,
  type TownBuildingPlacement,
  type Vec3Tuple,
} from "./scene/world/shared";

export type DebugPlacementKind = "npc" | "building" | "model" | "prop";

export type DebugPlacementValue = {
  x: number;
  z: number;
  rotation: number;
};

export type DebugPlacementTarget = DebugPlacementValue & {
  id: string;
  label: string;
  kind: DebugPlacementKind;
  source: string;
  hitRadius?: number;
  hitSize?: [number, number];
  hitHeight?: number;
};

export type DebugPlacementOverrides = Record<string, DebugPlacementValue>;

export const DEBUG_PLACEMENT_STORAGE_KEY = "mferland:debugPlacementOverrides:v1";

const WATCH_TOWER_TARGETS: DebugPlacementTarget[] = [
  makeWorldTarget("model:watch-tower-west", "West watch tower", "model", -41, -36, 0, "TownWorld.tsx", { hitRadius: 2.4, hitHeight: 7 }),
  makeWorldTarget("model:watch-tower-east", "East watch tower", "model", 41, -36, 0, "TownWorld.tsx", { hitRadius: 2.4, hitHeight: 7 }),
  makeWorldTarget("model:watch-tower-ridge", "Ridge watch tower", "model", 134.2, -108.6, 0, "TownWorld.tsx", { hitRadius: 2.4, hitHeight: 7 }),
];

const SPAWN_RING_TARGETS: DebugPlacementTarget[] = [
  makeWorldTarget("prop:spawn-ring-purple", "Purple spawn ring", "prop", 5.6, 5.6, 0, "TownWorld.tsx", { hitRadius: 1.45, hitHeight: 0.35 }),
  makeWorldTarget("prop:spawn-ring-blue", "Blue spawn ring", "prop", -6.1, 4.4, 0, "TownWorld.tsx", { hitRadius: 1.45, hitHeight: 0.35 }),
];

const BANNER_TARGETS: DebugPlacementTarget[] = [
  makeWorldTarget("prop:banner-gate-left", "Gate left banner", "prop", -7.2, -19.8, 0, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-gate-right", "Gate right banner", "prop", 7.2, -19.8, 0, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-west-road", "West road banner", "prop", -23.5, -39, Math.PI / 2, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-east-road", "East road banner", "prop", 23.5, -39, -Math.PI / 2, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-inn", "Inn banner", "prop", -7.2, 39, Math.PI, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-forge", "Forge banner", "prop", 7.2, 39, Math.PI, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-farm-route", "Farm route banner", "prop", -83.8, 59.6, Math.PI / 2, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-field-camp", "Field camp banner", "prop", -112, 126, Math.PI, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-ridge-route", "Ridge route banner", "prop", 94, -22, -Math.PI / 2, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-ridge-entry", "Ridge entry banner", "prop", 123, -91, 0, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-relay-north", "Relay north banner", "prop", 137.5, -91, 0, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
  makeWorldTarget("prop:banner-relay-south", "Relay south banner", "prop", 137.5, -116.5, Math.PI, "TownWorld.tsx", { hitSize: [1.4, 0.8], hitHeight: 3.4 }),
];

export const DEBUG_WORLD_PLACEMENT_TARGETS: DebugPlacementTarget[] = [
  ...TOWN_BUILDINGS.map((building) => makeBuildingTarget(building, "Town building")),
  ...OUTPOST_BUILDINGS.map((building) => makeBuildingTarget(building, "Outpost building")),
  ...MARKET_STALLS.map((stall) => makeStallTarget(stall, "Market stall")),
  ...OUTPOST_MARKET_STALLS.map((stall) => makeStallTarget(stall, "Outpost stall")),
  makeWorldTarget("model:fountain", "Fountain", "model", 0, 0, 0, "Fountain.tsx", { hitRadius: 4.3, hitHeight: 3.4 }),
  makeWorldTarget("model:castle-gate", "Castle gate", "model", 0, -30, 0, "Buildings.tsx", { hitSize: [15, 5.8], hitHeight: 8 }),
  ...WATCH_TOWER_TARGETS,
  makeWorldTarget("model:farm", "Rundown farm", "model", -82, 92, -0.18, "Farm.tsx", { hitSize: [24, 19], hitHeight: 7 }),
  makeWorldTarget("model:fishing-pond", FISHING_ZONE.name, "model", FISHING_ZONE.x, FISHING_ZONE.z, 0, "TownWorld.tsx", { hitRadius: FISHING_ZONE.waterRadius + 1.5, hitHeight: 0.4 }),
  makeWorldTarget("prop:fishing-dock", "Fishing dock", "prop", FISHING_ZONE.x + 7.2, FISHING_ZONE.z - 4.8, -0.62, "TownWorld.tsx", { hitSize: [4.6, 1.3], hitHeight: 0.8 }),
  makeWorldTarget("model:signal-relay", "Signal relay", "model", 136, -121, 0, "TownWorld.tsx", { hitRadius: 3.2, hitHeight: 7 }),
  ...WORLD_LANDMARKS.map((landmark) => (
    makeWorldTarget(`prop:route-marker:${landmark.id}`, `${landmark.name} route marker`, "prop", landmark.x, landmark.z, -Math.PI / 2, "TownWorld.tsx", { hitSize: [2.1, 0.9], hitHeight: 2.7 })
  )),
  ...SPAWN_RING_TARGETS,
  ...BANNER_TARGETS,
];

export function getNpcDebugPlacementId(npcId: string) {
  return `npc:${npcId}`;
}

export function makeNpcDebugPlacementTargets(npcs: Map<string, NpcSnapshot>): DebugPlacementTarget[] {
  return Array.from(npcs.values())
    .filter((npc) => npc.isImmortal || npc.health > 0)
    .map((npc): DebugPlacementTarget => ({
      id: getNpcDebugPlacementId(npc.id),
      label: npc.name,
      kind: "npc",
      source: `spawnNpcs:${npc.id}`,
      x: npc.x,
      z: npc.z,
      rotation: npc.yaw,
      hitRadius: getNpcDebugHitRadius(npc),
      hitHeight: getNpcDebugHitHeight(npc),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function getDebugPlacementValue(
  target: DebugPlacementTarget,
  overrides: DebugPlacementOverrides | null | undefined,
): DebugPlacementValue {
  return overrides?.[target.id] ?? { x: target.x, z: target.z, rotation: target.rotation };
}

export function getDebugPlacementTransform(
  id: string,
  position: Vec3Tuple,
  rotation: number,
  overrides: DebugPlacementOverrides | null | undefined,
) {
  const override = overrides?.[id];
  if (!override) return { position, rotation };
  return {
    position: [override.x, position[1], override.z] as Vec3Tuple,
    rotation: override.rotation,
  };
}

export function applyDebugPlacementToBuilding(
  placement: TownBuildingPlacement,
  overrides: DebugPlacementOverrides | null | undefined,
): TownBuildingPlacement {
  const transform = getDebugPlacementTransform(getBuildingDebugPlacementId(placement.id), placement.position, placement.rotation, overrides);
  if (transform.position === placement.position && transform.rotation === placement.rotation) return placement;
  return { ...placement, position: transform.position, rotation: transform.rotation };
}

export function applyDebugPlacementToMarketStall(
  stall: MarketStallSpec,
  overrides: DebugPlacementOverrides | null | undefined,
): MarketStallSpec {
  const transform = getDebugPlacementTransform(getMarketStallDebugPlacementId(stall.id), stall.position, stall.rotation, overrides);
  if (transform.position === stall.position && transform.rotation === stall.rotation) return stall;
  return { ...stall, position: transform.position, rotation: transform.rotation };
}

export function getBuildingDebugPlacementId(id: string) {
  return `building:${id}`;
}

export function getMarketStallDebugPlacementId(id: string) {
  return `model:market-stall:${id}`;
}

function makeBuildingTarget(building: TownBuildingPlacement, prefix: string): DebugPlacementTarget {
  const blueprint = BUILDING_BLUEPRINTS[building.blueprint];
  return {
    id: getBuildingDebugPlacementId(building.id),
    label: `${prefix}: ${building.sign}`,
    kind: "building",
    source: "world/shared.ts",
    x: building.position[0],
    z: building.position[2],
    rotation: building.rotation,
    hitSize: blueprint.footprint,
    hitHeight: 6.6,
  };
}

function makeStallTarget(stall: MarketStallSpec, prefix: string): DebugPlacementTarget {
  return {
    id: getMarketStallDebugPlacementId(stall.id),
    label: `${prefix}: ${stall.id}`,
    kind: "model",
    source: "world/shared.ts",
    x: stall.position[0],
    z: stall.position[2],
    rotation: stall.rotation,
    hitSize: [3.9, 2.4],
    hitHeight: 2.8,
  };
}

function makeWorldTarget(
  id: string,
  label: string,
  kind: DebugPlacementKind,
  x: number,
  z: number,
  rotation: number,
  source: string,
  hit: Pick<DebugPlacementTarget, "hitRadius" | "hitSize" | "hitHeight"> = {},
): DebugPlacementTarget {
  return { id, label, kind, source, x, z, rotation, ...hit };
}

function getNpcDebugHitRadius(npc: NpcSnapshot) {
  if (npc.id === "raid-ogre-mfer") return 2.5;
  if (npc.id === "static-baron-nox") return 1.55;
  if (npc.model === "mfergpt") return 1.0;
  if (npc.model === "training-dummy") return 0.9;
  if (npc.model === "hog") return 0.95;
  if (npc.model === "deer") return 0.8;
  if (npc.model === "rabbit") return 0.52;
  return 0.86;
}

function getNpcDebugHitHeight(npc: NpcSnapshot) {
  if (npc.id === "raid-ogre-mfer") return 7.5;
  if (npc.id === "static-baron-nox") return 4.2;
  if (npc.model === "mfergpt") return 3.2;
  if (npc.model === "training-dummy") return 2.9;
  if (npc.model === "hog") return 1.3;
  if (npc.model === "deer") return 1.9;
  if (npc.model === "rabbit") return 1.0;
  return 3.2;
}

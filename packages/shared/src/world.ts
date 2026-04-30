import { clamp } from "./utils.js";

export const PLAZA_BOUNDS = {
  minX: -164,
  maxX: 164,
  minZ: -132,
  maxZ: 172,
};

export type WorldRoadSurface = "stone" | "dirt";

export type WorldRoad = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  surface: WorldRoadSurface;
};

export type WorldHub = {
  id: string;
  name: string;
  x: number;
  z: number;
  diameter: number;
  kind: "plaza" | "farm" | "hub";
};

export type WorldLandmark = {
  id: string;
  name: string;
  label: string;
  x: number;
  z: number;
  kind: "route" | "relay";
};

export const WORLD_ROADS: WorldRoad[] = [
  { id: "south-gate", x: 0, z: -34, width: 8.5, depth: 44, surface: "stone" },
  { id: "north-gate", x: 0, z: 35, width: 8.5, depth: 42, surface: "stone" },
  { id: "west-market", x: -35, z: 0, width: 34, depth: 7.5, surface: "stone" },
  { id: "east-market", x: 35, z: 0, width: 34, depth: 7.5, surface: "stone" },
  { id: "south-cross", x: 0, z: -34, width: 52, depth: 6.2, surface: "stone" },
  { id: "north-cross", x: 0, z: 29, width: 52, depth: 6.2, surface: "stone" },
  { id: "west-row", x: -32, z: 22, width: 7, depth: 28, surface: "stone" },
  { id: "east-row", x: 32, z: 22, width: 7, depth: 28, surface: "stone" },
  { id: "north-road", x: 0, z: 56, width: 8.5, depth: 42, surface: "stone" },
  { id: "farm-fork", x: -31, z: 60, width: 102, depth: 5.8, surface: "dirt" },
  { id: "farm-lane", x: -76, z: 78, width: 6, depth: 42, surface: "dirt" },
  { id: "farmyard", x: -82, z: 92, width: 38, depth: 22, surface: "dirt" },
  { id: "field-road", x: -101, z: 116, width: 6, depth: 42, surface: "dirt" },
  { id: "field-camp-yard", x: -118, z: 136, width: 38, depth: 24, surface: "dirt" },
  { id: "ridge-gate", x: 53, z: -11.5, width: 6.2, depth: 28, surface: "dirt" },
  { id: "ridge-fork", x: 75, z: -22, width: 88, depth: 5.8, surface: "dirt" },
  { id: "ridge-lane", x: 120, z: -62, width: 6, depth: 84, surface: "dirt" },
  { id: "signal-ridge-yard", x: 124, z: -104, width: 42, depth: 26, surface: "dirt" },
  { id: "relay-crown", x: 136, z: -121, width: 28, depth: 18, surface: "dirt" },
  { id: "static-field", x: 150, z: -104, width: 24, depth: 54, surface: "dirt" },
];

export const WORLD_HUBS: WorldHub[] = [
  { id: "starter-plaza", name: "Fountain Plaza", x: 0, z: 0, diameter: 24, kind: "plaza" },
  { id: "busted-farm", name: "Red-Eye Farm", x: -82, z: 92, diameter: 34, kind: "farm" },
  { id: "field-camp", name: "Route Post", x: -118, z: 136, diameter: 28, kind: "hub" },
  { id: "signal-ridge", name: "Signal Ridge", x: 124, z: -104, diameter: 30, kind: "hub" },
  { id: "static-field", name: "Static Lot", x: 150, z: -104, diameter: 22, kind: "farm" },
];

export const WORLD_LANDMARKS: WorldLandmark[] = [
  { id: "ridge-gate-marker", name: "East Cut", label: "CUT", x: 55.5, z: -5.5, kind: "route" },
  { id: "relay-milepost-marker", name: "0.069 Mile", label: "0.069", x: 92, z: -18.2, kind: "route" },
  { id: "switchback-lantern-marker", name: "4:20 Turn", label: "4:20", x: 124.4, z: -58, kind: "route" },
  { id: "signal-approach-marker", name: "Relay Uptrail", label: "RELAY", x: 116.6, z: -90, kind: "relay" },
];

export type SolidObstacle =
  | { kind: "circle"; x: number; z: number; radius: number }
  | { kind: "rect"; x: number; z: number; halfX: number; halfZ: number; rotation: number };

export type WorldPlacementOverride = {
  x: number;
  z: number;
  rotation: number;
};

export type WorldPlacementOverrides = Record<string, WorldPlacementOverride>;

type PlacementSolidSpec = {
  id: string;
  base: WorldPlacementOverride;
  solids: SolidObstacle[];
};

const TOWN_BUILDING_SOLID_SIZE = { halfX: 4.1, halfZ: 2.85 };
const MARKET_STALL_SOLID_SIZE = { halfX: 2.1, halfZ: 1.35 };

const PLACEMENT_SOLID_SPECS: PlacementSolidSpec[] = [
  makeRectPlacementSolid("building:mfers", -18, -8, 0.4, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:dao", 18, -7.5, -0.45, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:wearables", -18, 11, -0.2, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:shop", 18, 10.5, 0.25, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:barracks", -25.5, -33.8, 1.28, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:keep", 25.5, -33.8, -1.28, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:gallery", -36, 17.5, 1.5, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:arcade", 36, 17.5, -1.5, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:inn", -16, 36.5, 2.82, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:forge", 16, 36.5, -2.82, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:field-post", -129, 134, 1.42, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:trail-shed", -111.5, 142.5, -2.75, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:hub-watch", -116.5, 126.5, 0.18, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:ridge-post", 112, -101.5, -1.2, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:signal-shed", 128.5, -97.5, 2.68, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("building:relay-watch", 123, -116.5, -0.08, TOWN_BUILDING_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:left-market", -6.4, 29.2, Math.PI, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:center-market", 0, 31.4, Math.PI, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:right-market", 6.4, 29.2, Math.PI, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:field-camp-left-stall", -123, 129.8, 0.18, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:field-camp-right-stall", -114, 132.2, -0.26, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:ridge-left-stall", 111.4, -93.4, -0.18, MARKET_STALL_SOLID_SIZE),
  makeRectPlacementSolid("model:market-stall:ridge-right-stall", 121.8, -91.8, 0.32, MARKET_STALL_SOLID_SIZE),
  makeCirclePlacementSolid("model:watch-tower-west", -41, -36, 0, 1.8),
  makeCirclePlacementSolid("model:watch-tower-east", 41, -36, 0, 1.8),
  makeCirclePlacementSolid("model:watch-tower-ridge", 134.2, -108.6, 0, 1.7),
  makeCirclePlacementSolid("model:fountain", 0, 0, 0, 3.95),
  makeCirclePlacementSolid("model:signal-relay", 136, -121, 0, 3.2),
  {
    id: "model:castle-gate",
    base: { x: 0, z: -30, rotation: 0 },
    solids: [
      { kind: "rect", x: -11.2, z: -30, halfX: 4.45, halfZ: 1.35, rotation: 0 },
      { kind: "rect", x: 11.2, z: -30, halfX: 4.45, halfZ: 1.35, rotation: 0 },
      { kind: "circle", x: -6.25, z: -30, radius: 2.2 },
      { kind: "circle", x: 6.25, z: -30, radius: 2.2 },
      { kind: "rect", x: 0, z: -30, halfX: 3.75, halfZ: 1.95, rotation: 0 },
      { kind: "rect", x: -14.7, z: -24, halfX: 1.2, halfZ: 5.3, rotation: 0 },
      { kind: "rect", x: 14.7, z: -24, halfX: 1.2, halfZ: 5.3, rotation: 0 },
      { kind: "rect", x: 0, z: -19.6, halfX: 5.4, halfZ: 2.35, rotation: 0 },
    ],
  },
  {
    id: "model:farm",
    base: { x: -82, z: 92, rotation: -0.18 },
    solids: [
      { kind: "rect", x: -89, z: 86.9, halfX: 3.35, halfZ: 2.55, rotation: -0.08 },
      { kind: "rect", x: -74.35, z: 90.15, halfX: 4.25, halfZ: 3.25, rotation: -0.3 },
      { kind: "rect", x: -77.45, z: 99.35, halfX: 2.7, halfZ: 1.75, rotation: 0.2 },
      { kind: "circle", x: -92.3, z: 99.45, radius: 0.85 },
    ],
  },
];

const STATIC_PROP_SOLIDS: SolidObstacle[] = [
  { kind: "circle", x: -121.5, z: 135.5, radius: 1.7 },
];

const TREE_SOLIDS: SolidObstacle[] = [
  [-31, -18, 0.95], [-27, -7, 0.75], [-30, 15, 0.85], [-41, 30, 0.8],
  [-12, 25, 0.75], [12, 25, 0.85], [41, 30, 0.8], [30, 16, 0.75],
  [29, -17, 0.92], [42, -4, 0.75], [-42, -4, 0.75], [23, -26, 0.7],
  [-23, -26, 0.75], [35, -39, 0.78], [-35, -39, 0.78], [-67, 51, 0.85],
  [-65, 68, 0.75], [-38, 72, 0.92], [-22, 60, 0.7], [58, 48, 0.78],
  [66, -36, 0.85], [-66, -42, 0.8],
  [-91, 61, 0.82], [-96, 76, 0.9], [-78, 96, 0.84], [-124, 88, 0.92],
  [-132, 112, 0.8], [-96, 118, 0.86], [-136, 146, 0.95], [-101, 149, 0.82],
  [-82, -68, 0.78], [-72, -73, 0.86], [-62, -68, 0.95], [-54, -73, 0.78],
  [-47, -68, 0.86], [-38, -73, 0.95], [-31, -68, 0.78], [-24, -73, 0.86],
  [-17, -68, 0.95], [18, -73, 0.78], [25, -68, 0.86], [32, -73, 0.95],
  [39, -68, 0.78], [47, -73, 0.86], [54, -68, 0.95], [64, -73, 0.78],
  [74, -68, 0.86], [84, -73, 0.95],
  [78, -32, 0.8], [91, -25, 0.86], [104, -37, 0.94], [112, -51, 0.78],
  [132, -61, 0.9], [108, -78, 0.82], [141, -88, 0.88], [102, -111, 0.86],
  [147, -118, 0.98], [125, -128, 0.82], [153, -102, 0.78],
].map(([x, z, radius]) => ({ kind: "circle", x, z, radius }) as SolidObstacle);

export const WORLD_SOLIDS: SolidObstacle[] = [
  ...getPlacementSolids(),
  ...STATIC_PROP_SOLIDS,
  ...TREE_SOLIDS,
];

let activeWorldPlacementOverrides: WorldPlacementOverrides = {};

export function setWorldCollisionPlacementOverrides(overrides: WorldPlacementOverrides | null | undefined) {
  activeWorldPlacementOverrides = normalizeWorldPlacementOverrides(overrides);
}

export function resolveWorldCollision(
  x: number,
  z: number,
  radius: number,
  placementOverrides: WorldPlacementOverrides | null | undefined = activeWorldPlacementOverrides,
) {
  let resolvedX = clamp(x, PLAZA_BOUNDS.minX + radius, PLAZA_BOUNDS.maxX - radius);
  let resolvedZ = clamp(z, PLAZA_BOUNDS.minZ + radius, PLAZA_BOUNDS.maxZ - radius);
  const obstacles = placementOverrides ? getWorldSolids(placementOverrides) : WORLD_SOLIDS;

  for (let pass = 0; pass < 3; pass += 1) {
    for (const obstacle of obstacles) {
      if (obstacle.kind === "circle") {
        const dx = resolvedX - obstacle.x;
        const dz = resolvedZ - obstacle.z;
        const minDistance = obstacle.radius + radius;
        const distance = Math.hypot(dx, dz);
        if (distance >= minDistance) continue;

        const push = minDistance - distance;
        if (distance > 0.0001) {
          resolvedX += (dx / distance) * push;
          resolvedZ += (dz / distance) * push;
        } else {
          resolvedX += minDistance;
        }
        continue;
      }

      const push = getRectCollisionPush(resolvedX, resolvedZ, radius, obstacle);
      if (!push) continue;
      resolvedX += push.x;
      resolvedZ += push.z;
    }
  }

  return {
    x: clamp(resolvedX, PLAZA_BOUNDS.minX + radius, PLAZA_BOUNDS.maxX - radius),
    z: clamp(resolvedZ, PLAZA_BOUNDS.minZ + radius, PLAZA_BOUNDS.maxZ - radius),
  };
}

function getWorldSolids(placementOverrides: WorldPlacementOverrides) {
  return [
    ...getPlacementSolids(placementOverrides),
    ...STATIC_PROP_SOLIDS,
    ...TREE_SOLIDS,
  ];
}

function getPlacementSolids(placementOverrides: WorldPlacementOverrides = {}) {
  return PLACEMENT_SOLID_SPECS.flatMap((spec) => {
    const placement = placementOverrides[spec.id] ?? spec.base;
    return spec.solids.map((solid) => transformPlacementSolid(solid, spec.base, placement));
  });
}

function transformPlacementSolid(
  solid: SolidObstacle,
  base: WorldPlacementOverride,
  placement: WorldPlacementOverride,
): SolidObstacle {
  const local = rotatePoint(solid.x - base.x, solid.z - base.z, -base.rotation);
  const placed = rotatePoint(local.x, local.z, placement.rotation);
  const x = placement.x + placed.x;
  const z = placement.z + placed.z;
  if (solid.kind === "circle") {
    return { ...solid, x, z };
  }
  return {
    ...solid,
    x,
    z,
    rotation: placement.rotation + (solid.rotation - base.rotation),
  };
}

function rotatePoint(x: number, z: number, rotation: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
  };
}

function makeRectPlacementSolid(
  id: string,
  x: number,
  z: number,
  rotation: number,
  size: { halfX: number; halfZ: number },
): PlacementSolidSpec {
  return {
    id,
    base: { x, z, rotation },
    solids: [{ kind: "rect", x, z, rotation, halfX: size.halfX, halfZ: size.halfZ }],
  };
}

function makeCirclePlacementSolid(id: string, x: number, z: number, rotation: number, radius: number): PlacementSolidSpec {
  return {
    id,
    base: { x, z, rotation },
    solids: [{ kind: "circle", x, z, radius }],
  };
}

function normalizeWorldPlacementOverrides(overrides: WorldPlacementOverrides | null | undefined) {
  const normalized: WorldPlacementOverrides = {};
  if (!overrides) return normalized;
  for (const [id, placement] of Object.entries(overrides)) {
    if (!placement) continue;
    const x = Number(placement.x);
    const z = Number(placement.z);
    const rotation = Number(placement.rotation);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) continue;
    normalized[id] = { x, z, rotation };
  }
  return normalized;
}

function getRectCollisionPush(x: number, z: number, radius: number, obstacle: Extract<SolidObstacle, { kind: "rect" }>) {
  const dx = x - obstacle.x;
  const dz = z - obstacle.z;
  const cos = Math.cos(obstacle.rotation);
  const sin = Math.sin(obstacle.rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const closestX = clamp(localX, -obstacle.halfX, obstacle.halfX);
  const closestZ = clamp(localZ, -obstacle.halfZ, obstacle.halfZ);
  let pushLocalX = localX - closestX;
  let pushLocalZ = localZ - closestZ;
  const distance = Math.hypot(pushLocalX, pushLocalZ);

  if (distance > 0.0001) {
    if (distance >= radius) return null;
    const pushDistance = radius - distance;
    pushLocalX = (pushLocalX / distance) * pushDistance;
    pushLocalZ = (pushLocalZ / distance) * pushDistance;
  } else {
    const overlapX = obstacle.halfX + radius - Math.abs(localX);
    const overlapZ = obstacle.halfZ + radius - Math.abs(localZ);
    if (overlapX <= 0 || overlapZ <= 0) return null;
    if (overlapX < overlapZ) {
      pushLocalX = (localX >= 0 ? 1 : -1) * overlapX;
      pushLocalZ = 0;
    } else {
      pushLocalX = 0;
      pushLocalZ = (localZ >= 0 ? 1 : -1) * overlapZ;
    }
  }

  return {
    x: pushLocalX * cos + pushLocalZ * sin,
    z: -pushLocalX * sin + pushLocalZ * cos,
  };
}

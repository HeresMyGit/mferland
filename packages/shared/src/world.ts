import { clamp } from "./utils.js";

export const PLAZA_BOUNDS = {
  minX: -72,
  maxX: 72,
  minZ: -58,
  maxZ: 74,
};

export type SolidObstacle =
  | { kind: "circle"; x: number; z: number; radius: number }
  | { kind: "rect"; x: number; z: number; halfX: number; halfZ: number; rotation: number };

const TOWN_BUILDING_SOLIDS: SolidObstacle[] = [
  { kind: "rect", x: -18, z: -8, halfX: 4.1, halfZ: 2.85, rotation: 0.4 },
  { kind: "rect", x: 18, z: -7.5, halfX: 4.1, halfZ: 2.85, rotation: -0.45 },
  { kind: "rect", x: -18, z: 11, halfX: 4.1, halfZ: 2.85, rotation: -0.2 },
  { kind: "rect", x: 18, z: 10.5, halfX: 4.1, halfZ: 2.85, rotation: 0.25 },
  { kind: "rect", x: -25.5, z: -33.8, halfX: 4.1, halfZ: 2.85, rotation: 1.28 },
  { kind: "rect", x: 25.5, z: -33.8, halfX: 4.1, halfZ: 2.85, rotation: -1.28 },
  { kind: "rect", x: -36, z: 17.5, halfX: 4.1, halfZ: 2.85, rotation: 1.5 },
  { kind: "rect", x: 36, z: 17.5, halfX: 4.1, halfZ: 2.85, rotation: -1.5 },
  { kind: "rect", x: -16, z: 36.5, halfX: 4.1, halfZ: 2.85, rotation: 2.82 },
  { kind: "rect", x: 16, z: 36.5, halfX: 4.1, halfZ: 2.85, rotation: -2.82 },
  { kind: "rect", x: -6.4, z: 29.2, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "rect", x: 0, z: 31.4, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "rect", x: 6.4, z: 29.2, halfX: 2.1, halfZ: 1.35, rotation: Math.PI },
  { kind: "circle", x: -41, z: -36, radius: 1.8 },
  { kind: "circle", x: 41, z: -36, radius: 1.8 },
  { kind: "circle", x: -5.35, z: -24, radius: 2.05 },
  { kind: "circle", x: 5.35, z: -24, radius: 2.05 },
  { kind: "rect", x: 0, z: -24, halfX: 2.15, halfZ: 1.65, rotation: 0 },
  { kind: "circle", x: 0, z: 0, radius: 3.95 },
  { kind: "rect", x: -59, z: 55.9, halfX: 3.35, halfZ: 2.55, rotation: -0.08 },
  { kind: "rect", x: -44.35, z: 59.15, halfX: 4.25, halfZ: 3.25, rotation: -0.3 },
  { kind: "rect", x: -47.45, z: 68.35, halfX: 2.7, halfZ: 1.75, rotation: 0.2 },
  { kind: "circle", x: -62.3, z: 68.45, radius: 0.85 },
];

const TREE_SOLIDS: SolidObstacle[] = [
  [-31, -18, 0.95], [-27, -7, 0.75], [-30, 15, 0.85], [-41, 30, 0.8],
  [-12, 25, 0.75], [12, 25, 0.85], [41, 30, 0.8], [30, 16, 0.75],
  [29, -17, 0.92], [42, -4, 0.75], [-42, -4, 0.75], [23, -26, 0.7],
  [-23, -26, 0.75], [35, -39, 0.78], [-35, -39, 0.78], [-67, 51, 0.85],
  [-65, 68, 0.75], [-38, 72, 0.92], [-22, 60, 0.7], [58, 48, 0.78],
  [66, -36, 0.85], [-66, -42, 0.8],
  [-82, -68, 0.78], [-72, -73, 0.86], [-62, -68, 0.95], [-54, -73, 0.78],
  [-47, -68, 0.86], [-38, -73, 0.95], [-31, -68, 0.78], [-24, -73, 0.86],
  [-17, -68, 0.95], [18, -73, 0.78], [25, -68, 0.86], [32, -73, 0.95],
  [39, -68, 0.78], [47, -73, 0.86], [54, -68, 0.95], [64, -73, 0.78],
  [74, -68, 0.86], [84, -73, 0.95],
].map(([x, z, radius]) => ({ kind: "circle", x, z, radius }) as SolidObstacle);

export const WORLD_SOLIDS: SolidObstacle[] = [
  ...TOWN_BUILDING_SOLIDS,
  ...TREE_SOLIDS,
];

export function resolveWorldCollision(x: number, z: number, radius: number) {
  let resolvedX = clamp(x, PLAZA_BOUNDS.minX + radius, PLAZA_BOUNDS.maxX - radius);
  let resolvedZ = clamp(z, PLAZA_BOUNDS.minZ + radius, PLAZA_BOUNDS.maxZ - radius);

  for (let pass = 0; pass < 3; pass += 1) {
    for (const obstacle of WORLD_SOLIDS) {
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

import { type CSSProperties } from "react";
import { PLAZA_BOUNDS, WORLD_HUBS, WORLD_ROADS, type PlayerSnapshot } from "@mferland/shared";

const MINIMAP_RANGE_YARDS = 48;
const MINIMAP_EDGE_PERCENT = 42;
const EXPLORE_CELL_SIZE = 8;
const EXPLORE_RADIUS_CELLS = 2;
export const MINIMAP_ROADS = WORLD_ROADS;
export const MINIMAP_HUBS = WORLD_HUBS;

function normalize(value: number, min: number, max: number) {
  return Math.max(7, Math.min(93, ((value - min) / (max - min)) * 100));
}

export function getMinimapPointStyle(localPlayer: PlayerSnapshot | null, x: number, z: number): CSSProperties {
  if (!localPlayer) {
    return {
      left: `${normalize(x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
      top: `${normalize(z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
    };
  }

  const point = getMinimapLocalPoint(localPlayer, x, z, true);
  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
  };
}

export function getMinimapRoadStyle(
  localPlayer: PlayerSnapshot | null,
  road: { x: number; z: number; width: number; depth: number },
): CSSProperties {
  const scale = MINIMAP_EDGE_PERCENT / MINIMAP_RANGE_YARDS;
  const point = localPlayer
    ? getMinimapLocalPoint(localPlayer, road.x, road.z, false)
    : {
        left: normalize(road.x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX),
        top: normalize(road.z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ),
      };

  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
    width: `${road.width * scale}%`,
    height: `${road.depth * scale}%`,
    transform: `translate(-50%, -50%) rotate(${localPlayer?.yaw ?? 0}rad)`,
  };
}

export function getMinimapCircleStyle(localPlayer: PlayerSnapshot | null, x: number, z: number, diameter: number): CSSProperties {
  const scale = MINIMAP_EDGE_PERCENT / MINIMAP_RANGE_YARDS;
  const point = localPlayer
    ? getMinimapLocalPoint(localPlayer, x, z, false)
    : {
        left: normalize(x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX),
        top: normalize(z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ),
      };

  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
    width: `${diameter * scale}%`,
    height: `${diameter * scale}%`,
  };
}

function getMinimapLocalPoint(localPlayer: PlayerSnapshot, x: number, z: number, clampToEdge: boolean) {
  const dx = x - localPlayer.x;
  const dz = z - localPlayer.z;
  const yaw = localPlayer.yaw;
  let rotatedX = -(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  let rotatedY = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const distance = Math.hypot(rotatedX, rotatedY);

  if (clampToEdge && distance > MINIMAP_RANGE_YARDS) {
    const edgeScale = MINIMAP_RANGE_YARDS / distance;
    rotatedX *= edgeScale;
    rotatedY *= edgeScale;
  }

  const scale = MINIMAP_EDGE_PERCENT / MINIMAP_RANGE_YARDS;
  return {
    left: 50 + rotatedX * scale,
    top: 50 + rotatedY * scale,
  };
}

export function getExploredCellKeys(x: number, z: number) {
  const centerX = Math.floor((x - PLAZA_BOUNDS.minX) / EXPLORE_CELL_SIZE);
  const centerZ = Math.floor((z - PLAZA_BOUNDS.minZ) / EXPLORE_CELL_SIZE);
  const maxCellX = Math.ceil((PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX) / EXPLORE_CELL_SIZE);
  const maxCellZ = Math.ceil((PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ) / EXPLORE_CELL_SIZE);
  const keys: string[] = [];

  for (let dz = -EXPLORE_RADIUS_CELLS; dz <= EXPLORE_RADIUS_CELLS; dz += 1) {
    for (let dx = -EXPLORE_RADIUS_CELLS; dx <= EXPLORE_RADIUS_CELLS; dx += 1) {
      if (Math.hypot(dx, dz) > EXPLORE_RADIUS_CELLS + 0.35) continue;
      const cellX = centerX + dx;
      const cellZ = centerZ + dz;
      if (cellX < 0 || cellZ < 0 || cellX > maxCellX || cellZ > maxCellZ) continue;
      keys.push(`${cellX}:${cellZ}`);
    }
  }

  return keys;
}

export function getExploredCellStyle(key: string): CSSProperties {
  const [cellX, cellZ] = key.split(":").map(Number);
  const x = PLAZA_BOUNDS.minX + cellX * EXPLORE_CELL_SIZE + EXPLORE_CELL_SIZE / 2;
  const z = PLAZA_BOUNDS.minZ + cellZ * EXPLORE_CELL_SIZE + EXPLORE_CELL_SIZE / 2;
  return {
    left: `${worldPercent(x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
    top: `${worldPercent(z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
    width: `${(EXPLORE_CELL_SIZE / (PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX)) * 100}%`,
    height: `${(EXPLORE_CELL_SIZE / (PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ)) * 100}%`,
  };
}

export function getWorldMapPointStyle(x: number, z: number): CSSProperties {
  return {
    left: `${worldPercent(x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
    top: `${worldPercent(z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
  };
}

export function getWorldMapRoadStyle(road: { x: number; z: number; width: number; depth: number }): CSSProperties {
  return {
    left: `${worldPercent(road.x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
    top: `${worldPercent(road.z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
    width: `${(road.width / (PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX)) * 100}%`,
    height: `${(road.depth / (PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ)) * 100}%`,
  };
}

export function getWorldMapCircleStyle(x: number, z: number, diameter: number): CSSProperties {
  return {
    left: `${worldPercent(x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
    top: `${worldPercent(z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
    width: `${(diameter / (PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX)) * 100}%`,
    height: `${(diameter / (PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ)) * 100}%`,
  };
}

function worldPercent(value: number, min: number, max: number) {
  return Math.max(2, Math.min(98, ((value - min) / (max - min)) * 100));
}

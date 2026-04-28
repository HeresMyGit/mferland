import * as THREE from "three";

export type Vec3Tuple = [number, number, number];
export type TreeSpec = {
  position: Vec3Tuple;
  scale: number;
};
export type TreeInstance = {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
};
export type StaticPropInstance = {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
};
export type GroundRectDecalSpec = {
  position: Vec3Tuple;
  size: [number, number];
  rotation?: number;
  color?: string;
};
export type GrassTuftSpec = {
  position: Vec3Tuple;
  scale: number;
  rotation: number;
  color: string;
};
export type BuildingTextureKey = "stone" | "roof" | "wall" | "accent" | "solid";
export type BuildingModuleSpec =
  | {
    kind: "box";
    id: string;
    position: Vec3Tuple;
    size: Vec3Tuple;
    material: BuildingTextureKey;
    color?: string;
    rotation?: Vec3Tuple;
  }
  | {
    kind: "gabled-roof";
    id: string;
  }
  | {
    kind: "trim";
    id: string;
  }
  | {
    kind: "window";
    id: string;
    position: Vec3Tuple;
    rotation?: number;
  }
  | {
    kind: "door";
    id: string;
  }
  | {
    kind: "sign";
    id: string;
  };
export type BuildingBlueprintId = "shop";
export type BuildingBlueprint = {
  id: BuildingBlueprintId;
  label: string;
  footprint: [number, number];
  modules: BuildingModuleSpec[];
};
export type TownBuildingPlacement = {
  id: string;
  blueprint: BuildingBlueprintId;
  position: Vec3Tuple;
  rotation: number;
  sign: string;
  accent: string;
};
export type MarketStallSpec = {
  id: string;
  position: Vec3Tuple;
  rotation: number;
  color: string;
};
export type BuildingTextures = {
  stone: THREE.Texture;
  roof: THREE.Texture;
  wall: THREE.Texture;
};

export const TREE_LEAF_COLORS = ["#3f7434", "#4e8a3b", "#5f9e45", "#77aa50"] as const;
export const TREE_ROOT_COLOR = new THREE.Color("#6b4227");
export const TOWN_TREES: TreeSpec[] = [
  [-31, 0, -18, 1.2],
  [-27, 0, -7, 0.9],
  [-30, 0, 15, 1.05],
  [-41, 0, 30, 0.98],
  [-12, 0, 25, 0.95],
  [12, 0, 25, 1.05],
  [41, 0, 30, 0.98],
  [30, 0, 16, 0.95],
  [29, 0, -17, 1.15],
  [42, 0, -4, 0.9],
  [-42, 0, -4, 0.9],
  [23, 0, -26, 0.85],
  [-23, 0, -26, 0.9],
  [35, 0, -39, 0.95],
  [-35, 0, -39, 0.95],
  [-67, 0, 51, 1.05],
  [-65, 0, 68, 0.9],
  [-38, 0, 72, 1.1],
  [-22, 0, 60, 0.86],
  [58, 0, 48, 0.95],
  [66, 0, -36, 1.04],
  [-66, 0, -42, 0.96],
].map(([x, y, z, scale]) => ({ position: [x, y, z], scale }));
export const BACKDROP_TREES: TreeSpec[] = [-82, -72, -62, -54, -47, -38, -31, -24, -17, 18, 25, 32, 39, 47, 54, 64, 74, 84]
  .map((x, index) => ({
    position: [x, 0, -68 - (index % 2) * 5] as Vec3Tuple,
    scale: 0.95 + (index % 3) * 0.12,
  }));

export const BUILDING_BLUEPRINTS: Record<BuildingBlueprintId, BuildingBlueprint> = {
  shop: {
    id: "shop",
    label: "Shopfront",
    footprint: [7.45, 4.85],
    modules: [
      { kind: "box", id: "foundation", position: [0, 0.32, 0], size: [7.45, 0.64, 4.85], material: "stone", color: "#c7b69d" },
      { kind: "box", id: "body", position: [0, 2.65, 0], size: [7.05, 4.55, 4.45], material: "wall" },
      { kind: "gabled-roof", id: "roof" },
      { kind: "trim", id: "front-trim" },
      { kind: "window", id: "front-left-window", position: [-2.15, 2.45, 2.28] },
      { kind: "window", id: "front-right-window", position: [2.15, 2.45, 2.28] },
      { kind: "window", id: "back-left-window", position: [-2.65, 2.2, -2.28], rotation: Math.PI },
      { kind: "window", id: "back-right-window", position: [2.65, 2.2, -2.28], rotation: Math.PI },
      { kind: "door", id: "front-door" },
      { kind: "sign", id: "front-sign" },
      { kind: "box", id: "chimney-stack", position: [2.55, 5.78, -0.8], size: [0.62, 1.45, 0.62], material: "stone", color: "#b29b7e" },
      { kind: "box", id: "chimney-cap", position: [2.55, 6.58, -0.8], size: [0.86, 0.28, 0.86], material: "solid", color: "#4b3325" },
    ],
  },
};

export const TOWN_BUILDINGS: TownBuildingPlacement[] = [
  { id: "mfers", blueprint: "shop", position: [-18, 0, -8], rotation: 0.4, sign: "MFERS", accent: "#9b45ff" },
  { id: "dao", blueprint: "shop", position: [18, 0, -7.5], rotation: -0.45, sign: "DAO", accent: "#52d64f" },
  { id: "wearables", blueprint: "shop", position: [-18, 0, 11], rotation: -0.2, sign: "WEARABLES", accent: "#e754d8" },
  { id: "shop", blueprint: "shop", position: [18, 0, 10.5], rotation: 0.25, sign: "SHOP", accent: "#f5c344" },
  { id: "barracks", blueprint: "shop", position: [-25.5, 0, -33.8], rotation: 1.28, sign: "BARRACKS", accent: "#3ba464" },
  { id: "keep", blueprint: "shop", position: [25.5, 0, -33.8], rotation: -1.28, sign: "KEEP", accent: "#477fe7" },
  { id: "gallery", blueprint: "shop", position: [-36, 0, 17.5], rotation: 1.5, sign: "GALLERY", accent: "#ef7741" },
  { id: "arcade", blueprint: "shop", position: [36, 0, 17.5], rotation: -1.5, sign: "ARCADE", accent: "#36b7c9" },
  { id: "inn", blueprint: "shop", position: [-16, 0, 36.5], rotation: 2.82, sign: "INN", accent: "#d56565" },
  { id: "forge", blueprint: "shop", position: [16, 0, 36.5], rotation: -2.82, sign: "FORGE", accent: "#e18b35" },
];
export const MARKET_STALLS: MarketStallSpec[] = [
  { id: "left-market", position: [-6.4, 0, 29.2], rotation: Math.PI, color: "#9b45ff" },
  { id: "center-market", position: [0, 0, 31.4], rotation: Math.PI, color: "#52d64f" },
  { id: "right-market", position: [6.4, 0, 29.2], rotation: Math.PI, color: "#e754d8" },
];
export const ROAD_EDGE_DECALS: GroundRectDecalSpec[] = [
  { position: [-4.65, 0.024, -34], size: [0.76, 42], color: "#5f6f37" },
  { position: [4.65, 0.024, -34], size: [0.76, 42], color: "#5f6f37" },
  { position: [-4.65, 0.024, 35], size: [0.74, 40], color: "#5f6f37" },
  { position: [4.65, 0.024, 35], size: [0.74, 40], color: "#5f6f37" },
  { position: [-35, 0.024, -4.1], size: [32, 0.7], color: "#5f6f37" },
  { position: [-35, 0.024, 4.1], size: [32, 0.7], color: "#5f6f37" },
  { position: [35, 0.024, -4.1], size: [32, 0.7], color: "#5f6f37" },
  { position: [35, 0.024, 4.1], size: [32, 0.7], color: "#5f6f37" },
  { position: [-26, 0.024, -37.4], size: [30, 0.66], color: "#78623f" },
  { position: [26, 0.024, -37.4], size: [30, 0.66], color: "#78623f" },
  { position: [-26, 0.024, 32.35], size: [30, 0.66], color: "#78623f" },
  { position: [26, 0.024, 32.35], size: [30, 0.66], color: "#78623f" },
  { position: [-35.9, 0.024, 22], size: [0.7, 25.5], color: "#5d7038" },
  { position: [-28.1, 0.024, 22], size: [0.7, 25.5], color: "#5d7038" },
  { position: [28.1, 0.024, 22], size: [0.7, 25.5], color: "#5d7038" },
  { position: [35.9, 0.024, 22], size: [0.7, 25.5], color: "#5d7038" },
  { position: [-57, 0.026, 58.2], size: [20, 0.78], color: "#6e5539" },
  { position: [-57, 0.026, 63.8], size: [20, 0.78], color: "#6e5539" },
];
export const PLAZA_CRACK_DECALS: GroundRectDecalSpec[] = [
  { position: [-9.2, 0.128, -3.8], size: [4.8, 0.07], rotation: 0.28, color: "#3f3a31" },
  { position: [-6.7, 0.129, -2.2], size: [2.2, 0.055], rotation: -0.56, color: "#4d453a" },
  { position: [6.8, 0.128, -5.8], size: [5.6, 0.065], rotation: -0.18, color: "#454036" },
  { position: [9.8, 0.129, -3.7], size: [2.4, 0.052], rotation: 0.72, color: "#4d453a" },
  { position: [-13.2, 0.128, 6.2], size: [4.3, 0.06], rotation: -0.24, color: "#3f3a31" },
  { position: [11.4, 0.128, 7.6], size: [4.7, 0.065], rotation: 0.36, color: "#494238" },
  { position: [2.2, 0.128, 13.8], size: [5.1, 0.055], rotation: -0.42, color: "#4d453a" },
  { position: [-2.7, 0.128, -13.3], size: [4.4, 0.06], rotation: 0.48, color: "#3f3a31" },
];
export const STATIC_CONTACT_SHADOWS: GroundRectDecalSpec[] = [
  ...TOWN_BUILDINGS.map((building) => {
    const blueprint = BUILDING_BLUEPRINTS[building.blueprint];
    return {
      position: [building.position[0], 0.031, building.position[2]] as Vec3Tuple,
      size: [blueprint.footprint[0] * 0.68, blueprint.footprint[1] * 0.64] as [number, number],
      rotation: building.rotation,
      color: "#1c150d",
    };
  }),
  { position: [0, 0.03, -24], size: [12.8, 4.6], rotation: 0, color: "#17110b" },
  { position: [-41, 0.03, -36], size: [3.1, 2.5], color: "#17110b" },
  { position: [41, 0.03, -36], size: [3.1, 2.5], color: "#17110b" },
  { position: [0, 0.03, 0], size: [7.2, 6.2], color: "#17110b" },
  { position: [-6.4, 0.03, 29.2], size: [3.5, 1.9], rotation: Math.PI, color: "#21170d" },
  { position: [0, 0.03, 31.4], size: [3.5, 1.9], rotation: Math.PI, color: "#21170d" },
  { position: [6.4, 0.03, 29.2], size: [3.5, 1.9], rotation: Math.PI, color: "#21170d" },
];
export const GROUND_SMUDGE_DECALS: GroundRectDecalSpec[] = [
  { position: [-6.4, 0.032, 30.4], size: [4.7, 2.2], rotation: 0.08, color: "#765b3b" },
  { position: [0, 0.032, 32.6], size: [4.5, 2.1], rotation: -0.05, color: "#725738" },
  { position: [6.4, 0.032, 30.4], size: [4.7, 2.2], rotation: -0.12, color: "#765b3b" },
  { position: [-52, 0.034, 61], size: [18, 8.5], rotation: -0.18, color: "#563f2b" },
  { position: [-18, 0.031, 38.6], size: [5.5, 1.7], rotation: 2.82, color: "#69503a" },
  { position: [18, 0.031, 38.6], size: [5.5, 1.7], rotation: -2.82, color: "#69503a" },
];
export const GRASS_TUFTS = buildGrassTufts();

export function treeVariant(x: number, z: number) {
  return noise01(x * 12.9898 + z * 78.233);
}

export function noise01(value: number) {
  return fract(Math.sin(value) * 43758.5453123);
}

function fract(value: number) {
  return value - Math.floor(value);
}

function buildGrassTufts(): GrassTuftSpec[] {
  const zones = [
    { center: [-39, -12], size: [17, 32], count: 16 },
    { center: [39, -12], size: [17, 32], count: 16 },
    { center: [-39, 26], size: [18, 25], count: 14 },
    { center: [39, 26], size: [18, 25], count: 14 },
    { center: [-16, 54], size: [22, 18], count: 12 },
    { center: [16, 54], size: [22, 18], count: 12 },
    { center: [-58, 60], size: [22, 20], count: 14 },
  ] as const;

  return zones.flatMap((zone, zoneIndex) => (
    Array.from({ length: zone.count }, (_, index) => {
      const seed = zoneIndex * 101 + index;
      const x = zone.center[0] + (noise01(seed * 12.41) - 0.5) * zone.size[0];
      const z = zone.center[1] + (noise01(seed * 7.73) - 0.5) * zone.size[1];
      const scale = 0.42 + noise01(seed * 3.19) * 0.45;
      const rotation = noise01(seed * 5.91) * Math.PI * 2;
      const color = noise01(seed * 2.17) > 0.55 ? "#8abe55" : "#5f9a42";
      return { position: [x, 0, z] as Vec3Tuple, scale, rotation, color };
    })
  ));
}

export function applyGroundDecalInstances(mesh: THREE.InstancedMesh | null, decals: GroundRectDecalSpec[]) {
  if (!mesh) return;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  decals.forEach((decal, index) => {
    dummy.position.set(...decal.position);
    dummy.rotation.set(-Math.PI / 2, 0, decal.rotation ?? 0);
    dummy.scale.set(decal.size[0], decal.size[1], 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, color.set(decal.color ?? "#ffffff"));
  });

  mesh.count = decals.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function applyGrassTuftInstances(mesh: THREE.InstancedMesh | null, tufts: GrassTuftSpec[]) {
  if (!mesh) return;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  tufts.forEach((tuft, index) => {
    for (let blade = 0; blade < 2; blade += 1) {
      const instanceIndex = index * 2 + blade;
      const height = 0.46 * tuft.scale;
      const width = 0.22 * tuft.scale;
      dummy.position.set(tuft.position[0], height * 0.5 + 0.018, tuft.position[2]);
      dummy.rotation.set(0, tuft.rotation + blade * Math.PI / 2, 0);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);
      mesh.setColorAt(instanceIndex, color.set(tuft.color));
    }
  });

  mesh.count = tufts.length * 2;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function composeInstanceMatrix(
  position: Vec3Tuple,
  rotation: Vec3Tuple,
  scale: Vec3Tuple,
  parent?: THREE.Matrix4,
) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );

  return parent ? parent.clone().multiply(matrix) : matrix;
}

export function applyStaticPropInstances(mesh: THREE.InstancedMesh | null, instances: StaticPropInstance[]) {
  if (!mesh) return;

  instances.forEach((instance, index) => {
    mesh.setMatrixAt(index, instance.matrix);
    if (instance.color) mesh.setColorAt(index, instance.color);
  });

  mesh.count = instances.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

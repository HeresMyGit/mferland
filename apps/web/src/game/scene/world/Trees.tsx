import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BACKDROP_TREES,
  TOWN_TREES,
  TREE_LEAF_COLORS,
  TREE_ROOT_COLOR,
  treeVariant,
  type StaticPropInstance,
  type TreeInstance,
  type TreeSpec,
  type Vec3Tuple,
} from "./shared";

export function WorldBackdrop({
  barkTexture,
  leafTexture,
}: {
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  return (
    <group>
      <mesh position={[-58, 4.1, -82]} rotation-y={0.5} scale={[1.72, 0.9, 0.96]}>
        <coneGeometry args={[8.5, 16, 4]} />
        <meshBasicMaterial color="#8b8978" />
      </mesh>
      <mesh position={[-26, 3.7, -86]} rotation-y={0.1} scale={[1.34, 0.8, 0.98]}>
        <coneGeometry args={[7.6, 14, 4]} />
        <meshBasicMaterial color="#9b947f" />
      </mesh>
      <mesh position={[54, 3.95, -82]} rotation-y={0.25} scale={[1.62, 0.86, 0.96]}>
        <coneGeometry args={[8.2, 15, 4]} />
        <meshBasicMaterial color="#888c78" />
      </mesh>
      <InstancedTrees trees={BACKDROP_TREES} barkTexture={barkTexture} leafTexture={leafTexture} />
    </group>
  );
}

export function TreeCluster({
  barkTexture,
  leafTexture,
}: {
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  return <InstancedTrees trees={TOWN_TREES} barkTexture={barkTexture} leafTexture={leafTexture} />;
}

function InstancedTrees({
  trees,
  barkTexture,
  leafTexture,
}: {
  trees: TreeSpec[];
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const rootRef = useRef<THREE.InstancedMesh>(null);
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const tuftRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => buildTreeInstances(trees), [trees]);
  const geometries = useMemo(() => ({
    shadow: new THREE.CircleGeometry(1.38, 28),
    trunk: new THREE.CylinderGeometry(0.2, 0.34, 1.8, 12),
    root: new THREE.CylinderGeometry(0.06, 0.12, 1, 8),
    branch: new THREE.CylinderGeometry(0.05, 0.12, 1, 8),
    leaf: new THREE.SphereGeometry(1, 18, 12),
    tuft: new THREE.ConeGeometry(0.46, 0.82, 7),
  }), []);
  const materials = useMemo(() => ({
    shadow: new THREE.MeshBasicMaterial({ color: "#1c2615", transparent: true, opacity: 0.22, depthWrite: false }),
    bark: new THREE.MeshStandardMaterial({ map: barkTexture, color: "#ffffff", roughness: 0.96 }),
    root: new THREE.MeshStandardMaterial({ map: barkTexture, color: TREE_ROOT_COLOR, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture, color: "#ffffff", roughness: 0.88, metalness: 0, flatShading: true }),
    tuft: new THREE.MeshStandardMaterial({ map: leafTexture, color: "#ffffff", roughness: 0.9, flatShading: true }),
  }), [barkTexture, leafTexture]);

  useLayoutEffect(() => {
    applyTreeInstances(shadowRef.current, instances.shadow);
    applyTreeInstances(trunkRef.current, instances.trunks);
    applyTreeInstances(rootRef.current, instances.roots);
    applyTreeInstances(branchRef.current, instances.branches);
    applyTreeInstances(leafRef.current, instances.leaves);
    applyTreeInstances(tuftRef.current, instances.tufts);
  }, [instances]);

  return (
    <>
      <instancedMesh ref={shadowRef} args={[geometries.shadow, materials.shadow, instances.shadow.length]} />
      <instancedMesh ref={trunkRef} args={[geometries.trunk, materials.bark, instances.trunks.length]} />
      <instancedMesh ref={rootRef} args={[geometries.root, materials.root, instances.roots.length]} />
      <instancedMesh ref={branchRef} args={[geometries.branch, materials.bark, instances.branches.length]} />
      <instancedMesh ref={leafRef} args={[geometries.leaf, materials.leaf, instances.leaves.length]} />
      <instancedMesh ref={tuftRef} args={[geometries.tuft, materials.tuft, instances.tufts.length]} />
    </>
  );
}

function buildTreeInstances(trees: TreeSpec[]) {
  const shadow: TreeInstance[] = [];
  const trunks: TreeInstance[] = [];
  const roots: TreeInstance[] = [];
  const branches: TreeInstance[] = [];
  const leaves: TreeInstance[] = [];
  const tufts: TreeInstance[] = [];

  for (const tree of trees) {
    const [x, y, z] = tree.position;
    const variant = treeVariant(x, z);
    const barkColor = new THREE.Color(variant > 0.5 ? "#7b4c2f" : "#895737");
    const bend = (variant - 0.5) * 0.16;
    const canopyHeight = 2.45 + variant * 0.35;
    const treeMatrix = composeTreeMatrix(tree.position, [0, 0, 0], [tree.scale, tree.scale, tree.scale]);

    shadow.push({ matrix: composeTreeMatrix([0, 0.018, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], treeMatrix) });
    trunks.push({ matrix: composeTreeMatrix([0, 0.9, 0], [0, 0, bend], [1, 1, 1], treeMatrix), color: barkColor });

    [
      [-0.23, 0.18, 0.2, 0.62, 1.0],
      [0.28, 0.2, -0.18, -0.58, 0.85],
      [0.05, 0.13, -0.36, 0.2, 0.65],
    ].forEach(([rx, ry, rz, rot, length], index) => {
      roots.push({
        matrix: composeTreeMatrix([rx, ry, rz], [0, index * 1.8, rot], [1, length, 1], treeMatrix),
      });
    });

    [
      [-0.42, 1.45, 0.14, 0.7, 0.82, 0.1],
      [0.44, 1.68, -0.08, -0.72, 0.92, 1.5],
      [0.08, 1.86, -0.44, 0.54, 0.7, 2.85],
    ].forEach(([bx, by, bz, rotZ, length, rotY]) => {
      branches.push({
        matrix: composeTreeMatrix([bx, by, bz], [0, rotY, rotZ], [1, length, 1], treeMatrix),
        color: barkColor,
      });
    });

    [
      [0, canopyHeight, 0, 1.28, 0.98, 1.18, 0],
      [-0.58, canopyHeight - 0.22, 0.12, 0.9, 0.72, 0.82, 1],
      [0.55, canopyHeight - 0.08, -0.06, 0.92, 0.78, 0.86, 2],
      [0.05, canopyHeight + 0.45, -0.05, 0.9, 0.75, 0.88, 3],
      [0.08, canopyHeight - 0.36, 0.55, 0.78, 0.64, 0.72, 1],
    ].forEach(([lx, ly, lz, sx, sy, sz, colorIndex], index) => {
      leaves.push({
        matrix: composeTreeMatrix([lx, ly, lz], [0, variant * Math.PI + index * 0.7, 0], [sx, sy, sz], treeMatrix),
        color: new THREE.Color(TREE_LEAF_COLORS[colorIndex]),
      });
    });

    [
      [-0.75, canopyHeight - 0.1, 0.45, 0.08],
      [0.82, canopyHeight + 0.1, 0.2, -0.12],
      [0.16, canopyHeight + 0.75, -0.48, 0.16],
    ].forEach(([tx, ty, tz, rot], index) => {
      tufts.push({
        matrix: composeTreeMatrix([tx, ty, tz], [0, index * 1.35, rot], [1, 1, 1], treeMatrix),
        color: new THREE.Color(TREE_LEAF_COLORS[(index + 2) % TREE_LEAF_COLORS.length]),
      });
    });
  }

  return { shadow, trunks, roots, branches, leaves, tufts };
}

function composeTreeMatrix(
  position: Vec3Tuple,
  rotation: Vec3Tuple,
  scale: Vec3Tuple,
  parent?: THREE.Matrix4,
) {
  return composeInstanceMatrix(position, rotation, scale, parent);
}

function composeInstanceMatrix(
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

function applyStaticPropInstances(mesh: THREE.InstancedMesh | null, instances: StaticPropInstance[]) {
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

function applyTreeInstances(mesh: THREE.InstancedMesh | null, instances: TreeInstance[]) {
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

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  GRASS_TUFTS,
  GROUND_SMUDGE_DECALS,
  PLAZA_CRACK_DECALS,
  ROAD_EDGE_DECALS,
  STATIC_CONTACT_SHADOWS,
  applyGrassTuftInstances,
  applyGroundDecalInstances,
  type GroundRectDecalSpec,
} from "./shared";
import { configureTile } from "./textures";

export function RoadStrip({
  position,
  size,
  texture,
}: {
  position: [number, number, number];
  size: [number, number];
  texture: THREE.Texture;
}) {
  const roadTexture = useMemo(() => {
    const map = texture.clone();
    configureTile(map, Math.max(0.75, size[0] / 11), Math.max(0.75, size[1] / 11));
    return map;
  }, [size[0], size[1], texture]);

  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={roadTexture} color="#8f8768" />
    </mesh>
  );
}

export function DirtPath({
  position,
  size,
  texture,
}: {
  position: [number, number, number];
  size: [number, number];
  texture: THREE.Texture;
}) {
  const pathTexture = useMemo(() => {
    const map = texture.clone();
    configureTile(map, Math.max(0.75, size[0] / 9), Math.max(0.75, size[1] / 9));
    return map;
  }, [size[0], size[1], texture]);

  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={pathTexture} color="#9c8051" />
    </mesh>
  );
}

export function GroundDetailLayer({ grassTuftTexture }: { grassTuftTexture: THREE.Texture }) {
  return (
    <group>
      <GroundCircleDecals decals={GROUND_SMUDGE_DECALS} opacity={0.16} renderOrder={3} />
      <GroundRectDecals decals={ROAD_EDGE_DECALS} opacity={0.22} renderOrder={4} />
      <GroundRectDecals decals={PLAZA_CRACK_DECALS} opacity={0.24} renderOrder={5} />
      <GroundCircleDecals decals={STATIC_CONTACT_SHADOWS} opacity={0.2} renderOrder={6} />
      <InstancedGrassTufts texture={grassTuftTexture} />
    </group>
  );
}

function GroundRectDecals({
  decals,
  opacity,
  renderOrder,
}: {
  decals: GroundRectDecalSpec[];
  opacity: number;
  renderOrder: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      transparent: true,
      opacity,
      vertexColors: true,
    }),
    [opacity],
  );

  useLayoutEffect(() => {
    applyGroundDecalInstances(meshRef.current, decals);
  }, [decals]);

  return <instancedMesh ref={meshRef} args={[geometry, material, decals.length]} renderOrder={renderOrder} />;
}

function GroundCircleDecals({
  decals,
  opacity,
  renderOrder,
}: {
  decals: GroundRectDecalSpec[];
  opacity: number;
  renderOrder: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#ffffff",
      depthWrite: false,
      transparent: true,
      opacity,
      vertexColors: true,
    }),
    [opacity],
  );

  useLayoutEffect(() => {
    applyGroundDecalInstances(meshRef.current, decals);
  }, [decals]);

  return <instancedMesh ref={meshRef} args={[geometry, material, decals.length]} renderOrder={renderOrder} />;
}

function InstancedGrassTufts({ texture }: { texture: THREE.Texture }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.08,
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
    [texture],
  );

  useLayoutEffect(() => {
    applyGrassTuftInstances(meshRef.current, GRASS_TUFTS);
  }, []);

  return <instancedMesh ref={meshRef} args={[geometry, material, GRASS_TUFTS.length * 2]} renderOrder={8} />;
}

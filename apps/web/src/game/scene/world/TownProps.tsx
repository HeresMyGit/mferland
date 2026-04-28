import { useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import {
  applyStaticPropInstances,
  composeInstanceMatrix,
  type MarketStallSpec,
  type StaticPropInstance,
} from "./shared";

export function BannerPost({
  position,
  color,
  rotation = 0,
}: {
  position: [number, number, number];
  color: string;
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.08, 0.11, 3.6, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0.5, 2.75, 0.02]}>
        <boxGeometry args={[0.95, 1.2, 0.06]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0.5, 2.1, 0.04]}>
        <boxGeometry args={[0.95, 0.08, 0.08]} />
        <meshBasicMaterial color="#2b2118" />
      </mesh>
      <Text
        position={[0.5, 2.78, 0.08]}
        fontSize={0.31}
        color="#f8f2d6"
        outlineColor="#242018"
        outlineWidth={0.018}
        anchorX="center"
        anchorY="middle"
      >
        MF
      </Text>
    </group>
  );
}

export function MarketStall({
  stall,
  roofTexture,
}: {
  stall: MarketStallSpec;
  roofTexture: THREE.Texture;
}) {
  return (
    <group position={stall.position} rotation-y={stall.rotation}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[3.3, 0.35, 1.7]} />
        <meshBasicMaterial color="#6a4428" />
      </mesh>
      <mesh position={[0, 0.86, 0.05]}>
        <boxGeometry args={[3.1, 0.18, 1.54]} />
        <meshBasicMaterial color="#c3a06f" />
      </mesh>
      <mesh position={[0, 2.38, 0]} rotation-z={0.08}>
        <boxGeometry args={[3.65, 0.2, 2.18]} />
        <meshBasicMaterial map={roofTexture} color={stall.color} />
      </mesh>
      <mesh position={[0, 2.08, 1.13]}>
        <boxGeometry args={[3.45, 0.55, 0.08]} />
        <meshBasicMaterial color={stall.color} />
      </mesh>
      <Text
        position={[0, 2.09, 1.2]}
        fontSize={0.34}
        color="#fff8df"
        outlineColor="#2d2822"
        outlineWidth={0.025}
        anchorX="center"
        anchorY="middle"
      >
        MKT
      </Text>
    </group>
  );
}

export function InstancedMarketProps({ stalls }: { stalls: MarketStallSpec[] }) {
  const postRef = useRef<THREE.InstancedMesh>(null);
  const crateRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => buildMarketPropInstances(stalls), [stalls]);
  const geometries = useMemo(() => ({
    post: new THREE.CylinderGeometry(0.06, 0.08, 2.1, 8),
    crate: new THREE.BoxGeometry(1, 1, 1),
  }), []);
  const materials = useMemo(() => ({
    post: new THREE.MeshBasicMaterial({ color: "#4b2d18" }),
    crate: new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true }),
  }), []);

  useLayoutEffect(() => {
    applyStaticPropInstances(postRef.current, instances.posts);
    applyStaticPropInstances(crateRef.current, instances.crates);
  }, [instances]);

  return (
    <>
      <instancedMesh ref={postRef} args={[geometries.post, materials.post, instances.posts.length]} />
      <instancedMesh ref={crateRef} args={[geometries.crate, materials.crate, instances.crates.length]} />
    </>
  );
}

function buildMarketPropInstances(stalls: MarketStallSpec[]) {
  const posts: StaticPropInstance[] = [];
  const crates: StaticPropInstance[] = [];

  for (const stall of stalls) {
    const parentMatrix = composeInstanceMatrix(stall.position, [0, stall.rotation, 0], [1, 1, 1]);
    for (const x of [-1.45, 1.45]) {
      posts.push({
        matrix: composeInstanceMatrix([x, 1.48, -0.66], [0, 0, 0], [1, 1, 1], parentMatrix),
      });
      posts.push({
        matrix: composeInstanceMatrix([x, 1.48, 0.66], [0, 0, 0], [1, 1, 1], parentMatrix),
      });
    }

    [-1.04, -0.34, 0.4, 1.08].forEach((x, index) => {
      crates.push({
        matrix: composeInstanceMatrix(
          [x, 1.08, 0.42 - (index % 2) * 0.38],
          [0, 0, 0],
          [0.42, 0.36, 0.42],
          parentMatrix,
        ),
        color: new THREE.Color(index % 2 ? "#e8c063" : "#8fc263"),
      });
    });
  }

  return { posts, crates };
}

export function WatchTower({
  position,
  stoneTexture,
  roofTexture,
}: {
  position: [number, number, number];
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[1.15, 1.35, 3.7, 12]} />
        <meshBasicMaterial map={stoneTexture} color="#9c9589" />
      </mesh>
      <mesh position={[0, 3.86, 0]}>
        <cylinderGeometry args={[1.62, 1.38, 0.55, 12]} />
        <meshBasicMaterial map={stoneTexture} color="#837b70" />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[Math.sin(angle) * 1.34, 4.35, Math.cos(angle) * 1.34]}
            rotation-y={angle}
          >
            <boxGeometry args={[0.34, 0.68, 0.28]} />
            <meshBasicMaterial map={stoneTexture} color="#8d8579" />
          </mesh>
        );
      })}
      <mesh position={[0, 5.05, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[1.98, 1.6, 4]} />
        <meshBasicMaterial map={roofTexture} color="#8e3823" />
      </mesh>
      <BannerPost position={[0, 0.04, 1.9]} color="#395da8" />
    </group>
  );
}

export function SpawnRing({ position, color = "#8b6cff" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.05, 1.18, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.55, 0.58, 44]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

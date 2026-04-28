import { useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import {
  applyStaticPropInstances,
  composeInstanceMatrix,
  type StaticPropInstance,
  type Vec3Tuple,
} from "./shared";

export function RundownFarm({
  position,
  rotation = 0,
  stoneTexture,
  roofTexture,
  wallTexture,
  barkTexture,
}: {
  position: [number, number, number];
  rotation?: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <MudPatch position={[-1, 0.026, 0]} scale={[9.5, 5.8, 1]} />
      <MudPatch position={[7.8, 0.027, 3.8]} scale={[6.2, 3.2, 1]} />
      <MudPatch position={[-8.8, 0.027, 4.4]} scale={[5.8, 3.6, 1]} />
      <BrokenFence width={26} depth={18} barkTexture={barkTexture} />
      <FarmHouse position={[-7.8, 0, -3.8]} rotation={0.1} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} />
      <SaggingBarn position={[7.2, 0, -3.2]} rotation={-0.12} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} />
      <CollapsedShed position={[5.8, 0, 6.4]} rotation={0.38} roofTexture={roofTexture} barkTexture={barkTexture} />
      <Scarecrow position={[-10.2, 0, 5.8]} rotation={0.34} barkTexture={barkTexture} />
      <Text
        position={[0, 1.6, -9.5]}
        rotation-y={0}
        fontSize={0.42}
        color="#e9d7ad"
        outlineColor="#2d2016"
        outlineWidth={0.035}
        anchorX="center"
      >
        OLD FARM
      </Text>
    </group>
  );
}

function MudPatch({
  position,
  scale,
}: {
  position: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} scale={scale}>
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial color="#5d432f" transparent opacity={0.82} />
    </mesh>
  );
}

function FarmHouse({
  position,
  rotation,
  stoneTexture,
  roofTexture,
  wallTexture,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[5.6, 0.56, 4.1]} />
        <meshBasicMaterial map={stoneTexture} color="#a08b70" />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[5.25, 3.45, 3.85]} />
        <meshBasicMaterial map={wallTexture} color="#b79b79" />
      </mesh>
      <mesh position={[-0.22, 4.02, 0]} rotation-z={0.16}>
        <boxGeometry args={[6.45, 0.28, 4.86]} />
        <meshBasicMaterial map={roofTexture} color="#6f3525" />
      </mesh>
      <mesh position={[1.95, 2.35, 2.02]}>
        <boxGeometry args={[1.08, 1.0, 0.16]} />
        <meshBasicMaterial color="#201811" />
      </mesh>
      <mesh position={[-1.64, 1.52, 2.04]}>
        <boxGeometry args={[1.15, 1.85, 0.16]} />
        <meshBasicMaterial color="#3e2919" />
      </mesh>
      {[[-2.48, 2.2, 2.12, 0.22], [0.18, 3.72, 2.12, -0.48], [2.6, 1.15, 2.12, 0.08]].map(([x, y, z, rot], index) => (
        <mesh key={index} position={[x, y, z]} rotation-z={rot}>
          <boxGeometry args={[0.18, 2.3, 0.15]} />
          <meshBasicMaterial color="#4d2f1b" />
        </mesh>
      ))}
    </group>
  );
}

function SaggingBarn({
  position,
  rotation,
  stoneTexture,
  roofTexture,
  wallTexture,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[7.3, 0.5, 5.7]} />
        <meshBasicMaterial map={stoneTexture} color="#8e7a62" />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[6.9, 4.1, 5.35]} />
        <meshBasicMaterial map={wallTexture} color="#8b5336" />
      </mesh>
      <mesh position={[-0.18, 4.95, 0]} rotation-z={-0.1}>
        <boxGeometry args={[8.1, 0.34, 6.35]} />
        <meshBasicMaterial map={roofTexture} color="#5f291d" />
      </mesh>
      <mesh position={[0, 1.52, 2.76]}>
        <boxGeometry args={[2.6, 2.45, 0.18]} />
        <meshBasicMaterial color="#2f1f16" />
      </mesh>
      <mesh position={[0, 1.55, 2.88]} rotation-z={0.55}>
        <boxGeometry args={[0.22, 3.2, 0.12]} />
        <meshBasicMaterial color="#a06b42" />
      </mesh>
      <mesh position={[0, 1.55, 2.9]} rotation-z={-0.55}>
        <boxGeometry args={[0.22, 3.2, 0.12]} />
        <meshBasicMaterial color="#a06b42" />
      </mesh>
      {[[-2.85, 2.4, 2.82, 0.1], [2.8, 2.2, 2.82, -0.2], [-1.2, 4.55, 2.84, -0.42]].map(([x, y, z, rot], index) => (
        <mesh key={index} position={[x, y, z]} rotation-z={rot}>
          <boxGeometry args={[0.18, 2.2, 0.14]} />
          <meshBasicMaterial color="#4d2f1b" />
        </mesh>
      ))}
    </group>
  );
}

function CollapsedShed({
  position,
  rotation,
  roofTexture,
  barkTexture,
}: {
  position: [number, number, number];
  rotation: number;
  roofTexture: THREE.Texture;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.75, 0]} rotation-z={0.62}>
        <boxGeometry args={[4.8, 0.28, 2.7]} />
        <meshBasicMaterial map={roofTexture} color="#5d3020" />
      </mesh>
      {[-1.8, -0.4, 1.1, 2.2].map((x, index) => (
        <mesh key={index} position={[x, 0.42, index % 2 ? -0.72 : 0.62]} rotation-z={0.5 - index * 0.18}>
          <cylinderGeometry args={[0.07, 0.1, 2.2, 8]} />
          <meshStandardMaterial map={barkTexture} color="#664125" roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

function Scarecrow({
  position,
  rotation,
  barkTexture,
}: {
  position: [number, number, number];
  rotation: number;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.22, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 2.44, 8]} />
        <meshStandardMaterial map={barkTexture} color="#5d3b22" roughness={0.96} />
      </mesh>
      <mesh position={[0, 1.78, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.06, 2.2, 8]} />
        <meshStandardMaterial map={barkTexture} color="#5d3b22" roughness={0.96} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <sphereGeometry args={[0.28, 12, 8]} />
        <meshBasicMaterial color="#b58a45" />
      </mesh>
      <mesh position={[0, 1.55, 0.03]}>
        <coneGeometry args={[0.58, 1.1, 4]} />
        <meshBasicMaterial color="#826b34" />
      </mesh>
    </group>
  );
}

function BrokenFence({
  width,
  depth,
  barkTexture,
}: {
  width: number;
  depth: number;
  barkTexture: THREE.Texture;
}) {
  const postRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => buildBrokenFenceInstances(width, depth), [depth, width]);
  const geometries = useMemo(() => ({
    post: new THREE.CylinderGeometry(0.08, 0.11, 1, 8),
    rail: new THREE.BoxGeometry(1, 1, 1),
  }), []);
  const materials = useMemo(() => ({
    post: new THREE.MeshStandardMaterial({ map: barkTexture, color: "#5b391f", roughness: 0.96 }),
    rail: new THREE.MeshStandardMaterial({ map: barkTexture, color: "#6a4428", roughness: 0.95 }),
  }), [barkTexture]);

  useLayoutEffect(() => {
    applyStaticPropInstances(postRef.current, instances.posts);
    applyStaticPropInstances(railRef.current, instances.rails);
  }, [instances]);

  return (
    <>
      <instancedMesh ref={postRef} args={[geometries.post, materials.post, instances.posts.length]} />
      <instancedMesh ref={railRef} args={[geometries.rail, materials.rail, instances.rails.length]} />
    </>
  );
}

function buildBrokenFenceInstances(width: number, depth: number) {
  const posts: StaticPropInstance[] = [];
  const rails: StaticPropInstance[] = [];
  const frontBackPosts = Array.from({ length: 8 }, (_, index) => -width / 2 + index * (width / 7));
  const sidePosts = Array.from({ length: 5 }, (_, index) => -depth / 2 + index * (depth / 4));

  const addPost = (position: Vec3Tuple, broken = false) => {
    posts.push({
      matrix: composeInstanceMatrix(
        [position[0], broken ? 0.42 : 0.62, position[2]],
        [0, 0, broken ? 0.3 : 0],
        [1, broken ? 0.84 : 1.24, 1],
      ),
    });
  };
  const addRail = (position: Vec3Tuple, size: Vec3Tuple, rotation = 0) => {
    rails.push({
      matrix: composeInstanceMatrix(position, [0, rotation, rotation ? 0.08 : -0.035], size),
    });
  };

  frontBackPosts.forEach((x, index) => {
    addPost([x, 0, -depth / 2], index === 2);
    if (index !== 4) addPost([x, 0, depth / 2], index === 6);
  });
  sidePosts.forEach((z, index) => {
    if (index !== 2) addPost([-width / 2, 0, z], index === 1);
    addPost([width / 2, 0, z], index === 3);
  });

  addRail([0, 0.9, -depth / 2], [width - 1.4, 0.11, 0.13]);
  addRail([0, 0.58, -depth / 2 + 0.05], [width - 5.8, 0.1, 0.12]);
  addRail([-3.8, 0.78, depth / 2], [width - 8.6, 0.11, 0.13]);
  addRail([-width / 2, 0.78, 1.4], [depth - 3.6, 0.11, 0.13], Math.PI / 2);
  addRail([width / 2, 0.78, -1.6], [depth - 5.2, 0.11, 0.13], Math.PI / 2);

  return { posts, rails };
}

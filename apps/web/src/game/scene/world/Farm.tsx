import { useLayoutEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { type RenderPerformanceProfile } from "../../performance";
import { getPerformanceModelUrl } from "../../modelQuality";
import { HangingSign } from "./TownProps";
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
  renderProfile,
}: {
  position: [number, number, number];
  rotation?: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
  barkTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <MudPatch position={[-1, 0.026, 0]} scale={[9.5, 5.8, 1]} />
      <MudPatch position={[7.8, 0.027, 3.8]} scale={[6.2, 3.2, 1]} />
      <MudPatch position={[-8.8, 0.027, 4.4]} scale={[5.8, 3.6, 1]} />
      <BrokenFence width={26} depth={18} barkTexture={barkTexture} />
      <FarmHouse position={[-7.8, 0, -3.8]} rotation={Math.PI + 0.1} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} renderProfile={renderProfile} />
      <SaggingBarn position={[7.2, 0, -3.2]} rotation={Math.PI - 0.12} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} renderProfile={renderProfile} />
      <CollapsedShed position={[5.8, 0, 6.4]} rotation={0.38} roofTexture={roofTexture} barkTexture={barkTexture} />
      <Scarecrow position={[-10.2, 0, 5.8]} rotation={0.34} renderProfile={renderProfile} />
      <FarmEntranceSign barkTexture={barkTexture} renderProfile={renderProfile} />
    </group>
  );
}

function FarmEntranceSign({ barkTexture, renderProfile }: { barkTexture: THREE.Texture; renderProfile: RenderPerformanceProfile }) {
  return (
    <group position={[0, 0, -9.45]}>
      <mesh position={[-1.78, 1.03, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 2.06, 8]} />
        <meshBasicMaterial map={barkTexture} color="#4b2d18" />
      </mesh>
      <mesh position={[1.78, 1.03, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 2.06, 8]} />
        <meshBasicMaterial map={barkTexture} color="#4b2d18" />
      </mesh>
      <mesh position={[0, 1.93, 0.01]}>
        <boxGeometry args={[3.95, 0.12, 0.12]} />
        <meshBasicMaterial map={barkTexture} color="#4b2d18" />
      </mesh>
      <group position={[0, 1.62, -0.02]} rotation-y={Math.PI} scale={[0.62, 0.62, 0.62]}>
        <HangingSign label="RED EYE" color="#b46e34" fontSize={0.56} renderProfile={renderProfile} />
      </group>
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
  renderProfile,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/damaged-farmhouse.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(() => createFarmBuildingModel(gltf.scene), [gltf.scene]);
  void stoneTexture;
  void roofTexture;
  void wallTexture;

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
    </group>
  );
}

function SaggingBarn({
  position,
  rotation,
  stoneTexture,
  roofTexture,
  wallTexture,
  renderProfile,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/sagging-barn.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(() => createFarmBuildingModel(gltf.scene), [gltf.scene]);
  void stoneTexture;
  void roofTexture;
  void wallTexture;

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
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
  renderProfile,
}: {
  position: [number, number, number];
  rotation: number;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/farm-scarecrow.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(() => createFarmScarecrowModel(gltf.scene), [gltf.scene]);

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
    </group>
  );
}

function createFarmBuildingModel(sourceScene: THREE.Group) {
  const scene = sourceScene.clone(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x, -box.min.y, -center.z);
  return scene;
}

function createFarmScarecrowModel(sourceScene: THREE.Group) {
  const scene = sourceScene.clone(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0.01 ? 2.75 / size.y : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return scene;
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

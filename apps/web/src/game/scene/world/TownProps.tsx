import { useMemo } from "react";
import { Text } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { getPerformanceModelUrl } from "../../modelQuality";
import { type RenderPerformanceProfile } from "../../performance";
import { MFERS_DISPLAY_FONT_URL } from "./fonts";
import { type MarketStallSpec } from "./shared";

export function HangingSign({
  label,
  color,
  fontSize = 0.6,
  textColor = "#2b2117",
  outlineColor = "#f7e4b8",
  renderProfile,
}: {
  label: string;
  color: string;
  fontSize?: number;
  textColor?: string;
  outlineColor?: string;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/town-hanging-sign.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(
    () => createColoredTownPropModel(gltf.scene, "town_sign_accent_color", color),
    [color, gltf.scene],
  );

  return (
    <>
      <primitive object={model} dispose={null} />
      <Text
        position={[0, 0.04, 0.24]}
        font={MFERS_DISPLAY_FONT_URL}
        fontSize={fontSize}
        color={textColor}
        outlineColor={outlineColor}
        outlineWidth={0.018}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </>
  );
}

export function BannerPost({
  position,
  color,
  rotation = 0,
  renderProfile,
}: {
  position: [number, number, number];
  color: string;
  rotation?: number;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/banner-post.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(
    () => createColoredTownPropModel(gltf.scene, "banner_post_cloth_color", color),
    [color, gltf.scene],
  );

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
      <Text
        position={[0.52, 2.75, 0.2]}
        font={MFERS_DISPLAY_FONT_URL}
        fontSize={0.27}
        color="#211a13"
        outlineColor="#f8f2d6"
        outlineWidth={0.01}
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
  renderProfile,
}: {
  stall: MarketStallSpec;
  roofTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/market-stall.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(
    () => createColoredTownPropModel(gltf.scene, "market_stall_canopy_color", stall.color),
    [gltf.scene, stall.color],
  );
  void roofTexture;

  return (
    <group position={stall.position} rotation-y={stall.rotation}>
      <primitive object={model} dispose={null} />
      <MarketStallSign color={stall.color} renderProfile={renderProfile} />
    </group>
  );
}

function MarketStallSign({ color, renderProfile }: { color: string; renderProfile: RenderPerformanceProfile }) {
  return (
    <group position={[0, 2.04, 1.36]} scale={[0.42, 0.42, 0.42]}>
      <HangingSign label="MKT" color={color} fontSize={0.6} renderProfile={renderProfile} />
    </group>
  );
}

export function WatchTower({
  position,
  rotation = 0,
  stoneTexture,
  roofTexture,
  renderProfile,
}: {
  position: [number, number, number];
  rotation?: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/watch-tower.glb", renderProfile)) as { scene: THREE.Group };
  const model = useMemo(() => createWatchTowerModel(gltf.scene), [gltf.scene]);
  void stoneTexture;
  void roofTexture;

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
      <BannerPost position={[0, 0.04, 1.9]} color="#395da8" renderProfile={renderProfile} />
    </group>
  );
}

function createColoredTownPropModel(sourceScene: THREE.Group, materialName: string, color: string) {
  const scene = sourceScene.clone(true);
  const accentColor = new THREE.Color(color);

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((material) => {
      const next = material.clone();
      if (next.name === materialName && hasMaterialColor(next)) {
        next.color.copy(accentColor);
      }
      return next;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });

  return scene;
}

function hasMaterialColor(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  return "color" in material && material.color instanceof THREE.Color;
}

function createWatchTowerModel(sourceScene: THREE.Group) {
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

export function SpawnRing({
  position,
  color = "#8b6cff",
  rotation = 0,
}: {
  position: [number, number, number];
  color?: string;
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
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

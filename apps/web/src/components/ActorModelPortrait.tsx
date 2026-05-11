import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getNpcDisposition, type NpcSnapshot } from "@mferland/shared";
import { getClientRenderPerformanceProfile, type RenderPerformanceProfile } from "../game/performance";
import { DeerModel, HogModel, RabbitModel } from "./CreatureAvatar";
import { createMferGptAvatar, getMferGptModelUrl } from "./MferGptAvatar";
import { createTrainingDummyModel } from "./TrainingDummyAvatar";

type LoadedGltf = {
  scene: THREE.Group;
};

type PortraitConfig = {
  cameraY: number;
  cameraZ: number;
  lookY: number;
  modelY: number;
  scale: number;
  sway: number;
  bob: number;
};

const TRAINING_DUMMY_MODEL_URL = "/models/training-dummy.glb";

const PORTRAIT_CONFIG: Record<NpcSnapshot["model"], PortraitConfig> = {
  mfer: { cameraY: 1.45, cameraZ: 4.1, lookY: 1.45, modelY: -0.15, scale: 1, sway: 0.08, bob: 0.015 },
  mfergpt: { cameraY: 1.82, cameraZ: 4.7, lookY: 1.72, modelY: -0.34, scale: 1, sway: 0.1, bob: 0.012 },
  "training-dummy": { cameraY: 1.42, cameraZ: 3.7, lookY: 1.32, modelY: -0.18, scale: 1, sway: 0.14, bob: 0.008 },
  rabbit: { cameraY: 0.68, cameraZ: 2.45, lookY: 0.64, modelY: 0.04, scale: 2.05, sway: 0.12, bob: 0.035 },
  deer: { cameraY: 1.14, cameraZ: 3.35, lookY: 1.08, modelY: -0.04, scale: 1.22, sway: 0.11, bob: 0.018 },
  hog: { cameraY: 0.92, cameraZ: 2.95, lookY: 0.82, modelY: 0.02, scale: 1.38, sway: 0.13, bob: 0.025 },
};

export function ActorModelPortrait({ npc, renderProfile }: { npc: NpcSnapshot; renderProfile?: RenderPerformanceProfile }) {
  const config = PORTRAIT_CONFIG[npc.model] ?? PORTRAIT_CONFIG.hog;
  const resolvedRenderProfile = useMemo(() => renderProfile ?? getClientRenderPerformanceProfile(), [renderProfile]);

  return (
    <Canvas
      className="model-portrait-canvas"
      dpr={resolvedRenderProfile.portraitDpr}
      camera={{ position: [0, config.cameraY, config.cameraZ], fov: 27, near: 0.1, far: 30 }}
      gl={{ antialias: resolvedRenderProfile.antialias, alpha: true, powerPreference: resolvedRenderProfile.powerPreference }}
      aria-label={`${npc.name} model portrait`}
      role="img"
    >
      <ambientLight intensity={1.45} />
      <hemisphereLight args={["#fff7df", "#8c765c", 1.02]} />
      <directionalLight position={[2.6, 3.8, 3.2]} intensity={2.2} color="#fff2d2" />
      <Suspense fallback={null}>
        <PortraitRig npc={npc} config={config} />
      </Suspense>
      <PortraitCamera config={config} />
    </Canvas>
  );
}

function PortraitRig({ npc, config }: { npc: NpcSnapshot; config: PortraitConfig }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const seedOffset = npc.avatarSeed * 0.001;
    const sway = Math.sin(clock.elapsedTime * 1.4 + seedOffset);
    group.rotation.y = sway * config.sway;
    group.rotation.z = npc.model === "training-dummy" ? sway * 0.035 : 0;
    group.position.y = config.modelY + Math.sin(clock.elapsedTime * 2.2 + seedOffset) * config.bob;
  });

  return (
    <group ref={groupRef} scale={config.scale} position={[0, config.modelY, 0]}>
      <PortraitModel npc={npc} />
    </group>
  );
}

function PortraitCamera({ config }: { config: PortraitConfig }) {
  const { camera } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, config.lookY, 0), [config.lookY]);

  useFrame(() => {
    camera.position.set(0, config.cameraY, config.cameraZ);
    camera.lookAt(lookAt);
  });

  return null;
}

function PortraitModel({ npc }: { npc: NpcSnapshot }) {
  if (npc.model === "mfergpt") return <MferGptPortraitModel npc={npc} />;
  if (npc.model === "training-dummy") return <TrainingDummyPortraitModel />;
  if (npc.model === "rabbit") return <RabbitModel />;
  if (npc.model === "deer") return <DeerModel />;
  return <HogModel />;
}

function MferGptPortraitModel({ npc }: { npc: NpcSnapshot }) {
  const isHostile = getNpcDisposition(npc) === "hostile";
  const gltf = useLoader(GLTFLoader, getMferGptModelUrl(isHostile)) as LoadedGltf;
  const model = useMemo(() => createMferGptAvatar(gltf.scene, isHostile), [gltf.scene, isHostile]);
  return <primitive object={model} dispose={null} />;
}

function TrainingDummyPortraitModel() {
  const gltf = useLoader(GLTFLoader, TRAINING_DUMMY_MODEL_URL) as LoadedGltf;
  const model = useMemo(() => createTrainingDummyModel(gltf.scene), [gltf.scene]);
  return <primitive object={model} dispose={null} />;
}

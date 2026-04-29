import { useMemo, useRef } from "react";
import { Billboard } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getNpcDisposition, type NpcSnapshot, type QuestMarkerType } from "@mferland/shared";
import { type ChatBubble } from "../game/chatBubbles";
import {
  ActorBlobShadow,
  ActorChatBubble,
  ActorNameplate,
  ColdStatusEffect,
  DispositionBaseMarker,
  FrozenStatusEffect,
  LootSparkles,
  QuestMarker,
  TargetRing,
  TARGET_LABEL_COLORS,
  TARGET_RING_COLORS,
} from "./MferAvatar";

type TrainingDummyAvatarProps = {
  npc: NpcSnapshot;
  isTargeted?: boolean;
  isDefeated?: boolean;
  questMarker?: QuestMarkerType | null;
  hasLoot?: boolean;
  chatBubble?: ChatBubble | null;
  viewerPosition?: { x: number; z: number } | null;
  onTarget?: () => void;
};

type LoadedTrainingDummyGltf = {
  scene: THREE.Group;
};

const MODEL_URL = "/models/training-dummy.glb";
const NAMEPLATE_RENDER_DISTANCE_SQ = 32 * 32;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 38 * 38;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 42 * 42;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 28 * 28;
const targetPosition = new THREE.Vector3();
const dummyHitGeometry = new THREE.CylinderGeometry(0.78, 0.78, 2.35, 12);
const dummyHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

dummyHitGeometry.computeBoundingBox();
dummyHitGeometry.computeBoundingSphere();

export function TrainingDummyAvatar({
  npc,
  isTargeted = false,
  isDefeated = false,
  questMarker = null,
  hasLoot = false,
  chatBubble = null,
  viewerPosition = null,
  onTarget,
}: TrainingDummyAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, MODEL_URL) as LoadedTrainingDummyGltf;
  const model = useMemo(() => createTrainingDummyModel(gltf.scene), [gltf.scene]);
  const disposition = getNpcDisposition(npc);
  const ringColor = TARGET_RING_COLORS[disposition];
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showChatBubble = !isDefeated && Boolean(chatBubble) && (isTargeted || distanceToViewerSq <= CHAT_BUBBLE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = !isDefeated && (Boolean(questMarker) || isTargeted);
  const isFrozen = npc.frozenUntil > Date.now();
  const isCold = !isFrozen && npc.slowedUntil > Date.now();

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    targetPosition.set(npc.x, npc.y, npc.z);
    group.position.lerp(targetPosition, 1 - Math.pow(0.82, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, npc.yaw, 1 - Math.pow(0.82, delta * 60));

    const pose = poseRef.current;
    if (!pose) return;

    const idleSway = Math.sin(clock.elapsedTime * 1.8 + npc.avatarSeed * 0.001) * 0.018;
    const targetRoll = isDefeated ? -Math.PI / 2 : idleSway;
    pose.rotation.z += (targetRoll - pose.rotation.z) * (1 - Math.pow(0.72, delta * 60));
    pose.position.y += ((isDefeated ? 0.05 : 0) - pose.position.y) * (1 - Math.pow(0.72, delta * 60));
  });

  return (
    <group ref={groupRef} position={[npc.x, npc.y, npc.z]} rotation-y={npc.yaw}>
      <ActorBlobShadow scale={[0.82, 0.5, 1]} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={0.74} />}
      {isTargeted && <TargetRing color={ringColor} disposition={disposition} radius={0.9} />}
      {isFrozen && <FrozenStatusEffect frozenUntil={npc.frozenUntil} radius={0.74} y={1.16} />}
      {isCold && <ColdStatusEffect slowedUntil={npc.slowedUntil} radius={0.74} y={1.16} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={3.46} />}
      {showLootSparkles && <LootSparkles y={1.15} />}
      <mesh
        geometry={dummyHitGeometry}
        material={dummyHitMaterial}
        position={[0, 1.12, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        <primitive object={model} dispose={null} />
        {showNameplate && (
          <Billboard position={[0, 2.78, 0]}>
            <ActorNameplate
              title={npc.name}
              badge="DUMMY"
              color={TARGET_LABEL_COLORS[disposition]}
              badgeColor={ringColor}
              health={npc.isImmortal ? undefined : npc.health}
              maxHealth={npc.isImmortal ? undefined : npc.maxHealth}
              fontSize={0.2}
              maxWidth={2.8}
            />
          </Billboard>
        )}
        {showChatBubble && chatBubble && (
          <Billboard position={[0, showQuestMarker ? 4.05 : 3.4, 0]}>
            <ActorChatBubble bubble={chatBubble} />
          </Billboard>
        )}
      </group>
    </group>
  );

  function handleTarget(event: ThreeEvent<PointerEvent>) {
    if (!onTarget) return;
    event.stopPropagation();
    onTarget();
  }
}

function createTrainingDummyModel(sourceScene: THREE.Group) {
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
  const scale = size.y > 0.01 ? 2.35 / size.y : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return scene;
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

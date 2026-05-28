import { useEffect, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { getNpcDisposition, type AnimationState, type NpcSnapshot, type QuestMarkerType } from "@mferland/shared";
import { type ChatBubble } from "../game/chatBubbles";
import { MFER_COLORS } from "../game/mferPalette";
import {
  ActorBlobShadow,
  ActorChatBubble,
  ActorNameplate,
  ColdStatusEffect,
  DispositionBaseMarker,
  FrozenStatusEffect,
  LootSparkles,
  MIXAMO_CLIPS,
  MIXAMO_URLS,
  QuestMarker,
  TargetRing,
  getMferAnimationClips,
  updateMferDeathPose,
} from "./MferAvatar";

type MferGptAvatarProps = {
  npc: NpcSnapshot;
  isTargeted?: boolean;
  isDefeated?: boolean;
  questMarker?: QuestMarkerType | null;
  hasLoot?: boolean;
  chatBubble?: ChatBubble | null;
  viewerPosition?: { x: number; z: number } | null;
  showNameplate?: boolean;
  showNameplateHealthBar?: boolean;
  onTarget?: () => void;
};

type LoadedMferGptGltf = {
  scene: THREE.Group;
};

export const MFER_GPT_MODEL_URL = "/models/mferGPT.glb";
export const ENEMY_MFER_GPT_MODEL_URL = "/models/mferGPT-enemy.glb";
const NAMEPLATE_RENDER_DISTANCE_SQ = 58 * 58;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 48 * 48;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 54 * 54;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 30 * 30;
const targetPosition = new THREE.Vector3();
const hitGeometry = new THREE.CylinderGeometry(1.02, 1.02, 3.25, 16);
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const friendlyLabelColor = "#f0e9ff";
const friendlyBadgeColor = "#9b7dff";
const hostileLabelColor = "#ffe4df";
const hostileBadgeColor = MFER_COLORS.hostile;
const friendlyAntennaLightColor = new THREE.Color("#9b7dff");
const hostileAntennaLightColor = new THREE.Color("#ff1616");
const antennaLightBaseIntensity = 15;
const antennaLightPulseIntensity = 18;

hitGeometry.computeBoundingBox();
hitGeometry.computeBoundingSphere();

export function getMferGptModelUrl(isHostile: boolean) {
  return isHostile ? ENEMY_MFER_GPT_MODEL_URL : MFER_GPT_MODEL_URL;
}

export function MferGptAvatar({
  npc,
  isTargeted = false,
  isDefeated = false,
  questMarker = null,
  hasLoot = false,
  chatBubble = null,
  viewerPosition = null,
  showNameplate: canShowNameplate = true,
  showNameplateHealthBar = true,
  onTarget,
}: MferGptAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef<string | null>(null);
  const currentAnimationStateRef = useRef<AnimationState | null>(null);
  const deathAgeRef = useRef(0);
  const wasDefeatedRef = useRef(false);
  const disposition = getNpcDisposition(npc);
  const isHostile = disposition === "hostile";
  const gltf = useLoader(GLTFLoader, getMferGptModelUrl(isHostile)) as LoadedMferGptGltf;
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const labelColor = isHostile ? hostileLabelColor : friendlyLabelColor;
  const badgeColor = isHostile ? hostileBadgeColor : friendlyBadgeColor;
  const avatar = useMemo(() => createMferGptAvatar(gltf.scene, isHostile), [gltf.scene, isHostile]);
  const antennaLightMaterials = useMemo(() => getMferGptAntennaLightMaterials(avatar), [avatar]);
  const clips = useMemo(() => getMferAnimationClips(fbxAnimations), [fbxAnimations]);
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = canShowNameplate && !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showChatBubble = !isDefeated && Boolean(chatBubble) && (isTargeted || distanceToViewerSq <= CHAT_BUBBLE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = !isDefeated;
  const isFrozen = npc.frozenUntil > Date.now();
  const isCold = !isFrozen && npc.slowedUntil > Date.now();

  useEffect(() => {
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    currentActionRef.current = null;
    currentClipNameRef.current = null;
    currentAnimationStateRef.current = null;

    const mixer = new THREE.AnimationMixer(avatar);
    mixerRef.current = mixer;
    playClip("idle", { fadeDuration: 0, forceRestart: true });

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      currentActionRef.current = null;
      currentClipNameRef.current = null;
      currentAnimationStateRef.current = null;
    };
  }, [avatar, clips]);

  useEffect(() => {
    if (isDefeated) return;
    playClip(npc.animation);
  }, [isDefeated, npc.animation, clips]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const antennaPulse = antennaLightBaseIntensity
      + (Math.sin(clock.elapsedTime * 4.4) * 0.5 + 0.5) * antennaLightPulseIntensity;
    for (const material of antennaLightMaterials) {
      material.emissiveIntensity = isDefeated ? antennaLightBaseIntensity * 0.28 : antennaPulse;
    }

    if (isDefeated && !wasDefeatedRef.current) {
      deathAgeRef.current = 0;
      playClip("idle", { fadeDuration: 0, forceRestart: true });
      currentActionRef.current?.setEffectiveTimeScale(0);
    } else if (!isDefeated && wasDefeatedRef.current) {
      deathAgeRef.current = 0;
      playClip("idle", { fadeDuration: 0, forceRestart: true });
    }
    wasDefeatedRef.current = isDefeated;

    if (isDefeated) {
      deathAgeRef.current += delta;
      updateMferDeathPose(poseRef.current, deathAgeRef.current);
    } else {
      if (currentAnimationStateRef.current !== npc.animation) {
        playClip(npc.animation);
      }
      mixerRef.current?.update(delta);
    }

    targetPosition.set(npc.x, npc.y, npc.z);
    group.position.lerp(targetPosition, 1 - Math.pow(0.82, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, npc.yaw, 1 - Math.pow(0.82, delta * 60));

    const pose = poseRef.current;
    if (!pose) return;
    if (!isDefeated) {
      pose.rotation.z += (0 - pose.rotation.z) * (1 - Math.pow(0.72, delta * 60));
      pose.rotation.x += (0 - pose.rotation.x) * (1 - Math.pow(0.68, delta * 60));
      pose.position.y += (0 - pose.position.y) * (1 - Math.pow(0.72, delta * 60));
    }
  });

  return (
    <group ref={groupRef} position={[npc.x, npc.y, npc.z]} rotation-y={npc.yaw}>
      {!isDefeated && !isHostile && (
        <MferGptSignalBeacon isHostile={isHostile} isTargeted={isTargeted} showMention={!showChatBubble && !showQuestMarker} />
      )}
      <ActorBlobShadow scale={isDefeated ? [1.08, 0.58, 1.1] : [0.96, 0.58, 1.08]} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={1.12} />}
      {isTargeted && <TargetRing color={badgeColor} disposition={disposition} radius={1.22} />}
      {isFrozen && <FrozenStatusEffect frozenUntil={npc.frozenUntil} radius={0.92} y={1.35} />}
      {isCold && <ColdStatusEffect slowedUntil={npc.slowedUntil} radius={0.92} y={1.35} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={4.35} />}
      {showLootSparkles && <LootSparkles y={1.35} />}
      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, 1.55, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        <primitive object={avatar} dispose={null} />
        {showNameplate && (
          <Billboard position={[0, 3.45, 0]}>
            <ActorNameplate
              title={npc.name}
              badge={isHostile ? "RED EYE" : "AGENT"}
              color={labelColor}
              badgeColor={badgeColor}
              health={npc.isImmortal ? undefined : npc.health}
              maxHealth={npc.isImmortal ? undefined : npc.maxHealth}
              showHealthBar={showNameplateHealthBar}
              fontSize={0.24}
              maxWidth={3.6}
            />
          </Billboard>
        )}
        {showChatBubble && chatBubble && (
          <Billboard position={[0, showQuestMarker ? 5.14 : 4.18, 0]}>
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

  function playClip(state: AnimationState, options: { fadeDuration?: number; forceRestart?: boolean } = {}) {
    const mixer = mixerRef.current;
    const clip = clips.get(state);
    if (!mixer || !clip) return;

    const config = MIXAMO_CLIPS[state];
    const clipName = clip.name;
    const forceRestart = options.forceRestart ?? false;
    if (!forceRestart && currentClipNameRef.current === clipName && currentActionRef.current) {
      currentActionRef.current.setEffectiveTimeScale(config.timeScale);
      return;
    }

    if (!currentActionRef.current) {
      mixer.stopAllAction();
    }

    const nextAction = mixer.clipAction(clip);
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.setEffectiveTimeScale(config.timeScale);
    nextAction.setLoop(config.loop, config.loop === THREE.LoopOnce ? 1 : Infinity);
    nextAction.clampWhenFinished = config.loop === THREE.LoopOnce;
    nextAction.reset();
    const startOffset = Math.min(0.02, Math.max(0, clip.duration - 0.001));
    if (startOffset > 0) nextAction.time = startOffset;
    nextAction.play();

    const previousAction = currentActionRef.current;
    if (previousAction && previousAction !== nextAction) {
      const fadeDuration = options.fadeDuration ?? (state === "jump" ? 0.08 : 0.18);
      if (fadeDuration > 0) nextAction.crossFadeFrom(previousAction, fadeDuration, false);
      else previousAction.stop();
    }

    currentActionRef.current = nextAction;
    currentClipNameRef.current = clipName;
    currentAnimationStateRef.current = state;
    mixer.update(0);
  }
}

function MferGptSignalBeacon({ isHostile, isTargeted, showMention }: { isHostile: boolean; isTargeted: boolean; showMention: boolean }) {
  const ringRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Group>(null);
  const core = isHostile ? hostileBadgeColor : friendlyBadgeColor;
  const ring = isHostile ? "#ff9a7e" : "#79f7ff";
  const center = isHostile ? "#fff0a8" : "#fff1a8";

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (ring) {
      ring.rotation.y = clock.elapsedTime * 0.55;
      ring.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.2) * (isTargeted ? 0.06 : 0.035));
    }

    const beam = beamRef.current;
    if (beam) {
      beam.position.y = Math.sin(clock.elapsedTime * 2.8) * 0.04;
      const width = 1 + Math.sin(clock.elapsedTime * 3.1) * 0.05;
      beam.scale.set(width, 1, width);
    }
  });

  return (
    <group>
      <group ref={ringRef}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.032, 0]} renderOrder={20}>
          <ringGeometry args={[1.22, 1.32, 72]} />
          <meshBasicMaterial color={core} depthWrite={false} opacity={0.64} side={THREE.DoubleSide} toneMapped={false} transparent />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.028, 0]} renderOrder={19}>
          <ringGeometry args={[1.56, 1.6, 72]} />
          <meshBasicMaterial color={ring} depthWrite={false} opacity={0.42} side={THREE.DoubleSide} toneMapped={false} transparent />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.024, 0]} renderOrder={18}>
          <ringGeometry args={[0.62, 0.68, 56]} />
          <meshBasicMaterial color={center} depthWrite={false} opacity={0.46} side={THREE.DoubleSide} toneMapped={false} transparent />
        </mesh>
      </group>
      <group ref={beamRef}>
        <mesh position={[0, 1.7, 0]} renderOrder={21}>
          <cylinderGeometry args={[0.18, 0.3, 3.35, 28, 1, true]} />
          <meshBasicMaterial color={core} depthWrite={false} opacity={0.16} side={THREE.DoubleSide} toneMapped={false} transparent />
        </mesh>
        {showMention && (
          <Billboard position={[0, 4.18, 0]}>
            <Text
              renderOrder={65}
              fontSize={0.48}
              anchorX="center"
              anchorY="middle"
              color={isHostile ? hostileLabelColor : friendlyLabelColor}
              outlineColor="#151018"
              outlineWidth={0.032}
            >
              @
            </Text>
          </Billboard>
        )}
      </group>
    </group>
  );
}

export function createMferGptAvatar(sourceScene: THREE.Group, isHostile: boolean) {
  const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;
  const antennaColor = isHostile ? hostileAntennaLightColor : friendlyAntennaLightColor;
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((material) => {
      const nextMaterial = material.clone();
      if (isMferGptAntennaLight(child.name, nextMaterial.name)) {
        configureMferGptAntennaLightMaterial(nextMaterial, antennaColor);
      }
      return nextMaterial;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0.01 ? 2.95 / size.y : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return scene;
}

function getMferGptAntennaLightMaterials(scene: THREE.Group) {
  const materials: THREE.MeshStandardMaterial[] = [];
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of meshMaterials) {
      if (isMferGptAntennaLight(child.name, material.name) && material instanceof THREE.MeshStandardMaterial) {
        materials.push(material);
      }
    }
  });
  return materials;
}

function configureMferGptAntennaLightMaterial(material: THREE.Material, color: THREE.Color) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.color.copy(color);
  material.emissive.copy(color);
  material.emissiveIntensity = antennaLightBaseIntensity;
  material.toneMapped = false;
  material.map = null;
  material.metalness = 0;
  material.roughness = 0.2;
  material.needsUpdate = true;
}

function isMferGptAntennaLight(meshName: string, materialName = "") {
  const key = `${meshName} ${materialName}`.toLowerCase();
  return key.includes("bot_light");
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

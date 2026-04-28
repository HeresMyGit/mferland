import { useEffect, useMemo, useRef } from "react";
import { Billboard } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { getNpcDisposition, type AnimationState, type NpcSnapshot, type QuestMarkerType } from "@mferland/shared";
import { type ChatBubble } from "../game/chatBubbles";
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
  onTarget?: () => void;
};

type LoadedMferGptGltf = {
  scene: THREE.Group;
};

const MODEL_URL = "/models/mferGPT.glb";
const NAMEPLATE_RENDER_DISTANCE_SQ = 36 * 36;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 42 * 42;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 46 * 46;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 30 * 30;
const targetPosition = new THREE.Vector3();
const hitGeometry = new THREE.CylinderGeometry(0.86, 0.86, 2.8, 14);
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const labelColor = "#d8caff";
const badgeColor = "#b38cff";

hitGeometry.computeBoundingBox();
hitGeometry.computeBoundingSphere();

export function MferGptAvatar({
  npc,
  isTargeted = false,
  isDefeated = false,
  questMarker = null,
  hasLoot = false,
  chatBubble = null,
  viewerPosition = null,
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
  const gltf = useLoader(GLTFLoader, MODEL_URL) as LoadedMferGptGltf;
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const disposition = getNpcDisposition(npc);
  const avatar = useMemo(() => createMferGptAvatar(gltf.scene), [gltf.scene]);
  const clips = useMemo(() => getMferAnimationClips(fbxAnimations), [fbxAnimations]);
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showChatBubble = !isDefeated && Boolean(chatBubble) && (isTargeted || distanceToViewerSq <= CHAT_BUBBLE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = !isDefeated && (Boolean(questMarker) || isTargeted);
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

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

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
      <ActorBlobShadow scale={isDefeated ? [0.95, 0.52, 1] : [0.82, 0.5, 1]} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={0.94} />}
      {isTargeted && <TargetRing color={badgeColor} disposition={disposition} radius={1.04} />}
      {isFrozen && <FrozenStatusEffect frozenUntil={npc.frozenUntil} radius={0.92} y={1.35} />}
      {isCold && <ColdStatusEffect slowedUntil={npc.slowedUntil} radius={0.92} y={1.35} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={4.05} />}
      {showLootSparkles && <LootSparkles y={1.35} />}
      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, 1.35, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        <primitive object={avatar} dispose={null} />
        {showNameplate && (
          <Billboard position={[0, 3.15, 0]}>
            <ActorNameplate
              title={npc.name}
              badge="AGENT"
              color={labelColor}
              badgeColor={badgeColor}
              health={npc.isImmortal ? undefined : npc.health}
              maxHealth={npc.isImmortal ? undefined : npc.maxHealth}
              fontSize={0.22}
              maxWidth={3.2}
            />
          </Billboard>
        )}
        {showChatBubble && chatBubble && (
          <Billboard position={[0, showQuestMarker ? 4.82 : 3.86, 0]}>
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

function createMferGptAvatar(sourceScene: THREE.Group) {
  const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;
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
  const scale = size.y > 0.01 ? 2.65 / size.y : 1;
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

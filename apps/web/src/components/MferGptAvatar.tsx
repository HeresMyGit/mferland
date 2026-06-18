import { useEffect, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  getNpcDisposition,
  type AnimationState,
  type MferAppearanceTraits,
  type NpcSnapshot,
  type QuestMarkerType,
} from "@mferland/shared";
import { type ChatBubble } from "../game/chatBubbles";
import { resolveMferTraitsForPlayer, traitsToMeshes } from "../game/mferTraits";
import { MFER_COLORS } from "../game/mferPalette";
import {
  ActorBlobShadow,
  ActorChatBubble,
  ActorNameplate,
  ColdStatusEffect,
  DispositionBaseMarker,
  FrozenStatusEffect,
  LootSparkles,
  MFER_AVATAR_WORLD_HEIGHT,
  MIXAMO_CLIPS,
  MIXAMO_URLS,
  QuestMarker,
  TargetRing,
  getMferAnimationClips,
  updateMferDeathPose,
} from "./MferAvatar";

type MferGptAvatarProps = {
  npc: NpcSnapshot;
  variant?: "npc" | "agent";
  appearanceTraits?: MferAppearanceTraits | null;
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
export const AGENT_MFER_GPT_MODEL_URL = "/models/mferGPT-agent.glb";
export const ENEMY_MFER_GPT_MODEL_URL = "/models/mferGPT-enemy.glb";
const MFER_MASHUP_MODEL_URL = "https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb";
const AGENT_ROBOT_BASE_MESHES = new Set(["body", "bot_light", "eyes_bot", "heres_my_signature", "mouth_bot", "type_plain003"]);
const AGENT_ROBOT_REMOVED_TRAIT_MESH_PATTERNS = [
  /^body/,
  /^type_/,
  /^mouth_/,
  /^eyes_(normal|metal|mfercoin|red|alien|zombie)$/,
  /^heres_my_signature$/,
];
const NAMEPLATE_RENDER_DISTANCE_SQ = 58 * 58;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 48 * 48;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 54 * 54;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 30 * 30;
const MFER_GPT_REFERENCE_WORLD_HEIGHT = 2.95;
const MFER_GPT_WORLD_HEIGHT = MFER_AVATAR_WORLD_HEIGHT;
const MFER_GPT_OVERLAY_SCALE = MFER_GPT_WORLD_HEIGHT / MFER_GPT_REFERENCE_WORLD_HEIGHT;
const MFER_GPT_HIT_RADIUS = 1.02 * MFER_GPT_OVERLAY_SCALE;
const MFER_GPT_HIT_HEIGHT = 3.25 * MFER_GPT_OVERLAY_SCALE;
const MFER_GPT_HIT_Y = 1.55 * MFER_GPT_OVERLAY_SCALE;
const MFER_GPT_TARGET_RING_RADIUS = 1.22 * MFER_GPT_OVERLAY_SCALE;
const MFER_GPT_BASE_MARKER_RADIUS = 1.12 * MFER_GPT_OVERLAY_SCALE;
const MFER_GPT_SHADOW_SCALE: [number, number, number] = [0.96 * MFER_GPT_OVERLAY_SCALE, 0.58 * MFER_GPT_OVERLAY_SCALE, 1.08 * MFER_GPT_OVERLAY_SCALE];
const MFER_GPT_DEFEATED_SHADOW_SCALE: [number, number, number] = [1.08 * MFER_GPT_OVERLAY_SCALE, 0.58 * MFER_GPT_OVERLAY_SCALE, 1.1 * MFER_GPT_OVERLAY_SCALE];
const MFER_GPT_NAMEPLATE_Y = 3.08;
const MFER_GPT_QUEST_MARKER_Y = 3.95;
const MFER_GPT_CHAT_BUBBLE_Y = 3.76;
const MFER_GPT_CHAT_BUBBLE_WITH_QUEST_Y = 4.72;
const MFER_GPT_LOW_LIGHT_FILL_COLOR = new THREE.Color("#9fa6a6");
const MFER_GPT_TYPE_LOW_LIGHT_STYLE = { emissiveColor: new THREE.Color("#ffffff"), emissiveIntensity: 0.18, useColorMap: true, maxRoughness: 0.52 };
const MFER_GPT_VISOR_LOW_LIGHT_STYLE = { emissiveColor: new THREE.Color("#ffffff"), emissiveIntensity: 0.2, useColorMap: true, maxRoughness: 0.5 };
const MFER_GPT_MOUTH_LOW_LIGHT_STYLE = { emissiveColor: new THREE.Color("#ffffff"), emissiveIntensity: 0.22, useColorMap: true, maxRoughness: 0.5 };
const targetPosition = new THREE.Vector3();
const hitGeometry = new THREE.CylinderGeometry(MFER_GPT_HIT_RADIUS, MFER_GPT_HIT_RADIUS, MFER_GPT_HIT_HEIGHT, 16);
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const friendlyLabelColor = "#f0e9ff";
const friendlyBadgeColor = "#9b7dff";
const hostileLabelColor = "#ffe4df";
const hostileBadgeColor = MFER_COLORS.hostile;
const antennaLightOffColor = new THREE.Color("#050000");
const friendlyAntennaLightColor = new THREE.Color("#8d0000");
const hostileAntennaLightColor = new THREE.Color("#a60000");
const antennaLightPeakIntensity = 3.2;
const antennaLightDefeatedIntensity = 0.18;
const antennaPointLightPeakIntensity = 5.5;
const antennaPointLightPulseThreshold = 0.08;
const antennaPointLightDistance = 4.2;
const antennaPointLightDecay = 2.2;
const antennaPointLightPosition: [number, number, number] = [0, 2.58, 0.04];

hitGeometry.computeBoundingBox();
hitGeometry.computeBoundingSphere();

export function getMferGptModelUrl(isHostile: boolean, variant: "npc" | "agent" = "npc") {
  if (variant === "agent") return AGENT_MFER_GPT_MODEL_URL;
  return isHostile ? ENEMY_MFER_GPT_MODEL_URL : MFER_GPT_MODEL_URL;
}

export function MferGptAvatar({
  variant = "npc",
  ...props
}: MferGptAvatarProps) {
  if (variant === "agent") return <AgentMferGptAvatar {...props} variant={variant} />;
  return <MferGptAvatarRig {...props} variant={variant} />;
}

function AgentMferGptAvatar(props: MferGptAvatarProps) {
  const traitGltf = useLoader(GLTFLoader, MFER_MASHUP_MODEL_URL) as LoadedMferGptGltf;
  return <MferGptAvatarRig {...props} agentTraitSourceScene={traitGltf.scene} />;
}

function MferGptAvatarRig({
  npc,
  variant = "npc",
  appearanceTraits = null,
  isTargeted = false,
  isDefeated = false,
  questMarker = null,
  hasLoot = false,
  chatBubble = null,
  viewerPosition = null,
  showNameplate: canShowNameplate = true,
  showNameplateHealthBar = true,
  onTarget,
  agentTraitSourceScene = null,
}: MferGptAvatarProps & { agentTraitSourceScene?: THREE.Group | null }) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const antennaPointLightRef = useRef<THREE.PointLight>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef<string | null>(null);
  const currentAnimationStateRef = useRef<AnimationState | null>(null);
  const deathAgeRef = useRef(0);
  const wasDefeatedRef = useRef(false);
  const disposition = getNpcDisposition(npc);
  const isHostile = disposition === "hostile";
  const gltf = useLoader(GLTFLoader, getMferGptModelUrl(isHostile, variant)) as LoadedMferGptGltf;
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const labelColor = isHostile ? hostileLabelColor : friendlyLabelColor;
  const badgeColor = isHostile ? hostileBadgeColor : friendlyBadgeColor;
  const antennaColor = isHostile ? hostileAntennaLightColor : friendlyAntennaLightColor;
  const avatar = useMemo(
    () => createMferGptAvatar(gltf.scene, isHostile, {
      agentTraitSourceScene,
      appearanceTraits,
      avatarSeed: npc.avatarSeed,
    }),
    [gltf.scene, isHostile, agentTraitSourceScene, appearanceTraits, npc.avatarSeed],
  );
  const antennaLightMaterials = useMemo(() => getMferGptAntennaLightMaterials(avatar), [avatar]);
  const clips = useMemo(() => getMferAnimationClips(fbxAnimations), [fbxAnimations]);
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = canShowNameplate && !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showChatBubble = !isDefeated && Boolean(chatBubble) && (isTargeted || distanceToViewerSq <= CHAT_BUBBLE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = variant !== "agent" && !isDefeated;
  const showSignalBeacon = variant !== "agent" && !isDefeated && !isHostile;
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
    const antennaPulse = Math.pow(Math.sin(clock.elapsedTime * 4.4) * 0.5 + 0.5, 1.8);
    const antennaMaterialIntensity = antennaPulse * antennaLightPeakIntensity;
    for (const material of antennaLightMaterials) {
      material.emissiveIntensity = isDefeated ? antennaLightDefeatedIntensity : antennaMaterialIntensity;
    }
    const antennaPointLight = antennaPointLightRef.current;
    if (antennaPointLight) {
      antennaPointLight.intensity = !isDefeated && antennaPulse > antennaPointLightPulseThreshold
        ? antennaPulse * antennaPointLightPeakIntensity
        : 0;
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
      {showSignalBeacon && (
        <MferGptSignalBeacon isHostile={isHostile} isTargeted={isTargeted} showMention={!showChatBubble && !showQuestMarker} />
      )}
      <ActorBlobShadow scale={isDefeated ? MFER_GPT_DEFEATED_SHADOW_SCALE : MFER_GPT_SHADOW_SCALE} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={MFER_GPT_BASE_MARKER_RADIUS} />}
      {isTargeted && <TargetRing color={badgeColor} disposition={disposition} radius={MFER_GPT_TARGET_RING_RADIUS} />}
      {isFrozen && <FrozenStatusEffect frozenUntil={npc.frozenUntil} radius={0.92} y={1.35} />}
      {isCold && <ColdStatusEffect slowedUntil={npc.slowedUntil} radius={0.92} y={1.35} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={MFER_GPT_QUEST_MARKER_Y} />}
      {showLootSparkles && <LootSparkles y={1.35} />}
      <mesh
        geometry={hitGeometry}
        material={hitMaterial}
        position={[0, MFER_GPT_HIT_Y, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        <pointLight
          ref={antennaPointLightRef}
          color={antennaColor}
          position={antennaPointLightPosition}
          intensity={0}
          distance={antennaPointLightDistance}
          decay={antennaPointLightDecay}
        />
        <primitive object={avatar} dispose={null} />
        {showNameplate && (
          <Billboard position={[0, MFER_GPT_NAMEPLATE_Y, 0]}>
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
          <Billboard position={[0, showQuestMarker ? MFER_GPT_CHAT_BUBBLE_WITH_QUEST_Y : MFER_GPT_CHAT_BUBBLE_Y, 0]}>
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

export function createMferGptAvatar(
  sourceScene: THREE.Group,
  isHostile: boolean,
  options: {
    agentTraitSourceScene?: THREE.Group | null;
    appearanceTraits?: MferAppearanceTraits | null;
    avatarSeed?: number;
  } = {},
) {
  const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;
  const antennaColor = isHostile ? hostileAntennaLightColor : friendlyAntennaLightColor;
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.visible = !options.agentTraitSourceScene || AGENT_ROBOT_BASE_MESHES.has(child.name);
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map((material) => {
      const nextMaterial = material.clone();
      if (isMferGptAntennaLight(child.name, nextMaterial.name)) {
        configureMferGptAntennaLightMaterial(nextMaterial, antennaColor);
      } else {
        const lowLightStyle = getMferGptLowLightStyle(child.name, nextMaterial.name);
        if (lowLightStyle) configureMferGptLowLightMaterial(nextMaterial, lowLightStyle);
      }
      return nextMaterial;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0.01 ? MFER_GPT_WORLD_HEIGHT / size.y : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  if (options.agentTraitSourceScene) {
    graftAgentTraitMeshes(scene, options.agentTraitSourceScene, options.avatarSeed ?? 0, options.appearanceTraits ?? null);
  }
  return scene;
}

function graftAgentTraitMeshes(
  robotScene: THREE.Group,
  traitSourceScene: THREE.Group,
  avatarSeed: number,
  appearanceTraits: MferAppearanceTraits | null,
) {
  const targetSkeleton: THREE.Skeleton | null = findFirstSkeleton(robotScene);
  if (!targetSkeleton) return;

  const targetBoneByName = new Map<string, THREE.Bone>(
    targetSkeleton.bones.map((bone: THREE.Bone) => [
      bone.name,
      bone,
    ]),
  );
  const fallbackBone = targetBoneByName.get("mixamorigHips");
  const traitMeshes = getAgentRobotTraitMeshes(avatarSeed, appearanceTraits);
  const sourceScene = SkeletonUtils.clone(traitSourceScene) as THREE.Group;
  const graftGroup = new THREE.Group();
  graftGroup.name = "agent_robot_traits";

  sourceScene.traverse((child) => {
    if (!(child instanceof THREE.SkinnedMesh)) return;
    if (!traitMeshes.has(child.name)) return;

    const mappedBones: THREE.Bone[] = [];
    const mappedInverses: THREE.Matrix4[] = [];
    let missingBone = false;
    child.skeleton.bones.forEach((sourceBone, sourceBoneIndex) => {
      const target = targetBoneByName.get(sourceBone.name) ?? (sourceBone.name === "neutral_bone" ? fallbackBone : undefined);
      if (!target) {
        missingBone = true;
        return;
      }
      mappedBones.push(target);
      mappedInverses.push((child.skeleton.boneInverses[sourceBoneIndex] ?? new THREE.Matrix4()).clone());
    });
    if (missingBone || mappedBones.length !== child.skeleton.bones.length) return;

    const material = cloneMaterial(child.material);
    const mesh = child.clone(false) as THREE.SkinnedMesh;
    mesh.geometry = child.geometry;
    mesh.material = material;
    mesh.name = `agent_trait_${child.name}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.bind(new THREE.Skeleton(mappedBones, mappedInverses), child.bindMatrix.clone());
    graftGroup.add(mesh);
  });

  if (graftGroup.children.length > 0) robotScene.add(graftGroup);
}

function findFirstSkeleton(scene: THREE.Group): THREE.Skeleton | null {
  let skeleton: THREE.Skeleton | null = null;
  scene.traverse((child) => {
    if (skeleton || !(child instanceof THREE.SkinnedMesh)) return;
    skeleton = child.skeleton;
  });
  return skeleton;
}

function getAgentRobotTraitMeshes(avatarSeed: number, appearanceTraits: MferAppearanceTraits | null) {
  const visibleMeshes = traitsToMeshes(resolveMferTraitsForPlayer(avatarSeed, appearanceTraits));
  for (const meshName of [...visibleMeshes]) {
    if (AGENT_ROBOT_REMOVED_TRAIT_MESH_PATTERNS.some((pattern) => pattern.test(meshName))) {
      visibleMeshes.delete(meshName);
    }
  }
  return visibleMeshes;
}

function cloneMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) return material.map((entry) => entry.clone());
  return material.clone();
}

type MferGptLowLightStyle = {
  emissiveMix?: number;
  emissiveColor?: THREE.Color;
  emissiveIntensity: number;
  maxRoughness?: number;
  useColorMap?: boolean;
};

function configureMferGptLowLightMaterial(material: THREE.Material, style: MferGptLowLightStyle) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  if (style.emissiveColor) material.emissive.copy(style.emissiveColor);
  else material.emissive.lerp(MFER_GPT_LOW_LIGHT_FILL_COLOR, style.emissiveMix ?? 0);
  material.emissiveIntensity = style.emissiveIntensity;
  if (style.useColorMap && material.map) material.emissiveMap = material.map;
  if (style.maxRoughness !== undefined) material.roughness = Math.min(material.roughness, style.maxRoughness);
  material.needsUpdate = true;
}

function getMferGptLowLightStyle(meshName: string, materialName: string): MferGptLowLightStyle | null {
  const key = `${meshName} ${materialName}`.toLowerCase().replace(/[^a-z0-9_]+/g, "");
  if (key.includes("type_plain") || key.includes("type_bot")) return MFER_GPT_TYPE_LOW_LIGHT_STYLE;
  if (key.includes("eyes_bot") || key.includes("layer_8")) return MFER_GPT_VISOR_LOW_LIGHT_STYLE;
  if (key.includes("mouth_bot") || key.includes("layer_9")) return MFER_GPT_MOUTH_LOW_LIGHT_STYLE;
  return null;
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
  material.color.copy(antennaLightOffColor);
  material.emissive.copy(color);
  material.emissiveIntensity = 0;
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

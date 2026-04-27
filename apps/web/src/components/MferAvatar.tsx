import { useEffect, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import {
  getNpcDisposition,
  type AnimationState,
  type NpcDisposition,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@mferland/shared";
import { generateRandomMferTraits, traitsToMeshes } from "../game/mferTraits";
import { colorFromSeed } from "../game/random";

type MferAvatarProps = {
  player: PlayerSnapshot | NpcSnapshot;
  isLocal?: boolean;
  isNpc?: boolean;
  isTargeted?: boolean;
  isDefeated?: boolean;
  onTarget?: () => void;
};

type LoadedMferGltf = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

const MODEL_URL = "https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb";
const DEATH_ANIMATION_SECONDS = 0.82;
const MIXAMO_CLIPS: Record<AnimationState, { file: string; loop: THREE.AnimationActionLoopStyles; timeScale: number }> = {
  idle: { file: "Standing_Idle", loop: THREE.LoopRepeat, timeScale: 1 },
  walk: { file: "Walking_Forward_InPlace", loop: THREE.LoopRepeat, timeScale: 1 },
  run: { file: "Slow_Run_Forward_InPlace", loop: THREE.LoopRepeat, timeScale: 1.08 },
  jump: { file: "Forward_Running_Jump", loop: THREE.LoopOnce, timeScale: 1 },
};
export const TARGET_RING_COLORS: Record<NpcDisposition, string> = {
  friendly: "#46ff7b",
  neutral: "#ffd84f",
  hostile: "#ff453f",
};
export const TARGET_LABEL_COLORS: Record<NpcDisposition, string> = {
  friendly: "#8eff75",
  neutral: "#ffd84f",
  hostile: "#ff6258",
};
const MIXAMO_URLS = Object.values(MIXAMO_CLIPS).map((clip) => `/animations/${clip.file}.fbx`);
const targetPosition = new THREE.Vector3();

export function MferAvatar({ player, isLocal = false, isNpc = false, isTargeted = false, isDefeated = false, onTarget }: MferAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef<string | null>(null);
  const deathAgeRef = useRef(0);
  const wasDefeatedRef = useRef(false);
  const gltf = useLoader(GLTFLoader, MODEL_URL) as LoadedMferGltf;
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const accent = useMemo(() => colorFromSeed(player.avatarSeed), [player.avatarSeed]);
  const npc = isNpc && "role" in player ? player : null;
  const disposition = npc ? getNpcDisposition(npc) : "friendly";
  const isAgentPlayer = "identityType" in player && player.identityType === "agent";
  const label = npc ? getNpcLabel(npc, disposition) : isAgentPlayer ? `${player.name} [AI]` : player.name;
  const targetRingColor = TARGET_RING_COLORS[disposition];
  const labelColor = npc ? TARGET_LABEL_COLORS[disposition] : isLocal ? "#f3d04e" : accent;

  const clips = useMemo(() => {
    const entries = Object.entries(MIXAMO_CLIPS) as Array<[AnimationState, typeof MIXAMO_CLIPS[AnimationState]]>;
    return entries.reduce((map, [state, config], index) => {
      const sourceClip = fbxAnimations[index]?.animations?.[0];
      if (!sourceClip) return map;

      const clip = makeInPlaceClip(sourceClip);
      clip.name = config.file;
      map.set(state, clip);
      return map;
    }, new Map<AnimationState, THREE.AnimationClip>());
  }, [fbxAnimations]);

  const avatar = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    const visibleMeshes = traitsToMeshes(generateRandomMferTraits(player.avatarSeed));

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.visible = visibleMeshes.has(child.name);
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
    });

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.visible) {
        box.union(new THREE.Box3().setFromObject(child));
      }
    });

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0.01 ? 2.55 / size.y : 1;
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    return scene;
  }, [gltf.scene, player.avatarSeed]);

  useEffect(() => {
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    currentActionRef.current = null;
    currentClipNameRef.current = null;

    const mixer = new THREE.AnimationMixer(avatar);
    mixerRef.current = mixer;
    playClip("idle", { fadeDuration: 0, forceRestart: true });

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      currentActionRef.current = null;
      currentClipNameRef.current = null;
    };
  }, [avatar, clips]);

  useEffect(() => {
    if (isDefeated) return;
    playClip(player.animation);
  }, [isDefeated, player.animation, clips]);

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
      updateDeathPose(poseRef.current, deathAgeRef.current);
    } else {
      playClip(player.animation);
      mixerRef.current?.update(delta);
    }

    targetPosition.set(player.x, player.y, player.z);
    const positionLerp = isLocal ? 0.68 : 0.18;
    const rotationDecay = isLocal ? 0.62 : 0.82;
    group.position.lerp(targetPosition, 1 - Math.pow(1 - positionLerp, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, player.yaw, 1 - Math.pow(rotationDecay, delta * 60));

    const pose = poseRef.current;
    if (!isDefeated && pose) {
      pose.rotation.z += (0 - pose.rotation.z) * (1 - Math.pow(0.72, delta * 60));
      pose.rotation.x += (0 - pose.rotation.x) * (1 - Math.pow(0.68, delta * 60));
      pose.position.y += (0 - pose.position.y) * (1 - Math.pow(0.72, delta * 60));
    }
  });

  return (
    <group ref={groupRef} position={[player.x, player.y, player.z]} rotation-y={player.yaw} onPointerDown={handleTarget}>
      {isTargeted && <TargetRing color={targetRingColor} />}
      <mesh position={[0, 1.35, 0]} onPointerDown={handleTarget}>
        <cylinderGeometry args={[0.72, 0.72, 2.7, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={poseRef}>
        <primitive object={avatar} />
        {!isDefeated && (
          <Billboard position={[0, 3.05, 0]}>
            <Text
              fontSize={0.24}
              anchorX="center"
              anchorY="middle"
              color={labelColor}
              outlineColor="#16140f"
              outlineWidth={0.025}
              maxWidth={2.4}
            >
              {label}
            </Text>
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
    mixer.update(0);
  }
}

function updateDeathPose(pose: THREE.Group | null, deathAge: number) {
  if (!pose) return;

  const progress = easeOutCubic(clamp(deathAge / DEATH_ANIMATION_SECONDS, 0, 1));
  const collapse = easeOutCubic(clamp((deathAge - 0.16) / (DEATH_ANIMATION_SECONDS - 0.16), 0, 1));
  const flinch = Math.sin(progress * Math.PI) * 0.18;

  pose.rotation.x = -collapse * (Math.PI / 2 - 0.08);
  pose.rotation.y = 0;
  pose.rotation.z = -collapse * 0.1 - flinch;
  pose.position.y = collapse * 0.06 + Math.sin(progress * Math.PI) * 0.08;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function TargetRing({ color }: { color: string }) {
  const ringRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.6) * 0.025;
    ring.scale.set(pulse, pulse, pulse);
  });

  return (
    <group ref={ringRef} position={[0, 0.11, 0]}>
      <mesh rotation-x={Math.PI / 2} renderOrder={44}>
        <torusGeometry args={[0.94, 0.045, 8, 96]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.012, 0]} renderOrder={43}>
        <ringGeometry args={[0.7, 1.12, 96]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          opacity={0.2}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, -0.02, 0]} renderOrder={42}>
        <torusGeometry args={[1.08, 0.018, 6, 96]} />
        <meshBasicMaterial color="#1c120b" depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function getNpcLabel(npc: NpcSnapshot, disposition: NpcDisposition) {
  if (disposition === "hostile") return `${npc.name} [Hostile]`;
  if (disposition === "neutral") return `${npc.name} [Attackable]`;
  return `${npc.name} [NPC]`;
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function makeInPlaceClip(sourceClip: THREE.AnimationClip) {
  const clip = sourceClip.clone();
  for (const track of clip.tracks) {
    if (!/mixamorigHips\.position/i.test(track.name)) continue;
    if (!track.values || track.values.length < 3) continue;

    const baseX = track.values[0];
    const baseZ = track.values[2];
    for (let index = 0; index < track.values.length; index += 3) {
      track.values[index] = baseX;
      track.values[index + 2] = baseZ;
    }
  }
  ensureClipStartsAtZero(clip);
  return clip;
}

function ensureClipStartsAtZero(clip: THREE.AnimationClip) {
  const epsilon = 0.0001;
  for (const track of clip.tracks) {
    if (!track.times?.length || !track.values?.length) continue;
    if (track.times[0] <= epsilon) continue;

    const valueSize = track.values.length / track.times.length;
    if (!Number.isFinite(valueSize) || valueSize <= 0) continue;

    const TimesCtor = track.times.constructor as new (length: number) => typeof track.times;
    const ValuesCtor = track.values.constructor as new (length: number) => typeof track.values;

    const newTimes = new TimesCtor(track.times.length + 1);
    newTimes[0] = 0;
    newTimes.set(track.times, 1);

    const newValues = new ValuesCtor(track.values.length + valueSize);
    for (let index = 0; index < valueSize; index += 1) {
      newValues[index] = track.values[index];
    }
    newValues.set(track.values, valueSize);

    track.times = newTimes;
    track.values = newValues;
  }

  clip.resetDuration();
}

import { useEffect, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { type AnimationState, type PlayerSnapshot } from "@mferland/shared";
import { generateRandomMferTraits, traitsToMeshes } from "../game/mferTraits";
import { colorFromSeed } from "../game/random";

type MferAvatarProps = {
  player: PlayerSnapshot;
  isLocal?: boolean;
};

type LoadedMferGltf = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

const MODEL_URL = "https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb";
const MIXAMO_CLIPS: Record<AnimationState, { file: string; loop: THREE.AnimationActionLoopStyles; timeScale: number }> = {
  idle: { file: "Standing_Idle", loop: THREE.LoopRepeat, timeScale: 1 },
  walk: { file: "Walking_Forward_InPlace", loop: THREE.LoopRepeat, timeScale: 1 },
  run: { file: "Slow_Run_Forward_InPlace", loop: THREE.LoopRepeat, timeScale: 1.08 },
  jump: { file: "Forward_Running_Jump", loop: THREE.LoopOnce, timeScale: 1 },
};
const MIXAMO_URLS = Object.values(MIXAMO_CLIPS).map((clip) => `/animations/${clip.file}.fbx`);
const targetPosition = new THREE.Vector3();

export function MferAvatar({ player, isLocal = false }: MferAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const currentClipNameRef = useRef<string | null>(null);
  const gltf = useLoader(GLTFLoader, MODEL_URL) as LoadedMferGltf;
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const accent = useMemo(() => colorFromSeed(player.avatarSeed), [player.avatarSeed]);

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
    playClip(player.animation);
  }, [player.animation, clips]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    mixerRef.current?.update(delta);
    targetPosition.set(player.x, player.y, player.z);
    const positionLerp = isLocal ? 0.42 : 0.18;
    group.position.lerp(targetPosition, 1 - Math.pow(1 - positionLerp, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, player.yaw, 1 - Math.pow(0.82, delta * 60));
  });

  return (
    <group ref={groupRef} position={[player.x, player.y, player.z]} rotation-y={player.yaw}>
      <primitive object={avatar} />
      <Billboard position={[0, 3.05, 0]}>
        <Text
          fontSize={0.24}
          anchorX="center"
          anchorY="middle"
          color={isLocal ? "#f3d04e" : accent}
          outlineColor="#16140f"
          outlineWidth={0.025}
          maxWidth={2.4}
        >
          {player.name}
        </Text>
      </Billboard>
    </group>
  );

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

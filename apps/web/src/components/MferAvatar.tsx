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
  type QuestMarkerType,
} from "@mferland/shared";
import { generateRandomMferTraits, traitsToMeshes } from "../game/mferTraits";
import { colorFromSeed } from "../game/random";

type MferAvatarProps = {
  player: PlayerSnapshot | NpcSnapshot;
  isLocal?: boolean;
  isNpc?: boolean;
  isTargeted?: boolean;
  isDefeated?: boolean;
  questMarker?: QuestMarkerType | null;
  hasLoot?: boolean;
  viewerPosition?: { x: number; z: number } | null;
  onTarget?: () => void;
};
type ShadowScale = [number, number, number];

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
const TARGET_BADGE_COLORS: Record<NpcDisposition | "player" | "local" | "agent", string> = {
  friendly: "#7dfc8f",
  neutral: "#ffd84f",
  hostile: "#ff5a4f",
  player: "#6ec8ff",
  local: "#f3d04e",
  agent: "#b38cff",
};
const MIXAMO_URLS = Object.values(MIXAMO_CLIPS).map((clip) => `/animations/${clip.file}.fbx`);
const targetPosition = new THREE.Vector3();
const animationClipCache = new WeakMap<THREE.AnimationClip, Map<AnimationState, THREE.AnimationClip>>();
const avatarTemplateCache = new WeakMap<THREE.Group, Map<number, THREE.Group>>();
const avatarHitGeometry = new THREE.CylinderGeometry(0.72, 0.72, 2.7, 12);
const invisibleHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const actorShadowGeometry = new THREE.CircleGeometry(1, 32);
const actorShadowMaterial = new THREE.MeshBasicMaterial({
  color: "#171109",
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
});
const NAMEPLATE_RENDER_DISTANCE_SQ = 34 * 34;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 46 * 46;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 30 * 30;

export function MferAvatar({
  player,
  isLocal = false,
  isNpc = false,
  isTargeted = false,
  isDefeated = false,
  questMarker = null,
  hasLoot = false,
  viewerPosition = null,
  onTarget,
}: MferAvatarProps) {
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
  const nameplate = npc
    ? getNpcNameplate(npc, disposition)
    : getPlayerNameplate(player.name, isLocal, isAgentPlayer);
  const targetRingColor = TARGET_RING_COLORS[disposition];
  const labelColor = npc ? TARGET_LABEL_COLORS[disposition] : isLocal ? "#f3d04e" : accent;
  const badgeColor = npc
    ? TARGET_BADGE_COLORS[disposition]
    : isLocal ? TARGET_BADGE_COLORS.local : isAgentPlayer ? TARGET_BADGE_COLORS.agent : TARGET_BADGE_COLORS.player;
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, player.x, player.z) : 0;
  const showNameplate = !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = npc && !isDefeated && (Boolean(questMarker) || isTargeted);

  const clips = useMemo(() => getMferAnimationClips(fbxAnimations), [fbxAnimations]);

  const avatar = useMemo(() => {
    const template = getMferAvatarTemplate(gltf.scene, player.avatarSeed);
    return SkeletonUtils.clone(template) as THREE.Group;
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
      <ActorBlobShadow scale={isDefeated ? [0.95, 0.5, 1] : [0.76, 0.46, 1]} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={0.86} />}
      {isTargeted && <TargetRing color={targetRingColor} disposition={disposition} radius={0.96} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={3.95} />}
      {showLootSparkles && <LootSparkles y={1.35} />}
      <mesh
        geometry={avatarHitGeometry}
        material={invisibleHitMaterial}
        position={[0, 1.35, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        <primitive object={avatar} />
        {showNameplate && (
          <Billboard position={[0, isLocal ? 3.22 : 3.08, 0]}>
            <ActorNameplate
              title={nameplate.title}
              badge={nameplate.badge}
              color={labelColor}
              badgeColor={badgeColor}
              fontSize={0.22}
              maxWidth={3.2}
            />
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

export function ActorBlobShadow({ scale = [0.72, 0.44, 1] }: { scale?: ShadowScale }) {
  return (
    <mesh
      geometry={actorShadowGeometry}
      material={actorShadowMaterial}
      position={[0, 0.026, 0]}
      rotation-x={-Math.PI / 2}
      scale={scale}
      renderOrder={6}
      dispose={null}
    />
  );
}

export function TargetRing({
  color,
  disposition = "friendly",
  radius = 0.94,
}: {
  color: string;
  disposition?: NpcDisposition;
  radius?: number;
}) {
  const tickCount = disposition === "hostile" ? 6 : 4;

  return (
    <group position={[0, 0.11, 0]}>
      <mesh rotation-x={Math.PI / 2} renderOrder={44}>
        <torusGeometry args={[radius, 0.04, 8, 80]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.012, 0]} renderOrder={43}>
        <ringGeometry args={[radius * 0.74, radius * 1.14, 80]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          opacity={disposition === "hostile" ? 0.24 : 0.16}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, -0.02, 0]} renderOrder={42}>
        <torusGeometry args={[radius * 1.14, 0.016, 6, 80]} />
        <meshBasicMaterial color="#1c120b" depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: tickCount }, (_, index) => {
        const angle = (index / tickCount) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[Math.sin(angle) * radius * 1.18, 0.018, Math.cos(angle) * radius * 1.18]}
            rotation-y={angle}
            renderOrder={45}
          >
            <boxGeometry args={[disposition === "hostile" ? 0.26 : 0.2, 0.035, 0.075]} />
            <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

export function DispositionBaseMarker({
  disposition,
  questMarker,
  radius = 0.78,
}: {
  disposition: NpcDisposition;
  questMarker?: QuestMarkerType | null;
  radius?: number;
}) {
  const color = questMarker ? (questMarker === "turnIn" ? "#7dff8c" : "#ffd84f") : TARGET_RING_COLORS[disposition];

  return (
    <group position={[0, 0.045, 0]}>
      <mesh rotation-x={-Math.PI / 2} renderOrder={18}>
        <ringGeometry args={[radius, radius + 0.07, 36]} />
        <meshBasicMaterial color={color} depthWrite={false} opacity={0.48} side={THREE.DoubleSide} transparent />
      </mesh>
      {disposition === "hostile" && (
        <mesh position={[0, 0.018, radius + 0.1]} renderOrder={19}>
          <boxGeometry args={[0.34, 0.04, 0.08]} />
          <meshBasicMaterial color={color} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function QuestMarker({ type, y }: { type: QuestMarkerType; y: number }) {
  const markerRef = useRef<THREE.Group>(null);
  const color = "#ffd23f";
  const highlight = "#fff1a6";
  const shadow = "#241407";
  const label = type === "turnIn" ? "?" : "!";

  useFrame(({ clock }) => {
    const marker = markerRef.current;
    if (!marker) return;

    const bob = Math.sin(clock.elapsedTime * 3.2) * 0.055;
    marker.position.y = bob;
    marker.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.8) * 0.025);
  });

  return (
    <Billboard position={[0, y, 0]}>
      <group ref={markerRef}>
        <Text
          position={[0.035, -0.04, -0.035]}
          fontSize={0.96}
          anchorX="center"
          anchorY="middle"
          color={shadow}
          outlineColor={shadow}
          outlineWidth={0.13}
          renderOrder={70}
        >
          {label}
        </Text>
        <Text
          fontSize={0.92}
          anchorX="center"
          anchorY="middle"
          color={color}
          outlineColor="#3b2205"
          outlineWidth={0.095}
          renderOrder={71}
        >
          {label}
        </Text>
        <Text
          position={[-0.04, 0.06, 0.015]}
          fontSize={0.62}
          anchorX="center"
          anchorY="middle"
          color={highlight}
          renderOrder={72}
        >
          {label}
        </Text>
      </group>
    </Billboard>
  );
}

export function ActorNameplate({
  title,
  badge,
  color,
  badgeColor,
  fontSize = 0.22,
  maxWidth = 2.55,
}: {
  title: string;
  badge?: string;
  color: string;
  badgeColor: string;
  fontSize?: number;
  maxWidth?: number;
}) {
  const normalizedTitle = title.trim() || "mfer";
  const width = Math.min(maxWidth, Math.max(1.0, normalizedTitle.length * fontSize * 0.58 + (badge ? badge.length * 0.065 : 0) + 0.54));
  const height = badge ? 0.4 : 0.3;

  return (
    <group>
      <mesh position={[0, 0, -0.035]} renderOrder={50}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#16120d" depthTest={false} depthWrite={false} opacity={0.48} transparent />
      </mesh>
      <mesh position={[0, -height / 2 + 0.026, -0.028]} renderOrder={51}>
        <planeGeometry args={[width * 0.82, 0.04]} />
        <meshBasicMaterial color={badgeColor} depthTest={false} depthWrite={false} opacity={0.72} transparent toneMapped={false} />
      </mesh>
      <Text
        position={[0, badge ? 0.085 : 0.02, 0]}
        renderOrder={54}
        fontSize={fontSize}
        anchorX="center"
        anchorY="middle"
        color={color}
        outlineColor="#0b0907"
        outlineWidth={0.026}
      >
        {normalizedTitle}
      </Text>
      {badge && (
        <Text
          position={[0, -0.13, 0]}
          renderOrder={55}
          fontSize={fontSize * 0.52}
          anchorX="center"
          anchorY="middle"
          color={badgeColor}
          outlineColor="#0b0907"
          outlineWidth={0.018}
          letterSpacing={0.04}
        >
          {badge}
        </Text>
      )}
    </group>
  );
}

export function LootSparkles({ y }: { y: number }) {
  const points = useMemo(() => [
    [-0.42, 0.06, -0.18],
    [0.2, 0.24, -0.36],
    [0.44, 0.12, 0.2],
    [-0.18, 0.34, 0.36],
    [0.04, 0.5, 0.02],
  ] as const, []);

  return (
    <group position={[0, y, 0]} rotation-y={0.45}>
      {points.map(([x, py, z], index) => (
        <mesh key={index} position={[x, py, z]}>
          <sphereGeometry args={[index === 4 ? 0.065 : 0.045, 8, 6]} />
          <meshBasicMaterial color={index === 4 ? "#fff3a3" : "#ffd84f"} transparent opacity={0.86} />
        </mesh>
      ))}
    </group>
  );
}

function getPlayerNameplate(name: string, isLocal: boolean, isAgentPlayer: boolean) {
  return {
    title: name,
    badge: isLocal ? undefined : isAgentPlayer ? "AI" : "PLAYER",
  };
}

function getNpcNameplate(npc: NpcSnapshot, disposition: NpcDisposition) {
  if (disposition === "hostile") return { title: npc.name, badge: "HOSTILE" };
  if (disposition === "neutral") return { title: npc.name, badge: "ATTACKABLE" };
  return { title: npc.name, badge: "NPC" };
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

function getMferAnimationClips(fbxAnimations: THREE.Group[]) {
  const cacheKey = fbxAnimations[0]?.animations?.[0];
  if (cacheKey) {
    const cached = animationClipCache.get(cacheKey);
    if (cached) return cached;
  }

  const clips = new Map<AnimationState, THREE.AnimationClip>();
  const entries = Object.entries(MIXAMO_CLIPS) as Array<[AnimationState, typeof MIXAMO_CLIPS[AnimationState]]>;
  for (let index = 0; index < entries.length; index += 1) {
    const [state, config] = entries[index];
    const sourceClip = fbxAnimations[index]?.animations?.[0];
    if (!sourceClip) continue;

    const clip = makeInPlaceClip(sourceClip);
    clip.name = config.file;
    clips.set(state, clip);
  }

  if (cacheKey) animationClipCache.set(cacheKey, clips);
  return clips;
}

function getMferAvatarTemplate(sourceScene: THREE.Group, seed: number) {
  let seedCache = avatarTemplateCache.get(sourceScene);
  if (!seedCache) {
    seedCache = new Map();
    avatarTemplateCache.set(sourceScene, seedCache);
  }

  const cached = seedCache.get(seed);
  if (cached) return cached;

  const template = createMferAvatarTemplate(sourceScene, seed);
  seedCache.set(seed, template);
  return template;
}

function createMferAvatarTemplate(sourceScene: THREE.Group, seed: number) {
  const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;
  const visibleMeshes = traitsToMeshes(generateRandomMferTraits(seed));

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.visible = visibleMeshes.has(child.name);
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible) {
      box.union(meshBox.setFromObject(child));
    }
  });

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0.01 ? 2.55 / size.y : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  return scene;
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

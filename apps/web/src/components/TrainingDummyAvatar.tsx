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
  showNameplate?: boolean;
  showNameplateHealthBar?: boolean;
  onTarget?: () => void;
};

type LoadedTrainingDummyGltf = {
  scene: THREE.Group;
};

type TrainingDummyTextureKind =
  | "darkWood"
  | "weatheredWood"
  | "straw"
  | "strawShadow"
  | "cloth"
  | "rope"
  | "ink"
  | "highlight"
  | "redPaint"
  | "yellowPaint";

type TrainingDummyMaterialStyle = {
  color: THREE.ColorRepresentation;
  texture: TrainingDummyTextureKind;
  roughness?: number;
  metalness?: number;
};

type TexturedTrainingDummyMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  metalness?: number;
  roughness?: number;
};

const MODEL_URL = "/models/training-dummy.glb";
const NAMEPLATE_RENDER_DISTANCE_SQ = 32 * 32;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 38 * 38;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 42 * 42;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 28 * 28;
const targetPosition = new THREE.Vector3();
const dummyHitGeometry = new THREE.CylinderGeometry(0.78, 0.78, 2.35, 12);
const dummyHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const trainingDummyTextureCache = new Map<TrainingDummyTextureKind, THREE.Texture>();

const TRAINING_DUMMY_MATERIAL_STYLES: Record<string, TrainingDummyMaterialStyle> = {
  training_dummy_dark_wood: { color: "#4a2c16", texture: "darkWood" },
  training_dummy_weathered_wood: { color: "#8a623d", texture: "weatheredWood" },
  training_dummy_straw: { color: "#d6b55b", texture: "straw" },
  training_dummy_straw_shadow: { color: "#9b7135", texture: "strawShadow" },
  training_dummy_faded_red_cloth: { color: "#a64b3c", texture: "cloth" },
  training_dummy_rope: { color: "#b78645", texture: "rope" },
  training_dummy_face_ink: { color: "#221915", texture: "ink" },
  training_dummy_eye_highlight: { color: "#fff2d1", texture: "highlight" },
  training_dummy_target_paint: { color: "#d94b32", texture: "redPaint" },
  training_dummy_target_yellow: { color: "#f1c95a", texture: "yellowPaint" },
};

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
  showNameplate: canShowNameplate = true,
  showNameplateHealthBar = true,
  onTarget,
}: TrainingDummyAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, MODEL_URL) as LoadedTrainingDummyGltf;
  const model = useMemo(() => createTrainingDummyModel(gltf.scene), [gltf.scene]);
  const disposition = getNpcDisposition(npc);
  const ringColor = TARGET_RING_COLORS[disposition];
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = canShowNameplate && !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
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
              showHealthBar={showNameplateHealthBar}
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

export function createTrainingDummyModel(sourceScene: THREE.Group) {
  const scene = sourceScene.clone(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
    child.material = Array.isArray(child.material)
      ? child.material.map(configureTrainingDummyMaterial)
      : configureTrainingDummyMaterial(child.material);
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

function configureTrainingDummyMaterial(material: THREE.Material) {
  const style = TRAINING_DUMMY_MATERIAL_STYLES[material.name];
  if (!style || materialHasTextureMap(material)) return material;

  const next = material.clone() as TexturedTrainingDummyMaterial;
  const texture = getTrainingDummyFallbackTexture(style);
  if (texture && "map" in next) {
    next.map = texture;
    next.color?.set("#ffffff");
  } else {
    next.color?.set(style.color);
  }
  if ("roughness" in next) next.roughness = style.roughness ?? 0.86;
  if ("metalness" in next) next.metalness = style.metalness ?? 0;
  next.needsUpdate = true;
  return next;
}

function materialHasTextureMap(material: THREE.Material) {
  return "map" in material && Boolean((material as TexturedTrainingDummyMaterial).map);
}

function getTrainingDummyFallbackTexture(style: TrainingDummyMaterialStyle) {
  if (typeof document === "undefined") return null;

  const cached = trainingDummyTextureCache.get(style.texture);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;

  drawTrainingDummyTexture(context, style);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  trainingDummyTextureCache.set(style.texture, texture);
  return texture;
}

function drawTrainingDummyTexture(context: CanvasRenderingContext2D, style: TrainingDummyMaterialStyle) {
  const base = new THREE.Color(style.color);
  const baseColor = base.getStyle();
  const lightColor = base.clone().lerp(new THREE.Color("#fff1bd"), 0.28).getStyle();
  const darkColor = base.clone().lerp(new THREE.Color("#1c120c"), 0.36).getStyle();

  context.fillStyle = baseColor;
  context.fillRect(0, 0, 64, 64);

  if (style.texture === "darkWood" || style.texture === "weatheredWood") {
    drawWoodTexture(context, lightColor, darkColor);
    return;
  }

  if (style.texture === "straw" || style.texture === "strawShadow") {
    drawStrawTexture(context, lightColor, darkColor);
    return;
  }

  if (style.texture === "rope") {
    drawRopeTexture(context, lightColor, darkColor);
    return;
  }

  if (style.texture === "cloth") {
    drawClothTexture(context, lightColor, darkColor);
    return;
  }

  if (style.texture === "redPaint" || style.texture === "yellowPaint") {
    drawScuffedPaintTexture(context, lightColor, darkColor);
  }
}

function drawWoodTexture(context: CanvasRenderingContext2D, lightColor: string, darkColor: string) {
  for (let y = 5; y < 64; y += 11) {
    context.strokeStyle = y % 22 === 0 ? lightColor : darkColor;
    context.globalAlpha = 0.45;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(18, y - 4, 34, y + 4, 64, y - 2);
    context.stroke();
  }
  context.globalAlpha = 0.22;
  context.strokeStyle = darkColor;
  context.strokeRect(9, 18, 22, 8);
  context.strokeRect(36, 41, 18, 7);
  context.globalAlpha = 1;
}

function drawStrawTexture(context: CanvasRenderingContext2D, lightColor: string, darkColor: string) {
  for (let x = -64; x < 64; x += 8) {
    context.strokeStyle = x % 16 === 0 ? lightColor : darkColor;
    context.globalAlpha = 0.42;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 64);
    context.lineTo(x + 64, 0);
    context.stroke();
  }
  context.globalAlpha = 0.25;
  context.strokeStyle = lightColor;
  for (let y = 6; y < 64; y += 13) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(64, y + 4);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawRopeTexture(context: CanvasRenderingContext2D, lightColor: string, darkColor: string) {
  for (let x = -48; x < 72; x += 12) {
    context.strokeStyle = lightColor;
    context.globalAlpha = 0.36;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(x, 64);
    context.lineTo(x + 54, 0);
    context.stroke();

    context.strokeStyle = darkColor;
    context.globalAlpha = 0.32;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 5, 64);
    context.lineTo(x + 59, 0);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawClothTexture(context: CanvasRenderingContext2D, lightColor: string, darkColor: string) {
  context.globalAlpha = 0.28;
  for (let x = 4; x < 64; x += 9) {
    context.strokeStyle = x % 18 === 0 ? lightColor : darkColor;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 64);
    context.stroke();
  }
  for (let y = 6; y < 64; y += 10) {
    context.strokeStyle = y % 20 === 0 ? lightColor : darkColor;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(64, y);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawScuffedPaintTexture(context: CanvasRenderingContext2D, lightColor: string, darkColor: string) {
  context.globalAlpha = 0.25;
  context.fillStyle = lightColor;
  context.fillRect(6, 10, 17, 4);
  context.fillRect(36, 39, 20, 5);
  context.fillStyle = darkColor;
  context.fillRect(19, 25, 22, 4);
  context.fillRect(8, 51, 14, 3);
  context.globalAlpha = 1;
}

import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getNpcDisposition, type NpcDisposition, type NpcSnapshot, type QuestMarkerType } from "@mferland/shared";
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

type CreatureAvatarProps = {
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

const targetPosition = new THREE.Vector3();
const NAMEPLATE_RENDER_DISTANCE_SQ = 30 * 30;
const CHAT_BUBBLE_RENDER_DISTANCE_SQ = 38 * 38;
const QUEST_MARKER_RENDER_DISTANCE_SQ = 42 * 42;
const LOOT_EFFECT_RENDER_DISTANCE_SQ = 28 * 28;

const creatureHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const creatureHitGeometries = {
  rabbit: new THREE.CylinderGeometry(0.55, 0.55, 1.0, 10),
  hog: new THREE.CylinderGeometry(0.86, 0.86, 1.35, 10),
  deer: new THREE.CylinderGeometry(0.74, 0.74, 1.7, 10),
} as const;

Object.values(creatureHitGeometries).forEach((geometry) => {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
});

const creatureMaterials = {
  hogHide: new THREE.MeshBasicMaterial({ color: "#5c3a2e" }),
  hogDark: new THREE.MeshBasicMaterial({ color: "#2f201a" }),
  hogSnout: new THREE.MeshBasicMaterial({ color: "#806052" }),
  rabbitHide: new THREE.MeshBasicMaterial({ color: "#f2eee0" }),
  rabbitShade: new THREE.MeshBasicMaterial({ color: "#d8d1c2" }),
  rabbitDark: new THREE.MeshBasicMaterial({ color: "#1f1812" }),
  deerHide: new THREE.MeshBasicMaterial({ color: "#a66b36" }),
  deerBelly: new THREE.MeshBasicMaterial({ color: "#e3c694" }),
  deerDark: new THREE.MeshBasicMaterial({ color: "#2d1c12" }),
  deerAntler: new THREE.MeshBasicMaterial({ color: "#ead38f" }),
  headphoneBand: new THREE.MeshBasicMaterial({ color: "#16110f" }),
  headphonePad: new THREE.MeshBasicMaterial({ color: "#070707" }),
  headphoneAccent: new THREE.MeshBasicMaterial({ color: "#e35d50" }),
  cigaretteMouth: new THREE.MeshBasicMaterial({ color: "#15100d" }),
  cigarettePaper: new THREE.MeshBasicMaterial({ color: "#f8f0db" }),
  cigaretteFilter: new THREE.MeshBasicMaterial({ color: "#d08b3b" }),
  cigaretteEmber: new THREE.MeshBasicMaterial({ color: "#ff4b1f" }),
} as const;

const creatureGeometries = {
  hogBody: new THREE.SphereGeometry(0.46, 18, 12),
  hogHead: new THREE.SphereGeometry(0.34, 16, 10),
  hogSnout: new THREE.SphereGeometry(0.22, 14, 8),
  hogNostril: new THREE.BoxGeometry(0.12, 0.06, 0.05),
  hogEar: new THREE.ConeGeometry(0.1, 0.28, 4),
  hogLeg: new THREE.CapsuleGeometry(0.055, 0.34, 5, 8),
  hogTail: new THREE.TorusGeometry(0.13, 0.018, 6, 16, Math.PI * 1.3),
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  rabbitBody: new THREE.SphereGeometry(0.32, 18, 12),
  rabbitHead: new THREE.SphereGeometry(0.22, 18, 12),
  rabbitEar: new THREE.CapsuleGeometry(0.045, 0.42, 5, 8),
  rabbitTail: new THREE.SphereGeometry(0.12, 12, 8),
  rabbitEye: new THREE.SphereGeometry(0.025, 8, 6),
  rabbitFoot: new THREE.CapsuleGeometry(0.04, 0.24, 5, 8),
  deerBody: new THREE.SphereGeometry(0.45, 18, 12),
  deerNeck: new THREE.CapsuleGeometry(0.13, 0.42, 6, 10),
  deerHead: new THREE.SphereGeometry(0.2, 14, 10),
  deerBelly: new THREE.SphereGeometry(0.32, 14, 8),
  deerLeg: new THREE.CapsuleGeometry(0.045, 0.56, 5, 8),
  deerAntlerMain: new THREE.CapsuleGeometry(0.025, 0.32, 4, 7),
  deerAntlerBranch: new THREE.CapsuleGeometry(0.018, 0.18, 4, 7),
  deerEye: new THREE.SphereGeometry(0.024, 8, 6),
  headphoneBand: new THREE.CapsuleGeometry(0.012, 0.16, 5, 8),
  headphoneBandArc: new THREE.TorusGeometry(0.2, 0.012, 6, 24, Math.PI),
  headphoneCup: new THREE.CylinderGeometry(0.09, 0.09, 0.065, 14),
  headphoneAccent: new THREE.CylinderGeometry(0.052, 0.052, 0.07, 12),
  cigaretteStick: new THREE.CylinderGeometry(0.016, 0.016, 0.24, 8),
  cigaretteFilter: new THREE.CylinderGeometry(0.017, 0.017, 0.055, 8),
  cigaretteEmber: new THREE.SphereGeometry(0.024, 8, 6),
  cigaretteMouth: new THREE.SphereGeometry(0.022, 8, 6),
} as const;

const hogLegOffsets = [
  [-0.36, -0.26],
  [-0.36, 0.34],
  [0.36, -0.26],
  [0.36, 0.34],
] as const;
const deerLegXOffsets = [-0.27, 0.27] as const;
const deerAntlerXOffsets = [-0.12, 0.12] as const;

export function CreatureAvatar({
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
}: CreatureAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<THREE.Group>(null);
  const disposition = getNpcDisposition(npc);
  const ringColor = TARGET_RING_COLORS[disposition];
  const nameplate = getCreatureNameplate(npc, disposition);
  const hitGeometry = getCreatureHitGeometry(npc.model);
  const shadowScale = getCreatureShadowScale(npc.model);
  const labelY = npc.model === "rabbit" ? 1.22 : npc.model === "hog" ? 1.55 : 1.86;
  const markerRadius = npc.model === "rabbit" ? 0.48 : npc.model === "hog" ? 0.76 : 0.66;
  const distanceToViewerSq = viewerPosition ? distanceSq2d(viewerPosition, npc.x, npc.z) : 0;
  const showNameplate = canShowNameplate && !isDefeated && (isTargeted || distanceToViewerSq <= NAMEPLATE_RENDER_DISTANCE_SQ);
  const showChatBubble = !isDefeated && Boolean(chatBubble) && (isTargeted || distanceToViewerSq <= CHAT_BUBBLE_RENDER_DISTANCE_SQ);
  const showQuestMarker = !isDefeated && Boolean(questMarker) && (isTargeted || distanceToViewerSq <= QUEST_MARKER_RENDER_DISTANCE_SQ);
  const showLootSparkles = hasLoot && (isTargeted || distanceToViewerSq <= LOOT_EFFECT_RENDER_DISTANCE_SQ);
  const showBaseMarker = !isDefeated && (Boolean(questMarker) || isTargeted);
  const isFrozen = npc.frozenUntil > Date.now();
  const isCold = !isFrozen && npc.slowedUntil > Date.now();

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    targetPosition.set(npc.x, npc.y, npc.z);
    group.position.lerp(targetPosition, 1 - Math.pow(0.82, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, npc.yaw, 1 - Math.pow(0.82, delta * 60));

    const pose = poseRef.current;
    if (pose) {
      const targetRoll = isDefeated ? -Math.PI / 2 : 0;
      pose.rotation.z += (targetRoll - pose.rotation.z) * (1 - Math.pow(0.72, delta * 60));
      pose.position.y += ((isDefeated ? 0.05 : 0) - pose.position.y) * (1 - Math.pow(0.72, delta * 60));
    }
  });

  return (
    <group ref={groupRef} position={[npc.x, npc.y, npc.z]} rotation-y={npc.yaw}>
      <ActorBlobShadow scale={shadowScale} />
      {showBaseMarker && <DispositionBaseMarker disposition={disposition} questMarker={questMarker} radius={markerRadius} />}
      {isTargeted && <TargetRing color={ringColor} disposition={disposition} radius={markerRadius + 0.16} />}
      {isFrozen && <FrozenStatusEffect frozenUntil={npc.frozenUntil} radius={markerRadius * 0.9} y={Math.max(0.7, labelY - 0.45)} />}
      {isCold && <ColdStatusEffect slowedUntil={npc.slowedUntil} radius={markerRadius * 0.9} y={Math.max(0.7, labelY - 0.45)} />}
      {showQuestMarker && questMarker && <QuestMarker type={questMarker} y={labelY + 0.88} />}
      {showLootSparkles && <LootSparkles y={Math.max(0.7, labelY - 0.25)} />}
      <mesh
        geometry={hitGeometry}
        material={creatureHitMaterial}
        position={[0, 0.55, 0]}
        dispose={null}
        onPointerDown={handleTarget}
      />
      <group ref={poseRef}>
        {npc.model === "rabbit" ? <RabbitModel /> : npc.model === "hog" ? <HogModel /> : <DeerModel />}
        {showNameplate && (
          <Billboard position={[0, labelY, 0]}>
            <ActorNameplate
              title={nameplate.title}
              badge={nameplate.badge}
              color={TARGET_LABEL_COLORS[disposition]}
              badgeColor={ringColor}
              health={npc.isImmortal ? undefined : npc.health}
              maxHealth={npc.isImmortal ? undefined : npc.maxHealth}
              showHealthBar={showNameplateHealthBar}
              fontSize={npc.model === "rabbit" ? 0.16 : 0.19}
              maxWidth={2.8}
            />
          </Billboard>
        )}
        {showChatBubble && chatBubble && (
          <Billboard position={[0, showQuestMarker ? labelY + 1.52 : labelY + 0.68, 0]}>
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

function getCreatureHitGeometry(model: NpcSnapshot["model"]) {
  if (model === "rabbit") return creatureHitGeometries.rabbit;
  if (model === "hog") return creatureHitGeometries.hog;
  return creatureHitGeometries.deer;
}

function getCreatureShadowScale(model: NpcSnapshot["model"]): [number, number, number] {
  if (model === "rabbit") return [0.4, 0.28, 1];
  if (model === "hog") return [0.88, 0.48, 1];
  return [0.68, 0.42, 1];
}

function getCreatureNameplate(npc: NpcSnapshot, disposition: NpcDisposition) {
  if (disposition === "hostile") return { title: npc.name, badge: "HOSTILE" };
  if (npc.model === "rabbit") return { title: "Rabbit", badge: "CRITTER" };
  if (npc.model === "hog") return { title: npc.name, badge: "BEAST" };
  return { title: "Deer", badge: "BEAST" };
}

export function HogModel() {
  return (
    <group position={[0, 0.58, 0]} scale={[1.02, 1.02, 1.02]} dispose={null}>
      <mesh geometry={creatureGeometries.hogBody} material={creatureMaterials.hogHide} position={[0, 0.1, 0]} scale={[1.45, 0.78, 0.9]} />
      <mesh geometry={creatureGeometries.hogHead} material={creatureMaterials.hogHide} position={[0, 0.24, 0.52]} scale={[0.9, 0.64, 0.74]} />
      <mesh geometry={creatureGeometries.hogSnout} material={creatureMaterials.hogSnout} position={[0, 0.16, 0.86]} scale={[0.72, 0.42, 0.34]} />
      <mesh geometry={creatureGeometries.hogNostril} material={creatureMaterials.hogDark} position={[-0.14, 0.19, 1.02]} rotation-z={0.24} />
      <mesh geometry={creatureGeometries.hogNostril} material={creatureMaterials.hogDark} position={[0.14, 0.19, 1.02]} rotation-z={-0.24} />
      <mesh geometry={creatureGeometries.hogEar} material={creatureMaterials.hogDark} position={[-0.23, 0.54, 0.48]} rotation-z={0.52} />
      <mesh geometry={creatureGeometries.hogEar} material={creatureMaterials.hogDark} position={[0.23, 0.54, 0.48]} rotation-z={-0.52} />
      {hogLegOffsets.map(([x, z]) => (
        <mesh key={`${x}-${z}`} geometry={creatureGeometries.hogLeg} material={creatureMaterials.hogDark} position={[x, -0.38, z]} />
      ))}
      <mesh geometry={creatureGeometries.hogTail} material={creatureMaterials.hogDark} position={[0, 0.44, -0.62]} rotation-x={Math.PI / 2} />
      <mesh geometry={creatureGeometries.unitBox} material={creatureMaterials.hogDark} position={[0, 0.56, 0.02]} scale={[0.22, 0.12, 0.88]} />
      <CreatureHeadphones position={[0, 0.29, 0.48]} cupOffsetX={0.29} bandY={0.22} />
      <CreatureCigarette position={[0, 0.07, 1.02]} rotationY={0.45} />
    </group>
  );
}

export function RabbitModel() {
  return (
    <group position={[0, 0.18, 0]} scale={[0.9, 0.9, 0.9]} dispose={null}>
      <mesh geometry={creatureGeometries.rabbitBody} material={creatureMaterials.rabbitHide} position={[0, 0.26, 0]} />
      <mesh geometry={creatureGeometries.rabbitHead} material={creatureMaterials.rabbitHide} position={[0, 0.45, 0.31]} />
      <mesh geometry={creatureGeometries.rabbitEar} material={creatureMaterials.rabbitHide} position={[-0.11, 0.78, 0.32]} rotation-x={-0.16} />
      <mesh geometry={creatureGeometries.rabbitEar} material={creatureMaterials.rabbitHide} position={[0.11, 0.78, 0.32]} rotation-x={-0.16} />
      <mesh geometry={creatureGeometries.rabbitTail} material={creatureMaterials.rabbitShade} position={[0, 0.31, -0.32]} />
      <mesh geometry={creatureGeometries.rabbitEye} material={creatureMaterials.rabbitDark} position={[-0.08, 0.49, 0.5]} />
      <mesh geometry={creatureGeometries.rabbitEye} material={creatureMaterials.rabbitDark} position={[0.08, 0.49, 0.5]} />
      <mesh geometry={creatureGeometries.rabbitFoot} material={creatureMaterials.rabbitShade} position={[-0.17, 0.07, 0.12]} rotation-z={0.3} />
      <mesh geometry={creatureGeometries.rabbitFoot} material={creatureMaterials.rabbitShade} position={[0.17, 0.07, 0.12]} rotation-z={-0.3} />
      <CreatureHeadphones position={[0, 0.47, 0.31]} cupOffsetX={0.17} bandY={0.18} scale={[0.76, 0.76, 0.76]} />
      <CreatureCigarette position={[0, 0.35, 0.5]} rotationY={0.45} scale={[0.72, 0.72, 0.72]} />
    </group>
  );
}

export function DeerModel() {
  return (
    <group position={[0, 0.15, 0]} scale={[0.95, 0.95, 0.95]} dispose={null}>
      <mesh geometry={creatureGeometries.deerBody} material={creatureMaterials.deerHide} position={[0, 0.55, 0]} />
      <mesh geometry={creatureGeometries.deerNeck} material={creatureMaterials.deerHide} position={[0, 0.84, 0.42]} rotation-x={0.45} />
      <mesh geometry={creatureGeometries.deerHead} material={creatureMaterials.deerHide} position={[0, 1.05, 0.66]} />
      <mesh geometry={creatureGeometries.deerBelly} material={creatureMaterials.deerBelly} position={[0, 0.43, 0.2]} scale={[0.7, 0.5, 0.7]} />
      {deerLegXOffsets.map((x) => (
        <group key={x}>
          <mesh geometry={creatureGeometries.deerLeg} material={creatureMaterials.deerDark} position={[x, 0.28, 0.29]} />
          <mesh geometry={creatureGeometries.deerLeg} material={creatureMaterials.deerDark} position={[x, 0.28, -0.24]} />
        </group>
      ))}
      {deerAntlerXOffsets.map((x) => (
        <group key={x} position={[x, 1.28, 0.66]} rotation-z={x < 0 ? -0.28 : 0.28}>
          <mesh geometry={creatureGeometries.deerAntlerMain} material={creatureMaterials.deerAntler} rotation-z={0.1} />
          <mesh
            geometry={creatureGeometries.deerAntlerBranch}
            material={creatureMaterials.deerAntler}
            position={[x < 0 ? -0.05 : 0.05, 0.1, 0]}
            rotation-z={x < 0 ? -0.75 : 0.75}
          />
        </group>
      ))}
      <mesh geometry={creatureGeometries.deerEye} material={creatureMaterials.deerDark} position={[-0.07, 1.08, 0.83]} />
      <mesh geometry={creatureGeometries.deerEye} material={creatureMaterials.deerDark} position={[0.07, 1.08, 0.83]} />
      <CreatureHeadphones position={[0, 1.03, 0.66]} cupOffsetX={0.2} bandY={0.19} scale={[0.86, 0.86, 0.86]} />
      <CreatureCigarette position={[0, 0.95, 0.85]} rotationY={0.45} scale={[0.84, 0.84, 0.84]} />
    </group>
  );
}

function CreatureHeadphones({
  position,
  cupOffsetX,
  bandY,
  scale = [1, 1, 1],
}: {
  position: [number, number, number];
  cupOffsetX: number;
  bandY: number;
  scale?: [number, number, number];
}) {
  const arcScaleX = cupOffsetX / 0.2;
  const arcScaleY = bandY / 0.2;

  return (
    <group position={position} scale={scale}>
      <mesh geometry={creatureGeometries.headphoneBandArc} material={creatureMaterials.headphoneBand} position={[0, 0.05, -0.012]} scale={[arcScaleX, arcScaleY, 1]} />
      <mesh geometry={creatureGeometries.headphoneBand} material={creatureMaterials.headphoneBand} position={[-cupOffsetX, bandY * 0.26, -0.004]} />
      <mesh geometry={creatureGeometries.headphoneBand} material={creatureMaterials.headphoneBand} position={[cupOffsetX, bandY * 0.26, -0.004]} />
      <mesh geometry={creatureGeometries.headphoneCup} material={creatureMaterials.headphonePad} position={[-cupOffsetX, 0, 0]} rotation-z={Math.PI / 2} />
      <mesh geometry={creatureGeometries.headphoneCup} material={creatureMaterials.headphonePad} position={[cupOffsetX, 0, 0]} rotation-z={Math.PI / 2} />
      <mesh geometry={creatureGeometries.headphoneAccent} material={creatureMaterials.headphoneAccent} position={[-cupOffsetX - 0.002, 0, 0.002]} rotation-z={Math.PI / 2} />
      <mesh geometry={creatureGeometries.headphoneAccent} material={creatureMaterials.headphoneAccent} position={[cupOffsetX + 0.002, 0, 0.002]} rotation-z={Math.PI / 2} />
    </group>
  );
}

function CreatureCigarette({
  position,
  rotationY,
  scale = [1, 1, 1],
}: {
  position: [number, number, number];
  rotationY: number;
  scale?: [number, number, number];
}) {
  return (
    <group position={position} rotation-y={rotationY} scale={scale}>
      <mesh geometry={creatureGeometries.cigaretteMouth} material={creatureMaterials.cigaretteMouth} scale={[1, 0.55, 0.7]} />
      <mesh geometry={creatureGeometries.cigaretteFilter} material={creatureMaterials.cigaretteFilter} position={[0, 0, 0.03]} rotation-x={Math.PI / 2} />
      <mesh geometry={creatureGeometries.cigaretteStick} material={creatureMaterials.cigarettePaper} position={[0, 0, 0.16]} rotation-x={Math.PI / 2} />
      <mesh geometry={creatureGeometries.cigaretteEmber} material={creatureMaterials.cigaretteEmber} position={[0, 0, 0.29]} />
    </group>
  );
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

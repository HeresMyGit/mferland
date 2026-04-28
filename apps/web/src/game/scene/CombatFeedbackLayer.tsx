import { type RefObject, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  COMBAT,
  clamp,
  type CombatActionId,
  type CombatEvent,
  type ExperienceEvent,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@mferland/shared";

type Vec3Tuple = [number, number, number];
export function CombatFeedbackLayer({
  combatEvents,
  experienceEvents,
  players,
  npcs,
  viewerPosition,
}: {
  combatEvents: CombatEvent[];
  experienceEvents: ExperienceEvent[];
  players: Map<string, PlayerSnapshot>;
  npcs: Map<string, NpcSnapshot>;
  viewerPosition: { x: number; z: number } | null;
}) {
  return (
    <group>
      {combatEvents.slice(-32).filter((event) => shouldRenderCombatEvent(event, players, npcs, viewerPosition)).map((event) => {
        const source = players.get(event.sourceId) ?? npcs.get(event.sourceId);
        const sourcePosition: Vec3Tuple = [
          source?.x ?? event.sourceX,
          source ? source.y + ("role" in source ? getNpcVisualHeight(source) : 1.18) : event.sourceY,
          source?.z ?? event.sourceZ,
        ];
        const targetPosition: Vec3Tuple = [event.targetX, event.targetY, event.targetZ];
        const yaw = source?.yaw ?? Math.atan2(event.targetX - event.sourceX, event.targetZ - event.sourceZ);
        const impactAt = event.impactAt ?? event.sentAt;

        return (
          <CombatEventVisual
            key={event.id}
            actionId={event.actionId}
            sourcePosition={sourcePosition}
            targetPosition={targetPosition}
            yaw={yaw}
            sentAt={event.sentAt}
            impactAt={impactAt}
            amount={event.amount}
            eventId={event.id}
          />
        );
      })}
      {experienceEvents.slice(-24).filter((event) => shouldRenderExperienceEvent(event, viewerPosition)).map((event) => (
        <ExperienceEventVisual key={event.id} event={event} />
      ))}
    </group>
  );
}

function CombatEventVisual({
  actionId,
  sourcePosition,
  targetPosition,
  yaw,
  sentAt,
  impactAt,
  amount,
  eventId,
}: {
  actionId: CombatActionId;
  sourcePosition: Vec3Tuple;
  targetPosition: Vec3Tuple;
  yaw: number;
  sentAt: number;
  impactAt: number;
  amount: number;
  eventId: string;
}) {
  const swordRef = useRef<THREE.Group>(null);
  const whirlwindRef = useRef<THREE.Group>(null);
  const bowRef = useRef<THREE.Group>(null);
  const projectileRef = useRef<THREE.Group>(null);
  const tauntSourceRef = useRef<THREE.Group>(null);
  const impactRef = useRef<THREE.Group>(null);
  const damageRef = useRef<THREE.Group>(null);
  const clockEpochOffsetRef = useRef<number | null>(null);
  const startVector = useMemo(() => new THREE.Vector3(...sourcePosition), [sourcePosition]);
  const endVector = useMemo(() => new THREE.Vector3(...targetPosition), [targetPosition]);
  const direction = useMemo(() => endVector.clone().sub(startVector).normalize(), [endVector, startVector]);
  const projectileAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const damageOffset = useMemo(() => getEventOffset(eventId), [eventId]);
  const isFrostNovaCast = actionId === "frostNova" && amount <= 0;
  const projectileDurationMs = actionId === "shoot" || actionId === "multishot" || actionId === "signalShot"
    ? 520
    : isFrostNovaCast ? 720 : Math.max(180, impactAt - sentAt);

  useFrame(({ clock }) => {
    if (clockEpochOffsetRef.current === null) {
      clockEpochOffsetRef.current = Date.now() - clock.elapsedTime * 1000;
    }
    const now = clockEpochOffsetRef.current + clock.elapsedTime * 1000;

    if (swordRef.current) {
      const age = now - sentAt;
      const progress = clamp(age / 420, 0, 1);
      swordRef.current.visible = age >= 0 && progress < 1;
      swordRef.current.rotation.z = -0.9 + progress * 1.65;
      swordRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.18);
    }

    if (whirlwindRef.current) {
      const age = now - sentAt;
      const progress = clamp(age / 760, 0, 1);
      whirlwindRef.current.visible = age >= 0 && progress < 1;
      whirlwindRef.current.rotation.y = progress * Math.PI * 4.8;
      whirlwindRef.current.scale.setScalar(0.82 + Math.sin(progress * Math.PI) * 0.24);
    }

    if (bowRef.current) {
      const age = now - sentAt;
      const progress = clamp(age / 430, 0, 1);
      bowRef.current.visible = age >= 0 && progress < 1;
      bowRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.1);
    }

    if (projectileRef.current) {
      const age = now - sentAt;
      const progress = clamp(age / projectileDurationMs, 0, 1);
      projectileRef.current.visible = age >= 0 && progress < 1;
      if (isFrostNovaCast) {
        projectileRef.current.position.set(targetPosition[0], targetPosition[1] - 0.42, targetPosition[2]);
        const easedProgress = 1 - (1 - progress) ** 3;
        projectileRef.current.scale.setScalar(0.24 + easedProgress * COMBAT.actions.frostNova.maxRange);
      } else {
        projectileRef.current.position.lerpVectors(startVector, endVector, progress);
        if (direction.lengthSq() > 0.0001) projectileRef.current.quaternion.setFromUnitVectors(projectileAxis, direction);
      }
    }

    if (tauntSourceRef.current) {
      const age = now - sentAt;
      const progress = clamp(age / 820, 0, 1);
      tauntSourceRef.current.visible = age >= 0 && progress < 1;
      tauntSourceRef.current.position.set(sourcePosition[0], sourcePosition[1] + 0.76 + Math.sin(progress * Math.PI) * 0.22, sourcePosition[2]);
      tauntSourceRef.current.scale.setScalar(0.74 + Math.sin(progress * Math.PI) * 0.2);
    }

    if (impactRef.current) {
      const age = now - impactAt;
      const progress = clamp(age / 620, 0, 1);
      impactRef.current.visible = age >= 0 && progress < 1;
      impactRef.current.position.set(targetPosition[0], targetPosition[1] - 0.12, targetPosition[2]);
      impactRef.current.scale.setScalar(0.38 + progress * 1.25);
      impactRef.current.rotation.y += 0.05;
    }

    if (damageRef.current) {
      const age = now - impactAt;
      const progress = clamp(age / 1250, 0, 1);
      damageRef.current.visible = age >= 0 && progress < 1;
      damageRef.current.position.set(
        targetPosition[0] + damageOffset[0],
        targetPosition[1] + 0.38 + progress * 1.15,
        targetPosition[2] + damageOffset[1],
      );
      damageRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.22);
    }
  });

  return (
    <group>
      {actionId === "attack" && <SwordFlash refGroup={swordRef} position={sourcePosition} yaw={yaw} />}
      {actionId === "whirlwind" && <WhirlwindBurst refGroup={whirlwindRef} position={sourcePosition} />}
      {(actionId === "shoot" || actionId === "multishot" || actionId === "signalShot") && (
        <>
          <BowFlash refGroup={bowRef} position={sourcePosition} yaw={yaw} />
          {actionId === "signalShot"
            ? <LinearProjectile refGroup={projectileRef} variant="signal" start={sourcePosition} />
            : <LinearProjectile refGroup={projectileRef} variant="arrow" start={sourcePosition} />}
        </>
      )}
      {actionId === "fireblast" && (
        <LinearProjectile refGroup={projectileRef} variant="fireblast" start={sourcePosition} />
      )}
      {actionId === "iceBlast" && (
        <LinearProjectile refGroup={projectileRef} variant="iceblast" start={sourcePosition} />
      )}
      {isFrostNovaCast && <FrostNovaBurst refGroup={projectileRef} position={targetPosition} />}
      {actionId === "taunt" && (
        <>
          <TauntSourceMark refGroup={tauntSourceRef} position={sourcePosition} />
          <TauntPulse refGroup={impactRef} position={targetPosition} />
        </>
      )}
      {actionId === "heal" && <HealBloom refGroup={impactRef} position={targetPosition} />}
      {(actionId === "fireblast" || actionId === "iceBlast" || actionId === "signalShot") && <SpellImpactBurst refGroup={impactRef} position={targetPosition} variant={actionId === "iceBlast" ? "ice" : actionId === "signalShot" ? "signal" : "fire"} />}
      {(amount > 0 || actionId === "heal") && (
        <FloatingDamageNumber
          refGroup={damageRef}
          actionId={actionId}
          amount={amount}
          position={targetPosition}
          offset={damageOffset}
        />
      )}
    </group>
  );
}

function FrostNovaBurst({ refGroup, position }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple }) {
  const shardAngles = useMemo(() => Array.from({ length: 18 }, (_, index) => (index / 18) * Math.PI * 2), []);

  return (
    <group ref={refGroup} position={position} visible={false}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.84, 1.06, 72]} />
        <meshBasicMaterial color="#b7f4ff" depthWrite={false} opacity={0.26} toneMapped={false} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.03, 0]}>
        <torusGeometry args={[1, 0.018, 8, 72]} />
        <meshBasicMaterial color="#f1fdff" depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.05, 0]}>
        <torusGeometry args={[0.72, 0.012, 8, 56]} />
        <meshBasicMaterial color="#dffbff" depthWrite={false} opacity={0.8} toneMapped={false} transparent />
      </mesh>
      {shardAngles.map((angle) => (
        <mesh
          key={angle}
          position={[Math.sin(angle) * 0.92, 0.07, Math.cos(angle) * 0.92]}
          rotation-y={angle}
          rotation-x={Math.PI / 2}
        >
          <boxGeometry args={[0.018, 0.22, 0.012]} />
          <meshBasicMaterial color="#e6fbff" depthWrite={false} opacity={0.74} toneMapped={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

function WhirlwindBurst({ refGroup, position }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple }) {
  const swordAngles = useMemo(() => Array.from({ length: 8 }, (_, index) => (index / 8) * Math.PI * 2), []);

  return (
    <group ref={refGroup} position={[position[0], position[1] - 0.46, position[2]]} visible={false}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.02, 0.026, 8, 80]} />
        <meshBasicMaterial color="#fff08a" depthWrite={false} opacity={0.45} toneMapped={false} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2} rotation-z={0.7}>
        <ringGeometry args={[0.72, 1.3, 72]} />
        <meshBasicMaterial color="#f3d04e" depthWrite={false} opacity={0.18} toneMapped={false} transparent />
      </mesh>
      {swordAngles.map((angle) => (
        <group
          key={angle}
          position={[Math.sin(angle) * 0.9, 0.74, Math.cos(angle) * 0.9]}
          rotation-y={angle}
        >
          <mesh position={[0, 0, 0.28]}>
            <boxGeometry args={[0.08, 0.04, 0.76]} />
            <meshBasicMaterial color="#eaf4f8" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.73]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.08, 0.18, 8]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.16]}>
            <boxGeometry args={[0.3, 0.07, 0.08]} />
            <meshBasicMaterial color="#4e3824" />
          </mesh>
          <mesh position={[0, 0, -0.34]}>
            <boxGeometry args={[0.08, 0.08, 0.26]} />
            <meshBasicMaterial color="#8b6137" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TauntSourceMark({ refGroup, position }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple }) {
  return (
    <group ref={refGroup} position={[position[0], position[1] + 0.76, position[2]]} visible={false}>
      <Billboard>
        <Text
          fontSize={0.72}
          anchorX="center"
          anchorY="middle"
          color="#ffdd55"
          outlineColor="#330806"
          outlineWidth={0.085}
          renderOrder={78}
        >
          !
        </Text>
      </Billboard>
    </group>
  );
}

function TauntPulse({ refGroup, position }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple }) {
  return (
    <group ref={refGroup} position={position} visible={false}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.42, 0.76, 36]} />
        <meshBasicMaterial color="#ff4f42" depthWrite={false} opacity={0.45} toneMapped={false} transparent />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.2, 12, 8]} />
        <meshBasicMaterial color="#ff4f42" depthWrite={false} opacity={0.36} toneMapped={false} transparent />
      </mesh>
      <Billboard position={[0, 0.72, 0]}>
        <Text
          fontSize={0.58}
          anchorX="center"
          anchorY="middle"
          color="#ff4f42"
          outlineColor="#260403"
          outlineWidth={0.07}
          renderOrder={78}
        >
          !
        </Text>
      </Billboard>
    </group>
  );
}

function HealBloom({ refGroup, position }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple }) {
  return (
    <group ref={refGroup} position={position} visible={false}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.34, 0.74, 36]} />
        <meshBasicMaterial color="#5fe777" depthWrite={false} opacity={0.34} toneMapped={false} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2} rotation-z={Math.PI / 4}>
        <torusGeometry args={[0.42, 0.022, 8, 36]} />
        <meshBasicMaterial color="#b9ffc4" depthWrite={false} opacity={0.78} toneMapped={false} transparent />
      </mesh>
      <Billboard position={[0, 0.34, 0]}>
        <Text
          fontSize={0.38}
          anchorX="center"
          anchorY="middle"
          color="#8dff9c"
          outlineColor="#09230f"
          outlineWidth={0.052}
          renderOrder={78}
        >
          +
        </Text>
      </Billboard>
    </group>
  );
}

function SwordFlash({ refGroup, position, yaw }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple; yaw: number }) {
  return (
    <group ref={refGroup} position={position} rotation-y={yaw} rotation-z={-0.9} visible={false}>
      <group position={[0.42, -0.04, 0.18]} rotation-x={0.28} rotation-z={-0.48}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.08, 0.84, 0.035]} />
          <meshBasicMaterial color="#dbe8ee" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.24, 0.07, 0.07]} />
          <meshBasicMaterial color="#423526" />
        </mesh>
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[0.07, 0.34, 0.07]} />
          <meshBasicMaterial color="#7b5632" />
        </mesh>
      </group>
    </group>
  );
}

function BowFlash({ refGroup, position, yaw }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple; yaw: number }) {
  return (
    <group ref={refGroup} position={position} rotation-y={yaw} visible={false}>
      <group position={[0.46, -0.02, 0.22]} rotation-z={Math.PI / 2}>
        <mesh>
          <torusGeometry args={[0.34, 0.018, 6, 22, Math.PI * 1.2]} />
          <meshBasicMaterial color="#76522e" />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.018, 0.68, 0.018]} />
          <meshBasicMaterial color="#f2dfae" />
        </mesh>
      </group>
    </group>
  );
}

function LinearProjectile({
  refGroup,
  variant,
  start,
}: {
  refGroup: RefObject<THREE.Group | null>;
  variant: "arrow" | "fireblast" | "signal" | "iceblast";
  start: Vec3Tuple;
}) {
  if (variant === "arrow") {
    return (
      <group ref={refGroup} position={start} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.78, 8]} />
          <meshBasicMaterial color="#3c2c1c" />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <coneGeometry args={[0.07, 0.18, 8]} />
          <meshBasicMaterial color="#d6dde2" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.38, 0]}>
          <coneGeometry args={[0.08, 0.14, 4]} />
          <meshBasicMaterial color="#f1e0bb" />
        </mesh>
      </group>
    );
  }

  if (variant === "signal") {
    return (
      <group ref={refGroup} position={start} visible={false}>
        <mesh>
          <sphereGeometry args={[0.22, 14, 10]} />
          <meshBasicMaterial color="#d67bff" depthTest={false} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.3, 0.018, 8, 24]} />
          <meshBasicMaterial color="#f3d04e" depthWrite={false} opacity={0.76} toneMapped={false} transparent />
        </mesh>
      </group>
    );
  }

  const isIce = variant === "iceblast";
  return (
    <group ref={refGroup} position={start} visible={false}>
      <mesh position={[0, 0.16, 0]} renderOrder={36}>
        <sphereGeometry args={[0.34, 18, 12]} />
        <meshBasicMaterial color={isIce ? "#ecfdff" : "#fff08a"} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.58, 18, 12]} />
        <meshBasicMaterial color={isIce ? "#7ee7ff" : "#ff6a28"} depthWrite={false} opacity={0.34} toneMapped={false} transparent />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.46, 0.025, 8, 28]} />
        <meshBasicMaterial color={isIce ? "#b7f4ff" : "#ffd35b"} depthWrite={false} opacity={0.72} toneMapped={false} transparent />
      </mesh>
      <mesh position={[0, -0.34, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.32, 0.72, 8]} />
        <meshBasicMaterial color={isIce ? "#9eefff" : "#ff7a2c"} depthWrite={false} opacity={0.78} toneMapped={false} transparent />
      </mesh>
      <mesh position={[0, -0.7, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.2, 0.52, 7]} />
        <meshBasicMaterial color={isIce ? "#dffbff" : "#ff382e"} depthWrite={false} opacity={0.55} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}

function SpellImpactBurst({ refGroup, position, variant = "fire" }: { refGroup: RefObject<THREE.Group | null>; position: Vec3Tuple; variant?: "fire" | "signal" | "ice" }) {
  const color = variant === "ice" ? "#b7f4ff" : variant === "signal" ? "#d67bff" : "#ffb34d";
  const glow = variant === "ice" ? "#ecfdff" : variant === "signal" ? "#f3d04e" : "#fff08a";
  return (
    <group ref={refGroup} position={position} visible={false}>
      <mesh rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.3, 0.7, 28]} />
        <meshBasicMaterial color={color} depthWrite={false} opacity={0.45} toneMapped={false} transparent />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.36, 14, 10]} />
        <meshBasicMaterial color={color} depthWrite={false} opacity={0.38} toneMapped={false} transparent />
      </mesh>
      <mesh rotation-y={0.7}>
        <torusGeometry args={[0.54, 0.026, 8, 28]} />
        <meshBasicMaterial color={glow} depthWrite={false} opacity={0.86} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}

function FloatingDamageNumber({
  refGroup,
  actionId,
  amount,
  position,
  offset,
}: {
  refGroup: RefObject<THREE.Group | null>;
  actionId: CombatActionId;
  amount: number;
  position: Vec3Tuple;
  offset: [number, number];
}) {
  const style = getDamageNumberStyle(actionId);

  return (
    <group ref={refGroup} position={[position[0] + offset[0], position[1] + 0.38, position[2] + offset[1]]} visible={false}>
      <Billboard>
        <Text
          fontSize={0.36}
          anchorX="center"
          anchorY="middle"
          color={style.color}
          outlineColor={style.outlineColor}
          outlineWidth={0.045}
        >
          {actionId === "heal" ? `+${Math.round(amount)}` : Math.round(amount)}
        </Text>
      </Billboard>
    </group>
  );
}

function ExperienceEventVisual({ event }: { event: ExperienceEvent }) {
  const refGroup = useRef<THREE.Group>(null);
  const clockEpochOffsetRef = useRef<number | null>(null);
  const offset = useMemo(() => getEventOffset(event.id), [event.id]);

  useFrame(({ clock }) => {
    if (clockEpochOffsetRef.current === null) {
      clockEpochOffsetRef.current = Date.now() - clock.elapsedTime * 1000;
    }
    const now = clockEpochOffsetRef.current + clock.elapsedTime * 1000;
    const age = now - event.sentAt;
    const progress = clamp(age / 1650, 0, 1);

    if (!refGroup.current) return;
    refGroup.current.visible = age >= 0 && progress < 1;
    refGroup.current.position.set(
      event.x + offset[0],
      event.y + 0.44 + progress * 1.28,
      event.z + offset[1],
    );
    refGroup.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.18);
  });

  return (
    <group ref={refGroup} position={[event.x + offset[0], event.y + 0.44, event.z + offset[1]]} visible={false}>
      <Billboard>
        <Text
          fontSize={0.34}
          anchorX="center"
          anchorY="middle"
          color="#c084fc"
          outlineColor="#1f0f34"
          outlineWidth={0.042}
        >
          {Math.round(event.amount)} XP
        </Text>
      </Billboard>
    </group>
  );
}

function getDamageNumberStyle(actionId: CombatActionId) {
  if (actionId === "heal") return { color: "#5fe777", outlineColor: "#0d2c16" };
  if (actionId === "fireblast") return { color: "#ffb34d", outlineColor: "#2a0d05" };
  if (actionId === "frostNova" || actionId === "iceBlast") return { color: "#c8f7ff", outlineColor: "#052331" };
  if (actionId === "signalShot") return { color: "#d7a7ff", outlineColor: "#25103b" };
  return { color: "#ffd35b", outlineColor: "#15100c" };
}

function getEventOffset(id: string): [number, number] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  const x = ((hash >>> 0) % 1000) / 1000 - 0.5;
  const z = (((hash >>> 8) % 1000) / 1000 - 0.5) * 0.6;
  return [x * 0.38, z * 0.38];
}

function getNpcVisualHeight(npc: NpcSnapshot) {
  if (npc.model === "rabbit") return 0.75;
  if (npc.model === "hog") return 0.9;
  if (npc.model === "deer") return 1.15;
  return 1.35;
}

const COMBAT_VISUAL_RENDER_DISTANCE_SQ = 56 * 56;

function shouldRenderCombatEvent(
  event: CombatEvent,
  players: Map<string, PlayerSnapshot>,
  npcs: Map<string, NpcSnapshot>,
  viewerPosition: { x: number; z: number } | null,
) {
  if (!viewerPosition) return true;

  const source = players.get(event.sourceId) ?? npcs.get(event.sourceId);
  const sourceX = source?.x ?? event.sourceX;
  const sourceZ = source?.z ?? event.sourceZ;
  return distanceSq2d(viewerPosition, sourceX, sourceZ) <= COMBAT_VISUAL_RENDER_DISTANCE_SQ
    || distanceSq2d(viewerPosition, event.targetX, event.targetZ) <= COMBAT_VISUAL_RENDER_DISTANCE_SQ;
}

function shouldRenderExperienceEvent(
  event: ExperienceEvent,
  viewerPosition: { x: number; z: number } | null,
) {
  if (!viewerPosition) return true;
  return distanceSq2d(viewerPosition, event.x, event.z) <= COMBAT_VISUAL_RENDER_DISTANCE_SQ;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

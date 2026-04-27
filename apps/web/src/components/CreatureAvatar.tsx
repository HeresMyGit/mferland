import { useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type NpcSnapshot } from "@mferland/shared";
import { TargetRing } from "./MferAvatar";

type CreatureAvatarProps = {
  npc: NpcSnapshot;
  isTargeted?: boolean;
  onTarget?: () => void;
};

const targetPosition = new THREE.Vector3();

export function CreatureAvatar({ npc, isTargeted = false, onTarget }: CreatureAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const accent = npc.model === "rabbit" ? "#f2eee0" : npc.model === "hog" ? "#5c3a2e" : "#b07a3d";
  const ringColor = "#ff453f";
  const label = npc.model === "rabbit" ? "Rabbit [Critter]" : npc.model === "hog" ? `${npc.name} [Beast]` : "Deer [Beast]";
  const hitRadius = npc.model === "rabbit" ? 0.55 : npc.model === "hog" ? 0.86 : 0.74;
  const hitHeight = npc.model === "rabbit" ? 1.0 : npc.model === "hog" ? 1.35 : 1.7;
  const labelY = npc.model === "rabbit" ? 1.22 : npc.model === "hog" ? 1.55 : 1.86;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    targetPosition.set(npc.x, npc.y, npc.z);
    group.position.lerp(targetPosition, 1 - Math.pow(0.82, delta * 60));
    group.rotation.y = lerpAngle(group.rotation.y, npc.yaw, 1 - Math.pow(0.82, delta * 60));
  });

  return (
    <group ref={groupRef} position={[npc.x, npc.y, npc.z]} rotation-y={npc.yaw} onPointerDown={handleTarget}>
      <mesh position={[0, 0.55, 0]} onPointerDown={handleTarget}>
        <cylinderGeometry args={[hitRadius, hitRadius, hitHeight, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {isTargeted && <TargetRing color={ringColor} />}
      {npc.model === "rabbit" ? <RabbitModel color={accent} /> : npc.model === "hog" ? <HogModel /> : <DeerModel />}
      <Billboard position={[0, labelY, 0]}>
        <Text
          fontSize={npc.model === "rabbit" ? 0.16 : 0.2}
          anchorX="center"
          anchorY="middle"
          color="#ff6258"
          outlineColor="#16140f"
          outlineWidth={0.022}
          maxWidth={2.1}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );

  function handleTarget(event: ThreeEvent<PointerEvent>) {
    if (!onTarget) return;
    event.stopPropagation();
    onTarget();
  }
}

function HogModel() {
  const hide = useMemo(() => new THREE.MeshBasicMaterial({ color: "#5c3a2e" }), []);
  const dark = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2f201a" }), []);
  const snout = useMemo(() => new THREE.MeshBasicMaterial({ color: "#806052" }), []);

  return (
    <group position={[0, 0.58, 0]} scale={[1.02, 1.02, 1.02]}>
      <mesh material={hide} position={[0, 0.1, 0]} scale={[1.45, 0.78, 0.9]}>
        <sphereGeometry args={[0.46, 18, 12]} />
      </mesh>
      <mesh material={hide} position={[0, 0.24, 0.52]} scale={[0.9, 0.64, 0.74]}>
        <sphereGeometry args={[0.34, 16, 10]} />
      </mesh>
      <mesh material={snout} position={[0, 0.16, 0.86]} scale={[0.72, 0.42, 0.34]}>
        <sphereGeometry args={[0.22, 14, 8]} />
      </mesh>
      <mesh material={dark} position={[-0.14, 0.19, 1.02]} rotation-z={0.24}>
        <boxGeometry args={[0.12, 0.06, 0.05]} />
      </mesh>
      <mesh material={dark} position={[0.14, 0.19, 1.02]} rotation-z={-0.24}>
        <boxGeometry args={[0.12, 0.06, 0.05]} />
      </mesh>
      <mesh material={dark} position={[-0.23, 0.54, 0.48]} rotation-z={0.52}>
        <coneGeometry args={[0.1, 0.28, 4]} />
      </mesh>
      <mesh material={dark} position={[0.23, 0.54, 0.48]} rotation-z={-0.52}>
        <coneGeometry args={[0.1, 0.28, 4]} />
      </mesh>
      {[-0.36, 0.36].flatMap((x) => [-0.26, 0.34].map((z) => (
        <mesh key={`${x}-${z}`} material={dark} position={[x, -0.38, z]}>
          <capsuleGeometry args={[0.055, 0.34, 5, 8]} />
        </mesh>
      )))}
      <mesh material={dark} position={[0, 0.44, -0.62]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.13, 0.018, 6, 16, Math.PI * 1.3]} />
      </mesh>
      <mesh material={dark} position={[0, 0.56, 0.02]} scale={[0.22, 0.12, 0.88]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </group>
  );
}

function RabbitModel({ color }: { color: string }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color }), [color]);
  const shade = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d8d1c2" }), []);
  const dark = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1f1812" }), []);

  return (
    <group position={[0, 0.18, 0]} scale={[0.9, 0.9, 0.9]}>
      <mesh material={material} position={[0, 0.26, 0]}>
        <sphereGeometry args={[0.32, 18, 12]} />
      </mesh>
      <mesh material={material} position={[0, 0.45, 0.31]}>
        <sphereGeometry args={[0.22, 18, 12]} />
      </mesh>
      <mesh material={material} position={[-0.11, 0.78, 0.32]} rotation-x={-0.16}>
        <capsuleGeometry args={[0.045, 0.42, 5, 8]} />
      </mesh>
      <mesh material={material} position={[0.11, 0.78, 0.32]} rotation-x={-0.16}>
        <capsuleGeometry args={[0.045, 0.42, 5, 8]} />
      </mesh>
      <mesh material={shade} position={[0, 0.31, -0.32]}>
        <sphereGeometry args={[0.12, 12, 8]} />
      </mesh>
      <mesh material={dark} position={[-0.08, 0.49, 0.5]}>
        <sphereGeometry args={[0.025, 8, 6]} />
      </mesh>
      <mesh material={dark} position={[0.08, 0.49, 0.5]}>
        <sphereGeometry args={[0.025, 8, 6]} />
      </mesh>
      <mesh material={shade} position={[-0.17, 0.07, 0.12]} rotation-z={0.3}>
        <capsuleGeometry args={[0.04, 0.24, 5, 8]} />
      </mesh>
      <mesh material={shade} position={[0.17, 0.07, 0.12]} rotation-z={-0.3}>
        <capsuleGeometry args={[0.04, 0.24, 5, 8]} />
      </mesh>
    </group>
  );
}

function DeerModel() {
  const hide = useMemo(() => new THREE.MeshBasicMaterial({ color: "#a66b36" }), []);
  const belly = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e3c694" }), []);
  const dark = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2d1c12" }), []);
  const antler = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ead38f" }), []);

  return (
    <group position={[0, 0.15, 0]} scale={[0.95, 0.95, 0.95]}>
      <mesh material={hide} position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.45, 18, 12]} />
      </mesh>
      <mesh material={hide} position={[0, 0.84, 0.42]} rotation-x={0.45}>
        <capsuleGeometry args={[0.13, 0.42, 6, 10]} />
      </mesh>
      <mesh material={hide} position={[0, 1.05, 0.66]}>
        <sphereGeometry args={[0.2, 14, 10]} />
      </mesh>
      <mesh material={belly} position={[0, 0.43, 0.2]} scale={[0.7, 0.5, 0.7]}>
        <sphereGeometry args={[0.32, 14, 8]} />
      </mesh>
      {[-0.27, 0.27].map((x) => (
        <group key={x}>
          <mesh material={dark} position={[x, 0.28, 0.29]}>
            <capsuleGeometry args={[0.045, 0.56, 5, 8]} />
          </mesh>
          <mesh material={dark} position={[x, 0.28, -0.24]}>
            <capsuleGeometry args={[0.045, 0.56, 5, 8]} />
          </mesh>
        </group>
      ))}
      {[-0.12, 0.12].map((x) => (
        <group key={x} position={[x, 1.28, 0.66]} rotation-z={x < 0 ? -0.28 : 0.28}>
          <mesh material={antler} rotation-z={0.1}>
            <capsuleGeometry args={[0.025, 0.32, 4, 7]} />
          </mesh>
          <mesh material={antler} position={[x < 0 ? -0.05 : 0.05, 0.1, 0]} rotation-z={x < 0 ? -0.75 : 0.75}>
            <capsuleGeometry args={[0.018, 0.18, 4, 7]} />
          </mesh>
        </group>
      ))}
      <mesh material={dark} position={[-0.07, 1.08, 0.83]}>
        <sphereGeometry args={[0.024, 8, 6]} />
      </mesh>
      <mesh material={dark} position={[0.07, 1.08, 0.83]}>
        <sphereGeometry args={[0.024, 8, 6]} />
      </mesh>
    </group>
  );
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

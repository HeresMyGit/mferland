import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { applyStaticPropInstances, composeInstanceMatrix, type StaticPropInstance } from "./shared";

export function Fountain({
  stoneTexture,
  waterTexture,
}: {
  stoneTexture: THREE.Texture;
  waterTexture: THREE.Texture;
}) {
  const surfaceRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const spillRef = useRef<THREE.Group>(null);
  const dropletRef = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime;
    waterTexture.offset.x = (waterTexture.offset.x + delta * 0.018) % 1;
    waterTexture.offset.y = (waterTexture.offset.y + delta * 0.026) % 1;
    waterTexture.rotation = elapsed * 0.035;

    if (surfaceRef.current) {
      surfaceRef.current.rotation.z = elapsed * 0.045;
    }
    if (rippleRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.9) * 0.018;
      rippleRef.current.scale.set(pulse, pulse, pulse);
      rippleRef.current.rotation.z = -elapsed * 0.08;
    }
    if (spillRef.current) {
      const shimmer = 1 + Math.sin(elapsed * 6.2) * 0.025;
      spillRef.current.scale.set(shimmer, 1, shimmer);
    }
    if (dropletRef.current) {
      dropletRef.current.rotation.y = elapsed * 0.14;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[4.45, 4.9, 0.36, 96]} />
        <meshStandardMaterial map={stoneTexture} color="#8f887c" roughness={0.92} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.5, 0]}>
        <torusGeometry args={[4.08, 0.26, 12, 96]} />
        <meshStandardMaterial map={stoneTexture} color="#aaa293" roughness={0.86} />
      </mesh>
      <InstancedFountainStones stoneTexture={stoneTexture} />
      <mesh ref={surfaceRef} rotation-x={-Math.PI / 2} position={[0, 0.635, 0]}>
        <circleGeometry args={[3.72, 128]} />
        <meshPhysicalMaterial
          map={waterTexture}
          color="#6edfff"
          roughness={0.06}
          metalness={0}
          transmission={0.22}
          thickness={0.36}
          transparent
          opacity={0.64}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={rippleRef} rotation-x={Math.PI / 2} position={[0, 0.665, 0]}>
        <torusGeometry args={[2.35, 0.018, 8, 128]} />
        <meshBasicMaterial color="#e8fbff" transparent opacity={0.36} depthWrite={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.675, 0]}>
        <torusGeometry args={[1.28, 0.014, 8, 96]} />
        <meshBasicMaterial color="#b7f2ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.56, 0.72, 1.15, 32]} />
        <meshStandardMaterial map={stoneTexture} color="#958f85" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <cylinderGeometry args={[1.05, 0.72, 0.38, 48]} />
        <meshStandardMaterial map={stoneTexture} color="#8e877c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <sphereGeometry args={[0.38, 32, 18]} />
        <meshStandardMaterial color="#f2efe4" roughness={0.52} metalness={0.02} />
      </mesh>

      <group ref={spillRef}>
        <WaterArc start={[0.2, 2.06, 0]} mid={[1.65, 2.45, 0]} end={[3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[-0.2, 2.06, 0]} mid={[-1.65, 2.42, 0]} end={[-3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[0, 2.06, 0.2]} mid={[0, 2.44, 1.65]} end={[0, 0.78, 3.22]} radius={0.033} />
        <WaterArc start={[0, 2.06, -0.2]} mid={[0, 2.42, -1.65]} end={[0, 0.78, -3.22]} radius={0.033} />
        <WaterArc start={[0, 2.18, 0]} mid={[0, 2.92, 0]} end={[0, 2.24, 0]} radius={0.045} opacity={0.52} />
      </group>

      <FountainDroplets groupRef={dropletRef} />
      <Text
        position={[0, 0.92, 3.95]}
        rotation-x={-0.12}
        fontSize={0.34}
        color="#42b9ff"
        outlineColor="#13283a"
        outlineWidth={0.03}
        anchorX="center"
      >
        MFERS NEVER DIE
      </Text>
    </group>
  );
}

function InstancedFountainStones({ stoneTexture }: { stoneTexture: THREE.Texture }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.52, 0.18, 0.24), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      map: stoneTexture,
      color: "#928a7d",
      roughness: 0.95,
    }),
    [stoneTexture],
  );
  const instances = useMemo(() => buildFountainStoneInstances(), []);

  useLayoutEffect(() => {
    applyStaticPropInstances(meshRef.current, instances);
  }, [instances]);

  return <instancedMesh ref={meshRef} args={[geometry, material, instances.length]} />;
}

function buildFountainStoneInstances() {
  return Array.from({ length: 24 }, (_, index): StaticPropInstance => {
    const angle = (index / 24) * Math.PI * 2;
    return {
      matrix: composeInstanceMatrix(
        [Math.sin(angle) * 4.45, 0.58, Math.cos(angle) * 4.45],
        [0, angle, 0],
        [1, 1, 1],
      ),
    };
  });
}

function WaterArc({
  start,
  mid,
  end,
  radius,
  opacity = 0.44,
}: {
  start: [number, number, number];
  mid: [number, number, number];
  end: [number, number, number];
  radius: number;
  opacity?: number;
}) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(...start),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...end),
    ]),
    [end, mid, start],
  );

  return (
    <mesh>
      <tubeGeometry args={[curve, 28, radius, 10, false]} />
      <meshPhysicalMaterial
        color="#bff7ff"
        roughness={0.02}
        transmission={0.35}
        thickness={0.24}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

function FountainDroplets({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const droplets = useMemo(() => Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 0.45 + (index % 8) * 0.12;
    const height = 1.85 + ((index * 7) % 11) * 0.08;
    const size = 0.026 + (index % 4) * 0.008;
    return { angle, height, radius, size };
  }), []);

  return (
    <group ref={groupRef}>
      {droplets.map(({ angle, height, radius, size }, index) => (
        <mesh
          key={index}
          position={[Math.sin(angle) * radius, height, Math.cos(angle) * radius]}
        >
          <sphereGeometry args={[size, 8, 6]} />
          <meshBasicMaterial color="#e6fbff" transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

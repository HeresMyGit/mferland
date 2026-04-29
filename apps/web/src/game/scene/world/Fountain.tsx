import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

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
  const splashRef = useRef<THREE.Group>(null);
  const dropletRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, "/models/fountain-basin.glb") as { scene: THREE.Group };
  const basinModel = useMemo(() => createFountainBasinModel(gltf.scene), [gltf.scene]);
  void stoneTexture;

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
    if (splashRef.current) {
      for (let index = 0; index < splashRef.current.children.length; index += 1) {
        const splash = splashRef.current.children[index];
        const pulse = 1 + Math.sin(elapsed * 4.8 + index * 1.7) * 0.13;
        splash.scale.set(pulse, 1, pulse);
      }
    }
    if (dropletRef.current) {
      dropletRef.current.rotation.y = elapsed * 0.14;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <primitive object={basinModel} dispose={null} />
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

      <group ref={spillRef}>
        <WaterArc start={[0.2, 2.06, 0]} mid={[1.65, 2.45, 0]} end={[3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[-0.2, 2.06, 0]} mid={[-1.65, 2.42, 0]} end={[-3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[0, 2.06, 0.2]} mid={[0, 2.44, 1.65]} end={[0, 0.78, 3.22]} radius={0.033} />
        <WaterArc start={[0, 2.06, -0.2]} mid={[0, 2.42, -1.65]} end={[0, 0.78, -3.22]} radius={0.033} />
        <WaterArc start={[0, 2.18, 0]} mid={[0, 2.92, 0]} end={[0, 2.24, 0]} radius={0.045} opacity={0.52} />
      </group>

      <WaterFlowHighlights />
      <BasinSplashes groupRef={splashRef} />
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

function createFountainBasinModel(sourceScene: THREE.Group) {
  const scene = sourceScene.clone(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x, -box.min.y, -center.z);
  return scene;
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

function WaterFlowHighlights() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const flows = useMemo(() => buildFlowHighlights(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#f4fdff",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = clock.elapsedTime;
    for (let index = 0; index < flows.length; index += 1) {
      const flow = flows[index];
      const t = (flow.offset + elapsed * flow.speed) % 1;
      const point = flow.curve.getPoint(t);
      const taper = Math.sin(t * Math.PI);
      const size = flow.size * (0.65 + taper * 0.35);

      dummy.position.copy(point);
      dummy.scale.set(size * 0.85, size * 0.55, size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, flows.length]} frustumCulled={false} />;
}

type FlowHighlight = {
  curve: THREE.CatmullRomCurve3;
  offset: number;
  speed: number;
  size: number;
};

function buildFlowHighlights() {
  const streamCurves = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 2.06, 0),
      new THREE.Vector3(1.65, 2.45, 0),
      new THREE.Vector3(3.22, 0.78, 0),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 2.06, 0),
      new THREE.Vector3(-1.65, 2.42, 0),
      new THREE.Vector3(-3.22, 0.78, 0),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.06, 0.2),
      new THREE.Vector3(0, 2.44, 1.65),
      new THREE.Vector3(0, 0.78, 3.22),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.06, -0.2),
      new THREE.Vector3(0, 2.42, -1.65),
      new THREE.Vector3(0, 0.78, -3.22),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.2, 0),
      new THREE.Vector3(0, 2.82, 0),
      new THREE.Vector3(0, 2.28, 0),
    ]),
  ];

  const flows: FlowHighlight[] = [];
  streamCurves.forEach((curve, curveIndex) => {
    const beads = curveIndex === 4 ? 4 : 5;
    for (let bead = 0; bead < beads; bead += 1) {
      flows.push({
        curve,
        offset: (bead / beads + curveIndex * 0.07) % 1,
        speed: curveIndex === 4 ? 0.36 : 0.28,
        size: curveIndex === 4 ? 0.048 : 0.04,
      });
    }
  });

  return flows;
}

function BasinSplashes({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const splashes = useMemo(() => [
    { position: [3.22, 0.78, 0] as [number, number, number], rotation: 0 },
    { position: [-3.22, 0.78, 0] as [number, number, number], rotation: Math.PI },
    { position: [0, 0.78, 3.22] as [number, number, number], rotation: Math.PI / 2 },
    { position: [0, 0.78, -3.22] as [number, number, number], rotation: -Math.PI / 2 },
  ], []);

  return (
    <group ref={groupRef}>
      {splashes.map(({ position, rotation }, index) => (
        <group key={index} position={position} rotation-y={rotation}>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.24, 0.008, 6, 36]} />
            <meshBasicMaterial color="#d8fbff" transparent opacity={0.5} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.11, -0.02]} scale={[0.035, 0.075, 0.035]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color="#f4fdff" transparent opacity={0.58} depthWrite={false} />
          </mesh>
          <mesh position={[0.13, 0.06, 0.03]} scale={[0.022, 0.035, 0.022]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color="#e9fbff" transparent opacity={0.46} depthWrite={false} />
          </mesh>
          <mesh position={[-0.12, 0.07, 0.04]} scale={[0.02, 0.032, 0.02]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color="#e9fbff" transparent opacity={0.42} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FountainDroplets({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const droplets = useMemo(() => Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 0.45 + (index % 8) * 0.12;
    const height = 1.85 + ((index * 7) % 11) * 0.08;
    const size = 0.026 + (index % 4) * 0.008;
    return { angle, height, radius, size };
  }), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: "#e6fbff",
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    droplets.forEach(({ angle, height, radius, size }, index) => {
      dummy.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.count = droplets.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [droplets, dummy]);

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, material, droplets.length]} frustumCulled={false} />
    </group>
  );
}

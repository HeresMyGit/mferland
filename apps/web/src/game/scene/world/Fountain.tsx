import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { getPerformanceModelUrl } from "../../modelQuality";
import { traitsToMeshes, type MferTraits } from "../../mferTraits";

const MFER_MODEL_URL = "https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/builders/mfermashup.glb";
const SARTOSHI_TRAITS: MferTraits = {
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
  watch: "argo_white",
  smoke: "cig_black",
};
const STATUE_FOOT_Y = 1.82;
const STATUE_PEDESTAL_RIM_Y = 1.76;
const STATUE_PEDESTAL_RIM_RADIUS = 0.82;

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
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/fountain-basin.glb")) as { scene: THREE.Group };
  const basinModel = useMemo(() => createFountainBasinModel(gltf.scene), [gltf.scene]);

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
      <SartoshiPedestal stoneTexture={stoneTexture} />
      <SartoshiStatue />
      <mesh ref={surfaceRef} rotation-x={-Math.PI / 2} position={[0, 0.635, 0]}>
        <ringGeometry args={[1.22, 3.72, 128]} />
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
        <torusGeometry args={[1.52, 0.014, 8, 96]} />
        <meshBasicMaterial color="#b7f2ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>

      <group ref={spillRef}>
        <SartoshiSpouts />
        <WaterArc
          start={[STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0]}
          mid={[1.92, 1.86, 0]}
          end={[3.22, 0.78, 0]}
          radius={0.033}
        />
        <WaterArc
          start={[-STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0]}
          mid={[-1.92, 1.86, 0]}
          end={[-3.22, 0.78, 0]}
          radius={0.033}
        />
        <WaterArc
          start={[0, STATUE_PEDESTAL_RIM_Y, STATUE_PEDESTAL_RIM_RADIUS]}
          mid={[0, 1.86, 1.92]}
          end={[0, 0.78, 3.22]}
          radius={0.033}
        />
        <WaterArc
          start={[0, STATUE_PEDESTAL_RIM_Y, -STATUE_PEDESTAL_RIM_RADIUS]}
          mid={[0, 1.86, -1.92]}
          end={[0, 0.78, -3.22]}
          radius={0.033}
        />
      </group>

      <WaterFlowHighlights />
      <BasinSplashes groupRef={splashRef} />
      <FountainDroplets groupRef={dropletRef} />
    </group>
  );
}

function SartoshiPedestal({ stoneTexture }: { stoneTexture: THREE.Texture }) {
  return (
    <group>
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.78, 0.9, 0.22, 18]} />
        <meshStandardMaterial map={stoneTexture} color="#d4c08c" roughness={0.84} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.68, 0.76, 0.08, 18]} />
        <meshStandardMaterial map={stoneTexture} color="#c8b47f" roughness={0.86} />
      </mesh>
      <mesh position={[0, STATUE_PEDESTAL_RIM_Y, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[STATUE_PEDESTAL_RIM_RADIUS, 0.034, 6, 32]} />
        <meshStandardMaterial map={stoneTexture} color="#f0d99d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.5, -0.8]} rotation-x={-0.08}>
        <boxGeometry args={[0.78, 0.22, 0.045]} />
        <meshStandardMaterial color="#3f3325" roughness={0.72} metalness={0.05} />
      </mesh>
      <Text
        position={[0, 1.505, -0.827]}
        rotation-x={-0.08}
        fontSize={0.092}
        anchorX="center"
        anchorY="middle"
        color="#f2dd9b"
        outlineColor="#19120c"
        outlineWidth={0.01}
      >
        SARTOSHI
      </Text>
    </group>
  );
}

function SartoshiSpouts() {
  return (
    <group>
      <SpoutNozzle position={[STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0]} rotationZ={-Math.PI / 2} />
      <SpoutNozzle position={[-STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0]} rotationZ={Math.PI / 2} />
      <SpoutNozzle position={[0, STATUE_PEDESTAL_RIM_Y, STATUE_PEDESTAL_RIM_RADIUS]} rotationX={Math.PI / 2} />
      <SpoutNozzle position={[0, STATUE_PEDESTAL_RIM_Y, -STATUE_PEDESTAL_RIM_RADIUS]} rotationX={-Math.PI / 2} />
    </group>
  );
}

function SpoutNozzle({
  position,
  rotationX = 0,
  rotationZ = 0,
}: {
  position: [number, number, number];
  rotationX?: number;
  rotationZ?: number;
}) {
  return (
    <mesh position={position} rotation-x={rotationX} rotation-z={rotationZ}>
      <cylinderGeometry args={[0.032, 0.052, 0.22, 10]} />
      <meshStandardMaterial color="#7a5c2f" roughness={0.46} metalness={0.36} />
    </mesh>
  );
}

function SartoshiStatue() {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const gltf = useLoader(GLTFLoader, MFER_MODEL_URL) as { scene: THREE.Group };
  const idleFbx = useLoader(FBXLoader, "/animations/Standing_Idle.fbx") as THREE.Group;
  const statue = useMemo(() => createSartoshiStatueModel(gltf.scene), [gltf.scene]);

  useLayoutEffect(() => {
    const idleClip = idleFbx.animations[0];
    if (!idleClip) return;

    const mixer = new THREE.AnimationMixer(statue);
    const action = mixer.clipAction(idleClip);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    mixer.setTime(Math.min(0.35, Math.max(0, idleClip.duration - 0.01)));
    action.paused = true;
    mixer.update(0);
    mixerRef.current = mixer;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(statue);
      mixerRef.current = null;
    };
  }, [idleFbx, statue]);

  return (
    <group position={[0, STATUE_FOOT_Y, 0]} scale={0.76}>
      <primitive object={statue} dispose={null} />
    </group>
  );
}

function createFountainBasinModel(sourceScene: THREE.Group) {
  const scene = sourceScene.clone(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    removeFountainTopBall(child);
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

function removeFountainTopBall(mesh: THREE.Mesh) {
  const sourceGeometry = mesh.geometry;
  const position = sourceGeometry.getAttribute("position");
  const index = sourceGeometry.getIndex();
  if (!position || !index) return;

  const nextGeometry = sourceGeometry.clone();
  const nextIndices: number[] = [];
  const nextGroups: THREE.BufferGeometry["groups"] = [];
  const groups = sourceGeometry.groups.length > 0
    ? sourceGeometry.groups
    : [{ start: 0, count: index.count, materialIndex: 0 }];

  for (const group of groups) {
    const start = nextIndices.length;
    const end = group.start + group.count;
    for (let cursor = group.start; cursor < end; cursor += 3) {
      const a = index.getX(cursor);
      const b = index.getX(cursor + 1);
      const c = index.getX(cursor + 2);
      if (!isTopBallTriangle(position, a, b, c)) {
        nextIndices.push(a, b, c);
      }
    }
    const count = nextIndices.length - start;
    if (count > 0) {
      nextGroups.push({ start, count, materialIndex: group.materialIndex });
    }
  }

  nextGeometry.setIndex(nextIndices);
  nextGeometry.clearGroups();
  for (const group of nextGroups) {
    nextGeometry.addGroup(group.start, group.count, group.materialIndex);
  }
  mesh.geometry = nextGeometry;
}

function isTopBallTriangle(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number, c: number) {
  const centerX = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
  const centerY = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
  const centerZ = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
  const radiusSq = centerX * centerX + centerZ * centerZ;
  return centerY > 1.64 && radiusSq < 0.64;
}

function createSartoshiStatueModel(sourceScene: THREE.Group) {
  const scene = SkeletonUtils.clone(sourceScene) as THREE.Group;
  const visibleMeshes = traitsToMeshes(SARTOSHI_TRAITS);

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
      new THREE.Vector3(STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0),
      new THREE.Vector3(1.92, 1.86, 0),
      new THREE.Vector3(3.22, 0.78, 0),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-STATUE_PEDESTAL_RIM_RADIUS, STATUE_PEDESTAL_RIM_Y, 0),
      new THREE.Vector3(-1.92, 1.86, 0),
      new THREE.Vector3(-3.22, 0.78, 0),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, STATUE_PEDESTAL_RIM_Y, STATUE_PEDESTAL_RIM_RADIUS),
      new THREE.Vector3(0, 1.86, 1.92),
      new THREE.Vector3(0, 0.78, 3.22),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, STATUE_PEDESTAL_RIM_Y, -STATUE_PEDESTAL_RIM_RADIUS),
      new THREE.Vector3(0, 1.86, -1.92),
      new THREE.Vector3(0, 0.78, -3.22),
    ]),
  ];

  const flows: FlowHighlight[] = [];
  streamCurves.forEach((curve, curveIndex) => {
    const beads = 5;
    for (let bead = 0; bead < beads; bead += 1) {
      flows.push({
        curve,
        offset: (bead / beads + curveIndex * 0.07) % 1,
        speed: 0.28,
        size: 0.04,
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
  const droplets = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 1.28 + (index % 7) * 0.14;
    const height = 1.1 + ((index * 7) % 9) * 0.055;
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

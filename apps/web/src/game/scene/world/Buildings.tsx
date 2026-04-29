import { useLayoutEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { HangingSign } from "./TownProps";
import {
  BUILDING_BLUEPRINTS,
  TOWN_BUILDINGS,
  applyStaticPropInstances,
  composeInstanceMatrix,
  type BuildingModuleSpec,
  type BuildingTextureKey,
  type BuildingTextures,
  type StaticPropInstance,
  type TownBuildingPlacement,
  type Vec3Tuple,
} from "./shared";

export function CastleGate({
  stoneTexture,
  position = [0, 0, -30],
  rotation = 0,
}: {
  stoneTexture: THREE.Texture;
  position?: Vec3Tuple;
  rotation?: number;
}) {
  const gltf = useLoader(GLTFLoader, "/models/castle-gate.glb") as { scene: THREE.Group };
  const model = useMemo(() => createCastleGateModel(gltf.scene), [gltf.scene]);
  void stoneTexture;

  return (
    <group position={position} rotation-y={rotation}>
      <primitive object={model} dispose={null} />
    </group>
  );
}

function createCastleGateModel(sourceScene: THREE.Group) {
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

export function InstancedBuildingDetails() {
  const windowFrameRef = useRef<THREE.InstancedMesh>(null);
  const windowGlassRef = useRef<THREE.InstancedMesh>(null);
  const windowMuntinRef = useRef<THREE.InstancedMesh>(null);
  const timberTrimRef = useRef<THREE.InstancedMesh>(null);
  const timberBraceRef = useRef<THREE.InstancedMesh>(null);
  const roofRidgeRef = useRef<THREE.InstancedMesh>(null);
  const roofEaveRef = useRef<THREE.InstancedMesh>(null);
  const roofFasciaRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => ({
    windows: buildBuildingWindowInstances(),
    trim: buildBuildingTrimInstances(),
    roofTrim: buildBuildingRoofTrimInstances(),
  }), []);
  const geometries = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    ridge: new THREE.CylinderGeometry(0.2, 0.2, 1, 8),
  }), []);
  const materials = useMemo(() => ({
    windowFrame: new THREE.MeshBasicMaterial({ color: "#2e2019" }),
    windowGlass: new THREE.MeshBasicMaterial({ color: "#183a38", transparent: true, opacity: 0.86 }),
    windowMuntin: new THREE.MeshBasicMaterial({ color: "#2e2019" }),
    timberTrim: new THREE.MeshBasicMaterial({ color: "#5b331d" }),
    timberBrace: new THREE.MeshBasicMaterial({ color: "#6f3b20" }),
    roofRidge: new THREE.MeshBasicMaterial({ color: "#7c321c" }),
    roofEave: new THREE.MeshBasicMaterial({ color: "#6b341d" }),
    roofFascia: new THREE.MeshBasicMaterial({ color: "#5d2f1a" }),
  }), []);

  useLayoutEffect(() => {
    applyStaticPropInstances(windowFrameRef.current, instances.windows.frames);
    applyStaticPropInstances(windowGlassRef.current, instances.windows.glass);
    applyStaticPropInstances(windowMuntinRef.current, instances.windows.muntins);
    applyStaticPropInstances(timberTrimRef.current, instances.trim.trim);
    applyStaticPropInstances(timberBraceRef.current, instances.trim.braces);
    applyStaticPropInstances(roofRidgeRef.current, instances.roofTrim.ridges);
    applyStaticPropInstances(roofEaveRef.current, instances.roofTrim.eaves);
    applyStaticPropInstances(roofFasciaRef.current, instances.roofTrim.fascia);
  }, [instances]);

  return (
    <>
      <instancedMesh ref={windowFrameRef} args={[geometries.box, materials.windowFrame, instances.windows.frames.length]} />
      <instancedMesh ref={windowGlassRef} args={[geometries.box, materials.windowGlass, instances.windows.glass.length]} />
      <instancedMesh ref={windowMuntinRef} args={[geometries.box, materials.windowMuntin, instances.windows.muntins.length]} />
      <instancedMesh ref={timberTrimRef} args={[geometries.box, materials.timberTrim, instances.trim.trim.length]} />
      <instancedMesh ref={timberBraceRef} args={[geometries.box, materials.timberBrace, instances.trim.braces.length]} />
      <instancedMesh ref={roofRidgeRef} args={[geometries.ridge, materials.roofRidge, instances.roofTrim.ridges.length]} />
      <instancedMesh ref={roofEaveRef} args={[geometries.box, materials.roofEave, instances.roofTrim.eaves.length]} />
      <instancedMesh ref={roofFasciaRef} args={[geometries.box, materials.roofFascia, instances.roofTrim.fascia.length]} />
    </>
  );
}

function buildBuildingWindowInstances() {
  const frames: StaticPropInstance[] = [];
  const glass: StaticPropInstance[] = [];
  const muntins: StaticPropInstance[] = [];

  for (const placement of TOWN_BUILDINGS) {
    const parentMatrix = composeInstanceMatrix(placement.position, [0, placement.rotation, 0], [1, 1, 1]);
    for (const module of BUILDING_BLUEPRINTS[placement.blueprint].modules) {
      if (module.kind !== "window") continue;
      const windowMatrix = composeInstanceMatrix(
        module.position,
        [0, module.rotation ?? 0, 0],
        [1, 1, 1],
        parentMatrix,
      );
      frames.push({ matrix: composeInstanceMatrix([0, 0, 0], [0, 0, 0], [1.1, 1.15, 0.14], windowMatrix) });
      glass.push({ matrix: composeInstanceMatrix([0, 0, 0.08], [0, 0, 0], [0.82, 0.86, 0.08], windowMatrix) });
      muntins.push({ matrix: composeInstanceMatrix([0, 0, 0.13], [0, 0, 0], [0.08, 0.92, 0.05], windowMatrix) });
      muntins.push({ matrix: composeInstanceMatrix([0, 0, 0.14], [0, 0, 0], [0.88, 0.08, 0.05], windowMatrix) });
    }
  }

  return { frames, glass, muntins };
}

function buildBuildingTrimInstances() {
  const trim: StaticPropInstance[] = [];
  const braces: StaticPropInstance[] = [];
  const trimSegments: Array<{ position: Vec3Tuple; scale: Vec3Tuple }> = [
    { position: [-3.72, 2.62, 2.31], scale: [0.26, 4.4, 0.18] },
    { position: [3.72, 2.62, 2.31], scale: [0.26, 4.4, 0.18] },
    { position: [0, 4.72, 2.31], scale: [7.6, 0.26, 0.18] },
    { position: [0, 0.74, 2.31], scale: [7.7, 0.28, 0.2] },
  ];
  const braceSegments: Array<{ position: Vec3Tuple; rotation: Vec3Tuple; scale: Vec3Tuple }> = [
    { position: [-1.75, 3.95, 2.32], rotation: [0, 0, -0.55], scale: [0.25, 3, 0.18] },
    { position: [1.75, 3.95, 2.32], rotation: [0, 0, 0.55], scale: [0.25, 3, 0.18] },
  ];

  for (const placement of TOWN_BUILDINGS) {
    const parentMatrix = composeInstanceMatrix(placement.position, [0, placement.rotation, 0], [1, 1, 1]);
    for (const segment of trimSegments) {
      trim.push({ matrix: composeInstanceMatrix(segment.position, [0, 0, 0], segment.scale, parentMatrix) });
    }
    for (const segment of braceSegments) {
      braces.push({ matrix: composeInstanceMatrix(segment.position, segment.rotation, segment.scale, parentMatrix) });
    }
  }

  return { trim, braces };
}

function buildBuildingRoofTrimInstances() {
  const ridges: StaticPropInstance[] = [];
  const eaves: StaticPropInstance[] = [];
  const fascia: StaticPropInstance[] = [];
  const metrics = getGabledRoofMetrics();
  const fasciaLength = Math.hypot(metrics.run, metrics.ridgeY - (metrics.eaveY - 0.08));

  for (const placement of TOWN_BUILDINGS) {
    const parentMatrix = composeInstanceMatrix(placement.position, [0, placement.rotation, 0], [1, 1, 1]);
    ridges.push({
      matrix: composeInstanceMatrix(
        [0, metrics.ridgeY + 0.03, 0],
        [Math.PI / 2, 0, 0],
        [1, metrics.depth + 0.42, 1],
        parentMatrix,
      ),
    });
    eaves.push({
      matrix: composeInstanceMatrix(
        [-metrics.run - 0.02, metrics.eaveY - 0.06, 0],
        [0, 0, metrics.slopeAngle],
        [0.26, 0.35, metrics.depth + 0.46],
        parentMatrix,
      ),
    });
    eaves.push({
      matrix: composeInstanceMatrix(
        [metrics.run + 0.02, metrics.eaveY - 0.06, 0],
        [0, 0, -metrics.slopeAngle],
        [0.26, 0.35, metrics.depth + 0.46],
        parentMatrix,
      ),
    });

    for (const z of [2.95, -2.95]) {
      fascia.push({
        matrix: composeInstanceMatrix(
          [-metrics.run / 2, (metrics.eaveY - 0.08 + metrics.ridgeY) / 2, z],
          [0, 0, metrics.slopeAngle],
          [fasciaLength, 0.18, 0.18],
          parentMatrix,
        ),
      });
      fascia.push({
        matrix: composeInstanceMatrix(
          [metrics.run / 2, (metrics.eaveY - 0.08 + metrics.ridgeY) / 2, z],
          [0, 0, -metrics.slopeAngle],
          [fasciaLength, 0.18, 0.18],
          parentMatrix,
        ),
      });
      fascia.push({
        matrix: composeInstanceMatrix(
          [0, metrics.eaveY - 0.08, z],
          [0, 0, 0],
          [metrics.run * 2.08, 0.2, 0.2],
          parentMatrix,
        ),
      });
    }
  }

  return { ridges, eaves, fascia };
}

export function TownBuilding({
  placement,
  stoneTexture,
  roofTexture,
  wallTexture,
}: {
  placement: TownBuildingPlacement;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  const gltf = useLoader(GLTFLoader, "/models/town-shopfront.glb") as { scene: THREE.Group };
  const model = useMemo(() => createTownShopfrontModel(gltf.scene), [gltf.scene]);
  void stoneTexture;
  void roofTexture;
  void wallTexture;

  return (
    <group position={placement.position} rotation-y={placement.rotation}>
      <primitive object={model} dispose={null} />
      <ShopSign sign={placement.sign} accent={placement.accent} />
    </group>
  );
}

function createTownShopfrontModel(sourceScene: THREE.Group) {
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

function BuildingModule({
  module,
  placement,
  textures,
}: {
  module: BuildingModuleSpec;
  placement: TownBuildingPlacement;
  textures: BuildingTextures;
}) {
  if (module.kind === "box") return <BuildingBox module={module} placement={placement} textures={textures} />;
  if (module.kind === "gabled-roof") return <GabledRoof roofTexture={textures.roof} />;
  if (module.kind === "trim" || module.kind === "window") return null;
  if (module.kind === "door") return <ShopDoor />;
  return <ShopSign sign={placement.sign} accent={placement.accent} />;
}

function BuildingBox({
  module,
  placement,
  textures,
}: {
  module: Extract<BuildingModuleSpec, { kind: "box" }>;
  placement: TownBuildingPlacement;
  textures: BuildingTextures;
}) {
  const texture = getBuildingTexture(module.material, textures);
  const color = module.material === "accent" ? placement.accent : module.color;

  return (
    <mesh position={module.position} rotation={module.rotation}>
      <boxGeometry args={module.size} />
      <meshBasicMaterial map={texture} color={color} />
    </mesh>
  );
}

function getBuildingTexture(material: BuildingTextureKey, textures: BuildingTextures) {
  if (material === "stone") return textures.stone;
  if (material === "roof") return textures.roof;
  if (material === "wall") return textures.wall;
  return undefined;
}

function ShopSign({ sign, accent }: { sign: string; accent: string }) {
  const fontSize = sign.length > 7 ? 0.46 : sign.length > 5 ? 0.54 : 0.66;

  return (
    <group position={[0, 3.25, 2.56]} scale={[0.68, 0.68, 0.68]}>
      <HangingSign label={sign} color={accent} fontSize={fontSize} />
    </group>
  );
}

function GabledRoof({ roofTexture }: { roofTexture: THREE.Texture }) {
  const { eaveY, ridgeY, run, depth, rise, slopeLength, slopeAngle } = getGabledRoofMetrics();

  return (
    <group>
      <mesh position={[-run / 2, eaveY + rise / 2, 0]} rotation-z={slopeAngle}>
        <boxGeometry args={[slopeLength, 0.18, depth]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <mesh position={[run / 2, eaveY + rise / 2, 0]} rotation-z={-slopeAngle}>
        <boxGeometry args={[slopeLength, 0.18, depth]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <RoofGable z={2.86} eaveY={eaveY - 0.08} ridgeY={ridgeY - 0.2} width={7.28} />
      <RoofGable z={-2.86} eaveY={eaveY - 0.08} ridgeY={ridgeY - 0.2} width={7.28} rotation={Math.PI} />
    </group>
  );
}

function getGabledRoofMetrics() {
  const eaveY = 4.62;
  const ridgeY = 6.22;
  const run = 4.22;
  const depth = 5.62;
  const rise = ridgeY - eaveY;
  const slopeLength = Math.hypot(run, rise);
  const slopeAngle = Math.atan2(rise, run);
  return { eaveY, ridgeY, run, depth, rise, slopeLength, slopeAngle };
}

function RoofGable({
  z,
  eaveY,
  ridgeY,
  width,
  rotation = 0,
}: {
  z: number;
  eaveY: number;
  ridgeY: number;
  width: number;
  rotation?: number;
}) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, eaveY);
  shape.lineTo(0, ridgeY);
  shape.lineTo(width / 2, eaveY);
  shape.lineTo(-width / 2, eaveY);

  return (
    <mesh position={[0, 0, z]} rotation-y={rotation}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color="#ead8b8" side={THREE.DoubleSide} />
    </mesh>
  );
}

function ShopDoor() {
  return (
    <group>
      <mesh position={[0, 1.48, 2.36]}>
        <boxGeometry args={[1.35, 1.92, 0.16]} />
        <meshBasicMaterial color="#4a2b1b" />
      </mesh>
      <mesh position={[0, 2.35, 2.44]}>
        <sphereGeometry args={[0.68, 18, 8]} />
        <meshBasicMaterial color="#4a2b1b" />
      </mesh>
      <mesh position={[0, 0.32, 2.85]}>
        <boxGeometry args={[2.0, 0.36, 1.0]} />
        <meshBasicMaterial color="#8a7c6a" />
      </mesh>
      <mesh position={[0.45, 1.52, 2.48]}>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#f0ca55" />
      </mesh>
    </group>
  );
}

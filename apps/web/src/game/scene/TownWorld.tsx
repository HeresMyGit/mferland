import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { FISHING_ZONE, PLAZA_BOUNDS, WORLD_LANDMARKS, WORLD_ROADS, type WorldLandmark } from "@mferland/shared";
import { CastleGate, TownBuilding } from "./world/Buildings";
import { RundownFarm } from "./world/Farm";
import { Fountain } from "./world/Fountain";
import { DirtPath, GroundDetailLayer, RoadStrip } from "./world/Ground";
import { WorldBackdrop, TreeCluster } from "./world/Trees";
import { BannerPost, HangingSign, MarketStall, SpawnRing, WatchTower } from "./world/TownProps";
import { MARKET_STALLS, OUTPOST_BUILDINGS, OUTPOST_MARKET_STALLS, TOWN_BUILDINGS } from "./world/shared";
import { configureTile, createBarkTexture, createDirtPathTexture, createGrassTuftTexture, createLeafTexture, createWaterTexture } from "./world/textures";
import {
  applyDebugPlacementToBuilding,
  applyDebugPlacementToMarketStall,
  getDebugPlacementTransform,
  type DebugPlacementOverrides,
} from "../debugPlacement";
import { MFER_COLORS } from "../mferPalette";
import { type RenderPerformanceProfile } from "../performance";
import { getPerformanceModelUrl } from "../modelQuality";
export { Skybox } from "./world/Skybox";

const GROUND_MARGIN = 110;
const TOWN_GROUND_WIDTH = PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX + GROUND_MARGIN;
const TOWN_GROUND_DEPTH = PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ + GROUND_MARGIN;
const PLAZA_SURFACE_Y = 0.016;

export function TownWorld({
  debugPlacementOverrides = null,
  renderProfile,
}: {
  debugPlacementOverrides?: DebugPlacementOverrides | null;
  renderProfile: RenderPerformanceProfile;
}) {
  const [grassTexture, cobbleTexture, stoneTexture, roofTexture, timberTexture] = useTexture([
    "/textures/grass-town.webp",
    "/textures/cobblestone-plaza.webp",
    "/textures/castle-stone.webp",
    "/textures/roof-tiles.webp",
    "/textures/timber-plaster.webp",
  ]) as THREE.Texture[];
  const barkTexture = useMemo(() => createBarkTexture(renderProfile), [renderProfile]);
  const leafTexture = useMemo(() => renderProfile.reducedWorldDetail ? null : createLeafTexture(renderProfile), [renderProfile]);
  const waterTexture = useMemo(() => createWaterTexture(renderProfile), [renderProfile]);
  const grassTuftTexture = useMemo(() => renderProfile.reducedWorldDetail ? null : createGrassTuftTexture(renderProfile), [renderProfile]);
  const dirtPathTexture = useMemo(() => createDirtPathTexture(renderProfile), [renderProfile]);

  useEffect(() => {
    configureTile(grassTexture, 5.5, 5.5, renderProfile);
    configureTile(cobbleTexture, 7.5, 7.5, renderProfile);
    configureTile(stoneTexture, 2.2, 2.2, renderProfile);
    configureTile(roofTexture, 1.6, 1.6, renderProfile);
    configureTile(timberTexture, 1.25, 1.25, renderProfile);
  }, [cobbleTexture, grassTexture, renderProfile, roofTexture, stoneTexture, timberTexture]);

  const fountainPlacement = getDebugPlacementTransform("model:fountain", [0, 0, 0], 0, debugPlacementOverrides);
  const castleGatePlacement = getDebugPlacementTransform("model:castle-gate", [0, 0, -30], 0, debugPlacementOverrides);
  const westWatchTowerPlacement = getDebugPlacementTransform("model:watch-tower-west", [-41, 0, -36], 0, debugPlacementOverrides);
  const eastWatchTowerPlacement = getDebugPlacementTransform("model:watch-tower-east", [41, 0, -36], 0, debugPlacementOverrides);
  const ridgeWatchTowerPlacement = getDebugPlacementTransform("model:watch-tower-ridge", [134.2, 0, -108.6], 0, debugPlacementOverrides);
  const farmPlacement = getDebugPlacementTransform("model:farm", [-82, 0, 92], -0.18, debugPlacementOverrides);
  const signalRelayPlacement = getDebugPlacementTransform("model:signal-relay", [136, 0, -121], 0, debugPlacementOverrides);
  const purpleSpawnPlacement = getDebugPlacementTransform("prop:spawn-ring-purple", [5.6, 0.12, 5.6], 0, debugPlacementOverrides);
  const blueSpawnPlacement = getDebugPlacementTransform("prop:spawn-ring-blue", [-6.1, 0.12, 4.4], 0, debugPlacementOverrides);

  return (
    <group>
      {!renderProfile.reducedWorldDetail && leafTexture && <WorldBackdrop barkTexture={barkTexture} leafTexture={leafTexture} />}

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
        <planeGeometry args={[TOWN_GROUND_WIDTH, TOWN_GROUND_DEPTH, 1, 1]} />
        <meshBasicMaterial map={grassTexture} />
      </mesh>

      {WORLD_ROADS.filter((road) => road.surface === "stone").map((road, index) => (
        <RoadStrip
          key={road.id}
          position={[road.x, 0.01 + index * 0.0005, road.z]}
          size={[road.width, road.depth]}
          texture={cobbleTexture}
          renderProfile={renderProfile}
        />
      ))}
      {WORLD_ROADS.filter((road) => road.surface === "dirt").map((road, index) => (
        <DirtPath
          key={road.id}
          position={[road.x, 0.015 + index * 0.0005, road.z]}
          size={[road.width, road.depth]}
          texture={dirtPathTexture}
          renderProfile={renderProfile}
        />
      ))}
      <PlazaApron texture={cobbleTexture} renderProfile={renderProfile} />

      <mesh position={[0, -0.035, 0]}>
        <cylinderGeometry args={[21, 21, 0.09, 96]} />
        <meshBasicMaterial color="#756d62" />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, PLAZA_SURFACE_Y, 0]}>
        <circleGeometry args={[21, 128]} />
        <meshBasicMaterial map={cobbleTexture} />
      </mesh>

      <mesh rotation-x={Math.PI / 2} position={[0, 0.13, 0]}>
        <torusGeometry args={[21, 0.13, 8, 128]} />
        <meshBasicMaterial color="#635f55" />
      </mesh>

      {!renderProfile.reducedWorldDetail && grassTuftTexture && <GroundDetailLayer grassTuftTexture={grassTuftTexture} />}
      <group position={fountainPlacement.position} rotation-y={fountainPlacement.rotation}>
        <Fountain stoneTexture={stoneTexture} waterTexture={waterTexture} renderProfile={renderProfile} />
      </group>
      <CastleGate
        stoneTexture={stoneTexture}
        position={castleGatePlacement.position}
        rotation={castleGatePlacement.rotation}
        renderProfile={renderProfile}
      />
      {TOWN_BUILDINGS.map((building) => (
        <TownBuilding
          key={building.id}
          placement={applyDebugPlacementToBuilding(building, debugPlacementOverrides)}
          stoneTexture={stoneTexture}
          roofTexture={roofTexture}
          wallTexture={timberTexture}
          renderProfile={renderProfile}
        />
      ))}
      {OUTPOST_BUILDINGS.map((building) => (
        <TownBuilding
          key={building.id}
          placement={applyDebugPlacementToBuilding(building, debugPlacementOverrides)}
          stoneTexture={stoneTexture}
          roofTexture={roofTexture}
          wallTexture={timberTexture}
          renderProfile={renderProfile}
        />
      ))}
      {MARKET_STALLS.map((stall) => (
        <MarketStall key={stall.id} stall={applyDebugPlacementToMarketStall(stall, debugPlacementOverrides)} roofTexture={roofTexture} renderProfile={renderProfile} />
      ))}
      {OUTPOST_MARKET_STALLS.map((stall) => (
        <MarketStall key={stall.id} stall={applyDebugPlacementToMarketStall(stall, debugPlacementOverrides)} roofTexture={roofTexture} renderProfile={renderProfile} />
      ))}
      <WatchTower position={westWatchTowerPlacement.position} rotation={westWatchTowerPlacement.rotation} stoneTexture={stoneTexture} roofTexture={roofTexture} renderProfile={renderProfile} />
      <WatchTower position={eastWatchTowerPlacement.position} rotation={eastWatchTowerPlacement.rotation} stoneTexture={stoneTexture} roofTexture={roofTexture} renderProfile={renderProfile} />
      <WatchTower position={ridgeWatchTowerPlacement.position} rotation={ridgeWatchTowerPlacement.rotation} stoneTexture={stoneTexture} roofTexture={roofTexture} renderProfile={renderProfile} />
      <RundownFarm position={farmPlacement.position} rotation={farmPlacement.rotation} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} barkTexture={barkTexture} renderProfile={renderProfile} />
      <FishingPond waterTexture={waterTexture} renderProfile={renderProfile} debugPlacementOverrides={debugPlacementOverrides} />
      <SignalRelay position={signalRelayPlacement.position} rotation={signalRelayPlacement.rotation} renderProfile={renderProfile} />
      {WORLD_LANDMARKS.map((landmark) => {
        const transform = getDebugPlacementTransform(`prop:route-marker:${landmark.id}`, [landmark.x, 0, landmark.z], -Math.PI / 2, debugPlacementOverrides);
        return (
          <SignalRouteMarker
            key={landmark.id}
            landmark={landmark}
            rotation={transform.rotation}
            position={transform.position}
            renderProfile={renderProfile}
          />
        );
      })}
      <SpawnRing position={purpleSpawnPlacement.position} rotation={purpleSpawnPlacement.rotation} />
      <SpawnRing position={blueSpawnPlacement.position} rotation={blueSpawnPlacement.rotation} color={MFER_COLORS.signal} />
      <DebugBannerPost id="prop:banner-gate-left" position={[-7.2, 0, -19.8]} color={MFER_COLORS.friendly} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-gate-right" position={[7.2, 0, -19.8]} color={MFER_COLORS.friendly} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-west-road" position={[-23.5, 0, -39]} color={MFER_COLORS.player} rotation={Math.PI / 2} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-east-road" position={[23.5, 0, -39]} color={MFER_COLORS.player} rotation={-Math.PI / 2} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-inn" position={[-7.2, 0, 39]} color={MFER_COLORS.relay} rotation={Math.PI} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-forge" position={[7.2, 0, 39]} color={MFER_COLORS.fire} rotation={Math.PI} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-farm-route" position={[-83.8, 0, 59.6]} color={MFER_COLORS.relay} rotation={Math.PI / 2} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-field-camp" position={[-112, 0, 126]} color={MFER_COLORS.friendly} rotation={Math.PI} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-ridge-route" position={[94, 0, -22]} color={MFER_COLORS.signal} rotation={-Math.PI / 2} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-ridge-entry" position={[123, 0, -91]} color={MFER_COLORS.relay} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-relay-north" position={[137.5, 0, -91]} color={MFER_COLORS.hostile} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      <DebugBannerPost id="prop:banner-relay-south" position={[137.5, 0, -116.5]} color={MFER_COLORS.hostile} rotation={Math.PI} overrides={debugPlacementOverrides} renderProfile={renderProfile} />
      {!renderProfile.reducedWorldDetail && leafTexture && <TreeCluster barkTexture={barkTexture} leafTexture={leafTexture} />}
    </group>
  );
}

function FishingPond({
  waterTexture,
  renderProfile,
  debugPlacementOverrides,
}: {
  waterTexture: THREE.Texture;
  renderProfile: RenderPerformanceProfile;
  debugPlacementOverrides?: DebugPlacementOverrides | null;
}) {
  const pondPlacement = getDebugPlacementTransform("model:fishing-pond", [FISHING_ZONE.x, 0, FISHING_ZONE.z], 0, debugPlacementOverrides);
  const dockPlacement = getDebugPlacementTransform(
    "prop:fishing-dock",
    [FISHING_ZONE.x + 7.2, 0.08, FISHING_ZONE.z - 4.8],
    -0.62,
    debugPlacementOverrides,
  );
  const reedCount = renderProfile.reducedWorldDetail ? 8 : 18;
  const reeds = useMemo(() => Array.from({ length: reedCount }, (_, index) => {
    const angle = (index / reedCount) * Math.PI * 2 + (index % 2) * 0.12;
    const radius = FISHING_ZONE.waterRadius + 0.85 + (index % 3) * 0.28;
    return {
      x: FISHING_ZONE.x + Math.cos(angle) * radius,
      z: FISHING_ZONE.z + Math.sin(angle) * radius,
      rotation: -angle,
      height: 0.9 + (index % 4) * 0.18,
    };
  }), [reedCount]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0], 0.018, pondPlacement.position[2]]}>
        <circleGeometry args={[FISHING_ZONE.waterRadius + 1.25, 96]} />
        <meshBasicMaterial color="#6c5f42" transparent opacity={0.72} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0], 0.032, pondPlacement.position[2]]}>
        <circleGeometry args={[FISHING_ZONE.waterRadius, 128]} />
        <meshBasicMaterial map={waterTexture} color="#5db4c7" transparent opacity={0.84} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0], 0.043, pondPlacement.position[2]]}>
        <ringGeometry args={[FISHING_ZONE.waterRadius - 0.22, FISHING_ZONE.waterRadius + 0.12, 128]} />
        <meshBasicMaterial color="#d8c18a" transparent opacity={0.48} side={THREE.DoubleSide} />
      </mesh>
      <group position={dockPlacement.position} rotation-y={dockPlacement.rotation}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[4.4, 0.24, 1.1]} />
          <meshBasicMaterial color="#765334" />
        </mesh>
        {[-1.6, -0.55, 0.55, 1.6].map((x) => (
          <mesh key={x} position={[x, 0.38, 0.52]}>
            <cylinderGeometry args={[0.08, 0.1, 0.75, 8]} />
            <meshBasicMaterial color="#51341f" />
          </mesh>
        ))}
      </group>
      {reeds.map((reed, index) => (
        <group key={index} position={[reed.x, 0.05, reed.z]} rotation-y={reed.rotation}>
          <mesh position={[0, reed.height / 2, 0]} rotation-z={0.18}>
            <boxGeometry args={[0.08, reed.height, 0.05]} />
            <meshBasicMaterial color={index % 2 === 0 ? "#4e7c3a" : "#6f8d3f"} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PlazaApron({ texture, renderProfile }: { texture: THREE.Texture; renderProfile: RenderPerformanceProfile }) {
  const apronTexture = useMemo(() => {
    const map = texture.clone();
    configureTile(map, 6.4, 5.2, renderProfile);
    return map;
  }, [renderProfile, texture]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 2]}>
        <planeGeometry args={[58, 46]} />
        <meshBasicMaterial map={apronTexture} color="#968a70" />
      </mesh>
      <mesh position={[0, 0.11, -21]}>
        <boxGeometry args={[58, 0.18, 0.35]} />
        <meshBasicMaterial color="#6a6356" />
      </mesh>
      <mesh position={[0, 0.11, 25]}>
        <boxGeometry args={[58, 0.18, 0.35]} />
        <meshBasicMaterial color="#6a6356" />
      </mesh>
      <mesh position={[-29, 0.11, 2]}>
        <boxGeometry args={[0.35, 0.18, 46]} />
        <meshBasicMaterial color="#6a6356" />
      </mesh>
      <mesh position={[29, 0.11, 2]}>
        <boxGeometry args={[0.35, 0.18, 46]} />
        <meshBasicMaterial color="#6a6356" />
      </mesh>
    </group>
  );
}

function SignalRouteMarker({
  landmark,
  position,
  rotation,
  renderProfile,
}: {
  landmark: WorldLandmark;
  position: [number, number, number];
  rotation: number;
  renderProfile: RenderPerformanceProfile;
}) {
  const accent = landmark.kind === "relay" ? MFER_COLORS.relay : MFER_COLORS.signal;
  const trim = landmark.kind === "relay" ? "#5c3aa8" : "#16798a";
  const labelSize = landmark.label.length > 4 ? 0.7 : 0.86;

  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.22, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 2.44, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0, 2.08, 0.02]}>
        <boxGeometry args={[1.72, 0.11, 0.12]} />
        <meshBasicMaterial color={trim} />
      </mesh>
      <group position={[0, 1.86, 0.14]} scale={[0.33, 0.33, 0.33]}>
        <HangingSign
          label={landmark.label}
          color={accent}
          fontSize={labelSize}
          textColor="#271d14"
          outlineColor="#f9edc8"
          renderProfile={renderProfile}
        />
      </group>
      <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.48, 0.54, 44]} />
        <meshBasicMaterial color={accent} transparent opacity={0.44} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function SignalRelay({
  position,
  rotation,
  renderProfile,
}: {
  position: [number, number, number];
  rotation: number;
  renderProfile: RenderPerformanceProfile;
}) {
  const gltf = useLoader(GLTFLoader, getPerformanceModelUrl("/models/signal-relay-body.glb", renderProfile)) as { scene: THREE.Group };
  const bodyModel = useMemo(() => createSignalRelayBodyModel(gltf.scene), [gltf.scene]);

  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.4, 2.65, 64]} />
        <meshBasicMaterial color={MFER_COLORS.signal} transparent opacity={0.52} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={bodyModel} dispose={null} />
      <mesh position={[0, 5.75, 0]}>
        <octahedronGeometry args={[0.72, 0]} />
        <meshBasicMaterial color={MFER_COLORS.signal} transparent opacity={0.9} />
      </mesh>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[0, 4.25 - index * 0.78, 0]} rotation-y={(index * Math.PI) / 3}>
          <torusGeometry args={[0.82 + index * 0.26, 0.035, 8, 40]} />
          <meshBasicMaterial color={index % 2 === 0 ? MFER_COLORS.signal : MFER_COLORS.relay} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function DebugBannerPost({
  id,
  position,
  rotation = 0,
  color,
  overrides,
  renderProfile,
}: {
  id: string;
  position: [number, number, number];
  rotation?: number;
  color: string;
  overrides: DebugPlacementOverrides | null | undefined;
  renderProfile: RenderPerformanceProfile;
}) {
  const transform = getDebugPlacementTransform(id, position, rotation, overrides);
  return <BannerPost position={transform.position} color={color} rotation={transform.rotation} renderProfile={renderProfile} />;
}

function createSignalRelayBodyModel(sourceScene: THREE.Group) {
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

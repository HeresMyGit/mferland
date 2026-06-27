import { useEffect, useMemo } from "react";
import { Text, useTexture } from "@react-three/drei";
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

const FISHING_POND_REED_ANGLES = [
  0.18,
  0.42,
  0.76,
  1.08,
  1.42,
  1.86,
  2.18,
  2.48,
  2.82,
  3.16,
  3.52,
  3.92,
  4.26,
  4.58,
  4.94,
  5.32,
  5.68,
  5.98,
] as const;
const FISHING_POND_LILYPADS = [
  { x: -4.4, z: 127.4, scale: 0.7, rotation: 0.3, flower: true },
  { x: -6.1, z: 134.2, scale: 0.92, rotation: -0.4 },
  { x: 2.8, z: 137.7, scale: 0.82, rotation: 1.1, flower: true },
  { x: 5.2, z: 130.2, scale: 0.62, rotation: -1.2 },
  { x: -1.2, z: 124.6, scale: 0.52, rotation: 2.2 },
] as const;
const FISHING_POND_ROCKS = [
  { x: -11.8, z: 130.4, scale: [0.92, 0.22, 0.58], rotation: 0.15 },
  { x: -8.9, z: 121.6, scale: [0.62, 0.18, 0.42], rotation: -0.45 },
  { x: 9.8, z: 140.3, scale: [0.72, 0.2, 0.5], rotation: 0.62 },
  { x: 12.2, z: 127.6, scale: [0.56, 0.16, 0.4], rotation: -0.28 },
] as const;

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
  const dockPlacement = getDebugPlacementTransform("prop:fishing-dock", [8.1, 0.08, 125.6], -0.72, debugPlacementOverrides);
  const marketPlacement = getDebugPlacementTransform("prop:fishing-market-station", [4.6, 0, 115], -0.22, debugPlacementOverrides);
  const tacklePlacement = getDebugPlacementTransform("prop:fishing-tackle-station", [12.5, 0, 119.1], -0.72, debugPlacementOverrides);
  const ledgerPlacement = getDebugPlacementTransform("prop:fishing-ledger-board", [14.7, 0, 130.8], -1.46, debugPlacementOverrides);
  const goodiesPlacement = getDebugPlacementTransform("prop:fishing-goodies-station", [21.3, 0, 124.4], -1.22, debugPlacementOverrides);
  const reedAngles = renderProfile.reducedWorldDetail ? FISHING_POND_REED_ANGLES.filter((_, index) => index % 2 === 0) : FISHING_POND_REED_ANGLES;
  const reeds = useMemo(() => reedAngles.map((angle, index) => {
    const radius = FISHING_ZONE.waterRadius + 0.72 + (index % 3) * 0.28;
    return {
      x: FISHING_ZONE.x + Math.cos(angle) * radius,
      z: FISHING_ZONE.z + Math.sin(angle) * radius,
      rotation: Math.PI / 2 - angle,
      height: 0.86 + (index % 4) * 0.18,
    };
  }), [reedAngles]);

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
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0], 0.049, pondPlacement.position[2]]}>
        <ringGeometry args={[2.2, 2.34, 72]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0] - 3.7, 0.05, pondPlacement.position[2] + 3.5]}>
        <ringGeometry args={[1.15, 1.24, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[pondPlacement.position[0] + 4.8, 0.051, pondPlacement.position[2] - 1.9]}>
        <ringGeometry args={[1.45, 1.56, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
      <FishingDock position={dockPlacement.position} rotation={dockPlacement.rotation} />
      <FishMarketStation position={marketPlacement.position} rotation={marketPlacement.rotation} />
      <TackleStation position={tacklePlacement.position} rotation={tacklePlacement.rotation} />
      <LedgerStation position={ledgerPlacement.position} rotation={ledgerPlacement.rotation} />
      <GoodiesStation position={goodiesPlacement.position} rotation={goodiesPlacement.rotation} />
      {FISHING_POND_LILYPADS.map((pad, index) => (
        <LilyPad key={index} {...pad} />
      ))}
      {FISHING_POND_ROCKS.map((rock, index) => (
        <mesh key={index} position={[rock.x, 0.08, rock.z]} rotation-y={rock.rotation} scale={rock.scale}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={index % 2 === 0 ? "#766f5e" : "#8b8067"} />
        </mesh>
      ))}
      {reeds.map((reed, index) => (
        <group key={index} position={[reed.x, 0.05, reed.z]} rotation-y={reed.rotation}>
          <ReedCluster height={reed.height} variant={index} />
        </group>
      ))}
    </group>
  );
}

function FishingDock({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const plankColors = ["#7e5736", "#8d6843", "#6f4a2e", "#94704b", "#7a5436"] as const;
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[6.1, 2.1]} />
        <meshBasicMaterial color="#1d140e" transparent opacity={0.22} />
      </mesh>
      {[-2.4, -1.2, 0, 1.2, 2.4].map((x, index) => (
        <mesh key={x} position={[x, 0.16, 0]}>
          <boxGeometry args={[1.02, 0.24, 1.46]} />
          <meshBasicMaterial color={plankColors[index]} />
        </mesh>
      ))}
      {[-2.92, 2.92].map((x) => (
        <mesh key={x} position={[x, 0.08, 0]}>
          <boxGeometry args={[0.18, 0.18, 1.76]} />
          <meshBasicMaterial color="#4b2c18" />
        </mesh>
      ))}
      {[-2.6, -0.85, 0.85, 2.6].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.47, 0.66]}>
            <cylinderGeometry args={[0.08, 0.1, 0.96, 8]} />
            <meshBasicMaterial color="#4e321f" />
          </mesh>
          <mesh position={[x, 0.47, -0.66]}>
            <cylinderGeometry args={[0.08, 0.1, 0.96, 8]} />
            <meshBasicMaterial color="#4e321f" />
          </mesh>
        </group>
      ))}
      <RopeRail position={[0, 0.77, 0.66]} length={5.2} axis="x" />
      <RopeRail position={[0, 0.77, -0.66]} length={5.2} axis="x" />
      <mesh position={[2.86, 0.18, -1.08]}>
        <boxGeometry args={[1.25, 0.22, 1.36]} />
        <meshBasicMaterial color="#7a5436" />
      </mesh>
      <mesh position={[3.34, 0.08, -1.08]}>
        <boxGeometry args={[0.18, 0.2, 1.52]} />
        <meshBasicMaterial color="#4b2c18" />
      </mesh>
    </group>
  );
}

function FishMarketStation({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.45, 36]} />
        <meshBasicMaterial color="#5d432e" transparent opacity={0.18} />
      </mesh>
      <Crate position={[-0.55, 0.28, 0.12]} scale={[1.05, 0.55, 0.78]} color="#795638" />
      <Crate position={[0.54, 0.22, 0.38]} scale={[0.82, 0.44, 0.62]} color="#68462d" />
      <Barrel position={[1.36, 0.33, -0.35]} />
      <mesh position={[-0.48, 0.72, 0.12]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.32, 0.035, 8, 24]} />
        <meshBasicMaterial color="#c9d7d9" />
      </mesh>
      <mesh position={[-0.02, 0.76, 0.07]} rotation-z={0.25}>
        <boxGeometry args={[0.76, 0.1, 0.18]} />
        <meshBasicMaterial color="#94b9c2" />
      </mesh>
      <Lantern position={[-1.42, 0, -0.86]} />
    </group>
  );
}

function TackleStation({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.35, 36]} />
        <meshBasicMaterial color="#6a5134" transparent opacity={0.16} />
      </mesh>
      <RodRack position={[-0.62, 0, 0.24]} />
      <Crate position={[0.7, 0.23, 0.2]} scale={[0.82, 0.46, 0.58]} color="#765335" />
      <Bucket position={[1.24, 0.23, -0.58]} />
      <Lantern position={[-1.42, 0, -0.72]} color="#ffd46b" />
    </group>
  );
}

function LedgerStation({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.025, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.2, 36]} />
        <meshBasicMaterial color="#4a3326" transparent opacity={0.2} />
      </mesh>
      <NoticeBoard />
      <Crate position={[1.16, 0.22, -0.42]} scale={[0.64, 0.44, 0.52]} color="#6f4a2f" />
      <Lantern position={[-1.18, 0, -0.8]} color="#ffe18a" />
    </group>
  );
}

function GoodiesStation({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.032, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.22, 1.42, 48]} />
        <meshBasicMaterial color={MFER_COLORS.signal} transparent opacity={0.28} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.035, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.06, 48]} />
        <meshBasicMaterial color="#15343b" transparent opacity={0.16} />
      </mesh>
      <PrizeChest />
      <Crate position={[1.18, 0.24, 0.22]} scale={[0.72, 0.48, 0.62]} color="#5f432d" />
      <Lantern position={[-1.34, 0, -0.72]} color={MFER_COLORS.signal} />
    </group>
  );
}

function NoticeBoard() {
  return (
    <group>
      <mesh position={[-0.72, 0.76, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 1.52, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0.72, 0.76, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 1.52, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0, 1.16, 0.05]}>
        <boxGeometry args={[1.92, 0.92, 0.14]} />
        <meshBasicMaterial color="#775234" />
      </mesh>
      <mesh position={[0, 1.18, 0.13]}>
        <boxGeometry args={[1.64, 0.62, 0.04]} />
        <meshBasicMaterial color="#efe2b8" />
      </mesh>
      <Text position={[0, 1.25, 0.18]} fontSize={0.22} color="#2a1b12" anchorX="center" anchorY="middle">
        POND
      </Text>
      <Text position={[0, 1.02, 0.18]} fontSize={0.16} color="#2a1b12" anchorX="center" anchorY="middle">
        3 / DAY
      </Text>
    </group>
  );
}

function PrizeChest() {
  return (
    <group>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[1.2, 0.54, 0.76]} />
        <meshBasicMaterial color="#5b3a25" />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[1.26, 0.18, 0.82]} />
        <meshBasicMaterial color="#735338" />
      </mesh>
      <mesh position={[0, 0.67, 0.43]}>
        <boxGeometry args={[1.32, 0.12, 0.08]} />
        <meshBasicMaterial color={MFER_COLORS.signal} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, 0.34, 0.43]}>
        <boxGeometry args={[0.22, 0.32, 0.1]} />
        <meshBasicMaterial color="#e0c66f" />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.86, 1.02, 48]} />
        <meshBasicMaterial color={MFER_COLORS.signal} transparent opacity={0.36} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function RodRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[-0.38, 0.68, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 1.34, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0.38, 0.68, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 1.34, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0, 1.12, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
        <meshBasicMaterial color="#5a3520" />
      </mesh>
      {[-0.28, 0, 0.28].map((x, index) => (
        <mesh key={x} position={[x, 0.82, 0.18]} rotation-z={0.34 + index * 0.08} rotation-x={0.12}>
          <cylinderGeometry args={[0.025, 0.032, 1.6, 8]} />
          <meshBasicMaterial color={index === 1 ? MFER_COLORS.signal : "#392719"} />
        </mesh>
      ))}
    </group>
  );
}

function ReedCluster({ height, variant }: { height: number; variant: number }) {
  return (
    <group>
      {[0, 1, 2].map((stem) => (
        <mesh key={stem} position={[(stem - 1) * 0.12, height / 2, stem % 2 === 0 ? 0.04 : -0.03]} rotation-z={0.12 + stem * 0.08}>
          <boxGeometry args={[0.065, height - stem * 0.08, 0.045]} />
          <meshBasicMaterial color={(variant + stem) % 2 === 0 ? "#4e7c3a" : "#6f8d3f"} />
        </mesh>
      ))}
      {variant % 3 === 0 && (
        <mesh position={[0.18, height + 0.04, 0.02]}>
          <cylinderGeometry args={[0.055, 0.055, 0.42, 8]} />
          <meshBasicMaterial color="#7b4a2d" />
        </mesh>
      )}
    </group>
  );
}

function LilyPad({ x, z, scale, rotation, flower = false }: { x: number; z: number; scale: number; rotation: number; flower?: boolean }) {
  return (
    <group position={[x, 0.056, z]} rotation-y={rotation} scale={[scale, scale, scale]}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.62, 32, 0.5, Math.PI * 1.68]} />
        <meshBasicMaterial color="#3f7f42" side={THREE.DoubleSide} />
      </mesh>
      {flower && (
        <mesh position={[0.12, 0.035, 0.04]}>
          <sphereGeometry args={[0.11, 10, 6]} />
          <meshBasicMaterial color="#f2c7dd" />
        </mesh>
      )}
    </group>
  );
}

function RopeRail({ position, length, axis }: { position: [number, number, number]; length: number; axis: "x" | "z" }) {
  return (
    <mesh position={position} rotation-z={axis === "x" ? Math.PI / 2 : 0} rotation-x={axis === "z" ? Math.PI / 2 : 0}>
      <cylinderGeometry args={[0.035, 0.035, length, 8]} />
      <meshBasicMaterial color="#d2b06f" />
    </mesh>
  );
}

function Crate({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={scale} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, scale[1] * 0.08, scale[2] * 0.52]}>
        <boxGeometry args={[scale[0] * 1.06, 0.08, 0.08]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
    </group>
  );
}

function Barrel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.34, 0.34, 0.62, 14]} />
        <meshBasicMaterial color="#6f482b" />
      </mesh>
      <mesh position={[0, 0, 0.32]} rotation-z={Math.PI / 2}>
        <torusGeometry args={[0.34, 0.025, 8, 18]} />
        <meshBasicMaterial color="#2e2217" />
      </mesh>
    </group>
  );
}

function Bucket({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.27, 0.22, 0.42, 16]} />
        <meshBasicMaterial color="#4b5961" />
      </mesh>
      <mesh position={[0, 0.24, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.28, 0.025, 8, 20]} />
        <meshBasicMaterial color="#2c3338" />
      </mesh>
    </group>
  );
}

function Lantern({ position, color = "#ffcf63" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.92, 8]} />
        <meshBasicMaterial color="#3b2819" />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[0.16, 0.12, 0.16]} />
        <meshBasicMaterial color="#3b2819" />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.18, 12, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.48, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} />
      </mesh>
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

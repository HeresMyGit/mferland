import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { PLAZA_BOUNDS, WORLD_ROADS } from "@mferland/shared";
import { CastleGate, InstancedBuildingDetails, TownBuilding } from "./world/Buildings";
import { RundownFarm } from "./world/Farm";
import { Fountain } from "./world/Fountain";
import { DirtPath, GroundDetailLayer, RoadStrip } from "./world/Ground";
import { WorldBackdrop, TreeCluster } from "./world/Trees";
import { BannerPost, InstancedMarketProps, MarketStall, SpawnRing, WatchTower } from "./world/TownProps";
import { MARKET_STALLS, OUTPOST_BUILDINGS, OUTPOST_MARKET_STALLS, TOWN_BUILDINGS } from "./world/shared";
import { configureTile, createBarkTexture, createGrassTuftTexture, createLeafTexture, createWaterTexture } from "./world/textures";
export { Skybox } from "./world/Skybox";

const GROUND_MARGIN = 60;
const TOWN_GROUND_WIDTH = PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX + GROUND_MARGIN;
const TOWN_GROUND_DEPTH = PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ + GROUND_MARGIN;

export function TownWorld() {
  const [grassTexture, cobbleTexture, stoneTexture, roofTexture, timberTexture] = useTexture([
    "/textures/grass-town.webp",
    "/textures/cobblestone-plaza.webp",
    "/textures/castle-stone.webp",
    "/textures/roof-tiles.webp",
    "/textures/timber-plaster.webp",
  ]) as THREE.Texture[];
  const barkTexture = useMemo(() => createBarkTexture(), []);
  const leafTexture = useMemo(() => createLeafTexture(), []);
  const waterTexture = useMemo(() => createWaterTexture(), []);
  const grassTuftTexture = useMemo(() => createGrassTuftTexture(), []);

  useEffect(() => {
    configureTile(grassTexture, 5.5, 5.5);
    configureTile(cobbleTexture, 7.5, 7.5);
    configureTile(stoneTexture, 2.2, 2.2);
    configureTile(roofTexture, 1.6, 1.6);
    configureTile(timberTexture, 1.25, 1.25);
  }, [cobbleTexture, grassTexture, roofTexture, stoneTexture, timberTexture]);

  return (
    <group>
      <WorldBackdrop barkTexture={barkTexture} leafTexture={leafTexture} />

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
        />
      ))}
      {WORLD_ROADS.filter((road) => road.surface === "dirt").map((road, index) => (
        <DirtPath
          key={road.id}
          position={[road.x, 0.015 + index * 0.0005, road.z]}
          size={[road.width, road.depth]}
        />
      ))}

      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[21, 21, 0.16, 96]} />
        <meshBasicMaterial color="#756d62" />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.092, 0]}>
        <circleGeometry args={[21, 128]} />
        <meshBasicMaterial map={cobbleTexture} />
      </mesh>

      <mesh rotation-x={Math.PI / 2} position={[0, 0.22, 0]}>
        <torusGeometry args={[21, 0.22, 8, 128]} />
        <meshBasicMaterial color="#635f55" />
      </mesh>

      <GroundDetailLayer grassTuftTexture={grassTuftTexture} />
      <Fountain stoneTexture={stoneTexture} waterTexture={waterTexture} />
      <CastleGate stoneTexture={stoneTexture} />
      {TOWN_BUILDINGS.map((building) => (
        <TownBuilding
          key={building.id}
          placement={building}
          stoneTexture={stoneTexture}
          roofTexture={roofTexture}
          wallTexture={timberTexture}
        />
      ))}
      {OUTPOST_BUILDINGS.map((building) => (
        <TownBuilding
          key={building.id}
          placement={building}
          stoneTexture={stoneTexture}
          roofTexture={roofTexture}
          wallTexture={timberTexture}
        />
      ))}
      <InstancedBuildingDetails />
      {MARKET_STALLS.map((stall) => (
        <MarketStall key={stall.id} stall={stall} roofTexture={roofTexture} />
      ))}
      {OUTPOST_MARKET_STALLS.map((stall) => (
        <MarketStall key={stall.id} stall={stall} roofTexture={roofTexture} />
      ))}
      <InstancedMarketProps stalls={[...MARKET_STALLS, ...OUTPOST_MARKET_STALLS]} />
      <WatchTower position={[-41, 0, -36]} stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <WatchTower position={[41, 0, -36]} stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <WatchTower position={[134.2, 0, -108.6]} stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <RundownFarm position={[-104, 0, 92]} rotation={-0.18} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} barkTexture={barkTexture} />
      <SignalRelay position={[136, 0, -121]} />
      <SpawnRing position={[5.6, 0.12, 5.6]} />
      <SpawnRing position={[-6.1, 0.12, 4.4]} color="#59ccff" />
      <BannerPost position={[-7.2, 0, -19.8]} color="#328346" />
      <BannerPost position={[7.2, 0, -19.8]} color="#328346" />
      <BannerPost position={[-23.5, 0, -39]} color="#395da8" rotation={Math.PI / 2} />
      <BannerPost position={[23.5, 0, -39]} color="#395da8" rotation={-Math.PI / 2} />
      <BannerPost position={[-7.2, 0, 39]} color="#9b45ff" rotation={Math.PI} />
      <BannerPost position={[7.2, 0, 39]} color="#e18b35" rotation={Math.PI} />
      <BannerPost position={[-83.8, 0, 59.6]} color="#9b45ff" rotation={Math.PI / 2} />
      <BannerPost position={[-112, 0, 126]} color="#52d64f" rotation={Math.PI} />
      <BannerPost position={[94, 0, -22]} color="#36b7c9" rotation={-Math.PI / 2} />
      <BannerPost position={[123, 0, -91]} color="#9b45ff" />
      <TreeCluster barkTexture={barkTexture} leafTexture={leafTexture} />
    </group>
  );
}

function SignalRelay({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.4, 2.65, 64]} />
        <meshBasicMaterial color="#7ddcff" transparent opacity={0.52} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.8, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 5.6, 10]} />
        <meshBasicMaterial color="#3b3544" />
      </mesh>
      <mesh position={[0, 5.75, 0]}>
        <octahedronGeometry args={[0.72, 0]} />
        <meshBasicMaterial color="#7ddcff" transparent opacity={0.9} />
      </mesh>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[0, 4.25 - index * 0.78, 0]} rotation-y={(index * Math.PI) / 3}>
          <torusGeometry args={[0.82 + index * 0.26, 0.035, 8, 40]} />
          <meshBasicMaterial color={index % 2 === 0 ? "#7ddcff" : "#b38cff"} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

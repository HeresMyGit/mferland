import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { PLAZA_BOUNDS } from "@mferland/shared";
import { CastleGate, InstancedBuildingDetails, TownBuilding } from "./world/Buildings";
import { RundownFarm } from "./world/Farm";
import { Fountain } from "./world/Fountain";
import { DirtPath, GroundDetailLayer, RoadStrip } from "./world/Ground";
import { WorldBackdrop, TreeCluster } from "./world/Trees";
import { BannerPost, InstancedMarketProps, MarketStall, SpawnRing, WatchTower } from "./world/TownProps";
import { MARKET_STALLS, TOWN_BUILDINGS } from "./world/shared";
import { configureTile, createBarkTexture, createGrassTuftTexture, createLeafTexture, createWaterTexture } from "./world/textures";
export { Skybox } from "./world/Skybox";

const GROUND_MARGIN = 36;
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

      <RoadStrip position={[0, 0.012, -34]} size={[8.5, 44]} texture={cobbleTexture} />
      <RoadStrip position={[0, 0.013, 35]} size={[8.5, 42]} texture={cobbleTexture} />
      <RoadStrip position={[-35, 0.014, 0]} size={[34, 7.5]} texture={cobbleTexture} />
      <RoadStrip position={[35, 0.014, 0]} size={[34, 7.5]} texture={cobbleTexture} />
      <RoadStrip position={[0, 0.011, -34]} size={[52, 6.2]} texture={cobbleTexture} />
      <RoadStrip position={[0, 0.011, 29]} size={[52, 6.2]} texture={cobbleTexture} />
      <RoadStrip position={[-32, 0.01, 22]} size={[7, 28]} texture={cobbleTexture} />
      <RoadStrip position={[32, 0.01, 22]} size={[7, 28]} texture={cobbleTexture} />
      <RoadStrip position={[0, 0.011, 56]} size={[8.5, 42]} texture={cobbleTexture} />
      <DirtPath position={[-29, 0.015, 59]} size={[54, 5.8]} />
      <DirtPath position={[-52, 0.016, 61]} size={[22, 14]} />

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
      <InstancedBuildingDetails />
      {MARKET_STALLS.map((stall) => (
        <MarketStall key={stall.id} stall={stall} roofTexture={roofTexture} />
      ))}
      <InstancedMarketProps stalls={MARKET_STALLS} />
      <WatchTower position={[-41, 0, -36]} stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <WatchTower position={[41, 0, -36]} stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <RundownFarm position={[-52, 0, 61]} rotation={-0.18} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} barkTexture={barkTexture} />
      <SpawnRing position={[5.6, 0.12, 5.6]} />
      <SpawnRing position={[-6.1, 0.12, 4.4]} color="#59ccff" />
      <BannerPost position={[-7.2, 0, -19.8]} color="#328346" />
      <BannerPost position={[7.2, 0, -19.8]} color="#328346" />
      <BannerPost position={[-23.5, 0, -39]} color="#395da8" rotation={Math.PI / 2} />
      <BannerPost position={[23.5, 0, -39]} color="#395da8" rotation={-Math.PI / 2} />
      <BannerPost position={[-7.2, 0, 39]} color="#9b45ff" rotation={Math.PI} />
      <BannerPost position={[7.2, 0, 39]} color="#e18b35" rotation={Math.PI} />
      <TreeCluster barkTexture={barkTexture} leafTexture={leafTexture} />
    </group>
  );
}

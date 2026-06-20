import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { type RenderPerformanceProfile } from "../../performance";
import { createCloudTexture, createSkyTexture, createSunGlowTexture } from "./textures";

export function Skybox({ renderProfile }: { renderProfile: RenderPerformanceProfile }) {
  const skyTexture = useMemo(() => createSkyTexture(renderProfile), [renderProfile]);
  const cloudTexture = useMemo(() => createCloudTexture(renderProfile), [renderProfile]);
  const sunGlowTexture = useMemo(() => createSunGlowTexture(renderProfile), [renderProfile]);
  const skyRef = useRef<THREE.Mesh>(null);
  const cloudGroupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const sunOffset = useMemo(
    () => renderProfile.reducedWorldDetail
      ? new THREE.Vector3(-36, 24, -54)
      : new THREE.Vector3(-50, 31, -76),
    [renderProfile.reducedWorldDetail],
  );
  const { camera } = useThree();

  useFrame(({ clock }, delta) => {
    skyTexture.offset.x = (skyTexture.offset.x + delta * 0.0008) % 1;
    if (skyRef.current) {
      skyRef.current.position.copy(camera.position);
      skyRef.current.rotation.y = clock.elapsedTime * 0.004;
    }
    if (cloudGroupRef.current) {
      cloudGroupRef.current.position.copy(camera.position);
      cloudGroupRef.current.rotation.y = clock.elapsedTime * 0.012;
      cloudGroupRef.current.children.forEach((child) => child.lookAt(camera.position));
    }
    if (sunRef.current) {
      sunRef.current.position.copy(camera.position).add(sunOffset);
      sunRef.current.lookAt(camera.position);
    }
  });

  const clouds: Array<[number, number, number, number, number, number]> = renderProfile.reducedWorldDetail
    ? []
    : [
        [-66, 22, -74, 35, 8.5, -0.08],
        [-30, 28, -88, 44, 11, 0.04],
        [28, 25, -86, 39, 10, -0.02],
        [70, 21, -58, 31, 8.5, 0.12],
        [-88, 19, -38, 30, 8, -0.16],
        [10, 38, -112, 38, 9, 0.02],
        [-8, 17, -68, 52, 7.5, 0],
      ];
  const skyRadius = Math.max(48, Math.min(132, renderProfile.cameraFar - 6));
  const skySegments: [number, number] = renderProfile.reducedWorldDetail ? [32, 16] : [48, 24];

  return (
    <group renderOrder={-100}>
      <mesh ref={skyRef} renderOrder={-120}>
        <sphereGeometry args={[skyRadius, skySegments[0], skySegments[1]]} />
        <meshBasicMaterial
          map={skyTexture}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={sunRef} position={[-50, 31, -76]} renderOrder={-90}>
        <planeGeometry args={[24, 24]} />
        <meshBasicMaterial
          map={sunGlowTexture}
          transparent
          opacity={0.96}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={cloudGroupRef} renderOrder={-80}>
        {clouds.map(([x, y, z, width, height, rotation], index) => (
          <mesh key={index} position={[x, y, z]} rotation-z={rotation} renderOrder={-80 + index}>
            <planeGeometry args={[width, height, 1, 1]} />
            <meshBasicMaterial
              map={cloudTexture}
              color={index % 2 ? "#fff7e4" : "#f8fbff"}
              transparent
              opacity={0.58 + (index % 3) * 0.08}
              depthWrite={false}
              side={THREE.DoubleSide}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

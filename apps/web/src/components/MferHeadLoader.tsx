import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getClientRenderPerformanceProfile } from "../game/performance";

type MferHeadLoaderProps = {
  label?: string;
  onCappedProgressComplete?: () => void;
};

const LOADING_CAP_PERCENT = 69;
const LOADING_CAP_MS = 1450;
const LOADING_HOLD_MS = 260;
const MFER_HEAD_MODEL_URL = "/models/sartoshi-head.glb";

export function MferHeadLoader({ label = "loading mfer", onCappedProgressComplete }: MferHeadLoaderProps) {
  const [headReady, setHeadReady] = useState(false);
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(), []);
  const handleHeadReady = useCallback(() => setHeadReady(true), []);
  const progress = useCappedMferLoadingProgress(headReady, onCappedProgressComplete);
  const statusText = `${label}... ${progress}%`;

  return (
    <div className="mfer-loading-screen" role="status" aria-live="polite" aria-label={statusText}>
      <div className="mfer-loading-head" aria-hidden="true">
        <Canvas
          className="mfer-loading-canvas"
          dpr={renderProfile.loaderDpr}
          camera={{ position: [0, 1, 2.5], fov: 40, near: 0.1, far: 10 }}
          gl={{ alpha: true, antialias: renderProfile.antialias, powerPreference: renderProfile.powerPreference }}
          onCreated={({ camera }) => camera.lookAt(0, 0.8, 0)}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 3, 2]} intensity={1.5} />
          <Suspense fallback={null}>
            <RotatingMferHead onReady={handleHeadReady} />
          </Suspense>
        </Canvas>
      </div>
      {headReady && <div className="mfer-loading-text">{statusText}</div>}
    </div>
  );
}

function useCappedMferLoadingProgress(enabled: boolean, onCappedProgressComplete?: () => void) {
  const [progress, setProgress] = useState(0);
  const completeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return;
    }

    completeRef.current = false;
    let frameId = 0;
    let holdTimeoutId = 0;
    const startAt = performance.now();

    function tick(now: number) {
      const elapsedRatio = Math.min(1, (now - startAt) / LOADING_CAP_MS);
      const easedRatio = 1 - Math.pow(1 - elapsedRatio, 2);
      const nextProgress = Math.min(LOADING_CAP_PERCENT, Math.round(easedRatio * LOADING_CAP_PERCENT));
      setProgress(nextProgress);

      if (nextProgress >= LOADING_CAP_PERCENT) {
        if (!completeRef.current) {
          completeRef.current = true;
          holdTimeoutId = window.setTimeout(() => {
            onCappedProgressComplete?.();
          }, LOADING_HOLD_MS);
        }
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(holdTimeoutId);
    };
  }, [enabled, onCappedProgressComplete]);

  return progress;
}

function RotatingMferHead({ onReady }: { onReady: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, MFER_HEAD_MODEL_URL) as { scene: THREE.Group };
  const model = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene);
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    });
    return scene;
  }, [gltf.scene]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 1.2;
  });

  return (
    <group ref={groupRef} position={[0, 0.9, 0]} rotation-y={-Math.PI / 2} scale={1.65}>
      <primitive object={model} dispose={null} />
    </group>
  );
}

useLoader.preload(GLTFLoader, MFER_HEAD_MODEL_URL);

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getClientRenderPerformanceProfile } from "../game/performance";

type MferHeadLoaderProps = {
  label?: string;
  ready?: boolean;
  onComplete?: () => void;
};

const MFER_HEAD_MODEL_URL = "/models/sartoshi-head.glb";

export function MferHeadLoader({ label = "loading mfer", ready = true, onComplete }: MferHeadLoaderProps) {
  const [headReady, setHeadReady] = useState(false);
  const { active, progress: assetProgress, loaded, total } = useProgress();
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(), []);
  const handleHeadReady = useCallback(() => setHeadReady(true), []);
  const loadingState = useRealMferLoadingState({
    enabled: headReady,
    active,
    assetProgress,
    loaded,
    total,
    ready,
    onComplete,
  });
  const statusText = getLoaderStatusText(label, loadingState);

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

type RealLoadingState =
  | { kind: "loading"; progress: number; loaded: number; total: number }
  | { kind: "preparing"; loaded: number; total: number }
  | { kind: "ready" };

function useRealMferLoadingState({
  enabled,
  active,
  assetProgress,
  loaded,
  total,
  ready,
  onComplete,
}: {
  enabled: boolean;
  active: boolean;
  assetProgress: number;
  loaded: number;
  total: number;
  ready: boolean;
  onComplete?: () => void;
}): RealLoadingState {
  const completeRef = useRef(false);
  const normalizedLoaded = Math.max(0, loaded);
  const normalizedTotal = Math.max(0, total);
  const hasKnownAssets = normalizedTotal > 0;
  const normalizedAssetProgress = Number.isFinite(assetProgress)
    ? Math.min(100, Math.max(0, assetProgress))
    : 0;

  useEffect(() => {
    if (!enabled) completeRef.current = false;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready || completeRef.current) return;
    completeRef.current = true;
    onComplete?.();
  }, [enabled, onComplete, ready]);

  if (ready) return { kind: "ready" };
  if (!enabled) return { kind: "loading", progress: 0, loaded: normalizedLoaded, total: normalizedTotal };
  if (hasKnownAssets && active) {
    return {
      kind: "loading",
      progress: Math.round(normalizedAssetProgress),
      loaded: normalizedLoaded,
      total: normalizedTotal,
    };
  }
  if (hasKnownAssets && normalizedAssetProgress < 100) {
    return {
      kind: "loading",
      progress: Math.round(normalizedAssetProgress),
      loaded: normalizedLoaded,
      total: normalizedTotal,
    };
  }
  return { kind: "preparing", loaded: normalizedLoaded, total: normalizedTotal };
}

function getLoaderStatusText(label: string, state: RealLoadingState) {
  if (state.kind === "ready") return `${label}... 100%`;
  if (state.kind === "preparing") {
    return state.total > 0
      ? `${label}... assets ${state.loaded}/${state.total}, preparing scene`
      : `${label}... preparing scene`;
  }
  return state.total > 0
    ? `${label}... ${state.progress}% (${state.loaded}/${state.total})`
    : `${label}... ${state.progress}%`;
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

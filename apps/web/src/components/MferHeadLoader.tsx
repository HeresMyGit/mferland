import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getClientRenderPerformanceProfile, type RenderPerformanceProfile } from "../game/performance";

type MferHeadLoaderProps = {
  label?: string;
  ready?: boolean;
  renderProfile?: RenderPerformanceProfile;
  onComplete?: () => void;
};

const MFER_HEAD_MODEL_URL = "/models/sartoshi-head.glb";

export function MferHeadLoader({ label = "loading mfer", ready = true, renderProfile, onComplete }: MferHeadLoaderProps) {
  const [headReady, setHeadReady] = useState(false);
  const { active, progress: assetProgress, total } = useProgress();
  const resolvedRenderProfile = useMemo(() => renderProfile ?? getClientRenderPerformanceProfile(), [renderProfile]);
  const handleHeadReady = useCallback(() => setHeadReady(true), []);
  const progress = useMferLoadingProgress({
    enabled: headReady,
    active,
    assetProgress,
    total,
    ready,
    onComplete,
  });
  const statusText = `${label}... ${progress}%`;

  return (
    <div className="mfer-loading-screen" role="status" aria-live="polite" aria-label={statusText}>
      <div className="mfer-loading-head" aria-hidden="true">
        <Canvas
          className="mfer-loading-canvas"
          dpr={resolvedRenderProfile.loaderDpr}
          camera={{ position: [0, 1, 2.5], fov: 40, near: 0.1, far: 10 }}
          gl={{ alpha: true, antialias: resolvedRenderProfile.antialias, powerPreference: resolvedRenderProfile.powerPreference }}
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

const LOADING_MAX_PERCENT = 69;
const LOADING_ASSET_MAX_PERCENT = LOADING_MAX_PERCENT - 1;
const LOADING_READY_HOLD_MS = 420;

function useMferLoadingProgress({
  enabled,
  active,
  assetProgress,
  total,
  ready,
  onComplete,
}: {
  enabled: boolean;
  active: boolean;
  assetProgress: number;
  total: number;
  ready: boolean;
  onComplete?: () => void;
}) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const completeRef = useRef(false);

  useEffect(() => {
    if (enabled) return;
    completeRef.current = false;
    setDisplayProgress(0);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (ready) {
      setDisplayProgress(LOADING_MAX_PERCENT);
      return;
    }

    completeRef.current = false;
    if (total <= 1) return;

    const normalizedAssetProgress = Number.isFinite(assetProgress)
      ? Math.min(100, Math.max(0, assetProgress))
      : 0;
    const nextProgress = Math.min(
      LOADING_ASSET_MAX_PERCENT,
      Math.floor((normalizedAssetProgress / 100) * LOADING_ASSET_MAX_PERCENT),
    );
    setDisplayProgress((currentProgress) => Math.max(currentProgress, nextProgress));
  }, [active, assetProgress, enabled, ready, total]);

  useEffect(() => {
    if (!enabled || !ready || displayProgress < LOADING_MAX_PERCENT || completeRef.current) return;
    completeRef.current = true;
    const timeoutId = window.setTimeout(() => {
      onComplete?.();
    }, LOADING_READY_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [displayProgress, enabled, onComplete, ready]);

  return displayProgress;
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

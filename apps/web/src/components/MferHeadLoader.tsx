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
  onCappedProgressComplete?: () => void;
};

const LOADING_CAP_PERCENT = 69;
const LOADING_PRE_READY_CAP_PERCENT = LOADING_CAP_PERCENT - 1;
const LOADING_HOLD_MS = 260;
const MFER_HEAD_MODEL_URL = "/models/sartoshi-head.glb";

export function MferHeadLoader({ label = "loading mfer", ready = true, onCappedProgressComplete }: MferHeadLoaderProps) {
  const [headReady, setHeadReady] = useState(false);
  const { progress: assetProgress } = useProgress();
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(), []);
  const handleHeadReady = useCallback(() => setHeadReady(true), []);
  const progress = useCappedMferLoadingProgress({
    enabled: headReady,
    assetProgress,
    ready,
    onCappedProgressComplete,
  });
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

function useCappedMferLoadingProgress({
  enabled,
  assetProgress,
  ready,
  onCappedProgressComplete,
}: {
  enabled: boolean;
  assetProgress: number;
  ready: boolean;
  onCappedProgressComplete?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const completeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      completeRef.current = false;
      return;
    }

    const normalizedAssetProgress = Number.isFinite(assetProgress)
      ? Math.min(100, Math.max(0, assetProgress))
      : 0;
    const scaledAssetProgress = normalizedAssetProgress <= 0
      ? 0
      : Math.max(1, Math.round((normalizedAssetProgress / 100) * LOADING_PRE_READY_CAP_PERCENT));
    const nextProgress = ready
      ? LOADING_CAP_PERCENT
      : Math.min(LOADING_PRE_READY_CAP_PERCENT, scaledAssetProgress);

    setProgress((currentProgress) => Math.max(currentProgress, nextProgress));
  }, [assetProgress, enabled, ready]);

  useEffect(() => {
    if (!enabled || !ready || progress < LOADING_CAP_PERCENT || completeRef.current) return;

    completeRef.current = true;
    const timeoutId = window.setTimeout(() => {
      onCappedProgressComplete?.();
    }, LOADING_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, onCappedProgressComplete, progress, ready]);

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

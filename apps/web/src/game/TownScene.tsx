import { Suspense, useEffect, useRef } from "react";
import { Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { INPUT_SEND_RATE, type ClientInput, type PlayerSnapshot } from "@mferland/shared";
import { MferAvatar } from "../components/MferAvatar";

type TownSceneProps = {
  players: Map<string, PlayerSnapshot>;
  localSessionId: string | null;
  sendInput: (input: ClientInput) => void;
};

export function TownScene({ players, localSessionId, sendInput }: TownSceneProps) {
  const keyState = useRef(new Set<string>());
  const seqRef = useRef(0);
  const inputTimer = useRef(0);
  const cameraYaw = useRef(Math.PI);
  const lastMoveYaw = useRef(0);
  const localPlayer = localSessionId ? players.get(localSessionId) : undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      keyState.current.add(event.key.toLowerCase());
      keyState.current.add(event.code.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keyState.current.delete(event.key.toLowerCase());
      keyState.current.delete(event.code.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const keys = keyState.current;
    const turn = (keys.has("q") ? 1 : 0) - (keys.has("e") ? 1 : 0);
    cameraYaw.current += turn * delta * 1.9;

    const forwardIntent = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const rightIntent = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
    const forward = new THREE.Vector3(Math.sin(cameraYaw.current), 0, Math.cos(cameraYaw.current));
    const right = new THREE.Vector3(Math.cos(cameraYaw.current), 0, -Math.sin(cameraYaw.current));
    const move = forward.multiplyScalar(forwardIntent).add(right.multiplyScalar(rightIntent));
    const moveLength = move.length();
    if (moveLength > 1) move.normalize();
    if (moveLength > 0.01) lastMoveYaw.current = Math.atan2(move.x, move.z);

    inputTimer.current += delta;
    if (inputTimer.current >= 1 / INPUT_SEND_RATE) {
      inputTimer.current = 0;
      sendInput({
        seq: ++seqRef.current,
        x: move.x,
        z: move.z,
        yaw: lastMoveYaw.current,
        sprint: keys.has("shift"),
        jump: keys.has(" ") || keys.has("space") || keys.has("spacebar"),
      });
    }

    if (localPlayer) {
      const lookAt = new THREE.Vector3(localPlayer.x, localPlayer.y + 1.55, localPlayer.z);
      const camForward = new THREE.Vector3(Math.sin(cameraYaw.current), 0, Math.cos(cameraYaw.current));
      const desired = lookAt.clone().addScaledVector(camForward, -8.2);
      desired.y += 4.7;
      camera.position.lerp(desired, 1 - Math.pow(0.05, delta));
      camera.lookAt(lookAt);
    }
  });

  return (
    <>
      <color attach="background" args={["#77b8ec"]} />
      <fog attach="fog" args={["#77b8ec", 36, 110]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.9]} />

      <Suspense fallback={null}>
        <TownWorld />
      </Suspense>
      <Suspense fallback={null}>
        {Array.from(players.entries()).map(([sessionId, player]) => (
          <MferAvatar
            key={sessionId}
            player={player}
            isLocal={sessionId === localSessionId}
          />
        ))}
      </Suspense>
    </>
  );
}

function TownWorld() {
  const [grassTexture, cobbleTexture, stoneTexture, roofTexture] = useTexture([
    "/textures/grass-town.webp",
    "/textures/cobblestone-plaza.webp",
    "/textures/castle-stone.webp",
    "/textures/roof-tiles.webp",
  ]) as THREE.Texture[];

  useEffect(() => {
    configureTile(grassTexture, 10, 9);
    configureTile(cobbleTexture, 7, 7);
    configureTile(stoneTexture, 2.2, 2.2);
    configureTile(roofTexture, 1.8, 1.8);
  }, [cobbleTexture, grassTexture, roofTexture, stoneTexture]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
        <planeGeometry args={[90, 80, 1, 1]} />
        <meshBasicMaterial map={grassTexture} />
      </mesh>

      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[21, 21, 0.16, 96]} />
        <meshBasicMaterial color="#8c8170" />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.092, 0]}>
        <circleGeometry args={[21, 128]} />
        <meshBasicMaterial map={cobbleTexture} />
      </mesh>

      <Fountain />
      <CastleGate stoneTexture={stoneTexture} />
      <TownBuilding position={[-18, 0, -8]} rotation={0.4} sign="MFERS" accent="#9b45ff" stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <TownBuilding position={[18, 0, -7.5]} rotation={-0.45} sign="DAO" accent="#52d64f" stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <TownBuilding position={[-18, 0, 11]} rotation={-0.2} sign="WEARABLES" accent="#e754d8" stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <TownBuilding position={[18, 0, 10.5]} rotation={0.25} sign="SHOP" accent="#f5c344" stoneTexture={stoneTexture} roofTexture={roofTexture} />
      <SpawnRing position={[5.6, 0.12, 5.6]} />
      <SpawnRing position={[-6.1, 0.12, 4.4]} color="#59ccff" />
    </group>
  );
}

function configureTile(texture: THREE.Texture, repeatX: number, repeatY: number) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

function Fountain() {
  return (
    <group position={[0, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[4.2, 4.7, 0.56, 64]} />
        <meshBasicMaterial color="#7c776d" />
      </mesh>
      <mesh position={[0, 0.61, 0]}>
        <cylinderGeometry args={[3.55, 3.55, 0.18, 64]} />
        <meshBasicMaterial color="#55c8e8" transparent opacity={0.76} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0]}>
        <cylinderGeometry args={[0.56, 0.72, 1.65, 24]} />
        <meshBasicMaterial color="#8b867d" />
      </mesh>
      <mesh castShadow position={[0, 2.08, 0]}>
        <sphereGeometry args={[0.45, 24, 18]} />
        <meshBasicMaterial color="#f7f7ef" />
      </mesh>
      <Text
        position={[0, 0.97, 4.2]}
        rotation-x={-0.12}
        fontSize={0.42}
        color="#42b9ff"
        outlineColor="#13283a"
        outlineWidth={0.035}
        anchorX="center"
      >
        MFERS NEVER DIE
      </Text>
    </group>
  );
}

function SpawnRing({ position, color = "#8b6cff" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.05, 1.18, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.55, 0.58, 44]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CastleGate({ stoneTexture }: { stoneTexture: THREE.Texture }) {
  return (
    <group position={[0, 0, -24]}>
      <mesh castShadow receiveShadow position={[-4.2, 3.2, 0]}>
        <boxGeometry args={[3.6, 6.4, 3.4]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh castShadow receiveShadow position={[4.2, 3.2, 0]}>
        <boxGeometry args={[3.6, 6.4, 3.4]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 5.7, 0]}>
        <boxGeometry args={[12.1, 2.2, 3.3]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.55, 0.05]}>
        <boxGeometry args={[3.5, 3.1, 3.5]} />
        <meshBasicMaterial color="#3a3028" />
      </mesh>
      <Text
        position={[0, 5.6, 1.75]}
        fontSize={0.68}
        color="#f3f0df"
        outlineColor="#39352c"
        outlineWidth={0.04}
        anchorX="center"
      >
        MFERS ONLY
      </Text>
    </group>
  );
}

function TownBuilding({
  position,
  rotation,
  sign,
  accent,
  stoneTexture,
  roofTexture,
}: {
  position: [number, number, number];
  rotation: number;
  sign: string;
  accent: string;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
        <boxGeometry args={[6.4, 4.2, 4.2]} />
        <meshBasicMaterial map={stoneTexture} color="#f5dbc0" />
      </mesh>
      <mesh castShadow position={[0, 4.55, 0]} rotation-z={Math.PI / 4} scale={[1, 0.7, 1]}>
        <boxGeometry args={[5.1, 5.1, 4.7]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <mesh castShadow position={[0, 2.55, 2.14]}>
        <boxGeometry args={[3.6, 1.08, 0.22]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <Text
        position={[0, 2.55, 2.29]}
        fontSize={0.5}
        color="#ffffff"
        outlineColor="#2d2822"
        outlineWidth={0.035}
        anchorX="center"
      >
        {sign}
      </Text>
      <mesh castShadow receiveShadow position={[-1.45, 1.12, 2.18]}>
        <boxGeometry args={[1, 1.3, 0.16]} />
        <meshBasicMaterial color="#315a78" />
      </mesh>
      <mesh castShadow receiveShadow position={[1.45, 1.12, 2.18]}>
        <boxGeometry args={[1, 1.3, 0.16]} />
        <meshBasicMaterial color="#315a78" />
      </mesh>
    </group>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

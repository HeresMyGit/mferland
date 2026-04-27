import { Suspense, useEffect, useRef } from "react";
import { Text, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { INPUT_SEND_RATE, type ClientInput, type PlayerSnapshot } from "@mferland/shared";
import { MferAvatar } from "../components/MferAvatar";

type TownSceneProps = {
  players: Map<string, PlayerSnapshot>;
  localSessionId: string | null;
  sendInput: (input: ClientInput) => void;
};

export function TownScene({ players, localSessionId, sendInput }: TownSceneProps) {
  const { gl } = useThree();
  const keyState = useRef(new Set<string>());
  const pointerState = useRef({
    left: false,
    right: false,
    lastX: 0,
    lastY: 0,
  });
  const seqRef = useRef(0);
  const inputTimer = useRef(0);
  const cameraYaw = useRef(Math.PI);
  const cameraPitch = useRef(0.4);
  const cameraDistance = useRef(8.2);
  const facingYaw = useRef(Math.PI);
  const localPlayer = localSessionId ? players.get(localSessionId) : undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (isGameKey(event)) event.preventDefault();
      keyState.current.add(event.key.toLowerCase());
      keyState.current.add(event.code.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isTypingTarget(event.target) && isGameKey(event)) event.preventDefault();
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

  useEffect(() => {
    const canvas = gl.domElement;
    const state = pointerState.current;

    const syncMouseButtons = (event: PointerEvent | MouseEvent) => {
      state.left = (event.buttons & 1) === 1;
      state.right = (event.buttons & 2) === 2;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      syncMouseButtons(event);
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer leaves during browser gestures.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      syncMouseButtons(event);
      if (!state.left && !state.right) return;
      event.preventDefault();
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      cameraYaw.current = wrapAngle(cameraYaw.current - dx * 0.0042);
      cameraPitch.current = clamp(cameraPitch.current + dy * 0.0032, -0.08, 1.08);
      if (state.right) facingYaw.current = cameraYaw.current;
    };

    const onPointerUp = (event: PointerEvent) => {
      syncMouseButtons(event);
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors for already-lost pointers.
      }
    };

    const onPointerCancel = () => {
      state.left = false;
      state.right = false;
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      syncMouseButtons(event);
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const onMouseUp = (event: MouseEvent) => {
      syncMouseButtons(event);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraDistance.current = clamp(cameraDistance.current + event.deltaY * 0.008, 3.6, 14);
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl]);

  useFrame(({ camera }, delta) => {
    const keys = keyState.current;
    const pointer = pointerState.current;
    const turnLeft = keys.has("a") || keys.has("arrowleft");
    const turnRight = keys.has("d") || keys.has("arrowright");
    const turnIntent = pointer.right ? 0 : (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
    if (turnIntent) {
      facingYaw.current = wrapAngle(facingYaw.current + turnIntent * delta * 2.8);
      cameraYaw.current = facingYaw.current;
    }
    if (pointer.right) facingYaw.current = cameraYaw.current;

    const mouseForward = pointer.left && pointer.right;
    const forwardIntent = (keys.has("w") || keys.has("arrowup") || mouseForward ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const strafeLeft = keys.has("q") || (pointer.right && turnLeft);
    const strafeRight = keys.has("e") || (pointer.right && turnRight);
    const rightIntent = (strafeLeft ? 1 : 0) - (strafeRight ? 1 : 0);
    const forward = new THREE.Vector3(Math.sin(facingYaw.current), 0, Math.cos(facingYaw.current));
    const right = new THREE.Vector3(Math.cos(facingYaw.current), 0, -Math.sin(facingYaw.current));
    const move = forward.multiplyScalar(forwardIntent).add(right.multiplyScalar(rightIntent));
    const moveLength = move.length();
    if (moveLength > 1) move.normalize();

    inputTimer.current += delta;
    if (inputTimer.current >= 1 / INPUT_SEND_RATE) {
      inputTimer.current = 0;
      sendInput({
        seq: ++seqRef.current,
        x: move.x,
        z: move.z,
        yaw: facingYaw.current,
        sprint: keys.has("shift"),
        jump: keys.has(" ") || keys.has("space") || keys.has("spacebar"),
      });
    }

    if (localPlayer) {
      const lookAt = new THREE.Vector3(localPlayer.x, localPlayer.y + 1.55, localPlayer.z);
      const horizontalDistance = cameraDistance.current * Math.cos(cameraPitch.current);
      const verticalDistance = cameraDistance.current * Math.sin(cameraPitch.current) + 0.4;
      const camForward = new THREE.Vector3(Math.sin(cameraYaw.current), 0, Math.cos(cameraYaw.current));
      const desired = lookAt
        .clone()
        .addScaledVector(camForward, -horizontalDistance)
        .add(new THREE.Vector3(0, verticalDistance, 0));
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
  const [grassTexture, cobbleTexture, stoneTexture, roofTexture, timberTexture] = useTexture([
    "/textures/grass-town.webp",
    "/textures/cobblestone-plaza.webp",
    "/textures/castle-stone.webp",
    "/textures/roof-tiles.webp",
    "/textures/timber-plaster.webp",
  ]) as THREE.Texture[];

  useEffect(() => {
    configureTile(grassTexture, 10, 9);
    configureTile(cobbleTexture, 7, 7);
    configureTile(stoneTexture, 2.2, 2.2);
    configureTile(roofTexture, 1.6, 1.6);
    configureTile(timberTexture, 1.25, 1.25);
  }, [cobbleTexture, grassTexture, roofTexture, stoneTexture, timberTexture]);

  return (
    <group>
      <WorldBackdrop />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
        <planeGeometry args={[90, 80, 1, 1]} />
        <meshBasicMaterial map={grassTexture} />
      </mesh>

      <RoadStrip position={[0, 0.012, -30]} size={[8.5, 32]} texture={cobbleTexture} />
      <RoadStrip position={[0, 0.013, 31]} size={[8.5, 30]} texture={cobbleTexture} />
      <RoadStrip position={[-29, 0.014, 0]} size={[24, 7.5]} texture={cobbleTexture} />
      <RoadStrip position={[29, 0.014, 0]} size={[24, 7.5]} texture={cobbleTexture} />

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

      <Fountain />
      <CastleGate stoneTexture={stoneTexture} />
      <TownBuilding position={[-18, 0, -8]} rotation={0.4} sign="MFERS" accent="#9b45ff" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[18, 0, -7.5]} rotation={-0.45} sign="DAO" accent="#52d64f" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[-18, 0, 11]} rotation={-0.2} sign="WEARABLES" accent="#e754d8" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[18, 0, 10.5]} rotation={0.25} sign="SHOP" accent="#f5c344" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <SpawnRing position={[5.6, 0.12, 5.6]} />
      <SpawnRing position={[-6.1, 0.12, 4.4]} color="#59ccff" />
      <BannerPost position={[-7.2, 0, -19.8]} color="#328346" />
      <BannerPost position={[7.2, 0, -19.8]} color="#328346" />
      <TreeCluster />
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

function RoadStrip({
  position,
  size,
  texture,
}: {
  position: [number, number, number];
  size: [number, number];
  texture: THREE.Texture;
}) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

function WorldBackdrop() {
  const treeline = [-38, -31, -24, -17, 18, 25, 32, 39];

  return (
    <group>
      <mesh position={[-32, 4.1, -58]} rotation-y={0.5} scale={[1.35, 0.82, 0.85]}>
        <coneGeometry args={[8.5, 16, 4]} />
        <meshBasicMaterial color="#8b8978" />
      </mesh>
      <mesh position={[-18, 3.7, -61]} rotation-y={0.1} scale={[1.1, 0.72, 0.9]}>
        <coneGeometry args={[7.6, 14, 4]} />
        <meshBasicMaterial color="#9b947f" />
      </mesh>
      <mesh position={[30, 3.95, -58]} rotation-y={0.25} scale={[1.25, 0.78, 0.85]}>
        <coneGeometry args={[8.2, 15, 4]} />
        <meshBasicMaterial color="#888c78" />
      </mesh>
      {treeline.map((x, index) => (
        <TownTree key={index} position={[x, 0, -42 - (index % 2) * 3]} scale={0.95 + (index % 3) * 0.12} />
      ))}
    </group>
  );
}

function BannerPost({
  position,
  color,
  rotation = 0,
}: {
  position: [number, number, number];
  color: string;
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.08, 0.11, 3.6, 8]} />
        <meshBasicMaterial color="#4b2d18" />
      </mesh>
      <mesh position={[0.5, 2.75, 0.02]}>
        <boxGeometry args={[0.95, 1.2, 0.06]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0.5, 2.1, 0.04]}>
        <boxGeometry args={[0.95, 0.08, 0.08]} />
        <meshBasicMaterial color="#2b2118" />
      </mesh>
      <Text
        position={[0.5, 2.78, 0.08]}
        fontSize={0.31}
        color="#f8f2d6"
        outlineColor="#242018"
        outlineWidth={0.018}
        anchorX="center"
        anchorY="middle"
      >
        MF
      </Text>
    </group>
  );
}

function TreeCluster() {
  const trees: Array<[number, number, number, number]> = [
    [-31, 0, -18, 1.2],
    [-27, 0, -7, 0.9],
    [-30, 0, 15, 1.05],
    [-12, 0, 25, 0.95],
    [12, 0, 25, 1.05],
    [30, 0, 16, 0.95],
    [29, 0, -17, 1.15],
    [23, 0, -26, 0.85],
    [-23, 0, -26, 0.9],
  ];

  return (
    <group>
      {trees.map(([x, y, z, scale], index) => (
        <TownTree key={index} position={[x, y, z]} scale={scale} />
      ))}
    </group>
  );
}

function TownTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.16, 0.26, 1.55, 7]} />
        <meshBasicMaterial color="#6b3b1f" />
      </mesh>
      <mesh position={[0, 2.0, 0]}>
        <coneGeometry args={[1.05, 1.9, 8]} />
        <meshBasicMaterial color="#4f9a3f" />
      </mesh>
      <mesh position={[0, 2.75, 0]}>
        <coneGeometry args={[0.78, 1.55, 8]} />
        <meshBasicMaterial color="#66ad46" />
      </mesh>
    </group>
  );
}

function Fountain() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[4.45, 4.9, 0.36, 72]} />
        <meshBasicMaterial color="#6f6a60" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.5, 0]}>
        <torusGeometry args={[4.08, 0.26, 8, 72]} />
        <meshBasicMaterial color="#8a8578" />
      </mesh>
      <mesh position={[0, 0.61, 0]}>
        <cylinderGeometry args={[3.62, 3.62, 0.12, 64]} />
        <meshBasicMaterial color="#58cceb" transparent opacity={0.78} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.56, 0.72, 1.15, 24]} />
        <meshBasicMaterial color="#8b867d" />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <cylinderGeometry args={[1.05, 0.72, 0.38, 36]} />
        <meshBasicMaterial color="#7d786f" />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <sphereGeometry args={[0.38, 24, 16]} />
        <meshBasicMaterial color="#f7f7ef" />
      </mesh>
      {[
        [0.6, 1.62, 0],
        [-0.6, 1.62, 0],
        [0, 1.62, 0.6],
        [0, 1.62, -0.6],
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.035, 0.035, 1.15, 8]} />
          <meshBasicMaterial color="#a8f1ff" transparent opacity={0.68} />
        </mesh>
      ))}
      <Text
        position={[0, 0.92, 3.95]}
        rotation-x={-0.12}
        fontSize={0.34}
        color="#42b9ff"
        outlineColor="#13283a"
        outlineWidth={0.03}
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
  const crenels = [-5.7, -4.25, -2.8, -1.35, 0, 1.35, 2.8, 4.25, 5.7];

  return (
    <group position={[0, 0, -24]}>
      <mesh position={[-5.35, 3.1, 0]}>
        <cylinderGeometry args={[1.72, 1.9, 6.2, 18]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh position={[5.35, 3.1, 0]}>
        <cylinderGeometry args={[1.72, 1.9, 6.2, 18]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh position={[0, 3.65, 0]}>
        <boxGeometry args={[9.3, 5.1, 2.85]} />
        <meshBasicMaterial map={stoneTexture} />
      </mesh>
      <mesh position={[0, 1.62, 1.47]}>
        <boxGeometry args={[3.7, 3.24, 0.18]} />
        <meshBasicMaterial color="#261a13" />
      </mesh>
      <mesh position={[0, 3.2, 1.5]}>
        <sphereGeometry args={[1.85, 24, 12]} />
        <meshBasicMaterial color="#261a13" />
      </mesh>
      <mesh position={[0, 3.22, 1.58]}>
        <boxGeometry args={[3.98, 0.36, 0.22]} />
        <meshBasicMaterial color="#6f6a60" />
      </mesh>
      <mesh position={[-2.15, 2.1, 1.58]}>
        <boxGeometry args={[0.34, 3.25, 0.22]} />
        <meshBasicMaterial color="#6f6a60" />
      </mesh>
      <mesh position={[2.15, 2.1, 1.58]}>
        <boxGeometry args={[0.34, 3.25, 0.22]} />
        <meshBasicMaterial color="#6f6a60" />
      </mesh>
      <mesh position={[0, 6.42, 0]}>
        <boxGeometry args={[12.4, 0.55, 3.1]} />
        <meshBasicMaterial color="#766f64" />
      </mesh>
      {crenels.map((x) => (
        <mesh key={x} position={[x, 7.05, 0]}>
          <boxGeometry args={[0.86, 1.05, 2.95]} />
          <meshBasicMaterial map={stoneTexture} />
        </mesh>
      ))}
      <BannerPost position={[-3.25, 0.04, 1.62]} color="#2f8d4d" rotation={0} />
      <BannerPost position={[3.25, 0.04, 1.62]} color="#2f8d4d" rotation={0} />
      <mesh position={[-2.9, 3.6, 1.62]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial color="#ffd161" />
      </mesh>
      <mesh position={[2.9, 3.6, 1.62]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial color="#ffd161" />
      </mesh>
      <Text
        position={[0, 5.6, 1.62]}
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
  wallTexture,
}: {
  position: [number, number, number];
  rotation: number;
  sign: string;
  accent: string;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[7.45, 0.64, 4.85]} />
        <meshBasicMaterial map={stoneTexture} color="#c7b69d" />
      </mesh>
      <mesh position={[0, 2.65, 0]}>
        <boxGeometry args={[7.05, 4.55, 4.45]} />
        <meshBasicMaterial map={wallTexture} />
      </mesh>
      <GabledRoof roofTexture={roofTexture} />
      <BuildingTrim />
      <ShopWindow position={[-2.15, 2.45, 2.28]} />
      <ShopWindow position={[2.15, 2.45, 2.28]} />
      <ShopWindow position={[-2.65, 2.2, -2.28]} rotation={Math.PI} />
      <ShopWindow position={[2.65, 2.2, -2.28]} rotation={Math.PI} />
      <ShopDoor />
      <mesh position={[0, 1.62, 2.52]}>
        <boxGeometry args={[3.6, 0.44, 0.18]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <mesh position={[0, 3.25, 2.49]}>
        <boxGeometry args={[4.42, 1.28, 0.1]} />
        <meshBasicMaterial color="#2a2119" />
      </mesh>
      <mesh position={[0, 3.25, 2.58]}>
        <boxGeometry args={[4.15, 1.05, 0.2]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <Text
        position={[0, 3.25, 2.69]}
        fontSize={sign.length > 6 ? 0.43 : 0.55}
        color="#ffffff"
        outlineColor="#2d2822"
        outlineWidth={0.04}
        anchorX="center"
        anchorY="middle"
      >
        {sign}
      </Text>
      <mesh position={[2.72, 5.1, -0.8]}>
        <boxGeometry args={[0.72, 1.55, 0.72]} />
        <meshBasicMaterial map={stoneTexture} color="#b29b7e" />
      </mesh>
      <mesh position={[2.72, 6.02, -0.8]}>
        <boxGeometry args={[0.92, 0.35, 0.92]} />
        <meshBasicMaterial color="#4b3325" />
      </mesh>
    </group>
  );
}

function GabledRoof({ roofTexture }: { roofTexture: THREE.Texture }) {
  return (
    <group>
      <mesh position={[0, 4.98, 0]} rotation-z={Math.PI / 4} scale={[1, 0.62, 1]}>
        <boxGeometry args={[5.7, 5.7, 5.25]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <mesh position={[0, 4.23, 2.68]}>
        <boxGeometry args={[8.05, 0.38, 0.34]} />
        <meshBasicMaterial color="#6b341d" />
      </mesh>
      <mesh position={[0, 4.23, -2.68]}>
        <boxGeometry args={[8.05, 0.38, 0.34]} />
        <meshBasicMaterial color="#6b341d" />
      </mesh>
      <mesh position={[0, 6.65, 0]}>
        <boxGeometry args={[0.28, 0.28, 5.5]} />
        <meshBasicMaterial color="#5a2d19" />
      </mesh>
    </group>
  );
}

function BuildingTrim() {
  return (
    <group>
      <mesh position={[-3.72, 2.62, 2.31]}>
        <boxGeometry args={[0.26, 4.4, 0.18]} />
        <meshBasicMaterial color="#5b331d" />
      </mesh>
      <mesh position={[3.72, 2.62, 2.31]}>
        <boxGeometry args={[0.26, 4.4, 0.18]} />
        <meshBasicMaterial color="#5b331d" />
      </mesh>
      <mesh position={[0, 4.72, 2.31]}>
        <boxGeometry args={[7.6, 0.26, 0.18]} />
        <meshBasicMaterial color="#5b331d" />
      </mesh>
      <mesh position={[0, 0.74, 2.31]}>
        <boxGeometry args={[7.7, 0.28, 0.2]} />
        <meshBasicMaterial color="#5b331d" />
      </mesh>
      <mesh position={[-1.75, 3.95, 2.32]} rotation-z={-0.55}>
        <boxGeometry args={[0.25, 3.0, 0.18]} />
        <meshBasicMaterial color="#6f3b20" />
      </mesh>
      <mesh position={[1.75, 3.95, 2.32]} rotation-z={0.55}>
        <boxGeometry args={[0.25, 3.0, 0.18]} />
        <meshBasicMaterial color="#6f3b20" />
      </mesh>
    </group>
  );
}

function ShopWindow({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh>
        <boxGeometry args={[1.1, 1.15, 0.14]} />
        <meshBasicMaterial color="#2e2019" />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.82, 0.86, 0.08]} />
        <meshBasicMaterial color="#49a4c8" transparent opacity={0.78} />
      </mesh>
      <mesh position={[0, 0, 0.13]}>
        <boxGeometry args={[0.08, 0.92, 0.05]} />
        <meshBasicMaterial color="#f4d878" />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <boxGeometry args={[0.88, 0.08, 0.05]} />
        <meshBasicMaterial color="#f4d878" />
      </mesh>
    </group>
  );
}

function ShopDoor() {
  return (
    <group>
      <mesh position={[0, 1.48, 2.36]}>
        <boxGeometry args={[1.35, 1.92, 0.16]} />
        <meshBasicMaterial color="#4a2b1b" />
      </mesh>
      <mesh position={[0, 2.35, 2.44]}>
        <sphereGeometry args={[0.68, 18, 8]} />
        <meshBasicMaterial color="#4a2b1b" />
      </mesh>
      <mesh position={[0, 0.32, 2.85]}>
        <boxGeometry args={[2.0, 0.36, 1.0]} />
        <meshBasicMaterial color="#8a7c6a" />
      </mesh>
      <mesh position={[0.45, 1.52, 2.48]}>
        <sphereGeometry args={[0.08, 12, 8]} />
        <meshBasicMaterial color="#f0ca55" />
      </mesh>
    </group>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function isGameKey(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  return ["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
    || ["space", "spacebar"].includes(code);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

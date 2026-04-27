import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Billboard, Text, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  INPUT_SEND_RATE,
  PLAYER,
  PLAZA_BOUNDS,
  getNpcQuestMarker,
  isAttackableNpcRole,
  resolveWorldCollision,
  type ClientInput,
  type CombatActionId,
  type CombatEvent,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { CreatureAvatar } from "../components/CreatureAvatar";
import { MferAvatar } from "../components/MferAvatar";

type TownSceneProps = {
  players: Map<string, PlayerSnapshot>;
  npcs: Map<string, NpcSnapshot>;
  localSessionId: string | null;
  selectedTarget: TargetSelection | null;
  combatEvents: CombatEvent[];
  onSelectTarget: (target: TargetSelection | null) => void;
  onInteractAction: () => void;
  sendInput: (input: ClientInput) => void;
};

const GROUND_MARGIN = 36;
const TOWN_GROUND_WIDTH = PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX + GROUND_MARGIN;
const TOWN_GROUND_DEPTH = PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ + GROUND_MARGIN;

export function TownScene({
  players,
  npcs,
  localSessionId,
  selectedTarget,
  combatEvents,
  onSelectTarget,
  onInteractAction,
  sendInput,
}: TownSceneProps) {
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
  const interactHeld = useRef(false);
  const tabHeld = useRef(false);
  const escapeHeld = useRef(false);
  const localVisualPlayer = useRef<PlayerSnapshot | null>(null);
  const localPlayer = localSessionId ? players.get(localSessionId) : undefined;
  const localQuestState = localPlayer?.quests ?? [];

  if (!localPlayer) {
    localVisualPlayer.current = null;
  } else if (localVisualPlayer.current?.sessionId !== localPlayer.sessionId) {
    localVisualPlayer.current = { ...localPlayer };
  }
  const viewerPlayer = localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId
    ? localVisualPlayer.current
    : localPlayer;
  const viewerPosition = viewerPlayer ? { x: viewerPlayer.x, z: viewerPlayer.z } : null;

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
    const localIsDead = Boolean(localPlayer && localPlayer.health <= 0);
    const turnLeft = keys.has("a") || keys.has("arrowleft");
    const turnRight = keys.has("d") || keys.has("arrowright");
    const turnIntent = pointer.right ? 0 : (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
    if (turnIntent) {
      facingYaw.current = wrapAngle(facingYaw.current + turnIntent * delta * 2.8);
      cameraYaw.current = facingYaw.current;
    }
    if (pointer.right) facingYaw.current = cameraYaw.current;

    const mouseForward = !localIsDead && pointer.left && pointer.right;
    const forwardIntent = localIsDead ? 0 : (keys.has("w") || keys.has("arrowup") || mouseForward ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const strafeLeft = !localIsDead && (keys.has("q") || (pointer.right && turnLeft));
    const strafeRight = !localIsDead && (keys.has("e") || (pointer.right && turnRight));
    const rightIntent = (strafeLeft ? 1 : 0) - (strafeRight ? 1 : 0);
    const forward = new THREE.Vector3(Math.sin(facingYaw.current), 0, Math.cos(facingYaw.current));
    const right = new THREE.Vector3(Math.cos(facingYaw.current), 0, -Math.sin(facingYaw.current));
    const move = forward.multiplyScalar(forwardIntent).add(right.multiplyScalar(rightIntent));
    const moveLength = move.length();
    if (moveLength > 1) move.normalize();
    const isSprinting = !localIsDead && keys.has("shift");
    const isJumping = !localIsDead && (keys.has(" ") || keys.has("space") || keys.has("spacebar"));

    const interactPressed = keys.has("f") || keys.has("keyf");
    if (interactPressed && !interactHeld.current && localPlayer && !localIsDead) {
      onInteractAction();
    }
    interactHeld.current = interactPressed;

    const tabPressed = keys.has("tab");
    if (tabPressed && !tabHeld.current && localPlayer && !localIsDead) {
      const nextTarget = getNextEnemyTarget(localPlayer, npcs, selectedTarget, keys.has("shift"));
      if (nextTarget) onSelectTarget(nextTarget);
    }
    tabHeld.current = tabPressed;

    const escapePressed = keys.has("escape");
    if (escapePressed && !escapeHeld.current) {
      onSelectTarget(null);
    }
    escapeHeld.current = escapePressed;

    inputTimer.current += delta;
    if (inputTimer.current >= 1 / INPUT_SEND_RATE) {
      inputTimer.current = 0;
      sendInput({
        seq: ++seqRef.current,
        x: move.x,
        z: move.z,
        yaw: facingYaw.current,
        sprint: isSprinting,
        jump: isJumping,
      });
    }

    if (localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId) {
      updateLocalVisualPlayer(localVisualPlayer.current, localPlayer, move, moveLength, facingYaw.current, isSprinting, isJumping, delta);
    }

    const cameraPlayer = localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId
      ? localVisualPlayer.current
      : localPlayer;
    if (cameraPlayer) {
      const lookAt = new THREE.Vector3(cameraPlayer.x, cameraPlayer.y + 1.55, cameraPlayer.z);
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
      <fog attach="fog" args={["#b4d7e8", 38, 118]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.9]} />
      <directionalLight position={[-10, 18, 8]} intensity={1.55} color="#fff3d3" />
      <Skybox />

      <Suspense fallback={null}>
        <TownWorld />
      </Suspense>
      <Suspense fallback={null}>
        {Array.from(players.entries()).map(([sessionId, player]) => {
          const isLocalPlayer = sessionId === localSessionId;
          const renderedPlayer = isLocalPlayer && localVisualPlayer.current?.sessionId === sessionId
            ? localVisualPlayer.current
            : player;
          return (
            <MferAvatar
              key={sessionId}
              player={renderedPlayer}
              isLocal={isLocalPlayer}
              isTargeted={isTargetSelected(selectedTarget, "player", sessionId)}
              isDefeated={player.health <= 0}
              viewerPosition={viewerPosition}
              onTarget={isLocalPlayer ? undefined : () => onSelectTarget({ kind: "player", id: sessionId })}
            />
          );
        })}
        {Array.from(npcs.values()).filter(isVisibleNpc).map((npc) => {
          const isTargeted = isTargetSelected(selectedTarget, "npc", npc.id);
          const onTarget = () => onSelectTarget({ kind: "npc", id: npc.id });
          const questMarker = getNpcQuestMarker(npc, localQuestState);
          if (npc.model !== "mfer") {
            return (
              <CreatureAvatar
                key={npc.id}
                npc={npc}
                questMarker={questMarker}
                hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
                isTargeted={isTargeted}
                isDefeated={!npc.isImmortal && npc.health <= 0}
                viewerPosition={viewerPosition}
                onTarget={onTarget}
              />
            );
          }

          return (
            <MferAvatar
              key={npc.id}
              player={npc}
              isNpc
              questMarker={questMarker}
              hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
              isTargeted={isTargeted}
              isDefeated={!npc.isImmortal && npc.health <= 0}
              viewerPosition={viewerPosition}
              onTarget={onTarget}
            />
          );
        })}
        <CombatFeedbackLayer
          combatEvents={combatEvents}
          players={players}
          npcs={npcs}
          viewerPosition={viewerPosition}
        />
      </Suspense>
    </>
  );
}

type Vec3Tuple = [number, number, number];
type TreeSpec = {
  position: Vec3Tuple;
  scale: number;
};
type TreeInstance = {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
};

const TREE_LEAF_COLORS = ["#3f7434", "#4e8a3b", "#5f9e45", "#77aa50"] as const;
const TREE_ROOT_COLOR = new THREE.Color("#6b4227");
const TOWN_TREES: TreeSpec[] = [
  [-31, 0, -18, 1.2],
  [-27, 0, -7, 0.9],
  [-30, 0, 15, 1.05],
  [-41, 0, 30, 0.98],
  [-12, 0, 25, 0.95],
  [12, 0, 25, 1.05],
  [41, 0, 30, 0.98],
  [30, 0, 16, 0.95],
  [29, 0, -17, 1.15],
  [42, 0, -4, 0.9],
  [-42, 0, -4, 0.9],
  [23, 0, -26, 0.85],
  [-23, 0, -26, 0.9],
  [35, 0, -39, 0.95],
  [-35, 0, -39, 0.95],
  [-67, 0, 51, 1.05],
  [-65, 0, 68, 0.9],
  [-38, 0, 72, 1.1],
  [-22, 0, 60, 0.86],
  [58, 0, 48, 0.95],
  [66, 0, -36, 1.04],
  [-66, 0, -42, 0.96],
].map(([x, y, z, scale]) => ({ position: [x, y, z], scale }));
const BACKDROP_TREES: TreeSpec[] = [-82, -72, -62, -54, -47, -38, -31, -24, -17, 18, 25, 32, 39, 47, 54, 64, 74, 84]
  .map((x, index) => ({
    position: [x, 0, -68 - (index % 2) * 5] as Vec3Tuple,
    scale: 0.95 + (index % 3) * 0.12,
  }));

function CombatFeedbackLayer({
  combatEvents,
  players,
  npcs,
  viewerPosition,
}: {
  combatEvents: CombatEvent[];
  players: Map<string, PlayerSnapshot>;
  npcs: Map<string, NpcSnapshot>;
  viewerPosition: { x: number; z: number } | null;
}) {
  return (
    <group>
      {combatEvents.slice(-32).filter((event) => shouldRenderCombatEvent(event, players, npcs, viewerPosition)).map((event) => {
        const source = players.get(event.sourceId) ?? npcs.get(event.sourceId);
        const sourcePosition: Vec3Tuple = [
          source?.x ?? event.sourceX,
          source ? source.y + ("role" in source ? getNpcVisualHeight(source) : 1.18) : event.sourceY,
          source?.z ?? event.sourceZ,
        ];
        const targetPosition: Vec3Tuple = [event.targetX, event.targetY, event.targetZ];
        const yaw = source?.yaw ?? Math.atan2(event.targetX - event.sourceX, event.targetZ - event.sourceZ);
        const impactAt = event.impactAt ?? event.sentAt;

        return (
          <group key={event.id}>
            <CombatActionVisual
              actionId={event.actionId}
              sourcePosition={sourcePosition}
              targetPosition={targetPosition}
              yaw={yaw}
              sentAt={event.sentAt}
              impactAt={impactAt}
            />
            <FloatingDamageNumber
              amount={event.amount}
              position={targetPosition}
              sentAt={event.sentAt}
              impactAt={impactAt}
              eventId={event.id}
            />
          </group>
        );
      })}
    </group>
  );
}

function CombatActionVisual({
  actionId,
  sourcePosition,
  targetPosition,
  yaw,
  sentAt,
  impactAt,
}: {
  actionId: CombatActionId;
  sourcePosition: Vec3Tuple;
  targetPosition: Vec3Tuple;
  yaw: number;
  sentAt: number;
  impactAt: number;
}) {
  if (actionId === "attack") {
    return <SwordFlash position={sourcePosition} yaw={yaw} sentAt={sentAt} />;
  }
  if (actionId === "shoot") {
    return (
      <>
        <BowFlash position={sourcePosition} yaw={yaw} sentAt={sentAt} />
        <LinearProjectile variant="arrow" start={sourcePosition} end={targetPosition} sentAt={sentAt} durationMs={520} />
      </>
    );
  }
  return (
    <LinearProjectile
      variant="fireblast"
      start={sourcePosition}
      end={targetPosition}
      sentAt={sentAt}
      durationMs={Math.max(180, impactAt - sentAt)}
    />
  );
}

function SwordFlash({ position, yaw, sentAt }: { position: Vec3Tuple; yaw: number; sentAt: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const age = Date.now() - sentAt;
    const progress = clamp(age / 420, 0, 1);
    group.visible = age >= 0 && progress < 1;
    group.rotation.z = -0.9 + progress * 1.65;
    group.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.18);
  });

  return (
    <group ref={groupRef} position={position} rotation-y={yaw} rotation-z={-0.9}>
      <group position={[0.42, -0.04, 0.18]} rotation-x={0.28} rotation-z={-0.48}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.08, 0.84, 0.035]} />
          <meshBasicMaterial color="#dbe8ee" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.24, 0.07, 0.07]} />
          <meshBasicMaterial color="#423526" />
        </mesh>
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[0.07, 0.34, 0.07]} />
          <meshBasicMaterial color="#7b5632" />
        </mesh>
      </group>
    </group>
  );
}

function BowFlash({ position, yaw, sentAt }: { position: Vec3Tuple; yaw: number; sentAt: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const age = Date.now() - sentAt;
    const progress = clamp(age / 430, 0, 1);
    group.visible = age >= 0 && progress < 1;
    group.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.1);
  });

  return (
    <group ref={groupRef} position={position} rotation-y={yaw}>
      <group position={[0.46, -0.02, 0.22]} rotation-z={Math.PI / 2}>
        <mesh>
          <torusGeometry args={[0.34, 0.018, 6, 22, Math.PI * 1.2]} />
          <meshBasicMaterial color="#76522e" />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.018, 0.68, 0.018]} />
          <meshBasicMaterial color="#f2dfae" />
        </mesh>
      </group>
    </group>
  );
}

function LinearProjectile({
  variant,
  start,
  end,
  sentAt,
  durationMs,
}: {
  variant: "arrow" | "fireblast";
  start: Vec3Tuple;
  end: Vec3Tuple;
  sentAt: number;
  durationMs: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startVector = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVector = useMemo(() => new THREE.Vector3(...end), [end]);
  const direction = useMemo(() => endVector.clone().sub(startVector).normalize(), [endVector, startVector]);
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const age = Date.now() - sentAt;
    const progress = clamp(age / durationMs, 0, 1);
    group.visible = age >= 0 && progress < 1;
    group.position.lerpVectors(startVector, endVector, progress);
    if (direction.lengthSq() > 0.0001) group.quaternion.setFromUnitVectors(axis, direction);
  });

  if (variant === "arrow") {
    return (
      <group ref={groupRef} position={start}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.78, 8]} />
          <meshBasicMaterial color="#3c2c1c" />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <coneGeometry args={[0.07, 0.18, 8]} />
          <meshBasicMaterial color="#d6dde2" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.38, 0]}>
          <coneGeometry args={[0.08, 0.14, 4]} />
          <meshBasicMaterial color="#f1e0bb" />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={start}>
      <mesh renderOrder={36}>
        <sphereGeometry args={[0.46, 18, 12]} />
        <meshBasicMaterial color="#ff6a28" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.72, 18, 12]} />
        <meshBasicMaterial color="#ffb34d" depthWrite={false} opacity={0.26} toneMapped={false} transparent />
      </mesh>
      <mesh position={[0, -0.28, 0]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial color="#ffd35b" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.48, 0]}>
        <sphereGeometry args={[0.14, 10, 6]} />
        <meshBasicMaterial color="#ff382e" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.76, 0]}>
        <sphereGeometry args={[0.08, 10, 6]} />
        <meshBasicMaterial color="#ff8d2a" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function FloatingDamageNumber({
  amount,
  position,
  sentAt,
  impactAt,
  eventId,
}: {
  amount: number;
  position: Vec3Tuple;
  sentAt: number;
  impactAt: number;
  eventId: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const offset = useMemo(() => getEventOffset(eventId), [eventId]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const age = Date.now() - impactAt;
    const progress = clamp(age / 1250, 0, 1);
    group.visible = age >= 0 && progress < 1;
    group.position.set(
      position[0] + offset[0],
      position[1] + 0.38 + progress * 1.15,
      position[2] + offset[1],
    );
    group.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.22);
  });

  return (
    <group ref={groupRef} position={[position[0] + offset[0], position[1] + 0.38, position[2] + offset[1]]} visible={false}>
      <Billboard>
        <Text
          fontSize={0.36}
          anchorX="center"
          anchorY="middle"
          color="#ffd35b"
          outlineColor="#15100c"
          outlineWidth={0.045}
        >
          {Math.round(amount)}
        </Text>
      </Billboard>
    </group>
  );
}

function getEventOffset(id: string): [number, number] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  const x = ((hash >>> 0) % 1000) / 1000 - 0.5;
  const z = (((hash >>> 8) % 1000) / 1000 - 0.5) * 0.6;
  return [x * 0.38, z * 0.38];
}

function getNpcVisualHeight(npc: NpcSnapshot) {
  if (npc.model === "rabbit") return 0.75;
  if (npc.model === "hog") return 0.9;
  if (npc.model === "deer") return 1.15;
  return 1.35;
}

const COMBAT_VISUAL_RENDER_DISTANCE_SQ = 56 * 56;

function shouldRenderCombatEvent(
  event: CombatEvent,
  players: Map<string, PlayerSnapshot>,
  npcs: Map<string, NpcSnapshot>,
  viewerPosition: { x: number; z: number } | null,
) {
  if (!viewerPosition) return true;

  const source = players.get(event.sourceId) ?? npcs.get(event.sourceId);
  const sourceX = source?.x ?? event.sourceX;
  const sourceZ = source?.z ?? event.sourceZ;
  return distanceSq2d(viewerPosition, sourceX, sourceZ) <= COMBAT_VISUAL_RENDER_DISTANCE_SQ
    || distanceSq2d(viewerPosition, event.targetX, event.targetZ) <= COMBAT_VISUAL_RENDER_DISTANCE_SQ;
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
}

function TownWorld() {
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

  useEffect(() => {
    configureTile(grassTexture, 22, 20);
    configureTile(cobbleTexture, 12, 12);
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

      <Fountain stoneTexture={stoneTexture} waterTexture={waterTexture} />
      <CastleGate stoneTexture={stoneTexture} />
      <TownBuilding position={[-18, 0, -8]} rotation={0.4} sign="MFERS" accent="#9b45ff" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[18, 0, -7.5]} rotation={-0.45} sign="DAO" accent="#52d64f" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[-18, 0, 11]} rotation={-0.2} sign="WEARABLES" accent="#e754d8" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[18, 0, 10.5]} rotation={0.25} sign="SHOP" accent="#f5c344" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[-25.5, 0, -33.8]} rotation={1.28} sign="BARRACKS" accent="#3ba464" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[25.5, 0, -33.8]} rotation={-1.28} sign="KEEP" accent="#477fe7" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[-36, 0, 17.5]} rotation={1.5} sign="GALLERY" accent="#ef7741" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[36, 0, 17.5]} rotation={-1.5} sign="ARCADE" accent="#36b7c9" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[-16, 0, 36.5]} rotation={2.82} sign="INN" accent="#d56565" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <TownBuilding position={[16, 0, 36.5]} rotation={-2.82} sign="FORGE" accent="#e18b35" stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={timberTexture} />
      <MarketStall position={[-6.4, 0, 29.2]} rotation={Math.PI} color="#9b45ff" roofTexture={roofTexture} />
      <MarketStall position={[0, 0, 31.4]} rotation={Math.PI} color="#52d64f" roofTexture={roofTexture} />
      <MarketStall position={[6.4, 0, 29.2]} rotation={Math.PI} color="#e754d8" roofTexture={roofTexture} />
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

function Skybox() {
  const skyTexture = useMemo(() => createSkyTexture(), []);
  const cloudTexture = useMemo(() => createCloudTexture(), []);
  const sunGlowTexture = useMemo(() => createSunGlowTexture(), []);
  const skyRef = useRef<THREE.Mesh>(null);
  const cloudGroupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const sunOffset = useMemo(() => new THREE.Vector3(-50, 31, -76), []);
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

  const clouds: Array<[number, number, number, number, number, number]> = [
    [-66, 22, -74, 35, 8.5, -0.08],
    [-30, 28, -88, 44, 11, 0.04],
    [28, 25, -86, 39, 10, -0.02],
    [70, 21, -58, 31, 8.5, 0.12],
    [-88, 19, -38, 30, 8, -0.16],
    [10, 38, -112, 38, 9, 0.02],
    [-8, 17, -68, 52, 7.5, 0],
  ];

  return (
    <group renderOrder={-100}>
      <mesh ref={skyRef} renderOrder={-120}>
        <sphereGeometry args={[132, 48, 24]} />
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

function createSkyTexture() {
  const texture = createCanvasTexture(2048, 1024, (context, width, height) => {
    const skyGradient = context.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, "#2b79c8");
    skyGradient.addColorStop(0.2, "#5aa8e3");
    skyGradient.addColorStop(0.48, "#a7d6f2");
    skyGradient.addColorStop(0.66, "#f0d7ab");
    skyGradient.addColorStop(0.8, "#d4c79f");
    skyGradient.addColorStop(1, "#8ca376");
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, width, height);

    const sunX = width * 0.27;
    const sunY = height * 0.34;
    const sunGlow = context.createRadialGradient(sunX, sunY, 12, sunX, sunY, width * 0.32);
    sunGlow.addColorStop(0, "rgba(255, 252, 223, 0.92)");
    sunGlow.addColorStop(0.08, "rgba(255, 229, 162, 0.58)");
    sunGlow.addColorStop(0.33, "rgba(255, 202, 133, 0.18)");
    sunGlow.addColorStop(1, "rgba(255, 202, 133, 0)");
    context.fillStyle = sunGlow;
    context.fillRect(0, 0, width, height);

    const horizonGlow = context.createLinearGradient(0, height * 0.48, 0, height * 0.9);
    horizonGlow.addColorStop(0, "rgba(255, 255, 255, 0)");
    horizonGlow.addColorStop(0.45, "rgba(255, 247, 219, 0.34)");
    horizonGlow.addColorStop(1, "rgba(162, 199, 179, 0.12)");
    context.fillStyle = horizonGlow;
    context.fillRect(0, height * 0.48, width, height * 0.46);

    paintCumulusBand(context, width, height, 0.11, 0.18, 26);
    paintCumulusBand(context, width, height, 0.22, 0.24, 34);
    paintCumulusBand(context, width, height, 0.32, 0.34, 38);
    paintCumulusBand(context, width, height, 0.48, 0.24, 52);
    paintWisps(context, width, height, 52, 0.03, 0.28, 0.44);
    paintWisps(context, width, height, 44, 0.1, 0.58, 0.32);
    paintWisps(context, width, height, 36, 0.34, 0.72, 0.36);
    paintHorizonClouds(context, width, height);

    const vignette = context.createRadialGradient(width / 2, height * 0.45, height * 0.08, width / 2, height * 0.45, width * 0.72);
    vignette.addColorStop(0, "rgba(255, 255, 255, 0)");
    vignette.addColorStop(0.72, "rgba(53, 116, 163, 0)");
    vignette.addColorStop(1, "rgba(42, 89, 122, 0.22)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createCloudTexture() {
  const texture = createCanvasTexture(768, 256, (context, width, height) => {
    for (let layer = 0; layer < 4; layer += 1) {
      for (let i = 0; i < 80; i += 1) {
        const seed = i + layer * 91.7;
        const x = noise01(seed * 5.7) * width;
        const y = height * (0.35 + noise01(seed * 2.3) * 0.25);
        const radiusX = width * (0.03 + noise01(seed * 9.1) * 0.09);
        const radiusY = height * (0.08 + noise01(seed * 4.4) * 0.2);
        const alpha = 0.055 + noise01(seed * 8.8) * 0.14;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(0.58, `rgba(255, 249, 232, ${alpha * 0.72})`);
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, noise01(seed) * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    }

    const shade = context.createLinearGradient(0, height * 0.48, 0, height);
    shade.addColorStop(0, "rgba(255, 255, 255, 0)");
    shade.addColorStop(1, "rgba(140, 176, 194, 0.24)");
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createSunGlowTexture() {
  const texture = createCanvasTexture(512, 512, (context, width, height) => {
    const center = width / 2;
    const glow = context.createRadialGradient(center, center, 0, center, center, width / 2);
    glow.addColorStop(0, "rgba(255, 255, 236, 1)");
    glow.addColorStop(0.08, "rgba(255, 243, 191, 0.96)");
    glow.addColorStop(0.2, "rgba(255, 220, 136, 0.38)");
    glow.addColorStop(0.52, "rgba(255, 197, 117, 0.12)");
    glow.addColorStop(1, "rgba(255, 197, 117, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255, 249, 215, 0.22)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center, center, width * 0.095, 0, Math.PI * 2);
    context.stroke();
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintWisps(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  count: number,
  minY: number,
  maxY: number,
  opacity: number,
) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i += 1) {
    const x = noise01(i * 12.77 + minY * 300) * width;
    const y = height * (minY + noise01(i * 4.21 + maxY * 80) * (maxY - minY));
    const length = width * (0.06 + noise01(i * 8.43) * 0.2);
    const thickness = height * (0.006 + noise01(i * 2.91) * 0.018);
    const rotation = -0.08 + noise01(i * 6.17) * 0.2;
    const gradient = context.createLinearGradient(x - length, y, x + length, y);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${opacity * (0.45 + noise01(i * 3.2) * 0.55)})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.translate(x, y);
    context.rotate(rotation);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, length, thickness, 0, 0, Math.PI * 2);
    context.fill();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
  context.restore();
}

function paintCumulusBand(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  yRatio: number,
  opacity: number,
  count: number,
) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i += 1) {
    const seed = i * 17.91 + yRatio * 1000;
    const x = (i / count) * width + (noise01(seed * 1.7) - 0.5) * width * 0.08;
    const y = height * (yRatio + (noise01(seed * 3.2) - 0.5) * 0.09);
    const radiusX = width * (0.03 + noise01(seed * 4.6) * 0.07);
    const radiusY = height * (0.012 + noise01(seed * 5.4) * 0.045);
    const alpha = opacity * (0.45 + noise01(seed * 2.8) * 0.55);
    const highlight = context.createRadialGradient(x, y - radiusY * 0.4, 0, x, y, radiusX);
    highlight.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    highlight.addColorStop(0.48, `rgba(255, 248, 226, ${alpha * 0.7})`);
    highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = highlight;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, noise01(seed) * 0.18 - 0.09, 0, Math.PI * 2);
    context.fill();

    const shade = context.createRadialGradient(x, y + radiusY * 0.45, 0, x, y + radiusY * 0.45, radiusX * 1.08);
    shade.addColorStop(0, `rgba(135, 176, 202, ${alpha * 0.2})`);
    shade.addColorStop(0.72, `rgba(135, 176, 202, ${alpha * 0.09})`);
    shade.addColorStop(1, "rgba(135, 176, 202, 0)");
    context.globalCompositeOperation = "source-over";
    context.fillStyle = shade;
    context.beginPath();
    context.ellipse(x, y + radiusY * 0.35, radiusX * 0.92, radiusY * 0.72, 0, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "screen";
  }
  context.restore();
}

function paintHorizonClouds(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  for (let i = 0; i < 64; i += 1) {
    const x = noise01(i * 18.13) * width;
    const y = height * (0.56 + noise01(i * 4.31) * 0.17);
    const radiusX = width * (0.025 + noise01(i * 8.9) * 0.09);
    const radiusY = height * (0.012 + noise01(i * 3.8) * 0.04);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
    gradient.addColorStop(0, "rgba(255, 246, 219, 0.28)");
    gradient.addColorStop(0.62, "rgba(237, 242, 234, 0.15)");
    gradient.addColorStop(1, "rgba(237, 242, 234, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function configureTile(texture: THREE.Texture, repeatX: number, repeatY: number) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

function createBarkTexture() {
  return createCanvasTexture(128, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#5a311c");
    gradient.addColorStop(0.5, "#8b5938");
    gradient.addColorStop(1, "#4b2a18");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 95; i += 1) {
      const x = noise01(i * 13.17) * width;
      const lineWidth = 1 + noise01(i * 7.81) * 3.5;
      const light = 48 + Math.floor(noise01(i * 5.43) * 80);
      context.strokeStyle = `rgba(${light + 28}, ${Math.max(24, light - 5)}, ${Math.max(14, light - 22)}, 0.42)`;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= height; y += 18) {
        context.lineTo(x + Math.sin(y * 0.045 + i) * (2 + noise01(i) * 4), y);
      }
      context.stroke();
    }

    for (let i = 0; i < 34; i += 1) {
      const y = noise01(i * 19.9) * height;
      context.fillStyle = "rgba(32, 19, 12, 0.38)";
      context.fillRect(0, y, width, 1 + noise01(i * 3.1) * 3);
    }
  }, 1.4, 2.6);
}

function createLeafTexture() {
  return createCanvasTexture(128, 128, (context, width, height) => {
    context.fillStyle = "#5a953e";
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 260; i += 1) {
      const x = noise01(i * 4.17) * width;
      const y = noise01(i * 9.41) * height;
      const size = 1.2 + noise01(i * 2.07) * 4.5;
      const bright = noise01(i * 6.19) > 0.52;
      context.fillStyle = bright ? "rgba(166, 204, 99, 0.34)" : "rgba(31, 77, 35, 0.28)";
      context.beginPath();
      context.ellipse(x, y, size * 1.25, size, noise01(i) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    for (let i = 0; i < 26; i += 1) {
      const y = noise01(i * 8.29) * height;
      context.strokeStyle = "rgba(238, 246, 179, 0.13)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + Math.sin(i) * 12);
      context.stroke();
    }
  }, 2.1, 2.1);
}

function createWaterTexture() {
  return createCanvasTexture(256, 256, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, "#bdf8ff");
    gradient.addColorStop(0.42, "#5bd4ed");
    gradient.addColorStop(1, "#1f8eb1");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 42; i += 1) {
      const y = noise01(i * 11.3) * height;
      const amplitude = 3 + noise01(i * 2.1) * 12;
      context.strokeStyle = i % 3 === 0 ? "rgba(255, 255, 255, 0.34)" : "rgba(103, 239, 255, 0.28)";
      context.lineWidth = 1 + noise01(i * 5.7) * 2.5;
      context.beginPath();
      for (let x = -12; x <= width + 12; x += 12) {
        const waveY = y + Math.sin(x * 0.045 + i * 1.7) * amplitude;
        if (x === -12) context.moveTo(x, waveY);
        else context.lineTo(x, waveY);
      }
      context.stroke();
    }

    for (let i = 0; i < 90; i += 1) {
      const x = noise01(i * 8.83) * width;
      const y = noise01(i * 3.61) * height;
      const size = 1 + noise01(i * 12.7) * 2.6;
      context.fillStyle = "rgba(255, 255, 255, 0.38)";
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }, 1.5, 1.5);
}

function createCanvasTexture(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  repeatX = 1,
  repeatY = 1,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures require a 2D context.");
  paint(context, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.center.set(0.5, 0.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function treeVariant(x: number, z: number) {
  return noise01(x * 12.9898 + z * 78.233);
}

function noise01(value: number) {
  return fract(Math.sin(value) * 43758.5453123);
}

function fract(value: number) {
  return value - Math.floor(value);
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

function DirtPath({
  position,
  size,
}: {
  position: [number, number, number];
  size: [number, number];
}) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial color="#80613f" transparent opacity={0.78} />
    </mesh>
  );
}

function WorldBackdrop({
  barkTexture,
  leafTexture,
}: {
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  return (
    <group>
      <mesh position={[-58, 4.1, -82]} rotation-y={0.5} scale={[1.72, 0.9, 0.96]}>
        <coneGeometry args={[8.5, 16, 4]} />
        <meshBasicMaterial color="#8b8978" />
      </mesh>
      <mesh position={[-26, 3.7, -86]} rotation-y={0.1} scale={[1.34, 0.8, 0.98]}>
        <coneGeometry args={[7.6, 14, 4]} />
        <meshBasicMaterial color="#9b947f" />
      </mesh>
      <mesh position={[54, 3.95, -82]} rotation-y={0.25} scale={[1.62, 0.86, 0.96]}>
        <coneGeometry args={[8.2, 15, 4]} />
        <meshBasicMaterial color="#888c78" />
      </mesh>
      <InstancedTrees trees={BACKDROP_TREES} barkTexture={barkTexture} leafTexture={leafTexture} />
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

function MarketStall({
  position,
  rotation = 0,
  color,
  roofTexture,
}: {
  position: [number, number, number];
  rotation?: number;
  color: string;
  roofTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[3.3, 0.35, 1.7]} />
        <meshBasicMaterial color="#6a4428" />
      </mesh>
      <mesh position={[0, 0.86, 0.05]}>
        <boxGeometry args={[3.1, 0.18, 1.54]} />
        <meshBasicMaterial color="#c3a06f" />
      </mesh>
      {[-1.45, 1.45].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.48, -0.66]}>
            <cylinderGeometry args={[0.06, 0.08, 2.1, 8]} />
            <meshBasicMaterial color="#4b2d18" />
          </mesh>
          <mesh position={[x, 1.48, 0.66]}>
            <cylinderGeometry args={[0.06, 0.08, 2.1, 8]} />
            <meshBasicMaterial color="#4b2d18" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.38, 0]} rotation-z={0.08}>
        <boxGeometry args={[3.65, 0.2, 2.18]} />
        <meshBasicMaterial map={roofTexture} color={color} />
      </mesh>
      <mesh position={[0, 2.08, 1.13]}>
        <boxGeometry args={[3.45, 0.55, 0.08]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[0, 2.09, 1.2]}
        fontSize={0.34}
        color="#fff8df"
        outlineColor="#2d2822"
        outlineWidth={0.025}
        anchorX="center"
        anchorY="middle"
      >
        MKT
      </Text>
      {[-1.04, -0.34, 0.4, 1.08].map((x, index) => (
        <mesh key={x} position={[x, 1.08, 0.42 - (index % 2) * 0.38]}>
          <boxGeometry args={[0.42, 0.36, 0.42]} />
          <meshBasicMaterial color={index % 2 ? "#e8c063" : "#8fc263"} />
        </mesh>
      ))}
    </group>
  );
}

function WatchTower({
  position,
  stoneTexture,
  roofTexture,
}: {
  position: [number, number, number];
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.85, 0]}>
        <cylinderGeometry args={[1.15, 1.35, 3.7, 12]} />
        <meshBasicMaterial map={stoneTexture} color="#9c9589" />
      </mesh>
      <mesh position={[0, 3.86, 0]}>
        <cylinderGeometry args={[1.62, 1.38, 0.55, 12]} />
        <meshBasicMaterial map={stoneTexture} color="#837b70" />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <mesh
            key={index}
            position={[Math.sin(angle) * 1.34, 4.35, Math.cos(angle) * 1.34]}
            rotation-y={angle}
          >
            <boxGeometry args={[0.34, 0.68, 0.28]} />
            <meshBasicMaterial map={stoneTexture} color="#8d8579" />
          </mesh>
        );
      })}
      <mesh position={[0, 5.05, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[1.98, 1.6, 4]} />
        <meshBasicMaterial map={roofTexture} color="#8e3823" />
      </mesh>
      <BannerPost position={[0, 0.04, 1.9]} color="#395da8" />
    </group>
  );
}

function RundownFarm({
  position,
  rotation = 0,
  stoneTexture,
  roofTexture,
  wallTexture,
  barkTexture,
}: {
  position: [number, number, number];
  rotation?: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <MudPatch position={[-1, 0.026, 0]} scale={[9.5, 5.8, 1]} />
      <MudPatch position={[7.8, 0.027, 3.8]} scale={[6.2, 3.2, 1]} />
      <MudPatch position={[-8.8, 0.027, 4.4]} scale={[5.8, 3.6, 1]} />
      <BrokenFence width={26} depth={18} barkTexture={barkTexture} />
      <FarmHouse position={[-7.8, 0, -3.8]} rotation={0.1} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} />
      <SaggingBarn position={[7.2, 0, -3.2]} rotation={-0.12} stoneTexture={stoneTexture} roofTexture={roofTexture} wallTexture={wallTexture} />
      <CollapsedShed position={[5.8, 0, 6.4]} rotation={0.38} roofTexture={roofTexture} barkTexture={barkTexture} />
      <Scarecrow position={[-10.2, 0, 5.8]} rotation={0.34} barkTexture={barkTexture} />
      <Text
        position={[0, 1.6, -9.5]}
        rotation-y={0}
        fontSize={0.42}
        color="#e9d7ad"
        outlineColor="#2d2016"
        outlineWidth={0.035}
        anchorX="center"
      >
        OLD FARM
      </Text>
    </group>
  );
}

function MudPatch({
  position,
  scale,
}: {
  position: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position} scale={scale}>
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial color="#5d432f" transparent opacity={0.82} />
    </mesh>
  );
}

function FarmHouse({
  position,
  rotation,
  stoneTexture,
  roofTexture,
  wallTexture,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[5.6, 0.56, 4.1]} />
        <meshBasicMaterial map={stoneTexture} color="#a08b70" />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[5.25, 3.45, 3.85]} />
        <meshBasicMaterial map={wallTexture} color="#b79b79" />
      </mesh>
      <mesh position={[-0.22, 4.02, 0]} rotation-z={0.16}>
        <boxGeometry args={[6.45, 0.28, 4.86]} />
        <meshBasicMaterial map={roofTexture} color="#6f3525" />
      </mesh>
      <mesh position={[1.95, 2.35, 2.02]}>
        <boxGeometry args={[1.08, 1.0, 0.16]} />
        <meshBasicMaterial color="#201811" />
      </mesh>
      <mesh position={[-1.64, 1.52, 2.04]}>
        <boxGeometry args={[1.15, 1.85, 0.16]} />
        <meshBasicMaterial color="#3e2919" />
      </mesh>
      {[[-2.48, 2.2, 2.12, 0.22], [0.18, 3.72, 2.12, -0.48], [2.6, 1.15, 2.12, 0.08]].map(([x, y, z, rot], index) => (
        <mesh key={index} position={[x, y, z]} rotation-z={rot}>
          <boxGeometry args={[0.18, 2.3, 0.15]} />
          <meshBasicMaterial color="#4d2f1b" />
        </mesh>
      ))}
    </group>
  );
}

function SaggingBarn({
  position,
  rotation,
  stoneTexture,
  roofTexture,
  wallTexture,
}: {
  position: [number, number, number];
  rotation: number;
  stoneTexture: THREE.Texture;
  roofTexture: THREE.Texture;
  wallTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[7.3, 0.5, 5.7]} />
        <meshBasicMaterial map={stoneTexture} color="#8e7a62" />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <boxGeometry args={[6.9, 4.1, 5.35]} />
        <meshBasicMaterial map={wallTexture} color="#8b5336" />
      </mesh>
      <mesh position={[-0.18, 4.95, 0]} rotation-z={-0.1}>
        <boxGeometry args={[8.1, 0.34, 6.35]} />
        <meshBasicMaterial map={roofTexture} color="#5f291d" />
      </mesh>
      <mesh position={[0, 1.52, 2.76]}>
        <boxGeometry args={[2.6, 2.45, 0.18]} />
        <meshBasicMaterial color="#2f1f16" />
      </mesh>
      <mesh position={[0, 1.55, 2.88]} rotation-z={0.55}>
        <boxGeometry args={[0.22, 3.2, 0.12]} />
        <meshBasicMaterial color="#a06b42" />
      </mesh>
      <mesh position={[0, 1.55, 2.9]} rotation-z={-0.55}>
        <boxGeometry args={[0.22, 3.2, 0.12]} />
        <meshBasicMaterial color="#a06b42" />
      </mesh>
      {[[-2.85, 2.4, 2.82, 0.1], [2.8, 2.2, 2.82, -0.2], [-1.2, 4.55, 2.84, -0.42]].map(([x, y, z, rot], index) => (
        <mesh key={index} position={[x, y, z]} rotation-z={rot}>
          <boxGeometry args={[0.18, 2.2, 0.14]} />
          <meshBasicMaterial color="#4d2f1b" />
        </mesh>
      ))}
    </group>
  );
}

function CollapsedShed({
  position,
  rotation,
  roofTexture,
  barkTexture,
}: {
  position: [number, number, number];
  rotation: number;
  roofTexture: THREE.Texture;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.75, 0]} rotation-z={0.62}>
        <boxGeometry args={[4.8, 0.28, 2.7]} />
        <meshBasicMaterial map={roofTexture} color="#5d3020" />
      </mesh>
      {[-1.8, -0.4, 1.1, 2.2].map((x, index) => (
        <mesh key={index} position={[x, 0.42, index % 2 ? -0.72 : 0.62]} rotation-z={0.5 - index * 0.18}>
          <cylinderGeometry args={[0.07, 0.1, 2.2, 8]} />
          <meshStandardMaterial map={barkTexture} color="#664125" roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

function Scarecrow({
  position,
  rotation,
  barkTexture,
}: {
  position: [number, number, number];
  rotation: number;
  barkTexture: THREE.Texture;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 1.22, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 2.44, 8]} />
        <meshStandardMaterial map={barkTexture} color="#5d3b22" roughness={0.96} />
      </mesh>
      <mesh position={[0, 1.78, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.06, 2.2, 8]} />
        <meshStandardMaterial map={barkTexture} color="#5d3b22" roughness={0.96} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <sphereGeometry args={[0.28, 12, 8]} />
        <meshBasicMaterial color="#b58a45" />
      </mesh>
      <mesh position={[0, 1.55, 0.03]}>
        <coneGeometry args={[0.58, 1.1, 4]} />
        <meshBasicMaterial color="#826b34" />
      </mesh>
    </group>
  );
}

function BrokenFence({
  width,
  depth,
  barkTexture,
}: {
  width: number;
  depth: number;
  barkTexture: THREE.Texture;
}) {
  const frontBackPosts = Array.from({ length: 8 }, (_, index) => -width / 2 + index * (width / 7));
  const sidePosts = Array.from({ length: 5 }, (_, index) => -depth / 2 + index * (depth / 4));

  return (
    <group>
      {frontBackPosts.map((x, index) => (
        <group key={`fb-${index}`}>
          <FencePost position={[x, 0, -depth / 2]} barkTexture={barkTexture} broken={index === 2} />
          {index !== 4 && <FencePost position={[x, 0, depth / 2]} barkTexture={barkTexture} broken={index === 6} />}
        </group>
      ))}
      {sidePosts.map((z, index) => (
        <group key={`side-${index}`}>
          {index !== 2 && <FencePost position={[-width / 2, 0, z]} barkTexture={barkTexture} broken={index === 1} />}
          <FencePost position={[width / 2, 0, z]} barkTexture={barkTexture} broken={index === 3} />
        </group>
      ))}
      <FenceRail position={[0, 0.9, -depth / 2]} size={[width - 1.4, 0.11, 0.13]} barkTexture={barkTexture} />
      <FenceRail position={[0, 0.58, -depth / 2 + 0.05]} size={[width - 5.8, 0.1, 0.12]} barkTexture={barkTexture} />
      <FenceRail position={[-3.8, 0.78, depth / 2]} size={[width - 8.6, 0.11, 0.13]} barkTexture={barkTexture} />
      <FenceRail position={[-width / 2, 0.78, 1.4]} size={[depth - 3.6, 0.11, 0.13]} rotation={Math.PI / 2} barkTexture={barkTexture} />
      <FenceRail position={[width / 2, 0.78, -1.6]} size={[depth - 5.2, 0.11, 0.13]} rotation={Math.PI / 2} barkTexture={barkTexture} />
    </group>
  );
}

function FencePost({
  position,
  barkTexture,
  broken = false,
}: {
  position: [number, number, number];
  barkTexture: THREE.Texture;
  broken?: boolean;
}) {
  return (
    <mesh position={[position[0], broken ? 0.42 : 0.62, position[2]]} rotation-z={broken ? 0.3 : 0}>
      <cylinderGeometry args={[0.08, 0.11, broken ? 0.84 : 1.24, 8]} />
      <meshStandardMaterial map={barkTexture} color="#5b391f" roughness={0.96} />
    </mesh>
  );
}

function FenceRail({
  position,
  size,
  barkTexture,
  rotation = 0,
}: {
  position: [number, number, number];
  size: [number, number, number];
  barkTexture: THREE.Texture;
  rotation?: number;
}) {
  return (
    <mesh position={position} rotation-y={rotation} rotation-z={rotation ? 0.08 : -0.035}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={barkTexture} color="#6a4428" roughness={0.95} />
    </mesh>
  );
}

function TreeCluster({
  barkTexture,
  leafTexture,
}: {
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  return <InstancedTrees trees={TOWN_TREES} barkTexture={barkTexture} leafTexture={leafTexture} />;
}

function InstancedTrees({
  trees,
  barkTexture,
  leafTexture,
}: {
  trees: TreeSpec[];
  barkTexture: THREE.Texture;
  leafTexture: THREE.Texture;
}) {
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const rootRef = useRef<THREE.InstancedMesh>(null);
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const tuftRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo(() => buildTreeInstances(trees), [trees]);
  const geometries = useMemo(() => ({
    shadow: new THREE.CircleGeometry(1.38, 28),
    trunk: new THREE.CylinderGeometry(0.2, 0.34, 1.8, 12),
    root: new THREE.CylinderGeometry(0.06, 0.12, 1, 8),
    branch: new THREE.CylinderGeometry(0.05, 0.12, 1, 8),
    leaf: new THREE.SphereGeometry(1, 18, 12),
    tuft: new THREE.ConeGeometry(0.46, 0.82, 7),
  }), []);
  const materials = useMemo(() => ({
    shadow: new THREE.MeshBasicMaterial({ color: "#1c2615", transparent: true, opacity: 0.22, depthWrite: false }),
    bark: new THREE.MeshStandardMaterial({ map: barkTexture, color: "#ffffff", roughness: 0.96 }),
    root: new THREE.MeshStandardMaterial({ map: barkTexture, color: TREE_ROOT_COLOR, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture, color: "#ffffff", roughness: 0.88, metalness: 0, flatShading: true }),
    tuft: new THREE.MeshStandardMaterial({ map: leafTexture, color: "#ffffff", roughness: 0.9, flatShading: true }),
  }), [barkTexture, leafTexture]);

  useLayoutEffect(() => {
    applyTreeInstances(shadowRef.current, instances.shadow);
    applyTreeInstances(trunkRef.current, instances.trunks);
    applyTreeInstances(rootRef.current, instances.roots);
    applyTreeInstances(branchRef.current, instances.branches);
    applyTreeInstances(leafRef.current, instances.leaves);
    applyTreeInstances(tuftRef.current, instances.tufts);
  }, [instances]);

  return (
    <>
      <instancedMesh ref={shadowRef} args={[geometries.shadow, materials.shadow, instances.shadow.length]} />
      <instancedMesh ref={trunkRef} args={[geometries.trunk, materials.bark, instances.trunks.length]} />
      <instancedMesh ref={rootRef} args={[geometries.root, materials.root, instances.roots.length]} />
      <instancedMesh ref={branchRef} args={[geometries.branch, materials.bark, instances.branches.length]} />
      <instancedMesh ref={leafRef} args={[geometries.leaf, materials.leaf, instances.leaves.length]} />
      <instancedMesh ref={tuftRef} args={[geometries.tuft, materials.tuft, instances.tufts.length]} />
    </>
  );
}

function buildTreeInstances(trees: TreeSpec[]) {
  const shadow: TreeInstance[] = [];
  const trunks: TreeInstance[] = [];
  const roots: TreeInstance[] = [];
  const branches: TreeInstance[] = [];
  const leaves: TreeInstance[] = [];
  const tufts: TreeInstance[] = [];

  for (const tree of trees) {
    const [x, y, z] = tree.position;
    const variant = treeVariant(x, z);
    const barkColor = new THREE.Color(variant > 0.5 ? "#7b4c2f" : "#895737");
    const bend = (variant - 0.5) * 0.16;
    const canopyHeight = 2.45 + variant * 0.35;
    const treeMatrix = composeTreeMatrix(tree.position, [0, 0, 0], [tree.scale, tree.scale, tree.scale]);

    shadow.push({ matrix: composeTreeMatrix([0, 0.018, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], treeMatrix) });
    trunks.push({ matrix: composeTreeMatrix([0, 0.9, 0], [0, 0, bend], [1, 1, 1], treeMatrix), color: barkColor });

    [
      [-0.23, 0.18, 0.2, 0.62, 1.0],
      [0.28, 0.2, -0.18, -0.58, 0.85],
      [0.05, 0.13, -0.36, 0.2, 0.65],
    ].forEach(([rx, ry, rz, rot, length], index) => {
      roots.push({
        matrix: composeTreeMatrix([rx, ry, rz], [0, index * 1.8, rot], [1, length, 1], treeMatrix),
      });
    });

    [
      [-0.42, 1.45, 0.14, 0.7, 0.82, 0.1],
      [0.44, 1.68, -0.08, -0.72, 0.92, 1.5],
      [0.08, 1.86, -0.44, 0.54, 0.7, 2.85],
    ].forEach(([bx, by, bz, rotZ, length, rotY]) => {
      branches.push({
        matrix: composeTreeMatrix([bx, by, bz], [0, rotY, rotZ], [1, length, 1], treeMatrix),
        color: barkColor,
      });
    });

    [
      [0, canopyHeight, 0, 1.28, 0.98, 1.18, 0],
      [-0.58, canopyHeight - 0.22, 0.12, 0.9, 0.72, 0.82, 1],
      [0.55, canopyHeight - 0.08, -0.06, 0.92, 0.78, 0.86, 2],
      [0.05, canopyHeight + 0.45, -0.05, 0.9, 0.75, 0.88, 3],
      [0.08, canopyHeight - 0.36, 0.55, 0.78, 0.64, 0.72, 1],
    ].forEach(([lx, ly, lz, sx, sy, sz, colorIndex], index) => {
      leaves.push({
        matrix: composeTreeMatrix([lx, ly, lz], [0, variant * Math.PI + index * 0.7, 0], [sx, sy, sz], treeMatrix),
        color: new THREE.Color(TREE_LEAF_COLORS[colorIndex]),
      });
    });

    [
      [-0.75, canopyHeight - 0.1, 0.45, 0.08],
      [0.82, canopyHeight + 0.1, 0.2, -0.12],
      [0.16, canopyHeight + 0.75, -0.48, 0.16],
    ].forEach(([tx, ty, tz, rot], index) => {
      tufts.push({
        matrix: composeTreeMatrix([tx, ty, tz], [0, index * 1.35, rot], [1, 1, 1], treeMatrix),
        color: new THREE.Color(TREE_LEAF_COLORS[(index + 2) % TREE_LEAF_COLORS.length]),
      });
    });
  }

  return { shadow, trunks, roots, branches, leaves, tufts };
}

function composeTreeMatrix(
  position: Vec3Tuple,
  rotation: Vec3Tuple,
  scale: Vec3Tuple,
  parent?: THREE.Matrix4,
) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );

  return parent ? parent.clone().multiply(matrix) : matrix;
}

function applyTreeInstances(mesh: THREE.InstancedMesh | null, instances: TreeInstance[]) {
  if (!mesh) return;

  instances.forEach((instance, index) => {
    mesh.setMatrixAt(index, instance.matrix);
    if (instance.color) mesh.setColorAt(index, instance.color);
  });

  mesh.count = instances.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function Fountain({
  stoneTexture,
  waterTexture,
}: {
  stoneTexture: THREE.Texture;
  waterTexture: THREE.Texture;
}) {
  const surfaceRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const spillRef = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.elapsedTime;
    waterTexture.offset.x = (waterTexture.offset.x + delta * 0.018) % 1;
    waterTexture.offset.y = (waterTexture.offset.y + delta * 0.026) % 1;
    waterTexture.rotation = elapsed * 0.035;

    if (surfaceRef.current) {
      surfaceRef.current.rotation.z = elapsed * 0.045;
    }
    if (rippleRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.9) * 0.018;
      rippleRef.current.scale.set(pulse, pulse, pulse);
      rippleRef.current.rotation.z = -elapsed * 0.08;
    }
    if (spillRef.current) {
      const shimmer = 1 + Math.sin(elapsed * 6.2) * 0.025;
      spillRef.current.scale.set(shimmer, 1, shimmer);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[4.45, 4.9, 0.36, 96]} />
        <meshStandardMaterial map={stoneTexture} color="#8f887c" roughness={0.92} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.5, 0]}>
        <torusGeometry args={[4.08, 0.26, 12, 96]} />
        <meshStandardMaterial map={stoneTexture} color="#aaa293" roughness={0.86} />
      </mesh>
      {Array.from({ length: 24 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        return (
          <mesh
            key={`basin-stone-${index}`}
            position={[Math.sin(angle) * 4.45, 0.58, Math.cos(angle) * 4.45]}
            rotation-y={angle}
          >
            <boxGeometry args={[0.52, 0.18, 0.24]} />
            <meshStandardMaterial map={stoneTexture} color={index % 2 ? "#8a8376" : "#9a9285"} roughness={0.95} />
          </mesh>
        );
      })}
      <mesh ref={surfaceRef} rotation-x={-Math.PI / 2} position={[0, 0.635, 0]}>
        <circleGeometry args={[3.72, 128]} />
        <meshPhysicalMaterial
          map={waterTexture}
          color="#6edfff"
          roughness={0.06}
          metalness={0}
          transmission={0.22}
          thickness={0.36}
          transparent
          opacity={0.64}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={rippleRef} rotation-x={Math.PI / 2} position={[0, 0.665, 0]}>
        <torusGeometry args={[2.35, 0.018, 8, 128]} />
        <meshBasicMaterial color="#e8fbff" transparent opacity={0.36} depthWrite={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.675, 0]}>
        <torusGeometry args={[1.28, 0.014, 8, 96]} />
        <meshBasicMaterial color="#b7f2ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.56, 0.72, 1.15, 32]} />
        <meshStandardMaterial map={stoneTexture} color="#958f85" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <cylinderGeometry args={[1.05, 0.72, 0.38, 48]} />
        <meshStandardMaterial map={stoneTexture} color="#8e877c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <sphereGeometry args={[0.38, 32, 18]} />
        <meshStandardMaterial color="#f2efe4" roughness={0.52} metalness={0.02} />
      </mesh>

      <group ref={spillRef}>
        <WaterArc start={[0.2, 2.06, 0]} mid={[1.65, 2.45, 0]} end={[3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[-0.2, 2.06, 0]} mid={[-1.65, 2.42, 0]} end={[-3.22, 0.78, 0]} radius={0.033} />
        <WaterArc start={[0, 2.06, 0.2]} mid={[0, 2.44, 1.65]} end={[0, 0.78, 3.22]} radius={0.033} />
        <WaterArc start={[0, 2.06, -0.2]} mid={[0, 2.42, -1.65]} end={[0, 0.78, -3.22]} radius={0.033} />
        <WaterArc start={[0, 2.18, 0]} mid={[0, 2.92, 0]} end={[0, 2.24, 0]} radius={0.045} opacity={0.52} />
      </group>

      <FountainDroplets />
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

function WaterArc({
  start,
  mid,
  end,
  radius,
  opacity = 0.44,
}: {
  start: [number, number, number];
  mid: [number, number, number];
  end: [number, number, number];
  radius: number;
  opacity?: number;
}) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(...start),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...end),
    ]),
    [end, mid, start],
  );

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.opacity = opacity + Math.sin(clock.elapsedTime * 7 + start[0] * 3 + start[2]) * 0.06;
  });

  return (
    <mesh>
      <tubeGeometry args={[curve, 28, radius, 10, false]} />
      <meshPhysicalMaterial
        ref={materialRef}
        color="#bff7ff"
        roughness={0.02}
        transmission={0.35}
        thickness={0.24}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

function FountainDroplets() {
  const groupRef = useRef<THREE.Group>(null);
  const droplets = useMemo(() => Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 0.45 + (index % 8) * 0.12;
    const height = 1.85 + ((index * 7) % 11) * 0.08;
    const size = 0.026 + (index % 4) * 0.008;
    return { angle, height, radius, size };
  }), []);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y = clock.elapsedTime * 0.14;
  });

  return (
    <group ref={groupRef}>
      {droplets.map(({ angle, height, radius, size }, index) => (
        <mesh
          key={index}
          position={[Math.sin(angle) * radius, height, Math.cos(angle) * radius]}
        >
          <sphereGeometry args={[size, 8, 6]} />
          <meshBasicMaterial color="#e6fbff" transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ))}
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
      <mesh position={[2.55, 5.78, -0.8]}>
        <boxGeometry args={[0.62, 1.45, 0.62]} />
        <meshBasicMaterial map={stoneTexture} color="#b29b7e" />
      </mesh>
      <mesh position={[2.55, 6.58, -0.8]}>
        <boxGeometry args={[0.86, 0.28, 0.86]} />
        <meshBasicMaterial color="#4b3325" />
      </mesh>
    </group>
  );
}

function GabledRoof({ roofTexture }: { roofTexture: THREE.Texture }) {
  const eaveY = 4.62;
  const ridgeY = 6.22;
  const run = 4.22;
  const depth = 5.62;
  const rise = ridgeY - eaveY;
  const slopeLength = Math.hypot(run, rise);
  const slopeAngle = Math.atan2(rise, run);

  return (
    <group>
      <mesh position={[-run / 2, eaveY + rise / 2, 0]} rotation-z={slopeAngle}>
        <boxGeometry args={[slopeLength, 0.18, depth]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <mesh position={[run / 2, eaveY + rise / 2, 0]} rotation-z={-slopeAngle}>
        <boxGeometry args={[slopeLength, 0.18, depth]} />
        <meshBasicMaterial map={roofTexture} />
      </mesh>
      <RoofGable z={2.86} eaveY={eaveY - 0.08} ridgeY={ridgeY - 0.2} width={7.28} />
      <RoofGable z={-2.86} eaveY={eaveY - 0.08} ridgeY={ridgeY - 0.2} width={7.28} rotation={Math.PI} />
      <mesh position={[0, ridgeY + 0.03, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.2, 0.2, depth + 0.42, 8]} />
        <meshBasicMaterial color="#7c321c" />
      </mesh>
      <mesh position={[-run - 0.02, eaveY - 0.06, 0]} rotation-z={slopeAngle}>
        <boxGeometry args={[0.26, 0.35, depth + 0.46]} />
        <meshBasicMaterial color="#6b341d" />
      </mesh>
      <mesh position={[run + 0.02, eaveY - 0.06, 0]} rotation-z={-slopeAngle}>
        <boxGeometry args={[0.26, 0.35, depth + 0.46]} />
        <meshBasicMaterial color="#6b341d" />
      </mesh>
      <RoofFascia z={2.95} eaveY={eaveY - 0.08} ridgeY={ridgeY} run={run} angle={slopeAngle} />
      <RoofFascia z={-2.95} eaveY={eaveY - 0.08} ridgeY={ridgeY} run={run} angle={slopeAngle} />
    </group>
  );
}

function RoofGable({
  z,
  eaveY,
  ridgeY,
  width,
  rotation = 0,
}: {
  z: number;
  eaveY: number;
  ridgeY: number;
  width: number;
  rotation?: number;
}) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, eaveY);
  shape.lineTo(0, ridgeY);
  shape.lineTo(width / 2, eaveY);
  shape.lineTo(-width / 2, eaveY);

  return (
    <mesh position={[0, 0, z]} rotation-y={rotation}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color="#ead8b8" side={THREE.DoubleSide} />
    </mesh>
  );
}

function RoofFascia({
  z,
  eaveY,
  ridgeY,
  run,
  angle,
}: {
  z: number;
  eaveY: number;
  ridgeY: number;
  run: number;
  angle: number;
}) {
  const length = Math.hypot(run, ridgeY - eaveY);

  return (
    <group position={[0, 0, z]}>
      <mesh position={[-run / 2, (eaveY + ridgeY) / 2, 0]} rotation-z={angle}>
        <boxGeometry args={[length, 0.18, 0.18]} />
        <meshBasicMaterial color="#5d2f1a" />
      </mesh>
      <mesh position={[run / 2, (eaveY + ridgeY) / 2, 0]} rotation-z={-angle}>
        <boxGeometry args={[length, 0.18, 0.18]} />
        <meshBasicMaterial color="#5d2f1a" />
      </mesh>
      <mesh position={[0, eaveY, 0]}>
        <boxGeometry args={[run * 2.08, 0.2, 0.2]} />
        <meshBasicMaterial color="#5d2f1a" />
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
  return ["w", "a", "s", "d", "q", "e", "f", "tab", "escape", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
    || ["space", "spacebar", "keyf", "tab", "escape"].includes(code);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function updateLocalVisualPlayer(
  visual: PlayerSnapshot,
  authoritative: PlayerSnapshot,
  move: THREE.Vector3,
  moveLength: number,
  yaw: number,
  sprint: boolean,
  jump: boolean,
  delta: number,
) {
  visual.name = authoritative.name;
  visual.identityType = authoritative.identityType;
  visual.walletAddress = authoritative.walletAddress;
  visual.avatarSeed = authoritative.avatarSeed;
  visual.health = authoritative.health;
  visual.maxHealth = authoritative.maxHealth;
  visual.healthRegenPer5 = authoritative.healthRegenPer5;
  visual.mana = authoritative.mana;
  visual.maxMana = authoritative.maxMana;
  visual.manaRegenPer5 = authoritative.manaRegenPer5;
  visual.lastSeq = authoritative.lastSeq;
  visual.attackReadyAt = authoritative.attackReadyAt;
  visual.shootReadyAt = authoritative.shootReadyAt;
  visual.fireblastReadyAt = authoritative.fireblastReadyAt;
  visual.castingAction = authoritative.castingAction;
  visual.castStartedAt = authoritative.castStartedAt;
  visual.castEndsAt = authoritative.castEndsAt;
  visual.lastCastAt = authoritative.lastCastAt;
  visual.lastDamagedAt = authoritative.lastDamagedAt;
  visual.quests = authoritative.quests;
  visual.inventory = authoritative.inventory;

  const drift = Math.hypot(visual.x - authoritative.x, visual.z - authoritative.z);
  const heightDrift = Math.abs(visual.y - authoritative.y);
  if (drift > 3.5 || heightDrift > 2.5) {
    visual.x = authoritative.x;
    visual.y = authoritative.y;
    visual.z = authoritative.z;
  } else {
    const positionCorrection = 1 - Math.pow(moveLength > 0.01 ? 0.94 : 0.64, delta * 60);
    const heightCorrection = 1 - Math.pow(0.48, delta * 60);
    visual.x += (authoritative.x - visual.x) * positionCorrection;
    visual.z += (authoritative.z - visual.z) * positionCorrection;
    visual.y += (authoritative.y - visual.y) * heightCorrection;
  }

  if (moveLength > 0.01) {
    const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    visual.x += move.x * speed * delta;
    visual.z += move.z * speed * delta;
  }

  const resolvedPosition = resolveWorldCollision(visual.x, visual.z, PLAYER.radius);
  visual.x = resolvedPosition.x;
  visual.z = resolvedPosition.z;
  visual.yaw = yaw;

  const airborne = jump || authoritative.y > 0.05 || visual.y > 0.05;
  visual.animation = airborne ? "jump" : moveLength > 0.01 ? (sprint ? "run" : "walk") : "idle";
}

function getNextEnemyTarget(
  player: PlayerSnapshot,
  npcs: Map<string, NpcSnapshot>,
  selectedTarget: TargetSelection | null,
  reverse: boolean,
): TargetSelection | null {
  const enemies = Array.from(npcs.values())
    .filter((npc) => isAttackableNpcRole(npc.role) && (npc.isImmortal || npc.health > 0))
    .map((npc) => ({
      npc,
      distance: Math.hypot(player.x - npc.x, player.z - npc.z),
    }))
    .filter(({ distance }) => distance <= 36)
    .sort((a, b) => a.distance - b.distance);

  if (enemies.length === 0) return null;

  const currentIndex = selectedTarget?.kind === "npc"
    ? enemies.findIndex(({ npc }) => npc.id === selectedTarget.id)
    : -1;
  const offset = reverse ? -1 : 1;
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + offset + enemies.length) % enemies.length;

  return { kind: "npc", id: enemies[nextIndex].npc.id };
}

function isVisibleNpc(npc: NpcSnapshot) {
  return npc.isImmortal || npc.health > 0 || npc.despawnAt > 0;
}

function isTargetSelected(
  selectedTarget: TargetSelection | null,
  kind: TargetSelection["kind"],
  id: string,
) {
  return selectedTarget?.kind === kind && selectedTarget.id === id;
}

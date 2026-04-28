import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  INPUT_SEND_RATE,
  getNpcQuestMarker,
  type ClientInput,
  type CombatEvent,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { CreatureAvatar } from "../components/CreatureAvatar";
import { MferAvatar } from "../components/MferAvatar";
import { CombatFeedbackLayer } from "./scene/CombatFeedbackLayer";
import { Skybox, TownWorld } from "./scene/TownWorld";
import {
  clamp,
  getNextEnemyTarget,
  isGameKey,
  isTargetSelected,
  isTypingTarget,
  isVisibleNpc,
  updateLocalVisualPlayer,
  wrapAngle,
} from "./scene/sceneControls";

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
  const frameForward = useMemo(() => new THREE.Vector3(), []);
  const frameRight = useMemo(() => new THREE.Vector3(), []);
  const frameMove = useMemo(() => new THREE.Vector3(), []);
  const cameraLookAt = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const cameraDesired = useMemo(() => new THREE.Vector3(), []);
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
    frameForward.set(Math.sin(facingYaw.current), 0, Math.cos(facingYaw.current));
    frameRight.set(Math.cos(facingYaw.current), 0, -Math.sin(facingYaw.current));
    frameMove
      .copy(frameForward)
      .multiplyScalar(forwardIntent)
      .addScaledVector(frameRight, rightIntent);
    const moveLength = frameMove.length();
    if (moveLength > 1) frameMove.normalize();
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
        x: frameMove.x,
        z: frameMove.z,
        yaw: facingYaw.current,
        sprint: isSprinting,
        jump: isJumping,
      });
    }

    if (localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId) {
      updateLocalVisualPlayer(localVisualPlayer.current, localPlayer, frameMove, moveLength, facingYaw.current, isSprinting, isJumping, delta);
    }

    const cameraPlayer = localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId
      ? localVisualPlayer.current
      : localPlayer;
    if (cameraPlayer) {
      const horizontalDistance = cameraDistance.current * Math.cos(cameraPitch.current);
      const verticalDistance = cameraDistance.current * Math.sin(cameraPitch.current) + 0.4;
      cameraLookAt.set(cameraPlayer.x, cameraPlayer.y + 1.55, cameraPlayer.z);
      cameraForward.set(Math.sin(cameraYaw.current), 0, Math.cos(cameraYaw.current));
      cameraDesired
        .copy(cameraLookAt)
        .addScaledVector(cameraForward, -horizontalDistance);
      cameraDesired.y += verticalDistance;
      camera.position.lerp(cameraDesired, 1 - Math.pow(0.05, delta));
      camera.lookAt(cameraLookAt);
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

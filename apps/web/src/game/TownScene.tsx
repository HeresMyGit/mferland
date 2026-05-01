import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  INPUT_SEND_RATE,
  getNpcDisposition,
  getNpcQuestMarker,
  type ClientInput,
  type CombatEvent,
  type ExperienceEvent,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { CreatureAvatar } from "../components/CreatureAvatar";
import { MferAvatar } from "../components/MferAvatar";
import { MferGptAvatar } from "../components/MferGptAvatar";
import { TrainingDummyAvatar } from "../components/TrainingDummyAvatar";
import { type ChatBubble } from "./chatBubbles";
import { CombatFeedbackLayer } from "./scene/CombatFeedbackLayer";
import { Skybox, TownWorld } from "./scene/TownWorld";
import { MFER_COLORS } from "./mferPalette";
import {
  type DebugPlacementOverrides,
  type DebugPlacementTarget,
  getDebugPlacementValue,
} from "./debugPlacement";
import { type NameplateVisibility } from "./settings";
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
  sceneRevision: number;
  localSessionId: string | null;
  selectedTarget: TargetSelection | null;
  combatEvents: CombatEvent[];
  experienceEvents: ExperienceEvent[];
  chatBubbles: ChatBubble[];
  onSelectTarget: (target: TargetSelection | null) => void;
  onSelectNpcTarget?: (npcId: string) => void;
  onInteractAction: () => void;
  sendInput: (input: ClientInput) => void;
  debugTravelView?: {
    x: number;
    z: number;
    yaw: number;
    nonce: number;
  } | null;
  nameplateVisibility: NameplateVisibility;
  debugPlacementMode?: boolean;
  debugPlacementTargets?: DebugPlacementTarget[];
  debugPlacementOverrides?: DebugPlacementOverrides;
  selectedDebugPlacementId?: string | null;
  onSelectDebugPlacement?: (targetId: string | null) => void;
  onChangeDebugPlacement?: (target: DebugPlacementTarget, value: { x: number; z: number; rotation: number }, commit: boolean) => void;
};

const CONTROL_DELTA_CAP = 1 / 30;
const DEFAULT_NAMEPLATE_VISIBILITY: NameplateVisibility = {
  localPlayer: true,
  otherPlayers: true,
  friendlyNpcs: true,
  unfriendlyNpcs: true,
};
const EMPTY_DEBUG_PLACEMENT_OVERRIDES: DebugPlacementOverrides = {};
const DEBUG_CAMERA_FOV = 54;
const DEFAULT_CAMERA_FOV = 54;
const DEFAULT_CAMERA_FAR = 140;
const DEBUG_CAMERA_FAR = 900;
const DEBUG_CAMERA_OVERVIEW_HEIGHT = 275;
const DEBUG_CAMERA_MIN_HEIGHT = 32;
const DEBUG_CAMERA_MAX_HEIGHT = 310;
const DEBUG_CAMERA_WHEEL_ZOOM_SCALE = 0.16;
const DEBUG_CAMERA_TURN_SPEED = 2.8;
const DEBUG_PLACEMENT_CLICK_Y = 18;

function TownSceneComponent({
  players,
  npcs,
  sceneRevision: _sceneRevision,
  localSessionId,
  selectedTarget,
  combatEvents,
  experienceEvents,
  chatBubbles,
  onSelectTarget,
  onSelectNpcTarget,
  onInteractAction,
  sendInput,
  debugTravelView = null,
  nameplateVisibility = DEFAULT_NAMEPLATE_VISIBILITY,
  debugPlacementMode = false,
  debugPlacementTargets = [],
  debugPlacementOverrides = EMPTY_DEBUG_PLACEMENT_OVERRIDES,
  selectedDebugPlacementId = null,
  onSelectDebugPlacement,
  onChangeDebugPlacement,
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
  const debugCameraTarget = useMemo(() => new THREE.Vector3(), []);
  const debugCameraDesired = useMemo(() => new THREE.Vector3(), []);
  const debugCameraFocus = useRef({ x: 5, z: 5 });
  const debugCameraHeight = useRef(DEBUG_CAMERA_OVERVIEW_HEIGHT);
  const debugCameraYaw = useRef(Math.PI);
  const debugCameraSelectionState = useRef<{ enabled: boolean; selectedId: string | null }>({
    enabled: false,
    selectedId: null,
  });
  const localPlayer = localSessionId ? players.get(localSessionId) : undefined;
  const localQuestState = localPlayer?.quests ?? [];
  const chatBubbleBySessionId = useMemo(() => new Map(chatBubbles.map((bubble) => [bubble.sessionId, bubble])), [chatBubbles]);
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
    const resetControls = () => {
      keyState.current.clear();
      pointerState.current.left = false;
      pointerState.current.right = false;
      inputTimer.current = 0;
      sendInput({
        seq: ++seqRef.current,
        x: 0,
        z: 0,
        yaw: facingYaw.current,
        sprint: false,
        jump: false,
      });
    };
    const onVisibilityChange = () => {
      if (document.hidden) resetControls();
    };

    window.addEventListener("blur", resetControls);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", resetControls);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sendInput]);

  useEffect(() => {
    if (!debugTravelView) return;
    cameraYaw.current = debugTravelView.yaw;
    facingYaw.current = debugTravelView.yaw;
    cameraPitch.current = 0.32;
    cameraDistance.current = 6.4;
    inputTimer.current = 0;

    if (localVisualPlayer.current?.sessionId === localSessionId) {
      localVisualPlayer.current.x = debugTravelView.x;
      localVisualPlayer.current.y = 0;
      localVisualPlayer.current.z = debugTravelView.z;
      localVisualPlayer.current.yaw = debugTravelView.yaw;
    }
  }, [debugTravelView?.nonce, localSessionId]);

  useEffect(() => {
    const wasEnabled = debugCameraSelectionState.current.enabled;
    if (!debugPlacementMode) {
      debugCameraSelectionState.current = { enabled: false, selectedId: null };
      return;
    }

    if (!wasEnabled) {
      debugCameraFocus.current.x = localPlayer?.x ?? 5;
      debugCameraFocus.current.z = localPlayer?.z ?? 5;
      debugCameraHeight.current = DEBUG_CAMERA_OVERVIEW_HEIGHT;
    }

    debugCameraSelectionState.current = {
      enabled: true,
      selectedId: selectedDebugPlacementId,
    };
  }, [debugPlacementMode, selectedDebugPlacementId, localPlayer?.x, localPlayer?.z]);

  useEffect(() => {
    if (debugPlacementMode) {
      const canvas = gl.domElement;
      keyState.current.clear();
      pointerState.current.left = false;
      pointerState.current.right = false;
      inputTimer.current = 0;
      sendInput({
        seq: ++seqRef.current,
        x: 0,
        z: 0,
        yaw: facingYaw.current,
        sprint: false,
        jump: false,
      });

      const onWheel = (event: WheelEvent) => {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        debugCameraHeight.current = clamp(
          debugCameraHeight.current + event.deltaY * DEBUG_CAMERA_WHEEL_ZOOM_SCALE,
          DEBUG_CAMERA_MIN_HEIGHT,
          DEBUG_CAMERA_MAX_HEIGHT,
        );
      };
      const onContextMenu = (event: MouseEvent) => event.preventDefault();

      window.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("contextmenu", onContextMenu);
      return () => {
        window.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("contextmenu", onContextMenu);
      };
    }

    const canvas = gl.domElement;
    const state = pointerState.current;

    const syncMouseButtons = (event: PointerEvent | MouseEvent) => {
      state.left = (event.buttons & 1) === 1;
      state.right = (event.buttons & 2) === 2;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      blurActiveTextField();
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
  }, [debugPlacementMode, gl, sendInput]);

  useFrame(({ camera }, delta) => {
    if (debugPlacementMode) {
      const controlDelta = Math.min(delta, CONTROL_DELTA_CAP);
      const keys = keyState.current;
      const turnLeft = keys.has("a") || keys.has("arrowleft") || keys.has("keya");
      const turnRight = keys.has("d") || keys.has("arrowright") || keys.has("keyd");
      const turnIntent = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
      if (turnIntent) {
        debugCameraYaw.current = wrapAngle(debugCameraYaw.current + turnIntent * DEBUG_CAMERA_TURN_SPEED * controlDelta);
      }

      const debugForwardX = Math.sin(debugCameraYaw.current);
      const debugForwardZ = Math.cos(debugCameraYaw.current);
      const debugLeftX = Math.cos(debugCameraYaw.current);
      const debugLeftZ = -Math.sin(debugCameraYaw.current);
      const forwardIntent = (keys.has("w") || keys.has("arrowup") || keys.has("keyw") ? 1 : 0)
        - (keys.has("s") || keys.has("arrowdown") || keys.has("keys") ? 1 : 0);
      const strafeIntent = (keys.has("q") || keys.has("keyq") ? 1 : 0)
        - (keys.has("e") || keys.has("keye") ? 1 : 0);
      if (forwardIntent || strafeIntent) {
        const panSpeed = (12 + debugCameraHeight.current * 0.42) * controlDelta;
        const moveX = debugForwardX * forwardIntent + debugLeftX * strafeIntent;
        const moveZ = debugForwardZ * forwardIntent + debugLeftZ * strafeIntent;
        const moveLength = Math.hypot(moveX, moveZ);
        debugCameraFocus.current.x += (moveX / moveLength) * panSpeed;
        debugCameraFocus.current.z += (moveZ / moveLength) * panSpeed;
      }

      if (camera instanceof THREE.PerspectiveCamera && (camera.fov !== DEBUG_CAMERA_FOV || camera.far !== DEBUG_CAMERA_FAR)) {
        camera.fov = DEBUG_CAMERA_FOV;
        camera.far = DEBUG_CAMERA_FAR;
        camera.updateProjectionMatrix();
      }
      const focus = debugCameraFocus.current;
      debugCameraTarget.set(focus.x, 0, focus.z);
      debugCameraDesired.set(
        focus.x - debugForwardX * 0.16,
        debugCameraHeight.current,
        focus.z - debugForwardZ * 0.16,
      );
      camera.up.set(debugForwardX, 0, debugForwardZ);
      camera.position.lerp(debugCameraDesired, 1 - Math.pow(0.05, controlDelta * 60));
      camera.lookAt(debugCameraTarget);
      return;
    }

    camera.up.set(0, 1, 0);
    if (camera instanceof THREE.PerspectiveCamera && (camera.fov !== DEFAULT_CAMERA_FOV || camera.far !== DEFAULT_CAMERA_FAR)) {
      camera.fov = DEFAULT_CAMERA_FOV;
      camera.far = DEFAULT_CAMERA_FAR;
      camera.updateProjectionMatrix();
    }

    const controlDelta = Math.min(delta, CONTROL_DELTA_CAP);
    const keys = keyState.current;
    const pointer = pointerState.current;
    const localIsDead = Boolean(localPlayer && localPlayer.health <= 0);
    const turnLeft = keys.has("a") || keys.has("arrowleft");
    const turnRight = keys.has("d") || keys.has("arrowright");
    const turnIntent = pointer.right ? 0 : (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
    if (turnIntent) {
      facingYaw.current = wrapAngle(facingYaw.current + turnIntent * controlDelta * 2.8);
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
      updateLocalVisualPlayer(localVisualPlayer.current, localPlayer, frameMove, moveLength, facingYaw.current, isSprinting, isJumping, controlDelta);
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
      camera.position.lerp(cameraDesired, 1 - Math.pow(0.05, controlDelta));
      camera.lookAt(cameraLookAt);
    }
  });

  return (
    <>
      <fog attach="fog" args={debugPlacementMode ? ["#b4d7e8", 820, 920] : ["#b4d7e8", 38, 118]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.9]} />
      <directionalLight position={[-10, 18, 8]} intensity={1.55} color="#fff3d3" />
      <Skybox />

      <Suspense fallback={null}>
        <TownWorld debugPlacementOverrides={debugPlacementOverrides} />
      </Suspense>
      {debugPlacementMode && (
        <DebugPlacementGizmos
          targets={debugPlacementTargets}
          overrides={debugPlacementOverrides}
          selectedId={selectedDebugPlacementId}
          onSelect={onSelectDebugPlacement}
          onChange={onChangeDebugPlacement}
        />
      )}
      <Suspense fallback={null}>
        {Array.from(players.entries()).map(([sessionId, player]) => {
          const isLocalPlayer = sessionId === localSessionId;
          const renderedPlayer = isLocalPlayer && localVisualPlayer.current?.sessionId === sessionId
            ? localVisualPlayer.current
            : player;
          const showNameplate = isLocalPlayer ? nameplateVisibility.localPlayer : nameplateVisibility.otherPlayers;
          return (
            <MferAvatar
              key={sessionId}
              player={renderedPlayer}
              isLocal={isLocalPlayer}
              showNameplate={showNameplate}
              isTargeted={isTargetSelected(selectedTarget, "player", sessionId)}
              isDefeated={player.health <= 0}
              chatBubble={chatBubbleBySessionId.get(sessionId)}
              viewerPosition={viewerPosition}
              onTarget={isLocalPlayer ? undefined : () => onSelectTarget({ kind: "player", id: sessionId })}
            />
          );
        })}
        {Array.from(npcs.values()).filter(isVisibleNpc).map((npc) => {
          const isTargeted = isTargetSelected(selectedTarget, "npc", npc.id);
          const onTarget = () => {
            if (onSelectNpcTarget) onSelectNpcTarget(npc.id);
            else onSelectTarget({ kind: "npc", id: npc.id });
          };
          const questMarker = getNpcQuestMarker(npc, localQuestState);
          const showNameplate = shouldShowNpcNameplate(npc, nameplateVisibility);
          if (npc.model === "mfergpt") {
            return (
              <MferGptAvatar
                key={npc.id}
                npc={npc}
                showNameplate={showNameplate}
                questMarker={questMarker}
                hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
                isTargeted={isTargeted}
                isDefeated={!npc.isImmortal && npc.health <= 0}
                chatBubble={chatBubbleBySessionId.get(npc.id)}
                viewerPosition={viewerPosition}
                onTarget={onTarget}
              />
            );
          }

          if (npc.model === "training-dummy") {
            return (
              <TrainingDummyAvatar
                key={npc.id}
                npc={npc}
                showNameplate={showNameplate}
                questMarker={questMarker}
                hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
                isTargeted={isTargeted}
                isDefeated={!npc.isImmortal && npc.health <= 0}
                chatBubble={chatBubbleBySessionId.get(npc.id)}
                viewerPosition={viewerPosition}
                onTarget={onTarget}
              />
            );
          }

          if (npc.model !== "mfer") {
            return (
              <CreatureAvatar
                key={npc.id}
                npc={npc}
                showNameplate={showNameplate}
                questMarker={questMarker}
                hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
                isTargeted={isTargeted}
                isDefeated={!npc.isImmortal && npc.health <= 0}
                chatBubble={chatBubbleBySessionId.get(npc.id)}
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
              showNameplate={showNameplate}
              questMarker={questMarker}
              hasLoot={npc.hasLoot && !npc.isImmortal && npc.health <= 0}
              actorScale={getNpcActorScale(npc)}
              isTargeted={isTargeted}
              isDefeated={!npc.isImmortal && npc.health <= 0}
              chatBubble={chatBubbleBySessionId.get(npc.id)}
              viewerPosition={viewerPosition}
              onTarget={onTarget}
            />
          );
        })}
        <CombatFeedbackLayer
          combatEvents={combatEvents}
          experienceEvents={experienceEvents}
          players={players}
          npcs={npcs}
          viewerPosition={viewerPosition}
        />
      </Suspense>
    </>
  );
}

export const TownScene = memo(TownSceneComponent, areTownScenePropsEqual);

function areTownScenePropsEqual(previous: TownSceneProps, next: TownSceneProps) {
  return previous.players === next.players
    && previous.npcs === next.npcs
    && previous.sceneRevision === next.sceneRevision
    && previous.localSessionId === next.localSessionId
    && targetsEqual(previous.selectedTarget, next.selectedTarget)
    && previous.combatEvents === next.combatEvents
    && previous.experienceEvents === next.experienceEvents
    && previous.chatBubbles === next.chatBubbles
    && previous.onSelectTarget === next.onSelectTarget
    && previous.onSelectNpcTarget === next.onSelectNpcTarget
    && previous.onInteractAction === next.onInteractAction
    && previous.sendInput === next.sendInput
    && previous.debugTravelView === next.debugTravelView
    && previous.nameplateVisibility === next.nameplateVisibility
    && previous.debugPlacementMode === next.debugPlacementMode
    && previous.debugPlacementTargets === next.debugPlacementTargets
    && previous.debugPlacementOverrides === next.debugPlacementOverrides
    && previous.selectedDebugPlacementId === next.selectedDebugPlacementId
    && previous.onSelectDebugPlacement === next.onSelectDebugPlacement
    && previous.onChangeDebugPlacement === next.onChangeDebugPlacement;
}

function targetsEqual(previous: TargetSelection | null, next: TargetSelection | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.kind === next.kind && previous.id === next.id;
}

function getNpcActorScale(npc: NpcSnapshot) {
  if (npc.id === "raid-ogre-mfer") return 3.1;
  if (npc.id === "static-baron-nox") return 1.75;
  return 1;
}

function shouldShowNpcNameplate(npc: NpcSnapshot, visibility: NameplateVisibility) {
  const disposition = getNpcDisposition(npc);
  return disposition === "friendly" ? visibility.friendlyNpcs : visibility.unfriendlyNpcs;
}

function DebugPlacementGizmos({
  targets,
  overrides,
  selectedId,
  onSelect,
  onChange,
}: {
  targets: DebugPlacementTarget[];
  overrides: DebugPlacementOverrides;
  selectedId: string | null;
  onSelect?: (targetId: string | null) => void;
  onChange?: (target: DebugPlacementTarget, value: { x: number; z: number; rotation: number }, commit: boolean) => void;
}) {
  const dragRef = useRef<DebugPlacementDragState | null>(null);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const groundPoint = useMemo(() => new THREE.Vector3(), []);

  function getGroundPoint(event: ThreeEvent<PointerEvent>) {
    const point = event.ray.intersectPlane(groundPlane, groundPoint);
    if (!point) return null;
    return { x: point.x, z: point.z };
  }

  function beginMove(event: ThreeEvent<PointerEvent>, target: DebugPlacementTarget) {
    event.stopPropagation();
    onSelect?.(target.id);
    const point = getGroundPoint(event);
    if (!point || !onChange) return;
    const value = getDebugPlacementValue(target, overrides);
    capturePointer(event);
    dragRef.current = {
      mode: "move",
      target,
      offsetX: value.x - point.x,
      offsetZ: value.z - point.z,
      value,
    };
  }

  function beginRotate(event: ThreeEvent<PointerEvent>, target: DebugPlacementTarget) {
    event.stopPropagation();
    onSelect?.(target.id);
    const point = getGroundPoint(event);
    if (!point || !onChange) return;
    const value = getDebugPlacementValue(target, overrides);
    capturePointer(event);
    dragRef.current = {
      mode: "rotate",
      target,
      centerX: value.x,
      centerZ: value.z,
      startPointerAngle: Math.atan2(point.x - value.x, point.z - value.z),
      startRotation: value.rotation,
      value,
    };
  }

  function updateDrag(event: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current;
    if (!drag || !onChange) return;
    event.stopPropagation();
    const point = getGroundPoint(event);
    if (!point) return;

    if (drag.mode === "move") {
      drag.value = {
        x: roundDebugPlacement(point.x + drag.offsetX),
        z: roundDebugPlacement(point.z + drag.offsetZ),
        rotation: drag.value.rotation,
      };
    } else {
      const pointerAngle = Math.atan2(point.x - drag.centerX, point.z - drag.centerZ);
      drag.value = {
        x: drag.centerX,
        z: drag.centerZ,
        rotation: drag.startRotation + wrapDebugAngle(pointerAngle - drag.startPointerAngle),
      };
    }

    onChange(drag.target, drag.value, false);
  }

  function finishDrag(event: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.stopPropagation();
    releasePointer(event);
    dragRef.current = null;
    onChange?.(drag.target, drag.value, true);
  }

  return (
    <group>
      <DebugPlacementDragPlane
        onPointerMove={updateDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      />
      {targets.map((target) => {
        const value = getDebugPlacementValue(target, overrides);
        const selected = target.id === selectedId;
        const color = getDebugPlacementColor(target, selected);
        const radius = target.hitRadius ?? (target.kind === "npc" ? 0.82 : target.kind === "building" ? 1.18 : 1.02);
        const handleRadius = Math.max(radius, target.hitSize ? Math.hypot(target.hitSize[0], target.hitSize[1]) * 0.38 : radius);
        const hitHeight = target.hitHeight ?? (target.kind === "npc" ? 3.2 : 4);
        return (
          <group key={target.id} position={[value.x, 0.2, value.z]} rotation-y={value.rotation}>
            <DebugPlacementClickSurface
              target={target}
              radius={radius}
              onPointerDown={(event) => beginMove(event, target)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            />
            {selected && (
              <DebugPlacementAura
                target={target}
                radius={radius}
                handleRadius={handleRadius}
                height={hitHeight}
              />
            )}
            <DebugPlacementHitVolume
              target={target}
              color={color}
              opacity={selected ? 0.22 : 0.07}
              radius={radius}
              height={hitHeight}
              onPointerDown={(event) => beginMove(event, target)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            />
            <mesh
              rotation-x={-Math.PI / 2}
              position={[0, 0.06, 0]}
              onPointerDown={(event) => beginMove(event, target)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <ringGeometry args={[handleRadius, handleRadius + (selected ? 0.18 : 0.1), 48]} />
              <meshBasicMaterial color={color} transparent opacity={selected ? 0.82 : 0.34} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              position={[0, DEBUG_PLACEMENT_CLICK_Y + 0.35, handleRadius + 0.64]}
              onPointerDown={(event) => beginRotate(event, target)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <boxGeometry args={[selected ? 0.22 : 0.16, 0.14, 1.25]} />
              <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.56} depthWrite={false} depthTest={false} />
            </mesh>
            {selected && (
              <Text
                position={[0, 0.35, -handleRadius - 0.8]}
                rotation-x={-Math.PI / 2}
                fontSize={1.15}
                color="#fff7d2"
                outlineColor="#1a1208"
                outlineWidth={0.05}
                anchorX="center"
                anchorY="middle"
              >
                {target.label}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

function DebugPlacementAura({
  target,
  radius,
  handleRadius,
  height,
}: {
  target: DebugPlacementTarget;
  radius: number;
  handleRadius: number;
  height: number;
}) {
  const hitSize = target.hitSize;
  const auraHeight = Math.max(height, 0.8);
  return (
    <group>
      <mesh position={[0, auraHeight / 2, 0]}>
        {hitSize ? (
          <boxGeometry args={[hitSize[0] + 0.9, auraHeight, hitSize[1] + 0.9]} />
        ) : (
          <cylinderGeometry args={[radius + 0.45, radius + 0.45, auraHeight, 36]} />
        )}
        <meshBasicMaterial
          color={MFER_COLORS.local}
          transparent
          opacity={0.16}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, DEBUG_PLACEMENT_CLICK_Y + 0.8, 0]}>
        <ringGeometry args={[handleRadius + 0.22, handleRadius + 0.48, 72]} />
        <meshBasicMaterial color="#fff2a6" transparent opacity={0.72} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DebugPlacementDragPlane({
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0.01, 0]}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <planeGeometry args={[520, 520]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

type DebugPlacementDragState =
  | {
    mode: "move";
    target: DebugPlacementTarget;
    offsetX: number;
    offsetZ: number;
    value: { x: number; z: number; rotation: number };
  }
  | {
    mode: "rotate";
    target: DebugPlacementTarget;
    centerX: number;
    centerZ: number;
    startPointerAngle: number;
    startRotation: number;
    value: { x: number; z: number; rotation: number };
  };

function DebugPlacementClickSurface({
  target,
  radius,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  target: DebugPlacementTarget;
  radius: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const hitSize = target.hitSize;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, DEBUG_PLACEMENT_CLICK_Y, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {hitSize ? (
        <planeGeometry args={[hitSize[0], hitSize[1]]} />
      ) : (
        <circleGeometry args={[radius, 32]} />
      )}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function DebugPlacementHitVolume({
  target,
  color,
  opacity,
  radius,
  height,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  target: DebugPlacementTarget;
  color: string;
  opacity: number;
  radius: number;
  height: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const hitSize = target.hitSize;
  return (
    <mesh
      position={[0, height / 2, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {hitSize ? (
        <boxGeometry args={[hitSize[0], height, hitSize[1]]} />
      ) : (
        <cylinderGeometry args={[radius, radius, height, 24]} />
      )}
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function capturePointer(event: ThreeEvent<PointerEvent>) {
  if (event.target instanceof Element && "setPointerCapture" in event.target) {
    event.target.setPointerCapture(event.pointerId);
  }
}

function releasePointer(event: ThreeEvent<PointerEvent>) {
  if (event.target instanceof Element && "releasePointerCapture" in event.target) {
    try {
      event.target.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone if the pointer leaves the canvas.
    }
  }
}

function roundDebugPlacement(value: number) {
  return Math.round(value * 10) / 10;
}

function wrapDebugAngle(value: number) {
  const full = Math.PI * 2;
  return ((((value + Math.PI) % full) + full) % full) - Math.PI;
}

function getDebugPlacementColor(target: DebugPlacementTarget, selected: boolean) {
  if (selected) return MFER_COLORS.local;
  if (target.kind === "npc") return MFER_COLORS.signal;
  if (target.kind === "building") return MFER_COLORS.debugBuilding;
  if (target.kind === "model") return MFER_COLORS.debugModel;
  return MFER_COLORS.friendly;
}

function blurActiveTextField() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isTypingTarget(activeElement)) {
    activeElement.blur();
  }
}

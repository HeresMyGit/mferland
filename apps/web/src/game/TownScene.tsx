import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
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
import { getClientRenderPerformanceProfile, type RenderPerformanceProfile } from "./performance";
import {
  type DebugPlacementOverrides,
  type DebugPlacementTarget,
  getDebugPlacementValue,
} from "./debugPlacement";
import { type NameplateVisibility } from "./settings";
import {
  beginCameraPointerDrag,
  clamp,
  endCameraPointerDrag,
  getNextEnemyTarget,
  isGameKey,
  isTargetSelected,
  isTypingTarget,
  isVisibleNpc,
  resetCameraPointerState,
  syncCameraPointerButtons,
  syncLocalVisualPlayerSnapshot,
  type CameraPointerState,
  updateCameraPointerDrag,
  updateLocalVisualPlayer,
  wrapAngle,
} from "./scene/sceneControls";

export type MobileMoveInput = {
  active: boolean;
  forward: number;
  right: number;
  sprint: boolean;
};

type MobileMoveInputRef = {
  current: MobileMoveInput;
};

export type CaptureInputState = {
  input: ClientInput;
  receivedAt: number;
};

type CaptureInputRef = {
  current: CaptureInputState | null;
};

export type CaptureCameraState = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov?: number;
};

type CaptureCameraRef = {
  current: CaptureCameraState | null;
};

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
  onReelFishing?: (attemptId?: string) => void;
  sendInput: (input: ClientInput) => void;
  debugTravelView?: {
    x: number;
    z: number;
    yaw: number;
    nonce: number;
  } | null;
  nameplateVisibility: NameplateVisibility;
  hideWorldOverlays?: boolean;
  debugPlacementMode?: boolean;
  debugPlacementTargets?: DebugPlacementTarget[];
  debugPlacementOverrides?: DebugPlacementOverrides;
  selectedDebugPlacementId?: string | null;
  mobileMoveInputRef?: MobileMoveInputRef;
  renderProfile?: RenderPerformanceProfile;
  lightweightRender?: boolean;
  controlsEnabled?: boolean;
  cameraControlsEnabled?: boolean;
  cleanCaptureAgentModel?: boolean;
  captureInputRef?: CaptureInputRef;
  captureCameraRef?: CaptureCameraRef;
  idleCameraNpcId?: string | null;
  onSelectDebugPlacement?: (targetId: string | null) => void;
  onChangeDebugPlacement?: (target: DebugPlacementTarget, value: { x: number; z: number; rotation: number }, commit: boolean) => void;
};

const CONTROL_DELTA_CAP = 1 / 30;
const OBSERVER_POSITION_SNAP = 5.5;
const OBSERVER_HEIGHT_SNAP = 3;
const OBSERVER_POSITION_DECAY = 0.78;
const OBSERVER_HEIGHT_DECAY = 0.62;
const OBSERVER_ROTATION_DECAY = 0.72;
const IDLE_CAMERA_ORBIT_SECONDS = 48;
const IDLE_CAMERA_DISTANCE = 8.8;
const IDLE_CAMERA_HEIGHT = 2.7;
const IDLE_CAMERA_SNAP_DISTANCE = 42;
const DEFAULT_NAMEPLATE_VISIBILITY: NameplateVisibility = {
  localPlayer: false,
  otherPlayers: true,
  friendlyNpcs: false,
  unfriendlyNpcs: false,
  healthBars: false,
};
const EMPTY_DEBUG_PLACEMENT_OVERRIDES: DebugPlacementOverrides = {};
const DEBUG_CAMERA_FOV = 54;
const DEFAULT_CAMERA_FOV = 54;
const DEBUG_CAMERA_FAR = 900;
const DEBUG_CAMERA_OVERVIEW_HEIGHT = 275;
const DEBUG_CAMERA_MIN_HEIGHT = 32;
const DEBUG_CAMERA_MAX_HEIGHT = 310;
const DEBUG_CAMERA_WHEEL_ZOOM_SCALE = 0.16;
const DEBUG_CAMERA_TURN_SPEED = 2.8;
const DEBUG_PLACEMENT_CLICK_Y = 18;
const EMPTY_MOBILE_MOVE_INPUT: MobileMoveInput = { active: false, forward: 0, right: 0, sprint: false };
const CAPTURE_INPUT_STALE_MS = 260;

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
  onReelFishing,
  sendInput,
  debugTravelView = null,
  nameplateVisibility = DEFAULT_NAMEPLATE_VISIBILITY,
  hideWorldOverlays = false,
  debugPlacementMode = false,
  debugPlacementTargets = [],
  debugPlacementOverrides = EMPTY_DEBUG_PLACEMENT_OVERRIDES,
  selectedDebugPlacementId = null,
  mobileMoveInputRef,
  renderProfile,
  lightweightRender = false,
  controlsEnabled = true,
  cameraControlsEnabled = false,
  cleanCaptureAgentModel = false,
  captureInputRef,
  captureCameraRef,
  idleCameraNpcId = null,
  onSelectDebugPlacement,
  onChangeDebugPlacement,
}: TownSceneProps) {
  const { gl } = useThree();
  const resolvedRenderProfile = useMemo(() => renderProfile ?? getClientRenderPerformanceProfile(), [renderProfile]);
  const pointerCameraControlsEnabled = controlsEnabled || cameraControlsEnabled;
  const keyState = useRef(new Set<string>());
  const pointerState = useRef<CameraPointerState>({
    left: false,
    right: false,
    activePointerId: null,
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
  const jumpHeld = useRef(false);
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
  } else {
    syncLocalVisualPlayerSnapshot(localVisualPlayer.current, localPlayer);
  }
  const idleCameraNpc = !localPlayer && idleCameraNpcId ? npcs.get(idleCameraNpcId) ?? null : null;
  const viewerPlayer = localPlayer && localVisualPlayer.current?.sessionId === localPlayer.sessionId
    ? localVisualPlayer.current
    : localPlayer;
  const viewerPosition = viewerPlayer
    ? { x: viewerPlayer.x, z: viewerPlayer.z }
    : idleCameraNpc
      ? { x: idleCameraNpc.x, z: idleCameraNpc.z }
      : null;
  const renderedPlayers = useMemo(
    () => debugPlacementMode
      ? Array.from(players.entries())
      : getRenderablePlayers(players, localSessionId, viewerPosition, selectedTarget, resolvedRenderProfile),
    [players, _sceneRevision, debugPlacementMode, localSessionId, selectedTarget, resolvedRenderProfile, viewerPosition?.x, viewerPosition?.z],
  );
  const renderedNpcs = useMemo(
    () => debugPlacementMode
      ? Array.from(npcs.values()).filter(isVisibleNpc)
      : getRenderableNpcs(npcs, viewerPosition, selectedTarget, resolvedRenderProfile),
    [npcs, _sceneRevision, debugPlacementMode, selectedTarget, resolvedRenderProfile, viewerPosition?.x, viewerPosition?.z],
  );

  useEffect(() => {
    if (!controlsEnabled) {
      keyState.current.clear();
      return;
    }

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
  }, [controlsEnabled]);

  useEffect(() => {
    if (!controlsEnabled && !cameraControlsEnabled) return;

    const resetControls = () => {
      resetCameraPointerState(pointerState.current);
      if (!controlsEnabled) return;
      keyState.current.clear();
      clearMobileMoveInput(mobileMoveInputRef);
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
  }, [cameraControlsEnabled, controlsEnabled, mobileMoveInputRef, sendInput]);

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
    if (!pointerCameraControlsEnabled && !debugPlacementMode) {
      keyState.current.clear();
      clearMobileMoveInput(mobileMoveInputRef);
      resetCameraPointerState(pointerState.current);
      inputTimer.current = 0;
      return;
    }

    if (debugPlacementMode) {
      const canvas = gl.domElement;
      keyState.current.clear();
      clearMobileMoveInput(mobileMoveInputRef);
      resetCameraPointerState(pointerState.current);
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

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      blurActiveTextField();
      beginCameraPointerDrag(state, event.pointerId, event.buttons, event.clientX, event.clientY);
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer leaves during browser gestures.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = updateCameraPointerDrag(state, event.pointerId, event.buttons, event.clientX, event.clientY);
      if (!drag) return;
      event.preventDefault();

      cameraYaw.current = wrapAngle(cameraYaw.current - drag.dx * 0.0042);
      cameraPitch.current = clamp(cameraPitch.current + drag.dy * 0.0032, -0.08, 1.08);
      if (drag.right || event.pointerType === "touch") facingYaw.current = cameraYaw.current;
    };

    const onPointerUp = (event: PointerEvent) => {
      endCameraPointerDrag(state, event.pointerId, event.buttons, event.clientX, event.clientY);
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors for already-lost pointers.
      }
    };

    const onPointerCancel = () => {
      resetCameraPointerState(state);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (state.activePointerId === null) return;
      event.preventDefault();
      syncCameraPointerButtons(state, event.buttons);
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const onMouseUp = (event: MouseEvent) => {
      if (state.activePointerId === null) return;
      syncCameraPointerButtons(state, event.buttons);
      if (!state.left && !state.right) state.activePointerId = null;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
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
  }, [controlsEnabled, pointerCameraControlsEnabled, debugPlacementMode, gl, mobileMoveInputRef, sendInput]);

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
    const defaultCameraFar = resolvedRenderProfile.cameraFar;
    if (camera instanceof THREE.PerspectiveCamera && (camera.fov !== DEFAULT_CAMERA_FOV || camera.far !== defaultCameraFar)) {
      camera.fov = DEFAULT_CAMERA_FOV;
      camera.far = defaultCameraFar;
      camera.updateProjectionMatrix();
    }

    const controlDelta = Math.min(delta, CONTROL_DELTA_CAP);

    const keys = keyState.current;
    const pointer = pointerState.current;
    const mobileMove = mobileMoveInputRef?.current ?? EMPTY_MOBILE_MOVE_INPUT;

    if (!controlsEnabled) {
      keyState.current.clear();
      clearMobileMoveInput(mobileMoveInputRef);
      if (!cameraControlsEnabled) {
        pointer.left = false;
        pointer.right = false;
      }
      if (localPlayer) {
        facingYaw.current = localPlayer.yaw;
        if (!cameraControlsEnabled) cameraYaw.current = localPlayer.yaw;
      }
    }
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
    const keyboardForwardIntent = (keys.has("w") || keys.has("arrowup") || mouseForward ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const mobileForwardIntent = mobileMove.active ? mobileMove.forward : 0;
    const forwardIntent = localIsDead ? 0 : keyboardForwardIntent + mobileForwardIntent;
    const strafeLeft = !localIsDead && (keys.has("q") || (pointer.right && turnLeft));
    const strafeRight = !localIsDead && (keys.has("e") || (pointer.right && turnRight));
    const keyboardLeftIntent = (strafeLeft ? 1 : 0) - (strafeRight ? 1 : 0);
    const mobileLeftIntent = mobileMove.active ? -mobileMove.right : 0;
    frameForward.set(Math.sin(facingYaw.current), 0, Math.cos(facingYaw.current));
    frameRight.set(Math.cos(facingYaw.current), 0, -Math.sin(facingYaw.current));
    frameMove
      .copy(frameForward)
      .multiplyScalar(forwardIntent)
      .addScaledVector(frameRight, keyboardLeftIntent + mobileLeftIntent);
    let moveLength = frameMove.length();
    if (moveLength > 1) frameMove.normalize();
    const captureInputState = !controlsEnabled ? captureInputRef?.current ?? null : null;
    const captureInput = captureInputState && Date.now() - captureInputState.receivedAt <= CAPTURE_INPUT_STALE_MS
      ? captureInputState.input
      : null;
    if (captureInput && !localIsDead) {
      facingYaw.current = captureInput.yaw;
      frameMove.set(captureInput.x, 0, captureInput.z);
      moveLength = frameMove.length();
      if (moveLength > 1) {
        frameMove.normalize();
        moveLength = 1;
      }
    }
    const isSprinting = !localIsDead && moveLength > 0.01 && (captureInput ? Boolean(captureInput.sprint) : true);
    const isJumping = !localIsDead && (captureInput ? Boolean(captureInput.jump) : (keys.has(" ") || keys.has("space") || keys.has("spacebar")));
    const jumpStarted = isJumping && !jumpHeld.current;
    jumpHeld.current = isJumping;

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
    if (controlsEnabled && inputTimer.current >= 1 / INPUT_SEND_RATE) {
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
      if (controlsEnabled || captureInput) {
        updateLocalVisualPlayer(localVisualPlayer.current, localPlayer, frameMove, moveLength, facingYaw.current, isSprinting, jumpStarted, controlDelta);
      } else {
        updateObserverVisualPlayer(localVisualPlayer.current, localPlayer, controlDelta);
      }
    }

    const captureCamera = !controlsEnabled ? captureCameraRef?.current ?? null : null;
    if (captureCamera) {
      if (camera instanceof THREE.PerspectiveCamera && captureCamera.fov && camera.fov !== captureCamera.fov) {
        camera.fov = captureCamera.fov;
        camera.updateProjectionMatrix();
      }
      camera.position.set(captureCamera.position.x, captureCamera.position.y, captureCamera.position.z);
      camera.lookAt(captureCamera.target.x, captureCamera.target.y, captureCamera.target.z);
      return;
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
      return;
    }

    if (idleCameraNpc) {
      cameraYaw.current = wrapAngle(cameraYaw.current + controlDelta * (Math.PI * 2 / IDLE_CAMERA_ORBIT_SECONDS));
      cameraLookAt.set(idleCameraNpc.x, idleCameraNpc.y + 1.55, idleCameraNpc.z);
      cameraForward.set(Math.sin(cameraYaw.current), 0, Math.cos(cameraYaw.current));
      cameraDesired
        .copy(cameraLookAt)
        .addScaledVector(cameraForward, -IDLE_CAMERA_DISTANCE);
      cameraDesired.y += IDLE_CAMERA_HEIGHT;
      if (camera.position.distanceToSquared(cameraDesired) > IDLE_CAMERA_SNAP_DISTANCE ** 2) {
        camera.position.copy(cameraDesired);
      } else {
        camera.position.lerp(cameraDesired, 1 - Math.pow(0.06, controlDelta));
      }
      camera.lookAt(cameraLookAt);
    }
  });

  return (
    <>
      <fog attach="fog" args={debugPlacementMode ? ["#b4d7e8", 820, 920] : ["#b4d7e8", 38, 118]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.9]} />
      <directionalLight position={[-10, 18, 8]} intensity={1.55} color="#fff3d3" />
      <Skybox renderProfile={resolvedRenderProfile} />

      {!lightweightRender && (
        <Suspense fallback={null}>
          <TownWorld debugPlacementOverrides={debugPlacementOverrides} renderProfile={resolvedRenderProfile} />
        </Suspense>
      )}
      {debugPlacementMode && !lightweightRender && (
        <DebugPlacementGizmos
          targets={debugPlacementTargets}
          overrides={debugPlacementOverrides}
          selectedId={selectedDebugPlacementId}
          onSelect={onSelectDebugPlacement}
          onChange={onChangeDebugPlacement}
        />
      )}
      {!lightweightRender && (
      <Suspense fallback={null}>
        {renderedPlayers.map(([sessionId, player]) => {
          const isLocalPlayer = sessionId === localSessionId;
          const renderedPlayer = isLocalPlayer && localVisualPlayer.current?.sessionId === sessionId
            ? localVisualPlayer.current
            : player;
          const showNameplate = isLocalPlayer ? nameplateVisibility.localPlayer : nameplateVisibility.otherPlayers;
          if (renderedPlayer.isAgent) {
            return (
              <MferGptAvatar
                key={sessionId}
                npc={makeAgentModelSnapshot(renderedPlayer)}
                variant="agent"
                agentPlayer={renderedPlayer}
                appearanceTraits={cleanCaptureAgentModel && isLocalPlayer ? null : renderedPlayer.appearanceTraits}
                cleanAgentModel={cleanCaptureAgentModel && isLocalPlayer}
                showNameplate={showNameplate}
                showNameplateHealthBar={nameplateVisibility.healthBars}
                isTargeted={isTargetSelected(selectedTarget, "player", sessionId)}
                isDefeated={renderedPlayer.health <= 0}
                chatBubble={chatBubbleBySessionId.get(sessionId)}
                viewerPosition={viewerPosition}
                onTarget={isLocalPlayer ? undefined : () => onSelectTarget({ kind: "player", id: sessionId })}
              />
            );
          }
          return (
            <MferAvatar
              key={sessionId}
              player={renderedPlayer}
              isLocal={isLocalPlayer}
              showNameplate={showNameplate}
              showNameplateHealthBar={nameplateVisibility.healthBars}
              isTargeted={isTargetSelected(selectedTarget, "player", sessionId)}
              isDefeated={player.health <= 0}
              chatBubble={chatBubbleBySessionId.get(sessionId)}
              viewerPosition={viewerPosition}
              onTarget={isLocalPlayer ? undefined : () => onSelectTarget({ kind: "player", id: sessionId })}
            />
          );
        })}
        {renderedNpcs.map((npc) => {
          const isTargeted = isTargetSelected(selectedTarget, "npc", npc.id);
          const onTarget = () => {
            if (onSelectNpcTarget) onSelectNpcTarget(npc.id);
            else onSelectTarget({ kind: "npc", id: npc.id });
          };
          const questMarker = hideWorldOverlays ? null : getNpcQuestMarker(npc, localQuestState);
          const showNameplate = shouldShowNpcNameplate(npc, nameplateVisibility);
          if (npc.model === "mfergpt") {
            return (
              <MferGptAvatar
                key={npc.id}
                npc={npc}
                showNameplate={showNameplate}
                showNameplateHealthBar={nameplateVisibility.healthBars}
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
                showNameplateHealthBar={nameplateVisibility.healthBars}
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
                showNameplateHealthBar={nameplateVisibility.healthBars}
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
              showNameplateHealthBar={nameplateVisibility.healthBars}
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
        <FishingBobberLayer
          players={players}
          localSessionId={localSessionId}
          onReelFishing={onReelFishing}
        />
        <CombatFeedbackLayer
          combatEvents={combatEvents}
          experienceEvents={experienceEvents}
          players={players}
          npcs={npcs}
          viewerPosition={viewerPosition}
        />
      </Suspense>
      )}
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
    && previous.onReelFishing === next.onReelFishing
    && previous.sendInput === next.sendInput
    && previous.debugTravelView === next.debugTravelView
    && previous.nameplateVisibility === next.nameplateVisibility
    && previous.hideWorldOverlays === next.hideWorldOverlays
    && previous.debugPlacementMode === next.debugPlacementMode
    && previous.debugPlacementTargets === next.debugPlacementTargets
    && previous.debugPlacementOverrides === next.debugPlacementOverrides
    && previous.selectedDebugPlacementId === next.selectedDebugPlacementId
    && previous.mobileMoveInputRef === next.mobileMoveInputRef
    && previous.renderProfile === next.renderProfile
    && previous.lightweightRender === next.lightweightRender
    && previous.controlsEnabled === next.controlsEnabled
    && previous.cameraControlsEnabled === next.cameraControlsEnabled
    && previous.cleanCaptureAgentModel === next.cleanCaptureAgentModel
    && previous.captureInputRef === next.captureInputRef
    && previous.captureCameraRef === next.captureCameraRef
    && previous.idleCameraNpcId === next.idleCameraNpcId
    && previous.onSelectDebugPlacement === next.onSelectDebugPlacement
    && previous.onChangeDebugPlacement === next.onChangeDebugPlacement;
}

function clearMobileMoveInput(inputRef: MobileMoveInputRef | undefined) {
  if (!inputRef) return;
  inputRef.current.active = false;
  inputRef.current.forward = 0;
  inputRef.current.right = 0;
  inputRef.current.sprint = false;
}

function FishingBobberLayer({
  players,
  localSessionId,
  onReelFishing,
}: {
  players: Map<string, PlayerSnapshot>;
  localSessionId: string | null;
  onReelFishing?: (attemptId?: string) => void;
}) {
  const bobbers = Array.from(players.values()).filter((player) => player.fishingState && player.fishingAttemptId);
  return (
    <>
      {bobbers.map((player) => (
        <FishingBobber
          key={player.sessionId}
          player={player}
          local={player.sessionId === localSessionId}
          onReelFishing={onReelFishing}
        />
      ))}
    </>
  );
}

function FishingBobber({
  player,
  local,
  onReelFishing,
}: {
  player: PlayerSnapshot;
  local: boolean;
  onReelFishing?: (attemptId?: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bite = player.fishingState === "bite";

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.y = 0.18 + Math.sin(t * (bite ? 18 : 3.2)) * (bite ? 0.12 : 0.035);
    group.rotation.z = bite ? Math.sin(t * 22) * 0.22 : Math.sin(t * 2.4) * 0.04;
  });

  function reel(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (!local || !bite) return;
    onReelFishing?.(player.fishingAttemptId);
  }

  return (
    <group
      ref={groupRef}
      position={[player.fishingBobberX, 0.18, player.fishingBobberZ]}
      onClick={reel}
    >
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.38, 0.44, 40]} />
        <meshBasicMaterial color={bite ? MFER_COLORS.fire : MFER_COLORS.signal} transparent opacity={bite ? 0.82 : 0.42} side={THREE.DoubleSide} />
      </mesh>
      {bite && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.66, 0.72, 44]} />
          <meshBasicMaterial color="#f8f1cf" transparent opacity={0.58} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial color={bite ? "#ff6f4f" : "#f9f3df"} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.46, 10]} />
        <meshBasicMaterial color="#d44131" />
      </mesh>
      {local && bite && (
        <Billboard position={[0, 1.04, 0]}>
          <Text
            fontSize={0.3}
            color="#201914"
            outlineWidth={0.035}
            outlineColor="#f8f1cf"
            anchorX="center"
            anchorY="middle"
          >
            reel
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function updateObserverVisualPlayer(visual: PlayerSnapshot, authoritative: PlayerSnapshot, delta: number) {
  syncLocalVisualPlayerSnapshot(visual, authoritative);

  const drift = Math.hypot(visual.x - authoritative.x, visual.z - authoritative.z);
  const heightDrift = Math.abs(visual.y - authoritative.y);
  if (drift > OBSERVER_POSITION_SNAP || heightDrift > OBSERVER_HEIGHT_SNAP) {
    visual.x = authoritative.x;
    visual.y = authoritative.y;
    visual.z = authoritative.z;
  } else {
    visual.x += (authoritative.x - visual.x) * (1 - Math.pow(OBSERVER_POSITION_DECAY, delta * 60));
    visual.z += (authoritative.z - visual.z) * (1 - Math.pow(OBSERVER_POSITION_DECAY, delta * 60));
    visual.y += (authoritative.y - visual.y) * (1 - Math.pow(OBSERVER_HEIGHT_DECAY, delta * 60));
  }

  visual.yaw = lerpAngle(visual.yaw, authoritative.yaw, 1 - Math.pow(OBSERVER_ROTATION_DECAY, delta * 60));
  visual.animation = authoritative.animation;
  visual.emote = authoritative.emote;
  visual.emoteStartedAt = authoritative.emoteStartedAt;
  visual.emoteEndsAt = authoritative.emoteEndsAt;
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * alpha;
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

function getRenderablePlayers(
  players: Map<string, PlayerSnapshot>,
  localSessionId: string | null,
  viewerPosition: { x: number; z: number } | null,
  selectedTarget: TargetSelection | null,
  renderProfile: RenderPerformanceProfile,
) {
  const entries = Array.from(players.entries());
  if (!viewerPosition) {
    return localSessionId ? entries.filter(([sessionId]) => sessionId === localSessionId) : [];
  }

  const radiusSq = renderProfile.actorRenderRadius ** 2;
  return entries.filter(([sessionId, player]) => (
    sessionId === localSessionId
    || isTargetSelected(selectedTarget, "player", sessionId)
    || distanceSq2d(viewerPosition, player.x, player.z) <= radiusSq
  ));
}

function getRenderableNpcs(
  npcs: Map<string, NpcSnapshot>,
  viewerPosition: { x: number; z: number } | null,
  selectedTarget: TargetSelection | null,
  renderProfile: RenderPerformanceProfile,
) {
  if (!viewerPosition) return [];

  const selectedNpcId = selectedTarget?.kind === "npc" ? selectedTarget.id : null;
  const candidates = Array.from(npcs.values())
    .filter(isVisibleNpc)
    .map((npc) => ({
      npc,
      distanceSq: distanceSq2d(viewerPosition, npc.x, npc.z),
      selected: npc.id === selectedNpcId,
    }))
    .filter(({ npc, distanceSq, selected }) => {
      if (selected) return true;
      const radius = getNpcRenderRadius(npc, renderProfile);
      return distanceSq <= radius * radius;
    })
    .sort((a, b) => a.distanceSq - b.distanceSq);

  if (candidates.length <= renderProfile.actorRenderBudget) {
    return candidates.map(({ npc }) => npc);
  }

  const selectedCandidates = candidates.filter(({ selected }) => selected);
  const unselectedBudget = Math.max(0, renderProfile.actorRenderBudget - selectedCandidates.length);
  return [
    ...selectedCandidates,
    ...candidates.filter(({ selected }) => !selected).slice(0, unselectedBudget),
  ].map(({ npc }) => npc);
}

function getNpcRenderRadius(npc: NpcSnapshot, renderProfile: RenderPerformanceProfile) {
  return isHeavyNpcModel(npc.model)
    ? renderProfile.heavyActorRenderRadius
    : renderProfile.actorRenderRadius;
}

function isHeavyNpcModel(model: NpcSnapshot["model"]) {
  return model === "mfer" || model === "mfergpt" || model === "training-dummy";
}

function makeAgentModelSnapshot(player: PlayerSnapshot): NpcSnapshot {
  return {
    id: player.sessionId,
    name: player.name,
    role: "wanderer",
    model: "mfergpt",
    portraitImage: "",
    avatarSeed: player.avatarSeed,
    health: player.health,
    maxHealth: player.maxHealth,
    isImmortal: false,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    animation: player.animation,
    dialogue: "",
    questId: "",
    defeatedAt: player.health <= 0 ? Date.now() : 0,
    despawnAt: 0,
    frozenUntil: player.frozenUntil,
    slowedUntil: 0,
    aggroTargetId: "",
    hasLoot: false,
  };
}

function distanceSq2d(origin: { x: number; z: number }, x: number, z: number) {
  return (origin.x - x) ** 2 + (origin.z - z) ** 2;
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

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ClientAgentStatus, ClientInput, CombatActionId, NpcSnapshot, PlayerSnapshot, TargetSelection } from "@mferland/shared";
import type { useTownRoom } from "./useTownRoom";

type RealGameCaptureRoom = ReturnType<typeof useTownRoom>;
type RealGameCaptureNpcSetup = {
  npcId: string;
  name?: string;
  role?: string;
  model?: string;
  x: number;
  z: number;
  yaw?: number;
  health?: number;
  maxHealth?: number;
  leashRadius?: number;
  isImmortal?: boolean;
  combatStyle?: string;
  dialogue?: string;
  aggroTargetId?: string;
};
type DebugTravelView = {
  x: number;
  z: number;
  yaw: number;
  nonce: number;
};
type RealGameCaptureInputRef = {
  current: {
    input: ClientInput;
    receivedAt: number;
  } | null;
};
type RealGameCaptureCameraRef = {
  current: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov?: number;
  } | null;
};

declare global {
  interface Window {
    __MFERLAND_REAL_GAME_CAPTURE?: {
      status: string;
      sessionId: string | null;
      boost: (level?: number) => boolean;
      input: (x: number, z: number, yaw: number, sprint?: boolean, jump?: boolean) => boolean;
      camera: (message: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov?: number } | null) => boolean;
      teleport: (x: number, z: number, yaw?: number) => boolean;
      setupNpc: (message: RealGameCaptureNpcSetup) => boolean;
      selectTarget: (target: TargetSelection | null) => boolean;
      combatAction: (actionId: CombatActionId, target?: TargetSelection | null) => boolean;
      agentStatus: (message: ClientAgentStatus) => boolean;
      chat: (text: string) => boolean;
      snapshot: () => {
        players: PlayerSnapshot[];
        npcs: NpcSnapshot[];
      };
    };
  }
}

export function installRealGameCaptureBridge({
  roomRef,
  selectedTargetRef,
  captureInputRef,
  captureCameraRef,
  setSelectedTarget,
  setDebugTravelView,
}: {
  roomRef: MutableRefObject<RealGameCaptureRoom>;
  selectedTargetRef: MutableRefObject<TargetSelection | null>;
  captureInputRef?: RealGameCaptureInputRef;
  captureCameraRef?: RealGameCaptureCameraRef;
  setSelectedTarget: Dispatch<SetStateAction<TargetSelection | null>>;
  setDebugTravelView: Dispatch<SetStateAction<DebugTravelView | null>>;
}) {
  const bridge = {
    get status() {
      return roomRef.current.status;
    },
    get sessionId() {
      return roomRef.current.sessionId;
    },
    boost(level = 12) {
      roomRef.current.sendDebugBoostPlayer({ level, maxTalents: true });
      return true;
    },
    input(x: number, z: number, yaw: number, sprint = false, jump = false) {
      const input: ClientInput = {
        seq: Date.now(),
        x,
        z,
        yaw,
        sprint,
        jump,
      };
      if (captureInputRef) captureInputRef.current = { input, receivedAt: Date.now() };
      roomRef.current.sendInput(input);
      return true;
    },
    camera(message: RealGameCaptureCameraRef["current"]) {
      if (!captureCameraRef) return false;
      captureCameraRef.current = message;
      return true;
    },
    teleport(x: number, z: number, yaw = 0) {
      roomRef.current.sendDebugTeleport({ x, z, yaw });
      if (captureInputRef) captureInputRef.current = null;
      if (captureCameraRef) captureCameraRef.current = null;
      setSelectedTarget(null);
      setDebugTravelView({ x, z, yaw, nonce: Date.now() });
      return true;
    },
    setupNpc(message: RealGameCaptureNpcSetup) {
      roomRef.current.sendDebugNpcSetup(message);
      return true;
    },
    selectTarget(target: TargetSelection | null) {
      setSelectedTarget(target);
      return true;
    },
    combatAction(actionId: CombatActionId, target: TargetSelection | null = selectedTargetRef.current) {
      if (target) setSelectedTarget(target);
      roomRef.current.sendCombatAction({ actionId, target });
      return true;
    },
    agentStatus(message: ClientAgentStatus) {
      roomRef.current.sendAgentStatus(message);
      return true;
    },
    chat(text: string) {
      roomRef.current.sendChat(text);
      return true;
    },
    snapshot() {
      const currentRoom = roomRef.current;
      return {
        players: Array.from(currentRoom.players.values()),
        npcs: Array.from(currentRoom.npcs.values()),
      };
    },
  };

  window.__MFERLAND_REAL_GAME_CAPTURE = bridge;

  return () => {
    if (window.__MFERLAND_REAL_GAME_CAPTURE === bridge) {
      delete window.__MFERLAND_REAL_GAME_CAPTURE;
    }
  };
}

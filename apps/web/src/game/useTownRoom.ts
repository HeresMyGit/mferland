import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import {
  ROOM_NAME,
  type ChatMessage,
  type ClientCombatAction,
  type ClientInteract,
  type ClientInput,
  type CombatEvent,
  type JoinOptions,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestSnapshot,
} from "@mferland/shared";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type RuntimeQuestCollection = {
  forEach(callback: (quest: QuestSnapshot, id: string) => void): void;
};
type RuntimePlayer = Omit<PlayerSnapshot, "sessionId" | "quests"> & {
  quests?: RuntimeQuestCollection;
};

export function useTownRoom(identity: JoinOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Map<string, PlayerSnapshot>>(new Map());
  const [npcs, setNpcs] = useState<Map<string, NpcSnapshot>>(new Map());
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [combatEvents, setCombatEvents] = useState<CombatEvent[]>([]);
  const roomRef = useRef<Room | null>(null);

  const serverUrl = useMemo(() => {
    if (import.meta.env.VITE_SERVER_URL) return String(import.meta.env.VITE_SERVER_URL);
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:2567`;
  }, []);

  useEffect(() => {
    let disposed = false;
    const client = new Client(serverUrl);

    setStatus("connecting");
    setError(null);

    client.joinOrCreate(ROOM_NAME, identity)
      .then((room) => {
        if (disposed) {
          void room.leave();
          return;
        }

        roomRef.current = room;
        setSessionId(room.sessionId);
        setStatus("connected");

        room.onStateChange((state) => {
          const next = new Map<string, PlayerSnapshot>();
          state.players.forEach((player: RuntimePlayer, id: string) => {
            next.set(id, {
              sessionId: id,
              name: player.name,
              identityType: player.identityType,
              walletAddress: player.walletAddress,
              avatarSeed: player.avatarSeed,
              health: player.health,
              maxHealth: player.maxHealth,
              mana: player.mana,
              maxMana: player.maxMana,
              x: player.x,
              y: player.y,
              z: player.z,
              yaw: player.yaw,
              animation: player.animation,
              lastSeq: player.lastSeq,
              attackReadyAt: player.attackReadyAt,
              shootReadyAt: player.shootReadyAt,
              fireblastReadyAt: player.fireblastReadyAt,
              castingAction: player.castingAction,
              castStartedAt: player.castStartedAt,
              castEndsAt: player.castEndsAt,
              quests: snapshotQuests(player.quests),
            });
          });
          setPlayers(next);

          const nextNpcs = new Map<string, NpcSnapshot>();
          state.npcs?.forEach((npc: NpcSnapshot, id: string) => {
            nextNpcs.set(id, {
              id,
              name: npc.name,
              role: npc.role,
              model: npc.model,
              avatarSeed: npc.avatarSeed,
              health: npc.health,
              maxHealth: npc.maxHealth,
              isImmortal: npc.isImmortal,
              x: npc.x,
              y: npc.y,
              z: npc.z,
              yaw: npc.yaw,
              animation: npc.animation,
              dialogue: npc.dialogue,
              questId: npc.questId,
              defeatedAt: npc.defeatedAt,
              despawnAt: npc.despawnAt,
              aggroTargetId: npc.aggroTargetId,
            });
          });
          setNpcs(nextNpcs);
        });

        room.onMessage("chat", (message: ChatMessage) => {
          setChat((current) => [...current.slice(-30), message]);
        });

        room.onMessage("combatEvent", (message: CombatEvent) => {
          const now = Date.now();
          const travelMs = Math.max(0, (message.impactAt ?? message.sentAt) - message.sentAt);
          const visualEvent = {
            ...message,
            sentAt: now,
            impactAt: now + travelMs,
          };
          setCombatEvents((current) => [
            ...current.filter((event) => now - (event.impactAt ?? event.sentAt) < 1800).slice(-40),
            visualEvent,
          ]);
        });

        room.onLeave(() => {
          if (!disposed) setStatus("closed");
        });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unable to join town");
      });

    return () => {
      disposed = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave();
    };
  }, [identity, serverUrl]);

  const sendInput = useCallback((input: ClientInput) => {
    roomRef.current?.send("input", input);
  }, []);

  const sendChat = useCallback((text: string) => {
    roomRef.current?.send("chat", { text });
  }, []);

  const sendInteract = useCallback((message: ClientInteract = {}) => {
    roomRef.current?.send("interact", message);
  }, []);

  const sendCombatAction = useCallback((message: ClientCombatAction) => {
    roomRef.current?.send("combatAction", message);
  }, []);

  const sendRespawn = useCallback(() => {
    roomRef.current?.send("respawn", {});
  }, []);

  return {
    status,
    error,
    sessionId,
    players,
    npcs,
    chat,
    combatEvents,
    sendInput,
    sendChat,
    sendInteract,
    sendCombatAction,
    sendRespawn,
  };
}

function snapshotQuests(quests: RuntimeQuestCollection | undefined): QuestSnapshot[] {
  const next: QuestSnapshot[] = [];
  quests?.forEach((quest, id) => {
    next.push({
      id: (quest.id || id) as QuestSnapshot["id"],
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      completedAt: quest.completedAt,
    });
  });
  return next.sort((left, right) => left.id.localeCompare(right.id));
}

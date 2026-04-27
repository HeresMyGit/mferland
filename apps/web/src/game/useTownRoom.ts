import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import {
  ROOM_NAME,
  type ChatMessage,
  type ClientInput,
  type JoinOptions,
  type PlayerSnapshot,
} from "@mferland/shared";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";

export function useTownRoom(identity: JoinOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Map<string, PlayerSnapshot>>(new Map());
  const [chat, setChat] = useState<ChatMessage[]>([]);
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
          state.players.forEach((player: PlayerSnapshot, id: string) => {
            next.set(id, {
              sessionId: id,
              name: player.name,
              identityType: player.identityType,
              walletAddress: player.walletAddress,
              avatarSeed: player.avatarSeed,
              x: player.x,
              y: player.y,
              z: player.z,
              yaw: player.yaw,
              animation: player.animation,
              lastSeq: player.lastSeq,
            });
          });
          setPlayers(next);
        });

        room.onMessage("chat", (message: ChatMessage) => {
          setChat((current) => [...current.slice(-30), message]);
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

  return {
    status,
    error,
    sessionId,
    players,
    chat,
    sendInput,
    sendChat,
  };
}

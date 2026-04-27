import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import { CHAT, PLAZA_BOUNDS, type ChatMessage, type PlayerSnapshot } from "@mferland/shared";
import { colorFromSeed } from "../game/random";

type HudProps = {
  identity: {
    name: string;
    avatarSeed: number;
  };
  playerCount: number;
  connectionStatus: string;
  connectionError: string | null;
  chat: ChatMessage[];
  players: Map<string, PlayerSnapshot>;
  localSessionId: string | null;
  quickSlots: Array<{ icon: LucideIcon; label: string }>;
  menuButtons: Array<{ icon: LucideIcon; label: string }>;
  onSendChat: (text: string) => void;
  onExit: () => void;
};

export function Hud({
  identity,
  playerCount,
  connectionStatus,
  connectionError,
  chat,
  players,
  localSessionId,
  quickSlots,
  menuButtons,
  onSendChat,
  onExit,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const accent = useMemo(() => colorFromSeed(identity.avatarSeed), [identity.avatarSeed]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendChat(text);
    setDraft("");
  }

  return (
    <div className="hud">
      <section className="player-card">
        <div className="portrait" style={{ "--accent": accent } as CSSProperties}>
          <span>mf</span>
        </div>
        <div className="player-vitals">
          <strong>{identity.name}</strong>
          <div className="bar hp"><span style={{ width: "100%" }} />100/100</div>
          <div className="bar mp"><span style={{ width: "100%" }} />50/50</div>
        </div>
      </section>

      <section className="quest-panel">
        <h2>Quests</h2>
        <Quest title="Mfer beginnings" detail="Talk to OG mfer" progress="0/1" />
        <Quest title="Daily vibes" detail="Chill in the plaza" progress="0/1" />
      </section>

      <section className="minimap-panel">
        <h2>Mfer Town</h2>
        <div className="minimap">
          <div className="minimap-ring" />
          {Array.from(players.entries()).map(([id, player]) => (
            <span
              key={id}
              className={id === localSessionId ? "map-dot local" : "map-dot"}
              style={{
                left: `${normalize(player.x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
                top: `${normalize(player.z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
                backgroundColor: id === localSessionId ? "#f3d04e" : colorFromSeed(player.avatarSeed),
              }}
            />
          ))}
        </div>
        <div className="online-row">
          <span>Online: {playerCount}</span>
          <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </section>

      <section className="chat-panel">
        <div className="chat-log">
          {chat.length === 0 ? (
            <p className="muted">gm mfers</p>
          ) : chat.map((message, index) => (
            <p key={`${message.sentAt}-${index}`}>
              <strong>{message.name}: </strong>
              {message.identityType === "agent" && <em>agent </em>}
              {message.text}
            </p>
          ))}
        </div>
        <form onSubmit={submit}>
          <input
            value={draft}
            maxLength={CHAT.maxLength}
            placeholder="Say gm..."
            onChange={(event) => setDraft(event.target.value)}
          />
        </form>
      </section>

      <section className="hotbar">
        {quickSlots.map((slot, index) => {
          const Icon = slot.icon;
          return (
            <button key={slot.label} type="button" title={slot.label}>
              <Icon size={24} />
              <span>{index + 1}</span>
            </button>
          );
        })}
      </section>

      <section className="menu-dock">
        {menuButtons.map((button) => {
          const Icon = button.icon;
          return (
            <button key={button.label} type="button" title={button.label}>
              <Icon size={25} />
              <span>{button.label}</span>
            </button>
          );
        })}
        <button type="button" title="Leave" onClick={onExit}>
          <LogOut size={25} />
          <span>Leave</span>
        </button>
      </section>

      <div className={`status-pill ${connectionStatus}`}>
        {connectionError || connectionStatus}
      </div>
    </div>
  );
}

function Quest({ title, detail, progress }: { title: string; detail: string; progress: string }) {
  return (
    <div className="quest-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <em>{progress}</em>
    </div>
  );
}

function normalize(value: number, min: number, max: number) {
  return Math.max(7, Math.min(93, ((value - min) / (max - min)) * 100));
}

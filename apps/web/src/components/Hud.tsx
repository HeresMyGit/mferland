import { type CSSProperties, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Flame, Hand, LogOut, Sword } from "lucide-react";
import {
  CHAT,
  COMBAT,
  PLAZA_BOUNDS,
  isAttackableNpcRole,
  type ActionId,
  type ChatMessage,
  type CombatActionId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { colorFromSeed } from "../game/random";

type ActionSlot = ActionId | null;
type DragState = {
  fromIndex: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  isDragging: boolean;
};

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
  npcs: Map<string, NpcSnapshot>;
  selectedTarget: TargetSelection | null;
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null;
  localSessionId: string | null;
  localPlayer: PlayerSnapshot | null;
  actionSlots: ActionSlot[];
  onAction: (actionId: ActionId) => void;
  onMoveActionSlot: (fromIndex: number, toIndex: number) => void;
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
  npcs,
  selectedTarget,
  selectedTargetUnit,
  localSessionId,
  localPlayer,
  actionSlots,
  onAction,
  onMoveActionSlot,
  onSendChat,
  onExit,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const dragStateRef = useRef<DragState | null>(null);
  const [dragState, setDragStateState] = useState<DragState | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const accent = useMemo(() => colorFromSeed(identity.avatarSeed), [identity.avatarSeed]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendChat(text);
    setDraft("");
  }

  function setDragState(nextDragState: DragState | null) {
    dragStateRef.current = nextDragState;
    setDragStateState(nextDragState);
  }

  function beginActionDrag(index: number, event: PointerEvent<HTMLElement>) {
    if (!actionSlots[index] || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      fromIndex: index,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      isDragging: false,
    });
  }

  function updateActionDrag(event: PointerEvent<HTMLElement>) {
    const current = dragStateRef.current;
    if (!current) return;

    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    const isDragging = current.isDragging || distance > 5;
    setDragState({
      ...current,
      x: event.clientX,
      y: event.clientY,
      isDragging,
    });
    setDropSlot(isDragging ? getSlotIndexFromPoint(event.clientX, event.clientY) : null);
  }

  function endActionDrag(event: PointerEvent<HTMLElement>) {
    const current = dragStateRef.current;
    if (!current) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be lost if the gesture leaves the browser window.
    }

    const actionId = actionSlots[current.fromIndex];
    const toIndex = current.isDragging ? getSlotIndexFromPoint(event.clientX, event.clientY) : null;
    if (current.isDragging && toIndex !== null) {
      onMoveActionSlot(current.fromIndex, toIndex);
    } else if (actionId) {
      onAction(actionId);
    }

    setDragState(null);
    setDropSlot(null);
  }

  return (
    <div className="hud">
      <section className="player-card">
          <div className="portrait" style={{ "--accent": accent } as CSSProperties}>
            <span>mf</span>
          </div>
          <div className="player-vitals">
            <strong>{identity.name}</strong>
          <div className="bar hp">
            <span style={{ width: `${percent(localPlayer?.health ?? 100, localPlayer?.maxHealth ?? 100)}%` }} />
            {Math.ceil(localPlayer?.health ?? 100)}/{Math.ceil(localPlayer?.maxHealth ?? 100)}
          </div>
          <div className="bar mp">
            <span style={{ width: `${percent(localPlayer?.mana ?? 50, localPlayer?.maxMana ?? 50)}%` }} />
            {Math.floor(localPlayer?.mana ?? 50)}/{Math.ceil(localPlayer?.maxMana ?? 50)}
          </div>
        </div>
      </section>

      {localPlayer?.castingAction && (
        <section className="cast-bar">
          <strong>{getActionMeta(localPlayer.castingAction)?.label}</strong>
          <div>
            <span style={{ width: `${getCastPercent(localPlayer, now)}%` }} />
          </div>
        </section>
      )}

      <section className="quest-panel">
        <h2>Quests</h2>
        <Quest title="Mfer beginnings" detail="Talk to OG mfer" progress="0/1" />
        <Quest title="Daily vibes" detail="Chill in the plaza" progress="0/1" />
      </section>

      {selectedTarget && selectedTargetUnit && (
        <TargetFrame
          kind={selectedTarget.kind}
          unit={selectedTargetUnit}
        />
      )}

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
          {Array.from(npcs.values()).filter((npc) => npc.isImmortal || npc.health > 0).map((npc) => (
            <span
              key={npc.id}
              className={`map-dot npc ${isAttackableNpcRole(npc.role) ? "enemy" : ""}`}
              title={npc.name}
              style={{
                left: `${normalize(npc.x, PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxX)}%`,
                top: `${normalize(npc.z, PLAZA_BOUNDS.minZ, PLAZA_BOUNDS.maxZ)}%`,
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
              {message.identityType === "npc" && <em>npc </em>}
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
        {actionSlots.map((actionId, index) => (
          <ActionSlotButton
            key={index}
            actionId={actionId}
            index={index}
            isDragging={dragState?.fromIndex === index && dragState.isDragging}
            isDropTarget={dropSlot === index && dragState?.isDragging === true}
            localPlayer={localPlayer}
            now={now}
            onAction={onAction}
            onPointerStart={beginActionDrag}
            onPointerMove={updateActionDrag}
            onPointerEnd={endActionDrag}
          />
        ))}
      </section>

      <section className="menu-dock">
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

function ActionSlotButton({
  actionId,
  index,
  isDragging,
  isDropTarget,
  onAction,
  onPointerStart,
  onPointerMove,
  onPointerEnd,
  localPlayer,
  now,
}: {
  actionId: ActionSlot;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onAction: (actionId: ActionId) => void;
  onPointerStart: (index: number, event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
  localPlayer: PlayerSnapshot | null;
  now: number;
}) {
  const action = actionId ? getActionMeta(actionId) : null;
  const Icon = action?.icon;
  const cooldown = actionId && actionId !== "interact" ? getCooldownState(localPlayer, actionId, now) : null;
  const hasMana = actionId && actionId !== "interact"
    ? (localPlayer?.mana ?? 0) >= COMBAT.actions[actionId].manaCost
    : true;
  const className = [
    "action-slot",
    action ? "filled" : "empty",
    isDragging ? "dragging" : "",
    isDropTarget ? "drop-target" : "",
    cooldown && cooldown.remainingMs > 0 ? "cooling" : "",
    hasMana ? "" : "oom",
  ].filter(Boolean).join(" ");

  if (!action || !Icon) {
    return (
      <div className={className} data-action-slot={index}>
        <span className="slot-key">{index + 1}</span>
      </div>
    );
  }

  return (
    <button
      className={className}
      type="button"
      data-action-slot={index}
      title={`${action.label} (${index + 1})`}
      aria-label={`${action.label}, slot ${index + 1}`}
      onPointerDown={(event) => onPointerStart(index, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onAction(action.id);
      }}
    >
      <Icon size={25} />
      <strong>{action.label}</strong>
      {cooldown && cooldown.remainingMs > 0 && (
        <span className="cooldown-sweep" style={{ height: `${cooldown.percent}%` }} />
      )}
      {cooldown && cooldown.remainingMs > 0 && (
        <em className="cooldown-label">{formatCooldown(cooldown.remainingMs)}</em>
      )}
      <span className="slot-key">{index + 1}</span>
    </button>
  );
}

function getActionMeta(actionId: ActionId) {
  if (actionId === "interact") {
    return {
      id: actionId,
      label: "Interact",
      icon: Hand,
    };
  }
  if (actionId === "attack") {
    return {
      id: actionId,
      label: "Attack",
      icon: Sword,
    };
  }
  if (actionId === "shoot") {
    return {
      id: actionId,
      label: "Shoot",
      icon: Crosshair,
    };
  }
  if (actionId === "fireblast") {
    return {
      id: actionId,
      label: "Fireblast",
      icon: Flame,
    };
  }
}

function getSlotIndexFromPoint(x: number, y: number) {
  const element = document.elementFromPoint(x, y);
  const slot = element?.closest<HTMLElement>("[data-action-slot]");
  const slotIndex = Number(slot?.dataset.actionSlot);
  return Number.isInteger(slotIndex) ? slotIndex : null;
}

function TargetFrame({ kind, unit }: { kind: TargetSelection["kind"]; unit: PlayerSnapshot | NpcSnapshot }) {
  const isNpc = kind === "npc";
  const npc = isNpc ? (unit as NpcSnapshot) : null;
  const isEnemy = npc ? isAttackableNpcRole(npc.role) : false;
  const maxHealth = npc?.maxHealth || 100;
  const health = npc?.health ?? 100;
  const healthPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const label = npc ? roleLabel(npc.role) : playerLabel(unit as PlayerSnapshot);
  const healthText = npc?.isImmortal ? "∞" : `${Math.round(health)}/${Math.round(maxHealth)}`;

  return (
    <section className={`target-frame ${isEnemy ? "enemy" : ""}`}>
      <div className="target-portrait">
        <span>{isEnemy ? "!" : "mf"}</span>
      </div>
      <div className="target-vitals">
        <strong>{unit.name}</strong>
        <em>{label}</em>
        <div className="target-health">
          <span style={{ width: `${healthPercent}%` }} />
          {healthText}
        </div>
      </div>
    </section>
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

function roleLabel(role: NpcSnapshot["role"]) {
  if (role === "quest_giver") return "Quest giver";
  if (role === "merchant") return "Merchant";
  if (role === "guard") return "Guard";
  if (role === "enemy") return "Training";
  if (role === "critter") return "Critter";
  if (role === "beast") return "Beast";
  return "Town NPC";
}

function playerLabel(player: PlayerSnapshot) {
  if (player.identityType === "agent") return "Agent";
  if (player.identityType === "wallet") return "Wallet player";
  return "Player";
}

function normalize(value: number, min: number, max: number) {
  return Math.max(7, Math.min(93, ((value - min) / (max - min)) * 100));
}

function percent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function getActionReadyAt(player: PlayerSnapshot | null, actionId: CombatActionId) {
  if (!player) return 0;
  if (actionId === "attack") return player.attackReadyAt;
  if (actionId === "shoot") return player.shootReadyAt;
  return player.fireblastReadyAt;
}

function getCooldownState(player: PlayerSnapshot | null, actionId: CombatActionId, now: number) {
  const remainingMs = Math.max(0, getActionReadyAt(player, actionId) - now);
  const cooldownMs = COMBAT.actions[actionId].cooldownMs;
  return {
    remainingMs,
    percent: cooldownMs > 0 ? Math.min(100, (remainingMs / cooldownMs) * 100) : 0,
  };
}

function getCastPercent(player: PlayerSnapshot, now: number) {
  if (!player.castingAction) return 0;
  const duration = Math.max(1, player.castEndsAt - player.castStartedAt);
  return Math.max(0, Math.min(100, ((now - player.castStartedAt) / duration) * 100));
}

function formatCooldown(ms: number) {
  const seconds = ms / 1000;
  return seconds >= 1 ? String(Math.ceil(seconds)) : seconds.toFixed(1);
}

import { type CSSProperties, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, LogOut, Map as MapIcon, Package, X } from "lucide-react";
import {
  CHAT,
  ITEMS,
  getNpcDisposition,
  type ActionId,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientLootCorpse,
  type LootWindow,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestOffer,
  type TargetSelection,
} from "@mferland/shared";
import { colorFromSeed } from "../game/random";
import { ActionSlotButton, getActionMeta } from "./hud/ActionSlotButton";
import { ItemIcon } from "./hud/ItemIcon";
import { Quest } from "./hud/Quest";
import { TargetFrame } from "./hud/TargetFrame";
import type { ActionSlot, DragState } from "./hud/types";
import {
  MINIMAP_ROADS,
  getExploredCellKeys,
  getExploredCellStyle,
  getMinimapCircleStyle,
  getMinimapPointStyle,
  getMinimapRoadStyle,
  getWorldMapCircleStyle,
  getWorldMapPointStyle,
  getWorldMapRoadStyle,
} from "./hud/mapUtils";
import { getCastPercent, getSlotIndexFromPoint, isTypingTarget, percent } from "./hud/utils";

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
  questOffer: QuestOffer | null;
  lootWindow: LootWindow | null;
  actionSlots: ActionSlot[];
  onAction: (actionId: ActionId) => void;
  onMoveActionSlot: (fromIndex: number, toIndex: number) => void;
  onAcceptQuest: (message: ClientAcceptQuest) => void;
  onDismissQuestOffer: () => void;
  onLootCorpse: (message: ClientLootCorpse) => void;
  onCloseLootWindow: () => void;
  onSendChat: (text: string) => void;
  onRespawn: () => void;
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
  questOffer,
  lootWindow,
  actionSlots,
  onAction,
  onMoveActionSlot,
  onAcceptQuest,
  onDismissQuestOffer,
  onLootCorpse,
  onCloseLootWindow,
  onSendChat,
  onRespawn,
  onExit,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const dragStateRef = useRef<DragState | null>(null);
  const [dragState, setDragStateState] = useState<DragState | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isQuestLogOpen, setIsQuestLogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [exploredCells, setExploredCells] = useState<Set<string>>(() => new Set());
  const accent = useMemo(() => colorFromSeed(identity.avatarSeed), [identity.avatarSeed]);
  const questLog = useMemo(() => localPlayer?.quests ?? [], [localPlayer?.quests]);
  const trackedQuests = useMemo(
    () => questLog.filter((quest) => quest.status !== "completed").slice(0, 2),
    [questLog],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!localPlayer) return;
    const newlyExplored = getExploredCellKeys(localPlayer.x, localPlayer.z);
    setExploredCells((current) => {
      let changed = false;
      const next = new Set(current);
      for (const key of newlyExplored) {
        if (next.has(key)) continue;
        next.add(key);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [localPlayer?.x, localPlayer?.z]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      setIsMapOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        <div className="quest-panel-header">
          <h2>Quest Tracker</h2>
          <button type="button" title="Quest log" aria-label="Open quest log" onClick={() => setIsQuestLogOpen(true)}>
            <BookOpen size={17} />
          </button>
        </div>
        {trackedQuests.length > 0 ? trackedQuests.map((quest) => (
          <Quest key={quest.id} quest={quest} />
        )) : (
          <p className="quest-empty">No tracked quests</p>
        )}
      </section>

      {questOffer && (
        <section className="quest-offer-panel">
          <button className="quest-offer-close" type="button" title="Dismiss" aria-label="Dismiss quest offer" onClick={onDismissQuestOffer}>
            <X size={17} />
          </button>
          <strong>{questOffer.title}</strong>
          <span>{questOffer.description}</span>
          <em>{questOffer.objectiveLabel}: 0/{questOffer.required}</em>
          <button
            className="quest-accept-btn"
            type="button"
            onClick={() => onAcceptQuest({ questId: questOffer.questId, npcId: questOffer.npcId })}
          >
            <Check size={17} />
            Accept
          </button>
        </section>
      )}

      {lootWindow && (
        <section className="loot-panel">
          <button className="quest-offer-close" type="button" title="Close loot" aria-label="Close loot" onClick={onCloseLootWindow}>
            <X size={17} />
          </button>
          <strong>{lootWindow.npcName}</strong>
          <div className="loot-list">
            {lootWindow.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="item-row"
                onClick={() => onLootCorpse({ npcId: lootWindow.npcId, itemId: item.id })}
              >
                <ItemIcon itemId={item.id} />
                <span>{ITEMS[item.id].name}</span>
                <em>x{item.count}</em>
              </button>
            ))}
          </div>
          <button className="quest-accept-btn" type="button" onClick={() => onLootCorpse({ npcId: lootWindow.npcId })}>
            <Package size={17} />
            Loot all
          </button>
        </section>
      )}

      {selectedTarget && selectedTargetUnit && (
        <TargetFrame
          kind={selectedTarget.kind}
          unit={selectedTargetUnit}
        />
      )}

      <section className="minimap-panel">
        <div className="minimap-header">
          <h2>Mfer Town</h2>
          <button type="button" title="Map (M)" aria-label="Open map" onClick={() => setIsMapOpen(true)}>
            <MapIcon size={18} />
          </button>
        </div>
        <div className="minimap">
          <div className="minimap-terrain" />
          <span className="minimap-plaza" style={getMinimapCircleStyle(localPlayer, 0, 0, 24)} />
          {MINIMAP_ROADS.map((road, index) => (
            <span
              key={`${road.x}:${road.z}:${index}`}
              className="minimap-road"
              style={getMinimapRoadStyle(localPlayer, road)}
            />
          ))}
          <div className="minimap-ring" />
          <div className="minimap-vision-cone" />
          {Array.from(players.entries()).map(([id, player]) => (
            <span
              key={id}
              className={id === localSessionId ? "map-dot local" : "map-dot"}
              style={{
                ...getMinimapPointStyle(localPlayer, player.x, player.z),
                backgroundColor: id === localSessionId ? "#f3d04e" : colorFromSeed(player.avatarSeed),
              }}
            />
          ))}
          {Array.from(npcs.values()).filter((npc) => npc.isImmortal || npc.health > 0).map((npc) => (
            <span
              key={npc.id}
              className={`map-dot npc ${getNpcDisposition(npc)}`}
              title={npc.name}
              style={{
                ...getMinimapPointStyle(localPlayer, npc.x, npc.z),
              }}
            />
          ))}
        </div>
        <div className="online-row">
          <span>Online: {playerCount}</span>
          <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </section>

      {isMapOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="World map">
          <div className="world-map-panel">
            <div className="world-map-header">
              <div>
                <strong>Mfer Town</strong>
                <span>{exploredCells.size} areas uncovered</span>
              </div>
              <button type="button" title="Close map" aria-label="Close map" onClick={() => setIsMapOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="world-map">
              <div className="world-map-terrain" />
              {Array.from(exploredCells).map((key) => (
                <span key={key} className="world-map-uncovered" style={getExploredCellStyle(key)} />
              ))}
              <span className="world-map-plaza" style={getWorldMapCircleStyle(0, 0, 24)} />
              {MINIMAP_ROADS.map((road, index) => (
                <span
                  key={`${road.x}:${road.z}:${index}`}
                  className="world-map-road"
                  style={getWorldMapRoadStyle(road)}
                />
              ))}
              {Array.from(npcs.values()).filter((npc) => npc.isImmortal || npc.health > 0).map((npc) => (
                <span
                  key={npc.id}
                  className={`map-dot npc ${getNpcDisposition(npc)}`}
                  title={npc.name}
                  style={getWorldMapPointStyle(npc.x, npc.z)}
                />
              ))}
              {localPlayer && (
                <span
                  className="map-dot local"
                  style={getWorldMapPointStyle(localPlayer.x, localPlayer.z)}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {isQuestLogOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="Quest log">
          <div className="quest-log-panel">
            <div className="world-map-header">
              <div>
                <strong>Quest Log</strong>
                <span>{questLog.length} quests</span>
              </div>
              <button type="button" title="Close quest log" aria-label="Close quest log" onClick={() => setIsQuestLogOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="quest-log-list">
              {questLog.length > 0 ? questLog.map((quest) => (
                <Quest key={quest.id} quest={quest} full />
              )) : (
                <p className="quest-empty">No accepted quests yet</p>
              )}
            </div>
          </div>
        </section>
      )}

      {isInventoryOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="Inventory">
          <div className="inventory-panel">
            <div className="world-map-header">
              <div>
                <strong>Inventory</strong>
                <span>{localPlayer?.inventory.length ?? 0} stacks</span>
              </div>
              <button type="button" title="Close inventory" aria-label="Close inventory" onClick={() => setIsInventoryOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="inventory-grid">
              {localPlayer && localPlayer.inventory.length > 0 ? localPlayer.inventory.map((item) => (
                <div key={item.id} className="inventory-slot" title={ITEMS[item.id].description}>
                  <ItemIcon itemId={item.id} />
                  <strong>{ITEMS[item.id].name}</strong>
                  <em>x{item.count}</em>
                </div>
              )) : (
                <p className="quest-empty">Inventory empty</p>
              )}
            </div>
          </div>
        </section>
      )}

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
            selectedTarget={selectedTarget}
            selectedTargetUnit={selectedTargetUnit}
            now={now}
            onAction={onAction}
            onPointerStart={beginActionDrag}
            onPointerMove={updateActionDrag}
            onPointerEnd={endActionDrag}
          />
        ))}
      </section>

      <section className="menu-dock">
        <button type="button" title="Inventory" onClick={() => setIsInventoryOpen(true)}>
          <Package size={25} />
          <span>Inventory</span>
        </button>
        <button type="button" title="Quest log" onClick={() => setIsQuestLogOpen(true)}>
          <BookOpen size={25} />
          <span>Quests</span>
        </button>
        <button type="button" title="Leave" onClick={onExit}>
          <LogOut size={25} />
          <span>Leave</span>
        </button>
      </section>

      <div className={`status-pill ${connectionStatus}`}>
        {connectionError || connectionStatus}
      </div>

      {localPlayer && localPlayer.health <= 0 && (
        <section className="death-panel">
          <strong>You died</strong>
          <button type="button" onClick={onRespawn}>Respawn</button>
        </section>
      )}
    </div>
  );
}

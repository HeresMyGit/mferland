import { type CSSProperties, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Gift, ListChecks, LogOut, Map as MapIcon, Package, Settings, Sparkles, UserRound, X } from "lucide-react";
import {
  CHAT,
  EQUIPMENT_SLOT_IDS,
  EQUIPMENT_SLOTS,
  ITEMS,
  STAT_LABELS,
  getLevelProgress,
  getInventoryItemKey,
  getItemConsumable,
  getItemEquipment,
  getNpcDisposition,
  type ActionId,
  type ChatMessage,
  type CombatActionId,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientEquipItem,
  type ClientLootCorpse,
  type ClientSelectTalent,
  type ClientUnequipItem,
  type ClientUseItem,
  type EquipmentSlotId,
  type InventoryItemSnapshot,
  type ItemId,
  type LootWindow,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestOffer,
  type QuestStatusNotice,
  type QuestTurnIn,
  type TargetSelection,
} from "@mferland/shared";
import { colorFromSeed } from "../game/random";
import { type AudioSettings } from "../game/audio";
import { MFER_COLORS } from "../game/mferPalette";
import { generateMferTraitsForActor } from "../game/mferTraits";
import { type GameSettings, type NameplateVisibility } from "../game/settings";
import { ActionSlotButton, getActionMeta, getActionReadyAt } from "./hud/ActionSlotButton";
import { AbilitiesPanel } from "./hud/AbilitiesPanel";
import { AbilityIcon, EquipmentSlotIcon } from "./hud/GameIcon";
import { ItemIcon } from "./hud/ItemIcon";
import { Quest } from "./hud/Quest";
import { TargetFrame } from "./hud/TargetFrame";
import { type ActionSlot, type DragState, isItemActionSlot, makeItemActionSlot } from "./hud/types";
import { MferPortrait } from "./MferPortrait";
import {
  MINIMAP_HUBS,
  MINIMAP_LANDMARKS,
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
import { formatTooltipLabel, getSlotIndexFromPoint, isTypingTarget, percent } from "./hud/utils";

const HUD_TICK_MS = 200;
const IDLE_HUD_TICK_MIN_MS = 1000;
const TOOLTIP_MAX_WIDTH = 280;
const TOOLTIP_MAX_HEIGHT = 220;
const TOOLTIP_OFFSET = 16;

type HudTooltipState = {
  text: string;
  x: number;
  y: number;
};

type MoveUnlockNotice = {
  id: number;
  actionId: CombatActionId;
  level: number;
  buttonIndex: number | null;
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
  questOffer: QuestOffer | null;
  questTurnIn: QuestTurnIn | null;
  questStatus: QuestStatusNotice | null;
  lootWindow: LootWindow | null;
  actionError: { id: number; text: string } | null;
  moveUnlockNotice: MoveUnlockNotice | null;
  actionSlots: ActionSlot[];
  onAction: (slot: NonNullable<ActionSlot>) => void;
  onReplaceActionSlots: (slots: ActionSlot[]) => void;
  onAcceptQuest: (message: ClientAcceptQuest) => void;
  onCompleteQuest: (message: ClientCompleteQuest) => void;
  onDismissQuestOffer: () => void;
  onDismissQuestTurnIn: () => void;
  onDismissQuestStatus: () => void;
  onLootCorpse: (message: ClientLootCorpse) => void;
  onEquipItem: (message: ClientEquipItem) => void;
  onUnequipItem: (message: ClientUnequipItem) => void;
  onUseItem: (message: ClientUseItem) => void;
  onSelectTalent: (message: ClientSelectTalent) => void;
  onCloseLootWindow: () => void;
  onSendChat: (text: string) => void;
  onRespawn: () => void;
  onSelectSelfTarget: () => void;
  onExit: () => void;
  settings: GameSettings;
  debugToolsAvailable: boolean;
  onSettingsChange: (settings: GameSettings) => void;
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
  questTurnIn,
  questStatus,
  lootWindow,
  actionError,
  moveUnlockNotice,
  actionSlots,
  onAction,
  onReplaceActionSlots,
  onAcceptQuest,
  onCompleteQuest,
  onDismissQuestOffer,
  onDismissQuestTurnIn,
  onDismissQuestStatus,
  onLootCorpse,
  onEquipItem,
  onUnequipItem,
  onUseItem,
  onSelectTalent,
  onCloseLootWindow,
  onSendChat,
  onRespawn,
  onSelectSelfTarget,
  onExit,
  settings,
  debugToolsAvailable,
  onSettingsChange,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const dragStateRef = useRef<DragState | null>(null);
  const [dragState, setDragStateState] = useState<DragState | null>(null);
  const [carriedSlot, setCarriedSlot] = useState<ActionSlot>(null);
  const carriedSlotRef = useRef<ActionSlot>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<HudTooltipState | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isQuestLogOpen, setIsQuestLogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isCharacterOpen, setIsCharacterOpen] = useState(false);
  const [isAbilitiesOpen, setIsAbilitiesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [exploredCells, setExploredCells] = useState<Set<string>>(() => new Set());
  const exploredCellKeyRef = useRef("");
  const minimapHubRefs = useRef(new Map<string, HTMLElement>());
  const minimapRoadRefs = useRef(new Map<string, HTMLElement>());
  const minimapLandmarkRefs = useRef(new Map<string, HTMLElement>());
  const minimapPlayerRefs = useRef(new Map<string, HTMLElement>());
  const minimapNpcRefs = useRef(new Map<string, HTMLElement>());
  const worldMapLocalRef = useRef<HTMLElement | null>(null);
  const worldMapNpcRefs = useRef(new Map<string, HTMLElement>());
  const accent = useMemo(() => colorFromSeed(identity.avatarSeed), [identity.avatarSeed]);
  const portraitSeed = localPlayer?.avatarSeed ?? identity.avatarSeed;
  const playerPortraitTraits = useMemo(() => generateMferTraitsForActor(portraitSeed), [portraitSeed]);
  const questLog = useMemo(() => localPlayer?.quests ?? [], [localPlayer?.quests]);
  const levelProgress = useMemo(() => getLevelProgress(localPlayer?.xp ?? 0), [localPlayer?.xp]);
  const trackedQuests = useMemo(
    () => questLog.filter((quest) => quest.status !== "completed").slice(0, 2),
    [questLog],
  );
  const hasTrackedQuests = trackedQuests.length > 0;
  const clockMinute = Math.floor(now / 60000);
  const clockLabel = useMemo(
    () => new Date(clockMinute * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [clockMinute],
  );
  const hudTickDelay = getHudTickDelay(localPlayer, actionSlots, now);

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(Date.now()), hudTickDelay);
    return () => window.clearTimeout(timeout);
  }, [hudTickDelay, now]);

  useEffect(() => {
    carriedSlotRef.current = carriedSlot;
  }, [carriedSlot]);

  useEffect(() => {
    if (!localPlayer || !isMapOpen) return;
    revealExploredCells(localPlayer);
  }, [isMapOpen, localPlayer?.x, localPlayer?.z]);

  useEffect(() => {
    let frameId = 0;

    const updateMinimap = () => {
      const local = localPlayer;

      for (const hub of MINIMAP_HUBS) {
        applyHudPositionStyle(minimapHubRefs.current.get(hub.id), getMinimapCircleStyle(local, hub.x, hub.z, hub.diameter));
      }

      for (const road of MINIMAP_ROADS) {
        applyHudPositionStyle(minimapRoadRefs.current.get(road.id), getMinimapRoadStyle(local, road));
      }

      for (const landmark of MINIMAP_LANDMARKS) {
        applyHudPositionStyle(minimapLandmarkRefs.current.get(landmark.id), getMinimapPointStyle(local, landmark.x, landmark.z));
      }

      for (const [id, element] of minimapPlayerRefs.current) {
        const player = players.get(id);
        if (!player) continue;
        applyHudPositionStyle(element, getMinimapPointStyle(local, player.x, player.z));
      }

      for (const [id, element] of minimapNpcRefs.current) {
        const npc = npcs.get(id);
        if (!npc) continue;
        applyHudPositionStyle(element, getMinimapPointStyle(local, npc.x, npc.z));
      }

      if (isMapOpen && local) {
        revealExploredCells(local);
        applyHudPositionStyle(worldMapLocalRef.current, getWorldMapPointStyle(local.x, local.z));
        for (const [id, element] of worldMapNpcRefs.current) {
          const npc = npcs.get(id);
          if (!npc) continue;
          applyHudPositionStyle(element, getWorldMapPointStyle(npc.x, npc.z));
        }
      }

      frameId = window.requestAnimationFrame(updateMinimap);
    };

    frameId = window.requestAnimationFrame(updateMinimap);
    return () => window.cancelAnimationFrame(frameId);
  }, [isMapOpen, localPlayer, npcs, players]);

  function revealExploredCells(player: PlayerSnapshot) {
    const newlyExplored = getExploredCellKeys(player.x, player.z);
    const exploredCellKey = newlyExplored.join("|");
    if (exploredCellKey === exploredCellKeyRef.current) return;
    exploredCellKeyRef.current = exploredCellKey;

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
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "Escape" && !isTypingTarget(event.target)) {
        if (closeTopOverlay()) event.preventDefault();
        return;
      }
      if (event.key === "Enter" && !isTypingTarget(event.target) && isChatShortcutTarget(event.target)) {
        event.preventDefault();
        chatInputRef.current?.focus();
        return;
      }
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!["m", "c", "b", "i", "l", "n"].includes(key)) return;
      event.preventDefault();
      if (key === "m") setIsMapOpen((open) => !open);
      else if (key === "c") setIsCharacterOpen((open) => !open);
      else if (key === "b" || key === "i") setIsInventoryOpen((open) => !open);
      else if (key === "l") setIsQuestLogOpen((open) => !open);
      else setIsAbilitiesOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isMapOpen,
    isQuestLogOpen,
    isInventoryOpen,
    isCharacterOpen,
    isAbilitiesOpen,
    isSettingsOpen,
    lootWindow,
    questOffer,
    questTurnIn,
    questStatus,
    onCloseLootWindow,
    onDismissQuestOffer,
    onDismissQuestTurnIn,
    onDismissQuestStatus,
  ]);

  function closeTopOverlay() {
    if (carriedSlotRef.current) {
      setCarriedSlot(null);
      setDropSlot(null);
      return true;
    }
    if (lootWindow) {
      onCloseLootWindow();
      return true;
    }
    if (questStatus) {
      onDismissQuestStatus();
      return true;
    }
    if (questTurnIn) {
      onDismissQuestTurnIn();
      return true;
    }
    if (questOffer) {
      onDismissQuestOffer();
      return true;
    }
    if (isInventoryOpen) {
      setIsInventoryOpen(false);
      return true;
    }
    if (isAbilitiesOpen) {
      setIsAbilitiesOpen(false);
      return true;
    }
    if (isCharacterOpen) {
      setIsCharacterOpen(false);
      return true;
    }
    if (isQuestLogOpen) {
      setIsQuestLogOpen(false);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    if (isMapOpen) {
      setIsMapOpen(false);
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!carriedSlot) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      setCursorPosition({ x: event.clientX, y: event.clientY });
      setDropSlot(getSlotIndexFromPoint(event.clientX, event.clientY));
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const slotIndex = getSlotIndexFromPoint(event.clientX, event.clientY);
      if (slotIndex !== null) {
        event.preventDefault();
        placeSlotInHotbar(carriedSlot, slotIndex);
        return;
      }
      setCarriedSlot(null);
      setDropSlot(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [carriedSlot]);

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (event: globalThis.PointerEvent) => {
      updateDragAt(event.clientX, event.clientY);
    };
    const onPointerUp = (event: globalThis.PointerEvent) => {
      finishDragAt(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragState, actionSlots]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      chatInputRef.current?.blur();
      return;
    }
    onSendChat(text);
    setDraft("");
    chatInputRef.current?.blur();
  }

  function handleChatKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.currentTarget.blur();
  }

  function showTooltip(text: string | undefined, clientX: number, clientY: number) {
    if (!text || dragStateRef.current || carriedSlotRef.current) return;
    const position = getTooltipPosition(clientX, clientY);
    setTooltip({ text, ...position });
  }

  function moveTooltip(clientX: number, clientY: number) {
    setTooltip((current) => {
      if (!current) return current;
      const position = getTooltipPosition(clientX, clientY);
      return { ...current, ...position };
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  function handleTooltipFocus(event: ReactFocusEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    showTooltip(element.dataset.tooltip, rect.left + rect.width / 2, rect.bottom);
  }

  useEffect(() => {
    const onTooltipOver = (event: globalThis.MouseEvent | globalThis.PointerEvent) => {
      const element = getTooltipElement(event.target);
      if (!element) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      showTooltip(element.dataset.tooltip, event.clientX, event.clientY);
    };
    const onTooltipMove = (event: globalThis.MouseEvent | globalThis.PointerEvent) => {
      if (!getTooltipElement(event.target)) return;
      moveTooltip(event.clientX, event.clientY);
    };
    const onTooltipOut = (event: globalThis.MouseEvent | globalThis.PointerEvent) => {
      const element = getTooltipElement(event.target);
      if (!element) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      hideTooltip();
    };

    window.addEventListener("mouseover", onTooltipOver);
    window.addEventListener("mousemove", onTooltipMove);
    window.addEventListener("mouseout", onTooltipOut);
    window.addEventListener("pointerover", onTooltipOver);
    window.addEventListener("pointermove", onTooltipMove);
    window.addEventListener("pointerout", onTooltipOut);
    return () => {
      window.removeEventListener("mouseover", onTooltipOver);
      window.removeEventListener("mousemove", onTooltipMove);
      window.removeEventListener("mouseout", onTooltipOut);
      window.removeEventListener("pointerover", onTooltipOver);
      window.removeEventListener("pointermove", onTooltipMove);
      window.removeEventListener("pointerout", onTooltipOut);
    };
  }, []);

  function setDragState(nextDragState: DragState | null) {
    dragStateRef.current = nextDragState;
    setDragStateState(nextDragState);
  }

  function beginSlotDrag(slot: NonNullable<ActionSlot>, event: PointerEvent<HTMLElement>, fromIndex?: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCursorPosition({ x: event.clientX, y: event.clientY });
    setDragState({
      slot,
      fromIndex,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      isDragging: false,
    });
  }

  function beginActionDrag(index: number, event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if (carriedSlot) {
      event.preventDefault();
      event.stopPropagation();
      placeSlotInHotbar(carriedSlot, index);
      return;
    }

    const slot = actionSlots[index];
    if (!slot) return;
    beginSlotDrag(slot, event, index);
  }

  function updateActionDrag(event: PointerEvent<HTMLElement>) {
    updateDragAt(event.clientX, event.clientY);
  }

  function endActionDrag(event: PointerEvent<HTMLElement>) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be lost if the gesture leaves the browser window.
    }

    finishDragAt(event.clientX, event.clientY);
  }

  function updateDragAt(clientX: number, clientY: number) {
    const current = dragStateRef.current;
    if (!current) return;

    const distance = Math.hypot(clientX - current.startX, clientY - current.startY);
    const isDragging = current.isDragging || distance > 5;
    setCursorPosition({ x: clientX, y: clientY });
    setDragState({
      ...current,
      x: clientX,
      y: clientY,
      isDragging,
    });
    setDropSlot(isDragging ? getSlotIndexFromPoint(clientX, clientY) : null);
  }

  function finishDragAt(clientX: number, clientY: number) {
    const current = dragStateRef.current;
    if (!current) return;

    setCursorPosition({ x: clientX, y: clientY });
    const toIndex = current.isDragging ? getSlotIndexFromPoint(clientX, clientY) : null;
    if (current.isDragging && toIndex !== null) {
      placeSlotInHotbar(current.slot, toIndex, current.fromIndex);
    } else if (current.isDragging && typeof current.fromIndex === "number") {
      const next = [...actionSlots];
      next[current.fromIndex] = null;
      onReplaceActionSlots(next);
      setCarriedSlot(null);
    } else if (!current.isDragging && typeof current.fromIndex === "number") {
      onAction(current.slot);
    } else if (!current.isDragging && isItemActionSlot(current.slot)) {
      onUseItem({ itemId: current.slot.itemId, chainTokenId: current.slot.chainTokenId });
    }

    setDragState(null);
    setDropSlot(null);
  }

  function placeSlotInHotbar(slot: NonNullable<ActionSlot>, toIndex: number, fromIndex?: number) {
    if (toIndex < 0 || toIndex >= actionSlots.length) return;
    const next = [...actionSlots];
    if (fromIndex === toIndex) {
      setCarriedSlot(null);
      return;
    }

    const replaced = next[toIndex] ?? null;
    if (typeof fromIndex === "number") next[fromIndex] = null;
    next[toIndex] = slot;
    onReplaceActionSlots(next);
    setCarriedSlot(replaced);
    setDropSlot(null);
  }

  return (
    <div
      className="hud"
      onFocusCapture={handleTooltipFocus}
      onBlurCapture={hideTooltip}
    >
      <section className="player-card">
        <button
          className="portrait"
          type="button"
          title="Target yourself"
          aria-label="Target yourself"
          onClick={onSelectSelfTarget}
          style={{ "--accent": accent } as CSSProperties}
        >
          <MferPortrait traits={playerPortraitTraits} title="your mfer portrait" />
        </button>
        <div className="player-vitals">
          <div className="player-name-row">
            <strong>{localPlayer?.name ?? identity.name}</strong>
            <span>Lv {localPlayer?.level ?? 1}</span>
          </div>
          <div className="bar hp">
            <span style={{ width: `${percent(localPlayer?.health ?? 100, localPlayer?.maxHealth ?? 100)}%` }} />
            <em>{Math.ceil(localPlayer?.health ?? 100)}/{Math.ceil(localPlayer?.maxHealth ?? 100)}</em>
          </div>
          <div className="bar mp">
            <span style={{ width: `${percent(localPlayer?.mana ?? 50, localPlayer?.maxMana ?? 50)}%` }} />
            <em>{Math.floor(localPlayer?.mana ?? 50)}/{Math.ceil(localPlayer?.maxMana ?? 50)}</em>
          </div>
          <div className="bar xp">
            <span style={{ width: `${levelProgress.isMaxLevel ? 100 : percent(levelProgress.current, levelProgress.required)}%` }} />
            <em>{levelProgress.isMaxLevel ? "Level cap" : `${levelProgress.current}/${levelProgress.required} XP`}</em>
          </div>
        </div>
      </section>

      {localPlayer?.castingAction && (
        <CastBar
          actionId={localPlayer.castingAction}
          startedAt={localPlayer.castStartedAt}
          endsAt={localPlayer.castEndsAt}
        />
      )}

      <section className={hasTrackedQuests ? "quest-panel" : "quest-panel compact"}>
        <div className="quest-panel-header">
          <h2>{hasTrackedQuests ? "errands" : "errands"}</h2>
          <button type="button" title="errand log" aria-label="Open errand log" onClick={() => setIsQuestLogOpen(true)}>
            <BookOpen size={17} />
          </button>
        </div>
        {hasTrackedQuests ? trackedQuests.map((quest) => (
          <Quest key={quest.id} quest={quest} />
        )) : (
          <p className="quest-empty">nothing running</p>
        )}
      </section>

      {questOffer && (
        <QuestOfferPanel
          offer={questOffer}
          onAccept={() => onAcceptQuest({ questId: questOffer.questId, npcId: questOffer.npcId })}
          onDismiss={onDismissQuestOffer}
        />
      )}

      {questTurnIn && (
        <QuestTurnInPanel
          turnIn={questTurnIn}
          onComplete={() => onCompleteQuest({ questId: questTurnIn.questId, npcId: questTurnIn.npcId })}
          onDismiss={onDismissQuestTurnIn}
        />
      )}

      {questStatus && (
        <QuestStatusPanel
          notice={questStatus}
          onDismiss={onDismissQuestStatus}
        />
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
                key={getInventoryItemKey(item.id, item.chainTokenId)}
                type="button"
                className="item-row"
                data-tooltip={getLootItemTitle(item)}
                aria-label={formatTooltipLabel(getLootItemTitle(item))}
                onClick={() => onLootCorpse({ npcId: lootWindow.npcId, itemId: item.id, chainTokenId: item.chainTokenId })}
              >
                <ItemIcon itemId={item.id} />
                <span>{ITEMS[item.id].name}</span>
                <em>x{item.count}</em>
              </button>
            ))}
          </div>
          <button className="quest-accept-btn" type="button" onClick={() => onLootCorpse({ npcId: lootWindow.npcId })}>
            <Package size={17} />
            grab all
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
          <h2>mferland</h2>
          <button type="button" title="Map (M)" aria-label="Open map" onClick={() => setIsMapOpen(true)}>
            <MapIcon size={18} />
          </button>
        </div>
        <div className="minimap">
          <div className="minimap-terrain" />
          {MINIMAP_HUBS.map((hub) => (
            <span
              key={hub.id}
              ref={(element) => setHudElementRef(minimapHubRefs, hub.id, element)}
              className={`minimap-hub ${hub.kind}`}
              title={hub.name}
              style={getMinimapCircleStyle(localPlayer, hub.x, hub.z, hub.diameter)}
            />
          ))}
          {MINIMAP_ROADS.map((road) => (
            <span
              key={road.id}
              ref={(element) => setHudElementRef(minimapRoadRefs, road.id, element)}
              className={`minimap-road ${road.surface}`}
              style={getMinimapRoadStyle(localPlayer, road)}
            />
          ))}
          {MINIMAP_LANDMARKS.map((landmark) => (
            <span
              key={landmark.id}
              ref={(element) => setHudElementRef(minimapLandmarkRefs, landmark.id, element)}
              className={`map-dot landmark ${landmark.kind}`}
              title={landmark.name}
              style={getMinimapPointStyle(localPlayer, landmark.x, landmark.z)}
            />
          ))}
          <div className="minimap-ring" />
          <div className="minimap-vision-cone" />
          {Array.from(players.entries()).map(([id, player]) => (
            <span
              key={id}
              ref={(element) => setHudElementRef(minimapPlayerRefs, id, element)}
              className={id === localSessionId ? "map-dot local" : "map-dot"}
              style={{
                ...getMinimapPointStyle(localPlayer, player.x, player.z),
                backgroundColor: id === localSessionId ? MFER_COLORS.local : colorFromSeed(player.avatarSeed),
              }}
            />
          ))}
          {Array.from(npcs.values()).filter((npc) => npc.isImmortal || npc.health > 0).map((npc) => (
            <span
              key={npc.id}
              ref={(element) => setHudElementRef(minimapNpcRefs, npc.id, element)}
              className={`map-dot npc ${getNpcDisposition(npc)}`}
              title={npc.name}
              style={{
                ...getMinimapPointStyle(localPlayer, npc.x, npc.z),
              }}
            />
          ))}
        </div>
        <div className="online-row">
          <span>mfers: {playerCount}</span>
          <span>{clockLabel}</span>
        </div>
      </section>

      {isMapOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="World map">
          <div className="world-map-panel">
            <div className="world-map-header">
              <div>
                <strong>mferland</strong>
                <span>{exploredCells.size} spots seen</span>
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
              {MINIMAP_HUBS.map((hub) => (
                <span
                  key={hub.id}
                  className={`world-map-hub ${hub.kind}`}
                  title={hub.name}
                  style={getWorldMapCircleStyle(hub.x, hub.z, hub.diameter)}
                >
                  <em>{hub.name}</em>
                </span>
              ))}
              {MINIMAP_ROADS.map((road) => (
                <span
                  key={road.id}
                  className={`world-map-road ${road.surface}`}
                  style={getWorldMapRoadStyle(road)}
                />
              ))}
              {MINIMAP_LANDMARKS.map((landmark) => (
                <span
                  key={landmark.id}
                  className={`world-map-landmark ${landmark.kind}`}
                  title={landmark.name}
                  style={getWorldMapPointStyle(landmark.x, landmark.z)}
                >
                  <i />
                  <em>{landmark.label}</em>
                </span>
              ))}
              {Array.from(npcs.values()).filter((npc) => npc.isImmortal || npc.health > 0).map((npc) => (
                <span
                  key={npc.id}
                  ref={(element) => setHudElementRef(worldMapNpcRefs, npc.id, element)}
                  className={`map-dot npc ${getNpcDisposition(npc)}`}
                  title={npc.name}
                  style={getWorldMapPointStyle(npc.x, npc.z)}
                />
              ))}
              {localPlayer && (
                <span
                  ref={(element) => {
                    worldMapLocalRef.current = element;
                  }}
                  className="map-dot local"
                  style={getWorldMapPointStyle(localPlayer.x, localPlayer.z)}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {isQuestLogOpen && (
        <section className="floating-menu-overlay quest-log-anchor" role="dialog" aria-label="errand log">
          <div className="quest-log-panel">
            <div className="world-map-header">
              <div>
                <strong>errand log</strong>
                <span>{questLog.length} errands</span>
              </div>
              <button type="button" title="Close errand log" aria-label="Close errand log" onClick={() => setIsQuestLogOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="quest-log-list">
              {questLog.length > 0 ? questLog.map((quest) => (
                <Quest key={quest.id} quest={quest} full />
              )) : (
                <p className="quest-empty">no errands yet</p>
              )}
            </div>
          </div>
        </section>
      )}

      {isCharacterOpen && (
        <section className="floating-menu-overlay character-anchor" role="dialog" aria-label="Character">
          <div className="character-panel">
            <div className="world-map-header">
              <div>
                <strong>{localPlayer?.name ?? identity.name}</strong>
                <span>Level {localPlayer?.level ?? 1}</span>
              </div>
              <button type="button" title="Close character" aria-label="Close character" onClick={() => setIsCharacterOpen(false)}>
                <X size={22} />
              </button>
            </div>

            <div className="character-layout">
              <section className="character-summary">
                <div className="character-portrait" style={{ "--accent": accent } as CSSProperties}>
                  <MferPortrait traits={playerPortraitTraits} variant="full" title="your mfer portrait" />
                </div>
                <div className="character-stats">
                  {getCharacterStatRows(localPlayer).map((stat) => (
                    <div key={stat.label} className="character-stat">
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="equipment-grid">
                {EQUIPMENT_SLOT_IDS.map((slotId) => {
                  const itemId = getEquippedItemId(localPlayer, slotId);
                  const item = itemId ? ITEMS[itemId] : null;
                  const title = itemId && item
                    ? `${EQUIPMENT_SLOTS[slotId]}\n${item.name}\n${item.description}\n${formatItemStats(itemId)}\nClick to unequip`
                    : `${EQUIPMENT_SLOTS[slotId]}\nEmpty`;
                  return (
                    <button
                      key={slotId}
                      type="button"
                      className={itemId ? "menu-tile equipment-slot filled" : "menu-tile equipment-slot"}
                      data-tooltip={title}
                      aria-label={formatTooltipLabel(title)}
                      onClick={() => itemId && onUnequipItem({ slot: slotId })}
                    >
                      <span className="tile-badge">{EQUIPMENT_SLOTS[slotId]}</span>
                      {itemId ? (
                        <>
                          <ItemIcon itemId={itemId} />
                          <strong>{item?.name}</strong>
                        </>
                      ) : (
                        <>
                          <EquipmentSlotIcon slotId={slotId} />
                          <strong>{EQUIPMENT_SLOTS[slotId]}</strong>
                        </>
                      )}
                    </button>
                  );
                })}
              </section>
            </div>
          </div>
        </section>
      )}

      {isAbilitiesOpen && (
        <section className="floating-menu-overlay abilities-anchor" role="dialog" aria-label="moves">
          <div className="abilities-panel">
            <div className="world-map-header">
              <div>
                <strong>moves</strong>
                <span>moves and points</span>
              </div>
              <button type="button" title="Close moves" aria-label="Close moves" onClick={() => setIsAbilitiesOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <AbilitiesPanel
              player={localPlayer}
              actionSlots={actionSlots}
              debugUnlockAllMoves={debugToolsAvailable && settings.debugUnlockAllMoves}
              onBeginDrag={beginSlotDrag}
              onPointerMove={updateActionDrag}
              onPointerEnd={endActionDrag}
              onSelectTalent={onSelectTalent}
            />
          </div>
        </section>
      )}

      {isInventoryOpen && (
        <section className="floating-menu-overlay inventory-anchor" role="dialog" aria-label="stash">
          <div className="inventory-panel">
            <div className="world-map-header">
              <div>
                <strong>stash</strong>
                <span>{localPlayer?.inventory.length ?? 0} stacks</span>
              </div>
              <button type="button" title="Close stash" aria-label="Close stash" onClick={() => setIsInventoryOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="inventory-grid">
              {localPlayer && localPlayer.inventory.length > 0 ? localPlayer.inventory.map((item) => {
                const equipment = getItemEquipment(item.id);
                const consumable = getItemConsumable(item.id);
                const comparison = getItemComparison(item, localPlayer);
                const isEquipped = isInventoryItemEquipped(localPlayer, item);
                const title = getInventoryItemTitle(item, localPlayer, comparison);
                const content = (
                  <>
                    <ItemIcon itemId={item.id} />
                    <strong>{ITEMS[item.id].name}</strong>
                    <span className="tile-count">{item.count > 1 ? `x${item.count}` : ""}</span>
                    {isEquipped && <span className="tile-state">On</span>}
                  </>
                );

                return equipment ? (
                  <button
                    key={getInventoryItemKey(item.id, item.chainTokenId)}
                    type="button"
                    className={isEquipped ? "menu-tile inventory-slot equipped" : "menu-tile inventory-slot"}
                    data-tooltip={title}
                    aria-label={formatTooltipLabel(title)}
                    onClick={() => onEquipItem({ itemId: item.id, chainTokenId: item.chainTokenId })}
                  >
                    {content}
                  </button>
                ) : consumable ? (
                  <button
                    key={getInventoryItemKey(item.id, item.chainTokenId)}
                    type="button"
                    className="menu-tile inventory-slot consumable"
                    data-tooltip={title}
                    aria-label={formatTooltipLabel(title)}
                    onPointerDown={(event) => beginSlotDrag(makeItemActionSlot(item.id, item.chainTokenId), event)}
                    onPointerMove={updateActionDrag}
                    onPointerUp={endActionDrag}
                    onPointerCancel={endActionDrag}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={getInventoryItemKey(item.id, item.chainTokenId)}
                    className="menu-tile inventory-slot"
                    data-tooltip={title}
                    aria-label={formatTooltipLabel(title)}
                  >
                    {content}
                  </div>
                );
              }) : (
                <p className="quest-empty">stash is empty</p>
              )}
            </div>
          </div>
        </section>
      )}

      {isSettingsOpen && (
        <section className="floating-menu-overlay settings-anchor" role="dialog" aria-label="Settings">
          <SettingsPanel
            settings={settings}
            debugToolsAvailable={debugToolsAvailable}
            onChange={onSettingsChange}
            onClose={() => setIsSettingsOpen(false)}
          />
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
            ref={chatInputRef}
            value={draft}
            maxLength={CHAT.maxLength}
            placeholder="post to plaza..."
            onKeyDown={handleChatKeyDown}
            onChange={(event) => setDraft(event.target.value)}
          />
        </form>
      </section>

      <section className="hotbar">
        {actionSlots.map((slot, index) => (
          <ActionSlotButton
            key={index}
            actionId={slot}
            index={index}
            isDragging={dragState?.fromIndex === index && dragState.isDragging}
            isDropTarget={dropSlot === index && (dragState?.isDragging === true || Boolean(carriedSlot))}
            localPlayer={localPlayer}
            selectedTarget={selectedTarget}
            selectedTargetUnit={selectedTargetUnit}
            now={now}
            debugUnlockAllMoves={debugToolsAvailable && settings.debugUnlockAllMoves}
            onAction={onAction}
            onPointerStart={beginActionDrag}
            onPointerMove={updateActionDrag}
            onPointerEnd={endActionDrag}
          />
        ))}
      </section>

      {(dragState?.isDragging ? dragState.slot : carriedSlot) && (
        <ActionSlotGhost
          slot={(dragState?.isDragging ? dragState.slot : carriedSlot) as NonNullable<ActionSlot>}
          x={dragState?.isDragging ? dragState.x : cursorPosition.x}
          y={dragState?.isDragging ? dragState.y : cursorPosition.y}
        />
      )}

      <section className="menu-dock">
        <button type="button" title="Character (C)" onClick={() => setIsCharacterOpen((open) => !open)}>
          <UserRound size={25} />
          <span>Character</span>
          {(localPlayer?.talentPoints ?? 0) > 0 && <em className="dock-badge">{localPlayer?.talentPoints}</em>}
        </button>
        <button type="button" title="stash (B/I)" onClick={() => setIsInventoryOpen((open) => !open)}>
          <Package size={25} />
          <span>stash</span>
        </button>
        <button type="button" title="moves (N)" onClick={() => setIsAbilitiesOpen((open) => !open)}>
          <Sparkles size={25} />
          <span>moves</span>
        </button>
        <button type="button" title="errand log (L)" onClick={() => setIsQuestLogOpen((open) => !open)}>
          <BookOpen size={25} />
          <span>errands</span>
        </button>
        <button type="button" title="Settings" onClick={() => setIsSettingsOpen((open) => !open)}>
          <Settings size={25} />
          <span>Settings</span>
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

      {actionError && <HudErrorText key={actionError.id} text={actionError.text} />}
      {moveUnlockNotice && <MoveUnlockToast key={moveUnlockNotice.id} notice={moveUnlockNotice} />}
      {tooltip && <HudTooltip tooltip={tooltip} />}
    </div>
  );
}

function SettingsPanel({
  settings,
  debugToolsAvailable,
  onChange,
  onClose,
}: {
  settings: GameSettings;
  debugToolsAvailable: boolean;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}) {
  function updateDebugSetting(key: "debugPlacementEditor" | "debugTravelPanel" | "debugUnlockAllMoves", value: boolean) {
    onChange({ ...settings, [key]: value });
  }

  function updateAudioSetting(key: keyof AudioSettings, value: boolean | number) {
    onChange({
      ...settings,
      audio: {
        ...settings.audio,
        [key]: value,
      },
    });
  }

  function updateNameplateSetting(key: keyof NameplateVisibility, value: boolean) {
    onChange({
      ...settings,
      nameplates: {
        ...settings.nameplates,
        [key]: value,
      },
    });
  }

  return (
    <div className="settings-panel">
      <div className="world-map-header">
        <div>
          <strong>Settings</strong>
          <span>Display and debug</span>
        </div>
        <button type="button" title="Close settings" aria-label="Close settings" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <section className="settings-section">
        <strong>Audio</strong>
        <SettingsToggle
          label="Sound effects"
          checked={settings.audio.enabled}
          onChange={(checked) => updateAudioSetting("enabled", checked)}
        />
        <SettingsSlider
          label="Volume"
          value={settings.audio.volume}
          min={0}
          max={1}
          step={0.05}
          disabled={!settings.audio.enabled}
          onChange={(value) => updateAudioSetting("volume", value)}
        />
      </section>

      {debugToolsAvailable && (
        <section className="settings-section">
          <strong>Debug</strong>
          <SettingsToggle
            label="Placement editor"
            checked={settings.debugPlacementEditor}
            onChange={(checked) => updateDebugSetting("debugPlacementEditor", checked)}
          />
          <SettingsToggle
            label="Teleport panel"
            checked={settings.debugTravelPanel}
            onChange={(checked) => updateDebugSetting("debugTravelPanel", checked)}
          />
          <SettingsToggle
            label="Unlock all moves"
            checked={settings.debugUnlockAllMoves}
            onChange={(checked) => updateDebugSetting("debugUnlockAllMoves", checked)}
          />
        </section>
      )}

      <section className="settings-section">
        <strong>Nameplates</strong>
        <SettingsToggle
          label="Player"
          checked={settings.nameplates.localPlayer}
          onChange={(checked) => updateNameplateSetting("localPlayer", checked)}
        />
        <SettingsToggle
          label="Other players"
          checked={settings.nameplates.otherPlayers}
          onChange={(checked) => updateNameplateSetting("otherPlayers", checked)}
        />
        <SettingsToggle
          label="Friendly NPCs"
          checked={settings.nameplates.friendlyNpcs}
          onChange={(checked) => updateNameplateSetting("friendlyNpcs", checked)}
        />
        <SettingsToggle
          label="Unfriendly NPCs"
          checked={settings.nameplates.unfriendlyNpcs}
          onChange={(checked) => updateNameplateSetting("unfriendlyNpcs", checked)}
        />
      </section>
    </div>
  );
}

function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function SettingsSlider({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={disabled ? "settings-slider-row disabled" : "settings-slider-row"}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{Math.round(value * 100)}</strong>
    </label>
  );
}

function HudErrorText({ text }: { text: string }) {
  return (
    <div className="hud-error-text" role="status" aria-live="polite">
      {text}
    </div>
  );
}

function CastBar({
  actionId,
  startedAt,
  endsAt,
}: {
  actionId: CombatActionId;
  startedAt: number;
  endsAt: number;
}) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const duration = Math.max(1, endsAt - startedAt);

  useEffect(() => {
    let frameId = 0;
    let lastProgress = -1;

    const update = () => {
      const progress = Math.max(0, Math.min(1, (Date.now() - startedAt) / duration));
      if (fillRef.current && Math.abs(progress - lastProgress) > 0.001) {
        fillRef.current.style.transform = `scaleX(${progress})`;
        lastProgress = progress;
      }
      if (progress < 1) {
        frameId = window.requestAnimationFrame(update);
      }
    };

    update();
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, endsAt, startedAt]);

  return (
    <section className="cast-bar" aria-label={`${getActionMeta(actionId)?.label ?? "Cast"} casting`}>
      <strong>{getActionMeta(actionId)?.label}</strong>
      <div>
        <span ref={fillRef} />
      </div>
    </section>
  );
}

function HudTooltip({ tooltip }: { tooltip: HudTooltipState }) {
  const [title, ...lines] = tooltip.text.split("\n").filter(Boolean);
  return (
    <div className="hud-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <strong>{title}</strong>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className={getTooltipLineClass(line)}>{line}</span>
      ))}
    </div>
  );
}

function MoveUnlockToast({ notice }: { notice: MoveUnlockNotice }) {
  const meta = getActionMeta(notice.actionId);
  const location = notice.buttonIndex === null
    ? "Open moves to place it on a button"
    : `Button ${notice.buttonIndex + 1}`;

  return (
    <section className="move-unlock-toast" aria-label={`${meta?.label ?? "Move"} unlocked`}>
      <AbilityIcon actionId={notice.actionId} />
      <span>
        <strong>{meta?.label ?? "Move"} unlocked</strong>
        <em>Level {notice.level} / {location}</em>
      </span>
    </section>
  );
}

function getTooltipLineClass(line: string) {
  const normalized = line.toLowerCase();
  if (normalized.includes("status:") || normalized.includes("locked") || normalized.includes("unlock") || normalized.includes("out of range") || normalized.includes("requires")) return "tooltip-line status";
  if (normalized.includes("cooldown") || normalized.includes("ready in") || normalized.includes("stand still") || normalized.includes("casting")) return "tooltip-line timing";
  if (normalized.includes("mp") || normalized.includes("mana")) return "tooltip-line resource";
  if (normalized.includes("damage") || normalized.includes("healing") || normalized.includes("restores")) return "tooltip-line effect";
  if (normalized.includes("threat") || normalized.includes("forces") || normalized.includes("freezes") || normalized.includes("slows")) return "tooltip-line control";
  if (normalized.includes("range") || /\d+(\.\d+)?-\d+(\.\d+)?m/.test(normalized) || /\d+(\.\d+)?m/.test(normalized)) return "tooltip-line range";
  return "tooltip-line";
}

function isChatShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest("button,a,select,[role='button']");
}

function getTooltipElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-tooltip]");
}

function getTooltipPosition(clientX: number, clientY: number) {
  return {
    x: Math.max(TOOLTIP_OFFSET, Math.min(clientX + TOOLTIP_OFFSET, window.innerWidth - TOOLTIP_MAX_WIDTH - TOOLTIP_OFFSET)),
    y: Math.max(TOOLTIP_OFFSET, Math.min(clientY + TOOLTIP_OFFSET, window.innerHeight - TOOLTIP_MAX_HEIGHT - TOOLTIP_OFFSET)),
  };
}

function setHudElementRef(
  ref: { current: Map<string, HTMLElement> },
  id: string,
  element: HTMLElement | null,
) {
  if (element) ref.current.set(id, element);
  else ref.current.delete(id);
}

function applyHudPositionStyle(element: HTMLElement | null | undefined, style: CSSProperties) {
  if (!element) return;
  setCssProperty(element, "left", style.left);
  setCssProperty(element, "top", style.top);
  setCssProperty(element, "width", style.width);
  setCssProperty(element, "height", style.height);
  setCssProperty(element, "transform", style.transform);
}

function setCssProperty(element: HTMLElement, property: string, value: CSSProperties[keyof CSSProperties]) {
  if (value === undefined || value === null) return;
  const next = String(value);
  if (element.style.getPropertyValue(property) !== next) {
    element.style.setProperty(property, next);
  }
}

function getHudTickDelay(player: PlayerSnapshot | null, actionSlots: ActionSlot[], now: number) {
  if (player && actionSlots.some((actionId) => isCoolingDown(player, actionId, now))) return HUD_TICK_MS;

  const msToNextMinute = 60000 - (now % 60000);
  return Math.max(IDLE_HUD_TICK_MIN_MS, msToNextMinute + 50);
}

function isCoolingDown(player: PlayerSnapshot, actionId: ActionSlot, now: number) {
  if (!actionId || actionId === "interact" || isItemActionSlot(actionId)) return false;
  return getActionReadyAt(player, actionId as CombatActionId) > now;
}

function ActionSlotGhost({
  slot,
  x,
  y,
}: {
  slot: NonNullable<ActionSlot>;
  x: number;
  y: number;
}) {
  return (
    <div className="action-drag-ghost" style={{ left: x, top: y }}>
      <SlotIcon slot={slot} />
      <strong>{getSlotLabel(slot)}</strong>
    </div>
  );
}

function SlotIcon({ slot }: { slot: NonNullable<ActionSlot> }) {
  if (isItemActionSlot(slot)) return <ItemIcon itemId={slot.itemId} />;
  return <AbilityIcon actionId={slot} />;
}

function getSlotLabel(slot: ActionSlot) {
  if (!slot) return "Empty";
  if (isItemActionSlot(slot)) return ITEMS[slot.itemId]?.name ?? "Item";
  return getActionMeta(slot)?.label ?? "Ability";
}

function QuestOfferPanel({
  offer,
  onAccept,
  onDismiss,
}: {
  offer: QuestOffer;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="quest-dialogue-panel offer" role="dialog" aria-label={`Quest offer: ${offer.title}`} data-testid="quest-offer-panel">
      <button className="quest-offer-close" type="button" title="Dismiss" aria-label="Dismiss quest offer" onClick={onDismiss}>
        <X size={17} />
      </button>
      <div className="quest-dialogue-heading">
        <span>{offer.npcName}</span>
        <strong>{offer.title}</strong>
      </div>
      <p>{offer.storyText}</p>
      <div className="quest-dialogue-detail">
        <ListChecks size={17} />
        <span>
          <b>job</b>
          <em>{offer.objectiveLabel}: 0/{offer.required}</em>
        </span>
      </div>
      <QuestRewardList rewards={offer.rewardPreview} />
      <div className="quest-dialogue-actions">
        <button className="quest-secondary-btn" type="button" onClick={onDismiss} data-testid="quest-deny-button">
          nah
        </button>
        <button className="quest-accept-btn" type="button" onClick={onAccept} data-testid="quest-accept-button">
          <Check size={17} />
          i'm in
        </button>
      </div>
    </section>
  );
}

function QuestTurnInPanel({
  turnIn,
  onComplete,
  onDismiss,
}: {
  turnIn: QuestTurnIn;
  onComplete: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="quest-dialogue-panel turn-in" role="dialog" aria-label={`Quest turn-in: ${turnIn.title}`} data-testid="quest-turn-in-panel">
      <button className="quest-offer-close" type="button" title="Close" aria-label="Close quest turn-in" onClick={onDismiss}>
        <X size={17} />
      </button>
      <div className="quest-dialogue-heading">
        <span>{turnIn.npcName}</span>
        <strong>{turnIn.title}</strong>
      </div>
      <p>{turnIn.completionText}</p>
      <div className="quest-dialogue-detail">
        <ListChecks size={17} />
        <span>
          <b>handled</b>
          <em>{turnIn.completedTaskSummary}</em>
        </span>
      </div>
      <QuestRewardList rewards={turnIn.rewardPreview} />
      <div className="quest-dialogue-actions">
        <button className="quest-secondary-btn" type="button" onClick={onDismiss} data-testid="quest-close-button">
          Close
        </button>
        <button className="quest-accept-btn" type="button" onClick={onComplete} data-testid="quest-complete-button">
          <Check size={17} />
          done
        </button>
      </div>
    </section>
  );
}

function QuestStatusPanel({
  notice,
  onDismiss,
}: {
  notice: QuestStatusNotice;
  onDismiss: () => void;
}) {
  return (
    <section className="quest-dialogue-panel status" role="dialog" aria-label={`Quest status: ${notice.title}`} data-testid="quest-status-panel">
      <button className="quest-offer-close" type="button" title="Close" aria-label="Close quest status" onClick={onDismiss}>
        <X size={17} />
      </button>
      <div className="quest-dialogue-heading">
        <span>{notice.npcName}</span>
        <strong>{notice.title}</strong>
      </div>
      <p>{notice.statusText}</p>
      <div className="quest-dialogue-detail">
        <ListChecks size={17} />
        <span>
          <b>job</b>
          <em>{notice.objectiveLabel}: {notice.progress}/{notice.required}</em>
        </span>
      </div>
      <QuestRewardList rewards={notice.rewardPreview} />
      <div className="quest-dialogue-actions">
        <button className="quest-secondary-btn" type="button" onClick={onDismiss} data-testid="quest-status-close-button">
          Close
        </button>
      </div>
    </section>
  );
}

function QuestRewardList({ rewards }: { rewards: string[] }) {
  return (
    <div className="quest-dialogue-rewards">
      <Gift size={17} />
      <span>
        <b>loot</b>
        <em>{rewards.length > 0 ? rewards.join(" / ") : "town standing"}</em>
      </span>
    </div>
  );
}

function getCharacterStatRows(player: PlayerSnapshot | null) {
  const progress = getLevelProgress(player?.xp ?? 0);
  return [
    {
      label: "HP",
      value: `${Math.ceil(player?.health ?? 0)}/${Math.ceil(player?.maxHealth ?? 0)}`,
    },
    {
      label: "MP",
      value: `${Math.floor(player?.mana ?? 0)}/${Math.ceil(player?.maxMana ?? 0)}`,
    },
    {
      label: "STR",
      value: String(player?.strength ?? 0),
    },
    {
      label: "DEX",
      value: String(player?.dexterity ?? 0),
    },
    {
      label: "MAG",
      value: String(player?.magic ?? 0),
    },
    {
      label: "Speed",
      value: `${formatStatNumber(player?.walkSpeed ?? 0)} / ${formatStatNumber(player?.runSpeed ?? 0)}`,
    },
    {
      label: "HP Regen",
      value: `${formatStatNumber(player?.healthRegenPer5 ?? 0)} / 5s`,
    },
    {
      label: "MP Regen",
      value: `${formatStatNumber(player?.manaRegenPer5 ?? 0)} / 5s`,
    },
    {
      label: "XP",
      value: progress.isMaxLevel ? `${progress.totalXp} / cap` : `${progress.current}/${progress.required}`,
    },
  ];
}

function formatStatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getEquippedSlot(player: PlayerSnapshot | null, slotId: EquipmentSlotId) {
  return player?.equipment.find((slot) => slot.slot === slotId) ?? null;
}

function getEquippedItemId(player: PlayerSnapshot | null, slotId: EquipmentSlotId): ItemId | "" {
  return getEquippedSlot(player, slotId)?.itemId ?? "";
}

function isInventoryItemEquipped(player: PlayerSnapshot | null, item: InventoryItemSnapshot) {
  const equipment = getItemEquipment(item.id);
  if (!equipment) return false;

  const equipped = getEquippedSlot(player, equipment.slot);
  return equipped?.itemId === item.id && equipped.chainTokenId === item.chainTokenId;
}

function formatItemStats(itemId: ItemId) {
  const equipment = getItemEquipment(itemId);
  if (!equipment) return "";

  const statKeys = Object.keys(equipment.stats) as Array<keyof typeof STAT_LABELS>;
  if (statKeys.length === 0) return "No bonuses";

  return statKeys
    .map((statKey) => {
      const value = equipment.stats[statKey] ?? 0;
      const sign = value > 0 ? "+" : "";
      return `${sign}${value} ${STAT_LABELS[statKey]}`;
    })
    .join(", ");
}

function formatConsumableEffect(itemId: ItemId) {
  const consumable = getItemConsumable(itemId);
  if (!consumable) return "";

  const effects = [
    consumable.health ? `+${consumable.health} HP` : "",
    consumable.mana ? `+${consumable.mana} MP` : "",
  ].filter(Boolean);
  return effects.join(", ");
}

function getInventoryItemTitle(
  item: InventoryItemSnapshot,
  player: PlayerSnapshot | null,
  comparison: ReturnType<typeof getItemComparison>,
) {
  const definition = ITEMS[item.id];
  const equipment = getItemEquipment(item.id);
  const consumable = getItemConsumable(item.id);
  const equipped = isInventoryItemEquipped(player, item);
  return [
    definition.name,
    definition.description,
    item.count > 1 ? `Count: ${item.count}` : "",
    equipment ? `${equipment.build} / ${EQUIPMENT_SLOTS[equipment.slot]}` : "",
    equipment ? formatItemStats(item.id) : "",
    consumable ? formatConsumableEffect(item.id) : "",
    comparison?.text ?? "",
    equipped ? "Currently equipped" : equipment ? "Click to equip" : consumable ? "Click to use, drag to hotbar" : "",
  ].filter(Boolean).join("\n");
}

function getLootItemTitle(item: { id: ItemId; count: number }) {
  const definition = ITEMS[item.id];
  const equipment = getItemEquipment(item.id);
  const consumable = getItemConsumable(item.id);
  return [
    definition.name,
    definition.description,
    item.count > 1 ? `Count: ${item.count}` : "",
    equipment ? `${equipment.build} / ${EQUIPMENT_SLOTS[equipment.slot]}` : "",
    equipment ? formatItemStats(item.id) : "",
    consumable ? formatConsumableEffect(item.id) : "",
    "Click to loot",
  ].filter(Boolean).join("\n");
}

function getItemComparison(item: InventoryItemSnapshot, player: PlayerSnapshot | null) {
  const equipment = getItemEquipment(item.id);
  if (!equipment) return null;

  const equipped = getEquippedSlot(player, equipment.slot);
  if (equipped?.itemId === item.id && equipped.chainTokenId === item.chainTokenId) {
    return { text: "Currently equipped", tone: "neutral" as const };
  }

  const equippedItem = equipped?.itemId ? ITEMS[equipped.itemId] : null;
  const equippedStats = equipped?.itemId ? getItemEquipment(equipped.itemId)?.stats ?? {} : {};
  const statKeys = Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>;
  const deltas = statKeys
    .map((statKey) => ({
      statKey,
      delta: (equipment.stats[statKey] ?? 0) - (equippedStats[statKey] ?? 0),
    }))
    .filter(({ delta }) => delta !== 0);

  if (deltas.length === 0) {
    return {
      text: equippedItem ? `No stat change vs ${equippedItem.name}` : "No stat bonuses",
      tone: "neutral" as const,
    };
  }

  const totalDelta = deltas.reduce((sum, itemDelta) => sum + itemDelta.delta, 0);
  const text = deltas
    .map(({ statKey, delta }) => `${delta > 0 ? "+" : ""}${delta} ${STAT_LABELS[statKey]}`)
    .join(", ");

  return {
    text: equippedItem ? `${text} vs ${equippedItem.name}` : text,
    tone: totalDelta > 0 ? "positive" as const : totalDelta < 0 ? "negative" as const : "neutral" as const,
  };
}

import { type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BadgePlus, BookOpen, Brain, Check, Dumbbell, Footprints, Gift, ListChecks, LogOut, Map as MapIcon, Package, UserRound, X } from "lucide-react";
import {
  CHAT,
  EQUIPMENT_SLOT_IDS,
  EQUIPMENT_SLOTS,
  ITEMS,
  PROGRESSION,
  STAT_LABELS,
  TALENTS,
  TALENT_IDS,
  TALENT_TREES,
  TALENT_TREE_IDS,
  getLevelProgress,
  getInventoryItemKey,
  getItemEquipment,
  getNpcDisposition,
  getTalentPointsSpent,
  getTalentRank,
  getTalentRankStatus,
  type ActionId,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientEquipItem,
  type ClientLootCorpse,
  type ClientSelectTalent,
  type ClientUnequipItem,
  type EquipmentSlotId,
  type InventoryItemSnapshot,
  type ItemId,
  type LootWindow,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestOffer,
  type QuestStatusNotice,
  type QuestTurnIn,
  type TalentId,
  type TalentTreeId,
  type TargetSelection,
} from "@mferland/shared";
import { colorFromSeed } from "../game/random";
import { ActionSlotButton, getActionMeta } from "./hud/ActionSlotButton";
import { ItemIcon } from "./hud/ItemIcon";
import { Quest } from "./hud/Quest";
import { TargetFrame } from "./hud/TargetFrame";
import type { ActionSlot, DragState } from "./hud/types";
import {
  MINIMAP_HUBS,
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
  questTurnIn: QuestTurnIn | null;
  questStatus: QuestStatusNotice | null;
  lootWindow: LootWindow | null;
  actionSlots: ActionSlot[];
  onAction: (actionId: ActionId) => void;
  onMoveActionSlot: (fromIndex: number, toIndex: number) => void;
  onAcceptQuest: (message: ClientAcceptQuest) => void;
  onCompleteQuest: (message: ClientCompleteQuest) => void;
  onDismissQuestOffer: () => void;
  onDismissQuestTurnIn: () => void;
  onDismissQuestStatus: () => void;
  onLootCorpse: (message: ClientLootCorpse) => void;
  onEquipItem: (message: ClientEquipItem) => void;
  onUnequipItem: (message: ClientUnequipItem) => void;
  onSelectTalent: (message: ClientSelectTalent) => void;
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
  questTurnIn,
  questStatus,
  lootWindow,
  actionSlots,
  onAction,
  onMoveActionSlot,
  onAcceptQuest,
  onCompleteQuest,
  onDismissQuestOffer,
  onDismissQuestTurnIn,
  onDismissQuestStatus,
  onLootCorpse,
  onEquipItem,
  onUnequipItem,
  onSelectTalent,
  onCloseLootWindow,
  onSendChat,
  onRespawn,
  onExit,
}: HudProps) {
  const [draft, setDraft] = useState("");
  const dragStateRef = useRef<DragState | null>(null);
  const [dragState, setDragStateState] = useState<DragState | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isQuestLogOpen, setIsQuestLogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isCharacterOpen, setIsCharacterOpen] = useState(false);
  const [exploredCells, setExploredCells] = useState<Set<string>>(() => new Set());
  const accent = useMemo(() => colorFromSeed(identity.avatarSeed), [identity.avatarSeed]);
  const questLog = useMemo(() => localPlayer?.quests ?? [], [localPlayer?.quests]);
  const levelProgress = useMemo(() => getLevelProgress(localPlayer?.xp ?? 0), [localPlayer?.xp]);
  const trackedQuests = useMemo(
    () => questLog.filter((quest) => quest.status !== "completed").slice(0, 2),
    [questLog],
  );
  const hasTrackedQuests = trackedQuests.length > 0;
  const equippableInventory = localPlayer?.inventory.filter((item) => getItemEquipment(item.id)) ?? [];

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
      if (event.repeat) return;
      if (event.key === "Enter" && !isTypingTarget(event.target) && isChatShortcutTarget(event.target)) {
        event.preventDefault();
        chatInputRef.current?.focus();
        return;
      }
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "m" && key !== "c") return;
      event.preventDefault();
      if (key === "m") setIsMapOpen((open) => !open);
      else setIsCharacterOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
          <div className="player-name-row">
            <strong>{localPlayer?.name ?? identity.name}</strong>
            <span>Lv {localPlayer?.level ?? 1}</span>
          </div>
          <div className="bar hp">
            <span style={{ width: `${percent(localPlayer?.health ?? 100, localPlayer?.maxHealth ?? 100)}%` }} />
            {Math.ceil(localPlayer?.health ?? 100)}/{Math.ceil(localPlayer?.maxHealth ?? 100)}
          </div>
          <div className="bar mp">
            <span style={{ width: `${percent(localPlayer?.mana ?? 50, localPlayer?.maxMana ?? 50)}%` }} />
            {Math.floor(localPlayer?.mana ?? 50)}/{Math.ceil(localPlayer?.maxMana ?? 50)}
          </div>
          <div className="bar xp">
            <span style={{ width: `${levelProgress.isMaxLevel ? 100 : percent(levelProgress.current, levelProgress.required)}%` }} />
            {levelProgress.isMaxLevel ? "Level cap" : `${levelProgress.current}/${levelProgress.required} XP`}
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

      <section className={hasTrackedQuests ? "quest-panel" : "quest-panel compact"}>
        <div className="quest-panel-header">
          <h2>{hasTrackedQuests ? "Quest Tracker" : "Quests"}</h2>
          <button type="button" title="Quest log" aria-label="Open quest log" onClick={() => setIsQuestLogOpen(true)}>
            <BookOpen size={17} />
          </button>
        </div>
        {hasTrackedQuests ? trackedQuests.map((quest) => (
          <Quest key={quest.id} quest={quest} />
        )) : (
          <p className="quest-empty">No active quests</p>
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
          {MINIMAP_HUBS.map((hub) => (
            <span
              key={hub.id}
              className={`minimap-hub ${hub.kind}`}
              title={hub.name}
              style={getMinimapCircleStyle(localPlayer, hub.x, hub.z, hub.diameter)}
            />
          ))}
          {MINIMAP_ROADS.map((road) => (
            <span
              key={road.id}
              className={`minimap-road ${road.surface}`}
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
                <strong>Mferland</strong>
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

      {isCharacterOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="Character">
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
                  <span>mf</span>
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
                  return (
                    <button
                      key={slotId}
                      type="button"
                      className={itemId ? "equipment-slot filled" : "equipment-slot"}
                      title={itemId ? `Unequip ${item?.name}` : EQUIPMENT_SLOTS[slotId]}
                      onClick={() => itemId && onUnequipItem({ slot: slotId })}
                    >
                      <span>{EQUIPMENT_SLOTS[slotId]}</span>
                      {itemId ? (
                        <>
                          <ItemIcon itemId={itemId} />
                          <strong>{item?.name}</strong>
                          <em>{formatItemStats(itemId)}</em>
                        </>
                      ) : (
                        <strong>Empty</strong>
                      )}
                    </button>
                  );
                })}
              </section>

              <section className="character-side-stack">
                <TalentPanel player={localPlayer} onSelectTalent={onSelectTalent} />

                <section className="gear-list">
                  {equippableInventory.length > 0 ? equippableInventory.map((item) => {
                    const equipment = getItemEquipment(item.id);
                    const comparison = getItemComparison(item, localPlayer);
                    const isEquipped = equipment ? isInventoryItemEquipped(localPlayer, item) : false;
                    return (
                      <button
                        key={getInventoryItemKey(item.id, item.chainTokenId)}
                        type="button"
                        className={isEquipped ? "gear-row equipped" : "gear-row"}
                        onClick={() => onEquipItem({ itemId: item.id, chainTokenId: item.chainTokenId })}
                      >
                        <ItemIcon itemId={item.id} />
                        <span>
                          <strong>{ITEMS[item.id].name}</strong>
                          {equipment && <em>{equipment.build} / {EQUIPMENT_SLOTS[equipment.slot]}</em>}
                          <small>{formatItemStats(item.id)}</small>
                          {comparison && (
                            <small className={`gear-compare ${comparison.tone}`}>{comparison.text}</small>
                          )}
                        </span>
                        <b>{isEquipped ? "Equipped" : "Equip"}</b>
                      </button>
                    );
                  }) : (
                    <p className="quest-empty">No gear in inventory</p>
                  )}
                </section>
              </section>
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
              {localPlayer && localPlayer.inventory.length > 0 ? localPlayer.inventory.map((item) => {
                const equipment = getItemEquipment(item.id);
                const comparison = getItemComparison(item, localPlayer);
                const isEquipped = isInventoryItemEquipped(localPlayer, item);
                const content = (
                  <>
                    <ItemIcon itemId={item.id} />
                    <strong>{ITEMS[item.id].name}</strong>
                    <em>{equipment ? EQUIPMENT_SLOTS[equipment.slot] : `x${item.count}`}</em>
                    {equipment && <small>{formatItemStats(item.id)}</small>}
                    {comparison && <small className={`gear-compare ${comparison.tone}`}>{comparison.text}</small>}
                  </>
                );

                return equipment ? (
                  <button
                    key={getInventoryItemKey(item.id, item.chainTokenId)}
                    type="button"
                    className={isEquipped ? "inventory-slot equipped" : "inventory-slot"}
                    title={ITEMS[item.id].description}
                    onClick={() => onEquipItem({ itemId: item.id, chainTokenId: item.chainTokenId })}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={getInventoryItemKey(item.id, item.chainTokenId)}
                    className="inventory-slot"
                    title={ITEMS[item.id].description}
                  >
                    {content}
                  </div>
                );
              }) : (
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
            ref={chatInputRef}
            value={draft}
            maxLength={CHAT.maxLength}
            placeholder="Say gm..."
            onKeyDown={handleChatKeyDown}
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
        <button type="button" title="Character" onClick={() => setIsCharacterOpen(true)}>
          <UserRound size={25} />
          <span>Character</span>
          {(localPlayer?.talentPoints ?? 0) > 0 && <em className="dock-badge">{localPlayer?.talentPoints}</em>}
        </button>
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

function isChatShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest("button,a,select,[role='button']");
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
          <b>Objective</b>
          <em>{offer.objectiveLabel}: 0/{offer.required}</em>
        </span>
      </div>
      <QuestRewardList rewards={offer.rewardPreview} />
      <div className="quest-dialogue-actions">
        <button className="quest-secondary-btn" type="button" onClick={onDismiss} data-testid="quest-deny-button">
          Deny
        </button>
        <button className="quest-accept-btn" type="button" onClick={onAccept} data-testid="quest-accept-button">
          <Check size={17} />
          Accept
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
          <b>Completed</b>
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
          Complete
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
          <b>Objective</b>
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
        <b>Rewards</b>
        <em>{rewards.length > 0 ? rewards.join(" / ") : "Town standing"}</em>
      </span>
    </div>
  );
}

function TalentPanel({
  player,
  onSelectTalent,
}: {
  player: PlayerSnapshot | null;
  onSelectTalent: (message: ClientSelectTalent) => void;
}) {
  const talents = player?.talents ?? [];
  const points = player?.talentPoints ?? 0;
  const spent = getTalentPointsSpent(talents);

  return (
    <section className="talent-panel">
      <div className="talent-panel-header">
        <span>
          <strong>Talents</strong>
          <em>{points} points / {spent} spent</em>
        </span>
      </div>

      <div className="talent-trees">
        {TALENT_TREE_IDS.map((treeId) => {
          const Icon = getTalentTreeIcon(treeId);
          return (
            <section key={treeId} className={`talent-tree ${treeId}`}>
              <div className="talent-tree-heading">
                <Icon size={16} />
                <span>
                  <strong>{TALENT_TREES[treeId].label}</strong>
                  <em>{TALENT_TREES[treeId].description}</em>
                </span>
              </div>
              <div className="talent-node-list">
                {TALENT_IDS.filter((talentId) => TALENTS[talentId].tree === treeId).map((talentId) => (
                  <TalentRow
                    key={talentId}
                    talentId={talentId}
                    player={player}
                    onSelectTalent={onSelectTalent}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TalentRow({
  talentId,
  player,
  onSelectTalent,
}: {
  talentId: TalentId;
  player: PlayerSnapshot | null;
  onSelectTalent: (message: ClientSelectTalent) => void;
}) {
  const definition = TALENTS[talentId];
  const talents = player?.talents ?? [];
  const status = getTalentRankStatus(talents, player?.level ?? 1, player?.talentPoints ?? 0, talentId);
  const rank = getTalentRank(talents, talentId);
  const className = [
    "talent-row",
    rank > 0 ? "learned" : "",
    status.canRank ? "available" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      disabled={!status.canRank}
      title={status.canRank ? definition.name : status.reason}
      onClick={() => onSelectTalent({ talentId })}
    >
      <span className="talent-copy">
        <strong>{definition.name}</strong>
        <em>{definition.effectText}</em>
        <small>{definition.description}</small>
      </span>
      <span className="talent-rank">
        {renderTalentPips(rank, definition.maxRank)}
        <b>{rank}/{definition.maxRank}</b>
      </span>
      <span className="talent-action">
        <BadgePlus size={14} />
        {status.canRank ? "Rank" : status.reason}
      </span>
    </button>
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
    {
      label: "Total XP",
      value: String(progress.totalXp),
    },
    {
      label: "Talent Points",
      value: String(player?.talentPoints ?? 0),
    },
    {
      label: "Level Cap",
      value: String(PROGRESSION.levelCap),
    },
  ];
}

function getTalentTreeIcon(treeId: TalentTreeId) {
  if (treeId === "brawler") return Dumbbell;
  if (treeId === "caster") return Brain;
  return Footprints;
}

function renderTalentPips(rank: number, maxRank: number) {
  return Array.from({ length: maxRank }, (_, index) => (
    <i key={index} className={index < rank ? "filled" : ""} />
  ));
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

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Gem, LogOut, MapPin, Sparkles, UserRound } from "lucide-react";
import * as THREE from "three";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  COMBAT,
  ITEMS,
  getInventoryItemKey,
  getItemConsumable,
  getNpcDisposition,
  isAttackableNpcRole,
  isCombatActionUnlocked,
  type ActionId,
  type CombatActionId,
  type JoinOptions,
  type ItemId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { makeGuestIdentity, makeWalletIdentity, getStoredName, rememberName } from "./auth/identity";
import { useTownRoom } from "./game/useTownRoom";
import { TownScene } from "./game/TownScene";
import { Skybox, TownWorld } from "./game/scene/TownWorld";
import { Hud } from "./components/Hud";
import { getActionSlotKey, type ActionSlot, type ItemActionSlot, isItemActionSlot, makeItemActionSlot } from "./components/hud/types";

const ACTION_SLOT_COUNT = 8;
const DEFAULT_ACTION_SLOTS: ActionSlot[] = ["interact", "attack", "shoot", "signalShot", "fireblast", "frostNova", "heal", "taunt"];
const ACTION_SLOT_STORAGE_KEY = "mferland:actionSlots:v3";
const DEBUG_TRAVEL_DESTINATIONS = [
  { id: "gate", label: "Gate", x: 0, z: -10, yaw: Math.PI },
  { id: "plaza", label: "Plaza", x: 0, z: -8, yaw: 0 },
  { id: "market", label: "Market", x: 0, z: 22, yaw: 0 },
  { id: "farm", label: "Farm", x: -76, z: 78, yaw: 0 },
  { id: "field", label: "Field", x: -118, z: 112, yaw: 0 },
  { id: "relay", label: "Relay", x: 136, z: -129, yaw: 0 },
  { id: "static", label: "Static", x: 150, z: -92, yaw: Math.PI },
] as const;
type DebugTravelDestination = typeof DEBUG_TRAVEL_DESTINATIONS[number];
type DebugTravelView = {
  x: number;
  z: number;
  yaw: number;
  nonce: number;
};

export function App() {
  const [identity, setIdentity] = useState<JoinOptions | null>(null);

  if (!identity) {
    return <AuthGate onEnter={setIdentity} />;
  }

  return <GameShell identity={identity} onExit={() => setIdentity(null)} />;
}

function AuthGate({ onEnter }: { onEnter: (identity: JoinOptions) => void }) {
  const [name, setName] = useState(() => getStoredName());
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injected = connectors[0];

  const cleanName = name.trim() || getStoredName();

  function enterGuest() {
    rememberName(cleanName);
    onEnter(makeGuestIdentity(cleanName));
  }

  function enterWallet() {
    if (!address) return;
    rememberName(cleanName);
    onEnter(makeWalletIdentity(cleanName, address));
  }

  return (
    <main className="auth-screen">
      <div className="auth-bg" aria-hidden="true">
        <Canvas
          className="auth-town-canvas"
          dpr={[1, 1.35]}
          camera={{ position: [0, 7.2, 17.6], fov: 42, near: 0.1, far: 130 }}
        >
          <AuthTownPreview />
        </Canvas>
        <div className="auth-scene-vignette" />
      </div>
      <section className="auth-title-lockup" aria-label="Mfer Town">
        <div className="brand-mark">
          <span>mf</span>
        </div>
        <div>
          <h1>Mfer Town</h1>
          <p>social plaza alpha</p>
        </div>
      </section>

      <section className="auth-connect-panel">
        <label className="name-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={18}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="auth-actions">
          <button className="primary-btn" type="button" onClick={enterGuest}>
            <UserRound size={18} />
            Enter as guest
          </button>
          {isConnected && address ? (
            <button className="primary-btn wallet" type="button" onClick={enterWallet}>
              <Gem size={18} />
              Enter with wallet
            </button>
          ) : (
            <button
              className="secondary-btn"
              type="button"
              disabled={!injected || isPending}
              onClick={() => injected && connect({ connector: injected })}
            >
              <Sparkles size={18} />
              Connect wallet
            </button>
          )}
          {isConnected && (
            <button className="text-btn" type="button" onClick={() => disconnect()}>
              <LogOut size={16} />
              Disconnect
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function AuthTownPreview() {
  return (
    <>
      <fog attach="fog" args={["#b7dce9", 32, 92]} />
      <ambientLight intensity={1.08} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.82]} />
      <directionalLight position={[-10, 18, 8]} intensity={1.45} color="#fff3d3" />
      <Skybox />
      <Suspense fallback={null}>
        <TownWorld />
      </Suspense>
      <AuthPreviewCamera />
    </>
  );
}

function AuthPreviewCamera() {
  const { camera } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, 0.92, 0), []);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    const orbit = elapsed * 0.09;
    camera.position.set(
      Math.sin(orbit) * 2.2,
      7.2 + Math.sin(elapsed * 0.35) * 0.12,
      17.6 + Math.cos(orbit) * 1.05,
    );
    camera.lookAt(lookAt);
  });

  return null;
}

function GameShell({ identity, onExit }: { identity: JoinOptions; onExit: () => void }) {
  const room = useTownRoom(identity);
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(null);
  const [actionSlots, setActionSlots] = useState<ActionSlot[]>(() => readStoredActionSlots());
  const [actionError, setActionError] = useState<{ id: number; text: string } | null>(null);
  const [debugTravelView, setDebugTravelView] = useState<DebugTravelView | null>(null);
  const actionErrorIdRef = useRef(0);
  const localPlayer = room.sessionId ? room.players.get(room.sessionId) : undefined;
  const playerCount = room.players.size;
  const hudIdentity = useMemo(() => ({
    name: localPlayer?.name || identity.name || "mfer",
    avatarSeed: localPlayer?.avatarSeed || identity.avatarSeed || 1,
  }), [identity.avatarSeed, identity.name, localPlayer?.avatarSeed, localPlayer?.name]);
  const selectedTargetUnit = useMemo(
    () => getSelectedTargetUnit(selectedTarget, room.players, room.npcs),
    [room.npcs, room.players, room.snapshotRevision, selectedTarget],
  );
  const performInteract = useCallback(() => {
    if (!localPlayer || localPlayer.health <= 0) return;
    const nearestNpc = findNearestNpc(localPlayer, room.npcs);
    room.sendInteract(nearestNpc ? { npcId: nearestNpc.id } : {});
  }, [localPlayer, room.npcs, room.sendInteract]);
  const showActionError = useCallback((text: string) => {
    actionErrorIdRef.current += 1;
    setActionError({ id: actionErrorIdRef.current, text });
  }, []);
  const performAction = useCallback((slot: ActionSlot) => {
    if (!slot) return;
    if (slot === "interact") performInteract();
    else if (isItemActionSlot(slot)) {
      const blockMessage = getItemActionBlockMessage(slot, localPlayer ?? null);
      if (blockMessage) {
        showActionError(blockMessage);
        return;
      }
      room.sendUseItem({ itemId: slot.itemId, chainTokenId: slot.chainTokenId });
    } else {
      const blockMessage = getCombatActionBlockMessage(slot, localPlayer ?? null, selectedTarget, selectedTargetUnit);
      if (blockMessage) {
        showActionError(blockMessage);
        return;
      }
      room.sendCombatAction({
        actionId: slot,
        target: selectedTarget,
      });
    }
  }, [localPlayer, performInteract, room.sendCombatAction, room.sendUseItem, selectedTarget, selectedTargetUnit, showActionError]);
  const replaceActionSlots = useCallback((slots: ActionSlot[]) => {
    setActionSlots(normalizeActionSlots(slots));
  }, []);
  const performDebugTravel = useCallback((destination: DebugTravelDestination) => {
    room.sendDebugTeleport(destination);
    setSelectedTarget(null);
    setDebugTravelView({
      x: destination.x,
      z: destination.z,
      yaw: destination.yaw,
      nonce: Date.now(),
    });
  }, [room.sendDebugTeleport]);

  useEffect(() => {
    if (!localPlayer) return;
    setActionSlots((current) => {
      const next = normalizeActionSlots(current).map((slot) => {
        if (!slot || slot === "interact") return slot;
        if (isItemActionSlot(slot)) {
          const inventoryKey = getInventoryItemKey(slot.itemId, slot.chainTokenId);
          return localPlayer.inventory.some((item) => getInventoryItemKey(item.id, item.chainTokenId) === inventoryKey && item.count > 0)
            ? slot
            : null;
        }
        return isCombatActionUnlocked(slot, localPlayer.talents) ? slot : null;
      });
      return slotsEqual(current, next) ? current : next;
    });
  }, [localPlayer?.inventory, localPlayer?.talents, room.snapshotRevision]);

  useEffect(() => {
    window.localStorage.setItem(ACTION_SLOT_STORAGE_KEY, JSON.stringify(actionSlots));
  }, [actionSlots]);

  useEffect(() => {
    if (!actionError) return;
    const timeout = window.setTimeout(() => setActionError(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [actionError]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const slotIndex = numberKeyToSlotIndex(event);
      if (slotIndex === null) return;
      const slot = actionSlots[slotIndex] ?? null;
      if (!slot) return;
      event.preventDefault();
      performAction(slot);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionSlots, performAction]);

  return (
    <main className="game-shell">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 6, 10], fov: 54, near: 0.1, far: 140 }}
      >
        <TownScene
          players={room.players}
          npcs={room.npcs}
          sceneRevision={room.sceneRevision}
          localSessionId={room.sessionId}
          selectedTarget={selectedTarget}
          combatEvents={room.combatEvents}
          experienceEvents={room.experienceEvents}
          chatBubbles={room.chatBubbles}
          onSelectTarget={setSelectedTarget}
          onInteractAction={performInteract}
          sendInput={room.sendInput}
          debugTravelView={debugTravelView}
        />
      </Canvas>

      <Hud
        identity={hudIdentity}
        playerCount={playerCount}
        connectionStatus={room.status}
        connectionError={room.error}
        chat={room.chat}
        players={room.players}
        npcs={room.npcs}
        selectedTarget={selectedTarget}
        selectedTargetUnit={selectedTargetUnit}
        localSessionId={room.sessionId}
        localPlayer={localPlayer ?? null}
        questOffer={room.questOffer}
        questTurnIn={room.questTurnIn}
        questStatus={room.questStatus}
        lootWindow={room.lootWindow}
        actionError={actionError}
        actionSlots={actionSlots}
        onAction={performAction}
        onReplaceActionSlots={replaceActionSlots}
        onAcceptQuest={room.sendAcceptQuest}
        onCompleteQuest={room.sendCompleteQuest}
        onDismissQuestOffer={room.dismissQuestOffer}
        onDismissQuestTurnIn={room.dismissQuestTurnIn}
        onDismissQuestStatus={room.dismissQuestStatus}
        onLootCorpse={room.sendLootCorpse}
        onEquipItem={room.sendEquipItem}
        onUnequipItem={room.sendUnequipItem}
        onUseItem={room.sendUseItem}
        onSelectTalent={room.sendSelectTalent}
        onCloseLootWindow={room.closeLootWindow}
        onSendChat={room.sendChat}
        onRespawn={room.sendRespawn}
        onSelectSelfTarget={() => room.sessionId && setSelectedTarget({ kind: "player", id: room.sessionId })}
        onExit={onExit}
      />

      {import.meta.env.DEV && (
        <DebugTravelPanel localPlayer={localPlayer ?? null} onTravel={performDebugTravel} />
      )}
    </main>
  );
}

function DebugTravelPanel({
  localPlayer,
  onTravel,
}: {
  localPlayer: PlayerSnapshot | null;
  onTravel: (destination: DebugTravelDestination) => void;
}) {
  return (
    <div className="debug-travel-panel" aria-label="Debug travel">
      <span className="debug-travel-position">
        {localPlayer ? `${Math.round(localPlayer.x)}, ${Math.round(localPlayer.z)}` : "--, --"}
      </span>
      {DEBUG_TRAVEL_DESTINATIONS.map((destination) => (
        <button
          key={destination.id}
          type="button"
          title={`Debug travel: ${destination.label}`}
          onClick={() => onTravel(destination)}
        >
          <MapPin size={13} />
          <span>{destination.label}</span>
        </button>
      ))}
    </div>
  );
}

function getSelectedTargetUnit(
  selectedTarget: TargetSelection | null,
  players: Map<string, PlayerSnapshot>,
  npcs: Map<string, NpcSnapshot>,
) {
  if (!selectedTarget) return null;
  if (selectedTarget.kind === "player") return players.get(selectedTarget.id) ?? null;

  const npc = npcs.get(selectedTarget.id);
  if (!npc || (!npc.isImmortal && npc.health <= 0)) return null;
  return npc;
}

function getItemActionBlockMessage(slot: ItemActionSlot, player: PlayerSnapshot | null) {
  if (!player || player.health <= 0) return "Not ready";
  const inventoryKey = getInventoryItemKey(slot.itemId, slot.chainTokenId);
  const inventoryItem = player.inventory.find((item) => getInventoryItemKey(item.id, item.chainTokenId) === inventoryKey);
  if (!inventoryItem || inventoryItem.count <= 0) return "Item is empty";

  const consumable = getItemConsumable(slot.itemId);
  if (!consumable) return "Can't use that";

  const needsHealth = Boolean(consumable.health && player.health < player.maxHealth);
  const needsMana = Boolean(consumable.mana && player.mana < player.maxMana);
  if (needsHealth || needsMana) return null;
  if (consumable.health && consumable.mana) return "Health and mana are full";
  if (consumable.health) return "Health is full";
  if (consumable.mana) return "Mana is full";
  return "Can't use that";
}

function getCombatActionBlockMessage(
  actionId: CombatActionId,
  player: PlayerSnapshot | null,
  selectedTarget: TargetSelection | null,
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null,
) {
  if (!player) return "Not ready";
  if (player.health <= 0) return "You are dead";
  if (player.castingAction) return "Already casting";
  const action = COMBAT.actions[actionId];
  const now = Date.now();
  const readyAt = actionId === "attack"
    ? player.attackReadyAt
    : actionId === "shoot"
      ? player.shootReadyAt
      : actionId === "signalShot"
        ? player.signalShotReadyAt
        : actionId === "fireblast"
          ? player.fireblastReadyAt
          : actionId === "frostNova"
            ? player.frostNovaReadyAt
            : actionId === "heal"
              ? player.healReadyAt
              : actionId === "taunt"
                ? player.tauntReadyAt
                : actionId === "whirlwind"
                  ? player.whirlwindReadyAt
                : actionId === "multishot"
                  ? player.multishotReadyAt
                  : player.iceBlastReadyAt;
  if (readyAt > now) return "Ability is not ready";
  if (player.mana < action.manaCost) return "Not enough mana";
  if (!isCombatActionUnlocked(actionId, player.talents)) return "Ability is locked";
  if (actionId === "frostNova" || actionId === "whirlwind") return null;
  if (actionId === "heal") {
    const targetUnit = selectedTarget ? selectedTargetUnit : player;
    if (!targetUnit) return "Invalid target";
    if (targetUnit.health <= 0) return "Target is dead";
    if (isNpcSnapshot(targetUnit) && getNpcDisposition(targetUnit) === "hostile") return "Can't heal hostile target";
    if (targetUnit.health >= targetUnit.maxHealth) {
      return targetUnit === player ? "You have full health" : "Target has full health";
    }
    const distance = Math.hypot(player.x - targetUnit.x, player.z - targetUnit.z);
    if (distance < action.minRange) return "Too close";
    if (distance > action.maxRange) return "Out of range";
    return null;
  }

  if (!selectedTarget) {
    return "No target";
  }
  if (selectedTarget.kind !== "npc" || !selectedTargetUnit || !isNpcSnapshot(selectedTargetUnit)) return "Target an enemy";
  if (!isAttackableNpcRole(selectedTargetUnit.role)) return "Target is friendly";
  if (!selectedTargetUnit.isImmortal && selectedTargetUnit.health <= 0) return "Target is dead";

  const distance = Math.hypot(player.x - selectedTargetUnit.x, player.z - selectedTargetUnit.z);
  if (distance < action.minRange) return "Too close";
  if (distance > action.maxRange) return "Out of range";
  return null;
}

function isNpcSnapshot(unit: PlayerSnapshot | NpcSnapshot): unit is NpcSnapshot {
  return "role" in unit;
}

function numberKeyToSlotIndex(event: KeyboardEvent) {
  const key = event.key;
  if (/^[1-8]$/.test(key)) return Number(key) - 1;
  if (/^Digit[1-8]$/.test(event.code)) return Number(event.code.slice(-1)) - 1;
  return null;
}

function readStoredActionSlots() {
  try {
    const stored = window.localStorage.getItem(ACTION_SLOT_STORAGE_KEY);
    if (!stored) return [...DEFAULT_ACTION_SLOTS];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_ACTION_SLOTS];
    return migrateStoredActionSlots(normalizeActionSlots(parsed), parsed.length);
  } catch {
    return [...DEFAULT_ACTION_SLOTS];
  }
}

function normalizeActionSlots(slots: unknown[]) {
  const next = Array.from({ length: ACTION_SLOT_COUNT }, (_, index) => {
    const value = slots[index];
    if (isActionId(value)) return value;
    if (isStoredItemSlot(value)) return makeItemActionSlot(value.itemId, value.chainTokenId);
    return null;
  });
  return next;
}

function migrateStoredActionSlots(slots: ActionSlot[], storedLength: number) {
  const assignedActions = slots.filter((slot): slot is ActionId => Boolean(slot && !isItemActionSlot(slot)));
  const needsStarterLoadout = assignedActions.length === 0 || (
    assignedActions.length === 1 && assignedActions[0] === "interact"
  );
  if (needsStarterLoadout) return [...DEFAULT_ACTION_SLOTS];
  if (storedLength >= ACTION_SLOT_COUNT) return slots;

  const usedActions = new Set(assignedActions);
  return slots.map((slot, index) => {
    if (slot) return slot;
    const defaultAction = DEFAULT_ACTION_SLOTS[index];
    if (!defaultAction || isItemActionSlot(defaultAction) || usedActions.has(defaultAction)) return null;
    usedActions.add(defaultAction);
    return defaultAction;
  });
}

function isActionId(value: unknown): value is ActionId {
  return value === "interact" || (typeof value === "string" && Object.prototype.hasOwnProperty.call(COMBAT.actions, value));
}

function isStoredItemSlot(value: unknown): value is { type: "item"; itemId: ItemId; chainTokenId?: string } {
  if (!value || typeof value !== "object") return false;
  const slot = value as { type?: unknown; itemId?: unknown; chainTokenId?: unknown };
  return slot.type === "item"
    && typeof slot.itemId === "string"
    && Object.prototype.hasOwnProperty.call(ITEMS, slot.itemId)
    && (slot.chainTokenId === undefined || typeof slot.chainTokenId === "string");
}

function slotsEqual(left: ActionSlot[], right: ActionSlot[]) {
  return left.length === right.length && left.every((slot, index) => getActionSlotKey(slot) === getActionSlotKey(right[index]));
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function findNearestNpc(player: PlayerSnapshot, npcs: Map<string, NpcSnapshot>): NpcSnapshot | null {
  let nearest: NpcSnapshot | null = null;
  let nearestDistance = Infinity;
  for (const npc of npcs.values()) {
    if (isAttackableNpcRole(npc.role) && !npc.isImmortal && npc.health <= 0 && !npc.hasLoot) continue;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  }

  if (nearest && nearestDistance <= 3.25) return nearest;
  return null;
}

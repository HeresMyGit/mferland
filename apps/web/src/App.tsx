import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Gem, LogOut, Sparkles, UserRound } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  COMBAT,
  isAttackableNpcRole,
  type ActionId,
  type CombatActionId,
  type JoinOptions,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { makeGuestIdentity, makeWalletIdentity, getStoredName, rememberName } from "./auth/identity";
import { useTownRoom } from "./game/useTownRoom";
import { TownScene } from "./game/TownScene";
import { Hud } from "./components/Hud";

type ActionSlot = ActionId | null;
const DEFAULT_ACTION_SLOTS: ActionSlot[] = ["interact", "attack", "shoot", "fireblast", "frostNova"];

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
      <div className="auth-bg">
        <div className="auth-castle" />
        <div className="auth-plaza" />
      </div>
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <span>mf</span>
          </div>
          <div>
            <h1>Mfer Town</h1>
            <p>social plaza alpha</p>
          </div>
        </div>

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

function GameShell({ identity, onExit }: { identity: JoinOptions; onExit: () => void }) {
  const room = useTownRoom(identity);
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(null);
  const [actionSlots, setActionSlots] = useState<ActionSlot[]>(DEFAULT_ACTION_SLOTS);
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
  }, [localPlayer, room]);
  const performAction = useCallback((actionId: ActionId | null) => {
    if (actionId === "interact") performInteract();
    else if (actionId) {
      if (!canUseCombatAction(actionId, localPlayer ?? null, selectedTarget, selectedTargetUnit)) return;
      room.sendCombatAction({
        actionId,
        target: selectedTarget,
      });
    }
  }, [localPlayer, performInteract, room, selectedTarget, selectedTargetUnit]);
  const moveActionSlot = useCallback((fromIndex: number, toIndex: number) => {
    setActionSlots((current) => {
      if (!current[fromIndex] || fromIndex === toIndex) return current;
      const next = [...current];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const slotIndex = numberKeyToSlotIndex(event);
      if (slotIndex === null) return;
      const actionId = actionSlots[slotIndex] ?? null;
      if (!actionId) return;
      event.preventDefault();
      performAction(actionId);
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
          localSessionId={room.sessionId}
          selectedTarget={selectedTarget}
          combatEvents={room.combatEvents}
          onSelectTarget={setSelectedTarget}
          onInteractAction={performInteract}
          sendInput={room.sendInput}
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
        lootWindow={room.lootWindow}
        actionSlots={actionSlots}
        onAction={performAction}
        onMoveActionSlot={moveActionSlot}
        onAcceptQuest={room.sendAcceptQuest}
        onDismissQuestOffer={room.dismissQuestOffer}
        onLootCorpse={room.sendLootCorpse}
        onCloseLootWindow={room.closeLootWindow}
        onSendChat={room.sendChat}
        onRespawn={room.sendRespawn}
        onExit={onExit}
      />
    </main>
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

function canUseCombatAction(
  actionId: CombatActionId,
  player: PlayerSnapshot | null,
  selectedTarget: TargetSelection | null,
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null,
) {
  if (!player || player.castingAction) return false;
  const action = COMBAT.actions[actionId];
  const now = Date.now();
  const readyAt = actionId === "attack"
    ? player.attackReadyAt
    : actionId === "shoot"
      ? player.shootReadyAt
      : actionId === "fireblast"
        ? player.fireblastReadyAt
        : player.frostNovaReadyAt;
  if (readyAt > now || player.mana < action.manaCost) return false;
  if (actionId === "frostNova") return true;

  if (!selectedTarget || selectedTarget.kind !== "npc" || !selectedTargetUnit || !isNpcSnapshot(selectedTargetUnit)) {
    return true;
  }
  if (!isAttackableNpcRole(selectedTargetUnit.role)) return false;
  if (!selectedTargetUnit.isImmortal && selectedTargetUnit.health <= 0) return false;

  const distance = Math.hypot(player.x - selectedTargetUnit.x, player.z - selectedTargetUnit.z);
  return distance >= action.minRange && distance <= action.maxRange;
}

function isNpcSnapshot(unit: PlayerSnapshot | NpcSnapshot): unit is NpcSnapshot {
  return "role" in unit;
}

function numberKeyToSlotIndex(event: KeyboardEvent) {
  const key = event.key;
  if (/^[1-5]$/.test(key)) return Number(key) - 1;
  if (/^Digit[1-5]$/.test(event.code)) return Number(event.code.slice(-1)) - 1;
  return null;
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

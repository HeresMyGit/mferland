import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  getNpcDisposition,
  getTalentUnlockedCombatActions,
  getUnlockedCombatActions,
  type ActiveBuffSnapshot,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCancelQuest,
  type ClientCompleteQuest,
  type ClientEquipItem,
  type ClientInput,
  type ClientLootCorpse,
  type ClientRegisterChainGear,
  type ClientSelectTalent,
  type ClientShareQuestLink,
  type ClientUnequipItem,
  type ClientUseItem,
  type CombatEvent,
  type EmoteId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { makeGuestIdentity, rememberInviteCode } from "./auth/identity";
import { Hud } from "./components/Hud";
import { MferHeadLoader } from "./components/MferHeadLoader";
import { MIXAMO_URLS, getMferAnimationClips } from "./components/MferAvatar";
import { ItemIcon } from "./components/hud/ItemIcon";
import { getActionSlotKey, type ActionSlot } from "./components/hud/types";
import { TownScene } from "./game/TownScene";
import {
  GameAudio,
  getCombatImpactCue,
  getCombatSpatialVolume,
  getCombatStartCue,
  getExperienceSpatialVolume,
} from "./game/audio";
import { getClientRenderPerformanceProfile } from "./game/performance";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "./game/settings";
import { useTownRoom } from "./game/useTownRoom";
import { canOpenStreamPage } from "./streamAccess";

const STREAM_DEFAULT_SECONDS = 45;
const STREAM_MIN_SECONDS = 30;
const STREAM_MAX_SECONDS = 60;
const STREAM_CAMERA_NAME = "stream cam";
const STREAM_IDLE_CAMERA_NPC_ID = "mfergpt";
const STREAM_RECENT_TARGET_MS = 8000;
const STREAM_ROOM_RECONNECT_CLOSED_MS = 900;
const STREAM_ROOM_RECONNECT_ERROR_MS = 3000;
const STREAM_CANVAS_STALL_MS = 12_000;
const STREAM_CANVAS_WATCHDOG_MS = 4000;
const STREAM_CANVAS_REMOUNT_COOLDOWN_MS = 15_000;
const STREAM_ACTION_SLOTS: ActionSlot[] = ["attack", null, null, null, null, null, null, null];
const STREAM_MODEL_URL = "/models/mferGPT.glb";
const STREAM_PRICE_POLL_MS = 30_000;
const STREAM_DEX_CHAIN = "base";
const STREAM_PRICE_TOKENS = [
  {
    id: "mfergpt",
    label: "$MFERGPT",
    pairAddress: "0x23ce6e13e06fc19bb5b5948334019fc75b7d0773eddf21a72008ac0ab8753d61",
  },
  {
    id: "mfer",
    label: "$MFER",
    pairAddress: "0xb08a99ab559e5456907278727a3b0d968c0a313b",
  },
] as const;
const STREAM_SETTINGS: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  graphicsQuality: "low",
  audio: {
    ...DEFAULT_GAME_SETTINGS.audio,
    enabled: true,
  },
  minimap: {
    friendlyNpcs: true,
  },
  nameplates: {
    localPlayer: false,
    otherPlayers: true,
    friendlyNpcs: true,
    unfriendlyNpcs: true,
    healthBars: true,
  },
};

type StreamPageProps = {
  overlay?: boolean;
  agentView?: boolean;
};

type StreamFocus = {
  agentOnly: boolean;
  query: string;
  wallet: string;
  sessionId: string;
  locked: boolean;
};

export function StreamPage({ overlay = false, agentView = false }: StreamPageProps) {
  if (!canOpenStreamPage({ agentView, hostname: window.location.hostname })) {
    return (
      <main className="game-shell stream-shell">
        <section className="stream-status-panel" role="alert">
          <strong>local stream only</strong>
          <span>Open this page from localhost or 127.0.0.1.</span>
        </section>
      </main>
    );
  }

  return <LocalStreamPage overlay={overlay} agentView={agentView} />;
}

function LocalStreamPage({ overlay, agentView }: { overlay: boolean; agentView: boolean }) {
  const baseIdentityRef = useRef<ReturnType<typeof makeGuestIdentity> | null>(null);
  const [roomReconnectNonce, setRoomReconnectNonce] = useState(0);
  const streamFocus = useMemo(() => getStreamFocus(agentView), [agentView]);
  const identity = useMemo(() => {
    if (!baseIdentityRef.current) {
      const inviteCode = getLinkedInviteCode();
      if (inviteCode) rememberInviteCode(inviteCode);
      baseIdentityRef.current = makeGuestIdentity(STREAM_CAMERA_NAME);
    }
    return { ...baseIdentityRef.current };
  }, [roomReconnectNonce]);
  const room = useTownRoom(identity);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [recentTargets, setRecentTargets] = useState<Record<string, StreamRecentTarget>>({});
  const [settings, setSettings] = useState<GameSettings>(STREAM_SETTINGS);
  const [loaderComplete, setLoaderComplete] = useState(false);
  const [gameCanvasEpoch, setGameCanvasEpoch] = useState(0);
  const audio = useMemo(() => new GameAudio(), []);
  const playedCombatEventIdsRef = useRef(new Set<string>());
  const playedExperienceEventIdsRef = useRef(new Set<string>());
  const combatAudioTimeoutsRef = useRef<number[]>([]);
  const leavingStreamRef = useRef(false);
  const lastGameFrameAtRef = useRef(Date.now());
  const lastGameCanvasRemountAtRef = useRef(0);
  const cycleMs = useMemo(() => getStreamCycleMs(), []);
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(settings.graphicsQuality), [settings.graphicsQuality]);
  const streamPlayers = useMemo(
    () => Array.from(room.players.values())
      .filter((player) => !isStreamCameraPlayer(player, room.sessionId))
      .filter((player) => matchesStreamFocus(player, streamFocus))
      .sort((a, b) => getStreamFocusRank(a, streamFocus) - getStreamFocusRank(b, streamFocus) || a.name.localeCompare(b.name) || a.sessionId.localeCompare(b.sessionId)),
    [room.players, room.sessionId, room.snapshotRevision, streamFocus],
  );
  const scenePlayers = useMemo(() => {
    const nextPlayers = new Map(room.players);
    for (const [sessionId, player] of nextPlayers) {
      if (isStreamCameraPlayer(player, room.sessionId)) nextPlayers.delete(sessionId);
    }
    return nextPlayers;
  }, [room.players, room.sessionId, room.snapshotRevision]);
  const streamSessionIds = useMemo(() => streamPlayers.map((player) => player.sessionId), [streamPlayers]);
  const streamSessionKey = streamSessionIds.join("|");
  const focusedPlayer = focusedSessionId ? room.players.get(focusedSessionId) ?? null : null;
  const focusedRecentTarget = focusedSessionId ? recentTargets[focusedSessionId] ?? null : null;
  const actionSlots = useMemo(
    () => getStreamActionSlots(focusedPlayer),
    [focusedPlayer, room.snapshotRevision],
  );
  const selectedTarget = useMemo(
    () => focusedPlayer ? getStreamSelectedTarget(focusedPlayer, room.npcs, focusedRecentTarget) : null,
    [focusedPlayer, focusedRecentTarget, room.npcs, room.snapshotRevision],
  );
  const selectedTargetUnit = useMemo(
    () => getSelectedTargetUnit(selectedTarget, room.players, room.npcs),
    [room.npcs, room.players, room.snapshotRevision, selectedTarget],
  );
  const hudIdentity = useMemo(() => ({
    name: focusedPlayer?.name || STREAM_CAMERA_NAME,
    avatarSeed: focusedPlayer?.avatarSeed || identity.avatarSeed || 1,
    walletAddress: focusedPlayer?.walletAddress || "",
  }), [focusedPlayer?.avatarSeed, focusedPlayer?.name, focusedPlayer?.walletAddress, identity.avatarSeed]);

  useEffect(() => {
    setFocusedSessionId((current) => {
      if (streamSessionIds.length === 0) return null;
      if (current && streamSessionIds.includes(current)) return current;
      return streamSessionIds[0];
    });
  }, [streamSessionKey]);

  useEffect(() => {
    if (streamFocus.locked || streamSessionIds.length < 2) return;
    const interval = window.setInterval(() => {
      setFocusedSessionId((current) => {
        const currentIndex = current ? streamSessionIds.indexOf(current) : -1;
        return streamSessionIds[(currentIndex + 1 + streamSessionIds.length) % streamSessionIds.length];
      });
    }, cycleMs);

    return () => window.clearInterval(interval);
  }, [cycleMs, streamFocus.locked, streamSessionKey]);

  useEffect(() => {
    if (room.status === "connecting") setLoaderComplete(false);
  }, [room.status]);

  useEffect(() => {
    if (leavingStreamRef.current) return;
    if (room.status !== "closed" && room.status !== "error") return;

    const timeout = window.setTimeout(() => {
      setFocusedSessionId(null);
      setRecentTargets({});
      setLoaderComplete(false);
      setGameCanvasEpoch((epoch) => epoch + 1);
      setRoomReconnectNonce((nonce) => nonce + 1);
    }, room.status === "error" ? STREAM_ROOM_RECONNECT_ERROR_MS : STREAM_ROOM_RECONNECT_CLOSED_MS);

    return () => window.clearTimeout(timeout);
  }, [room.status, room.error]);

  useEffect(() => {
    audio.configure(settings.audio);
  }, [audio, settings.audio.enabled, settings.audio.volume]);

  useEffect(() => {
    audio.preload(["attackSwing", "attackImpact", "rangedRelease", "rangedImpact", "spellCast", "spellImpact", "defeat", "xpGain"]);
    return () => {
      clearAudioTimeouts(combatAudioTimeoutsRef);
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => {
    for (const event of room.combatEvents) {
      if (playedCombatEventIdsRef.current.has(event.id)) continue;
      playedCombatEventIdsRef.current.add(event.id);
      playStreamCombatEventAudio(audio, event, focusedPlayer, combatAudioTimeoutsRef);
    }
    prunePlayedAudioIds(playedCombatEventIdsRef.current, room.combatEvents);
  }, [audio, focusedPlayer, room.combatEvents]);

  useEffect(() => {
    for (const event of room.experienceEvents) {
      if (playedExperienceEventIdsRef.current.has(event.id)) continue;
      playedExperienceEventIdsRef.current.add(event.id);
      audio.play("xpGain", { volume: getExperienceSpatialVolume(event, focusedPlayer) });
    }
    prunePlayedAudioIds(playedExperienceEventIdsRef.current, room.experienceEvents);
  }, [audio, focusedPlayer, room.experienceEvents]);

  useEffect(() => {
    if (room.combatEvents.length === 0) return;
    const now = Date.now();
    setRecentTargets((current) => {
      let changed = false;
      const next: Record<string, StreamRecentTarget> = {};

      for (const [sessionId, recentTarget] of Object.entries(current)) {
        if (now - recentTarget.seenAt <= STREAM_RECENT_TARGET_MS) next[sessionId] = recentTarget;
        else changed = true;
      }

      for (const event of room.combatEvents) {
        if (!room.players.has(event.sourceId)) continue;
        const previous = next[event.sourceId];
        if (previous && previous.eventId === event.id) continue;
        next[event.sourceId] = {
          eventId: event.id,
          seenAt: now,
          target: event.target,
        };
        changed = true;
      }

      return changed ? next : current;
    });
  }, [room.combatEvents, room.players]);

  const leaveStream = useCallback(() => {
    leavingStreamRef.current = true;
    void room.leaveAndWait().finally(() => {
      window.location.assign("/");
    });
  }, [room.leaveAndWait]);
  const handleLoaderComplete = useCallback(() => setLoaderComplete(true), []);
  const markGameCanvasFrame = useCallback(() => {
    lastGameFrameAtRef.current = Date.now();
  }, []);
  const remountGameCanvas = useCallback(() => {
    const now = Date.now();
    if (now - lastGameCanvasRemountAtRef.current < STREAM_CANVAS_REMOUNT_COOLDOWN_MS) return;
    lastGameCanvasRemountAtRef.current = now;
    lastGameFrameAtRef.current = now;
    setLoaderComplete(false);
    setGameCanvasEpoch((epoch) => epoch + 1);
  }, []);

  useEffect(() => {
    lastGameFrameAtRef.current = Date.now();
  }, [gameCanvasEpoch, room.status]);

  useEffect(() => {
    if (room.status !== "connected") return;
    const interval = window.setInterval(() => {
      if (Date.now() - lastGameFrameAtRef.current > STREAM_CANVAS_STALL_MS) remountGameCanvas();
    }, STREAM_CANVAS_WATCHDOG_MS);

    return () => window.clearInterval(interval);
  }, [remountGameCanvas, room.status]);

  const streamStage = (
    <>
      <Canvas
        key={`${renderProfile.cacheKey}:${gameCanvasEpoch}`}
        dpr={renderProfile.gameDpr}
        camera={{ position: [0, 6, 10], fov: 54, near: 0.1, far: 140 }}
        gl={{ antialias: renderProfile.antialias, powerPreference: renderProfile.powerPreference }}
      >
        <StreamCanvasHealth onFrame={markGameCanvasFrame} onContextLoss={remountGameCanvas} />
        <TownScene
          players={scenePlayers}
          npcs={room.npcs}
          sceneRevision={room.sceneRevision}
          localSessionId={focusedSessionId}
          selectedTarget={selectedTarget}
          combatEvents={room.combatEvents}
          experienceEvents={room.experienceEvents}
          chatBubbles={room.chatBubbles}
          onSelectTarget={noop}
          onInteractAction={noop}
          sendInput={noopInput}
          nameplateVisibility={settings.nameplates}
          renderProfile={renderProfile}
          controlsEnabled={false}
          cameraControlsEnabled={agentView}
          idleCameraNpcId={STREAM_IDLE_CAMERA_NPC_ID}
        />
      </Canvas>

      {!loaderComplete && (
        <MferHeadLoader
          label="warming stream"
          ready={room.status !== "connecting"}
          renderProfile={renderProfile}
          onComplete={handleLoaderComplete}
        />
      )}

      {loaderComplete && focusedPlayer && (
        <Hud
          identity={hudIdentity}
          playerCount={streamPlayers.length}
          connectionStatus={room.status}
          connectionError={room.error}
          chat={room.chat}
          players={scenePlayers}
          npcs={room.npcs}
          selectedTarget={selectedTarget}
          selectedTargetUnit={selectedTargetUnit}
          cryptoStoreNpc={null}
          localSessionId={focusedSessionId}
          localPlayer={focusedPlayer}
          questOffer={null}
          questTurnIn={null}
          questStatus={null}
          lootWindow={null}
          actionError={null}
          moveUnlockNotice={null}
          actionSlots={actionSlots}
          onAction={noopAction}
          onReplaceActionSlots={noopReplaceActionSlots}
          onAcceptQuest={noopAcceptQuest}
          onCompleteQuest={noopCompleteQuest}
          onCancelQuest={noopCancelQuest}
          onShareQuestLink={noopShareQuestLink}
          onDismissQuestOffer={noop}
          onDismissQuestTurnIn={noop}
          onDismissQuestStatus={noop}
          onLootCorpse={noopLootCorpse}
          onEquipItem={noopActionSlotItem}
          onUnequipItem={noopUnequipItem}
          onUseItem={noopUseItem}
          onRegisterChainGear={noopRegisterChainGear}
          onCryptoStoreAnalytics={noopCryptoAnalytics}
          onSelectTalent={noopSelectTalent}
          onCloseLootWindow={noop}
          onCloseCryptoStore={noop}
          onSendChat={noopString}
          onEmote={noopEmote}
          onRespawn={noop}
          onSelectSelfTarget={noop}
          onExit={leaveStream}
          settings={settings}
          renderProfile={renderProfile}
          debugToolsAvailable={false}
          hideChatPanel
          onSettingsChange={setSettings}
        />
      )}

      {agentView && <AgentThoughtPanel player={focusedPlayer} />}
    </>
  );

  if (overlay) {
    return (
      <StreamOverlay
        focusedPlayer={focusedPlayer}
        agentView={agentView}
        onlinePlayers={streamPlayers}
        selectedTargetUnit={selectedTargetUnit}
        connectionStatus={room.status}
        connectionError={room.error}
        cycleSeconds={cycleMs / 1000}
        focusLocked={streamFocus.locked}
        chat={room.chat}
      >
        {streamStage}
      </StreamOverlay>
    );
  }

  return (
    <main className="game-shell stream-shell stream-game-shell">
      {streamStage}
    </main>
  );
}

type StreamOverlayProps = {
  children: ReactNode;
  focusedPlayer: PlayerSnapshot | null;
  agentView: boolean;
  onlinePlayers: PlayerSnapshot[];
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null;
  connectionStatus: string;
  connectionError: string | null;
  cycleSeconds: number;
  focusLocked: boolean;
  chat: ChatMessage[];
};

function StreamOverlay({
  children,
  focusedPlayer,
  agentView,
  onlinePlayers,
  selectedTargetUnit,
  connectionStatus,
  connectionError,
  cycleSeconds,
  focusLocked,
  chat,
}: StreamOverlayProps) {
  const [now, setNow] = useState(() => Date.now());
  const recentChat = chat.slice(-5).reverse();
  const healthPercent = focusedPlayer ? getUnitHealthPercent(focusedPlayer) : 0;
  const manaPercent = focusedPlayer?.maxMana ? (focusedPlayer.mana / focusedPlayer.maxMana) * 100 : 0;
  const activeBuffs = getVisibleStreamBuffs(focusedPlayer?.activeBuffs ?? [], now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="stream-overlay-shell">
      <div className="stream-overlay-texture" aria-hidden="true" />
      <header className="stream-overlay-titlebar">
        <div className="stream-overlay-titleblock">
          <span className="stream-overlay-live-dot" aria-hidden="true" />
          <strong>{agentView ? "mferland agent viewer" : "mfergpt plays mferland"}</strong>
          <span>{connectionError || connectionStatus}</span>
        </div>
        <StreamPriceTickerStrip />
      </header>

      <section className="stream-overlay-grid" aria-label="mferland livestream overlay">
        <aside className="stream-overlay-sidebar stream-overlay-sidebar-left">
          <section className="stream-overlay-model-panel" aria-label="mfergpt host model">
            <StreamCornerModel />
            <div className="stream-overlay-model-caption">
              <span>on cam</span>
              <strong>mfergpt</strong>
            </div>
          </section>

          <section className="stream-overlay-panel">
            <div className="stream-overlay-panel-title">
              <span>watching</span>
              <strong>{focusedPlayer?.name || "waiting"}</strong>
            </div>
            <StreamMeter label="HP" value={healthPercent} tone="health" text={focusedPlayer ? `${Math.ceil(focusedPlayer.health)} / ${focusedPlayer.maxHealth}` : "--"} />
            <StreamMeter label="MP" value={manaPercent} tone="mana" text={focusedPlayer ? `${Math.ceil(focusedPlayer.mana)} / ${focusedPlayer.maxMana}` : "--"} />
            <div className="stream-overlay-stat-grid">
              <StreamStat label="level" value={focusedPlayer ? String(focusedPlayer.level) : "--"} />
              <StreamStat label={focusLocked ? "focus" : "cycle"} value={focusLocked ? "locked" : `${Math.round(cycleSeconds)}s`} />
            </div>
            <StreamBuffStrip buffs={activeBuffs} now={now} />
          </section>

          <section className="stream-overlay-panel stream-overlay-target-panel">
            <div className="stream-overlay-panel-title">
              <span>target</span>
              <strong>{selectedTargetUnit?.name || "none"}</strong>
            </div>
            {selectedTargetUnit ? (
              <StreamMeter label="HP" value={getUnitHealthPercent(selectedTargetUnit)} tone="target" text={getTargetHealthText(selectedTargetUnit)} />
            ) : (
              <p className="stream-overlay-muted">no active target</p>
            )}
          </section>
        </aside>

        <section className="stream-overlay-stage-panel" aria-label="mferland game capture">
          <div className="stream-overlay-stage-header">
            <span>mferland</span>
            <strong>{focusedPlayer ? `camera: ${focusedPlayer.name}` : "camera idle"}</strong>
          </div>
          <section className="game-shell stream-shell stream-game-shell stream-overlay-game-shell">
            {children}
          </section>
        </section>

        <aside className="stream-overlay-sidebar stream-overlay-sidebar-right">
          <section className="stream-overlay-panel stream-overlay-roster">
            <div className="stream-overlay-panel-title">
              <span>online</span>
              <strong>{onlinePlayers.length}</strong>
            </div>
            <div className="stream-overlay-player-list">
              {onlinePlayers.slice(0, 8).map((player) => (
                <div
                  key={player.sessionId}
                  className={`stream-overlay-player-row${player.sessionId === focusedPlayer?.sessionId ? " active" : ""}`}
                >
                  <span>{player.name}</span>
                  <em>lv {player.level}</em>
                </div>
              ))}
              {onlinePlayers.length === 0 && <p className="stream-overlay-muted">waiting for players</p>}
            </div>
          </section>

          <section className="stream-overlay-panel stream-overlay-chat-log">
            <div className="stream-overlay-panel-title">
              <span>chat</span>
              <strong>live</strong>
            </div>
            <div className="stream-overlay-chat-list">
              {recentChat.map((message) => (
                <p key={`${message.sentAt}-${message.sessionId}-${message.text}`}>
                  <span>{message.name}</span>
                  {message.kind === "emote" ? <em>{message.text}</em> : message.text}
                </p>
              ))}
              {recentChat.length === 0 && <p className="stream-overlay-muted">quiet rn</p>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function StreamCanvasHealth({ onFrame, onContextLoss }: { onFrame: () => void; onContextLoss: () => void }) {
  const { gl } = useThree();

  useFrame(() => onFrame());

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLoss();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onContextLoss]);

  return null;
}

function StreamCornerModel() {
  return (
    <Canvas
      className="stream-overlay-model-canvas"
      dpr={[0.75, 1]}
      camera={{ position: [0.2, 1.15, 2.5], fov: 30, near: 0.1, far: 20 }}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      onCreated={({ camera }) => camera.lookAt(0, 1.05, 0)}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[2, 3, 2]} intensity={1.5} />
      <directionalLight position={[-2, 1.2, -1]} intensity={0.6} color="#66f2ff" />
      <Suspense fallback={null}>
        <StreamMferGptModel />
      </Suspense>
    </Canvas>
  );
}

function StreamMferGptModel() {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const gltf = useLoader(GLTFLoader, STREAM_MODEL_URL) as { scene: THREE.Group };
  const fbxAnimations = useLoader(FBXLoader, MIXAMO_URLS) as THREE.Group[];
  const model = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene);
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    });
    return scene;
  }, [gltf.scene]);
  const clips = useMemo(() => getMferAnimationClips(fbxAnimations), [fbxAnimations]);

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(model);
    mixerRef.current = mixer;
    const idleClip = clips.get("idle");
    const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
    idleAction?.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(0.9).play();

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [clips, model]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return (
    <group ref={groupRef} position={[0, -0.18, 0]} rotation-y={-0.28} scale={1.12}>
      <primitive object={model} dispose={null} />
    </group>
  );
}

function StreamPriceTickerStrip() {
  const prices = useStreamPriceQuotes();

  return (
    <div className="stream-overlay-tickers" aria-label="crypto prices">
      {STREAM_PRICE_TOKENS.map((token) => {
        const pair = findStreamDexPair(prices.pairs, token.pairAddress);
        const change5m = getPairChange(pair, "m5") ?? getPairChange(pair, "h1");
        const change24h = getPairChange(pair, "h24");
        return (
          <div className="stream-overlay-ticker" key={token.id}>
            <span>{token.label}</span>
            <strong>{pair ? formatQuoteValue(pair) : prices.state === "error" ? "offline" : "--"}</strong>
            <em className={getChangeClass(change5m)}>5m {formatChange(change5m)}</em>
            <em className={getChangeClass(change24h)}>24h {formatChange(change24h)}</em>
          </div>
        );
      })}
    </div>
  );
}

function StreamMeter({ label, value, tone, text }: { label: string; value: number; tone: "health" | "mana" | "target"; text: string }) {
  return (
    <div className={`stream-overlay-meter ${tone}`}>
      <div>
        <span>{label}</span>
        <em>{text}</em>
      </div>
      <i aria-hidden="true"><b style={{ width: `${clampPercent(value)}%` }} /></i>
    </div>
  );
}

function StreamStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stream-overlay-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StreamBuffStrip({ buffs, now }: { buffs: ActiveBuffSnapshot[]; now: number }) {
  if (buffs.length === 0) {
    return (
      <div className="stream-overlay-buffs empty">
        <span>buffs</span>
        <strong>none</strong>
      </div>
    );
  }

  return (
    <div className="stream-overlay-buffs" aria-label="active buffs">
      <span>buffs</span>
      <div>
        {buffs.slice(0, 4).map((buff) => (
          <figure key={buff.id}>
            <ItemIcon itemId={buff.itemId} />
            <figcaption>{buff.shortName} {formatStreamBuffRemaining(buff, now)}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function AgentThoughtPanel({ player }: { player: PlayerSnapshot | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!player?.isAgent) return null;

  const updatedAt = Number(player.agentStatusUpdatedAt) || 0;
  const stale = !updatedAt || now - updatedAt > 12_000;
  const action = player.agentStatusAction || player.castingAction || player.animation || "watching";
  const thought = player.agentStatusThought || "waiting for next decision";
  const quest = player.agentStatusQuest || getFocusedQuestText(player);

  return (
    <section className={`agent-thought-panel${stale ? " stale" : ""}`} aria-label="agent thinking">
      <header>
        <span>thinking</span>
        <strong>{player.name}</strong>
        <em>{updatedAt ? formatAgentStatusAge(now - updatedAt) : "pending"}</em>
      </header>
      <p>
        <span>doing</span>
        <b>{action}</b>
      </p>
      <p>
        <span>why</span>
        <b>{thought}</b>
      </p>
      {quest && (
        <p>
          <span>quest</span>
          <b>{quest}</b>
        </p>
      )}
    </section>
  );
}

type StreamRecentTarget = {
  eventId: string;
  seenAt: number;
  target: TargetSelection;
};

type StreamPriceState = {
  state: "loading" | "ready" | "error";
  pairs: StreamDexPair[];
  error: string;
};

type StreamDexPair = {
  pairAddress?: string;
  marketCap?: number | string | null;
  fdv?: number | string | null;
  priceUsd?: string | null;
  priceChange?: Partial<Record<"m5" | "h1" | "h6" | "h24", number | string | null>>;
};

function useStreamPriceQuotes(): StreamPriceState {
  const [prices, setPrices] = useState<StreamPriceState>({ state: "loading", pairs: [], error: "" });

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    const pools = STREAM_PRICE_TOKENS.map((token) => token.pairAddress).join(",");

    async function loadPrices() {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${STREAM_DEX_CHAIN}/${pools}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`DexScreener ${response.status}`);
        const payload = await response.json() as { pairs?: unknown[] };
        const pairs = Array.isArray(payload.pairs) ? payload.pairs.filter(isStreamDexPair) : [];
        if (!disposed) setPrices({ state: "ready", pairs, error: "" });
      } catch (error) {
        if (!disposed) {
          setPrices((current) => ({
            state: "error",
            pairs: current.pairs,
            error: error instanceof Error ? error.message : "price feed unavailable",
          }));
        }
      }
    }

    void loadPrices();
    timer = window.setInterval(() => void loadPrices(), STREAM_PRICE_POLL_MS);
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  return prices;
}

function isStreamDexPair(value: unknown): value is StreamDexPair {
  return Boolean(value && typeof value === "object" && typeof (value as StreamDexPair).pairAddress === "string");
}

function findStreamDexPair(pairs: StreamDexPair[], pairAddress: string) {
  const normalized = pairAddress.toLowerCase();
  return pairs.find((pair) => pair.pairAddress?.toLowerCase() === normalized) ?? null;
}

function getPairChange(pair: StreamDexPair | null, key: "m5" | "h1" | "h6" | "h24") {
  return toFiniteNumber(pair?.priceChange?.[key]);
}

function getChangeClass(value: number | null) {
  if (value === null) return "flat";
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

function formatChange(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatQuoteValue(pair: StreamDexPair) {
  const marketCap = toFiniteNumber(pair.marketCap) ?? toFiniteNumber(pair.fdv);
  if (marketCap !== null && marketCap > 0) return formatMarketCap(marketCap);

  const price = toFiniteNumber(pair.priceUsd);
  if (price === null || price <= 0) return "--";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toPrecision(3)}`;
  return `$${price.toFixed(price < 1 ? 4 : 2)}`;
}

function formatMarketCap(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function toFiniteNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function getUnitHealthPercent(unit: Pick<PlayerSnapshot | NpcSnapshot, "health" | "maxHealth">) {
  if (unit.maxHealth <= 0) return 0;
  return (unit.health / unit.maxHealth) * 100;
}

function getTargetHealthText(unit: PlayerSnapshot | NpcSnapshot) {
  if ("isImmortal" in unit && unit.isImmortal) return "immortal";
  return `${Math.max(0, Math.ceil(unit.health))} / ${unit.maxHealth}`;
}

function getFocusedQuestText(player: PlayerSnapshot) {
  const quest = player.quests.find((entry) => entry.status !== "completed") ?? player.quests[0];
  if (!quest) return "";
  return `${quest.status} ${quest.progress}/${quest.required} ${quest.id}`;
}

function formatAgentStatusAge(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "now";
  if (ageMs < 1500) return "now";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  return `${Math.round(ageMs / 60_000)}m`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getVisibleStreamBuffs(buffs: ActiveBuffSnapshot[], now: number) {
  return buffs
    .filter((buff) => buff.expiresAt > now)
    .sort((left, right) => left.expiresAt - right.expiresAt || left.id.localeCompare(right.id));
}

function formatStreamBuffRemaining(buff: ActiveBuffSnapshot, now: number) {
  const totalMinutes = Math.ceil(Math.max(0, buff.expiresAt - now) / 60000);
  if (totalMinutes >= 60) return "1h";
  return `${Math.max(1, totalMinutes)}m`;
}

function playStreamCombatEventAudio(
  audio: GameAudio,
  event: CombatEvent,
  listener: PlayerSnapshot | null,
  timeoutsRef: MutableRefObject<number[]>,
) {
  const spatialVolume = getCombatSpatialVolume(event, listener);
  const startCue = getCombatStartCue(event.actionId, event.amount);
  if (startCue) audio.play(startCue, { volume: spatialVolume });

  const delayMs = Math.max(0, event.impactAt - Date.now());
  const timeoutId = window.setTimeout(() => {
    timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId);
    const impactVolume = getCombatSpatialVolume(event, listener);
    const impactCue = getCombatImpactCue(event);
    if (impactCue) audio.play(impactCue, { volume: impactVolume });
    if (event.defeated) audio.play("defeat", { volume: impactVolume * 0.85 });
  }, delayMs);
  timeoutsRef.current.push(timeoutId);
}

function clearAudioTimeouts(timeoutsRef: MutableRefObject<number[]>) {
  for (const timeoutId of timeoutsRef.current) {
    window.clearTimeout(timeoutId);
  }
  timeoutsRef.current = [];
}

function prunePlayedAudioIds(playedIds: Set<string>, events: Array<{ id: string }>) {
  const liveIds = new Set(events.map((event) => event.id));
  for (const id of playedIds) {
    if (!liveIds.has(id)) playedIds.delete(id);
  }
}

function getStreamSelectedTarget(
  player: PlayerSnapshot,
  npcs: Map<string, NpcSnapshot>,
  recentTarget: StreamRecentTarget | null,
): TargetSelection | null {
  if (player.health <= 0) return null;

  if (recentTarget && Date.now() - recentTarget.seenAt <= STREAM_RECENT_TARGET_MS) {
    if (recentTarget.target.kind === "player") return recentTarget.target;
    const npc = npcs.get(recentTarget.target.id);
    if (npc && (npc.isImmortal || npc.health > 0 || npc.hasLoot)) return recentTarget.target;
  }

  const aggroNpc = Array.from(npcs.values())
    .filter((npc) => npc.aggroTargetId === player.sessionId && (npc.isImmortal || npc.health > 0))
    .sort((a, b) => distanceSq2d(player, a) - distanceSq2d(player, b))[0];
  if (aggroNpc) return { kind: "npc", id: aggroNpc.id };

  if (!player.castingAction) return null;

  const nearestHostile = Array.from(npcs.values())
    .filter((npc) => getNpcDisposition(npc) !== "friendly" && (npc.isImmortal || npc.health > 0))
    .map((npc) => ({ npc, distance: distanceSq2d(player, npc) }))
    .filter(({ distance }) => distance <= 36 * 36)
    .sort((a, b) => a.distance - b.distance)[0]?.npc;

  return nearestHostile ? { kind: "npc", id: nearestHostile.id } : null;
}

function getStreamActionSlots(player: PlayerSnapshot | null) {
  if (!player) return STREAM_ACTION_SLOTS;

  const talentUnlockedActions = getTalentUnlockedCombatActions(player.talents);
  const unlockedActions = getUnlockedCombatActions(player.level, false, talentUnlockedActions);
  return normalizeActionSlots(unlockedActions);
}

function getSelectedTargetUnit(
  selectedTarget: TargetSelection | null,
  players: Map<string, PlayerSnapshot>,
  npcs: Map<string, NpcSnapshot>,
) {
  if (!selectedTarget) return null;
  if (selectedTarget.kind === "player") return players.get(selectedTarget.id) ?? null;
  return npcs.get(selectedTarget.id) ?? null;
}

function getStreamCycleMs() {
  const params = new URLSearchParams(window.location.search);
  const rawSeconds = Number(params.get("cycle") ?? params.get("interval") ?? params.get("seconds") ?? "");
  const seconds = Number.isFinite(rawSeconds) && rawSeconds > 0 ? rawSeconds : STREAM_DEFAULT_SECONDS;
  return Math.round(Math.min(STREAM_MAX_SECONDS, Math.max(STREAM_MIN_SECONDS, seconds)) * 1000);
}

function getStreamFocus(agentView: boolean): StreamFocus {
  const params = new URLSearchParams(window.location.search);
  const rawQuery = params.get("agent") ?? params.get("player") ?? params.get("name") ?? "";
  const query = normalizeStreamFocusValue(rawQuery);
  const wallet = normalizeStreamFocusValue(params.get("wallet") ?? params.get("address") ?? "");
  const sessionId = normalizeStreamFocusValue(params.get("session") ?? params.get("sessionId") ?? "");
  const agentOnlyParam = params.get("agentOnly") ?? params.get("agents") ?? "";
  const agentOnly = agentView || agentOnlyParam === "1" || agentOnlyParam.toLowerCase() === "true";
  return {
    agentOnly,
    query,
    wallet,
    sessionId,
    locked: Boolean(query || wallet || sessionId),
  };
}

function matchesStreamFocus(player: PlayerSnapshot, focus: StreamFocus) {
  if (focus.agentOnly && !player.isAgent) return false;
  if (focus.wallet && normalizeStreamFocusValue(player.walletAddress) !== focus.wallet) return false;
  if (focus.sessionId && normalizeStreamFocusValue(player.sessionId) !== focus.sessionId) return false;
  if (!focus.query) return true;

  const haystack = [
    player.name,
    player.walletAddress,
    player.sessionId,
  ].map(normalizeStreamFocusValue);
  return haystack.some((value) => value === focus.query || value.startsWith(focus.query) || value.includes(focus.query));
}

function getStreamFocusRank(player: PlayerSnapshot, focus: StreamFocus) {
  const values = [
    normalizeStreamFocusValue(player.walletAddress),
    normalizeStreamFocusValue(player.sessionId),
    normalizeStreamFocusValue(player.name),
  ];
  if (focus.wallet && values[0] === focus.wallet) return 0;
  if (focus.sessionId && values[1] === focus.sessionId) return 0;
  if (focus.query) {
    const exactIndex = values.findIndex((value) => value === focus.query);
    if (exactIndex >= 0) return exactIndex;
    if (values.some((value) => value.startsWith(focus.query))) return 3;
    if (values.some((value) => value.includes(focus.query))) return 4;
  }
  return player.isAgent ? 5 : 6;
}

function normalizeStreamFocusValue(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" ? "" : trimmed;
}

function isStreamCameraPlayer(player: PlayerSnapshot, localSessionId: string | null) {
  return player.sessionId === localSessionId || player.name === STREAM_CAMERA_NAME;
}

function getLinkedInviteCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite")?.trim() || params.get("code")?.trim() || "";
}

function normalizeActionSlots(slots: ActionSlot[]) {
  const normalized = slots.slice(0, STREAM_ACTION_SLOTS.length);
  while (normalized.length < STREAM_ACTION_SLOTS.length) normalized.push(null);

  const seen = new Set<string>();
  return normalized.map((slot) => {
    if (!slot) return null;
    const key = getActionSlotKey(slot);
    if (seen.has(key)) return null;
    seen.add(key);
    return slot;
  });
}

function distanceSq2d(
  a: Pick<PlayerSnapshot, "x" | "z">,
  b: Pick<NpcSnapshot, "x" | "z">,
) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function noop() {}
function noopInput(_input: ClientInput) {}
function noopString(_value: string) {}
function noopAction(_slot: NonNullable<ActionSlot>) {}
function noopReplaceActionSlots(_slots: ActionSlot[]) {}
function noopAcceptQuest(_message: ClientAcceptQuest) {}
function noopCompleteQuest(_message: ClientCompleteQuest) {}
function noopCancelQuest(_message: ClientCancelQuest) {}
function noopShareQuestLink(_message: ClientShareQuestLink) {}
function noopLootCorpse(_message: ClientLootCorpse) {}
function noopActionSlotItem(_message: ClientEquipItem) {}
function noopUnequipItem(_message: ClientUnequipItem) {}
function noopUseItem(_message: ClientUseItem) {}
function noopRegisterChainGear(_message: ClientRegisterChainGear) {}
function noopCryptoAnalytics(_eventType: string, _properties?: Record<string, string | number | boolean | null>) {}
function noopSelectTalent(_message: ClientSelectTalent) {}
function noopEmote(_emoteId: EmoteId) {}

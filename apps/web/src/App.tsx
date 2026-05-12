import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ArrowDownUp, Check, Copy, ExternalLink, Gem, LogOut, MapPin, RefreshCw, Sparkles, X } from "lucide-react";
import * as THREE from "three";
import { useAccount, useConnect, useDisconnect, useSignMessage, type Connector } from "wagmi";
import {
  COMBAT,
  ITEMS,
  LOOT,
  getUnlockedCombatActions,
  getInventoryItemKey,
  getItemConsumable,
  getNpcDisposition,
  isAttackableNpcRole,
  isCombatActionUnlocked,
  normalizeAvatarSeed,
  setWorldCollisionPlacementOverrides,
  stableHash,
  type ActionId,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientEmote,
  type ClientEquipItem,
  type ClientLootCorpse,
  type ClientRegisterChainGear,
  type ClientSelectTalent,
  type ClientUpdateTraits,
  type ClientUnequipItem,
  type ClientUseItem,
  type CombatActionId,
  type EmoteId,
  type CombatEvent,
  type ExperienceEvent,
  type JoinOptions,
  type ItemId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import {
  fetchWalletAuthChallenge,
  fetchWalletCharacterProfile,
  getStoredInviteCode,
  getStoredName,
  makeGuestIdentity,
  makeWalletIdentity,
  rememberInviteCode,
  rememberName,
} from "./auth/identity";
import {
  getAvailableWalletConnectorChoices,
  getPreferredWalletConnector,
  getWalletConnectFailureMessage,
  getWalletConnectorChoices,
  getWalletConnectorLabel,
} from "./auth/walletConnectors";
import {
  canCreateWalletCharacterAfterProfileError,
  canEnterWalletCharacter,
  canRetryWalletProfile,
  getExistingWalletCharacter,
  getWalletEntryLabel,
  isWalletProfilePending,
  type WalletProfileState,
} from "./auth/walletProfile";
import { initializeAnalytics, trackEvent, type AnalyticsProperties } from "./analytics";
import { useTownRoom } from "./game/useTownRoom";
import { TownScene, type MobileMoveInput } from "./game/TownScene";
import { Skybox, TownWorld } from "./game/scene/TownWorld";
import { Hud } from "./components/Hud";
import { DebugPlacementEditor } from "./components/DebugPlacementEditor";
import { MobileControls } from "./components/MobileControls";
import { MferHeadLoader } from "./components/MferHeadLoader";
import { MferPortrait } from "./components/MferPortrait";
import { TraitsPanel } from "./components/TraitsPanel";
import { getActionSlotKey, type ActionSlot, type ItemActionSlot, isItemActionSlot, makeItemActionSlot } from "./components/hud/types";
import {
  DEBUG_PLACEMENT_STORAGE_KEY,
  DEBUG_WORLD_PLACEMENT_TARGETS,
  type DebugPlacementOverrides,
  type DebugPlacementTarget,
  type DebugPlacementValue,
  makeNpcDebugPlacementTargets,
} from "./game/debugPlacement";
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings, type GameSettings } from "./game/settings";
import { getClientRenderPerformanceProfile } from "./game/performance";
import {
  GameAudio,
  getCombatImpactCue,
  getCombatSpatialVolume,
  getCombatStartCue,
  getExperienceSpatialVolume,
} from "./game/audio";
import { generateRandomMferTraits, resolveMferTraitsForPlayer, SARTOSHI_MFER_TRAITS } from "./game/mferTraits";
import {
  DEFAULT_SWAP_ETH_AMOUNT,
  DEFAULT_SWAP_SLIPPAGE_PERCENT,
  MFERGPT_BASE_TOKEN_ADDRESS,
  executeMferGptSwap,
  formatMferGptCompact,
  formatSwapPrice,
  getBaseScanTxUrl,
  getMferGptSwapQuote,
  makeMferGptUniswapUrl,
  normalizeSlippageInput,
  normalizeSwapAmountInput,
  type MferGptSwapQuote,
} from "./crypto/mferGptSwap";

const ACTION_SLOT_COUNT = 8;
const DEFAULT_ACTION_SLOTS: ActionSlot[] = ["attack", null, null, null, null, null, null, null];
const ACTION_SLOT_STORAGE_KEY = "mferland:actionSlots:v4";
const GAME_SETTINGS_STORAGE_KEY = "mferland:settings:v1";
const HIDDEN_CAPTURE_NAMEPLATES = {
  localPlayer: false,
  otherPlayers: false,
  friendlyNpcs: false,
  unfriendlyNpcs: false,
  healthBars: false,
};
const EMPTY_CAPTURE_CHAT_BUBBLES: never[] = [];
const REAL_CAPTURE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_REAL_CAPTURE === "1";
const CRYPTO_STORE_NPC_IDS = new Set(["crypto-mfer"]);
const SWAP_MFER_NPC_IDS = new Set(["swap-mfer"]);
const TRAITS_MFER_NPC_IDS = new Set(["traits-mfer"]);
const DEBUG_TRAVEL_DESTINATIONS = [
  { id: "gate", label: "Gate", x: 0, z: -10, yaw: Math.PI },
  { id: "plaza", label: "Plaza", x: 0, z: -8, yaw: 0 },
  { id: "drip", label: "Drip", x: -12, z: 15, yaw: -2.35 },
  { id: "crypto", label: "Crypto", x: 3.8, z: 22, yaw: 0 },
  { id: "traits", label: "Traits", x: -3.7, z: 24, yaw: 0 },
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
type DebugPlacementStoredRecord = DebugPlacementValue & {
  kind?: DebugPlacementTarget["kind"];
  label?: string;
  source?: string;
};
type DebugPlacementStoredRecordMap = Record<string, DebugPlacementStoredRecord>;
type DebugPlacementSaveStatus = {
  state: "idle" | "saving" | "saved" | "error";
  message: string;
};
type MoveUnlockNotice = {
  id: number;
  actionId: CombatActionId;
  level: number;
  buttonIndex: number | null;
};
type QueuedMoveUnlockNotice = Omit<MoveUnlockNotice, "id">;

function isRealCaptureMode() {
  if (!REAL_CAPTURE_ENABLED) return false;
  return new URLSearchParams(window.location.search).get("realCapture") === "1";
}

function isCryptoSmokeMode() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("cryptoSmoke") === "1";
}

function isInviteRequired() {
  return import.meta.env.VITE_REQUIRE_INVITE === "1";
}

function getLinkedInviteCode() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("invite")?.trim() || params.get("code")?.trim() || "";
}

function getInitialInviteCode() {
  return getLinkedInviteCode() || getStoredInviteCode();
}

function isCryptoStoreEnabled() {
  return import.meta.env.VITE_ENABLE_CRYPTO_STORE === "1";
}

function makeCreationSeed() {
  return normalizeAvatarSeed(stableHash(`character:${Date.now()}:${Math.random()}`));
}

function isCryptoStoreNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return Boolean(npc && CRYPTO_STORE_NPC_IDS.has(npc.id));
}

function isSwapMferNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return Boolean(npc && SWAP_MFER_NPC_IDS.has(npc.id));
}

function isTraitsMferNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return Boolean(npc && TRAITS_MFER_NPC_IDS.has(npc.id));
}

export function App() {
  const [identity, setIdentity] = useState<JoinOptions | null>(null);
  const [savedDebugPlacementDefaults, setSavedDebugPlacementDefaults] = useState<DebugPlacementOverrides>({});

  useEffect(() => {
    initializeAnalytics();
    trackEvent("app_loaded", { mode: import.meta.env.DEV ? "dev" : "prod" }, { local: true });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || identity) return;
    const params = new URLSearchParams(window.location.search);
    if (!isRealCaptureMode()) return;
    const name = params.get("name")?.trim() || "capture mfer";
    setIdentity(makeGuestIdentity(name));
  }, [identity]);

  useEffect(() => {
    const abortController = new AbortController();
    void fetchDebugPlacementMap(abortController.signal)
      .then((document) => {
        if (abortController.signal.aborted) return;
        setSavedDebugPlacementDefaults(normalizeDebugPlacementOverridesFromRecordMap(getUnknownRecordProperty(document, "placements")));
      })
      .catch(() => {
        if (!abortController.signal.aborted) setSavedDebugPlacementDefaults({});
      });

    return () => abortController.abort();
  }, []);

  if (!identity) {
    return <AuthGate onEnter={setIdentity} debugPlacementOverrides={savedDebugPlacementDefaults} />;
  }

  return (
    <GameShell
      identity={identity}
      initialSavedDebugPlacementDefaults={savedDebugPlacementDefaults}
      onSavedDebugPlacementDefaultsChange={setSavedDebugPlacementDefaults}
      onExit={() => setIdentity(null)}
    />
  );
}

function AuthGate({
  onEnter,
  debugPlacementOverrides,
}: {
  onEnter: (identity: JoinOptions) => void;
  debugPlacementOverrides: DebugPlacementOverrides;
}) {
  const [name, setName] = useState(() => getStoredName());
  const { address, isConnected } = useAccount();
  const { connect, connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect, disconnectAsync, isPending: isDisconnectPending } = useDisconnect();
  const { signMessageAsync, isPending: isSignMessagePending } = useSignMessage();
  const walletConnectorChoices = useMemo(() => getWalletConnectorChoices(connectors), [connectors]);
  const injected = walletConnectorChoices.find((connector) => connector.id === "injected");
  const localTestConnector = connectors.find((connector) => connector.id === "mock");
  const [isSwitchingWallet, setIsSwitchingWallet] = useState(false);
  const [walletActionError, setWalletActionError] = useState<string | null>(null);
  const [showWalletConnectors, setShowWalletConnectors] = useState(false);
  const [inviteCode, setInviteCode] = useState(() => getInitialInviteCode());
  const [walletProfile, setWalletProfile] = useState<WalletProfileState>({ status: "idle" });
  const [isWalletAuthPending, setIsWalletAuthPending] = useState(false);
  const walletProfileRequestRef = useRef(0);
  const trackedMainMenuRef = useRef(false);
  const trackedWalletAddressRef = useRef("");
  const [creationSeed, setCreationSeed] = useState(() => makeCreationSeed());
  const [previewReady, setPreviewReady] = useState(false);
  const [loaderComplete, setLoaderComplete] = useState(false);
  const authGraphicsQuality = useMemo(() => readStoredGameSettings().graphicsQuality, []);
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(authGraphicsQuality), [authGraphicsQuality]);
  const cryptoSmokeMode = isCryptoSmokeMode();
  const handlePreviewReady = useCallback(() => setPreviewReady(true), []);
  const handleLoaderComplete = useCallback(() => setLoaderComplete(true), []);
  const showAuthLoader = !cryptoSmokeMode && (!previewReady || !loaderComplete);
  const inviteRequired = isInviteRequired();
  const hasInviteCode = inviteCode.trim() !== "";

  const existingCharacter = getExistingWalletCharacter(walletProfile);
  const cleanName = existingCharacter?.name ?? (name.trim() || getStoredName());
  const creationTraits = useMemo(() => generateRandomMferTraits(creationSeed), [creationSeed]);
  const walletProfileLoading = isWalletProfilePending(isConnected, walletProfile);
  const walletProfileError = walletProfile.status === "error" ? walletProfile.message : null;
  const walletNeedsCreation = isConnected && walletProfile.status === "new";
  const canCreateAfterProfileError = canCreateWalletCharacterAfterProfileError({
    hasAddress: Boolean(address),
    profilePending: walletProfileLoading,
    profileError: Boolean(walletProfileError),
    inviteRequired,
    hasInviteCode,
    cleanName,
  });
  const canEnterWallet = canEnterWalletCharacter({
    hasAddress: Boolean(address),
    profilePending: walletProfileLoading,
    profileError: Boolean(walletProfileError),
    inviteRequired,
    hasInviteCode,
    needsCreation: walletNeedsCreation,
    cleanName,
  });
  const walletEntryLabel = getWalletEntryLabel({
    profilePending: walletProfileLoading,
    profileError: Boolean(walletProfileError),
    needsCreation: walletNeedsCreation,
    hasExistingCharacter: Boolean(existingCharacter),
  });
  const canRetryWallet = canRetryWalletProfile({
    hasAddress: Boolean(address),
    profilePending: walletProfileLoading,
    profileError: Boolean(walletProfileError),
  });
  const walletSignaturePending = isWalletAuthPending || isSignMessagePending;
  const walletPrimaryDisabled = isSwitchingWallet || isDisconnectPending || walletSignaturePending || (!canEnterWallet && !canRetryWallet);
  const walletFallbackDisabled = isSwitchingWallet || isDisconnectPending || walletSignaturePending || !canCreateAfterProfileError;
  const hasInjectedProvider = hasInjectedEthereumProvider();
  const availableWalletConnectorChoices = useMemo(
    () => getAvailableWalletConnectorChoices(walletConnectorChoices, { hasInjectedProvider }),
    [hasInjectedProvider, walletConnectorChoices],
  );
  const walletConnectDisabled = isConnectPending || availableWalletConnectorChoices.length === 0;

  const loadWalletProfile = useCallback(async (walletAddress: string) => {
    const requestId = walletProfileRequestRef.current + 1;
    walletProfileRequestRef.current = requestId;
    setWalletProfile({ status: "loading" });
    setWalletActionError(null);

    try {
      const profile = await fetchWalletCharacterProfile(walletAddress);
      if (walletProfileRequestRef.current !== requestId) return;
      if (profile.exists && profile.character) {
        setWalletProfile({ status: "existing", character: profile.character });
        setName(profile.character.name);
        return;
      }
      setWalletProfile({ status: "new" });
      setCreationSeed(makeCreationSeed());
    } catch (error) {
      if (walletProfileRequestRef.current !== requestId) return;
      setWalletProfile({
        status: "error",
        message: error instanceof Error ? error.message : "wallet persistence unavailable",
      });
    }
  }, []);

  useEffect(() => {
    const linkedInvite = getLinkedInviteCode();
    if (!linkedInvite) return;
    rememberInviteCode(linkedInvite);
    setInviteCode(linkedInvite);
  }, []);

  useEffect(() => {
    if (trackedMainMenuRef.current) return;
    trackedMainMenuRef.current = true;
    trackEvent("main_menu_viewed", {
      inviteRequired,
      invitePresent: hasInviteCode,
      walletConnected: isConnected,
    }, {
      local: true,
      identityType: isConnected ? "wallet" : "",
      walletAddress: address ?? "",
    });
  }, [address, hasInviteCode, inviteRequired, isConnected]);

  useEffect(() => {
    if (!isConnected || !address) {
      walletProfileRequestRef.current += 1;
      setWalletProfile({ status: "idle" });
      return;
    }

    void loadWalletProfile(address);
    return () => {
      walletProfileRequestRef.current += 1;
    };
  }, [address, isConnected, loadWalletProfile]);

  useEffect(() => {
    if (isConnected) setShowWalletConnectors(false);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || !address) {
      trackedWalletAddressRef.current = "";
      return;
    }
    trackWalletConnected(address, {
      surface: "auth",
      source: "account_state",
    }, { google: false });
  }, [address, isConnected]);

  function trackWalletConnected(
    walletAddress: string,
    properties: AnalyticsProperties,
    options: { google?: boolean } = {},
  ) {
    const normalizedAddress = walletAddress.toLowerCase();
    const local = Boolean(normalizedAddress && trackedWalletAddressRef.current !== normalizedAddress);
    if (local) trackedWalletAddressRef.current = normalizedAddress;
    trackEvent("wallet_connect_succeeded", properties, {
      google: options.google,
      local,
      identityType: "wallet",
      walletAddress,
    });
  }

  async function enterWallet({ forceCreate = false, allowProfileError = false } = {}) {
    if (!address) return;
    const inviteNeededForWalletCreation = inviteRequired && !existingCharacter && (walletNeedsCreation || forceCreate);
    if (inviteNeededForWalletCreation && !hasInviteCode) return;
    if (walletSignaturePending) return;
    if (allowProfileError) {
      if (!canCreateAfterProfileError) return;
    } else if (!canEnterWallet) {
      return;
    }

    setIsWalletAuthPending(true);
    setWalletActionError(null);
    try {
      const challenge = await fetchWalletAuthChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      rememberInviteCode(inviteCode);
      rememberName(cleanName);
      trackEvent("auth_enter_wallet", {
        inviteRequired,
        invitePresent: hasInviteCode,
        profileFallback: forceCreate ? allowProfileError : false,
        needsCreation: walletNeedsCreation || forceCreate,
      }, { local: true, identityType: "wallet", walletAddress: address });
      onEnter(makeWalletIdentity(
        cleanName,
        address,
        existingCharacter?.avatarSeed ?? creationSeed,
        walletNeedsCreation || forceCreate,
        {
          nonce: challenge.nonce,
          message: challenge.message,
          signature,
        },
      ));
    } catch (error) {
      if (!isUserRejectedWalletRequest(error)) {
        setWalletActionError(error instanceof Error ? error.message : "wallet signature failed");
      }
    } finally {
      setIsWalletAuthPending(false);
    }
  }

  function handleWalletPrimaryAction() {
    if (canRetryWallet && address) {
      trackEvent("wallet_profile_retry", { surface: "auth" }, { local: true, identityType: "wallet", walletAddress: address });
      void loadWalletProfile(address);
      return;
    }
    void enterWallet();
  }

  function handleWalletCreateFallback() {
    trackEvent("wallet_profile_create_fallback", { surface: "auth" }, { local: true, identityType: "wallet", walletAddress: address ?? "" });
    void enterWallet({ forceCreate: true, allowProfileError: true });
  }

  function handleConnectWallet() {
    const currentHasInjectedProvider = hasInjectedEthereumProvider();
    const connectableWalletConnectors = getAvailableWalletConnectorChoices(walletConnectorChoices, {
      hasInjectedProvider: currentHasInjectedProvider,
    });
    const preferredConnector = getPreferredWalletConnector(connectableWalletConnectors, {
      hasInjectedProvider: currentHasInjectedProvider,
      isMobileBrowser: isMobileBrowser(),
    });
    if (!preferredConnector) return;

    if (connectableWalletConnectors.length > 1 && !currentHasInjectedProvider) {
      setWalletActionError(null);
      setShowWalletConnectors((current) => !current);
      return;
    }

    connectWallet(preferredConnector);
  }

  function connectWallet(connector: Connector) {
    setShowWalletConnectors(false);
    setWalletActionError(null);
    trackEvent("wallet_connect_started", { surface: "auth", connector: connector.id }, { local: true });
    connect({ connector }, {
      onSuccess: (data) => trackWalletConnected(getConnectedWalletAddress(data), { surface: "auth", connector: connector.id }),
      onError: (error) => {
        if (!isUserRejectedWalletRequest(error)) {
          setWalletActionError(getWalletConnectFailureMessage(connector));
        }
        trackEvent("wallet_connect_failed", { surface: "auth", connector: connector.id }, { local: true });
      },
    });
  }

  function connectLocalTestWallet() {
    if (!localTestConnector) return;
    trackEvent("wallet_connect_started", { surface: "auth", connector: localTestConnector.id, chainId: 31337 }, { local: true });
    connect({ connector: localTestConnector, chainId: 31337 }, {
      onSuccess: (data) => trackWalletConnected(getConnectedWalletAddress(data), { surface: "auth", connector: localTestConnector.id, chainId: 31337 }),
      onError: () => trackEvent("wallet_connect_failed", { surface: "auth", connector: localTestConnector.id, chainId: 31337 }, { local: true }),
    });
  }

  async function switchWallet() {
    if (!injected || !hasInjectedEthereumProvider() || isSwitchingWallet) return;

    setIsSwitchingWallet(true);
    setWalletActionError(null);
    trackEvent("wallet_switch_started", { surface: "auth", connector: injected.id }, { local: true, identityType: "wallet", walletAddress: address ?? "" });
    try {
      const promptedAccountPicker = await requestInjectedAccountSelection();
      if (!promptedAccountPicker) {
        await disconnectAsync().catch(() => undefined);
        await connectAsync({ connector: injected });
      }
      trackEvent("wallet_switch_succeeded", { surface: "auth", connector: injected.id }, { local: true, identityType: "wallet", walletAddress: address ?? "" });
    } catch (error) {
      if (!isUserRejectedWalletRequest(error)) {
        setWalletActionError("wallet switch failed");
      }
      trackEvent("wallet_switch_failed", { surface: "auth", connector: injected.id }, { local: true, identityType: "wallet", walletAddress: address ?? "" });
    } finally {
      setIsSwitchingWallet(false);
    }
  }

  function disconnectWallet() {
    setWalletActionError(null);
    trackEvent("wallet_disconnected", { surface: "auth" }, { local: true, identityType: "wallet", walletAddress: address ?? "" });
    disconnect();
  }

  return (
    <main className="auth-screen">
      <div className="auth-bg" aria-hidden="true">
        {!cryptoSmokeMode && (
          <Canvas
            className="auth-town-canvas"
            dpr={renderProfile.previewDpr}
            camera={{ position: [0, 7.2, 17.6], fov: 42, near: 0.1, far: 130 }}
            gl={{ antialias: renderProfile.antialias, powerPreference: renderProfile.powerPreference }}
          >
            <AuthTownPreview debugPlacementOverrides={debugPlacementOverrides} renderProfile={renderProfile} onReady={handlePreviewReady} />
          </Canvas>
        )}
        <div className="auth-scene-vignette" />
      </div>
      {showAuthLoader && <MferHeadLoader ready={previewReady} renderProfile={renderProfile} onComplete={handleLoaderComplete} />}
      <section className="auth-title-lockup" aria-label="mferland">
        <div className="brand-mark">
          <MferPortrait traits={SARTOSHI_MFER_TRAITS} background="orange" variant="full" title="sartoshi mfer portrait" />
        </div>
        <div>
          <h1>mferland</h1>
          <p>officially unofficial plaza build</p>
        </div>
      </section>

      <MferGptSwapMenu />

      <section className="auth-connect-panel">
        <label className="name-field">
          <span>{existingCharacter ? "saved name" : "name"}</span>
          <input
            value={name}
            maxLength={18}
            disabled={Boolean(existingCharacter)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {isConnected && address && (
          <div className="connected-wallet-card" title={address}>
            <span>connected wallet</span>
            <code>{address}</code>
          </div>
        )}

        {existingCharacter && (
          <div className="character-auth-panel">
            <MferPortrait
              traits={resolveMferTraitsForPlayer(existingCharacter.avatarSeed, existingCharacter.appearanceTraits)}
              variant="clear"
              title={`${existingCharacter.name} portrait`}
            />
            <div>
              <span>saved mfer</span>
              <strong>{existingCharacter.name}</strong>
              <em>level {existingCharacter.level}</em>
            </div>
          </div>
        )}

        {walletNeedsCreation && (
          <div className="character-auth-panel create">
            <MferPortrait traits={creationTraits} variant="clear" title="new mfer portrait" />
            <div>
              <span>new wallet</span>
              <strong>{cleanName}</strong>
              <button className="text-btn compact" type="button" onClick={() => setCreationSeed(makeCreationSeed())}>
                <RefreshCw size={15} />
                roll look
              </button>
            </div>
          </div>
        )}

        <div className="auth-actions">
          {isConnected && address ? (
            <>
              <button className="primary-btn wallet" type="button" onClick={handleWalletPrimaryAction} disabled={walletPrimaryDisabled}>
                <Gem size={18} />
                {walletSignaturePending ? "signing wallet" : walletEntryLabel}
              </button>
              {walletProfileError && (
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={handleWalletCreateFallback}
                  disabled={walletFallbackDisabled}
                >
                  <Sparkles size={18} />
                  {walletSignaturePending ? "signing wallet" : "enter or create mfer"}
                </button>
              )}
              <button
                className="secondary-btn"
                type="button"
                disabled={!injected || !hasInjectedProvider || isConnectPending || isDisconnectPending || isSwitchingWallet}
                onClick={() => void switchWallet()}
              >
                <RefreshCw size={18} />
                {isSwitchingWallet ? "switching wallet" : "switch wallet"}
              </button>
              <button className="text-btn" type="button" disabled={isDisconnectPending} onClick={disconnectWallet}>
                <LogOut size={16} />
                disconnect
              </button>
            </>
          ) : (
            <>
              <button
                className="primary-btn wallet"
                type="button"
                disabled={walletConnectDisabled}
                aria-expanded={showWalletConnectors}
                onClick={handleConnectWallet}
              >
                <Sparkles size={18} />
                {isConnectPending ? "connecting wallet" : "connect wallet"}
              </button>
              {showWalletConnectors && availableWalletConnectorChoices.length > 1 && (
                <div className="wallet-choice-list" aria-label="wallet choices">
                  {availableWalletConnectorChoices.map((connector) => (
                    <button
                      key={connector.uid}
                      className="wallet-choice-btn"
                      type="button"
                      disabled={isConnectPending}
                      onClick={() => connectWallet(connector)}
                    >
                      {getWalletConnectorLabel(connector)}
                    </button>
                  ))}
                </div>
              )}
              {import.meta.env.DEV && localTestConnector && (
                <button
                  className="text-btn"
                  type="button"
                  disabled={isConnectPending}
                  onClick={connectLocalTestWallet}
                >
                  <Sparkles size={16} />
                  local test wallet
                </button>
              )}
            </>
          )}
        </div>
        {inviteRequired && !hasInviteCode && !existingCharacter && <p className="wallet-action-error">use your invite link to create a test mfer</p>}
        {walletProfileError && <p className="wallet-action-error">{walletProfileError}</p>}
        {walletActionError && <p className="wallet-action-error">{walletActionError}</p>}
      </section>
    </main>
  );
}

type MferGptSwapMenuProps = {
  defaultExpanded?: boolean;
  onClose?: () => void;
  surface?: string;
  variant?: "auth" | "npc";
};

function MferGptSwapMenu({
  defaultExpanded = false,
  onClose,
  surface = "auth",
  variant = "auth",
}: MferGptSwapMenuProps = {}) {
  const [ethAmount, setEthAmount] = useState(DEFAULT_SWAP_ETH_AMOUNT);
  const [slippagePercent, setSlippagePercent] = useState(DEFAULT_SWAP_SLIPPAGE_PERCENT);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedContract, setCopiedContract] = useState(false);
  const [quote, setQuote] = useState<MferGptSwapQuote | null>(null);
  const [swapStatus, setSwapStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const quoteRequestRef = useRef(0);
  const swapUrl = useMemo(() => makeMferGptUniswapUrl(ethAmount), [ethAmount]);
  const canSwap = !isSwapping && !isQuoting && Boolean(ethAmount.trim());

  useEffect(() => {
    if (!ethAmount.trim()) {
      setQuote(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshQuote({ quiet: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ethAmount, slippagePercent]);

  function updateEthAmount(value: string) {
    setEthAmount(normalizeSwapAmountInput(value));
    setTxHash("");
  }

  function updateSlippagePercent(value: string) {
    setSlippagePercent(normalizeSlippageInput(value));
    setTxHash("");
  }

  function trackSwapOpen() {
    trackEvent("mfergpt_swap_opened", {
      surface,
      amountSet: ethAmount.trim() !== "",
    }, {
      local: true,
    });
  }

  function openSwapPanel() {
    setIsExpanded(true);
    trackEvent("mfergpt_swap_panel_opened", {
      surface,
      amountSet: ethAmount.trim() !== "",
    }, {
      local: true,
    });
  }

  function closeSwapPanel() {
    setIsExpanded(false);
    trackEvent("mfergpt_swap_panel_closed", {
      surface,
      amountSet: ethAmount.trim() !== "",
      quoted: Boolean(quote),
      txStarted: Boolean(txHash),
    }, {
      local: true,
    });
    onClose?.();
  }

  async function refreshQuote(options: { quiet?: boolean } = {}) {
    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    if (!options.quiet) setSwapStatus("checking pool...");
    setIsQuoting(true);
    try {
      const nextQuote = await getMferGptSwapQuote(ethAmount, slippagePercent);
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(nextQuote);
      if (!options.quiet) setSwapStatus("quote refreshed");
      return nextQuote;
    } catch (error) {
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(null);
      setSwapStatus(getSwapErrorMessage(error));
      return null;
    } finally {
      if (quoteRequestRef.current === requestId) setIsQuoting(false);
    }
  }

  async function runSwap() {
    const provider = getInjectedEthereumProvider();
    if (!provider) {
      setSwapStatus("wallet required");
      trackEvent("mfergpt_swap_failed", { surface, error: "wallet required" }, { local: true });
      return;
    }

    setIsSwapping(true);
    setTxHash("");
    setSwapStatus("checking pool...");
    trackEvent("mfergpt_swap_started", { surface }, { local: true });
    try {
      const nextQuote = await getMferGptSwapQuote(ethAmount, slippagePercent);
      setQuote(nextQuote);
      setSwapStatus("confirm in wallet");
      const nextTxHash = await executeMferGptSwap(provider, nextQuote);
      setTxHash(nextTxHash);
      setSwapStatus("swap confirmed");
      trackEvent("mfergpt_swap_confirmed", {
        surface,
        slippageBps: nextQuote.slippageBps,
      }, {
        local: true,
      });
    } catch (error) {
      const message = getSwapErrorMessage(error);
      setSwapStatus(message);
      trackEvent("mfergpt_swap_failed", { surface, error: message }, { local: true });
    } finally {
      setIsSwapping(false);
    }
  }

  async function copyContractAddress() {
    try {
      await navigator.clipboard.writeText(MFERGPT_BASE_TOKEN_ADDRESS);
      setCopiedContract(true);
      window.setTimeout(() => setCopiedContract(false), 1600);
      trackEvent("mfergpt_swap_contract_copied", { surface }, { local: true });
    } catch {
      setCopiedContract(false);
    }
  }

  return (
    <section className={`auth-swap-panel mfergpt-swap-menu ${variant === "npc" ? "in-game-swap-panel" : ""}${isExpanded ? " expanded" : ""}`} aria-label="swap ETH to MFERGPT">
      <button className="auth-swap-toggle" type="button" aria-expanded={isExpanded} onClick={openSwapPanel}>
        <ArrowDownUp size={18} />
        <span>swap</span>
      </button>

      <div className="auth-swap-card">
        <header className="auth-swap-header">
          <div>
            <span>base swap</span>
            <strong>ETH to $MFERGPT</strong>
          </div>
          <button className="auth-swap-close" type="button" aria-label="close swap" onClick={closeSwapPanel}>
            <X size={16} />
          </button>
        </header>

        <label className="swap-amount-field">
          <span>you send</span>
          <div>
            <input
              aria-label="ETH amount"
              inputMode="decimal"
              placeholder="0.01"
              value={ethAmount}
              onChange={(event) => updateEthAmount(event.target.value)}
            />
            <em>BASE ETH</em>
          </div>
        </label>

        <div className="swap-field-grid">
          <label className="swap-mini-field">
            <span>max slip</span>
            <div>
              <input
                aria-label="Max slippage percent"
                inputMode="decimal"
                value={slippagePercent}
                onChange={(event) => updateSlippagePercent(event.target.value)}
              />
              <em>%</em>
            </div>
          </label>
          <button className="swap-refresh-btn" type="button" disabled={isQuoting || isSwapping} onClick={() => void refreshQuote()}>
            <RefreshCw size={15} />
            quote
          </button>
        </div>

        <div className="swap-summary-row" aria-live="polite">
          <span>you get</span>
          <strong>{quote ? `~${formatMferGptCompact(quote.estimatedAmountOutWei)}` : "--"}</strong>
          <em>{quote ? `min ${formatMferGptCompact(quote.minAmountOutWei)} / ${formatSwapPrice(quote.priceNative)}` : "Uniswap v4 pool"}</em>
        </div>

        <div className="swap-route-row">
          <span>uniswap</span>
          <code title={MFERGPT_BASE_TOKEN_ADDRESS}>{shortAddress(MFERGPT_BASE_TOKEN_ADDRESS)}</code>
          <button type="button" title="copy contract" aria-label="copy MFERGPT contract address" onClick={() => void copyContractAddress()}>
            {copiedContract ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>

        <button className="auth-swap-action" type="button" disabled={!canSwap} onClick={() => void runSwap()}>
          <span>{isSwapping ? "swapping..." : isQuoting ? "quoting..." : "swap now"}</span>
          <ArrowDownUp size={16} />
        </button>
        <div className="swap-footer-row">
          <span className="swap-status" aria-live="polite">{swapStatus}</span>
          {txHash ? (
            <a href={getBaseScanTxUrl(txHash)} target="_blank" rel="noreferrer noopener">
              basescan
              <ExternalLink size={13} />
            </a>
          ) : (
            <a href={swapUrl} target="_blank" rel="noreferrer noopener" onClick={trackSwapOpen}>
              fallback
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getConnectedWalletAddress(data: unknown) {
  const accounts = (data as { accounts?: readonly unknown[] } | null)?.accounts;
  const firstAccount = accounts?.[0];
  return typeof firstAccount === "string" ? firstAccount : "";
}

function getSwapErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "swap failed";
  const maybeError = error as { code?: unknown; cause?: unknown; shortMessage?: unknown; message?: unknown };
  if (isUserRejectedWalletRequest(error)) return "swap rejected";
  if (typeof maybeError.shortMessage === "string") return maybeError.shortMessage.toLowerCase();
  if (typeof maybeError.message === "string") return maybeError.message.toLowerCase();
  if (maybeError.cause) return getSwapErrorMessage(maybeError.cause);
  return "swap failed";
}

type EthereumRequestProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function requestInjectedAccountSelection() {
  const ethereum = getInjectedEthereumProvider();
  if (!ethereum) return false;

  try {
    await ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (isUnsupportedWalletPermissionRequest(error)) return false;
    throw error;
  }
  return true;
}

function getInjectedEthereumProvider(): EthereumRequestProvider | null {
  if (typeof window === "undefined") return null;

  const maybeWindow = window as Window & { ethereum?: Partial<EthereumRequestProvider> };
  if (typeof maybeWindow.ethereum?.request !== "function") return null;
  return maybeWindow.ethereum as EthereumRequestProvider;
}

function hasInjectedEthereumProvider() {
  return Boolean(getInjectedEthereumProvider());
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const isiPadDesktopMode = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  return isiPadDesktopMode || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

function isUserRejectedWalletRequest(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; name?: unknown; shortMessage?: unknown; message?: unknown };
  if (maybeError.code === 4001) return true;
  if (typeof maybeError.name === "string" && maybeError.name.includes("UserRejected")) return true;
  if (isUserRejectedWalletRequest(maybeError.cause)) return true;

  const message = typeof maybeError.shortMessage === "string" ? maybeError.shortMessage : maybeError.message;
  return typeof message === "string" && /user rejected|user denied|request rejected|user closed modal|accounts received is empty/i.test(message);
}

function isUnsupportedWalletPermissionRequest(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (maybeError.code === -32601 || maybeError.code === 4200) return true;
  if (isUnsupportedWalletPermissionRequest(maybeError.cause)) return true;
  return typeof maybeError.message === "string" && /unsupported|not supported|method not found/i.test(maybeError.message);
}

function AuthTownPreview({
  debugPlacementOverrides,
  renderProfile,
  onReady,
}: {
  debugPlacementOverrides: DebugPlacementOverrides;
  renderProfile: ReturnType<typeof getClientRenderPerformanceProfile>;
  onReady: () => void;
}) {
  return (
    <>
      <fog attach="fog" args={["#b7dce9", 32, 92]} />
      <ambientLight intensity={1.08} />
      <hemisphereLight args={["#f4fbff", "#8da16f", 0.82]} />
      <directionalLight position={[-10, 18, 8]} intensity={1.45} color="#fff3d3" />
      <Skybox renderProfile={renderProfile} />
      <Suspense fallback={null}>
        <TownWorld debugPlacementOverrides={debugPlacementOverrides} renderProfile={renderProfile} />
        <SceneReadySignal onReady={onReady} />
      </Suspense>
      <AuthPreviewCamera />
    </>
  );
}

function SceneReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
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

function GameShell({
  identity,
  initialSavedDebugPlacementDefaults,
  onSavedDebugPlacementDefaultsChange,
  onExit,
}: {
  identity: JoinOptions;
  initialSavedDebugPlacementDefaults: DebugPlacementOverrides;
  onSavedDebugPlacementDefaultsChange: (overrides: DebugPlacementOverrides) => void;
  onExit: () => void;
}) {
  const room = useTownRoom(identity);
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(null);
  const [cryptoStoreNpcId, setCryptoStoreNpcId] = useState<string | null>(null);
  const [swapNpcId, setSwapNpcId] = useState<string | null>(null);
  const [traitsNpcId, setTraitsNpcId] = useState<string | null>(null);
  const [actionSlots, setActionSlots] = useState<ActionSlot[]>(() => readStoredActionSlots());
  const [actionError, setActionError] = useState<{ id: number; text: string } | null>(null);
  const globalCooldownReadyAt = 0;
  const [moveUnlockNotices, setMoveUnlockNotices] = useState<MoveUnlockNotice[]>([]);
  const [debugTravelView, setDebugTravelView] = useState<DebugTravelView | null>(null);
  const [settings, setSettings] = useState<GameSettings>(() => readStoredGameSettings());
  const [debugPlacementOverrides, setDebugPlacementOverrides] = useState<DebugPlacementOverrides>(() => readStoredDebugPlacementOverrides());
  const [savedDebugPlacementDefaults, setSavedDebugPlacementDefaults] = useState<DebugPlacementOverrides>(initialSavedDebugPlacementDefaults);
  const [sourceDebugPlacementDefaults, setSourceDebugPlacementDefaults] = useState<DebugPlacementStoredRecordMap>({});
  const [selectedDebugPlacementId, setSelectedDebugPlacementId] = useState<string | null>(null);
  const [debugPlacementPanelOpen, setDebugPlacementPanelOpen] = useState(false);
  const [debugPlacementSaveStatus, setDebugPlacementSaveStatus] = useState<DebugPlacementSaveStatus>({ state: "idle", message: "" });
  const actionErrorIdRef = useRef(0);
  const moveUnlockNoticeIdRef = useRef(0);
  const unlockedActionKeyRef = useRef("");
  const mobileMoveInputRef = useRef<MobileMoveInput>({ active: false, forward: 0, right: 0, sprint: false });
  const pendingDebugPlacementSaveRef = useRef<{
    placements: DebugPlacementOverrides;
    sourceDefaults: DebugPlacementStoredRecordMap;
  } | null>(null);
  const audio = useMemo(() => new GameAudio(), []);
  const renderProfile = useMemo(() => getClientRenderPerformanceProfile(settings.graphicsQuality), [settings.graphicsQuality]);
  const playedCombatEventIdsRef = useRef(new Set<string>());
  const playedExperienceEventIdsRef = useRef(new Set<string>());
  const lastQuestNoticeIdRef = useRef("");
  const lastLootNoticeIdRef = useRef("");
  const trackedGameSessionIdRef = useRef("");
  const combatAudioTimeoutsRef = useRef<number[]>([]);
  const realCaptureRoomRef = useRef(room);
  const realCaptureSelectedTargetRef = useRef<TargetSelection | null>(null);
  const debugToolsAvailable = import.meta.env.DEV;
  const cryptoSmokeMode = isCryptoSmokeMode();
  const cryptoStoreEnabled = isCryptoStoreEnabled();
  const debugTravelDestinations = useMemo(
    () => cryptoStoreEnabled
      ? DEBUG_TRAVEL_DESTINATIONS
      : DEBUG_TRAVEL_DESTINATIONS.filter((destination) => destination.id !== "crypto"),
    [cryptoStoreEnabled],
  );
  const localPlayer = room.sessionId ? room.players.get(room.sessionId) : undefined;
  const playerCount = room.players.size;
  const hudIdentity = useMemo(() => ({
    name: localPlayer?.name || identity.name || "mfer",
    avatarSeed: localPlayer?.avatarSeed || identity.avatarSeed || 1,
    walletAddress: localPlayer?.walletAddress || identity.walletAddress || "",
  }), [
    identity.avatarSeed,
    identity.name,
    identity.walletAddress,
    localPlayer?.avatarSeed,
    localPlayer?.name,
    localPlayer?.walletAddress,
  ]);
  const selectedTargetUnit = useMemo(
    () => getSelectedTargetUnit(selectedTarget, room.players, room.npcs),
    [room.npcs, room.players, room.snapshotRevision, selectedTarget],
  );
  const cryptoStoreNpc = useMemo(
    () => cryptoStoreNpcId ? room.npcs.get(cryptoStoreNpcId) ?? null : null,
    [cryptoStoreNpcId, room.npcs, room.snapshotRevision],
  );
  const swapNpc = useMemo(
    () => swapNpcId ? room.npcs.get(swapNpcId) ?? null : null,
    [room.npcs, room.snapshotRevision, swapNpcId],
  );
  const traitsNpc = useMemo(
    () => traitsNpcId ? room.npcs.get(traitsNpcId) ?? null : null,
    [room.npcs, room.snapshotRevision, traitsNpcId],
  );
  const debugPlacementTargets = useMemo(
    () => [
      ...makeNpcDebugPlacementTargets(room.npcs),
      ...DEBUG_WORLD_PLACEMENT_TARGETS,
    ],
    [room.npcs, room.snapshotRevision],
  );
  const debugPlacementMode = debugToolsAvailable && settings.debugPlacementEditor;
  const hideCaptureHud = isRealCaptureMode()
    && new URLSearchParams(window.location.search).get("realCaptureHud") === "0";
  const visibleSelectedTarget = hideCaptureHud ? null : selectedTarget;
  const effectiveDebugPlacementOverrides = useMemo(
    () => ({
      ...savedDebugPlacementDefaults,
      ...debugPlacementOverrides,
    }),
    [debugPlacementOverrides, savedDebugPlacementDefaults],
  );
  const showGameLoader = room.status === "connecting" || (room.status === "connected" && !localPlayer);
  const connectionStatusLabel = room.persistenceStatus.state === "saving" || room.persistenceStatus.state === "saved"
    ? room.persistenceStatus.state
    : room.status;
  const connectionErrorLabel = room.persistenceStatus.state === "error"
    ? room.persistenceStatus.message || "wallet progress failed to save"
    : room.error;
  const [gameLoaderComplete, setGameLoaderComplete] = useState(false);
  const handleGameLoaderComplete = useCallback(() => setGameLoaderComplete(true), []);
  const renderGameLoader = !cryptoSmokeMode && (showGameLoader || !gameLoaderComplete);
  realCaptureRoomRef.current = room;
  realCaptureSelectedTargetRef.current = selectedTarget;

  useEffect(() => {
    setSavedDebugPlacementDefaults(initialSavedDebugPlacementDefaults);
  }, [initialSavedDebugPlacementDefaults]);

  useEffect(() => {
    if (room.status !== "connected" || !room.sessionId || trackedGameSessionIdRef.current === room.sessionId) return;
    trackedGameSessionIdRef.current = room.sessionId;
    trackEvent("game_joined", { identityType: identity.identityType });
  }, [identity.identityType, room.sessionId, room.status]);

  useEffect(() => {
    if (showGameLoader) setGameLoaderComplete(false);
  }, [showGameLoader]);

  useEffect(() => {
    audio.configure(settings.audio);
  }, [audio, settings.audio.enabled, settings.audio.volume]);

  useEffect(() => {
    audio.preload(["uiClick", "uiOpen", "uiClose", "uiConfirm", "uiError", "attackSwing", "attackImpact"]);
    return () => audio.dispose();
  }, [audio]);

  useEffect(() => bindGlobalButtonAudio(audio), [audio]);

  useEffect(() => {
    setWorldCollisionPlacementOverrides(effectiveDebugPlacementOverrides);
    return () => setWorldCollisionPlacementOverrides(initialSavedDebugPlacementDefaults);
  }, [effectiveDebugPlacementOverrides, initialSavedDebugPlacementDefaults]);

  const selectDebugPlacement = useCallback((targetId: string | null) => {
    setSelectedDebugPlacementId(targetId);
    if (targetId) setDebugPlacementPanelOpen(true);
  }, []);
  const openCryptoStore = useCallback((npc: NpcSnapshot) => {
    setCryptoStoreNpcId(npc.id);
    trackEvent("store_opened", { npcId: npc.id, npcRole: npc.role });
    room.sendAnalyticsEvent("store_opened", { npcId: npc.id, npcRole: npc.role });
  }, [room]);
  const openSwapMfer = useCallback((npc: NpcSnapshot) => {
    setSwapNpcId(npc.id);
    trackEvent("mfergpt_swap_panel_opened", { surface: "swap_mfer", npcId: npc.id, npcRole: npc.role }, { local: true });
  }, []);
  const openTraitsPanel = useCallback((npc: NpcSnapshot) => {
    setTraitsNpcId(npc.id);
    trackEvent("traits_panel_opened", { npcId: npc.id, npcRole: npc.role });
  }, []);
  const selectNpcTarget = useCallback((npcId: string) => {
    setSelectedTarget({ kind: "npc", id: npcId });
    audio.play("targetSelect");
    if (!localPlayer || localPlayer.health <= 0) return;
    const selectedNpc = findInteractableNpcInRange(localPlayer, room.npcs, npcId);
    if (selectedNpc) {
      audio.play(getNpcInteractionCue(selectedNpc), { volume: 0.7 });
      if (cryptoStoreEnabled && isCryptoStoreNpc(selectedNpc)) openCryptoStore(selectedNpc);
      if (isSwapMferNpc(selectedNpc)) openSwapMfer(selectedNpc);
      if (isTraitsMferNpc(selectedNpc)) openTraitsPanel(selectedNpc);
      room.sendInteract({ npcId: selectedNpc.id });
    }
  }, [audio, cryptoStoreEnabled, localPlayer, openCryptoStore, openSwapMfer, openTraitsPanel, room.npcs, room.sendInteract]);
  const performInteract = useCallback(() => {
    if (!localPlayer || localPlayer.health <= 0) return;
    const selectedNpc = selectedTarget?.kind === "npc"
      ? findInteractableNpcInRange(localPlayer, room.npcs, selectedTarget.id)
      : null;
    const nearestNpc = selectedNpc ?? findNearestNpc(localPlayer, room.npcs);
    if (nearestNpc) audio.play(getNpcInteractionCue(nearestNpc), { volume: 0.7 });
    if (cryptoStoreEnabled && isCryptoStoreNpc(nearestNpc)) openCryptoStore(nearestNpc);
    if (isSwapMferNpc(nearestNpc)) openSwapMfer(nearestNpc);
    if (isTraitsMferNpc(nearestNpc)) openTraitsPanel(nearestNpc);
    room.sendInteract(nearestNpc ? { npcId: nearestNpc.id } : {});
  }, [audio, cryptoStoreEnabled, localPlayer, openCryptoStore, openSwapMfer, openTraitsPanel, room.npcs, room.sendInteract, selectedTarget]);
  const showActionError = useCallback((text: string) => {
    audio.play("uiError");
    actionErrorIdRef.current += 1;
    setActionError({ id: actionErrorIdRef.current, text });
  }, [audio]);
  const performAction = useCallback((slot: ActionSlot) => {
    if (!slot) return;
    if (slot === "interact") performInteract();
    else if (isItemActionSlot(slot)) {
      const blockMessage = getItemActionBlockMessage(slot, localPlayer ?? null);
      if (blockMessage) {
        showActionError(blockMessage);
        return;
      }
      audio.play("itemUse");
      room.sendUseItem({ itemId: slot.itemId, chainTokenId: slot.chainTokenId });
    } else {
      const debugUnlockAllMoves = debugToolsAvailable && settings.debugUnlockAllMoves;
      const blockMessage = getCombatActionBlockMessage(slot, localPlayer ?? null, selectedTarget, selectedTargetUnit, debugUnlockAllMoves, globalCooldownReadyAt);
      if (blockMessage) {
        showActionError(blockMessage);
        return;
      }
      room.sendCombatAction({
        actionId: slot,
        target: selectedTarget,
        debugUnlockAllMoves,
      });
    }
  }, [audio, debugToolsAvailable, globalCooldownReadyAt, localPlayer, performInteract, room.sendCombatAction, room.sendUseItem, selectedTarget, selectedTargetUnit, settings.debugUnlockAllMoves, showActionError]);
  const replaceActionSlots = useCallback((slots: ActionSlot[]) => {
    setActionSlots(normalizeActionSlots(slots));
  }, []);
  const performDebugTravel = useCallback((destination: DebugTravelDestination) => {
    audio.play("uiToggle");
    room.sendDebugTeleport(destination);
    setSelectedTarget(null);
    setDebugTravelView({
      x: destination.x,
      z: destination.z,
      yaw: destination.yaw,
      nonce: Date.now(),
    });
  }, [audio, room.sendDebugTeleport]);
  const acceptQuest = useCallback((message: ClientAcceptQuest) => {
    audio.play("uiConfirm");
    room.sendAcceptQuest(message);
    if (message.questId === "set-your-traits") {
      const traitsNpc = room.npcs.get(message.npcId || "traits-mfer");
      if (traitsNpc) openTraitsPanel(traitsNpc);
    }
  }, [audio, openTraitsPanel, room.npcs, room.sendAcceptQuest]);
  const completeQuest = useCallback((message: ClientCompleteQuest) => {
    audio.play("questComplete");
    room.sendCompleteQuest(message);
  }, [audio, room.sendCompleteQuest]);
  const lootCorpse = useCallback((message: ClientLootCorpse) => {
    audio.play("inventoryLoot");
    room.sendLootCorpse(message);
  }, [audio, room.sendLootCorpse]);
  const equipItem = useCallback((message: ClientEquipItem) => {
    audio.play("inventoryEquip");
    room.sendEquipItem(message);
  }, [audio, room.sendEquipItem]);
  const unequipItem = useCallback((message: ClientUnequipItem) => {
    audio.play("inventoryEquip");
    room.sendUnequipItem(message);
  }, [audio, room.sendUnequipItem]);
  const useItem = useCallback((message: ClientUseItem) => {
    audio.play("itemUse");
    room.sendUseItem(message);
  }, [audio, room.sendUseItem]);
  const registerChainGear = useCallback((message: ClientRegisterChainGear) => {
    audio.play("inventoryLoot");
    room.sendRegisterChainGear(message);
  }, [audio, room.sendRegisterChainGear]);
  const selectTalent = useCallback((message: ClientSelectTalent) => {
    audio.play("uiConfirm");
    room.sendSelectTalent(message);
  }, [audio, room.sendSelectTalent]);
  const updateTraits = useCallback((message: ClientUpdateTraits) => {
    audio.play("uiConfirm");
    room.sendUpdateTraits(message);
  }, [audio, room.sendUpdateTraits]);
  const sendChat = useCallback((text: string) => {
    audio.play("chatSend");
    room.sendChat(text);
  }, [audio, room.sendChat]);
  const performEmote = useCallback((emoteId: EmoteId) => {
    audio.play("uiToggle");
    room.sendEmote({ emoteId } satisfies ClientEmote);
  }, [audio, room.sendEmote]);
  const respawn = useCallback(() => {
    audio.play("respawn");
    room.sendRespawn();
  }, [audio, room.sendRespawn]);
  const leaveGame = useCallback(() => {
    audio.play("uiClose");
    void room.leaveAndWait().finally(onExit);
  }, [audio, onExit, room.leaveAndWait]);
  const updateDebugPlacement = useCallback((target: DebugPlacementTarget, value: DebugPlacementValue, commit: boolean) => {
    const nextValue = normalizeDebugPlacementValue(value);
    setDebugPlacementSaveStatus({ state: "idle", message: "Unsaved local draft." });
    setDebugPlacementOverrides((current) => ({
      ...current,
      [target.id]: nextValue,
    }));

    if (!commit) return;
    if (target.kind === "npc") {
      const npcId = target.id.startsWith("npc:") ? target.id.slice("npc:".length) : "";
      if (!npcId) return;
      room.sendDebugNpcPlacement({
        npcId,
        x: nextValue.x,
        z: nextValue.z,
        yaw: nextValue.rotation,
      });
      return;
    }

    room.sendDebugWorldPlacement({
      targetId: target.id,
      x: nextValue.x,
      z: nextValue.z,
      rotation: nextValue.rotation,
    });
  }, [room.sendDebugNpcPlacement, room.sendDebugWorldPlacement]);
  const clearDebugPlacement = useCallback((targetId: string) => {
    setDebugPlacementSaveStatus({ state: "idle", message: "Unsaved local draft." });
    setDebugPlacementOverrides((current) => {
      if (!(targetId in current)) return current;
      const next = { ...current };
      delete next[targetId];
      return next;
    });
    const target = debugPlacementTargets.find((entry) => entry.id === targetId);
    if (!target || target.kind === "npc") return;
    const fallback = savedDebugPlacementDefaults[target.id] ?? target;
    room.sendDebugWorldPlacement({
      targetId,
      x: fallback.x,
      z: fallback.z,
      rotation: fallback.rotation,
    });
  }, [debugPlacementTargets, room, savedDebugPlacementDefaults]);
  const clearAllDebugPlacements = useCallback(() => {
    setDebugPlacementSaveStatus({ state: "idle", message: "Unsaved local draft cleared." });
    setDebugPlacementOverrides({});
    for (const target of debugPlacementTargets) {
      if (target.kind === "npc") continue;
      const fallback = savedDebugPlacementDefaults[target.id] ?? target;
      room.sendDebugWorldPlacement({
        targetId: target.id,
        x: fallback.x,
        z: fallback.z,
        rotation: fallback.rotation,
      });
    }
  }, [debugPlacementTargets, room, savedDebugPlacementDefaults]);
  const saveDebugPlacementDefaults = useCallback(() => {
    if (room.status !== "connected") {
      setDebugPlacementSaveStatus({ state: "error", message: "Server is not connected." });
      return;
    }
    const payload = buildDebugPlacementSavePayload(debugPlacementTargets, effectiveDebugPlacementOverrides, sourceDebugPlacementDefaults);
    pendingDebugPlacementSaveRef.current = payload;
    setDebugPlacementSaveStatus({ state: "saving", message: "Writing repo map defaults..." });
    room.sendDebugPlacementSave({
      placements: payload.placementRecords,
      sourceDefaults: payload.sourceDefaults,
    });
  }, [debugPlacementTargets, effectiveDebugPlacementOverrides, room, sourceDebugPlacementDefaults]);

  useEffect(() => {
    if (!debugPlacementMode) {
      setDebugPlacementPanelOpen(false);
      setSelectedDebugPlacementId(null);
      return;
    }
    setDebugPlacementPanelOpen(true);
  }, [debugPlacementMode]);

  useEffect(() => {
    if (!selectedDebugPlacementId) return;
    if (debugPlacementTargets.some((target) => target.id === selectedDebugPlacementId)) return;
    setSelectedDebugPlacementId(null);
  }, [debugPlacementTargets, selectedDebugPlacementId]);

  useEffect(() => {
    setSourceDebugPlacementDefaults((current) => {
      let changed = false;
      const next = { ...current };
      for (const target of debugPlacementTargets) {
        if (next[target.id]) continue;
        next[target.id] = makeDebugPlacementStoredRecord(target, target);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [debugPlacementTargets]);

  useEffect(() => {
    const document = room.debugPlacementMap;
    if (!document) return;
    const loadedPlacements = normalizeDebugPlacementOverridesFromRecordMap(getUnknownRecordProperty(document, "placements"));
    setSavedDebugPlacementDefaults(loadedPlacements);
    onSavedDebugPlacementDefaultsChange(loadedPlacements);
    const loadedSourceDefaults = normalizeDebugPlacementStoredRecords(getUnknownRecordProperty(document, "sourceDefaults"));
    setSourceDebugPlacementDefaults((current) => ({
      ...current,
      ...loadedSourceDefaults,
    }));
  }, [onSavedDebugPlacementDefaultsChange, room.debugPlacementMap]);

  useEffect(() => {
    const result = room.debugPlacementSaveResult;
    if (!result) return;
    if (result.ok) {
      const pending = pendingDebugPlacementSaveRef.current;
      if (pending) {
        setSavedDebugPlacementDefaults(pending.placements);
        onSavedDebugPlacementDefaultsChange(pending.placements);
        setSourceDebugPlacementDefaults(pending.sourceDefaults);
        setDebugPlacementOverrides({});
      }
      pendingDebugPlacementSaveRef.current = null;
      const count = typeof result.count === "number" ? `${result.count} placements` : "map defaults";
      setDebugPlacementSaveStatus({ state: "saved", message: `Saved ${count}.` });
      return;
    }

    pendingDebugPlacementSaveRef.current = null;
    setDebugPlacementSaveStatus({
      state: "error",
      message: result.error ? `Save failed: ${result.error}` : "Save failed.",
    });
  }, [onSavedDebugPlacementDefaultsChange, room.debugPlacementSaveResult]);

  useEffect(() => {
    if (debugPlacementSaveStatus.state !== "saving") return;
    const timeout = window.setTimeout(() => {
      pendingDebugPlacementSaveRef.current = null;
      setDebugPlacementSaveStatus({
        state: "error",
        message: "Save timed out. Restart the dev server if it was running old code.",
      });
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [debugPlacementSaveStatus.state]);

  useEffect(() => {
    if (!localPlayer) {
      unlockedActionKeyRef.current = "";
      return;
    }
    const debugUnlockAllMoves = debugToolsAvailable && settings.debugUnlockAllMoves;
    const unlockedActions = getUnlockedCombatActions(localPlayer.level, debugUnlockAllMoves) as CombatActionId[];
    const unlockedActionKey = unlockedActions.join("|");
    const previousUnlockedActionKey = unlockedActionKeyRef.current;
    const previousUnlockedActions = new Set(previousUnlockedActionKey ? previousUnlockedActionKey.split("|") as CombatActionId[] : []);
    const newlyUnlockedActions = previousUnlockedActionKey
      ? unlockedActions.filter((actionId) => !previousUnlockedActions.has(actionId))
      : [];
    unlockedActionKeyRef.current = unlockedActionKey;

    const result = reconcileActionSlots({
      current: actionSlots,
      debugUnlockAllMoves,
      newlyUnlockedActions,
      player: localPlayer,
      shouldNotify: newlyUnlockedActions.length > 0 && !debugUnlockAllMoves,
      unlockedActions,
    });
    if (!slotsEqual(actionSlots, result.slots)) setActionSlots(result.slots);
    if (result.notices.length > 0) {
      audio.play("uiConfirm");
      setMoveUnlockNotices((current) => [
        ...current,
        ...result.notices.map((notice) => ({
          ...notice,
          id: ++moveUnlockNoticeIdRef.current,
        })),
      ]);
    }
  }, [actionSlots, audio, debugToolsAvailable, localPlayer, room.snapshotRevision, settings.debugUnlockAllMoves]);

  useEffect(() => {
    if (moveUnlockNotices.length === 0) return;
    const timeout = window.setTimeout(() => {
      setMoveUnlockNotices((current) => current.slice(1));
    }, 2800);
    return () => window.clearTimeout(timeout);
  }, [moveUnlockNotices]);

  useEffect(() => {
    window.localStorage.setItem(ACTION_SLOT_STORAGE_KEY, JSON.stringify(actionSlots));
  }, [actionSlots]);

  useEffect(() => {
    window.localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(DEBUG_PLACEMENT_STORAGE_KEY, JSON.stringify(debugPlacementOverrides));
  }, [debugPlacementOverrides]);

  useEffect(() => {
    if (!actionError) return;
    const timeout = window.setTimeout(() => setActionError(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [actionError]);

  useEffect(() => {
    for (const event of room.combatEvents) {
      if (playedCombatEventIdsRef.current.has(event.id)) continue;
      playedCombatEventIdsRef.current.add(event.id);
      playCombatEventAudio(audio, event, localPlayer ?? null, combatAudioTimeoutsRef);
    }
    prunePlayedIds(playedCombatEventIdsRef.current, room.combatEvents);
  }, [audio, localPlayer, room.combatEvents]);

  useEffect(() => {
    for (const event of room.experienceEvents) {
      if (playedExperienceEventIdsRef.current.has(event.id)) continue;
      playedExperienceEventIdsRef.current.add(event.id);
      audio.play("xpGain", { volume: getExperienceSpatialVolume(event, localPlayer ?? null) });
    }
    prunePlayedIds(playedExperienceEventIdsRef.current, room.experienceEvents);
  }, [audio, localPlayer, room.experienceEvents]);

  useEffect(() => {
    const noticeId = room.questOffer
      ? `offer:${room.questOffer.questId}:${room.questOffer.npcId}`
      : room.questTurnIn
        ? `turnIn:${room.questTurnIn.questId}:${room.questTurnIn.npcId}`
        : room.questStatus
          ? `status:${room.questStatus.questId}:${room.questStatus.npcId}`
          : "";
    if (!noticeId || noticeId === lastQuestNoticeIdRef.current) return;
    lastQuestNoticeIdRef.current = noticeId;
    audio.play("questNotice");
  }, [audio, room.questOffer, room.questStatus, room.questTurnIn]);

  useEffect(() => {
    const noticeId = room.lootWindow ? `${room.lootWindow.npcId}:${room.lootWindow.items.length}` : "";
    if (!noticeId || noticeId === lastLootNoticeIdRef.current) return;
    lastLootNoticeIdRef.current = noticeId;
    audio.play("inventoryLoot", { volume: 0.55 });
  }, [audio, room.lootWindow]);

  useEffect(() => () => {
    clearAudioTimeouts(combatAudioTimeoutsRef);
  }, []);

  useEffect(() => {
    if (!isRealCaptureMode()) return;
    let disposeCaptureBridge: (() => void) | null = null;
    let cancelled = false;
    const captureBridgeModuleUrl = new URL("./game/realGameCaptureBridge.ts", import.meta.url).href;
    void import(/* @vite-ignore */ captureBridgeModuleUrl).then((captureModule) => {
      if (cancelled) return;
      const { installRealGameCaptureBridge } = captureModule as typeof import("./game/realGameCaptureBridge");
      disposeCaptureBridge = installRealGameCaptureBridge({
        roomRef: realCaptureRoomRef,
        selectedTargetRef: realCaptureSelectedTargetRef,
        setSelectedTarget,
        setDebugTravelView,
      });
    });
    return () => {
      cancelled = true;
      disposeCaptureBridge?.();
    };
  }, []);

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
        key={renderProfile.cacheKey}
        dpr={renderProfile.gameDpr}
        camera={{ position: [0, 6, 10], fov: 54, near: 0.1, far: 140 }}
        gl={{ antialias: renderProfile.antialias, powerPreference: renderProfile.powerPreference }}
      >
        <TownScene
          players={room.players}
          npcs={room.npcs}
          sceneRevision={room.sceneRevision}
          localSessionId={room.sessionId}
          selectedTarget={visibleSelectedTarget}
          combatEvents={room.combatEvents}
          experienceEvents={room.experienceEvents}
          chatBubbles={hideCaptureHud ? EMPTY_CAPTURE_CHAT_BUBBLES : room.chatBubbles}
          onSelectTarget={setSelectedTarget}
          onSelectNpcTarget={selectNpcTarget}
          onInteractAction={performInteract}
          sendInput={room.sendInput}
          debugTravelView={debugTravelView}
          nameplateVisibility={hideCaptureHud ? HIDDEN_CAPTURE_NAMEPLATES : settings.nameplates}
          hideWorldOverlays={hideCaptureHud}
          debugPlacementMode={debugPlacementMode}
          debugPlacementTargets={debugPlacementTargets}
          debugPlacementOverrides={effectiveDebugPlacementOverrides}
          selectedDebugPlacementId={selectedDebugPlacementId}
          mobileMoveInputRef={mobileMoveInputRef}
          onSelectDebugPlacement={selectDebugPlacement}
          onChangeDebugPlacement={updateDebugPlacement}
          renderProfile={renderProfile}
          lightweightRender={cryptoSmokeMode}
        />
      </Canvas>
      {renderGameLoader && <MferHeadLoader ready={!showGameLoader} renderProfile={renderProfile} onComplete={handleGameLoaderComplete} />}

      {!hideCaptureHud && (
        <>
          <Hud
            identity={hudIdentity}
            playerCount={playerCount}
            connectionStatus={connectionStatusLabel}
            connectionError={connectionErrorLabel}
            chat={room.chat}
            players={room.players}
            npcs={room.npcs}
            selectedTarget={selectedTarget}
            selectedTargetUnit={selectedTargetUnit}
            cryptoStoreNpc={cryptoStoreEnabled ? cryptoStoreNpc : null}
            localSessionId={room.sessionId}
            localPlayer={localPlayer ?? null}
            questOffer={room.questOffer}
            questTurnIn={room.questTurnIn}
            questStatus={room.questStatus}
            lootWindow={room.lootWindow}
            actionError={actionError}
            moveUnlockNotice={moveUnlockNotices[0] ?? null}
            globalCooldownReadyAt={globalCooldownReadyAt}
            actionSlots={actionSlots}
            onAction={performAction}
            onReplaceActionSlots={replaceActionSlots}
            onAcceptQuest={acceptQuest}
            onCompleteQuest={completeQuest}
            onShareQuestLink={room.sendShareQuestLink}
            onDismissQuestOffer={room.dismissQuestOffer}
            onDismissQuestTurnIn={room.dismissQuestTurnIn}
            onDismissQuestStatus={room.dismissQuestStatus}
            onLootCorpse={lootCorpse}
            onEquipItem={equipItem}
            onUnequipItem={unequipItem}
            onUseItem={useItem}
            onRegisterChainGear={registerChainGear}
            onCryptoStoreAnalytics={room.sendAnalyticsEvent}
            onSelectTalent={selectTalent}
            onCloseLootWindow={room.closeLootWindow}
            onCloseCryptoStore={() => setCryptoStoreNpcId(null)}
            onSendChat={sendChat}
            onEmote={performEmote}
            onRespawn={respawn}
            onSelectSelfTarget={() => room.sessionId && setSelectedTarget({ kind: "player", id: room.sessionId })}
            onExit={leaveGame}
            settings={settings}
            renderProfile={renderProfile}
            debugToolsAvailable={debugToolsAvailable}
            onSettingsChange={setSettings}
          />
          {traitsNpc && localPlayer && (
            <section className="floating-menu-overlay traits-anchor" role="dialog" aria-label="traits">
              <TraitsPanel
                npc={traitsNpc}
                player={localPlayer}
                result={room.traitUpdateResult}
                onClose={() => setTraitsNpcId(null)}
                onUpdateTraits={updateTraits}
              />
            </section>
          )}
          {swapNpc && (
            <section className="floating-menu-overlay swap-anchor" role="dialog" aria-label="swap">
              <MferGptSwapMenu
                defaultExpanded
                onClose={() => setSwapNpcId(null)}
                surface="swap_mfer"
                variant="npc"
              />
            </section>
          )}
          <MobileControls
            inputRef={mobileMoveInputRef}
            disabled={debugPlacementMode || renderGameLoader || !localPlayer || localPlayer.health <= 0}
          />
        </>
      )}

      {!hideCaptureHud && debugToolsAvailable && settings.debugTravelPanel && (
        <DebugTravelPanel
          localPlayer={localPlayer ?? null}
          canTravel={room.status === "connected"}
          destinations={debugTravelDestinations}
          onTravel={performDebugTravel}
        />
      )}
      {!hideCaptureHud && debugPlacementMode && debugPlacementPanelOpen && (
        <DebugPlacementEditor
          targets={debugPlacementTargets}
          overrides={effectiveDebugPlacementOverrides}
          selectedId={selectedDebugPlacementId}
          onSelect={selectDebugPlacement}
          onChange={updateDebugPlacement}
          onClear={clearDebugPlacement}
          onClearAll={clearAllDebugPlacements}
          onSaveDefaults={saveDebugPlacementDefaults}
          saveStatus={debugPlacementSaveStatus}
          onClose={() => setDebugPlacementPanelOpen(false)}
        />
      )}
    </main>
  );
}

function DebugTravelPanel({
  localPlayer,
  canTravel,
  destinations,
  onTravel,
}: {
  localPlayer: PlayerSnapshot | null;
  canTravel: boolean;
  destinations: readonly DebugTravelDestination[];
  onTravel: (destination: DebugTravelDestination) => void;
}) {
  return (
    <div className="debug-travel-panel" aria-label="Debug travel">
      <span className="debug-travel-position">
        {localPlayer ? `${Math.round(localPlayer.x)}, ${Math.round(localPlayer.z)}` : "--, --"}
      </span>
      {destinations.map((destination) => (
        <button
          key={destination.id}
          type="button"
          title={`Debug travel: ${destination.label}`}
          disabled={!canTravel}
          onClick={() => onTravel(destination)}
        >
          <MapPin size={13} />
          <span>{destination.label}</span>
        </button>
      ))}
    </div>
  );
}

function bindGlobalButtonAudio(audio: GameAudio) {
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button,[role='button']");
    if (!(button instanceof HTMLElement) || !document.body.contains(button)) return;
    if (button.closest(".action-slot,.item-row,.inventory-slot,.equipment-slot,.quest-accept-btn,.debug-travel-panel")) return;

    const disabled = button instanceof HTMLButtonElement
      ? button.disabled || button.getAttribute("aria-disabled") === "true"
      : button.getAttribute("aria-disabled") === "true";
    if (disabled) {
      audio.play("uiError");
      return;
    }

    const label = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""}`.toLowerCase();
    if (label.includes("close") || label.includes("leave")) {
      audio.play("uiClose");
      return;
    }
    if (button.classList.contains("primary-btn") || button.classList.contains("secondary-btn")) {
      audio.play("uiConfirm");
      return;
    }
    audio.play("uiClick");
  };

  window.addEventListener("pointerup", onPointerUp, true);
  return () => window.removeEventListener("pointerup", onPointerUp, true);
}

function playCombatEventAudio(
  audio: GameAudio,
  event: CombatEvent,
  listener: PlayerSnapshot | null,
  timeoutRef: { current: number[] },
) {
  const startCue = getCombatStartCue(event.actionId, event.amount);
  const spatialVolume = getCombatSpatialVolume(event, listener);
  if (startCue) audio.play(startCue, { volume: spatialVolume });

  const impactCue = getCombatImpactCue(event);
  if (!impactCue && !event.defeated) return;

  const delay = Math.max(0, event.impactAt - Date.now());
  const timeoutId = window.setTimeout(() => {
    timeoutRef.current = timeoutRef.current.filter((id) => id !== timeoutId);
    const impactVolume = getCombatSpatialVolume(event, listener);
    if (impactCue) audio.play(impactCue, { volume: impactVolume });
    if (event.defeated) audio.play("defeat", { volume: impactVolume * 0.85 });
  }, delay);
  timeoutRef.current.push(timeoutId);
}

function prunePlayedIds(ids: Set<string>, events: Array<CombatEvent | ExperienceEvent>) {
  if (ids.size < 128) return;
  const liveIds = new Set(events.map((event) => event.id));
  for (const id of ids) {
    if (!liveIds.has(id)) ids.delete(id);
  }
}

function clearAudioTimeouts(timeoutRef: { current: number[] }) {
  for (const timeout of timeoutRef.current) {
    window.clearTimeout(timeout);
  }
  timeoutRef.current = [];
}

function getNpcInteractionCue(npc: NpcSnapshot) {
  if (!npc.isImmortal && npc.health <= 0 && npc.hasLoot) return "inventoryLoot";
  return "interact";
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
  debugUnlockAllMoves: boolean,
  globalCooldownReadyAt = 0,
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
  if (Math.max(readyAt, globalCooldownReadyAt) > now) return "Ability is not ready";
  if (player.mana < action.manaCost) return "Not enough mana";
  if (!isCombatActionUnlocked(actionId, player.level, debugUnlockAllMoves)) return "Ability is locked";
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

function readStoredGameSettings(): GameSettings {
  try {
    const stored = window.localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_GAME_SETTINGS;
    return normalizeGameSettings(JSON.parse(stored) as unknown);
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

function readStoredDebugPlacementOverrides(): DebugPlacementOverrides {
  try {
    const stored = window.localStorage.getItem(DEBUG_PLACEMENT_STORAGE_KEY);
    if (!stored) return {};
    return normalizeDebugPlacementOverrides(JSON.parse(stored) as unknown);
  } catch {
    return {};
  }
}

async function fetchDebugPlacementMap(signal: AbortSignal) {
  const response = await fetch(getDebugPlacementMapUrl(), { signal });
  if (!response.ok) throw new Error(`Unable to load placement map: ${response.status}`);
  return response.json() as Promise<unknown>;
}

function getDebugPlacementMapUrl() {
  const configured = import.meta.env.VITE_SERVER_URL ? String(import.meta.env.VITE_SERVER_URL) : "";
  if (configured) {
    return `${configured.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/$/, "")}/debug-placement-map`;
  }
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${window.location.hostname}:2567/debug-placement-map`;
}

function normalizeDebugPlacementOverrides(value: unknown): DebugPlacementOverrides {
  if (!value || typeof value !== "object") return {};
  const next: DebugPlacementOverrides = {};
  for (const [id, placement] of Object.entries(value as Record<string, unknown>)) {
    if (!placement || typeof placement !== "object") continue;
    const record = placement as Partial<Record<keyof DebugPlacementValue, unknown>>;
    const x = Number(record.x);
    const z = Number(record.z);
    const rotation = Number(record.rotation);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) continue;
    next[id] = normalizeDebugPlacementValue({ x, z, rotation });
  }
  return next;
}

function normalizeDebugPlacementOverridesFromRecordMap(value: unknown): DebugPlacementOverrides {
  const records = normalizeDebugPlacementStoredRecords(value);
  const next: DebugPlacementOverrides = {};
  for (const [id, record] of Object.entries(records)) {
    next[id] = normalizeDebugPlacementValue(record);
  }
  return next;
}

function normalizeDebugPlacementStoredRecords(value: unknown): DebugPlacementStoredRecordMap {
  if (!value || typeof value !== "object") return {};
  const next: DebugPlacementStoredRecordMap = {};
  for (const [id, placement] of Object.entries(value as Record<string, unknown>)) {
    if (!placement || typeof placement !== "object") continue;
    const record = placement as Record<string, unknown>;
    const x = Number(record.x);
    const z = Number(record.z);
    const rotation = Number(record.rotation);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) continue;
    const kind = typeof record.kind === "string" && isDebugPlacementKind(record.kind) ? record.kind : undefined;
    next[id] = {
      ...normalizeDebugPlacementValue({ x, z, rotation }),
      ...(kind ? { kind } : {}),
      ...(typeof record.label === "string" ? { label: record.label } : {}),
      ...(typeof record.source === "string" ? { source: record.source } : {}),
    };
  }
  return next;
}

function buildDebugPlacementSavePayload(
  targets: DebugPlacementTarget[],
  effectiveOverrides: DebugPlacementOverrides,
  sourceDefaults: DebugPlacementStoredRecordMap,
) {
  const placements: DebugPlacementOverrides = {};
  const placementRecords: DebugPlacementStoredRecordMap = {};
  const nextSourceDefaults: DebugPlacementStoredRecordMap = {};
  for (const target of targets) {
    const value = normalizeDebugPlacementValue(effectiveOverrides[target.id] ?? target);
    placements[target.id] = value;
    placementRecords[target.id] = makeDebugPlacementStoredRecord(target, value);
    nextSourceDefaults[target.id] = sourceDefaults[target.id] ?? makeDebugPlacementStoredRecord(target, target);
  }

  return {
    placements,
    placementRecords,
    sourceDefaults: nextSourceDefaults,
  };
}

function makeDebugPlacementStoredRecord(target: DebugPlacementTarget, value: DebugPlacementValue): DebugPlacementStoredRecord {
  return {
    ...normalizeDebugPlacementValue(value),
    kind: target.kind,
    label: target.label,
    source: target.source,
  };
}

function getUnknownRecordProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function isDebugPlacementKind(value: string): value is DebugPlacementTarget["kind"] {
  return value === "npc" || value === "building" || value === "model" || value === "prop";
}

function normalizeDebugPlacementValue(value: DebugPlacementValue): DebugPlacementValue {
  return {
    x: Math.round(value.x * 10) / 10,
    z: Math.round(value.z * 10) / 10,
    rotation: Number.isFinite(value.rotation) ? value.rotation : 0,
  };
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

function reconcileActionSlots({
  current,
  debugUnlockAllMoves,
  newlyUnlockedActions,
  player,
  shouldNotify,
  unlockedActions,
}: {
  current: ActionSlot[];
  debugUnlockAllMoves: boolean;
  newlyUnlockedActions: CombatActionId[];
  player: PlayerSnapshot;
  shouldNotify: boolean;
  unlockedActions: CombatActionId[];
}) {
  const unlockedActionSet = new Set(unlockedActions);
  const newlyUnlockedActionSet = new Set(newlyUnlockedActions);
  const notices: QueuedMoveUnlockNotice[] = [];
  const next = normalizeActionSlots(current).map((slot) => {
    if (!slot || slot === "interact") return slot;
    if (isItemActionSlot(slot)) {
      const inventoryKey = getInventoryItemKey(slot.itemId, slot.chainTokenId);
      return player.inventory.some((item) => getInventoryItemKey(item.id, item.chainTokenId) === inventoryKey && item.count > 0)
        ? slot
        : null;
    }
    return unlockedActionSet.has(slot) ? slot : null;
  });
  const assignedActions = new Set(next.filter(isCombatActionSlot));

  for (const actionId of unlockedActions) {
    if (assignedActions.has(actionId)) {
      const buttonIndex = next.findIndex((slot) => slot === actionId);
      if (shouldNotify && newlyUnlockedActionSet.has(actionId)) {
        notices.push({ actionId, buttonIndex: buttonIndex >= 0 ? buttonIndex : null, level: player.level });
      }
      continue;
    }

    const emptyIndex = next.findIndex((slot) => !slot);
    if (emptyIndex === -1) {
      if (shouldNotify && newlyUnlockedActionSet.has(actionId)) {
        notices.push({ actionId, buttonIndex: null, level: player.level });
      }
      continue;
    }

    next[emptyIndex] = actionId;
    assignedActions.add(actionId);
    if (shouldNotify && newlyUnlockedActionSet.has(actionId)) {
      notices.push({ actionId, buttonIndex: emptyIndex, level: player.level });
    }
  }

  return {
    slots: debugUnlockAllMoves ? next : next.map((slot) => isLockedCombatActionSlot(slot, player.level) ? null : slot),
    notices,
  };
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

function isCombatActionSlot(slot: ActionSlot): slot is CombatActionId {
  return Boolean(slot && typeof slot === "string" && slot !== "interact");
}

function isLockedCombatActionSlot(slot: ActionSlot, playerLevel: number) {
  return isCombatActionSlot(slot) && !isCombatActionUnlocked(slot, playerLevel);
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
    if (!isInteractableNpc(npc)) continue;
    const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  }

  if (nearest && nearestDistance <= LOOT.interactRange) return nearest;
  return null;
}

function findInteractableNpcInRange(player: PlayerSnapshot, npcs: Map<string, NpcSnapshot>, npcId: string) {
  const npc = npcs.get(npcId);
  if (!npc || !isInteractableNpc(npc)) return null;

  const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
  return distance <= LOOT.interactRange ? npc : null;
}

function isInteractableNpc(npc: NpcSnapshot) {
  return npc.isImmortal || npc.health > 0 || npc.hasLoot;
}

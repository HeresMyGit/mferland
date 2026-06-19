import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Check, Copy, ExternalLink, Gem, LogOut, MapPin, RefreshCw, Sparkles, UserRound, X } from "lucide-react";
import * as THREE from "three";
import { useAccount, useConnect, useDisconnect, useSignMessage, type Connector } from "wagmi";
import {
  COMBAT,
  CRYPTO_MFER_NPC_ID,
  ITEMS,
  LOOT,
  POTION_SHOP_NPC_ID,
  RESPEC_MFER_NPC_ID,
  SWAP_MFER_NPC_ID,
  TRAITS_MFER_NPC_ID,
  TRASH_VENDOR_NPC_ID,
  getUnlockedCombatActions,
  getInventoryItemKey,
  getItemConsumable,
  getNpcDisposition,
  getCombatActionUnlockTalent,
  getTalentUnlockedCombatActions,
  isAttackableNpcRole,
  isCombatActionUnlocked,
  normalizeAvatarSeed,
  normalizeWalletAddress,
  setWorldCollisionPlacementOverrides,
  stableHash,
  type ActionId,
  type ClientAcceptQuest,
  type ClientCancelQuest,
  type ClientCompleteQuest,
  type ClientEmote,
  type ClientEquipItem,
  type ClientLootCorpse,
  type ClientPurchasePotionShopItem,
  type ClientRegisterChainGear,
  type ClientRespecTalents,
  type ClientSelectTalent,
  type ClientSellTrashItems,
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
  getReferralWalletAddressFromSearch,
  getStoredInviteCode,
  getStoredReferralWalletAddress,
  getStoredName,
  makeGuestIdentity,
  makeReferralInviteUrl,
  makeWalletIdentity,
  rememberInviteCode,
  rememberReferralWalletAddress,
  rememberName,
} from "./auth/identity";
import {
  getAvailableWalletConnectorChoices,
  getPreferredWalletConnector,
  getWalletConnectFailureMessage,
  getWalletConnectorChoices,
  getWalletConnectorLabel,
} from "./auth/walletConnectors";
import { DEFAULT_WALLET_CHAIN_ID } from "./auth/wagmi";
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
import { TownScene, type CaptureCameraState, type CaptureInputState, type MobileMoveInput } from "./game/TownScene";
import { Skybox, TownWorld } from "./game/scene/TownWorld";
import { copyTextToClipboard } from "./clipboard";
import { Hud } from "./components/Hud";
import { DebugPlacementEditor } from "./components/DebugPlacementEditor";
import { MobileControls } from "./components/MobileControls";
import { MferHeadLoader } from "./components/MferHeadLoader";
import { MferGptSwapMenu } from "./components/MferGptSwapMenu";
import { MferPortrait } from "./components/MferPortrait";
import { PotionShopPanel } from "./components/PotionShopPanel";
import { RespecPanel } from "./components/RespecPanel";
import { TrashVendorPanel } from "./components/TrashVendorPanel";
import { TraitsPanel } from "./components/TraitsPanel";
import { LeaderboardPage } from "./LeaderboardPage";
import { StreamPage } from "./StreamPage";
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
const ACTION_SLOT_COUNT = 8;
const DEFAULT_ACTION_SLOTS: ActionSlot[] = ["attack", null, null, null, null, null, null, null];
const ACTION_SLOT_STORAGE_KEY = "mferland:actionSlots:v4";
const GAME_SETTINGS_STORAGE_KEY = "mferland:settings:v1";
const AGENT_SKILL_URL = "https://game.mfergpt.lol/skills/mferland/SKILL.md";
const AUTH_ONLINE_PLAYER_LIMIT = 40;
const AUTH_ONLINE_REFRESH_MS = 10_000;
const STREAM_CAMERA_PLAYER_NAME = "stream cam";
const LOCAL_DEBUG_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const HIDDEN_CAPTURE_NAMEPLATES = {
  localPlayer: false,
  otherPlayers: false,
  friendlyNpcs: false,
  unfriendlyNpcs: false,
  healthBars: false,
};
const EMPTY_CAPTURE_CHAT_BUBBLES: never[] = [];
const REAL_CAPTURE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_REAL_CAPTURE === "1";
const DEBUG_TRAVEL_DESTINATIONS = [
  { id: "gate", label: "Gate", x: 0, z: -10, yaw: Math.PI },
  { id: "plaza", label: "Plaza", x: 0, z: -8, yaw: 0 },
  { id: "drip", label: "Drip", x: -12, z: 15, yaw: -2.35 },
  { id: "crypto", label: "Crypto", x: 3.8, z: 22, yaw: 0 },
  { id: "potion", label: "Potion", x: 7.4, z: 24, yaw: 0 },
  { id: "trash", label: "Trash", x: 11.1, z: 24, yaw: 0 },
  { id: "respec", label: "Respec", x: 14.8, z: 24, yaw: 0 },
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
  sourceLabel: string;
  buttonIndex: number | null;
};
type QueuedMoveUnlockNotice = Omit<MoveUnlockNotice, "id">;
type AuthOnlineStatus = "loading" | "ready" | "error";
type AuthOnlinePlayer = {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  walletAddress: string;
  walletShort: string;
  status: string;
  zone: string;
  level: number;
  health: number;
  maxHealth: number;
  currentQuestTitle: string;
};
type AuthOnlineSnapshot = {
  generatedAt: string;
  playersOnline: number;
  agentsOnline: number;
  humansOnline: number;
  players: AuthOnlinePlayer[];
};

function isRealCaptureMode() {
  if (!REAL_CAPTURE_ENABLED) return false;
  return new URLSearchParams(window.location.search).get("realCapture") === "1";
}

function isCryptoSmokeMode() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("cryptoSmoke") === "1";
}

function isInviteRequired() {
  return import.meta.env.VITE_ENABLE_INVITE_GATE === "1" && import.meta.env.VITE_REQUIRE_INVITE === "1";
}

function getLinkedInviteCode() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("invite")?.trim() || params.get("code")?.trim() || "";
}

function getLinkedReferralWalletAddress() {
  if (typeof window === "undefined") return "";
  return getReferralWalletAddressFromSearch(window.location.search);
}

function getInitialInviteCode() {
  return getLinkedInviteCode() || getStoredInviteCode();
}

function getInitialReferralWalletAddress() {
  return getLinkedReferralWalletAddress() || getStoredReferralWalletAddress();
}

function isCryptoStoreEnabled() {
  return import.meta.env.VITE_ENABLE_CRYPTO_STORE === "1";
}

function makeCreationSeed() {
  return normalizeAvatarSeed(stableHash(`character:${Date.now()}:${Math.random()}`));
}

function isCryptoStoreNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === CRYPTO_MFER_NPC_ID;
}

function isSwapMferNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === SWAP_MFER_NPC_ID;
}

function isTraitsMferNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === TRAITS_MFER_NPC_ID;
}

function isPotionShopNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === POTION_SHOP_NPC_ID;
}

function isTrashVendorNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === TRASH_VENDOR_NPC_ID;
}

function isRespecMferNpc(npc: NpcSnapshot | null | undefined): npc is NpcSnapshot {
  return npc?.id === RESPEC_MFER_NPC_ID;
}

export function App() {
  if (getLeaderboardRoute()) return <LeaderboardPage />;
  const streamRoute = getStreamRoute();
  if (streamRoute) return <StreamPage overlay={streamRoute.overlay} agentView={streamRoute.agentView} />;
  return <GameApp />;
}

function GameApp() {
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
    const captureWallet = normalizeWalletAddress(params.get("realCaptureWallet") ?? params.get("wallet") ?? "");
    const captureAvatarSeed = Number(params.get("realCaptureAvatarSeed") ?? params.get("avatarSeed") ?? "");
    const isAgentCapture = params.get("realCaptureAgent") === "1" || params.get("agentClient") === "1";
    if (isAgentCapture && captureWallet) {
      setIdentity({
        ...makeWalletIdentity(
          name,
          captureWallet,
          Number.isFinite(captureAvatarSeed) ? normalizeAvatarSeed(captureAvatarSeed) : stableHash(`${captureWallet}:${name}:capture`),
          true,
        ),
        agentClient: true,
      });
      return;
    }
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

function getStreamRoute(): { overlay: boolean; agentView: boolean } | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(window.location.search);
  const overlay = path === "/stream/overlay" || path === "/stream-overlay" || params.get("overlay") === "1";
  if (path === "/agent-view" || path === "/agent-stream" || params.get("agentView") === "1") return { overlay, agentView: true };
  if (overlay) return { overlay: true, agentView: false };
  if (path === "/stream" || params.get("stream") === "1") return { overlay: false, agentView: false };
  return null;
}

function getLeaderboardRoute() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  return path === "/leaderboard" || params.get("leaderboard") === "1";
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
  const [showAnonWarning, setShowAnonWarning] = useState(false);
  const [inviteCode, setInviteCode] = useState(() => getInitialInviteCode());
  const [referralWalletAddress, setReferralWalletAddress] = useState(() => getInitialReferralWalletAddress());
  const [authReferralCopyStatus, setAuthReferralCopyStatus] = useState("");
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
  const [onlineSnapshot, setOnlineSnapshot] = useState<AuthOnlineSnapshot | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<AuthOnlineStatus>("loading");
  const [onlineError, setOnlineError] = useState("");
  const inviteRequired = isInviteRequired();
  const hasInviteCode = inviteCode.trim() !== "";

  const existingCharacter = getExistingWalletCharacter(walletProfile);
  const cleanName = existingCharacter?.name ?? (name.trim() || getStoredName());
  const creationTraits = useMemo(() => generateRandomMferTraits(creationSeed), [creationSeed]);
  const walletProfileLoading = isWalletProfilePending(isConnected, walletProfile);
  const walletProfileError = walletProfile.status === "error" ? walletProfile.message : null;
  const walletNeedsCreation = isConnected && walletProfile.status === "new";
  const connectedReferralInviteUrl = useMemo(() => address ? makeReferralInviteUrl(address) : "", [address]);
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
  const anonEntryDisabled = inviteRequired && !hasInviteCode;
  const hasInjectedProvider = hasInjectedEthereumProvider();
  const availableWalletConnectorChoices = useMemo(
    () => getAvailableWalletConnectorChoices(walletConnectorChoices, { hasInjectedProvider }),
    [hasInjectedProvider, walletConnectorChoices],
  );
  const walletConnectDisabled = isConnectPending || availableWalletConnectorChoices.length === 0;

  const loadOnlineSnapshot = useCallback(async (signal?: AbortSignal) => {
    setOnlineStatus((current) => current === "ready" ? current : "loading");
    try {
      const nextSnapshot = await fetchAuthOnlineSnapshot(signal);
      if (signal?.aborted) return;
      setOnlineSnapshot(nextSnapshot);
      setOnlineStatus("ready");
      setOnlineError("");
    } catch (error) {
      if (signal?.aborted) return;
      setOnlineStatus("error");
      setOnlineError(error instanceof Error ? error.message : "online roster unavailable");
    }
  }, []);

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
    const linkedReferral = getLinkedReferralWalletAddress();
    if (!linkedReferral) return;
    rememberReferralWalletAddress(linkedReferral);
    setReferralWalletAddress(linkedReferral);
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
    const abortController = new AbortController();
    void loadOnlineSnapshot(abortController.signal);
    const refreshId = window.setInterval(() => void loadOnlineSnapshot(abortController.signal), AUTH_ONLINE_REFRESH_MS);

    return () => {
      abortController.abort();
      window.clearInterval(refreshId);
    };
  }, [loadOnlineSnapshot]);

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
    setAuthReferralCopyStatus("");
  }, [connectedReferralInviteUrl]);

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
        referralWalletAddress,
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

  function openAnonWarning() {
    if (anonEntryDisabled) {
      setWalletActionError("invite link required for anon mfer");
      return;
    }
    setWalletActionError(null);
    setShowAnonWarning(true);
    trackEvent("auth_anon_warning_opened", {
      inviteRequired,
      invitePresent: hasInviteCode,
      walletConnected: isConnected,
    }, { local: true, identityType: "guest" });
  }

  function cancelAnonWarning() {
    setShowAnonWarning(false);
    trackEvent("auth_anon_warning_cancelled", {
      inviteRequired,
      invitePresent: hasInviteCode,
      walletConnected: isConnected,
    }, { local: true, identityType: "guest" });
  }

  function enterAnonMfer() {
    if (anonEntryDisabled) return;
    const anonName = cleanName || getStoredName();
    rememberName(anonName);
    rememberInviteCode(inviteCode);
    setShowAnonWarning(false);
    trackEvent("auth_enter_guest", {
      inviteRequired,
      invitePresent: hasInviteCode,
      walletConnected: isConnected,
    }, { local: true, identityType: "guest" });
    onEnter(makeGuestIdentity(anonName));
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
    const properties = { surface: "auth", connector: connector.id, chainId: DEFAULT_WALLET_CHAIN_ID };
    trackEvent("wallet_connect_started", properties, { local: true });
    connect({ connector, chainId: DEFAULT_WALLET_CHAIN_ID }, {
      onSuccess: (data) => trackWalletConnected(getConnectedWalletAddress(data), properties),
      onError: (error) => {
        if (!isUserRejectedWalletRequest(error)) {
          setWalletActionError(getWalletConnectFailureMessage(connector));
        }
        trackEvent("wallet_connect_failed", properties, { local: true });
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

  async function copyConnectedReferralInviteUrl() {
    if (!connectedReferralInviteUrl) return;
    const copied = await copyTextToClipboard(connectedReferralInviteUrl);
    setAuthReferralCopyStatus(copied ? "copied" : "copy failed");
  }

  function enterLocalDebugWallet() {
    const debugName = cleanName || "debug mfer";
    rememberName(debugName);
    rememberInviteCode(inviteCode);
    trackEvent("auth_enter_local_debug_wallet", { surface: "auth" }, {
      local: true,
      identityType: "wallet",
      walletAddress: LOCAL_DEBUG_WALLET_ADDRESS,
    });
    onEnter(makeWalletIdentity(
      debugName,
      LOCAL_DEBUG_WALLET_ADDRESS,
      stableHash(`${LOCAL_DEBUG_WALLET_ADDRESS}:${debugName}`),
      true,
      undefined,
      "",
    ));
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
        await connectAsync({ connector: injected, chainId: DEFAULT_WALLET_CHAIN_ID });
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
      <section className="auth-title-lockup" aria-label="mfertown">
        <div className="brand-mark">
          <MferPortrait traits={SARTOSHI_MFER_TRAITS} background="orange" variant="full" title="sartoshi mfer portrait" />
        </div>
        <div>
          <h1>mfertown</h1>
          <p>officially unofficial plaza build</p>
        </div>
      </section>

      <MferGptSwapMenu />

      <a className="auth-agents-link" href={AGENT_SKILL_URL} target="_blank" rel="noreferrer">
        <ExternalLink size={17} />
        <span>agents</span>
      </a>

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

        {isConnected && connectedReferralInviteUrl && (
          <div className="auth-referral-card" title={connectedReferralInviteUrl}>
            <div>
              <span>referral link</span>
              <code>{connectedReferralInviteUrl}</code>
            </div>
            <button type="button" aria-label="copy referral link" onClick={() => void copyConnectedReferralInviteUrl()}>
              {authReferralCopyStatus === "copied" ? <Check size={15} /> : <Copy size={15} />}
              {authReferralCopyStatus || "copy"}
            </button>
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
              {import.meta.env.DEV && (
                <button
                  className="text-btn"
                  type="button"
                  onClick={enterLocalDebugWallet}
                >
                  <Sparkles size={16} />
                  debug wallet
                </button>
              )}
            </>
          )}
          <button className="secondary-btn" type="button" disabled={anonEntryDisabled} onClick={openAnonWarning}>
            <UserRound size={18} />
            anon mfer
          </button>
        </div>
        <AuthOnlinePanel snapshot={onlineSnapshot} status={onlineStatus} error={onlineError} />
        {!isConnected && (
          <p className="wallet-action-hint">
            {anonEntryDisabled ? "open an invite link to enter mfertown" : "wallet saves progress; anon is temporary"}
          </p>
        )}
        {walletProfileError && <p className="wallet-action-error">{walletProfileError}</p>}
        {walletActionError && <p className="wallet-action-error">{walletActionError}</p>}
      </section>
      {showAnonWarning && (
        <div className="auth-modal-backdrop">
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="anon-warning-title">
            <header>
              <div>
                <span>anon mfer</span>
                <strong id="anon-warning-title">data won't be saved</strong>
              </div>
              <button type="button" aria-label="close anon warning" onClick={cancelAnonWarning}>
                <X size={18} />
              </button>
            </header>
            <p>
              Anonymous mfers are not tied to a wallet character. Quests, levels, items, traits, and rewards are not saved to a permanent profile.
            </p>
            <p>
              This browser may remember your anon name and local id, but private mode, cleared site data, or another browser can lose it.
            </p>
            <div className="auth-modal-actions">
              <button className="primary-btn" type="button" onClick={enterAnonMfer}>
                <UserRound size={18} />
                enter anon mfer
              </button>
              <button className="text-btn" type="button" onClick={cancelAnonWarning}>
                cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AuthOnlinePanel({
  error,
  snapshot,
  status,
}: {
  error: string;
  snapshot: AuthOnlineSnapshot | null;
  status: AuthOnlineStatus;
}) {
  const players = snapshot?.players ?? [];
  const playersOnline = snapshot?.playersOnline ?? players.length;
  const agentsOnline = snapshot?.agentsOnline ?? players.filter((player) => player.isAgent).length;
  const headerText = status === "loading" && !snapshot
    ? "checking town"
    : `${playersOnline} online / ${agentsOnline} agents`;

  return (
    <section className={`auth-online-panel ${status === "error" ? "stale" : ""}`} aria-label="online players">
      <header className="auth-online-header">
        <div>
          <span>online now</span>
          <strong>{headerText}</strong>
        </div>
        {snapshot?.generatedAt && <em>{formatAuthOnlineUpdatedAt(snapshot.generatedAt)}</em>}
      </header>

      <div className="auth-online-list" role="list">
        {players.length > 0 ? players.map((player) => (
          <div key={player.sessionId || `${player.walletAddress}:${player.name}`} className={`auth-online-row ${player.isAgent ? "agent" : ""}`} role="listitem">
            <div className="auth-online-main">
              <strong>{player.name || "mfer"}</strong>
              <span>{formatAuthOnlinePlayerMeta(player)}</span>
            </div>
            {player.isAgent && (
              <a className="auth-online-view" href={getAgentViewHref(player)} aria-label={`view ${player.name || "agent"} camera`}>
                <ExternalLink size={13} />
                <span>view</span>
              </a>
            )}
          </div>
        )) : (
          <p className="auth-online-state">
            {status === "error" ? "online list unavailable" : status === "loading" ? "checking town..." : "no mfers online"}
          </p>
        )}
      </div>

      {status === "error" && players.length > 0 && <p className="auth-online-state subtle">{error || "refresh failed"}</p>}
    </section>
  );
}

function getConnectedWalletAddress(data: unknown) {
  const accounts = (data as { accounts?: readonly unknown[] } | null)?.accounts;
  const firstAccount = accounts?.[0];
  return typeof firstAccount === "string" ? firstAccount : "";
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
  const [potionShopNpcId, setPotionShopNpcId] = useState<string | null>(null);
  const [trashVendorNpcId, setTrashVendorNpcId] = useState<string | null>(null);
  const [respecNpcId, setRespecNpcId] = useState<string | null>(null);
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
  const realCaptureInputRef = useRef<CaptureInputState | null>(null);
  const realCaptureCameraRef = useRef<CaptureCameraState | null>(null);
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
  const potionShopNpc = useMemo(
    () => potionShopNpcId ? room.npcs.get(potionShopNpcId) ?? null : null,
    [potionShopNpcId, room.npcs, room.snapshotRevision],
  );
  const trashVendorNpc = useMemo(
    () => trashVendorNpcId ? room.npcs.get(trashVendorNpcId) ?? null : null,
    [trashVendorNpcId, room.npcs, room.snapshotRevision],
  );
  const respecNpc = useMemo(
    () => respecNpcId ? room.npcs.get(respecNpcId) ?? null : null,
    [respecNpcId, room.npcs, room.snapshotRevision],
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
  const realCaptureMode = isRealCaptureMode();
  const realCaptureParams = realCaptureMode ? new URLSearchParams(window.location.search) : null;
  const hideCaptureHud = realCaptureMode && realCaptureParams?.get("realCaptureHud") === "0";
  const cleanCaptureAgentModel = realCaptureMode && realCaptureParams?.get("realCaptureCleanAgentModel") === "1";
  const visibleSelectedTarget = hideCaptureHud ? null : selectedTarget;
  const effectiveDebugPlacementOverrides = useMemo(
    () => ({
      ...savedDebugPlacementDefaults,
      ...debugPlacementOverrides,
    }),
    [debugPlacementOverrides, savedDebugPlacementDefaults],
  );
  const showGameLoader = room.status === "connecting" || (room.status === "connected" && !localPlayer);
  const connectionErrorLabel = room.persistenceStatus.state === "error"
    ? room.persistenceStatus.message || "wallet progress failed to save"
    : room.error;
  const connectionStatusLabel = connectionErrorLabel ? "error" : room.status;
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
  const openPotionShop = useCallback((npc: NpcSnapshot) => {
    setPotionShopNpcId(npc.id);
    trackEvent("potion_shop_opened", { npcId: npc.id, npcRole: npc.role });
    room.sendAnalyticsEvent("potion_shop_opened", { npcId: npc.id, npcRole: npc.role });
  }, [room]);
  const openTrashVendor = useCallback((npc: NpcSnapshot) => {
    setTrashVendorNpcId(npc.id);
    trackEvent("trash_vendor_opened", { npcId: npc.id, npcRole: npc.role });
    room.sendAnalyticsEvent("trash_vendor_opened", { npcId: npc.id, npcRole: npc.role });
  }, [room]);
  const openRespecPanel = useCallback((npc: NpcSnapshot) => {
    setRespecNpcId(npc.id);
    trackEvent("talent_respec_panel_opened", { npcId: npc.id, npcRole: npc.role });
    room.sendAnalyticsEvent("talent_respec_panel_opened", { npcId: npc.id, npcRole: npc.role });
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
      if (isPotionShopNpc(selectedNpc)) openPotionShop(selectedNpc);
      if (isTrashVendorNpc(selectedNpc)) openTrashVendor(selectedNpc);
      if (isRespecMferNpc(selectedNpc)) openRespecPanel(selectedNpc);
      if (isSwapMferNpc(selectedNpc)) openSwapMfer(selectedNpc);
      if (isTraitsMferNpc(selectedNpc)) openTraitsPanel(selectedNpc);
      room.sendInteract({ npcId: selectedNpc.id });
    }
  }, [audio, cryptoStoreEnabled, localPlayer, openCryptoStore, openPotionShop, openRespecPanel, openSwapMfer, openTraitsPanel, openTrashVendor, room.npcs, room.sendInteract]);
  const performInteract = useCallback(() => {
    if (!localPlayer || localPlayer.health <= 0) return;
    const selectedNpc = selectedTarget?.kind === "npc"
      ? findInteractableNpcInRange(localPlayer, room.npcs, selectedTarget.id)
      : null;
    const nearestNpc = selectedNpc ?? findNearestNpc(localPlayer, room.npcs);
    if (nearestNpc) audio.play(getNpcInteractionCue(nearestNpc), { volume: 0.7 });
    if (cryptoStoreEnabled && isCryptoStoreNpc(nearestNpc)) openCryptoStore(nearestNpc);
    if (isPotionShopNpc(nearestNpc)) openPotionShop(nearestNpc);
    if (isTrashVendorNpc(nearestNpc)) openTrashVendor(nearestNpc);
    if (isRespecMferNpc(nearestNpc)) openRespecPanel(nearestNpc);
    if (isSwapMferNpc(nearestNpc)) openSwapMfer(nearestNpc);
    if (isTraitsMferNpc(nearestNpc)) openTraitsPanel(nearestNpc);
    room.sendInteract(nearestNpc ? { npcId: nearestNpc.id } : {});
  }, [audio, cryptoStoreEnabled, localPlayer, openCryptoStore, openPotionShop, openRespecPanel, openSwapMfer, openTraitsPanel, openTrashVendor, room.npcs, room.sendInteract, selectedTarget]);
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
      const traitsNpc = room.npcs.get(message.npcId || TRAITS_MFER_NPC_ID);
      if (traitsNpc) openTraitsPanel(traitsNpc);
    }
  }, [audio, openTraitsPanel, room.npcs, room.sendAcceptQuest]);
  const completeQuest = useCallback((message: ClientCompleteQuest) => {
    audio.play("questComplete");
    room.sendCompleteQuest(message);
  }, [audio, room.sendCompleteQuest]);
  const cancelQuest = useCallback((message: ClientCancelQuest) => {
    audio.play("uiToggle");
    room.sendCancelQuest(message);
  }, [audio, room.sendCancelQuest]);
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
  const purchasePotionShopItem = useCallback((message: ClientPurchasePotionShopItem) => {
    audio.play("inventoryLoot");
    room.sendPurchasePotionShopItem(message);
  }, [audio, room.sendPurchasePotionShopItem]);
  const sellTrashItems = useCallback((message: ClientSellTrashItems) => {
    audio.play("inventoryLoot");
    room.sendSellTrashItems(message);
  }, [audio, room.sendSellTrashItems]);
  const respecTalents = useCallback((message: ClientRespecTalents) => {
    audio.play("uiConfirm");
    room.sendRespecTalents(message);
  }, [audio, room.sendRespecTalents]);
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
    const talentUnlockedActions = getTalentUnlockedCombatActions(localPlayer.talents);
    const unlockedActions = getUnlockedCombatActions(localPlayer.level, debugUnlockAllMoves, talentUnlockedActions) as CombatActionId[];
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
        captureInputRef: realCaptureInputRef,
        captureCameraRef: realCaptureCameraRef,
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
          controlsEnabled={!realCaptureMode}
          cameraControlsEnabled={realCaptureMode}
          cleanCaptureAgentModel={cleanCaptureAgentModel}
          captureInputRef={realCaptureMode ? realCaptureInputRef : undefined}
          captureCameraRef={realCaptureMode ? realCaptureCameraRef : undefined}
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
            onCancelQuest={cancelQuest}
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
            seasonReferralRemoveResult={room.seasonReferralRemoveResult}
            onRemoveSeasonReferral={room.sendRemoveSeasonReferral}
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
          {potionShopNpc && (
            <section className="floating-menu-overlay potion-shop-anchor" role="dialog" aria-label="potion shop">
              <PotionShopPanel
                npc={potionShopNpc}
                player={localPlayer ?? null}
                result={room.potionShopPurchaseResult}
                onClose={() => setPotionShopNpcId(null)}
                onPurchasePotionShopItem={purchasePotionShopItem}
                onAnalyticsEvent={room.sendAnalyticsEvent}
              />
            </section>
          )}
          {trashVendorNpc && (
            <section className="floating-menu-overlay trash-vendor-anchor" role="dialog" aria-label="trash vendor">
              <TrashVendorPanel
                npc={trashVendorNpc}
                player={localPlayer ?? null}
                result={room.trashVendorSellResult}
                onClose={() => setTrashVendorNpcId(null)}
                onSellTrashItems={sellTrashItems}
                onAnalyticsEvent={room.sendAnalyticsEvent}
              />
            </section>
          )}
          {respecNpc && (
            <section className="floating-menu-overlay respec-anchor" role="dialog" aria-label="respec">
              <RespecPanel
                npc={respecNpc}
                player={localPlayer ?? null}
                result={room.talentRespecResult}
                onClose={() => setRespecNpcId(null)}
                onRespecTalents={respecTalents}
                onAnalyticsEvent={room.sendAnalyticsEvent}
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
  if (consumable.buffId) return null;

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
  if (!isCombatActionUnlocked(actionId, player.level, player.talents, debugUnlockAllMoves)) return "Ability is locked";
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

async function fetchAuthOnlineSnapshot(signal?: AbortSignal) {
  const response = await fetch(getAgentWorldUrl(), { cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(getAuthOnlineErrorMessage(payload, response.status));
  return normalizeAuthOnlineSnapshot(payload);
}

function getAgentWorldUrl() {
  return `${getAgentApiHttpBase()}/agent-world?playerLimit=${AUTH_ONLINE_PLAYER_LIMIT}`;
}

function getAgentViewHref(player: AuthOnlinePlayer) {
  const params = new URLSearchParams();
  if (player.walletAddress) {
    params.set("wallet", player.walletAddress);
  } else if (player.sessionId) {
    params.set("session", player.sessionId);
  } else {
    params.set("agent", player.name);
  }
  return `/agent-view?${params.toString()}`;
}

function getDebugPlacementMapUrl() {
  const configured = import.meta.env.VITE_SERVER_URL ? String(import.meta.env.VITE_SERVER_URL) : "";
  if (configured) {
    return `${configured.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/$/, "")}/debug-placement-map`;
  }
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${window.location.hostname}:2567/debug-placement-map`;
}

function getAgentApiHttpBase() {
  const configured = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
  if (configured) {
    return configured.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    return `${protocol}://${window.location.hostname}:2567`;
  }

  return "";
}

function normalizeAuthOnlineSnapshot(value: unknown): AuthOnlineSnapshot {
  if (!isRecord(value) || value.ok !== true) throw new Error("online roster response was not valid");
  const players = toArray(value.onlinePlayers)
    .map(normalizeAuthOnlinePlayer)
    .filter((player): player is AuthOnlinePlayer => Boolean(player))
    .sort((left, right) => Number(right.isAgent) - Number(left.isAgent) || left.name.localeCompare(right.name))
    .slice(0, AUTH_ONLINE_PLAYER_LIMIT);

  return {
    generatedAt: toStringValue(value.generatedAt) || new Date().toISOString(),
    playersOnline: players.length,
    agentsOnline: players.filter((player) => player.isAgent).length,
    humansOnline: players.filter((player) => !player.isAgent).length,
    players,
  };
}

function normalizeAuthOnlinePlayer(value: unknown): AuthOnlinePlayer | null {
  if (!isRecord(value)) return null;
  const sessionId = toStringValue(value.sessionId);
  const name = toStringValue(value.name) || "mfer";
  if (name.trim().toLowerCase() === STREAM_CAMERA_PLAYER_NAME) return null;
  if (!sessionId && !name) return null;
  const currentQuest = isRecord(value.currentQuest) ? value.currentQuest : {};
  return {
    sessionId,
    name,
    identityType: toStringValue(value.identityType) || "guest",
    isAgent: value.isAgent === true,
    walletAddress: toStringValue(value.walletAddress),
    walletShort: toStringValue(value.walletShort),
    status: toStringValue(value.status) || "online",
    zone: toStringValue(value.zone),
    level: Math.max(1, toNumber(value.level) || 1),
    health: toNumber(value.health),
    maxHealth: toNumber(value.maxHealth),
    currentQuestTitle: toStringValue(currentQuest.title),
  };
}

function formatAuthOnlinePlayerMeta(player: AuthOnlinePlayer) {
  const identity = player.isAgent ? "agent" : player.identityType === "wallet" ? "wallet" : "anon";
  const status = player.status === "dead" ? "down" : player.zone || "town";
  return `${identity} / lvl ${player.level} / ${status}`;
}

function formatAuthOnlineUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getAuthOnlineErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  return `online roster request failed (${status})`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
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
        notices.push({ actionId, buttonIndex: buttonIndex >= 0 ? buttonIndex : null, sourceLabel: getMoveUnlockSourceLabel(actionId, player) });
      }
      continue;
    }

    const emptyIndex = next.findIndex((slot) => !slot);
    if (emptyIndex === -1) {
      if (shouldNotify && newlyUnlockedActionSet.has(actionId)) {
        notices.push({ actionId, buttonIndex: null, sourceLabel: getMoveUnlockSourceLabel(actionId, player) });
      }
      continue;
    }

    next[emptyIndex] = actionId;
    assignedActions.add(actionId);
    if (shouldNotify && newlyUnlockedActionSet.has(actionId)) {
      notices.push({ actionId, buttonIndex: emptyIndex, sourceLabel: getMoveUnlockSourceLabel(actionId, player) });
    }
  }

  return {
    slots: debugUnlockAllMoves ? next : next.map((slot) => isLockedCombatActionSlot(slot, player) ? null : slot),
    notices,
  };
}

function getMoveUnlockSourceLabel(actionId: CombatActionId, player: PlayerSnapshot) {
  const unlockTalent = getCombatActionUnlockTalent(actionId);
  return unlockTalent ? "Talent" : `Level ${player.level}`;
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

function isLockedCombatActionSlot(slot: ActionSlot, player: PlayerSnapshot) {
  return isCombatActionSlot(slot) && !isCombatActionUnlocked(slot, player.level, player.talents);
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

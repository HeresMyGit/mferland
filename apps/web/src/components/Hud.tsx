import { type CSSProperties, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Copy, Dumbbell, ExternalLink, Gift, Hand, Info, Laugh, ListChecks, LogOut, Map as MapIcon, Meh, Menu, Music, Package, PartyPopper, RefreshCw, Settings, Sparkles, UserRound, X, type LucideIcon } from "lucide-react";
import {
  CHAT,
  COMBAT,
  ELIXIR_BUFFS,
  EMOTES,
  EQUIPMENT_SLOT_IDS,
  EQUIPMENT_SLOTS,
  ITEMS,
  QUESTS,
  SOCIAL,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_TOTAL_POINT_CAP,
  STAT_LABELS,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  doesItemRevealAllNpcsOnMinimap,
  getFishingNftGameItemMapping,
  getLevelProgress,
  getInventoryItemKey,
  getItemConsumable,
  getItemEquipment,
  getItemHeirloomStatsPerLevel,
  getNpcDisposition,
  getNpcQuestMarker,
  isMerchantNpcId,
  normalizeChainGearTier,
  normalizeItemLevel,
  type ActionId,
  type ActiveBuffSnapshot,
  type ChatMessage,
  type CombatActionId,
  type EmoteId,
  type ClientAbandonFishingNftCatch,
  type ClientAcceptQuest,
  type ClientCancelQuest,
  type ClientCompleteQuest,
  type ClientEquipItem,
  type ClientLootCorpse,
  type ClientRemoveSeasonReferral,
  type ClientRegisterChainGear,
  type ClientSelectTalent,
  type ClientShareQuestLink,
  type ClientSubmitFishingNftClaimTx,
  type ClientSubmitMintClubRedemptionTx,
  type ClientUnequipItem,
  type ClientUseItem,
  type EquipmentSlotId,
  type InventoryItemSnapshot,
  type FishingNftCapNotice,
  type FishingNftCatchSnapshot,
  type FishingNftCatchResult,
  type FishingNftHistoryResult,
  type ItemId,
  type LootWindow,
  type MintClubRedemptionResult,
  type NpcSnapshot,
  type PlayerSnapshot,
  type QuestOffer,
  type QuestId,
  type QuestMarkerType,
  type QuestStatusNotice,
  type QuestTurnIn,
  type SeasonReferralRemoveResult,
  type TargetSelection,
} from "@mferland/shared";
import { colorFromSeed } from "../game/random";
import { type AudioSettings } from "../game/audio";
import { MFER_COLORS } from "../game/mferPalette";
import { resolveMferTraitsForPlayer } from "../game/mferTraits";
import { GRAPHICS_QUALITY_OPTIONS, type GameSettings, type GraphicsQuality, type NameplateVisibility } from "../game/settings";
import { type RenderPerformanceProfile } from "../game/performance";
import { ActionSlotButton, getActionMeta, getActionReadyAt } from "./hud/ActionSlotButton";
import { AbilitiesPanel } from "./hud/AbilitiesPanel";
import { AbilityIcon, EquipmentSlotIcon } from "./hud/GameIcon";
import { ItemIcon } from "./hud/ItemIcon";
import { Quest } from "./hud/Quest";
import { TargetFrame } from "./hud/TargetFrame";
import { type ActionSlot, type DragState, isItemActionSlot, makeItemActionSlot } from "./hud/types";
import { CryptoStorePanel } from "./CryptoStorePanel";
import { MOVABLE_WINDOW_RESET_EVENT, MovableWindow, resetMovableWindows } from "./MovableWindow";
import { MferPortrait } from "./MferPortrait";
import { fetchSeasonReferralSummary, type SeasonReferralSummary } from "../seasonReferrals";
import { copyTextToClipboard } from "../clipboard";
import {
  MINIMAP_HUBS,
  MINIMAP_LANDMARKS,
  MINIMAP_ROADS,
  getExploredCellKeys,
  getExploredCellStyle,
  getMinimapCircleStyle,
  getMinimapGuidancePoint,
  getMinimapPointStyle,
  getMinimapRoadStyle,
  getWorldMapGuidancePoint,
  getWorldMapCircleStyle,
  getWorldMapPointStyle,
  getWorldMapRoadStyle,
  type MapGuidancePoint,
} from "./hud/mapUtils";
import { getActiveQuestGuidance, getPrimaryQuestGuidanceTarget, type ActiveQuestGuidance, type QuestGuidanceTarget } from "./hud/questGuidance";
import { formatTooltipLabel, getSlotIndexFromPoint, isTypingTarget, percent } from "./hud/utils";
import { executeFishingPondClaim, getFishingPondClaimTxUrl, getLocalDebugEthereumProvider, getLocalFishingPondClaimProvider } from "../crypto/fishingPond";
import {
  approveMintClubRedemption,
  getMintClubRedemptionTxUrl,
  readMintClubRedemptionWalletState,
  sellMintClubRedemption,
  type MintClubRedemptionWalletState,
} from "../crypto/mintClubRedemption";
import type { EthereumProvider } from "../crypto/transactionReceipts";

const HUD_TICK_MS = 200;
const IDLE_HUD_TICK_MIN_MS = 1000;
const TOOLTIP_MAX_WIDTH = 280;
const TOOLTIP_MAX_HEIGHT = 220;
const TOOLTIP_OFFSET = 16;
const LOW_HEALTH_PERCENT = 32;
const RECENT_DAMAGE_FLASH_MS = 900;
const MINIMAP_NPC_REVEAL_RANGE = COMBAT.actions.shoot.maxRange + 8;
const LOCAL_CONTRACT_CONFIG_URL = "/crypto/local-contracts.json";
const PRODUCTION_CONTRACT_CONFIG_URL = "/crypto/production-contracts.json";
const LOCAL_CHAIN_ID = 31337;
const LOCAL_CHAIN_RPC_URL = "http://127.0.0.1:8545";
const BASE_CHAIN_ID = TRAIT_CHANGE_BASE_CHAIN_ID;
const BASE_CHAIN_RPC_URL = TRAIT_CHANGE_BASE_RPC_URL;
const IS_PRODUCTION_BUILD = Boolean(import.meta.env?.PROD);
const SEASON_PASS_OWNERSHIP_REFRESH_MS = 60_000;
const REFERRALS_BADGE_SEEN_KEY = "mferland.referralsBadgeSeen:v1";
const HUD_HIDDEN_WIDGETS_STORAGE_KEY = "mferland:hiddenHudWidgets:v1";
const BALANCE_OF_SELECTOR = "0x70a08231";
const EMPTY_SEASON_PASS_OWNERSHIP: SeasonPassOwnershipState = {
  state: "idle",
  label: "--",
  error: "",
};
const EMPTY_REFERRAL_SUMMARY: SeasonReferralSummaryState = {
  state: "idle",
  summary: null,
  error: "",
};
const EMOTE_OPTIONS: Array<{ id: EmoteId; Icon: LucideIcon }> = [
  { id: "wave", Icon: Hand },
  { id: "dance", Icon: Music },
  { id: "laugh", Icon: Laugh },
  { id: "cheer", Icon: PartyPopper },
  { id: "flex", Icon: Dumbbell },
  { id: "shrug", Icon: Meh },
];

type HudTooltipState = {
  text: string;
  x: number;
  y: number;
};
type PendingReferralRemoval = {
  refereeWalletAddress: string;
  characterName: string;
};
type CryptoStoreAnalyticsProperties = Record<string, string | number | boolean | null>;

type SeasonPassOwnershipState = {
  state: "idle" | "loading" | "ready" | "error";
  label: string;
  error: string;
};

type CharacterPanelTab = "gear" | "referrals";
type InventoryPanelTab = "items" | "pond";
type SeasonReferralSummaryState = {
  state: "idle" | "loading" | "ready" | "error";
  summary: SeasonReferralSummary | null;
  error: string;
};

type HudCryptoChainConfig = {
  chainId: number;
  rpcUrl: string;
};

type HudCryptoContractsDocument = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    launchPass?: string;
  };
};

type MoveUnlockNotice = {
  id: number;
  actionId: CombatActionId;
  sourceLabel: string;
  buttonIndex: number | null;
};

type HudProps = {
  identity: {
    name: string;
    avatarSeed: number;
    walletAddress?: string;
  };
  playerCount: number;
  connectionStatus: string;
  connectionError: string | null;
  chat: ChatMessage[];
  players: Map<string, PlayerSnapshot>;
  npcs: Map<string, NpcSnapshot>;
  selectedTarget: TargetSelection | null;
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null;
  cryptoStoreNpc: NpcSnapshot | null;
  mintClubRedemptionNpc: NpcSnapshot | null;
  localSessionId: string | null;
  localPlayer: PlayerSnapshot | null;
  questOffer: QuestOffer | null;
  questTurnIn: QuestTurnIn | null;
  questStatus: QuestStatusNotice | null;
  lootWindow: LootWindow | null;
  fishingNftCapNotice: FishingNftCapNotice | null;
  fishingNftCatchResult: FishingNftCatchResult | null;
  fishingNftHistoryResult: FishingNftHistoryResult | null;
  mintClubRedemptionResult: MintClubRedemptionResult | null;
  actionError: { id: number; text: string } | null;
  moveUnlockNotice: MoveUnlockNotice | null;
  globalCooldownReadyAt?: number;
  actionSlots: ActionSlot[];
  onAction: (slot: NonNullable<ActionSlot>) => void;
  onReplaceActionSlots: (slots: ActionSlot[]) => void;
  onAcceptQuest: (message: ClientAcceptQuest) => void;
  onCompleteQuest: (message: ClientCompleteQuest) => void;
  onCancelQuest: (message: ClientCancelQuest) => void;
  onShareQuestLink: (message: ClientShareQuestLink) => void;
  onDismissQuestOffer: () => void;
  onDismissQuestTurnIn: () => void;
  onDismissQuestStatus: () => void;
  onLootCorpse: (message: ClientLootCorpse) => void;
  onSubmitFishingNftClaimTx: (message: ClientSubmitFishingNftClaimTx) => void;
  onAbandonFishingNftCatch: (message: ClientAbandonFishingNftCatch) => void;
  onSubmitMintClubRedemptionTx: (message: ClientSubmitMintClubRedemptionTx) => void;
  onRefreshFishingNftHistory: () => void;
  onEquipItem: (message: ClientEquipItem) => void;
  onUnequipItem: (message: ClientUnequipItem) => void;
  onUseItem: (message: ClientUseItem) => void;
  onRegisterChainGear: (message: ClientRegisterChainGear) => void;
  onCryptoStoreAnalytics: (eventType: string, properties?: CryptoStoreAnalyticsProperties) => void;
  onSelectTalent: (message: ClientSelectTalent) => void;
  seasonReferralRemoveResult?: SeasonReferralRemoveResult | null;
  onRemoveSeasonReferral?: (message: ClientRemoveSeasonReferral) => void;
  onCloseLootWindow: () => void;
  onCloseCryptoStore: () => void;
  onCloseMintClubRedemption: () => void;
  onSendChat: (text: string) => void;
  onEmote: (emoteId: EmoteId) => void;
  onRespawn: () => void;
  onSelectSelfTarget: () => void;
  onExit: () => void;
  settings: GameSettings;
  renderProfile: RenderPerformanceProfile;
  debugToolsAvailable: boolean;
  hideChatPanel?: boolean;
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
  cryptoStoreNpc,
  mintClubRedemptionNpc,
  localSessionId,
  localPlayer,
  questOffer,
  questTurnIn,
  questStatus,
  lootWindow,
  fishingNftCapNotice,
  fishingNftCatchResult,
  fishingNftHistoryResult,
  mintClubRedemptionResult,
  actionError,
  moveUnlockNotice,
  globalCooldownReadyAt = 0,
  actionSlots,
  onAction,
  onReplaceActionSlots,
  onAcceptQuest,
  onCompleteQuest,
  onCancelQuest,
  onShareQuestLink,
  onDismissQuestOffer,
  onDismissQuestTurnIn,
  onDismissQuestStatus,
  onLootCorpse,
  onSubmitFishingNftClaimTx,
  onAbandonFishingNftCatch,
  onSubmitMintClubRedemptionTx,
  onRefreshFishingNftHistory,
  onEquipItem,
  onUnequipItem,
  onUseItem,
  onRegisterChainGear,
  onCryptoStoreAnalytics,
  onSelectTalent,
  seasonReferralRemoveResult = null,
  onRemoveSeasonReferral = () => undefined,
  onCloseLootWindow,
  onCloseCryptoStore,
  onCloseMintClubRedemption,
  onSendChat,
  onEmote,
  onRespawn,
  onSelectSelfTarget,
  onExit,
  settings,
  renderProfile,
  debugToolsAvailable,
  hideChatPanel = false,
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
  const chatLogRef = useRef<HTMLDivElement>(null);
  const shouldStickChatToBottomRef = useRef(true);
  const [now, setNow] = useState(() => Date.now());
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isQuestLogOpen, setIsQuestLogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isCharacterOpen, setIsCharacterOpen] = useState(false);
  const [characterPanelTab, setCharacterPanelTab] = useState<CharacterPanelTab>("gear");
  const [inventoryPanelTab, setInventoryPanelTab] = useState<InventoryPanelTab>("items");
  const [seasonPassOwnership, setSeasonPassOwnership] = useState<SeasonPassOwnershipState>(EMPTY_SEASON_PASS_OWNERSHIP);
  const [seasonReferralSummary, setSeasonReferralSummary] = useState<SeasonReferralSummaryState>(EMPTY_REFERRAL_SUMMARY);
  const [referralCopyStatus, setReferralCopyStatus] = useState("");
  const [pendingReferralRemoval, setPendingReferralRemoval] = useState<PendingReferralRemoval | null>(null);
  const [hiddenFishingNftCatchId, setHiddenFishingNftCatchId] = useState("");
  const [hiddenFishingNftCapNoticeKey, setHiddenFishingNftCapNoticeKey] = useState("");
  const [pendingFishingNftClose, setPendingFishingNftClose] = useState<NonNullable<PlayerSnapshot["fishingNftCatch"]> | null>(null);
  const [isReferralInfoOpen, setIsReferralInfoOpen] = useState(false);
  const [hasSeenReferralsBadge, setHasSeenReferralsBadge] = useState(() => readReferralsBadgeSeen());
  const [isAbilitiesOpen, setIsAbilitiesOpen] = useState(false);
  const [isEmotesOpen, setIsEmotesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeQuestId, setActiveQuestId] = useState<QuestId | null>(null);
  const [showCompletedQuests, setShowCompletedQuests] = useState(false);
  const [isQuestTrackerHidden, setIsQuestTrackerHidden] = useState(() => readQuestTrackerHidden());
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
  const playerPortraitTraits = useMemo(
    () => resolveMferTraitsForPlayer(portraitSeed, localPlayer?.appearanceTraits),
    [localPlayer?.appearanceTraits, portraitSeed],
  );
  const characterWalletAddress = localPlayer?.walletAddress || identity.walletAddress || "";
  useEffect(() => {
    if (characterWalletAddress) onRefreshFishingNftHistory();
  }, [characterWalletAddress, onRefreshFishingNftHistory]);
  const questLog = useMemo(() => localPlayer?.quests ?? [], [localPlayer?.quests]);
  const visibleQuestLog = useMemo(
    () => showCompletedQuests ? questLog : questLog.filter((quest) => quest.status !== "completed"),
    [questLog, showCompletedQuests],
  );
  const completedQuestCount = questLog.length - questLog.filter((quest) => quest.status !== "completed").length;
  const revealAllNpcsOnMinimap = playerRevealsAllNpcsOnMinimap(localPlayer);
  const visibleMapNpcs = Array.from(npcs.values())
    .map((npc) => ({ npc, questMarker: getNpcQuestMarker(npc, questLog) }))
    .filter(({ npc, questMarker }) => shouldShowNpcOnMaps({
      localPlayer,
      npc,
      questMarker,
      revealAllNpcsOnMinimap,
    }));
  const visibleInventory = localPlayer?.inventory.filter((item) => !isInventoryItemEquipped(localPlayer, item)) ?? [];
  const fishingNftHistory = fishingNftHistoryResult?.catches ?? [];
  const fishingWalletNfts = fishingNftHistoryResult?.walletNfts ?? [];
  const fishingNftStashCount = fishingNftHistory.length + fishingWalletNfts.length;
  const inventoryItemCount = visibleInventory.length + fishingWalletNfts.length;
  const mintClubRedeemableCatches = fishingNftHistory.filter((catchSnapshot) => (
    catchSnapshot.status === "confirmed"
    && catchSnapshot.mintClubRedemption
    && catchSnapshot.mintClubRedemption.status !== "claim_required"
  ));
  const showFishingNftHistory = Boolean(fishingNftHistoryResult);
  const effectiveInventoryPanelTab: InventoryPanelTab = showFishingNftHistory ? inventoryPanelTab : "items";
  const talentPointCount = localPlayer?.talentPoints ?? 0;
  const showSeasonPoints = localPlayer?.identityType === "wallet";
  const activeFishingNftCatch = fishingNftCatchResult?.catch ?? localPlayer?.fishingNftCatch ?? null;
  const visibleFishingNftCatch = activeFishingNftCatch?.catchId === hiddenFishingNftCatchId ? null : activeFishingNftCatch;
  const fishingNftCapNoticeKey = getFishingNftCapNoticeKey(fishingNftCapNotice);
  const visibleFishingNftCapNotice = fishingNftCapNotice
    && fishingNftCapNoticeKey !== hiddenFishingNftCapNoticeKey
    && !hasSeenFishingRodNotice(characterWalletAddress, fishingNftCapNotice)
    ? fishingNftCapNotice
    : null;
  const effectiveCharacterPanelTab: CharacterPanelTab = characterWalletAddress ? characterPanelTab : "gear";
  const showReferralsBadge = Boolean(characterWalletAddress && !hasSeenReferralsBadge);
  const mobileMenuBadge = talentPointCount > 0 ? String(talentPointCount) : showReferralsBadge ? "!" : "";
  const levelProgress = useMemo(() => getLevelProgress(localPlayer?.xp ?? 0), [localPlayer?.xp]);
  const healthPercent = percent(localPlayer?.health ?? 100, localPlayer?.maxHealth ?? 100);
  const lowHealth = Boolean(localPlayer && localPlayer.health > 0 && healthPercent <= LOW_HEALTH_PERCENT);
  const recentlyDamaged = Boolean(localPlayer?.lastDamagedAt && now - localPlayer.lastDamagedAt <= RECENT_DAMAGE_FLASH_MS);
  const isDead = Boolean(localPlayer && localPlayer.health <= 0);
  const hudClassName = [
    "hud",
    lowHealth ? "low-health" : "",
    recentlyDamaged ? "recent-hit" : "",
    isDead ? "dead" : "",
  ].filter(Boolean).join(" ");
  const agentFocusedQuestId = useMemo(
    () => getAgentFocusedQuestId(localPlayer, questLog),
    [localPlayer?.agentStatusQuest, localPlayer?.isAgent, questLog],
  );
  const activeQuest = activeQuestId
    ? questLog.find((quest) => quest.id === activeQuestId && quest.status !== "completed") ?? null
    : null;
  const trackedQuests = useMemo(() => {
    const active = activeQuestId
      ? questLog.find((quest) => quest.id === activeQuestId && quest.status !== "completed") ?? null
      : null;
    const remaining = questLog.filter((quest) => quest.status !== "completed" && quest.id !== active?.id);
    return active ? [active, ...remaining].slice(0, 2) : remaining.slice(0, 2);
  }, [activeQuestId, questLog]);
  const activeQuestGuidance = getActiveQuestGuidance(activeQuest, npcs, localPlayer);
  const primaryActiveQuestTarget = getPrimaryQuestGuidanceTarget(activeQuestGuidance, localPlayer);
  const hasTrackedQuests = trackedQuests.length > 0;
  const showQuestTracker = hasTrackedQuests && !isQuestTrackerHidden;
  const clockMinute = Math.floor(now / 60000);
  const clockLabel = useMemo(
    () => new Date(clockMinute * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [clockMinute],
  );
  const activeBuffs = useMemo(
    () => getVisibleActiveBuffs(localPlayer?.activeBuffs ?? [], now),
    [localPlayer?.activeBuffs, now],
  );
  const hudTickDelay = getHudTickDelay(localPlayer, actionSlots, now, globalCooldownReadyAt);

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(Date.now()), hudTickDelay);
    return () => window.clearTimeout(timeout);
  }, [hudTickDelay, now]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog || !shouldStickChatToBottomRef.current) return;
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [chat.length]);

  useEffect(() => {
    function handleUiReset() {
      clearHiddenHudWidgets();
      setIsQuestTrackerHidden(false);
    }

    window.addEventListener(MOVABLE_WINDOW_RESET_EVENT, handleUiReset);
    return () => window.removeEventListener(MOVABLE_WINDOW_RESET_EVENT, handleUiReset);
  }, []);

  useEffect(() => {
    if (agentFocusedQuestId && activeQuestId !== agentFocusedQuestId) {
      setActiveQuestId(agentFocusedQuestId);
      return;
    }

    const stillActive = activeQuestId
      ? questLog.some((quest) => quest.id === activeQuestId && quest.status !== "completed")
      : false;
    if (stillActive) return;

    const nextQuest = questLog.find((quest) => quest.status === "ready")
      ?? questLog.find((quest) => quest.status === "active")
      ?? null;
    setActiveQuestId(nextQuest?.id ?? null);
  }, [activeQuestId, agentFocusedQuestId, questLog]);

  useEffect(() => {
    if (!isCharacterOpen) return;
    if (!isAddress(characterWalletAddress)) {
      setSeasonPassOwnership(EMPTY_SEASON_PASS_OWNERSHIP);
      return;
    }

    let disposed = false;
    let timer: number | null = null;

    async function refreshSeasonPassOwnership() {
      setSeasonPassOwnership((current) => ({
        ...current,
        state: current.state === "idle" ? "loading" : current.state,
        error: "",
      }));
      try {
        const balance = await readSeasonPassBalance(characterWalletAddress);
        if (disposed) return;
        setSeasonPassOwnership({
          state: "ready",
          label: formatSeasonPassBalance(balance),
          error: "",
        });
      } catch (error) {
        if (!disposed) {
          setSeasonPassOwnership({
            state: "error",
            label: "unavailable",
            error: getHudCryptoErrorMessage(error),
          });
        }
      }
    }

    void refreshSeasonPassOwnership();
    timer = window.setInterval(() => void refreshSeasonPassOwnership(), SEASON_PASS_OWNERSHIP_REFRESH_MS);
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [characterWalletAddress, isCharacterOpen]);

  useEffect(() => {
    if (!isCharacterOpen) return;
    if (!isAddress(characterWalletAddress)) {
      setSeasonReferralSummary(EMPTY_REFERRAL_SUMMARY);
      return;
    }

    let disposed = false;
    setSeasonReferralSummary((current) => ({
      ...current,
      state: current.state === "idle" ? "loading" : current.state,
      error: "",
    }));
    void fetchSeasonReferralSummary(characterWalletAddress)
      .then((summary) => {
        if (disposed) return;
        setSeasonReferralSummary({ state: "ready", summary, error: "" });
      })
      .catch((error) => {
        if (disposed) return;
        setSeasonReferralSummary({
          state: "error",
          summary: null,
          error: error instanceof Error ? error.message : "referrals unavailable",
        });
      });

    return () => {
      disposed = true;
    };
  }, [
    characterWalletAddress,
    isCharacterOpen,
    localPlayer?.season0DailyPoints,
    localPlayer?.season0Points,
    seasonReferralRemoveResult?.refereeWalletAddress,
    seasonReferralRemoveResult?.status,
  ]);

  useEffect(() => {
    carriedSlotRef.current = carriedSlot;
  }, [carriedSlot]);

  async function copyReferralInviteUrl(url: string) {
    if (!url) return;
    const copied = await copyTextToClipboard(url);
    setReferralCopyStatus(copied ? "copied" : "copy failed");
  }

  function requestRemoveReferral(refereeWalletAddress: string, characterName: string) {
    setPendingReferralRemoval({
      refereeWalletAddress,
      characterName,
    });
  }

  function cancelReferralRemoval() {
    setPendingReferralRemoval(null);
  }

  function confirmReferralRemoval() {
    if (!pendingReferralRemoval) return;
    onRemoveSeasonReferral({ refereeWalletAddress: pendingReferralRemoval.refereeWalletAddress });
    setPendingReferralRemoval(null);
  }

  function requestCloseFishingNftClaim(catchSnapshot: NonNullable<PlayerSnapshot["fishingNftCatch"]>) {
    if (shouldConfirmFishingNftClaimClose(catchSnapshot)) {
      setPendingFishingNftClose(catchSnapshot);
      return;
    }
    closeFishingNftClaim(catchSnapshot.catchId);
  }

  function closeFishingNftClaim(catchId: string) {
    setHiddenFishingNftCatchId(catchId);
    setPendingFishingNftClose(null);
  }

  function forfeitFishingNftClaim(catchId: string) {
    onAbandonFishingNftCatch({ catchId });
    setHiddenFishingNftCatchId(catchId);
    setPendingFishingNftClose(null);
  }

  function markReferralsBadgeSeen() {
    if (hasSeenReferralsBadge) return;
    writeReferralsBadgeSeen();
    setHasSeenReferralsBadge(true);
  }

  function openReferralsTab() {
    setCharacterPanelTab("referrals");
    markReferralsBadgeSeen();
  }

  function toggleCharacterPanel() {
    if (showReferralsBadge) {
      setCharacterPanelTab("referrals");
      setIsCharacterOpen(true);
      markReferralsBadgeSeen();
      return;
    }
    setIsCharacterOpen((open) => !open);
  }

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

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
        applyHudPositionStyle(worldMapLocalRef.current, getWorldMapLocalMarkerStyle(local));
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
      else if (key === "c") toggleCharacterPanel();
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
    isEmotesOpen,
    isSettingsOpen,
    isMobileMenuOpen,
    lootWindow,
    questOffer,
    questTurnIn,
    questStatus,
    visibleFishingNftCatch,
    visibleFishingNftCapNotice,
    pendingFishingNftClose,
    onCloseLootWindow,
    onDismissQuestOffer,
    onDismissQuestTurnIn,
    onDismissQuestStatus,
    hasSeenReferralsBadge,
    showReferralsBadge,
  ]);

  function closeTopOverlay() {
    if (carriedSlotRef.current) {
      setCarriedSlot(null);
      setDropSlot(null);
      return true;
    }
    if (pendingFishingNftClose) {
      setPendingFishingNftClose(null);
      return true;
    }
    if (visibleFishingNftCapNotice) {
      dismissFishingNftCapNotice(characterWalletAddress, visibleFishingNftCapNotice, setHiddenFishingNftCapNoticeKey);
      return true;
    }
    if (lootWindow) {
      onCloseLootWindow();
      return true;
    }
    if (visibleFishingNftCatch) {
      requestCloseFishingNftClaim(visibleFishingNftCatch);
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
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
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
    if (isEmotesOpen) {
      setIsEmotesOpen(false);
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

  function triggerEmote(emoteId: EmoteId) {
    onEmote(emoteId);
    setIsEmotesOpen(false);
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

  function handleTooltipPointerOver(event: PointerEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    showTooltip(element.dataset.tooltip, event.clientX, event.clientY);
  }

  function handleTooltipPointerMove(event: PointerEvent<HTMLElement>) {
    if (!getTooltipElement(event.target)) return;
    moveTooltip(event.clientX, event.clientY);
  }

  function handleTooltipPointerOut(event: PointerEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    hideTooltip();
  }

  function handleTooltipMouseOver(event: ReactMouseEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    showTooltip(element.dataset.tooltip, event.clientX, event.clientY);
  }

  function handleTooltipMouseMove(event: ReactMouseEvent<HTMLElement>) {
    if (!getTooltipElement(event.target)) return;
    moveTooltip(event.clientX, event.clientY);
  }

  function handleTooltipMouseOut(event: ReactMouseEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    hideTooltip();
  }

  function handleTooltipClick(event: ReactMouseEvent<HTMLElement>) {
    const element = getTooltipElement(event.target);
    if (!element) return;
    showTooltip(element.dataset.tooltip, event.clientX, event.clientY);
  }

  function getMapAnnotationTooltipProps(text: string) {
    return {
      "data-tooltip": text,
      title: text,
      onClick: (event: ReactMouseEvent<HTMLElement>) => showTooltip(text, event.clientX, event.clientY),
      onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => showTooltip(text, event.clientX, event.clientY),
      onMouseLeave: hideTooltip,
      onMouseMove: (event: ReactMouseEvent<HTMLElement>) => moveTooltip(event.clientX, event.clientY),
      onPointerEnter: (event: PointerEvent<HTMLElement>) => showTooltip(text, event.clientX, event.clientY),
      onPointerLeave: hideTooltip,
      onPointerMove: (event: PointerEvent<HTMLElement>) => moveTooltip(event.clientX, event.clientY),
    };
  }

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

  function hideQuestTracker() {
    setIsQuestTrackerHidden(true);
    writeQuestTrackerHidden(true);
  }

  function handleChatLogScroll() {
    const chatLog = chatLogRef.current;
    if (!chatLog) return;
    shouldStickChatToBottomRef.current = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight <= 24;
  }

  return (
    <div
      className={hudClassName}
      onFocusCapture={handleTooltipFocus}
      onBlurCapture={hideTooltip}
      onPointerOverCapture={handleTooltipPointerOver}
      onPointerMoveCapture={handleTooltipPointerMove}
      onPointerOutCapture={handleTooltipPointerOut}
      onMouseOverCapture={handleTooltipMouseOver}
      onMouseMoveCapture={handleTooltipMouseMove}
      onMouseOutCapture={handleTooltipMouseOut}
      onClickCapture={handleTooltipClick}
    >
      <MovableWindow id="hud.player-card" as="section" className="player-card">
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
          <div className={lowHealth ? "bar hp critical" : "bar hp"}>
            <span style={{ width: `${healthPercent}%` }} />
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
          <ActiveBuffStrip buffs={activeBuffs} now={now} />
        </div>
      </MovableWindow>

      {localPlayer?.castingAction && (
        <CastBar
          actionId={localPlayer.castingAction}
          startedAt={localPlayer.castStartedAt}
          endsAt={localPlayer.castEndsAt}
        />
      )}

      {showQuestTracker && (
        <MovableWindow
          id="hud.quest-tracker"
          as="section"
          className="quest-panel"
          allowInteractiveDrag
        >
          <div className="quest-panel-header">
            <h2>errands</h2>
            <div className="quest-panel-header-actions">
              <button type="button" title="errand log" aria-label="Open errand log" onClick={() => setIsQuestLogOpen(true)}>
                <BookOpen size={17} />
              </button>
              <button type="button" title="Hide errands" aria-label="Hide errands widget" onClick={hideQuestTracker}>
                <X size={17} />
              </button>
            </div>
          </div>
          {trackedQuests.map((quest) => (
            <Quest
              key={quest.id}
              quest={quest}
              active={quest.id === activeQuestId}
              onActivate={setActiveQuestId}
            />
          ))}
        </MovableWindow>
      )}

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
          onShareQuestLink={onShareQuestLink}
          onDismiss={onDismissQuestStatus}
        />
      )}

      {lootWindow && (
        <MovableWindow id="hud.loot" as="section" className="loot-panel">
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
        </MovableWindow>
      )}

      {visibleFishingNftCatch && (
        <MovableWindow id="hud.fishing-nft-claim" as="section" className="loot-panel fishing-nft-claim-panel" disablePositionPersistence>
          <FishingNftClaimPanel
            catchSnapshot={visibleFishingNftCatch}
            player={localPlayer}
            onSubmitFishingNftClaimTx={onSubmitFishingNftClaimTx}
            onClose={() => requestCloseFishingNftClaim(visibleFishingNftCatch)}
          />
        </MovableWindow>
      )}

      {visibleFishingNftCapNotice && (
        <MovableWindow id="hud.fishing-nft-cap" as="section" className="loot-panel fishing-nft-cap-panel" disablePositionPersistence>
          <FishingNftCapPanel
            notice={visibleFishingNftCapNotice}
            now={now}
            onClose={() => dismissFishingNftCapNotice(characterWalletAddress, visibleFishingNftCapNotice, setHiddenFishingNftCapNoticeKey)}
          />
        </MovableWindow>
      )}

      {selectedTarget && selectedTargetUnit && (
        <TargetFrame
          kind={selectedTarget.kind}
          unit={selectedTargetUnit}
          now={now}
          renderProfile={renderProfile}
        />
      )}

      {cryptoStoreNpc && (
        <MovableWindow id="hud.crypto-store" as="section" className="floating-menu-overlay crypto-store-anchor" role="dialog" aria-label="crypto store">
          <CryptoStorePanel
            npc={cryptoStoreNpc}
            playerLevel={localPlayer?.level ?? 1}
            onClose={onCloseCryptoStore}
            onRegisterChainGear={onRegisterChainGear}
            onAnalyticsEvent={onCryptoStoreAnalytics}
          />
        </MovableWindow>
      )}

      {mintClubRedemptionNpc && (
        <MovableWindow id="hud.mint-club-redemption" as="section" className="floating-menu-overlay mint-club-redemption-anchor" role="dialog" aria-label="onchain goodies">
          <MintClubRedemptionPanel
            npc={mintClubRedemptionNpc}
            player={localPlayer}
            catches={mintClubRedeemableCatches}
            result={mintClubRedemptionResult}
            onSubmitMintClubRedemptionTx={onSubmitMintClubRedemptionTx}
            onClose={onCloseMintClubRedemption}
          />
        </MovableWindow>
      )}

      <MovableWindow id="hud.minimap" as="section" className="minimap-panel">
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
              aria-label={hub.name}
              data-map-annotation="hub"
              {...getMapAnnotationTooltipProps(getMapHubTooltip(hub))}
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
              aria-label={landmark.name}
              data-map-annotation="landmark"
              {...getMapAnnotationTooltipProps(getMapLandmarkTooltip(landmark))}
              style={getMinimapPointStyle(localPlayer, landmark.x, landmark.z)}
            />
          ))}
          <div className="minimap-ring" />
          <div className="minimap-vision-cone" />
          <CardinalCompass localPlayer={localPlayer} />
          {Array.from(players.entries()).map(([id, player]) => (
            <span
              key={id}
              ref={(element) => setHudElementRef(minimapPlayerRefs, id, element)}
              className={id === localSessionId ? "map-dot local" : "map-dot"}
              aria-label={id === localSessionId ? "you" : player.name}
              data-map-annotation="player"
              {...getMapAnnotationTooltipProps(getPlayerMapTooltip(player, id === localSessionId))}
              style={{
                ...getMinimapPointStyle(localPlayer, player.x, player.z),
                backgroundColor: id === localSessionId ? MFER_COLORS.local : colorFromSeed(player.avatarSeed),
              }}
            />
          ))}
          {visibleMapNpcs.map(({ npc, questMarker }) => {
            return (
              <span
                key={npc.id}
                ref={(element) => setHudElementRef(minimapNpcRefs, npc.id, element)}
                className={getNpcMapDotClassName(npc, questMarker)}
                aria-label={npc.name}
                data-map-annotation="npc"
                data-quest-marker={questMarker ?? undefined}
                {...getMapAnnotationTooltipProps(getNpcMapTooltip(npc, questMarker))}
                style={{
                  ...getMinimapPointStyle(localPlayer, npc.x, npc.z),
                }}
              />
            );
          })}
          {primaryActiveQuestTarget && (
            <QuestGuidanceMarker
              guidance={activeQuestGuidance}
              target={primaryActiveQuestTarget}
              point={getMinimapGuidancePoint(localPlayer, primaryActiveQuestTarget.x, primaryActiveQuestTarget.z)}
            />
          )}
        </div>
        <div className="online-row">
          <span>mfers: {playerCount}</span>
          <span>{clockLabel}</span>
        </div>
      </MovableWindow>

      {isMapOpen && (
        <section className="world-map-overlay" role="dialog" aria-label="World map">
          <MovableWindow id="hud.world-map" className="world-map-panel">
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
                  aria-label={hub.name}
                  data-map-annotation="hub"
                  {...getMapAnnotationTooltipProps(getMapHubTooltip(hub))}
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
                  aria-label={landmark.name}
                  data-map-annotation="landmark"
                  {...getMapAnnotationTooltipProps(getMapLandmarkTooltip(landmark))}
                  style={getWorldMapPointStyle(landmark.x, landmark.z)}
                >
                  <i />
                  <em>{landmark.label}</em>
                </span>
              ))}
              {visibleMapNpcs.map(({ npc, questMarker }) => {
                return (
                  <span
                    key={npc.id}
                    ref={(element) => setHudElementRef(worldMapNpcRefs, npc.id, element)}
                    className={getNpcMapDotClassName(npc, questMarker)}
                    aria-label={npc.name}
                    data-map-annotation="npc"
                    data-quest-marker={questMarker ?? undefined}
                    {...getMapAnnotationTooltipProps(getNpcMapTooltip(npc, questMarker))}
                    style={getWorldMapPointStyle(npc.x, npc.z)}
                  />
                );
              })}
              {localPlayer && (
                <span
                  ref={(element) => {
                    worldMapLocalRef.current = element;
                  }}
                  className="map-dot local directional"
                  aria-label="you"
                  data-map-annotation="player"
                  {...getMapAnnotationTooltipProps(getPlayerMapTooltip(localPlayer, true))}
                  style={getWorldMapLocalMarkerStyle(localPlayer)}
                />
              )}
              {activeQuestGuidance?.targets.slice(0, 8).map((target) => (
                <QuestGuidanceMarker
                  key={target.id}
                  guidance={activeQuestGuidance}
                  target={target}
                  point={getWorldMapGuidancePoint(target.x, target.z)}
                />
              ))}
            </div>
          </MovableWindow>
        </section>
      )}

      {isQuestLogOpen && (
        <MovableWindow id="hud.quest-log" as="section" className="floating-menu-overlay quest-log-anchor" role="dialog" aria-label="errand log">
          <div className="quest-log-panel">
            <div className="world-map-header">
              <div>
                <strong>errand log</strong>
                <span>{visibleQuestLog.length}/{questLog.length} errands</span>
              </div>
              <label className="quest-log-toggle">
                <input
                  type="checkbox"
                  checked={showCompletedQuests}
                  onChange={(event) => setShowCompletedQuests(event.target.checked)}
                />
                <span>handled</span>
              </label>
              <button type="button" title="Close errand log" aria-label="Close errand log" onClick={() => setIsQuestLogOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <div className="quest-log-list">
              {visibleQuestLog.length > 0 ? visibleQuestLog.map((quest) => (
                <div key={quest.id} className="quest-log-entry">
                  <Quest
                    quest={quest}
                    full
                    active={quest.id === activeQuestId}
                    onActivate={quest.status === "completed" ? undefined : setActiveQuestId}
                  />
                  {quest.status !== "completed" && (
                    <button
                      type="button"
                      className="quest-cancel-button"
                      title="Cancel errand"
                      aria-label={`Cancel ${QUESTS[quest.id].title}`}
                      onClick={() => onCancelQuest({ questId: quest.id })}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )) : (
                <p className="quest-empty">{completedQuestCount > 0 ? "handled errands hidden" : "no errands yet"}</p>
              )}
            </div>
          </div>
        </MovableWindow>
      )}

      {isCharacterOpen && (
        <MovableWindow id="hud.character" as="section" className="floating-menu-overlay character-anchor" role="dialog" aria-label="Character">
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

            {characterWalletAddress && (
              <div className="character-tabs" role="tablist" aria-label="Character views">
                <button
                  type="button"
                  className={effectiveCharacterPanelTab === "gear" ? "active" : ""}
                  role="tab"
                  aria-selected={effectiveCharacterPanelTab === "gear"}
                  onClick={() => setCharacterPanelTab("gear")}
                >
                  <UserRound size={15} />
                  mfer
                </button>
                <button
                  type="button"
                  className={effectiveCharacterPanelTab === "referrals" ? "active" : ""}
                  role="tab"
                  aria-selected={effectiveCharacterPanelTab === "referrals"}
                  onClick={openReferralsTab}
                >
                  <Gift size={15} />
                  referrals
                  {showReferralsBadge && <em className="tab-badge referral" aria-hidden="true">!</em>}
                </button>
              </div>
            )}

            {effectiveCharacterPanelTab === "referrals" ? (
              <ReferralPanel
                state={seasonReferralSummary}
                copyStatus={referralCopyStatus}
                removeResult={seasonReferralRemoveResult}
                onCopyInvite={copyReferralInviteUrl}
                onOpenInfo={() => setIsReferralInfoOpen(true)}
                onRemoveReferral={requestRemoveReferral}
              />
            ) : (
              <div className="character-layout">
                <section className="character-summary">
                  <div className="character-portrait" style={{ "--accent": accent } as CSSProperties}>
                    <MferPortrait traits={playerPortraitTraits} variant="full" title="your mfer portrait" />
                  </div>
                  <div className="character-stats">
                    {characterWalletAddress && (
                      <div className="character-stat character-wallet-stat" title={characterWalletAddress}>
                        <span>wallet</span>
                        <code>{formatShortAddress(characterWalletAddress)}</code>
                      </div>
                    )}
                    {showSeasonPoints && (
                      <>
                        <div className="character-stat">
                          <span>Season Points</span>
                          <strong>{localPlayer?.season0Points ?? 0}/{SEASON_0_TOTAL_POINT_CAP}</strong>
                        </div>
                        <div className="character-stat">
                          <span>Points Today</span>
                          <strong>{localPlayer?.season0DailyPoints ?? 0}/{SEASON_0_DAILY_POINT_CAP}</strong>
                        </div>
                      </>
                    )}
                    {characterWalletAddress && (
                      <div className="character-stat" title={seasonPassOwnership.error || undefined}>
                        <span>Season Pass</span>
                        <strong>{seasonPassOwnership.label}</strong>
                      </div>
                    )}
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
                    const slot = getEquippedSlot(localPlayer, slotId);
                    const itemId = slot?.itemId ?? "";
                    const item = itemId ? ITEMS[itemId] : null;
                    const chainLabel = slot ? formatChainGearLabel(slot) : "";
                    const title = itemId && item
                      ? `${EQUIPMENT_SLOTS[slotId]}\n${item.name}\n${item.description}\n${chainLabel}\n${formatItemStats(itemId, slot?.chainTier, localPlayer?.level)}\n${formatItemUtility(itemId)}\nClick to unequip`
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
                            {chainLabel ? <em>{chainLabel}</em> : null}
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
            )}
          </div>
        </MovableWindow>
      )}

      {isReferralInfoOpen && (
        <section className="hud-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Referral details">
          <MovableWindow id="hud.referral-info" className="hud-confirm-dialog referral-info-dialog">
            <div className="world-map-header">
              <div>
                <strong>referrals</strong>
                <span>how bonus points work</span>
              </div>
              <button type="button" title="Close referral details" aria-label="Close referral details" onClick={() => setIsReferralInfoOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <p>
              Share your invite link with human players. The link is tied to your wallet, and the referral is locked in when the new player creates their wallet character.
            </p>
            <ul>
              <li>Each wallet can have up to 10 referred players.</li>
              <li>Referred players start earning referral bonus immediately.</li>
              <li>When a referred human earns base Season Points from play, both wallets get an extra 20%.</li>
              <li>Referral bonus is capped at 500 Season Points for each side of each referral.</li>
              <li>Agent wallets do not create, count toward, or earn referral bonuses.</li>
            </ul>
            <p>
              Removing a referral frees the slot and removes referral bonus points from both wallets. Base Season Points earned by playing stay untouched.
            </p>
          </MovableWindow>
        </section>
      )}

      {pendingReferralRemoval && (
        <section className="hud-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Remove referral">
          <MovableWindow id="hud.referral-remove" className="hud-confirm-dialog referral-confirm-dialog">
            <div className="world-map-header">
              <div>
                <strong>remove referral</strong>
                <span>free this slot</span>
              </div>
              <button type="button" title="Keep referral" aria-label="Keep referral" onClick={cancelReferralRemoval}>
                <X size={22} />
              </button>
            </div>
            <p>
              Remove {pendingReferralRemoval.characterName || formatShortAddress(pendingReferralRemoval.refereeWalletAddress)} as a referral?
            </p>
            <p>
              This frees one referral slot. Any referral bonus Season Points earned from this link are removed from both wallets. The referred player keeps their base Season Points.
            </p>
            <div className="hud-confirm-actions">
              <button type="button" className="secondary-btn" onClick={cancelReferralRemoval}>
                keep referral
              </button>
              <button type="button" className="primary-btn danger" onClick={confirmReferralRemoval}>
                remove referral
              </button>
            </div>
          </MovableWindow>
        </section>
      )}

      {pendingFishingNftClose && (
        <section className="hud-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Close NFT claim">
          <MovableWindow id="hud.fishing-nft-close" className="hud-confirm-dialog fishing-nft-close-dialog" disablePositionPersistence>
            <div className="world-map-header">
              <div>
                <strong>close prize claim?</strong>
                <span>{getFishingNftDisplayName(pendingFishingNftClose)}</span>
              </div>
              <button type="button" title="Cancel" aria-label="Cancel close" onClick={() => setPendingFishingNftClose(null)}>
                <X size={18} />
              </button>
            </div>
            <p>This onchain goodie offer already used one of today's NFT catches. Forfeiting releases the pending claim, but it still counts for today's pond limit.</p>
            <div className="hud-confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setPendingFishingNftClose(null)}>
                keep open
              </button>
              <button type="button" className="primary-btn danger" onClick={() => forfeitFishingNftClaim(pendingFishingNftClose.catchId)}>
                forfeit
              </button>
            </div>
          </MovableWindow>
        </section>
      )}

      {isAbilitiesOpen && (
        <MovableWindow id="hud.abilities" as="section" className="floating-menu-overlay abilities-anchor" role="dialog" aria-label="moves">
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
        </MovableWindow>
      )}

      {isInventoryOpen && (
        <MovableWindow id="hud.inventory" as="section" className="floating-menu-overlay inventory-anchor" role="dialog" aria-label="stash">
          <div className="inventory-panel">
            <div className="world-map-header">
              <div>
                <strong>stash</strong>
                <span>
                  {effectiveInventoryPanelTab === "pond"
                    ? fishingNftStashCount === 1 ? "1 NFT item" : `${fishingNftStashCount} NFT items`
                    : inventoryItemCount === 1 ? "1 item" : `${inventoryItemCount} items`}
                </span>
              </div>
              <button type="button" title="Close stash" aria-label="Close stash" onClick={() => setIsInventoryOpen(false)}>
                <X size={22} />
              </button>
            </div>
            {showFishingNftHistory && (
              <div className="inventory-tabs" role="tablist" aria-label="Stash views">
                <button
                  type="button"
                  className={effectiveInventoryPanelTab === "items" ? "active" : ""}
                  role="tab"
                  aria-selected={effectiveInventoryPanelTab === "items"}
                  onClick={() => setInventoryPanelTab("items")}
                >
                  <Package size={15} />
                  items
                </button>
                <button
                  type="button"
                  className={effectiveInventoryPanelTab === "pond" ? "active" : ""}
                  role="tab"
                  aria-selected={effectiveInventoryPanelTab === "pond"}
                  onClick={() => setInventoryPanelTab("pond")}
                >
                  <Gift size={15} />
                  pond
                  {fishingNftStashCount > 0 && <em className="tab-badge pond" aria-hidden="true">{fishingNftStashCount}</em>}
                </button>
              </div>
            )}
            {effectiveInventoryPanelTab === "items" ? (
              <div className="inventory-grid">
                {inventoryItemCount > 0 ? (
                  <>
                    {fishingWalletNfts.map((walletNft) => {
                      const title = [
                        walletNft.label,
                        walletNft.description,
                        `Wallet NFT: ${shortAddress(walletNft.collection)}${walletNft.standard === "ERC1155" ? ` / token ${walletNft.tokenId}` : ""}`,
                      ].filter(Boolean).join("\n");
                      return (
                        <div
                          key={walletNft.id}
                          className="menu-tile inventory-slot wallet-nft"
                          data-tooltip={title}
                          aria-label={formatTooltipLabel(title)}
                        >
                          {walletNft.itemId ? (
                            <ItemIcon itemId={walletNft.itemId} />
                          ) : walletNft.image ? (
                            <span className="wallet-nft-thumb" aria-hidden="true"><img src={walletNft.image} alt="" loading="lazy" /></span>
                          ) : (
                            <Gift size={18} />
                          )}
                          <strong>{walletNft.label}</strong>
                          <em>wallet NFT</em>
                          <span className="tile-state">Hold</span>
                        </div>
                      );
                    })}
                    {visibleInventory.map((item) => {
                  const equipment = getItemEquipment(item.id);
                  const consumable = getItemConsumable(item.id);
                  const comparison = getItemComparison(item, localPlayer);
                  const isEquipped = isInventoryItemEquipped(localPlayer, item);
                  const title = getInventoryItemTitle(item, localPlayer, comparison);
                  const content = (
                    <>
                      <ItemIcon itemId={item.id} />
                      <strong>{ITEMS[item.id].name}</strong>
                      {formatChainGearLabel(item) ? <em>{formatChainGearLabel(item)}</em> : null}
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
                })}
                  </>
                ) : (
                  <p className="quest-empty">stash is empty</p>
                )}
              </div>
            ) : (
              <section className="pond-log-section tab-panel" aria-label="Fishing pond NFT log">
                <div className="pond-log-header">
                  <div>
                    <strong>pond log</strong>
                    <span>{fishingNftStashCount === 1 ? "1 NFT item" : `${fishingNftStashCount} NFT items`}</span>
                  </div>
                  {fishingNftHistoryResult && !fishingNftHistoryResult.ok && fishingNftHistoryResult.error ? (
                    <em>{fishingNftHistoryResult.error}</em>
                  ) : null}
                </div>
                <div className="pond-log-list">
                  {fishingNftStashCount > 0 ? (
                    <>
                      {fishingWalletNfts.map((walletNft) => (
                        <div key={walletNft.id} className="pond-log-row mapped wallet-nft">
                          <span className="pond-log-icon" aria-hidden="true">
                            {walletNft.itemId ? (
                              <ItemIcon itemId={walletNft.itemId} />
                            ) : walletNft.image ? (
                              <img src={walletNft.image} alt="" loading="lazy" />
                            ) : (
                              <Gift size={16} />
                            )}
                          </span>
                          <span className="pond-log-copy">
                            <b>{walletNft.label}</b>
                            <span>{shortAddress(walletNft.collection)} / {walletNft.standard === "ERC1155" ? `token ${walletNft.tokenId}` : "wallet owned"}</span>
                            {walletNft.description ? <span>{walletNft.description}</span> : null}
                            <em>{walletNft.action} item / in wallet</em>
                          </span>
                        </div>
                      ))}
                      {fishingNftHistory.map((catchSnapshot) => {
                    const mappedItem = getFishingNftGameItemMapping(catchSnapshot);
                    const displayName = getFishingNftDisplayName(catchSnapshot, mappedItem?.label);
                    const description = catchSnapshot.metadata?.description ?? "";
                    const expired = isFishingNftCatchExpiredForDisplay(catchSnapshot, now);
                    const status = formatFishingNftStatus(catchSnapshot, expired);
                    const txUrl = catchSnapshot.txHash ? getFishingPondClaimTxUrl(catchSnapshot.chainId, catchSnapshot.txHash) : "";
                    return (
                      <div key={catchSnapshot.catchId} className={mappedItem ? "pond-log-row mapped" : "pond-log-row"}>
                        <span className="pond-log-icon" aria-hidden="true">
                          {catchSnapshot.metadata?.image ? (
                            <img src={catchSnapshot.metadata.image} alt="" loading="lazy" />
                          ) : (
                            <Gift size={16} />
                          )}
                        </span>
                        <span className="pond-log-copy">
                          <b>{displayName}</b>
                          <span>{shortAddress(catchSnapshot.collection)} / entry {catchSnapshot.pondEntryId}</span>
                          {description ? <span>{description}</span> : null}
                          <em>{mappedItem ? `${mappedItem.action} item / ${status}` : status}</em>
                        </span>
                        {txUrl ? (
                          <a href={txUrl} target="_blank" rel="noreferrer" title="View claim transaction" aria-label="View claim transaction">
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                    </>
                  ) : (
                    <p className="quest-empty">no pond prizes yet</p>
                  )}
                </div>
              </section>
            )}
          </div>
        </MovableWindow>
      )}

      {isSettingsOpen && (
        <MovableWindow id="hud.settings" as="section" className="floating-menu-overlay settings-anchor" role="dialog" aria-label="Settings">
          <SettingsPanel
            settings={settings}
            debugToolsAvailable={debugToolsAvailable}
            onChange={onSettingsChange}
            onClose={() => setIsSettingsOpen(false)}
          />
        </MovableWindow>
      )}

      {!hideChatPanel && (
        <MovableWindow id="hud.chat" as="section" className="chat-panel" allowInteractiveDrag>
          <div className="chat-log" ref={chatLogRef} onScroll={handleChatLogScroll}>
            {chat.length === 0 ? (
              <p className="muted">gm mfers</p>
            ) : chat.map((message, index) => message.kind === "emote" ? (
              <p key={`${message.sentAt}-${index}`} className="chat-emote">
                <strong>{message.name} </strong>
                {message.text}
              </p>
            ) : (
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
        </MovableWindow>
      )}

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
            globalCooldownReadyAt={globalCooldownReadyAt}
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

      {isEmotesOpen && (
        <MovableWindow id="hud.emotes" as="section" className="emote-popout" role="menu" aria-label="emotes">
          {EMOTE_OPTIONS.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              title={EMOTES[id].label}
              aria-label={EMOTES[id].label}
              className="emote-popout-button"
              onClick={() => triggerEmote(id)}
            >
              <Icon size={19} />
              <span>{EMOTES[id].label}</span>
            </button>
          ))}
        </MovableWindow>
      )}

      <section className={isMobileMenuOpen ? "menu-dock open" : "menu-dock"} aria-label="game menu">
        <button
          type="button"
          className="menu-dock-toggle"
          title={isMobileMenuOpen ? "Close menu" : "Menu"}
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-controls="hud-menu-dock-actions"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          {isMobileMenuOpen ? <X size={25} /> : <Menu size={25} />}
          <span>Menu</span>
          {mobileMenuBadge && (
            <em className={`dock-badge${talentPointCount > 0 ? "" : " referral"}`} aria-hidden="true">
              {mobileMenuBadge}
            </em>
          )}
        </button>
        <div id="hud-menu-dock-actions" className="menu-dock-actions">
          <button
            type="button"
            title="Character (C)"
            onClick={() => {
              toggleCharacterPanel();
              closeMobileMenu();
            }}
          >
            <UserRound size={25} />
            <span>Character</span>
            {showReferralsBadge && <em className="dock-badge referral" aria-hidden="true">!</em>}
          </button>
          <button
            type="button"
            title="stash (B/I)"
            onClick={() => {
              setIsInventoryOpen((open) => !open);
              closeMobileMenu();
            }}
          >
            <Package size={25} />
            <span>stash</span>
          </button>
          <button
            type="button"
            title="moves (N)"
            onClick={() => {
              setIsAbilitiesOpen((open) => !open);
              closeMobileMenu();
            }}
          >
            <Sparkles size={25} />
            <span>moves</span>
            {talentPointCount > 0 && <em className="dock-badge">{talentPointCount}</em>}
          </button>
          <button
            type="button"
            title="Emotes"
            onClick={() => {
              setIsEmotesOpen((open) => !open);
              closeMobileMenu();
            }}
          >
            <PartyPopper size={25} />
            <span>emotes</span>
          </button>
          <button
            type="button"
            title="errand log (L)"
            onClick={() => {
              setIsQuestLogOpen((open) => !open);
              closeMobileMenu();
            }}
          >
            <BookOpen size={25} />
            <span>errands</span>
          </button>
          <button
            type="button"
            title="Settings"
            onClick={() => {
              setIsSettingsOpen((open) => !open);
              closeMobileMenu();
            }}
          >
            <Settings size={25} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            title="Leave"
            onClick={() => {
              closeMobileMenu();
              onExit();
            }}
          >
            <LogOut size={25} />
            <span>Leave</span>
          </button>
        </div>
      </section>

      <div className={`status-pill ${connectionStatus}`}>
        {connectionError || connectionStatus}
      </div>

      {localPlayer && localPlayer.health <= 0 && (
        <section className="death-panel">
          <strong>You died</strong>
          <em>fountain reset</em>
          <button type="button" onClick={onRespawn}>Respawn</button>
        </section>
      )}

      {actionError && <HudErrorText key={actionError.id} text={actionError.text} />}
      {moveUnlockNotice && <MoveUnlockToast key={moveUnlockNotice.id} notice={moveUnlockNotice} />}
      {tooltip && <HudTooltip tooltip={tooltip} />}
    </div>
  );
}

export function SettingsPanel({
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

  function updateGraphicsQuality(value: GraphicsQuality) {
    onChange({ ...settings, graphicsQuality: value });
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
        <strong>Graphics</strong>
        <SettingsSegmentedControl
          label="Quality"
          value={settings.graphicsQuality}
          options={GRAPHICS_QUALITY_OPTIONS.map((option) => ({
            value: option,
            label: option,
          }))}
          onChange={updateGraphicsQuality}
        />
      </section>

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

      <section className="settings-section">
        <strong>Interface</strong>
        <button type="button" className="settings-reset-ui-button" onClick={resetMovableWindows}>
          Reset UI
        </button>
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
        <SettingsToggle
          label="Health bars"
          checked={settings.nameplates.healthBars}
          onChange={(checked) => updateNameplateSetting("healthBars", checked)}
        />
      </section>
    </div>
  );
}

type CardinalDirection = "north" | "east" | "south" | "west";

function CardinalCompass({ localPlayer }: { localPlayer: PlayerSnapshot | null }) {
  return (
    <div className="minimap-cardinals" aria-hidden="true">
      <span className="minimap-cardinal" style={getMinimapCardinalStyle(localPlayer, "north")}>N</span>
      <span className="minimap-cardinal" style={getMinimapCardinalStyle(localPlayer, "east")}>E</span>
      <span className="minimap-cardinal" style={getMinimapCardinalStyle(localPlayer, "south")}>S</span>
      <span className="minimap-cardinal" style={getMinimapCardinalStyle(localPlayer, "west")}>W</span>
    </div>
  );
}

function QuestGuidanceMarker({
  guidance,
  target,
  point,
}: {
  guidance: ActiveQuestGuidance | null;
  target: QuestGuidanceTarget;
  point: MapGuidancePoint;
}) {
  const tooltip = getQuestGuidanceTooltip(guidance, target);
  return (
    <span
      className={getQuestGuidanceMarkerClassName(target, point.atEdge)}
      data-map-annotation="active-quest"
      data-tooltip={tooltip}
      title={tooltip}
      aria-label={formatTooltipLabel(tooltip)}
      style={point.style}
    >
      <em>{target.label}</em>
    </span>
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

function SettingsSegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: Array<{ value: TValue; label: string }>;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="settings-segmented-row">
      <span>{label}</span>
      <div className="settings-segmented-control" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={option.value === value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
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

function ActiveBuffStrip({ buffs, now }: { buffs: ActiveBuffSnapshot[]; now: number }) {
  if (buffs.length === 0) return null;

  return (
    <div className="active-buff-strip" aria-label="active buffs">
      {buffs.map((buff) => {
        const title = `${buff.name}\n${buff.description}\n${buff.effectLabel}\n${formatBuffRemaining(buff, now)} left`;
        return (
          <span
            key={buff.id}
            className="active-buff"
            data-tooltip={title}
            aria-label={formatTooltipLabel(title)}
            tabIndex={0}
          >
            <ItemIcon itemId={buff.itemId} />
            <em>{formatBuffRemaining(buff, now)}</em>
          </span>
        );
      })}
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
  let isComparisonSection = false;
  const tooltipLines = lines.map((line, index) => {
    const startsComparisonSection = line.toLowerCase().startsWith("compared to ");
    const isComparisonLine = isComparisonSection && !startsComparisonSection;
    if (startsComparisonSection) isComparisonSection = true;
    return {
      className: getTooltipLineClass(line, { isComparisonLine, startsComparisonSection }),
      key: `${line}-${index}`,
      line,
    };
  });

  return (
    <div className="hud-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <strong>{title}</strong>
      {tooltipLines.map(({ className, key, line }) => (
        <span key={key} className={className}>{line}</span>
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
        <em>{notice.sourceLabel} / {location}</em>
      </span>
    </section>
  );
}

function getTooltipLineClass(line: string, options: { isComparisonLine?: boolean; startsComparisonSection?: boolean } = {}) {
  const normalized = line.toLowerCase();
  if (options.startsComparisonSection) return "tooltip-line comparison-heading";
  if (options.isComparisonLine) {
    const comparisonClass = getTooltipComparisonClass(normalized);
    if (comparisonClass) return `tooltip-line stat comparison ${comparisonClass}`;
  }
  const statClass = getTooltipStatClass(normalized);
  if (statClass) return `tooltip-line stat ${statClass}`;
  if (normalized.includes("status:") || normalized.includes("locked") || normalized.includes("unlock") || normalized.includes("out of range") || normalized.includes("requires")) return "tooltip-line status";
  if (normalized.includes("cooldown") || normalized.includes("ready in") || normalized.includes("stand still") || normalized.includes("casting")) return "tooltip-line timing";
  if (normalized.includes("mp") || normalized.includes("mana")) return "tooltip-line resource";
  if (normalized.includes("damage") || normalized.includes("healing") || normalized.includes("restores")) return "tooltip-line effect";
  if (normalized.includes("threat") || normalized.includes("forces") || normalized.includes("freezes") || normalized.includes("slows")) return "tooltip-line control";
  if (normalized.includes("range") || /\d+(\.\d+)?-\d+(\.\d+)?m/.test(normalized) || /\d+(\.\d+)?m/.test(normalized)) return "tooltip-line range";
  return "tooltip-line";
}

function getTooltipStatClass(normalizedLine: string) {
  if (!/^[+-]\d/.test(normalizedLine)) return "";
  if (/\bhp\b/.test(normalizedLine)) return "health";
  if (/\bmp\b|\bmana\b/.test(normalizedLine)) return "mana";
  if (/\bstr\b|\bstrength\b/.test(normalizedLine)) return "strength";
  if (/\bdex\b|\bdexterity\b/.test(normalizedLine)) return "dexterity";
  if (/\bmag\b|\bmagic\b/.test(normalizedLine)) return "magic";
  return "";
}

function getTooltipComparisonClass(normalizedLine: string) {
  if (/^\+\d/.test(normalizedLine)) return "positive";
  if (/^-\d/.test(normalizedLine)) return "negative";
  if (/^=/.test(normalizedLine)) return "neutral";
  return "";
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

function getWorldMapLocalMarkerStyle(player: PlayerSnapshot): CSSProperties {
  return {
    ...getWorldMapPointStyle(player.x, player.z),
    transform: `translate(-50%, -50%) rotate(${player.yaw}rad)`,
  };
}

function getMinimapCardinalStyle(localPlayer: PlayerSnapshot | null, direction: CardinalDirection): CSSProperties {
  if (!localPlayer) {
    const fallback: Record<CardinalDirection, CSSProperties> = {
      north: { left: "50%", top: "8%" },
      east: { left: "92%", top: "50%" },
      south: { left: "50%", top: "92%" },
      west: { left: "8%", top: "50%" },
    };
    return { ...fallback[direction], transform: "translate(-50%, -50%)" };
  }

  const offset = MINIMAP_NPC_REVEAL_RANGE;
  const [dx, dz] = {
    north: [0, -offset],
    east: [offset, 0],
    south: [0, offset],
    west: [-offset, 0],
  }[direction];

  return {
    ...getMinimapPointStyle(localPlayer, localPlayer.x + dx, localPlayer.z + dz),
    transform: "translate(-50%, -50%)",
  };
}

function shouldShowNpcOnMaps({
  localPlayer,
  npc,
  questMarker,
  revealAllNpcsOnMinimap,
}: {
  localPlayer: PlayerSnapshot | null;
  npc: NpcSnapshot;
  questMarker: QuestMarkerType | null;
  revealAllNpcsOnMinimap: boolean;
}) {
  if (!isNpcAliveForMap(npc)) return false;
  if (revealAllNpcsOnMinimap) return true;
  if (!localPlayer) return false;

  const distance = Math.hypot(npc.x - localPlayer.x, npc.z - localPlayer.z);
  if (distance > MINIMAP_NPC_REVEAL_RANGE) return false;

  if (questMarker) return true;

  const disposition = getNpcDisposition(npc);
  if (disposition === "hostile") return true;
  if (isMerchantNpcId(npc.id)) return true;
  return false;
}

function isNpcAliveForMap(npc: NpcSnapshot) {
  return npc.isImmortal || npc.health > 0;
}

function playerRevealsAllNpcsOnMinimap(player: PlayerSnapshot | null) {
  return player?.equipment.some((slot) => (
    Boolean(slot.itemId) && doesItemRevealAllNpcsOnMinimap(slot.itemId as ItemId)
  )) ?? false;
}

function getNpcMapDotClassName(npc: NpcSnapshot, questMarker: QuestMarkerType | null) {
  const markerClass = questMarker === "turnIn"
    ? " quest-turn-in"
    : questMarker === "dailyTurnIn"
      ? " quest-daily-turn-in"
    : questMarker === "dailyAvailable"
      ? " quest-daily-available"
    : questMarker === "available"
      ? " quest-available"
      : "";
  return `map-dot npc ${getNpcDisposition(npc)}${markerClass}`;
}

function getQuestGuidanceMarkerClassName(target: QuestGuidanceTarget, atEdge: boolean) {
  const kindClass = target.kind === "turnIn" ? "turn-in" : target.kind;
  return ["active-quest-marker", kindClass, atEdge ? "edge" : ""].filter(Boolean).join(" ");
}

function getMapHubTooltip(hub: (typeof MINIMAP_HUBS)[number]) {
  return `${hub.name}\nMap: area\nLocation: ${formatMapCoordinates(hub.x, hub.z)}`;
}

function getMapLandmarkTooltip(landmark: (typeof MINIMAP_LANDMARKS)[number]) {
  const kind = landmark.kind === "relay" ? "relay marker" : "route marker";
  return `${landmark.name}\nMap: ${kind}\nLocation: ${formatMapCoordinates(landmark.x, landmark.z)}`;
}

function getQuestGuidanceTooltip(guidance: ActiveQuestGuidance | null, target: QuestGuidanceTarget) {
  return [
    guidance ? `Active: ${QUESTS[guidance.quest.id].title}` : "Active errand",
    guidance?.summary,
    target.label,
    `Location: ${formatMapCoordinates(target.x, target.z)}`,
  ].filter(Boolean).join("\n");
}

function getPlayerMapTooltip(player: PlayerSnapshot, isLocal: boolean) {
  const title = isLocal ? "You" : player.name;
  const identity = player.isAgent ? "agent wallet" : player.identityType;
  return `${title}\nLevel ${player.level} ${identity} mfer\nLocation: ${formatMapCoordinates(player.x, player.z)}`;
}

function getNpcMapTooltip(npc: NpcSnapshot, questMarker: QuestMarkerType | null) {
  const questLine = questMarker === "turnIn"
    ? "Quest: ready to turn in (?)"
    : questMarker === "dailyTurnIn"
      ? "Daily quest: ready to turn in (?)"
    : questMarker === "dailyAvailable"
      ? "Daily quest: available (!)"
    : questMarker === "available"
      ? "Quest: available (!)"
      : "";
  return [
    npc.name,
    `Status: ${getNpcDisposition(npc)} ${npc.model}`,
    questLine,
    `Location: ${formatMapCoordinates(npc.x, npc.z)}`,
  ].filter(Boolean).join("\n");
}

function formatMapCoordinates(x: number, z: number) {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

function getTweetIntentUrl() {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", SOCIAL.tweetText);
  url.searchParams.set("url", SOCIAL.mferlandUrl);
  return url.toString();
}

function setCssProperty(element: HTMLElement, property: string, value: CSSProperties[keyof CSSProperties]) {
  if (value === undefined || value === null) return;
  const next = String(value);
  if (element.style.getPropertyValue(property) !== next) {
    element.style.setProperty(property, next);
  }
}

function getHudTickDelay(player: PlayerSnapshot | null, actionSlots: ActionSlot[], now: number, globalCooldownReadyAt = 0) {
  if (globalCooldownReadyAt > now) return HUD_TICK_MS;
  if (player && actionSlots.some((actionId) => isCoolingDown(player, actionId, now, globalCooldownReadyAt))) return HUD_TICK_MS;

  const msToNextMinute = 60000 - (now % 60000);
  return Math.max(IDLE_HUD_TICK_MIN_MS, msToNextMinute + 50);
}

function isCoolingDown(player: PlayerSnapshot, actionId: ActionSlot, now: number, globalCooldownReadyAt = 0) {
  if (!actionId || actionId === "interact" || isItemActionSlot(actionId)) return false;
  return Math.max(getActionReadyAt(player, actionId as CombatActionId), globalCooldownReadyAt) > now;
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
    <MovableWindow id="hud.quest-offer" as="section" className="quest-dialogue-panel offer" role="dialog" aria-label={`Quest offer: ${offer.title}`} data-testid="quest-offer-panel">
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
    </MovableWindow>
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
    <MovableWindow id="hud.quest-turn-in" as="section" className="quest-dialogue-panel turn-in" role="dialog" aria-label={`Quest turn-in: ${turnIn.title}`} data-testid="quest-turn-in-panel">
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
    </MovableWindow>
  );
}

function QuestStatusPanel({
  notice,
  onShareQuestLink,
  onDismiss,
}: {
  notice: QuestStatusNotice;
  onShareQuestLink: (message: ClientShareQuestLink) => void;
  onDismiss: () => void;
}) {
  const isTweetQuest = notice.questId === "tweet-town-link";

  function openTweetQuest() {
    const url = getTweetIntentUrl();
    window.open(url, "_blank", "noopener,noreferrer");
    onShareQuestLink({ questId: notice.questId, url: SOCIAL.mferlandUrl });
  }

  return (
    <MovableWindow id="hud.quest-status" as="section" className="quest-dialogue-panel status" role="dialog" aria-label={`Quest status: ${notice.title}`} data-testid="quest-status-panel">
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
        {isTweetQuest && (
          <button className="quest-accept-btn" type="button" onClick={openTweetQuest} data-testid="quest-share-link-button">
            <ExternalLink size={17} />
            open tweet
          </button>
        )}
        <button className="quest-secondary-btn" type="button" onClick={onDismiss} data-testid="quest-status-close-button">
          Close
        </button>
      </div>
    </MovableWindow>
  );
}

function ReferralPanel({
  state,
  copyStatus,
  removeResult,
  onCopyInvite,
  onOpenInfo,
  onRemoveReferral,
}: {
  state: SeasonReferralSummaryState;
  copyStatus: string;
  removeResult: SeasonReferralRemoveResult | null;
  onCopyInvite: (url: string) => void;
  onOpenInfo: () => void;
  onRemoveReferral: (refereeWalletAddress: string, characterName: string) => void;
}) {
  const summary = state.summary;
  if (state.state === "loading" && !summary) {
    return <div className="referrals-panel state">loading referrals</div>;
  }
  if (state.state === "error" && !summary) {
    return <div className="referrals-panel state">{state.error || "referrals unavailable"}</div>;
  }
  if (!summary) {
    return <div className="referrals-panel state">no referral data</div>;
  }

  const slotLabel = `${summary.referralCount}/${summary.limits.maxReferees}`;
  return (
    <section className="referrals-panel" aria-label="Referrals">
      <div className="referrals-panel-header">
        <div>
          <strong>referrals</strong>
          <span>human wallet invites</span>
        </div>
        <button type="button" className="referral-info-btn" onClick={onOpenInfo} title="Referral details" aria-label="Referral details">
          <Info size={15} />
        </button>
      </div>

      <div className="referral-invite-row">
        <div>
          <span>invite</span>
          <code>{summary.inviteUrl}</code>
        </div>
        <button type="button" onClick={() => onCopyInvite(summary.inviteUrl)} title="Copy referral link" aria-label="Copy referral link">
          <Copy size={16} />
          <span>{copyStatus || "copy"}</span>
        </button>
      </div>

      <div className="referral-stat-grid">
        <div className="character-stat">
          <span>slots</span>
          <strong>{slotLabel}</strong>
        </div>
        <div className="character-stat">
          <span>active</span>
          <strong>{summary.activatedReferralCount}</strong>
        </div>
        <div className="character-stat">
          <span>bonus</span>
          <strong>{summary.referrerBonusPoints}/{summary.limits.maxBonusPoints * Math.max(summary.referralCount, 1)}</strong>
        </div>
      </div>

      {summary.referredBy && (
        <div className="referral-linked">
          <span>referred by</span>
          <strong>{summary.referredBy.characterName}</strong>
          <code>{formatShortAddress(summary.referredBy.walletAddress)}</code>
          <em>
            {summary.referredBy.status === "active"
              ? `${summary.referredBy.refereeBonusPoints}/${summary.limits.maxBonusPoints} bonus`
              : `${summary.referredBy.activationProgressPoints}/${summary.limits.activationPoints} active`}
          </em>
        </div>
      )}

      <div className="referral-list">
        {summary.referrals.length > 0 ? summary.referrals.map((referral) => (
          <div key={referral.refereeWalletAddress} className="referral-row">
            <div>
              <strong>{referral.characterName}</strong>
              <code>{formatShortAddress(referral.refereeWalletAddress)}</code>
            </div>
            <span>{referral.status}</span>
            <em>
              {referral.status === "active"
                ? `${referral.referrerBonusPoints}/${summary.limits.maxBonusPoints} bonus`
                : `${referral.activationProgressPoints}/${summary.limits.activationPoints} active`}
            </em>
            <button
              type="button"
              className="referral-remove-btn"
              onClick={() => onRemoveReferral(referral.refereeWalletAddress, referral.characterName)}
              title="Remove referral"
              aria-label={`Remove ${referral.characterName} referral`}
            >
              <X size={14} />
            </button>
          </div>
        )) : (
          <p>no referrals yet</p>
        )}
      </div>

      {removeResult && (
        <p className={removeResult.ok ? "referral-remove-status ok" : "referral-remove-status error"}>
          {removeResult.ok
            ? `removed referral, freed 1 slot${removeResult.removedReferrerBonusPoints > 0 ? `, -${removeResult.removedReferrerBonusPoints} bonus` : ""}`
            : removeResult.error || "referral removal failed"}
        </p>
      )}
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

function FishingNftCapPanel({
  notice,
  now,
  onClose,
}: {
  notice: FishingNftCapNotice;
  now: number;
  onClose: () => void;
}) {
  const isRodHitNotice = notice.kind === "rod_required_nft_hit";
  const isRodNotice = notice.kind === "rod_required" || isRodHitNotice;
  const resetLabel = formatFishingNftResetTime(notice.dailyResetAt, now);
  const walletCapUsed = typeof notice.perWalletDailyCap === "number" && typeof notice.walletDailyRemaining === "number"
    ? Math.max(0, notice.perWalletDailyCap - notice.walletDailyRemaining)
    : null;
  const globalCapUsed = typeof notice.globalDailyCap === "number" && typeof notice.globalDailyRemaining === "number"
    ? Math.max(0, notice.globalDailyCap - notice.globalDailyRemaining)
    : null;
  const capLabel = isRodHitNotice
    ? "Rod blocked NFT"
    : isRodNotice
    ? "Rod needed"
    : notice.kind === "global_daily_cap"
    ? "Pond restock"
    : "Daily NFT casts";
  const rodRequirement = notice.rodRequirement;
  const capDetail = isRodNotice
    ? rodRequirement
      ? `${rodRequirement.standard}${rodRequirement.standard === "ERC1155" && rodRequirement.tokenId ? ` #${rodRequirement.tokenId}` : ""}`
      : "onchain rod needed"
    : notice.kind === "global_daily_cap" && globalCapUsed !== null && notice.globalDailyCap
    ? `${globalCapUsed}/${notice.globalDailyCap} claimed today`
    : walletCapUsed !== null && notice.perWalletDailyCap
      ? `${walletCapUsed}/${notice.perWalletDailyCap} caught today`
      : "daily limit reached";
  const nextCastLabel = isRodNotice ? "after rod is in wallet" : resetLabel;
  const rodMintPriceLabel = rodRequirement?.mintPriceLabel || "25M $MFERGPT";
  const rodMintUrl = rodRequirement?.mintUrl || "";
  const rodNoticeTitle = isRodHitNotice ? "You almost hooked one" : "Onchain rod needed";
  const rodNoticeDetail = isRodHitNotice
    ? `That roll would have been an onchain goodie. Contract mint: ${rodMintPriceLabel}. Hold the rod in this wallet before the next lucky reel.`
    : `Contract mint: ${rodMintPriceLabel}. Hold the rod in this wallet before fishing for onchain goodies.`;

  return (
    <>
      <button className="quest-offer-close" type="button" title="Close notice" aria-label="Close NFT cast notice" onClick={onClose}>
        <X size={17} />
      </button>
      <strong>{isRodNotice ? rodNoticeTitle : "Onchain goodies tapped"}</strong>
      <div className="fishing-nft-cap-card">
        <div className="fishing-nft-cap-icon">
          <Gift size={22} />
        </div>
        <div>
          <b>{capLabel}</b>
          <span>{notice.text}</span>
          <em>{isRodNotice ? rodNoticeDetail : `NFT casts reset ${resetLabel}`}</em>
        </div>
      </div>
      <div className="fishing-nft-cap-details">
        <span>
          <b>{isRodNotice ? "Requirement" : "Today"}</b>
          <em>{capDetail}</em>
        </span>
        <span>
          <b>{isRodNotice ? "Collection" : "Next NFT cast"}</b>
          <em>{isRodNotice ? rodRequirement?.contractAddress ? shortAddress(rodRequirement.contractAddress) : "not configured" : nextCastLabel}</em>
        </span>
        {isRodNotice && (
          <span>
            <b>Mint</b>
            <em>{rodMintUrl ? "open mint page" : "talk to Motherfisher"}</em>
          </span>
        )}
        {isRodNotice && (
          <span>
            <b>Reminder reset</b>
            <em>{resetLabel}</em>
          </span>
        )}
      </div>
      <div className="fishing-nft-claim-actions">
        {isRodNotice && (rodMintUrl ? (
          <a className="quest-accept-btn fishing-nft-mint-btn" href={rodMintUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            mint rod ({rodMintPriceLabel})
          </a>
        ) : (
          <button className="quest-accept-btn fishing-nft-mint-btn" type="button" disabled title="Rod mint URL is not configured yet">
            <ExternalLink size={17} />
            mint rod ({rodMintPriceLabel})
          </button>
        ))}
        <button className="quest-accept-btn" type="button" onClick={onClose}>
          <Check size={17} />
          got it
        </button>
      </div>
    </>
  );
}

function FishingNftClaimPanel({
  catchSnapshot,
  player,
  onSubmitFishingNftClaimTx,
  onClose,
}: {
  catchSnapshot: NonNullable<PlayerSnapshot["fishingNftCatch"]>;
  player: PlayerSnapshot | null;
  onSubmitFishingNftClaimTx: (message: ClientSubmitFishingNftClaimTx) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const expiresInMs = catchSnapshot.expiresAt > 0 ? catchSnapshot.expiresAt * 1000 - Date.now() : 0;
  const expired = catchSnapshot.status === "expired" || (catchSnapshot.status === "voucher_issued" && expiresInMs <= 0);
  const claimable = catchSnapshot.status === "voucher_issued" && Boolean(catchSnapshot.voucher) && !expired;
  const txUrl = catchSnapshot.txHash ? getFishingPondClaimTxUrl(catchSnapshot.chainId, catchSnapshot.txHash) : "";
  const displayName = getFishingNftDisplayName(catchSnapshot);
  const description = catchSnapshot.metadata?.description ?? "";

  useEffect(() => {
    if (catchSnapshot.status === "confirmed") {
      setBusy(false);
      setStatus("claimed");
    } else if (catchSnapshot.status === "failed") {
      setBusy(false);
      setStatus(catchSnapshot.error ?? "claim failed");
    } else if (catchSnapshot.status === "tx_submitted") {
      setBusy(false);
      setStatus("confirming onchain");
    } else if (expired) {
      setBusy(false);
      setStatus("voucher expired");
    }
  }, [catchSnapshot.error, catchSnapshot.status, expired]);

  async function claim() {
    if (!player?.walletAddress || player.identityType !== "wallet") {
      setStatus("wallet character required");
      return;
    }
    if (!catchSnapshot.voucher) {
      setStatus("claim voucher missing");
      return;
    }
    const provider = getInjectedEthereumProvider() ?? getLocalFishingPondClaimProvider(player.walletAddress, catchSnapshot.chainId);
    if (!provider) {
      setStatus("wallet required");
      return;
    }

    setBusy(true);
    setStatus("confirm claim in wallet");
    try {
      const txHash = await executeFishingPondClaim(provider, player.walletAddress, catchSnapshot.voucher);
      setStatus("verifying claim");
      onSubmitFishingNftClaimTx({ catchId: catchSnapshot.catchId, txHash });
      window.setTimeout(() => setBusy((current) => current ? false : current), 90_000);
    } catch (error) {
      setBusy(false);
      setStatus(error instanceof Error ? error.message : "claim failed");
    }
  }

  return (
    <>
      <button className="quest-offer-close" type="button" title="Close claim" aria-label="Close NFT claim" onClick={onClose}>
        <X size={17} />
      </button>
      <strong>Onchain pond prize</strong>
      <div className="fishing-nft-claim-card">
        <div className="fishing-nft-prize-icon">
          {catchSnapshot.metadata?.image ? (
            <img src={catchSnapshot.metadata.image} alt="" />
          ) : (
            <Gift size={22} />
          )}
        </div>
        <div>
          <b>{displayName}</b>
          <span>{shortAddress(catchSnapshot.collection)} / entry {catchSnapshot.pondEntryId}</span>
          {description ? <span>{description}</span> : null}
          <em>{formatFishingNftStatus(catchSnapshot, expired)}</em>
        </div>
      </div>
      {status && <p className="fishing-nft-claim-status">{status}</p>}
      <div className="fishing-nft-claim-actions">
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noreferrer" className="quest-accept-btn">
            <ExternalLink size={17} />
            tx
          </a>
        )}
        <button className="quest-accept-btn" type="button" disabled={!claimable || busy} onClick={() => void claim()}>
          <Gift size={17} />
          {busy ? "claiming" : catchSnapshot.status === "confirmed" ? "claimed" : "claim"}
        </button>
      </div>
    </>
  );
}

function MintClubRedemptionPanel({
  npc,
  player,
  catches,
  result,
  onSubmitMintClubRedemptionTx,
  onClose,
}: {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  catches: FishingNftCatchSnapshot[];
  result: MintClubRedemptionResult | null;
  onSubmitMintClubRedemptionTx: (message: ClientSubmitMintClubRedemptionTx) => void;
  onClose: () => void;
}) {
  const [selectedCatchId, setSelectedCatchId] = useState(catches[0]?.catchId ?? "");
  const [walletState, setWalletState] = useState<MintClubRedemptionWalletState | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"" | "refresh" | "redeem">("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (selectedCatchId && catches.some((catchSnapshot) => catchSnapshot.catchId === selectedCatchId)) return;
    setSelectedCatchId(catches[0]?.catchId ?? "");
  }, [catches, selectedCatchId]);

  const selectedCatch = catches.find((catchSnapshot) => catchSnapshot.catchId === selectedCatchId) ?? catches[0] ?? null;
  const redemption = selectedCatch?.mintClubRedemption ?? null;
  const displayName = selectedCatch ? getFishingNftDisplayName(selectedCatch) : "onchain goodie";
  const txUrl = redemption?.txHash ? getMintClubRedemptionTxUrl(redemption.chainId, redemption.txHash) : "";
  const shortWallet = player?.walletAddress ? shortAddress(player.walletAddress) : "not connected";
  const selectedTokenLabel = selectedCatch ? `${shortAddress(selectedCatch.collection)} / token ${selectedCatch.tokenId}` : "--";
  const sellEstimateLabel = formatMintClubAmountLabel(walletState?.sellEstimateLabel);
  const minRefundLabel = formatMintClubAmountLabel(walletState?.minRefundLabel);
  const sellRoyaltyLabel = formatMintClubAmountLabel(walletState?.sellRoyaltyLabel);
  const ownedAmount = parseDisplayBigInt(walletState?.ownedAmount ?? "0");
  const canUseWallet = Boolean(player?.walletAddress && player.identityType === "wallet" && selectedCatch && redemption);
  const isSold = redemption?.status === "confirmed";
  const needsApproval = Boolean(walletState && !walletState.approvedForBond);
  const ownsSelectedGoodie = Boolean(walletState && ownedAmount > 0n);
  const canRedeem = Boolean(
    canUseWallet
    && walletState
    && ownedAmount > 0n
    && walletState.reserveTokenMatches
    && !isSold
    && !busy,
  );
  const canSell = Boolean(canRedeem && walletState?.approvedForBond);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      setWalletState(null);
      if (!player?.walletAddress || player.identityType !== "wallet" || !redemption) return;
      setBusy((current) => current || "refresh");
      setStatus("checking wallet");
      try {
        const nextState = await readMintClubRedemptionWalletState(player.walletAddress, redemption);
        if (cancelled) return;
        setWalletState(nextState);
        setStatus(getMintClubRedemptionWalletStatus(redemption.status, nextState));
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "wallet read failed");
      } finally {
        if (!cancelled) setBusy((current) => current === "refresh" ? "" : current);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [player?.identityType, player?.walletAddress, redemption, refreshNonce]);

  useEffect(() => {
    if (!result?.catch || result.catch.catchId !== selectedCatch?.catchId) return;
    if (result.ok) {
      setStatus(result.catch.mintClubRedemption?.status === "confirmed" ? "sold through Mint Club" : "redemption submitted");
      setRefreshNonce((nonce) => nonce + 1);
    } else {
      setStatus(result.error ?? "redemption failed");
    }
  }, [result, selectedCatch?.catchId]);

  async function refreshWallet() {
    setRefreshNonce((nonce) => nonce + 1);
  }

  async function redeem() {
    if (!player?.walletAddress || !redemption || !selectedCatch) return;
    const provider = getInjectedEthereumProvider() ?? getLocalDebugEthereumProvider(player.walletAddress, redemption.chainId);
    if (!provider) {
      setStatus("wallet required");
      return;
    }
    setBusy("redeem");
    let phase: "approval" | "sell" = needsApproval ? "approval" : "sell";
    try {
      if (needsApproval) {
        setStatus("confirm approval in wallet");
        await approveMintClubRedemption(provider, player.walletAddress, redemption);
        phase = "sell";
        setStatus("approval confirmed, confirm sell in wallet");
      } else {
        setStatus("confirm sell in wallet");
      }
      const txHash = await sellMintClubRedemption(provider, player.walletAddress, redemption);
      setStatus("verifying Mint Club burn");
      onSubmitMintClubRedemptionTx({ catchId: selectedCatch.catchId, txHash, status: "confirmed" });
      window.setTimeout(() => setBusy((current) => current === "redeem" ? "" : current), 90_000);
    } catch (error) {
      setBusy("");
      setStatus(error instanceof Error ? error.message : phase === "approval" ? "approval failed" : "sell failed");
    }
  }

  return (
    <div className="crypto-store-panel mint-club-redemption-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>{npc.name} buys redeemable pond catches</span>
        </div>
        <button type="button" title="Close onchain goodies" aria-label="Close onchain goodies" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview mint-club-overview">
        <div className="crypto-store-account mint-club-wallet-bar">
          <span>wallet</span>
          <code>{shortWallet}</code>
          <strong>{catches.length} goodie{catches.length === 1 ? "" : "s"}</strong>
        </div>
      </div>

      {catches.length > 0 ? (
        <div className="mint-club-redemption-layout">
          <div className="crypto-store-collection mint-club-redemption-list" role="listbox" aria-label="Mint Club goodies">
            <div className="mint-club-list-head">
              <strong>Pond catches</strong>
              <span>{catches.length} eligible</span>
            </div>
            {catches.map((catchSnapshot) => {
              const catchRedemption = catchSnapshot.mintClubRedemption;
              const catchName = getFishingNftDisplayName(catchSnapshot);
              const active = catchSnapshot.catchId === selectedCatch?.catchId;
              return (
                <button
                  key={catchSnapshot.catchId}
                  type="button"
                  className={active ? "mint-club-goodie-row active" : "mint-club-goodie-row"}
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedCatchId(catchSnapshot.catchId)}
                >
                  <span className="item-icon rare mint-club-goodie-icon" aria-hidden="true">
                    {catchSnapshot.metadata?.image ? (
                      <img src={catchSnapshot.metadata.image} alt="" loading="lazy" />
                    ) : (
                      <Gift size={16} />
                    )}
                  </span>
                  <span className="mint-club-goodie-copy">
                    <b>{catchName}</b>
                    <span>token {catchSnapshot.tokenId} / x{catchSnapshot.amount} caught</span>
                    <em>{catchRedemption ? formatMintClubRedemptionStatus(catchRedemption.status) : "not supported"}</em>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="crypto-store-flow mint-club-redemption-detail" aria-label="selected onchain goodie">
            <div className="mint-club-selected-goodie">
              <div className="mint-club-selected-icon">
                {selectedCatch?.metadata?.image ? (
                  <img src={selectedCatch.metadata.image} alt="" />
                ) : (
                  <Package size={26} />
                )}
              </div>
              <div>
                <b>{displayName}</b>
                <span>{selectedTokenLabel}</span>
                {selectedCatch?.metadata?.description ? <p>{selectedCatch.metadata.description}</p> : null}
                <em>{redemption ? formatMintClubRedemptionStatus(redemption.status) : "not supported"}</em>
              </div>
            </div>

            <div className="mint-club-sell-card">
              <div className="mint-club-payout-main">
                <span>quoted reward</span>
                <strong>{sellEstimateLabel}</strong>
              </div>
              <div className="mint-club-receipt-lines">
                <span>
                  <b>Min reward</b>
                  <em>{minRefundLabel}</em>
                </span>
                <span>
                  <b>Royalty</b>
                  <em>{walletState ? `${formatBps(walletState.sellRoyaltyBps)} / ${sellRoyaltyLabel}` : redemption ? formatBps(redemption.sellRoyaltyBps) : "--"}</em>
                </span>
                <span>
                  <b>Reserve</b>
                  <em>{redemption?.reserveTokenSymbol ?? "WETH"}</em>
                </span>
              </div>
            </div>

            <div className="mint-club-step-rail" aria-label="Mint Club redemption steps">
              <span className={getMintClubStepClass(walletState ? ownsSelectedGoodie : null)}>
                <Check size={13} />
                <b>Own</b>
                <em>{walletState ? ownsSelectedGoodie ? `${walletState.ownedAmount} in wallet` : "not found" : "checking"}</em>
              </span>
              <span className={getMintClubStepClass(walletState ? walletState.approvedForBond : null, needsApproval)}>
                <Check size={13} />
                <b>Approve</b>
                <em>{walletState ? walletState.approvedForBond ? "ready" : "needed once" : "checking"}</em>
              </span>
              <span className={getMintClubStepClass(isSold || canSell, canSell)}>
                <Gift size={13} />
                <b>Sell</b>
                <em>{isSold ? "complete" : canSell ? "ready" : "locked"}</em>
              </span>
            </div>

            {status && <p className="fishing-nft-claim-status">{status}</p>}
            <div className="mint-club-redemption-actions">
              {txUrl && (
                <a href={txUrl} target="_blank" rel="noreferrer" className="quest-accept-btn">
                  <ExternalLink size={17} />
                  view tx
                </a>
              )}
              <button className="quest-accept-btn secondary" type="button" disabled={Boolean(busy)} onClick={() => void refreshWallet()}>
                <RefreshCw size={17} />
                refresh
              </button>
              <button className="quest-accept-btn" type="button" disabled={!canRedeem} onClick={() => void redeem()}>
                <Gift size={17} />
                {busy === "redeem" ? "working" : isSold ? "sold" : needsApproval ? "approve + sell" : "sell 1"}
              </button>
            </div>

          </section>
        </div>
      ) : (
        <div className="mint-club-empty-state">
          <Gift size={24} />
          <strong>no onchain goodies ready</strong>
          <span>Claim a redeemable pond catch first, then bring it back here.</span>
        </div>
      )}
    </div>
  );
}

function getFishingNftDisplayName(catchSnapshot: FishingNftCatchSnapshot, fallback?: string) {
  const name = catchSnapshot.metadata?.name?.trim();
  return name || fallback || `${catchSnapshot.standard} #${catchSnapshot.tokenId}`;
}

function shouldConfirmFishingNftClaimClose(catchSnapshot: NonNullable<PlayerSnapshot["fishingNftCatch"]>) {
  return catchSnapshot.status === "voucher_issued" || catchSnapshot.status === "pending";
}

function isFishingNftCatchExpiredForDisplay(catchSnapshot: FishingNftCatchSnapshot, now: number) {
  return catchSnapshot.status === "expired" || (catchSnapshot.status === "voucher_issued" && catchSnapshot.expiresAt > 0 && catchSnapshot.expiresAt * 1000 <= now);
}

function formatFishingNftStatus(catchSnapshot: FishingNftCatchSnapshot, expired: boolean) {
  if (expired) return "expired";
  if (catchSnapshot.status === "voucher_issued") return "wallet claim required";
  if (catchSnapshot.status === "tx_submitted") return "transaction submitted";
  if (catchSnapshot.status === "confirmed") return "claimed";
  if (catchSnapshot.status === "abandoned") return "forfeited";
  if (catchSnapshot.status === "failed") return catchSnapshot.error || "failed";
  return catchSnapshot.status;
}

function formatMintClubRedemptionStatus(status: NonNullable<FishingNftCatchSnapshot["mintClubRedemption"]>["status"]) {
  if (status === "claim_required") return "claim first";
  if (status === "eligible") return "ready to sell";
  if (status === "tx_submitted") return "sell submitted";
  if (status === "confirmed") return "sold";
  if (status === "failed") return "sell failed";
  return status;
}

function getMintClubRedemptionWalletStatus(
  redemptionStatus: NonNullable<FishingNftCatchSnapshot["mintClubRedemption"]>["status"],
  walletState: MintClubRedemptionWalletState,
) {
  if (redemptionStatus === "confirmed") return "sold through Mint Club";
  if (!walletState.reserveTokenMatches) return "reserve token mismatch";
  if (parseDisplayBigInt(walletState.ownedAmount) <= 0n) return "not in connected wallet";
  if (!walletState.approvedForBond) return "approval needed";
  return "ready to sell / burn";
}

function getMintClubStepClass(done: boolean | null, active = false) {
  return [
    "mint-club-step",
    done === null ? "pending" : done ? "done" : "blocked",
    active ? "active" : "",
  ].filter(Boolean).join(" ");
}

function formatMintClubAmountLabel(label?: string) {
  const trimmed = label?.trim();
  if (!trimmed) return "--";
  const match = /^(-?\d+)(?:\.(\d+))?\s+(.+)$/.exec(trimmed);
  if (!match) return trimmed;
  const [, integerPart, decimalPart = "", symbol] = match;
  if (!decimalPart) return `${integerPart} ${symbol}`;
  const trimmedDecimals = decimalPart.replace(/0+$/, "");
  if (!trimmedDecimals) return `${integerPart} ${symbol}`;
  const firstSignificantIndex = trimmedDecimals.search(/[1-9]/);
  if (firstSignificantIndex < 0) return `${integerPart} ${symbol}`;
  const maxDecimalPlaces = integerPart === "0"
    ? Math.min(trimmedDecimals.length, firstSignificantIndex + 4)
    : Math.min(trimmedDecimals.length, 4);
  return `${integerPart}.${trimmedDecimals.slice(0, maxDecimalPlaces)} ${symbol}`;
}

function parseDisplayBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function formatBps(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function getFishingNftCapNoticeKey(notice: FishingNftCapNotice | null) {
  return notice ? `${notice.kind}:${notice.sentAt}:${notice.dailyResetAt}` : "";
}

const FISHING_ROD_NOTICE_SEEN_STORAGE_PREFIX = "mferland:fishingRodNoticeSeen:v1";

function dismissFishingNftCapNotice(
  walletAddress: string,
  notice: FishingNftCapNotice | null,
  setHiddenNoticeKey: (key: string) => void,
) {
  setHiddenNoticeKey(getFishingNftCapNoticeKey(notice));
  rememberFishingRodNoticeSeen(walletAddress, notice);
}

function hasSeenFishingRodNotice(walletAddress: string, notice: FishingNftCapNotice | null) {
  const storageKey = getFishingRodNoticeStorageKey(walletAddress, notice);
  if (!storageKey || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function rememberFishingRodNoticeSeen(walletAddress: string, notice: FishingNftCapNotice | null) {
  const storageKey = getFishingRodNoticeStorageKey(walletAddress, notice);
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Dismissal persistence is best-effort only.
  }
}

function getFishingRodNoticeStorageKey(walletAddress: string, notice: FishingNftCapNotice | null) {
  if (notice?.kind !== "rod_required") return "";
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet || !Number.isFinite(notice.dailyResetAt) || notice.dailyResetAt <= 0) return "";
  return `${FISHING_ROD_NOTICE_SEEN_STORAGE_PREFIX}:${wallet}:${Math.floor(notice.dailyResetAt)}`;
}

function formatFishingNftResetTime(dailyResetAt: number, now: number) {
  const resetMs = dailyResetAt * 1000;
  if (!Number.isFinite(resetMs) || resetMs <= 0) return "at the next daily reset";
  const time = new Date(resetMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${time} (${formatFishingNftResetRemaining(resetMs - now)})`;
}

function formatFishingNftResetRemaining(remainingMs: number) {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
  if (totalMinutes <= 0) return "now";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `in ${hours}h ${minutes}m`;
  if (hours > 0) return `in ${hours}h`;
  return `in ${minutes}m`;
}

function shortAddress(address: string) {
  return address && address.length >= 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address || "--";
}

function getInjectedEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return provider && typeof provider.request === "function" ? provider : null;
}

async function readSeasonPassBalance(walletAddress: string) {
  const { launchPassAddress, chainConfig } = await fetchHudCryptoConfig();
  if (!isAddress(launchPassAddress)) throw new Error("launch pass missing");
  const result = await requestHudJsonRpc(chainConfig.rpcUrl, "eth_call", [{
    to: launchPassAddress,
    data: `${BALANCE_OF_SELECTOR}${encodeAddressWord(walletAddress)}`,
  }, "latest"]);
  if (typeof result !== "string") throw new Error("season pass read failed");
  return BigInt(result);
}

async function fetchHudCryptoConfig() {
  const response = await fetch(`${getHudContractConfigUrl()}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("contract config missing");
  const document = await response.json() as HudCryptoContractsDocument;
  const launchPassAddress = typeof document.addresses?.launchPass === "string" ? document.addresses.launchPass : "";
  return {
    launchPassAddress,
    chainConfig: parseHudCryptoChainConfig(document),
  };
}

function getHudContractConfigUrl() {
  const configured = import.meta.env.VITE_CRYPTO_CONTRACTS_URL;
  if (typeof configured === "string" && configured.trim() && !(IS_PRODUCTION_BUILD && isLocalContractConfigUrl(configured))) {
    return configured.trim();
  }
  return import.meta.env.PROD ? PRODUCTION_CONTRACT_CONFIG_URL : LOCAL_CONTRACT_CONFIG_URL;
}

function parseHudCryptoChainConfig(document: HudCryptoContractsDocument): HudCryptoChainConfig {
  const chainId = Number.isInteger(document.chainId) && Number(document.chainId) > 0
    ? Number(document.chainId)
    : IS_PRODUCTION_BUILD ? BASE_CHAIN_ID : LOCAL_CHAIN_ID;
  return {
    chainId,
    rpcUrl: resolveHudCryptoRpcUrl(typeof document.rpcUrl === "string" ? document.rpcUrl.trim() : "", chainId),
  };
}

function resolveHudCryptoRpcUrl(configuredRpcUrl: string, chainId: number) {
  if (chainId === BASE_CHAIN_ID) return configuredRpcUrl || BASE_CHAIN_RPC_URL;
  if (chainId !== LOCAL_CHAIN_ID) return configuredRpcUrl;
  if (typeof window === "undefined") return configuredRpcUrl || LOCAL_CHAIN_RPC_URL;
  if (configuredRpcUrl && !isLoopbackRpcUrl(configuredRpcUrl)) return configuredRpcUrl;
  if (isLoopbackHost(window.location.hostname)) return configuredRpcUrl || LOCAL_CHAIN_RPC_URL;
  return `${window.location.origin}/crypto-rpc`;
}

function isLocalContractConfigUrl(value: string) {
  return value.trim().replace(/\?.*$/, "").endsWith(LOCAL_CONTRACT_CONFIG_URL);
}

function isLoopbackRpcUrl(value: string) {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function readReferralsBadgeSeen() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REFERRALS_BADGE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeReferralsBadgeSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFERRALS_BADGE_SEEN_KEY, "1");
  } catch {
    // Ignore blocked storage. The badge is cosmetic.
  }
}

function readQuestTrackerHidden() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(HUD_HIDDEN_WIDGETS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && (parsed as { questTracker?: unknown }).questTracker === true);
  } catch {
    return false;
  }
}

function writeQuestTrackerHidden(hidden: boolean) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(HUD_HIDDEN_WIDGETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === "object" ? { ...parsed, questTracker: hidden } : { questTracker: hidden };
    window.localStorage.setItem(HUD_HIDDEN_WIDGETS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // UI layout preferences are optional.
  }
}

function clearHiddenHudWidgets() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HUD_HIDDEN_WIDGETS_STORAGE_KEY);
  } catch {
    // UI layout preferences are optional.
  }
}

async function requestHudJsonRpc(rpcUrl: string, method: string, params: unknown[]) {
  if (!rpcUrl) throw new Error("contract RPC unavailable");
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
  return payload.result;
}

function encodeAddressWord(address: string) {
  if (!isAddress(address)) throw new Error("wallet missing");
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function formatShortAddress(address: string) {
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function formatSeasonPassBalance(balance: bigint) {
  if (balance <= 0n) return "none";
  return balance === 1n ? "owned" : `${balance.toString()} owned`;
}

function getHudCryptoErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "season pass unavailable";
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
      value: formatStatNumber(player?.strength ?? 0),
    },
    {
      label: "DEX",
      value: formatStatNumber(player?.dexterity ?? 0),
    },
    {
      label: "MAG",
      value: formatStatNumber(player?.magic ?? 0),
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
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function getEquippedSlot(player: PlayerSnapshot | null, slotId: EquipmentSlotId) {
  return player?.equipment.find((slot) => slot.slot === slotId) ?? null;
}

function isInventoryItemEquipped(player: PlayerSnapshot | null, item: InventoryItemSnapshot) {
  const equipment = getItemEquipment(item.id);
  if (!equipment) return false;

  const equipped = getEquippedSlot(player, equipment.slot);
  return equipped?.itemId === item.id && equipped.chainTokenId === item.chainTokenId;
}

function formatItemStats(itemId: ItemId, chainTier?: number, playerLevel?: number) {
  const level = normalizeItemLevel(playerLevel);
  const equipment = getItemEquipment(itemId, chainTier, level);
  if (!equipment) return "";

  const statKeys = Object.keys(equipment.stats) as Array<keyof typeof STAT_LABELS>;
  if (statKeys.length === 0) return "No bonuses";

  const statLines = statKeys
    .map((statKey) => {
      const value = equipment.stats[statKey] ?? 0;
      return formatStatLine(statKey, value);
    });
  const heirloomLine = formatHeirloomGrowthLine(itemId);
  return [
    heirloomLine ? `Level ${level} stats` : "",
    ...statLines,
    heirloomLine,
  ].filter(Boolean).join("\n");
}

function formatStatLine(statKey: keyof typeof STAT_LABELS, value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatStatNumber(value)} ${STAT_LABELS[statKey]}`;
}

function formatChainGearLabel(item: { chainTokenId?: string; chainTier?: number }) {
  if (!item.chainTokenId) return "";
  return `T${normalizeChainGearTier(item.chainTier)} #${item.chainTokenId}`;
}

function formatConsumableEffect(itemId: ItemId) {
  const consumable = getItemConsumable(itemId);
  if (!consumable) return "";
  if (consumable.buffId) return `1h ${ELIXIR_BUFFS[consumable.buffId].effectLabel}`;

  const effects = [
    consumable.health ? `+${consumable.health} HP` : "",
    consumable.mana ? `+${consumable.mana} MP` : "",
  ].filter(Boolean);
  return effects.join(", ");
}

function getVisibleActiveBuffs(buffs: ActiveBuffSnapshot[], now: number) {
  return buffs
    .filter((buff) => buff.expiresAt > now)
    .sort((left, right) => left.expiresAt - right.expiresAt || left.id.localeCompare(right.id));
}

function getAgentFocusedQuestId(player: PlayerSnapshot | null, questLog: PlayerSnapshot["quests"]): QuestId | null {
  if (!player?.isAgent || !player.agentStatusQuest) return null;
  const statusText = normalizeQuestFocusText(player.agentStatusQuest);
  if (!statusText) return null;

  return questLog.find((quest) => {
    if (quest.status === "completed") return false;
    const definition = QUESTS[quest.id];
    return [
      quest.id,
      definition.title,
      definition.objectiveLabel,
      definition.turnInLabel,
    ].some((value) => {
      const needle = normalizeQuestFocusText(value);
      return Boolean(needle && statusText.includes(needle));
    });
  })?.id ?? null;
}

function normalizeQuestFocusText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatBuffRemaining(buff: ActiveBuffSnapshot, now: number) {
  const remainingMs = Math.max(0, buff.expiresAt - now);
  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes >= 60) return "1h";
  return `${Math.max(1, totalMinutes)}m`;
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
    formatChainGearLabel(item),
    equipment ? `${equipment.build} / ${EQUIPMENT_SLOTS[equipment.slot]}` : "",
    equipment ? formatItemStats(item.id, item.chainTier, player?.level) : "",
    consumable ? formatConsumableEffect(item.id) : "",
    formatItemUtility(item.id),
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
    formatItemUtility(item.id),
    "Click to loot",
  ].filter(Boolean).join("\n");
}

function formatItemUtility(itemId: ItemId) {
  return doesItemRevealAllNpcsOnMinimap(itemId) ? "Minimap: reveals every NPC while equipped" : "";
}

function getItemComparison(item: InventoryItemSnapshot, player: PlayerSnapshot | null) {
  const playerLevel = player?.level ?? 1;
  const equipment = getItemEquipment(item.id, item.chainTier, playerLevel);
  if (!equipment) return null;

  const equipped = getEquippedSlot(player, equipment.slot);
  if (equipped?.itemId === item.id && equipped.chainTokenId === item.chainTokenId) {
    return { text: "Currently equipped", tone: "neutral" as const };
  }

  const equippedItem = equipped?.itemId ? ITEMS[equipped.itemId] : null;
  const equippedStats = equipped?.itemId ? getItemEquipment(equipped.itemId, equipped.chainTier, playerLevel)?.stats ?? {} : {};
  const statKeys = Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>;
  const deltas = statKeys
    .map((statKey) => ({
      statKey,
      delta: (equipment.stats[statKey] ?? 0) - (equippedStats[statKey] ?? 0),
    }))
    .filter(({ delta }) => delta !== 0);

  if (deltas.length === 0) {
    return {
      text: equippedItem ? `Compared to ${equippedItem.name}\n= No stat change` : "No stat bonuses",
      tone: "neutral" as const,
    };
  }

  const totalDelta = deltas.reduce((sum, itemDelta) => sum + itemDelta.delta, 0);
  const deltaLines = deltas.map(({ statKey, delta }) => formatStatLine(statKey, delta));
  const text = equippedItem
    ? [`Compared to ${equippedItem.name}`, ...deltaLines].join("\n")
    : deltaLines.join("\n");

  return {
    text,
    tone: totalDelta > 0 ? "positive" as const : totalDelta < 0 ? "negative" as const : "neutral" as const,
  };
}

function formatHeirloomGrowthLine(itemId: ItemId) {
  const growth = getItemHeirloomStatsPerLevel(itemId);
  const statKeys = Object.keys(growth) as Array<keyof typeof STAT_LABELS>;
  if (statKeys.length === 0) return "";

  const growthText = statKeys
    .map((statKey) => formatStatLine(statKey, growth[statKey] ?? 0))
    .join(", ");
  return `Heirloom: ${growthText} per level`;
}

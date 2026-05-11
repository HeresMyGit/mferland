import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorCode, Room, ServerError, type Client } from "colyseus";
import {
  CHAT,
  COMBAT,
  EMOTES,
  LOOT,
  MAX_PLAYERS,
  MFERGPT,
  PLAYER,
  PROGRESSION,
  QUESTS,
  ROOM_NAME,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_TOTAL_POINT_CAP,
  SERVER_TICK_RATE,
  TALENTS,
  TRAIT_CHANGE_PRICES_WEI,
  clamp,
  getNpcDisposition,
  getChainGearItemId,
  getInventoryItemKey,
  getQuestTurnInNpcId,
  hasExplicitMferAppearanceTraits,
  normalizeAvatarSeed,
  normalizeChainTokenId,
  normalizeChainGearTier,
  normalizeMferAppearanceTraits,
  normalizeWalletAddress,
  parseMferAppearanceTraitsJson,
  resolveWorldCollision,
  serializeMferAppearanceTraits,
  setWorldCollisionPlacementOverrides,
  stableHash,
  sanitizePlayerName,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientCombatAction,
  type ClientDebugRegisterChainGear,
  type ClientDebugUpdateChainGearTier,
  type ClientEmote,
  type ClientEquipItem,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type ClientRegisterChainGear,
  type ClientSelectTalent,
  type ClientShareQuestLink,
  type ClientUpdateTraits,
  type ClientUnequipItem,
  type ClientUseItem,
  type CombatActionId,
  type EmoteId,
  type ExperienceEvent,
  type IdentityType,
  type ItemId,
  type JoinOptions,
  type QuestId,
} from "@mferland/shared";
import { EquipmentSlotState, InventoryItemState, PlayerState, QuestState, TalentState, TownState, type NpcState } from "../state.js";
import type { TrackedInput } from "../types.js";
import { recordAnalyticsEvent, type AnalyticsProperties } from "../analytics.js";
import { verifyChainGearOwnership } from "../crypto/chainGear.js";
import {
  loadOrCreateWalletCharacter,
  awardSeason0QuestReward,
  saveCharacterProgress,
  PersistenceUnavailableError,
  type PersistableCharacterState,
  type PersistedCharacter,
} from "../persistence.js";
import {
  aggroNeutralNpcOnPlayerAttackStart,
  applyCombatDamage,
  applyPlayerUniversalCooldown,
  applyUnitHealing,
  clearPlayerCast,
  findCombatTarget,
  getActionReadyAt,
  getPlayerActionDamage,
  getPlayerHealingAmount,
  isNpcAlive,
  isPlayerStationary,
  normalizeCombatActionId,
  processPendingCombatImpacts,
  respawnPlayerAtFountain,
  setActionReadyAt,
  updatePlayerCast,
  updatePlayerRegen,
  type PendingCombatImpact,
} from "../systems/combat.js";
import { makeNpcUtilityEvent } from "../systems/combatEvents.js";
import { clearConsumableCooldownsForPlayer, grantStarterConsumables, useInventoryConsumable } from "../systems/consumables.js";
import {
  equipInventoryItem,
  initializeCharacterEquipment,
  normalizeEquipmentSlotId,
  recalculatePlayerStats,
  registerChainGearItem,
  unequipPlayerSlot,
  updateChainGearTier,
} from "../systems/equipment.js";
import { findInteractNpc } from "../systems/interactions.js";
import { lootCorpseItem, makeLootWindow, normalizeItemId, npcHasLoot } from "../systems/loot.js";
import { getMferGptPrompt, handleMferGptPrompt, type MferGptCommand } from "../systems/mfergpt.js";
import { spawnNpcFromSpec, spawnNpcs, updateNpcs } from "../systems/npcs.js";
import { applyFrostNova, applyMultishot, applyWhirlwind } from "../systems/playerCombatAbilities.js";
import {
  completeQuest,
  getNpcDialogue,
  getNextAvailableQuestId,
  getNpcQuestInteraction,
  isQuestAvailable,
  makeQuestOffer,
  makeQuestTurnIn,
  normalizeQuestId,
  progressTraitQuest,
  progressMferGptAskQuest,
  progressMferGptMentionQuest,
  progressSocialQuest,
  startQuest,
  progressDefeatQuests,
} from "../systems/quests.js";
import { awardExperience, getNpcDefeatXp, normalizePlayerProgression } from "../systems/progression.js";
import { distanceToNpc } from "../systems/spatial.js";
import {
  getPlayerActionConfig,
  getPlayerQuestXpReward,
  getPlayerTalentRanks,
  isPlayerActionUnlocked,
  normalizePlayerTalents,
  normalizeTalentId,
  rankPlayerTalent,
} from "../systems/talents.js";
import {
  getDefaultName,
  getIdentityType,
  getSpawnPoint,
  normalizeInput,
  sanitizeChatText,
} from "../systems/utils.js";

const NPC_DAMAGE_TAG_TTL_MS = 5 * 60 * 1000;
const EMOTE_MIN_INTERVAL_MS = 900;
const CHARACTER_AUTOSAVE_INTERVAL_MS = 10_000;
const PLAYER_ATTACK_PULL_LEASH_RANGE = Math.max(...Object.values(COMBAT.actions).map((action) => action.maxRange)) + 6;
const DEBUG_PLACEMENT_MAP_PATH = fileURLToPath(new URL("../../data/debug-placement-map.json", import.meta.url));
const CLIENT_ANALYTICS_EVENTS = new Set([
  "store_opened",
  "wallet_connect_started",
  "wallet_connect_succeeded",
  "wallet_connect_failed",
  "pass_purchase_started",
  "pass_purchase_confirmed",
  "pass_purchase_failed",
  "gear_purchase_started",
  "gear_purchase_confirmed",
  "gear_purchase_failed",
]);

export function areDebugMessagesEnabled() {
  return process.env.NODE_ENV === "development" && process.env.MFERLAND_ENABLE_DEBUG_MESSAGES === "1";
}

function getRequiredInviteCode() {
  return (process.env.MFERLAND_INVITE_CODE ?? "").trim();
}

function isAllowedInvite(options?: JoinOptions) {
  const requiredInvite = getRequiredInviteCode();
  if (!requiredInvite) return true;
  return typeof options?.inviteCode === "string" && options.inviteCode.trim() === requiredInvite;
}

type DebugTeleportMessage = {
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
};

type DebugNpcPlacementMessage = {
  npcId?: unknown;
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
};

type DebugWorldPlacementMessage = {
  targetId?: unknown;
  x?: unknown;
  z?: unknown;
  rotation?: unknown;
};

type DebugPlacementSaveMessage = {
  placements?: unknown;
  sourceDefaults?: unknown;
};

type DebugPlacementSaveBeginMessage = {
  saveId?: unknown;
  totalChunks?: unknown;
};

type DebugPlacementSaveChunkMessage = DebugPlacementSaveBeginMessage & {
  index?: unknown;
  chunkIndex?: unknown;
  placements?: unknown;
  sourceDefaults?: unknown;
};

type DebugBoostPlayerMessage = {
  level?: unknown;
  maxTalents?: unknown;
};

type DebugNpcSetupMessage = {
  npcId?: unknown;
  name?: unknown;
  role?: unknown;
  model?: unknown;
  x?: unknown;
  z?: unknown;
  yaw?: unknown;
  health?: unknown;
  maxHealth?: unknown;
  leashRadius?: unknown;
  isImmortal?: unknown;
  combatStyle?: unknown;
  dialogue?: unknown;
  aggroTargetId?: unknown;
};

type ClientAnalyticsMessage = {
  eventType?: unknown;
  properties?: unknown;
};

type DebugPlacementRecord = {
  x: number;
  z: number;
  rotation: number;
  kind?: string;
  label?: string;
  source?: string;
};

type PendingDebugPlacementSave = {
  saveId: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  placements: Record<string, DebugPlacementRecord>;
  sourceDefaults: Record<string, DebugPlacementRecord>;
};

type HealTarget =
  | { kind: "player"; id: string; unit: PlayerState }
  | { kind: "npc"; id: string; unit: NpcState };

export type AdminQuestSnapshot = {
  id: QuestId;
  status: "active" | "ready" | "completed";
  progress: number;
  required: number;
  flags: string;
  completedAt: number;
};

export type AdminInventoryItemSnapshot = {
  key: string;
  id: ItemId;
  chainTokenId: string;
  chainTier: number;
  count: number;
};

export type AdminEquipmentSlotSnapshot = {
  slot: string;
  itemId: ItemId | "";
  chainTokenId: string;
  chainTier: number;
};

export type AdminTalentSnapshot = {
  id: string;
  tree: string;
  nodeId: string;
  rank: number;
};

export type AdminPlayerSnapshot = {
  sessionId: string;
  characterId: string;
  name: string;
  identityType: IdentityType;
  walletAddress: string;
  avatarSeed: number;
  status: "online" | "dead";
  joinedAt: number;
  onlineForMs: number;
  lastInputAt: number;
  lastChatAt: number;
  lastInteractAt: number;
  position: { x: number; y: number; z: number; yaw: number };
  animation: string;
  level: number;
  xp: number;
  talentPoints: number;
  season0Points: number;
  season0DailyPoints: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  healthRegenPer5: number;
  manaRegenPer5: number;
  walkSpeed: number;
  runSpeed: number;
  strength: number;
  dexterity: number;
  magic: number;
  castingAction: string;
  castTargetKind: string;
  castTargetId: string;
  lastDamagedAt: number;
  quests: AdminQuestSnapshot[];
  questCounts: Record<AdminQuestSnapshot["status"], number>;
  inventory: AdminInventoryItemSnapshot[];
  equipment: AdminEquipmentSlotSnapshot[];
  talents: AdminTalentSnapshot[];
};

export type AdminNpcSnapshot = {
  id: string;
  name: string;
  role: string;
  model: string;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  alive: boolean;
  position: { x: number; y: number; z: number; yaw: number };
  animation: string;
  questId: string;
  aggroTargetId: string;
  combatStyle: string;
  hasLoot: boolean;
  loot: AdminInventoryItemSnapshot[];
  defeatedAt: number;
  respawnAt: number;
  despawnAt: number;
  frozenUntil: number;
  slowedUntil: number;
};

export type AdminRoomSnapshot = {
  roomId: string;
  roomName: string;
  createdAt: number;
  updatedAt: number;
  clients: number;
  maxClients: number;
  players: AdminPlayerSnapshot[];
  npcs: AdminNpcSnapshot[];
};

const activeTownRooms = new Set<TownRoom>();

export function getTownAdminSnapshots(now = Date.now()): AdminRoomSnapshot[] {
  return [...activeTownRooms].map((room) => room.getAdminSnapshot(now));
}

export class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly roomCreatedAt = Date.now();
  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastEmoteAt = new Map<string, number>();
  private readonly lastMferGptAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();
  private readonly persistentCharacterIds = new Map<string, string>();
  private readonly pendingCharacterSaves = new Map<string, Promise<void>>();
  private readonly queuedCharacterSaveFingerprints = new Map<string, string>();
  private readonly savedCharacterFingerprints = new Map<string, string>();
  private readonly sessionJoinedAt = new Map<string, number>();
  private readonly deadSessionIds = new Set<string>();
  private readonly pendingCombatImpacts: PendingCombatImpact[] = [];
  private readonly temporaryNpcExpiresAt = new Map<string, number>();
  private readonly npcDamageTags = new Map<string, Map<string, number>>();
  private readonly npcThreat = new Map<string, Map<string, number>>();
  private readonly forcedNpcTargets = new Map<string, { sessionId: string; until: number }>();
  private readonly consumableCooldowns = new Map<string, number>();
  private readonly pendingDebugPlacementSaves = new Map<string, PendingDebugPlacementSave>();
  private lastCharacterAutosaveAt = 0;
  private debugWorldPlacementOverrides: Record<string, DebugPlacementRecord> = {};

  onAuth(_client: Client, options?: JoinOptions) {
    if (!isAllowedInvite(options)) throw new ServerError(ErrorCode.AUTH_FAILED, "invalid invite");
    return true;
  }

  onCreate() {
    activeTownRooms.add(this);
    this.setState(new TownState());
    spawnNpcs(this.state.npcs);
    void this.loadSavedDebugPlacementMap();
    this.setSimulationInterval((dt) => this.update(dt / 1000), 1000 / SERVER_TICK_RATE);

    this.onMessage("input", (client, message: Partial<ClientInput>) => {
      const input = normalizeInput(message);
      if (!input) return;
      this.inputs.set(client.sessionId, {
        ...input,
        receivedAt: Date.now(),
      });
    });

    this.onMessage("combatAction", (client, message: Partial<ClientCombatAction>) => {
      this.handleCombatAction(client, message);
    });

    this.onMessage("acceptQuest", (client, message: Partial<ClientAcceptQuest>) => {
      this.handleAcceptQuest(client, message);
    });

    this.onMessage("completeQuest", (client, message: Partial<ClientCompleteQuest>) => {
      this.handleCompleteQuest(client, message);
    });

    this.onMessage("analyticsEvent", (client, message: ClientAnalyticsMessage = {}) => {
      this.handleClientAnalyticsEvent(client, message);
    });

    this.onMessage("lootCorpse", (client, message: Partial<ClientLootCorpse>) => {
      this.handleLootCorpse(client, message);
    });

    this.onMessage("equipItem", (client, message: Partial<ClientEquipItem>) => {
      this.handleEquipItem(client, message);
    });

    this.onMessage("useItem", (client, message: Partial<ClientUseItem>) => {
      this.handleUseItem(client, message);
    });

    this.onMessage("unequipItem", (client, message: Partial<ClientUnequipItem>) => {
      this.handleUnequipItem(client, message);
    });

    this.onMessage("registerChainGear", (client, message: Partial<ClientRegisterChainGear> = {}) => {
      void this.handleRegisterChainGear(client, message);
    });

    this.onMessage("selectTalent", (client, message: Partial<ClientSelectTalent>) => {
      this.handleSelectTalent(client, message);
    });

    this.onMessage("updateTraits", (client, message: Partial<ClientUpdateTraits>) => {
      this.handleUpdateTraits(client, message);
    });

    this.onMessage("respawn", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health > 0) return;
      respawnPlayerAtFountain(player);
      clearPlayerEmote(player);
      this.inputs.delete(client.sessionId);
      this.jumpHeld.set(client.sessionId, false);
      this.deadSessionIds.delete(client.sessionId);
      this.recordPlayerAnalyticsEvent("player_respawned", client.sessionId, player, {
        level: player.level,
        x: Math.round(player.x),
        z: Math.round(player.z),
      });
    });

    if (areDebugMessagesEnabled()) {
      this.onMessage("debugTeleport", (client, message: DebugTeleportMessage = {}) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        const x = Number(message.x);
        const z = Number(message.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;

        const resolved = resolveWorldCollision(x, z, PLAYER.radius);
        player.x = resolved.x;
        player.y = 0;
        player.z = resolved.z;
        player.health = player.maxHealth;
        player.mana = player.maxMana;
        player.verticalVelocity = 0;
        player.animation = "idle";
        clearPlayerEmote(player);
        if (Number.isFinite(Number(message.yaw))) player.yaw = Number(message.yaw);
        clearPlayerCast(player);
        this.removePlayerThreat(client.sessionId);
        this.inputs.delete(client.sessionId);
        this.jumpHeld.set(client.sessionId, false);
      });

      this.onMessage("debugSetNpcPlacement", (_client, message: DebugNpcPlacementMessage = {}) => {
        const npcId = typeof message.npcId === "string" ? message.npcId : "";
        const npc = this.state.npcs.get(npcId);
        if (!npc) return;

        const x = Number(message.x);
        const z = Number(message.z);
        const yaw = Number(message.yaw);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;

        npc.x = x;
        npc.y = 0;
        npc.z = z;
        if (Number.isFinite(yaw)) npc.yaw = yaw;
        npc.homeX = x;
        npc.homeZ = z;
        npc.targetX = x;
        npc.targetZ = z;
        npc.animation = "idle";
        npc.aggroTargetId = "";
        npc.attackReadyAt = 0;
        npc.frozenUntil = 0;
        npc.slowedUntil = 0;
        this.npcThreat.delete(npc.id);
        this.forcedNpcTargets.delete(npc.id);
      });

      this.onMessage("debugSetWorldPlacement", (_client, message: DebugWorldPlacementMessage = {}) => {
        this.handleDebugSetWorldPlacement(message);
      });

      this.onMessage("debugBoostPlayer", (client, message: DebugBoostPlayerMessage = {}) => {
        this.handleDebugBoostPlayer(client, message);
      });

      this.onMessage("debugRegisterChainGear", (client, message: Partial<ClientDebugRegisterChainGear> = {}) => {
        this.handleDebugRegisterChainGear(client, message);
      });

      this.onMessage("debugUpdateChainGearTier", (client, message: Partial<ClientDebugUpdateChainGearTier> = {}) => {
        this.handleDebugUpdateChainGearTier(client, message);
      });

      this.onMessage("debugSetupNpc", (_client, message: DebugNpcSetupMessage = {}) => {
        this.handleDebugSetupNpc(message);
      });

      this.onMessage("debugSavePlacements", (client, message: DebugPlacementSaveMessage = {}) => {
        void this.handleDebugSavePlacements(client, message);
      });

      this.onMessage("debugBeginPlacementSave", (client, message: DebugPlacementSaveBeginMessage = {}) => {
        this.handleDebugBeginPlacementSave(client, message);
      });

      this.onMessage("debugPlacementSaveChunk", (client, message: DebugPlacementSaveChunkMessage = {}) => {
        void this.handleDebugPlacementSaveChunk(client, message);
      });

    }

    this.onMessage("debugRequestPlacementMap", (client) => {
      void readDebugPlacementMap().then((document) => {
        client.send("debugPlacementMap", document);
      });
    });

    this.onMessage("chat", (client, message: { text?: string }) => {
      void this.handleChatMessage(client, message);
    });

    this.onMessage("shareQuestLink", (client, message: Partial<ClientShareQuestLink> = {}) => {
      this.handleShareQuestLink(client, message);
    });

    this.onMessage("emote", (client, message: Partial<ClientEmote> = {}) => {
      this.handleEmote(client, message);
    });

    this.onMessage("interact", (client, message: ClientInteract = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const now = Date.now();
      const lastInteract = this.lastInteractAt.get(client.sessionId) ?? 0;
      if (now - lastInteract < 750) return;
      this.lastInteractAt.set(client.sessionId, now);

      const npc = findInteractNpc(player, this.state.npcs, message?.npcId);
      if (!npc) return;

      if (!isNpcAlive(npc)) {
        if (npcHasLoot(npc)) {
          client.send("lootWindow", makeLootWindow(npc));
        }
        return;
      }

      npc.yaw = Math.atan2(player.x - npc.x, player.z - npc.z);
      npc.animation = "idle";

      const questInteraction = getNpcQuestInteraction(npc, player);
      if (questInteraction?.type === "offer") {
        client.send("questOffer", questInteraction.offer);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      if (questInteraction?.type === "turnIn") {
        client.send("questTurnIn", questInteraction.turnIn);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      if (questInteraction?.type === "status") {
        client.send("questStatus", questInteraction.notice);
        this.persistPlayerProgress(client.sessionId, player);
        return;
      }

      const payload: ChatMessage = {
        sessionId: npc.id,
        name: npc.name,
        identityType: "npc",
        text: questInteraction?.type === "flavor"
          ? `${player.name}, ${questInteraction.text}`
          : getNpcDialogue(npc, player),
        sentAt: now,
      };
      this.broadcast("chat", payload);
      this.persistPlayerProgress(client.sessionId, player);
    });
  }

  async onJoin(client: Client, options?: JoinOptions) {
    const player = new PlayerState();
    const spawn = getSpawnPoint(this.state.players.size);
    const walletAddress = normalizeWalletAddress(options?.walletAddress);
    if (options?.identityType === "wallet" && !walletAddress) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "valid wallet address required");
    }
    const identityType = getIdentityType(options, walletAddress);
    const defaultName = getDefaultName(identityType, walletAddress, client.sessionId);
    const name = sanitizePlayerName(options?.name, defaultName);
    const requestedAvatarSeed = Number.isFinite(options?.avatarSeed)
      ? Number(options?.avatarSeed)
      : stableHash(`${client.sessionId}:${name}:${walletAddress}`);
    const avatarSeed = normalizeAvatarSeed(requestedAvatarSeed);
    const persistedCharacter = identityType === "wallet" && walletAddress
      ? await loadPersistedCharacter(walletAddress, name, avatarSeed, Boolean(options?.createCharacter))
      : null;
    if (identityType === "wallet" && !persistedCharacter) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "character creation required");
    }

    player.name = persistedCharacter?.name ?? name;
    player.identityType = identityType;
    player.walletAddress = walletAddress;
    player.avatarSeed = persistedCharacter?.avatarSeed ?? avatarSeed;
    player.appearanceTraitsJson = JSON.stringify(persistedCharacter?.appearanceTraits ?? {});
    player.level = persistedCharacter?.level ?? 1;
    player.xp = persistedCharacter?.xp ?? 0;
    player.talentPoints = persistedCharacter?.talentPoints ?? 0;
    player.season0Points = persistedCharacter?.season0Points ?? 0;
    player.season0DailyPoints = persistedCharacter?.season0DailyPoints ?? 0;
    normalizePlayerProgression(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.x = spawn.x;
    player.y = 0;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    if (persistedCharacter) {
      applyPersistedCharacter(player, persistedCharacter);
      await this.reconcileOwnedChainGear(player);
      this.persistentCharacterIds.set(client.sessionId, persistedCharacter.characterId);
    }
    normalizePlayerTalents(player);
    initializeCharacterEquipment(player);
    if (player.identityType === "guest") grantStarterConsumables(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;

    this.state.players.set(client.sessionId, player);
    this.sessionJoinedAt.set(client.sessionId, Date.now());
    this.recordPlayerAnalyticsEvent("session_joined", client.sessionId, player, {
      level: player.level,
      persisted: Boolean(persistedCharacter),
      playerCount: this.state.players.size,
    });
    if (persistedCharacter) {
      client.send("persistenceStatus", {
        state: "saved",
        message: "wallet progress saved",
      });
    }
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    const characterId = this.persistentCharacterIds.get(client.sessionId);
    if (player) {
      this.recordPlayerAnalyticsEvent("session_left", client.sessionId, player, {
        durationMs: Math.max(0, Date.now() - (this.sessionJoinedAt.get(client.sessionId) ?? Date.now())),
        level: player.level,
        playerCount: Math.max(0, this.state.players.size - 1),
        x: Math.round(player.x),
        z: Math.round(player.z),
      });
      await this.persistPlayerProgressNow(client.sessionId, player);
    }
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.jumpHeld.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastEmoteAt.delete(client.sessionId);
    this.lastMferGptAt.delete(client.sessionId);
    this.lastInteractAt.delete(client.sessionId);
    this.persistentCharacterIds.delete(client.sessionId);
    if (characterId) this.cleanupCharacterSaveTracking(characterId);
    this.sessionJoinedAt.delete(client.sessionId);
    this.deadSessionIds.delete(client.sessionId);
    this.pendingDebugPlacementSaves.delete(client.sessionId);
    clearConsumableCooldownsForPlayer(this.consumableCooldowns, client.sessionId);
    this.removePlayerThreat(client.sessionId);
  }

  onDispose() {
    activeTownRooms.delete(this);
  }

  getAdminSnapshot(now = Date.now()): AdminRoomSnapshot {
    return {
      roomId: this.roomId,
      roomName: ROOM_NAME,
      createdAt: this.roomCreatedAt,
      updatedAt: now,
      clients: this.clients.length,
      maxClients: this.maxClients,
      players: snapshotPlayers({
        players: this.state.players,
        persistentCharacterIds: this.persistentCharacterIds,
        sessionJoinedAt: this.sessionJoinedAt,
        inputs: this.inputs,
        lastChatAt: this.lastChatAt,
        lastInteractAt: this.lastInteractAt,
        deadSessionIds: this.deadSessionIds,
        now,
      }),
      npcs: snapshotNpcs(this.state.npcs),
    };
  }

  private async handleDebugSavePlacements(client: Client, message: DebugPlacementSaveMessage) {
    const placements = normalizeDebugPlacementRecordMap(message.placements);
    const incomingSourceDefaults = normalizeDebugPlacementRecordMap(message.sourceDefaults);
    await this.writeDebugPlacementMap(client, placements, incomingSourceDefaults);
  }

  private handleDebugBeginPlacementSave(client: Client, message: DebugPlacementSaveBeginMessage) {
    const saveId = normalizeDebugPlacementSaveId(message.saveId);
    const totalChunks = normalizeDebugPlacementChunkNumber(message.totalChunks, 1, 200);
    if (!saveId || !totalChunks) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Invalid placement save chunk header.",
      });
      return;
    }

    this.pendingDebugPlacementSaves.set(client.sessionId, {
      saveId,
      totalChunks,
      receivedChunks: new Set(),
      placements: {},
      sourceDefaults: {},
    });
  }

  private async handleDebugPlacementSaveChunk(client: Client, message: DebugPlacementSaveChunkMessage) {
    const saveId = normalizeDebugPlacementSaveId(message.saveId);
    const pending = this.pendingDebugPlacementSaves.get(client.sessionId);
    if (!saveId || !pending || pending.saveId !== saveId) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Placement save session was not ready.",
      });
      return;
    }

    const totalChunks = normalizeDebugPlacementChunkNumber(message.totalChunks, 1, 200);
    const chunkIndex = normalizeDebugPlacementChunkNumber(message.index ?? message.chunkIndex, 0, pending.totalChunks - 1);
    if (totalChunks !== pending.totalChunks || chunkIndex === null) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "Invalid placement save chunk.",
      });
      this.pendingDebugPlacementSaves.delete(client.sessionId);
      return;
    }

    if (!pending.receivedChunks.has(chunkIndex)) {
      Object.assign(pending.placements, normalizeDebugPlacementRecordMap(message.placements));
      Object.assign(pending.sourceDefaults, normalizeDebugPlacementRecordMap(message.sourceDefaults));
      pending.receivedChunks.add(chunkIndex);
    }

    if (pending.receivedChunks.size < pending.totalChunks) return;

    this.pendingDebugPlacementSaves.delete(client.sessionId);
    await this.writeDebugPlacementMap(client, pending.placements, pending.sourceDefaults);
  }

  private async writeDebugPlacementMap(
    client: Client,
    placements: Record<string, DebugPlacementRecord>,
    incomingSourceDefaults: Record<string, DebugPlacementRecord>,
  ) {
    const placementCount = Object.keys(placements).length;
    if (placementCount === 0) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: "No placement records to save.",
      });
      return;
    }

    try {
      const existing = await readDebugPlacementMap();
      const sourceDefaults: Record<string, DebugPlacementRecord> = {};
      for (const id of Object.keys(placements)) {
        sourceDefaults[id] = existing.sourceDefaults[id] ?? incomingSourceDefaults[id] ?? placements[id];
      }
      const savedAt = new Date().toISOString();
      const document = {
        version: 1,
        savedAt,
        sourceDefaults,
        placements,
      };
      await mkdir(dirname(DEBUG_PLACEMENT_MAP_PATH), { recursive: true });
      await writeFile(DEBUG_PLACEMENT_MAP_PATH, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      this.debugWorldPlacementOverrides = filterWorldDebugPlacements(placements);
      setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
      this.broadcast("debugPlacementMap", {
        placements,
        sourceDefaults,
      });
      client.send("debugPlacementSaveResult", {
        ok: true,
        path: DEBUG_PLACEMENT_MAP_PATH,
        savedAt,
        count: placementCount,
      });
    } catch (error) {
      client.send("debugPlacementSaveResult", {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to save placement map.",
      });
    }
  }

  private async loadSavedDebugPlacementMap() {
    const saved = await readDebugPlacementMap();
    this.debugWorldPlacementOverrides = filterWorldDebugPlacements(saved.placements);
    setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
    applySavedDebugNpcPlacements(this.state.npcs, saved.placements);
  }

  private handleDebugSetWorldPlacement(message: DebugWorldPlacementMessage) {
    const targetId = typeof message.targetId === "string" ? message.targetId : "";
    if (!targetId || targetId.startsWith("npc:")) return;

    const placement = normalizeDebugPlacementRecord({
      x: message.x,
      z: message.z,
      rotation: message.rotation,
    });
    if (!placement) return;

    this.debugWorldPlacementOverrides = {
      ...this.debugWorldPlacementOverrides,
      [targetId]: placement,
    };
    setWorldCollisionPlacementOverrides(this.debugWorldPlacementOverrides);
  }

  private handleDebugBoostPlayer(client: Client, message: DebugBoostPlayerMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const requestedLevel = Number(message.level);
    player.level = Number.isFinite(requestedLevel) ? clamp(Math.round(requestedLevel), 1, 40) : 12;
    player.xp = Math.max(player.xp, 0);
    player.talentPoints = 0;

    if (message.maxTalents !== false) {
      player.talents.clear();
      for (const [talentId, definition] of Object.entries(TALENTS)) {
        const talent = new TalentState();
        talent.id = talentId as keyof typeof TALENTS;
        talent.tree = definition.tree;
        talent.nodeId = definition.nodeId;
        talent.rank = definition.maxRank;
        player.talents.set(talent.id, talent);
      }
    }

    normalizePlayerTalents(player);
    recalculatePlayerStats(player);
    player.maxHealth = Math.max(player.maxHealth, 1800);
    player.maxMana = Math.max(player.maxMana, 260);
    player.strength = Math.max(player.strength, 44);
    player.dexterity = Math.max(player.dexterity, 44);
    player.magic = Math.max(player.magic, 44);
    player.walkSpeed = Math.max(player.walkSpeed, PLAYER.walkSpeed + 0.8);
    player.runSpeed = Math.max(player.runSpeed, PLAYER.runSpeed + 1.2);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.attackReadyAt = 0;
    player.shootReadyAt = 0;
    player.signalShotReadyAt = 0;
    player.fireblastReadyAt = 0;
    player.frostNovaReadyAt = 0;
    player.healReadyAt = 0;
    player.tauntReadyAt = 0;
    player.whirlwindReadyAt = 0;
    player.multishotReadyAt = 0;
    player.iceBlastReadyAt = 0;
    clearPlayerCast(player);
  }

  private handleDebugSetupNpc(message: DebugNpcSetupMessage) {
    const npcId = typeof message.npcId === "string" ? message.npcId.trim().slice(0, 80) : "";
    if (!npcId || !/^[a-z0-9:_-]+$/i.test(npcId)) return;

    const x = Number(message.x);
    const z = Number(message.z);
    const yaw = Number(message.yaw);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    const health = normalizePositiveNumber(message.health);
    const maxHealth = normalizePositiveNumber(message.maxHealth) ?? health;
    const leashRadius = normalizePositiveNumber(message.leashRadius) ?? 14;
    const role = normalizeDebugNpcRole(message.role);
    const model = normalizeDebugNpcModel(message.model);
    const combatStyle = normalizeDebugNpcCombatStyle(message.combatStyle);
    const name = typeof message.name === "string" && message.name.trim()
      ? message.name.trim().slice(0, 48)
      : npcId.replace(/[-_:]+/g, " ");
    const dialogue = typeof message.dialogue === "string" && message.dialogue.trim()
      ? message.dialogue.trim().slice(0, 160)
      : "capture target";

    const existing = this.state.npcs.get(npcId);
    const npc = existing ?? spawnNpcFromSpec(this.state.npcs, {
      id: npcId,
      name,
      role,
      model,
      x,
      z,
      yaw: Number.isFinite(yaw) ? yaw : 0,
      leashRadius,
      health: maxHealth ?? health ?? 100,
      maxHealth: maxHealth ?? health ?? 100,
      isImmortal: Boolean(message.isImmortal),
      combatStyle,
      dialogue,
    });

    npc.name = name;
    npc.role = role;
    npc.model = model;
    npc.x = x;
    npc.y = 0;
    npc.z = z;
    npc.homeX = x;
    npc.homeZ = z;
    npc.targetX = x;
    npc.targetZ = z;
    npc.yaw = Number.isFinite(yaw) ? yaw : npc.yaw;
    npc.leashRadius = leashRadius;
    npc.dialogue = dialogue;
    npc.combatStyle = combatStyle;
    npc.isImmortal = Boolean(message.isImmortal);
    npc.maxHealth = maxHealth ?? health ?? npc.maxHealth;
    npc.health = health ?? npc.maxHealth;
    npc.defeatedAt = 0;
    npc.despawnAt = 0;
    npc.respawnAt = 0;
    npc.attackReadyAt = 0;
    npc.frozenUntil = 0;
    npc.slowedUntil = 0;
    npc.hasLoot = false;
    npc.loot.clear();
    npc.animation = "idle";
    npc.aggroTargetId = typeof message.aggroTargetId === "string" ? message.aggroTargetId : "";
    this.npcThreat.delete(npc.id);
    this.forcedNpcTargets.delete(npc.id);
  }

  private async handleChatMessage(client: Client, message: { text?: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const text = sanitizeChatText(message?.text);
    if (!text) return;

    const now = Date.now();
    const lastChat = this.lastChatAt.get(client.sessionId) ?? 0;
    if (now - lastChat < CHAT.minIntervalMs) return;
    this.lastChatAt.set(client.sessionId, now);

    const payload: ChatMessage = {
      sessionId: client.sessionId,
      name: player.name,
      identityType: player.identityType,
      text,
      sentAt: now,
    };
    this.broadcast("chat", payload);

    const progressedMferGptMentionQuest = progressMferGptMentionQuest(player, text);
    const progressedMferGptAskQuest = progressMferGptAskQuest(player, text);
    if (progressedMferGptMentionQuest || progressedMferGptAskQuest) {
      this.persistPlayerProgress(client.sessionId, player);
    }

    const prompt = getMferGptPrompt(text);
    if (!prompt) return;

    const lastMferGpt = this.lastMferGptAt.get(client.sessionId) ?? 0;
    if (now - lastMferGpt < MFERGPT.commandCooldownMs) {
      const waitSeconds = Math.ceil((MFERGPT.commandCooldownMs - (now - lastMferGpt)) / 1000);
      client.send("chat", makeMferGptChatMessage(`signal cooling off. try again in ${waitSeconds}s.`, Date.now()));
      this.logMferGptCommand(client.sessionId, player.name, "chat", false, "cooldown", 0, []);
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: "chat",
        status: "cooldown",
        latencyMs: 0,
      });
      return;
    }
    this.lastMferGptAt.set(client.sessionId, now);

    const startedAt = Date.now();
    try {
      const result = await handleMferGptPrompt({
        sessionId: client.sessionId,
        player,
        players: this.state.players,
        npcs: this.state.npcs,
        prompt,
        now: Date.now(),
      });
      for (const temporaryNpc of result.temporaryNpcs) {
        this.temporaryNpcExpiresAt.set(temporaryNpc.id, temporaryNpc.expiresAt);
      }
      this.broadcast("chat", makeMferGptChatMessage(result.responseText, Date.now()));
      this.logMferGptCommand(
        client.sessionId,
        player.name,
        result.command,
        true,
        "ok",
        Date.now() - startedAt,
        result.temporaryNpcs.map((npc) => npc.id),
      );
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: result.command,
        status: "ok",
        latencyMs: Date.now() - startedAt,
        temporaryNpcCount: result.temporaryNpcs.length,
      });
      if (result.command === "hint") {
        this.recordPlayerAnalyticsEvent("mfergpt_hint_requested", client.sessionId, player, {
          status: "ok",
          progressedQuest: Boolean(progressedMferGptAskQuest),
        });
      }
    } catch (error) {
      client.send("chat", makeMferGptChatMessage("signal ate that one. try again in a sec.", Date.now()));
      console.error("mfergpt.command_failed", {
        sessionId: client.sessionId,
        playerName: player.name,
        latencyMs: Date.now() - startedAt,
        error,
      });
      this.recordPlayerAnalyticsEvent("mfergpt_command", client.sessionId, player, {
        command: "unknown",
        status: "error",
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  private handleShareQuestLink(client: Client, message: Partial<ClientShareQuestLink>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !progressSocialQuest(player, questId)) return;

    this.persistPlayerProgress(client.sessionId, player);
    const turnInNpc = this.state.npcs.get(getQuestTurnInNpcId(questId));
    const quest = player.quests.get(questId);
    if (turnInNpc && quest?.status === "ready" && distanceToNpc(player, turnInNpc) <= 3.75) {
      client.send("questTurnIn", makeQuestTurnIn(questId, turnInNpc, quest));
    }
  }

  private handleEmote(client: Client, message: Partial<ClientEmote>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0 || player.castingAction) return;

    const emoteId = normalizeEmoteId(message?.emoteId);
    if (!emoteId) return;

    const now = Date.now();
    const lastEmote = this.lastEmoteAt.get(client.sessionId) ?? 0;
    if (now - lastEmote < EMOTE_MIN_INTERVAL_MS) return;
    this.lastEmoteAt.set(client.sessionId, now);

    const emote = EMOTES[emoteId];
    player.emote = emoteId;
    player.emoteStartedAt = now;
    player.emoteEndsAt = emote.durationMs > 0 ? now + emote.durationMs : 0;

    this.broadcast("chat", {
      sessionId: client.sessionId,
      name: player.name,
      identityType: player.identityType,
      text: emote.chatText,
      sentAt: now,
      kind: "emote",
    } satisfies ChatMessage);
  }

  private handleCombatAction(client: Client, message: Partial<ClientCombatAction>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.health <= 0) return;
    clearPlayerEmote(player);

    const actionId = normalizeCombatActionId(message?.actionId);
    if (!actionId) return;
    const debugUnlockAllMoves = process.env.NODE_ENV !== "production" && message?.debugUnlockAllMoves === true;
    if (!isPlayerActionUnlocked(player, actionId, debugUnlockAllMoves)) return;

    const action = getPlayerActionConfig(player, actionId);
    const now = Date.now();
    if (player.castingAction) return;
    if (getActionReadyAt(player, actionId) > now) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) return;
    if (action.requiresStationary && !isPlayerStationary(player, this.inputs.get(client.sessionId), now)) return;

    if (actionId === "frostNova") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      applyFrostNova(
        client.sessionId,
        player,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    if (actionId === "whirlwind") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      applyWhirlwind(
        client.sessionId,
        player,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    if (actionId === "heal") {
      const healTarget = this.findHealTarget(player, message?.target, client.sessionId);
      if (!healTarget) return;
      const distance = this.distanceToHealTarget(player, healTarget);
      if (distance < action.minRange || distance > action.maxRange) return;
      if (healTarget.unit.health >= healTarget.unit.maxHealth) return;

      player.lastCastAt = now;
      if (healTarget.id !== client.sessionId || healTarget.kind !== "player") {
        player.yaw = Math.atan2(healTarget.unit.x - player.x, healTarget.unit.z - player.z);
      }
      applyPlayerUniversalCooldown(player, now);
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = healTarget.kind;
      player.castTargetId = healTarget.id;
      return;
    }

    const target = findCombatTarget(this.state.npcs, message?.target);
    if (!target) return;
    if (!isNpcAlive(target)) return;

    const distance = distanceToNpc(player, target);
    if (distance < action.minRange || distance > action.maxRange) return;

    player.yaw = Math.atan2(target.x - player.x, target.z - player.z);

    if (actionId === "taunt") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyPlayerUniversalCooldown(player, now);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      player.lastCastAt = now;
      this.forceNpcTarget(client.sessionId, target, now);
      this.broadcast("combatEvent", makeNpcUtilityEvent(client.sessionId, player, target, actionId, now));
      return;
    }

    if (action.castTimeMs > 0) {
      player.lastCastAt = now;
      applyPlayerUniversalCooldown(player, now);
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = "npc";
      player.castTargetId = target.id;
      return;
    }

    setActionReadyAt(player, actionId, now + action.cooldownMs);
    applyPlayerUniversalCooldown(player, now);
    player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
    player.lastCastAt = now;
    aggroNeutralNpcOnPlayerAttackStart(target, client.sessionId, player);
    if (actionId === "multishot") {
      applyMultishot(
        client.sessionId,
        player,
        target,
        this.state.npcs,
        now,
        (event) => this.broadcast("combatEvent", event),
        this.pendingCombatImpacts,
        (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
        (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
        (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
      );
      return;
    }

    const damage = getPlayerActionDamage(player, actionId);
    applyCombatDamage(
      client.sessionId,
      player,
      target,
      actionId,
      damage,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
      (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
      (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
      (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
    );
  }

  private updatePlayerHealCast(sessionId: string, player: PlayerState, activeInput: TrackedInput | null, now: number) {
    const action = getPlayerActionConfig(player, "heal");
    if (action.requiresStationary && !isPlayerStationary(player, activeInput ?? undefined, now)) {
      clearPlayerCast(player);
      return;
    }
    if (now < player.castEndsAt) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) {
      clearPlayerCast(player);
      return;
    }

    const healTarget = this.findHealTarget(player, { kind: player.castTargetKind, id: player.castTargetId }, sessionId);
    if (!healTarget || this.distanceToHealTarget(player, healTarget) > action.maxRange) {
      clearPlayerCast(player);
      return;
    }
    if (healTarget.unit.health >= healTarget.unit.maxHealth) {
      clearPlayerCast(player);
      return;
    }

    const healing = getPlayerHealingAmount(player, "heal");
    player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
    setActionReadyAt(player, "heal", now + action.cooldownMs);
    applyPlayerUniversalCooldown(player, now);
    player.lastCastAt = now;
    const appliedHealing = applyUnitHealing(
      sessionId,
      player,
      healTarget.kind,
      healTarget.id,
      healTarget.unit,
      "heal",
      healing,
      now,
      (event) => this.broadcast("combatEvent", event),
    );
    this.addHealingThreat(sessionId, healTarget.unit, appliedHealing, now);
    clearPlayerCast(player);
  }

  private findHealTarget(player: PlayerState, target: unknown, fallbackSessionId: string): HealTarget | null {
    if (!target || typeof target !== "object") {
      return { kind: "player", id: fallbackSessionId, unit: player };
    }

    const maybeTarget = target as { kind?: unknown; id?: unknown };
    if (typeof maybeTarget.id !== "string") {
      return { kind: "player", id: fallbackSessionId, unit: player };
    }

    if (maybeTarget.kind === "player") {
      const targetPlayer = this.state.players.get(maybeTarget.id);
      if (!targetPlayer || targetPlayer.health <= 0) return null;
      return { kind: "player", id: maybeTarget.id, unit: targetPlayer };
    }

    if (maybeTarget.kind === "npc") {
      const npc = this.state.npcs.get(maybeTarget.id);
      if (!npc || !isNpcAlive(npc) || !this.isHealableNpc(npc)) return null;
      return { kind: "npc", id: npc.id, unit: npc };
    }

    return { kind: "player", id: fallbackSessionId, unit: player };
  }

  private distanceToHealTarget(player: PlayerState, target: HealTarget) {
    return Math.hypot(player.x - target.unit.x, player.z - target.unit.z);
  }

  private isHealableNpc(npc: NpcState) {
    return getNpcDisposition(npc) !== "hostile";
  }

  private addNpcThreat(sourceId: string, npc: NpcState, actionId: CombatActionId, amount: number, now: number) {
    if (!sourceId || !isNpcAlive(npc) || npc.isImmortal) return;

    const table = this.npcThreat.get(npc.id) ?? new Map<string, number>();
    const threat = this.getThreatValue(actionId, amount);
    table.set(sourceId, (table.get(sourceId) ?? 0) + threat);
    this.npcThreat.set(npc.id, table);

    const player = this.state.players.get(sourceId);
    if (player?.health && !npc.aggroTargetId) {
      npc.aggroTargetId = sourceId;
      npc.nextDecisionAt = 0;
    }
    if (actionId === "taunt") {
      this.forcedNpcTargets.set(npc.id, { sessionId: sourceId, until: now + COMBAT.actions.taunt.forceMs });
      npc.aggroTargetId = sourceId;
      npc.nextDecisionAt = 0;
    }
  }

  private getThreatValue(actionId: CombatActionId, amount: number) {
    if (actionId === "attack") return amount + COMBAT.actions.attack.threatBonus;
    if (actionId === "whirlwind") return amount + COMBAT.actions.whirlwind.threatBonus;
    if (actionId === "taunt") return COMBAT.actions.taunt.threat;
    return Math.max(0, amount);
  }

  private forceNpcTarget(sourceId: string, npc: NpcState, now: number) {
    const table = this.npcThreat.get(npc.id) ?? new Map<string, number>();
    let highestThreat = 0;
    table.forEach((threat) => {
      highestThreat = Math.max(highestThreat, threat);
    });
    table.set(sourceId, Math.max(table.get(sourceId) ?? 0, highestThreat + COMBAT.actions.taunt.threat));
    this.npcThreat.set(npc.id, table);
    this.addNpcThreat(sourceId, npc, "taunt", COMBAT.actions.taunt.threat, now);
  }

  private addHealingThreat(sourceId: string, healedUnit: Pick<PlayerState | NpcState, "x" | "z">, effectiveHealing: number, now: number) {
    if (effectiveHealing <= 0) return;

    const healingThreat = effectiveHealing * COMBAT.actions.heal.threatMultiplier;
    this.state.npcs.forEach((npc) => {
      if (!isNpcAlive(npc) || npc.isImmortal) return;
      const table = this.npcThreat.get(npc.id);
      const isEngaged = Boolean(npc.aggroTargetId || table?.size);
      if (!isEngaged) return;
      const distance = Math.hypot(npc.x - healedUnit.x, npc.z - healedUnit.z);
      if (distance > COMBAT.actions.heal.threatRadius) return;
      this.addNpcThreat(sourceId, npc, "heal", healingThreat, now);
    });
  }

  private applyThreatTargets(now: number) {
    this.state.npcs.forEach((npc) => {
      if (!isNpcAlive(npc) || npc.isImmortal) {
        this.npcThreat.delete(npc.id);
        this.forcedNpcTargets.delete(npc.id);
        return;
      }

      const forcedTarget = this.forcedNpcTargets.get(npc.id);
      if (forcedTarget) {
        const player = this.state.players.get(forcedTarget.sessionId);
        if (now < forcedTarget.until && this.isThreatTargetEligible(npc, player)) {
          npc.aggroTargetId = forcedTarget.sessionId;
          npc.nextDecisionAt = 0;
          return;
        }
        this.forcedNpcTargets.delete(npc.id);
      }

      const table = this.npcThreat.get(npc.id);
      if (!table?.size) return;

      let highestSessionId = "";
      let highestThreat = 0;
      for (const [sessionId, threat] of table) {
        const player = this.state.players.get(sessionId);
        if (!this.isThreatTargetEligible(npc, player)) {
          table.delete(sessionId);
          continue;
        }
        if (threat > highestThreat) {
          highestThreat = threat;
          highestSessionId = sessionId;
        }
      }

      if (!highestSessionId) {
        this.npcThreat.delete(npc.id);
        return;
      }

      const currentThreat = npc.aggroTargetId ? table.get(npc.aggroTargetId) ?? 0 : 0;
      const shouldSwitch = !npc.aggroTargetId || highestSessionId === npc.aggroTargetId || highestThreat >= currentThreat * 1.15 + 8;
      if (shouldSwitch && npc.aggroTargetId !== highestSessionId) {
        npc.aggroTargetId = highestSessionId;
        npc.nextDecisionAt = 0;
      }
    });
  }

  private isThreatTargetEligible(npc: NpcState, player: PlayerState | undefined) {
    if (!player || player.health <= 0) return false;
    return Math.hypot(player.x - npc.homeX, player.z - npc.homeZ) <= Math.max(npc.leashRadius + 8, PLAYER_ATTACK_PULL_LEASH_RANGE);
  }

  private removePlayerThreat(sessionId: string) {
    for (const table of this.npcThreat.values()) {
      table.delete(sessionId);
    }
    for (const [npcId, forcedTarget] of this.forcedNpcTargets) {
      if (forcedTarget.sessionId === sessionId) this.forcedNpcTargets.delete(npcId);
    }
  }

  private handleEquipItem(client: Client, message: Partial<ClientEquipItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const itemId = normalizeItemId(message?.itemId);
    if (!itemId) return;
    if (!equipInventoryItem(player, itemId, message?.chainTokenId)) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleUnequipItem(client: Client, message: Partial<ClientUnequipItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const slotId = normalizeEquipmentSlotId(message?.slot);
    if (!slotId) return;
    if (!unequipPlayerSlot(player, slotId)) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleDebugRegisterChainGear(client: Client, message: Partial<ClientDebugRegisterChainGear>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const gearType = Number(message.gearType);
    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!Number.isInteger(gearType)) return;
    if (!registerChainGearItem(player, gearType, tokenId, normalizeChainGearTier(message.tier))) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private async handleRegisterChainGear(client: Client, message: Partial<ClientRegisterChainGear>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.identityType !== "wallet" || !player.walletAddress) {
      client.send("chat", makeSystemChat("Chain Gear", "Connect the owning wallet before registering chain gear."));
      return;
    }

    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!tokenId) {
      client.send("chat", makeSystemChat("Chain Gear", "Missing gear token id."));
      return;
    }

    try {
      const verified = await verifyChainGearOwnership({ tokenId, walletAddress: player.walletAddress });
      if (!verified) {
        client.send("chat", makeSystemChat("Chain Gear", `Could not verify gear token #${tokenId} for this wallet.`));
        return;
      }

      const requestedGearType = Number(message.gearType);
      if (Number.isInteger(requestedGearType) && requestedGearType > 0 && requestedGearType !== verified.gearType) {
        client.send("chat", makeSystemChat("Chain Gear", `Gear token #${verified.tokenId} is type ${verified.gearType}, not ${requestedGearType}.`));
        return;
      }

      if (!registerChainGearItem(player, verified.gearType, verified.tokenId, verified.tier)) {
        client.send("chat", makeSystemChat("Chain Gear", `Verified token #${verified.tokenId}, but this gear type is not in the game catalog yet.`));
        return;
      }

      this.recordPlayerAnalyticsEvent("chain_gear_registered", client.sessionId, player, {
        gearType: verified.gearType,
        tokenId: verified.tokenId,
        tier: verified.tier,
        chainId: verified.chainId,
        txHash: typeof message.txHash === "string" ? message.txHash.slice(0, 80) : "",
      });
      this.persistPlayerProgress(client.sessionId, player);
      client.send("chat", makeSystemChat("Chain Gear", `Verified gear token #${verified.tokenId} and added it to your inventory.`));
    } catch (error) {
      console.warn("chain_gear.verify_failed", error);
      client.send("chat", makeSystemChat("Chain Gear", "Chain gear verification is temporarily unavailable."));
    }
  }

  private handleDebugUpdateChainGearTier(client: Client, message: Partial<ClientDebugUpdateChainGearTier>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const tokenId = typeof message.tokenId === "string" ? message.tokenId : "";
    if (!updateChainGearTier(player, tokenId, normalizeChainGearTier(message.tier))) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private async reconcileOwnedChainGear(player: PlayerState) {
    if (player.identityType !== "wallet" || !player.walletAddress) return;

    const chainItems: Array<{ key: string; tokenId: string; itemId: ItemId }> = [];
    player.inventory.forEach((item, key) => {
      const tokenId = normalizeChainTokenId(item.chainTokenId);
      if (tokenId) chainItems.push({ key, tokenId, itemId: item.id });
    });
    if (chainItems.length === 0) return;

    const staleTokens = new Set<string>();
    const verifiedTiers = new Map<string, number>();
    let changed = false;

    for (const item of chainItems) {
      let verified;
      try {
        verified = await verifyChainGearOwnership({ tokenId: item.tokenId, walletAddress: player.walletAddress });
      } catch (error) {
        console.warn("chain_gear.reconcile_skipped", error);
        return;
      }

      const verifiedItemId = verified ? getChainGearItemId(verified.gearType) : null;
      if (!verified || verifiedItemId !== item.itemId) {
        staleTokens.add(item.tokenId);
        player.inventory.delete(item.key);
        changed = true;
        continue;
      }

      const inventoryItem = player.inventory.get(item.key);
      const verifiedTier = normalizeChainGearTier(verified.tier);
      verifiedTiers.set(item.tokenId, verifiedTier);
      if (inventoryItem && inventoryItem.chainTier !== verifiedTier) {
        inventoryItem.chainTier = verifiedTier;
        changed = true;
      }
    }

    player.equipment.forEach((slot) => {
      const tokenId = normalizeChainTokenId(slot.chainTokenId);
      if (!tokenId || !staleTokens.has(tokenId)) return;
      slot.itemId = "";
      slot.chainTokenId = "";
      slot.chainTier = 1;
      changed = true;
    });
    player.equipment.forEach((slot) => {
      const tokenId = normalizeChainTokenId(slot.chainTokenId);
      const verifiedTier = verifiedTiers.get(tokenId);
      if (!verifiedTier || slot.chainTier === verifiedTier) return;
      slot.chainTier = verifiedTier;
      changed = true;
    });

    if (changed) recalculatePlayerStats(player);
  }

  private handleUseItem(client: Client, message: Partial<ClientUseItem>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const itemId = normalizeItemId(message?.itemId);
    if (!itemId) return;
    const used = useInventoryConsumable({
      chainTokenId: message?.chainTokenId,
      cooldowns: this.consumableCooldowns,
      itemId,
      now: Date.now(),
      player,
      sessionId: client.sessionId,
    });
    if (!used) return;

    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleClientAnalyticsEvent(client: Client, message: ClientAnalyticsMessage) {
    const eventType = typeof message.eventType === "string" ? message.eventType : "";
    if (!CLIENT_ANALYTICS_EVENTS.has(eventType)) return;

    const player = this.state.players.get(client.sessionId);
    this.recordPlayerAnalyticsEvent(
      eventType,
      client.sessionId,
      player,
      normalizeClientAnalyticsProperties(message.properties),
    );
  }

  private handleAcceptQuest(client: Client, message: Partial<ClientAcceptQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !isQuestAvailable(player, questId)) return;

    const npc = this.state.npcs.get(QUESTS[questId].giverNpcId);
    if (!npc) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;

    startQuest(player, questId);
    this.recordPlayerAnalyticsEvent("quest_accepted", client.sessionId, player, {
      questId,
      npcId: npc.id,
      level: player.level,
    });
    if (questId === "ogre-raid-daily") {
      this.ensureDailyRaidBoss();
    }
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleCompleteQuest(client: Client, message: Partial<ClientCompleteQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId) return;

    const turnInNpcId = getQuestTurnInNpcId(questId);
    const npc = this.state.npcs.get(turnInNpcId);
    if (!npc || distanceToNpc(player, npc) > 3.75) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;
    if (!completeQuest(player, questId, Date.now())) return;
    const xpReward = getPlayerQuestXpReward(player, QUESTS[questId].xpReward);
    awardExperience(player, xpReward);
    void this.awardSeason0QuestReward(client, player, questId);

    this.persistPlayerProgress(client.sessionId, player);

    const nextQuestId = getNextAvailableQuestId(player, questId);
    this.recordPlayerAnalyticsEvent("quest_completed", client.sessionId, player, {
      questId,
      npcId: npc.id,
      xpReward,
      level: player.level,
      nextQuestId: nextQuestId ?? "",
    });
    if (nextQuestId && QUESTS[nextQuestId].giverNpcId === npc.id) {
      client.send("questOffer", makeQuestOffer(nextQuestId, npc));
    }
  }

  private handleLootCorpse(client: Client, message: Partial<ClientLootCorpse>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const npcId = typeof message?.npcId === "string" ? message.npcId : "";
    const npc = this.state.npcs.get(npcId);
    if (!npc || isNpcAlive(npc) || !npcHasLoot(npc)) return;
    if (distanceToNpc(player, npc) > LOOT.interactRange) return;

    const requestedItemId = message?.itemId;
    const itemId = requestedItemId === undefined ? null : normalizeItemId(requestedItemId);
    if (requestedItemId !== undefined && !itemId) return;
    const chainTokenId = normalizeChainTokenId(message?.chainTokenId);
    const requestedLootKey = itemId ? getInventoryItemKey(itemId, chainTokenId) : "";
    if (itemId && !npc.loot.has(requestedLootKey)) return;

    if (itemId) {
      lootCorpseItem(player, npc, itemId, chainTokenId);
    } else {
      const lootItems: Array<{ itemId: ItemId; chainTokenId: string }> = [];
      npc.loot.forEach((item) => lootItems.push({ itemId: item.id, chainTokenId: item.chainTokenId }));
      for (const item of lootItems) {
        lootCorpseItem(player, npc, item.itemId, item.chainTokenId);
      }
    }

    if (npcHasLoot(npc)) {
      client.send("lootWindow", makeLootWindow(npc));
      return;
    }

    npc.hasLoot = false;
    npc.despawnAt = Date.now() + LOOT.lootedDespawnMs;
    npc.respawnAt = npc.id === "raid-ogre-mfer" ? 0 : Math.max(npc.respawnAt, npc.despawnAt + 250);
    client.send("closeLootWindow", { npcId: npc.id });
    this.persistPlayerProgress(client.sessionId, player);
  }

  private ensureDailyRaidBoss() {
    const existing = this.state.npcs.get("raid-ogre-mfer");
    if (existing && isNpcAlive(existing)) return;
    if (existing) this.state.npcs.delete(existing.id);

    spawnNpcFromSpec(this.state.npcs, {
      id: "raid-ogre-mfer",
      name: "too much signal",
      role: "farmer",
      model: "mfer",
      x: 154.5,
      z: -124.5,
      yaw: 2.7,
      leashRadius: 22,
      health: 5200,
      maxHealth: 5200,
      combatStyle: "melee",
      dialogue: "Too much signal shakes the relay hard enough for the whole ridge to hear.",
    });

    this.broadcast("chat", {
      sessionId: "raid-ogre-mfer",
      name: "too much signal",
      identityType: "npc",
      text: "Too much signal has been called to Signal Ridge.",
      sentAt: Date.now(),
    } satisfies ChatMessage);
  }

  private handleSelectTalent(client: Client, message: Partial<ClientSelectTalent>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const talentId = normalizeTalentId(message?.talentId);
    if (!talentId) return;
    if (!rankPlayerTalent(player, talentId)) return;

    recalculatePlayerStats(player);
    this.persistPlayerProgress(client.sessionId, player);
  }

  private handleUpdateTraits(client: Client, message: Partial<ClientUpdateTraits>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const traitsNpc = this.state.npcs.get("traits-mfer");
    const traitQuest = player.quests.get("set-your-traits");
    if (!traitsNpc || distanceToNpc(player, traitsNpc) > LOOT.interactRange || !traitQuest) {
      const existingTraits = parseMferAppearanceTraitsJson(player.appearanceTraitsJson);
      client.send("traitUpdateResult", {
        ok: false,
        traits: existingTraits,
        free: false,
        paid: false,
        error: "talk to traits mfer first",
      });
      return;
    }

    const existingTraits = parseMferAppearanceTraitsJson(player.appearanceTraitsJson);
    const nextTraits = normalizeMferAppearanceTraits(message?.traits, existingTraits);
    if (!hasExplicitMferAppearanceTraits(nextTraits)) {
      client.send("traitUpdateResult", {
        ok: false,
        traits: existingTraits,
        free: false,
        paid: false,
        error: "pick a valid trait set",
      });
      return;
    }

    const isWalletCharacter = player.identityType === "wallet" && Boolean(this.persistentCharacterIds.get(client.sessionId));
    const free = !hasExplicitMferAppearanceTraits(existingTraits);
    const payment = free || !isWalletCharacter ? null : normalizeTraitPaymentProof(message?.payment);
    if (isWalletCharacter && !free && !payment) {
      client.send("traitUpdateResult", {
        ok: false,
        traits: existingTraits,
        free: false,
        paid: false,
        error: "paid trait change required",
      });
      return;
    }

    player.appearanceTraitsJson = serializeMferAppearanceTraits(nextTraits);
    const progressedQuest = progressTraitQuest(player);
    this.recordPlayerAnalyticsEvent("traits_updated", client.sessionId, player, {
      free,
      paid: Boolean(payment),
      paymentToken: payment?.token ?? "",
      chainId: payment?.chainId ?? 0,
      txHash: payment?.txHash ?? "",
      progressedQuest,
    });
    this.persistPlayerProgress(client.sessionId, player);
    client.send("traitUpdateResult", {
      ok: true,
      traits: nextTraits,
      free,
      paid: Boolean(payment),
    });
  }

  private persistPlayerProgress(sessionId: string, player: PlayerState) {
    if (!this.persistentCharacterIds.has(sessionId)) return;
    void this.persistPlayerProgressNow(sessionId, player);
  }

  private persistPlayerProgressIfChanged(sessionId: string, player: PlayerState) {
    const characterId = this.persistentCharacterIds.get(sessionId);
    if (!characterId) return;

    const state = makePersistableCharacterState(characterId, player);
    const fingerprint = getPersistableCharacterStateFingerprint(state);
    if (this.savedCharacterFingerprints.get(characterId) === fingerprint) return;
    if (this.queuedCharacterSaveFingerprints.get(characterId) === fingerprint) return;

    void this.queueCharacterSave(sessionId, characterId, state, fingerprint);
  }

  private async awardSeason0QuestReward(client: Client, player: PlayerState, questId: QuestId) {
    const characterId = this.persistentCharacterIds.get(client.sessionId);
    if (!characterId || player.identityType !== "wallet" || !player.walletAddress) return;

    try {
      const result = await awardSeason0QuestReward({
        characterId,
        walletAddress: player.walletAddress,
        questId,
      });
      player.season0Points = result.seasonTotal;
      player.season0DailyPoints = result.dailyTotal;
      this.recordPlayerAnalyticsEvent("season_points_awarded", client.sessionId, player, {
        questId,
        status: result.status,
        points: result.points,
        dailyTotal: result.dailyTotal,
        seasonTotal: result.seasonTotal,
        label: result.label,
      });
      if (result.status !== "awarded") return;

      client.send("chat", {
        sessionId: "season-0",
        name: "Season 0",
        identityType: "npc",
        text: `Logged ${result.points} tester points for ${result.label}. Daily ${result.dailyTotal}/${SEASON_0_DAILY_POINT_CAP}, season ${result.seasonTotal}/${SEASON_0_TOTAL_POINT_CAP}.`,
        sentAt: Date.now(),
      } satisfies ChatMessage);
    } catch (error) {
      console.error(`Failed to award Season 0 points for ${player.walletAddress}`, error);
    }
  }

  private async persistPlayerProgressNow(sessionId: string, player: PlayerState) {
    const characterId = this.persistentCharacterIds.get(sessionId);
    if (!characterId) return;

    const state = makePersistableCharacterState(characterId, player);
    await this.queueCharacterSave(sessionId, characterId, state);
  }

  private async queueCharacterSave(
    sessionId: string,
    characterId: string,
    state: PersistableCharacterState,
    fingerprint = getPersistableCharacterStateFingerprint(state),
  ) {
    const previous = this.pendingCharacterSaves.get(characterId) ?? Promise.resolve();
    this.queuedCharacterSaveFingerprints.set(characterId, fingerprint);
    this.sendPersistenceStatus(sessionId, "saving", "saving wallet progress");
    let next: Promise<void>;
    next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await saveCharacterProgress(state);
          if (this.pendingCharacterSaves.get(characterId) === next) {
            this.savedCharacterFingerprints.set(characterId, fingerprint);
            this.sendPersistenceStatus(sessionId, "saved", "wallet progress saved");
          }
        } catch (error) {
          this.sendPersistenceStatus(sessionId, "error", "wallet progress failed to save");
          console.error(`Failed to persist character ${characterId}`, error);
        }
      });

    this.pendingCharacterSaves.set(characterId, next);
    next.finally(() => {
      if (this.pendingCharacterSaves.get(characterId) === next) {
        this.pendingCharacterSaves.delete(characterId);
        this.queuedCharacterSaveFingerprints.delete(characterId);
      }
    }).catch(() => undefined);
    await next;
  }

  private autosaveWalletCharacters(now: number) {
    if (now - this.lastCharacterAutosaveAt < CHARACTER_AUTOSAVE_INTERVAL_MS) return;
    this.lastCharacterAutosaveAt = now;
    this.state.players.forEach((player, sessionId) => {
      this.persistPlayerProgressIfChanged(sessionId, player);
    });
  }

  private cleanupCharacterSaveTracking(characterId: string) {
    for (const activeCharacterId of this.persistentCharacterIds.values()) {
      if (activeCharacterId === characterId) return;
    }
    this.pendingCharacterSaves.delete(characterId);
    this.queuedCharacterSaveFingerprints.delete(characterId);
    this.savedCharacterFingerprints.delete(characterId);
  }

  private sendPersistenceStatus(sessionId: string, state: "saving" | "saved" | "error", message: string) {
    const client = this.clients.find((entry) => entry.sessionId === sessionId);
    client?.send("persistenceStatus", { state, message });
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    this.removeExpiredTemporaryNpcs(now);
    this.pruneNpcDamageTags(now);
    this.applyThreatTargets(now);
    updateNpcs(
      this.state.npcs,
      this.state.players,
      delta,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
    processPendingCombatImpacts(
      this.pendingCombatImpacts,
      this.state.players,
      this.state.npcs,
      now,
      (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
      (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
    );

    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId);
      const activeInput = input && now - input.receivedAt < 1000 ? input : null;
      updatePlayerRegen(player, delta, now);
      if (player.health <= 0) {
        if (!this.deadSessionIds.has(sessionId)) {
          this.deadSessionIds.add(sessionId);
          this.recordPlayerAnalyticsEvent("player_death", sessionId, player, {
            level: player.level,
            x: Math.round(player.x),
            z: Math.round(player.z),
          });
        }
        player.verticalVelocity = 0;
        player.animation = "idle";
        clearPlayerEmote(player);
        clearPlayerCast(player);
        return;
      }
      if (player.emote && player.emoteEndsAt > 0 && now >= player.emoteEndsAt) {
        clearPlayerEmote(player);
      }
      if (player.castingAction === "heal") {
        this.updatePlayerHealCast(sessionId, player, activeInput, now);
      } else {
        updatePlayerCast(
          sessionId,
          player,
          activeInput,
          this.state.npcs,
          now,
          (event) => this.broadcast("combatEvent", event),
          this.pendingCombatImpacts,
          (sourceId, npc, defeatedAt) => this.creditNearbyPlayersForNpcDefeat(sourceId, npc, defeatedAt),
          (sourceId, npc, taggedAt) => this.tagNpcForCredit(sourceId, npc, taggedAt),
          (sourceId, npc, threatActionId, amount, threatAt) => this.addNpcThreat(sourceId, npc, threatActionId, amount, threatAt),
        );
      }
      let grounded = player.y <= 0.001;

      if (activeInput?.jump && !this.jumpHeld.get(sessionId) && grounded) {
        player.verticalVelocity = PLAYER.jumpVelocity;
        grounded = false;
      }
      this.jumpHeld.set(sessionId, Boolean(activeInput?.jump));
      if (activeInput?.jump) {
        clearPlayerEmote(player);
      }

      if (!grounded || Math.abs(player.verticalVelocity) > 0.001) {
        player.verticalVelocity -= PLAYER.gravity * delta;
        player.y += player.verticalVelocity * delta;
        if (player.y <= 0) {
          player.y = 0;
          player.verticalVelocity = 0;
          grounded = true;
        }
      }

      if (!activeInput) {
        player.animation = grounded ? "idle" : "jump";
        return;
      }

      const length = Math.hypot(activeInput.x, activeInput.z);
      player.yaw = activeInput.yaw;
      player.lastSeq = activeInput.seq;

      if (length < 0.01) {
        player.animation = grounded ? "idle" : "jump";
        return;
      }

      clearPlayerEmote(player);
      const nx = activeInput.x / length;
      const nz = activeInput.z / length;
      const speed = (activeInput.sprint ? player.runSpeed : player.walkSpeed) * Math.min(length, 1);
      const nextPosition = resolveWorldCollision(
        player.x + nx * speed * delta,
        player.z + nz * speed * delta,
        PLAYER.radius,
      );
      player.x = nextPosition.x;
      player.z = nextPosition.z;
      player.animation = grounded ? (activeInput.sprint ? "run" : "walk") : "jump";
    });
    this.autosaveWalletCharacters(now);
  }

  private creditNearbyPlayersForNpcDefeat(sourceId: string, npc: NpcState, now: number) {
    const mobXp = getNpcDefeatXp(npc);
    const creditedSessionIds = new Set<string>();
    const taggedPlayers = this.npcDamageTags.get(npc.id);

    this.state.players.forEach((player, sessionId) => {
      if (isEligibleForDefeatCredit(player, npc)) creditedSessionIds.add(sessionId);
    });
    if (sourceId) creditedSessionIds.add(sourceId);
    taggedPlayers?.forEach((taggedAt, sessionId) => {
      if (now - taggedAt <= NPC_DAMAGE_TAG_TTL_MS) creditedSessionIds.add(sessionId);
    });

    if (isAnalyticsBossNpc(npc)) {
      const sourcePlayer = this.state.players.get(sourceId);
      this.recordPlayerAnalyticsEvent("boss_defeated", sourceId, sourcePlayer, {
        npcId: npc.id,
        npcName: npc.name,
        creditedPlayers: creditedSessionIds.size,
      });
    }

    for (const sessionId of creditedSessionIds) {
      const player = this.state.players.get(sessionId);
      if (!player || player.health <= 0) continue;
      const questProgressed = progressDefeatQuests(player, npc);
      const award = awardExperience(player, mobXp);
      if (award.xpGained > 0) {
        this.sendExperienceEvent(sessionId, npc, award.xpGained, now);
      }
      if (questProgressed || award.xpGained > 0 || award.levelsGained > 0) {
        this.persistPlayerProgress(sessionId, player);
      }
    }

    this.npcDamageTags.delete(npc.id);
  }

  private recordPlayerAnalyticsEvent(
    eventType: string,
    sessionId: string,
    player: PlayerState | undefined,
    properties: AnalyticsProperties = {},
  ) {
    void recordAnalyticsEvent({
      eventType,
      sessionId,
      characterId: this.persistentCharacterIds.get(sessionId) ?? null,
      identityType: player?.identityType ?? "",
      walletAddress: player?.walletAddress ?? "",
      properties,
    });
  }

  private sendExperienceEvent(sessionId: string, npc: NpcState, amount: number, now: number) {
    const client = this.clients.find((entry) => entry.sessionId === sessionId);
    if (!client) return;

    const payload: ExperienceEvent = {
      id: `${now}:${sessionId}:${npc.id}:xp:${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      sourceNpcId: npc.id,
      amount,
      x: npc.x,
      y: npc.y + 1.35,
      z: npc.z,
      sentAt: now,
    };
    client.send("experienceEvent", payload);
  }

  private tagNpcForCredit(sourceId: string, npc: NpcState, now: number) {
    if (!sourceId || npc.isImmortal || npc.health <= 0) return;

    const taggedPlayers = this.npcDamageTags.get(npc.id) ?? new Map<string, number>();
    taggedPlayers.set(sourceId, now);
    this.npcDamageTags.set(npc.id, taggedPlayers);
  }

  private pruneNpcDamageTags(now: number) {
    for (const [npcId, taggedPlayers] of this.npcDamageTags) {
      for (const [sessionId, taggedAt] of taggedPlayers) {
        if (now - taggedAt > NPC_DAMAGE_TAG_TTL_MS) taggedPlayers.delete(sessionId);
      }
      if (taggedPlayers.size === 0 || !this.state.npcs.has(npcId)) {
        this.npcDamageTags.delete(npcId);
      }
    }
  }

  private removeExpiredTemporaryNpcs(now: number) {
    for (const [npcId, expiresAt] of this.temporaryNpcExpiresAt) {
      const npc = this.state.npcs.get(npcId);
      if (!npc) {
        this.temporaryNpcExpiresAt.delete(npcId);
        continue;
      }

      const defeatedAndDespawned = !isNpcAlive(npc) && npc.despawnAt > 0 && now >= npc.despawnAt;
      if (now < expiresAt && !defeatedAndDespawned) continue;

      this.state.npcs.delete(npcId);
      this.temporaryNpcExpiresAt.delete(npcId);
    }
  }

  private logMferGptCommand(
    sessionId: string,
    playerName: string,
    command: MferGptCommand,
    accepted: boolean,
    reason: string,
    latencyMs: number,
    temporaryNpcIds: string[],
  ) {
    console.info("mfergpt.command", {
      sessionId,
      playerName,
      command,
      accepted,
      reason,
      latencyMs,
      temporaryNpcIds,
    });
  }
}

function makeMferGptChatMessage(text: string, sentAt: number): ChatMessage {
  return {
    sessionId: MFERGPT.npcId,
    name: "mferGPT",
    identityType: "npc",
    text,
    sentAt,
  };
}

function makeSystemChat(name: string, text: string): ChatMessage {
  return {
    sessionId: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
    name,
    identityType: "npc",
    text,
    sentAt: Date.now(),
  };
}

function isEligibleForDefeatCredit(player: PlayerState, npc: NpcState) {
  if (player.health <= 0) return false;
  const radius = npc.id === "raid-ogre-mfer" ? 38 : PROGRESSION.nearbyCreditRadius;
  return Math.hypot(player.x - npc.x, player.z - npc.z) <= radius;
}

async function loadPersistedCharacter(walletAddress: string, name: string, avatarSeed: number, createIfMissing: boolean) {
  try {
    return await loadOrCreateWalletCharacter({
      walletAddress,
      displayName: name,
      avatarSeed,
      createIfMissing,
    });
  } catch (error) {
    console.error(`Failed to load persisted character for ${walletAddress}`, error);
    if (error instanceof PersistenceUnavailableError) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "wallet persistence unavailable");
    }
    throw new ServerError(ErrorCode.AUTH_FAILED, "wallet persistence failed");
  }
}

function applyPersistedCharacter(player: PlayerState, character: PersistedCharacter) {
  player.quests.clear();
  for (const savedQuest of character.quests) {
    const quest = new QuestState();
    quest.id = savedQuest.id;
    quest.status = savedQuest.status;
    quest.progress = savedQuest.progress;
    quest.required = savedQuest.required;
    quest.flags = savedQuest.flags;
    quest.completedAt = savedQuest.completedAt;
    player.quests.set(savedQuest.id, quest);
  }

  player.inventory.clear();
  for (const savedItem of character.inventory) {
    const item = new InventoryItemState();
    item.id = savedItem.id;
    item.chainTokenId = normalizeChainTokenId(savedItem.chainTokenId);
    item.chainTier = normalizeChainGearTier(savedItem.chainTier);
    item.count = savedItem.count;
    player.inventory.set(getInventoryItemKey(savedItem.id, item.chainTokenId), item);
  }

  player.equipment.clear();
  for (const savedSlot of character.equipment) {
    const slot = new EquipmentSlotState();
    slot.slot = savedSlot.slot;
    slot.itemId = savedSlot.itemId;
    slot.chainTokenId = normalizeChainTokenId(savedSlot.chainTokenId);
    slot.chainTier = normalizeChainGearTier(savedSlot.chainTier);
    player.equipment.set(savedSlot.slot, slot);
  }

  player.talents.clear();
  for (const savedTalent of character.talents) {
    const talent = new TalentState();
    talent.id = savedTalent.id;
    talent.tree = savedTalent.tree;
    talent.nodeId = savedTalent.nodeId;
    talent.rank = savedTalent.rank;
    player.talents.set(savedTalent.id, talent);
  }
}

function applySavedDebugNpcPlacements(npcs: TownState["npcs"], placements: Record<string, DebugPlacementRecord>) {
  for (const [id, placement] of Object.entries(placements)) {
    if (!id.startsWith("npc:")) continue;
    const npc = npcs.get(id.slice("npc:".length));
    if (!npc) continue;
    npc.x = placement.x;
    npc.y = 0;
    npc.z = placement.z;
    npc.yaw = placement.rotation;
    npc.homeX = placement.x;
    npc.homeZ = placement.z;
    npc.targetX = placement.x;
    npc.targetZ = placement.z;
  }
}

function filterWorldDebugPlacements(placements: Record<string, DebugPlacementRecord>) {
  const worldPlacements: Record<string, DebugPlacementRecord> = {};
  for (const [id, placement] of Object.entries(placements)) {
    if (!id.startsWith("npc:")) worldPlacements[id] = placement;
  }
  return worldPlacements;
}

function normalizePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeDebugNpcRole(value: unknown) {
  if (
    value === "wanderer"
    || value === "quest_giver"
    || value === "merchant"
    || value === "guard"
    || value === "enemy"
    || value === "critter"
    || value === "beast"
    || value === "farmer"
  ) {
    return value;
  }
  return "farmer";
}

function normalizeDebugNpcModel(value: unknown) {
  if (
    value === "mfer"
    || value === "mfergpt"
    || value === "rabbit"
    || value === "deer"
    || value === "hog"
    || value === "training-dummy"
  ) {
    return value;
  }
  return "mfer";
}

function normalizeDebugNpcCombatStyle(value: unknown) {
  if (value === "melee" || value === "caster") return value;
  return "melee";
}

export async function readDebugPlacementMap() {
  try {
    const text = await readFile(DEBUG_PLACEMENT_MAP_PATH, "utf8");
    const document = JSON.parse(text) as { placements?: unknown; sourceDefaults?: unknown };
    return {
      placements: normalizeDebugPlacementRecordMap(document.placements),
      sourceDefaults: normalizeDebugPlacementRecordMap(document.sourceDefaults),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { placements: {}, sourceDefaults: {} };
    }
    console.warn("debug_placement_map_load_failed", error);
    return { placements: {}, sourceDefaults: {} };
  }
}

function normalizeDebugPlacementRecordMap(value: unknown) {
  const records: Record<string, DebugPlacementRecord> = {};
  if (!value || typeof value !== "object") return records;
  for (const [id, rawRecord] of Object.entries(value as Record<string, unknown>)) {
    const record = normalizeDebugPlacementRecord(rawRecord);
    if (!record) continue;
    records[id] = record;
  }
  return records;
}

function normalizeDebugPlacementRecord(value: unknown): DebugPlacementRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const z = Number(record.z);
  const rotation = Number(record.rotation);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) return null;
  return {
    x: Math.round(x * 10) / 10,
    z: Math.round(z * 10) / 10,
    rotation,
    ...(typeof record.kind === "string" ? { kind: record.kind.slice(0, 32) } : {}),
    ...(typeof record.label === "string" ? { label: record.label.slice(0, 160) } : {}),
    ...(typeof record.source === "string" ? { source: record.source.slice(0, 160) } : {}),
  };
}

function normalizeDebugPlacementSaveId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return "";
  return /^[a-z0-9:_-]+$/i.test(trimmed) ? trimmed : "";
}

function normalizeDebugPlacementChunkNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function normalizeClientAnalyticsProperties(value: unknown): AnalyticsProperties {
  const properties: AnalyticsProperties = {};
  if (!value || typeof value !== "object") return properties;

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/.test(key)) continue;
    if (typeof rawValue === "string") {
      properties[key] = rawValue.slice(0, 160);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      properties[key] = rawValue;
    } else if (typeof rawValue === "boolean" || rawValue === null) {
      properties[key] = rawValue;
    }
  }

  return properties;
}

function normalizeTraitPaymentProof(value: unknown): ClientUpdateTraits["payment"] | null {
  if (!value || typeof value !== "object") return null;
  const proof = value as Record<string, unknown>;
  const token = proof.token === "ETH" || proof.token === "MFER" || proof.token === "MFERGPT" ? proof.token : "";
  if (!token) return null;

  const txHash = typeof proof.txHash === "string" ? proof.txHash.toLowerCase() : "";
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) return null;

  const expectedAmountWei = TRAIT_CHANGE_PRICES_WEI[token];
  const amountWei = typeof proof.amountWei === "string" ? proof.amountWei : "";
  if (amountWei !== expectedAmountWei) return null;

  const chainId = Number(proof.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;

  const contractAddress = typeof proof.contractAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(proof.contractAddress)
    ? proof.contractAddress.toLowerCase()
    : "";

  return {
    token,
    txHash,
    amountWei,
    chainId,
    ...(contractAddress ? { contractAddress } : {}),
  };
}

function isAnalyticsBossNpc(npc: NpcState) {
  return npc.id === "static-baron-nox" || npc.id === "raid-ogre-mfer";
}

function normalizeEmoteId(value: unknown): EmoteId | null {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(EMOTES, value) ? value as EmoteId : null;
}

function clearPlayerEmote(player: PlayerState) {
  player.emote = "";
  player.emoteStartedAt = 0;
  player.emoteEndsAt = 0;
}

function makePersistableCharacterState(characterId: string, player: PlayerState): PersistableCharacterState {
  const quests: PersistableCharacterState["quests"] = [];
  player.quests.forEach((quest, id) => {
    quests.push({
      id: (quest.id || id) as QuestId,
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });

  const inventory: PersistableCharacterState["inventory"] = [];
  player.inventory.forEach((item, id) => {
    inventory.push({
      id: (item.id || id) as ItemId,
      chainTokenId: normalizeChainTokenId(item.chainTokenId),
      chainTier: normalizeChainGearTier(item.chainTier),
      count: item.count,
    });
  });

  const equipment: PersistableCharacterState["equipment"] = [];
  player.equipment.forEach((slot, id) => {
    equipment.push({
      slot: (slot.slot || id) as PersistableCharacterState["equipment"][number]["slot"],
      itemId: slot.itemId,
      chainTokenId: normalizeChainTokenId(slot.chainTokenId),
      chainTier: normalizeChainGearTier(slot.chainTier),
    });
  });

  const talents = getPlayerTalentRanks(player);

  return {
    characterId,
    name: player.name,
    avatarSeed: player.avatarSeed,
    appearanceTraits: parseMferAppearanceTraitsJson(player.appearanceTraitsJson),
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    quests,
    inventory,
    equipment,
    talents,
  };
}

function getPersistableCharacterStateFingerprint(state: PersistableCharacterState) {
  return JSON.stringify(state);
}

function snapshotPlayers({
  players,
  persistentCharacterIds,
  sessionJoinedAt,
  inputs,
  lastChatAt,
  lastInteractAt,
  deadSessionIds,
  now,
}: {
  players: TownState["players"];
  persistentCharacterIds: Map<string, string>;
  sessionJoinedAt: Map<string, number>;
  inputs: Map<string, TrackedInput>;
  lastChatAt: Map<string, number>;
  lastInteractAt: Map<string, number>;
  deadSessionIds: Set<string>;
  now: number;
}) {
  const snapshots: AdminPlayerSnapshot[] = [];
  players.forEach((player, sessionId) => {
    const joinedAt = sessionJoinedAt.get(sessionId) ?? 0;
    const quests = snapshotQuests(player.quests);
    snapshots.push({
      sessionId,
      characterId: persistentCharacterIds.get(sessionId) ?? "",
      name: player.name,
      identityType: player.identityType,
      walletAddress: player.walletAddress,
      avatarSeed: player.avatarSeed,
      status: player.health <= 0 || deadSessionIds.has(sessionId) ? "dead" : "online",
      joinedAt,
      onlineForMs: joinedAt > 0 ? Math.max(0, now - joinedAt) : 0,
      lastInputAt: inputs.get(sessionId)?.receivedAt ?? 0,
      lastChatAt: lastChatAt.get(sessionId) ?? 0,
      lastInteractAt: lastInteractAt.get(sessionId) ?? 0,
      position: {
        x: roundAdminNumber(player.x),
        y: roundAdminNumber(player.y),
        z: roundAdminNumber(player.z),
        yaw: roundAdminNumber(player.yaw),
      },
      animation: player.animation,
      level: player.level,
      xp: player.xp,
      talentPoints: player.talentPoints,
      season0Points: player.season0Points,
      season0DailyPoints: player.season0DailyPoints,
      health: roundAdminNumber(player.health),
      maxHealth: roundAdminNumber(player.maxHealth),
      mana: roundAdminNumber(player.mana),
      maxMana: roundAdminNumber(player.maxMana),
      healthRegenPer5: roundAdminNumber(player.healthRegenPer5),
      manaRegenPer5: roundAdminNumber(player.manaRegenPer5),
      walkSpeed: roundAdminNumber(player.walkSpeed),
      runSpeed: roundAdminNumber(player.runSpeed),
      strength: roundAdminNumber(player.strength),
      dexterity: roundAdminNumber(player.dexterity),
      magic: roundAdminNumber(player.magic),
      castingAction: player.castingAction,
      castTargetKind: player.castTargetKind,
      castTargetId: player.castTargetId,
      lastDamagedAt: player.lastDamagedAt,
      quests,
      questCounts: countAdminQuests(quests),
      inventory: snapshotInventory(player.inventory),
      equipment: snapshotEquipment(player.equipment),
      talents: snapshotTalents(player.talents),
    });
  });
  return snapshots.sort((a, b) => a.name.localeCompare(b.name));
}

function snapshotNpcs(npcs: TownState["npcs"]) {
  const snapshots: AdminNpcSnapshot[] = [];
  npcs.forEach((npc) => {
    snapshots.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      model: npc.model,
      health: roundAdminNumber(npc.health),
      maxHealth: roundAdminNumber(npc.maxHealth),
      isImmortal: npc.isImmortal,
      alive: npc.health > 0 && npc.defeatedAt <= 0,
      position: {
        x: roundAdminNumber(npc.x),
        y: roundAdminNumber(npc.y),
        z: roundAdminNumber(npc.z),
        yaw: roundAdminNumber(npc.yaw),
      },
      animation: npc.animation,
      questId: npc.questId,
      aggroTargetId: npc.aggroTargetId,
      combatStyle: npc.combatStyle,
      hasLoot: npc.hasLoot,
      loot: snapshotInventory(npc.loot),
      defeatedAt: npc.defeatedAt,
      respawnAt: npc.respawnAt,
      despawnAt: npc.despawnAt,
      frozenUntil: npc.frozenUntil,
      slowedUntil: npc.slowedUntil,
    });
  });
  return snapshots.sort((a, b) => a.id.localeCompare(b.id));
}

function snapshotQuests(quests: PlayerState["quests"]) {
  const snapshots: AdminQuestSnapshot[] = [];
  quests.forEach((quest, key) => {
    snapshots.push({
      id: (quest.id || key) as QuestId,
      status: quest.status,
      progress: quest.progress,
      required: quest.required,
      flags: quest.flags,
      completedAt: quest.completedAt,
    });
  });
  return snapshots.sort((a, b) => {
    const statusOrder = questStatusOrder(a.status) - questStatusOrder(b.status);
    return statusOrder || a.id.localeCompare(b.id);
  });
}

function countAdminQuests(quests: AdminQuestSnapshot[]) {
  const counts: Record<AdminQuestSnapshot["status"], number> = {
    active: 0,
    ready: 0,
    completed: 0,
  };
  for (const quest of quests) counts[quest.status] += 1;
  return counts;
}

function questStatusOrder(status: AdminQuestSnapshot["status"]) {
  switch (status) {
    case "ready":
      return 0;
    case "active":
      return 1;
    case "completed":
      return 2;
  }
}

function snapshotInventory(items: PlayerState["inventory"] | NpcState["loot"]) {
  const snapshots: AdminInventoryItemSnapshot[] = [];
  items.forEach((item, key) => {
    const chainTier = "chainTier" in item && typeof item.chainTier === "number" ? item.chainTier : 1;
    snapshots.push({
      key,
      id: item.id,
      chainTokenId: normalizeChainTokenId(item.chainTokenId),
      chainTier: normalizeChainGearTier(chainTier),
      count: item.count,
    });
  });
  return snapshots.sort((a, b) => a.id.localeCompare(b.id) || a.chainTokenId.localeCompare(b.chainTokenId));
}

function snapshotEquipment(equipment: PlayerState["equipment"]) {
  const snapshots: AdminEquipmentSlotSnapshot[] = [];
  equipment.forEach((slot, key) => {
    snapshots.push({
      slot: slot.slot || key,
      itemId: slot.itemId,
      chainTokenId: normalizeChainTokenId(slot.chainTokenId),
      chainTier: normalizeChainGearTier(slot.chainTier),
    });
  });
  return snapshots.sort((a, b) => a.slot.localeCompare(b.slot));
}

function snapshotTalents(talents: PlayerState["talents"]) {
  const snapshots: AdminTalentSnapshot[] = [];
  talents.forEach((talent, key) => {
    snapshots.push({
      id: talent.id || key,
      tree: talent.tree,
      nodeId: talent.nodeId,
      rank: talent.rank,
    });
  });
  return snapshots.sort((a, b) => a.tree.localeCompare(b.tree) || a.nodeId.localeCompare(b.nodeId));
}

function roundAdminNumber(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

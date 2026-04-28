import { Room, type Client } from "colyseus";
import {
  CHAT,
  LOOT,
  MAX_PLAYERS,
  MFERGPT,
  PLAYER,
  PROGRESSION,
  QUESTS,
  SERVER_TICK_RATE,
  clamp,
  getInventoryItemKey,
  getQuestTurnInNpcId,
  normalizeChainTokenId,
  resolveWorldCollision,
  stableHash,
  sanitizePlayerName,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCompleteQuest,
  type ClientCombatAction,
  type ClientEquipItem,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type ClientSelectTalent,
  type ClientUnequipItem,
  type ExperienceEvent,
  type IdentityType,
  type ItemId,
  type JoinOptions,
  type QuestId,
} from "@mferland/shared";
import { EquipmentSlotState, InventoryItemState, PlayerState, QuestState, TalentState, TownState, type NpcState } from "../state.js";
import type { TrackedInput } from "../types.js";
import {
  loadOrCreateWalletCharacter,
  saveCharacterProgress,
  type PersistableCharacterState,
  type PersistedCharacter,
} from "../persistence.js";
import {
  aggroNeutralNpcOnPlayerAttackStart,
  applyCombatDamage,
  applyFrostNova,
  clearPlayerCast,
  findCombatTarget,
  getActionReadyAt,
  getPlayerActionDamage,
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
import {
  equipInventoryItem,
  initializeCharacterEquipment,
  normalizeEquipmentSlotId,
  recalculatePlayerStats,
  unequipPlayerSlot,
} from "../systems/equipment.js";
import { findInteractNpc } from "../systems/interactions.js";
import { lootCorpseItem, makeLootWindow, normalizeItemId, npcHasLoot } from "../systems/loot.js";
import { getMferGptPrompt, handleMferGptPrompt, type MferGptCommand } from "../systems/mfergpt.js";
import { spawnNpcFromSpec, spawnNpcs, updateNpcs } from "../systems/npcs.js";
import {
  completeQuest,
  getNpcDialogue,
  getNextAvailableQuestId,
  getNpcQuestInteraction,
  isQuestAvailable,
  makeQuestOffer,
  normalizeQuestId,
  startQuest,
  progressDefeatQuests,
} from "../systems/quests.js";
import { awardExperience, getNpcDefeatXp, normalizePlayerProgression } from "../systems/progression.js";
import { distanceToNpc } from "../systems/spatial.js";
import {
  getPlayerActionConfig,
  getPlayerQuestXpReward,
  getPlayerTalentRanks,
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

export class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastMferGptAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();
  private readonly persistentCharacterIds = new Map<string, string>();
  private readonly pendingCombatImpacts: PendingCombatImpact[] = [];
  private readonly temporaryNpcExpiresAt = new Map<string, number>();
  private readonly npcDamageTags = new Map<string, Map<string, number>>();

  onCreate() {
    this.setState(new TownState());
    spawnNpcs(this.state.npcs);
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

    this.onMessage("lootCorpse", (client, message: Partial<ClientLootCorpse>) => {
      this.handleLootCorpse(client, message);
    });

    this.onMessage("equipItem", (client, message: Partial<ClientEquipItem>) => {
      this.handleEquipItem(client, message);
    });

    this.onMessage("unequipItem", (client, message: Partial<ClientUnequipItem>) => {
      this.handleUnequipItem(client, message);
    });

    this.onMessage("selectTalent", (client, message: Partial<ClientSelectTalent>) => {
      this.handleSelectTalent(client, message);
    });

    this.onMessage("respawn", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health > 0) return;
      respawnPlayerAtFountain(player);
      this.inputs.delete(client.sessionId);
      this.jumpHeld.set(client.sessionId, false);
    });

    this.onMessage("chat", (client, message: { text?: string }) => {
      void this.handleChatMessage(client, message);
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
    const walletAddress =
      typeof options?.walletAddress === "string" ? options.walletAddress.toLowerCase().slice(0, 64) : "";
    const identityType = getIdentityType(options, walletAddress);
    const defaultName = getDefaultName(identityType, walletAddress, client.sessionId);
    const name = sanitizePlayerName(options?.name, defaultName);
    const avatarSeed = Number.isFinite(options?.avatarSeed)
      ? Number(options?.avatarSeed)
      : stableHash(`${client.sessionId}:${name}:${walletAddress}`);
    const persistedCharacter = identityType === "wallet" && walletAddress
      ? await loadPersistedCharacter(walletAddress, name, avatarSeed)
      : null;

    player.name = persistedCharacter?.name ?? name;
    player.identityType = identityType;
    player.walletAddress = walletAddress;
    player.avatarSeed = persistedCharacter?.avatarSeed ?? avatarSeed;
    player.level = persistedCharacter?.level ?? 1;
    player.xp = persistedCharacter?.xp ?? 0;
    player.talentPoints = persistedCharacter?.talentPoints ?? 0;
    normalizePlayerProgression(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.x = spawn.x;
    player.y = 0;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    if (persistedCharacter) {
      applyPersistedCharacter(player, persistedCharacter);
      this.persistentCharacterIds.set(client.sessionId, persistedCharacter.characterId);
    }
    normalizePlayerTalents(player);
    initializeCharacterEquipment(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;

    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) await this.persistPlayerProgressNow(client.sessionId, player);
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.jumpHeld.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastMferGptAt.delete(client.sessionId);
    this.lastInteractAt.delete(client.sessionId);
    this.persistentCharacterIds.delete(client.sessionId);
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

    const prompt = getMferGptPrompt(text);
    if (!prompt) return;

    const lastMferGpt = this.lastMferGptAt.get(client.sessionId) ?? 0;
    if (now - lastMferGpt < MFERGPT.commandCooldownMs) {
      const waitSeconds = Math.ceil((MFERGPT.commandCooldownMs - (now - lastMferGpt)) / 1000);
      client.send("chat", makeMferGptChatMessage(`Signal cooling down. Try @mfergpt again in ${waitSeconds}s.`, Date.now()));
      this.logMferGptCommand(client.sessionId, player.name, "chat", false, "cooldown", 0, []);
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
    } catch (error) {
      client.send("chat", makeMferGptChatMessage("mferGPT hit static. Try a simpler prompt in a moment.", Date.now()));
      console.error("mfergpt.command_failed", {
        sessionId: client.sessionId,
        playerName: player.name,
        latencyMs: Date.now() - startedAt,
        error,
      });
    }
  }

  private handleCombatAction(client: Client, message: Partial<ClientCombatAction>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.health <= 0) return;

    const actionId = normalizeCombatActionId(message?.actionId);
    if (!actionId) return;

    const action = getPlayerActionConfig(player, actionId);
    const now = Date.now();
    if (player.castingAction) return;
    if (getActionReadyAt(player, actionId) > now) return;
    if (action.manaCost > 0 && player.mana < action.manaCost) return;
    if (action.requiresStationary && !isPlayerStationary(player, this.inputs.get(client.sessionId), now)) return;

    if (actionId === "frostNova") {
      setActionReadyAt(player, actionId, now + action.cooldownMs);
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
      );
      return;
    }

    const target = findCombatTarget(this.state.npcs, message?.target);
    if (!target) return;
    if (!isNpcAlive(target)) return;

    const distance = distanceToNpc(player, target);
    if (distance < action.minRange || distance > action.maxRange) return;

    player.yaw = Math.atan2(target.x - player.x, target.z - player.z);

    if (action.castTimeMs > 0) {
      player.lastCastAt = now;
      player.castingAction = actionId;
      player.castStartedAt = now;
      player.castEndsAt = now + action.castTimeMs;
      player.castTargetKind = "npc";
      player.castTargetId = target.id;
      return;
    }

    setActionReadyAt(player, actionId, now + action.cooldownMs);
    player.lastCastAt = now;
    const damage = getPlayerActionDamage(player, actionId);
    aggroNeutralNpcOnPlayerAttackStart(target, client.sessionId, player);
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
    );
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

  private handleAcceptQuest(client: Client, message: Partial<ClientAcceptQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !isQuestAvailable(player, questId)) return;

    const npc = this.state.npcs.get(QUESTS[questId].giverNpcId);
    if (!npc || distanceToNpc(player, npc) > 3.75) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;

    startQuest(player, questId);
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
    awardExperience(player, getPlayerQuestXpReward(player, QUESTS[questId].xpReward));

    this.persistPlayerProgress(client.sessionId, player);

    const nextQuestId = getNextAvailableQuestId(player, questId);
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
      name: "Huge mfer ogre",
      role: "farmer",
      model: "mfer",
      x: 154.5,
      z: -124.5,
      yaw: 2.7,
      leashRadius: 22,
      health: 5200,
      maxHealth: 5200,
      combatStyle: "melee",
      dialogue: "The huge mfer ogre shakes the relay hard enough for the whole ridge to hear.",
    });

    this.broadcast("chat", {
      sessionId: "raid-ogre-mfer",
      name: "Huge mfer ogre",
      identityType: "npc",
      text: "A huge mfer ogre has been called to Signal Ridge.",
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

  private persistPlayerProgress(sessionId: string, player: PlayerState) {
    if (!this.persistentCharacterIds.has(sessionId)) return;
    void this.persistPlayerProgressNow(sessionId, player);
  }

  private async persistPlayerProgressNow(sessionId: string, player: PlayerState) {
    const characterId = this.persistentCharacterIds.get(sessionId);
    if (!characterId) return;

    try {
      await saveCharacterProgress(makePersistableCharacterState(characterId, player));
    } catch (error) {
      console.error(`Failed to persist character ${characterId}`, error);
    }
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    this.removeExpiredTemporaryNpcs(now);
    this.pruneNpcDamageTags(now);
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
        player.verticalVelocity = 0;
        player.animation = "idle";
        clearPlayerCast(player);
        return;
      }
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
      );
      let grounded = player.y <= 0.001;

      if (activeInput?.jump && !this.jumpHeld.get(sessionId) && grounded) {
        player.verticalVelocity = PLAYER.jumpVelocity;
        grounded = false;
      }
      this.jumpHeld.set(sessionId, Boolean(activeInput?.jump));

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

      const nx = activeInput.x / length;
      const nz = activeInput.z / length;
      const speed = activeInput.sprint ? player.runSpeed : player.walkSpeed;
      const nextPosition = resolveWorldCollision(
        player.x + nx * speed * delta,
        player.z + nz * speed * delta,
        PLAYER.radius,
      );
      player.x = nextPosition.x;
      player.z = nextPosition.z;
      player.animation = grounded ? (activeInput.sprint ? "run" : "walk") : "jump";
    });
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

function isEligibleForDefeatCredit(player: PlayerState, npc: NpcState) {
  if (player.health <= 0) return false;
  const radius = npc.id === "raid-ogre-mfer" ? 38 : PROGRESSION.nearbyCreditRadius;
  return Math.hypot(player.x - npc.x, player.z - npc.z) <= radius;
}

async function loadPersistedCharacter(walletAddress: string, name: string, avatarSeed: number) {
  try {
    return await loadOrCreateWalletCharacter({ walletAddress, displayName: name, avatarSeed });
  } catch (error) {
    console.error(`Failed to load persisted character for ${walletAddress}`, error);
    return null;
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
    item.count = savedItem.count;
    player.inventory.set(getInventoryItemKey(savedItem.id, item.chainTokenId), item);
  }

  player.equipment.clear();
  for (const savedSlot of character.equipment) {
    const slot = new EquipmentSlotState();
    slot.slot = savedSlot.slot;
    slot.itemId = savedSlot.itemId;
    slot.chainTokenId = normalizeChainTokenId(savedSlot.chainTokenId);
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
      count: item.count,
    });
  });

  const equipment: PersistableCharacterState["equipment"] = [];
  player.equipment.forEach((slot, id) => {
    equipment.push({
      slot: (slot.slot || id) as PersistableCharacterState["equipment"][number]["slot"],
      itemId: slot.itemId,
      chainTokenId: normalizeChainTokenId(slot.chainTokenId),
    });
  });

  const talents = getPlayerTalentRanks(player);

  return {
    characterId,
    name: player.name,
    avatarSeed: player.avatarSeed,
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    quests,
    inventory,
    equipment,
    talents,
  };
}

import { Room, type Client } from "colyseus";
import {
  CHAT,
  COMBAT,
  LOOT,
  MAX_PLAYERS,
  PLAYER,
  QUESTS,
  SERVER_TICK_RATE,
  clamp,
  resolveWorldCollision,
  stableHash,
  sanitizePlayerName,
  type ChatMessage,
  type ClientAcceptQuest,
  type ClientCombatAction,
  type ClientInteract,
  type ClientInput,
  type ClientLootCorpse,
  type IdentityType,
  type ItemId,
  type JoinOptions,
} from "@mferland/shared";
import { PlayerState, TownState } from "../state.js";
import type { TrackedInput } from "../types.js";
import {
  aggroNeutralNpcOnPlayerAttackStart,
  applyCombatDamage,
  applyFrostNova,
  clearPlayerCast,
  findCombatTarget,
  getActionReadyAt,
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
import { findInteractNpc } from "../systems/interactions.js";
import { lootCorpseItem, makeLootWindow, normalizeItemId, npcHasLoot } from "../systems/loot.js";
import { spawnNpcs, updateNpcs } from "../systems/npcs.js";
import {
  getNpcDialogue,
  isQuestAvailable,
  makeQuestOffer,
  normalizeQuestId,
  startQuest,
} from "../systems/quests.js";
import { distanceToNpc } from "../systems/spatial.js";
import {
  getDefaultName,
  getIdentityType,
  getSpawnPoint,
  normalizeInput,
  sanitizeChatText,
} from "../systems/utils.js";

export class TownRoom extends Room<TownState> {
  maxClients = MAX_PLAYERS;

  private readonly inputs = new Map<string, TrackedInput>();
  private readonly jumpHeld = new Map<string, boolean>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastInteractAt = new Map<string, number>();
  private readonly pendingCombatImpacts: PendingCombatImpact[] = [];

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

    this.onMessage("lootCorpse", (client, message: Partial<ClientLootCorpse>) => {
      this.handleLootCorpse(client, message);
    });

    this.onMessage("respawn", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health > 0) return;
      respawnPlayerAtFountain(player);
      this.inputs.delete(client.sessionId);
      this.jumpHeld.set(client.sessionId, false);
    });

    this.onMessage("chat", (client, message: { text?: string }) => {
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

      const payload: ChatMessage = {
        sessionId: npc.id,
        name: npc.name,
        identityType: "npc",
        text: getNpcDialogue(npc, player, now, (questId) => client.send("questOffer", makeQuestOffer(questId, npc))),
        sentAt: now,
      };
      this.broadcast("chat", payload);
    });
  }

  onJoin(client: Client, options?: JoinOptions) {
    const player = new PlayerState();
    const spawn = getSpawnPoint(this.state.players.size);
    const walletAddress =
      typeof options?.walletAddress === "string" ? options.walletAddress.toLowerCase().slice(0, 64) : "";
    const identityType = getIdentityType(options, walletAddress);
    const defaultName = getDefaultName(identityType, walletAddress, client.sessionId);

    player.name = sanitizePlayerName(options?.name, defaultName);
    player.identityType = identityType;
    player.walletAddress = walletAddress;
    player.avatarSeed = Number.isFinite(options?.avatarSeed)
      ? Number(options?.avatarSeed)
      : stableHash(`${client.sessionId}:${player.name}:${walletAddress}`);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.x = spawn.x;
    player.y = 0;
    player.z = spawn.z;
    player.yaw = spawn.yaw;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.jumpHeld.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastInteractAt.delete(client.sessionId);
  }

  private handleCombatAction(client: Client, message: Partial<ClientCombatAction>) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.health <= 0) return;

    const actionId = normalizeCombatActionId(message?.actionId);
    if (!actionId) return;

    const action = COMBAT.actions[actionId];
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
    aggroNeutralNpcOnPlayerAttackStart(target, client.sessionId, player);
    applyCombatDamage(
      client.sessionId,
      player,
      target,
      actionId,
      action.damage,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
  }

  private handleAcceptQuest(client: Client, message: Partial<ClientAcceptQuest>) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    const questId = normalizeQuestId(message?.questId);
    if (!questId || !isQuestAvailable(player, questId)) return;

    const npc = this.state.npcs.get(QUESTS[questId].giverNpcId);
    if (!npc || distanceToNpc(player, npc) > 3.75) return;
    if (typeof message?.npcId === "string" && message.npcId !== npc.id) return;

    const now = Date.now();
    startQuest(player, questId);
    this.broadcast("chat", {
      sessionId: npc.id,
      name: npc.name,
      identityType: "npc",
      text: `${player.name}, quest accepted: ${QUESTS[questId].title}.`,
      sentAt: now,
    } satisfies ChatMessage);
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
    if (itemId && !npc.loot.has(itemId)) return;

    if (itemId) {
      lootCorpseItem(player, npc, itemId);
    } else {
      const itemIds: ItemId[] = [];
      npc.loot.forEach((item) => itemIds.push(item.id));
      for (const nextItemId of itemIds) {
        lootCorpseItem(player, npc, nextItemId);
      }
    }

    if (npcHasLoot(npc)) {
      client.send("lootWindow", makeLootWindow(npc));
      return;
    }

    npc.hasLoot = false;
    npc.despawnAt = Date.now() + LOOT.lootedDespawnMs;
    npc.respawnAt = Math.max(npc.respawnAt, npc.despawnAt + 250);
    client.send("closeLootWindow", { npcId: npc.id });
  }

  private update(dt: number) {
    const delta = Math.min(dt, 0.1);
    const now = Date.now();
    updateNpcs(
      this.state.npcs,
      this.state.players,
      delta,
      now,
      (event) => this.broadcast("combatEvent", event),
      this.pendingCombatImpacts,
    );
    processPendingCombatImpacts(this.pendingCombatImpacts, this.state.players, this.state.npcs, now);

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
      const speed = activeInput.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
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
}

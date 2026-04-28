import { type MapSchema } from "@colyseus/schema";
import {
  COMBAT,
  FARMER_COMBAT,
  RESPAWN_POINT,
  clamp,
  isAttackableNpcRole,
  type CombatActionId,
  type CombatEvent,
} from "@mferland/shared";
import type { NpcState, PlayerState } from "../state.js";
import type { TrackedInput } from "../types.js";
import { populateCorpseLoot } from "./loot.js";
import { distanceToNpc } from "./spatial.js";
import { getPlayerActionConfig } from "./talents.js";

export type PendingCombatImpact = {
  target: CombatEvent["target"];
  sourcePlayerId?: string;
  damage: number;
  impactAt: number;
};

export type NpcDefeatCreditHandler = (sourceId: string, npc: NpcState, now: number) => void;

export function normalizeCombatActionId(actionId: unknown): CombatActionId | null {
  return typeof actionId === "string" && Object.prototype.hasOwnProperty.call(COMBAT.actions, actionId)
    ? actionId as CombatActionId
    : null;
}

export function getActionReadyAt(player: PlayerState, actionId: CombatActionId) {
  if (actionId === "attack") return player.attackReadyAt;
  if (actionId === "shoot") return player.shootReadyAt;
  if (actionId === "fireblast") return player.fireblastReadyAt;
  return player.frostNovaReadyAt;
}

export function setActionReadyAt(player: PlayerState, actionId: CombatActionId, readyAt: number) {
  if (actionId === "attack") player.attackReadyAt = readyAt;
  else if (actionId === "shoot") player.shootReadyAt = readyAt;
  else if (actionId === "fireblast") player.fireblastReadyAt = readyAt;
  else player.frostNovaReadyAt = readyAt;
}

export function isPlayerStationary(player: PlayerState, input: TrackedInput | undefined, now: number) {
  if (player.y > 0.05) return false;
  if (!input || now - input.receivedAt >= 350) return true;
  return Math.hypot(input.x, input.z) <= COMBAT.stationaryInputThreshold && !input.jump;
}

export function updatePlayerCast(
  sessionId: string,
  player: PlayerState,
  activeInput: TrackedInput | null,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
) {
  const actionId = normalizeCombatActionId(player.castingAction);
  if (!actionId) return;

  if (!isPlayerStationary(player, activeInput ?? undefined, now)) {
    clearPlayerCast(player);
    return;
  }

  if (now < player.castEndsAt) return;

  const action = getPlayerActionConfig(player, actionId);
  if (action.manaCost > 0 && player.mana < action.manaCost) {
    clearPlayerCast(player);
    return;
  }

  const target = findCombatTarget(npcs, { kind: player.castTargetKind, id: player.castTargetId });
  if (target && isNpcAlive(target) && distanceToNpc(player, target) <= action.maxRange && distanceToNpc(player, target) >= action.minRange) {
      const damage = getPlayerActionDamage(player, actionId);
      player.mana = clamp(player.mana - action.manaCost, 0, player.maxMana);
      setActionReadyAt(player, actionId, now + action.cooldownMs);
      applyCombatDamage(sessionId, player, target, actionId, damage, now, emitCombatEvent, pendingCombatImpacts, creditNpcDefeat);
  }
  clearPlayerCast(player);
}

export function clearPlayerCast(player: PlayerState) {
  player.castingAction = "";
  player.castStartedAt = 0;
  player.castEndsAt = 0;
  player.castTargetKind = "";
  player.castTargetId = "";
}

export function updatePlayerRegen(player: PlayerState, delta: number, now: number) {
  if (player.health <= 0) return;

  if (now - player.lastCastAt >= COMBAT.manaRegenDelayMs) {
    player.mana = clamp(player.mana + (player.manaRegenPer5 / 5) * delta, 0, player.maxMana);
  }

  if (now - player.lastDamagedAt >= COMBAT.healthRegenDelayMs) {
    player.health = clamp(player.health + (player.healthRegenPer5 / 5) * delta, 0, player.maxHealth);
  }
}

export function findCombatTarget(npcs: MapSchema<NpcState>, target: unknown) {
  if (!target || typeof target !== "object") return null;
  const maybeTarget = target as { kind?: unknown; id?: unknown };
  if (maybeTarget.kind !== "npc" || typeof maybeTarget.id !== "string") return null;
  const npc = npcs.get(maybeTarget.id);
  if (!npc || !isAttackableNpcRole(npc.role)) return null;
  return npc;
}

export function isNpcAlive(npc: NpcState) {
  return npc.isImmortal || npc.health > 0;
}

export function applyCombatDamage(
  sourceId: string,
  player: PlayerState,
  target: NpcState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
) {
  if (actionId === "fireblast") {
    const impactAt = now + getProjectileTravelMs(player.x, player.z, target.x, target.z);
    pendingCombatImpacts.push({
      target: { kind: "npc", id: target.id },
      sourcePlayerId: sourceId,
      damage,
      impactAt,
    });
    emitCombatEvent(makeCombatEvent(sourceId, player, target, actionId, damage, now, false, impactAt));
    return;
  }

  const defeated = applyNpcDamage(target, damage, now);
  if (actionId === "frostNova" && !defeated) {
    applyNpcFreeze(target, now + COMBAT.actions.frostNova.freezeMs);
  }
  if (defeated) {
    handleNpcDefeated(sourceId, player, target, now, creditNpcDefeat);
  }
  aggroNpcOnPlayerHit(target, sourceId, player);
  emitCombatEvent(makeCombatEvent(sourceId, player, target, actionId, damage, now, defeated, now));
}

export function applyFrostNova(
  sourceId: string,
  player: PlayerState,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
) {
  emitCombatEvent(makeFrostNovaCastEvent(sourceId, player, now));
  const action = getPlayerActionConfig(player, "frostNova");

  npcs.forEach((npc) => {
    if (!isNpcAlive(npc) || !isAttackableNpcRole(npc.role)) return;
    if (distanceToNpc(player, npc) > action.maxRange) return;

    applyCombatDamage(
      sourceId,
      player,
      npc,
      "frostNova",
      getPlayerActionDamage(player, "frostNova"),
      now,
      emitCombatEvent,
      pendingCombatImpacts,
      creditNpcDefeat,
    );
  });
}

export function getPlayerActionDamage(player: PlayerState, actionId: CombatActionId) {
  const baseDamage = getPlayerActionConfig(player, actionId).damage;
  if (actionId === "attack") return baseDamage + Math.floor(player.strength * 0.7);
  if (actionId === "shoot") return baseDamage + Math.floor(player.dexterity * 0.75);
  if (actionId === "fireblast") return baseDamage + Math.floor(player.magic * 1.1);
  return baseDamage + Math.floor(player.magic * 0.35);
}

function applyNpcFreeze(npc: NpcState, frozenUntil: number) {
  npc.frozenUntil = Math.max(npc.frozenUntil, frozenUntil);
  npc.attackReadyAt = Math.max(npc.attackReadyAt, frozenUntil);
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  npc.animation = "idle";
}

export function applyNpcCombatDamage(
  source: NpcState,
  targetId: string,
  player: PlayerState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
) {
  if (actionId === "fireblast") {
    const impactAt = now + getProjectileTravelMs(source.x, source.z, player.x, player.z);
    pendingCombatImpacts.push({
      target: { kind: "player", id: targetId },
      damage,
      impactAt,
    });
    emitCombatEvent(makePlayerCombatEvent(source, targetId, player, actionId, damage, now, false, impactAt));
    return;
  }

  const defeated = applyPlayerDamage(player, damage, now);
  emitCombatEvent(makePlayerCombatEvent(source, targetId, player, actionId, damage, now, defeated, now));
}

function applyNpcDamage(npc: NpcState, damage: number, now: number) {
  if (npc.isImmortal) {
    npc.health = npc.maxHealth;
    return false;
  }

  const wasAlive = npc.health > 0;
  npc.health = clamp(npc.health - damage, 0, npc.maxHealth);
  if (wasAlive && npc.health <= 0) {
    npc.defeatedAt = now;
    npc.despawnAt = now + COMBAT.defeatedDespawnMs;
    npc.respawnAt = now + (npc.role === "farmer" ? FARMER_COMBAT.respawnMs : COMBAT.defeatedRespawnMs);
    npc.aggroTargetId = "";
    npc.attackReadyAt = 0;
    npc.frozenUntil = 0;
    npc.y = 0;
    npc.targetX = npc.homeX;
    npc.targetZ = npc.homeZ;
    npc.animation = "idle";
    return true;
  }
  return false;
}

function handleNpcDefeated(
  sourceId: string,
  player: PlayerState,
  npc: NpcState,
  now: number,
  creditNpcDefeat: NpcDefeatCreditHandler,
) {
  populateCorpseLoot(player, npc, now);
  creditNpcDefeat(sourceId, npc, now);
}

export function processPendingCombatImpacts(
  pendingCombatImpacts: PendingCombatImpact[],
  players: MapSchema<PlayerState>,
  npcs: MapSchema<NpcState>,
  now: number,
  creditNpcDefeat: NpcDefeatCreditHandler,
) {
  for (let index = pendingCombatImpacts.length - 1; index >= 0; index -= 1) {
    const impact = pendingCombatImpacts[index];
    if (now < impact.impactAt) continue;

    pendingCombatImpacts.splice(index, 1);
    if (impact.target.kind === "npc") {
      const npc = npcs.get(impact.target.id);
      const sourcePlayer = impact.sourcePlayerId ? players.get(impact.sourcePlayerId) : undefined;
      if (npc && isNpcAlive(npc)) {
        const defeated = applyNpcDamage(npc, impact.damage, now);
        if (sourcePlayer && impact.sourcePlayerId) {
          if (defeated) {
            handleNpcDefeated(impact.sourcePlayerId, sourcePlayer, npc, now, creditNpcDefeat);
          }
          aggroNpcOnPlayerHit(npc, impact.sourcePlayerId, sourcePlayer);
        }
      }
    } else {
      const player = players.get(impact.target.id);
      if (player) applyPlayerDamage(player, impact.damage, now);
    }
  }
}

function aggroNpcOnPlayerHit(npc: NpcState, sourcePlayerId: string, player: PlayerState) {
  if (!canNpcAggroOnPlayerHit(npc)) return;
  if (npc.health <= 0 || player.health <= 0) return;

  npc.aggroTargetId = sourcePlayerId;
  npc.nextDecisionAt = 0;
}

export function aggroNeutralNpcOnPlayerAttackStart(npc: NpcState, sourcePlayerId: string, player: PlayerState) {
  if (npc.model !== "hog") return;
  aggroNpcOnPlayerHit(npc, sourcePlayerId, player);
}

function canNpcAggroOnPlayerHit(npc: NpcState) {
  return npc.role === "farmer" || npc.model === "hog";
}

function applyPlayerDamage(player: PlayerState, damage: number, now: number) {
  if (player.health <= 0) return false;

  player.health = clamp(player.health - damage, 0, player.maxHealth);
  if (damage > 0) {
    player.lastDamagedAt = now;
    if (player.castingAction) pushbackPlayerCast(player, now);
  }
  if (player.health > 0) return false;

  clearPlayerCast(player);
  player.verticalVelocity = 0;
  player.animation = "idle";
  return true;
}

function pushbackPlayerCast(player: PlayerState, now: number) {
  const actionId = normalizeCombatActionId(player.castingAction);
  if (!actionId) return;

  const castTimeMs = COMBAT.actions[actionId].castTimeMs;
  if (castTimeMs <= 0) return;

  const elapsedMs = clamp(now - player.castStartedAt, 0, castTimeMs);
  const reducedElapsedMs = Math.max(0, elapsedMs - COMBAT.castPushbackMs);
  player.castStartedAt = now - reducedElapsedMs;
  player.castEndsAt = player.castStartedAt + castTimeMs;
}

function makeCombatEvent(
  sourceId: string,
  player: PlayerState,
  target: NpcState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  defeated: boolean,
  impactAt: number,
): CombatEvent {
  const impactHeight = getNpcImpactHeight(target);
  return {
    id: `${now}:${sourceId}:${actionId}:${target.id}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    actionId,
    target: { kind: "npc", id: target.id },
    targetName: target.name,
    amount: damage,
    sourceX: player.x,
    sourceY: player.y + 1.2,
    sourceZ: player.z,
    targetX: target.x,
    targetY: target.y + impactHeight,
    targetZ: target.z,
    sentAt: now,
    impactAt,
    defeated,
  };
}

function makeFrostNovaCastEvent(sourceId: string, player: PlayerState, now: number): CombatEvent {
  return {
    id: `${now}:${sourceId}:frostNova:cast:${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    actionId: "frostNova",
    target: { kind: "player", id: sourceId },
    targetName: player.name,
    amount: 0,
    sourceX: player.x,
    sourceY: player.y + 1.2,
    sourceZ: player.z,
    targetX: player.x,
    targetY: player.y + 0.42,
    targetZ: player.z,
    sentAt: now,
    impactAt: now,
    defeated: false,
  };
}

function makePlayerCombatEvent(
  source: NpcState,
  targetId: string,
  player: PlayerState,
  actionId: CombatActionId,
  damage: number,
  now: number,
  defeated: boolean,
  impactAt: number,
): CombatEvent {
  return {
    id: `${now}:${source.id}:${actionId}:${player.name}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId: source.id,
    actionId,
    target: { kind: "player", id: targetId },
    targetName: player.name,
    amount: damage,
    sourceX: source.x,
    sourceY: source.y + getNpcImpactHeight(source),
    sourceZ: source.z,
    targetX: player.x,
    targetY: player.y + 1.45,
    targetZ: player.z,
    sentAt: now,
    impactAt,
    defeated,
  };
}

function getProjectileTravelMs(sourceX: number, sourceZ: number, targetX: number, targetZ: number) {
  const distance = Math.hypot(sourceX - targetX, sourceZ - targetZ);
  return Math.round(clamp(
    (distance / COMBAT.fireblastProjectileSpeed) * 1000,
    COMBAT.fireblastMinTravelMs,
    COMBAT.fireblastMaxTravelMs,
  ));
}

function getNpcImpactHeight(npc: NpcState) {
  if (npc.model === "rabbit") return 0.75;
  if (npc.model === "hog") return 0.9;
  if (npc.model === "deer") return 1.15;
  return 1.45;
}

export function respawnPlayerAtFountain(player: PlayerState) {
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  player.lastDamagedAt = 0;
  player.lastCastAt = 0;
  player.x = RESPAWN_POINT.x;
  player.y = 0;
  player.z = RESPAWN_POINT.z;
  player.yaw = RESPAWN_POINT.yaw;
  player.verticalVelocity = 0;
  player.animation = "idle";
  clearPlayerCast(player);
}

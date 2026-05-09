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
import {
  getProjectileTravelMs,
  makeNpcDamageEvent,
  makePlayerDamageEvent,
  makeUnitHealEvent,
} from "./combatEvents.js";
import { populateCorpseLoot } from "./loot.js";
import { distanceToNpc } from "./spatial.js";
import { getPlayerActionConfig } from "./talents.js";

export type PendingCombatImpact = {
  target: CombatEvent["target"];
  actionId: CombatActionId;
  sourcePlayerId?: string;
  damage: number;
  impactAt: number;
};

export type NpcDefeatCreditHandler = (sourceId: string, npc: NpcState, now: number) => void;
export type NpcDamageTagHandler = (sourceId: string, npc: NpcState, now: number) => void;
export type NpcThreatHandler = (sourceId: string, npc: NpcState, actionId: CombatActionId, amount: number, now: number) => void;

export function normalizeCombatActionId(actionId: unknown): CombatActionId | null {
  return typeof actionId === "string" && Object.prototype.hasOwnProperty.call(COMBAT.actions, actionId)
    ? actionId as CombatActionId
    : null;
}

export function getActionReadyAt(player: PlayerState, actionId: CombatActionId) {
  if (actionId === "attack") return player.attackReadyAt;
  if (actionId === "shoot") return player.shootReadyAt;
  if (actionId === "signalShot") return player.signalShotReadyAt;
  if (actionId === "fireblast") return player.fireblastReadyAt;
  if (actionId === "frostNova") return player.frostNovaReadyAt;
  if (actionId === "heal") return player.healReadyAt;
  if (actionId === "taunt") return player.tauntReadyAt;
  if (actionId === "whirlwind") return player.whirlwindReadyAt;
  if (actionId === "multishot") return player.multishotReadyAt;
  return player.iceBlastReadyAt;
}

export function setActionReadyAt(player: PlayerState, actionId: CombatActionId, readyAt: number) {
  if (actionId === "attack") player.attackReadyAt = readyAt;
  else if (actionId === "shoot") player.shootReadyAt = readyAt;
  else if (actionId === "signalShot") player.signalShotReadyAt = readyAt;
  else if (actionId === "fireblast") player.fireblastReadyAt = readyAt;
  else if (actionId === "frostNova") player.frostNovaReadyAt = readyAt;
  else if (actionId === "heal") player.healReadyAt = readyAt;
  else if (actionId === "taunt") player.tauntReadyAt = readyAt;
  else if (actionId === "whirlwind") player.whirlwindReadyAt = readyAt;
  else if (actionId === "multishot") player.multishotReadyAt = readyAt;
  else player.iceBlastReadyAt = readyAt;
}

export function applyPlayerUniversalCooldown(player: PlayerState, now: number) {
  const readyAt = now + COMBAT.universalCooldownMs;
  for (const actionId of Object.keys(COMBAT.actions) as CombatActionId[]) {
    setActionReadyAt(player, actionId, Math.max(getActionReadyAt(player, actionId), readyAt));
  }
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
  tagNpcForCredit?: NpcDamageTagHandler,
  recordNpcThreat?: NpcThreatHandler,
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
      applyPlayerUniversalCooldown(player, now);
      applyCombatDamage(sessionId, player, target, actionId, damage, now, emitCombatEvent, pendingCombatImpacts, creditNpcDefeat, tagNpcForCredit, recordNpcThreat);
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
  tagNpcForCredit?: NpcDamageTagHandler,
  recordNpcThreat?: NpcThreatHandler,
) {
  if (actionId === "fireblast" || actionId === "iceBlast") {
    const impactAt = now + getProjectileTravelMs(player.x, player.z, target.x, target.z);
    recordNpcThreat?.(sourceId, target, actionId, damage, now);
    pendingCombatImpacts.push({
      target: { kind: "npc", id: target.id },
      actionId,
      sourcePlayerId: sourceId,
      damage,
      impactAt,
    });
    emitCombatEvent(makeNpcDamageEvent(sourceId, player, target, actionId, damage, now, false, impactAt));
    return;
  }

  tagNpcForCredit?.(sourceId, target, now);
  recordNpcThreat?.(sourceId, target, actionId, damage, now);
  const defeated = applyNpcDamage(target, damage, now);
  if (actionId === "frostNova" && !defeated) {
    applyNpcFreeze(target, now + COMBAT.actions.frostNova.freezeMs);
  }
  if (defeated) {
    handleNpcDefeated(sourceId, player, target, now, creditNpcDefeat);
  }
  aggroNpcOnPlayerHit(target, sourceId, player);
  emitCombatEvent(makeNpcDamageEvent(sourceId, player, target, actionId, damage, now, defeated, now));
}

export function applyUnitHealing(
  sourceId: string,
  healer: PlayerState,
  targetKind: CombatEvent["target"]["kind"],
  targetId: string,
  target: PlayerState | NpcState,
  actionId: CombatActionId,
  amount: number,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
) {
  if (target.health <= 0 && !("isImmortal" in target && target.isImmortal)) return 0;

  const before = target.health;
  target.health = clamp(target.health + amount, 0, target.maxHealth);
  const effectiveHealing = target.health - before;

  emitCombatEvent(makeUnitHealEvent(sourceId, healer, targetKind, targetId, target, actionId, effectiveHealing, now));
  return effectiveHealing;
}

export function getPlayerActionDamage(player: PlayerState, actionId: CombatActionId) {
  const baseDamage = getPlayerActionConfig(player, actionId).damage;
  if (actionId === "attack") return baseDamage + Math.floor(player.strength * 0.7);
  if (actionId === "shoot" || actionId === "multishot") return baseDamage + Math.floor(player.dexterity * 0.75);
  if (actionId === "signalShot") return baseDamage + Math.floor(player.dexterity * 0.45) + Math.floor(player.magic * 0.45);
  if (actionId === "whirlwind") return baseDamage + Math.floor(player.strength * 0.55);
  if (actionId === "fireblast") return baseDamage + Math.floor(player.magic * 1.1);
  if (actionId === "iceBlast") return baseDamage + Math.floor(player.magic * 0.78);
  if (actionId === "heal" || actionId === "taunt") return 0;
  return baseDamage + Math.floor(player.magic * 0.35);
}

export function getPlayerHealingAmount(player: PlayerState, actionId: CombatActionId) {
  if (actionId !== "heal") return 0;
  return COMBAT.actions.heal.healing + Math.floor(player.magic * 0.85);
}

function applyNpcFreeze(npc: NpcState, frozenUntil: number) {
  npc.frozenUntil = Math.max(npc.frozenUntil, frozenUntil);
  npc.attackReadyAt = Math.max(npc.attackReadyAt, frozenUntil);
  npc.targetX = npc.x;
  npc.targetZ = npc.z;
  npc.animation = "idle";
}

function applyNpcSlow(npc: NpcState, slowedUntil: number) {
  npc.slowedUntil = Math.max(npc.slowedUntil, slowedUntil);
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
      actionId,
      damage,
      impactAt,
    });
    emitCombatEvent(makePlayerDamageEvent(source, targetId, player, actionId, damage, now, false, impactAt));
    return;
  }

  const defeated = applyPlayerDamage(player, damage, now);
  emitCombatEvent(makePlayerDamageEvent(source, targetId, player, actionId, damage, now, defeated, now));
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
    npc.slowedUntil = 0;
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
  tagNpcForCredit?: NpcDamageTagHandler,
) {
  for (let index = pendingCombatImpacts.length - 1; index >= 0; index -= 1) {
    const impact = pendingCombatImpacts[index];
    if (now < impact.impactAt) continue;

    pendingCombatImpacts.splice(index, 1);
    if (impact.target.kind === "npc") {
      const npc = npcs.get(impact.target.id);
      const sourcePlayer = impact.sourcePlayerId ? players.get(impact.sourcePlayerId) : undefined;
      if (npc && isNpcAlive(npc)) {
        if (sourcePlayer && impact.sourcePlayerId) {
          tagNpcForCredit?.(impact.sourcePlayerId, npc, now);
        }
        const defeated = applyNpcDamage(npc, impact.damage, now);
        if (impact.actionId === "iceBlast" && !defeated) {
          applyNpcSlow(npc, now + COMBAT.actions.iceBlast.slowMs);
        }
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

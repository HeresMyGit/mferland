import {
  COMBAT,
  clamp,
  type CombatActionId,
  type CombatEvent,
} from "@mferland/shared";
import type { NpcState, PlayerState } from "../state.js";

export function makeNpcDamageEvent(
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

export function makeFrostNovaCastEvent(sourceId: string, player: PlayerState, now: number): CombatEvent {
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

export function makeNpcFrostNovaCastEvent(source: NpcState, now: number): CombatEvent {
  return {
    id: `${now}:${source.id}:frostNova:cast:${Math.random().toString(36).slice(2, 8)}`,
    sourceId: source.id,
    actionId: "frostNova",
    target: { kind: "npc", id: source.id },
    targetName: source.name,
    amount: 0,
    sourceX: source.x,
    sourceY: source.y + getNpcImpactHeight(source),
    sourceZ: source.z,
    targetX: source.x,
    targetY: source.y + 0.42,
    targetZ: source.z,
    sentAt: now,
    impactAt: now,
    defeated: false,
  };
}

export function makePlayerDamageEvent(
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

export function makeUnitHealEvent(
  sourceId: string,
  healer: PlayerState,
  targetKind: CombatEvent["target"]["kind"],
  targetId: string,
  target: PlayerState | NpcState,
  actionId: CombatActionId,
  amount: number,
  now: number,
): CombatEvent {
  const targetHeight = targetKind === "npc" && "model" in target ? getNpcImpactHeight(target) : 1.45;
  return {
    id: `${now}:${sourceId}:${actionId}:${targetId}:${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    actionId,
    target: { kind: targetKind, id: targetId },
    targetName: target.name,
    amount,
    sourceX: healer.x,
    sourceY: healer.y + 1.2,
    sourceZ: healer.z,
    targetX: target.x,
    targetY: target.y + targetHeight,
    targetZ: target.z,
    sentAt: now,
    impactAt: now,
    defeated: false,
  };
}

export function makeNpcUtilityEvent(
  sourceId: string,
  player: PlayerState,
  target: NpcState,
  actionId: CombatActionId,
  now: number,
): CombatEvent {
  return makeNpcDamageEvent(sourceId, player, target, actionId, 0, now, false, now);
}

export function getProjectileTravelMs(sourceX: number, sourceZ: number, targetX: number, targetZ: number) {
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
  if (npc.model === "training-dummy") return 1.25;
  return 1.45;
}

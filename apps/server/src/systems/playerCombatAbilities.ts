import { type MapSchema } from "@colyseus/schema";
import {
  COMBAT,
  isAttackableNpcRole,
  type CombatEvent,
} from "@mferland/shared";
import type { NpcState, PlayerState } from "../state.js";
import {
  applyCombatDamage,
  getPlayerActionDamage,
  isNpcAlive,
  type NpcDamageTagHandler,
  type NpcDefeatCreditHandler,
  type NpcThreatHandler,
  type PendingCombatImpact,
} from "./combat.js";
import { makeFrostNovaCastEvent } from "./combatEvents.js";
import { distanceToNpc } from "./spatial.js";
import { getPlayerActionConfig } from "./talents.js";

export function applyFrostNova(
  sourceId: string,
  player: PlayerState,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
  tagNpcForCredit?: NpcDamageTagHandler,
  recordNpcThreat?: NpcThreatHandler,
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
      tagNpcForCredit,
      recordNpcThreat,
    );
  });
}

export function applyWhirlwind(
  sourceId: string,
  player: PlayerState,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
  tagNpcForCredit?: NpcDamageTagHandler,
  recordNpcThreat?: NpcThreatHandler,
) {
  const action = getPlayerActionConfig(player, "whirlwind");
  npcs.forEach((npc) => {
    if (!isNpcAlive(npc) || !isAttackableNpcRole(npc.role)) return;
    if (distanceToNpc(player, npc) > action.maxRange) return;

    applyCombatDamage(
      sourceId,
      player,
      npc,
      "whirlwind",
      getPlayerActionDamage(player, "whirlwind"),
      now,
      emitCombatEvent,
      pendingCombatImpacts,
      creditNpcDefeat,
      tagNpcForCredit,
      recordNpcThreat,
    );
  });
}

export function applyMultishot(
  sourceId: string,
  player: PlayerState,
  primaryTarget: NpcState,
  npcs: MapSchema<NpcState>,
  now: number,
  emitCombatEvent: (event: CombatEvent) => void,
  pendingCombatImpacts: PendingCombatImpact[],
  creditNpcDefeat: NpcDefeatCreditHandler,
  tagNpcForCredit?: NpcDamageTagHandler,
  recordNpcThreat?: NpcThreatHandler,
) {
  const action = getPlayerActionConfig(player, "multishot");
  const targets: NpcState[] = [primaryTarget];
  const candidates: Array<{ npc: NpcState; distance: number }> = [];

  npcs.forEach((npc) => {
    if (npc.id === primaryTarget.id || !isNpcAlive(npc) || !isAttackableNpcRole(npc.role)) return;
    const playerDistance = distanceToNpc(player, npc);
    if (playerDistance < action.minRange || playerDistance > action.maxRange) return;
    const splitDistance = Math.hypot(npc.x - primaryTarget.x, npc.z - primaryTarget.z);
    if (splitDistance > COMBAT.actions.multishot.splashRadius) return;
    candidates.push({ npc, distance: splitDistance });
  });

  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates.slice(0, COMBAT.actions.multishot.maxTargets - 1)) {
    targets.push(candidate.npc);
  }

  for (const npc of targets) {
    applyCombatDamage(
      sourceId,
      player,
      npc,
      "multishot",
      getPlayerActionDamage(player, "multishot"),
      now,
      emitCombatEvent,
      pendingCombatImpacts,
      creditNpcDefeat,
      tagNpcForCredit,
      recordNpcThreat,
    );
  }
}

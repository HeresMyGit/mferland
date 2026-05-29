import {
  ELIXIR_BUFFS,
  getElixirBuffDefinition,
  isElixirBuffId,
  type ActiveBuffSnapshot,
  type ElixirBuffEffects,
  type ElixirBuffId,
} from "@mferland/shared";
import { ActiveBuffState, type PlayerState } from "../state.js";

export function applyElixirBuff(player: PlayerState, buffId: ElixirBuffId, now = Date.now()) {
  const definition = getElixirBuffDefinition(buffId);
  const buff = player.activeBuffs.get(buffId) ?? new ActiveBuffState();
  buff.id = buffId;
  buff.startedAt = now;
  buff.expiresAt = now + definition.durationMs;
  player.activeBuffs.set(buffId, buff);
  return true;
}

export function removeExpiredPlayerBuffs(player: PlayerState, now = Date.now()) {
  let changed = false;
  player.activeBuffs.forEach((buff, key) => {
    const buffId = isElixirBuffId(buff.id) ? buff.id : isElixirBuffId(key) ? key : null;
    if (buffId && buff.expiresAt > now) return;
    player.activeBuffs.delete(key);
    changed = true;
  });
  return changed;
}

export function getPlayerBuffEffectTotals(player: PlayerState, now = Date.now()): ElixirBuffEffects {
  const totals: ElixirBuffEffects = {};
  player.activeBuffs.forEach((buff, key) => {
    const buffId = isElixirBuffId(buff.id) ? buff.id : isElixirBuffId(key) ? key : null;
    if (!buffId || buff.expiresAt <= now) return;
    addBuffEffects(totals, ELIXIR_BUFFS[buffId].effects);
  });
  return totals;
}

export function getPlayerActionCooldownMultiplier(player: PlayerState, now = Date.now()) {
  const reduction = getPlayerBuffEffectTotals(player, now).actionCooldownReductionPercent ?? 0;
  return Math.max(0.5, 1 - reduction / 100);
}

export function snapshotActiveBuffs(activeBuffs: PlayerState["activeBuffs"], now = Date.now()): ActiveBuffSnapshot[] {
  const snapshots: ActiveBuffSnapshot[] = [];
  activeBuffs.forEach((buff, key) => {
    const buffId = isElixirBuffId(buff.id) ? buff.id : isElixirBuffId(key) ? key : null;
    if (!buffId || buff.expiresAt <= now) return;

    const definition = ELIXIR_BUFFS[buffId];
    snapshots.push({
      id: buffId,
      itemId: definition.itemId,
      name: definition.name,
      shortName: definition.shortName,
      description: definition.description,
      effectLabel: definition.effectLabel,
      startedAt: Math.max(0, buff.startedAt),
      expiresAt: Math.max(0, buff.expiresAt),
    });
  });
  return snapshots.sort((left, right) => left.expiresAt - right.expiresAt || left.id.localeCompare(right.id));
}

function addBuffEffects(totals: ElixirBuffEffects, effects: ElixirBuffEffects) {
  totals.maxHealth = (totals.maxHealth ?? 0) + (effects.maxHealth ?? 0);
  totals.maxMana = (totals.maxMana ?? 0) + (effects.maxMana ?? 0);
  totals.strength = (totals.strength ?? 0) + (effects.strength ?? 0);
  totals.dexterity = (totals.dexterity ?? 0) + (effects.dexterity ?? 0);
  totals.magic = (totals.magic ?? 0) + (effects.magic ?? 0);
  totals.healthRegenPer5 = (totals.healthRegenPer5 ?? 0) + (effects.healthRegenPer5 ?? 0);
  totals.manaRegenPer5 = (totals.manaRegenPer5 ?? 0) + (effects.manaRegenPer5 ?? 0);
  totals.walkSpeed = (totals.walkSpeed ?? 0) + (effects.walkSpeed ?? 0);
  totals.runSpeed = (totals.runSpeed ?? 0) + (effects.runSpeed ?? 0);
  totals.actionCooldownReductionPercent = (totals.actionCooldownReductionPercent ?? 0) + (effects.actionCooldownReductionPercent ?? 0);
}

import { type CSSProperties, type PointerEvent } from "react";
import {
  COMBAT,
  ITEMS,
  getInventoryItemKey,
  getItemConsumable,
  getNpcDisposition,
  getTalentActionBaseDamage,
  getTalentActionCooldownMs,
  isAttackableNpcRole,
  isCombatActionUnlocked,
  type ActionId,
  type CombatActionId,
  type InventoryItemSnapshot,
  type ItemId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import { AbilityIcon } from "./GameIcon";
import { ItemIcon } from "./ItemIcon";
import { type ActionSlot, type ItemActionSlot, isItemActionSlot } from "./types";
import { formatTooltipLabel } from "./utils";

type SlotUsability = {
  usable: boolean;
  reason: string;
  count?: number;
};

export function ActionSlotButton({
  actionId,
  index,
  isDragging,
  isDropTarget,
  onAction,
  onPointerStart,
  onPointerMove,
  onPointerEnd,
  localPlayer,
  selectedTarget,
  selectedTargetUnit,
  now,
  debugUnlockAllMoves,
}: {
  actionId: ActionSlot;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onAction: (slot: NonNullable<ActionSlot>) => void;
  onPointerStart: (index: number, event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
  localPlayer: PlayerSnapshot | null;
  selectedTarget: TargetSelection | null;
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null;
  now: number;
  debugUnlockAllMoves: boolean;
}) {
  const itemSlot = isItemActionSlot(actionId) ? actionId : null;
  const abilitySlot = typeof actionId === "string" ? actionId : null;
  const combatActionId = abilitySlot && abilitySlot !== "interact" ? abilitySlot : null;
  const action = abilitySlot ? getActionMeta(abilitySlot) : null;
  const item = itemSlot ? ITEMS[itemSlot.itemId] : null;
  const cooldown = combatActionId ? getCooldownState(localPlayer, combatActionId, now) : null;
  const hasMana = combatActionId
    ? (localPlayer?.mana ?? 0) >= COMBAT.actions[combatActionId].manaCost
    : true;
  const usability: SlotUsability = itemSlot
    ? getItemUsability(itemSlot, localPlayer)
    : combatActionId
    ? getCombatUsability(combatActionId, localPlayer, selectedTarget, selectedTargetUnit, now, debugUnlockAllMoves)
    : { usable: true, reason: "" };
  const filled = Boolean(action || itemSlot);
  const tooltip = getActionSlotTooltip(actionId, index, localPlayer, usability, cooldown);
  const className = [
    "action-slot",
    filled ? "filled" : "empty",
    itemSlot ? "item-slot" : "",
    isDragging ? "dragging" : "",
    isDropTarget ? "drop-target" : "",
    cooldown && cooldown.remainingMs > 0 ? "cooling" : "",
    hasMana ? "" : "oom",
    usability.usable ? "" : "unusable",
  ].filter(Boolean).join(" ");

  if (!filled) {
    return (
      <div
        className={className}
        data-action-slot={index}
        data-tooltip={tooltip}
        aria-label={formatTooltipLabel(tooltip)}
        onPointerDown={(event) => onPointerStart(index, event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="slot-key">{index + 1}</span>
      </div>
    );
  }

  return (
    <button
      className={className}
      type="button"
      data-action-slot={index}
      data-tooltip={tooltip}
      aria-label={`${action?.label ?? item?.name ?? "Item"}, slot ${index + 1}`}
      aria-disabled={!usability.usable}
      onPointerDown={(event) => onPointerStart(index, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onAction(actionId as NonNullable<ActionSlot>);
      }}
    >
      {itemSlot ? <ItemIcon itemId={itemSlot.itemId} /> : action ? <AbilityIcon actionId={action.id} /> : null}
      {itemSlot && (
        <em className="item-count-label">x{Math.max(0, usability.count ?? 0)}</em>
      )}
      {cooldown && cooldown.remainingMs > 0 && (
        <span className="cooldown-sweep" style={{ "--cooldown-fill": cooldown.percent / 100 } as CSSProperties} />
      )}
      {cooldown && cooldown.remainingMs > 0 && (
        <em className="cooldown-label">{formatCooldown(cooldown.remainingMs)}</em>
      )}
      <span className="slot-key">{index + 1}</span>
    </button>
  );
}

export function getActionMeta(actionId: ActionId) {
  if (actionId === "interact") {
    return {
      id: actionId,
      label: "Interact",
    };
  }
  return {
    id: actionId,
    label: COMBAT.actions[actionId].label,
  };
}

export function getActionReadyAt(player: PlayerSnapshot | null, actionId: CombatActionId) {
  if (!player) return 0;
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

function getCooldownState(player: PlayerSnapshot | null, actionId: CombatActionId, now: number) {
  const remainingMs = Math.max(0, getActionReadyAt(player, actionId) - now);
  const actionCooldownMs = player ? getTalentActionCooldownMs(actionId, player.talents) : COMBAT.actions[actionId].cooldownMs;
  const cooldownMs = Math.max(actionCooldownMs, COMBAT.universalCooldownMs);
  return {
    remainingMs,
    percent: cooldownMs > 0 ? Math.min(100, (remainingMs / cooldownMs) * 100) : 0,
  };
}

function getItemUsability(slot: ItemActionSlot, player: PlayerSnapshot | null) {
  const count = getInventoryItemCount(player?.inventory ?? [], slot.itemId, slot.chainTokenId);
  if (count <= 0) return { usable: false, reason: "Empty", count };

  const consumable = getItemConsumable(slot.itemId);
  if (!consumable) return { usable: false, reason: "Item", count };
  if (!player) return { usable: false, reason: "", count };

  const restoresHealth = Boolean(consumable.health && player.health < player.maxHealth);
  const restoresMana = Boolean(consumable.mana && player.mana < player.maxMana);
  if (!restoresHealth && !restoresMana) return { usable: false, reason: "Full", count };
  return { usable: true, reason: "", count };
}

function getActionSlotTooltip(
  slot: ActionSlot,
  _index: number,
  player: PlayerSnapshot | null,
  usability: SlotUsability,
  cooldown: ReturnType<typeof getCooldownState> | null,
) {
  if (!slot) return "Empty";

  if (isItemActionSlot(slot)) {
    const item = ITEMS[slot.itemId];
    const consumable = getItemConsumable(slot.itemId);
    const effects = [
      consumable?.health ? `Restores ${consumable.health} HP` : "",
      consumable?.mana ? `Restores ${consumable.mana} MP` : "",
    ].filter(Boolean).join(" / ");

    return [
      item.name,
      item.description,
      usability.count !== undefined ? `Count: ${usability.count}` : "",
      effects,
      consumable ? `${capitalize(consumable.kind)} cooldown: ${formatTooltipDuration(consumable.cooldownMs)}` : "",
      usability.reason ? `Status: ${usability.reason}` : "",
    ].filter(Boolean).join("\n");
  }

  const meta = getActionMeta(slot);
  if (slot === "interact") {
    return [
      meta?.label ?? "Interact",
      "Talk, loot, and use nearby objects.",
    ].join("\n");
  }

  const action = COMBAT.actions[slot];
  const damage = player ? getTalentActionBaseDamage(slot, player.talents) : action.damage;
  const effect = getCombatEffectLine(slot, damage);
  const range = action.maxRange > 0
    ? action.minRange > 0 ? `${action.minRange}-${action.maxRange}m range` : `${action.maxRange}m range`
    : "Self/nearby";
  const cooldownMs = player ? getTalentActionCooldownMs(slot, player.talents) : action.cooldownMs;

  return [
    meta?.label ?? "Ability",
    action.description,
    `${effect} / ${range}`,
    action.manaCost > 0 ? `${action.manaCost} MP` : "No mana cost",
    cooldownMs > 0 ? `Cooldown: ${formatTooltipDuration(cooldownMs)}` : "No cooldown",
    cooldown && cooldown.remainingMs > 0 ? `Ready in ${formatTooltipDuration(cooldown.remainingMs)}` : "",
    usability.reason ? `Status: ${usability.reason}` : "",
  ].filter(Boolean).join("\n");
}

function getCombatEffectLine(actionId: CombatActionId, damage: number) {
  if (actionId === "attack") return `${damage} damage / +${COMBAT.actions.attack.threatBonus} threat`;
  if (actionId === "taunt") return `Forces target to attack you for ${formatTooltipDuration(COMBAT.actions.taunt.forceMs)}`;
  if (actionId === "heal") return `${COMBAT.actions.heal.healing} healing`;
  if (actionId === "frostNova") return `${damage} damage / freezes ${formatTooltipDuration(COMBAT.actions.frostNova.freezeMs)}`;
  if (actionId === "whirlwind") return `${damage} damage nearby / +${COMBAT.actions.whirlwind.threatBonus} threat`;
  if (actionId === "multishot") return `${damage} damage / up to ${COMBAT.actions.multishot.maxTargets} targets`;
  if (actionId === "iceBlast") return `${damage} damage / slows ${formatTooltipDuration(COMBAT.actions.iceBlast.slowMs)}`;
  return damage > 0 ? `${damage} damage` : "Utility";
}

function getInventoryItemCount(inventory: InventoryItemSnapshot[], itemId: ItemId, chainTokenId = "") {
  const inventoryKey = getInventoryItemKey(itemId, chainTokenId);
  const item = inventory.find((entry) => getInventoryItemKey(entry.id, entry.chainTokenId) === inventoryKey);
  return item?.count ?? 0;
}

function formatTooltipDuration(ms: number) {
  const seconds = ms / 1000;
  return seconds >= 1 ? `${Math.ceil(seconds)}s` : `${seconds.toFixed(1)}s`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCombatUsability(
  actionId: CombatActionId,
  player: PlayerSnapshot | null,
  selectedTarget: TargetSelection | null,
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null,
  now: number,
  debugUnlockAllMoves: boolean,
) {
  if (!player) return { usable: false, reason: "" };
  if (player.castingAction) return { usable: false, reason: "Casting" };
  if (!isCombatActionUnlocked(actionId, player.level, debugUnlockAllMoves)) return { usable: false, reason: "Locked" };

  const action = COMBAT.actions[actionId];
  if (getActionReadyAt(player, actionId) > now) return { usable: false, reason: "" };
  if (player.mana < action.manaCost) return { usable: false, reason: "Mana" };
  if (actionId === "frostNova" || actionId === "whirlwind") return { usable: true, reason: "" };
  if (actionId === "heal") {
    const targetUnit = selectedTarget ? selectedTargetUnit : player;
    if (!targetUnit) return { usable: false, reason: "Target" };
    if (targetUnit.health <= 0) return { usable: false, reason: "Dead" };
    if (isNpcSnapshot(targetUnit) && getNpcDisposition(targetUnit) === "hostile") {
      return { usable: false, reason: "Hostile" };
    }
    if (targetUnit.health >= targetUnit.maxHealth) return { usable: false, reason: "Full" };
    const distance = Math.hypot(player.x - targetUnit.x, player.z - targetUnit.z);
    return distance <= action.maxRange ? { usable: true, reason: "" } : { usable: false, reason: "Range" };
  }

  if (!selectedTarget) {
    return { usable: true, reason: "" };
  }
  if (selectedTarget.kind !== "npc" || !selectedTargetUnit || !isNpcSnapshot(selectedTargetUnit)) return { usable: false, reason: "Enemy" };
  if (!isAttackableNpcRole(selectedTargetUnit.role)) return { usable: false, reason: "Friendly" };
  if (!selectedTargetUnit.isImmortal && selectedTargetUnit.health <= 0) return { usable: false, reason: "Dead" };

  const distance = Math.hypot(player.x - selectedTargetUnit.x, player.z - selectedTargetUnit.z);
  if (distance < action.minRange) return { usable: false, reason: "Close" };
  if (distance > action.maxRange) return { usable: false, reason: "Range" };
  return { usable: true, reason: "" };
}

function isNpcSnapshot(unit: PlayerSnapshot | NpcSnapshot): unit is NpcSnapshot {
  return "role" in unit;
}

function formatCooldown(ms: number) {
  const seconds = ms / 1000;
  return seconds >= 1 ? String(Math.ceil(seconds)) : seconds.toFixed(1);
}

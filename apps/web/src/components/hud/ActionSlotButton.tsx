import { type CSSProperties, type PointerEvent } from "react";
import { Crosshair, Flame, Hand, Snowflake, Sword } from "lucide-react";
import {
  COMBAT,
  getTalentActionCooldownMs,
  isAttackableNpcRole,
  type ActionId,
  type CombatActionId,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TargetSelection,
} from "@mferland/shared";
import type { ActionSlot } from "./types";

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
}: {
  actionId: ActionSlot;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onAction: (actionId: ActionId) => void;
  onPointerStart: (index: number, event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLElement>) => void;
  localPlayer: PlayerSnapshot | null;
  selectedTarget: TargetSelection | null;
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null;
  now: number;
}) {
  const action = actionId ? getActionMeta(actionId) : null;
  const Icon = action?.icon;
  const cooldown = actionId && actionId !== "interact" ? getCooldownState(localPlayer, actionId, now) : null;
  const hasMana = actionId && actionId !== "interact"
    ? (localPlayer?.mana ?? 0) >= COMBAT.actions[actionId].manaCost
    : true;
  const usability = actionId && actionId !== "interact"
    ? getCombatUsability(actionId, localPlayer, selectedTarget, selectedTargetUnit, now)
    : { usable: true, reason: "" };
  const className = [
    "action-slot",
    action ? "filled" : "empty",
    isDragging ? "dragging" : "",
    isDropTarget ? "drop-target" : "",
    cooldown && cooldown.remainingMs > 0 ? "cooling" : "",
    hasMana ? "" : "oom",
    usability.usable ? "" : "unusable",
  ].filter(Boolean).join(" ");

  if (!action || !Icon) {
    return (
      <div className={className} data-action-slot={index}>
        <span className="slot-key">{index + 1}</span>
      </div>
    );
  }

  return (
    <button
      className={className}
      type="button"
      data-action-slot={index}
      title={`${action.label} (${index + 1})`}
      aria-label={`${action.label}, slot ${index + 1}`}
      aria-disabled={!usability.usable}
      onPointerDown={(event) => onPointerStart(index, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onAction(action.id);
      }}
    >
      <Icon size={25} />
      <strong>{action.label}</strong>
      {cooldown && cooldown.remainingMs > 0 && (
        <span className="cooldown-sweep" style={{ "--cooldown-fill": cooldown.percent / 100 } as CSSProperties} />
      )}
      {cooldown && cooldown.remainingMs > 0 && (
        <em className="cooldown-label">{formatCooldown(cooldown.remainingMs)}</em>
      )}
      {!usability.usable && usability.reason && <em className="range-label">{usability.reason}</em>}
      <span className="slot-key">{index + 1}</span>
    </button>
  );
}

export function getActionMeta(actionId: ActionId) {
  if (actionId === "interact") {
    return {
      id: actionId,
      label: "Interact",
      icon: Hand,
    };
  }
  if (actionId === "attack") {
    return {
      id: actionId,
      label: "Attack",
      icon: Sword,
    };
  }
  if (actionId === "shoot") {
    return {
      id: actionId,
      label: "Shoot",
      icon: Crosshair,
    };
  }
  if (actionId === "fireblast") {
    return {
      id: actionId,
      label: "Fireblast",
      icon: Flame,
    };
  }
  if (actionId === "frostNova") {
    return {
      id: actionId,
      label: "Frost Nova",
      icon: Snowflake,
    };
  }
}

function getActionReadyAt(player: PlayerSnapshot | null, actionId: CombatActionId) {
  if (!player) return 0;
  if (actionId === "attack") return player.attackReadyAt;
  if (actionId === "shoot") return player.shootReadyAt;
  if (actionId === "fireblast") return player.fireblastReadyAt;
  return player.frostNovaReadyAt;
}

function getCooldownState(player: PlayerSnapshot | null, actionId: CombatActionId, now: number) {
  const remainingMs = Math.max(0, getActionReadyAt(player, actionId) - now);
  const cooldownMs = player ? getTalentActionCooldownMs(actionId, player.talents) : COMBAT.actions[actionId].cooldownMs;
  return {
    remainingMs,
    percent: cooldownMs > 0 ? Math.min(100, (remainingMs / cooldownMs) * 100) : 0,
  };
}

function getCombatUsability(
  actionId: CombatActionId,
  player: PlayerSnapshot | null,
  selectedTarget: TargetSelection | null,
  selectedTargetUnit: PlayerSnapshot | NpcSnapshot | null,
  now: number,
) {
  if (!player) return { usable: false, reason: "" };
  if (player.castingAction) return { usable: false, reason: "Casting" };

  const action = COMBAT.actions[actionId];
  if (getActionReadyAt(player, actionId) > now) return { usable: false, reason: "" };
  if (player.mana < action.manaCost) return { usable: false, reason: "Mana" };
  if (actionId === "frostNova") return { usable: true, reason: "" };

  if (!selectedTarget || selectedTarget.kind !== "npc" || !selectedTargetUnit || !isNpcSnapshot(selectedTargetUnit)) {
    return { usable: true, reason: "" };
  }
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

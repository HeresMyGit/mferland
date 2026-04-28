import type { PlayerSnapshot } from "@mferland/shared";

export function getSlotIndexFromPoint(x: number, y: number) {
  const element = document.elementFromPoint(x, y);
  const slot = element?.closest<HTMLElement>("[data-action-slot]");
  const slotIndex = Number(slot?.dataset.actionSlot);
  return Number.isInteger(slotIndex) ? slotIndex : null;
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function percent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function getCastPercent(player: PlayerSnapshot, now: number) {
  if (!player.castingAction) return 0;
  const duration = Math.max(1, player.castEndsAt - player.castStartedAt);
  return Math.max(0, Math.min(100, ((now - player.castStartedAt) / duration) * 100));
}

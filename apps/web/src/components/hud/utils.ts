export function getSlotIndexFromPoint(x: number, y: number) {
  const slot = document.elementsFromPoint(x, y)
    .map((element) => element.closest<HTMLElement>("[data-action-slot]"))
    .find(Boolean);
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

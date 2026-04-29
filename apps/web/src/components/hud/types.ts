import type { ActionId, ItemId } from "@mferland/shared";

export type ItemActionSlot = {
  type: "item";
  itemId: ItemId;
  chainTokenId?: string;
};

export type ActionSlot = ActionId | ItemActionSlot | null;

export type DragState = {
  slot: NonNullable<ActionSlot>;
  fromIndex?: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  isDragging: boolean;
};

export function isItemActionSlot(slot: ActionSlot): slot is ItemActionSlot {
  return Boolean(slot && typeof slot === "object" && slot.type === "item" && slot.itemId);
}

export function makeItemActionSlot(itemId: ItemId, chainTokenId = ""): ItemActionSlot {
  return chainTokenId ? { type: "item", itemId, chainTokenId } : { type: "item", itemId };
}

export function getActionSlotKey(slot: ActionSlot) {
  if (!slot) return "";
  if (isItemActionSlot(slot)) return `item:${slot.itemId}:${slot.chainTokenId ?? ""}`;
  return `action:${slot}`;
}

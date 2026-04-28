import type { ActionId } from "@mferland/shared";

export type ActionSlot = ActionId | null;

export type DragState = {
  fromIndex: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  isDragging: boolean;
};

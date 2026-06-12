import { ITEMS } from "./items.js";

export const TRASH_VENDOR_NPC_ID = "trash-mfer";
export const TRASH_VENDOR_SEASON_POINT_VALUE = 1;
export const AGENT_TRASH_VENDOR_ITEMS_PER_POINT = 2;
export const TRASH_VENDOR_ITEM_IDS = [
  "muddy-tusk",
  "small-tooth",
  "worn-antler",
  "farmhand-bandana",
  "dummy-splinter",
] as const satisfies readonly (keyof typeof ITEMS)[];

export type TrashVendorItemId = typeof TRASH_VENDOR_ITEM_IDS[number];

const TRASH_VENDOR_ITEM_ID_SET = new Set<string>(TRASH_VENDOR_ITEM_IDS);

export function isTrashVendorItemId(value: unknown): value is TrashVendorItemId {
  return typeof value === "string" && TRASH_VENDOR_ITEM_ID_SET.has(value);
}

export function getTrashVendorSellValue(quantity = 1) {
  const count = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return count * TRASH_VENDOR_SEASON_POINT_VALUE;
}

export function getAgentTrashVendorAwardPoints(quantity = 1) {
  const count = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return Math.floor(count / AGENT_TRASH_VENDOR_ITEMS_PER_POINT);
}

export function getAgentTrashVendorPayableQuantity(quantity = 1, pointCapacity = Number.MAX_SAFE_INTEGER) {
  const count = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const capacity = Number.isFinite(pointCapacity) ? Math.max(0, Math.floor(pointCapacity)) : Number.MAX_SAFE_INTEGER;
  return Math.min(getAgentTrashVendorAwardPoints(count), capacity) * AGENT_TRASH_VENDOR_ITEMS_PER_POINT;
}

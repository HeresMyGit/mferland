import { type CSSProperties } from "react";
import { ITEMS } from "@mferland/shared";

export function ItemIcon({ itemId }: { itemId: keyof typeof ITEMS }) {
  return (
    <span
      className={`item-icon ${ITEMS[itemId].quality}`}
      style={{ "--item-color": ITEMS[itemId].iconColor } as CSSProperties}
    >
      {ITEMS[itemId].name.slice(0, 1)}
    </span>
  );
}

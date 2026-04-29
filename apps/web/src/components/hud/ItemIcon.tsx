import { type SyntheticEvent } from "react";
import { ITEMS, type ItemId } from "@mferland/shared";
import { getItemFallbackIconSrc, getItemIconSrc } from "./iconAssets";

export function ItemIcon({ itemId }: { itemId: ItemId }) {
  const fallbackSrc = getItemFallbackIconSrc(itemId);
  return (
    <span
      className={`item-icon ${ITEMS[itemId].quality}`}
      aria-hidden="true"
    >
      <img
        src={getItemIconSrc(itemId)}
        alt=""
        draggable={false}
        onError={(event) => replaceWithFallback(event, fallbackSrc)}
      />
    </span>
  );
}

function replaceWithFallback(event: SyntheticEvent<HTMLImageElement>, fallbackSrc: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = fallbackSrc;
}

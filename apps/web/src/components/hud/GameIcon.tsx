import { type SyntheticEvent } from "react";
import { type ActionId, type EquipmentSlotId, type TalentId, type TalentTreeId } from "@mferland/shared";
import {
  getActionFallbackIconSrc,
  getActionIconSrc,
  getCategoryIconSrc,
  getEquipmentSlotIconSrc,
  getPlaceholderIconSrc,
  getTalentIconSrc,
  getTalentTreeCategoryId,
  type IconCategoryId,
  type PlaceholderIconId,
} from "./iconAssets";

type IconImageProps = {
  src: string;
  fallbackSrc?: string;
  className: string;
};

function IconImage({ src, fallbackSrc, className }: IconImageProps) {
  return (
    <span className={className} aria-hidden="true">
      <img
        src={src}
        alt=""
        draggable={false}
        onError={(event) => replaceWithFallback(event, fallbackSrc)}
      />
    </span>
  );
}

export function AbilityIcon({ actionId }: { actionId: ActionId }) {
  return (
    <IconImage
      className="ability-icon"
      src={getActionIconSrc(actionId)}
      fallbackSrc={getActionFallbackIconSrc()}
    />
  );
}

export function CategoryIcon({ categoryId }: { categoryId: IconCategoryId }) {
  return (
    <IconImage
      className="category-icon"
      src={getCategoryIconSrc(categoryId)}
      fallbackSrc={getPlaceholderIconSrc("missing-art")}
    />
  );
}

export function EquipmentSlotIcon({ slotId }: { slotId: EquipmentSlotId }) {
  return (
    <IconImage
      className="category-icon"
      src={getEquipmentSlotIconSrc(slotId)}
      fallbackSrc={getPlaceholderIconSrc("generic-gear")}
    />
  );
}

export function PlaceholderIcon({ placeholderId }: { placeholderId: PlaceholderIconId }) {
  return (
    <IconImage
      className="category-icon"
      src={getPlaceholderIconSrc(placeholderId)}
      fallbackSrc={getPlaceholderIconSrc("missing-art")}
    />
  );
}

export function TalentIcon({ talentId }: { talentId: TalentId }) {
  return (
    <IconImage
      className="category-icon talent-icon"
      src={getTalentIconSrc(talentId)}
      fallbackSrc={getPlaceholderIconSrc("missing-art")}
    />
  );
}

export function TalentTreeIcon({ treeId }: { treeId: TalentTreeId }) {
  return <CategoryIcon categoryId={getTalentTreeCategoryId(treeId)} />;
}

function replaceWithFallback(event: SyntheticEvent<HTMLImageElement>, fallbackSrc?: string) {
  const image = event.currentTarget;
  if (!fallbackSrc || image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = fallbackSrc;
}

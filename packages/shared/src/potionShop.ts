import {
  ELIXIR_ITEM_IDS,
  ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_LABEL,
  ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_WEI,
  ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL,
  ELIXIR_SHOP_MFERGPT_AMOUNT_WEI,
  isElixirItemId,
} from "./elixirs.js";

export const POTION_SHOP_NPC_ID = "potion-mfer";
export const POTION_SHOP_PRODUCT_ID = "potion-shop";
export const POTION_SHOP_MFERGPT_AMOUNT_WEI = "1500000000000000000000000";
export const POTION_SHOP_MFERGPT_AMOUNT_LABEL = "1.5M $MFERGPT";
export const POTION_SHOP_BULK_MFERGPT_AMOUNT_WEI = "5000000000000000000000000";
export const POTION_SHOP_BULK_MFERGPT_AMOUNT_LABEL = "5M $MFERGPT";
export const POTION_SHOP_ITEM_IDS = [
  "red-juice",
  "blue-juice",
  "field-snack",
  ...ELIXIR_ITEM_IDS,
] as const;
export const POTION_SHOP_PURCHASE_QUANTITIES = [1, 5] as const;

export type PotionShopItemId = typeof POTION_SHOP_ITEM_IDS[number];
export type PotionShopPurchaseQuantity = typeof POTION_SHOP_PURCHASE_QUANTITIES[number];

export function isPotionShopItemId(value: unknown): value is PotionShopItemId {
  return typeof value === "string" && (POTION_SHOP_ITEM_IDS as readonly string[]).includes(value);
}

export function isPotionShopPurchaseQuantity(value: unknown): value is PotionShopPurchaseQuantity {
  return typeof value === "number" && (POTION_SHOP_PURCHASE_QUANTITIES as readonly number[]).includes(value);
}

export function getPotionShopPrice(quantity: PotionShopPurchaseQuantity, itemId?: PotionShopItemId) {
  if (isElixirItemId(itemId)) {
    return quantity === 5
      ? { amountWei: ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_WEI, label: ELIXIR_SHOP_BULK_MFERGPT_AMOUNT_LABEL }
      : { amountWei: ELIXIR_SHOP_MFERGPT_AMOUNT_WEI, label: ELIXIR_SHOP_MFERGPT_AMOUNT_LABEL };
  }

  return quantity === 5
    ? { amountWei: POTION_SHOP_BULK_MFERGPT_AMOUNT_WEI, label: POTION_SHOP_BULK_MFERGPT_AMOUNT_LABEL }
    : { amountWei: POTION_SHOP_MFERGPT_AMOUNT_WEI, label: POTION_SHOP_MFERGPT_AMOUNT_LABEL };
}

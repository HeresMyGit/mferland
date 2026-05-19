import { POTION_SHOP_NPC_ID } from "./potionShop.js";
import type { NpcDisposition, NpcRole, NpcSnapshot } from "./types.js";

export const CRYPTO_MFER_NPC_ID = "crypto-mfer";
export const SWAP_MFER_NPC_ID = "swap-mfer";
export const TRAITS_MFER_NPC_ID = "traits-mfer";
export const MERCHANT_NPC_IDS = [
  POTION_SHOP_NPC_ID,
  CRYPTO_MFER_NPC_ID,
  TRAITS_MFER_NPC_ID,
  SWAP_MFER_NPC_ID,
] as const;

export type MerchantNpcId = typeof MERCHANT_NPC_IDS[number];

const MERCHANT_NPC_ID_SET = new Set<string>(MERCHANT_NPC_IDS);

export function isMerchantNpcId(value: string | null | undefined): value is MerchantNpcId {
  return typeof value === "string" && MERCHANT_NPC_ID_SET.has(value);
}

export function isAttackableNpcRole(role: NpcRole): boolean {
  return role === "enemy" || role === "critter" || role === "beast" || role === "farmer";
}

export function getNpcDisposition(npc: Pick<NpcSnapshot, "role" | "model" | "aggroTargetId">): NpcDisposition {
  if (!isAttackableNpcRole(npc.role)) return "friendly";
  if (npc.role === "farmer" || npc.aggroTargetId) return "hostile";
  return "neutral";
}

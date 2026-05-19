import { getPotionShopPrice, type MferGptPaymentProof, type PotionShopPurchaseQuantity } from "@mferland/shared";
import { verifyMferGptBurnPaymentProof, type VerifiedMferGptBurnPayment } from "./mferGptBurnPayments.js";

export type VerifiedPotionShopPayment = VerifiedMferGptBurnPayment;

export async function verifyPotionShopPaymentProof(
  payment: MferGptPaymentProof | undefined,
  walletAddress: string,
  quantity: PotionShopPurchaseQuantity = 1,
): Promise<VerifiedPotionShopPayment> {
  const price = getPotionShopPrice(quantity);
  try {
    return await verifyMferGptBurnPaymentProof({
      payment,
      walletAddress,
      requiredAmountWei: price.amountWei,
      requiredAmountLabel: price.label,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "payment already used") {
      throw new Error("potion payment already used");
    }
    throw error;
  }
}

import { getFishingSupplyPrice, type MferGptPaymentProof } from "@mferland/shared";
import { verifyMferGptBurnPaymentProof, type VerifiedMferGptBurnPayment } from "./mferGptBurnPayments.js";

export type VerifiedFishingSupplyPayment = VerifiedMferGptBurnPayment;

export async function verifyFishingSupplyPaymentProof(
  payment: MferGptPaymentProof | undefined,
  walletAddress: string,
): Promise<VerifiedFishingSupplyPayment> {
  const price = getFishingSupplyPrice();
  try {
    return await verifyMferGptBurnPaymentProof({
      payment,
      walletAddress,
      requiredAmountWei: price.amountWei,
      requiredAmountLabel: price.label,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "payment already used") {
      throw new Error("fishing supply payment already used");
    }
    throw error;
  }
}

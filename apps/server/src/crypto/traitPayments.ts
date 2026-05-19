import {
  TRAIT_CHANGE_MFERGPT_AMOUNT_LABEL,
  TRAIT_CHANGE_MFERGPT_AMOUNT_WEI,
  type TraitPaymentProof,
} from "@mferland/shared";
import { verifyMferGptBurnPaymentProof, type VerifiedMferGptBurnPayment } from "./mferGptBurnPayments.js";

export type VerifiedTraitPayment = VerifiedMferGptBurnPayment;

export async function verifyTraitPaymentProof(payment: TraitPaymentProof | undefined, walletAddress: string): Promise<VerifiedTraitPayment> {
  try {
    return await verifyMferGptBurnPaymentProof({
      payment,
      walletAddress,
      requiredAmountWei: TRAIT_CHANGE_MFERGPT_AMOUNT_WEI,
      requiredAmountLabel: TRAIT_CHANGE_MFERGPT_AMOUNT_LABEL,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "payment already used") {
      throw new Error("trait payment already used");
    }
    throw error;
  }
}

import {
  TALENT_RESPEC_MFERGPT_AMOUNT_LABEL,
  TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
  type MferGptPaymentProof,
} from "@mferland/shared";
import { verifyMferGptBurnPaymentProof, type VerifiedMferGptBurnPayment } from "./mferGptBurnPayments.js";

export type VerifiedTalentRespecPayment = VerifiedMferGptBurnPayment;

export async function verifyTalentRespecPaymentProof(
  payment: MferGptPaymentProof | undefined,
  walletAddress: string,
): Promise<VerifiedTalentRespecPayment> {
  try {
    return await verifyMferGptBurnPaymentProof({
      payment,
      walletAddress,
      requiredAmountWei: TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
      requiredAmountLabel: TALENT_RESPEC_MFERGPT_AMOUNT_LABEL,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "payment already used") {
      throw new Error("respec payment already used");
    }
    throw error;
  }
}

import { and, eq } from "drizzle-orm";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_AMOUNT_WEI,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  TRAIT_CHANGE_PRODUCT_ID,
  normalizeWalletAddress,
  type TraitPaymentProof,
} from "@mferland/shared";
import { getDatabase } from "../db/client.js";
import { cryptoPurchaseEvents } from "../db/schema.js";

export type VerifiedTraitPayment = {
  chainId: number;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  tokenAddress: string;
  amountWei: string;
};

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TX_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export async function verifyTraitPaymentProof(payment: TraitPaymentProof | undefined, walletAddress: string): Promise<VerifiedTraitPayment> {
  if (!payment) throw new Error("25M $MFERGPT payment required");
  if (payment.token !== "MFERGPT") throw new Error("MFERGPT payment required");
  if (payment.chainId !== TRAIT_CHANGE_BASE_CHAIN_ID) throw new Error("Base payment required");

  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("wallet payment required");

  const txHash = normalizeTxHash(payment.txHash);
  if (!txHash) throw new Error("payment transaction missing");

  const configuredToken = getTraitPaymentTokenAddress();
  if (payment.contractAddress && normalizeAddress(payment.contractAddress) !== configuredToken) {
    throw new Error("wrong MFERGPT token");
  }

  const existing = await findExistingTraitPayment(txHash);
  if (existing) throw new Error("trait payment already used");

  const receipt = await getTraitPaymentPublicClient().waitForTransactionReceipt({
    hash: txHash as Hex,
    confirmations: 1,
    timeout: 90_000,
  });
  if (receipt.status !== "success") throw new Error("payment transaction failed");

  const burnAddress = getTraitPaymentBurnAddress();
  const requiredAmount = BigInt(TRAIT_CHANGE_MFERGPT_AMOUNT_WEI);
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== configuredToken) continue;
    if (String(log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (String(log.topics[1] ?? "").toLowerCase() !== addressTopic(normalizedWallet)) continue;
    if (String(log.topics[2] ?? "").toLowerCase() !== addressTopic(burnAddress)) continue;
    if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(log.data)) continue;

    const amount = BigInt(log.data);
    if (amount < requiredAmount) continue;
    return {
      chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
      txHash,
      logIndex: Number(log.logIndex),
      walletAddress: normalizedWallet,
      tokenAddress: configuredToken,
      amountWei: amount.toString(),
    };
  }

  throw new Error("25M $MFERGPT burn transfer not found");
}

async function findExistingTraitPayment(txHash: string) {
  const db = getDatabase();
  if (!db) throw new Error("payment database unavailable");
  return db.query.cryptoPurchaseEvents.findFirst({
    where: and(
      eq(cryptoPurchaseEvents.productId, TRAIT_CHANGE_PRODUCT_ID),
      eq(cryptoPurchaseEvents.txHash, txHash),
    ),
  });
}

function getTraitPaymentPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(getTraitPaymentRpcUrl()),
  });
}

function getTraitPaymentRpcUrl() {
  return (process.env.MFERLAND_TRAIT_PAYMENT_RPC_URL || TRAIT_CHANGE_BASE_RPC_URL).trim();
}

function getTraitPaymentTokenAddress() {
  return normalizeAddress(process.env.MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS) || normalizeAddress(TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS);
}

function getTraitPaymentBurnAddress() {
  return normalizeAddress(process.env.MFERLAND_TRAIT_BURN_ADDRESS) || normalizeAddress(TRAIT_CHANGE_BURN_ADDRESS);
}

function normalizeTxHash(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) return "";
  return normalized === ZERO_TX_HASH ? "" : normalized;
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function addressTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

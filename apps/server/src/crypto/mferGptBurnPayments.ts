import { and, eq } from "drizzle-orm";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  normalizeWalletAddress,
  type MferGptPaymentProof,
} from "@mferland/shared";
import { getDatabase } from "../db/client.js";
import { cryptoPurchaseEvents } from "../db/schema.js";
import { isLocalOnlyEnabled } from "../localSafety.js";

export type VerifiedMferGptBurnPayment = {
  chainId: number;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  tokenAddress: string;
  amountWei: string;
};

type VerifyMferGptBurnPaymentOptions = {
  payment: MferGptPaymentProof | undefined;
  walletAddress: string;
  requiredAmountWei: string;
  requiredAmountLabel: string;
};

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TX_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export type MferGptBurnPaymentConfig = {
  rpcUrl: string;
  tokenAddress: string;
  burnAddress: string;
};

export async function verifyMferGptBurnPaymentProof({
  payment,
  walletAddress,
  requiredAmountWei,
  requiredAmountLabel,
}: VerifyMferGptBurnPaymentOptions): Promise<VerifiedMferGptBurnPayment> {
  if (!payment) throw new Error(`${requiredAmountLabel} payment required`);
  if (payment.token !== "MFERGPT") throw new Error("MFERGPT payment required");
  if (payment.chainId !== TRAIT_CHANGE_BASE_CHAIN_ID) throw new Error("Base payment required");

  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("wallet payment required");

  const txHash = normalizeTxHash(payment.txHash);
  if (!txHash) throw new Error("payment transaction missing");

  const configuredToken = getMferGptPaymentTokenAddress();
  if (payment.contractAddress && normalizeAddress(payment.contractAddress) !== configuredToken) {
    throw new Error("wrong MFERGPT token");
  }

  const receipt = await getMferGptPaymentPublicClient().waitForTransactionReceipt({
    hash: txHash as Hex,
    confirmations: 1,
    timeout: 90_000,
  });
  if (receipt.status !== "success") throw new Error("payment transaction failed");

  const burnAddress = getMferGptPaymentBurnAddress();
  const requiredAmount = BigInt(requiredAmountWei);
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== configuredToken) continue;
    if (String(log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (String(log.topics[1] ?? "").toLowerCase() !== addressTopic(normalizedWallet)) continue;
    if (String(log.topics[2] ?? "").toLowerCase() !== addressTopic(burnAddress)) continue;
    if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(log.data)) continue;

    const amount = BigInt(log.data);
    if (amount < requiredAmount) continue;
    const verified = {
      chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
      txHash,
      logIndex: Number(log.logIndex),
      walletAddress: normalizedWallet,
      tokenAddress: configuredToken,
      amountWei: amount.toString(),
    };
    if (await findExistingCryptoPayment(verified.txHash, verified.logIndex)) {
      throw new Error("payment already used");
    }
    return verified;
  }

  throw new Error(`${requiredAmountLabel} burn transfer not found`);
}

async function findExistingCryptoPayment(txHash: string, logIndex: number) {
  const db = getDatabase();
  if (!db) throw new Error("payment database unavailable");
  return db.query.cryptoPurchaseEvents.findFirst({
    where: and(
      eq(cryptoPurchaseEvents.txHash, txHash),
      eq(cryptoPurchaseEvents.logIndex, logIndex),
    ),
  });
}

function getMferGptPaymentPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(resolveMferGptBurnPaymentConfig().rpcUrl),
  });
}

function getMferGptPaymentTokenAddress() {
  return resolveMferGptBurnPaymentConfig().tokenAddress;
}

function getMferGptPaymentBurnAddress() {
  return resolveMferGptBurnPaymentConfig().burnAddress;
}

export function resolveMferGptBurnPaymentConfig(env: NodeJS.ProcessEnv = process.env): MferGptBurnPaymentConfig {
  const rpcUrl = (
    env.MFERLAND_MFERGPT_PAYMENT_RPC_URL
    || env.MFERLAND_TRAIT_PAYMENT_RPC_URL
    || TRAIT_CHANGE_BASE_RPC_URL
  ).trim();
  const tokenAddress = normalizeAddress(env.MFERLAND_MFERGPT_TOKEN_ADDRESS)
    || normalizeAddress(env.MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS)
    || normalizeAddress(TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS);
  const burnAddress = normalizeAddress(env.MFERLAND_MFERGPT_BURN_ADDRESS)
    || normalizeAddress(env.MFERLAND_TRAIT_BURN_ADDRESS)
    || normalizeAddress(TRAIT_CHANGE_BURN_ADDRESS);

  if (isLocalOnlyEnabled(env)) {
    assertLocalPaymentRpcUrl(rpcUrl);
    if (tokenAddress === normalizeAddress(TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS)) {
      throw new Error("MFERLAND_LOCAL_ONLY=1 requires a local MFERGPT token address.");
    }
  }

  return { rpcUrl, tokenAddress, burnAddress };
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

function assertLocalPaymentRpcUrl(rpcUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error("MFERLAND_LOCAL_ONLY=1 requires a valid local MFERGPT payment RPC URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("MFERLAND_LOCAL_ONLY=1 only allows http/https MFERGPT payment RPC URLs.");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`MFERLAND_LOCAL_ONLY=1 refused non-local MFERGPT payment RPC host ${parsed.hostname}.`);
  }
}

function addressTopic(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

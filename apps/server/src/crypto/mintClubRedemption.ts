import {
  MINT_CLUB_BASE_BOND_ADDRESS,
  MINT_CLUB_BASE_CHAIN_ID,
  MINT_CLUB_BASE_ERC1155_ADDRESS,
  MINT_CLUB_BASE_SEPOLIA_BOND_ADDRESS,
  MINT_CLUB_BASE_SEPOLIA_CHAIN_ID,
  MINT_CLUB_BASE_SEPOLIA_ERC1155_ADDRESS,
  MINT_CLUB_BASE_SEPOLIA_WETH_ADDRESS,
  MINT_CLUB_DEFAULT_SELL_ROYALTY_BPS,
  MINT_CLUB_REDEMPTION_DEFAULT_SLIPPAGE_BPS,
  MINT_CLUB_REDEMPTION_NPC_ID,
  MINT_CLUB_REDEMPTION_RESERVE_TOKEN_DECIMALS,
  MINT_CLUB_REDEMPTION_RESERVE_TOKEN_SYMBOL,
  normalizeWalletAddress,
  type MintClubRedemptionSnapshot,
} from "@mferland/shared";
import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from "viem";
import type { PersistedFishingPondCatch } from "../persistence.js";

const MINT_CLUB_BOND_ABI = parseAbi([
  "event Burn(address indexed token,address indexed user,address receiver,uint256 amountBurned,address indexed reserveToken,uint256 refundAmount)",
]);

export type MintClubRedemptionRuntimeConfig = {
  enabled: boolean;
  chainId: number;
  rpcUrl: string;
  bondAddress: string;
  erc1155Address: string;
  reserveTokenAddress: string;
  reserveTokenSymbol: string;
  reserveTokenDecimals: number;
  reserveTokenStrict: boolean;
  sellRoyaltyBps: number;
  slippageBps: number;
  allowedCollections: Set<string>;
};

export type MintClubRedemptionConfirmation = {
  txHash: string;
  token: string;
  user: string;
  receiver: string;
  amountBurned: string;
  reserveToken: string;
  refundAmount: string;
  logIndex: number;
};

export function resolveMintClubRedemptionConfig(env: NodeJS.ProcessEnv = process.env): MintClubRedemptionRuntimeConfig {
  const enabledValue = readMintClubEnv(env, "ENABLED");
  const allowedCollections = readAllowedCollections(readMintClubEnv(env, "ALLOWED_COLLECTIONS"));
  const enabled = enabledValue
    ? enabledValue === "1" || enabledValue.toLowerCase() === "true"
    : allowedCollections.size > 0;
  const chainId = readPositiveInt(
    readMintClubEnv(env, "CHAIN_ID"),
    readPositiveInt(env.MFERLAND_FISHING_POND_CHAIN_ID || env.MFERLAND_FISHING_NFT_POND_CHAIN_ID || "", MINT_CLUB_BASE_SEPOLIA_CHAIN_ID),
  );
  const configuredReserveTokenAddress = normalizeAddress(readMintClubEnv(env, "RESERVE_TOKEN_ADDRESS"));
  const reserveTokenAddress = configuredReserveTokenAddress || defaultReserveTokenAddressForChain(chainId);
  return {
    enabled: enabled && allowedCollections.size > 0,
    chainId,
    rpcUrl: readMintClubEnv(env, "RPC_URL") || env.MFERLAND_FISHING_POND_RPC_URL || env.MFERLAND_CHAIN_RPC_URL || defaultRpcUrlForChain(chainId),
    bondAddress: normalizeAddress(readMintClubEnv(env, "BOND_ADDRESS")) || defaultBondAddressForChain(chainId),
    erc1155Address: normalizeAddress(readMintClubEnv(env, "ERC1155_ADDRESS")) || defaultErc1155AddressForChain(chainId),
    reserveTokenAddress,
    reserveTokenSymbol: reserveTokenAddress ? readMintClubEnv(env, "RESERVE_TOKEN_SYMBOL") || MINT_CLUB_REDEMPTION_RESERVE_TOKEN_SYMBOL : "",
    reserveTokenDecimals: readPositiveInt(
      readMintClubEnv(env, "RESERVE_TOKEN_DECIMALS"),
      MINT_CLUB_REDEMPTION_RESERVE_TOKEN_DECIMALS,
    ),
    reserveTokenStrict: Boolean(configuredReserveTokenAddress),
    sellRoyaltyBps: readPositiveInt(readMintClubEnv(env, "SELL_ROYALTY_BPS"), MINT_CLUB_DEFAULT_SELL_ROYALTY_BPS),
    slippageBps: readPositiveInt(readMintClubEnv(env, "SLIPPAGE_BPS"), MINT_CLUB_REDEMPTION_DEFAULT_SLIPPAGE_BPS),
    allowedCollections,
  };
}

export function isMintClubRedemptionEligibleCatch(
  record: PersistedFishingPondCatch,
  config = resolveMintClubRedemptionConfig(),
) {
  return Boolean(
    config.enabled
    && record.standard === "ERC1155"
    && record.chainId === config.chainId
    && config.allowedCollections.has(record.collection.toLowerCase()),
  );
}

export function makeMintClubRedemptionSnapshot(
  record: PersistedFishingPondCatch,
  config = resolveMintClubRedemptionConfig(),
): MintClubRedemptionSnapshot | undefined {
  if (!isMintClubRedemptionEligibleCatch(record, config)) return undefined;
  const status = record.status !== "confirmed"
    ? "claim_required"
    : record.mintClubRedemptionStatus || "eligible";
  return {
    status,
    walletActionRequired: status === "eligible" || status === "tx_submitted",
    npcId: MINT_CLUB_REDEMPTION_NPC_ID,
    chainId: config.chainId,
    collection: record.collection,
    tokenId: record.tokenId,
    bondAddress: config.bondAddress,
    erc1155Address: config.erc1155Address,
    reserveTokenAddress: config.reserveTokenAddress,
    reserveTokenSymbol: config.reserveTokenSymbol,
    reserveTokenDecimals: config.reserveTokenDecimals,
    reserveTokenStrict: config.reserveTokenStrict,
    sellRoyaltyBps: config.sellRoyaltyBps,
    slippageBps: config.slippageBps,
    txHash: record.mintClubRedemptionTxHash || undefined,
    error: record.mintClubRedemptionError || undefined,
    submittedAt: record.mintClubRedemptionSubmittedAt ? Math.floor(record.mintClubRedemptionSubmittedAt.getTime() / 1000) : undefined,
    confirmedAt: record.mintClubRedemptionConfirmedAt ? Math.floor(record.mintClubRedemptionConfirmedAt.getTime() / 1000) : undefined,
  };
}

export async function verifyMintClubRedemptionReceipt({
  txHash,
  record,
  config = resolveMintClubRedemptionConfig(),
}: {
  txHash: string;
  record: PersistedFishingPondCatch;
  config?: MintClubRedemptionRuntimeConfig;
}): Promise<MintClubRedemptionConfirmation> {
  if (!config.enabled) throw new Error("Mint Club redemption disabled");
  if (!isMintClubRedemptionEligibleCatch(record, config)) throw new Error("catch is not Mint Club redeemable");
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as Hex,
    timeout: 20_000,
  });
  if (receipt.status !== "success") throw new Error("Mint Club redemption transaction reverted");

  const expectedToken = record.collection.toLowerCase();
  const expectedUser = normalizeWalletAddress(record.walletAddress);
  const expectedReserve = config.reserveTokenAddress.toLowerCase();
  const expectedAmount = parsePositiveBigInt(record.amount) || 1n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.bondAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: MINT_CLUB_BOND_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Burn") continue;
      const args = decoded.args;
      if (args.token.toLowerCase() !== expectedToken) continue;
      if (normalizeWalletAddress(args.user) !== expectedUser) continue;
      if (config.reserveTokenStrict && args.reserveToken.toLowerCase() !== expectedReserve) continue;
      if (args.amountBurned < expectedAmount) continue;
      return {
        txHash,
        token: args.token,
        user: args.user,
        receiver: args.receiver,
        amountBurned: args.amountBurned.toString(),
        reserveToken: args.reserveToken,
        refundAmount: args.refundAmount.toString(),
        logIndex: log.logIndex,
      };
    } catch {
      continue;
    }
  }

  throw new Error("Mint Club Burn event not found for this catch");
}

function readMintClubEnv(env: NodeJS.ProcessEnv, key: string) {
  return (env[`MFERLAND_MINT_CLUB_REDEMPTION_${key}`] || env[`MFERLAND_MINT_CLUB_${key}`] || "").trim();
}

function readAllowedCollections(value: string) {
  const collections = new Set<string>();
  for (const part of value.split(/[,\s]+/)) {
    const normalized = normalizeAddress(part);
    if (normalized) collections.add(normalized.toLowerCase());
  }
  return collections;
}

function normalizeAddress(value: string) {
  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultRpcUrlForChain(chainId: number) {
  if (chainId === MINT_CLUB_BASE_CHAIN_ID) return "https://base-rpc.publicnode.com";
  if (chainId === MINT_CLUB_BASE_SEPOLIA_CHAIN_ID) return "https://sepolia.base.org";
  return "";
}

function defaultBondAddressForChain(chainId: number) {
  if (chainId === MINT_CLUB_BASE_CHAIN_ID) return MINT_CLUB_BASE_BOND_ADDRESS;
  return MINT_CLUB_BASE_SEPOLIA_BOND_ADDRESS;
}

function defaultErc1155AddressForChain(chainId: number) {
  if (chainId === MINT_CLUB_BASE_CHAIN_ID) return MINT_CLUB_BASE_ERC1155_ADDRESS;
  return MINT_CLUB_BASE_SEPOLIA_ERC1155_ADDRESS;
}

function defaultReserveTokenAddressForChain(chainId: number) {
  if (chainId === MINT_CLUB_BASE_SEPOLIA_CHAIN_ID) return MINT_CLUB_BASE_SEPOLIA_WETH_ADDRESS;
  return "";
}

function parsePositiveBigInt(value: string) {
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

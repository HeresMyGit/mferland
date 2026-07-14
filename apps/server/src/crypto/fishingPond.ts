import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FISHING_NFT_POND_CHAIN_STANDARD,
  FISHING_NFT_POND_DEFAULT_CATCH_CHANCE_BPS,
  FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
  FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
  FISHING_NFT_POND_ERC1155_CATCH_AMOUNT,
  FISHING_NFT_POND_MAX_VOUCHER_TTL_MS,
  FISHING_NFT_POND_RANDOMNESS_NOTE,
  FISHING_NFT_POND_VOUCHER_TTL_MS,
  normalizeWalletAddress,
  type FishingNftCatchSnapshot,
  type FishingNftClaimVoucher,
  type FishingNftMetadataSnapshot,
  type FishingNftPondConfig,
  type FishingNftTokenStandard,
} from "@mferland/shared";
import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { getDatabase } from "../db/client.js";
import { countFishingPondDailyIssuedCatches } from "../persistence.js";
import { readOnchainFishingRodRequirement } from "./onchainFishingRod.js";

type CryptoContractsDocument = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    fishingPond?: string;
  };
};

export type FishingPondRuntimeConfig = {
  enabled: boolean;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  catchChanceBps: number;
  voucherTtlMs: number;
  allowedCollections: readonly string[];
  awardSignerPrivateKey: Hex;
};

export type FishingPondEntrySnapshot = {
  pondEntryId: string;
  standard: FishingNftTokenStandard;
  tokenStandard: (typeof FISHING_NFT_POND_CHAIN_STANDARD)[FishingNftTokenStandard];
  collection: string;
  tokenId: string;
  remainingAmount: string;
  depositor: string;
};

export type FishingPondClaimConfirmation = {
  catchId: string;
  txHash: string;
  logIndex: number;
  fisher: string;
  pondEntryId: string;
};

const LOCAL_CHAIN_ID = 31337;
const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";
const ZERO_PRIVATE_KEY = `0x${"0".repeat(64)}` as Hex;
const MAX_NFT_METADATA_BYTES = 256 * 1024;
const NFT_METADATA_TIMEOUT_MS = 3500;
const FISHING_POND_ABI = parseAbi([
  "function nextEntryId() view returns (uint256)",
  "function activeEntryCount() view returns (uint256)",
  "function activeEntryIdAt(uint256 index) view returns (uint256)",
  "function entries(uint256) view returns (uint8 standard,address collection,uint256 tokenId,uint256 remainingAmount,address depositor,uint8 status)",
  "function paused() view returns (bool)",
  "function drainStarted() view returns (bool)",
  "function perWalletDailyCatchCap() view returns (uint256)",
  "function globalDailyCatchCap() view returns (uint256)",
  "function walletDailyCatchCount(address,uint256) view returns (uint256)",
  "function globalDailyCatchCount(uint256) view returns (uint256)",
  "event CatchClaimed(bytes32 indexed catchId,address indexed fisher,uint256 indexed pondEntryId,uint8 standard,address collection,uint256 tokenId,uint256 amount,uint256 day)",
]);
const NFT_METADATA_ABI = parseAbi([
  "function tokenURI(uint256) view returns (string)",
  "function uri(uint256) view returns (string)",
]);

const CLAIM_VOUCHER_TYPES = {
  ClaimVoucher: [
    { name: "catchId", type: "bytes32" },
    { name: "fisher", type: "address" },
    { name: "standard", type: "uint8" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "pondEntryId", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

export async function readFishingPondPublicConfig(walletAddress = ""): Promise<FishingNftPondConfig> {
  const config = await resolveFishingPondConfig();
  if (!config.enabled) return makeDisabledFishingPondConfig();

  try {
    const client = getFishingPondClient(config);
    const [paused, drainStarted, perWalletCap, globalCap, rodRequirement] = await Promise.all([
      client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "paused" }),
      client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "drainStarted" }),
      client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "perWalletDailyCatchCap" }),
      client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "globalDailyCatchCap" }),
      readOnchainFishingRodRequirement(walletAddress).catch(() => undefined),
    ]);
    const entries = await readFishingPondAvailableEntries(config);
    const dayNumber = Math.floor(Date.now() / 86_400_000);
    const day = BigInt(dayNumber);
    const normalizedWallet = normalizeWalletAddress(walletAddress);
    const [walletCount, globalCount, walletIssuedCount, globalIssuedCount] = await Promise.all([
      normalizedWallet
        ? client.readContract({
          address: config.contractAddress as Hex,
          abi: FISHING_POND_ABI,
          functionName: "walletDailyCatchCount",
          args: [normalizedWallet as Hex, day],
        })
        : Promise.resolve(0n),
      client.readContract({
        address: config.contractAddress as Hex,
        abi: FISHING_POND_ABI,
        functionName: "globalDailyCatchCount",
          args: [day],
        }),
      normalizedWallet
        ? countFishingPondDailyIssuedCatches({
          walletAddress: normalizedWallet,
          chainId: config.chainId,
          contractAddress: config.contractAddress,
          day: dayNumber,
        })
        : Promise.resolve(0),
      countFishingPondDailyIssuedCatches({
        chainId: config.chainId,
        contractAddress: config.contractAddress,
        day: dayNumber,
      }),
    ]);
    const walletUsed = maxBigInt(walletCount, BigInt(Math.max(0, Math.floor(walletIssuedCount))));
    const globalUsed = maxBigInt(globalCount, BigInt(Math.max(0, Math.floor(globalIssuedCount))));
    const walletRemaining = Number(perWalletCap > walletUsed ? perWalletCap - walletUsed : 0n);
    const globalRemaining = globalCap > 0n ? Number(globalCap > globalUsed ? globalCap - globalUsed : 0n) : null;

    return {
      authoritative: rodRequirement !== undefined,
      enabled: true,
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      rpcUrl: config.rpcUrl,
      catchChanceBps: config.catchChanceBps,
      perWalletDailyCap: Number(perWalletCap),
      globalDailyCap: Number(globalCap),
      walletDailyRemaining: walletRemaining,
      globalDailyRemaining: globalRemaining,
      stocked: entries.length > 0,
      drainMode: Boolean(drainStarted || paused),
      randomness: FISHING_NFT_POND_RANDOMNESS_NOTE,
      rodRequirement,
    };
  } catch {
    return {
      ...makeDisabledFishingPondConfig(false),
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      rpcUrl: config.rpcUrl,
      catchChanceBps: config.catchChanceBps,
    };
  }
}

export async function readFishingPondAvailableEntries(config?: FishingPondRuntimeConfig) {
  config ??= await resolveFishingPondConfig();
  if (!config.enabled) return [] as FishingPondEntrySnapshot[];
  const client = getFishingPondClient(config);
  const [paused, drainStarted, activeEntryCount] = await Promise.all([
    client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "paused" }),
    client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "drainStarted" }),
    client.readContract({ address: config.contractAddress as Hex, abi: FISHING_POND_ABI, functionName: "activeEntryCount" }),
  ]);
  if (paused || drainStarted || activeEntryCount <= 0n) return [];

  const maxScan = readPositiveInt(readFishingPondEnv(process.env, "MAX_SCAN_ENTRIES"), 512);
  const safeActiveEntryCount = activeEntryCount > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(activeEntryCount);
  const scanCount = Math.min(maxScan, safeActiveEntryCount);
  const firstIndex = safeActiveEntryCount > scanCount
    ? Math.floor(Math.floor(Date.now() / 60_000) % (safeActiveEntryCount - scanCount + 1))
    : 0;
  const indexedEntries = await Promise.all(Array.from({ length: scanCount }, async (_, index) => {
    try {
      const entryId = await client.readContract({
        address: config.contractAddress as Hex,
        abi: FISHING_POND_ABI,
        functionName: "activeEntryIdAt",
        args: [BigInt(firstIndex + index)],
      });
      const entry = await client.readContract({
        address: config.contractAddress as Hex,
        abi: FISHING_POND_ABI,
        functionName: "entries",
        args: [entryId],
      });
      return { entryId, entry };
    } catch {
      return null;
    }
  }));

  return indexedEntries.flatMap((result): FishingPondEntrySnapshot[] => {
    if (!result) return [];
    const [standardValue, collection, tokenId, remainingAmount, depositor, status] = result.entry;
    if (Number(status) !== 1 || remainingAmount <= 0n) return [];
    const normalizedCollection = normalizeAddress(collection);
    if (!isFishingPondCollectionAllowed(config, normalizedCollection)) return [];
    const numericStandard = Number(standardValue);
    const standard = numericStandard === FISHING_NFT_POND_CHAIN_STANDARD.ERC721
      ? "ERC721"
      : numericStandard === FISHING_NFT_POND_CHAIN_STANDARD.ERC1155
        ? "ERC1155"
        : "";
    if (!standard || !normalizedCollection || !normalizeAddress(depositor)) return [];
    return [{
      pondEntryId: result.entryId.toString(),
      standard,
      tokenStandard: FISHING_NFT_POND_CHAIN_STANDARD[standard],
      collection: normalizedCollection,
      tokenId: tokenId.toString(),
      remainingAmount: remainingAmount.toString(),
      depositor: normalizeAddress(depositor),
    }];
  });
}

export async function makeFishingPondClaimVoucher({
  catchId,
  fisher,
  entry,
  now = Date.now(),
}: {
  catchId: string;
  fisher: string;
  entry: FishingPondEntrySnapshot;
  now?: number;
}): Promise<FishingNftClaimVoucher> {
  const config = await resolveFishingPondConfig();
  if (!config.enabled) throw new Error("fishing pond unavailable");
  if (!getDatabase()) throw new Error("fishing pond catch database unavailable");

  const normalizedFisher = normalizeWalletAddress(fisher);
  if (!normalizedFisher) throw new Error("wallet required");
  const normalizedCatchId = normalizeBytes32(catchId);
  if (!normalizedCatchId) throw new Error("invalid catch id");

  const amount = entry.standard === "ERC1155" ? FISHING_NFT_POND_ERC1155_CATCH_AMOUNT : "1";
  const expiresAt = Math.floor((now + config.voucherTtlMs) / 1000);
  const account = privateKeyToAccount(config.awardSignerPrivateKey);
  const message = {
    catchId: normalizedCatchId as Hex,
    fisher: normalizedFisher as Hex,
    standard: entry.tokenStandard,
    collection: entry.collection as Hex,
    tokenId: BigInt(entry.tokenId),
    amount: BigInt(amount),
    pondEntryId: BigInt(entry.pondEntryId),
    expiresAt: BigInt(expiresAt),
    chainId: BigInt(config.chainId),
    verifyingContract: config.contractAddress as Hex,
  };
  const signature = await account.signTypedData({
    domain: {
      name: "mferland FishingPond",
      version: "1",
      chainId: config.chainId,
      verifyingContract: config.contractAddress as Hex,
    },
    types: CLAIM_VOUCHER_TYPES,
    primaryType: "ClaimVoucher",
    message,
  });

  return {
    catchId: normalizedCatchId,
    fisher: normalizedFisher,
    tokenStandard: entry.tokenStandard,
    standard: entry.standard,
    collection: entry.collection,
    tokenId: entry.tokenId,
    amount,
    pondEntryId: entry.pondEntryId,
    expiresAt,
    chainId: config.chainId,
    verifyingContract: config.contractAddress,
    signature,
  };
}

export async function readFishingPondEntryMetadata(
  entry: FishingPondEntrySnapshot,
  config?: FishingPondRuntimeConfig,
): Promise<FishingNftMetadataSnapshot | null> {
  config ??= await resolveFishingPondConfig();
  if (!config.enabled) return null;

  const tokenUri = await readFishingPondTokenUri(entry, config);
  if (!tokenUri) return null;
  const metadata = await readNftMetadataJson(tokenUri);
  const name = sanitizeMetadataText(readMetadataString(metadata?.name), 160);
  const description = sanitizeMetadataText(readMetadataString(metadata?.description), 600);
  const image = normalizeNftMediaUri(
    readMetadataString(metadata?.image) || readMetadataString(metadata?.image_url),
    tokenUri,
  );
  const normalizedTokenUri = normalizeMetadataUri(tokenUri);

  return name || description || image || normalizedTokenUri
    ? {
      name: name || undefined,
      description: description || undefined,
      image: image || undefined,
      tokenUri: normalizedTokenUri || undefined,
    }
    : null;
}

export async function verifyFishingPondClaimReceipt({
  catchId,
  txHash,
}: {
  catchId: string;
  txHash: string;
}): Promise<FishingPondClaimConfirmation> {
  const config = await resolveFishingPondConfig();
  if (!config.enabled) throw new Error("fishing pond unavailable");
  const normalizedCatchId = normalizeBytes32(catchId);
  const normalizedTxHash = normalizeTxHash(txHash);
  if (!normalizedCatchId || !normalizedTxHash) throw new Error("claim transaction missing");

  const receipt = await getFishingPondClient(config).waitForTransactionReceipt({
    hash: normalizedTxHash as Hex,
    confirmations: 1,
    timeout: 90_000,
  });
  if (receipt.status !== "success") throw new Error("claim transaction failed");

  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== config.contractAddress) continue;
    try {
      const decoded = decodeEventLog({
        abi: FISHING_POND_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "CatchClaimed") continue;
      const args = decoded.args;
      if (String(args.catchId).toLowerCase() !== normalizedCatchId) continue;
      return {
        catchId: normalizedCatchId,
        txHash: normalizedTxHash,
        logIndex: Number(log.logIndex),
        fisher: normalizeWalletAddress(args.fisher),
        pondEntryId: args.pondEntryId.toString(),
      };
    } catch {
      continue;
    }
  }

  throw new Error("FishingPond CatchClaimed event not found");
}

export async function resolveFishingPondConfig(env: NodeJS.ProcessEnv = process.env): Promise<FishingPondRuntimeConfig> {
  if (readFishingPondEnv(env, "ENABLED") === "0") return makeDisabledRuntimeConfig();

  const explicitAddress = normalizeAddress(readFishingPondEnv(env, "CONTRACT_ADDRESS"));
  const explicitRpcUrl = (readFishingPondEnv(env, "RPC_URL") || env.MFERLAND_CHAIN_RPC_URL || "").trim();
  const explicitChainId = readPositiveInt(readFishingPondEnv(env, "CHAIN_ID") || env.MFERLAND_CHAIN_ID, 0);
  const configuredPrivateKey = normalizePrivateKey(readFishingPondEnv(env, "AWARD_SIGNER_PRIVATE_KEY"));
  const catchChanceBps = readBps(
    readFishingPondEnv(env, "CATCH_CHANCE_BPS"),
    FISHING_NFT_POND_DEFAULT_CATCH_CHANCE_BPS,
  );
  const voucherTtlMs = readVoucherTtlMs(readFishingPondEnv(env, "VOUCHER_TTL_SECONDS"));
  const allowedCollections = readAllowedCollections(readFishingPondEnv(env, "ALLOWED_COLLECTIONS"));
  const allowlistReady = !isProductionLikeRuntime(env) || allowedCollections.length > 0;

  if (explicitAddress && explicitRpcUrl && explicitChainId && configuredPrivateKey) {
    return {
      enabled: Boolean(getDatabase() && allowlistReady),
      chainId: explicitChainId,
      rpcUrl: explicitRpcUrl,
      contractAddress: explicitAddress,
      catchChanceBps,
      voucherTtlMs,
      allowedCollections,
      awardSignerPrivateKey: configuredPrivateKey,
    };
  }

  const document = await readContractConfigDocument().catch(() => null);
  const contractAddress = explicitAddress || normalizeAddress(document?.addresses?.fishingPond);
  const chainId = explicitChainId || normalizeChainId(document?.chainId);
  const rpcUrl = explicitRpcUrl || String(document?.rpcUrl ?? "").trim() || getDefaultRpcUrl(chainId);
  const awardSignerPrivateKey = configuredPrivateKey;
  const enabled = Boolean(contractAddress && rpcUrl && chainId && awardSignerPrivateKey && getDatabase() && allowlistReady);

  return {
    enabled,
    chainId: chainId || LOCAL_CHAIN_ID,
    rpcUrl: rpcUrl || DEFAULT_LOCAL_RPC_URL,
    contractAddress,
    catchChanceBps,
    voucherTtlMs,
    allowedCollections,
    awardSignerPrivateKey: awardSignerPrivateKey || ZERO_PRIVATE_KEY,
  };
}

function readFishingPondEnv(env: NodeJS.ProcessEnv, key: string) {
  return env[`MFERLAND_FISHING_POND_${key}`] || env[`MFERLAND_FISHING_NFT_POND_${key}`] || "";
}

function readAllowedCollections(value: unknown) {
  if (typeof value !== "string") return [];
  const seen = new Set<string>();
  for (const part of value.split(/[,\s]+/)) {
    const address = normalizeAddress(part);
    if (address) seen.add(address);
  }
  return [...seen].sort();
}

function isFishingPondCollectionAllowed(config: FishingPondRuntimeConfig, collection: string) {
  return config.allowedCollections.length <= 0 || config.allowedCollections.includes(collection);
}

function maxBigInt(a: bigint, b: bigint) {
  return a >= b ? a : b;
}

export function makeFishingNftCatchSnapshotFromVoucher({
  status,
  walletAddress,
  voucher,
  metadata = null,
  txHash = "",
  error = "",
}: {
  status: FishingNftCatchSnapshot["status"];
  walletAddress: string;
  voucher: FishingNftClaimVoucher;
  metadata?: FishingNftMetadataSnapshot | null;
  txHash?: string;
  error?: string;
}): FishingNftCatchSnapshot {
  return {
    catchId: voucher.catchId,
    status,
    walletActionRequired: status === "voucher_issued" || status === "tx_submitted",
    walletAddress: normalizeWalletAddress(walletAddress),
    standard: voucher.standard,
    collection: voucher.collection,
    tokenId: voucher.tokenId,
    amount: voucher.amount,
    pondEntryId: voucher.pondEntryId,
    chainId: voucher.chainId,
    contractAddress: voucher.verifyingContract,
    expiresAt: voucher.expiresAt,
    txHash: txHash || undefined,
    error: error || undefined,
    metadata: metadata || undefined,
    voucher: status === "voucher_issued" ? voucher : undefined,
  };
}

async function readFishingPondTokenUri(entry: FishingPondEntrySnapshot, config: FishingPondRuntimeConfig) {
  const client = getFishingPondClient(config);
  const tokenId = BigInt(entry.tokenId);
  const primaryFunctionName = entry.standard === "ERC1155" ? "uri" : "tokenURI";
  const fallbackFunctionName = entry.standard === "ERC1155" ? "tokenURI" : "uri";
  const rawUri = await client.readContract({
    address: entry.collection as Hex,
    abi: NFT_METADATA_ABI,
    functionName: primaryFunctionName,
    args: [tokenId],
  }).catch(async () => client.readContract({
    address: entry.collection as Hex,
    abi: NFT_METADATA_ABI,
    functionName: fallbackFunctionName,
    args: [tokenId],
  }).catch(() => ""));
  if (typeof rawUri !== "string" || !rawUri.trim()) return "";
  return normalizeMetadataUri(replaceErc1155TokenId(rawUri, tokenId));
}

async function readNftMetadataJson(tokenUri: string): Promise<Record<string, unknown> | null> {
  const normalizedUri = normalizeMetadataUri(tokenUri);
  if (!normalizedUri) return null;

  try {
    const text = normalizedUri.startsWith("data:")
      ? readDataUriText(normalizedUri)
      : await fetchMetadataText(normalizedUri);
    if (!text || text.length > MAX_NFT_METADATA_BYTES) return null;
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function fetchMetadataText(uri: string) {
  if (await resolvesToBlockedMetadataAddress(uri)) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NFT_METADATA_TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      headers: { accept: "application/json,text/plain;q=0.8,*/*;q=0.2" },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_NFT_METADATA_BYTES) return "";
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function readDataUriText(uri: string) {
  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) return "";
  const metadata = uri.slice(5, commaIndex).toLowerCase();
  if (!metadata.startsWith("application/json")) return "";
  const payload = uri.slice(commaIndex + 1);
  return metadata.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
}

function replaceErc1155TokenId(uri: string, tokenId: bigint) {
  const hexTokenId = tokenId.toString(16).padStart(64, "0");
  return uri.replace(/\{id\}/gi, hexTokenId);
}

function normalizeMetadataUri(value: string) {
  const trimmed = sanitizeMetadataText(value, 1000);
  if (!trimmed) return "";
  if (trimmed.startsWith("data:application/json")) return trimmed;
  const absoluteUri = normalizeNftUri(trimmed);
  if (!absoluteUri) return "";
  return isBlockedMetadataFetchUrl(absoluteUri) ? "" : absoluteUri;
}

function normalizeNftMediaUri(value: string, metadataUri = "") {
  const trimmed = sanitizeMetadataText(value, 1000);
  if (!trimmed) return "";
  if (/^data:image\/(png|jpe?g|gif|webp);/i.test(trimmed)) return trimmed;

  const absoluteUri = normalizeNftUri(trimmed, metadataUri);
  if (!absoluteUri) return "";
  const protocol = readUrlProtocol(absoluteUri);
  return protocol === "http:" || protocol === "https:" ? absoluteUri : "";
}

function normalizeNftUri(value: string, baseUri = "") {
  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `https://ipfs.io/ipfs/${path}` : "";
  }
  if (value.startsWith("ar://")) {
    const path = value.slice("ar://".length);
    return path ? `https://arweave.net/${path}` : "";
  }

  try {
    const url = baseUri && !value.match(/^[a-z][a-z0-9+.-]*:/i)
      ? new URL(value, baseUri)
      : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isBlockedMetadataFetchUrl(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    const host = normalizeMetadataHost(url.hostname);
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (isBlockedIpv4Host(host) || isBlockedIpv6Host(host)) return true;
    return false;
  } catch {
    return true;
  }
}

async function resolvesToBlockedMetadataAddress(uri: string) {
  try {
    const url = new URL(uri);
    const host = normalizeMetadataHost(url.hostname);
    if (!host || isIP(host)) return false;
    const records = await lookup(host, { all: true, verbatim: true });
    return records.some((record) => {
      const address = normalizeMetadataHost(record.address);
      return isBlockedIpv4Host(address) || isBlockedIpv6Host(address);
    });
  } catch {
    return true;
  }
}

function normalizeMetadataHost(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)]$/, "$1").split("%")[0];
}

function isBlockedIpv4Host(host: string) {
  if (isIP(host) !== 4) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19));
}

function isBlockedIpv6Host(host: string) {
  if (isIP(host) !== 6) return false;
  return host === "::"
    || host === "::1"
    || host === "0:0:0:0:0:0:0:1"
    || host.startsWith("::ffff:")
    || host.startsWith("64:ff9b:")
    || host.startsWith("fe80:")
    || host.startsWith("fc")
    || host.startsWith("fd");
}

function readUrlProtocol(uri: string) {
  try {
    return new URL(uri).protocol;
  } catch {
    return "";
  }
}

function readMetadataString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeMetadataText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getFishingPondClient(config: FishingPondRuntimeConfig) {
  return createPublicClient({
    chain: config.chainId === base.id ? base : undefined,
    transport: http(config.rpcUrl),
  });
}

async function readContractConfigDocument(): Promise<CryptoContractsDocument> {
  const configPath = findContractConfigPath();
  return JSON.parse(await readFile(configPath, "utf8")) as CryptoContractsDocument;
}

function findContractConfigPath() {
  const configured = process.env.MFERLAND_FISHING_POND_CONTRACTS_FILE?.trim()
    || process.env.MFERLAND_CRYPTO_CONTRACTS_FILE?.trim();
  const localCandidates = [
    resolve(process.cwd(), "apps/web/public/crypto/local-contracts.json"),
    resolve(process.cwd(), "../web/public/crypto/local-contracts.json"),
    fileURLToPath(new URL("../../../web/public/crypto/local-contracts.json", import.meta.url)),
  ];
  const productionCandidates = [
    resolve(process.cwd(), "apps/web/public/crypto/production-contracts.json"),
    fileURLToPath(new URL("../../../web/public/crypto/production-contracts.json", import.meta.url)),
  ];
  const candidates = [
    configured,
    ...(isProductionLikeRuntime() ? productionCandidates : localCandidates),
    ...(isProductionLikeRuntime() ? [] : productionCandidates),
  ].filter((path): path is string => Boolean(path));

  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("crypto contract config file was not found");
  return found;
}

function makeDisabledRuntimeConfig(): FishingPondRuntimeConfig {
  return {
    enabled: false,
    chainId: LOCAL_CHAIN_ID,
    rpcUrl: DEFAULT_LOCAL_RPC_URL,
    contractAddress: "",
    catchChanceBps: 0,
    voucherTtlMs: FISHING_NFT_POND_VOUCHER_TTL_MS,
    allowedCollections: [],
    awardSignerPrivateKey: ZERO_PRIVATE_KEY,
  };
}

function makeDisabledFishingPondConfig(authoritative = true): FishingNftPondConfig {
  return {
    authoritative,
    enabled: false,
    chainId: LOCAL_CHAIN_ID,
    contractAddress: "",
    rpcUrl: DEFAULT_LOCAL_RPC_URL,
    catchChanceBps: FISHING_NFT_POND_DEFAULT_CATCH_CHANCE_BPS,
    perWalletDailyCap: FISHING_NFT_POND_DEFAULT_WALLET_DAILY_CAP,
    globalDailyCap: FISHING_NFT_POND_DEFAULT_GLOBAL_DAILY_CAP,
    walletDailyRemaining: 0,
    globalDailyRemaining: null,
    stocked: false,
    drainMode: false,
    randomness: FISHING_NFT_POND_RANDOMNESS_NOTE,
  };
}

function getDefaultRpcUrl(chainId: number) {
  if (chainId === LOCAL_CHAIN_ID) return DEFAULT_LOCAL_RPC_URL;
  if (chainId === base.id) return "https://mainnet.base.org";
  return "";
}

function normalizeChainId(value: unknown) {
  const chainId = Number(value);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : LOCAL_CHAIN_ID;
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function normalizeBytes32(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function normalizeTxHash(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function normalizePrivateKey(value: unknown): Hex | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (/^0x[0-9a-f]{64}$/.test(normalized) && normalized !== ZERO_PRIVATE_KEY) return normalized as Hex;
  return "";
}

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBps(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : fallback;
}

function readVoucherTtlMs(value: unknown) {
  const ttlSeconds = readPositiveInt(value, FISHING_NFT_POND_VOUCHER_TTL_MS / 1000);
  return Math.min(ttlSeconds * 1000, FISHING_NFT_POND_MAX_VOUCHER_TTL_MS);
}

function isProductionLikeRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.MFERLAND_SERVE_WEB_DIST === "1";
}

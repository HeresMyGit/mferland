import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ONCHAIN_FISHING_ROD_DEFAULT_LABEL,
  ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_LABEL,
  ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_WEI,
  ONCHAIN_FISHING_ROD_ITEM_ID,
  normalizeWalletAddress,
  type FishingWalletNftSnapshot,
  type OnchainFishingRodMintFunction,
  type OnchainFishingRodMintMode,
  type OnchainFishingRodRequirementSnapshot,
  type OnchainFishingRodStandard,
} from "@mferland/shared";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

type CryptoContractsDocument = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    onchainFishingRod?: string;
  };
  onchainFishingRod?: {
    enabled?: boolean | string;
    required?: boolean | string;
    chainId?: number | string;
    rpcUrl?: string;
    contractAddress?: string;
    standard?: string;
    tokenId?: string;
    label?: string;
    description?: string;
    image?: string;
    mintUrl?: string;
    mintMode?: string;
    mintContractAddress?: string;
    mintFunction?: string;
    mintInstanceId?: string;
    mintIndex?: number | string;
    mintMerkleProof?: string | string[];
    mintNativeValueWei?: string;
    mintPaymentTokenAddress?: string;
    mintPaymentSpenderAddress?: string;
    mintPriceAmountWei?: string;
    mintPriceLabel?: string;
  };
};

export type OnchainFishingRodRuntimeConfig = {
  enabled: boolean;
  required: boolean;
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  standard: OnchainFishingRodStandard;
  tokenId: string;
  label: string;
  mintUrl: string;
  mintMode: OnchainFishingRodMintMode;
  mintContractAddress: string;
  mintFunction: OnchainFishingRodMintFunction;
  mintInstanceId: string;
  mintIndex: number;
  mintMerkleProof: Hex[];
  mintNativeValueWei: string;
  mintPaymentTokenAddress: string;
  mintPaymentSpenderAddress: string;
  mintPriceAmountWei: string;
  mintPriceLabel: string;
  image: string;
  description: string;
  adminMintEnabled: boolean;
  adminMintPaymentRequired: boolean;
  adminMintPrivateKey: Hex | "";
};

const LOCAL_CHAIN_ID = 31337;
const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";
const ERC721_BALANCE_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);
const ERC721_MINT_ABI = parseAbi([
  "function mint(address to) returns (uint256)",
]);
const ERC1155_BALANCE_ABI = parseAbi([
  "function balanceOf(address account,uint256 id) view returns (uint256)",
]);

export type OnchainFishingRodMintConfirmation = {
  txHash: string;
  walletNft: FishingWalletNftSnapshot;
  alreadyOwned: boolean;
};

export async function readOnchainFishingRodRequirement(
  walletAddress: string,
  config?: OnchainFishingRodRuntimeConfig,
): Promise<OnchainFishingRodRequirementSnapshot> {
  config ??= await resolveOnchainFishingRodConfig();
  if (!config.enabled) return makeOnchainFishingRodSnapshot(config, false);

  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return makeOnchainFishingRodSnapshot(config, false, "wallet required");

  try {
    const client = getOnchainFishingRodClient(config);
    const balance = config.standard === "ERC1155"
      ? await client.readContract({
        address: config.contractAddress as Hex,
        abi: ERC1155_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallet as Hex, BigInt(config.tokenId || "0")],
      })
      : await client.readContract({
        address: config.contractAddress as Hex,
        abi: ERC721_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallet as Hex],
      });
    return makeOnchainFishingRodSnapshot(config, balance > 0n);
  } catch (error) {
    return makeOnchainFishingRodSnapshot(
      config,
      false,
      error instanceof Error ? error.message : "rod ownership check failed",
    );
  }
}

export function isOnchainFishingRodRequirementSatisfied(snapshot: OnchainFishingRodRequirementSnapshot) {
  return !snapshot.enabled || !snapshot.required || snapshot.walletOwnsRod;
}

export async function readOnchainFishingRodWalletNft(
  walletAddress: string,
  config?: OnchainFishingRodRuntimeConfig,
): Promise<FishingWalletNftSnapshot | null> {
  config ??= await resolveOnchainFishingRodConfig();
  const requirement = await readOnchainFishingRodRequirement(walletAddress, config);
  if (!requirement.enabled || !requirement.walletOwnsRod || !requirement.contractAddress) return null;
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return null;
  const tokenId = config.standard === "ERC1155" ? config.tokenId || "0" : "owned";
  const id = [
    "onchain-fishing-rod",
    String(config.chainId),
    config.contractAddress.toLowerCase(),
    config.standard,
    tokenId,
  ].join(":");
  return {
    id,
    walletAddress: wallet,
    standard: config.standard,
    collection: config.contractAddress,
    tokenId,
    amount: "1",
    chainId: config.chainId,
    itemId: ONCHAIN_FISHING_ROD_ITEM_ID,
    label: config.label,
    description: config.description || "wallet-held NFT required for onchain goodies at the pond",
    image: config.image || undefined,
    action: "hold",
  };
}

export async function mintOnchainFishingRodForWallet(
  walletAddress: string,
  config?: OnchainFishingRodRuntimeConfig,
): Promise<OnchainFishingRodMintConfirmation> {
  config ??= await resolveOnchainFishingRodConfig();
  if (!config.enabled || !config.contractAddress) throw new Error("onchain fishing rod unavailable");
  if (!config.adminMintEnabled) throw new Error("onchain fishing rod minting unavailable");
  if (config.standard !== "ERC721") throw new Error("server rod mint supports ERC-721 rods only");
  if (!config.adminMintPrivateKey) throw new Error("onchain fishing rod minter unavailable");

  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) throw new Error("wallet required");

  const existing = await readOnchainFishingRodWalletNft(wallet, config);
  if (existing) return { txHash: "", walletNft: existing, alreadyOwned: true };

  const account = privateKeyToAccount(config.adminMintPrivateKey);
  const publicClient = getOnchainFishingRodClient(config);
  const walletClient = createWalletClient({
    account,
    chain: chainForRodConfig(config),
    transport: http(config.rpcUrl),
  });
  const gas = await publicClient.estimateContractGas({
    account: account.address,
    address: config.contractAddress as Hex,
    abi: ERC721_MINT_ABI,
    functionName: "mint",
    args: [wallet as Hex],
  });
  const txHash = await walletClient.writeContract({
    address: config.contractAddress as Hex,
    abi: ERC721_MINT_ABI,
    functionName: "mint",
    args: [wallet as Hex],
    gas: gas + 30_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") throw new Error("onchain fishing rod mint failed");

  const walletNft = await readOnchainFishingRodWalletNft(wallet, config);
  if (!walletNft) throw new Error("onchain fishing rod ownership not found after mint");
  return { txHash, walletNft, alreadyOwned: false };
}

export async function resolveOnchainFishingRodConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OnchainFishingRodRuntimeConfig> {
  const explicitEnabled = readRodEnv(env, "ENABLED");
  if (explicitEnabled === "0" || explicitEnabled.toLowerCase() === "false") return makeDisabledConfig();

  const explicitAddress = normalizeAddress(readRodEnv(env, "CONTRACT_ADDRESS"));
  const explicitRpcUrl = (readRodEnv(env, "RPC_URL") || env.MFERLAND_CHAIN_RPC_URL || "").trim();
  const explicitChainId = readPositiveInt(readRodEnv(env, "CHAIN_ID") || env.MFERLAND_CHAIN_ID, 0);
  const document = explicitAddress && explicitRpcUrl && explicitChainId
    ? null
    : await readContractConfigDocument().catch(() => null);
  const rodDocument = document?.onchainFishingRod;
  const contractAddress = explicitAddress
    || normalizeAddress(rodDocument?.contractAddress)
    || normalizeAddress(document?.addresses?.onchainFishingRod);
  const chainId = explicitChainId || normalizeChainId(rodDocument?.chainId ?? document?.chainId);
  const rpcUrl = explicitRpcUrl || String(rodDocument?.rpcUrl ?? document?.rpcUrl ?? "").trim() || getDefaultRpcUrl(chainId);
  const enabled = explicitEnabled
    ? readBoolean(explicitEnabled, false) && Boolean(contractAddress && chainId && rpcUrl)
    : rodDocument?.enabled !== undefined
      ? readBoolean(rodDocument.enabled, false) && Boolean(contractAddress && chainId && rpcUrl)
    : Boolean(contractAddress && chainId && rpcUrl);

  return {
    enabled,
    required: readBoolean(readRodEnv(env, "REQUIRED") || rodDocument?.required, true),
    chainId: chainId || LOCAL_CHAIN_ID,
    rpcUrl: rpcUrl || DEFAULT_LOCAL_RPC_URL,
    contractAddress,
    standard: normalizeRodStandard(readRodEnv(env, "STANDARD") || rodDocument?.standard),
    tokenId: sanitizeTokenId(readRodEnv(env, "TOKEN_ID") || rodDocument?.tokenId),
    label: sanitizeLabel(readRodEnv(env, "LABEL") || rodDocument?.label) || ONCHAIN_FISHING_ROD_DEFAULT_LABEL,
    mintUrl: sanitizeUrl(readRodEnv(env, "MINT_URL") || rodDocument?.mintUrl),
    mintMode: normalizeMintMode(readRodEnv(env, "MINT_MODE") || readRodEnv(env, "MINT_PATH") || rodDocument?.mintMode),
    mintContractAddress: normalizeAddress(readRodEnv(env, "MINT_CONTRACT_ADDRESS") || rodDocument?.mintContractAddress) || contractAddress,
    mintFunction: normalizeMintFunction(readRodEnv(env, "MINT_FUNCTION") || rodDocument?.mintFunction),
    mintInstanceId: sanitizeTokenAmountWei(readRodEnv(env, "MINT_INSTANCE_ID") || rodDocument?.mintInstanceId),
    mintIndex: sanitizeMintIndex(readRodEnv(env, "MINT_INDEX") || rodDocument?.mintIndex),
    mintMerkleProof: sanitizeMerkleProof(readRodEnv(env, "MINT_MERKLE_PROOF") || rodDocument?.mintMerkleProof),
    mintNativeValueWei: sanitizeTokenAmountWei(
      readRodEnv(env, "MINT_NATIVE_VALUE_WEI")
        || rodDocument?.mintNativeValueWei
        || readRodEnv(env, "MINT_FEE_WEI")
        || readRodEnv(env, "MINT_VALUE_WEI"),
    ),
    mintPaymentTokenAddress: normalizeAddress(readRodEnv(env, "MINT_PAYMENT_TOKEN_ADDRESS") || rodDocument?.mintPaymentTokenAddress || env.MFERLAND_MFERGPT_TOKEN_ADDRESS),
    mintPaymentSpenderAddress: normalizeAddress(readRodEnv(env, "MINT_PAYMENT_SPENDER_ADDRESS") || rodDocument?.mintPaymentSpenderAddress || readRodEnv(env, "MINT_CONTRACT_ADDRESS")) || contractAddress,
    mintPriceAmountWei: sanitizeTokenAmountWei(readRodEnv(env, "MINT_PRICE_AMOUNT_WEI") || rodDocument?.mintPriceAmountWei) || ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_WEI,
    mintPriceLabel: sanitizeLabel(readRodEnv(env, "MINT_PRICE_LABEL") || rodDocument?.mintPriceLabel) || ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_LABEL,
    image: sanitizeUrl(readRodEnv(env, "IMAGE") || rodDocument?.image),
    description: sanitizeLabel(readRodEnv(env, "DESCRIPTION") || rodDocument?.description),
    adminMintEnabled: readBoolean(readRodEnv(env, "ADMIN_MINT_ENABLED"), false),
    adminMintPaymentRequired: readBoolean(readRodEnv(env, "ADMIN_MINT_PAYMENT_REQUIRED"), true),
    adminMintPrivateKey: normalizePrivateKey(
      readRodEnv(env, "ADMIN_MINT_PRIVATE_KEY") || env.MFERLAND_FISHING_POND_AWARD_SIGNER_PRIVATE_KEY || "",
    ),
  };
}

function makeOnchainFishingRodSnapshot(
  config: OnchainFishingRodRuntimeConfig,
  walletOwnsRod: boolean,
  error = "",
): OnchainFishingRodRequirementSnapshot {
  return {
    enabled: config.enabled,
    required: config.required,
    walletOwnsRod,
    walletActionRequired: Boolean(config.enabled && config.required && !walletOwnsRod),
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    standard: config.standard,
    tokenId: config.tokenId,
    label: config.label,
    mintUrl: config.mintUrl || undefined,
    mintPriceAmountWei: config.mintPriceAmountWei,
    mintPriceLabel: config.mintPriceLabel,
    mintMode: config.mintMode,
    mintContractAddress: config.mintContractAddress || undefined,
    mintFunction: config.mintFunction,
    mintInstanceId: config.mintInstanceId || undefined,
    mintIndex: config.mintIndex || undefined,
    mintMerkleProof: config.mintMerkleProof.length > 0 ? config.mintMerkleProof : undefined,
    mintNativeValueWei: config.mintNativeValueWei || undefined,
    mintPaymentTokenAddress: config.mintPaymentTokenAddress || undefined,
    mintPaymentSpenderAddress: config.mintPaymentSpenderAddress || undefined,
    adminMintEnabled: config.adminMintEnabled || undefined,
    adminMintPaymentRequired: config.adminMintEnabled ? config.adminMintPaymentRequired : undefined,
    error: error || undefined,
  };
}

function makeDisabledConfig(): OnchainFishingRodRuntimeConfig {
  return {
    enabled: false,
    required: false,
    chainId: LOCAL_CHAIN_ID,
    rpcUrl: DEFAULT_LOCAL_RPC_URL,
    contractAddress: "",
    standard: "ERC721",
    tokenId: "",
    label: ONCHAIN_FISHING_ROD_DEFAULT_LABEL,
    mintUrl: "",
    mintMode: "url",
    mintContractAddress: "",
    mintFunction: "mint",
    mintInstanceId: "",
    mintIndex: 0,
    mintMerkleProof: [],
    mintNativeValueWei: "",
    mintPaymentTokenAddress: "",
    mintPaymentSpenderAddress: "",
    mintPriceAmountWei: ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_WEI,
    mintPriceLabel: ONCHAIN_FISHING_ROD_MFERGPT_AMOUNT_LABEL,
    image: "",
    description: "",
    adminMintEnabled: false,
    adminMintPaymentRequired: true,
    adminMintPrivateKey: "",
  };
}

async function readContractConfigDocument(): Promise<CryptoContractsDocument> {
  const configPath = findContractConfigPath();
  return JSON.parse(await readFile(configPath, "utf8")) as CryptoContractsDocument;
}

function findContractConfigPath() {
  const configured = process.env.MFERLAND_ONCHAIN_FISHING_ROD_CONTRACTS_FILE?.trim()
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

function getOnchainFishingRodClient(config: OnchainFishingRodRuntimeConfig) {
  return createPublicClient({
    chain: chainForRodConfig(config),
    transport: http(config.rpcUrl),
  });
}

function chainForRodConfig(config: OnchainFishingRodRuntimeConfig) {
  return config.chainId === base.id ? base : config.chainId === baseSepolia.id ? baseSepolia : undefined;
}

function readRodEnv(env: NodeJS.ProcessEnv, key: string) {
  return (env[`MFERLAND_ONCHAIN_FISHING_ROD_${key}`] || env[`MFERLAND_FISHING_ROD_${key}`] || "").trim();
}

function normalizeRodStandard(value: unknown): OnchainFishingRodStandard {
  return typeof value === "string" && value.trim().toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721";
}

function normalizeMintMode(value: unknown): OnchainFishingRodMintMode {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["server", "admin", "server_admin"].includes(normalized)) return "server";
  if (["url", "external", "link"].includes(normalized)) return "url";
  return "wallet";
}

function normalizeMintFunction(value: unknown): OnchainFishingRodMintFunction {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["manifold", "manifoldclaim", "manifold_claim", "claim", "claimpage", "claim_page"].includes(normalized)) return "manifoldClaim";
  if (["mintto", "mint_to", "mint(address)"].includes(normalized)) return "mintTo";
  if (["mintquantity", "mint_quantity", "mint(uint256)"].includes(normalized)) return "mintQuantity";
  if (["minttoquantity", "mint_to_quantity", "mint(address,uint256)"].includes(normalized)) return "mintToQuantity";
  return "mint";
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function sanitizeTokenId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function sanitizeLabel(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function sanitizeUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeTokenAmountWei(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d+$/.test(text) ? text : "";
}

function sanitizeMintIndex(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = text ? Number(text) : 0;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff ? parsed : 0;
}

function sanitizeMerkleProof(value: unknown): Hex[] {
  const parts = Array.isArray(value)
    ? value.map((part) => String(part))
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  return parts
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is Hex => /^0x[a-f0-9]{64}$/.test(part));
}

function normalizePrivateKey(value: unknown): Hex | "" {
  const text = typeof value === "string" ? value.trim() : "";
  return /^0x[0-9a-fA-F]{64}$/.test(text) ? text as Hex : "";
}

function getDefaultRpcUrl(chainId: number) {
  if (chainId === LOCAL_CHAIN_ID) return DEFAULT_LOCAL_RPC_URL;
  if (chainId === base.id) return "https://mainnet.base.org";
  if (chainId === baseSepolia.id) return "https://sepolia.base.org";
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

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isProductionLikeRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" || env.MFERLAND_SERVE_WEB_DIST === "1";
}

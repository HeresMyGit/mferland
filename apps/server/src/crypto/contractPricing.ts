import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TRAIT_CHANGE_PRODUCT_ID } from "@mferland/shared";
import type { CryptoMarketQuoteView } from "./marketQuotes.js";

const BASIS_POINTS = 10_000n;
const TOKEN_UNIT = 10n ** 18n;
const DEFAULT_CONTRACT_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CONTRACT_DRIFT_BPS = 2_500n;
const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";
const LOCAL_CHAIN_ID = 31337;

const PRICING_ABI = parseAbi([
  "function SEASON_0_PASS_PRODUCT_ID() view returns (bytes32)",
  "function gearProductId(uint16 gearType) pure returns (bytes32)",
  "function getProductPrice(bytes32 productId) view returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt)",
  "function owner() view returns (address)",
  "function setSeason0PassPrice(uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)",
  "function setGearPrice(uint16 gearType, uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)",
  "function setProductPrice(bytes32 productId, uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)",
]);

const PRICED_PRODUCTS = [
  { kind: "pass", label: "season0-pass" },
  { kind: "gear", label: "posted-up deck", gearType: 1 },
  { kind: "gear", label: "posted-up laptop lid", gearType: 2 },
  { kind: "gear", label: "last-cig lighter", gearType: 3 },
  { kind: "product", label: "trait-change", productId: TRAIT_CHANGE_PRODUCT_ID },
] as const;

type PricingProduct = typeof PRICED_PRODUCTS[number];

type CryptoContractsDocument = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    pricing?: string;
  };
};

type ContractPricingConfig = {
  chainId: number;
  rpcUrl: string;
  pricingAddress: Address;
  explicit: boolean;
};

type ContractPrice = {
  ethPrice: bigint;
  mferPrice: bigint;
  mferGptPrice: bigint;
  updatedAt: bigint;
};

type PricingUpdaterAccount = Address | LocalAccount;

export type CryptoProductContractPrice = {
  chainId: number;
  pricingAddress: Address;
  ethPriceWei: string;
  mferPriceWei: string;
  mferGptPriceWei: string;
  updatedAt: string;
};

export type CryptoContractPriceUpdateResult = {
  ok: boolean;
  disabled: boolean;
  checked: number;
  updated: Array<{
    product: string;
    txHash: string;
    reason: string;
    ethPriceWei: string;
    mferPriceWei: string;
    mferGptPriceWei: string;
  }>;
  skipped: Array<{
    product: string;
    reason: string;
  }>;
  errors: Array<{
    product: string;
    error: string;
  }>;
};

export async function maybeUpdateCryptoContractPrices(
  quotes: CryptoMarketQuoteView[],
): Promise<CryptoContractPriceUpdateResult> {
  const result: CryptoContractPriceUpdateResult = {
    ok: true,
    disabled: false,
    checked: 0,
    updated: [],
    skipped: [],
    errors: [],
  };

  const config = await getContractPricingConfig();
  if (!config) return { ...result, disabled: true };

  const mferEthPriceWei = quoteEthPriceWei(quotes, "$mfer");
  const mferGptEthPriceWei = quoteEthPriceWei(quotes, "MFERGPT");
  if (!mferEthPriceWei || !mferGptEthPriceWei) {
    return {
      ...result,
      ok: false,
      errors: [{
        product: "catalog",
        error: "Both $mfer/WETH and MFERGPT/WETH quotes are required before contract prices can update",
      }],
    };
  }

  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ transport: http(config.rpcUrl) });
  const owner = await publicClient.readContract({
    address: config.pricingAddress,
    abi: PRICING_ABI,
    functionName: "owner",
  });
  const account = getPricingUpdaterAccount(owner);
  const updateIntervalMs = getContractUpdateIntervalMs();
  const driftBps = getContractDriftBps();
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  for (const product of PRICED_PRODUCTS) {
    result.checked += 1;
    const productLabel = getProductLabel(product);

    try {
      const current = await readProductPrice(publicClient, config.pricingAddress, product);
      if (current.ethPrice <= 0n) {
        result.skipped.push({ product: productLabel, reason: "ETH price is not set onchain" });
        continue;
      }

      const next = {
        ethPrice: current.ethPrice,
        mferPrice: calculateDiscountedTokenPriceWei(current.ethPrice, mferEthPriceWei, 1_000n),
        mferGptPrice: calculateDiscountedTokenPriceWei(current.ethPrice, mferGptEthPriceWei, 2_500n),
      };
      const reason = getUpdateReason({
        current,
        nextMferPrice: next.mferPrice,
        nextMferGptPrice: next.mferGptPrice,
        nowSeconds,
        updateIntervalMs,
        driftBps,
      });

      if (!reason) {
        result.skipped.push({ product: productLabel, reason: "price age and drift are within threshold" });
        continue;
      }

      const txHash = await writeProductPrice({
        walletClient,
        account,
        pricingAddress: config.pricingAddress,
        product,
        next,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      result.updated.push({
        product: productLabel,
        txHash,
        reason,
        ethPriceWei: next.ethPrice.toString(),
        mferPriceWei: next.mferPrice.toString(),
        mferGptPriceWei: next.mferGptPrice.toString(),
      });
    } catch (error) {
      result.ok = false;
      result.errors.push({
        product: productLabel,
        error: error instanceof Error ? error.message : "Unknown contract price update error",
      });
    }
  }

  return result;
}

export async function readCryptoProductPriceWei(productIdText: string): Promise<CryptoProductContractPrice | null> {
  const config = await getContractPricingConfig({ requireUpdater: false });
  if (!config) return null;

  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const [ethPrice, mferPrice, mferGptPrice, updatedAt] = await publicClient.readContract({
    address: config.pricingAddress,
    abi: PRICING_ABI,
    functionName: "getProductPrice",
    args: [hashTextProductId(productIdText)],
  });

  return {
    chainId: config.chainId,
    pricingAddress: config.pricingAddress,
    ethPriceWei: ethPrice.toString(),
    mferPriceWei: mferPrice.toString(),
    mferGptPriceWei: mferGptPrice.toString(),
    updatedAt: BigInt(updatedAt).toString(),
  };
}

export function calculateDiscountedTokenPriceWei(
  ethPriceWei: bigint,
  tokenEthPriceWei: bigint,
  discountBps: bigint,
) {
  if (ethPriceWei <= 0n || tokenEthPriceWei <= 0n) throw new Error("price inputs must be greater than zero");
  if (discountBps < 0n || discountBps >= BASIS_POINTS) throw new Error("discount bps is out of range");
  const discountedEthWei = ethPriceWei * (BASIS_POINTS - discountBps) / BASIS_POINTS;
  return ceilDiv(discountedEthWei * TOKEN_UNIT, tokenEthPriceWei);
}

async function getContractPricingConfig(options: { requireUpdater?: boolean } = {}): Promise<ContractPricingConfig | null> {
  if (process.env.MFERLAND_CONTRACT_PRICING_DISABLED === "1") return null;

  const envPricingAddress = normalizeAddress(process.env.MFERLAND_PRICING_CONTRACT_ADDRESS);
  const envRpc = (process.env.MFERLAND_PRICING_RPC_URL ?? process.env.MFERLAND_CHAIN_RPC_URL ?? "").trim();
  const envChainId = Number(process.env.MFERLAND_PRICING_CHAIN_ID ?? process.env.MFERLAND_CHAIN_ID ?? "");
  const explicit = Boolean(envPricingAddress || process.env.MFERLAND_CONTRACT_PRICING_UPDATER === "1");

  const document = await readContractConfigDocument().catch(() => null);
  const chainId = Number.isInteger(envChainId) && envChainId > 0
    ? envChainId
    : Number.isInteger(document?.chainId) && Number(document?.chainId) > 0
      ? Number(document?.chainId)
      : LOCAL_CHAIN_ID;
  const pricingAddress = envPricingAddress || normalizeAddress(document?.addresses?.pricing);
  const rpcUrl = envRpc || String(document?.rpcUrl ?? "").trim() || (chainId === LOCAL_CHAIN_ID ? DEFAULT_LOCAL_RPC_URL : "");

  if (!pricingAddress || !rpcUrl) return null;

  const localAutoEnabled = chainId === LOCAL_CHAIN_ID
    && process.env.NODE_ENV !== "production"
    && process.env.MFERLAND_CONTRACT_PRICING_UPDATER !== "0";
  if (options.requireUpdater !== false && !explicit && !localAutoEnabled) return null;

  return {
    chainId,
    rpcUrl,
    pricingAddress,
    explicit,
  };
}

async function readContractConfigDocument() {
  const configPath = findContractConfigPath();
  return JSON.parse(await readFile(configPath, "utf8")) as CryptoContractsDocument;
}

function findContractConfigPath() {
  const configured = process.env.MFERLAND_PRICING_CONTRACTS_FILE?.trim()
    || process.env.MFERLAND_CRYPTO_CONTRACTS_FILE?.trim();
  const candidates = [
    configured,
    resolve(process.cwd(), "apps/web/public/crypto/local-contracts.json"),
    resolve(process.cwd(), "../web/public/crypto/local-contracts.json"),
    fileURLToPath(new URL("../../../web/public/crypto/local-contracts.json", import.meta.url)),
    resolve(process.cwd(), "apps/web/public/crypto/production-contracts.json"),
    fileURLToPath(new URL("../../../web/public/crypto/production-contracts.json", import.meta.url)),
  ].filter((path): path is string => Boolean(path));

  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("crypto contract config file was not found");
  return found;
}

function getPricingUpdaterAccount(owner: Address): PricingUpdaterAccount {
  const privateKey = normalizePrivateKey(process.env.MFERLAND_PRICING_OWNER_PRIVATE_KEY);
  if (privateKey) return privateKeyToAccount(privateKey);

  const accountAddress = normalizeAddress(process.env.MFERLAND_PRICING_OWNER_ADDRESS);
  return accountAddress || owner;
}

async function readProductPrice(
  publicClient: ReturnType<typeof createPublicClient>,
  pricingAddress: Address,
  product: PricingProduct,
): Promise<ContractPrice> {
  const productId = await resolveProductId(publicClient, pricingAddress, product);
  const [ethPrice, mferPrice, mferGptPrice, updatedAt] = await publicClient.readContract({
    address: pricingAddress,
    abi: PRICING_ABI,
    functionName: "getProductPrice",
    args: [productId],
  });
  return {
    ethPrice,
    mferPrice,
    mferGptPrice,
    updatedAt: BigInt(updatedAt),
  };
}

async function resolveProductId(
  publicClient: ReturnType<typeof createPublicClient>,
  pricingAddress: Address,
  product: PricingProduct,
) {
  if (product.kind === "pass") {
    return publicClient.readContract({
      address: pricingAddress,
      abi: PRICING_ABI,
      functionName: "SEASON_0_PASS_PRODUCT_ID",
    });
  }
  if (product.kind === "gear") {
    return publicClient.readContract({
      address: pricingAddress,
      abi: PRICING_ABI,
      functionName: "gearProductId",
      args: [product.gearType],
    });
  }
  return hashTextProductId(product.productId);
}

async function writeProductPrice({
  walletClient,
  account,
  pricingAddress,
  product,
  next,
}: {
  walletClient: ReturnType<typeof createWalletClient>;
  account: PricingUpdaterAccount;
  pricingAddress: Address;
  product: PricingProduct;
  next: { ethPrice: bigint; mferPrice: bigint; mferGptPrice: bigint };
}) {
  if (product.kind === "pass") {
    return walletClient.writeContract({
      account,
      chain: null,
      address: pricingAddress,
      abi: PRICING_ABI,
      functionName: "setSeason0PassPrice",
      args: [next.ethPrice, next.mferPrice, next.mferGptPrice],
    });
  }
  if (product.kind === "gear") {
    return walletClient.writeContract({
      account,
      chain: null,
      address: pricingAddress,
      abi: PRICING_ABI,
      functionName: "setGearPrice",
      args: [product.gearType, next.ethPrice, next.mferPrice, next.mferGptPrice],
    });
  }
  return walletClient.writeContract({
    account,
    chain: null,
    address: pricingAddress,
    abi: PRICING_ABI,
    functionName: "setProductPrice",
    args: [hashTextProductId(product.productId), next.ethPrice, next.mferPrice, next.mferGptPrice],
  });
}

function getUpdateReason({
  current,
  nextMferPrice,
  nextMferGptPrice,
  nowSeconds,
  updateIntervalMs,
  driftBps,
}: {
  current: ContractPrice;
  nextMferPrice: bigint;
  nextMferGptPrice: bigint;
  nowSeconds: bigint;
  updateIntervalMs: number;
  driftBps: bigint;
}) {
  const maxAgeSeconds = BigInt(Math.floor(updateIntervalMs / 1000));
  if (current.updatedAt === 0n || nowSeconds - current.updatedAt >= maxAgeSeconds) return "age";
  if (hasDrifted(current.mferPrice, nextMferPrice, driftBps)) return "$mfer drift";
  if (hasDrifted(current.mferGptPrice, nextMferGptPrice, driftBps)) return "MFERGPT drift";
  return "";
}

function hasDrifted(currentPrice: bigint, nextPrice: bigint, driftBps: bigint) {
  if (currentPrice <= 0n || nextPrice <= 0n) return true;
  const delta = currentPrice > nextPrice ? currentPrice - nextPrice : nextPrice - currentPrice;
  return delta * BASIS_POINTS >= currentPrice * driftBps;
}

function quoteEthPriceWei(quotes: CryptoMarketQuoteView[], tokenSymbol: "$mfer" | "MFERGPT") {
  const normalizedToken = tokenSymbol.toUpperCase();
  const quote = quotes.find((entry) => entry.tokenSymbol.toUpperCase() === normalizedToken);
  if (!quote) return 0n;
  return parseDecimalToWei(quote.priceNative);
}

function parseDecimalToWei(value: string) {
  const normalized = value.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalized)) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  const parsed = BigInt(whole) * TOKEN_UNIT + BigInt(fraction.slice(0, 18).padEnd(18, "0"));
  return parsed > 0n ? parsed : 0n;
}

function getContractUpdateIntervalMs() {
  const configured = Number(process.env.MFERLAND_CONTRACT_PRICE_UPDATE_INTERVAL_MS ?? "");
  if (Number.isFinite(configured) && configured >= 60_000) return Math.floor(configured);
  return DEFAULT_CONTRACT_UPDATE_INTERVAL_MS;
}

function getContractDriftBps() {
  const configured = process.env.MFERLAND_CONTRACT_PRICE_DRIFT_BPS ?? "";
  if (/^[0-9]+$/.test(configured)) {
    const parsed = BigInt(configured);
    if (parsed > 0n && parsed < BASIS_POINTS) return parsed;
  }
  return DEFAULT_CONTRACT_DRIFT_BPS;
}

function getProductLabel(product: PricingProduct) {
  return product.kind === "gear" ? `${product.label} (${product.gearType})` : product.label;
}

function hashTextProductId(productIdText: string) {
  return keccak256(toHex(productIdText));
}

function normalizeAddress(value: unknown): Address | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized as Address : "";
}

function normalizePrivateKey(value: unknown): Hex | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized as Hex : "";
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

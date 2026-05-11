import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWalletAddress } from "@mferland/shared";

type CryptoContractsDocument = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    gear?: string;
  };
};

export type VerifiedChainGear = {
  tokenId: string;
  gearType: number;
  tier: number;
  owner: string;
  contractAddress: string;
  chainId: number;
};

const OWNER_OF_SELECTOR = "0x6352211e";
const GEAR_SELECTOR = "0xbea80cea";
const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8545";

type ChainGearConfig = {
  chainId: number;
  rpcUrl: string;
  gearAddress: string;
};

export async function verifyChainGearOwnership({
  tokenId,
  walletAddress,
}: {
  tokenId: string;
  walletAddress: string;
}): Promise<VerifiedChainGear | null> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return null;

  const token = normalizeTokenId(tokenId);
  if (!token) return null;

  const config = await getChainGearConfig();
  const owner = normalizeWalletAddress(await readOwnerOf(config, token));
  if (owner !== normalizedWallet) return null;

  const gear = await readGear(config, token);
  return {
    tokenId: token.toString(),
    gearType: gear.gearType,
    tier: gear.tier,
    owner,
    contractAddress: config.gearAddress,
    chainId: config.chainId,
  };
}

async function getChainGearConfig(): Promise<ChainGearConfig> {
  const envGear = normalizeAddress(process.env.MFERLAND_GEAR_CONTRACT_ADDRESS);
  const envRpc = (process.env.MFERLAND_CHAIN_RPC_URL ?? "").trim();
  const envChainId = Number(process.env.MFERLAND_CHAIN_ID ?? "");
  if (envGear && envRpc && Number.isInteger(envChainId) && envChainId > 0) {
    return { chainId: envChainId, rpcUrl: envRpc, gearAddress: envGear };
  }

  const configPath = findContractConfigPath();
  const document = JSON.parse(await readFile(configPath, "utf8")) as CryptoContractsDocument;
  const gearAddress = normalizeAddress(document.addresses?.gear);
  if (!gearAddress) throw new Error("gear contract address is not configured");

  const chainId = Number.isInteger(document.chainId) && Number(document.chainId) > 0 ? Number(document.chainId) : 31337;
  const rpcUrl = envRpc || String(document.rpcUrl ?? "").trim() || (chainId === 31337 ? DEFAULT_LOCAL_RPC_URL : "");
  if (!rpcUrl) throw new Error("chain RPC URL is not configured");

  return { chainId, rpcUrl, gearAddress };
}

function findContractConfigPath() {
  const configured = process.env.MFERLAND_CRYPTO_CONTRACTS_FILE?.trim();
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

async function readOwnerOf(config: ChainGearConfig, tokenId: bigint) {
  const result = await ethCall(config, config.gearAddress, `${OWNER_OF_SELECTOR}${encodeUint(tokenId)}`);
  if (result.length < 66) throw new Error("ownerOf returned an invalid response");
  return `0x${result.slice(-40)}`;
}

async function readGear(config: ChainGearConfig, tokenId: bigint) {
  const result = await ethCall(config, config.gearAddress, `${GEAR_SELECTOR}${encodeUint(tokenId)}`);
  if (result.length < 130) throw new Error("gear returned an invalid response");
  return {
    gearType: Number(BigInt(`0x${result.slice(2, 66)}`)),
    tier: Number(BigInt(`0x${result.slice(66, 130)}`)),
  };
}

async function ethCall(config: ChainGearConfig, to: string, data: string) {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "chain call failed");
  if (typeof payload.result !== "string") throw new Error("chain call returned an invalid response");
  return payload.result;
}

function normalizeTokenId(value: string) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]{1,78}$/.test(text)) return 0n;
  const tokenId = BigInt(text);
  return tokenId > 0n ? tokenId : 0n;
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function encodeUint(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

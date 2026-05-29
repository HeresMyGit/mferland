import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  type MferGptPaymentProof,
} from "@mferland/shared";

type ContractConfig = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    mfergpt?: string;
  };
};

type MferGptBurnerOptions = {
  account: PrivateKeyAccount;
  rpcUrl: string;
  rpcChainId: number;
  proofChainId: number;
  tokenAddress: Address;
  burnAddress: Address;
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export class MferGptBurner {
  private readonly account: PrivateKeyAccount;
  private readonly rpcUrl: string;
  private readonly rpcChainId: number;
  private readonly proofChainId: number;
  private readonly tokenAddress: Address;
  private readonly burnAddress: Address;

  constructor(options: MferGptBurnerOptions) {
    this.account = options.account;
    this.rpcUrl = options.rpcUrl;
    this.rpcChainId = options.rpcChainId;
    this.proofChainId = options.proofChainId;
    this.tokenAddress = options.tokenAddress;
    this.burnAddress = options.burnAddress;
  }

  static fromEnv(account: PrivateKeyAccount) {
    const localConfig = readLocalContractConfig();
    const rpcUrl = cleanString(process.env.AGENT_MFERGPT_RPC_URL)
      || cleanString(process.env.MFERLAND_MFERGPT_PAYMENT_RPC_URL)
      || cleanString(process.env.MFERLAND_TRAIT_PAYMENT_RPC_URL)
      || cleanString(localConfig?.rpcUrl);
    const tokenAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_TOKEN_ADDRESS
      || process.env.MFERLAND_MFERGPT_TOKEN_ADDRESS
      || process.env.MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS
      || localConfig?.addresses?.mfergpt,
    );
    if (!rpcUrl || !tokenAddress) return null;
    assertLocalPaymentConfig({ rpcUrl, tokenAddress });

    const proofChainId = readPositiveInt(process.env.AGENT_MFERGPT_PROOF_CHAIN_ID)
      ?? TRAIT_CHANGE_BASE_CHAIN_ID;
    const rpcChainId = readPositiveInt(process.env.AGENT_MFERGPT_RPC_CHAIN_ID)
      ?? readPositiveInt(process.env.AGENT_CHAIN_ID)
      ?? readPositiveInt(String(localConfig?.chainId ?? ""))
      ?? inferRpcChainId(rpcUrl, proofChainId);
    const burnAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_BURN_ADDRESS
      || process.env.MFERLAND_MFERGPT_BURN_ADDRESS
      || process.env.MFERLAND_TRAIT_BURN_ADDRESS
      || TRAIT_CHANGE_BURN_ADDRESS,
    );
    if (!burnAddress) throw new Error("MFERGPT burn address is invalid.");

    return new MferGptBurner({
      account,
      rpcUrl,
      rpcChainId,
      proofChainId,
      tokenAddress,
      burnAddress,
    });
  }

  describe() {
    return {
      rpcUrl: this.rpcUrl,
      rpcChainId: this.rpcChainId,
      proofChainId: this.proofChainId,
      tokenAddress: this.tokenAddress,
      burnAddress: this.burnAddress,
    };
  }

  async burn(amountWei: string, amountLabel: string): Promise<MferGptPaymentProof> {
    const amount = BigInt(amountWei);
    const publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
    const walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });

    const balance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    if (balance < amount) {
      throw new Error(`not enough ${amountLabel}; fund ${this.account.address} on the local MFERGPT token`);
    }

    const txHash = await walletClient.writeContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [this.burnAddress, amount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 90_000,
    });
    if (receipt.status !== "success") throw new Error(`${amountLabel} burn transaction failed`);

    return {
      token: "MFERGPT",
      txHash,
      amountWei,
      chainId: this.proofChainId,
      contractAddress: this.tokenAddress,
    };
  }

  private get chain() {
    return {
      id: this.rpcChainId,
      name: this.rpcChainId === 31337 ? "mferland local" : "MFERGPT payment chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: [this.rpcUrl] },
      },
    } as const;
  }
}

function readLocalContractConfig(): ContractConfig | null {
  const configured = cleanString(process.env.AGENT_CRYPTO_CONTRACTS_FILE);
  const candidates = [
    configured,
    resolve(process.env.INIT_CWD ?? process.cwd(), "apps/web/public/crypto/local-contracts.json"),
    resolve(process.cwd(), "../../apps/web/public/crypto/local-contracts.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      return JSON.parse(readFileSync(candidate, "utf8")) as ContractConfig;
    } catch {
      continue;
    }
  }
  return null;
}

function inferRpcChainId(rpcUrl: string, fallback: number) {
  return /localhost|127\.0\.0\.1|\[::1\]|::1/i.test(rpcUrl) ? 31337 : fallback;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAddress(value: unknown): Address | "" {
  const normalized = cleanString(value).toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized as Address : "";
}

function assertLocalPaymentConfig({ rpcUrl, tokenAddress }: { rpcUrl: string; tokenAddress: Address }) {
  if (process.env.MFERLAND_AGENT_LOCAL_ONLY !== "1" && process.env.MFERLAND_LOCAL_ONLY !== "1") return;
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new Error("Local MFERGPT payment RPC URL must be valid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Refusing non-local MFERGPT payment RPC host ${parsed.hostname}.`);
  }
  if (tokenAddress.toLowerCase() === TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error("Refusing production MFERGPT token address for a local agent run.");
  }
}

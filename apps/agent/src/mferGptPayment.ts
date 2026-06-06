import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseAbi,
  parseUnits,
  type Address,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  DEFAULT_MFERGPT_SWAP_ETH_AMOUNT,
  DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
  MFERGPT_BASE_CHAIN_ID,
  MFERGPT_BASE_RPC_URL,
  MFERGPT_BASE_TOKEN_ADDRESS,
  MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  MFERGPT_BASE_WETH_ADDRESS,
  MFERGPT_DECIMALS,
  MFERGPT_SWAP_GAS_LIMIT,
  MFERGPT_SWAP_PRICE_DECIMALS,
  MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS,
  TRAIT_CHANGE_BURN_ADDRESS,
  TRAIT_CHANGE_MFERGPT_TOKEN_ADDRESS,
  buildMferGptUniversalRouterCallData,
  getMferGptSwapQuoteAmounts,
  type MferGptPaymentProof,
} from "@mferland/shared";

type ContractConfig = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    mfergpt?: string;
    swapRouter?: string;
    weth?: string;
    universalRouter?: string;
  };
};

type MferGptBurnerEnvOptions = {
  allowProduction?: boolean;
  localOnly?: boolean;
};

type MferGptBurnerOptions = {
  account: PrivateKeyAccount;
  rpcUrl: string;
  rpcChainId: number;
  proofChainId: number;
  tokenAddress: Address;
  burnAddress: Address;
  localSwapRouterAddress?: Address;
  swapInputAddress?: Address;
  universalRouterAddress?: Address;
  useUniversalRouter: boolean;
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const LOCAL_SWAP_ROUTER_ABI = parseAbi([
  "function quoteExactETHForTokens(uint256 amountInWei) view returns (uint256)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const DEFAULT_SWAP_ETH_AMOUNT = DEFAULT_MFERGPT_SWAP_ETH_AMOUNT;

type DexScreenerTokenResponse = {
  pairs?: Array<{
    chainId?: string;
    dexId?: string;
    labels?: string[];
    priceNative?: string;
    baseToken?: {
      address?: string;
    };
    quoteToken?: {
      address?: string;
    };
  }>;
};

export class MferGptBurner {
  private readonly account: PrivateKeyAccount;
  private readonly rpcUrl: string;
  private readonly rpcChainId: number;
  private readonly proofChainId: number;
  private readonly tokenAddress: Address;
  private readonly burnAddress: Address;
  private readonly localSwapRouterAddress?: Address;
  private readonly swapInputAddress: Address;
  private readonly universalRouterAddress: Address;
  private readonly useUniversalRouter: boolean;

  constructor(options: MferGptBurnerOptions) {
    this.account = options.account;
    this.rpcUrl = options.rpcUrl;
    this.rpcChainId = options.rpcChainId;
    this.proofChainId = options.proofChainId;
    this.tokenAddress = options.tokenAddress;
    this.burnAddress = options.burnAddress;
    this.localSwapRouterAddress = options.localSwapRouterAddress;
    this.swapInputAddress = options.swapInputAddress ?? ZERO_ADDRESS;
    this.universalRouterAddress = options.universalRouterAddress ?? MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address;
    this.useUniversalRouter = options.useUniversalRouter;
  }

  static fromEnv(account: PrivateKeyAccount, options: MferGptBurnerEnvOptions = {}) {
    const localConfig = readLocalContractConfig();
    const localOnly = options.localOnly || process.env.MFERLAND_AGENT_LOCAL_ONLY === "1" || process.env.MFERLAND_LOCAL_ONLY === "1";
    const allowProduction = options.allowProduction || process.env.AGENT_ALLOW_PRODUCTION === "1";
    const useBaseDefaults = !localOnly && allowProduction;
    const rpcUrl = cleanString(process.env.AGENT_MFERGPT_RPC_URL)
      || cleanString(process.env.MFERLAND_MFERGPT_PAYMENT_RPC_URL)
      || cleanString(process.env.MFERLAND_TRAIT_PAYMENT_RPC_URL)
      || cleanString(localConfig?.rpcUrl)
      || (useBaseDefaults ? MFERGPT_BASE_RPC_URL : "");
    const tokenAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_TOKEN_ADDRESS
      || process.env.MFERLAND_MFERGPT_TOKEN_ADDRESS
      || process.env.MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS
      || localConfig?.addresses?.mfergpt
      || (useBaseDefaults ? MFERGPT_BASE_TOKEN_ADDRESS : ""),
    );
    if (!rpcUrl || !tokenAddress) return null;
    const rpcIsLocal = isLoopbackUrl(rpcUrl);
    if (localOnly || rpcIsLocal) {
      assertLocalPaymentConfig({ rpcUrl, tokenAddress });
    } else if (!allowProduction) {
      throw new Error("Set AGENT_ALLOW_PRODUCTION=1 before enabling non-local MFERGPT wallet tools.");
    }

    const proofChainId = readPositiveInt(process.env.AGENT_MFERGPT_PROOF_CHAIN_ID)
      ?? MFERGPT_BASE_CHAIN_ID;
    const rpcChainId = readPositiveInt(process.env.AGENT_MFERGPT_RPC_CHAIN_ID)
      ?? readPositiveInt(process.env.AGENT_CHAIN_ID)
      ?? readPositiveInt(String(localConfig?.chainId ?? ""))
      ?? (rpcIsLocal ? 31337 : MFERGPT_BASE_CHAIN_ID);
    const burnAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_BURN_ADDRESS
      || process.env.MFERLAND_MFERGPT_BURN_ADDRESS
      || process.env.MFERLAND_TRAIT_BURN_ADDRESS
      || TRAIT_CHANGE_BURN_ADDRESS,
    );
    if (!burnAddress) throw new Error("MFERGPT burn address is invalid.");
    const localSwapRouterAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_SWAP_ROUTER_ADDRESS
      || process.env.MFERLAND_MFERGPT_SWAP_ROUTER_ADDRESS
      || localConfig?.addresses?.swapRouter,
    ) || undefined;
    const swapInputAddress = normalizeAddress(
      process.env.AGENT_MFERGPT_SWAP_INPUT_ADDRESS
      || process.env.MFERLAND_MFERGPT_SWAP_INPUT_ADDRESS
      || localConfig?.addresses?.weth,
    ) || (rpcIsLocal ? ZERO_ADDRESS : MFERGPT_BASE_WETH_ADDRESS as Address);
    const universalRouterAddress = normalizeAddress(
      process.env.AGENT_UNISWAP_UNIVERSAL_ROUTER_ADDRESS
      || localConfig?.addresses?.universalRouter
      || MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
    ) || MFERGPT_BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address;
    const useUniversalRouter = !rpcIsLocal && !localSwapRouterAddress;

    return new MferGptBurner({
      account,
      rpcUrl,
      rpcChainId,
      proofChainId,
      tokenAddress,
      burnAddress,
      localSwapRouterAddress,
      swapInputAddress,
      universalRouterAddress,
      useUniversalRouter,
    });
  }

  describe() {
    return {
      rpcUrl: this.rpcUrl,
      rpcChainId: this.rpcChainId,
      proofChainId: this.proofChainId,
      tokenAddress: this.tokenAddress,
      burnAddress: this.burnAddress,
      swapMode: this.localSwapRouterAddress ? "local-router" : this.useUniversalRouter ? "uniswap-v4" : "",
      swapRouterAddress: this.localSwapRouterAddress ?? (this.useUniversalRouter ? this.universalRouterAddress : ""),
      swapInputAddress: this.swapInputAddress,
    };
  }

  async observe() {
    const publicClient = this.publicClient();
    const [nativeBalance, tokenBalance] = await Promise.all([
      publicClient.getBalance({ address: this.account.address }),
      publicClient.readContract({
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      }),
    ]);
    return {
      nativeBalanceWei: nativeBalance.toString(),
      nativeBalanceEth: formatBalance(formatEther(nativeBalance), 4),
      mferGptBalanceWei: tokenBalance.toString(),
      mferGptBalance: formatBalance(formatUnits(tokenBalance, MFERGPT_DECIMALS), 2),
      swapConfigured: Boolean(this.localSwapRouterAddress || this.useUniversalRouter),
      swapMode: this.localSwapRouterAddress ? "local-router" : this.useUniversalRouter ? "uniswap-v4" : "",
      swapRouterAddress: this.localSwapRouterAddress ?? (this.useUniversalRouter ? this.universalRouterAddress : ""),
      recommendedSwapEthAmount: DEFAULT_SWAP_ETH_AMOUNT,
    };
  }

  async burn(amountWei: string, amountLabel: string): Promise<MferGptPaymentProof> {
    const amount = BigInt(amountWei);
    const publicClient = this.publicClient();
    const walletClient = this.walletClient();

    const balance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    if (balance < amount) {
      throw new Error(`not enough ${amountLabel}; fund ${this.account.address} with MFERGPT`);
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

  async swapEthForMferGpt(amountEth = DEFAULT_SWAP_ETH_AMOUNT) {
    if (this.localSwapRouterAddress) return this.swapViaLocalRouter(amountEth);
    if (this.useUniversalRouter) return this.swapViaUniversalRouter(amountEth);
    throw new Error("MFERGPT swap router is not configured for this agent.");
  }

  private async swapViaLocalRouter(amountEth: string) {
    if (!this.localSwapRouterAddress) throw new Error("local MFERGPT swap router is not configured for this agent.");
    const amountIn = parseEtherAmount(amountEth);
    const publicClient = this.publicClient();
    const walletClient = this.walletClient();
    const [nativeBalance, beforeBalance, quotedOut] = await Promise.all([
      publicClient.getBalance({ address: this.account.address }),
      publicClient.readContract({
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      }),
      publicClient.readContract({
        address: this.localSwapRouterAddress,
        abi: LOCAL_SWAP_ROUTER_ABI,
        functionName: "quoteExactETHForTokens",
        args: [amountIn],
      }),
    ]);
    if (nativeBalance <= amountIn) {
      throw new Error(`not enough ETH to swap ${amountEth} ETH for MFERGPT`);
    }
    if (quotedOut <= 0n) throw new Error("MFERGPT swap quote returned 0");
    const minOut = quotedOut
      * BigInt(MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS - DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS)
      / BigInt(MFERGPT_SWAP_SLIPPAGE_DENOMINATOR_BPS);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const txHash = await walletClient.writeContract({
      address: this.localSwapRouterAddress,
      abi: LOCAL_SWAP_ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args: [minOut, [this.swapInputAddress, this.tokenAddress], this.account.address, deadline],
      value: amountIn,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 90_000,
    });
    if (receipt.status !== "success") throw new Error(`${amountEth} ETH to MFERGPT swap failed`);
    const afterBalance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    const received = afterBalance > beforeBalance ? afterBalance - beforeBalance : 0n;
    if (received < minOut) throw new Error("MFERGPT swap output was below minimum");
    return {
      txHash,
      amountInWei: amountIn.toString(),
      minAmountOutWei: minOut.toString(),
      receivedWei: received.toString(),
      received: formatBalance(formatUnits(received, MFERGPT_DECIMALS), 2),
    };
  }

  private async swapViaUniversalRouter(amountEth: string) {
    const amountIn = parseEtherAmount(amountEth);
    const quote = await fetchBaseMferGptSwapQuote(amountIn);
    const publicClient = this.publicClient();
    const walletClient = this.walletClient();
    const [nativeBalance, beforeBalance] = await Promise.all([
      publicClient.getBalance({ address: this.account.address }),
      publicClient.readContract({
        address: this.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      }),
    ]);
    if (nativeBalance <= amountIn) {
      throw new Error(`not enough Base ETH to swap ${amountEth} ETH for MFERGPT`);
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const txHash = await walletClient.sendTransaction({
      to: this.universalRouterAddress,
      data: buildMferGptUniversalRouterCallData({
        amountInWei: amountIn,
        minAmountOutWei: quote.minAmountOutWei,
        deadline,
      }),
      value: amountIn,
      gas: MFERGPT_SWAP_GAS_LIMIT,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 90_000,
    });
    if (receipt.status !== "success") throw new Error(`${amountEth} ETH to MFERGPT swap failed`);
    const afterBalance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    const received = afterBalance > beforeBalance ? afterBalance - beforeBalance : 0n;
    if (received < quote.minAmountOutWei) throw new Error("MFERGPT swap output was below minimum");
    return {
      txHash,
      amountInWei: amountIn.toString(),
      minAmountOutWei: quote.minAmountOutWei.toString(),
      receivedWei: received.toString(),
      received: formatBalance(formatUnits(received, MFERGPT_DECIMALS), 2),
    };
  }

  private publicClient() {
    return createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  private walletClient() {
    return createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  private get chain() {
    return {
      id: this.rpcChainId,
      name: this.rpcChainId === 31337 ? "mferland local" : "Base",
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

function parseEtherAmount(value: string) {
  const normalized = cleanString(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) throw new Error("swap amount must be a decimal ETH string");
  if (Number(normalized) <= 0 || Number(normalized) > 1) throw new Error("agent swap amount must be between 0 and 1 ETH");
  return parseEther(normalized);
}

async function fetchBaseMferGptSwapQuote(amountInWei: bigint) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MFERGPT_BASE_TOKEN_ADDRESS}`, { cache: "no-store" });
  const document = await response.json().catch(() => null) as DexScreenerTokenResponse | null;
  if (!response.ok || !document) throw new Error("MFERGPT market quote unavailable");
  const pair = document.pairs?.find((entry) => {
    const baseToken = entry.baseToken?.address ?? "";
    const quoteToken = entry.quoteToken?.address ?? "";
    return entry.chainId === "base"
      && entry.dexId === "uniswap"
      && (entry.labels ?? []).includes("v4")
      && baseToken.toLowerCase() === MFERGPT_BASE_TOKEN_ADDRESS.toLowerCase()
      && quoteToken.toLowerCase() === MFERGPT_BASE_WETH_ADDRESS.toLowerCase()
      && typeof entry.priceNative === "string"
      && Number(entry.priceNative) > 0;
  });
  if (!pair?.priceNative) throw new Error("MFERGPT/WETH pool unavailable");
  return getMferGptSwapQuoteAmounts({
    amountInWei,
    priceNativeWei: parseUnits(pair.priceNative, MFERGPT_SWAP_PRICE_DECIMALS),
    slippageBps: DEFAULT_MFERGPT_SWAP_SLIPPAGE_BPS,
  });
}

function isLoopbackUrl(value: string) {
  try {
    const parsed = new URL(value);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function formatBalance(value: string, maxFractionDigits: number) {
  const [whole = "0", fraction = ""] = value.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, maxFractionDigits);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function assertLocalPaymentConfig({ rpcUrl, tokenAddress }: { rpcUrl: string; tokenAddress: Address }) {
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

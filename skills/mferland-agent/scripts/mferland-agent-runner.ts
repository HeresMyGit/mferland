import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client, type Room } from "colyseus.js";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type AnyRecord = Record<string, unknown>;
type Point = { x: number; z: number };
type TargetSelection = { kind: "npc"; id: string } | { kind: "player"; id: string };
type CombatActionId = typeof COMBAT_ACTION_IDS[number];

type AgentConfig = {
  roomServer: string;
  httpServer: string;
  roomName: string;
  authEndpoint: string;
  catalogEndpoint: string;
  privateKey: `0x${string}`;
  agentName: string;
  inviteCode: string;
  createCharacter: boolean;
  allowProduction: boolean;
  runSeconds: number;
  decisionModel: string;
  decisionTimeoutMs: number;
  decisionIntervalMs: number;
  objective: string;
  maxMferGptSpendWei: string;
  maxSwapEthSpendWei: string;
  announceNextAction: boolean;
  socialReplies: boolean;
  chatCooldownMs: number;
  emoteCooldownMs: number;
  viewerPort: number;
  viewerHost: string;
  gameViewerUrl: string;
};

type RuntimePlayer = AnyRecord & {
  sessionId: string;
  name: string;
  identityType: string;
  isAgent: boolean;
  walletAddress: string;
  agentStatusAction: string;
  agentStatusThought: string;
  agentStatusObjective: string;
  agentStatusQuest: string;
  agentStatusUpdatedAt: number;
  health: number;
  maxHealth: number;
  healthRegenPer5: number;
  mana: number;
  maxMana: number;
  manaRegenPer5: number;
  walkSpeed: number;
  runSpeed: number;
  strength: number;
  dexterity: number;
  magic: number;
  level: number;
  xp: number;
  talentPoints: number;
  x: number;
  z: number;
  yaw: number;
  animation: string;
  castingAction: string;
  quests: AnyRecord[];
  inventory: AnyRecord[];
  equipment: AnyRecord[];
  talents: AnyRecord[];
  activeBuffs: AnyRecord[];
};

type RuntimeNpc = {
  id: string;
  name: string;
  role: string;
  model: string;
  combatStyle: string;
  health: number;
  maxHealth: number;
  isImmortal: boolean;
  x: number;
  z: number;
  defeatedAt: number;
  despawnAt: number;
  aggroTargetId: string;
  hasLoot: boolean;
  questId: string;
  shopId: string;
  dialogue: string;
};

type QuestMemory = {
  kind: "offer" | "status" | "turnIn" | "completed";
  questId: string;
  npcId: string;
  npcName: string;
  turnInNpcId: string;
  turnInNpcName: string;
  title: string;
  text: string;
  objectiveLabel: string;
  progress: number;
  required: number;
  rewardPreview: string[];
  nextQuestId: string;
  nextQuestTitle: string;
  nextGiverNpcId: string;
  nextGiverNpcName: string;
  observedAt: number;
};

type CombatTroubleMemory = {
  targetId: string;
  targetName: string;
  reason: string;
  count: number;
  lastAt: number;
};

type MovementTroubleMemory = {
  reason: string;
  action: string;
  position: Point;
  targetPoint: Point | null;
  routeQueue: Point[];
  attempts: number;
  lastAt: number;
};

type SocialMessage = {
  sessionId: string;
  name: string;
  identityType: string;
  text: string;
  kind: string;
  observedAt: number;
};

type Decision = {
  action: string;
  reason: string;
  x?: number | null;
  z?: number | null;
  npcRef?: string | null;
  playerRef?: string | null;
  questId?: string | null;
  itemId?: string | null;
  chainTokenId?: string | null;
  slotId?: string | null;
  talentId?: string | null;
  actionId?: string | null;
  text?: string | null;
  emoteId?: string | null;
  quantity?: number | null;
  amountEth?: string | null;
  paymentTxHash?: string | null;
  paymentAmountWei?: string | null;
  paymentChainId?: number | null;
  paymentContractAddress?: string | null;
  sprint?: boolean | null;
  traits?: AnyRecord | null;
};

const COMBAT_ACTION_IDS = [
  "attack",
  "shoot",
  "signalShot",
  "fireblast",
  "frostNova",
  "heal",
  "taunt",
  "whirlwind",
  "multishot",
  "iceBlast",
] as const;

const COMBAT: Record<CombatActionId, { damage: number; cooldownMs: number; minRange: number; maxRange: number; manaCost: number; castTimeMs: number; requiresStationary: boolean; minLevel: number }> = {
  attack: { damage: 4, cooldownMs: 1500, minRange: 0, maxRange: 5, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 1 },
  shoot: { damage: 10, cooldownMs: 2000, minRange: 4, maxRange: 40, manaCost: 0, castTimeMs: 0, requiresStationary: true, minLevel: 2 },
  signalShot: { damage: 12, cooldownMs: 6000, minRange: 4, maxRange: 34, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 3 },
  fireblast: { damage: 20, cooldownMs: 0, minRange: 0, maxRange: 30, manaCost: 14, castTimeMs: 3500, requiresStationary: true, minLevel: 4 },
  frostNova: { damage: 5, cooldownMs: 12000, minRange: 0, maxRange: 6.5, manaCost: 12, castTimeMs: 0, requiresStationary: false, minLevel: 6 },
  heal: { damage: 0, cooldownMs: 0, minRange: 0, maxRange: 24, manaCost: 16, castTimeMs: 2000, requiresStationary: true, minLevel: 6 },
  taunt: { damage: 0, cooldownMs: 10000, minRange: 0, maxRange: 12, manaCost: 0, castTimeMs: 0, requiresStationary: false, minLevel: 7 },
  whirlwind: { damage: 9, cooldownMs: 9000, minRange: 0, maxRange: 4.5, manaCost: 10, castTimeMs: 0, requiresStationary: false, minLevel: 6 },
  multishot: { damage: 9, cooldownMs: 10000, minRange: 4, maxRange: 36, manaCost: 12, castTimeMs: 0, requiresStationary: true, minLevel: 6 },
  iceBlast: { damage: 14, cooldownMs: 0, minRange: 0, maxRange: 28, manaCost: 12, castTimeMs: 3500, requiresStationary: true, minLevel: 5 },
};

const COMBAT_UNLOCK_TALENTS: Partial<Record<CombatActionId, string>> = {
  frostNova: "caster:frost-nova",
  whirlwind: "brawler:whirlwind",
  multishot: "utility:multishot",
};

const PUBLIC_LANDMARKS: Record<string, Point> = {
  plaza: { x: -2.4, z: 4.2 },
  "north-gate": { x: 5.5, z: -18.5 },
  market: { x: 0, z: 25.4 },
  "loop-farm": { x: -64.5, z: 64.5 },
  "claim-pile": { x: -89, z: 92 },
  "route-post": { x: -119.2, z: 132.4 },
  "claim-booth": { x: -111.2, z: 136.7 },
  "signal-post": { x: 108.8, z: -92.8 },
  "uplink-shack": { x: 117.6, z: -91.2 },
  "static-lot": { x: 151.5, z: -106.2 },
};

const PUBLIC_ROUTES: Record<string, Point[]> = {
  "plaza-to-loop-farm": [{ x: 0, z: 29 }, { x: -31, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-claim-pile": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -99, z: 75 }, { x: -89, z: 92 }],
  "claim-pile-to-loop-farm": [{ x: -89, z: 92 }, { x: -99, z: 75 }, { x: -82, z: 60 }, { x: -64.5, z: 64.5 }],
  "loop-farm-to-route-post": [{ x: -64.5, z: 64.5 }, { x: -82, z: 60 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "claim-pile-to-route-post": [{ x: -89, z: 92 }, { x: -112, z: 70 }, { x: -128, z: 102 }, { x: -124, z: 124 }, { x: -119.2, z: 132.4 }],
  "route-post-to-claim-booth": [{ x: -119.2, z: 132.4 }, { x: -111.2, z: 136.7 }],
  "route-post-to-signal-post": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "route-post-to-signal-ridge": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "plaza-to-signal-ridge": [{ x: 0, z: -34 }, { x: 53, z: -11.5 }, { x: 75, z: -22 }, { x: 120, z: -62 }, { x: 108.8, z: -92.8 }],
  "signal-post-to-uplink-shack": [{ x: 108.8, z: -92.8 }, { x: 117.6, z: -91.2 }],
  "signal-post-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "signal-ridge-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "uplink-shack-to-static-lot": [{ x: 117.6, z: -91.2 }, { x: 124, z: -104 }, { x: 145.5, z: -84.2 }],
  "field-to-plaza": [{ x: -119.2, z: 132.4 }, { x: -112, z: 70 }, { x: -31, z: 60 }, { x: 0, z: 29 }, { x: -2.4, z: 4.2 }],
  "ridge-to-plaza": [{ x: 108.8, z: -92.8 }, { x: 75, z: -22 }, { x: 53, z: -11.5 }, { x: 0, z: -34 }, { x: -2.4, z: 4.2 }],
};

const AGENT_DEFAULT_TRAITS = {
  background: "orange",
  type: "plain",
  eyes: "regular",
  mouth: "smile",
  headphones: "black",
} as const;

const DECISION_ACTIONS = [
  "wait",
  "move_to",
  "travel_route",
  "move_near_npc",
  "move_near_player",
  "respawn",
  "interact_npc",
  "accept_quest",
  "complete_quest",
  "cancel_quest",
  "use_ability",
  "fight_npc",
  "loot",
  "equip_item",
  "unequip_item",
  "use_item",
  "select_talent",
  "swap_eth_for_mfergpt",
  "register_chain_gear",
  "purchase_potion_shop_item",
  "sell_trash_items",
  "update_traits",
  "emote",
  "chat",
  "share_quest_link",
] as const;

const INPUT_INTERVAL_MS = 150;
const INTERACT_SEND_RANGE = 12.5;
const QUEST_SEND_RANGE = 3.2;
const INTERACT_APPROACH_DISTANCE = 1.6;
const LOOT_SEND_RANGE = 3.2;
const RECOVER_HEALTH_RATIO = 0.72;
const CRITICAL_HEALTH_RATIO = 0.35;
const DANGEROUS_NEIGHBOR_RADIUS = 11;
const CROWDED_PULL_RADIUS = 12;
const DECISION_PROVIDER_BACKOFF_MS = 5 * 60_000;
const DEFAULT_CHAT_COOLDOWN_MS = 30_000;
const DEFAULT_EMOTE_COOLDOWN_MS = 45_000;
const SOCIAL_MESSAGE_TTL_MS = 2 * 60_000;
const PRESS_SINGLE_ATTACKER_HEALTH_RATIO = 0.46;
const PRESS_MULTI_ATTACKER_HEALTH_RATIO = 0.68;
const PRESS_LOW_HEALTH_FINISH_RATIO = 0.38;
const FAVORABLE_FIGHT_SURVIVAL_MARGIN = 1.25;
const MOVEMENT_STUCK_RETHINK_ATTEMPTS = 3;
const MOVEMENT_TROUBLE_TTL_MS = 2 * 60_000;
const BASE_CHAIN_ID = 8453;
const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_BLOCK_EXPLORER_URL = "https://basescan.org";
const BASE_MFERGPT_TOKEN_ADDRESS = "0x4160efDd66521483c22Cb98b57b87d1fDAfeaB07";
const BASE_BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS = "0x6fF5693b99212Da76ad316178A184AB56D299b43";
const BASE_MFERGPT_UNISWAP_V4_HOOKS_ADDRESS = "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC";
const MFERGPT_DECIMALS = 18;
const PRICE_DECIMALS = 18;
const DEFAULT_SWAP_ETH_AMOUNT = "0.01";
const DEFAULT_SWAP_SLIPPAGE_BPS = 500n;
const BPS_DENOMINATOR = 10_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
const ACTION_CONSTANT_ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
const UNISWAP_COMMAND_WRAP_ETH = "0b";
const UNISWAP_COMMAND_V4_SWAP = "10";
const V4_ACTION_SWAP_EXACT_IN_SINGLE = "06";
const V4_ACTION_SETTLE = "0b";
const V4_ACTION_TAKE_ALL = "0f";
const MFERGPT_SWAP_GAS_LIMIT = 900_000n;
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const LOCAL_SWAP_ROUTER_ABI = parseAbi([
  "function quoteExactETHForTokens(uint256 amountInWei) view returns (uint256)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
]);
const UNIVERSAL_ROUTER_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}] as const;
const BASE_MFERGPT_POOL_KEY = {
  currency0: BASE_MFERGPT_TOKEN_ADDRESS,
  currency1: BASE_WETH_ADDRESS,
  fee: 0x800000,
  tickSpacing: 200,
  hooks: BASE_MFERGPT_UNISWAP_V4_HOOKS_ADDRESS,
} as const;

type MferGptPaymentProof = {
  token: "MFERGPT";
  txHash: `0x${string}`;
  amountWei: string;
  chainId: number;
  contractAddress?: string;
};

type WalletToolSnapshot = {
  configured: boolean;
  rpcUrl: string;
  rpcChainId: number;
  proofChainId: number;
  tokenAddress: string;
  burnAddress: string;
  nativeBalanceWei: string;
  nativeBalanceEth: string;
  mferGptBalanceWei: string;
  mferGptBalance: string;
  swapConfigured: boolean;
  swapMode: "local-router" | "uniswap-v4" | "";
  swapRouterAddress: string;
  recommendedSwapEthAmount: string;
  error: string;
};

type CryptoContractsConfig = {
  chainId?: number;
  rpcUrl?: string;
  addresses?: {
    mfergpt?: string;
    swapRouter?: string;
    weth?: string;
  };
};

type DexScreenerTokenResponse = {
  pairs?: Array<{
    chainId?: string;
    dexId?: string;
    labels?: string[];
    url?: string;
    priceNative?: string;
    liquidity?: {
      usd?: number;
    };
    baseToken?: {
      address?: string;
      symbol?: string;
    };
    quoteToken?: {
      address?: string;
      symbol?: string;
    };
  }>;
};

class MferGptWalletTools {
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

  constructor(options: {
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
  }) {
    this.account = options.account;
    this.rpcUrl = options.rpcUrl;
    this.rpcChainId = options.rpcChainId;
    this.proofChainId = options.proofChainId;
    this.tokenAddress = options.tokenAddress;
    this.burnAddress = options.burnAddress;
    this.localSwapRouterAddress = options.localSwapRouterAddress;
    this.swapInputAddress = options.swapInputAddress ?? ZERO_ADDRESS;
    this.universalRouterAddress = options.universalRouterAddress ?? BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address;
    this.useUniversalRouter = options.useUniversalRouter;
  }

  static fromEnv(account: PrivateKeyAccount, config: AgentConfig) {
    const localConfig = readCryptoContractsConfig();
    const localOnly = isLocalAgentRun(config);
    const useBaseDefaults = !localOnly && config.allowProduction;
    const rpcUrl = cleanEnv("AGENT_MFERGPT_RPC_URL")
      || cleanEnv("MFERLAND_MFERGPT_PAYMENT_RPC_URL")
      || cleanEnv("MFERLAND_TRAIT_PAYMENT_RPC_URL")
      || cleanText(localConfig?.rpcUrl, 300)
      || (useBaseDefaults ? BASE_RPC_URL : "");
    const tokenAddress = asAddress(
      cleanEnv("AGENT_MFERGPT_TOKEN_ADDRESS")
      || cleanEnv("MFERLAND_MFERGPT_TOKEN_ADDRESS")
      || cleanEnv("MFERLAND_TRAIT_MFERGPT_TOKEN_ADDRESS")
      || cleanText(localConfig?.addresses?.mfergpt, 80)
      || (useBaseDefaults ? BASE_MFERGPT_TOKEN_ADDRESS : ""),
    );

    if (!rpcUrl || !tokenAddress) return null;
    const rpcIsLocal = isLoopbackUrl(rpcUrl);
    if (localOnly || rpcIsLocal) {
      assertLocalPaymentConfig(rpcUrl, tokenAddress);
    } else if (!config.allowProduction) {
      throw new Error("Set AGENT_ALLOW_PRODUCTION=1 before enabling non-local MFERGPT wallet tools.");
    }

    const rpcChainId = readPositiveIntegerEnv("AGENT_MFERGPT_RPC_CHAIN_ID")
      || readPositiveIntegerEnv("AGENT_CHAIN_ID")
      || readPositiveIntegerText(localConfig?.chainId)
      || (rpcIsLocal ? 31337 : BASE_CHAIN_ID);
    const proofChainId = readPositiveIntegerEnv("AGENT_MFERGPT_PROOF_CHAIN_ID")
      || readPositiveIntegerEnv("MFERLAND_MFERGPT_PAYMENT_CHAIN_ID")
      || BASE_CHAIN_ID;
    const burnAddress = asAddress(
      cleanEnv("AGENT_MFERGPT_BURN_ADDRESS")
      || cleanEnv("MFERLAND_MFERGPT_BURN_ADDRESS")
      || cleanEnv("MFERLAND_TRAIT_BURN_ADDRESS")
      || BASE_BURN_ADDRESS,
    );
    if (!burnAddress) throw new Error("MFERGPT burn address is invalid.");
    const localSwapRouterAddress = asAddress(
      cleanEnv("AGENT_MFERGPT_SWAP_ROUTER_ADDRESS")
      || cleanEnv("MFERLAND_MFERGPT_SWAP_ROUTER_ADDRESS")
      || cleanText(localConfig?.addresses?.swapRouter, 80),
    ) || undefined;
    const swapInputAddress = asAddress(
      cleanEnv("AGENT_MFERGPT_SWAP_INPUT_ADDRESS")
      || cleanEnv("MFERLAND_MFERGPT_SWAP_INPUT_ADDRESS")
      || cleanText(localConfig?.addresses?.weth, 80),
    ) || (rpcIsLocal ? ZERO_ADDRESS : BASE_WETH_ADDRESS as Address);
    const universalRouterAddress = asAddress(
      cleanEnv("AGENT_UNISWAP_UNIVERSAL_ROUTER_ADDRESS")
      || BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
    ) || BASE_UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address;
    const useUniversalRouter = !rpcIsLocal && !localSwapRouterAddress;

    return new MferGptWalletTools({
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

  async observe(): Promise<WalletToolSnapshot> {
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
    const swapRouterAddress = this.localSwapRouterAddress ?? (this.useUniversalRouter ? this.universalRouterAddress : undefined);
    return {
      configured: true,
      rpcUrl: this.rpcUrl,
      rpcChainId: this.rpcChainId,
      proofChainId: this.proofChainId,
      tokenAddress: this.tokenAddress,
      burnAddress: this.burnAddress,
      nativeBalanceWei: nativeBalance.toString(),
      nativeBalanceEth: formatBalance(formatEther(nativeBalance), 4),
      mferGptBalanceWei: tokenBalance.toString(),
      mferGptBalance: formatBalance(formatUnits(tokenBalance, MFERGPT_DECIMALS), 2),
      swapConfigured: Boolean(swapRouterAddress),
      swapMode: this.localSwapRouterAddress ? "local-router" : this.useUniversalRouter ? "uniswap-v4" : "",
      swapRouterAddress: swapRouterAddress ?? "",
      recommendedSwapEthAmount: DEFAULT_SWAP_ETH_AMOUNT,
      error: "",
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
    if (balance < amount) throw new Error(`not enough ${amountLabel}`);

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
    if (!this.localSwapRouterAddress) throw new Error("local MFERGPT swap router is not configured.");
    const amountIn = parseEthAmount(amountEth);
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
    if (nativeBalance <= amountIn) throw new Error(`not enough ETH to swap ${amountEth}`);
    if (quotedOut <= 0n) throw new Error("MFERGPT swap quote returned 0");
    const minOut = quotedOut * (BPS_DENOMINATOR - DEFAULT_SWAP_SLIPPAGE_BPS) / BPS_DENOMINATOR;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const txHash = await walletClient.writeContract({
      address: this.localSwapRouterAddress,
      abi: LOCAL_SWAP_ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args: [minOut, [this.swapInputAddress, this.tokenAddress], this.account.address, deadline],
      value: amountIn,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`${amountEth} ETH to MFERGPT swap failed`);
    const received = await this.readReceivedMferGpt(publicClient, beforeBalance);
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
    const amountIn = parseEthAmount(amountEth);
    const quote = await getMferGptSwapQuote(amountIn);
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
    if (nativeBalance <= amountIn) throw new Error(`not enough Base ETH to swap ${amountEth}`);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const txHash = await walletClient.sendTransaction({
      to: this.universalRouterAddress,
      data: buildMferGptUniversalRouterCallData(quote.minAmountOutWei, amountIn, deadline),
      value: amountIn,
      gas: MFERGPT_SWAP_GAS_LIMIT,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`${amountEth} ETH to MFERGPT swap failed`);
    const received = await this.readReceivedMferGpt(publicClient, beforeBalance);
    if (received < quote.minAmountOutWei) throw new Error("MFERGPT swap output was below minimum");
    return {
      txHash,
      amountInWei: amountIn.toString(),
      minAmountOutWei: quote.minAmountOutWei.toString(),
      receivedWei: received.toString(),
      received: formatBalance(formatUnits(received, MFERGPT_DECIMALS), 2),
    };
  }

  private async readReceivedMferGpt(publicClient: ReturnType<MferGptWalletTools["publicClient"]>, beforeBalance: bigint) {
    const afterBalance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    return afterBalance > beforeBalance ? afterBalance - beforeBalance : 0n;
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

class MferlandRunner {
  private readonly config: AgentConfig;
  private readonly account: PrivateKeyAccount;
  private readonly client: Client;
  private room: Room | null = null;
  private players = new Map<string, RuntimePlayer>();
  private npcs = new Map<string, RuntimeNpc>();
  private catalog: AnyRecord | null = null;
  private lastNpcRefs = new Map<string, string>();
  private lastPlayerRefs = new Map<string, string>();
  private recentMessages: string[] = [];
  private pendingSocialMessages: SocialMessage[] = [];
  private questMemory = new Map<string, QuestMemory>();
  private focusedQuestId = "";
  private combatTrouble = new Map<string, CombatTroubleMemory>();
  private movementTrouble: MovementTroubleMemory | null = null;
  private targetPoint: Point | null = null;
  private avoidancePoint: Point | null = null;
  private avoidanceUntil = 0;
  private movementProgressTarget: Point | null = null;
  private movementProgressDistance = Number.POSITIVE_INFINITY;
  private movementProgressAt = 0;
  private movementUnstickAttempts = 0;
  private routeQueue: Point[] = [];
  private engagedNpcId = "";
  private combatAnchor: Point | null = null;
  private lastSafePoint: Point | null = null;
  private retreatUntil = 0;
  private seq = 0;
  private yaw = Math.PI;
  private stationaryUntil = 0;
  private nextAutoCombatAt = 0;
  private nextAutoConsumableAt = 0;
  private nextAgentStatusAt = 0;
  private nextDecisionAt = 0;
  private nextChatAt = 0;
  private nextEmoteAt = 0;
  private lastNextActionChat = "";
  private deciding = false;
  private lastAction = "";
  private reconnecting = false;
  private stopping = false;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private decisionTimer: ReturnType<typeof setInterval> | null = null;
  private viewerServer: Server | null = null;
  private lastDecision: Decision | null = null;
  private readonly walletTools: MferGptWalletTools | null;
  private walletSnapshot: WalletToolSnapshot | null = null;
  private mferGptSpendSubmittedWei = 0n;
  private swapEthSpendSubmittedWei = 0n;

  constructor(config: AgentConfig) {
    this.config = config;
    this.account = privateKeyToAccount(config.privateKey);
    this.client = new Client(config.roomServer);
    this.walletTools = MferGptWalletTools.fromEnv(this.account, config);
  }

  async start() {
    this.startViewer();
    await this.loadCatalog();
    if (this.walletTools) this.log("MFERGPT wallet tools enabled");
    await this.connect();
    this.inputTimer = setInterval(() => this.sendInput(), INPUT_INTERVAL_MS);
    this.decisionTimer = setInterval(() => void this.decide(), 250);
    if (this.config.runSeconds > 0) {
      setTimeout(() => {
        this.log(`run_seconds elapsed (${this.config.runSeconds}); stopping`);
        this.stop();
        process.exit(0);
      }, this.config.runSeconds * 1000).unref();
    }
  }

  private async loadCatalog() {
    try {
      const response = await fetch(new URL(this.config.catalogEndpoint, this.config.httpServer));
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") throw new Error(`agent catalog failed with ${response.status}`);
      this.catalog = payload as AnyRecord;
      this.log("loaded agent catalog");
    } catch (error) {
      this.log(`agent catalog unavailable: ${errorMessage(error)}`);
      this.catalog = null;
    }
  }

  stop() {
    this.stopping = true;
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.decisionTimer) clearInterval(this.decisionTimer);
    this.viewerServer?.close();
    void this.room?.leave();
  }

  private async connect() {
    const challenge = await this.requestChallenge();
    const signature = await this.account.signMessage({ message: challenge.message });
    const room = await this.client.joinOrCreate(this.config.roomName, {
      name: this.config.agentName,
      identityType: "wallet",
      walletAddress: this.account.address,
      createCharacter: this.config.createCharacter,
      inviteCode: this.config.inviteCode,
      agentClient: true,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    });
    this.room = room;
    this.installHandlers(room);
    this.log(`joined ${this.config.roomName} as ${this.config.agentName} ${shortAddress(this.account.address)}`);
    if (this.config.gameViewerUrl) {
      this.log(`game viewer ${makeAgentGameViewerUrl(this.config.gameViewerUrl, this.account.address)}`);
    }
  }

  private async requestChallenge() {
    const url = new URL(this.config.authEndpoint, this.config.httpServer);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: this.account.address }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; nonce?: string; message?: string; error?: string } | null;
    if (!response.ok || !payload?.ok || !payload.nonce || !payload.message) {
      throw new Error(payload?.error || `wallet auth challenge failed with ${response.status}`);
    }
    return { nonce: payload.nonce, message: payload.message };
  }

  private installHandlers(room: Room) {
    room.onStateChange((state: unknown) => {
      const record = asRecord(state);
      this.players = new Map(schemaEntries(record.players).map(([id, value]) => [id, normalizePlayer(id, value)]));
      this.npcs = new Map(schemaEntries(record.npcs).map(([id, value]) => [id, normalizeNpc(id, value)]));
    });
    room.onMessage("chat", (message: unknown) => this.handleChatMessage(message));
    room.onMessage("combatEvent", (event: unknown) => this.remember(`combat:${messageSummary(event)}`));
    room.onMessage("experienceEvent", (event: unknown) => this.remember(`xp:${messageSummary(event)}`, true));
    room.onMessage("lootWindow", (message: unknown) => this.remember(`lootWindow:${messageSummary(message)}`, true));
    room.onMessage("lootResult", (message: unknown) => this.remember(`lootResult:${messageSummary(message)}`, true));
    room.onMessage("closeLootWindow", (message: unknown) => this.remember(`closeLoot:${messageSummary(message)}`));
    room.onMessage("potionShopPurchaseResult", (message: unknown) => this.remember(`potionShop:${messageSummary(message)}`, true));
    room.onMessage("trashVendorSellResult", (message: unknown) => this.remember(`trashVendor:${messageSummary(message)}`, true));
    room.onMessage("questOffer", (message: unknown) => this.rememberQuestMessage("offer", message));
    room.onMessage("questStatus", (message: unknown) => this.rememberQuestMessage("status", message));
    room.onMessage("questTurnIn", (message: unknown) => this.rememberQuestMessage("turnIn", message));
    room.onMessage("questCompleted", (message: unknown) => this.rememberQuestMessage("completed", message));
    room.onMessage("persistenceStatus", (message: unknown) => this.remember(`persistence:${messageSummary(message)}`, true));
    room.onMessage("traitUpdateResult", (message: unknown) => this.remember(`traitUpdate:${messageSummary(message)}`, true));
    room.onMessage("sessionReplaced", () => {
      this.remember("sessionReplaced", true);
      void this.reconnect();
    });
    room.onLeave(() => {
      if (!this.stopping) void this.reconnect();
    });
  }

  private handleChatMessage(message: unknown) {
    this.remember(`chat:${messageSummary(message)}`, isImportantChat(message));
    if (!this.config.socialReplies) return;
    const record = asRecord(message);
    const sessionId = getString(record.sessionId);
    const identityType = getString(record.identityType);
    const text = cleanText(record.text, 180);
    const kind = cleanText(record.kind, 20) || "say";
    if (!sessionId || sessionId === this.room?.sessionId || identityType === "npc" || !text) return;
    const now = Date.now();
    this.pendingSocialMessages = [
      ...this.pendingSocialMessages.filter((entry) => now - entry.observedAt <= SOCIAL_MESSAGE_TTL_MS).slice(-7),
      {
        sessionId,
        name: cleanText(record.name, 48) || "player",
        identityType,
        text,
        kind,
        observedAt: now,
      },
    ];
  }

  private rememberQuestMessage(kind: QuestMemory["kind"], message: unknown) {
    const record = asRecord(message);
    const questId = getString(record.questId);
    if (questId) {
      const entry: QuestMemory = {
        kind,
        questId,
        npcId: getString(record.npcId),
        npcName: getString(record.npcName),
        turnInNpcId: getString(record.turnInNpcId) || (kind === "turnIn" ? getString(record.npcId) : ""),
        turnInNpcName: getString(record.turnInNpcName) || (kind === "turnIn" ? getString(record.npcName) : ""),
        title: getString(record.title),
        text: getString(record.statusText) || getString(record.description) || getString(record.completionText) || getString(record.completedTaskSummary),
        objectiveLabel: getString(record.objectiveLabel),
        progress: getNumber(record.progress),
        required: getNumber(record.required),
        rewardPreview: Array.isArray(record.rewardPreview) ? record.rewardPreview.map(String).slice(0, 8) : [],
        nextQuestId: getString(record.nextQuestId),
        nextQuestTitle: getString(record.nextQuestTitle),
        nextGiverNpcId: getString(record.nextGiverNpcId),
        nextGiverNpcName: getString(record.nextGiverNpcName),
        observedAt: Date.now(),
      };
      this.questMemory.set(questId, entry);
      if (kind === "status" || kind === "turnIn" || kind === "offer") this.focusedQuestId = questId;
      if (kind === "completed" && this.focusedQuestId === questId) this.focusedQuestId = getString(record.nextQuestId);
    }
    this.remember(`${kind}:${messageSummary(message)}`, true);
  }

  private async reconnect() {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    this.room = null;
    await delay(1500);
    try {
      await this.connect();
    } catch (error) {
      this.log(`reconnect failed: ${errorMessage(error)}`);
      await delay(5000);
    } finally {
      this.reconnecting = false;
    }
  }

  private async decide() {
    if (this.deciding || Date.now() < this.nextDecisionAt || !this.room) return;
    const self = this.self();
    if (!self) return;
    if (Date.now() < this.retreatUntil && self.health > 0) return;
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (self.health > 0 && attackers.length === 0 && healthRatio < RECOVER_HEALTH_RATIO && this.nearbyHostileCount(self, 18) === 0) {
      this.targetPoint = null;
      this.lastAction = "recover_health";
      this.nextDecisionAt = Date.now() + 1500;
      return;
    }
    if (self.health > 0 && attackers.length > 0 && healthRatio < CRITICAL_HEALTH_RATIO) {
      this.startRetreat(self, "retreat_critical_health");
      return;
    }
    if (self.health > 0 && (self.castingAction || Date.now() < this.stationaryUntil)) {
      this.nextDecisionAt = Date.now() + 500;
      return;
    }
    if (self.health > 0 && this.activeEngagementNpc()) {
      this.nextDecisionAt = Date.now() + 500;
      return;
    }

    this.deciding = true;
    this.nextDecisionAt = Date.now() + this.config.decisionIntervalMs;
    this.logStatus(self);
    try {
      await this.refreshWalletSnapshot();
      const observation = this.buildObservation(self);
      const decision = await decideWithCodex(this.config, observation);
      this.lastDecision = decision;
      this.updateFocusedQuestFromDecision(decision);
      this.log(`decision ${decision.action}: ${decision.reason}`);
      await this.executeDecision(decision);
      this.maybeAnnounceNextAction(self, decision);
      this.publishAgentStatus(self, true);
    } catch (error) {
      const message = errorMessage(error);
      if (isDecisionProviderBackoffError(message)) {
        this.targetPoint = null;
        this.clearEngagement();
        this.routeQueue = [];
        this.lastAction = "llm_provider_backoff";
        this.lastDecision = {
          action: "wait",
          reason: "Decision provider reported a quota or rate-limit error. Holding still until the provider is available again.",
        };
        this.nextDecisionAt = Date.now() + DECISION_PROVIDER_BACKOFF_MS;
        this.publishAgentStatus(self, true);
        this.log(`decision provider backoff: ${message.slice(0, 240)}`);
      } else {
        this.nextDecisionAt = Date.now() + Math.max(this.config.decisionIntervalMs, 2500);
        this.log(`decision failed: ${message}`);
      }
    } finally {
      this.deciding = false;
    }
  }

  private async refreshWalletSnapshot() {
    if (!this.walletTools) {
      this.walletSnapshot = null;
      return;
    }
    try {
      this.walletSnapshot = await this.walletTools.observe();
    } catch (error) {
      this.walletSnapshot = {
        configured: true,
        rpcUrl: "",
        rpcChainId: 0,
        proofChainId: BASE_CHAIN_ID,
        tokenAddress: "",
        burnAddress: "",
        nativeBalanceWei: "",
        nativeBalanceEth: "",
        mferGptBalanceWei: "",
        mferGptBalance: "",
        swapConfigured: false,
        swapMode: "",
        swapRouterAddress: "",
        recommendedSwapEthAmount: DEFAULT_SWAP_ETH_AMOUNT,
        error: errorMessage(error),
      };
    }
  }

  private buildObservation(self: RuntimePlayer) {
    const now = Date.now();
    const refs = new Map<string, string>();
    const visibleNpcs = [...this.npcs.values()]
      .map((npc) => ({ npc, distance: distance2d(self, npc) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 32)
      .map(({ npc, distance }, index) => {
        const ref = `npc${index + 1}`;
        refs.set(ref, npc.id);
        refs.set(npc.id.toLowerCase(), npc.id);
        refs.set(npc.name.toLowerCase(), npc.id);
        const alive = npc.health > 0 && npc.defeatedAt <= 0;
        return {
          ref,
          id: npc.id,
          name: npc.name,
          role: npc.role,
          model: npc.model,
          alive,
          attackable: isAttackable(npc),
          hostile: isHostile(npc),
          health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
          distance: round(distance),
          position: point(npc),
          dialogue: npc.dialogue,
          questIdHint: npc.questId,
          shopId: npc.shopId,
          hasLoot: npc.hasLoot,
          aggroTarget: npc.aggroTargetId === self.sessionId ? "you" : npc.aggroTargetId ? "someone" : "",
          nearbyHostileCount: this.nearbyHostileCount(npc, 8, npc.id),
          nearbyDangerousHostileCount: this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc),
          nearestDangerousHostile: this.nearestDangerousHostile(npc, CROWDED_PULL_RADIUS, npc),
          pullRisk: this.describePullRisk(npc),
          approachRisk: this.describeApproachRisk(self, npc),
        };
      });

    const playerRefs = new Map<string, string>();
    const visiblePlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => ({ player, distance: distance2d(self, player) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12)
      .map(({ player, distance }, index) => {
        const ref = `player${index + 1}`;
        playerRefs.set(ref, player.sessionId);
        playerRefs.set(player.sessionId.toLowerCase(), player.sessionId);
        playerRefs.set(player.name.toLowerCase(), player.sessionId);
        return {
          ref,
          name: player.name,
          identityType: player.identityType,
          isAgent: player.isAgent,
          health: `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}`,
          mana: `${Math.ceil(player.mana)}/${Math.ceil(player.maxMana)}`,
          distance: round(distance),
          position: point(player),
          animation: player.animation,
          agentStatus: player.isAgent ? {
            action: player.agentStatusAction,
            thought: player.agentStatusThought,
            objective: player.agentStatusObjective,
            quest: player.agentStatusQuest,
            updatedAgoMs: player.agentStatusUpdatedAt ? Math.max(0, now - player.agentStatusUpdatedAt) : null,
          } : null,
        };
      });
    const teamContext = this.buildTeamContext(self);

    this.lastNpcRefs = refs;
    this.lastPlayerRefs = playerRefs;

    const quests = self.quests.map((quest) => {
      const questId = getString(quest.id);
      const memory = this.questMemory.get(questId);
      const metadata = this.getQuestCatalogEntry(questId);
      const encounterType = getString(metadata.encounterType) || "solo";
      const groupSuggestion = getString(metadata.groupSuggestion);
      const suggestedPlayerCount = Math.max(1, getNumber(metadata.suggestedPlayerCount, 1));
      const suggestedAlliesNeeded = Math.max(0, suggestedPlayerCount - 1);
      const needsHelp = suggestedAlliesNeeded > teamContext.nearbyHealthyAllies;
      return {
        id: questId,
        status: getString(quest.status),
        progress: `${getNumber(quest.progress)}/${getNumber(quest.required)}`,
        flags: getString(quest.flags),
        title: memory?.title ?? getString(metadata.title),
        objective: memory?.objectiveLabel ?? getString(metadata.objectiveLabel),
        encounterType,
        groupSuggestion,
        suggestedPlayerCount,
        suggestedAlliesNeeded,
        nearbyHealthyAllies: teamContext.nearbyHealthyAllies,
        needsHelp,
        soloWarning: getString(metadata.soloWarning),
        focusAdvice: needsHelp
          ? `${groupSuggestion || encounterType} content: do not repeatedly solo this objective. Switch active quest focus, level/gear/shop, chat for help, wait for allies, or cancel optional daily raid content.`
          : "",
        lastKnownTitle: memory?.title ?? getString(metadata.title),
        lastKnownObjective: memory?.objectiveLabel ?? getString(metadata.objectiveLabel),
        lastKnownNpcId: memory?.npcId ?? "",
        lastKnownNpcName: memory?.npcName ?? "",
        lastKnownTurnInNpcId: memory?.turnInNpcId ?? "",
        lastKnownTurnInNpcName: memory?.turnInNpcName ?? "",
        lastKnownText: memory?.text ?? "",
        lastKnownRewardPreview: memory?.rewardPreview ?? [],
      };
    });

    return {
      objective: this.config.objective,
      wallet: {
        address: this.account.address,
        agentClient: true,
        maxMferGptSpendWei: this.config.maxMferGptSpendWei,
        mferGptSpendSubmittedWei: this.mferGptSpendSubmittedWei.toString(),
        maxSwapEthSpendWei: this.config.maxSwapEthSpendWei,
        swapEthSpendSubmittedWei: this.swapEthSpendSubmittedWei.toString(),
        mferGptWalletToolsConfigured: Boolean(this.walletTools),
        nativeBalanceEth: this.walletSnapshot?.nativeBalanceEth ?? "",
        nativeBalanceWei: this.walletSnapshot?.nativeBalanceWei ?? "",
        mferGptBalance: this.walletSnapshot?.mferGptBalance ?? "",
        mferGptBalanceWei: this.walletSnapshot?.mferGptBalanceWei ?? "",
        mferGptTokenAddress: this.walletSnapshot?.tokenAddress ?? "",
        mferGptBurnAddress: this.walletSnapshot?.burnAddress ?? "",
        mferGptPaymentChainId: this.walletSnapshot?.proofChainId ?? BASE_CHAIN_ID,
        mferGptSwapConfigured: Boolean(this.walletSnapshot?.swapConfigured),
        mferGptSwapMode: this.walletSnapshot?.swapMode ?? "",
        mferGptSwapRouterAddress: this.walletSnapshot?.swapRouterAddress ?? "",
        recommendedSwapEthAmount: this.walletSnapshot?.recommendedSwapEthAmount ?? DEFAULT_SWAP_ETH_AMOUNT,
        walletToolError: this.walletSnapshot?.error ?? "",
      },
      self: {
        name: self.name,
        level: self.level,
        xp: self.xp,
        levelProgress: this.describeLevelProgress(self),
        health: `${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)}`,
        mana: `${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)}`,
        position: point(self),
        animation: self.animation,
        castingAction: self.castingAction,
        talentPoints: self.talentPoints,
        characterStats: {
          maxHealth: round(self.maxHealth),
          maxMana: round(self.maxMana),
          healthRegenPer5: round(self.healthRegenPer5),
          manaRegenPer5: round(self.manaRegenPer5),
          walkSpeed: round(self.walkSpeed),
          runSpeed: round(self.runSpeed),
          strength: round(self.strength),
          dexterity: round(self.dexterity),
          magic: round(self.magic),
        },
        aggroCount: [...this.npcs.values()].filter((npc) => npc.aggroTargetId === self.sessionId && npc.health > 0 && npc.defeatedAt <= 0).length,
        nearbyHostileCount: this.nearbyHostileCount(self, 10),
        nearbyDangerousHostileCount: this.nearbyDangerousHostileCount(self, 14),
        combatMath: this.describeCombatMath(self),
        quests,
        inventory: this.describeInventory(self),
        equipment: this.describeEquipment(self),
        talents: this.describeTalents(self),
        activeBuffs: self.activeBuffs,
        combatActions: COMBAT_ACTION_IDS.map((actionId) => {
          const action = COMBAT[actionId];
          return {
            actionId,
            unlocked: self.level >= action.minLevel,
            ready: this.canUse(self, actionId),
            manaCost: action.manaCost,
            maxRange: action.maxRange,
            castTimeMs: action.castTimeMs,
            requiresStationary: action.requiresStationary,
          };
        }),
      },
      publicMap: {
        landmarks: PUBLIC_LANDMARKS,
        routes: Object.keys(PUBLIC_ROUTES),
        routeDetails: PUBLIC_ROUTES,
      },
      catalog: this.buildCatalogObservation(self),
      nearbyNpcs: visibleNpcs,
      nearbyPlayers: visiblePlayers,
      teamContext,
      social: this.buildSocialObservation(now),
      safeTrainingTargets: this.describeSafeTrainingTargets(self),
      questMemory: [...this.questMemory.values()]
        .sort((a, b) => b.observedAt - a.observedAt)
        .slice(0, 20),
      combatTrouble: this.describeCombatTrouble(now),
      movementTrouble: this.describeMovementTrouble(now),
      lootableCorpses: visibleNpcs.filter((npc) => !npc.alive && npc.hasLoot),
      recentMessages: this.recentMessages.slice(-20),
      availableActions: DECISION_ACTIONS,
      actionNotes: [
        "Use only one normal room action per decision.",
        "The model policy owns high-level choices: quest order, exploration, target selection, grouping, looting, shopping, and when to disengage.",
        "The harness only supplies wallet login, observation summaries, normal room-message actions, movement/cast safety, and short combat continuations after the policy selects a target.",
        "Use quest offer/status/turn-in messages, NPC dialogue, quest log state, visible NPCs, and public map landmarks as context clues.",
        "Do not assume a hidden quest script or hard-coded quest order. Explore by moving, interacting with nearby quest NPCs, reading offers/status, accepting available quests, doing objectives, and turning in ready quests.",
        "Only use accept_quest for a quest that appeared as a recent questOffer from that NPC. NPC questId hints and inferred future quests are not offers; interact/explore first.",
        "For accept_quest, use the offer npcRef. For complete_quest, use the turnInNpcId/turnInNpcName from quest messages when present.",
        "Prefer stable NPC ids or exact NPC names for npcRef. Numbered refs like npc1 also work, but only for the current observation.",
        "If a quest is completed or a questCompleted message was observed, move on to available next quest context instead of retrying that turn-in.",
        "Active and ready quests are a menu of possible goals, not a single locked objective. You can change quest focus based on danger, team availability, level, gear, and nearby players.",
        "Quest observations and catalog.questCatalog may mark group suggested or raid suggested objectives. If needsHelp is true or teamContext shows too few healthy allies nearby, do not repeatedly solo that objective.",
        "For group/raid content without enough help, switch to another active/ready quest, level on safer targets, gear/shop/loot, chat or emote to form a group, wait at a rally point, or cancel optional daily raid content.",
        "For combat, prefer fight_npc with a visible hostile npcRef. Avoid pulling packs unless grouping or using AoE intentionally.",
        "Only use fight_npc or damaging use_ability on attackable NPCs. Quest givers, merchants, guards, and wanderers are friendly menu/interact targets, not combat targets.",
        "NPC observations include pullRisk, approachRisk, nearbyHostileCount, and nearbyDangerousHostileCount. Prefer low-risk pulls with low approachRisk unless you are intentionally grouping or fighting the stronger enemy.",
        "After fight_npc or use_ability against an NPC, the harness continues ordinary combat messages on that selected target until it dies or you choose another high-level action.",
        "If adds pile up or health drops quickly, the harness may briefly kite toward the last safe point before asking for the next policy decision.",
        "If the selected combat target would require running into a dense hostile cluster, the harness holds at a safe edge and asks for a better target or route.",
        "If non-combat travel walks into a stronger hostile or crowded pack, the harness pauses movement and asks for a safer route or target.",
        "If lastAction starts with hold_safe_pull, hold_unsafe_pull, or hold_unsafe_travel, choose a different target, wait for respawns, reposition around the hazard, or group up instead of repeating the same target.",
        "Use combatTrouble as memory of recent bad pulls. If a named quest target repeatedly causes retreat_dangerous_add or retreat_overpull, stop brute-forcing it. Level on safer mobs, equip better gear, use consumables, chat/group with nearby players, or approach from another edge.",
        "Use self.levelProgress and safeTrainingTargets to decide whether safer nearby combat is a worthwhile preparation step before retrying hard quest targets.",
        "If movementTrouble is present or lastAction starts with stuck_rethink, the last route or movement target failed to make progress. Do not repeat the identical route immediately; pick a different local waypoint, approach from another side, interact with a nearby NPC/player for context, wait, or choose a different public route/landmark.",
        "If health is low and no enemy is currently attacking, the harness may wait briefly at a safe point to recover before asking for another decision.",
        "For travel_route, put a public route id or landmark id in text. Minor wording differences are accepted.",
        "If dead, use respawn. If multiple enemies target you, stabilize before moving deeper.",
        "If a corpse has loot and you are safe, use loot to clear it.",
        "If self.inventory contains sellableTrash items and you are safe, use sell_trash_items at trash-mfer to sell them for Season 0 points. This is a free room message, not a wallet burn.",
        "Trash sells for a base value from catalog.trashVendor. Declared agents need catalog.trashVendor.agentItemsPerPoint trash for 1 point; remainders stay in inventory and agents must pass the Agent Season 0 reward gate.",
        "If Agent Rewards or Season 0 chat says this agent is inactive/insufficient, you may briefly tell nearby humans that declared agents need 25M MFERGPT on Base to earn Season 0 points, and humans can use swap-mfer or the swap menu to swap Base ETH to MFERGPT. Do not spam this.",
        "Do not chase a perfect pull forever. If only the current target is attacking, health is not critical, and self.combatMath says the fight is favorable, keep attacking instead of repeatedly retreating.",
        "Retreat when health is critical, multiple adds make the combat math unfavorable, or the route would run deeper into a pack.",
        "You can use chat or emote to answer nearby player chat, greet helpers, coordinate pulls, or ask for a group. Keep it short and do not answer every message.",
        "Inventory is the character stash. Equipment observations include slot, item stats, quality, chain token, and chain tier when present.",
        "If talentPoints is positive, choose select_talent based on the archetype you want. Talent choices and requirements are in catalog.talentChoices.",
        "Use equip_item, unequip_item, use_item, select_talent, register_chain_gear, purchase_potion_shop_item, and sell_trash_items through normal room messages when the observation shows a useful reason.",
        "Use swap_eth_for_mfergpt when wallet.mferGptSwapConfigured is true, MFERGPT is low, and you choose to fund item burns from your own wallet ETH. In uniswap-v4 mode this uses the same Base ETH to MFERGPT route as swap-mfer.",
        "Paid shop and paid trait actions require a real MFERGPT burn payment proof. If wallet tools are configured, purchase_potion_shop_item can burn MFERGPT for the catalog price before sending the normal room message; otherwise include paymentTxHash, paymentAmountWei, paymentChainId, and paymentContractAddress.",
        "Wallet spending is disabled unless AGENT_MAX_MFERGPT_SPEND_WEI or AGENT_MAX_SWAP_ETH_SPEND_WEI is positive.",
        "If a spell has castTimeMs or requiresStationary, do not move until it lands.",
        "For update_traits, choose a traits object from catalog.traits based on what you know about yourself as an agent, your intended play archetype, and your style. Declared agents render with the mferGPT agent model, so choose valid mfer trait ids as identity metadata and for supported overlays. For a paid update, include paymentTxHash, paymentAmountWei, paymentChainId, and paymentContractAddress.",
      ],
      refs: {
        npcs: Object.fromEntries(refs),
        players: Object.fromEntries(playerRefs),
      },
      autonomyBoundary: {
        policyOwns: [
          "quest order",
          "where to explore",
          "which NPCs or players to interact with",
          "which target to fight",
          "when to loot",
          "when to group, chat, or emote",
          "when to use shops or wallet-backed payments",
        ],
        harnessAssists: [
          "wallet challenge signing",
          "Colyseus connection",
          "public observation packet",
          "normal room-message dispatch",
          "holding still while casts resolve",
          "continuing attacks on a policy-selected target",
          "using owned consumables at low health or mana",
        ],
        notIncluded: [
          "hard-coded quest path",
          "database reads",
          "debug server messages",
          "teleports",
          "production bypasses",
        ],
      },
      now,
      lastAction: this.lastAction,
    };
  }

  private buildCatalogObservation(self: RuntimePlayer) {
    if (!this.catalog) {
      return {
        source: "unavailable",
        note: "agent-catalog endpoint was not available; rely on live room state and raw inventory/equipment fields.",
      };
    }

    const items = asRecord(this.catalog.items);
    const itemDefinitions = Object.values(items).map(asRecord);
    return {
      source: "agent-catalog",
      controls: this.catalog.controls ?? {},
      menus: this.catalog.menus ?? {},
      payments: this.catalog.payments ?? {},
      progression: this.catalog.progression ?? {},
      traits: this.catalog.traits ?? {
        declaredAgentModel: "mfergpt",
        note: "Agent trait catalog unavailable. Use valid mfer trait ids if known; declared agents render with the mferGPT agent model.",
      },
      equipmentSlots: this.catalog.equipmentSlots ?? {},
      talentTrees: this.catalog.talentTrees ?? {},
      talentChoices: this.buildTalentChoices(self),
      questCatalog: Object.values(asRecord(this.catalog.quests))
        .map((quest) => {
          const record = asRecord(quest);
          return {
            id: getString(record.id),
            title: getString(record.title),
            objective: getString(record.objectiveLabel),
            turnInNpcId: getString(record.turnInNpcId),
            encounterType: getString(record.encounterType) || "solo",
            groupSuggestion: getString(record.groupSuggestion),
            suggestedPlayerCount: Math.max(1, getNumber(record.suggestedPlayerCount, 1)),
            soloWarning: getString(record.soloWarning),
          };
        })
        .filter((quest) => quest.id),
      equipmentCatalog: itemDefinitions
        .filter((item) => Boolean(item.equipment))
        .map((item) => this.summarizeItemDefinition(item))
        .slice(0, 80),
      consumableCatalog: itemDefinitions
        .filter((item) => Boolean(item.consumable))
        .map((item) => this.summarizeItemDefinition(item))
        .slice(0, 40),
      potionShop: this.catalog.potionShop ?? {},
      trashVendor: this.catalog.trashVendor ?? {},
    };
  }

  private getQuestCatalogEntry(questId: string) {
    const quests = asRecord(this.catalog?.quests);
    return asRecord(quests[questId]);
  }

  private buildTeamContext(self: RuntimePlayer) {
    const nearbyHealthyPlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId)
      .map((player) => ({ player, distance: distance2d(self, player) }))
      .filter(({ player, distance }) => player.health > 0 && distance <= 48);
    const nearbyHealthyAgentAllies = nearbyHealthyPlayers.filter(({ player }) => player.isAgent).length;
    const nearbyHealthyHumanAllies = nearbyHealthyPlayers.length - nearbyHealthyAgentAllies;
    return {
      nearbyHealthyAllies: nearbyHealthyPlayers.length,
      nearbyHealthyAgentAllies,
      nearbyHealthyHumanAllies,
      radiusMeters: 48,
      guidance: "Use this for group/raid judgment. Group suggested usually wants at least one healthy ally nearby; raid suggested wants a larger visible crew before calling or fighting the boss.",
    };
  }

  private buildSocialObservation(now: number) {
    this.pendingSocialMessages = this.pendingSocialMessages.filter((entry) => now - entry.observedAt <= SOCIAL_MESSAGE_TTL_MS);
    return {
      pendingMessages: this.pendingSocialMessages.slice(-6).map((entry) => ({
        name: entry.name,
        identityType: entry.identityType,
        text: entry.text,
        kind: entry.kind,
        secondsAgo: Math.max(0, Math.round((now - entry.observedAt) / 1000)),
      })),
      canChatNow: now >= this.nextChatAt,
      canEmoteNow: now >= this.nextEmoteAt,
      guidance: "If a player greets, asks a question, coordinates, or emotes nearby, you may choose chat or emote as your next action when it is useful and safe.",
    };
  }

  private describeLevelProgress(self: RuntimePlayer) {
    const progression = asRecord(this.catalog?.progression);
    const thresholds = Array.isArray(progression.levelXpThresholds)
      ? progression.levelXpThresholds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    const levelCap = getNumber(progression.levelCap, thresholds.length || self.level);
    const levelStartXp = thresholds[Math.max(0, self.level - 1)] ?? 0;
    const nextLevelXp = self.level >= levelCap ? levelStartXp : thresholds[self.level] ?? 0;
    const required = Math.max(0, nextLevelXp - levelStartXp);
    const current = required > 0 ? Math.max(0, Math.min(required, self.xp - levelStartXp)) : required;
    return {
      level: self.level,
      levelCap,
      totalXp: self.xp,
      current,
      required,
      remainingToNextLevel: required > 0 ? Math.max(0, required - current) : 0,
      nextLevel: self.level >= levelCap ? null : self.level + 1,
    };
  }

  private describeSafeTrainingTargets(self: RuntimePlayer) {
    return [...this.npcs.values()]
      .filter((npc) => npc.health > 0 && npc.defeatedAt <= 0 && !npc.isImmortal)
      .map((npc) => ({
        npc,
        distance: distance2d(self, npc),
        xpReward: this.getNpcXpReward(npc),
      }))
      .filter(({ npc, distance, xpReward }) => (
        distance <= 45
        && xpReward > 0
        && this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc) === 0
        && this.describeApproachRisk(self, npc) !== "high"
      ))
      .sort((a, b) => {
        if (a.xpReward !== b.xpReward) return b.xpReward - a.xpReward;
        return a.distance - b.distance;
      })
      .slice(0, 8)
      .map(({ npc, distance, xpReward }) => ({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        model: npc.model,
        health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
        distance: round(distance),
        xpReward,
        pullRisk: this.describePullRisk(npc),
        approachRisk: this.describeApproachRisk(self, npc),
      }));
  }

  private describeCombatMath(self: RuntimePlayer) {
    const attackers = this.getAttackers(self);
    const target = this.activeEngagementNpc() ?? attackers[0] ?? null;
    if (!target) {
      return {
        attackers: 0,
        target: "",
        favorable: true,
        guidance: "No active attackers.",
      };
    }
    const estimate = this.estimateCombatOutcome(self, target, attackers);
    return {
      attackers: attackers.length,
      target: target.name || target.id,
      targetId: target.id,
      extraAttackers: attackers.filter((attacker) => attacker.id !== target.id).map((attacker) => attacker.name || attacker.id).slice(0, 4),
      playerDps: round(estimate.playerDps),
      incomingDps: round(estimate.incomingDps),
      targetTtkSeconds: formatEstimateSeconds(estimate.targetTtkMs),
      survivalSeconds: formatEstimateSeconds(estimate.survivalMs),
      favorable: estimate.favorable,
      guidance: estimate.favorable
        ? "Current fight looks winnable; keep pressure unless health becomes critical or more adds join."
        : "Current fight looks unfavorable; stabilize, use control/items/heal, retreat, or group.",
    };
  }

  private getNpcXpReward(npc: RuntimeNpc) {
    const rewards = asRecord(asRecord(this.catalog?.progression).mobXpRewards);
    return getNumber(rewards[npc.model]) || getNumber(rewards[npc.role]);
  }

  private describeInventory(self: RuntimePlayer) {
    const trashVendor = asRecord(this.catalog?.trashVendor);
    const trashItemIds = new Set(
      (Array.isArray(trashVendor.itemIds) ? trashVendor.itemIds : [])
        .map((itemId) => getString(itemId))
        .filter(Boolean),
    );
    const baseTrashPoints = Math.max(0, getNumber(trashVendor.baseSeasonPointValue, 1));
    return self.inventory.map((item) => {
      const itemId = getString(item.id);
      const count = getNumber(item.count);
      const sellableTrash = trashItemIds.has(itemId);
      return {
        itemId,
        name: getString(this.itemDefinition(itemId).name) || itemId,
        quality: getString(this.itemDefinition(itemId).quality),
        count,
        chainTokenId: getString(item.chainTokenId),
        chainTier: getNumber(item.chainTier, 1),
        equipment: this.itemDefinition(itemId).equipment ?? null,
        consumable: this.itemDefinition(itemId).consumable ?? null,
        description: getString(this.itemDefinition(itemId).description),
        sellableTrash,
        trashVendorBasePoints: sellableTrash ? count * baseTrashPoints : 0,
      };
    });
  }

  private describeEquipment(self: RuntimePlayer) {
    return self.equipment.map((slot) => {
      const itemId = getString(slot.itemId);
      return {
        slot: getString(slot.slot),
        itemId,
        name: itemId ? getString(this.itemDefinition(itemId).name) || itemId : "",
        quality: itemId ? getString(this.itemDefinition(itemId).quality) : "",
        chainTokenId: getString(slot.chainTokenId),
        chainTier: getNumber(slot.chainTier, 1),
        equipment: itemId ? this.itemDefinition(itemId).equipment ?? null : null,
      };
    });
  }

  private describeTalents(self: RuntimePlayer) {
    return self.talents.map((talent) => {
      const talentId = getString(talent.id);
      const definition = this.talentDefinition(talentId);
      return {
        talentId,
        tree: getString(talent.tree),
        nodeId: getString(talent.nodeId),
        rank: getNumber(talent.rank),
        name: getString(definition.name) || talentId,
        effectText: getString(definition.effectText),
        unlockAction: getString(definition.unlockAction),
      };
    });
  }

  private buildTalentChoices(self: RuntimePlayer) {
    const talents = asRecord(this.catalog?.talents);
    return Object.entries(talents)
      .map(([talentId, value]) => {
        const talent = asRecord(value);
        const currentRank = this.getTalentRank(self, talentId);
        const maxRank = getNumber(talent.maxRank, 1);
        const minLevel = getNumber(talent.minLevel, 1);
        const missingRequirement = this.getMissingTalentRequirement(self, talent);
        const status = currentRank >= maxRank
          ? "maxed"
          : self.level < minLevel
            ? `locked: level ${minLevel}`
            : missingRequirement
              ? `locked: requires ${missingRequirement}`
              : self.talentPoints <= 0
                ? "no_points"
                : "available";
        return {
          talentId,
          tree: getString(talent.tree),
          nodeId: getString(talent.nodeId),
          name: getString(talent.name) || talentId,
          description: getString(talent.description),
          currentRank,
          maxRank,
          minLevel,
          status,
          effectText: getString(talent.effectText),
          effectPerRank: talent.effectPerRank ?? {},
          unlockAction: getString(talent.unlockAction),
          requires: Array.isArray(talent.requires) ? talent.requires : [],
        };
      })
      .sort((a, b) => {
        const availableOrder = Number(b.status === "available") - Number(a.status === "available");
        return availableOrder || a.tree.localeCompare(b.tree) || a.talentId.localeCompare(b.talentId);
      });
  }

  private summarizeItemDefinition(item: AnyRecord) {
    return {
      itemId: getString(item.id),
      name: getString(item.name),
      quality: getString(item.quality),
      value: getNumber(item.value),
      equipment: item.equipment ?? null,
      consumable: item.consumable ?? null,
      description: getString(item.description),
    };
  }

  private itemDefinition(itemId: string) {
    return asRecord(asRecord(this.catalog?.items)[itemId]);
  }

  private talentDefinition(talentId: string) {
    return asRecord(asRecord(this.catalog?.talents)[talentId]);
  }

  private getTalentRank(self: RuntimePlayer, talentId: string) {
    const direct = self.talents.find((talent) => getString(talent.id) === talentId);
    if (direct) return getNumber(direct.rank);
    const [tree, nodeId] = talentId.split(":");
    const legacy = self.talents.find((talent) => getString(talent.tree) === tree && getString(talent.nodeId) === nodeId);
    return legacy ? getNumber(legacy.rank) : 0;
  }

  private getMissingTalentRequirement(self: RuntimePlayer, talent: AnyRecord) {
    if (!Array.isArray(talent.requires)) return "";
    for (const requirement of talent.requires.map(asRecord)) {
      const talentId = getString(requirement.talentId);
      const rank = getNumber(requirement.rank, 1);
      if (!talentId) continue;
      if (this.getTalentRank(self, talentId) < rank) return `${talentId} rank ${rank}`;
    }
    return "";
  }

  private isActiveQuestObjectiveNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    return this.isExactActiveQuestObjectiveNpc(self, npc) || this.isModelActiveQuestObjectiveNpc(self, npc);
  }

  private isExactActiveQuestObjectiveNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    const quests = asRecord(this.catalog?.quests);
    return self.quests.some((quest) => {
      const status = getString(quest.status);
      if (status !== "active" && status !== "ready") return false;
      const questId = getString(quest.id);
      const definition = asRecord(quests[questId]);
      const objectives = Array.isArray(definition.objectives) ? definition.objectives.map(asRecord) : [];
      return objectives.some((objective) => getString(objective.id) === npc.id);
    });
  }

  private isModelActiveQuestObjectiveNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    const quests = asRecord(this.catalog?.quests);
    return self.quests.some((quest) => {
      const status = getString(quest.status);
      if (status !== "active" && status !== "ready") return false;
      const questId = getString(quest.id);
      const definition = asRecord(quests[questId]);
      const defeatNpcModels = stringArray(definition.defeatNpcModels);
      const dropNpcModels = stringArray(definition.dropNpcModels);
      return defeatNpcModels.includes(npc.model) || dropNpcModels.includes(npc.model);
    });
  }

  private startViewer() {
    if (!this.config.viewerPort) return;
    this.viewerServer = createServer((request, response) => this.handleViewerRequest(request, response));
    this.viewerServer.on("error", (error) => this.log(`viewer error: ${errorMessage(error)}`));
    this.viewerServer.listen(this.config.viewerPort, this.config.viewerHost, () => {
      this.log(`viewer listening at http://${this.config.viewerHost}:${this.config.viewerPort}`);
    });
  }

  private handleViewerRequest(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${this.config.viewerHost}:${this.config.viewerPort}`}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(VIEWER_HTML);
      return;
    }
    if (url.pathname === "/state") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(this.buildViewerState()));
      return;
    }
    if (url.pathname === "/health") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }

  private buildViewerState() {
    const self = this.self();
    const now = Date.now();
    const npcs = [...this.npcs.values()]
      .map((npc) => ({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        model: npc.model,
        position: point(npc),
        health: Math.ceil(npc.health),
        maxHealth: Math.ceil(npc.maxHealth),
        alive: npc.health > 0 && npc.defeatedAt <= 0,
        defeatedAt: npc.defeatedAt,
        hasLoot: npc.hasLoot,
        questId: npc.questId,
        shopId: npc.shopId,
        aggroTarget: self && npc.aggroTargetId === self.sessionId ? "you" : npc.aggroTargetId ? "other" : "",
        distance: self ? round(distance2d(self, npc)) : 0,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 80);
    const players = [...this.players.values()]
      .map((player) => ({
        sessionId: player.sessionId,
        name: player.name,
        isSelf: self ? player.sessionId === self.sessionId : false,
        isAgent: player.isAgent,
        identityType: player.identityType,
        position: point(player),
        health: Math.ceil(player.health),
        maxHealth: Math.ceil(player.maxHealth),
        mana: Math.ceil(player.mana),
        maxMana: Math.ceil(player.maxMana),
        level: player.level,
        animation: player.animation,
        castingAction: player.castingAction,
        distance: self ? round(distance2d(self, player)) : 0,
      }))
      .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.distance - b.distance))
      .slice(0, 24);
    return {
      connected: Boolean(this.room),
      roomName: this.config.roomName,
      objective: this.config.objective,
      wallet: {
        address: this.account.address,
        agentClient: true,
      },
      self: self
        ? {
          sessionId: self.sessionId,
          name: self.name,
          position: point(self),
          yaw: round(self.yaw),
          level: self.level,
          xp: self.xp,
          health: Math.ceil(self.health),
          maxHealth: Math.ceil(self.maxHealth),
          mana: Math.ceil(self.mana),
          maxMana: Math.ceil(self.maxMana),
          animation: self.animation,
          castingAction: self.castingAction,
          aggroCount: [...this.npcs.values()].filter((npc) => npc.aggroTargetId === self.sessionId && npc.health > 0 && npc.defeatedAt <= 0).length,
          quests: self.quests.map((quest) => ({
            id: getString(quest.id),
            status: getString(quest.status),
            progress: getNumber(quest.progress),
            required: getNumber(quest.required),
            title: this.questMemory.get(getString(quest.id))?.title ?? "",
            objective: this.questMemory.get(getString(quest.id))?.objectiveLabel ?? "",
          })),
          inventory: self.inventory.slice(0, 32),
        }
        : null,
      players,
      npcs,
      targetPoint: this.targetPoint,
      routeQueue: this.routeQueue,
      movementTrouble: this.describeMovementTrouble(now),
      engagedNpcId: this.engagedNpcId,
      combatAnchor: this.combatAnchor,
      lastAction: this.lastAction,
      lastDecision: this.lastDecision,
      recentMessages: this.recentMessages.slice(-18),
      questMemory: [...this.questMemory.values()].sort((a, b) => b.observedAt - a.observedAt).slice(0, 12),
      publicMap: {
        landmarks: PUBLIC_LANDMARKS,
        routes: PUBLIC_ROUTES,
      },
      now,
    };
  }

  private async executeDecision(decision: Decision) {
    const self = this.self();
    if (!self) return;

    switch (decision.action) {
      case "wait":
        this.targetPoint = null;
        this.clearEngagement();
        this.lastAction = "wait";
        return;
      case "respawn":
        this.clearEngagement();
        this.routeQueue = [];
        this.send("respawn", {});
        this.lastAction = "respawn";
        return;
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        if (x === undefined || z === undefined) throw new Error("move_to requires x and z");
        this.clearEngagement();
        this.routeQueue = [];
        this.moveTo({ x, z });
        this.lastAction = `move_to ${round(x)},${round(z)}`;
        return;
      }
      case "travel_route": {
        const routeText = cleanText(decision.text, 80);
        const route = resolveRoute(routeText);
        if (!route) throw new Error(`unknown route ${routeText}`);
        const actionLabel = `travel_route ${routeText}`;
        if (this.lastAction === actionLabel && (this.targetPoint || this.routeQueue.length > 0)) {
          this.followRoute(self);
          return;
        }
        this.clearEngagement();
        this.routeQueue = [...route];
        this.followRoute(self);
        this.lastAction = actionLabel;
        return;
      }
      case "move_near_npc":
      case "interact_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error(`${decision.action} requires npcRef`);
        if (isHostile(npc) && !npc.isImmortal && npc.health > 0 && npc.defeatedAt <= 0) {
          this.setEngagement(self, npc.id);
          this.routeQueue = [];
          this.fight(self, npc);
          return;
        }
        this.clearEngagement();
        if (decision.action === "move_near_npc" || distance2d(self, npc) > INTERACT_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_near_npc ${npc.id}`;
          return;
        }
        this.targetPoint = null;
        this.send("interact", { npcId: npc.id });
        this.lastAction = `interact_npc ${npc.id}`;
        return;
      }
      case "move_near_player": {
        const player = this.resolvePlayer(decision.playerRef);
        if (!player) throw new Error("move_near_player requires playerRef");
        this.clearEngagement();
        this.moveTo(player);
        this.lastAction = `move_near_player ${player.name}`;
        return;
      }
      case "accept_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) throw new Error("accept_quest requires questId and npcRef");
        this.focusedQuestId = questId;
        this.clearEngagement();
        if (!this.hasRecentQuestOffer(questId, npc.id)) {
          if (distance2d(self, npc) > INTERACT_SEND_RANGE) {
            this.moveNearNpc(self, npc);
            this.lastAction = `move_to_offer ${questId}`;
            return;
          }
          this.targetPoint = null;
          this.send("interact", { npcId: npc.id });
          this.lastAction = `need_offer_for_accept ${questId}`;
          return;
        }
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_accept ${questId}`;
          return;
        }
        this.targetPoint = null;
        this.send("acceptQuest", { questId, npcId: npc.id });
        this.lastAction = `accept_quest ${questId}`;
        return;
      }
      case "complete_quest": {
        const questId = cleanText(decision.questId, 96);
        const npc = this.resolveNpc(decision.npcRef);
        if (!questId || !npc) throw new Error("complete_quest requires questId and npcRef");
        this.focusedQuestId = questId;
        this.clearEngagement();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_complete ${questId}`;
          return;
        }
        this.targetPoint = null;
        this.send("completeQuest", { questId, npcId: npc.id });
        this.lastAction = `complete_quest ${questId}`;
        return;
      }
      case "cancel_quest": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("cancel_quest requires questId");
        if (this.focusedQuestId === questId) this.focusedQuestId = "";
        this.send("cancelQuest", { questId });
        this.lastAction = `cancel_quest ${questId}`;
        return;
      }
      case "fight_npc": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("fight_npc requires visible npcRef");
        this.assertNpcCombatTarget(npc, "fight_npc");
        this.setEngagement(self, npc.id);
        this.routeQueue = [];
        this.fight(self, npc);
        return;
      }
      case "use_ability": {
        const actionId = normalizeCombatAction(decision.actionId);
        if (!actionId) throw new Error("use_ability requires actionId");
        if (decision.playerRef) {
          const player = this.resolvePlayer(decision.playerRef);
          if (!player) throw new Error("unknown playerRef");
          this.clearEngagement();
          this.routeQueue = [];
          this.cast(actionId, { kind: "player", id: player.sessionId });
        } else {
          if (actionId === "frostNova" || actionId === "whirlwind") {
            if (self.health > 0 && self.health < self.maxHealth * 0.28) {
              this.routeQueue = [];
              this.startRetreat(self, `retreat_skip_${actionId}`);
              this.lastAction = `retreat_skip_${actionId}`;
              return;
            }
            this.clearEngagement();
            this.routeQueue = [];
            this.cast(actionId, { kind: "npc", id: "" });
            this.lastAction = `use_ability ${actionId}`;
            return;
          }
          const npc = this.resolveNpc(decision.npcRef);
          if (!npc) throw new Error("use_ability requires npcRef or playerRef");
          if (actionId !== "heal") this.assertNpcCombatTarget(npc, `use_ability ${actionId}`);
          if (actionId === "heal") this.clearEngagement();
          else this.setEngagement(self, npc.id);
          this.routeQueue = [];
          this.cast(actionId, { kind: "npc", id: npc.id });
        }
        this.lastAction = `use_ability ${actionId}`;
        return;
      }
      case "loot": {
        const npc = this.resolveNpc(decision.npcRef);
        if (!npc) throw new Error("loot requires npcRef");
        this.clearEngagement();
        if (distance2d(self, npc) > LOOT_SEND_RANGE) {
          this.moveTo(point(npc));
          this.lastAction = `move_to_loot ${npc.id}`;
          return;
        }
        this.targetPoint = null;
        this.send("lootCorpse", { npcId: npc.id });
        this.lastAction = `loot ${npc.id}`;
        return;
      }
      case "equip_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("equip_item requires itemId");
        this.clearEngagement();
        this.send("equipItem", { itemId, chainTokenId: cleanText(decision.chainTokenId, 128) || undefined });
        this.lastAction = `equip_item ${itemId}`;
        return;
      }
      case "unequip_item": {
        const slot = cleanText(decision.slotId, 40) || cleanText(decision.text, 40);
        if (!slot) throw new Error("unequip_item requires slotId or text");
        this.clearEngagement();
        this.send("unequipItem", { slot });
        this.lastAction = `unequip_item ${slot}`;
        return;
      }
      case "use_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("use_item requires itemId");
        this.clearEngagement();
        this.send("useItem", { itemId, chainTokenId: cleanText(decision.chainTokenId, 128) || undefined });
        this.lastAction = `use_item ${itemId}`;
        return;
      }
      case "select_talent": {
        const talentId = cleanText(decision.talentId, 96) || cleanText(decision.text, 96);
        if (!talentId) throw new Error("select_talent requires talentId or text");
        this.clearEngagement();
        this.send("selectTalent", { talentId });
        this.lastAction = `select_talent ${talentId}`;
        return;
      }
      case "swap_eth_for_mfergpt": {
        const amountEth = cleanText(decision.amountEth, 32) || this.walletSnapshot?.recommendedSwapEthAmount || DEFAULT_SWAP_ETH_AMOUNT;
        const amountWei = parseEthAmount(amountEth);
        if (!this.walletTools) throw new Error("MFERGPT wallet tools are not configured for this agent.");
        this.reserveSwapEthSpend(amountWei.toString());
        this.clearEngagement();
        const result = await this.walletTools.swapEthForMferGpt(amountEth);
        this.remember(`swapMferGpt:${result.txHash}:${result.received} MFERGPT`, true);
        this.lastAction = `swap_eth_for_mfergpt ${amountEth}`;
        return;
      }
      case "register_chain_gear": {
        const tokenId = cleanText(decision.text, 96);
        if (!tokenId) throw new Error("register_chain_gear requires token id in text");
        this.clearEngagement();
        this.send("registerChainGear", { tokenId });
        this.lastAction = `register_chain_gear ${tokenId}`;
        return;
      }
      case "purchase_potion_shop_item": {
        const itemId = cleanText(decision.itemId, 96);
        if (!itemId) throw new Error("purchase_potion_shop_item requires itemId");
        const quantity = normalizePurchaseQuantity(decision.quantity);
        const payment = await this.resolvePotionShopPayment(decision, itemId, quantity);
        this.clearEngagement();
        this.send("purchasePotionShopItem", { itemId, quantity, payment });
        this.lastAction = `purchase_potion_shop_item ${itemId} x${quantity}`;
        return;
      }
      case "sell_trash_items": {
        const npc = this.resolveNpc(decision.npcRef) ?? this.resolveNpc("trash-mfer");
        if (!npc) throw new Error("sell_trash_items requires trash-mfer to be visible in room state");
        this.clearEngagement();
        if (distance2d(self, npc) > QUEST_SEND_RANGE) {
          this.moveNearNpc(self, npc);
          this.lastAction = `move_to_sell_trash ${npc.id}`;
          return;
        }
        const itemId = cleanText(decision.itemId, 96);
        const trashVendor = asRecord(this.catalog?.trashVendor);
        const agentItemsPerPoint = readInteger(trashVendor.agentItemsPerPoint) || 4;
        const defaultQuantity = itemId && self.isAgent ? agentItemsPerPoint : 1;
        const quantity = normalizeTrashSellQuantity(decision.quantity, defaultQuantity);
        this.targetPoint = null;
        this.send("sellTrashItems", itemId ? { itemId, quantity } : { sellAll: true });
        this.lastAction = itemId ? `sell_trash_items ${itemId} x${quantity}` : "sell_trash_items all";
        return;
      }
      case "update_traits": {
        this.clearEngagement();
        const payment = this.buildPaymentProof(decision);
        if (payment) this.reserveMferGptSpend(payment.amountWei);
        const traits = this.resolveAgentTraits(decision.traits);
        this.send("updateTraits", {
          traits,
          name: this.config.agentName,
          attemptId: `llm-skill-runner-${Date.now()}`,
          payment,
        });
        this.lastAction = `update_traits ${JSON.stringify(traits)}`;
        return;
      }
      case "share_quest_link": {
        const questId = cleanText(decision.questId, 96);
        if (!questId) throw new Error("share_quest_link requires questId");
        this.focusedQuestId = questId;
        this.clearEngagement();
        this.send("shareQuestLink", { questId, url: "https://game.mfergpt.lol" });
        this.lastAction = `share_quest_link ${questId}`;
        return;
      }
      case "chat": {
        const text = cleanText(decision.text, 180);
        if (!text) throw new Error("chat requires text");
        this.clearEngagement();
        if (!this.canSendChat()) {
          this.lastAction = "chat_cooldown";
          return;
        }
        this.sendChat(text);
        this.markSocialHandled();
        this.lastAction = `chat ${text.slice(0, 24)}`;
        return;
      }
      case "emote": {
        const emoteId = cleanText(decision.emoteId, 40) || "wave";
        this.clearEngagement();
        if (!this.canSendEmote()) {
          this.lastAction = "emote_cooldown";
          return;
        }
        this.sendEmote(emoteId);
        this.markSocialHandled();
        this.lastAction = `emote ${emoteId}`;
        return;
      }
      default:
        throw new Error(`unknown action ${decision.action}`);
    }
  }

  private setEngagement(self: RuntimePlayer, npcId: string) {
    this.engagedNpcId = npcId;
    this.combatAnchor = point(self);
  }

  private clearEngagement() {
    this.engagedNpcId = "";
    this.combatAnchor = null;
  }

  private hasRecentQuestOffer(questId: string, npcId: string) {
    const offer = this.questMemory.get(questId);
    if (!offer || offer.kind !== "offer") return false;
    if (offer.npcId && npcId && offer.npcId !== npcId) return false;
    return Date.now() - offer.observedAt <= 120_000;
  }

  private assertNpcCombatTarget(npc: RuntimeNpc, action: string) {
    if (!isAttackable(npc)) {
      this.recordCombatTrouble(npc.id, "non_attackable_target");
      throw new Error(`${action} target ${npc.id} is not attackable; role=${npc.role}, model=${npc.model}`);
    }
    if (npc.isImmortal || npc.health <= 0 || npc.defeatedAt > 0) {
      this.recordCombatTrouble(npc.id, "unavailable_target");
      throw new Error(`${action} target ${npc.id} is not currently available for combat`);
    }
  }

  private maybeAnnounceNextAction(self: RuntimePlayer, decision: Decision) {
    if (!this.config.announceNextAction || self.health <= 0 || !this.canSendChat()) return;
    if (decision.action === "wait" || decision.action === "chat" || decision.action === "emote") return;
    const text = this.describeNextActionChat(decision);
    if (!text || text === this.lastNextActionChat) return;
    this.sendChat(text);
    this.lastNextActionChat = text;
  }

  private describeNextActionChat(decision: Decision) {
    const npc = this.resolveNpc(decision.npcRef);
    const player = this.resolvePlayer(decision.playerRef);
    const questLabel = this.getQuestLabel(cleanText(decision.questId, 96));
    const itemId = cleanText(decision.itemId, 96);
    const actionId = cleanText(decision.actionId, 40);
    switch (decision.action) {
      case "move_to": {
        const x = readFiniteNumber(decision.x);
        const z = readFiniteNumber(decision.z);
        return x === undefined || z === undefined ? "" : `next: moving to ${round(x)}, ${round(z)}`;
      }
      case "travel_route":
        return `next: taking ${cleanText(decision.text, 80) || "a route"}`;
      case "move_near_npc":
        return npc ? `next: heading to ${npc.name}` : "";
      case "interact_npc":
        return npc ? `next: talking to ${npc.name}` : "";
      case "move_near_player":
        return player ? `next: moving over to ${player.name}` : "";
      case "accept_quest":
        return questLabel ? `next: accepting ${questLabel}` : "";
      case "complete_quest":
        return questLabel ? `next: turning in ${questLabel}` : "";
      case "cancel_quest":
        return questLabel ? `next: dropping ${questLabel}` : "";
      case "fight_npc":
        return npc ? `next: fighting ${npc.name}` : "";
      case "use_ability":
        return player && actionId
          ? `next: using ${actionId} with ${player.name}`
          : npc && actionId
            ? `next: using ${actionId} on ${npc.name}`
            : "";
      case "loot":
        return npc ? `next: looting ${npc.name}` : "";
      case "equip_item":
        return itemId ? `next: equipping ${itemId}` : "";
      case "unequip_item": {
        const slot = cleanText(decision.slotId, 40) || cleanText(decision.text, 40);
        return slot ? `next: unequipping ${slot}` : "";
      }
      case "use_item":
        return itemId ? `next: using ${itemId}` : "";
      case "select_talent": {
        const talentId = cleanText(decision.talentId, 96) || cleanText(decision.text, 96);
        return talentId ? `next: spending a point on ${talentId}` : "";
      }
      case "share_quest_link":
        return questLabel ? `next: sharing ${questLabel}` : "";
      case "swap_eth_for_mfergpt":
        return "next: swapping ETH for MFERGPT";
      case "register_chain_gear":
        return "next: registering chain gear";
      case "purchase_potion_shop_item":
        return itemId ? `next: buying ${itemId}` : "";
      case "update_traits":
        return "next: updating traits";
      case "respawn":
        return "next: respawning";
      default:
        return "";
    }
  }

  private getQuestLabel(questId: string) {
    if (!questId) return "";
    const memory = this.questMemory.get(questId);
    return memory?.title || questId;
  }

  private canSendChat() {
    return Date.now() >= this.nextChatAt;
  }

  private sendChat(text: string) {
    const cleaned = makeChatLine(text);
    if (!cleaned) return;
    this.send("chat", { text: cleaned });
    this.nextChatAt = Date.now() + this.config.chatCooldownMs;
  }

  private canSendEmote() {
    return Date.now() >= this.nextEmoteAt;
  }

  private sendEmote(emoteId: string) {
    const cleaned = cleanText(emoteId, 40) || "wave";
    this.send("emote", { emoteId: cleaned });
    this.nextEmoteAt = Date.now() + this.config.emoteCooldownMs;
  }

  private markSocialHandled() {
    this.pendingSocialMessages = [];
  }

  private buildPaymentProof(decision: Decision) {
    const txHash = normalizeTxHash(decision.paymentTxHash);
    if (!txHash) return null;
    const amountWei = normalizePositiveIntegerString(decision.paymentAmountWei);
    if (!amountWei) throw new Error("paymentAmountWei must be a positive integer string");
    const chainId = readInteger(decision.paymentChainId);
    if (!chainId) throw new Error("paymentChainId is required for payment proof");
    const contractAddress = normalizeAddress(decision.paymentContractAddress);
    return {
      token: "MFERGPT",
      txHash,
      amountWei,
      chainId,
      contractAddress: contractAddress || undefined,
    };
  }

  private requirePaymentProof(decision: Decision, action: string) {
    const payment = this.buildPaymentProof(decision);
    if (!payment) throw new Error(`${action} requires paymentTxHash, paymentAmountWei, and paymentChainId`);
    return payment;
  }

  private resolveAgentTraits(rawTraits: unknown) {
    const selected = asRecord(rawTraits);
    const allowedOptions = this.traitOptionMap();
    const traits: Record<string, string> = { ...AGENT_DEFAULT_TRAITS };
    for (const [categoryId, rawValue] of Object.entries(selected)) {
      const value = cleanText(rawValue, 80);
      if (!value) continue;
      const allowed = allowedOptions.get(categoryId);
      if (allowed && !allowed.has(value)) continue;
      traits[categoryId] = value;
    }
    return traits;
  }

  private traitOptionMap() {
    const categories = Array.isArray(asRecord(this.catalog?.traits).categories)
      ? asRecord(this.catalog?.traits).categories as unknown[]
      : [];
    return new Map(categories.map((entry) => {
      const category = asRecord(entry);
      const categoryId = cleanText(category.id, 80);
      const options = Array.isArray(category.options) ? category.options.map(asRecord) : [];
      return [
        categoryId,
        new Set(options.map((option) => cleanText(option.id, 80)).filter(Boolean)),
      ] as const;
    }).filter(([categoryId]) => Boolean(categoryId)));
  }

  private async resolvePotionShopPayment(decision: Decision, itemId: string, quantity: number) {
    const explicitPayment = this.buildPaymentProof(decision);
    if (explicitPayment) {
      this.reserveMferGptSpend(explicitPayment.amountWei);
      return explicitPayment;
    }
    if (!this.walletTools) {
      throw new Error("purchase_potion_shop_item requires payment proof or configured MFERGPT wallet tools");
    }
    const price = this.getPotionShopPrice(itemId, quantity);
    this.reserveMferGptSpend(price.amountWei);
    return this.walletTools.burn(price.amountWei, price.label);
  }

  private getPotionShopPrice(itemId: string, quantity: number) {
    const potionShop = asRecord(this.catalog?.potionShop);
    const items = Array.isArray(potionShop.items) ? potionShop.items.map(asRecord) : [];
    const entry = items.find((item) => getString(item.itemId) === itemId);
    const prices = asRecord(entry?.prices);
    const price = asRecord(prices[String(quantity)]);
    const amountWei = normalizePositiveIntegerString(price.amountWei);
    const label = cleanText(price.label, 80) || `${amountWei} wei MFERGPT`;
    if (!amountWei) throw new Error(`catalog missing MFERGPT price for ${itemId} x${quantity}`);
    return { amountWei, label };
  }

  private reserveMferGptSpend(amountWei: string) {
    const amount = BigInt(amountWei);
    const maxSpend = BigInt(this.config.maxMferGptSpendWei);
    if (maxSpend <= 0n) {
      throw new Error("paid MFERGPT actions are disabled; set AGENT_MAX_MFERGPT_SPEND_WEI to a positive integer to allow them");
    }
    if (this.mferGptSpendSubmittedWei + amount > maxSpend) {
      throw new Error("paid MFERGPT action exceeds AGENT_MAX_MFERGPT_SPEND_WEI");
    }
    this.mferGptSpendSubmittedWei += amount;
  }

  private reserveSwapEthSpend(amountWei: string) {
    const amount = BigInt(amountWei);
    const maxSpend = BigInt(this.config.maxSwapEthSpendWei);
    if (maxSpend <= 0n) {
      throw new Error("MFERGPT swap actions are disabled; set AGENT_MAX_SWAP_ETH_SPEND_WEI to a positive integer to allow them");
    }
    if (this.swapEthSpendSubmittedWei + amount > maxSpend) {
      throw new Error("swap_eth_for_mfergpt exceeds AGENT_MAX_SWAP_ETH_SPEND_WEI");
    }
    this.swapEthSpendSubmittedWei += amount;
  }

  private activeEngagementNpc() {
    const npc = this.npcs.get(this.engagedNpcId);
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) return null;
    return npc;
  }

  private fight(self: RuntimePlayer, npc: RuntimeNpc) {
    this.routeQueue = [];
    const distance = distance2d(self, npc);
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (healthRatio < 0.88 && this.hasDangerousAdd(attackers, npc) && !this.shouldPressCurrentFight(self, npc, attackers)) {
      this.startRetreat(self, "retreat_dangerous_add");
      return;
    }
    if (
      self.level >= COMBAT.shoot.minLevel
      && distance < 12
      && (attackers.length >= 2 || healthRatio < RECOVER_HEALTH_RATIO)
      && (this.lastSafePoint || this.combatAnchor)
      && !this.shouldPressCurrentFight(self, npc, attackers)
    ) {
      this.startRetreat(self, "kite_to_range");
      return;
    }
    if (healthRatio < CRITICAL_HEALTH_RATIO && (this.lastSafePoint || this.combatAnchor)) {
      this.startRetreat(self, "retreat_critical_health");
      return;
    }
    const actionId = this.chooseCombatAction(self, npc, distance);
    const action = COMBAT[actionId];
    const canTakeQuestRisk = this.canTakeQuestObjectiveRisk(self, npc, attackers);
    if (this.shouldHoldUnsafePull(self, npc, attackers)) {
      this.clearEngagement();
      this.targetPoint = null;
      this.lastAction = `hold_unsafe_pull ${npc.id}`;
      return;
    }
    if (distance > action.maxRange * 0.9) {
      const destination = this.combatRangePoint(self, npc, action);
      const pathThreat = this.dangerousHostileOnTravelPath(self, destination, 12);
      if (pathThreat && npc.aggroTargetId !== self.sessionId && !canTakeQuestRisk) {
        this.clearEngagement();
        this.targetPoint = null;
        this.recordCombatTrouble(npc.id, `unsafe_path:${pathThreat.id}`);
        this.lastAction = `hold_unsafe_pull_path ${npc.id} via ${pathThreat.id}`;
        return;
      }
      if (
        isHostile(npc)
        && this.nearbyHostileCount(npc, 12, npc.id) >= 3
        && this.nearbyHostileCount(destination, 14) > 0
        && !canTakeQuestRisk
      ) {
        this.clearEngagement();
        this.targetPoint = null;
        this.recordCombatTrouble(npc.id, "unsafe_pull_edge");
        this.lastAction = `hold_safe_pull ${npc.id}`;
        return;
      }
      this.moveTo(destination);
      this.lastAction = `move_to_fight ${npc.id}`;
      return;
    }
    this.targetPoint = null;
    this.cast(actionId, actionId === "heal" ? { kind: "player", id: self.sessionId } : { kind: "npc", id: npc.id });
    this.lastAction = `combat ${actionId} ${npc.id}`;
  }

  private shouldHoldUnsafePull(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    if (!isHostile(npc) || npc.isImmortal || npc.health <= 0 || npc.defeatedAt > 0) return false;
    if (npc.aggroTargetId === self.sessionId || attackers.some((attacker) => attacker.id === npc.id)) return false;
    if (attackers.length > 0) return false;
    const dangerousNeighbors = this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc);
    const crowdedNeighbors = this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id);
    if (self.health >= self.maxHealth * 0.86) {
      if (this.isExactActiveQuestObjectiveNpc(self, npc)) return false;
      if (this.isModelActiveQuestObjectiveNpc(self, npc) && dangerousNeighbors === 0) return false;
      if (
        this.canTakeQuestObjectiveRisk(self, npc, attackers)
        && dangerousNeighbors <= 1
        && crowdedNeighbors < 5
      ) return false;
    }
    const shouldHold = dangerousNeighbors > 0 || crowdedNeighbors >= 4;
    if (shouldHold) this.recordCombatTrouble(npc.id, dangerousNeighbors > 0 ? "dangerous_neighbor" : "crowded_pull");
    return shouldHold;
  }

  private canTakeQuestObjectiveRisk(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    if (!this.isModelActiveQuestObjectiveNpc(self, npc) && !this.isExactActiveQuestObjectiveNpc(self, npc)) return false;
    if (attackers.length > 0 && !attackers.some((attacker) => attacker.id === npc.id)) return false;
    if (self.health < self.maxHealth * 0.92) return false;
    if (npc.maxHealth > self.maxHealth * 0.42) return false;
    if (this.getCombatTroubleCount(npc.id, 90_000) >= 2) return false;
    return true;
  }

  private shouldPressCurrentFight(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) return false;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    if (healthRatio <= CRITICAL_HEALTH_RATIO) return false;
    if (attackers.length === 0) return true;

    const targetIsAttacking = attackers.some((attacker) => attacker.id === npc.id);
    const extraAttackers = attackers.filter((attacker) => attacker.id !== npc.id);
    const estimate = this.estimateCombatOutcome(self, npc, attackers);
    const canFinishSoon = npc.health <= this.estimatePlayerBurstDamage(self) * 1.35 && healthRatio >= PRESS_LOW_HEALTH_FINISH_RATIO;

    if (extraAttackers.length === 0 && targetIsAttacking) {
      return healthRatio >= PRESS_SINGLE_ATTACKER_HEALTH_RATIO || estimate.favorable || canFinishSoon;
    }
    if (attackers.length <= 2 && healthRatio >= PRESS_MULTI_ATTACKER_HEALTH_RATIO && estimate.favorable) return true;
    return canFinishSoon && estimate.survivalMs > 2500;
  }

  private estimateCombatOutcome(self: RuntimePlayer, npc: RuntimeNpc, attackers: RuntimeNpc[]) {
    const playerDps = this.estimatePlayerDamagePerSecond(self);
    const incomingDps = attackers.reduce((total, attacker) => total + this.estimateNpcDamagePerSecond(attacker), 0);
    const targetTtkMs = playerDps > 0 ? (Math.max(0, npc.health) / playerDps) * 1000 : Number.POSITIVE_INFINITY;
    const survivalMs = incomingDps > 0 ? (Math.max(0, self.health) / incomingDps) * 1000 : Number.POSITIVE_INFINITY;
    const burstFinish = npc.health <= this.estimatePlayerBurstDamage(self) * 1.2;
    const favorable = incomingDps <= 0
      || targetTtkMs * FAVORABLE_FIGHT_SURVIVAL_MARGIN <= survivalMs
      || (burstFinish && self.health >= self.maxHealth * PRESS_LOW_HEALTH_FINISH_RATIO);
    return { playerDps, incomingDps, targetTtkMs, survivalMs, favorable };
  }

  private estimatePlayerDamagePerSecond(self: RuntimePlayer) {
    return Math.max(
      ...COMBAT_ACTION_IDS
        .filter((actionId) => actionId !== "heal" && actionId !== "taunt")
        .filter((actionId) => this.isActionUsableSoon(self, actionId))
        .map((actionId) => {
          const action = COMBAT[actionId];
          const cycleMs = Math.max(action.cooldownMs, action.castTimeMs + 1000, 1000);
          return this.estimatePlayerActionDamage(self, actionId) / (cycleMs / 1000);
        }),
      this.estimatePlayerActionDamage(self, "attack") / 1.5,
    );
  }

  private estimatePlayerBurstDamage(self: RuntimePlayer) {
    return Math.max(
      ...COMBAT_ACTION_IDS
        .filter((actionId) => actionId !== "heal" && actionId !== "taunt")
        .filter((actionId) => this.isActionUsableSoon(self, actionId))
        .map((actionId) => this.estimatePlayerActionDamage(self, actionId)),
      this.estimatePlayerActionDamage(self, "attack"),
    );
  }

  private isActionUsableSoon(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT[actionId];
    if (self.level < action.minLevel || self.mana < action.manaCost) return false;
    const unlockTalentId = COMBAT_UNLOCK_TALENTS[actionId];
    if (unlockTalentId && this.getTalentRank(self, unlockTalentId) <= 0) return false;
    const readyAt = getNumber(self[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now() + 2500;
  }

  private estimatePlayerActionDamage(self: RuntimePlayer, actionId: CombatActionId) {
    const baseDamage = COMBAT[actionId].damage;
    if (actionId === "attack") return baseDamage + Math.floor(self.strength * 0.7);
    if (actionId === "shoot" || actionId === "multishot") return baseDamage + Math.floor(self.dexterity * 0.75);
    if (actionId === "signalShot") return baseDamage + Math.floor(self.dexterity * 0.45) + Math.floor(self.magic * 0.45);
    if (actionId === "whirlwind") return baseDamage + Math.floor(self.strength * 0.55);
    if (actionId === "fireblast") return baseDamage + Math.floor(self.magic * 1.1);
    if (actionId === "iceBlast") return baseDamage + Math.floor(self.magic * 0.78);
    return baseDamage;
  }

  private estimateNpcDamagePerSecond(npc: RuntimeNpc) {
    if (npc.id === "raid-ogre-mfer") return 38 / 1.4;
    if (npc.id === "static-baron-nox") return 24 / 1.5;
    if (npc.id === "mfergpt-daily-boss") return 10 / 1.55;
    if (npc.role === "farmer") return npc.combatStyle === "caster" ? 14 / 3.2 : 8 / 1.7;
    if (npc.model === "hog") return 5 / 1.7;
    return 4 / 1.8;
  }

  private chooseCombatAction(self: RuntimePlayer, npc: RuntimeNpc, distance: number): CombatActionId {
    const closeAttackers = [...this.npcs.values()].filter((entry) => (
      entry.health > 0
      && entry.defeatedAt <= 0
      && entry.aggroTargetId === self.sessionId
      && distance2d(self, entry) <= 5.5
    )).length;
    if (self.health < self.maxHealth * 0.45 && this.canUse(self, "heal")) return "heal";
    if (closeAttackers >= 2 && this.canUse(self, "frostNova")) return "frostNova";
    if (closeAttackers >= 2 && this.canUse(self, "whirlwind")) return "whirlwind";
    if (distance >= 8 && this.canUse(self, "fireblast")) return "fireblast";
    if (distance >= 4 && this.canUse(self, "signalShot")) return "signalShot";
    if (distance >= 4 && this.canUse(self, "shoot")) return "shoot";
    return "attack";
  }

  private cast(actionId: CombatActionId, target: TargetSelection) {
    const action = COMBAT[actionId];
    if (action.requiresStationary || action.castTimeMs > 0) {
      this.stationaryUntil = Date.now() + action.castTimeMs + 350;
      this.targetPoint = null;
    }
    this.send("combatAction", target.id ? { actionId, target } : { actionId });
  }

  private canUse(self: RuntimePlayer, actionId: CombatActionId) {
    const action = COMBAT[actionId];
    if (self.level < action.minLevel) return false;
    const unlockTalentId = COMBAT_UNLOCK_TALENTS[actionId];
    if (unlockTalentId && this.getTalentRank(self, unlockTalentId) <= 0) return false;
    if (self.mana < action.manaCost) return false;
    const readyAt = getNumber(self[`${actionId}ReadyAt`]);
    return !readyAt || readyAt <= Date.now();
  }

  private followRoute(self: RuntimePlayer) {
    const target = this.routeQueue[0];
    if (!target) return;
    if (distance2d(self, target) < 2) this.routeQueue.shift();
    const nextTarget = this.routeQueue[0];
    if (nextTarget) this.moveTo(nextTarget);
  }

  private moveTo(point: Point) {
    const nextPoint = { x: point.x, z: point.z };
    if (!this.targetPoint || distance2d(this.targetPoint, nextPoint) > 1.2) this.resetMovementProgress(nextPoint);
    this.targetPoint = nextPoint;
  }

  private moveNearNpc(self: RuntimePlayer, npc: RuntimeNpc) {
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    this.moveTo({
      x: npc.x + (dx / length) * INTERACT_APPROACH_DISTANCE,
      z: npc.z + (dz / length) * INTERACT_APPROACH_DISTANCE,
    });
  }

  private moveToCombatRange(self: RuntimePlayer, npc: RuntimeNpc, action: { maxRange: number; minRange: number }) {
    this.moveTo(this.combatRangePoint(self, npc, action));
  }

  private combatRangePoint(self: RuntimePlayer, npc: RuntimeNpc, action: { maxRange: number; minRange: number }) {
    const desiredRange = action.maxRange >= 20
      ? Math.max(action.minRange + 1.5, Math.min(action.maxRange - 2, action.maxRange * 0.86))
      : Math.max(2.4, Math.min(action.maxRange * 0.7, action.maxRange - 0.5));
    const dx = self.x - npc.x;
    const dz = self.z - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: npc.x + (dx / length) * desiredRange,
      z: npc.z + (dz / length) * desiredRange,
    };
  }

  private sendInput() {
    const self = this.self();
    if (!this.room || !self) return;
    this.updateLastSafePoint(self);
    this.maintainSurvival(self);
    this.continueEngagement(self);
    this.pauseUnsafeTravel(self);
    if (!this.engagedNpcId && this.routeQueue.length > 0) this.followRoute(self);
    let x = 0;
    let z = 0;
    if (Date.now() >= this.stationaryUntil && this.targetPoint) {
      this.updateMovementRecovery(self);
      if (this.targetPoint) {
        const movementTarget = this.currentMovementTarget();
        const dx = movementTarget.x - self.x;
        const dz = movementTarget.z - self.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.7) {
          x = dx / length;
          z = dz / length;
          this.yaw = Math.atan2(x, z);
        } else {
          if (this.avoidancePoint && Date.now() < this.avoidanceUntil) {
            this.avoidancePoint = null;
            this.avoidanceUntil = 0;
          } else {
            this.targetPoint = null;
          }
        }
      }
    }
    this.send("input", { x, z, yaw: this.yaw, sprint: Boolean(this.targetPoint), jump: false, seq: ++this.seq });
    this.publishAgentStatus(self);
  }

  private currentMovementTarget() {
    if (this.avoidancePoint && Date.now() < this.avoidanceUntil) return this.avoidancePoint;
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    return this.targetPoint as Point;
  }

  private resetMovementProgress(target: Point | null = this.targetPoint) {
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    this.movementProgressTarget = target ? { ...target } : null;
    this.movementProgressDistance = Number.POSITIVE_INFINITY;
    this.movementProgressAt = Date.now();
    this.movementUnstickAttempts = 0;
  }

  private updateMovementRecovery(self: RuntimePlayer) {
    if (!this.targetPoint) {
      this.resetMovementProgress(null);
      return;
    }
    const now = Date.now();
    if (!this.movementProgressTarget || distance2d(this.movementProgressTarget, this.targetPoint) > 1.2) {
      this.resetMovementProgress(this.targetPoint);
    }
    if (this.avoidancePoint && now < this.avoidanceUntil) return;

    const distance = distance2d(self, this.targetPoint);
    if (distance < this.movementProgressDistance - 0.35) {
      this.movementProgressDistance = distance;
      this.movementProgressAt = now;
      this.movementUnstickAttempts = 0;
      return;
    }
    if (distance < 3 || now - this.movementProgressAt < 2400) return;

    this.movementUnstickAttempts += 1;
    if (this.movementUnstickAttempts >= MOVEMENT_STUCK_RETHINK_ATTEMPTS) {
      this.recordMovementTrouble(self, "stuck_loop", distance);
      return;
    }

    const dx = this.targetPoint.x - self.x;
    const dz = this.targetPoint.z - self.z;
    const length = Math.hypot(dx, dz) || 1;
    const side = stableHash(`${Math.round(self.x)}:${Math.round(self.z)}:${Math.round(now / 2400)}`) % 2 === 0 ? 1 : -1;
    this.avoidancePoint = {
      x: round(self.x + (-dz / length) * 5.5 * side + (dx / length) * 1.2),
      z: round(self.z + (dx / length) * 5.5 * side + (dz / length) * 1.2),
    };
    this.avoidanceUntil = now + 950;
    this.movementProgressAt = now;
    this.lastAction = this.lastAction.startsWith("unstick_move") ? this.lastAction : `unstick_move ${this.lastAction}`;
  }

  private pauseUnsafeTravel(self: RuntimePlayer) {
    if (this.engagedNpcId || !this.targetPoint || this.getAttackers(self).length > 0) return;
    if (distance2d(self, this.targetPoint) <= 4) return;
    const dangerousOnPath = this.dangerousHostileOnTravelPath(self, this.targetPoint, 12);
    const dangerousNearby = this.nearbyDangerousHostileCount(self, 10) > 0;
    const crowdedNearby = this.nearbyHostileCount(self, 6) >= 2;
    if (!dangerousOnPath && !dangerousNearby && !crowdedNearby) return;
    const reason = dangerousOnPath
      ? `unsafe_travel_path_${dangerousOnPath.id}`
      : dangerousNearby
        ? "unsafe_travel_dangerous_hostile"
        : "unsafe_travel_crowded_hostiles";
    this.recordMovementTrouble(self, reason, distance2d(self, this.targetPoint));
  }

  private continueEngagement(self: RuntimePlayer) {
    if (!this.engagedNpcId || Date.now() < this.nextAutoCombatAt || self.health <= 0 || self.castingAction) return;
    const attackers = this.getAttackers(self);
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const npc = this.npcs.get(this.engagedNpcId);
    if (attackers.length >= 2 || healthRatio < 0.55) {
      if (npc && this.shouldPressCurrentFight(self, npc, attackers)) {
        this.nextAutoCombatAt = Date.now() + 650;
        this.fight(self, npc);
        return;
      }
      this.startRetreat(self, attackers.length >= 2 ? "retreat_overpull" : "retreat_low_health");
      return;
    }
    if (!npc || npc.health <= 0 || npc.defeatedAt > 0) {
      this.clearEngagement();
      return;
    }
    this.nextAutoCombatAt = Date.now() + 650;
    this.fight(self, npc);
  }

  private updateLastSafePoint(self: RuntimePlayer) {
    if (self.health <= 0) return;
    if (this.getAttackers(self).length > 0) return;
    if (this.nearbyHostileCount(self, 18) > 0) return;
    this.lastSafePoint = point(self);
  }

  private startRetreat(self: RuntimePlayer, reason: string, durationMs = 5200) {
    const troubleTargetId = this.engagedNpcId || this.getAttackers(self)[0]?.id || "";
    if (troubleTargetId) this.recordCombatTrouble(troubleTargetId, reason);
    const destination = reason.includes("dangerous_add")
      ? this.threatAvoidancePoint(self, 34)
      : this.retreatDestination(self);
    this.clearEngagement();
    this.routeQueue = [];
    this.moveTo(destination);
    const now = Date.now();
    this.retreatUntil = now + durationMs;
    this.nextDecisionAt = Math.max(this.nextDecisionAt, now + Math.min(durationMs, 2400));
    this.lastAction = reason;
  }

  private retreatDestination(self: RuntimePlayer) {
    const candidates = [this.lastSafePoint, this.combatAnchor]
      .filter((candidate): candidate is Point => Boolean(candidate))
      .filter((candidate) => distance2d(self, candidate) >= 6)
      .sort((a, b) => this.nearbyHostileCount(a, 14) - this.nearbyHostileCount(b, 14));
    const safeCandidate = candidates.find((candidate) => this.nearbyHostileCount(candidate, 14) === 0);
    if (safeCandidate) return safeCandidate;
    if (candidates[0]) return candidates[0];

    return this.threatAvoidancePoint(self, 22);
  }

  private threatAvoidancePoint(self: RuntimePlayer, distance: number) {
    const threats = this.getAttackers(self);
    const nearbyThreats = threats.length
      ? threats
      : [...this.npcs.values()].filter((npc) => (
        npc.health > 0
        && npc.defeatedAt <= 0
        && !npc.isImmortal
        && isHostile(npc)
        && distance2d(self, npc) <= 14
      ));
    let awayX = 0;
    let awayZ = 0;
    for (const threat of nearbyThreats) {
      const dx = self.x - threat.x;
      const dz = self.z - threat.z;
      const length = Math.hypot(dx, dz) || 1;
      awayX += dx / length;
      awayZ += dz / length;
    }
    const length = Math.hypot(awayX, awayZ);
    if (length <= 0.001) return point(self);
    return {
      x: round(self.x + (awayX / length) * distance),
      z: round(self.z + (awayZ / length) * distance),
    };
  }

  private getAttackers(self: RuntimePlayer) {
    return [...this.npcs.values()].filter((npc) => (
      npc.aggroTargetId === self.sessionId
      && npc.health > 0
      && npc.defeatedAt <= 0
    ));
  }

  private isDangerousNeighbor(npc: RuntimeNpc, intendedTarget?: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0 || npc.id === intendedTarget?.id) return false;
    if (npc.isImmortal || npc.model === "training-dummy") return false;
    return npc.role === "farmer" || npc.maxHealth >= Math.max(50, (intendedTarget?.maxHealth ?? 0) * 2);
  }

  private nearbyDangerousHostileCount(pointLike: Point, radius: number, intendedTarget?: RuntimeNpc) {
    return [...this.npcs.values()].filter((npc) => (
      this.isDangerousNeighbor(npc, intendedTarget)
      && distance2d(pointLike, npc) <= radius
    )).length;
  }

  private nearestDangerousHostile(pointLike: Point, radius: number, intendedTarget?: RuntimeNpc) {
    const nearest = [...this.npcs.values()]
      .filter((npc) => this.isDangerousNeighbor(npc, intendedTarget))
      .map((npc) => ({ npc, distance: distance2d(pointLike, npc) }))
      .filter(({ distance }) => distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) return null;
    return {
      id: nearest.npc.id,
      name: nearest.npc.name,
      role: nearest.npc.role,
      health: `${Math.ceil(nearest.npc.health)}/${Math.ceil(nearest.npc.maxHealth)}`,
      distance: round(nearest.distance),
    };
  }

  private dangerousHostileOnTravelPath(from: Point, to: Point, radius: number) {
    const pathLength = distance2d(from, to);
    if (pathLength <= 0.001) return null;
    return [...this.npcs.values()]
      .filter((npc) => this.isDangerousNeighbor(npc))
      .map((npc) => ({
        npc,
        corridorDistance: distanceToSegment(npc, from, to),
        fromDistance: distance2d(from, npc),
      }))
      .filter(({ corridorDistance, fromDistance }) => corridorDistance <= radius && fromDistance <= pathLength + radius)
      .sort((a, b) => a.fromDistance - b.fromDistance)[0]?.npc ?? null;
  }

  private describePullRisk(npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return "none";
    if (this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc) > 0) return "high: stronger hostile is close enough to join the pull";
    if (this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id) >= 4) return "high: crowded hostile cluster";
    if (this.nearbyHostileCount(npc, 8, npc.id) >= 2) return "medium: another hostile is nearby";
    return "low";
  }

  private describeApproachRisk(self: RuntimePlayer, npc: RuntimeNpc) {
    if (!isHostile(npc) || npc.health <= 0 || npc.defeatedAt > 0) return "none";
    const pathThreat = this.dangerousHostileOnTravelPath(self, npc, 12);
    if (pathThreat) return `high: path from current position passes near ${pathThreat.name || pathThreat.id}`;
    if (this.nearbyDangerousHostileCount(npc, DANGEROUS_NEIGHBOR_RADIUS, npc) > 0) return "high: target is beside a stronger hostile";
    if (distance2d(self, npc) > 34 && this.nearbyHostileCount(npc, CROWDED_PULL_RADIUS, npc.id) >= 3) return "high: target is beyond range inside a crowded cluster";
    if (this.nearbyHostileCount(npc, 8, npc.id) >= 2) return "medium: target has nearby hostiles";
    return "low";
  }

  private hasDangerousAdd(attackers: RuntimeNpc[], intendedTarget?: RuntimeNpc) {
    return attackers.some((npc) => (
      (!intendedTarget || npc.id !== intendedTarget.id)
      && (
        npc.role === "farmer"
        || npc.maxHealth >= Math.max(60, (intendedTarget?.maxHealth ?? 0) * 2)
      )
    ));
  }

  private publishAgentStatus(self: RuntimePlayer, force = false) {
    const now = Date.now();
    if (!force && now < this.nextAgentStatusAt) return;
    this.nextAgentStatusAt = now + 1500;
    this.send("agentStatus", {
      action: this.lastAction,
      thought: this.lastDecision?.reason ?? "",
      objective: this.config.objective,
      quest: this.describeCurrentQuest(self),
    });
  }

  private describeCurrentQuest(self: RuntimePlayer) {
    const focusedQuest = this.focusedQuestId
      ? self.quests.find((entry) => getString(entry.id) === this.focusedQuestId && getString(entry.status) !== "completed")
      : null;
    const quest = focusedQuest
      ?? self.quests.find((entry) => getString(entry.status) === "ready")
      ?? self.quests.find((entry) => getString(entry.status) === "active")
      ?? self.quests.find((entry) => getString(entry.status) !== "completed")
      ?? self.quests[0];
    if (!quest) return "";
    const questId = getString(quest.id);
    this.focusedQuestId = questId;
    const memory = this.questMemory.get(questId);
    const status = getString(quest.status);
    const progress = `${getNumber(quest.progress)}/${getNumber(quest.required)}`;
    const label = memory?.objectiveLabel || memory?.title || questId;
    return [status, progress, label].filter(Boolean).join(" ");
  }

  private updateFocusedQuestFromDecision(decision: Decision) {
    const questId = cleanText(decision.questId, 96);
    if (questId) {
      this.focusedQuestId = questId;
      return;
    }
    const reason = cleanText(decision.reason, 360).toLowerCase();
    if (!reason) return;
    for (const questId of this.activeQuestIds()) {
      const memory = this.questMemory.get(questId);
      const haystack = [
        questId,
        memory?.title ?? "",
        memory?.objectiveLabel ?? "",
        memory?.text ?? "",
      ].join(" ").toLowerCase();
      if (haystack && reason.includes(questId)) {
        this.focusedQuestId = questId;
        return;
      }
      const titleWords = (memory?.title ?? "").toLowerCase().split(/\s+/).filter((word) => word.length >= 5);
      if (titleWords.length && titleWords.some((word) => reason.includes(word))) {
        this.focusedQuestId = questId;
        return;
      }
    }
  }

  private activeQuestIds() {
    const self = this.self();
    if (!self) return [];
    return self.quests
      .filter((quest) => getString(quest.status) !== "completed")
      .map((quest) => getString(quest.id))
      .filter(Boolean);
  }

  private recordCombatTrouble(targetId: string, reason: string) {
    const target = this.npcs.get(targetId);
    const key = targetId || "unknown";
    const current = this.combatTrouble.get(key);
    this.combatTrouble.set(key, {
      targetId: key,
      targetName: target?.name || current?.targetName || key,
      reason,
      count: (current?.count ?? 0) + 1,
      lastAt: Date.now(),
    });
  }

  private getCombatTroubleCount(targetId: string, windowMs: number) {
    const entry = this.combatTrouble.get(targetId);
    if (!entry || Date.now() - entry.lastAt > windowMs) return 0;
    return entry.count;
  }

  private describeCombatTrouble(now: number) {
    return [...this.combatTrouble.values()]
      .filter((entry) => now - entry.lastAt < 180_000)
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 8)
      .map((entry) => ({
        targetId: entry.targetId,
        targetName: entry.targetName,
        reason: entry.reason,
        count: entry.count,
        lastAgoMs: Math.max(0, now - entry.lastAt),
        recommendation: entry.count >= 2
          ? "Treat this as repeated trouble. Change approach: level safely, equip/use better items, pull a different target, wait/reposition, chat/group, or return later."
          : "Use this as caution before repeating the same target or path.",
      }));
  }

  private recordMovementTrouble(self: RuntimePlayer, reason: string, distance: number) {
    const previousAction = this.lastAction || "movement";
    const entry: MovementTroubleMemory = {
      reason,
      action: previousAction,
      position: point(self),
      targetPoint: this.targetPoint ? point(this.targetPoint) : null,
      routeQueue: this.routeQueue.slice(0, 6).map(point),
      attempts: this.movementUnstickAttempts,
      lastAt: Date.now(),
    };
    this.movementTrouble = entry;
    this.log(`movement trouble ${reason}: action=${previousAction} pos=${entry.position.x},${entry.position.z} target=${entry.targetPoint ? `${entry.targetPoint.x},${entry.targetPoint.z}` : "-"} distance=${round(distance)}`);
    this.targetPoint = null;
    this.routeQueue = [];
    this.avoidancePoint = null;
    this.avoidanceUntil = 0;
    this.movementProgressTarget = null;
    this.movementProgressDistance = Number.POSITIVE_INFINITY;
    this.movementProgressAt = Date.now();
    this.movementUnstickAttempts = 0;
    this.lastAction = `stuck_rethink ${previousAction}`.slice(0, 120);
    this.nextDecisionAt = Math.min(this.nextDecisionAt, Date.now() + 250);
  }

  private describeMovementTrouble(now: number) {
    const entry = this.movementTrouble;
    if (!entry || now - entry.lastAt > MOVEMENT_TROUBLE_TTL_MS) return null;
    return {
      reason: entry.reason,
      action: entry.action,
      position: entry.position,
      targetPoint: entry.targetPoint,
      routeQueue: entry.routeQueue,
      attempts: entry.attempts,
      lastAgoMs: Math.max(0, now - entry.lastAt),
      recommendation: "Change movement strategy. Do not immediately repeat the same route or target point; choose a different local waypoint, approach from another side, ask visible players, interact nearby, wait, or use another public route/landmark.",
    };
  }

  private maintainSurvival(self: RuntimePlayer) {
    if (Date.now() < this.nextAutoConsumableAt || self.health <= 0) return;
    const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 1;
    const manaRatio = self.maxMana > 0 ? self.mana / self.maxMana : 1;
    const attackers = this.getAttackers(self);
    const closeAttackers = attackers.filter((npc) => distance2d(self, npc) <= 6.5);
    const engagedNpc = this.activeEngagementNpc();
    const pressCurrentFight = Boolean(engagedNpc && this.shouldPressCurrentFight(self, engagedNpc, attackers));
    if (attackers.length >= 2 && closeAttackers.length > 0 && this.canUse(self, "frostNova") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 1800;
      this.cast("frostNova", { kind: "npc", id: "" });
      if (pressCurrentFight) this.lastAction = "auto_control_frostNova_press";
      else this.startRetreat(self, "auto_control_frostNova", 5600);
      return;
    }
    if (healthRatio < 0.9 && this.hasDangerousAdd(closeAttackers, engagedNpc ?? undefined) && this.canUse(self, "frostNova") && !self.castingAction) {
      this.nextAutoConsumableAt = Date.now() + 1800;
      this.cast("frostNova", { kind: "npc", id: "" });
      if (pressCurrentFight) this.lastAction = "auto_control_dangerous_add_press";
      else this.startRetreat(self, "auto_control_dangerous_add", 6200);
      return;
    }
    if (healthRatio < 0.82 && this.hasDangerousAdd(attackers, engagedNpc ?? undefined) && !pressCurrentFight) {
      this.startRetreat(self, "retreat_dangerous_add");
      return;
    }
    if (healthRatio <= 0.48 && inventoryCount(self, "red-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "red-juice" });
      this.lastAction = "auto_use red-juice";
      return;
    }
    if (healthRatio <= 0.62 && inventoryCount(self, "field-snack") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "field-snack" });
      this.lastAction = "auto_use field-snack";
      return;
    }
    if (manaRatio <= 0.25 && inventoryCount(self, "blue-juice") > 0) {
      this.nextAutoConsumableAt = Date.now() + 3500;
      this.send("useItem", { itemId: "blue-juice" });
      this.lastAction = "auto_use blue-juice";
    }
  }

  private send(type: string, message: AnyRecord = {}) {
    this.room?.send(type, message);
  }

  private self() {
    return this.room ? this.players.get(this.room.sessionId) ?? null : null;
  }

  private resolveNpc(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.npcs.get(key);
    if (direct) return direct;
    const mapped = this.lastNpcRefs.get(key);
    if (mapped) return this.npcs.get(mapped) ?? null;
    const refMatch = /^npc(\d+)$/.exec(key);
    if (refMatch) {
      const self = this.self();
      if (!self) return null;
      const index = Number(refMatch[1]) - 1;
      return [...this.npcs.values()]
        .map((npc) => ({ npc, distance: distance2d(self, npc) }))
        .sort((a, b) => a.distance - b.distance)[index]?.npc ?? null;
    }
    return [...this.npcs.values()].find((npc) => npc.name.toLowerCase() === key || npc.id.toLowerCase() === key) ?? null;
  }

  private resolvePlayer(ref: unknown) {
    const key = cleanText(ref, 96).toLowerCase();
    if (!key) return null;
    const direct = this.players.get(key);
    if (direct) return direct;
    const mapped = this.lastPlayerRefs.get(key);
    if (mapped) return this.players.get(mapped) ?? null;
    const refMatch = /^player(\d+)$/.exec(key);
    if (refMatch) {
      const self = this.self();
      if (!self) return null;
      const index = Number(refMatch[1]) - 1;
      return [...this.players.values()]
        .filter((player) => player.sessionId !== self.sessionId)
        .map((player) => ({ player, distance: distance2d(self, player) }))
        .sort((a, b) => a.distance - b.distance)[index]?.player ?? null;
    }
    return [...this.players.values()].find((player) => player.name.toLowerCase() === key || player.sessionId.toLowerCase() === key) ?? null;
  }

  private nearbyHostileCount(pointLike: Point, radius: number, excludeNpcId = "") {
    return [...this.npcs.values()].filter((npc) => (
      npc.id !== excludeNpcId
      && npc.health > 0
      && npc.defeatedAt <= 0
      && !npc.isImmortal
      && isHostile(npc)
      && distance2d(pointLike, npc) <= radius
    )).length;
  }

  private remember(message: string, print = false) {
    this.recentMessages = [...this.recentMessages.slice(-30), message];
    if (print) this.log(message);
  }

  private logStatus(self: RuntimePlayer) {
    const nearbyPlayers = [...this.players.values()]
      .filter((player) => player.sessionId !== self.sessionId && distance2d(self, player) <= 20)
      .map((player) => `${player.name}${player.isAgent ? ":agent" : ""}`)
      .slice(0, 4)
      .join(",");
    const nearbyNpcs = [...this.npcs.values()]
      .filter((npc) => distance2d(self, npc) <= 16)
      .map((npc) => `${npc.id}:${Math.ceil(npc.health)}`)
      .slice(0, 5)
      .join(",");
    this.log(`hp=${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)} mana=${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)} lvl=${self.level} pos=${round(self.x)},${round(self.z)} action=${this.lastAction || "none"} players=${nearbyPlayers || "-"} npcs=${nearbyNpcs || "-"}`);
  }

  private log(message: string) {
    console.log(`[mferland-agent] ${message}`);
  }
}

const config = readConfig();
const runner = new MferlandRunner(config);
await runner.start();

process.on("SIGINT", () => {
  runner.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  runner.stop();
  process.exit(0);
});

async function decideWithCodex(config: AgentConfig, observation: unknown): Promise<Decision> {
  const tempDir = await mkdtemp(join(tmpdir(), "mferland-agent-decision-"));
  const schemaPath = join(tempDir, "decision.schema.json");
  const outputPath = join(tempDir, "decision.json");
  await writeFile(schemaPath, JSON.stringify(DECISION_SCHEMA, null, 2));
  const prompt = buildDecisionPrompt(config.objective, observation);
  const result = await runCodexExec({
    model: config.decisionModel,
    outputPath,
    prompt,
    schemaPath,
    tempDir,
    timeoutMs: config.decisionTimeoutMs,
  });
  if (!result.ok) throw new Error(`codex decision failed${result.reason === "timeout" ? " (timeout)" : ""}: ${result.stderr || result.stdout}`);
  const raw = await readFile(outputPath, "utf8").catch(() => result.stdout);
  return normalizeDecision(JSON.parse(raw));
}

function buildDecisionPrompt(objective: string, observation: unknown) {
  return [
    "You are controlling one mferland wallet character as a normal player agent.",
    "Return exactly one JSON object matching the supplied schema. Use null for fields that do not apply.",
    "Do not run commands, inspect files, browse, ask for hidden server state, use debug messages, teleport, boost, or request database access.",
    "Make your own gameplay decision from public in-game context: current room state, quest offers/status/turn-ins, NPC dialogue, visible players, public map landmarks, inventory, cooldowns, combat state, and recent chat.",
    "There is no quest script. Discover the game by exploring, interacting, accepting quests, reading objective text, completing objectives, looting, grouping, and turning in ready quests.",
    "Active and ready quests are choices, not a locked script. If a quest is marked group suggested or raid suggested and the observation says needsHelp, switch focus, level/gear/shop, chat for help, wait for allies, or cancel optional daily raid content instead of repeatedly soloing it.",
    "Work toward the objective, but preserve normal gameplay: stay alive, avoid overpulls, loot when safe, and coordinate with visible players.",
    "",
    JSON.stringify({ objective, observation }),
  ].join("\n");
}

function runCodexExec({
  model,
  outputPath,
  prompt,
  schemaPath,
  tempDir,
  timeoutMs,
}: {
  model: string;
  outputPath: string;
  prompt: string;
  schemaPath: string;
  tempDir: string;
  timeoutMs: number;
}) {
  return new Promise<{
    ok: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    reason?: "timeout";
    stderr: string;
    stdout: string;
  }>((resolve) => {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      tempDir,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
    ];
    if (model) args.push("-m", model);
    args.push("-");

    const child = spawn(getCodexCliPath(), args, {
      cwd: tempDir,
      env: getSanitizedCodexEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.end(prompt);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, code: null, signal: null, stderr: appendLimited(stderr, error.message), stdout });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ ok: !timedOut && code === 0, code, signal, reason: timedOut ? "timeout" : undefined, stderr, stdout });
    });
  });
}

function readConfig(): AgentConfig {
  const roomServer = cleanEnv("ROOM_SERVER") || "wss://game.mfergpt.lol";
  const httpServer = cleanEnv("HTTP_SERVER") || toHttpServer(roomServer);
  const privateKey = cleanEnv("AGENT_PRIVATE_KEY");
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.");
  const allowProduction = cleanEnv("AGENT_ALLOW_PRODUCTION") === "1";
  if (/game\.mfergpt\.lol/i.test(roomServer) && !allowProduction) {
    throw new Error("Set AGENT_ALLOW_PRODUCTION=1 to connect this runner to game.mfergpt.lol.");
  }
  const viewerPort = readPortEnv("AGENT_VIEWER_PORT");
  const viewerHost = cleanEnv("AGENT_VIEWER_HOST") || "127.0.0.1";
  if (viewerPort && !isLoopbackHost(viewerHost)) {
    throw new Error("AGENT_VIEWER_HOST must be loopback-only, such as 127.0.0.1 or localhost.");
  }
  const gameViewerUrl = cleanEnv("AGENT_GAME_VIEWER_URL") || defaultAgentGameViewerUrl(roomServer);
  return {
    roomServer,
    httpServer,
    roomName: cleanEnv("ROOM_NAME") || "town",
    authEndpoint: cleanEnv("AUTH_ENDPOINT") || "/wallet-auth-challenge",
    catalogEndpoint: cleanEnv("AGENT_CATALOG_ENDPOINT") || "/agent-catalog",
    privateKey: privateKey as `0x${string}`,
    agentName: cleanEnv("AGENT_NAME") || "mfer-agent",
    inviteCode: cleanEnv("AGENT_INVITE_CODE"),
    createCharacter: cleanEnv("AGENT_CREATE_CHARACTER") !== "0",
    allowProduction,
    runSeconds: readNumberEnv("AGENT_RUN_SECONDS"),
    decisionModel: cleanEnv("AGENT_DECISION_MODEL") || cleanEnv("CODEX_LLM_MODEL"),
    decisionTimeoutMs: readNumberEnv("AGENT_DECISION_TIMEOUT_MS") || 60_000,
    decisionIntervalMs: readNumberEnv("AGENT_DECISION_INTERVAL_MS") || 1200,
    objective: cleanEnv("AGENT_OBJECTIVE") || "Play mferland naturally. Progress the main questline from public quest context, cooperate with players, loot, sell trash to trash-mfer when safe, survive, and eventually defeat The Centralizer through its quest.",
    maxMferGptSpendWei: readNonNegativeIntegerEnv("AGENT_MAX_MFERGPT_SPEND_WEI"),
    maxSwapEthSpendWei: readNonNegativeIntegerEnv("AGENT_MAX_SWAP_ETH_SPEND_WEI"),
    announceNextAction: cleanEnv("AGENT_ANNOUNCE_NEXT_ACTION") !== "0",
    socialReplies: cleanEnv("AGENT_SOCIAL_REPLIES") !== "0",
    chatCooldownMs: readNumberEnv("AGENT_CHAT_COOLDOWN_MS") || DEFAULT_CHAT_COOLDOWN_MS,
    emoteCooldownMs: readNumberEnv("AGENT_EMOTE_COOLDOWN_MS") || DEFAULT_EMOTE_COOLDOWN_MS,
    viewerPort,
    viewerHost,
    gameViewerUrl,
  };
}

function schemaEntries(value: unknown): Array<[string, AnyRecord]> {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()].map(([key, entry]) => [String(key), asRecord(entry)]);
  const maybe = value as { forEach?: unknown };
  if (typeof maybe.forEach === "function") {
    const rows: Array<[string, AnyRecord]> = [];
    maybe.forEach.call(value, (entry: unknown, key: unknown) => rows.push([String(key), asRecord(entry)]));
    return rows;
  }
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), asRecord(entry)]);
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, asRecord(entry)]);
  return [];
}

function normalizePlayer(sessionId: string, value: AnyRecord): RuntimePlayer {
  return {
    ...value,
    sessionId,
    name: getString(value.name) || shortAddress(getString(value.walletAddress)) || sessionId,
    identityType: getString(value.identityType),
    isAgent: Boolean(value.isAgent),
    walletAddress: getString(value.walletAddress),
    agentStatusAction: getString(value.agentStatusAction),
    agentStatusThought: getString(value.agentStatusThought),
    agentStatusObjective: getString(value.agentStatusObjective),
    agentStatusQuest: getString(value.agentStatusQuest),
    agentStatusUpdatedAt: getNumber(value.agentStatusUpdatedAt),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    healthRegenPer5: getNumber(value.healthRegenPer5),
    mana: getNumber(value.mana),
    maxMana: getNumber(value.maxMana, 1),
    manaRegenPer5: getNumber(value.manaRegenPer5),
    walkSpeed: getNumber(value.walkSpeed),
    runSpeed: getNumber(value.runSpeed),
    strength: getNumber(value.strength),
    dexterity: getNumber(value.dexterity),
    magic: getNumber(value.magic),
    level: Math.max(1, getNumber(value.level, 1)),
    xp: getNumber(value.xp),
    talentPoints: getNumber(value.talentPoints),
    x: getNumber(value.x),
    z: getNumber(value.z),
    yaw: getNumber(value.yaw),
    animation: getString(value.animation),
    castingAction: getString(value.castingAction),
    quests: schemaEntries(value.quests).map(([, quest]) => quest),
    inventory: schemaEntries(value.inventory).map(([, item]) => item),
    equipment: schemaEntries(value.equipment).map(([, slot]) => slot),
    talents: schemaEntries(value.talents).map(([, talent]) => talent),
    activeBuffs: schemaEntries(value.activeBuffs).map(([, buff]) => buff),
  };
}

function normalizeNpc(id: string, value: AnyRecord): RuntimeNpc {
  return {
    id: getString(value.id) || id,
    name: getString(value.name) || id,
    role: getString(value.role),
    model: getString(value.model),
    combatStyle: getString(value.combatStyle),
    health: getNumber(value.health),
    maxHealth: getNumber(value.maxHealth, 1),
    isImmortal: Boolean(value.isImmortal),
    x: getNumber(value.x),
    z: getNumber(value.z),
    defeatedAt: getNumber(value.defeatedAt),
    despawnAt: getNumber(value.despawnAt),
    aggroTargetId: getString(value.aggroTargetId),
    hasLoot: Boolean(value.hasLoot),
    questId: getString(value.questId),
    shopId: getString(value.shopId),
    dialogue: getString(value.dialogue),
  };
}

function normalizeDecision(value: unknown): Decision {
  const record = asRecord(value);
  const action = cleanText(record.action, 40);
  if (!DECISION_ACTIONS.includes(action as typeof DECISION_ACTIONS[number])) throw new Error(`invalid action ${action}`);
  return {
    action,
    reason: cleanText(record.reason, 240) || action,
    x: readFiniteNumber(record.x) ?? null,
    z: readFiniteNumber(record.z) ?? null,
    npcRef: nullableText(record.npcRef),
    playerRef: nullableText(record.playerRef),
    questId: nullableText(record.questId),
    itemId: nullableText(record.itemId),
    chainTokenId: nullableText(record.chainTokenId),
    slotId: nullableText(record.slotId),
    talentId: nullableText(record.talentId),
    actionId: nullableText(record.actionId),
    text: nullableText(record.text),
    emoteId: nullableText(record.emoteId),
    quantity: readFiniteNumber(record.quantity) ?? null,
    amountEth: nullableText(record.amountEth),
    paymentTxHash: nullableText(record.paymentTxHash),
    paymentAmountWei: nullableText(record.paymentAmountWei),
    paymentChainId: readFiniteNumber(record.paymentChainId) ?? null,
    paymentContractAddress: nullableText(record.paymentContractAddress),
    sprint: typeof record.sprint === "boolean" ? record.sprint : null,
    traits: record.traits && typeof record.traits === "object" && !Array.isArray(record.traits) ? asRecord(record.traits) : null,
  };
}

function normalizeCombatAction(value: unknown): CombatActionId | null {
  const text = cleanText(value, 40);
  return COMBAT_ACTION_IDS.includes(text as CombatActionId) ? text as CombatActionId : null;
}

function inventoryCount(self: RuntimePlayer, itemId: string) {
  return self.inventory.reduce((count, item) => (
    getString(item.id) === itemId ? count + getNumber(item.count) : count
  ), 0);
}

function resolveRoute(value: string) {
  const routeId = normalizeRouteId(value);
  if (PUBLIC_ROUTES[routeId]) return PUBLIC_ROUTES[routeId];
  const routeEntry = Object.entries(PUBLIC_ROUTES).find(([id]) => normalizeRouteId(id) === routeId || routeId.includes(normalizeRouteId(id)));
  if (routeEntry) return routeEntry[1];
  const landmark = PUBLIC_LANDMARKS[routeId];
  if (landmark) return [landmark];
  const landmarkEntry = Object.entries(PUBLIC_LANDMARKS).find(([id]) => routeId.includes(normalizeRouteId(id)));
  return landmarkEntry ? [landmarkEntry[1]] : null;
}

function normalizeRouteId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isAttackable(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer" || npc.role === "beast" || npc.role === "critter") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function isHostile(npc: RuntimeNpc) {
  if (npc.role === "enemy" || npc.role === "farmer") return true;
  return npc.model === "hog" || npc.id.startsWith("ridge-raider-") || npc.id.startsWith("static-");
}

function distance2d(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distanceToSegment(pointLike: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return distance2d(pointLike, start);
  const t = Math.max(0, Math.min(1, ((pointLike.x - start.x) * dx + (pointLike.z - start.z) * dz) / lengthSq));
  return distance2d(pointLike, {
    x: start.x + dx * t,
    z: start.z + dz * t,
  });
}

function point(value: Point): Point {
  return { x: round(value.x), z: round(value.z) };
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? value as AnyRecord : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumberEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number.`);
  return parsed;
}

function readNonNegativeIntegerEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) return "0";
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer string.`);
  return value;
}

function readPositiveIntegerEnv(name: string) {
  return readPositiveIntegerText(cleanEnv(name));
}

function readPositiveIntegerText(value: unknown) {
  const text = typeof value === "number" ? String(value) : cleanText(value, 40);
  if (!text) return 0;
  if (!/^[1-9]\d*$/.test(text)) throw new Error("expected a positive integer");
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("expected a safe positive integer");
  return parsed;
}

function readPortEnv(name: string) {
  const port = readNumberEnv(name);
  if (!port) return 0;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be a TCP port from 1 to 65535.`);
  return port;
}

function isLoopbackHost(host: string) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function cleanEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function makeChatLine(value: unknown) {
  return cleanText(value, 180).replace(/\s+/g, " ");
}

function formatEstimateSeconds(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) return "safe";
  return `${round(milliseconds / 1000)}s`;
}

function nullableText(value: unknown) {
  const text = cleanText(value, 160);
  return text || null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => cleanText(entry, 96)).filter(Boolean)
    : [];
}

function readFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readInteger(value: unknown) {
  const parsed = readFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function normalizePurchaseQuantity(value: unknown) {
  return value === 5 ? 5 : 1;
}

function normalizeTrashSellQuantity(value: unknown, defaultQuantity = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.min(999, Math.max(1, Math.floor(defaultQuantity)));
  return Math.min(999, Math.max(1, Math.floor(parsed)));
}

function normalizePositiveIntegerString(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!/^[1-9]\d*$/.test(text)) return "";
  return text;
}

function normalizeTxHash(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(text) ? text : "";
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(text) ? text : "";
}

function asAddress(value: unknown): Address | "" {
  const normalized = normalizeAddress(value);
  return normalized ? normalized as Address : "";
}

function readCryptoContractsConfig(): CryptoContractsConfig | null {
  const configured = cleanEnv("AGENT_CRYPTO_CONTRACTS_FILE");
  const candidates = [
    configured,
    resolve(process.env.INIT_CWD ?? process.cwd(), "apps/web/public/crypto/local-contracts.json"),
    resolve(process.cwd(), "../../apps/web/public/crypto/local-contracts.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      return JSON.parse(readFileSync(candidate, "utf8")) as CryptoContractsConfig;
    } catch {
      continue;
    }
  }
  return null;
}

function isLocalAgentRun(config: AgentConfig) {
  return cleanEnv("MFERLAND_AGENT_LOCAL_ONLY") === "1"
    || cleanEnv("MFERLAND_LOCAL_ONLY") === "1"
    || isLoopbackUrl(config.roomServer)
    || isLoopbackUrl(config.httpServer);
}

function isLoopbackUrl(value: string) {
  try {
    const parsed = new URL(value);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function assertLocalPaymentConfig(rpcUrl: string, tokenAddress: Address) {
  if (!isLoopbackUrl(rpcUrl)) {
    let host = rpcUrl;
    try {
      host = new URL(rpcUrl).hostname;
    } catch {
      // The caller will fail later with the original URL.
    }
    throw new Error(`Refusing non-local MFERGPT payment RPC host ${host}.`);
  }
  if (tokenAddress.toLowerCase() === BASE_MFERGPT_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error("Refusing production MFERGPT token address for a local agent run.");
  }
}

function parseEthAmount(value: string) {
  const normalized = cleanText(value, 40);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) throw new Error("swap amount must be a decimal ETH string");
  const amount = parseEther(normalized);
  if (amount <= 0n) throw new Error("swap amount must be positive");
  return amount;
}

async function getMferGptSwapQuote(amountInWei: bigint) {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BASE_MFERGPT_TOKEN_ADDRESS}`, { cache: "no-store" });
  const document = await response.json().catch(() => null) as DexScreenerTokenResponse | null;
  if (!response.ok || !document) throw new Error("MFERGPT market quote unavailable");
  const pair = document.pairs?.find((entry) => {
    const baseToken = entry.baseToken?.address ?? "";
    const quoteToken = entry.quoteToken?.address ?? "";
    return entry.chainId === "base"
      && entry.dexId === "uniswap"
      && (entry.labels ?? []).includes("v4")
      && baseToken.toLowerCase() === BASE_MFERGPT_TOKEN_ADDRESS.toLowerCase()
      && quoteToken.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase()
      && typeof entry.priceNative === "string"
      && Number(entry.priceNative) > 0;
  });
  if (!pair?.priceNative) throw new Error("MFERGPT/WETH pool unavailable");
  const priceNativeWei = parseUnits(pair.priceNative, PRICE_DECIMALS);
  const estimatedAmountOutWei = amountInWei * 10n ** BigInt(MFERGPT_DECIMALS) / priceNativeWei;
  const minAmountOutWei = estimatedAmountOutWei * (BPS_DENOMINATOR - DEFAULT_SWAP_SLIPPAGE_BPS) / BPS_DENOMINATOR;
  if (minAmountOutWei <= 0n) throw new Error("swap amount too small");
  return { minAmountOutWei };
}

function buildMferGptUniversalRouterCallData(minAmountOutWei: bigint, amountInWei: bigint, deadline: bigint) {
  const wrapEthInput = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [ACTION_CONSTANT_ADDRESS_THIS, amountInWei],
  );
  const swapActions = `0x${V4_ACTION_SWAP_EXACT_IN_SINGLE}${V4_ACTION_SETTLE}${V4_ACTION_TAKE_ALL}` as const;
  const swapParams = [
    encodeAbiParameters(
      [{
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      }],
      [{
        poolKey: BASE_MFERGPT_POOL_KEY,
        zeroForOne: false,
        amountIn: amountInWei,
        amountOutMinimum: minAmountOutWei,
        hookData: "0x",
      }],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
      [BASE_WETH_ADDRESS, amountInWei, false],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [BASE_MFERGPT_TOKEN_ADDRESS, minAmountOutWei],
    ),
  ];
  const v4SwapInput = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [swapActions, swapParams],
  );

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [
      `0x${UNISWAP_COMMAND_WRAP_ETH}${UNISWAP_COMMAND_V4_SWAP}`,
      [wrapEthInput, v4SwapInput],
      deadline,
    ],
  });
}

function formatBalance(value: string, maxFractionDigits: number) {
  const [whole = "0", fraction = ""] = value.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, maxFractionDigits);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function toHttpServer(roomServer: string) {
  if (roomServer.startsWith("wss://")) return `https://${roomServer.slice("wss://".length)}`;
  if (roomServer.startsWith("ws://")) return `http://${roomServer.slice("ws://".length)}`;
  return roomServer;
}

function defaultAgentGameViewerUrl(roomServer: string) {
  if (/game\.mfergpt\.lol/i.test(roomServer)) return "https://game.mfergpt.lol/agent-view";
  return "http://127.0.0.1:5173/agent-view";
}

function makeAgentGameViewerUrl(baseUrl: string, walletAddress: string) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("wallet", walletAddress);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function shortAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function messageSummary(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 260);
  } catch {
    return String(value).slice(0, 260);
  }
}

function isImportantChat(value: unknown) {
  const record = asRecord(value);
  const name = getString(record.name).toLowerCase();
  const text = getString(record.text).toLowerCase();
  return name === "agent rewards" || name === "season 0" || text.includes("agent season 0");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isDecisionProviderBackoffError(message: string) {
  return /usage limit|rate.?limit|quota|too many requests|try again/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getCodexCliPath() {
  const configuredPath = process.env.AGENT_CODEX_CLI_PATH?.trim() || process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath) return configuredPath;
  const macosAppPath = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(macosAppPath)) return macosAppPath;
  return "codex";
}

function getSanitizedCodexEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || homedir();
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    LOGNAME: process.env.LOGNAME || process.env.USER,
    NO_COLOR: "1",
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || "/bin/zsh",
    TERM: "dumb",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    USER: process.env.USER || process.env.LOGNAME,
  };
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}

function appendLimited(current: string, next: string) {
  const combined = current + next;
  return combined.length > 4000
    ? combined.slice(combined.length - 4000)
    : combined;
}

const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mferland Agent Viewer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f4ef;
      --ink: #1f2523;
      --muted: #69716c;
      --line: #d9d4c7;
      --panel: #fffdf8;
      --green: #2f8f55;
      --red: #c7473d;
      --orange: #d9872d;
      --blue: #3478b8;
      --purple: #7d5bb3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      background: #fffaf0;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 740;
    }
    .subline {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status {
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 0 3px rgba(199, 71, 61, 0.12);
    }
    .dot.ok {
      background: var(--green);
      box-shadow: 0 0 0 3px rgba(47, 143, 85, 0.14);
    }
    main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(420px, 1fr) 360px;
      gap: 0;
    }
    .stage {
      min-width: 0;
      min-height: 0;
      padding: 16px;
    }
    canvas {
      width: 100%;
      height: 100%;
      min-height: 520px;
      display: block;
      background: #fbfaf5;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    aside {
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--line);
      background: var(--panel);
      padding: 14px;
    }
    section {
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }
    section:first-child { padding-top: 0; }
    section:last-child { border-bottom: 0; }
    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      line-height: 1.2;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 760;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      background: #fff;
      min-width: 0;
    }
    .label {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
    }
    .value {
      margin-top: 3px;
      font-size: 13px;
      font-weight: 680;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      font-size: 12px;
      border-top: 1px solid #ece7da;
    }
    .row:first-child { border-top: 0; }
    .row span:last-child {
      text-align: right;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .log {
      display: grid;
      gap: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #353b38;
    }
    .log div {
      padding: 6px;
      border-radius: 5px;
      background: #f4f1e9;
      overflow-wrap: anywhere;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { border-left: 0; border-top: 1px solid var(--line); }
      canvas { min-height: 420px; }
      header { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>mferland Agent Viewer</h1>
        <div class="subline" id="subtitle">waiting for runner state</div>
      </div>
      <div class="status"><span class="dot" id="dot"></span><span id="status">disconnected</span></div>
    </header>
    <main>
      <div class="stage"><canvas id="map" width="1200" height="800"></canvas></div>
      <aside>
        <section>
          <h2>Agent</h2>
          <div class="metric-grid" id="metrics"></div>
        </section>
        <section>
          <h2>Decision</h2>
          <div id="decision"></div>
        </section>
        <section>
          <h2>Quests</h2>
          <div id="quests"></div>
        </section>
        <section>
          <h2>Nearby</h2>
          <div id="nearby"></div>
        </section>
        <section>
          <h2>Messages</h2>
          <div class="log" id="messages"></div>
        </section>
      </aside>
    </main>
  </div>
  <script>
    const canvas = document.getElementById("map");
    const ctx = canvas.getContext("2d");
    let state = null;

    function text(value) {
      return value === undefined || value === null || value === "" ? "-" : String(value);
    }

    function ratio(current, max) {
      return text(current) + "/" + text(max);
    }

    function rows(items) {
      return items.length ? items.map(function(item) {
        return '<div class="row"><span>' + escapeHtml(item[0]) + '</span><span>' + escapeHtml(item[1]) + '</span></div>';
      }).join("") : '<div class="row"><span>-</span><span>-</span></div>';
    }

    function escapeHtml(value) {
      return text(value).replace(/[&<>"']/g, function(char) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
      });
    }

    function metric(label, value) {
      return '<div class="metric"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
    }

    function setState(next) {
      state = next;
      const self = state.self;
      document.getElementById("dot").className = state.connected && self ? "dot ok" : "dot";
      document.getElementById("status").textContent = state.connected && self ? "connected" : "waiting";
      document.getElementById("subtitle").textContent = self ? self.name + " " + state.wallet.address : state.roomName;

      document.getElementById("metrics").innerHTML = self ? [
        metric("Level", self.level),
        metric("XP", self.xp),
        metric("Health", ratio(self.health, self.maxHealth)),
        metric("Mana", ratio(self.mana, self.maxMana)),
        metric("Position", self.position.x + ", " + self.position.z),
        metric("Aggro", self.aggroCount),
        metric("Action", state.lastAction || "-"),
        metric("Casting", self.castingAction || "-")
      ].join("") : metric("State", "waiting for room join");

      const decision = state.lastDecision;
      document.getElementById("decision").innerHTML = decision ? rows([
        ["Action", decision.action],
        ["Reason", decision.reason],
        ["NPC", decision.npcRef || "-"],
        ["Player", decision.playerRef || "-"],
        ["Quest", decision.questId || "-"],
        ["Ability", decision.actionId || "-"]
      ]) : rows([["Action", state.lastAction || "-"]]);

      document.getElementById("quests").innerHTML = self ? rows((self.quests || []).slice(0, 8).map(function(quest) {
        const label = quest.title || quest.id;
        const progress = quest.status + " " + quest.progress + "/" + quest.required;
        return [label, progress];
      })) : rows([]);

      const nearby = (state.npcs || []).slice(0, 10).map(function(npc) {
        const flags = [npc.alive ? ratio(npc.health, npc.maxHealth) : "down", npc.aggroTarget, npc.hasLoot ? "loot" : ""].filter(Boolean).join(" ");
        return [npc.name || npc.id, Math.round(npc.distance) + "m " + flags];
      });
      document.getElementById("nearby").innerHTML = rows(nearby);

      document.getElementById("messages").innerHTML = (state.recentMessages || []).slice(-10).reverse().map(function(message) {
        return "<div>" + escapeHtml(message) + "</div>";
      }).join("");
      draw();
    }

    function fetchState() {
      fetch("/state", { cache: "no-store" })
        .then(function(response) { return response.json(); })
        .then(setState)
        .catch(function() {
          document.getElementById("dot").className = "dot";
          document.getElementById("status").textContent = "offline";
        });
    }

    function getPoints() {
      if (!state) return [];
      const points = [];
      if (state.self) points.push(state.self.position);
      (state.players || []).forEach(function(player) { points.push(player.position); });
      (state.npcs || []).slice(0, 40).forEach(function(npc) { points.push(npc.position); });
      if (state.targetPoint) points.push(state.targetPoint);
      (state.routeQueue || []).forEach(function(point) { points.push(point); });
      Object.keys((state.publicMap && state.publicMap.landmarks) || {}).forEach(function(key) {
        points.push(state.publicMap.landmarks[key]);
      });
      return points.filter(Boolean);
    }

    function projector() {
      const points = getPoints();
      const width = canvas.width;
      const height = canvas.height;
      if (!points.length) return function(point) { return { x: width / 2, y: height / 2 }; };
      let minX = Math.min.apply(null, points.map(function(point) { return point.x; }));
      let maxX = Math.max.apply(null, points.map(function(point) { return point.x; }));
      let minZ = Math.min.apply(null, points.map(function(point) { return point.z; }));
      let maxZ = Math.max.apply(null, points.map(function(point) { return point.z; }));
      const pad = 34;
      minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
      const spanX = Math.max(20, maxX - minX);
      const spanZ = Math.max(20, maxZ - minZ);
      const scale = Math.min((width - 60) / spanX, (height - 60) / spanZ);
      const offsetX = (width - spanX * scale) / 2;
      const offsetY = (height - spanZ * scale) / 2;
      return function(point) {
        return {
          x: offsetX + (point.x - minX) * scale,
          y: offsetY + (point.z - minZ) * scale
        };
      };
    }

    function drawCircle(point, radius, fill, stroke) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    function drawLabel(point, label, fill) {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillStyle = fill || "#1f2523";
      ctx.fillText(label, point.x + 8, point.y - 8);
    }

    function drawLine(points, color, width) {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach(function(point, index) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fbfaf5";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ebe5d8";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      if (!state) return;
      const project = projector();
      const landmarks = (state.publicMap && state.publicMap.landmarks) || {};
      Object.keys(landmarks).forEach(function(name) {
        const p = project(landmarks[name]);
        drawCircle(p, 4, "#7d5bb3");
        drawLabel(p, name, "#6f6082");
      });
      drawLine((state.routeQueue || []).map(project), "#d9872d", 3);
      if (state.targetPoint) {
        const target = project(state.targetPoint);
        drawCircle(target, 8, "rgba(217,135,45,0.24)", "#d9872d");
      }
      (state.npcs || []).slice(0, 60).forEach(function(npc) {
        const p = project(npc.position);
        const hostile = npc.role === "enemy" || npc.model === "hog" || npc.role === "farmer";
        const fill = npc.alive ? (hostile ? "#c7473d" : "#3478b8") : "#8d908a";
        const stroke = npc.aggroTarget === "you" ? "#1f2523" : "";
        drawCircle(p, npc.hasLoot ? 7 : 5, fill, stroke);
        if (npc.distance < 18 || npc.id === state.engagedNpcId) drawLabel(p, npc.name || npc.id, "#343a36");
      });
      (state.players || []).forEach(function(player) {
        const p = project(player.position);
        drawCircle(p, player.isSelf ? 10 : 7, player.isSelf ? "#2f8f55" : "#d9872d", "#1f2523");
        drawLabel(p, player.name + (player.isAgent ? " agent" : ""), "#1f2523");
      });
    }

    fetchState();
    setInterval(fetchState, 500);
    window.addEventListener("resize", draw);
  </script>
</body>
</html>`;

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: DECISION_ACTIONS },
    reason: { type: "string" },
    x: { type: ["number", "null"] },
    z: { type: ["number", "null"] },
    npcRef: { type: ["string", "null"] },
    playerRef: { type: ["string", "null"] },
    questId: { type: ["string", "null"] },
    itemId: { type: ["string", "null"] },
    chainTokenId: { type: ["string", "null"] },
    slotId: { type: ["string", "null"] },
    talentId: { type: ["string", "null"] },
    actionId: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    emoteId: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    amountEth: { type: ["string", "null"] },
    paymentTxHash: { type: ["string", "null"] },
    paymentAmountWei: { type: ["string", "null"] },
    paymentChainId: { type: ["number", "null"] },
    paymentContractAddress: { type: ["string", "null"] },
    sprint: { type: ["boolean", "null"] },
    traits: {
      type: ["object", "null"],
      additionalProperties: { type: "string" },
    },
  },
  required: [
    "action",
    "reason",
    "x",
    "z",
    "npcRef",
    "playerRef",
    "questId",
    "itemId",
    "chainTokenId",
    "slotId",
    "talentId",
    "actionId",
    "text",
    "emoteId",
    "quantity",
    "amountEth",
    "paymentTxHash",
    "paymentAmountWei",
    "paymentChainId",
    "paymentContractAddress",
    "sprint",
    "traits",
  ],
} as const;

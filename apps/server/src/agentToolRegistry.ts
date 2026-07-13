import {
  getAddress,
  recoverTypedDataAddress,
  type Address,
} from "viem";
import { AGENT_PREMADE_BEHAVIOR_SCHEMES } from "./agentHarnessOptions.js";

export type AgentToolSlug = "mfertown-agent-command" | "mfertown-fishing" | "mfertown-mfergpt-swap";

type ToolManifest = {
  type: "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1";
  name: string;
  description: string;
  version: string;
  endpoint: string;
  image: string;
  featuredImage: string;
  inputs: unknown;
  outputs: unknown;
  creatorAddress: string;
  pricing: {
    amount: "0";
    asset: string;
    recipient: string;
    protocol: "x402";
  }[];
  tags: string[];
};

const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOOL_MANIFEST_TYPE = "https://ercs.ethereum.org/ERCS/erc-8257#tool-manifest-v1";
const DEFAULT_OPERATOR_ADDRESS = "0x0000000000000000000000000000000000000000";
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const AGENT_TOOL_SLUGS: AgentToolSlug[] = ["mfertown-agent-command", "mfertown-fishing", "mfertown-mfergpt-swap"];

const AGENT_TOOL_ALIASES: Record<string, AgentToolSlug> = {
  "mferland-agent-command": "mfertown-agent-command",
  "mferland-fishing": "mfertown-fishing",
  "mferland-mfergpt-swap": "mfertown-mfergpt-swap",
};

const AGENT_TOOL_ID_ENV_KEYS: Record<AgentToolSlug, string[]> = {
  "mfertown-agent-command": [
    "MFERLAND_TOOL_MFERTOWN_AGENT_COMMAND_ID",
    "MFERTOWN_TOOL_MFERTOWN_AGENT_COMMAND_ID",
    "MFERLAND_TOOL_MFERLAND_AGENT_COMMAND_ID",
  ],
  "mfertown-fishing": [
    "MFERLAND_TOOL_MFERTOWN_FISHING_ID",
    "MFERTOWN_TOOL_MFERTOWN_FISHING_ID",
    "MFERLAND_TOOL_MFERLAND_FISHING_ID",
  ],
  "mfertown-mfergpt-swap": [
    "MFERLAND_TOOL_MFERTOWN_MFERGPT_SWAP_ID",
    "MFERTOWN_TOOL_MFERTOWN_MFERGPT_SWAP_ID",
    "MFERLAND_TOOL_MFERLAND_MFERGPT_SWAP_ID",
  ],
};

export function buildAgentToolManifest(slug: AgentToolSlug, origin: string): ToolManifest {
  const baseUrl = normalizeOrigin(origin);
  if (slug === "mfertown-agent-command") {
    return {
      type: TOOL_MANIFEST_TYPE,
      name: "mfertown-agent-command",
      description: "Start, poll, and stop bounded mfertown gameplay commands for wallet-authenticated agents. Use mfertown-fishing for dedicated pond fishing, NFT claim, and fish-sale flows.",
      version: "0.1.1",
      endpoint: `${baseUrl}/agent-command`,
      image: `${baseUrl}/agent-tools/icon.png`,
      featuredImage: `${baseUrl}/agent-tools/16x9.jpeg`,
      inputs: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: { type: "string", enum: ["start", "status", "stop"] },
          bridgeSessionId: { type: "string" },
          commandId: { type: "string" },
          command: { type: "string", enum: ["finish_next_quest", "finish_quest", "play_for", "farm_until", "run_goals", "fish", "fishing"] },
          behaviorScheme: { type: "string", enum: AGENT_PREMADE_BEHAVIOR_SCHEMES },
          questId: { type: "string" },
          goals: {
            type: "array",
            description: "Structured goals for run_goals. Freeform player objectives should be translated by the caller before invoking this tool.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["quest_completed", "quest_ready", "quest_accepted", "inventory_at_least", "level_at_least", "xp_gained", "survive_seconds", "arrive_at_landmark", "near_player_count"] },
                questId: { type: "string" },
                itemId: { type: "string" },
                count: { type: "number" },
                level: { type: "number" },
                xp: { type: "number" },
                seconds: { type: "number" },
                landmarkId: { type: "string" },
                radius: { type: "number" },
              },
              required: ["type"],
            },
          },
          stopWhen: { type: "string", enum: ["any", "all"] },
          profile: {
            type: "object",
            additionalProperties: false,
            properties: {
              priority: { type: "string", enum: ["auto", "quester", "farmer", "boss_hunter", "looter", "completionist", "social"] },
              role: { type: "string", enum: ["auto", "tank", "healer", "dps", "support"] },
              spec: { type: "string", enum: ["auto", "brawler_tank", "brawler_dps", "caster_fire", "caster_frost", "utility_ranger", "utility_support"] },
              partyMode: { type: "string", enum: ["auto", "grouper", "lone_wolf", "follow_leader"] },
              risk: { type: "string", enum: ["safe", "normal", "bold"] },
              social: { type: "string", enum: ["quiet", "normal", "chatty"] },
            },
          },
          constraints: {
            type: "object",
            additionalProperties: false,
            properties: {
              noWalletActions: { type: "boolean" },
              noPaidActions: { type: "boolean" },
              maxDeaths: {
                type: ["number", "null"],
                minimum: 0,
                maximum: 99,
                description: "Omit or set null for normal autoplay. Set 0 to stop on the first death, or a positive number for a hard death cap.",
              },
              maxSafetyStops: {
                type: ["number", "null"],
                minimum: 0,
                maximum: 99,
                description: "Omit or set null for normal autoplay. Set 0 to stop on the first safety retreat, or a positive number for a hard safety cap.",
              },
              allowedActions: { type: "array", items: { type: "string" } },
              disallowedActions: { type: "array", items: { type: "string" } },
            },
          },
          controller: {
            type: "object",
            additionalProperties: false,
            description: "Metadata only. Custom code runs in the caller-owned agent harness, not on the hosted server.",
            properties: {
              type: { type: "string", enum: ["premade", "external_policy"] },
              policyRef: { type: "string" },
              policyHash: { type: "string" },
            },
          },
          maxSeconds: { type: "number", minimum: 15, maximum: 1800 },
          itemId: { type: "string" },
          targetCount: { type: "number", minimum: 1, maximum: 9999 },
        },
        required: ["operation", "bridgeSessionId"],
      },
      outputs: commandOutputSchema(),
      creatorAddress: getManifestCreatorAddress(),
      pricing: freePricing(),
      tags: ["mfertown", "game", "agent", "autoplay", "wallet", "fishing"],
    };
  }
  if (slug === "mfertown-fishing") {
    return {
      type: TOOL_MANIFEST_TYPE,
      name: "mfertown-fishing",
      description: "Run mfertown pond fishing for wallet-authenticated agents, including normal catches, offchain fish sales, and claim-ready onchain NFT catches.",
      version: "0.1.1",
      endpoint: `${baseUrl}/agent-fishing`,
      image: `${baseUrl}/agent-tools/icon.png`,
      featuredImage: `${baseUrl}/agent-tools/16x9.jpeg`,
      inputs: {
        type: "object",
        additionalProperties: false,
        properties: {
          operation: {
            type: "string",
            enum: ["start", "status", "stop", "fish_once", "claim_nft", "submit_claim_tx", "sell_fish", "refresh"],
            description: "start begins bounded pond fishing. sell_fish sells regular offchain fish only and requires completed lost-fishing-shoes; it never sells NFTs or trash. claim_nft returns a ready-to-sign FishingPond.claim transaction. submit_claim_tx records its tx hash.",
          },
          bridgeSessionId: { type: "string" },
          commandId: { type: "string" },
          questId: {
            type: "string",
            enum: ["fishin-lesson", "lost-fishing-shoes"],
            description: "Optional fishing quest to complete while fishing.",
          },
          maxSeconds: { type: "number", minimum: 15, maximum: 1800 },
          constraints: {
            type: "object",
            additionalProperties: false,
            properties: {
              noWalletActions: { type: "boolean" },
              noPaidActions: { type: "boolean" },
              maxDeaths: { type: ["number", "null"], minimum: 0, maximum: 99 },
              maxSafetyStops: { type: ["number", "null"], minimum: 0, maximum: 99 },
            },
          },
          profile: {
            type: "object",
            additionalProperties: false,
            properties: {
              risk: { type: "string", enum: ["safe", "normal", "bold"] },
              social: { type: "string", enum: ["quiet", "normal", "chatty"] },
            },
          },
          catchId: { type: "string" },
          txHash: { type: "string" },
          itemId: {
            type: "string",
            description: "Optional regular offchain fish item id for sell_fish. Omit to sell all eligible fish. Do not use for NFT catches or trash.",
          },
          quantity: { type: "number", minimum: 1, maximum: 999 },
        },
        required: ["operation", "bridgeSessionId"],
      },
      outputs: fishingOutputSchema(),
      creatorAddress: getManifestCreatorAddress(),
      pricing: freePricing(),
      tags: ["mfertown", "game", "agent", "fishing", "nft", "base", "wallet"],
    };
  }
  return {
    type: TOOL_MANIFEST_TYPE,
    name: "mfertown-mfergpt-swap",
    description: "Build and report Base ETH to MFERGPT swap transactions for mfertown agents.",
    version: "0.1.0",
    endpoint: `${baseUrl}/agent-mfergpt-swap-quote`,
    image: `${baseUrl}/agent-tools/icon.png`,
    featuredImage: `${baseUrl}/agent-tools/16x9.jpeg`,
    inputs: {
      type: "object",
      additionalProperties: false,
      properties: {
        operation: { type: "string", enum: ["quote", "result"] },
        walletAddress: { type: "string" },
        amountEth: { type: "string" },
        slippageBps: { type: "number", minimum: 1, maximum: 2500 },
        txHash: { type: "string" },
        receivedWei: { type: "string" },
        commandId: { type: "string" },
      },
      required: ["operation", "walletAddress"],
    },
    outputs: {
      type: "object",
      additionalProperties: true,
      properties: {
        ok: { type: "boolean" },
        action: { type: "string" },
        route: { type: "string" },
        walletAddress: { type: "string" },
        chainId: { type: "number" },
        inputToken: { type: "object" },
        outputToken: { type: "object" },
        slippageBps: { type: "number" },
        priceNativeWei: { type: "string" },
        transaction: { type: "object" },
        fallbackUrl: { type: "string" },
        txHash: { type: "string" },
      },
      required: ["ok"],
    },
    creatorAddress: getManifestCreatorAddress(),
    pricing: freePricing(),
    tags: ["mfertown", "mfergpt", "swap", "uniswap", "base"],
  };
}

export function buildAgentToolManifestDocument(slug: AgentToolSlug, origin: string) {
  return buildAgentToolManifest(slug, origin);
}

export function getAgentToolSlug(value: string): AgentToolSlug | null {
  return AGENT_TOOL_SLUGS.includes(value as AgentToolSlug)
    ? value as AgentToolSlug
    : AGENT_TOOL_ALIASES[value] || null;
}

export function buildZeroPriceToolChallenge(tool: AgentToolSlug, operatorAddress = process.env.MFERLAND_TOOL_OPERATOR_ADDRESS || DEFAULT_OPERATOR_ADDRESS) {
  return {
    ok: false,
    error: "x402 payment authorization required",
    tool,
    accepts: [{
      scheme: "exact",
      network: "base",
      payTo: normalizeOperatorAddress(operatorAddress),
      maxAmountRequired: "0",
      asset: {
        chainId: BASE_CHAIN_ID,
        address: BASE_USDC_ADDRESS,
        symbol: "USDC",
        decimals: 6,
      },
    }],
  };
}

export function parseToolPaymentHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const record = JSON.parse(decoded) as Record<string, unknown>;
    const payload = asRecord(record.payload);
    const authorization = asRecord(payload.authorization);
    return {
      x402Version: Number(record.x402Version) || 0,
      scheme: String(record.scheme || ""),
      network: String(record.network || ""),
      signature: String(payload.signature || ""),
      authorization: {
        from: normalizeAddress(authorization.from),
        to: normalizeAddress(authorization.to),
        value: String(authorization.value || ""),
        validAfter: String(authorization.validAfter || ""),
        validBefore: String(authorization.validBefore || ""),
        nonce: String(authorization.nonce || ""),
      },
    };
  } catch {
    return null;
  }
}

export function isZeroPriceToolPaymentUsable(payment: ReturnType<typeof parseToolPaymentHeader>): payment is NonNullable<ReturnType<typeof parseToolPaymentHeader>> {
  if (!payment) return false;
  if (payment.x402Version !== 1 || payment.scheme !== "exact" || payment.network !== "base") return false;
  if (!payment.authorization.from || !payment.authorization.to) return false;
  if (!/^0x[a-f0-9]{130}$/i.test(payment.signature)) return false;
  if (!/^0x[a-f0-9]{64}$/i.test(payment.authorization.nonce)) return false;
  if (payment.authorization.value !== "0") return false;
  const validAfter = Number(payment.authorization.validAfter);
  const validBefore = Number(payment.authorization.validBefore);
  if (Number.isFinite(validAfter) && validAfter > 0 && validAfter * 1000 > Date.now()) return false;
  return !Number.isFinite(validBefore) || validBefore <= 0 || validBefore * 1000 >= Date.now();
}

export async function verifyZeroPriceToolPayment(
  payment: ReturnType<typeof parseToolPaymentHeader>,
  operatorAddress = process.env.MFERLAND_TOOL_OPERATOR_ADDRESS || "",
) {
  if (!isZeroPriceToolPaymentUsable(payment)) return { ok: false, error: "invalid EIP-3009 zero-value payment payload" };
  const operator = normalizeAddress(operatorAddress);
  if (!operator || operator === DEFAULT_OPERATOR_ADDRESS) return { ok: false, error: "MFERLAND_TOOL_OPERATOR_ADDRESS is required for tool payment verification" };
  if (payment.authorization.to !== operator) return { ok: false, error: "payment authorization is not bound to this tool operator" };

  try {
    const recovered = normalizeAddress(await recoverTypedDataAddress({
      domain: {
        name: process.env.MFERLAND_TOOL_EIP3009_TOKEN_NAME || "USD Coin",
        version: process.env.MFERLAND_TOOL_EIP3009_TOKEN_VERSION || "2",
        chainId: BASE_CHAIN_ID,
        verifyingContract: getAddress(BASE_USDC_ADDRESS) as Address,
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: getAddress(payment.authorization.from) as Address,
        to: getAddress(payment.authorization.to) as Address,
        value: BigInt(payment.authorization.value),
        validAfter: BigInt(payment.authorization.validAfter || "0"),
        validBefore: BigInt(payment.authorization.validBefore || "0"),
        nonce: payment.authorization.nonce as `0x${string}`,
      },
      signature: payment.signature as `0x${string}`,
    }));
    if (recovered !== payment.authorization.from) return { ok: false, error: "payment signature does not recover caller address" };
    return { ok: true, callerAddress: recovered };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unable to verify tool payment signature" };
  }
}

export function buildToolUsageReport(tool: AgentToolSlug, payment: NonNullable<ReturnType<typeof parseToolPaymentHeader>>, startedAt: number) {
  return {
    verification_type: "eip3009_authorization",
    tool_chain_id: BASE_CHAIN_ID,
    tool_registry_address: process.env.MFERLAND_TOOL_REGISTRY_ADDRESS || "",
    tool_onchain_id: getToolOnchainId(tool),
    latency_ms: Math.max(0, Date.now() - startedAt),
    eip3009: {
      caller_address: payment.authorization.from,
      signature: payment.signature,
      chain_id: BASE_CHAIN_ID,
      from: payment.authorization.from,
      to: payment.authorization.to,
      value: payment.authorization.value,
      valid_after: payment.authorization.validAfter,
      valid_before: payment.authorization.validBefore,
      nonce: payment.authorization.nonce,
    },
  };
}

function getToolOnchainId(tool: AgentToolSlug) {
  for (const key of AGENT_TOOL_ID_ENV_KEYS[tool]) {
    const value = process.env[key] || "";
    if (value) return value;
  }
  return "";
}

export async function reportAgentToolUsage(tool: AgentToolSlug, payment: NonNullable<ReturnType<typeof parseToolPaymentHeader>>, startedAt: number) {
  const apiKey = process.env.OPENSEA_API_KEY || process.env.OPENSEA_TOOL_API_KEY || "";
  if (!apiKey) return { ok: false, skipped: true, reason: "missing OPENSEA_API_KEY" };
  const report = buildToolUsageReport(tool, payment, startedAt);
  if (!report.tool_registry_address || !report.tool_onchain_id) {
    return { ok: false, skipped: true, reason: "missing tool registry metadata" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://api.opensea.io/api/v2/tools/usage", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(report),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function commandOutputSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      ok: { type: "boolean" },
      bridgeSessionId: { type: "string" },
      commandId: { type: "string" },
      command: { type: "string" },
      behaviorScheme: { type: "string" },
      controller: { type: "object" },
      profile: { type: "object" },
      goals: { type: "array", items: { type: "object" } },
      goalProgress: { type: "array", items: { type: "object" } },
      stopWhen: { type: "string", enum: ["any", "all"] },
      constraints: { type: "object" },
      sandbox: { type: "object" },
      status: { type: "string" },
      summary: { type: "string" },
      result: { type: "object" },
      social: { type: "object" },
      combat: { type: "object" },
      fishing: { type: "object" },
      bridge: { type: "object" },
      postCommand: { type: "object" },
      prerequisiteRequired: { type: "object" },
      walletActionRequired: { type: "object" },
      finalState: { type: ["object", "null"] },
      stoppedBecause: { type: "string" },
      durationMs: { type: "number" },
      maxSeconds: { type: "number" },
      budget: { type: "object" },
      usage: { type: "object" },
      questChanges: { type: "array", items: { type: "object" } },
      inventoryChanges: { type: "array", items: { type: "object" } },
      equipmentChanges: { type: "array", items: { type: "object" } },
      lastActionReport: { type: ["object", "null"] },
      actionReports: { type: "array", items: { type: "object" } },
      errors: { type: "array", items: { type: "string" } },
      startedAt: { type: "string" },
      finishedAt: { type: "string" },
    },
    required: ["ok", "status"],
  };
}

function fishingOutputSchema() {
  const commandSchema = commandOutputSchema();
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      ...commandSchema.properties,
      action: { type: "string" },
      bridgeSessionId: { type: "string" },
      commandId: { type: "string" },
      status: { type: "string" },
      summary: { type: "string" },
      result: { type: "object" },
      fishing: { type: "object" },
      bridge: { type: "object" },
      postCommand: { type: "object" },
      prerequisiteRequired: {
        type: "object",
        description: "Returned by sell_fish when lost-fishing-shoes is not completed. Do not retry or fall back to sell_trash_items.",
      },
      walletActionRequired: {
        type: "object",
        description: "When action is claim_fishing_nft, callers should submit the provided transaction from the player wallet and then call submit_claim_tx with catchId and txHash.",
      },
      transaction: { type: "object" },
      catchId: { type: "string" },
      txHash: { type: "string" },
      toolUsageReport: { type: "object" },
      callerAddress: { type: "string" },
    },
    required: ["ok", "status"],
  };
}

function freePricing(): ToolManifest["pricing"] {
  const recipient = normalizeOperatorAddress(process.env.MFERLAND_TOOL_OPERATOR_ADDRESS || "");
  return [{
    amount: "0",
    asset: `eip155:${BASE_CHAIN_ID}/erc20:${BASE_USDC_ADDRESS.toLowerCase()}`,
    recipient: `eip155:${BASE_CHAIN_ID}:${recipient}`,
    protocol: "x402",
  }];
}

function getManifestCreatorAddress() {
  return normalizeAddress(process.env.MFERLAND_TOOL_CREATOR_ADDRESS)
    || normalizeAddress(process.env.MFERLAND_TOOL_OPERATOR_ADDRESS)
    || DEFAULT_OPERATOR_ADDRESS;
}

function normalizeOrigin(origin: string) {
  const clean = origin.trim().replace(/\/+$/, "");
  return clean || "https://game.mfergpt.lol";
}

function normalizeOperatorAddress(value: string) {
  return normalizeAddress(value) || DEFAULT_OPERATOR_ADDRESS;
}

function normalizeAddress(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{40}$/.test(text) ? text : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

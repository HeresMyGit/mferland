import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { normalizeWalletAddress } from "@mferland/shared";
import { formatRewardMultiplier, readAgentSeason0PointMultiplier } from "./agentRewards.js";
import { resolveMferGptBurnPaymentConfig } from "./crypto/mferGptBurnPayments.js";

export const DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI = "25000000000000000000000000";
export const AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL = "25M MFERGPT";

export type AgentSeason0MferGptGateReason =
  | "eligible"
  | "insufficient"
  | "disabled"
  | "invalid_wallet"
  | "unavailable";

export type AgentSeason0MferGptGateStatus = {
  requiredWei: string;
  requiredLabel: string;
  balanceWei: string;
  balanceLabel: string;
  eligible: boolean;
  reason: AgentSeason0MferGptGateReason;
  error?: string;
};

export type AgentSeason0MferGptBalanceReader = (
  walletAddress: string,
  env: NodeJS.ProcessEnv,
) => Promise<bigint> | bigint;

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

export function readAgentSeason0MferGptMinBalanceWei(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.MFERLAND_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI?.trim();
  if (!configured) return BigInt(DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI);
  if (!/^\d+$/.test(configured)) return BigInt(DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI);
  return BigInt(configured);
}

export async function getAgentSeason0MferGptGateStatus(
  walletAddress: string,
  env: NodeJS.ProcessEnv = process.env,
  readBalance: AgentSeason0MferGptBalanceReader = readMferGptBalanceWei,
): Promise<AgentSeason0MferGptGateStatus> {
  const requiredWei = readAgentSeason0MferGptMinBalanceWei(env);
  const requiredStatus = makeBaseGateStatus(requiredWei, 0n);
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) {
    return {
      ...requiredStatus,
      eligible: false,
      reason: "invalid_wallet",
      error: "agent wallet address is invalid",
    };
  }
  if (requiredWei <= 0n) {
    return {
      ...requiredStatus,
      eligible: true,
      reason: "disabled",
    };
  }

  try {
    const rawBalance = await readBalance(normalizedWallet, env);
    const balanceWei = rawBalance > 0n ? rawBalance : 0n;
    return {
      ...makeBaseGateStatus(requiredWei, balanceWei),
      eligible: balanceWei >= requiredWei,
      reason: balanceWei >= requiredWei ? "eligible" : "insufficient",
    };
  } catch (error) {
    return {
      ...requiredStatus,
      eligible: false,
      reason: "unavailable",
      error: errorMessage(error),
    };
  }
}

export async function readMferGptBalanceWei(walletAddress: string, env: NodeJS.ProcessEnv = process.env) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) throw new Error("agent wallet address is invalid");
  const config = resolveMferGptBurnPaymentConfig(env);
  const client = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });
  return client.readContract({
    address: config.tokenAddress as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [normalizedWallet as `0x${string}`],
  });
}

export function makeUncheckedAgentSeason0MferGptGateStatus(env: NodeJS.ProcessEnv = process.env): AgentSeason0MferGptGateStatus {
  const requiredWei = readAgentSeason0MferGptMinBalanceWei(env);
  if (requiredWei <= 0n) {
    return {
      ...makeBaseGateStatus(requiredWei, 0n),
      eligible: true,
      reason: "disabled",
    };
  }
  return {
    ...makeBaseGateStatus(requiredWei, 0n),
    eligible: false,
    reason: "unavailable",
    error: "agent MFERGPT balance was not checked",
  };
}

export function makeAgentSeason0MferGptGateMessage(status: AgentSeason0MferGptGateStatus, env: NodeJS.ProcessEnv = process.env) {
  const payoutLabel = `agent x${formatRewardMultiplier(readAgentSeason0PointMultiplier(env))}`;
  if (status.reason === "disabled") {
    return `Agent Season 0 MFERGPT earning gate is disabled. Agent rewards still use the reduced payout (${payoutLabel}).`;
  }
  if (status.eligible) {
    return `Agent Season 0 rewards active: wallet holds ${status.balanceLabel} / ${status.requiredLabel}. Agent rewards still use the reduced payout (${payoutLabel}).`;
  }
  if (status.reason === "insufficient") {
    return `Agent Season 0 rewards inactive: wallet holds ${status.balanceLabel} / ${status.requiredLabel} required. Quest progress still saves; Season 0 points start once the wallet meets the goal.`;
  }
  if (status.reason === "invalid_wallet") {
    return `Agent Season 0 rewards inactive: ${status.requiredLabel} wallet check needs a valid wallet address.`;
  }
  const detail = status.error ? ` ${status.error}` : "";
  return `Agent Season 0 rewards inactive: ${status.requiredLabel} wallet check is unavailable.${detail}`;
}

export function formatMferGptTokenAmountWei(value: bigint | string) {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  if (amount <= 0n) return "0 MFERGPT";

  const weiPerToken = 10n ** 18n;
  const millionWei = weiPerToken * 1_000_000n;
  if (amount >= millionWei) {
    return `${formatScaled(amount * 10n / millionWei, 1)}M MFERGPT`;
  }

  const thousandWei = weiPerToken * 1_000n;
  if (amount >= thousandWei) {
    return `${formatScaled(amount * 10n / thousandWei, 1)}K MFERGPT`;
  }

  const decimals = amount >= weiPerToken ? 2 : 4;
  return `${trimDecimal(formatUnits(amount, 18), decimals)} MFERGPT`;
}

function makeBaseGateStatus(requiredWei: bigint, balanceWei: bigint): AgentSeason0MferGptGateStatus {
  return {
    requiredWei: requiredWei.toString(),
    requiredLabel: requiredWei === BigInt(DEFAULT_AGENT_SEASON0_MFERGPT_MIN_BALANCE_WEI)
      ? AGENT_SEASON0_MFERGPT_MIN_BALANCE_LABEL
      : formatMferGptTokenAmountWei(requiredWei),
    balanceWei: balanceWei.toString(),
    balanceLabel: formatMferGptTokenAmountWei(balanceWei),
    eligible: false,
    reason: "unavailable",
  };
}

function formatScaled(value: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function trimDecimal(value: string, decimals: number) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, decimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "MFERGPT balance check failed";
}

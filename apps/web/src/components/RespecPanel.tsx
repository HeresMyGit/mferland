import { useEffect, useState } from "react";
import { Check, RefreshCw, Undo2, X } from "lucide-react";
import {
  TALENT_RESPEC_MFERGPT_AMOUNT_LABEL,
  TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BURN_ADDRESS,
  getTalentPointsSpent,
  type ClientRespecTalents,
  type MferGptPaymentProof,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TalentRespecResult,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { executeMferGptBurnPayment } from "../crypto/traitPayments";
import type { EthereumProvider } from "../crypto/transactionReceipts";

const LOCAL_DEBUG_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const LOCAL_CONTRACT_CONFIG_URL = "/crypto/local-contracts.json";
const LOCAL_CHAIN_RPC_URL = "http://127.0.0.1:8545";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

type RespecPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: TalentRespecResult | null;
  onClose: () => void;
  onRespecTalents: (message: ClientRespecTalents) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

export function RespecPanel({
  npc,
  player,
  result,
  onClose,
  onRespecTalents,
  onAnalyticsEvent,
}: RespecPanelProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingPayment, setPendingPayment] = useState<MferGptPaymentProof | null>(null);
  const spentTalentPoints = getTalentPointsSpent(player?.talents);
  const unspentTalentPoints = player?.talentPoints ?? 0;
  const afterResetTalentPoints = unspentTalentPoints + spentTalentPoints;
  const canUseWalletPayment = player?.identityType === "wallet" && Boolean(player.walletAddress);
  const canRespec = canUseWalletPayment && spentTalentPoints > 0;

  useEffect(() => {
    if (!result) return;
    setBusy(false);
    setStatus(result.ok
      ? `last reset refunded ${result.refundedTalentPoints} point${result.refundedTalentPoints === 1 ? "" : "s"}`
      : result.error ?? "respec failed");
    if (result.ok || /already used/i.test(result.error ?? "")) setPendingPayment(null);
  }, [result]);

  async function respecTalents() {
    if (!player || !canUseWalletPayment || !player.walletAddress) {
      setStatus("wallet character required");
      return;
    }
    if (spentTalentPoints <= 0) {
      setStatus("no spent talents to reset");
      return;
    }

    setBusy(true);
    setStatus(pendingPayment ? "verifying payment" : `confirm ${TALENT_RESPEC_MFERGPT_AMOUNT_LABEL} burn`);
    reportAnalytics("talent_respec_started", getRespecAnalyticsProperties());
    try {
      const payment = pendingPayment ?? await executeRespecPayment(player.walletAddress);
      setPendingPayment(payment);
      setStatus("verifying payment");
      onRespecTalents({ payment });
      window.setTimeout(() => setBusy((current) => current ? false : current), 90_000);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(message);
      setBusy(false);
      reportAnalytics("talent_respec_failed", {
        ...getRespecAnalyticsProperties(),
        stage: "wallet",
        error: message,
      });
    }
  }

  function getRespecAnalyticsProperties(): AnalyticsProperties {
    return {
      spentTalentPoints,
      expectedPaymentAmountWei: TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
      priceLabel: TALENT_RESPEC_MFERGPT_AMOUNT_LABEL,
      chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    };
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizeRespecAnalyticsProperties({
      npcId: npc.id,
      npcRole: npc.role,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  return (
    <div className="crypto-store-panel respec-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>talent reset</span>
        </div>
        <button type="button" title="Close respec" aria-label="Close respec" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <section className="respec-simple">
        <div className="respec-simple-head">
          <span className="item-icon rare">
            <Undo2 size={20} />
          </span>
          <div>
            <strong>reset talent points</strong>
            <span>Clear ranked talents and get those points back.</span>
          </div>
        </div>

        <div className="respec-simple-cost">
          <span>cost</span>
          <strong>burn {TALENT_RESPEC_MFERGPT_AMOUNT_LABEL}</strong>
        </div>

        <div className="respec-simple-change" aria-label="respec point change">
          <span>{spentTalentPoints} spent now</span>
          <strong>{afterResetTalentPoints} unspent after reset</strong>
        </div>

        <div className="crypto-store-actions respec-actions">
          <button type="button" disabled={busy || !canRespec} onClick={() => void respecTalents()}>
            {busy ? <RefreshCw size={16} /> : <Check size={16} />}
            {getActionLabel(busy, canUseWalletPayment, spentTalentPoints)}
          </button>
        </div>

        <p className="crypto-store-status">
          {status || getIdleStatus(canUseWalletPayment, spentTalentPoints)}
        </p>
      </section>
    </div>
  );
}

async function executeRespecPayment(walletAddress: string) {
  const provider = getInjectedEthereumProvider();
  if (provider) {
    return executeMferGptBurnPayment(
      provider,
      walletAddress,
      TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
      TALENT_RESPEC_MFERGPT_AMOUNT_LABEL,
    );
  }

  if (canUseLocalDebugPayment(walletAddress)) {
    return executeLocalDebugMferGptBurnPayment();
  }

  throw new Error("wallet required");
}

function getInjectedEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as Window & { ethereum?: Partial<EthereumProvider> };
  if (typeof maybeWindow.ethereum?.request !== "function") return null;
  return maybeWindow.ethereum as EthereumProvider;
}

function canUseLocalDebugPayment(walletAddress: string) {
  return import.meta.env.DEV
    && isLoopbackHost()
    && walletAddress.trim().toLowerCase() === LOCAL_DEBUG_WALLET_ADDRESS.toLowerCase();
}

async function executeLocalDebugMferGptBurnPayment(): Promise<MferGptPaymentProof> {
  const contracts = await fetchLocalDebugContracts();
  const tokenAddress = normalizeAddress(contracts.addresses?.mfergpt);
  if (!tokenAddress) throw new Error("local MFERGPT contract missing");
  const rpcUrl = resolveLocalDebugRpcUrl(contracts.rpcUrl);

  const txHash = await requestLocalDebugRpc(rpcUrl, "eth_sendTransaction", [{
    from: LOCAL_DEBUG_WALLET_ADDRESS,
    to: tokenAddress,
    data: `${ERC20_TRANSFER_SELECTOR}${encodeAddress(TRAIT_CHANGE_BURN_ADDRESS)}${encodeUint(BigInt(TALENT_RESPEC_MFERGPT_AMOUNT_WEI))}`,
    value: "0x0",
  }]);
  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("local debug payment failed");
  }

  await waitForLocalDebugReceipt(rpcUrl, txHash);
  return {
    token: "MFERGPT",
    txHash,
    amountWei: TALENT_RESPEC_MFERGPT_AMOUNT_WEI,
    chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    contractAddress: tokenAddress,
  };
}

async function fetchLocalDebugContracts() {
  const response = await fetch(getLocalDebugContractConfigUrl(), { cache: "no-store" });
  if (!response.ok) throw new Error("local contracts missing");
  return await response.json() as {
    rpcUrl?: unknown;
    addresses?: {
      mfergpt?: unknown;
    };
  };
}

function getLocalDebugContractConfigUrl() {
  const configured = import.meta.env.VITE_CRYPTO_CONTRACTS_URL;
  return typeof configured === "string" && configured.trim() ? configured.trim() : LOCAL_CONTRACT_CONFIG_URL;
}

function resolveLocalDebugRpcUrl(value: unknown) {
  const rpcUrl = typeof value === "string" && value.trim() ? value.trim() : LOCAL_CHAIN_RPC_URL;
  if (!isLoopbackRpcUrl(rpcUrl)) throw new Error("local debug RPC unavailable");
  return rpcUrl;
}

async function waitForLocalDebugReceipt(rpcUrl: string, txHash: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const receipt = await requestLocalDebugRpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (receipt && typeof receipt === "object") {
      const status = (receipt as { status?: unknown }).status;
      if (status !== "0x1") throw new Error("local debug payment failed");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("local debug payment timed out");
}

async function requestLocalDebugRpc(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json().catch(() => null) as { result?: unknown; error?: { message?: string } } | null;
  if (!response.ok || payload?.error) throw new Error(payload?.error?.message || `${method} failed`);
  return payload?.result;
}

function encodeAddress(address: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("address missing");
  return normalized.replace(/^0x/, "").padStart(64, "0");
}

function encodeUint(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function isLoopbackHost() {
  if (typeof window === "undefined") return false;
  const normalized = window.location.hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function isLoopbackRpcUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]");
  } catch {
    return false;
  }
}

function getIdleStatus(canUseWalletPayment: boolean, spentTalentPoints: number) {
  if (!canUseWalletPayment) return "wallet character required";
  if (spentTalentPoints <= 0) return "spend talent points first, then reset them here";
  return `burn ${TALENT_RESPEC_MFERGPT_AMOUNT_LABEL} to return ${spentTalentPoints} point${spentTalentPoints === 1 ? "" : "s"}`;
}

function getActionLabel(busy: boolean, canUseWalletPayment: boolean, spentTalentPoints: number) {
  if (busy) return "working";
  if (!canUseWalletPayment) return "wallet required";
  if (spentTalentPoints <= 0) return "spend points first";
  return `burn ${TALENT_RESPEC_MFERGPT_AMOUNT_LABEL} + reset`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "respec failed";
}

function sanitizeRespecAnalyticsProperties(properties: AnalyticsProperties) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string") result[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

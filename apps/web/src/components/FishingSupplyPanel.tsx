import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Fish, X } from "lucide-react";
import {
  ELIXIR_BUFFS,
  FISHING_CHUM_BUFF_ID,
  FISHING_CHUM_ITEM_ID,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  getFishingSupplyPrice,
  type ClientPurchaseFishingSupply,
  type FishingSupplyPurchaseResult,
  type MferGptPaymentProof,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { executeMferGptBurnPayment, getMferGptPaymentTxUrl } from "../crypto/traitPayments";
import type { EthereumProvider } from "../crypto/transactionReceipts";
import { ItemIcon } from "./hud/ItemIcon";

type FishingSupplyPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: FishingSupplyPurchaseResult | null;
  onClose: () => void;
  onPurchaseFishingSupply: (message: ClientPurchaseFishingSupply) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

export function FishingSupplyPanel({
  npc,
  player,
  result,
  onClose,
  onPurchaseFishingSupply,
  onAnalyticsEvent,
}: FishingSupplyPanelProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingPayment, setPendingPayment] = useState<MferGptPaymentProof | null>(null);
  const price = getFishingSupplyPrice();
  const canUseWalletPayment = player?.identityType === "wallet" && Boolean(player.walletAddress);
  const lessonComplete = player?.quests.some((quest) => quest.id === "fishin-lesson" && quest.status === "completed") ?? false;
  const item = FISHING_CHUM_ITEM_ID;
  const buff = ELIXIR_BUFFS[FISHING_CHUM_BUFF_ID];
  const shortWallet = useMemo(() => {
    const wallet = player?.walletAddress ?? "";
    return wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "wallet required";
  }, [player?.walletAddress]);

  useEffect(() => {
    if (!result || result.itemId !== item) return;
    setBusy(false);
    setStatus(result.ok ? `added ${result.itemName}` : result.error ?? "purchase failed");
    if (result.ok || /already used/i.test(result.error ?? "")) setPendingPayment(null);
  }, [item, result]);

  async function buyChum() {
    if (!lessonComplete) {
      setStatus("finish Motherfisher's lesson first");
      return;
    }
    if (!player || !canUseWalletPayment || !player.walletAddress) {
      setStatus("wallet character required");
      return;
    }

    const provider = getInjectedEthereumProvider();
    if (!provider) {
      setStatus("wallet required");
      return;
    }

    setBusy(true);
    setStatus(pendingPayment ? "verifying payment" : `confirm ${price.label} burn`);
    reportAnalytics("fishing_supply_purchase_started", getPurchaseAnalyticsProperties());
    try {
      const payment = pendingPayment ?? await executeMferGptBurnPayment(
        provider,
        player.walletAddress,
        price.amountWei,
        price.label,
      );
      setPendingPayment(payment);
      setStatus("verifying payment");
      onPurchaseFishingSupply({ payment });
      window.setTimeout(() => setBusy((current) => current ? false : current), 90_000);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(message);
      setBusy(false);
      reportAnalytics("fishing_supply_purchase_failed", {
        ...getPurchaseAnalyticsProperties(),
        stage: "wallet",
        error: message,
      });
    }
  }

  function getPurchaseAnalyticsProperties(): AnalyticsProperties {
    return {
      itemId: item,
      itemName: "bucket of old chum",
      priceLabel: price.label,
      expectedPaymentAmountWei: price.amountWei,
      chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    };
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizeFishingSupplyAnalyticsProperties({
      npcId: npc.id,
      npcRole: npc.role,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  return (
    <div className="crypto-store-panel potion-shop-panel fishing-supply-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>pond supplies</span>
        </div>
        <button type="button" title="Close fishing supplies" aria-label="Close fishing supplies" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview">
        <div className="crypto-store-account">
          <span>Base {TRAIT_CHANGE_BASE_CHAIN_ID}</span>
          <code>{shortWallet}</code>
          <strong>{price.label}</strong>
        </div>
      </div>

      <div className="potion-shop-layout">
        <div className="crypto-store-collection potion-shop-items" aria-label="fishing supply items">
          <button
            type="button"
            className="potion-shop-item-tile selected"
            disabled={busy}
            aria-pressed="true"
            data-tooltip={`bucket of old chum\n${buff.description}`}
          >
            <ItemIcon itemId={item} />
            <span>1h bait</span>
            <strong>bucket of old chum</strong>
            <small>{price.label}</small>
          </button>
        </div>

        <section className="crypto-store-flow potion-shop-flow">
          <div className="crypto-store-flow-head">
            <div className="crypto-store-gear-heading">
              <ItemIcon itemId={item} />
              <div>
                <strong>bucket of old chum</strong>
                <span>{buff.description}</span>
              </div>
            </div>
            <Fish size={18} />
          </div>

          <div className="crypto-price-grid potion-shop-stats">
            <div>
              <span>cost</span>
              <strong>{price.label}</strong>
            </div>
            <div>
              <span>effect</span>
              <strong>{buff.effectLabel}</strong>
            </div>
            <div>
              <span>delivery</span>
              <strong>x1</strong>
            </div>
          </div>

          <div className="crypto-store-actions potion-shop-actions">
            <button type="button" disabled={busy || !canUseWalletPayment || !lessonComplete} onClick={() => void buyChum()}>
              <Check size={16} />
              buy
            </button>
            {result?.txHash && (
              <a href={getMferGptPaymentTxUrl(result.txHash)} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                tx
              </a>
            )}
          </div>

          <p className="crypto-store-status">
            {status || (lessonComplete
              ? canUseWalletPayment ? "buy chum, then use it from inventory" : "wallet character required"
              : "finish Motherfisher's lesson first")}
          </p>
        </section>
      </div>
    </div>
  );
}

function getInjectedEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as Window & { ethereum?: Partial<EthereumProvider> };
  if (typeof maybeWindow.ethereum?.request !== "function") return null;
  return maybeWindow.ethereum as EthereumProvider;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "purchase failed";
}

function sanitizeFishingSupplyAnalyticsProperties(properties: AnalyticsProperties) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string") result[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

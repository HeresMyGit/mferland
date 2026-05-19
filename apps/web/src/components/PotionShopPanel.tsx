import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FlaskConical, X } from "lucide-react";
import {
  ITEMS,
  POTION_SHOP_BULK_MFERGPT_AMOUNT_LABEL,
  POTION_SHOP_ITEM_IDS,
  POTION_SHOP_MFERGPT_AMOUNT_LABEL,
  getPotionShopPrice,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  type ClientPurchasePotionShopItem,
  type NpcSnapshot,
  type PlayerSnapshot,
  type PotionShopItemId,
  type PotionShopPurchaseQuantity,
  type PotionShopPurchaseResult,
  type MferGptPaymentProof,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { executeMferGptBurnPayment, getMferGptPaymentTxUrl } from "../crypto/traitPayments";
import type { EthereumProvider } from "../crypto/transactionReceipts";
import { ItemIcon } from "./hud/ItemIcon";

type PotionShopPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: PotionShopPurchaseResult | null;
  onClose: () => void;
  onPurchasePotionShopItem: (message: ClientPurchasePotionShopItem) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

export function PotionShopPanel({
  npc,
  player,
  result,
  onClose,
  onPurchasePotionShopItem,
  onAnalyticsEvent,
}: PotionShopPanelProps) {
  const [selectedItemId, setSelectedItemId] = useState<PotionShopItemId>(POTION_SHOP_ITEM_IDS[0]);
  const [selectedQuantity, setSelectedQuantity] = useState<PotionShopPurchaseQuantity>(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingPayment, setPendingPayment] = useState<MferGptPaymentProof | null>(null);
  const selectedItem = ITEMS[selectedItemId];
  const selectedPrice = getPotionShopPrice(selectedQuantity);
  const canUseWalletPayment = player?.identityType === "wallet" && Boolean(player.walletAddress);
  const shortWallet = useMemo(() => {
    const wallet = player?.walletAddress ?? "";
    return wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "wallet required";
  }, [player?.walletAddress]);

  useEffect(() => {
    if (!result || result.itemId !== selectedItemId || result.quantity !== selectedQuantity) return;
    setBusy(false);
    setStatus(result.ok ? `added ${result.quantity} ${result.itemName}` : result.error ?? "purchase failed");
    if (result.ok || /already used/i.test(result.error ?? "")) setPendingPayment(null);
  }, [result, selectedItemId, selectedQuantity]);

  function selectItem(itemId: PotionShopItemId) {
    setSelectedItemId(itemId);
    setPendingPayment(null);
    setStatus("");
    reportAnalytics("potion_shop_item_selected", { itemId, itemName: ITEMS[itemId].name, quantity: selectedQuantity });
  }

  function selectQuantity(quantity: PotionShopPurchaseQuantity) {
    setSelectedQuantity(quantity);
    setPendingPayment(null);
    setStatus("");
    reportAnalytics("potion_shop_item_selected", {
      itemId: selectedItemId,
      itemName: selectedItem.name,
      quantity,
      priceLabel: getPotionShopPrice(quantity).label,
    });
  }

  async function buySelectedItem() {
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
    setStatus(pendingPayment ? "verifying payment" : `confirm ${selectedPrice.label} burn`);
    reportAnalytics("potion_shop_purchase_started", getPurchaseAnalyticsProperties());
    try {
      const payment = pendingPayment ?? await executeMferGptBurnPayment(
        provider,
        player.walletAddress,
        selectedPrice.amountWei,
        selectedPrice.label,
      );
      setPendingPayment(payment);
      setStatus("verifying payment");
      onPurchasePotionShopItem({
        itemId: selectedItemId,
        quantity: selectedQuantity,
        payment,
      });
      window.setTimeout(() => setBusy((current) => current ? false : current), 90_000);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(message);
      setBusy(false);
      reportAnalytics("potion_shop_purchase_failed", {
        ...getPurchaseAnalyticsProperties(),
        stage: "wallet",
        error: message,
      });
    }
  }

  function getPurchaseAnalyticsProperties(): AnalyticsProperties {
    return {
      itemId: selectedItemId,
      itemName: selectedItem.name,
      quantity: selectedQuantity,
      priceLabel: selectedPrice.label,
      expectedPaymentAmountWei: selectedPrice.amountWei,
      chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
    };
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizePotionShopAnalyticsProperties({
      npcId: npc.id,
      npcRole: npc.role,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  return (
    <div className="crypto-store-panel potion-shop-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>{POTION_SHOP_MFERGPT_AMOUNT_LABEL} single / {POTION_SHOP_BULK_MFERGPT_AMOUNT_LABEL} five-stack</span>
        </div>
        <button type="button" title="Close potion shop" aria-label="Close potion shop" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview">
        <div className="crypto-store-account">
          <span>Base {TRAIT_CHANGE_BASE_CHAIN_ID}</span>
          <code>{shortWallet}</code>
          <strong>{selectedPrice.label}</strong>
        </div>
      </div>

      <div className="potion-shop-layout">
        <div className="crypto-store-collection potion-shop-items" aria-label="potion shop items">
          {POTION_SHOP_ITEM_IDS.map((itemId) => {
            const item = ITEMS[itemId];
            const selected = selectedItemId === itemId;
            return (
              <button
                key={itemId}
                type="button"
                className={`potion-shop-item-tile${selected ? " selected" : ""}`}
                disabled={busy}
                aria-pressed={selected}
                data-tooltip={`${item.name}\n${item.description}`}
                onClick={() => selectItem(itemId)}
              >
                <ItemIcon itemId={itemId} />
                <span>{item.consumable?.kind ?? "item"}</span>
                <strong>{item.name}</strong>
                <small>{selectedPrice.label}</small>
              </button>
            );
          })}
        </div>

        <div className="crypto-store-collection potion-shop-packs" aria-label="potion shop pack size">
          <button
            type="button"
            className={selectedQuantity === 1 ? "selected" : undefined}
            disabled={busy}
            aria-pressed={selectedQuantity === 1}
            onClick={() => selectQuantity(1)}
          >
            <span>single</span>
            <strong>{POTION_SHOP_MFERGPT_AMOUNT_LABEL}</strong>
          </button>
          <button
            type="button"
            className={selectedQuantity === 5 ? "selected" : undefined}
            disabled={busy}
            aria-pressed={selectedQuantity === 5}
            onClick={() => selectQuantity(5)}
          >
            <span>5-stack</span>
            <strong>{POTION_SHOP_BULK_MFERGPT_AMOUNT_LABEL}</strong>
          </button>
        </div>

        <section className="crypto-store-flow potion-shop-flow">
          <div className="crypto-store-flow-head">
            <div className="crypto-store-gear-heading">
              <ItemIcon itemId={selectedItemId} />
              <div>
                <strong>{selectedItem.name}</strong>
                <span>{selectedItem.description}</span>
              </div>
            </div>
            <FlaskConical size={18} />
          </div>

          <div className="crypto-price-grid potion-shop-stats">
            <div>
              <span>cost</span>
              <strong>{selectedPrice.label}</strong>
            </div>
            <div>
              <span>restores</span>
              <strong>{formatRestores(selectedItemId)}</strong>
            </div>
            <div>
              <span>delivery</span>
              <strong>x{selectedQuantity}</strong>
            </div>
          </div>

          <div className="crypto-store-actions potion-shop-actions">
            <button type="button" disabled={busy || !canUseWalletPayment} onClick={() => void buySelectedItem()}>
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

          <p className="crypto-store-status">{status || (canUseWalletPayment ? "pick item and stack size" : "wallet character required")}</p>
        </section>
      </div>
    </div>
  );
}

function formatRestores(itemId: PotionShopItemId) {
  const consumable = ITEMS[itemId].consumable;
  if (!consumable) return "item";
  const health = "health" in consumable ? consumable.health : 0;
  const mana = "mana" in consumable ? consumable.mana : 0;
  const parts = [
    health ? `${health} HP` : "",
    mana ? `${mana} MP` : "",
  ].filter(Boolean);
  return parts.join(" + ") || consumable.kind;
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

function sanitizePotionShopAnalyticsProperties(properties: AnalyticsProperties) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string") result[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

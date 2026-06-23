import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Fish, X } from "lucide-react";
import {
  FISHING_AGENT_BUNDLE_MULTIPLIER,
  ITEMS,
  getFishingPayableQuantity,
  getFishingRequiredBundleSize,
  getFishingSaleRule,
  getFishingSellAwardPoints,
  isFishingSellableItemId,
  type ClientSellFishingItems,
  type FishingSellableItemId,
  type FishingVendorSellResult,
  type InventoryItemSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { ItemIcon } from "./hud/ItemIcon";

type FishingVendorPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: FishingVendorSellResult | null;
  onClose: () => void;
  onSellFishingItems: (message: ClientSellFishingItems) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

type SellableFishingStack = InventoryItemSnapshot & { id: FishingSellableItemId };

export function FishingVendorPanel({
  npc,
  player,
  result,
  onClose,
  onSellFishingItems,
  onAnalyticsEvent,
}: FishingVendorPanelProps) {
  const sellableItems = useMemo(() => getSellableFishingStacks(player), [player?.inventory]);
  const [selectedItemId, setSelectedItemId] = useState<FishingSellableItemId | "">("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const selectedStack = sellableItems.find((item) => item.id === selectedItemId) ?? sellableItems[0] ?? null;
  const canSell = player?.identityType === "wallet" && Boolean(player.walletAddress);
  const isAgent = Boolean(player?.isAgent);
  const selectedPayableQuantity = selectedStack
    ? getFishingPayableQuantity(selectedStack.id, selectedStack.count, Number.MAX_SAFE_INTEGER, isAgent)
    : 0;
  const totalPayableQuantity = sellableItems.reduce((total, item) => (
    total + getFishingPayableQuantity(item.id, item.count, Number.MAX_SAFE_INTEGER, isAgent)
  ), 0);

  useEffect(() => {
    if (selectedItemId && sellableItems.some((item) => item.id === selectedItemId)) return;
    setSelectedItemId(sellableItems[0]?.id ?? "");
  }, [sellableItems, selectedItemId]);

  useEffect(() => {
    if (!result) return;
    setBusy(false);
    setStatus(result.ok
      ? `sold ${result.quantity} for ${formatSeasonPoints(result.points)}`
      : result.error ?? "sale failed");
  }, [result]);

  function selectItem(itemId: FishingSellableItemId) {
    setSelectedItemId(itemId);
    setStatus("");
    reportAnalytics("fishing_vendor_item_selected", { itemId, itemName: ITEMS[itemId].name });
  }

  function sellSelected(quantity: number) {
    if (!selectedStack) return;
    sell({ itemId: selectedStack.id, quantity });
  }

  function sellAllFishingItems() {
    sell({ sellAll: true });
  }

  function sell(message: ClientSellFishingItems) {
    if (!canSell) {
      setStatus("wallet character required");
      return;
    }
    setBusy(true);
    setStatus("selling pond haul");
    reportAnalytics("fishing_vendor_sell_started", {
      itemId: message.itemId ?? "",
      quantity: message.quantity ?? 0,
      sellAll: message.sellAll === true,
    });
    onSellFishingItems(message);
    window.setTimeout(() => setBusy((current) => current ? false : current), 20_000);
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizeFishingVendorAnalyticsProperties({
      npcId: npc.id,
      npcRole: npc.role,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  const selectedRule = selectedStack ? getFishingSaleRule(selectedStack.id) : null;
  const selectedBundleSize = selectedStack ? getFishingRequiredBundleSize(selectedStack.id, isAgent) : 1;
  const selectedStackValue = selectedStack ? getFishingSellAwardPoints(selectedStack.id, selectedStack.count, isAgent) : 0;

  return (
    <div className="crypto-store-panel trash-vendor-panel fishing-vendor-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>pond exchange</span>
        </div>
        <button type="button" title="Close fishing vendor" aria-label="Close fishing vendor" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview">
        <div className="crypto-store-account">
          <span>season points</span>
          <code>{canSell ? `${player?.season0Points ?? 0} points` : "wallet required"}</code>
          <strong>{isAgent ? `${FISHING_AGENT_BUNDLE_MULTIPLIER}x fish bundles` : "fish bundles"}</strong>
        </div>
      </div>

      <div className="trash-vendor-layout">
        <div className="crypto-store-collection trash-vendor-items" aria-label="sellable fishing items">
          {sellableItems.length > 0 ? sellableItems.map((item) => {
            const selected = selectedStack?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`inventory-slot trash-vendor-item${selected ? " selected" : ""}`}
                disabled={busy}
                aria-pressed={selected}
                data-tooltip={`${ITEMS[item.id].name}\n${ITEMS[item.id].description}`}
                onClick={() => selectItem(item.id)}
              >
                <ItemIcon itemId={item.id} />
                <strong>{ITEMS[item.id].name}</strong>
                <small>{formatFishingStackValue(item.id, item.count, isAgent)}</small>
                <span className="tile-count">x{item.count}</span>
              </button>
            );
          }) : (
            <p className="quest-empty">no pond haul</p>
          )}
        </div>

        <section className="crypto-store-flow trash-vendor-flow">
          <div className="crypto-store-flow-head">
            <div className="crypto-store-gear-heading">
              {selectedStack ? <ItemIcon itemId={selectedStack.id} /> : <span className="item-icon common"><Fish size={18} /></span>}
              <div>
                <strong>{selectedStack ? ITEMS[selectedStack.id].name : "pond haul"}</strong>
                <span>{selectedStack ? ITEMS[selectedStack.id].description : "fish and junk from South Center Pond"}</span>
              </div>
            </div>
            <Fish size={18} />
          </div>

          <div className="crypto-price-grid trash-vendor-stats">
            <div>
              <span>selected</span>
              <strong>{selectedStack ? `x${selectedStack.count}` : "none"}</strong>
            </div>
            <div>
              <span>bundle</span>
              <strong>{selectedStack ? `${selectedBundleSize}: ${formatSeasonPoints(selectedRule?.seasonPoints ?? 0)}` : "-"}</strong>
            </div>
            <div>
              <span>stash value</span>
              <strong>{formatSeasonPoints(sellableItems.reduce((total, item) => total + getFishingSellAwardPoints(item.id, item.count, isAgent), 0))}</strong>
            </div>
          </div>

          <div className="crypto-store-actions trash-vendor-actions">
            <button
              type="button"
              disabled={busy || !canSell || !selectedStack || selectedPayableQuantity <= 0}
              onClick={() => sellSelected(selectedBundleSize)}
            >
              <Coins size={16} />
              bundle
            </button>
            <button
              type="button"
              disabled={busy || !canSell || !selectedStack || selectedPayableQuantity <= 0}
              onClick={() => selectedStack && sellSelected(selectedPayableQuantity)}
            >
              <Check size={16} />
              stack
            </button>
            <button type="button" disabled={busy || !canSell || totalPayableQuantity <= 0} onClick={sellAllFishingItems}>
              <Fish size={16} />
              all
            </button>
          </div>

          <p className="crypto-store-status">
            {status || (canSell
              ? selectedStack
                ? `${selectedBundleSize} ${ITEMS[selectedStack.id].name} = ${formatSeasonPoints(selectedRule?.seasonPoints ?? 0)}; stack has ${formatSeasonPoints(selectedStackValue)}`
                : "pond haul only"
              : "wallet character required")}
          </p>
        </section>
      </div>
    </div>
  );
}

function getSellableFishingStacks(player: PlayerSnapshot | null): SellableFishingStack[] {
  return (player?.inventory ?? [])
    .filter((item): item is SellableFishingStack => isFishingSellableItemId(item.id) && !item.chainTokenId && item.count > 0)
    .sort((left, right) => ITEMS[left.id].name.localeCompare(ITEMS[right.id].name));
}

function formatSeasonPoints(points: number) {
  return `${points} season point${points === 1 ? "" : "s"}`;
}

function formatFishingStackValue(itemId: FishingSellableItemId, count: number, isAgent: boolean) {
  const points = getFishingSellAwardPoints(itemId, count, isAgent);
  const bundle = getFishingRequiredBundleSize(itemId, isAgent);
  return `${formatSeasonPoints(points)} / ${bundle}-stack`;
}

function sanitizeFishingVendorAnalyticsProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [
    key,
    typeof value === "string" ? value.slice(0, 120) : value,
  ])) as Record<string, string | number | boolean | null>;
}

import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Recycle, X } from "lucide-react";
import {
  ITEMS,
  getTrashVendorSellValue,
  isTrashVendorItemId,
  type ClientSellTrashItems,
  type InventoryItemSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TrashVendorItemId,
  type TrashVendorSellResult,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { ItemIcon } from "./hud/ItemIcon";

type TrashVendorPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: TrashVendorSellResult | null;
  onClose: () => void;
  onSellTrashItems: (message: ClientSellTrashItems) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

type SellableTrashStack = InventoryItemSnapshot & { id: TrashVendorItemId };

export function TrashVendorPanel({
  npc,
  player,
  result,
  onClose,
  onSellTrashItems,
  onAnalyticsEvent,
}: TrashVendorPanelProps) {
  const sellableItems = useMemo(() => getSellableTrashStacks(player), [player?.inventory]);
  const [selectedItemId, setSelectedItemId] = useState<TrashVendorItemId | "">("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const selectedStack = sellableItems.find((item) => item.id === selectedItemId) ?? sellableItems[0] ?? null;
  const totalTrashCount = sellableItems.reduce((total, item) => total + item.count, 0);
  const canSell = player?.identityType === "wallet" && Boolean(player.walletAddress);

  useEffect(() => {
    if (selectedItemId && sellableItems.some((item) => item.id === selectedItemId)) return;
    setSelectedItemId(sellableItems[0]?.id ?? "");
  }, [sellableItems, selectedItemId]);

  useEffect(() => {
    if (!result) return;
    setBusy(false);
    setStatus(result.ok
      ? `sold ${result.quantity} for ${result.points} Season 0 point${result.points === 1 ? "" : "s"}`
      : result.error ?? "sale failed");
  }, [result]);

  function selectItem(itemId: TrashVendorItemId) {
    setSelectedItemId(itemId);
    setStatus("");
    reportAnalytics("trash_vendor_item_selected", { itemId, itemName: ITEMS[itemId].name });
  }

  function sellSelected(quantity: number) {
    if (!selectedStack) return;
    sell({ itemId: selectedStack.id, quantity });
  }

  function sellAllTrash() {
    sell({ sellAll: true });
  }

  function sell(message: ClientSellTrashItems) {
    if (!canSell) {
      setStatus("wallet character required");
      return;
    }
    setBusy(true);
    setStatus("selling trash");
    reportAnalytics("trash_vendor_sell_started", {
      itemId: message.itemId ?? "",
      quantity: message.quantity ?? 0,
      sellAll: message.sellAll === true,
    });
    onSellTrashItems(message);
    window.setTimeout(() => setBusy((current) => current ? false : current), 20_000);
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizeTrashVendorAnalyticsProperties({
      npcId: npc.id,
      npcRole: npc.role,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  return (
    <div className="crypto-store-panel trash-vendor-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>junk exchange</span>
        </div>
        <button type="button" title="Close trash vendor" aria-label="Close trash vendor" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview">
        <div className="crypto-store-account">
          <span>Season 0</span>
          <code>{canSell ? `${player?.season0Points ?? 0} points` : "wallet required"}</code>
          <strong>1 point each</strong>
        </div>
      </div>

      <div className="trash-vendor-layout">
        <div className="crypto-store-collection trash-vendor-items" aria-label="sellable trash items">
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
                <small>{getTrashVendorSellValue(item.count)} Season 0 pts</small>
                <span className="tile-count">x{item.count}</span>
              </button>
            );
          }) : (
            <p className="quest-empty">no junk</p>
          )}
        </div>

        <section className="crypto-store-flow trash-vendor-flow">
          <div className="crypto-store-flow-head">
            <div className="crypto-store-gear-heading">
              {selectedStack ? <ItemIcon itemId={selectedStack.id} /> : <span className="item-icon poor"><Recycle size={18} /></span>}
              <div>
                <strong>{selectedStack ? ITEMS[selectedStack.id].name : "junk"}</strong>
                <span>{selectedStack ? ITEMS[selectedStack.id].description : "nothing sellable in stash"}</span>
              </div>
            </div>
            <Recycle size={18} />
          </div>

          <div className="crypto-price-grid trash-vendor-stats">
            <div>
              <span>selected</span>
              <strong>{selectedStack ? `x${selectedStack.count}` : "none"}</strong>
            </div>
            <div>
              <span>price</span>
              <strong>1 pt</strong>
            </div>
            <div>
              <span>stash value</span>
              <strong>{getTrashVendorSellValue(totalTrashCount)} pts</strong>
            </div>
          </div>

          <div className="crypto-store-actions trash-vendor-actions">
            <button type="button" disabled={busy || !canSell || !selectedStack} onClick={() => sellSelected(1)}>
              <Coins size={16} />
              sell 1
            </button>
            <button type="button" disabled={busy || !canSell || !selectedStack} onClick={() => selectedStack && sellSelected(selectedStack.count)}>
              <Check size={16} />
              stack
            </button>
            <button type="button" disabled={busy || !canSell || totalTrashCount <= 0} onClick={sellAllTrash}>
              <Recycle size={16} />
              all
            </button>
          </div>

          <p className="crypto-store-status">{status || (canSell ? "junk only" : "wallet character required")}</p>
        </section>
      </div>
    </div>
  );
}

function getSellableTrashStacks(player: PlayerSnapshot | null): SellableTrashStack[] {
  return (player?.inventory ?? [])
    .filter((item): item is SellableTrashStack => isTrashVendorItemId(item.id) && !item.chainTokenId && item.count > 0)
    .sort((left, right) => ITEMS[left.id].name.localeCompare(ITEMS[right.id].name));
}

function sanitizeTrashVendorAnalyticsProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [
    key,
    typeof value === "string" ? value.slice(0, 120) : value,
  ])) as Record<string, string | number | boolean | null>;
}

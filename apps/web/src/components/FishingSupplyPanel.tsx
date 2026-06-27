import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Fish, X } from "lucide-react";
import {
  ELIXIR_BUFFS,
  FISHING_CHUM_BUFF_ID,
  FISHING_CHUM_ITEM_ID,
  ONCHAIN_FISHING_ROD_ITEM_ID,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  getFishingSupplyPrice,
  type ClientPurchaseOnchainFishingRod,
  type ClientPurchaseFishingSupply,
  type FishingSupplyPurchaseResult,
  type FishingWalletNftSnapshot,
  type MferGptPaymentProof,
  type NpcSnapshot,
  type OnchainFishingRodMintResult,
  type OnchainFishingRodRequirementSnapshot,
  type PlayerSnapshot,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { executeOnchainFishingRodMint, getOnchainFishingRodMintTxUrl } from "../crypto/fishingPond";
import { executeMferGptBurnPayment, getMferGptPaymentTxUrl } from "../crypto/traitPayments";
import type { EthereumProvider } from "../crypto/transactionReceipts";
import { ItemIcon } from "./hud/ItemIcon";

type FishingSupplyPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot | null;
  result: FishingSupplyPurchaseResult | null;
  rodMintResult: OnchainFishingRodMintResult | null;
  rodRequirement?: OnchainFishingRodRequirementSnapshot;
  walletNfts: FishingWalletNftSnapshot[];
  onClose: () => void;
  onPurchaseFishingSupply: (message: ClientPurchaseFishingSupply) => void;
  onPurchaseOnchainFishingRod: (message: ClientPurchaseOnchainFishingRod) => void;
  onRefreshFishingNftHistory: () => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

type FishingSupplySelection = "chum" | "rod";

export function FishingSupplyPanel({
  npc,
  player,
  result,
  rodMintResult,
  rodRequirement,
  walletNfts,
  onClose,
  onPurchaseFishingSupply,
  onPurchaseOnchainFishingRod,
  onRefreshFishingNftHistory,
  onAnalyticsEvent,
}: FishingSupplyPanelProps) {
  const [selectedItem, setSelectedItem] = useState<FishingSupplySelection>("chum");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingPayment, setPendingPayment] = useState<MferGptPaymentProof | null>(null);
  const [walletMintTxHash, setWalletMintTxHash] = useState("");
  const price = getFishingSupplyPrice();
  const canUseWalletPayment = player?.identityType === "wallet" && Boolean(player.walletAddress);
  const lessonComplete = player?.quests.some((quest) => quest.id === "fishin-lesson" && quest.status === "completed") ?? false;
  const item = FISHING_CHUM_ITEM_ID;
  const rodItem = ONCHAIN_FISHING_ROD_ITEM_ID;
  const buff = ELIXIR_BUFFS[FISHING_CHUM_BUFF_ID];
  const walletRodNft = walletNfts.find((nft) => nft.itemId === ONCHAIN_FISHING_ROD_ITEM_ID) ?? null;
  const walletOwnsRod = Boolean(walletRodNft || rodRequirement?.walletOwnsRod || rodMintResult?.walletNft);
  const rodMintEnabled = Boolean(rodRequirement?.adminMintEnabled);
  const rodMintMode = rodRequirement?.mintMode || (rodMintEnabled ? "server" : rodRequirement?.mintContractAddress ? "wallet" : "url");
  const rodMintUrl = rodRequirement?.mintUrl || "";
  const rodChainId = rodRequirement?.chainId || rodMintResult?.chainId || 0;
  const rodContractAddress = rodRequirement?.contractAddress || rodMintResult?.contractAddress || "";
  const rodMintContractAddress = rodRequirement?.mintContractAddress || rodContractAddress;
  const rodPriceLabel = rodRequirement?.mintPriceLabel || "25M $MFERGPT";
  const rodMintUnavailable = rodMintMode === "url"
    ? !rodMintUrl
    : rodMintMode === "server"
      ? !rodMintEnabled
      : !rodMintContractAddress;
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

  useEffect(() => {
    if (!rodMintResult) return;
    setBusy(false);
    setStatus(rodMintResult.ok
      ? rodMintResult.alreadyOwned ? "rod already in wallet" : "onchain fishing rod minted"
      : rodMintResult.error ?? "rod mint failed");
    if (rodMintResult.ok) {
      onRefreshFishingNftHistory();
    }
  }, [onRefreshFishingNftHistory, rodMintResult]);

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

  async function mintRod() {
    if (!player || !canUseWalletPayment || !player.walletAddress) {
      setStatus("wallet character required");
      return;
    }
    if (walletOwnsRod) {
      setStatus("rod already in wallet");
      return;
    }
    if (!rodRequirement?.enabled) {
      setStatus("rod minting unavailable");
      return;
    }
    if (rodMintMode === "url") {
      if (rodMintUrl) {
        window.open(rodMintUrl, "_blank", "noopener,noreferrer");
        setStatus("opened mint page");
      } else {
        setStatus("rod minting unavailable");
      }
      return;
    }

    setBusy(true);
    setStatus(rodMintMode === "wallet" ? "confirm rod mint" : "minting test rod");
    reportAnalytics("onchain_fishing_rod_mint_started", {
      ...getRodMintAnalyticsProperties(),
      stage: rodMintMode === "wallet" ? "wallet" : "server_request",
    });
    try {
      if (rodMintMode === "wallet") {
        if (!rodRequirement) throw new Error("rod minting unavailable");
        const provider = getInjectedEthereumProvider();
        if (!provider) throw new Error("wallet required");
        setStatus(rodRequirement.mintPaymentTokenAddress ? "approve tokens if prompted, then mint" : "minting onchain rod");
        const txHash = await executeOnchainFishingRodMint(provider, player.walletAddress, rodRequirement);
        setWalletMintTxHash(txHash);
        setStatus("rod minted; refreshing wallet");
        reportAnalytics("onchain_fishing_rod_mint_confirmed", {
          ...getRodMintAnalyticsProperties(),
          stage: "wallet",
        });
        onRefreshFishingNftHistory();
        setBusy(false);
        return;
      }
      setStatus("minting onchain rod");
      onPurchaseOnchainFishingRod({});
      window.setTimeout(() => setBusy((current) => current ? false : current), 120_000);
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(message);
      setBusy(false);
      reportAnalytics("onchain_fishing_rod_mint_failed", {
        ...getRodMintAnalyticsProperties(),
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

  function getRodMintAnalyticsProperties(): AnalyticsProperties {
    return {
      itemId: rodItem,
      itemName: "onchain fishing rod",
      priceLabel: rodPriceLabel,
      expectedPaymentAmountWei: rodRequirement?.mintPriceAmountWei ?? "0",
      chainId: rodChainId,
      contractAddress: rodContractAddress,
      mintContractAddress: rodMintContractAddress,
      mintMode: rodMintMode,
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
          <span>{selectedItem === "rod" && rodChainId ? `chain ${rodChainId}` : `Base ${TRAIT_CHANGE_BASE_CHAIN_ID}`}</span>
          <code>{shortWallet}</code>
          <strong>{selectedItem === "rod" ? walletOwnsRod ? "owned" : rodPriceLabel : price.label}</strong>
        </div>
      </div>

      <div className="potion-shop-layout">
        <div className="crypto-store-collection potion-shop-items" aria-label="fishing supply items">
          <button
            type="button"
            className={`potion-shop-item-tile ${selectedItem === "chum" ? "selected" : ""}`}
            disabled={busy}
            aria-pressed={selectedItem === "chum"}
            onClick={() => setSelectedItem("chum")}
            data-tooltip={`bucket of old chum\n${buff.description}`}
          >
            <ItemIcon itemId={item} />
            <span>1h bait</span>
            <strong>bucket of old chum</strong>
            <small>{price.label}</small>
          </button>
          <button
            type="button"
            className={`potion-shop-item-tile ${selectedItem === "rod" ? "selected" : ""}`}
            disabled={busy}
            aria-pressed={selectedItem === "rod"}
            onClick={() => setSelectedItem("rod")}
            data-tooltip={`onchain fishing rod\nwallet-held NFT for onchain goodies`}
          >
            <ItemIcon itemId={rodItem} />
            <span>{walletOwnsRod ? "owned" : "NFT gate"}</span>
            <strong>onchain fishing rod</strong>
            <small>{walletOwnsRod ? "in wallet" : rodPriceLabel}</small>
          </button>
        </div>

        <section className="crypto-store-flow potion-shop-flow">
          {selectedItem === "chum" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="crypto-store-flow-head">
                <div className="crypto-store-gear-heading">
                  <ItemIcon itemId={rodItem} />
                  <div>
                    <strong>onchain fishing rod</strong>
                    <span>wallet-held NFT for hooking onchain goodies from the pond.</span>
                  </div>
                </div>
                <Fish size={18} />
              </div>

              <div className="crypto-price-grid potion-shop-stats">
                <div>
                  <span>cost</span>
                  <strong>{walletOwnsRod ? "owned" : rodPriceLabel}</strong>
                </div>
                <div>
                  <span>contract</span>
                  <strong>{rodMintContractAddress ? shortAddress(rodMintContractAddress) : "not set"}</strong>
                </div>
                <div>
                  <span>delivery</span>
                  <strong>ERC-721</strong>
                </div>
              </div>

              <div className="crypto-store-actions potion-shop-actions">
                <button
                  type="button"
                  disabled={busy || !canUseWalletPayment || walletOwnsRod || rodMintUnavailable}
                  onClick={() => void mintRod()}
                >
                  <Check size={16} />
                  {walletOwnsRod ? "owned" : rodMintMode === "url" ? "open mint" : "mint"}
                </button>
                {(walletMintTxHash || rodMintResult?.mintTxHash) && (
                  <a href={getOnchainFishingRodMintTxUrl(rodMintResult?.chainId || rodChainId, walletMintTxHash || rodMintResult?.mintTxHash || "")} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    tx
                  </a>
                )}
              </div>

              <p className="crypto-store-status">
                {status || (walletOwnsRod
                  ? "rod is in your wallet"
                  : canUseWalletPayment
                    ? rodMintMode === "wallet"
                      ? "mint from the rod contract"
                      : rodMintMode === "server"
                        ? "mint a test rod from Motherfisher"
                        : rodMintUrl ? "open the mint page" : "rod minting unavailable"
                    : "wallet character required")}
              </p>
            </>
          )}
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

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function getChainTxUrl(chainId: number, txHash: string) {
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
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

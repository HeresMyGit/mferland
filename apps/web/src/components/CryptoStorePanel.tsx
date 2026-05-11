import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Coins, Flame, Gem, PlugZap, RefreshCw, X } from "lucide-react";
import { useAccount } from "wagmi";
import {
  ITEMS,
  getChainGearItemId,
  type ClientRegisterChainGear,
  type NpcSnapshot,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { waitForTransactionReceipt, type EthereumProvider } from "../crypto/transactionReceipts";
import { ItemIcon } from "./hud/ItemIcon";

type CryptoStoreAddresses = {
  store: string;
  gear: string;
  pricing: string;
  mfer: string;
  mfergpt: string;
  launchPass: string;
};

type CryptoStoreChainConfig = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
};

type CryptoContractsDocument = {
  chainId?: number;
  chainName?: string;
  rpcUrl?: string;
  nativeCurrency?: Partial<CryptoStoreChainConfig["nativeCurrency"]>;
  generatedAt?: string;
  addresses?: Partial<CryptoStoreAddresses>;
};

type CryptoStorePanelProps = {
  npc: NpcSnapshot;
  onClose: () => void;
  onRegisterChainGear: (message: ClientRegisterChainGear) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

type CryptoStoreBalances = {
  eth: string;
  mfer: string;
  mfergpt: string;
  state: "idle" | "loading" | "ready" | "error";
  error: string;
};

type CryptoMarketQuote = {
  id: string;
  tokenSymbol: string;
  chainId: string;
  quoteSymbol: string;
  source: string;
  dexId: string;
  pairAddress: string;
  pairUrl: string;
  priceNative: string;
  priceUsd: string;
  liquidityUsd: string;
  volume24h: string;
  fetchedAt: string;
};

type CryptoMarketQuotesState = {
  quotes: CryptoMarketQuote[];
  state: "idle" | "loading" | "ready" | "error";
  error: string;
  refreshIntervalSeconds: number;
};

const CONTRACT_STORAGE_KEY = "mferland.cryptoStore.localContracts.v1";
const LOCAL_CONTRACT_CONFIG_URL = "/crypto/local-contracts.json";
const PRODUCTION_CONTRACT_CONFIG_URL = "/crypto/production-contracts.json";
const LOCAL_CHAIN_CONFIG: CryptoStoreChainConfig = {
  chainId: 31337,
  chainName: "mferland local",
  rpcUrl: "http://127.0.0.1:8545",
  nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
};
const LAUNCH_PASS_LABEL = "Season 0 pass";
const STORE_GEAR_COLLECTION = [
  { gearType: 1, label: "posted-up deck", ethPrice: "0.01", mferPriceLabel: "90", mferGptPriceLabel: "75" },
  { gearType: 2, label: "posted-up laptop lid", ethPrice: "0.012", mferPriceLabel: "112.5", mferGptPriceLabel: "93.75" },
  { gearType: 3, label: "last-cig lighter", ethPrice: "0.0069", mferPriceLabel: "62.1", mferGptPriceLabel: "51.75" },
] as const;
const DEFAULT_STORE_GEAR = STORE_GEAR_COLLECTION[0];
const SELECTORS = {
  approve: "0x095ea7b3",
  balanceOf: "0x70a08231",
  buyWithEth: "0x91b019a6",
  buyWithMfer: "0x15fcdaba",
  buyWithMferGpt: "0xa461584e",
  discountedTokenPrice: "0xbb6505a5",
  gearEthPrice: "0xd0bccbd2",
  ethPrice: "0xff186b2e",
  mferPrice: "0x4c3071ae",
  mferGptPrice: "0x4774d971",
  mintPassWithEth: "0x0ad641f1",
  mintPassWithMfer: "0xeb0660cf",
  mintPassWithMferGpt: "0x61ee044c",
};
const GEAR_PURCHASED_TOPIC = "0xe90bb5970d4f1919d67686ba913696996929bafae6e827c0a61589d8e057e099";
const PASS_PURCHASED_TOPIC = "0xe738688c345ae6b52b7f5e8326f8ef036091302ba7a58f7a9a081d737e29a973";
const DISCOUNT_BPS = {
  mfer: 1000n,
  mfergpt: 2500n,
};
const EMPTY_ADDRESSES: CryptoStoreAddresses = {
  store: "",
  gear: "",
  pricing: "",
  mfer: "",
  mfergpt: "",
  launchPass: "",
};
const EMPTY_BALANCES: CryptoStoreBalances = {
  eth: "--",
  mfer: "--",
  mfergpt: "--",
  state: "idle",
  error: "",
};
const EMPTY_MARKET_QUOTES: CryptoMarketQuotesState = {
  quotes: [],
  state: "idle",
  error: "",
  refreshIntervalSeconds: 21600,
};
const MARKET_QUOTE_UI_REFRESH_MS = 60_000;

export function CryptoStorePanel({ npc, onClose, onRegisterChainGear, onAnalyticsEvent }: CryptoStorePanelProps) {
  const wagmiAccount = useAccount();
  const [addresses, setAddresses] = useState<CryptoStoreAddresses>(() => readStoredAddresses());
  const [chainConfig, setChainConfig] = useState<CryptoStoreChainConfig>(LOCAL_CHAIN_CONFIG);
  const [account, setAccount] = useState(() => wagmiAccount.address ?? "");
  const [gearType, setGearType] = useState<string>(String(DEFAULT_STORE_GEAR.gearType));
  const [ethPrice, setEthPrice] = useState<string>(DEFAULT_STORE_GEAR.ethPrice);
  const [launchPassTokenId, setLaunchPassTokenId] = useState("");
  const [status, setStatus] = useState("loading local contracts");
  const [isBusy, setIsBusy] = useState(false);
  const [balances, setBalances] = useState<CryptoStoreBalances>(EMPTY_BALANCES);
  const [marketQuotes, setMarketQuotes] = useState<CryptoMarketQuotesState>(EMPTY_MARKET_QUOTES);
  const [showContractConfig, setShowContractConfig] = useState(false);
  const shortAccount = useMemo(() => account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "not connected", [account]);
  const chainIdHex = useMemo(() => toChainIdHex(chainConfig.chainId), [chainConfig.chainId]);
  const selectedStoreGear = useMemo(
    () => STORE_GEAR_COLLECTION.find((gear) => String(gear.gearType) === gearType) ?? null,
    [gearType],
  );
  const selectedStoreGearItemId = useMemo(() => {
    const parsedGearType = Number(gearType);
    return Number.isInteger(parsedGearType) ? getChainGearItemId(parsedGearType) : null;
  }, [gearType]);
  const configuredContractCount = useMemo(() => Object.values(addresses).filter(isAddress).length, [addresses]);
  const mferQuote = useMemo(() => findMarketQuote(marketQuotes.quotes, "$mfer"), [marketQuotes.quotes]);
  const mferGptQuote = useMemo(() => findMarketQuote(marketQuotes.quotes, "MFERGPT"), [marketQuotes.quotes]);

  useEffect(() => {
    if (wagmiAccount.address) setAccount(wagmiAccount.address);
  }, [wagmiAccount.address]);

  useEffect(() => {
    const abortController = new AbortController();
    void fetchLocalContractAddresses(abortController.signal)
      .then((generated) => {
        if (abortController.signal.aborted) return;
        if (generated) {
          setAddresses(generated.addresses);
          setChainConfig(generated.chainConfig);
          setStatus(`loaded contracts from ${generated.configUrl}${generated.generatedAt ? ` at ${new Date(generated.generatedAt).toLocaleTimeString()}` : ""}`);
        } else {
          setStatus(getMissingConfigStatus());
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) setStatus(getMissingConfigStatus());
      });

    void getEthereum()?.request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && typeof accounts[0] === "string") setAccount(accounts[0]);
      })
      .catch(() => undefined);

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  useEffect(() => {
    void refreshBalances();
  }, [account, wagmiAccount.address, addresses.mfer, addresses.mfergpt, chainConfig.chainId]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    async function loadQuotes() {
      setMarketQuotes((current) => ({ ...current, state: current.state === "idle" ? "loading" : current.state, error: "" }));
      try {
        const response = await fetch(`${getServerHttpBaseUrl()}/crypto/market-quotes`, { cache: "no-store" });
        const payload = await response.json() as Partial<CryptoMarketQuotesState & { ok: boolean }>;
        if (!response.ok || payload.ok === false) throw new Error(payload.error || "market cache offline");
        if (disposed) return;
        setMarketQuotes({
          quotes: Array.isArray(payload.quotes) ? payload.quotes.filter(isMarketQuote) : [],
          state: "ready",
          error: "",
          refreshIntervalSeconds: Number.isFinite(payload.refreshIntervalSeconds)
            ? Number(payload.refreshIntervalSeconds)
            : EMPTY_MARKET_QUOTES.refreshIntervalSeconds,
        });
      } catch (error) {
        if (!disposed) {
          setMarketQuotes((current) => ({
            ...current,
            state: "error",
            error: getErrorMessage(error),
          }));
        }
      }
    }

    void loadQuotes();
    timer = window.setInterval(() => void loadQuotes(), MARKET_QUOTE_UI_REFRESH_MS);

    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  function updateAddress(key: keyof CryptoStoreAddresses, value: string) {
    setAddresses((current) => ({ ...current, [key]: value.trim() }));
  }

  function selectStoreGear(gear: typeof STORE_GEAR_COLLECTION[number]) {
    setGearType(String(gear.gearType));
    setEthPrice(gear.ethPrice);
  }

  async function runAction(label: string, action: () => Promise<string | void>) {
    setIsBusy(true);
    setStatus(`${label}...`);
    try {
      const refreshedAccount = await action();
      setStatus(`${label} confirmed`);
      void refreshBalances(typeof refreshedAccount === "string" ? refreshedAccount : undefined);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function runTrackedAction({
    label,
    startedEvent,
    confirmedEvent,
    failedEvent,
    properties,
    action,
  }: {
    label: string;
    startedEvent: string;
    confirmedEvent: string;
    failedEvent: string;
    properties: AnalyticsProperties;
    action: () => Promise<string | void>;
  }) {
    reportAnalytics(startedEvent, properties);
    await runAction(label, async () => {
      try {
        const result = await action();
        reportAnalytics(confirmedEvent, properties);
        return result;
      } catch (error) {
        reportAnalytics(failedEvent, {
          ...properties,
          error: getAnalyticsErrorMessage(error),
        });
        throw error;
      }
    });
  }

  function reportAnalytics(eventType: string, properties: AnalyticsProperties = {}) {
    const cleanProperties = sanitizeCryptoAnalyticsProperties({
      npcId: npc.id,
      chainId: chainConfig.chainId,
      ...properties,
    });
    trackEvent(eventType, cleanProperties);
    onAnalyticsEvent?.(eventType, cleanProperties);
  }

  async function refreshBalances(accountOverride?: string) {
    const wallet = accountOverride || account || wagmiAccount.address || "";
    if (!isAddress(wallet)) {
      setBalances(EMPTY_BALANCES);
      return;
    }

    const provider = getProviderForAccount(wallet, chainConfig.chainId);
    if (!provider) {
      setBalances({ ...EMPTY_BALANCES, state: "error", error: "connect wallet" });
      return;
    }

    setBalances((current) => ({ ...current, state: "loading", error: "" }));
    try {
      const chainId = await provider.request({ method: "eth_chainId" });
      if (chainId !== chainIdHex) {
        setBalances({ ...EMPTY_BALANCES, state: "error", error: `switch to ${chainConfig.chainName}` });
        return;
      }

      const [ethBalance, mferBalance, mferGptBalance] = await Promise.all([
        readNativeBalance(provider, wallet),
        isAddress(addresses.mfer) ? readTokenBalance(provider, addresses.mfer, wallet) : Promise.resolve(null),
        isAddress(addresses.mfergpt) ? readTokenBalance(provider, addresses.mfergpt, wallet) : Promise.resolve(null),
      ]);
      setBalances({
        eth: formatUnits(ethBalance),
        mfer: mferBalance === null ? "--" : formatUnits(mferBalance),
        mfergpt: mferGptBalance === null ? "--" : formatUnits(mferGptBalance),
        state: "ready",
        error: "",
      });
    } catch (error) {
      setBalances({ ...EMPTY_BALANCES, state: "error", error: getErrorMessage(error) });
    }
  }

  async function connectWallet() {
    await runTrackedAction({
      label: "connecting wallet",
      startedEvent: "wallet_connect_started",
      confirmedEvent: "wallet_connect_succeeded",
      failedEvent: "wallet_connect_failed",
      properties: { surface: "crypto_store" },
      action: async () => {
      const provider = requireProviderForAccount(account || wagmiAccount.address || "", chainConfig.chainId);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const nextAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
      if (nextAccount) setAccount(nextAccount);
      await switchToConfiguredChain(provider, chainConfig);
      return nextAccount;
      },
    });
  }

  async function buyWithEth() {
    const purchaseProperties = getGearPurchaseAnalyticsProperties("ETH", gearType);
    await runTrackedAction({
      label: "buying with ETH",
      startedEvent: "gear_purchase_started",
      confirmedEvent: "gear_purchase_confirmed",
      failedEvent: "gear_purchase_failed",
      properties: purchaseProperties,
      action: async () => {
      const provider = await prepareWallet(["store"]);
      const purchasedGearType = parseGearType(gearType);
      const price = await readUint(provider, addresses.store, callData(SELECTORS.gearEthPrice, encodeUint(purchasedGearType)));
      const receipt = await sendTransaction(provider, addresses.store, callData(SELECTORS.buyWithEth, encodeUint(purchasedGearType)), price);
      registerMintedGear(receipt, purchasedGearType);
      },
    });
  }

  async function buyWithMfer() {
    const purchaseProperties = getGearPurchaseAnalyticsProperties("MFER", gearType);
    await runTrackedAction({
      label: "buying with $mfer",
      startedEvent: "gear_purchase_started",
      confirmedEvent: "gear_purchase_confirmed",
      failedEvent: "gear_purchase_failed",
      properties: purchaseProperties,
      action: async () => {
      const provider = await prepareWallet(["store", "mfer"]);
      const purchasedGearType = parseGearType(gearType);
      const price = await readUint(provider, addresses.store, callData(
        SELECTORS.discountedTokenPrice,
        encodeUint(purchasedGearType),
        encodeUint(DISCOUNT_BPS.mfer),
      ));
      await approve(provider, addresses.mfer, addresses.store, price);
      const receipt = await sendTransaction(
        provider,
        addresses.store,
        callData(SELECTORS.buyWithMfer, encodeUint(purchasedGearType), encodeUint(price)),
      );
      registerMintedGear(receipt, purchasedGearType);
      },
    });
  }

  async function buyWithMferGpt() {
    const purchaseProperties = getGearPurchaseAnalyticsProperties("MFERGPT", gearType);
    await runTrackedAction({
      label: "buying with $mfergpt",
      startedEvent: "gear_purchase_started",
      confirmedEvent: "gear_purchase_confirmed",
      failedEvent: "gear_purchase_failed",
      properties: purchaseProperties,
      action: async () => {
      const provider = await prepareWallet(["store", "mfergpt"]);
      const purchasedGearType = parseGearType(gearType);
      const price = await readUint(provider, addresses.store, callData(
        SELECTORS.discountedTokenPrice,
        encodeUint(purchasedGearType),
        encodeUint(DISCOUNT_BPS.mfergpt),
      ));
      await approve(provider, addresses.mfergpt, addresses.store, price);
      const receipt = await sendTransaction(
        provider,
        addresses.store,
        callData(SELECTORS.buyWithMferGpt, encodeUint(purchasedGearType), encodeUint(price)),
      );
      registerMintedGear(receipt, purchasedGearType);
      },
    });
  }

  async function buyLaunchPassWithEth() {
    await runTrackedAction({
      label: "buying launch pass with ETH",
      startedEvent: "pass_purchase_started",
      confirmedEvent: "pass_purchase_confirmed",
      failedEvent: "pass_purchase_failed",
      properties: getPassPurchaseAnalyticsProperties("ETH"),
      action: async () => {
      const provider = await prepareWallet(["launchPass"]);
      const price = await readUint(provider, addresses.launchPass, callData(SELECTORS.ethPrice));
      const receipt = await sendTransaction(provider, addresses.launchPass, callData(SELECTORS.mintPassWithEth), price);
      registerMintedLaunchPass(receipt);
      },
    });
  }

  async function buyLaunchPassWithMfer() {
    await runTrackedAction({
      label: "buying launch pass with $mfer",
      startedEvent: "pass_purchase_started",
      confirmedEvent: "pass_purchase_confirmed",
      failedEvent: "pass_purchase_failed",
      properties: getPassPurchaseAnalyticsProperties("MFER"),
      action: async () => {
      const provider = await prepareWallet(["launchPass", "mfer"]);
      const price = await readUint(provider, addresses.launchPass, callData(SELECTORS.mferPrice));
      await approve(provider, addresses.mfer, addresses.launchPass, price);
      const receipt = await sendTransaction(
        provider,
        addresses.launchPass,
        callData(SELECTORS.mintPassWithMfer, encodeUint(price)),
      );
      registerMintedLaunchPass(receipt);
      },
    });
  }

  async function buyLaunchPassWithMferGpt() {
    await runTrackedAction({
      label: "buying launch pass with $mfergpt",
      startedEvent: "pass_purchase_started",
      confirmedEvent: "pass_purchase_confirmed",
      failedEvent: "pass_purchase_failed",
      properties: getPassPurchaseAnalyticsProperties("MFERGPT"),
      action: async () => {
      const provider = await prepareWallet(["launchPass", "mfergpt"]);
      const price = await readUint(provider, addresses.launchPass, callData(SELECTORS.mferGptPrice));
      await approve(provider, addresses.mfergpt, addresses.launchPass, price);
      const receipt = await sendTransaction(
        provider,
        addresses.launchPass,
        callData(SELECTORS.mintPassWithMferGpt, encodeUint(price)),
      );
      registerMintedLaunchPass(receipt);
      },
    });
  }

  function registerMintedGear(receipt: unknown, purchasedGearType: number) {
    const tokenId = extractPurchasedGearTokenId(receipt, addresses.store);
    if (tokenId === null) return;
    const tokenIdText = tokenId.toString();
    onRegisterChainGear({
      gearType: purchasedGearType,
      tokenId: tokenIdText,
      txHash: extractReceiptTransactionHash(receipt),
    });
  }

  function registerMintedLaunchPass(receipt: unknown) {
    const tokenId = extractPurchasedTokenId(receipt, addresses.launchPass, PASS_PURCHASED_TOPIC, 2);
    if (tokenId === null) return;
    setLaunchPassTokenId(tokenId.toString());
  }

  async function prepareWallet(requiredAddresses: Array<keyof CryptoStoreAddresses>) {
    validateAddresses(addresses, requiredAddresses);
    const provider = requireProviderForAccount(account || wagmiAccount.address || "", chainConfig.chainId);
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (Array.isArray(accounts) && typeof accounts[0] === "string") setAccount(accounts[0]);
    await switchToConfiguredChain(provider, chainConfig);
    return provider;
  }

  return (
    <div className="crypto-store-panel">
      <div className="world-map-header">
        <div>
          <strong>{npc.name}</strong>
          <span>crypto store</span>
        </div>
        <button type="button" title="Close store" aria-label="Close store" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="crypto-store-overview">
        <div className="crypto-store-account">
          <span>{chainConfig.chainName} {chainConfig.chainId}</span>
          <code>{shortAccount}</code>
          <button type="button" disabled={isBusy} onClick={() => void connectWallet()}>
            <PlugZap size={16} />
            connect
          </button>
        </div>

        <div className="crypto-store-balances" aria-label="wallet balances">
          <div className="crypto-store-balances-head">
            <span>wallet balances</span>
            <button
              type="button"
              title="Refresh balances"
              aria-label="Refresh balances"
              disabled={isBusy || balances.state === "loading"}
              onClick={() => void refreshBalances()}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="crypto-store-balance-grid">
            <div>
              <span>ETH</span>
              <strong>{balances.eth}</strong>
            </div>
            <div>
              <span>$mfer</span>
              <strong>{balances.mfer}</strong>
            </div>
            <div>
              <span>$mfergpt</span>
              <strong>{balances.mfergpt}</strong>
            </div>
          </div>
          {balances.state === "error" && balances.error ? <em>{balances.error}</em> : null}
        </div>
      </div>

      <div className="crypto-store-flow-grid">
        <section className="crypto-store-flow crypto-pass-flow" aria-label="launch pass">
          <div className="crypto-store-flow-head">
            <div>
              <strong>{LAUNCH_PASS_LABEL}</strong>
              <span>contract price / pass id {launchPassTokenId || "--"}</span>
            </div>
          </div>

          <div className="crypto-store-actions crypto-pass-actions">
            <button type="button" disabled={isBusy} onClick={() => void buyLaunchPassWithEth()}>
              <Gem size={16} />
              mint ETH
            </button>
            <button type="button" disabled={isBusy} onClick={() => void buyLaunchPassWithMfer()}>
              <Coins size={16} />
              mint $mfer
            </button>
            <button type="button" disabled={isBusy} onClick={() => void buyLaunchPassWithMferGpt()}>
              <Flame size={16} />
              mint $mfergpt
            </button>
          </div>
        </section>

        <section className="crypto-store-flow crypto-gear-flow" aria-label="gear purchase">
          <div className="crypto-store-flow-head">
            <div className="crypto-store-gear-heading">
              {selectedStoreGearItemId ? <ItemIcon itemId={selectedStoreGearItemId} /> : null}
              <div>
                <strong>{selectedStoreGearItemId ? ITEMS[selectedStoreGearItemId].name : selectedStoreGear?.label ?? "custom gear"}</strong>
                <span>gear type {gearType} / {ethPrice} ETH / token prices from pricing contract</span>
              </div>
            </div>
          </div>

          <div className="crypto-store-collection" aria-label="gear collection">
            {STORE_GEAR_COLLECTION.map((gear) => {
              const itemId = getChainGearItemId(gear.gearType);
              const itemName = itemId ? ITEMS[itemId].name : gear.label;
              const isSelected = String(gear.gearType) === gearType;

              return (
                <button
                  key={gear.gearType}
                  type="button"
                  className={isSelected ? "selected" : undefined}
                  title={itemName}
                  aria-label={`${itemName}, ${gear.ethPrice} ETH, ${gear.mferPriceLabel} mfer, ${gear.mferGptPriceLabel} mfergpt`}
                  aria-pressed={isSelected}
                  disabled={isBusy}
                  onClick={() => selectStoreGear(gear)}
                >
                  {itemId ? <ItemIcon itemId={itemId} /> : null}
                  <span>{gear.ethPrice} ETH</span>
                  <em>{gear.mferPriceLabel} / {gear.mferGptPriceLabel}</em>
                </button>
              );
            })}
          </div>

          <div className="crypto-store-item">
            <div className="crypto-store-gear-heading">
              {selectedStoreGearItemId ? <ItemIcon itemId={selectedStoreGearItemId} /> : null}
              <div>
                <strong>gear checkout</strong>
                <span>selected {selectedStoreGearItemId ? ITEMS[selectedStoreGearItemId].name : selectedStoreGear?.label ?? "custom gear"}</span>
              </div>
            </div>
            <label>
              <span>gear</span>
              <input aria-label="gear" value={gearType} inputMode="numeric" onChange={(event) => setGearType(event.target.value)} />
            </label>
            <label>
              <span>ETH</span>
              <input aria-label="ETH" value={ethPrice} inputMode="decimal" readOnly />
            </label>
          </div>

          <div className="crypto-store-actions">
            <button type="button" disabled={isBusy} onClick={() => void buyWithEth()}>
              <Gem size={16} />
              buy ETH
            </button>
            <button type="button" disabled={isBusy} onClick={() => void buyWithMfer()}>
              <Coins size={16} />
              buy $mfer -10%
            </button>
            <button type="button" disabled={isBusy} onClick={() => void buyWithMferGpt()}>
              <Flame size={16} />
              buy $mfergpt -25%
            </button>
          </div>
        </section>

        <section className="crypto-store-flow crypto-market-flow" aria-label="market quotes">
          <div className="crypto-store-flow-head">
            <div>
              <strong>market</strong>
              <span>cached quotes</span>
            </div>
          </div>
          <div className="crypto-market-quotes">
            <div>
              <span>$mfer/WETH</span>
              <strong>{formatMarketQuote(mferQuote)}</strong>
              <em>{formatMarketQuoteMeta(mferQuote, marketQuotes)}</em>
            </div>
            <div>
              <span>MFERGPT/WETH</span>
              <strong>{formatMarketQuote(mferGptQuote)}</strong>
              <em>{formatMarketQuoteMeta(mferGptQuote, marketQuotes)}</em>
            </div>
          </div>
        </section>
      </div>

      <div className="crypto-store-contracts">
        <button
          type="button"
          className="crypto-store-contract-toggle"
          aria-expanded={showContractConfig}
          onClick={() => setShowContractConfig((current) => !current)}
        >
          {showContractConfig ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>contract addresses</span>
          <strong>{configuredContractCount}/6</strong>
        </button>
        {showContractConfig ? (
          <div className="crypto-store-config">
            <label>
              <span>store</span>
              <input aria-label="store" value={addresses.store} placeholder="0x..." onChange={(event) => updateAddress("store", event.target.value)} />
            </label>
            <label>
              <span>gear nft</span>
              <input aria-label="gear nft" value={addresses.gear} placeholder="0x..." onChange={(event) => updateAddress("gear", event.target.value)} />
            </label>
            <label>
              <span>pricing</span>
              <input aria-label="pricing" value={addresses.pricing} placeholder="0x..." onChange={(event) => updateAddress("pricing", event.target.value)} />
            </label>
            <label>
              <span>$mfer</span>
              <input aria-label="$mfer" value={addresses.mfer} placeholder="0x..." onChange={(event) => updateAddress("mfer", event.target.value)} />
            </label>
            <label>
              <span>$mfergpt</span>
              <input aria-label="$mfergpt" value={addresses.mfergpt} placeholder="0x..." onChange={(event) => updateAddress("mfergpt", event.target.value)} />
            </label>
            <label>
              <span>launch pass</span>
              <input aria-label="launch pass" value={addresses.launchPass} placeholder="0x..." onChange={(event) => updateAddress("launchPass", event.target.value)} />
            </label>
          </div>
        ) : null}
      </div>

      <p className="crypto-store-status">{status}</p>
    </div>
  );
}

function readStoredAddresses(): CryptoStoreAddresses {
  try {
    const stored = window.localStorage.getItem(CONTRACT_STORAGE_KEY);
    if (!stored) return EMPTY_ADDRESSES;
    const parsed = JSON.parse(stored) as Partial<CryptoStoreAddresses>;
    return {
      store: typeof parsed.store === "string" ? parsed.store : "",
      gear: typeof parsed.gear === "string" ? parsed.gear : "",
      pricing: typeof parsed.pricing === "string" ? parsed.pricing : "",
      mfer: typeof parsed.mfer === "string" ? parsed.mfer : "",
      mfergpt: typeof parsed.mfergpt === "string" ? parsed.mfergpt : "",
      launchPass: typeof parsed.launchPass === "string" ? parsed.launchPass : "",
    };
  } catch {
    return EMPTY_ADDRESSES;
  }
}

async function fetchLocalContractAddresses(signal: AbortSignal): Promise<{ addresses: CryptoStoreAddresses; chainConfig: CryptoStoreChainConfig; configUrl: string; generatedAt?: string } | null> {
  const configUrl = getContractConfigUrl();
  const response = await fetch(`${configUrl}?t=${Date.now()}`, { signal, cache: "no-store" });
  if (!response.ok) return null;
  const document = await response.json() as CryptoContractsDocument;
  const addresses = document.addresses;
  if (!addresses) return null;
  const generated = {
    store: typeof addresses.store === "string" ? addresses.store : "",
    gear: typeof addresses.gear === "string" ? addresses.gear : "",
    pricing: typeof addresses.pricing === "string" ? addresses.pricing : "",
    mfer: typeof addresses.mfer === "string" ? addresses.mfer : "",
    mfergpt: typeof addresses.mfergpt === "string" ? addresses.mfergpt : "",
    launchPass: typeof addresses.launchPass === "string" ? addresses.launchPass : "",
  };
  if (!isUsableContractConfig(generated)) return null;
  return {
    addresses: generated,
    chainConfig: parseChainConfig(document),
    configUrl,
    generatedAt: document.generatedAt,
  };
}

function getContractConfigUrl() {
  const configured = import.meta.env.VITE_CRYPTO_CONTRACTS_URL;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return import.meta.env.PROD ? PRODUCTION_CONTRACT_CONFIG_URL : LOCAL_CONTRACT_CONFIG_URL;
}

function getMissingConfigStatus() {
  return import.meta.env.PROD
    ? `add production contract config at ${getContractConfigUrl()}`
    : "run npm run chain:deploy:local to prefill contracts";
}

function parseChainConfig(document: CryptoContractsDocument): CryptoStoreChainConfig {
  const chainId = Number.isInteger(document.chainId) && Number(document.chainId) > 0
    ? Number(document.chainId)
    : LOCAL_CHAIN_CONFIG.chainId;
  const nativeCurrency = document.nativeCurrency ?? {};
  return {
    chainId,
    chainName: typeof document.chainName === "string" && document.chainName.trim()
      ? document.chainName.trim()
      : chainId === LOCAL_CHAIN_CONFIG.chainId ? LOCAL_CHAIN_CONFIG.chainName : `chain ${chainId}`,
    rpcUrl: typeof document.rpcUrl === "string" ? document.rpcUrl.trim() : "",
    nativeCurrency: {
      name: typeof nativeCurrency.name === "string" && nativeCurrency.name.trim() ? nativeCurrency.name.trim() : "Ether",
      symbol: typeof nativeCurrency.symbol === "string" && nativeCurrency.symbol.trim() ? nativeCurrency.symbol.trim() : "ETH",
      decimals: Number.isInteger(nativeCurrency.decimals) && Number(nativeCurrency.decimals) > 0 ? Number(nativeCurrency.decimals) : 18,
    },
  };
}

function isUsableContractConfig(addresses: CryptoStoreAddresses) {
  if (!isAddress(addresses.launchPass) || !isAddress(addresses.pricing) || !isAddress(addresses.mfer) || !isAddress(addresses.mfergpt)) return false;
  return Object.values(addresses).every((address) => address === "" || isAddress(address));
}

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as Window & { ethereum?: Partial<EthereumProvider> };
  return typeof maybeWindow.ethereum?.request === "function" ? maybeWindow.ethereum as EthereumProvider : null;
}

function getProviderForAccount(account: string, chainId: number): EthereumProvider | null {
  return getEthereum() ?? getLocalAnvilProvider(account, chainId);
}

function requireProviderForAccount(account: string, chainId: number) {
  const provider = getProviderForAccount(account, chainId);
  if (!provider) throw new Error("No wallet found");
  return provider;
}

function getLocalAnvilProvider(account: string, chainId: number): EthereumProvider | null {
  if (!import.meta.env.DEV || chainId !== LOCAL_CHAIN_CONFIG.chainId || !isAddress(account)) return null;
  return {
    async request({ method, params = [] }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return toChainIdHex(LOCAL_CHAIN_CONFIG.chainId);
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      return requestLocalAnvil(method, params);
    },
  };
}

async function requestLocalAnvil(method: string, params: unknown[]) {
  const response = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
  return payload.result;
}

async function switchToConfiguredChain(provider: EthereumProvider, chainConfig: CryptoStoreChainConfig) {
  const chainId = toChainIdHex(chainConfig.chainId);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    if (!chainConfig.rpcUrl) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: chainConfig.chainName,
        nativeCurrency: chainConfig.nativeCurrency,
        rpcUrls: [chainConfig.rpcUrl],
      }],
    });
  }
}

async function approve(provider: EthereumProvider, tokenAddress: string, spender: string, amount: bigint) {
  await sendTransaction(provider, tokenAddress, callData(SELECTORS.approve, encodeAddress(spender), encodeUint(amount)));
}

async function sendTransaction(provider: EthereumProvider, to: string, data: string, value = 0n) {
  if (!isAddress(to)) throw new Error("Contract address missing");
  const accounts = await provider.request({ method: "eth_accounts" });
  const from = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!from) throw new Error("Wallet not connected");
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data, value: toHex(value) }],
  });
  if (typeof txHash !== "string") throw new Error("Transaction failed");
  return waitForTransactionReceipt(provider, txHash);
}

async function readUint(provider: EthereumProvider, to: string, data: string) {
  if (!isAddress(to)) throw new Error("Store address missing");
  const result = await provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  if (typeof result !== "string") throw new Error("Read failed");
  return BigInt(result);
}

async function readNativeBalance(provider: EthereumProvider, account: string) {
  const result = await provider.request({ method: "eth_getBalance", params: [account, "latest"] });
  if (typeof result !== "string") throw new Error("ETH balance read failed");
  return BigInt(result);
}

async function readTokenBalance(provider: EthereumProvider, tokenAddress: string, account: string) {
  if (!isAddress(tokenAddress)) throw new Error("Token address missing");
  return readUint(provider, tokenAddress, callData(SELECTORS.balanceOf, encodeAddress(account)));
}

function validateAddresses(addresses: CryptoStoreAddresses, requiredAddresses: Array<keyof CryptoStoreAddresses>) {
  for (const label of requiredAddresses) {
    const address = addresses[label];
    if (!isAddress(address)) throw new Error(`${label} address missing`);
  }
}

function extractPurchasedGearTokenId(receipt: unknown, storeAddress: string) {
  return extractPurchasedTokenId(receipt, storeAddress, GEAR_PURCHASED_TOPIC, 3);
}

function extractPurchasedTokenId(receipt: unknown, contractAddress: string, eventTopic: string, tokenTopicIndex: number) {
  if (!receipt || typeof receipt !== "object" || !("logs" in receipt) || !Array.isArray(receipt.logs)) return null;
  const normalizedContract = contractAddress.toLowerCase();

  for (const log of receipt.logs) {
    if (!log || typeof log !== "object") continue;
    const entry = log as { address?: unknown; topics?: unknown };
    if (typeof entry.address !== "string" || entry.address.toLowerCase() !== normalizedContract) continue;
    if (!Array.isArray(entry.topics) || entry.topics.length <= tokenTopicIndex) continue;
    const topic = entry.topics[0];
    const tokenTopic = entry.topics[tokenTopicIndex];
    if (typeof topic !== "string" || topic.toLowerCase() !== eventTopic) continue;
    if (typeof tokenTopic !== "string") continue;
    return BigInt(tokenTopic);
  }

  return null;
}

function extractReceiptTransactionHash(receipt: unknown) {
  if (!receipt || typeof receipt !== "object") return "";
  const hash = (receipt as { transactionHash?: unknown }).transactionHash;
  return typeof hash === "string" ? hash : "";
}

function parseGearType(value: string) {
  const gearType = Number(value);
  if (!Number.isInteger(gearType) || gearType <= 0) throw new Error("Gear type missing");
  return gearType;
}

function callData(selector: string, ...args: string[]) {
  return `${selector}${args.join("")}`;
}

function encodeAddress(address: string) {
  if (!isAddress(address)) throw new Error("Address missing");
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUint(value: string | number | bigint) {
  const parsed = typeof value === "bigint" ? value : BigInt(value || "0");
  return parsed.toString(16).padStart(64, "0");
}

function formatUnits(value: bigint, decimals = 18, maxFractionDigits = 4) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n || maxFractionDigits <= 0) return whole.toString();

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function toHex(value: bigint) {
  return `0x${value.toString(16)}`;
}

function toChainIdHex(chainId: number) {
  return `0x${Math.max(1, Math.floor(chainId)).toString(16)}`;
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown };
  return maybeError.code === 4902 || isUnknownChainError(maybeError.cause);
}

function getServerHttpBaseUrl() {
  const configured = String(import.meta.env.VITE_SERVER_URL ?? "").trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "ws:") url.protocol = "http:";
      if (url.protocol === "wss:") url.protocol = "https:";
      return url.origin;
    } catch {
      return configured.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
    }
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  if (isLocalDevWebHost(window.location.hostname, window.location.port)) {
    return `${protocol}://${window.location.hostname}:2567`;
  }
  return `${protocol}://${window.location.host}`;
}

function isLocalDevWebHost(hostname: string, port: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) && port !== "2567";
}

function findMarketQuote(quotes: CryptoMarketQuote[], tokenSymbol: string) {
  const normalized = tokenSymbol.toUpperCase();
  return quotes.find((quote) => quote.tokenSymbol.toUpperCase() === normalized) ?? null;
}

function isMarketQuote(value: unknown): value is CryptoMarketQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<CryptoMarketQuote>;
  return (
    typeof quote.id === "string"
    && typeof quote.tokenSymbol === "string"
    && typeof quote.chainId === "string"
    && typeof quote.quoteSymbol === "string"
    && typeof quote.source === "string"
    && typeof quote.dexId === "string"
    && typeof quote.pairAddress === "string"
    && typeof quote.pairUrl === "string"
    && typeof quote.priceNative === "string"
    && typeof quote.priceUsd === "string"
    && typeof quote.liquidityUsd === "string"
    && typeof quote.volume24h === "string"
    && typeof quote.fetchedAt === "string"
  );
}

function formatMarketQuote(quote: CryptoMarketQuote | null) {
  if (!quote) return "--";
  const native = formatDecimal(quote.priceNative);
  const usd = quote.priceUsd ? ` / $${formatDecimal(quote.priceUsd)}` : "";
  const quoteSymbol = quote.quoteSymbol === "WETH" ? "ETH" : quote.quoteSymbol;
  return `${native} ${quoteSymbol}${usd}`;
}

function formatMarketQuoteMeta(quote: CryptoMarketQuote | null, state: CryptoMarketQuotesState) {
  if (!quote) return state.state === "error" ? state.error : "waiting";
  const age = formatQuoteAge(quote.fetchedAt);
  const liquidity = quote.liquidityUsd ? `liq $${formatDecimal(quote.liquidityUsd)}` : "liq --";
  return `${quote.dexId || quote.source} / ${age} / ${liquidity}`;
}

function formatQuoteAge(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "stale";
  const ageMs = Math.max(0, Date.now() - timestamp);
  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMinutes < 1) return "now";
  if (ageMinutes < 90) return `${ageMinutes}m`;
  const ageHours = Math.floor(ageMinutes / 60);
  return `${ageHours}h`;
}

function formatDecimal(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  if (parsed === 0) return "0";
  if (Math.abs(parsed) < 0.000001) return parsed.toExponential(3);
  return parsed.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "wallet action failed";
}

function getGearPurchaseAnalyticsProperties(paymentToken: string, gearTypeText: string): AnalyticsProperties {
  const gearTypeNumber = Number(gearTypeText);
  const gear = STORE_GEAR_COLLECTION.find((entry) => entry.gearType === gearTypeNumber);
  return {
    product: "chain-gear",
    paymentToken,
    gearType: Number.isInteger(gearTypeNumber) ? gearTypeNumber : 0,
    gearLabel: gear?.label ?? "custom gear",
  };
}

function getPassPurchaseAnalyticsProperties(paymentToken: string): AnalyticsProperties {
  return {
    product: "season0-pass",
    paymentToken,
  };
}

function sanitizeCryptoAnalyticsProperties(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_:-]{0,63}$/.test(key)) continue;
    if (typeof value === "string") result[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

function getAnalyticsErrorMessage(error: unknown) {
  return getErrorMessage(error)
    .replaceAll(/0x[a-fA-F0-9]{8,}/g, "0x...")
    .slice(0, 120);
}

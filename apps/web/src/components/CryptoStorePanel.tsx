import { useEffect, useMemo, useState } from "react";
import { Coins, Flame, Gem, PlugZap, RefreshCw, X } from "lucide-react";
import { useAccount } from "wagmi";
import {
  EQUIPMENT_SLOTS,
  ITEMS,
  STAT_LABELS,
  TRAIT_CHANGE_BASE_CHAIN_ID,
  TRAIT_CHANGE_BASE_RPC_URL,
  getChainGearItemId,
  getItemEquipment,
  getItemHeirloomStatsPerLevel,
  normalizeItemLevel,
  type ClientRegisterChainGear,
  type NpcSnapshot,
} from "@mferland/shared";
import { trackEvent, type AnalyticsProperties } from "../analytics";
import { formatCompactTokenAmount, formatReadableDecimal } from "../crypto/displayAmounts";
import { waitForTransactionReceipt, type EthereumProvider } from "../crypto/transactionReceipts";
import { ItemIcon } from "./hud/ItemIcon";
import { formatTooltipLabel } from "./hud/utils";

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
  playerLevel?: number;
  onClose: () => void;
  onRegisterChainGear: (message: ClientRegisterChainGear) => void;
  onAnalyticsEvent?: (eventType: string, properties?: Record<string, string | number | boolean | null>) => void;
};

type CryptoStoreBalances = {
  eth: string;
  mfer: string;
  mfergpt: string;
  launchPass: string;
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

type CryptoProductPrice = {
  eth: string;
  mfer: string;
  mfergpt: string;
};

type CryptoContractPricesState = {
  pass: CryptoProductPrice | null;
  gearByType: Record<string, CryptoProductPrice>;
  state: "idle" | "loading" | "ready" | "error";
  error: string;
};

type CryptoStoreSection = "pass" | "gear" | "market" | "contracts";

const CONTRACT_STORAGE_KEY = "mferland.cryptoStore.localContracts.v1";
const LOCAL_CONTRACT_CONFIG_URL = "/crypto/local-contracts.json";
const PRODUCTION_CONTRACT_CONFIG_URL = "/crypto/production-contracts.json";
const IS_PRODUCTION_BUILD = Boolean(import.meta.env?.PROD);
const BASE_CHAIN_CONFIG: CryptoStoreChainConfig = {
  chainId: TRAIT_CHANGE_BASE_CHAIN_ID,
  chainName: "Base",
  rpcUrl: TRAIT_CHANGE_BASE_RPC_URL,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};
const LOCAL_CHAIN_CONFIG: CryptoStoreChainConfig = {
  chainId: 31337,
  chainName: "mferland local",
  rpcUrl: "http://127.0.0.1:8545",
  nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
};
const DEFAULT_CHAIN_CONFIG = IS_PRODUCTION_BUILD ? BASE_CHAIN_CONFIG : LOCAL_CHAIN_CONFIG;
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
  launchPass: "--",
  state: "idle",
  error: "",
};
const EMPTY_MARKET_QUOTES: CryptoMarketQuotesState = {
  quotes: [],
  state: "idle",
  error: "",
  refreshIntervalSeconds: 60,
};
const EMPTY_CONTRACT_PRICES: CryptoContractPricesState = {
  pass: null,
  gearByType: {},
  state: "idle",
  error: "",
};
const MARKET_QUOTE_UI_REFRESH_MS = 60_000;
const CONTRACT_PRICE_UI_REFRESH_MS = 60_000;

export function CryptoStorePanel({ npc, playerLevel = 1, onClose, onRegisterChainGear, onAnalyticsEvent }: CryptoStorePanelProps) {
  const wagmiAccount = useAccount();
  const [addresses, setAddresses] = useState<CryptoStoreAddresses>(() => IS_PRODUCTION_BUILD ? EMPTY_ADDRESSES : readStoredAddresses());
  const [chainConfig, setChainConfig] = useState<CryptoStoreChainConfig>(DEFAULT_CHAIN_CONFIG);
  const [account, setAccount] = useState(() => wagmiAccount.address ?? "");
  const [gearType, setGearType] = useState<string>(String(DEFAULT_STORE_GEAR.gearType));
  const [ethPrice, setEthPrice] = useState<string>(DEFAULT_STORE_GEAR.ethPrice);
  const [launchPassTokenId, setLaunchPassTokenId] = useState("");
  const [status, setStatus] = useState(IS_PRODUCTION_BUILD ? "loading Base contracts" : "loading local contracts");
  const [isBusy, setIsBusy] = useState(false);
  const [balances, setBalances] = useState<CryptoStoreBalances>(EMPTY_BALANCES);
  const [marketQuotes, setMarketQuotes] = useState<CryptoMarketQuotesState>(EMPTY_MARKET_QUOTES);
  const [contractPrices, setContractPrices] = useState<CryptoContractPricesState>(EMPTY_CONTRACT_PRICES);
  const [activeSection, setActiveSection] = useState<CryptoStoreSection>("gear");
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
  const normalizedPlayerLevel = normalizeItemLevel(playerLevel);
  const selectedGearPrice = contractPrices.gearByType[String(gearType)] ?? null;
  const displayedEthPrice = selectedGearPrice?.eth ?? ethPrice;
  const displayedMferPrice = selectedGearPrice?.mfer ?? "--";
  const displayedMferGptPrice = selectedGearPrice?.mfergpt ?? "--";
  const selectedGearName = selectedStoreGearItemId
    ? ITEMS[selectedStoreGearItemId].name
    : selectedStoreGear?.label ?? "custom gear";
  const selectedGearItem = selectedStoreGearItemId ? ITEMS[selectedStoreGearItemId] : null;
  const selectedGearEquipment = selectedStoreGearItemId ? getItemEquipment(selectedStoreGearItemId, 1, normalizedPlayerLevel) : null;
  const selectedGearStats = selectedStoreGearItemId ? getStoreGearStatRows(selectedStoreGearItemId, 1, normalizedPlayerLevel) : [];
  const selectedGearGrowth = selectedStoreGearItemId ? getStoreGearGrowthRows(selectedStoreGearItemId) : [];
  const selectedGearMeta = selectedGearEquipment && selectedGearItem
    ? `${EQUIPMENT_SLOTS[selectedGearEquipment.slot]} / ${selectedGearEquipment.build} / heirloom ${selectedGearItem.quality}`
    : "custom chain gear";
  const passOwnershipStatus = formatPassOwnershipStatus(balances, launchPassTokenId);

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
    if (IS_PRODUCTION_BUILD) return;
    window.localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  useEffect(() => {
    void refreshBalances();
  }, [account, wagmiAccount.address, addresses.launchPass, addresses.mfer, addresses.mfergpt, chainConfig.chainId]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    async function loadContractPrices() {
      setContractPrices((current) => ({ ...current, state: current.state === "idle" ? "loading" : current.state, error: "" }));
      try {
        const provider = getReadOnlyProvider(chainConfig);
        if (!provider) throw new Error("contract RPC unavailable");
        const pass = isAddress(addresses.launchPass)
          ? await readPassPrice(provider, addresses.launchPass)
          : null;
        const gearByType: Record<string, CryptoProductPrice> = {};
        if (isAddress(addresses.store)) {
          const gearTypes = getVisibleGearTypes(gearType);
          await Promise.all(gearTypes.map(async (nextGearType) => {
            try {
              gearByType[String(nextGearType)] = await readGearPrice(provider, addresses.store, nextGearType);
            } catch {
              // Custom or delisted gear can fail without breaking the listed collection.
            }
          }));
        }
        if (disposed) return;
        setContractPrices({
          pass,
          gearByType,
          state: "ready",
          error: "",
        });
      } catch (error) {
        if (!disposed) {
          setContractPrices((current) => ({
            ...current,
            state: "error",
            error: getErrorMessage(error),
          }));
        }
      }
    }

    void loadContractPrices();
    timer = window.setInterval(() => void loadContractPrices(), CONTRACT_PRICE_UI_REFRESH_MS);

    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [addresses.launchPass, addresses.store, chainConfig.chainId, chainConfig.rpcUrl, gearType]);

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

      const [ethBalance, mferBalance, mferGptBalance, launchPassBalance] = await Promise.all([
        readNativeBalance(provider, wallet),
        readOptionalTokenBalance(provider, addresses.mfer, wallet),
        readOptionalTokenBalance(provider, addresses.mfergpt, wallet),
        readOptionalTokenBalance(provider, addresses.launchPass, wallet),
      ]);
      setBalances({
        eth: formatUnits(ethBalance),
        mfer: mferBalance === null ? "--" : formatUnits(mferBalance),
        mfergpt: mferGptBalance === null ? "--" : formatUnits(mferGptBalance),
        launchPass: launchPassBalance === null ? "--" : formatPassBalance(launchPassBalance),
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
      await assertTokenBalanceAtLeast(provider, addresses.mfer, price, "$mfer");
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
      await assertTokenBalanceAtLeast(provider, addresses.mfergpt, price, "$mfergpt");
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
      await assertTokenBalanceAtLeast(provider, addresses.mfer, price, "$mfer");
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
      await assertTokenBalanceAtLeast(provider, addresses.mfergpt, price, "$mfergpt");
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
    void refreshBalances();
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
          <button
            type="button"
            disabled={isBusy}
            data-tooltip={"Connect wallet\nAdds or switches to the configured chain"}
            onClick={() => void connectWallet()}
          >
            <PlugZap size={16} />
            connect
          </button>
        </div>
      </div>

      <div className="crypto-store-shop-layout">
        <nav className="crypto-store-menu" aria-label="store menu">
          <button
            type="button"
            aria-label="Show season pass"
            aria-controls="crypto-store-panel-pass"
            aria-current={activeSection === "pass" ? "page" : undefined}
            className={activeSection === "pass" ? "selected" : undefined}
            data-tooltip={"Season pass\nMint access for the connected wallet"}
            onClick={() => setActiveSection("pass")}
          >
            <Gem size={18} />
            <span>season pass</span>
            <strong>{passOwnershipStatus}</strong>
          </button>
          <button
            type="button"
            aria-label="Show gear"
            aria-controls="crypto-store-panel-gear"
            aria-current={activeSection === "gear" ? "page" : undefined}
            className={activeSection === "gear" ? "selected" : undefined}
            data-tooltip={"Gear\nBrowse equipment NFTs and pay with ETH, $mfer, or $mfergpt"}
            onClick={() => setActiveSection("gear")}
          >
            <Coins size={18} />
            <span>gear</span>
            <strong>leveling gear</strong>
          </button>
          <button
            type="button"
            aria-label="Show market"
            aria-controls="crypto-store-panel-market"
            aria-current={activeSection === "market" ? "page" : undefined}
            className={activeSection === "market" ? "selected" : undefined}
            data-tooltip={"Market\nLive cached token quotes used by contract pricing"}
            onClick={() => setActiveSection("market")}
          >
            <Flame size={18} />
            <span>market</span>
            <strong>{formatMarketTabSummary(marketQuotes)}</strong>
          </button>
          <button
            type="button"
            aria-label="Show contracts"
            aria-controls="crypto-store-panel-contracts"
            aria-current={activeSection === "contracts" ? "page" : undefined}
            className={activeSection === "contracts" ? "selected" : undefined}
            data-tooltip={IS_PRODUCTION_BUILD
              ? "Contract addresses\nProduction chain configuration"
              : "Contract addresses\nAdvanced local testing configuration"}
            onClick={() => setActiveSection("contracts")}
          >
            <PlugZap size={18} />
            <span>contracts</span>
            <strong>{configuredContractCount}/6 ready</strong>
          </button>
        </nav>

        <div className="crypto-store-flow-grid">
        {activeSection === "pass" ? (
          <section
            id="crypto-store-panel-pass"
            className="crypto-store-flow crypto-pass-flow"
            aria-label="launch pass"
          >
            <div className="crypto-product-layout">
              <div className="crypto-product-preview crypto-pass-preview" data-tooltip={`Season pass\n${passOwnershipStatus}`}>
                <Gem size={54} />
                <strong>{LAUNCH_PASS_LABEL}</strong>
                <span>{passOwnershipStatus}</span>
              </div>

              <div className="crypto-product-detail">
                <div className="crypto-store-flow-head">
                  <div>
                    <strong>{LAUNCH_PASS_LABEL}</strong>
                    <span>{formatContractPriceStatus(contractPrices, "pass")} / {passOwnershipStatus}</span>
                  </div>
                </div>

                <ProductPriceGrid price={contractPrices.pass} ariaLabel="launch pass prices" productLabel={LAUNCH_PASS_LABEL} />

                <div className="crypto-store-actions crypto-pass-actions">
                  <button
                    type="button"
                    disabled={isBusy}
                    data-tooltip={getPurchaseTooltip("ETH", "season pass", contractPrices.pass?.eth)}
                    onClick={() => void buyLaunchPassWithEth()}
                  >
                    <Gem size={16} />
                    mint ETH
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    data-tooltip={getPurchaseTooltip("$mfer", "season pass", contractPrices.pass?.mfer)}
                    onClick={() => void buyLaunchPassWithMfer()}
                  >
                    <Coins size={16} />
                    mint $mfer
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    data-tooltip={getPurchaseTooltip("$mfergpt", "season pass", contractPrices.pass?.mfergpt)}
                    onClick={() => void buyLaunchPassWithMferGpt()}
                  >
                    <Flame size={16} />
                    mint $mfergpt
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === "gear" ? (
          <section
            id="crypto-store-panel-gear"
            className="crypto-store-flow crypto-gear-flow"
            aria-label="gear purchase"
          >
            <div className="crypto-product-layout crypto-gear-layout">
              <div className="crypto-store-collection crypto-store-catalog" aria-label="gear collection">
                {STORE_GEAR_COLLECTION.map((gear) => {
                  const itemId = getChainGearItemId(gear.gearType);
                  const itemName = itemId ? ITEMS[itemId].name : gear.label;
                  const isSelected = String(gear.gearType) === gearType;
                  const gearPrice = contractPrices.gearByType[String(gear.gearType)] ?? null;
                  const gearTooltip = getGearCollectionTooltip(itemName, itemId, gear, gearPrice, normalizedPlayerLevel);

                  return (
                    <button
                      key={gear.gearType}
                      type="button"
                      className={isSelected ? "selected" : undefined}
                      title={itemName}
                      aria-label={formatTooltipLabel(gearTooltip)}
                      aria-pressed={isSelected}
                      disabled={isBusy}
                      data-tooltip={gearTooltip}
                      onClick={() => selectStoreGear(gear)}
                    >
                      {itemId ? <ItemIcon itemId={itemId} /> : null}
                      <span>{itemName}</span>
                      <strong>{gearPrice?.eth ?? gear.ethPrice} ETH</strong>
                    </button>
                  );
                })}
              </div>

              <div className="crypto-product-detail">
                <div className="crypto-store-flow-head">
                  <div className="crypto-store-gear-heading">
                    {selectedStoreGearItemId ? <ItemIcon itemId={selectedStoreGearItemId} /> : null}
                    <div>
                      <strong>{selectedGearName}</strong>
                      <span>gear type {gearType} / {selectedGearMeta}</span>
                    </div>
                  </div>
                </div>

                <div className="crypto-store-stat-card" aria-label={`${selectedGearName} stats`} data-tooltip={getGearStatsTooltip(selectedGearName, selectedStoreGearItemId, normalizedPlayerLevel)}>
                  <div className="crypto-store-stat-head">
                    <span>heirloom stats</span>
                    <strong>L{normalizedPlayerLevel}</strong>
                  </div>
                  <div className="crypto-store-stat-grid">
                    {selectedGearStats.length > 0 ? selectedGearStats.map((stat) => (
                      <div key={stat.key}>
                        <span>{stat.label}</span>
                        <strong>{stat.value}</strong>
                      </div>
                    )) : (
                      <div>
                        <span>bonus</span>
                        <strong>none</strong>
                      </div>
                    )}
                  </div>
                  {selectedGearGrowth.length > 0 ? (
                    <p className="crypto-store-heirloom-line">
                      grows {selectedGearGrowth.map((stat) => `${stat.value} ${stat.label}`).join(", ")} each level
                    </p>
                  ) : null}
                </div>

                <ProductPriceGrid price={selectedGearPrice} ariaLabel="selected gear prices" productLabel={selectedGearName} />

                <div className="crypto-store-item crypto-gear-checkout">
                  <label>
                    <span>gear type</span>
                    <input aria-label="gear" value={gearType} inputMode="numeric" onChange={(event) => setGearType(event.target.value)} />
                  </label>
                  <label>
                    <span>ETH</span>
                    <input aria-label="ETH" value={displayedEthPrice} inputMode="decimal" readOnly />
                  </label>
                  <label data-tooltip={getPriceTooltip(selectedGearName, "$mfer", displayedMferPrice)}>
                    <span>$mfer</span>
                    <input aria-label="$mfer price" value={formatCompactTokenAmount(displayedMferPrice)} inputMode="decimal" readOnly />
                  </label>
                  <label data-tooltip={getPriceTooltip(selectedGearName, "$mfergpt", displayedMferGptPrice)}>
                    <span>$mfergpt</span>
                    <input aria-label="$mfergpt price" value={formatCompactTokenAmount(displayedMferGptPrice)} inputMode="decimal" readOnly />
                  </label>
                </div>

                <div className="crypto-store-actions">
                  <button type="button" disabled={isBusy} data-tooltip={getPurchaseTooltip("ETH", selectedGearName, selectedGearPrice?.eth)} onClick={() => void buyWithEth()}>
                    <Gem size={16} />
                    buy ETH
                  </button>
                  <button type="button" disabled={isBusy} data-tooltip={getPurchaseTooltip("$mfer", selectedGearName, selectedGearPrice?.mfer, "10% discount")} onClick={() => void buyWithMfer()}>
                    <Coins size={16} />
                    buy $mfer -10%
                  </button>
                  <button type="button" disabled={isBusy} data-tooltip={getPurchaseTooltip("$mfergpt", selectedGearName, selectedGearPrice?.mfergpt, "25% discount")} onClick={() => void buyWithMferGpt()}>
                    <Flame size={16} />
                    buy $mfergpt -25%
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeSection === "market" ? (
          <section
            id="crypto-store-panel-market"
            className="crypto-store-flow crypto-market-flow"
            aria-label="market quotes"
          >
            <div className="crypto-product-layout crypto-market-layout">
              <div className="crypto-product-preview crypto-market-preview" data-tooltip={`Quote refresh\nServer updates every ${marketQuotes.refreshIntervalSeconds || 60} seconds`}>
                <Flame size={54} />
                <strong>market</strong>
                <span>{formatMarketTabSummary(marketQuotes)}</span>
              </div>

              <div className="crypto-product-detail">
                <div className="crypto-store-flow-head">
                  <div>
                    <strong>token quotes</strong>
                    <span>cached every {marketQuotes.refreshIntervalSeconds || 60}s</span>
                  </div>
                </div>
                <div className="crypto-market-quotes">
                  <div data-tooltip={getMarketQuoteTooltip("$mfer/WETH", mferQuote, marketQuotes)}>
                    <span>$mfer/WETH</span>
                    <strong>{formatMarketQuote(mferQuote)}</strong>
                    <em>{formatMarketQuoteMeta(mferQuote, marketQuotes)}</em>
                  </div>
                  <div data-tooltip={getMarketQuoteTooltip("MFERGPT/WETH", mferGptQuote, marketQuotes)}>
                    <span>MFERGPT/WETH</span>
                    <strong>{formatMarketQuote(mferGptQuote)}</strong>
                    <em>{formatMarketQuoteMeta(mferGptQuote, marketQuotes)}</em>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {activeSection === "contracts" ? (
          <section
            id="crypto-store-panel-contracts"
            className="crypto-store-flow crypto-store-contracts"
            aria-label="contract addresses"
          >
            <div className="crypto-store-flow-head">
              <div>
                <strong>contracts</strong>
                <span>{configuredContractCount}/6 configured</span>
              </div>
            </div>
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
          </section>
        ) : null}
        </div>
      </div>

      <div className="crypto-store-currency-bar" aria-label="wallet balances">
        <button
          type="button"
          className="crypto-store-currency-refresh"
          title="Refresh balances"
          aria-label="Refresh balances"
          disabled={isBusy || balances.state === "loading"}
          data-tooltip={"Refresh balances\nReads ETH, mock token, and pass ownership state"}
          onClick={() => void refreshBalances()}
        >
          <RefreshCw size={14} />
        </button>
        <div data-tooltip={getBalanceTooltip("ETH", balances.eth)}>
          <span>ETH</span>
          <strong>{balances.eth}</strong>
        </div>
        <div data-tooltip={getBalanceTooltip("$mfer", balances.mfer)}>
          <span>$mfer</span>
          <strong>{formatCompactTokenAmount(balances.mfer)}</strong>
        </div>
        <div data-tooltip={getBalanceTooltip("$mfergpt", balances.mfergpt)}>
          <span>$mfergpt</span>
          <strong>{formatCompactTokenAmount(balances.mfergpt)}</strong>
        </div>
        <div data-tooltip={getBalanceTooltip("season pass", balances.launchPass)}>
          <span>season pass</span>
          <strong>{balances.launchPass}</strong>
        </div>
      </div>
      {balances.state === "error" && balances.error ? <em className="crypto-store-balance-error">{balances.error}</em> : null}

      <p className="crypto-store-status">{status}</p>
    </div>
  );
}

function ProductPriceGrid({ price, ariaLabel, productLabel }: { price: CryptoProductPrice | null; ariaLabel: string; productLabel: string }) {
  return (
    <div className="crypto-price-grid" aria-label={ariaLabel}>
      <div data-tooltip={getPriceTooltip(productLabel, "ETH", price?.eth)}>
        <span>ETH</span>
        <strong>{price?.eth ?? "--"}</strong>
      </div>
      <div data-tooltip={getPriceTooltip(productLabel, "$mfer", price?.mfer)}>
        <span>$mfer</span>
        <strong>{formatCompactTokenAmount(price?.mfer ?? "--")}</strong>
      </div>
      <div data-tooltip={getPriceTooltip(productLabel, "$mfergpt", price?.mfergpt)}>
        <span>$mfergpt</span>
        <strong>{formatCompactTokenAmount(price?.mfergpt ?? "--")}</strong>
      </div>
    </div>
  );
}

function getStoreGearStatRows(itemId: keyof typeof ITEMS, chainTier = 1, playerLevel = 1) {
  const equipment = getItemEquipment(itemId, chainTier, playerLevel);
  if (!equipment) return [];

  return (Object.keys(equipment.stats) as Array<keyof typeof STAT_LABELS>)
    .map((statKey) => ({
      key: statKey,
      label: STAT_LABELS[statKey],
      value: formatSignedStatValue(equipment.stats[statKey] ?? 0),
    }));
}

function getStoreGearGrowthRows(itemId: keyof typeof ITEMS) {
  const growth = getItemHeirloomStatsPerLevel(itemId);
  return (Object.keys(growth) as Array<keyof typeof STAT_LABELS>)
    .map((statKey) => ({
      key: statKey,
      label: STAT_LABELS[statKey],
      value: formatSignedStatValue(growth[statKey] ?? 0),
    }));
}

function getGearStatsTooltip(itemName: string, itemId: keyof typeof ITEMS | null, playerLevel = 1) {
  if (!itemId) return `${itemName}\nNo stats available`;
  const level = normalizeItemLevel(playerLevel);
  const equipment = getItemEquipment(itemId, 1, level);
  if (!equipment) return `${itemName}\nNo stats available`;
  const growthLines = getStoreGearGrowthRows(itemId).map((stat) => `${stat.value} ${stat.label} per level`);

  const lines = [
    itemName,
    `${EQUIPMENT_SLOTS[equipment.slot]} / ${equipment.build}`,
    `Level ${level} stats`,
    ...getStoreGearStatRows(itemId, 1, level).map((stat) => `${stat.value} ${stat.label}`),
    growthLines.length > 0 ? "Heirloom growth" : "",
    ...growthLines,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatSignedStatValue(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatStatNumber(value)}`;
}

function formatStatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
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
  if (typeof configured === "string" && configured.trim() && !(IS_PRODUCTION_BUILD && isLocalContractConfigUrl(configured))) {
    return configured.trim();
  }
  return import.meta.env.PROD ? PRODUCTION_CONTRACT_CONFIG_URL : LOCAL_CONTRACT_CONFIG_URL;
}

function getMissingConfigStatus() {
  return import.meta.env.PROD
    ? `add Base contract config at ${getContractConfigUrl()}`
    : "run npm run chain:deploy:local to prefill contracts";
}

function parseChainConfig(document: CryptoContractsDocument): CryptoStoreChainConfig {
  const chainId = Number.isInteger(document.chainId) && Number(document.chainId) > 0
    ? Number(document.chainId)
    : DEFAULT_CHAIN_CONFIG.chainId;
  const nativeCurrency = document.nativeCurrency ?? {};
  return {
    chainId,
    chainName: typeof document.chainName === "string" && document.chainName.trim()
      ? document.chainName.trim()
      : getDefaultChainName(chainId),
    rpcUrl: resolveChainRpcUrl(typeof document.rpcUrl === "string" ? document.rpcUrl.trim() : "", chainId),
    nativeCurrency: {
      name: typeof nativeCurrency.name === "string" && nativeCurrency.name.trim() ? nativeCurrency.name.trim() : "Ether",
      symbol: typeof nativeCurrency.symbol === "string" && nativeCurrency.symbol.trim() ? nativeCurrency.symbol.trim() : "ETH",
      decimals: Number.isInteger(nativeCurrency.decimals) && Number(nativeCurrency.decimals) > 0 ? Number(nativeCurrency.decimals) : 18,
    },
  };
}

function resolveChainRpcUrl(configuredRpcUrl: string, chainId: number) {
  if (chainId === BASE_CHAIN_CONFIG.chainId) return configuredRpcUrl || BASE_CHAIN_CONFIG.rpcUrl;
  if (chainId !== LOCAL_CHAIN_CONFIG.chainId) return configuredRpcUrl;
  if (typeof window === "undefined") return configuredRpcUrl || LOCAL_CHAIN_CONFIG.rpcUrl;
  if (configuredRpcUrl && !isLoopbackRpcUrl(configuredRpcUrl)) return configuredRpcUrl;
  if (isLoopbackHost(window.location.hostname)) return configuredRpcUrl || LOCAL_CHAIN_CONFIG.rpcUrl;
  return `${window.location.origin}/crypto-rpc`;
}

function isLocalContractConfigUrl(value: string) {
  return value.trim().replace(/\?.*$/, "").endsWith(LOCAL_CONTRACT_CONFIG_URL);
}

function getDefaultChainName(chainId: number) {
  if (chainId === LOCAL_CHAIN_CONFIG.chainId) return LOCAL_CHAIN_CONFIG.chainName;
  if (chainId === BASE_CHAIN_CONFIG.chainId) return BASE_CHAIN_CONFIG.chainName;
  return `chain ${chainId}`;
}

function isLoopbackRpcUrl(value: string) {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
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

function getReadOnlyProvider(chainConfig: CryptoStoreChainConfig): EthereumProvider | null {
  return getJsonRpcProvider(chainConfig.rpcUrl) ?? getEthereum();
}

function getJsonRpcProvider(rpcUrl: string): EthereumProvider | null {
  const endpoint = rpcUrl.trim();
  if (!endpoint) return null;
  return {
    async request({ method, params = [] }) {
      return requestJsonRpc(endpoint, method, params);
    },
  };
}

function getLocalAnvilProvider(account: string, chainId: number): EthereumProvider | null {
  if (!import.meta.env.DEV || chainId !== LOCAL_CHAIN_CONFIG.chainId || !isAddress(account)) return null;
  return {
    async request({ method, params = [] }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return toChainIdHex(LOCAL_CHAIN_CONFIG.chainId);
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      return requestJsonRpc(LOCAL_CHAIN_CONFIG.rpcUrl, method, params);
    },
  };
}

async function requestJsonRpc(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
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
  if (chainConfig.chainId === LOCAL_CHAIN_CONFIG.chainId && chainConfig.rpcUrl) {
    await addConfiguredChain(provider, chainId, chainConfig).catch(() => undefined);
  }
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    if (!chainConfig.rpcUrl) throw error;
    await addConfiguredChain(provider, chainId, chainConfig);
  }
}

async function addConfiguredChain(provider: EthereumProvider, chainId: string, chainConfig: CryptoStoreChainConfig) {
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

async function approve(provider: EthereumProvider, tokenAddress: string, spender: string, amount: bigint) {
  await sendTransaction(provider, tokenAddress, callData(SELECTORS.approve, encodeAddress(spender), encodeUint(amount)));
}

async function assertTokenBalanceAtLeast(provider: EthereumProvider, tokenAddress: string, amount: bigint, label: string) {
  const accounts = await provider.request({ method: "eth_accounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!account) throw new Error("Wallet not connected");
  const balance = await readTokenBalance(provider, tokenAddress, account);
  if (balance < amount) {
    throw new Error(`not enough ${label}: need ${formatUnits(amount)}, have ${formatUnits(balance)}`);
  }
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
  return parseRpcUint(result, "Contract read");
}

async function readNativeBalance(provider: EthereumProvider, account: string) {
  const result = await provider.request({ method: "eth_getBalance", params: [account, "latest"] });
  return parseRpcUint(result, "ETH balance read");
}

async function readTokenBalance(provider: EthereumProvider, tokenAddress: string, account: string) {
  if (!isAddress(tokenAddress)) throw new Error("Token address missing");
  return readUint(provider, tokenAddress, callData(SELECTORS.balanceOf, encodeAddress(account)));
}

async function readOptionalTokenBalance(provider: EthereumProvider, tokenAddress: string, account: string) {
  if (!isAddress(tokenAddress)) return null;
  try {
    return await readTokenBalance(provider, tokenAddress, account);
  } catch {
    return null;
  }
}

function parseRpcUint(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} failed`);
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) throw new Error(`${label} returned no data`);
  return BigInt(normalized);
}

async function readPassPrice(provider: EthereumProvider, launchPassAddress: string): Promise<CryptoProductPrice> {
  const [eth, mfer, mfergpt] = await Promise.all([
    readUint(provider, launchPassAddress, callData(SELECTORS.ethPrice)),
    readUint(provider, launchPassAddress, callData(SELECTORS.mferPrice)),
    readUint(provider, launchPassAddress, callData(SELECTORS.mferGptPrice)),
  ]);
  return formatProductPrice({ eth, mfer, mfergpt });
}

async function readGearPrice(provider: EthereumProvider, storeAddress: string, gearType: number): Promise<CryptoProductPrice> {
  const [eth, mfer, mfergpt] = await Promise.all([
    readUint(provider, storeAddress, callData(SELECTORS.gearEthPrice, encodeUint(gearType))),
    readUint(provider, storeAddress, callData(
      SELECTORS.discountedTokenPrice,
      encodeUint(gearType),
      encodeUint(DISCOUNT_BPS.mfer),
    )),
    readUint(provider, storeAddress, callData(
      SELECTORS.discountedTokenPrice,
      encodeUint(gearType),
      encodeUint(DISCOUNT_BPS.mfergpt),
    )),
  ]);
  return formatProductPrice({ eth, mfer, mfergpt });
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

function formatProductPrice(values: { eth: bigint; mfer: bigint; mfergpt: bigint }): CryptoProductPrice {
  return {
    eth: formatUnits(values.eth, 18, 6),
    mfer: formatUnits(values.mfer, 18, 4),
    mfergpt: formatUnits(values.mfergpt, 18, 4),
  };
}

function formatPassBalance(value: bigint) {
  if (value <= 0n) return "none";
  return `${value.toString()} owned`;
}

function formatPassOwnershipStatus(balances: CryptoStoreBalances, mintedTokenId: string) {
  if (mintedTokenId) return `minted pass #${mintedTokenId}`;
  if (balances.state === "loading" || balances.state === "idle") return "checking pass";
  if (balances.state === "error") return "pass unknown";
  if (balances.launchPass === "--") return "pass unavailable";
  return balances.launchPass === "none" ? "no pass for wallet" : `season pass ${balances.launchPass}`;
}

function getBalanceTooltip(label: string, value: string) {
  const detail = value === "--" ? "not available" : value;
  return `${label}\nWallet balance: ${detail}`;
}

function getPriceTooltip(productLabel: string, paymentToken: string, amount?: string) {
  return `${productLabel}\n${paymentToken}: ${amount ?? "loading"}`;
}

function getPurchaseTooltip(paymentToken: string, productLabel: string, amount?: string, note?: string) {
  const lines = [
    productLabel,
    `Pay ${amount ?? "loading"} ${paymentToken}`,
  ];
  if (note) lines.push(note);
  if (paymentToken === "$mfergpt") lines.push("Mock token is sent to the burn address after approval");
  if (paymentToken === "$mfer") lines.push("Mock token is transferred to treasury");
  return lines.join("\n");
}

function getGearCollectionTooltip(
  itemName: string,
  itemId: keyof typeof ITEMS | null,
  gear: typeof STORE_GEAR_COLLECTION[number],
  price: CryptoProductPrice | null,
  playerLevel = 1,
) {
  const eth = price?.eth ?? gear.ethPrice;
  const mfer = price?.mfer ?? gear.mferPriceLabel;
  const mfergpt = price?.mfergpt ?? gear.mferGptPriceLabel;
  const level = normalizeItemLevel(playerLevel);
  const statLines = itemId ? getStoreGearStatRows(itemId, 1, level).map((stat) => `${stat.value} ${stat.label}`) : [];
  const growthLines = itemId ? getStoreGearGrowthRows(itemId).map((stat) => `${stat.value} ${stat.label}/level`) : [];
  return [
    itemName,
    `Gear type ${gear.gearType}`,
    `Level ${level} heirloom`,
    ...statLines,
    ...growthLines,
    `${eth} ETH`,
    `${mfer} $mfer / ${mfergpt} $mfergpt`,
  ].join("\n");
}

function getMarketQuoteTooltip(label: string, quote: CryptoMarketQuote | null, state: CryptoMarketQuotesState) {
  if (!quote) return `${label}\n${state.state === "error" && state.error ? state.error : "waiting for quote"}`;
  return `${label}\n${formatMarketQuote(quote)}\n${formatMarketQuoteMeta(quote, state)}`;
}

function formatMarketTabSummary(state: CryptoMarketQuotesState) {
  if (state.state === "error") return "quotes offline";
  if (state.state === "idle" || state.state === "loading") return "loading quotes";
  return state.quotes.length >= 2 ? "live quotes" : "partial quotes";
}

function formatContractPriceStatus(state: CryptoContractPricesState, product: "pass" | "gear") {
  if (state.state === "error" && state.error) return state.error;
  if (state.state === "loading" || state.state === "idle") return "loading contract prices";
  if (product === "pass" && !state.pass) return "pass price unavailable";
  return "contract prices";
}

function getVisibleGearTypes(selectedGearType: string) {
  const gearTypes = new Set<number>(STORE_GEAR_COLLECTION.map((gear) => gear.gearType));
  const selected = Number(selectedGearType);
  if (Number.isInteger(selected) && selected > 0) gearTypes.add(selected);
  return [...gearTypes];
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
  return formatReadableDecimal(value);
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

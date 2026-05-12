import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Check, Coins, Flame, Gem, RefreshCw, Shuffle, X, type LucideIcon } from "lucide-react";
import { useAccount } from "wagmi";
import {
  MFER_APPEARANCE_TRAIT_CATEGORIES,
  TRAIT_CHANGE_PRODUCT_ID,
  hasExplicitMferAppearanceTraits,
  normalizeMferAppearanceTraits,
  sanitizePlayerName,
  type ClientUpdateTraits,
  type MferAppearanceTraits,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TraitPaymentToken,
  type TraitUpdateResult,
} from "@mferland/shared";
import { formatCompactTokenAmount } from "../crypto/displayAmounts";
import { waitForTransactionReceipt, type EthereumProvider } from "../crypto/transactionReceipts";
import { resolveMferTraitsForPlayer } from "../game/mferTraits";
import { MferAvatar } from "./MferAvatar";
import { MferPortrait } from "./MferPortrait";

type CryptoStoreAddresses = {
  store: string;
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
  addresses?: Partial<CryptoStoreAddresses>;
};

type TraitsPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot;
  result: TraitUpdateResult | null;
  onClose: () => void;
  onUpdateTraits: (message: ClientUpdateTraits) => void;
};

type PaymentOption = {
  token: TraitPaymentToken;
  label: string;
  Icon: LucideIcon;
  discountLabel?: string;
};

type TraitContractPrice = {
  eth: string;
  mfer: string;
  mfergpt: string;
  ethWei: string;
  mferWei: string;
  mferGptWei: string;
};

type TraitContractPriceState = {
  price: TraitContractPrice | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string;
};

const LOCAL_CONTRACT_CONFIG_URL = "/crypto/local-contracts.json";
const PRODUCTION_CONTRACT_CONFIG_URL = "/crypto/production-contracts.json";
const LOCAL_CHAIN_CONFIG: CryptoStoreChainConfig = {
  chainId: 31337,
  chainName: "mferland local",
  rpcUrl: "http://127.0.0.1:8545",
  nativeCurrency: { name: "Anvil ETH", symbol: "ETH", decimals: 18 },
};
const SELECTORS = {
  balanceOf: "0x70a08231",
  getProductPrice: "0x91c57e73",
  transfer: "0xa9059cbb",
  treasury: "0x61d027b3",
};
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const PAYMENT_OPTIONS: PaymentOption[] = [
  { token: "ETH", label: "ETH", Icon: Gem },
  { token: "MFER", label: "$mfer", Icon: Coins, discountLabel: "10% off" },
  { token: "MFERGPT", label: "$mfergpt", Icon: Flame, discountLabel: "25% off" },
];
const TRAIT_CHANGE_PRODUCT_ID_WORD = "691801e90154d786163fb37c5503cafde0bc6f5a2411d53ca8609e222017e6f4";
const TRAIT_PRICE_REFRESH_MS = 60_000;
const EMPTY_TRAIT_PRICE_STATE: TraitContractPriceState = {
  price: null,
  state: "idle",
  error: "",
};

export function TraitsPanel({ npc, player, result, onClose, onUpdateTraits }: TraitsPanelProps) {
  const wagmiAccount = useAccount();
  const [draft, setDraft] = useState<MferAppearanceTraits>(() => makeInitialDraft(player));
  const [draftName, setDraftName] = useState(() => player.name || "mfer");
  const draftNameRef = useRef(draftName);
  const [status, setStatus] = useState("");
  const [busyToken, setBusyToken] = useState<TraitPaymentToken | "free" | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState(MFER_APPEARANCE_TRAIT_CATEGORIES[0]?.id ?? "");
  const [traitPriceState, setTraitPriceState] = useState<TraitContractPriceState>(EMPTY_TRAIT_PRICE_STATE);
  const firstSetFree = !hasExplicitMferAppearanceTraits(player.appearanceTraits);
  const canUseWalletPayment = player.identityType === "wallet" && Boolean(player.walletAddress);
  const savedTraitsKey = JSON.stringify(player.appearanceTraits ?? {});
  const previewPlayer = useMemo(() => makePreviewPlayer(player, draft, draftName), [draft, draftName, player]);
  const paidTraitStatus = !firstSetFree && canUseWalletPayment ? formatTraitPriceStatus(traitPriceState) : "";

  useEffect(() => {
    setDraft(makeInitialDraft(player));
    const nextName = player.name || "mfer";
    draftNameRef.current = nextName;
    setDraftName(nextName);
    setStatus("");
  }, [player.avatarSeed, player.name, savedTraitsKey]);

  useEffect(() => {
    if (!result) return;
    setStatus(result.ok ? formatTraitUpdateSuccessStatus(result) : result.error ?? "save failed");
    if (result.ok && result.name) {
      draftNameRef.current = result.name;
      setDraftName(result.name);
    }
    if (result.ok) setBusyToken(null);
  }, [result]);

  useEffect(() => {
    if (firstSetFree || !canUseWalletPayment) {
      setTraitPriceState(EMPTY_TRAIT_PRICE_STATE);
      return;
    }

    let disposed = false;
    let timer: number | null = null;

    async function loadTraitPrice() {
      setTraitPriceState((current) => ({ ...current, state: current.state === "idle" ? "loading" : current.state, error: "" }));
      try {
        const { addresses, chainConfig } = await fetchContractConfig();
        validateAddress(addresses.pricing, "pricing address missing");
        const provider = getReadOnlyProvider(chainConfig);
        if (!provider) throw new Error("contract RPC unavailable");
        const price = await readTraitPrice(provider, addresses.pricing);
        if (disposed) return;
        setTraitPriceState({ price, state: "ready", error: "" });
      } catch (error) {
        if (!disposed) setTraitPriceState({ price: null, state: "error", error: getErrorMessage(error) });
      }
    }

    void loadTraitPrice();
    timer = window.setInterval(() => void loadTraitPrice(), TRAIT_PRICE_REFRESH_MS);
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [canUseWalletPayment, firstSetFree]);

  function updateTrait(categoryId: string, value: string) {
    setDraft((current) => normalizeMferAppearanceTraits({
      ...current,
      [categoryId]: value,
    }, current));
    setStatus("");
  }

  function clearTrait(categoryId: string) {
    setDraft((current) => {
      const next = { ...current };
      delete next[categoryId];
      return normalizeMferAppearanceTraits(next, current);
    });
    setStatus("");
  }

  function randomize() {
    setDraft(resolveMferTraitsForPlayer(Date.now() + Math.floor(Math.random() * 1_000_000)));
    setStatus("");
  }

  function updateName(value: string) {
    draftNameRef.current = value;
    setDraftName(value);
    setStatus("");
  }

  function getSavePayload(payment?: NonNullable<ClientUpdateTraits["payment"]>): ClientUpdateTraits {
    return {
      traits: draft,
      name: sanitizePlayerName(draftNameRef.current, player.name || "mfer"),
      ...(payment ? { payment } : {}),
    };
  }

  async function saveFree() {
    setBusyToken("free");
    setStatus("saving");
    onUpdateTraits(getSavePayload());
    window.setTimeout(() => setBusyToken((current) => current === "free" ? null : current), 3500);
  }

  async function savePaid(token: TraitPaymentToken) {
    if (!canUseWalletPayment) {
      setStatus("wallet required");
      return;
    }
    if (!traitPriceState.price) {
      setStatus(traitPriceState.state === "error" ? traitPriceState.error : "trait price loading");
      return;
    }

    setBusyToken(token);
    setStatus(`${PAYMENT_OPTIONS.find((option) => option.token === token)?.label ?? token} payment`);
    try {
      const payment = await payForTraitChange(token, player.walletAddress, wagmiAccount.address ?? "");
      setStatus("saving");
      onUpdateTraits(getSavePayload(payment));
      window.setTimeout(() => setBusyToken((current) => current === token ? null : current), 3500);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setBusyToken(null);
    }
  }

  return (
    <div className="traits-panel">
      <div className="world-map-header">
        <div className="traits-title-lockup">
          <div className="traits-title-portrait">
            <MferPortrait traits={draft} variant="full" title="selected traits portrait" />
          </div>
          <div>
            <strong>{npc.name}</strong>
            <span>{firstSetFree ? "first set free" : "trait change"}</span>
          </div>
        </div>
        <button type="button" title="Close traits" aria-label="Close traits" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="traits-layout">
        <section className="traits-preview">
          <Canvas camera={{ position: [0, 1.55, 5.2], fov: 38, near: 0.1, far: 20 }}>
            <ambientLight intensity={1.05} />
            <hemisphereLight args={["#fff8df", "#6d7351", 0.72]} />
            <directionalLight position={[3, 6, 4]} intensity={1.45} color="#fff0c2" />
            <Suspense fallback={null}>
              <MferAvatar player={previewPlayer} isLocal actorScale={1.16} showNameplate={false} />
            </Suspense>
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI * 0.34}
              maxPolarAngle={Math.PI * 0.54}
              target={[0, 1.35, 0]}
            />
          </Canvas>
          <label className="traits-name-field">
            <span>name</span>
            <input
              aria-label="character name"
              value={draftName}
              maxLength={18}
              disabled={busyToken !== null}
              onChange={(event) => updateName(event.target.value)}
            />
          </label>
          <button className="traits-random-btn" type="button" disabled={busyToken !== null} onClick={randomize}>
            <Shuffle size={16} />
            random
          </button>
        </section>

        <section className="traits-selector" aria-label="trait selector">
          {MFER_APPEARANCE_TRAIT_CATEGORIES.map((category) => {
            const active = activeCategoryId === category.id;
            return (
              <section key={category.id} className={active ? "trait-category open" : "trait-category"}>
                <button
                  type="button"
                  className="trait-category-summary"
                  aria-expanded={active}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <span>{category.name}</span>
                  <strong>{getTraitLabel(category.id, draft[category.id])}</strong>
                </button>
                {active && (
                  <div className="trait-options">
                    {!category.required && (
                      <button
                        type="button"
                        className={!draft[category.id] ? "selected" : undefined}
                        disabled={busyToken !== null}
                        onClick={() => clearTrait(category.id)}
                      >
                        none
                      </button>
                    )}
                    {category.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={draft[category.id] === option.id ? "selected" : undefined}
                        disabled={busyToken !== null}
                        onClick={() => updateTrait(category.id, option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </section>
      </div>

      <div className="traits-actions">
        {firstSetFree || !canUseWalletPayment ? (
          <button className="primary-btn" type="button" disabled={busyToken !== null} onClick={() => void saveFree()}>
            {busyToken === "free" ? <RefreshCw size={17} /> : <Check size={17} />}
            {canUseWalletPayment ? "save free set" : "save session"}
          </button>
        ) : (
          PAYMENT_OPTIONS.map(({ token, label, Icon, discountLabel }) => {
            const exactAmount = getTraitPaymentAmountLabel(token, traitPriceState.price);
            return (
              <button
                key={token}
                className={token === "ETH" ? "primary-btn" : "secondary-btn"}
                type="button"
                aria-label={`${exactAmount} ${label}${discountLabel ? ` ${discountLabel}` : ""}`}
                data-tooltip={getTraitPaymentTooltip(token, label, traitPriceState.price, discountLabel)}
                disabled={busyToken !== null || !traitPriceState.price}
                onClick={() => void savePaid(token)}
              >
                {busyToken === token ? <RefreshCw size={17} /> : <Icon size={17} />}
                {getTraitPaymentDisplayAmountLabel(token, traitPriceState.price)} {label}
                {discountLabel && <span className="traits-payment-discount">{discountLabel}</span>}
              </button>
            );
          })
        )}
      </div>
      <p className="traits-status">{status || paidTraitStatus}</p>
    </div>
  );
}

function makeInitialDraft(player: PlayerSnapshot) {
  return resolveMferTraitsForPlayer(player.avatarSeed, player.appearanceTraits);
}

function makePreviewPlayer(player: PlayerSnapshot, appearanceTraits: MferAppearanceTraits, name: string): PlayerSnapshot {
  return {
    ...player,
    sessionId: "traits-preview",
    name: sanitizePlayerName(name, player.name || "mfer"),
    appearanceTraits,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    animation: "idle",
    emote: "",
    emoteStartedAt: 0,
    emoteEndsAt: 0,
    health: player.maxHealth,
  };
}

function getTraitLabel(categoryId: string, value: string | undefined) {
  if (!value) return "none";
  const category = MFER_APPEARANCE_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  return category?.options.find((option) => option.id === value)?.label ?? value;
}

async function payForTraitChange(token: TraitPaymentToken, playerWallet: string, wagmiWallet: string): Promise<NonNullable<ClientUpdateTraits["payment"]>> {
  const { addresses, chainConfig } = await fetchContractConfig();
  const provider = getProviderForAccount(playerWallet || wagmiWallet, chainConfig.chainId);
  if (!provider) throw new Error("wallet unavailable");

  await switchToConfiguredChain(provider, chainConfig);
  const account = await getConnectedAccount(provider);
  if (account.toLowerCase() !== playerWallet.toLowerCase()) throw new Error("connected wallet mismatch");

  validateAddress(addresses.pricing, "pricing address missing");
  const traitPrice = await readTraitPrice(provider, addresses.pricing);
  const amountWei = getTraitPriceWei(traitPrice, token);
  let txHash = "";
  let contractAddress = "";
  if (token === "ETH") {
    const treasury = await readTreasuryAddress(provider, addresses);
    txHash = await sendTransaction(provider, treasury, "0x", BigInt(amountWei));
    contractAddress = treasury;
  } else if (token === "MFER") {
    const treasury = await readTreasuryAddress(provider, addresses);
    validateAddress(addresses.mfer, "$mfer address missing");
    await assertTokenBalanceAtLeast(provider, addresses.mfer, account, BigInt(amountWei), "$mfer");
    txHash = await sendTransaction(provider, addresses.mfer, callData(SELECTORS.transfer, encodeAddress(treasury), encodeUint(amountWei)));
    contractAddress = addresses.mfer;
  } else {
    validateAddress(addresses.mfergpt, "$mfergpt address missing");
    await assertTokenBalanceAtLeast(provider, addresses.mfergpt, account, BigInt(amountWei), "$mfergpt");
    txHash = await sendTransaction(provider, addresses.mfergpt, callData(SELECTORS.transfer, encodeAddress(BURN_ADDRESS), encodeUint(amountWei)));
    contractAddress = addresses.mfergpt;
  }

  return {
    token,
    txHash,
    amountWei,
    chainId: chainConfig.chainId,
    contractAddress,
  };
}

async function fetchContractConfig() {
  const response = await fetch(`${getContractConfigUrl()}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("contract config missing");
  const document = await response.json() as CryptoContractsDocument;
  const addresses = {
    store: typeof document.addresses?.store === "string" ? document.addresses.store : "",
    pricing: typeof document.addresses?.pricing === "string" ? document.addresses.pricing : "",
    mfer: typeof document.addresses?.mfer === "string" ? document.addresses.mfer : "",
    mfergpt: typeof document.addresses?.mfergpt === "string" ? document.addresses.mfergpt : "",
    launchPass: typeof document.addresses?.launchPass === "string" ? document.addresses.launchPass : "",
  };
  return {
    addresses,
    chainConfig: parseChainConfig(document),
  };
}

function getContractConfigUrl() {
  const configured = import.meta.env.VITE_CRYPTO_CONTRACTS_URL;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return import.meta.env.PROD ? PRODUCTION_CONTRACT_CONFIG_URL : LOCAL_CONTRACT_CONFIG_URL;
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
    rpcUrl: resolveChainRpcUrl(typeof document.rpcUrl === "string" ? document.rpcUrl.trim() : "", chainId),
    nativeCurrency: {
      name: typeof nativeCurrency.name === "string" && nativeCurrency.name.trim() ? nativeCurrency.name.trim() : "Ether",
      symbol: typeof nativeCurrency.symbol === "string" && nativeCurrency.symbol.trim() ? nativeCurrency.symbol.trim() : "ETH",
      decimals: Number.isInteger(nativeCurrency.decimals) && Number(nativeCurrency.decimals) > 0 ? Number(nativeCurrency.decimals) : 18,
    },
  };
}

function resolveChainRpcUrl(configuredRpcUrl: string, chainId: number) {
  if (chainId !== LOCAL_CHAIN_CONFIG.chainId) return configuredRpcUrl;
  if (typeof window === "undefined") return configuredRpcUrl || LOCAL_CHAIN_CONFIG.rpcUrl;
  if (configuredRpcUrl && !isLoopbackRpcUrl(configuredRpcUrl)) return configuredRpcUrl;
  if (isLoopbackHost(window.location.hostname)) return configuredRpcUrl || LOCAL_CHAIN_CONFIG.rpcUrl;
  return `${window.location.origin}/crypto-rpc`;
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

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as Window & { ethereum?: Partial<EthereumProvider> };
  return typeof maybeWindow.ethereum?.request === "function" ? maybeWindow.ethereum as EthereumProvider : null;
}

function getProviderForAccount(account: string, chainId: number): EthereumProvider | null {
  return getEthereum() ?? getLocalAnvilProvider(account, chainId);
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

async function getConnectedAccount(provider: EthereumProvider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!isAddress(account)) throw new Error("wallet not connected");
  return account;
}

async function readTraitPrice(provider: EthereumProvider, pricingAddress: string): Promise<TraitContractPrice> {
  validateAddress(pricingAddress, "pricing address missing");
  const result = await provider.request({
    method: "eth_call",
    params: [{ to: pricingAddress, data: callData(SELECTORS.getProductPrice, TRAIT_CHANGE_PRODUCT_ID_WORD) }, "latest"],
  });
  if (typeof result !== "string" || result.length < 2 + (64 * 4)) throw new Error("trait price read failed");
  const eth = readReturnUint(result, 0);
  const mfer = readReturnUint(result, 1);
  const mfergpt = readReturnUint(result, 2);
  if (eth <= 0n || mfer <= 0n || mfergpt <= 0n) throw new Error("trait price unavailable");
  return {
    eth: formatUnits(eth, 18, 6),
    mfer: formatUnits(mfer, 18, 4),
    mfergpt: formatUnits(mfergpt, 18, 4),
    ethWei: eth.toString(),
    mferWei: mfer.toString(),
    mferGptWei: mfergpt.toString(),
  };
}

async function readTreasuryAddress(provider: EthereumProvider, addresses: CryptoStoreAddresses) {
  const configured = String(import.meta.env.VITE_TRAIT_TREASURY_ADDRESS ?? "").trim();
  if (isAddress(configured)) return configured;
  const sourceAddress = isAddress(addresses.launchPass) ? addresses.launchPass : addresses.store;
  validateAddress(sourceAddress, "treasury source missing");
  const result = await provider.request({ method: "eth_call", params: [{ to: sourceAddress, data: SELECTORS.treasury }, "latest"] });
  if (typeof result !== "string" || result.length < 66) throw new Error("treasury read failed");
  const treasury = `0x${result.slice(-40)}`;
  validateAddress(treasury, "treasury missing");
  return treasury;
}

async function assertTokenBalanceAtLeast(provider: EthereumProvider, tokenAddress: string, account: string, amount: bigint, label: string) {
  const balance = await readTokenBalance(provider, tokenAddress, account);
  if (balance < amount) {
    throw new Error(`not enough ${label}: need ${formatUnits(amount)}, have ${formatUnits(balance)}`);
  }
}

async function readTokenBalance(provider: EthereumProvider, tokenAddress: string, account: string) {
  validateAddress(tokenAddress, "token address missing");
  validateAddress(account, "wallet missing");
  const result = await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddress, data: callData(SELECTORS.balanceOf, encodeAddress(account)) }, "latest"],
  });
  if (typeof result !== "string") throw new Error("token balance read failed");
  return BigInt(result);
}

async function sendTransaction(provider: EthereumProvider, to: string, data: string, value = 0n) {
  validateAddress(to, "transaction target missing");
  const from = await getConnectedAccount(provider);
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data, value: toHex(value) }],
  });
  if (typeof txHash !== "string") throw new Error("transaction failed");
  await waitForTransactionReceipt(provider, txHash);
  return txHash;
}

function callData(selector: string, ...args: string[]) {
  return `${selector}${args.join("")}`;
}

function encodeAddress(address: string) {
  validateAddress(address, "address missing");
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUint(value: string | number | bigint) {
  const parsed = typeof value === "bigint" ? value : BigInt(value || "0");
  return parsed.toString(16).padStart(64, "0");
}

function readReturnUint(result: string, index: number) {
  const start = 2 + (index * 64);
  const word = result.slice(start, start + 64);
  if (!/^[a-fA-F0-9]{64}$/.test(word)) throw new Error("contract read decode failed");
  return BigInt(`0x${word}`);
}

function getTraitPriceWei(price: TraitContractPrice, token: TraitPaymentToken) {
  if (token === "ETH") return price.ethWei;
  if (token === "MFER") return price.mferWei;
  return price.mferGptWei;
}

function getTraitPaymentAmountLabel(token: TraitPaymentToken, price: TraitContractPrice | null) {
  if (!price) return "--";
  if (token === "ETH") return price.eth;
  if (token === "MFER") return price.mfer;
  return price.mfergpt;
}

function getTraitPaymentDisplayAmountLabel(token: TraitPaymentToken, price: TraitContractPrice | null) {
  const exact = getTraitPaymentAmountLabel(token, price);
  return token === "ETH" ? exact : formatCompactTokenAmount(exact);
}

function getTraitPaymentTooltip(token: TraitPaymentToken, label: string, price: TraitContractPrice | null, discountLabel?: string) {
  const exact = getTraitPaymentAmountLabel(token, price);
  const lines = [
    "Trait change",
    price ? `${label}: ${exact}` : `${label}: loading`,
  ];
  if (discountLabel) lines.push(`${label} price is ${discountLabel} the ETH quote`);
  if (token === "MFER") lines.push("Mock token is transferred to treasury");
  if (token === "MFERGPT") lines.push("Mock token is sent to the burn address");
  return lines.join("\n");
}

function formatTraitUpdateSuccessStatus(result: TraitUpdateResult) {
  const action = result.free ? "saved free set" : "saved paid set";
  return result.name ? `${action} as ${result.name}` : action;
}

function formatTraitPriceStatus(state: TraitContractPriceState) {
  if (state.state === "error" && state.error) return state.error;
  if (state.state === "loading" || state.state === "idle") return "loading trait prices";
  if (!state.price) return "trait price unavailable";
  return `${TRAIT_CHANGE_PRODUCT_ID} prices live`;
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

function validateAddress(value: string, message: string) {
  if (!isAddress(value)) throw new Error(message);
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown };
  return maybeError.code === 4902 || isUnknownChainError(maybeError.cause);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "wallet action failed";
}

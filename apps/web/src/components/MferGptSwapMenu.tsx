import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { trackEvent } from "../analytics";
import {
  DEFAULT_SWAP_ETH_AMOUNT,
  DEFAULT_SWAP_SLIPPAGE_PERCENT,
  MFERGPT_BASE_TOKEN_ADDRESS,
  executeMferGptSwap,
  formatMferGptCompact,
  formatSwapPrice,
  getBaseScanTxUrl,
  getMferGptSwapQuote,
  makeMferGptUniswapUrl,
  normalizeSlippageInput,
  normalizeSwapAmountInput,
  type MferGptSwapQuote,
} from "../crypto/mferGptSwap";

type MferGptSwapMenuProps = {
  defaultExpanded?: boolean;
  onClose?: () => void;
  surface?: string;
  variant?: "auth" | "npc" | "embedded";
};

type EthereumRequestProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function MferGptSwapMenu({
  defaultExpanded = false,
  onClose,
  surface = "auth",
  variant = "auth",
}: MferGptSwapMenuProps = {}) {
  const [ethAmount, setEthAmount] = useState(DEFAULT_SWAP_ETH_AMOUNT);
  const [slippagePercent, setSlippagePercent] = useState(DEFAULT_SWAP_SLIPPAGE_PERCENT);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedContract, setCopiedContract] = useState(false);
  const [quote, setQuote] = useState<MferGptSwapQuote | null>(null);
  const [swapStatus, setSwapStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const quoteRequestRef = useRef(0);
  const swapUrl = useMemo(() => makeMferGptUniswapUrl(ethAmount), [ethAmount]);
  const canSwap = !isSwapping && !isQuoting && Boolean(ethAmount.trim());
  const variantClass = variant === "npc" ? "in-game-swap-panel" : variant === "embedded" ? "embedded-swap-panel" : "";
  const className = ["auth-swap-panel", "mfergpt-swap-menu", variantClass, isExpanded ? "expanded" : ""]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!ethAmount.trim()) {
      setQuote(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshQuote({ quiet: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ethAmount, slippagePercent]);

  function updateEthAmount(value: string) {
    setEthAmount(normalizeSwapAmountInput(value));
    setTxHash("");
  }

  function updateSlippagePercent(value: string) {
    setSlippagePercent(normalizeSlippageInput(value));
    setTxHash("");
  }

  function trackSwapOpen() {
    trackEvent("mfergpt_swap_opened", {
      surface,
      amountSet: ethAmount.trim() !== "",
    }, {
      local: true,
    });
  }

  function openSwapPanel() {
    setIsExpanded(true);
    trackEvent("mfergpt_swap_panel_opened", {
      surface,
      amountSet: ethAmount.trim() !== "",
    }, {
      local: true,
    });
  }

  function closeSwapPanel() {
    setIsExpanded(false);
    trackEvent("mfergpt_swap_panel_closed", {
      surface,
      amountSet: ethAmount.trim() !== "",
      quoted: Boolean(quote),
      txStarted: Boolean(txHash),
    }, {
      local: true,
    });
    onClose?.();
  }

  async function refreshQuote(options: { quiet?: boolean } = {}) {
    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    if (!options.quiet) setSwapStatus("checking pool...");
    setIsQuoting(true);
    try {
      const nextQuote = await getMferGptSwapQuote(ethAmount, slippagePercent);
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(nextQuote);
      if (!options.quiet) setSwapStatus("quote refreshed");
      return nextQuote;
    } catch (error) {
      if (quoteRequestRef.current !== requestId) return null;
      setQuote(null);
      setSwapStatus(getSwapErrorMessage(error));
      return null;
    } finally {
      if (quoteRequestRef.current === requestId) setIsQuoting(false);
    }
  }

  async function runSwap() {
    const provider = getInjectedEthereumProvider();
    if (!provider) {
      setSwapStatus("wallet required");
      trackEvent("mfergpt_swap_failed", { surface, error: "wallet required" }, { local: true });
      return;
    }

    setIsSwapping(true);
    setTxHash("");
    setSwapStatus("checking pool...");
    trackEvent("mfergpt_swap_started", { surface }, { local: true });
    try {
      const nextQuote = await getMferGptSwapQuote(ethAmount, slippagePercent);
      setQuote(nextQuote);
      setSwapStatus("confirm in wallet");
      const nextTxHash = await executeMferGptSwap(provider, nextQuote);
      setTxHash(nextTxHash);
      setSwapStatus("swap confirmed");
      trackEvent("mfergpt_swap_confirmed", {
        surface,
        slippageBps: nextQuote.slippageBps,
      }, {
        local: true,
      });
    } catch (error) {
      const message = getSwapErrorMessage(error);
      setSwapStatus(message);
      trackEvent("mfergpt_swap_failed", { surface, error: message }, { local: true });
    } finally {
      setIsSwapping(false);
    }
  }

  async function copyContractAddress() {
    try {
      await navigator.clipboard.writeText(MFERGPT_BASE_TOKEN_ADDRESS);
      setCopiedContract(true);
      window.setTimeout(() => setCopiedContract(false), 1600);
      trackEvent("mfergpt_swap_contract_copied", { surface }, { local: true });
    } catch {
      setCopiedContract(false);
    }
  }

  return (
    <section className={className} aria-label="swap ETH to MFERGPT">
      <button className="auth-swap-toggle" type="button" aria-expanded={isExpanded} onClick={openSwapPanel}>
        <ArrowDownUp size={18} />
        <span>swap</span>
      </button>

      <div className="auth-swap-card">
        <header className="auth-swap-header">
          <div>
            <span>base swap</span>
            <strong>ETH to $MFERGPT</strong>
          </div>
          <button className="auth-swap-close" type="button" aria-label="close swap" onClick={closeSwapPanel}>
            <X size={16} />
          </button>
        </header>

        <label className="swap-amount-field">
          <span>you send</span>
          <div>
            <input
              aria-label="ETH amount"
              inputMode="decimal"
              placeholder="0.01"
              value={ethAmount}
              onChange={(event) => updateEthAmount(event.target.value)}
            />
            <em>BASE ETH</em>
          </div>
        </label>

        <div className="swap-field-grid">
          <label className="swap-mini-field">
            <span>max slip</span>
            <div>
              <input
                aria-label="Max slippage percent"
                inputMode="decimal"
                value={slippagePercent}
                onChange={(event) => updateSlippagePercent(event.target.value)}
              />
              <em>%</em>
            </div>
          </label>
          <button className="swap-refresh-btn" type="button" disabled={isQuoting || isSwapping} onClick={() => void refreshQuote()}>
            <RefreshCw size={15} />
            quote
          </button>
        </div>

        <div className="swap-summary-row" aria-live="polite">
          <span>you get</span>
          <strong>{quote ? `~${formatMferGptCompact(quote.estimatedAmountOutWei)}` : "--"}</strong>
          <em>{quote ? `min ${formatMferGptCompact(quote.minAmountOutWei)} / ${formatSwapPrice(quote.priceNative)}` : "Uniswap v4 pool"}</em>
        </div>

        <div className="swap-route-row">
          <span>uniswap</span>
          <code title={MFERGPT_BASE_TOKEN_ADDRESS}>{shortAddress(MFERGPT_BASE_TOKEN_ADDRESS)}</code>
          <button type="button" title="copy contract" aria-label="copy MFERGPT contract address" onClick={() => void copyContractAddress()}>
            {copiedContract ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>

        <button className="auth-swap-action" type="button" disabled={!canSwap} onClick={() => void runSwap()}>
          <span>{isSwapping ? "swapping..." : isQuoting ? "quoting..." : "swap now"}</span>
          <ArrowDownUp size={16} />
        </button>
        <div className="swap-footer-row">
          <span className="swap-status" aria-live="polite">{swapStatus}</span>
          {txHash ? (
            <a href={getBaseScanTxUrl(txHash)} target="_blank" rel="noreferrer noopener">
              basescan
              <ExternalLink size={13} />
            </a>
          ) : (
            <a href={swapUrl} target="_blank" rel="noreferrer noopener" onClick={trackSwapOpen}>
              fallback
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getSwapErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "swap failed";
  const maybeError = error as { code?: unknown; cause?: unknown; shortMessage?: unknown; message?: unknown };
  if (isUserRejectedWalletRequest(error)) return "swap rejected";
  if (typeof maybeError.shortMessage === "string") return maybeError.shortMessage.toLowerCase();
  if (typeof maybeError.message === "string") return maybeError.message.toLowerCase();
  if (maybeError.cause) return getSwapErrorMessage(maybeError.cause);
  return "swap failed";
}

function getInjectedEthereumProvider(): EthereumRequestProvider | null {
  if (typeof window === "undefined") return null;

  const maybeWindow = window as Window & { ethereum?: Partial<EthereumRequestProvider> };
  if (typeof maybeWindow.ethereum?.request !== "function") return null;
  return maybeWindow.ethereum as EthereumRequestProvider;
}

function isUserRejectedWalletRequest(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; cause?: unknown; name?: unknown; shortMessage?: unknown; message?: unknown };
  if (maybeError.code === 4001) return true;
  if (typeof maybeError.name === "string" && maybeError.name.includes("UserRejected")) return true;
  if (isUserRejectedWalletRequest(maybeError.cause)) return true;

  const message = typeof maybeError.shortMessage === "string" ? maybeError.shortMessage : maybeError.message;
  return typeof message === "string" && /user rejected|user denied|request rejected|user closed modal|accounts received is empty/i.test(message);
}

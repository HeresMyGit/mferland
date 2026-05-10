import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableWalletConnectorChoices,
  getPreferredWalletConnector,
  getWalletConnectFailureMessage,
  getWalletConnectorChoices,
  getWalletConnectorLabel,
  type WalletConnectorSummary,
} from "./walletConnectors";

const injected = connector("injected", "Injected");
const metaMask = connector("metaMaskSDK", "MetaMask");
const coinbaseWallet = connector("coinbaseWalletSDK", "Coinbase Wallet");
const rainbowWallet = connector("walletConnect", "WalletConnect");
const mock = connector("mock", "Mock");

test("orders production wallet connectors and omits the local mock connector", () => {
  assert.deepEqual(
    getWalletConnectorChoices([rainbowWallet, coinbaseWallet, mock, metaMask, injected]).map((choice) => choice.id),
    ["injected", "metaMaskSDK", "coinbaseWalletSDK", "walletConnect"],
  );
});

test("omits the injected connector when there is no browser provider", () => {
  assert.deepEqual(
    getAvailableWalletConnectorChoices([injected, rainbowWallet, coinbaseWallet, metaMask], {
      hasInjectedProvider: false,
    }).map((choice) => choice.id),
    ["metaMaskSDK", "coinbaseWalletSDK", "walletConnect"],
  );
});

test("prefers injected wallets when the browser has a provider", () => {
  assert.equal(
    getPreferredWalletConnector([metaMask, injected, coinbaseWallet], {
      hasInjectedProvider: true,
      isMobileBrowser: true,
    })?.id,
    "injected",
  );
});

test("prefers mobile wallet handoff when no injected provider exists", () => {
  assert.equal(
    getPreferredWalletConnector([injected, coinbaseWallet, metaMask], {
      hasInjectedProvider: false,
      isMobileBrowser: true,
    })?.id,
    "metaMaskSDK",
  );
});

test("labels wallet connectors for auth buttons and errors", () => {
  assert.equal(getWalletConnectorLabel(metaMask), "metamask");
  assert.equal(getWalletConnectorLabel(coinbaseWallet), "coinbase wallet");
  assert.equal(getWalletConnectorLabel(rainbowWallet), "rainbow wallet");
  assert.equal(
    getWalletConnectFailureMessage(injected),
    "no browser wallet found; choose metamask, coinbase wallet, or rainbow wallet",
  );
});

function connector(id: string, name: string): WalletConnectorSummary {
  return { id, name };
}

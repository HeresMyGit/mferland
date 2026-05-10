import type { Connector } from "wagmi";

const WALLET_CONNECTOR_PRIORITY: Record<string, number> = {
  injected: 0,
  metaMaskSDK: 1,
  coinbaseWalletSDK: 2,
  walletConnect: 3,
};

const WALLET_CONNECTOR_LABELS: Record<string, string> = {
  injected: "browser wallet",
  metaMaskSDK: "metamask",
  coinbaseWalletSDK: "coinbase wallet",
  walletConnect: "rainbow wallet",
};

export type WalletConnectorSummary = Pick<Connector, "id" | "name">;

export function getWalletConnectorChoices<T extends WalletConnectorSummary>(connectors: readonly T[]) {
  return connectors
    .filter((connector: T) => connector.id !== "mock")
    .slice()
    .sort((left: T, right: T) => getWalletConnectorPriority(left) - getWalletConnectorPriority(right));
}

export function getAvailableWalletConnectorChoices<T extends WalletConnectorSummary>(
  connectors: readonly T[],
  options: { hasInjectedProvider: boolean },
) {
  const choices = getWalletConnectorChoices(connectors);
  if (options.hasInjectedProvider) return choices;

  const handoffChoices = choices.filter((connector: T) => connector.id !== "injected");
  return handoffChoices.length > 0 ? handoffChoices : choices;
}

export function getPreferredWalletConnector<T extends WalletConnectorSummary>(
  connectors: readonly T[],
  options: { hasInjectedProvider: boolean; isMobileBrowser: boolean },
) {
  const choices = getAvailableWalletConnectorChoices(connectors, options);
  const injected = choices.find((connector: T) => connector.id === "injected");
  const metaMask = choices.find((connector: T) => connector.id === "metaMaskSDK");
  const coinbaseWallet = choices.find((connector: T) => connector.id === "coinbaseWalletSDK");
  const rainbowWallet = choices.find((connector: T) => connector.id === "walletConnect");

  if (options.hasInjectedProvider && injected) return injected;
  if (options.isMobileBrowser) return metaMask ?? coinbaseWallet ?? rainbowWallet ?? injected ?? choices[0];
  return injected ?? metaMask ?? coinbaseWallet ?? rainbowWallet ?? choices[0];
}

export function getWalletConnectorLabel(connector: WalletConnectorSummary) {
  return WALLET_CONNECTOR_LABELS[connector.id] ?? connector.name.toLowerCase();
}

export function getWalletConnectFailureMessage(connector: WalletConnectorSummary) {
  if (connector.id === "injected") return "no browser wallet found; choose metamask, coinbase wallet, or rainbow wallet";
  return `${getWalletConnectorLabel(connector)} connection failed`;
}

function getWalletConnectorPriority(connector: WalletConnectorSummary) {
  return WALLET_CONNECTOR_PRIORITY[connector.id] ?? 100;
}

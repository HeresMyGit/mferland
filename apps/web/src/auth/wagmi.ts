import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, mock, walletConnect } from "wagmi/connectors";

export const localAnvil = {
  id: 31337,
  name: "mferland local",
  nativeCurrency: {
    name: "Anvil ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
} as const;

const dappName = "mferland";
const dappUrl = typeof window !== "undefined" ? window.location.origin : "https://mfergpt.lol";
const walletConnectProjectId = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();
const coinbaseWalletConnector = isMobileWalletHandoffBrowser()
  ? coinbaseWallet({
    appName: dappName,
    version: "3",
    enableMobileWalletLink: true,
  })
  : coinbaseWallet({
    appName: dappName,
    preference: "eoaOnly",
  });
const rainbowWalletConnectors = walletConnectProjectId
  ? [
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: dappName,
        description: "mferland wallet connection",
        url: dappUrl,
        icons: [],
      },
      qrModalOptions: {
        enableExplorer: false,
        explorerRecommendedWalletIds: "NONE",
        mobileWallets: [
          {
            id: "rainbow",
            name: "Rainbow",
            links: {
              native: "rainbow://",
              universal: "https://rnbwapp.com",
            },
          },
        ],
        desktopWallets: [
          {
            id: "rainbow",
            name: "Rainbow",
            links: {
              native: "rainbow://",
              universal: "https://rnbwapp.com",
            },
          },
        ],
      },
    }),
  ]
  : [];

const connectors = [
  injected(),
  metaMask({
    dappMetadata: {
      name: dappName,
      url: dappUrl,
    },
  }),
  coinbaseWalletConnector,
  ...rainbowWalletConnectors,
  ...(import.meta.env.DEV
    ? [mock({
      accounts: ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"],
      features: { reconnect: true },
    })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [base, mainnet, localAnvil],
  connectors,
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [localAnvil.id]: http(localAnvil.rpcUrls.default.http[0]),
  },
});

function isMobileWalletHandoffBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isTouchMac || /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

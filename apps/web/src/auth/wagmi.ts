import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { injected, mock } from "wagmi/connectors";

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

const connectors = [
  injected(),
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

import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [base, mainnet],
  connectors: [injected()],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
});

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CRYPTO_CONTRACTS_URL?: string;
  readonly VITE_ENABLE_CRYPTO_STORE?: string;
  readonly VITE_ENABLE_INVITE_GATE?: string;
  readonly VITE_ENABLE_REAL_CAPTURE?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_REQUIRE_INVITE?: string;
  readonly VITE_SERVER_URL?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

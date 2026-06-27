const DEFAULT_LOCAL_DEBUG_WALLET_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as const;

export function getLocalDebugWalletAddress(): `0x${string}` {
  return normalizeAddress(import.meta.env?.VITE_MFERLAND_DEBUG_WALLET_ADDRESS) || DEFAULT_LOCAL_DEBUG_WALLET_ADDRESS;
}

function normalizeAddress(value: unknown): `0x${string}` | "" {
  const text = typeof value === "string" ? value.trim() : "";
  return /^0x[0-9a-fA-F]{40}$/.test(text) ? text as `0x${string}` : "";
}

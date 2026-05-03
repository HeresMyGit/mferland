export type EthereumProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ReceiptWaitOptions = {
  maxAttempts?: number;
  intervalMs?: number;
  sleep?: (durationMs: number) => Promise<void>;
};

export async function waitForTransactionReceipt(
  provider: EthereumProvider,
  txHash: string,
  options: ReceiptWaitOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? 30;
  const intervalMs = options.intervalMs ?? 350;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) {
      if (isRevertedReceipt(receipt)) throw new Error("transaction reverted");
      return receipt;
    }
    await sleep(intervalMs);
  }

  throw new Error("transaction receipt timed out");
}

function isRevertedReceipt(receipt: unknown) {
  return typeof receipt === "object"
    && receipt !== null
    && "status" in receipt
    && (receipt as { status?: unknown }).status === "0x0";
}

function defaultSleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

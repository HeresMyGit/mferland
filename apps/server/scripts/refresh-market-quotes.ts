import { refreshCryptoMarketQuotes } from "../src/crypto/marketQuotes.js";
import { maybeUpdateCryptoContractPrices } from "../src/crypto/contractPricing.js";
import { closeDatabase } from "../src/db/client.js";

try {
  const result = await refreshCryptoMarketQuotes();
  const pricing = await maybeUpdateCryptoContractPrices(result.updated).catch((error) => ({
    ok: false,
    disabled: false,
    checked: 0,
    updated: [],
    skipped: [],
    errors: [{
      product: "catalog",
      error: error instanceof Error ? error.message : "Unknown contract price update error",
    }],
  }));
  console.log(JSON.stringify({ ...result, pricing }, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
} finally {
  await closeDatabase();
}

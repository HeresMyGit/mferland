import { refreshCryptoMarketQuotes } from "../src/crypto/marketQuotes.js";
import { closeDatabase } from "../src/db/client.js";

try {
  const result = await refreshCryptoMarketQuotes();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
} finally {
  await closeDatabase();
}

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REQUIRED_ADDRESSES = ["mfer", "mfergpt", "launchPass"];
const OPTIONAL_ADDRESSES = ["store", "gear", "gold", "rewards"];

const { values } = parseArgs({
  options: {
    "allow-placeholders": { type: "boolean", default: false },
    file: { type: "string", short: "f", default: "apps/web/public/crypto/production-contracts.json" },
    "full-suite": { type: "boolean", default: false },
  },
});

const configPath = values.file;
const config = JSON.parse(await readFile(configPath, "utf8"));
const problems = validateConfig(config, {
  allowPlaceholders: values["allow-placeholders"],
  fullSuite: values["full-suite"],
});

if (problems.length > 0) {
  console.error(`Invalid crypto config: ${configPath}`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Crypto config ok: ${configPath}`);

function validateConfig(config, { allowPlaceholders, fullSuite }) {
  const problems = [];
  if (!Number.isInteger(config.chainId) || config.chainId <= 0) problems.push("chainId must be a positive integer");
  if (typeof config.chainName !== "string" || config.chainName.trim() === "") problems.push("chainName is required");
  if (typeof config.rpcUrl !== "string") problems.push("rpcUrl must be a string; use an empty string only if wallets already know the chain");

  const currency = config.nativeCurrency ?? {};
  if (typeof currency.name !== "string" || currency.name.trim() === "") problems.push("nativeCurrency.name is required");
  if (typeof currency.symbol !== "string" || currency.symbol.trim() === "") problems.push("nativeCurrency.symbol is required");
  if (!Number.isInteger(currency.decimals) || currency.decimals <= 0) problems.push("nativeCurrency.decimals must be a positive integer");

  const addresses = config.addresses ?? {};
  for (const key of REQUIRED_ADDRESSES) {
    validateAddress({ key, problems, required: true, value: addresses[key], allowPlaceholders });
  }
  for (const key of OPTIONAL_ADDRESSES) {
    validateAddress({ key, problems, required: fullSuite, value: addresses[key], allowPlaceholders });
  }

  return problems;
}

function validateAddress({ key, problems, required, value, allowPlaceholders }) {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized && !required) return;
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    problems.push(`addresses.${key} must be a 20-byte 0x address${required ? "" : " or blank"}`);
    return;
  }
  if (!allowPlaceholders && normalized === ZERO_ADDRESS) problems.push(`addresses.${key} must not be the zero-address placeholder`);
}

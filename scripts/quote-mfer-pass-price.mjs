import { parseArgs } from "node:util";

const BASIS_POINTS = 10_000n;
const DECIMALS = 18n;
const UNIT = 10n ** DECIMALS;

const { values } = parseArgs({
  options: {
    "discount-bps": { type: "string", default: "1000" },
    "eth-price": { type: "string", default: "0.0069" },
    "mfer-eth": { type: "string" },
    "mfer-eth-wei": { type: "string" },
  },
});

const ethPriceWei = parseDecimalToWei(values["eth-price"], "eth-price");
const discountBps = parseBasisPoints(values["discount-bps"]);
const mferEthWei = parseMferEthWei(values["mfer-eth"], values["mfer-eth-wei"]);
const targetEthWei = ethPriceWei * (BASIS_POINTS - discountBps) / BASIS_POINTS;
const requiredMferWei = ceilDiv(targetEthWei * UNIT, mferEthWei);

console.log(JSON.stringify({
  ethPrice: formatWei(ethPriceWei),
  discountBps: Number(discountBps),
  targetEth: formatWei(targetEthWei),
  mferEth: formatWei(mferEthWei),
  requiredMfer: formatWei(requiredMferWei),
  requiredMferWei: requiredMferWei.toString(),
}, null, 2));

function parseMferEthWei(decimalValue, integerValue) {
  const hasDecimal = typeof decimalValue === "string" && decimalValue.trim() !== "";
  const hasInteger = typeof integerValue === "string" && integerValue.trim() !== "";
  if (hasDecimal && hasInteger) throw new Error("Pass either --mfer-eth or --mfer-eth-wei, not both");
  if (hasInteger) {
    if (!/^[0-9]+$/.test(integerValue.trim())) throw new Error("--mfer-eth-wei must be digits");
    const parsed = BigInt(integerValue.trim());
    if (parsed <= 0n) throw new Error("--mfer-eth-wei must be greater than zero");
    return parsed;
  }
  if (hasDecimal) return parseDecimalToWei(decimalValue, "mfer-eth");
  throw new Error("Pass --mfer-eth <ETH per 1 MFER>, for example --mfer-eth 0.00001");
}

function parseBasisPoints(value) {
  if (!/^[0-9]+$/.test(String(value ?? ""))) throw new Error("--discount-bps must be an integer");
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BASIS_POINTS) throw new Error("--discount-bps must be between 0 and 9999");
  return parsed;
}

function parseDecimalToWei(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[0-9]+(\.[0-9]{1,18})?$/.test(normalized)) {
    throw new Error(`--${label} must be a decimal with up to 18 fractional digits`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const parsed = BigInt(whole) * UNIT + BigInt(fraction.padEnd(Number(DECIMALS), "0"));
  if (parsed <= 0n) throw new Error(`--${label} must be greater than zero`);
  return parsed;
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function formatWei(value) {
  const whole = value / UNIT;
  const fraction = value % UNIT;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

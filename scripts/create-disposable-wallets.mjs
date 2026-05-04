import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const { values } = parseArgs({
  options: {
    count: { type: "string", short: "c", default: "3" },
    force: { type: "boolean", default: false },
    out: { type: "string", short: "o" },
    prefix: { type: "string", default: "tester" },
    stdout: { type: "boolean", default: false },
  },
});

if (!values.out && !values.stdout) {
  console.error("Pass --out <path> to write a private-key file, or --stdout to print it intentionally.");
  process.exit(1);
}

const count = parseCount(values.count);
const wallets = Array.from({ length: count }, (_, index) => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    label: `${values.prefix}-${index + 1}`,
    address: account.address,
    privateKey,
    warning: "Disposable testnet wallet only. Never fund with real assets.",
  };
});

const output = `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  wallets,
}, null, 2)}\n`;

if (values.out) {
  const outputPath = resolve(values.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, { encoding: "utf8", flag: values.force ? "w" : "wx", mode: 0o600 });
  console.log(`Wrote ${wallets.length} disposable test wallets to ${outputPath}`);
} else {
  console.log(output);
}

function parseCount(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error("Pass --count between 1 and 50");
  }
  return parsed;
}

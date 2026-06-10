import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { normalizeWalletAddress } from "@mferland/shared";

export type AgentWallet = {
  label: string;
  account: PrivateKeyAccount;
  generated: boolean;
};

export async function loadAgentWallets({
  count,
  walletFile,
  privateKeys,
  baseName,
}: {
  count: number;
  walletFile?: string;
  privateKeys: string[];
  baseName: string;
}) {
  const loadedPrivateKeys = [
    ...privateKeys,
    ...readPrivateKeysFromEnv(process.env.AGENT_WALLET_PRIVATE_KEYS),
    ...await readPrivateKeysFromFile(walletFile),
  ];

  const wallets: AgentWallet[] = [];
  for (let index = 0; index < loadedPrivateKeys.length && wallets.length < count; index += 1) {
    wallets.push({
      label: `${baseName}-${wallets.length + 1}`,
      account: privateKeyToAccount(normalizePrivateKey(loadedPrivateKeys[index] ?? "")),
      generated: false,
    });
  }

  while (wallets.length < count) {
    wallets.push({
      label: `${baseName}-${wallets.length + 1}`,
      account: privateKeyToAccount(generatePrivateKey()),
      generated: true,
    });
  }

  return wallets;
}

function readPrivateKeysFromEnv(value: string | undefined) {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readPrivateKeysFromFile(walletFile: string | undefined) {
  if (!walletFile) return [];
  const filePath = resolve(process.env.INIT_CWD ?? process.cwd(), walletFile);
  const contents = await readFile(filePath, "utf8");
  const parsed = JSON.parse(contents) as unknown;
  if (Array.isArray(parsed)) return parsed.map(readPrivateKeyFromRecord).filter(Boolean);
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { wallets?: unknown }).wallets)) {
    return (parsed as { wallets: unknown[] }).wallets.map(readPrivateKeyFromRecord).filter(Boolean);
  }
  throw new Error(`Wallet file ${filePath} must contain an array or { "wallets": [...] }.`);
}

function readPrivateKeyFromRecord(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const maybeKey = (value as { privateKey?: unknown }).privateKey;
    if (typeof maybeKey === "string") return maybeKey;
  }
  return "";
}

function normalizePrivateKey(value: string) {
  const privateKey = value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("Disposable wallet private keys must be 32-byte 0x-prefixed hex strings.");
  }
  return privateKey as `0x${string}`;
}

export function summarizeWallets(wallets: AgentWallet[]) {
  return wallets.map((wallet) => ({
    label: wallet.label,
    address: normalizeWalletAddress(wallet.account.address),
    generated: wallet.generated,
  }));
}

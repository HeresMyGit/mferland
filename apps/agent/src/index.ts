import { parseArgs } from "node:util";
import { stableHash } from "@mferland/shared";
import { MferlandAgentClient, delay } from "./client.js";
import { assertLocalAgentSafety, summarizeDatabaseUrl } from "./localSafety.js";
import { runLocalAgentPlaytest } from "./playtest.js";
import { loadAgentWallets, summarizeWallets } from "./wallets.js";

type AgentMode = "ambient" | "playtest";

type AgentConfig = {
  mode: AgentMode;
  serverUrl: string;
  inviteCode: string;
  count: number;
  baseName: string;
  chatEnabled: boolean;
  createCharacter: boolean;
  walletFile?: string;
  privateKeys: string[];
  localOnly: boolean;
};

const agents: MferlandAgentClient[] = [];
const config = readConfig();

assertLocalAgentSafety({
  serverUrl: config.serverUrl,
  databaseUrl: process.env.DATABASE_URL,
  localOnly: config.localOnly,
});

console.log(`Agent mode: ${config.mode}`);
console.log(`Agent server: ${config.serverUrl}`);
console.log(`Agent database guard: ${summarizeDatabaseUrl(process.env.DATABASE_URL)}`);

const wallets = await loadAgentWallets({
  count: config.count,
  walletFile: config.walletFile,
  privateKeys: config.privateKeys,
  baseName: config.baseName,
});

for (const wallet of summarizeWallets(wallets)) {
  console.log(`${wallet.label}: ${wallet.address}${wallet.generated ? " (ephemeral disposable wallet)" : " (loaded disposable wallet)"}`);
}

try {
  for (let index = 0; index < wallets.length; index += 1) {
    const wallet = wallets[index];
    if (!wallet) continue;
    const agent = new MferlandAgentClient({
      serverUrl: config.serverUrl,
      inviteCode: config.inviteCode,
      name: config.count === 1 ? config.baseName : wallet.label,
      account: wallet.account,
      avatarSeed: stableHash(`wallet-agent:${wallet.account.address}:${wallet.label}`),
      createCharacter: config.createCharacter,
      chatEnabled: config.chatEnabled,
    });
    agents.push(agent);
    await agent.connect();
    await delay(350);
  }

  if (config.mode === "playtest") {
    const result = await runLocalAgentPlaytest(agents);
    console.log(JSON.stringify({
      ok: true,
      mode: config.mode,
      defeatedDailyBoss: result.defeatedDailyBoss,
      agents: result.agents.map((agent) => ({
        name: agent.name,
        walletAddress: `${agent.walletAddress.slice(0, 6)}...${agent.walletAddress.slice(-4)}`,
        level: agent.level,
        xp: agent.xp,
        completedQuests: agent.completedQuests,
      })),
    }, null, 2));
    await shutdown(0);
  } else {
    console.log("Ambient wallet agents are running. Press Ctrl-C to stop.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}

setInterval(() => {
  if (config.mode !== "ambient") return;
  const now = Date.now();
  for (const agent of agents) agent.runAmbientDecision(now);
}, 250);

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

async function shutdown(code: number) {
  await Promise.allSettled(agents.map((agent) => agent.leave()));
  process.exit(code);
}

function readConfig(): AgentConfig {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: process.env.AGENT_MODE ?? "ambient" },
      "server-url": { type: "string", default: process.env.AGENT_SERVER_URL ?? "ws://localhost:2567" },
      "invite-code": { type: "string", default: process.env.AGENT_INVITE_CODE ?? process.env.MFERLAND_INVITE_CODE ?? "" },
      count: { type: "string", short: "c", default: process.env.AGENT_COUNT ?? "1" },
      name: { type: "string", default: process.env.AGENT_NAME ?? "mfer-agent" },
      chat: { type: "string", default: process.env.AGENT_CHAT ?? "1" },
      "create-character": { type: "boolean", default: process.env.AGENT_CREATE_CHARACTER !== "0" },
      "wallet-file": { type: "string", default: process.env.AGENT_WALLET_FILE },
      "private-key": { type: "string", multiple: true },
      "local-only": { type: "boolean", default: process.env.MFERLAND_AGENT_LOCAL_ONLY === "1" },
    },
    allowPositionals: false,
  });

  return {
    mode: normalizeMode(values.mode),
    serverUrl: values["server-url"] ?? "ws://localhost:2567",
    inviteCode: values["invite-code"] ?? "",
    count: readPositiveInt(values.count, 1),
    baseName: cleanName(values.name ?? "mfer-agent"),
    chatEnabled: values.chat !== "0",
    createCharacter: values["create-character"] !== false,
    walletFile: values["wallet-file"],
    privateKeys: Array.isArray(values["private-key"]) ? values["private-key"] : [],
    localOnly: values["local-only"] === true || process.env.MFERLAND_AGENT_LOCAL_ONLY === "1",
  };
}

function normalizeMode(value: string | undefined): AgentMode {
  if (value === "playtest" || value === "ambient") return value;
  throw new Error("AGENT_MODE/--mode must be ambient or playtest.");
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function cleanName(value: string) {
  return value.replace(/[^\w .$-]/g, "").trim().slice(0, 18) || "mfer-agent";
}

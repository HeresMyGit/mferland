import { parseArgs } from "node:util";
import { stableHash } from "@mferland/shared";
import { MferlandAgentClient, delay } from "./client.js";
import { assertLocalAgentSafety, summarizeDatabaseUrl } from "./localSafety.js";
import { runLlmGameAgent, type LlmProvider } from "./llmPolicy.js";
import { MferGptBurner } from "./mferGptPayment.js";
import { runLocalAgentPlaytest, type PlaytestScope } from "./playtest.js";
import { loadAgentWallets, summarizeWallets, type AgentWallet } from "./wallets.js";

type AgentMode = "ambient" | "playtest" | "llm";

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
  playtestScope: PlaytestScope;
  llmProvider: LlmProvider;
  llmModel: string;
  llmObjective: string;
  llmSteps: number;
  llmDecisionIntervalMs: number;
  llmDecisionTimeoutMs: number;
};

const agents: MferlandAgentClient[] = [];
const agentWallets: Array<{ agent: MferlandAgentClient; wallet: AgentWallet }> = [];
const config = readConfig();

assertLocalAgentSafety({
  serverUrl: config.serverUrl,
  databaseUrl: process.env.DATABASE_URL,
  localOnly: config.localOnly,
});

console.log(`Agent mode: ${config.mode}`);
console.log(`Agent server: ${config.serverUrl}`);
console.log(`Agent database guard: ${summarizeDatabaseUrl(process.env.DATABASE_URL)}`);
if (config.mode === "playtest") console.log(`Agent playtest scope: ${config.playtestScope}`);
if (config.mode === "llm") console.log(`Agent LLM provider: ${config.llmProvider} (${config.llmModel})`);

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
    agentWallets.push({ agent, wallet });
    await agent.connect();
    await delay(350);
  }

  if (config.mode === "playtest") {
    const result = await runLocalAgentPlaytest(agents, { scope: config.playtestScope });
    console.log(JSON.stringify({
      ok: true,
      mode: config.mode,
      scope: config.playtestScope,
      defeatedDailyBoss: result.defeatedDailyBoss,
      defeatedCentralizer: result.defeatedCentralizer,
      defeatedRaidOgre: result.defeatedRaidOgre,
      completedAllQuestIds: result.completedAllQuestIds,
      agents: result.agents.map((agent) => ({
        name: agent.name,
        walletAddress: `${agent.walletAddress.slice(0, 6)}...${agent.walletAddress.slice(-4)}`,
        level: agent.level,
        xp: agent.xp,
        completedQuests: agent.completedQuests,
      })),
    }, null, 2));
    await shutdown(0);
  } else if (config.mode === "llm") {
    const results = await Promise.allSettled(agentWallets.map(({ agent, wallet }) => runLlmGameAgent(agent, {
      model: config.llmModel,
      objective: config.llmObjective,
      provider: config.llmProvider,
      maxSteps: config.llmSteps,
      decisionIntervalMs: config.llmDecisionIntervalMs,
      decisionTimeoutMs: config.llmDecisionTimeoutMs,
      payment: MferGptBurner.fromEnv(wallet.account),
    })));
    const failed = results.filter((result) => result.status === "rejected");
    console.log(JSON.stringify({
      ok: failed.length === 0,
      mode: config.mode,
      steps: config.llmSteps,
      failures: failed.map((result) => result.status === "rejected" ? String(result.reason) : ""),
      agents: agents.map((agent) => {
        const self = agent.getSelf();
        return {
          name: self?.name ?? "",
          walletAddress: `${agent.walletAddress.slice(0, 6)}...${agent.walletAddress.slice(-4)}`,
          level: self?.level ?? 0,
          xp: self?.xp ?? 0,
          health: self ? `${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)}` : "0/0",
          position: self ? { x: round(self.x), z: round(self.z) } : null,
          quests: self?.quests ?? [],
          inventory: self?.inventory ?? [],
        };
      }),
    }, null, 2));
    await shutdown(failed.length > 0 ? 1 : 0);
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
      "playtest-scope": { type: "string", default: process.env.AGENT_PLAYTEST_SCOPE ?? "core" },
      "llm-provider": { type: "string", default: process.env.AGENT_LLM_PROVIDER },
      "llm-model": { type: "string", default: process.env.AGENT_LLM_MODEL },
      "llm-objective": {
        type: "string",
        default: process.env.AGENT_LLM_OBJECTIVE ?? "Register or continue a wallet character. If local MFERGPT payment is configured, first buy one useful potion-shop item from potion-mfer by burning MFERGPT, then progress quests like a normal human player and cooperate with visible players.",
      },
      "llm-steps": { type: "string", default: process.env.AGENT_LLM_STEPS ?? "80" },
      "llm-interval-ms": { type: "string", default: process.env.AGENT_LLM_DECISION_INTERVAL_MS ?? "1200" },
      "llm-timeout-ms": { type: "string", default: process.env.AGENT_LLM_DECISION_TIMEOUT_MS ?? "60000" },
    },
    allowPositionals: false,
  });
  const llmProvider = normalizeLlmProvider(values["llm-provider"]);

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
    playtestScope: normalizePlaytestScope(values["playtest-scope"]),
    llmProvider,
    llmModel: cleanModel(values["llm-model"] ?? defaultLlmModel(llmProvider)),
    llmObjective: cleanObjective(values["llm-objective"] ?? ""),
    llmSteps: readPositiveInt(values["llm-steps"], 80),
    llmDecisionIntervalMs: readPositiveInt(values["llm-interval-ms"], 1200),
    llmDecisionTimeoutMs: readPositiveInt(values["llm-timeout-ms"], 60_000),
  };
}

function normalizeMode(value: string | undefined): AgentMode {
  if (value === "playtest" || value === "ambient" || value === "llm") return value;
  throw new Error("AGENT_MODE/--mode must be ambient, playtest, or llm.");
}

function normalizePlaytestScope(value: string | undefined): PlaytestScope {
  if (value === "core" || value === "all") return value;
  throw new Error("AGENT_PLAYTEST_SCOPE/--playtest-scope must be core or all.");
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeLlmProvider(value: string | undefined): LlmProvider {
  const provider = (value || (process.env.OPENAI_API_KEY ? "openai" : "codex-cli")).trim().toLowerCase();
  if (provider === "openai" || provider === "codex-cli") return provider;
  throw new Error("AGENT_LLM_PROVIDER/--llm-provider must be openai or codex-cli.");
}

function defaultLlmModel(provider: LlmProvider) {
  return provider === "codex-cli"
    ? process.env.CODEX_LLM_MODEL ?? "gpt-5.4-mini"
    : "gpt-4.1-mini";
}

function cleanName(value: string) {
  return value.replace(/[^\w .$-]/g, "").trim().slice(0, 18) || "mfer-agent";
}

function cleanModel(value: string) {
  return value.replace(/[^\w:.-]/g, "").trim().slice(0, 80) || "gpt-4.1-mini";
}

function cleanObjective(value: string) {
  return value.trim().slice(0, 800) || "Play mferland as a normal wallet player.";
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

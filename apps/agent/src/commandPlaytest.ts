import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { toHttpServerUrl } from "./localSafety.js";
import type { AgentWallet } from "./wallets.js";

type JsonRecord = Record<string, unknown>;

export type AgentCommandPlaytestOptions = {
  serverUrl: string;
  baseName: string;
  command?: string;
  behaviorScheme?: string;
  objective?: string;
  maxSeconds?: number;
  maxRuntimeMs?: number;
  pollMs?: number;
  outputFile?: string;
};

type CommandPlaytestAgent = {
  label: string;
  wallet: AgentWallet;
  walletAddress: string;
  viewerUrl: string;
  sessionToken: string;
  bridgeSessionId: string;
  activeCommandId: string;
  firstCommandStartedAt: string;
  commandCount: number;
  completedQuestCount: number;
  lastSummary: string;
  lastStatus: string;
  lastResult: unknown;
  lastSandbox: unknown;
  lastBudget: unknown;
  lastUsage: { remainingSeconds?: number } | null;
  lastUnblockAt: number;
  unblockCount: number;
  exhausted: boolean;
  error: string;
};

export type AgentCommandPlaytestResult = {
  ok: boolean;
  launchSpanMs: number;
  startedAt: string;
  finishedAt: string;
  agents: Array<ReturnType<typeof redactAgent>>;
};

const DEFAULT_COMMAND = "finish_next_quest";
const DEFAULT_BEHAVIOR_SCHEME = "quester";
const DEFAULT_POLL_MS = 5000;
const DEFAULT_MAX_RUNTIME_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SECONDS = 24 * 60 * 60;
const UNBLOCK_COOLDOWN_MS = 30_000;

export async function runAgentCommandPlaytest(
  wallets: AgentWallet[],
  options: AgentCommandPlaytestOptions,
): Promise<AgentCommandPlaytestResult> {
  const httpBase = toHttpServerUrl(options.serverUrl);
  const startedAt = new Date().toISOString();
  const pollMs = positiveNumber(options.pollMs, DEFAULT_POLL_MS);
  const maxRuntimeMs = positiveNumber(options.maxRuntimeMs, DEFAULT_MAX_RUNTIME_MS);
  const maxSeconds = positiveNumber(options.maxSeconds, DEFAULT_MAX_SECONDS);
  const agents: CommandPlaytestAgent[] = wallets.map((wallet, index) => ({
    label: wallets.length === 1 ? options.baseName : wallet.label || `${options.baseName}-${index + 1}`,
    wallet,
    walletAddress: wallet.account.address.toLowerCase(),
    viewerUrl: `${httpBase.replace(/:\d+$/, ":5173")}/agent-view?wallet=${encodeURIComponent(wallet.account.address)}`,
    sessionToken: "",
    bridgeSessionId: "",
    activeCommandId: "",
    firstCommandStartedAt: "",
    commandCount: 0,
    completedQuestCount: 0,
    lastSummary: "",
    lastStatus: "",
    lastResult: null,
    lastSandbox: null,
    lastBudget: null,
    lastUsage: null,
    lastUnblockAt: 0,
    unblockCount: 0,
    exhausted: false,
    error: "",
  }));

  const client = new CommandPlaytestHttpClient(httpBase);
  await writeStatus(options.outputFile, httpBase, "starting", agents);
  await Promise.all(agents.map((agent) => startBridgeAgent(client, agent, options)));
  await Promise.all(agents.map((agent) => startNextCommand(client, agent, options, maxSeconds)));
  const launchTimes = agents
    .map((agent) => agent.firstCommandStartedAt ? Date.parse(agent.firstCommandStartedAt) : 0)
    .filter(Boolean);
  const launchSpanMs = launchTimes.length > 1 ? Math.max(...launchTimes) - Math.min(...launchTimes) : 0;

  const runStartedAt = Date.now();
  while (Date.now() - runStartedAt < maxRuntimeMs && agents.some((agent) => shouldContinue(agent))) {
    await Promise.all(agents.map(async (agent) => {
      if (!shouldContinue(agent)) return;
      if (!agent.activeCommandId) {
        await startNextCommand(client, agent, options, maxSeconds);
        return;
      }
      const command = await getCommand(client, agent);
      rememberCommand(agent, command);
      if (String(command.status || "") === "running") {
        await maybeUnblockVisibleQuest(client, agent, command);
        return;
      }
      agent.activeCommandId = "";
      if (Number(agent.lastUsage?.remainingSeconds ?? 0) <= 0 || String(command.status || "") === "failed") {
        agent.exhausted = true;
      }
    }));
    await writeStatus(options.outputFile, httpBase, "running", agents);
    await delay(pollMs);
  }

  await Promise.allSettled(agents.map((agent) => agent.activeCommandId
    ? stopActiveCommand(client, agent)
    : null));
  await Promise.allSettled(agents.map((agent) => stopBridgeAgent(client, agent)));
  await writeStatus(options.outputFile, httpBase, "stopped", agents);

  const finishedAt = new Date().toISOString();
  return {
    ok: agents.every((agent) => !agent.error) && launchTimes.length === agents.length && launchSpanMs <= 60_000,
    launchSpanMs,
    startedAt,
    finishedAt,
    agents: agents.map(redactAgent),
  };
}

async function startBridgeAgent(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent, options: AgentCommandPlaytestOptions) {
  const challenge = await client.json("/wallet-auth-challenge", {
    method: "POST",
    body: { walletAddress: agent.walletAddress },
  });
  const signature = await agent.wallet.account.signMessage({ message: String(challenge.message || "") });
  const session = await client.json("/agent-session", {
    method: "POST",
    body: {
      walletAddress: agent.walletAddress,
      walletAuth: {
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
      },
    },
  });
  agent.sessionToken = String(session.sessionToken || "");
  const bridge = await client.json("/agent-start", {
    method: "POST",
    bearer: agent.sessionToken,
    body: {
      walletAddress: agent.walletAddress,
      sessionToken: agent.sessionToken,
      name: agent.label,
      createCharacter: true,
      objective: options.objective || `${agent.label}: play through mferland naturally for as long as command budget allows.`,
    },
  });
  agent.bridgeSessionId = String(bridge.bridgeSessionId || "");
}

async function startNextCommand(
  client: CommandPlaytestHttpClient,
  agent: CommandPlaytestAgent,
  options: AgentCommandPlaytestOptions,
  maxSeconds: number,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await client.jsonResponse("/agent-command", {
      method: "POST",
      bearer: agent.sessionToken,
      body: {
        operation: "start",
        bridgeSessionId: agent.bridgeSessionId,
        command: options.command || DEFAULT_COMMAND,
        behaviorScheme: options.behaviorScheme || DEFAULT_BEHAVIOR_SCHEME,
        objective: options.objective || `${agent.label}: finish the next visible quest, fight and loot safely, coordinate with nearby agents, and keep progressing.`,
        maxSeconds,
      },
    });
    if (result.ok && result.statusCode === 202) {
      agent.activeCommandId = String(result.body.commandId || "");
      agent.commandCount += 1;
      if (!agent.firstCommandStartedAt) agent.firstCommandStartedAt = new Date().toISOString();
      rememberCommand(agent, result.body);
      return;
    }
    const message = String(result.body.error || `HTTP ${result.statusCode}`);
    if (result.statusCode === 429) {
      agent.exhausted = true;
      agent.activeCommandId = "";
      return;
    }
    if (result.statusCode === 409 && /player state/.test(message)) {
      await delay(500);
      continue;
    }
    agent.error = `${agent.label} command start failed: ${message}`;
    return;
  }
  agent.error = `${agent.label} command start timed out waiting for player state`;
}

async function maybeUnblockVisibleQuest(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent, command: JsonRecord) {
  const summary = `${String(command.summary || "")} ${agent.lastSummary}`;
  const commandAgeMs = Math.max(0, Date.now() - Date.parse(String(command.startedAt || "")));
  if (!/(set-your-traits|tweet-town-link)/.test(summary) && commandAgeMs < 10_000) return;
  if (Date.now() - agent.lastUnblockAt < UNBLOCK_COOLDOWN_MS) return;

  const observed = await observe(client, agent);
  if (!hasQuestNeedingUnblock(observed)) return;

  agent.lastUnblockAt = Date.now();
  agent.unblockCount += 1;
  await stopActiveCommand(client, agent);
  await performQuestUnblockers(client, agent, observed);
}

async function performQuestUnblockers(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent, initialObservation: JsonRecord) {
  let observation = initialObservation;
  if (questStatus(observation, "set-your-traits") === "active") {
    await sendAction(client, agent, {
      action: "move_near_npc",
      npcRef: "traits-mfer",
      reason: "The active traits quest requires using the normal traits-mfer interaction.",
    });
    await sendAction(client, agent, {
      action: "interact_npc",
      npcRef: "traits-mfer",
      reason: "Open the normal traits affordance before saving the agent look.",
    });
    await sendAction(client, agent, {
      action: "update_traits",
      traits: null,
      reason: "Save deterministic wallet/name-seeded agent traits for the active traits quest.",
    });
    await delay(1000);
    observation = await observe(client, agent);
  }

  if (["active", "ready"].includes(questStatus(observation, "set-your-traits"))) {
    await completeQuest(client, agent, "set-your-traits", "traits-mfer");
    await delay(750);
    observation = await observe(client, agent);
  }

  if (questStatus(observation, "tweet-town-link") === "active") {
    await sendAction(client, agent, {
      action: "share_quest_link",
      questId: "tweet-town-link",
      reason: "The active quest requires sharing the normal public quest link.",
    });
    await delay(1000);
    observation = await observe(client, agent);
  }

  if (["active", "ready"].includes(questStatus(observation, "tweet-town-link"))) {
    await completeQuest(client, agent, "tweet-town-link", "mfergpt");
  }
}

async function completeQuest(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent, questId: string, npcRef: string) {
  await sendAction(client, agent, {
    action: "complete_quest",
    questId,
    npcRef,
    reason: `${questId} is ready or progress-complete and should be turned in through the normal quest flow.`,
  });
}

async function stopActiveCommand(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent) {
  if (!agent.activeCommandId) return;
  const commandId = agent.activeCommandId;
  const result = await client.jsonResponse("/agent-command-stop", {
    method: "POST",
    bearer: agent.sessionToken,
    body: {
      bridgeSessionId: agent.bridgeSessionId,
      commandId,
    },
  });
  if (result.ok) rememberCommand(agent, result.body);
  agent.activeCommandId = "";
}

async function getCommand(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent) {
  return client.json(`/agent-command?bridgeSessionId=${encodeURIComponent(agent.bridgeSessionId)}&commandId=${encodeURIComponent(agent.activeCommandId)}`, {
    bearer: agent.sessionToken,
  });
}

async function observe(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent) {
  return client.json(`/agent-observe?bridgeSessionId=${encodeURIComponent(agent.bridgeSessionId)}&view=bankr`, {
    bearer: agent.sessionToken,
  });
}

async function sendAction(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent, payload: JsonRecord) {
  await client.jsonResponse("/agent-action", {
    method: "POST",
    bearer: agent.sessionToken,
    body: {
      bridgeSessionId: agent.bridgeSessionId,
      ...payload,
    },
  });
}

async function stopBridgeAgent(client: CommandPlaytestHttpClient, agent: CommandPlaytestAgent) {
  if (!agent.bridgeSessionId || !agent.sessionToken) return;
  await client.jsonResponse("/agent-stop", {
    method: "POST",
    bearer: agent.sessionToken,
    body: { bridgeSessionId: agent.bridgeSessionId },
  });
}

function hasQuestNeedingUnblock(observation: JsonRecord) {
  return ["set-your-traits", "tweet-town-link"]
    .some((questId) => ["active", "ready"].includes(questStatus(observation, questId)));
}

function questStatus(observation: JsonRecord, questId: string) {
  for (const quest of allObservedQuests(observation)) {
    if (String(quest.id || "") === questId) return String(quest.status || "");
  }
  return "";
}

function allObservedQuests(observation: JsonRecord): JsonRecord[] {
  const quests = asRecord(observation.quests);
  return [
    ...asArray(quests.active),
    ...asArray(quests.ready),
    ...asArray(asRecord(observation.self).quests),
  ].map(asRecord);
}

function rememberCommand(agent: CommandPlaytestAgent, command: JsonRecord) {
  agent.lastStatus = String(command.status || "");
  agent.lastSummary = String(command.summary || "");
  agent.lastResult = command.result || null;
  agent.lastSandbox = command.sandbox || null;
  agent.lastBudget = command.budget || null;
  agent.lastUsage = asRecord(command.usage) as { remainingSeconds?: number };
  const questChanges = asArray(command.questChanges).map(asRecord);
  agent.completedQuestCount += questChanges.filter((change) => String(change.after || "").startsWith("completed")).length;
}

async function writeStatus(outputFile: string | undefined, httpBase: string, state: string, agents: CommandPlaytestAgent[]) {
  if (!outputFile) return;
  const filePath = resolve(process.env.INIT_CWD ?? process.cwd(), outputFile);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({
    ok: true,
    state,
    updatedAt: new Date().toISOString(),
    httpBase,
    agents: agents.map(redactAgent),
  }, null, 2)}\n`);
}

function redactAgent(agent: CommandPlaytestAgent) {
  return {
    label: agent.label,
    walletAddress: agent.walletAddress,
    viewerUrl: agent.viewerUrl,
    bridgeSessionId: agent.bridgeSessionId,
    activeCommandId: agent.activeCommandId,
    firstCommandStartedAt: agent.firstCommandStartedAt,
    commandCount: agent.commandCount,
    completedQuestCount: agent.completedQuestCount,
    lastStatus: agent.lastStatus,
    lastSummary: agent.lastSummary,
    result: agent.lastResult,
    sandbox: agent.lastSandbox,
    budget: agent.lastBudget,
    usage: agent.lastUsage,
    unblockCount: agent.unblockCount,
    exhausted: agent.exhausted,
    error: agent.error,
  };
}

function shouldContinue(agent: CommandPlaytestAgent) {
  return !agent.error && !agent.exhausted;
}

class CommandPlaytestHttpClient {
  constructor(private readonly httpBase: string) {}

  async json(path: string, options: { method?: string; bearer?: string; body?: unknown } = {}) {
    const result = await this.jsonResponse(path, options);
    if (!result.ok) throw new Error(String(result.body.error || `${path} HTTP ${result.statusCode}`));
    return result.body;
  }

  async jsonResponse(path: string, options: { method?: string; bearer?: string; body?: unknown } = {}) {
    const response = await fetch(`${this.httpBase}${path}`, {
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const body = asRecord(text ? JSON.parse(text) : {});
    return { ok: response.ok, statusCode: response.status, body };
  }
}

function positiveNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

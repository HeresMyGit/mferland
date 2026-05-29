import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAT,
  COMBAT,
  ITEMS,
  POTION_SHOP_NPC_ID,
  QUESTS,
  QUEST_IDS,
  getNpcQuestIds,
  getNpcQuestMarker,
  getPotionShopPrice,
  getQuestTurnInNpcId,
  isPotionShopItemId,
  isPotionShopPurchaseQuantity,
  isQuestAvailableForSnapshots,
  isQuestReadyToRepeat,
  type CombatActionId,
  type EmoteId,
  type ItemId,
  type PlayerSnapshot,
  type PotionShopItemId,
  type PotionShopPurchaseQuantity,
  type QuestId,
  type TargetSelection,
} from "@mferland/shared";
import { MferlandAgentClient, delay, type Point } from "./client.js";
import { getGameAgentHandbook } from "./humanKnowledge.js";
import type { MferGptBurner } from "./mferGptPayment.js";

export type LlmProvider = "openai" | "codex-cli";

export type LlmGameAgentOptions = {
  apiKey?: string;
  endpoint?: string;
  provider: LlmProvider;
  model: string;
  objective: string;
  maxSteps: number;
  decisionIntervalMs: number;
  decisionTimeoutMs: number;
  payment?: MferGptBurner | null;
  log?: (message: string) => void;
};

type ActionPolicy = {
  decide(observation: VisibleObservation): Promise<LlmDecision>;
};

type RunMemory = {
  purchasedPotionShopItemIds: Set<string>;
  recentActions: string[];
};

type VisibleRefMap = {
  npcs: Map<string, string>;
  players: Map<string, string>;
};

type VisibleObservation = {
  wallet: {
    address: string;
    mferGptPaymentConfigured: boolean;
    mferGptPaymentNote: string;
  };
  runMemory: {
    purchasedPotionShopItemIds: string[];
    recentActions: string[];
  };
  self: {
    name: string;
    level: number;
    xp: number;
    health: string;
    mana: string;
    position: Point;
    inCombat: boolean;
    activeOrReadyQuests: Array<{
      questId: string;
      title: string;
      status: string;
      progress: string;
      objective: string;
      turnInNpcId: string;
    }>;
    completedQuestIds: string[];
    inventory: Array<{
      itemId: string;
      name: string;
      count: number;
      kind: string;
      description: string;
    }>;
    equipment: Array<{
      slot: string;
      itemId: string;
      itemName: string;
    }>;
    activeBuffs: Array<{
      itemId: string;
      name: string;
      effect: string;
      expiresInSeconds: number;
    }>;
    unlockedCombatActions: string[];
  };
  nearbyNpcs: Array<{
    ref: string;
    name: string;
    role: string;
    health: string;
    distance: number;
    position: Point;
    dialogue: string;
    alive: boolean;
    hasLoot: boolean;
    questMarker: string;
    availableQuestIds: string[];
    readyTurnInQuestIds: string[];
    questId: string;
  }>;
  nearbyPlayers: Array<{
    ref: string;
    name: string;
    identityType: string;
    health: string;
    mana: string;
    distance: number;
    position: Point;
    animation: string;
  }>;
  recentChat: Array<{
    name: string;
    text: string;
    kind: string;
  }>;
  questTrackerHints: string[];
  actionContract: {
    output: string;
    actions: string[];
    notes: string[];
  };
};

type LlmDecision = {
  action: string;
  reason: string;
  routeId?: string;
  x?: number;
  z?: number;
  npcRef?: string;
  playerRef?: string;
  questId?: string;
  itemId?: string;
  quantity?: number;
  actionId?: string;
  text?: string;
  emoteId?: string;
  sprint?: boolean;
};

const ACTIONS = [
  "wait",
  "move_to",
  "travel_route",
  "move_near_npc",
  "move_near_player",
  "respawn",
  "interact_npc",
  "accept_quest",
  "complete_quest",
  "cancel_quest",
  "select_npc",
  "select_player",
  "use_ability",
  "fight_npc",
  "loot",
  "equip_item",
  "use_item",
  "update_traits",
  "emote",
  "chat",
  "buy_potion_shop_item",
] as const;

const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ACTIONS },
    reason: { type: "string" },
    routeId: { type: ["string", "null"] },
    x: { type: ["number", "null"] },
    z: { type: ["number", "null"] },
    npcRef: { type: ["string", "null"] },
    playerRef: { type: ["string", "null"] },
    questId: { type: ["string", "null"] },
    itemId: { type: ["string", "null"] },
    quantity: { type: ["number", "null"] },
    actionId: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    emoteId: { type: ["string", "null"] },
    sprint: { type: ["boolean", "null"] },
  },
  required: ["action", "reason", "routeId", "x", "z", "npcRef", "playerRef", "questId", "itemId", "quantity", "actionId", "text", "emoteId", "sprint"],
};

export async function runLlmGameAgent(agent: MferlandAgentClient, options: LlmGameAgentOptions) {
  const policy = createActionPolicy(options);
  const log = options.log ?? console.log;
  const memory: RunMemory = {
    purchasedPotionShopItemIds: new Set<string>(),
    recentActions: [],
  };
  for (let step = 1; step <= options.maxSteps; step += 1) {
    const frame = makeVisibleObservation(agent, {
      mferGptPaymentConfigured: Boolean(options.payment),
    }, memory);
    if (!frame) {
      await delay(options.decisionIntervalMs);
      continue;
    }
    const decision = await policy.decide(frame.observation);
    log(`[llm:${agent.walletAddress.slice(0, 6)}] step ${step}: ${decision.action} - ${decision.reason}`);
    try {
      await executeDecision(agent, decision, frame.refs, options.payment ?? null, memory);
      rememberAction(memory, decision, "ok");
    } catch (error) {
      log(`[llm:${agent.walletAddress.slice(0, 6)}] action failed: ${error instanceof Error ? error.message : String(error)}`);
      rememberAction(memory, decision, "failed");
      await delay(750);
    }
    await delay(options.decisionIntervalMs);
  }
}

function createActionPolicy(options: LlmGameAgentOptions): ActionPolicy {
  if (options.provider === "codex-cli") return new CodexCliActionPolicy(options);
  return new OpenAiActionPolicy(options);
}

export function makeVisibleObservation(
  agent: MferlandAgentClient,
  capabilities: { mferGptPaymentConfigured?: boolean } = {},
  memory: RunMemory = { purchasedPotionShopItemIds: new Set<string>(), recentActions: [] },
): { observation: VisibleObservation; refs: VisibleRefMap } | null {
  const raw = agent.observe();
  if (!raw) return null;
  const npcRefs = new Map<string, string>();
  const playerRefs = new Map<string, string>();
  const self = raw.self;

  const nearbyNpcs = raw.nearbyNpcs.slice(0, 12).map((npc, index) => {
    const ref = `npc${index + 1}`;
    npcRefs.set(ref, npc.id);
    npcRefs.set(npc.id, npc.id);
    return {
      ref,
      name: npc.name,
      role: npc.role,
      health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
      distance: round(npc.distance),
      position: point(npc),
      dialogue: npc.dialogue,
      alive: npc.health > 0 && npc.defeatedAt <= 0,
      hasLoot: npc.hasLoot,
      questMarker: getNpcQuestMarker(npc, self.quests) ?? "",
      availableQuestIds: getAvailableQuestIds(npc.id, self.quests),
      readyTurnInQuestIds: getReadyTurnInQuestIds(npc.id, self.quests),
      questId: npc.questId,
    };
  });

  const nearbyPlayers = raw.nearbyPlayers.slice(0, 8).map((player, index) => {
    const ref = `player${index + 1}`;
    playerRefs.set(ref, player.sessionId);
    playerRefs.set(player.name.toLowerCase(), player.sessionId);
    return {
      ref,
      name: player.name,
      identityType: player.identityType,
      health: `${Math.ceil(player.health)}/${Math.ceil(player.maxHealth)}`,
      mana: `${Math.ceil(player.mana)}/${Math.ceil(player.maxMana)}`,
      distance: round(player.distance),
      position: point(player),
      animation: player.animation,
    };
  });

  return {
    refs: { npcs: npcRefs, players: playerRefs },
    observation: {
      wallet: {
        address: agent.walletAddress,
        mferGptPaymentConfigured: Boolean(capabilities.mferGptPaymentConfigured),
        mferGptPaymentNote: capabilities.mferGptPaymentConfigured
          ? "This local disposable wallet has an MFERGPT burn signer configured for potion-shop purchases. The purchase action will still fail normally if the local token balance is insufficient."
          : "No MFERGPT payment signer is configured for this run.",
      },
      runMemory: {
        purchasedPotionShopItemIds: [...memory.purchasedPotionShopItemIds],
        recentActions: memory.recentActions.slice(-8),
      },
      self: {
        name: self.name,
        level: self.level,
        xp: self.xp,
        health: `${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)}`,
        mana: `${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)}`,
        position: point(self),
        inCombat: raw.nearbyNpcs.some((npc) => npc.aggroTargetId === self.sessionId),
        activeOrReadyQuests: self.quests
          .filter((quest) => quest.status !== "completed")
          .map((quest) => {
            const definition = QUESTS[quest.id] as typeof QUESTS[QuestId] & { turnInNpcId?: string };
            return {
              questId: quest.id,
              title: definition.title,
              status: quest.status,
              progress: `${quest.progress}/${quest.required}`,
              objective: definition.objectiveLabel,
              turnInNpcId: definition.turnInNpcId ?? definition.giverNpcId,
            };
          }),
        completedQuestIds: self.quests
          .filter((quest) => quest.status === "completed")
          .map((quest) => quest.id),
        inventory: self.inventory.map((item) => {
          const definition = ITEMS[item.id] as typeof ITEMS[ItemId] & {
            consumable?: { kind: string };
            equipment?: unknown;
          };
          return {
            itemId: item.id,
            name: definition.name,
            count: item.count,
            kind: definition.consumable?.kind ?? (definition.equipment ? "equipment" : "item"),
            description: definition.description,
          };
        }),
        equipment: self.equipment.map((slot) => ({
          slot: slot.slot,
          itemId: slot.itemId,
          itemName: slot.itemId ? ITEMS[slot.itemId].name : "",
        })),
        activeBuffs: self.activeBuffs.map((buff) => ({
          itemId: buff.itemId,
          name: buff.name,
          effect: buff.effectLabel,
          expiresInSeconds: Math.max(0, Math.ceil((buff.expiresAt - Date.now()) / 1000)),
        })),
        unlockedCombatActions: Object.keys(COMBAT.actions).filter((actionId) => isProbablyUnlocked(self, actionId as CombatActionId)),
      },
      nearbyNpcs,
      nearbyPlayers,
      recentChat: raw.recentChat.map((message) => ({
        name: message.name,
        text: message.text,
        kind: message.kind ?? "say",
      })),
      questTrackerHints: getQuestTrackerHints(self.quests),
      actionContract: {
        output: "Return one JSON object only. Pick exactly one action.",
        actions: [...ACTIONS],
        notes: [
          "Use npcRef/playerRef from this observation when available.",
          "Use questTrackerHints as the public quest-log style guide for what to do next.",
          "Use known npcId from the handbook only for moving toward public, named NPCs.",
          "Use travel_route with routeId=plaza-to-daily-signal-camp or routeId=daily-signal-camp-to-mfergpt for known public roads.",
          "For quests, prefer accept_quest only from nearbyNpcs.availableQuestIds and complete_quest only from nearbyNpcs.readyTurnInQuestIds.",
          "Use fight_npc for sustained combat, but only with a currently visible npcRef.",
          "Use buy_potion_shop_item only when observation.wallet.mferGptPaymentConfigured is true and you intentionally want to burn MFERGPT for potion-mfer inventory.",
          "If observation.runMemory.purchasedPotionShopItemIds already includes an item, do not buy that item again; use it or continue questing.",
          "Use respawn when your health is 0.",
          "Never ask for database reads, scripts, debug commands, hidden state, teleporting, or boosting.",
        ],
      },
    },
  };
}

export function normalizeLlmDecision(value: unknown): LlmDecision {
  if (!value || typeof value !== "object") return { action: "wait", reason: "invalid empty model action" };
  const record = value as Record<string, unknown>;
  const action = typeof record.action === "string" && (ACTIONS as readonly string[]).includes(record.action)
    ? record.action
    : "wait";
  return {
    action,
    reason: cleanText(record.reason, 220) || "no reason supplied",
    routeId: cleanText(record.routeId, 80),
    x: readFiniteNumber(record.x),
    z: readFiniteNumber(record.z),
    npcRef: cleanText(record.npcRef, 80),
    playerRef: cleanText(record.playerRef, 80),
    questId: cleanText(record.questId, 80),
    itemId: cleanText(record.itemId, 80),
    quantity: readFiniteNumber(record.quantity),
    actionId: cleanText(record.actionId, 40),
    text: cleanText(record.text, CHAT.maxLength),
    emoteId: cleanText(record.emoteId, 40),
    sprint: typeof record.sprint === "boolean" ? record.sprint : undefined,
  };
}

class OpenAiActionPolicy implements ActionPolicy {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly objective: string;

  constructor(options: LlmGameAgentOptions) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.endpoint = options.endpoint ?? process.env.OPENAI_RESPONSES_URL ?? "https://api.openai.com/v1/responses";
    this.model = options.model;
    this.objective = options.objective;
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is required for --mode llm.");
  }

  async decide(observation: VisibleObservation): Promise<LlmDecision> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: [
          "You are a mferland game-playing agent, not a coding agent.",
          "You only know the public handbook and the current in-game observation.",
          "Choose one normal in-game action that a human player could take.",
          "For quest actions, treat observation.questTrackerHints plus nearbyNpcs available/ready quest ids as the current legal quest state.",
          "Never complete a quest unless the current observation says it is ready.",
          "Never request database reads, scripts, hidden server state, debug messages, teleport, boost, or privileged shortcuts.",
          "Prefer making quest progress. When observation.wallet.mferGptPaymentConfigured is true, buy useful potion-shop items with MFERGPT by burning tokens through the normal payment flow.",
        ].join("\n"),
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              objective: this.objective,
              handbook: getGameAgentHandbook(),
              observation,
            }),
          }],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "mferland_agent_action",
            strict: true,
            schema: ACTION_SCHEMA,
          },
        },
        max_output_tokens: 400,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : `${response.status} ${response.statusText}`;
      throw new Error(`OpenAI response failed: ${message}`);
    }
    return normalizeLlmDecision(parseModelJson(payload));
  }
}

class CodexCliActionPolicy implements ActionPolicy {
  private readonly model: string;
  private readonly objective: string;
  private readonly timeoutMs: number;

  constructor(options: LlmGameAgentOptions) {
    this.model = options.model || process.env.CODEX_LLM_MODEL?.trim() || "gpt-5.4-mini";
    this.objective = options.objective;
    this.timeoutMs = options.decisionTimeoutMs;
  }

  async decide(observation: VisibleObservation): Promise<LlmDecision> {
    const tempDir = await mkdtemp(join(tmpdir(), "mferland-agent-codex-"));
    const outputPath = join(tempDir, "action.json");
    const schemaPath = join(tempDir, "schema.json");
    try {
      await writeFile(schemaPath, `${JSON.stringify(ACTION_SCHEMA, null, 2)}\n`, "utf8");
      const result = await runCodexExec({
        model: this.model,
        outputPath,
        prompt: buildCodexActionPrompt(this.objective, observation),
        schemaPath,
        tempDir,
        timeoutMs: this.timeoutMs,
      });
      if (!result.ok) {
        const suffix = result.reason === "timeout"
          ? `timed out after ${this.timeoutMs}ms`
          : `exited ${result.code ?? ""}${result.signal ? ` signal ${result.signal}` : ""}`.trim();
        throw new Error(`Codex CLI decision ${suffix}${result.stderr ? `: ${result.stderr.slice(-600)}` : ""}`);
      }
      const text = await readFile(outputPath, "utf8").catch(() => result.stdout);
      return normalizeLlmDecision(parseModelJson(text));
    } finally {
      await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
    }
  }
}

async function executeDecision(
  agent: MferlandAgentClient,
  decision: LlmDecision,
  refs: VisibleRefMap,
  payment: MferGptBurner | null,
  memory: RunMemory,
) {
  switch (decision.action) {
    case "respawn":
      agent.respawn();
      await delay(1000);
      return;
    case "move_to":
      await agent.moveToPoint({ x: requiredNumber(decision.x, "x"), z: requiredNumber(decision.z, "z") }, {
        range: 2.4,
        sprint: decision.sprint ?? true,
        timeoutMs: 60_000,
      });
      return;
    case "travel_route":
      await agent.moveAlong(resolveRoute(decision.routeId), { range: 8, sprint: decision.sprint ?? true, timeoutMs: 60_000 });
      return;
    case "move_near_npc":
      await agent.moveToNpc(resolveNpcRef(refs, decision.npcRef), { range: 3, timeoutMs: 60_000 });
      return;
    case "move_near_player":
      await moveNearPlayer(agent, resolvePlayerRef(refs, decision.playerRef));
      return;
    case "interact_npc":
      await agent.interactWithNpc(resolveNpcRef(refs, decision.npcRef));
      return;
    case "accept_quest": {
      const questId = resolveQuestId(decision.questId);
      assertQuestAcceptable(agent, questId);
      await agent.acceptQuest(questId, optionalNpcRef(refs, decision.npcRef));
      return;
    }
    case "complete_quest": {
      const questId = resolveQuestId(decision.questId);
      assertQuestCompletable(agent, questId);
      await agent.completeQuest(questId, optionalNpcRef(refs, decision.npcRef));
      return;
    }
    case "cancel_quest":
      agent.cancelQuest(resolveQuestId(decision.questId));
      return;
    case "select_npc":
      agent.selectTarget({ kind: "npc", id: resolveNpcRef(refs, decision.npcRef) });
      return;
    case "select_player":
      agent.selectTarget({ kind: "player", id: resolvePlayerRef(refs, decision.playerRef) });
      return;
    case "use_ability":
      agent.useCombatAbility(resolveCombatAction(decision.actionId), resolveTarget(refs, decision));
      return;
    case "fight_npc":
      await agent.fightNpc(resolveVisibleNpcRef(refs, decision.npcRef), {
        timeoutMs: 90_000,
        preferredActions: ["signalShot", "shoot", "attack"],
      });
      return;
    case "loot":
      agent.lootNpc(resolveNpcRef(refs, decision.npcRef));
      return;
    case "equip_item":
      agent.equipItem(resolveItemId(decision.itemId));
      return;
    case "use_item":
      agent.useItem(resolveItemId(decision.itemId));
      return;
    case "update_traits":
      await agent.moveToNpc("traits-mfer", { range: 2.8, timeoutMs: 15_000 });
      agent.updateTraits();
      await delay(1000);
      return;
    case "emote":
      agent.emote(resolveEmoteId(decision.emoteId));
      return;
    case "chat":
      agent.chat(decision.text || "gm");
      return;
    case "buy_potion_shop_item":
      await buyPotionShopItem(agent, decision, payment, memory);
      return;
    case "wait":
    default:
      await delay(1500);
  }
}

async function buyPotionShopItem(
  agent: MferlandAgentClient,
  decision: LlmDecision,
  payment: MferGptBurner | null,
  memory: RunMemory,
) {
  if (!payment) throw new Error("MFERGPT payment is not configured for this agent.");
  const itemId = resolvePotionShopItemId(decision.itemId);
  const quantity = resolvePotionShopQuantity(decision.quantity);
  if (memory.purchasedPotionShopItemIds.has(itemId)) {
    await delay(250);
    return;
  }
  const price = getPotionShopPrice(quantity, itemId);
  await agent.interactWithNpc(POTION_SHOP_NPC_ID);
  const proof = await payment.burn(price.amountWei, price.label);
  await agent.purchasePotionShopItem(itemId, quantity, proof);
  memory.purchasedPotionShopItemIds.add(itemId);
}

function rememberAction(memory: RunMemory, decision: LlmDecision, status: "ok" | "failed") {
  const detail = [
    decision.action,
    decision.questId ? `quest=${decision.questId}` : "",
    decision.itemId ? `item=${decision.itemId}` : "",
    decision.npcRef ? `npc=${decision.npcRef}` : "",
    status,
  ].filter(Boolean).join(" ");
  memory.recentActions = [...memory.recentActions.slice(-7), detail];
}

async function moveNearPlayer(agent: MferlandAgentClient, sessionId: string) {
  const target = agent.getPlayers().find((player) => player.sessionId === sessionId);
  if (!target) throw new Error(`nearby player ${sessionId} not visible`);
  await agent.moveToPoint({ x: target.x, z: target.z }, { range: 2.6, timeoutMs: 12_000 });
}

function resolveTarget(refs: VisibleRefMap, decision: LlmDecision): TargetSelection | null {
  if (decision.npcRef) return { kind: "npc", id: resolveNpcRef(refs, decision.npcRef) };
  if (decision.playerRef) return { kind: "player", id: resolvePlayerRef(refs, decision.playerRef) };
  return null;
}

function optionalNpcRef(refs: VisibleRefMap, value: string | undefined) {
  return value ? resolveNpcRef(refs, value) : undefined;
}

function assertQuestAcceptable(agent: MferlandAgentClient, questId: QuestId) {
  const self = agent.getSelf();
  if (!self) return;
  const existing = self.quests.find((quest) => quest.id === questId);
  if (existing?.status === "active" || existing?.status === "ready") return;
  if (existing?.status === "completed" && isQuestReadyToRepeat(questId, existing)) return;
  if (!existing && isQuestAvailableForSnapshots(questId, self.quests)) return;
  throw new Error(`quest ${questId} is not currently available`);
}

function assertQuestCompletable(agent: MferlandAgentClient, questId: QuestId) {
  const self = agent.getSelf();
  if (!self) return;
  const quest = self.quests.find((entry) => entry.id === questId);
  if (quest?.status === "completed" || quest?.status === "ready") return;
  throw new Error(`quest ${questId} is not ready to complete`);
}

function getAvailableQuestIds(npcId: string, quests: PlayerSnapshot["quests"]) {
  return getNpcQuestIds(npcId).filter((questId) => {
    if (QUESTS[questId].giverNpcId !== npcId) return false;
    const existing = quests.find((quest) => quest.id === questId);
    if (!existing) return isQuestAvailableForSnapshots(questId, quests);
    return existing.status === "completed" && isQuestReadyToRepeat(questId, existing);
  });
}

function getReadyTurnInQuestIds(npcId: string, quests: PlayerSnapshot["quests"]) {
  return getNpcQuestIds(npcId).filter((questId) => (
    getQuestTurnInNpcId(questId) === npcId
    && quests.some((quest) => quest.id === questId && quest.status === "ready")
  ));
}

function getQuestTrackerHints(quests: PlayerSnapshot["quests"]) {
  const hints: string[] = [];
  for (const quest of quests) {
    if (quest.status !== "ready") continue;
    hints.push(`complete_quest questId=${quest.id} at npcId=${getQuestTurnInNpcId(quest.id)}`);
  }

  for (const quest of quests) {
    if (quest.status !== "active") continue;
    const definition = QUESTS[quest.id];
    if (quest.id === "set-your-traits") {
      hints.push("update_traits at npcId=traits-mfer, then complete_quest questId=set-your-traits");
    } else if ("chatMention" in definition) {
      hints.push(`chat ${definition.chatMention}, then complete_quest questId=${quest.id} at npcId=${getQuestTurnInNpcId(quest.id)}`);
    } else if (quest.id === "mfergpt-daily-signal") {
      hints.push("travel_route routeId=plaza-to-daily-signal-camp, fight_npc the visible daily boss, then travel_route routeId=daily-signal-camp-to-mfergpt and complete_quest questId=mfergpt-daily-signal at npcId=mfergpt");
    } else {
      hints.push(`work on active questId=${quest.id}: ${definition.objectiveLabel}; turn in at npcId=${getQuestTurnInNpcId(quest.id)} when ready`);
    }
  }

  const activeOrReady = quests.some((quest) => quest.status === "active" || quest.status === "ready");
  if (!activeOrReady) {
    for (const questId of QUEST_IDS) {
      const definition = QUESTS[questId];
      if (!isQuestAvailableForSnapshots(questId, quests)) continue;
      hints.push(`accept_quest questId=${questId} from npcId=${definition.giverNpcId}`);
      if (hints.length >= 6) break;
    }
  }

  return hints.slice(0, 8);
}

function resolveNpcRef(refs: VisibleRefMap, value: string | undefined) {
  const key = cleanText(value, 80);
  if (!key) throw new Error("npcRef required");
  return refs.npcs.get(key) ?? key;
}

function resolveVisibleNpcRef(refs: VisibleRefMap, value: string | undefined) {
  const key = cleanText(value, 80);
  if (!key) throw new Error("npcRef required");
  const npcId = refs.npcs.get(key);
  if (!npcId) throw new Error(`npcRef ${value || ""} is not currently visible`);
  return npcId;
}

function resolvePlayerRef(refs: VisibleRefMap, value: string | undefined) {
  const key = cleanText(value, 80).toLowerCase();
  const sessionId = refs.players.get(key);
  if (!sessionId) throw new Error(`playerRef ${value || ""} is not currently visible`);
  return sessionId;
}

function resolveQuestId(value: string | undefined): QuestId {
  const questId = cleanText(value, 80);
  if (!Object.prototype.hasOwnProperty.call(QUESTS, questId)) throw new Error(`invalid questId ${questId}`);
  return questId as QuestId;
}

function resolveCombatAction(value: string | undefined): CombatActionId {
  const actionId = cleanText(value, 40);
  if (!Object.prototype.hasOwnProperty.call(COMBAT.actions, actionId)) throw new Error(`invalid actionId ${actionId}`);
  return actionId as CombatActionId;
}

function resolveItemId(value: string | undefined): ItemId {
  const itemId = cleanText(value, 80);
  if (!Object.prototype.hasOwnProperty.call(ITEMS, itemId)) throw new Error(`invalid itemId ${itemId}`);
  return itemId as ItemId;
}

function resolvePotionShopItemId(value: string | undefined): PotionShopItemId {
  if (!isPotionShopItemId(value)) throw new Error(`invalid potion shop itemId ${value || ""}`);
  return value;
}

function resolvePotionShopQuantity(value: number | undefined): PotionShopPurchaseQuantity {
  const quantity = typeof value === "number" ? Math.round(value) : 1;
  if (!isPotionShopPurchaseQuantity(quantity)) throw new Error(`invalid potion shop quantity ${value ?? ""}`);
  return quantity;
}

function resolveEmoteId(value: string | undefined): EmoteId {
  const emoteId = cleanText(value, 40);
  if (!["wave", "dance", "laugh", "cheer", "flex", "shrug"].includes(emoteId)) throw new Error(`invalid emoteId ${emoteId}`);
  return emoteId as EmoteId;
}

function resolveRoute(value: string | undefined): Point[] {
  const routeId = cleanText(value, 80);
  if (routeId === "plaza-to-daily-signal-camp") return DAILY_BOSS_ROUTE;
  if (routeId === "daily-signal-camp-to-mfergpt") return DAILY_BOSS_RETURN_ROUTE;
  throw new Error(`invalid routeId ${routeId}`);
}

function requiredNumber(value: number | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} required`);
  return value;
}

const DAILY_BOSS_ROUTE: Point[] = [
  { x: -18, z: 0 },
  { x: -52, z: 0 },
  { x: -52, z: -36 },
  { x: -58, z: -48 },
  { x: -69.4, z: -55.6 },
];
const DAILY_BOSS_RETURN_ROUTE: Point[] = [
  { x: -58, z: -48 },
  { x: -52, z: -36 },
  { x: -52, z: 0 },
  { x: -18, z: 0 },
  { x: 6.8, z: -5.2 },
];

function parseModelJson(payload: unknown) {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return null;
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  const direct = payload && typeof payload === "object" && "output_text" in payload
    ? (payload as { output_text?: unknown }).output_text
    : "";
  const text = typeof direct === "string" && direct.trim()
    ? direct
    : findTextPayload(payload);
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function findTextPayload(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findTextPayload(entry);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  return findTextPayload(record.output) || findTextPayload(record.content);
}

function buildCodexActionPrompt(objective: string, observation: VisibleObservation) {
  return [
    "You are controlling one local mferland wallet character as a normal human player.",
    "Return exactly one JSON object matching the supplied schema. Use null for fields that do not apply.",
    "Choose one normal in-game action from the action contract. Do not include markdown or explanation outside JSON.",
    "Do not run commands, inspect files, browse, ask for database reads, request scripts, use debug messages, teleport, boost, or ask for hidden server state.",
    "You know only the public handbook and the current in-game observation.",
    `Current questTrackerHints: ${JSON.stringify(observation.questTrackerHints)}`,
    "For quest actions, only use accept_quest or complete_quest when the current questTrackerHints or nearby NPC quest ids support that exact questId.",
    "Never complete a quest unless the current observation says it is ready.",
    "Prefer concrete progress: if observation.wallet.mferGptPaymentConfigured is true, buy a useful potion-shop item by burning MFERGPT; otherwise progress quests, cooperate with visible players, fight enemies, loot, and turn quests in.",
    "",
    JSON.stringify({
      objective,
      handbook: getGameAgentHandbook(),
      observation,
    }),
  ].join("\n");
}

function runCodexExec({
  model,
  outputPath,
  prompt,
  schemaPath,
  tempDir,
  timeoutMs,
}: {
  model: string;
  outputPath: string;
  prompt: string;
  schemaPath: string;
  tempDir: string;
  timeoutMs: number;
}) {
  return new Promise<{
    ok: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    reason?: "timeout";
    stderr: string;
    stdout: string;
  }>((resolve) => {
    const child = spawn(getCodexCliPath(), [
      "--ask-for-approval",
      "never",
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      tempDir,
      "-m",
      model,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      prompt,
    ], {
      cwd: tempDir,
      env: getSanitizedCodexEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        code: null,
        signal: null,
        stderr: appendLimited(stderr, error.message),
        stdout,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        ok: !timedOut && code === 0,
        code,
        signal,
        reason: timedOut ? "timeout" : undefined,
        stderr,
        stdout,
      });
    });
  });
}

function getCodexCliPath() {
  const configuredPath = process.env.AGENT_CODEX_CLI_PATH?.trim() || process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath) return configuredPath;
  const macosAppPath = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(macosAppPath)) return macosAppPath;
  return "codex";
}

function getSanitizedCodexEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || homedir();
  const env: NodeJS.ProcessEnv = {
    HOME: home,
    LOGNAME: process.env.LOGNAME || process.env.USER,
    NO_COLOR: "1",
    PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || "/bin/zsh",
    TERM: "dumb",
    TMPDIR: process.env.TMPDIR || tmpdir(),
    USER: process.env.USER || process.env.LOGNAME,
  };
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}

function appendLimited(current: string, next: string) {
  const combined = current + next;
  return combined.length > 4000
    ? combined.slice(combined.length - 4000)
    : combined;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function point(value: Pick<PlayerSnapshot, "x" | "z">) {
  return { x: round(value.x), z: round(value.z) };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function isProbablyUnlocked(self: PlayerSnapshot, actionId: CombatActionId) {
  if (actionId === "attack") return self.level >= 1;
  if (actionId === "shoot") return self.level >= 2;
  if (actionId === "signalShot") return self.level >= 3;
  if (actionId === "fireblast") return self.level >= 4;
  if (actionId === "iceBlast") return self.level >= 5;
  if (actionId === "heal") return self.level >= 6;
  if (actionId === "taunt") return self.level >= 7;
  if (actionId === "whirlwind") return self.level >= 8;
  if (actionId === "multishot") return self.level >= 9;
  return false;
}

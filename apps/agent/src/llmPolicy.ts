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
  POTION_SHOP_ITEM_IDS,
  QUESTS,
  QUEST_IDS,
  getNpcQuestIds,
  getNpcQuestMarker,
  getNpcDisposition,
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
  canceledQuestIds: Set<string>;
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
    canceledQuestIds: string[];
    recentActions: string[];
  };
  self: {
    name: string;
    level: number;
    xp: number;
    health: string;
    mana: string;
    position: Point;
    castingAction: string;
    inCombat: boolean;
    aggroCount: number;
    nearbyHostileCount: number;
    dangerNote: string;
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
    combatActions: Array<{
      actionId: string;
      label: string;
      unlocked: boolean;
      ready: boolean;
      readyInMs: number;
      manaCost: number;
      damage: number;
      healing: number;
      minRange: number;
      maxRange: number;
      cooldownMs: number;
      castTimeMs: number;
      requiresStationary: boolean;
      areaRadius: number;
      description: string;
    }>;
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
    disposition: string;
    targeting: string;
    nearbyHostileCount: number;
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
  stores: Array<{
    npcId: string;
    npcRef: string;
    name: string;
    kind: string;
    distance: number;
    position: Point;
    payment: string;
    status: string;
    supportedActions: string[];
    items: Array<{
      itemId: string;
      name: string;
      owned: number;
      price: string;
      bulkPrice: string;
      effect: string;
      recommendedUse: string;
    }>;
  }>;
  navigation: {
    publicRallyPoints: Array<{
      id: string;
      label: string;
      position: Point;
      distance: number;
      useWhen: string;
    }>;
  };
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
  "share_quest_link",
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
    canceledQuestIds: new Set<string>(),
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
    log(`[llm:${agent.walletAddress.slice(0, 6)}] state ${step}: ${summarizeVisibleState(frame.observation)}`);
    const decision = await policy.decide(frame.observation);
    log(`[llm:${agent.walletAddress.slice(0, 6)}] step ${step}: ${decision.action} - ${decision.reason}`);
    try {
      await executeDecision(agent, decision, frame.refs, options.payment ?? null, memory);
      rememberAction(memory, decision, "ok");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`[llm:${agent.walletAddress.slice(0, 6)}] action failed: ${errorMessage}`);
      rememberAction(memory, decision, "failed", errorMessage);
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
  memory: RunMemory = { purchasedPotionShopItemIds: new Set<string>(), canceledQuestIds: new Set<string>(), recentActions: [] },
): { observation: VisibleObservation; refs: VisibleRefMap } | null {
  const raw = agent.observe();
  if (!raw) return null;
  const npcRefs = new Map<string, string>();
  const playerRefs = new Map<string, string>();
  const self = raw.self;
  const potionShopAlreadyStocked = memory.purchasedPotionShopItemIds.size > 0 || hasPotionShopStock(self);
  const mferGptPaymentConfigured = Boolean(capabilities.mferGptPaymentConfigured) && !potionShopAlreadyStocked;

  const playerRefBySessionId = new Map<string, string>();
  const nearbyPlayers = raw.nearbyPlayers.slice(0, 8).map((player, index) => {
    const ref = `player${index + 1}`;
    playerRefs.set(ref, player.sessionId);
    playerRefs.set(player.name.toLowerCase(), player.sessionId);
    playerRefBySessionId.set(player.sessionId, ref);
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

  const visibleAliveNpcs = raw.nearbyNpcs.filter((npc) => npc.health > 0 && npc.defeatedAt <= 0);
  const nearbyNpcs = raw.nearbyNpcs.slice(0, 12).map((npc, index) => {
    const ref = `npc${index + 1}`;
    const alive = npc.health > 0 && npc.defeatedAt <= 0;
    const disposition = getNpcDisposition(npc);
    const targeting = npc.aggroTargetId === self.sessionId
      ? "you"
      : playerRefBySessionId.get(npc.aggroTargetId) ?? (npc.aggroTargetId ? "nonvisible-player" : "");
    const nearbyHostileCount = visibleAliveNpcs.filter((other) => (
      other.id !== npc.id
      && getNpcDisposition(other) === "hostile"
      && Math.hypot(other.x - npc.x, other.z - npc.z) <= 8
    )).length;
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
      alive,
      hasLoot: npc.hasLoot,
      disposition,
      targeting,
      nearbyHostileCount,
      questMarker: getNpcQuestMarker(npc, self.quests) ?? "",
      availableQuestIds: getAvailableQuestIds(npc.id, self.quests),
      readyTurnInQuestIds: getReadyTurnInQuestIds(npc.id, self.quests),
      questId: npc.questId,
    };
  });

  const aggroCount = visibleAliveNpcs.filter((npc) => npc.aggroTargetId === self.sessionId).length;
  const nearbyHostileCount = visibleAliveNpcs.filter((npc) => npc.distance <= 10 && getNpcDisposition(npc) === "hostile").length;
  const healthRatio = self.maxHealth > 0 ? self.health / self.maxHealth : 0;
  const dangerNote = getDangerNote(aggroCount, nearbyHostileCount, healthRatio);

  return {
    refs: { npcs: npcRefs, players: playerRefs },
    observation: {
      wallet: {
        address: agent.walletAddress,
        mferGptPaymentConfigured,
        mferGptPaymentNote: potionShopAlreadyStocked
          ? "This character already has potion-shop stock; continue questing and use items instead of buying more."
          : capabilities.mferGptPaymentConfigured
          ? "This local disposable wallet has an MFERGPT burn signer configured for potion-shop purchases. The purchase action will still fail normally if the local token balance is insufficient."
          : "No MFERGPT payment signer is configured for this run.",
      },
      runMemory: {
        purchasedPotionShopItemIds: [...memory.purchasedPotionShopItemIds],
        canceledQuestIds: [...memory.canceledQuestIds],
        recentActions: memory.recentActions.slice(-8),
      },
      self: {
        name: self.name,
        level: self.level,
        xp: self.xp,
        health: `${Math.ceil(self.health)}/${Math.ceil(self.maxHealth)}`,
        mana: `${Math.ceil(self.mana)}/${Math.ceil(self.maxMana)}`,
        position: point(self),
        castingAction: self.castingAction,
        inCombat: aggroCount > 0,
        aggroCount,
        nearbyHostileCount,
        dangerNote,
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
        combatActions: getCombatActionStates(self),
      },
      nearbyNpcs,
      nearbyPlayers,
      recentChat: raw.recentChat.map((message) => ({
        name: message.name,
        text: message.text,
        kind: message.kind ?? "say",
      })),
      stores: getStoreObservations(self, raw.nearbyNpcs, npcRefs, {
        mferGptPaymentConfigured,
        potionShopAlreadyStocked,
      }),
      navigation: {
        publicRallyPoints: getPublicRallyPoints(self),
      },
      questTrackerHints: getQuestTrackerHints(self.quests, memory),
      actionContract: {
        output: "Return one JSON object only. Pick exactly one action.",
        actions: [...ACTIONS],
        notes: [
          "Use npcRef/playerRef from this observation when available.",
          "Use questTrackerHints as the public quest-log style guide for what to do next.",
          "Use known npcId from the handbook only for moving toward public, named NPCs.",
          "When no quest is active, questTrackerHints may name the next public quest giver; use move_near_npc or accept_quest with that npcId to continue.",
          "Use navigation.publicRallyPoints as public map coordinates for move_to. Prefer loop-farm-road for farm danger and plaza-safe for a full reset.",
          "Use travel_route for known public roads: plaza-to-daily-signal-camp, daily-signal-camp-to-mfergpt, plaza-to-loop-farm, loop-farm-to-claim-pile, loop-farm-to-route-post, route-post-to-signal-ridge, plaza-to-signal-ridge, or signal-ridge-to-static-lot.",
          "For quests, prefer accept_quest only from nearbyNpcs.availableQuestIds and complete_quest only from nearbyNpcs.readyTurnInQuestIds.",
          "When several quests are available, prefer the non-repeatable main quest chain before optional repeatable/daily quests unless you are intentionally grouping for the daily.",
          "Use fight_npc for sustained combat, but only with a currently visible npcRef.",
          "Use self.combatActions to see unlocked abilities, cooldowns, mana cost, cast time, range, and AoE radius before choosing use_ability or fight_npc.",
          "nearbyNpcs.nearbyHostileCount shows public local pack risk around that target. For solo/safe pulls, only call a target isolated when nearbyHostileCount is 0.",
          "Targets with nearbyHostileCount above 0 are pack pulls; choose them only when intentionally grouping, using AoE, or clearing the add first.",
          "For active combat or collection quests, move to the public target area from questTrackerHints/handbook, then fight one visible matching hostile at a time. Do not keep interacting with the quest giver unless the quest is ready.",
          "Read observation.self.aggroCount, observation.self.nearbyHostileCount, observation.self.dangerNote, and nearbyNpcs.targeting before fighting or moving deeper.",
          "If dangerNote is nonempty or aggroCount is above 1, recover first: use_item, heal with use_ability, move_to a safer road position, or respawn if defeated.",
          "If health is low even without aggro, recover before starting another pull.",
          "Do not wait while an NPC is targeting you; wait is a 5-second safe recovery pause only when no hostile is actively targeting you and you are not taking damage.",
          "Avoid overpulls: do not run through hostile packs; if several hostile NPCs are close or you are low health, move back along a public route, use an item, wait, or fight one visible isolated hostile.",
          "Use share_quest_link for socialAction/tweet quests when questTrackerHints says to share; do not try to complete those quests with chat.",
          "If runMemory.canceledQuestIds contains a repeatable quest, do not accept that quest again during this run unless nearby players are visibly grouping for it.",
          "Use observation.stores for public merchant knowledge and available store actions.",
          "Use buy_potion_shop_item only when observation.wallet.mferGptPaymentConfigured is true and observation.stores says potion-mfer can sell through the normal MFERGPT burn flow.",
          "A quantity=5 purchase counts as one stock-up purchase and is useful before leaving town. If observation.runMemory.purchasedPotionShopItemIds is nonempty or inventory already has potion-shop stock, continue questing and use items instead.",
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
          "When no quest is active, questTrackerHints may name a public quest giver npcId; use move_near_npc or accept_quest with that npcId to continue.",
          "Never complete a quest unless the current observation says it is ready.",
          "Never request database reads, scripts, hidden server state, debug messages, teleport, boost, or privileged shortcuts.",
          "Use the public aggro/danger fields before fighting or moving deeper; recover or retreat when multiple NPCs are targeting you.",
          "Use observation.self.combatActions for ability readiness, cooldowns, range, cast times, and AoE radius.",
          "Use observation.navigation.publicRallyPoints for concrete public move_to coordinates when retreating, regrouping, or staging.",
          "Use observation.stores for public merchant locations, item effects, prices, supported actions, and whether the local MFERGPT burn flow can buy stock.",
          "Do not choose wait while an NPC is targeting you; wait is a 5-second safe recovery pause when you are not being attacked.",
          "Use share_quest_link for socialAction/tweet quests; chat does not progress those quests.",
          "Do not immediately re-accept a repeatable quest that observation.runMemory.canceledQuestIds says was canceled this run.",
          "Repeatable daily quests are optional and often dangerous; do not solo-run into a daily boss pack at low level.",
          "Prefer isolated targets with nearbyHostileCount 0 for normal quest pulls. If no isolated targets remain, group with visible players or intentionally use AoE/defensive recovery for a pack pull.",
          "Prefer making quest progress. When observation.wallet.mferGptPaymentConfigured is true and you have no potion-shop stock, buy useful potion-shop items with MFERGPT by burning tokens through the normal payment flow.",
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
        range: 4,
        sprint: decision.sprint ?? true,
        timeoutMs: 60_000,
      });
      return;
    case "travel_route":
      await agent.moveAlong(resolveRoute(decision.routeId), {
        range: 8,
        sprint: decision.sprint ?? true,
        timeoutMs: 180_000,
        stopOnDanger: true,
        maxSelfAttackers: 1,
        maxCloseHostiles: 4,
        dangerHealthRatio: 0.28,
      });
      return;
    case "move_near_npc":
      await agent.moveToNpc(resolveNpcRef(refs, decision.npcRef), {
        range: 3,
        timeoutMs: 60_000,
        stopOnDanger: true,
        maxSelfAttackers: 1,
        maxCloseHostiles: 4,
        dangerHealthRatio: 0.28,
      });
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
      {
        const questId = resolveQuestId(decision.questId);
        agent.cancelQuest(questId);
        memory.canceledQuestIds.add(questId);
      }
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
    case "fight_npc": {
      const npcId = resolveVisibleNpcRef(refs, decision.npcRef);
      const teamTarget = isTeamTargetNpcId(npcId);
      await agent.fightNpc(npcId, {
        timeoutMs: teamTarget ? 120_000 : 60_000,
        preferredActions: ["taunt", "iceBlast", "fireblast", "signalShot", "shoot", "whirlwind", "multishot", "attack"],
        healNearbyAllies: true,
        yieldOnDanger: true,
        maxSelfAttackers: teamTarget ? 3 : 1,
        maxCloseHostiles: teamTarget ? 4 : 3,
        dangerHealthRatio: teamTarget ? 0.34 : 0.3,
      });
      return;
    }
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
    case "share_quest_link": {
      const questId = resolveQuestId(decision.questId);
      assertQuestShareable(agent, questId);
      agent.shareQuestLink(questId);
      await delay(750);
      return;
    }
    case "buy_potion_shop_item":
      await buyPotionShopItem(agent, decision, payment, memory);
      return;
    case "wait":
    default:
      await delay(5000);
  }
}

async function buyPotionShopItem(
  agent: MferlandAgentClient,
  decision: LlmDecision,
  payment: MferGptBurner | null,
  memory: RunMemory,
) {
  if (!payment) throw new Error("MFERGPT payment is not configured for this agent.");
  const self = agent.getSelf();
  if (memory.purchasedPotionShopItemIds.size > 0 || (self && hasPotionShopStock(self))) {
    await delay(250);
    return;
  }
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

function summarizeVisibleState(observation: VisibleObservation) {
  const quests = observation.self.activeOrReadyQuests
    .slice(0, 3)
    .map((quest) => `${quest.questId}:${quest.status}:${quest.progress}`)
    .join(",");
  const nearby = observation.nearbyNpcs
    .slice(0, 4)
    .map((npc) => `${npc.ref}:${npc.name}:${npc.health}:${npc.disposition}:pack${npc.nearbyHostileCount}${npc.targeting ? `->${npc.targeting}` : ""}`)
    .join("|");
  const players = observation.nearbyPlayers
    .slice(0, 3)
    .map((player) => `${player.ref}:${player.name}:${player.health}:d${player.distance}`)
    .join("|");
  const stores = observation.stores
    .filter((store) => store.npcId === POTION_SHOP_NPC_ID || store.distance <= 12)
    .slice(0, 2)
    .map((store) => `${store.npcId}:d${store.distance}:${store.status}`)
    .join("|");
  return [
    `hp=${observation.self.health}`,
    `mana=${observation.self.mana}`,
    `pos=${observation.self.position.x},${observation.self.position.z}`,
    `aggro=${observation.self.aggroCount}`,
    `hostiles=${observation.self.nearbyHostileCount}`,
    quests ? `quests=${quests}` : "quests=none",
    observation.self.dangerNote ? `danger=${observation.self.dangerNote}` : "",
    nearby ? `nearby=${nearby}` : "",
    players ? `players=${players}` : "",
    stores ? `stores=${stores}` : "",
  ].filter(Boolean).join(" ");
}

function rememberAction(memory: RunMemory, decision: LlmDecision, status: "ok" | "failed", message = "") {
  const detail = [
    decision.action,
    decision.questId ? `quest=${decision.questId}` : "",
    decision.itemId ? `item=${decision.itemId}` : "",
    decision.npcRef ? `npc=${decision.npcRef}` : "",
    message ? `${status}:${cleanText(message, 160)}` : status,
  ].filter(Boolean).join(" ");
  memory.recentActions = [...memory.recentActions.slice(-7), detail];
}

function hasPotionShopStock(self: PlayerSnapshot) {
  return self.inventory.some((item) => POTION_SHOP_ITEM_IDS.includes(item.id as PotionShopItemId) && item.count > 0);
}

function getStoreObservations(
  self: PlayerSnapshot,
  nearbyNpcs: Array<{ id: string; name: string; x: number; z: number; distance: number }>,
  npcRefs: Map<string, string>,
  capabilities: { mferGptPaymentConfigured: boolean; potionShopAlreadyStocked: boolean },
): VisibleObservation["stores"] {
  const nearbyById = new Map(nearbyNpcs.map((npc) => [npc.id, npc]));
  return PUBLIC_STORES.map((store) => {
    const nearby = nearbyById.get(store.npcId);
    const position = nearby ? point(nearby) : store.position;
    const distance = nearby ? nearby.distance : distanceToPoint(self, store.position);
    const isPotionShop = store.npcId === POTION_SHOP_NPC_ID;
    const status = isPotionShop
      ? capabilities.potionShopAlreadyStocked
        ? "already stocked; use existing items before buying more"
        : capabilities.mferGptPaymentConfigured
        ? "can buy now with local MFERGPT burn receipt"
        : "visible/store-known, but no local MFERGPT payment signer is configured"
      : store.status;
    return {
      npcId: store.npcId,
      npcRef: npcRefs.get(store.npcId) ?? store.npcId,
      name: nearby?.name ?? store.name,
      kind: store.kind,
      distance: round(distance),
      position,
      payment: store.payment,
      status,
      supportedActions: isPotionShop && capabilities.mferGptPaymentConfigured
        ? ["move_near_npc", "interact_npc", "buy_potion_shop_item"]
        : [...store.supportedActions],
      items: isPotionShop
        ? POTION_SHOP_ITEM_IDS.map((itemId) => ({
          itemId,
          name: ITEMS[itemId].name,
          owned: getInventoryCount(self, itemId),
          price: getPotionShopPrice(1, itemId).label,
          bulkPrice: getPotionShopPrice(5, itemId).label,
          effect: describeItemEffect(itemId),
          recommendedUse: getPotionShopRecommendation(itemId),
        }))
        : [],
    };
  });
}

function getInventoryCount(self: PlayerSnapshot, itemId: string) {
  return self.inventory
    .filter((item) => item.id === itemId)
    .reduce((total, item) => total + item.count, 0);
}

function describeItemEffect(itemId: PotionShopItemId) {
  const definition = ITEMS[itemId] as typeof ITEMS[ItemId] & {
    consumable?: {
      kind: string;
      health?: number;
      mana?: number;
      buffId?: string;
    };
  };
  const consumable = definition.consumable;
  if (!consumable) return definition.description;
  const parts = [
    consumable.health ? `+${consumable.health} health` : "",
    consumable.mana ? `+${consumable.mana} mana` : "",
    consumable.buffId ? `one-hour ${consumable.buffId} buff` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `${consumable.kind}: ${parts.join(", ")}` : consumable.kind;
}

function getPotionShopRecommendation(itemId: PotionShopItemId) {
  if (itemId === "red-juice") return "best first combat stock-up for questing because it restores health quickly";
  if (itemId === "field-snack") return "good cheap road recovery between pulls when safe";
  if (itemId === "blue-juice") return "buy when using mana-heavy caster actions or running out of mana";
  if (itemId === "exit-liquidity-elixir") return "use before boss or dangerous pack attempts for extra survivability";
  if (itemId === "mev-bot-elixir") return "use before long travel or kiting-heavy fights for speed";
  if (itemId === "hopium-elixir") return "use before caster-heavy play for more mana and magic";
  return "situational one-hour combat buff";
}

function getDangerNote(aggroCount: number, nearbyHostileCount: number, healthRatio: number) {
  if (healthRatio <= 0) return "You are defeated; use respawn before taking any other action.";
  if (aggroCount > 1) return `${aggroCount} visible NPCs are targeting you; stop pulling and recover before fighting more.`;
  if (aggroCount > 0 && healthRatio <= 0.35) return "You are under attack at low health; heal, use an item, retreat toward a road, or respawn if defeated.";
  if (nearbyHostileCount > 2) return `${nearbyHostileCount} visible hostile NPCs are close; avoid moving deeper and pull back before fighting.`;
  if (nearbyHostileCount > 0 && healthRatio <= 0.3) return "Hostile NPCs are close while health is critical; recover before taking another fight.";
  if (healthRatio > 0 && healthRatio <= 0.55) return "Health is low; if no NPC is targeting you, use wait at a safe rally point or use_item before moving or fighting again. If targeted, heal, use an item, or retreat.";
  return "";
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
  const key = cleanText(value, 80);
  if (!key) return undefined;
  const visibleRef = refs.npcs.get(key);
  if (visibleRef) return visibleRef;
  if (key === "mfergpt" || key.includes("-")) return key;
  return undefined;
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

function assertQuestShareable(agent: MferlandAgentClient, questId: QuestId) {
  if (!("socialAction" in QUESTS[questId])) throw new Error(`quest ${questId} is not a social share quest`);
  const self = agent.getSelf();
  if (!self) return;
  const quest = self.quests.find((entry) => entry.id === questId);
  if (quest?.status === "active") return;
  throw new Error(`quest ${questId} is not active`);
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

function getQuestTrackerHints(quests: PlayerSnapshot["quests"], memory: RunMemory) {
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
    } else if ("socialAction" in definition) {
      hints.push(`share_quest_link questId=${quest.id}, then complete_quest questId=${quest.id} at npcId=${getQuestTurnInNpcId(quest.id)}`);
    } else if (quest.id === "mfergpt-daily-signal") {
      hints.push("optional daily boss: travel_route routeId=plaza-to-daily-signal-camp to stage at camp edge, group before fighting visible daily boss, or cancel_quest questId=mfergpt-daily-signal if low-level/alone and continuing the main chain");
    } else if (quest.id === "farm-road-handoff") {
      hints.push("travel_route routeId=plaza-to-loop-farm, then complete_quest questId=farm-road-handoff at npcId=hogwatch-mfer");
    } else if (quest.id === "field-camp-delivery") {
      hints.push("travel_route routeId=loop-farm-to-route-post, then complete_quest questId=field-camp-delivery at npcId=field-guide-mfer");
    } else if (quest.id === "ridge-dispatch") {
      hints.push("travel_route routeId=route-post-to-signal-ridge, then complete_quest questId=ridge-dispatch at npcId=ridge-guide-mfer");
    } else if (quest.id === "boar-bristle-cull") {
      hints.push(`travel_route routeId=loop-farm-to-claim-pile to the farm-edge pull point, then fight_npc one visible alive hog/beast at a time when farmers are not overpulling; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "feral-farmers") {
      hints.push(`fight_npc visible named farm mfers one at a time near the farmyard: bran, mae, sol; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "hog-livers") {
      hints.push(`travel_route routeId=loop-farm-to-claim-pile to the farm-edge pull point, fight_npc visible hogs one at a time when safe, then loot defeated hogs for chewed EOS; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "route-patrol-daily") {
      hints.push(`fight_npc visible hogs or claim-burnt farmer mfers near route post one at a time; progress ${quest.progress}/${quest.required}; complete at field-guide-mfer when ready`);
    } else if (quest.id === "hog-loop") {
      hints.push(`fight_npc visible hogs near the claim booth one at a time; progress ${quest.progress}/${quest.required}; complete at pen-keeper-mfer when ready`);
    } else if (quest.id === "signal-scraps") {
      hints.push(`travel_route routeId=signal-ridge-to-static-lot, fight_npc visible ridge raiders/static mages one at a time, and loot them for signal scraps; progress ${quest.progress}/${quest.required}; complete at ridge-guide-mfer when ready`);
    } else if (quest.id === "cut-the-static") {
      hints.push(`fight_npc visible named ridge enemies one at a time: operator vex, repeater pax, echo-shell ori; progress ${quest.progress}/${quest.required}; complete at beacon-keeper-mfer when ready`);
    } else if (quest.id === "baron-of-static") {
      hints.push(`fight_npc visible The Centralizer with nearby players, using heals/taunts/items and avoiding extra pulls; progress ${quest.progress}/${quest.required}; complete at beacon-keeper-mfer when ready`);
    } else if (quest.id === "ogre-raid-daily") {
      hints.push(`interact_npc beacon-keeper-mfer to call bear market mfer if needed, then fight_npc visible raid boss as a group; progress ${quest.progress}/${quest.required}; complete at beacon-keeper-mfer when ready`);
    } else {
      hints.push(`work on active questId=${quest.id}: ${definition.objectiveLabel}; turn in at npcId=${getQuestTurnInNpcId(quest.id)} when ready`);
    }
  }

  const activeOrReady = quests.some((quest) => quest.status === "active" || quest.status === "ready");
  if (!activeOrReady) {
    const availableQuestIds = QUEST_IDS
      .filter((questId) => isQuestAvailableForSnapshots(questId, quests))
      .filter((questId) => !memory.canceledQuestIds.has(questId))
      .sort((left, right) => Number(isRepeatableQuest(left)) - Number(isRepeatableQuest(right)));
    for (const questId of availableQuestIds) {
      const definition = QUESTS[questId];
      const prefix = isRepeatableQuest(questId) ? "optional repeatable: " : "";
      hints.push(`${prefix}accept_quest questId=${questId} from npcId=${definition.giverNpcId}`);
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
  if (routeId === "plaza-to-loop-farm") return FARM_ROUTE;
  if (routeId === "loop-farm-to-claim-pile") return FARMYARD_ROUTE;
  if (routeId === "loop-farm-to-route-post") return FIELD_CAMP_ROUTE;
  if (routeId === "route-post-to-signal-ridge") return RIDGE_ROUTE;
  if (routeId === "plaza-to-signal-ridge") return RIDGE_FROM_PLAZA_ROUTE;
  if (routeId === "signal-ridge-to-static-lot") return RIDGE_FIELD_ROUTE;
  throw new Error(`invalid routeId ${routeId}`);
}

function isTeamTargetNpcId(npcId: string) {
  return npcId === "static-baron-nox" || npcId === "raid-ogre-mfer" || npcId === "mfergpt-daily-boss";
}

function isRepeatableQuest(questId: QuestId) {
  return "repeatCooldownMs" in QUESTS[questId];
}

function requiredNumber(value: number | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} required`);
  return value;
}

const DAILY_BOSS_ROUTE: Point[] = [
  { x: -18, z: 0 },
  { x: -52, z: 0 },
  { x: -52, z: -36 },
  { x: -49, z: -42 },
];
const DAILY_BOSS_RETURN_ROUTE: Point[] = [
  { x: -58, z: -48 },
  { x: -52, z: -36 },
  { x: -52, z: 0 },
  { x: -18, z: 0 },
  { x: 6.8, z: -5.2 },
];
const FARM_ROUTE: Point[] = [
  { x: 0, z: 29 },
  { x: -31, z: 60 },
  { x: -64.5, z: 64.5 },
];
const FARMYARD_ROUTE: Point[] = [
  { x: -60, z: 84 },
  { x: -60, z: 113 },
  { x: -70, z: 113 },
];
const FIELD_CAMP_ROUTE: Point[] = [
  { x: -64.5, z: 64.5 },
  { x: -82, z: 60 },
  { x: -108, z: 92 },
  { x: -108, z: 116 },
  { x: -119.2, z: 132.4 },
];
const RIDGE_ROUTE: Point[] = [
  { x: -101, z: 116 },
  { x: -76, z: 78 },
  { x: -31, z: 60 },
  { x: 0, z: 29 },
  { x: 0, z: -34 },
  { x: 53, z: -11.5 },
  { x: 75, z: -22 },
  { x: 120, z: -62 },
  { x: 108.8, z: -92.8 },
];
const RIDGE_FROM_PLAZA_ROUTE: Point[] = [
  { x: 0, z: -34 },
  { x: 53, z: -11.5 },
  { x: 75, z: -22 },
  { x: 120, z: -62 },
  { x: 108.8, z: -92.8 },
];
const RIDGE_FIELD_ROUTE: Point[] = [
  { x: 124, z: -104 },
  { x: 145.5, z: -84.2 },
];

const PUBLIC_RALLY_POINTS = [
  {
    id: "plaza-safe",
    label: "plaza fountain reset",
    position: { x: -2.4, z: 4.2 },
    useWhen: "use when defeated, critically low, or needing a full safe reset away from hostile zones",
  },
  {
    id: "loop-farm-road",
    label: "loop farm road edge",
    position: { x: -58, z: 81 },
    useWhen: "use to retreat from farm aggro or regroup before pulling hogs/farmers",
  },
  {
    id: "claim-pile-pull",
    label: "claim pile pull point",
    position: { x: -70, z: 113 },
    useWhen: "use only when not in danger to stage hog or field-edge pulls",
  },
  {
    id: "daily-signal-camp-edge",
    label: "daily signal camp edge",
    position: { x: -49, z: -42 },
    useWhen: "use to group outside the optional daily boss camp before committing",
  },
  {
    id: "signal-ridge-road",
    label: "signal ridge road",
    position: { x: 108.8, z: -92.8 },
    useWhen: "use to stage before signal ridge/static lot combat",
  },
] as const;

const PUBLIC_STORES = [
  {
    npcId: POTION_SHOP_NPC_ID,
    name: "potion mfer",
    kind: "potion shop",
    position: { x: 7.4, z: 25.4 },
    payment: "burn local MFERGPT to the burn address, then submit the normal potion-shop purchase message",
    status: "potion-shop status is computed from wallet payment config and current inventory",
    supportedActions: ["move_near_npc", "interact_npc"],
  },
  {
    npcId: "crypto-mfer",
    name: "crypto mfer",
    kind: "crypto store",
    position: { x: 3.7, z: 25.4 },
    payment: "human UI supports local testnet ETH, MFER, and MFERGPT purchase flows",
    status: "known merchant; headless agent observes/interacts but does not have a gear/pass purchase action yet",
    supportedActions: ["move_near_npc", "interact_npc"],
  },
  {
    npcId: "traits-mfer",
    name: "traits mfer",
    kind: "traits mirror",
    position: { x: -3.7, z: 25.4 },
    payment: "first trait save is free; later paid changes burn MFERGPT through the normal trait flow",
    status: "use update_traits for the normal free trait quest",
    supportedActions: ["move_near_npc", "interact_npc", "update_traits"],
  },
  {
    npcId: "swap-mfer",
    name: "swap mfer",
    kind: "swap",
    position: { x: 0, z: 25.4 },
    payment: "human-facing local swap affordance",
    status: "known merchant/info NPC; not required for quest progression",
    supportedActions: ["move_near_npc", "interact_npc"],
  },
] as const;

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
    "When no quest is active, questTrackerHints may name a public quest giver npcId; use move_near_npc or accept_quest with that npcId to continue the visible questline.",
    "Never complete a quest unless the current observation says it is ready.",
    "Use observation.self.aggroCount, observation.self.nearbyHostileCount, observation.self.dangerNote, and nearbyNpcs.targeting to avoid overpulls.",
    "Use observation.self.combatActions for ability readiness, cooldowns, range, cast times, and AoE radius. AoE abilities are valid when unlocked and intentionally handling grouped enemies.",
    "Use observation.navigation.publicRallyPoints for concrete public move_to coordinates; loop-farm-road is the safer farm retreat point, plaza-safe is a full reset.",
    "Use observation.stores for public merchant locations, item effects, prices, supported actions, and whether the local MFERGPT burn flow can buy potion-shop stock.",
    "Use nearbyNpcs.nearbyHostileCount to choose isolated targets or intentionally group/AoE. Do not describe a target as isolated unless nearbyHostileCount is 0.",
    "If multiple NPCs are targeting you, or dangerNote is nonempty, pick a recovery action instead of starting another fight or moving deeper into the pack.",
    "Do not choose wait while an NPC is targeting you; wait is a 5-second safe recovery pause. Use an item, heal, move toward a safer road coordinate, or respawn if defeated.",
    "Use share_quest_link for socialAction/tweet quests. Chat does not progress those quests.",
    "If observation.runMemory.canceledQuestIds contains a repeatable quest, do not accept it again during this run unless visible players are grouping for it.",
    "Prefer the non-repeatable main quest chain before optional repeatable/daily quests unless a group is ready for the daily.",
    "Avoid overpulls: do not run through hostile packs; if several hostile NPCs are close or health is low, move back along a public route, heal/use items, wait only when safe, or fight one visible isolated hostile.",
    "Prefer concrete progress: if observation.wallet.mferGptPaymentConfigured is true and you have no potion-shop stock, buy a useful potion-shop item by burning MFERGPT; otherwise progress quests, cooperate with visible players, fight enemies, loot, and turn quests in.",
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

function getCombatActionStates(self: PlayerSnapshot) {
  const now = Date.now();
  return (Object.keys(COMBAT.actions) as CombatActionId[]).map((actionId) => {
    const action = COMBAT.actions[actionId];
    const unlocked = isProbablyUnlocked(self, actionId);
    const readyInMs = Math.max(0, getCombatActionReadyAt(self, actionId) - now);
    return {
      actionId,
      label: action.label,
      unlocked,
      ready: unlocked && readyInMs <= 0 && self.mana >= action.manaCost && !self.castingAction,
      readyInMs,
      manaCost: action.manaCost,
      damage: action.damage ?? 0,
      healing: "healing" in action ? action.healing : 0,
      minRange: action.minRange,
      maxRange: action.maxRange,
      cooldownMs: action.cooldownMs,
      castTimeMs: action.castTimeMs,
      requiresStationary: action.requiresStationary,
      areaRadius: getCombatActionAreaRadius(actionId),
      description: action.description,
    };
  });
}

function getCombatActionReadyAt(self: PlayerSnapshot, actionId: CombatActionId) {
  const key = `${actionId}ReadyAt` as keyof PlayerSnapshot;
  const readyAt = self[key];
  return typeof readyAt === "number" ? readyAt : 0;
}

function getCombatActionAreaRadius(actionId: CombatActionId) {
  const action = COMBAT.actions[actionId];
  if (actionId === "whirlwind" || actionId === "frostNova") return action.maxRange;
  return "splashRadius" in action ? action.splashRadius : 0;
}

function getPublicRallyPoints(self: PlayerSnapshot) {
  return PUBLIC_RALLY_POINTS
    .map((pointConfig) => ({
      id: pointConfig.id,
      label: pointConfig.label,
      position: pointConfig.position,
      distance: round(distanceToPoint(self, pointConfig.position)),
      useWhen: pointConfig.useWhen,
    }))
    .sort((a, b) => a.distance - b.distance);
}

function point(value: Pick<PlayerSnapshot, "x" | "z">) {
  return { x: round(value.x), z: round(value.z) };
}

function distanceToPoint(value: Pick<PlayerSnapshot, "x" | "z">, target: Point) {
  return Math.hypot(value.x - target.x, value.z - target.z);
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

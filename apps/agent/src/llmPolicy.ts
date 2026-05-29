import {
  CHAT,
  COMBAT,
  ITEMS,
  POTION_SHOP_NPC_ID,
  QUESTS,
  getPotionShopPrice,
  isPotionShopItemId,
  isPotionShopPurchaseQuantity,
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

export type LlmGameAgentOptions = {
  apiKey?: string;
  endpoint?: string;
  model: string;
  objective: string;
  maxSteps: number;
  decisionIntervalMs: number;
  payment?: MferGptBurner | null;
  log?: (message: string) => void;
};

type VisibleRefMap = {
  npcs: Map<string, string>;
  players: Map<string, string>;
};

type VisibleObservation = {
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
  actionContract: {
    output: string;
    actions: string[];
    notes: string[];
  };
};

type LlmDecision = {
  action: string;
  reason: string;
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
  "move_near_npc",
  "move_near_player",
  "interact_npc",
  "accept_quest",
  "complete_quest",
  "cancel_quest",
  "select_npc",
  "select_player",
  "use_ability",
  "loot",
  "equip_item",
  "use_item",
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
  required: ["action", "reason", "x", "z", "npcRef", "playerRef", "questId", "itemId", "quantity", "actionId", "text", "emoteId", "sprint"],
};

export async function runLlmGameAgent(agent: MferlandAgentClient, options: LlmGameAgentOptions) {
  const policy = new OpenAiActionPolicy(options);
  const log = options.log ?? console.log;
  for (let step = 1; step <= options.maxSteps; step += 1) {
    const frame = makeVisibleObservation(agent);
    if (!frame) {
      await delay(options.decisionIntervalMs);
      continue;
    }
    const decision = await policy.decide(frame.observation);
    log(`[llm:${agent.walletAddress.slice(0, 6)}] step ${step}: ${decision.action} - ${decision.reason}`);
    try {
      await executeDecision(agent, decision, frame.refs, options.payment ?? null);
    } catch (error) {
      log(`[llm:${agent.walletAddress.slice(0, 6)}] action failed: ${error instanceof Error ? error.message : String(error)}`);
      await delay(750);
    }
    await delay(options.decisionIntervalMs);
  }
}

export function makeVisibleObservation(agent: MferlandAgentClient): { observation: VisibleObservation; refs: VisibleRefMap } | null {
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
        unlockedCombatActions: Object.keys(COMBAT.actions).filter((actionId) => isProbablyUnlocked(self, actionId as CombatActionId)),
      },
      nearbyNpcs,
      nearbyPlayers,
      recentChat: raw.recentChat.map((message) => ({
        name: message.name,
        text: message.text,
        kind: message.kind ?? "say",
      })),
      actionContract: {
        output: "Return one JSON object only. Pick exactly one action.",
        actions: [...ACTIONS],
        notes: [
          "Use npcRef/playerRef from this observation when available.",
          "Use known npcId from the handbook only for moving toward public, named NPCs.",
          "Use buy_potion_shop_item only when you intentionally want to burn MFERGPT for potion-mfer inventory.",
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

class OpenAiActionPolicy {
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
          "Never request database reads, scripts, hidden server state, debug messages, teleport, boost, or privileged shortcuts.",
          "Prefer making quest progress. When funded, buy useful potion-shop items with MFERGPT by burning tokens through the normal payment flow.",
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

async function executeDecision(
  agent: MferlandAgentClient,
  decision: LlmDecision,
  refs: VisibleRefMap,
  payment: MferGptBurner | null,
) {
  switch (decision.action) {
    case "move_to":
      await agent.moveToPoint({ x: requiredNumber(decision.x, "x"), z: requiredNumber(decision.z, "z") }, {
        range: 2.4,
        sprint: decision.sprint ?? true,
        timeoutMs: 18_000,
      });
      return;
    case "move_near_npc":
      await agent.moveToNpc(resolveNpcRef(refs, decision.npcRef), { range: 3, timeoutMs: 20_000 });
      return;
    case "move_near_player":
      await moveNearPlayer(agent, resolvePlayerRef(refs, decision.playerRef));
      return;
    case "interact_npc":
      await agent.interactWithNpc(resolveNpcRef(refs, decision.npcRef));
      return;
    case "accept_quest":
      await agent.acceptQuest(resolveQuestId(decision.questId), optionalNpcRef(refs, decision.npcRef));
      return;
    case "complete_quest":
      await agent.completeQuest(resolveQuestId(decision.questId), optionalNpcRef(refs, decision.npcRef));
      return;
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
    case "loot":
      agent.lootNpc(resolveNpcRef(refs, decision.npcRef));
      return;
    case "equip_item":
      agent.equipItem(resolveItemId(decision.itemId));
      return;
    case "use_item":
      agent.useItem(resolveItemId(decision.itemId));
      return;
    case "emote":
      agent.emote(resolveEmoteId(decision.emoteId));
      return;
    case "chat":
      agent.chat(decision.text || "gm");
      return;
    case "buy_potion_shop_item":
      await buyPotionShopItem(agent, decision, payment);
      return;
    case "wait":
    default:
      await delay(1500);
  }
}

async function buyPotionShopItem(agent: MferlandAgentClient, decision: LlmDecision, payment: MferGptBurner | null) {
  if (!payment) throw new Error("MFERGPT payment is not configured for this agent.");
  const itemId = resolvePotionShopItemId(decision.itemId);
  const quantity = resolvePotionShopQuantity(decision.quantity);
  const price = getPotionShopPrice(quantity, itemId);
  await agent.interactWithNpc(POTION_SHOP_NPC_ID);
  const proof = await payment.burn(price.amountWei, price.label);
  await agent.purchasePotionShopItem(itemId, quantity, proof);
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

function resolveNpcRef(refs: VisibleRefMap, value: string | undefined) {
  const key = cleanText(value, 80);
  if (!key) throw new Error("npcRef required");
  return refs.npcs.get(key) ?? key;
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

function requiredNumber(value: number | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} required`);
  return value;
}

function parseModelJson(payload: unknown) {
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

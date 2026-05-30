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
  type NpcSnapshot,
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

export type LlmRunResult = {
  stepsTaken: number;
  actionFailureCount: number;
  lastQuestProgress: VisibleObservation["questProgress"] | null;
};

type RunMemory = {
  purchasedPotionShopItemIds: Set<string>;
  canceledQuestIds: Set<string>;
  mferGptSwapTxHashes: string[];
  recentActions: string[];
};

type WalletPaymentSnapshot = {
  nativeBalanceWei?: string;
  nativeBalanceEth?: string;
  mferGptBalanceWei?: string;
  mferGptBalance?: string;
  swapConfigured?: boolean;
  swapRouterAddress?: string;
  recommendedSwapEthAmount?: string;
  error?: string;
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
    nativeBalanceEth: string;
    mferGptBalance: string;
    mferGptBalanceWei: string;
    mferGptSwapConfigured: boolean;
    mferGptSwapNote: string;
    recommendedSwapEthAmount: string;
  };
  runMemory: {
    purchasedPotionShopItemIds: string[];
    canceledQuestIds: string[];
    mferGptSwapTxHashes: string[];
    recentActions: string[];
  };
  questProgress: {
    totalQuestCount: number;
    completedQuestCount: number;
    activeQuestIds: string[];
    readyQuestIds: string[];
    availableQuestIds: string[];
    lockedQuestIds: string[];
    remainingQuestIds: string[];
    nextRecommendedQuestIds: string[];
    allQuestsCompletedOnce: boolean;
    knownQuests: Array<{
      questId: string;
      title: string;
      kind: string;
      status: string;
      progress: string;
      giverNpcId: string;
      turnInNpcId: string;
      requiredQuestId: string;
      nextQuestId: string;
      objective: string;
      publicPlan: string;
    }>;
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
    model: string;
    health: string;
    distance: number;
    position: Point;
    dialogue: string;
    alive: boolean;
    hasLoot: boolean;
    disposition: string;
    targeting: string;
    visibleNearbyHostileCount: number;
    nearbyHostileCount: number;
    pullRisk: string;
    pullAdvice: string;
    activeQuestTargetIds: string[];
    questTargetAdvice: string;
    questMarker: string;
    availableQuestIds: string[];
    readyTurnInQuestIds: string[];
    questId: string;
  }>;
  lootableCorpses: Array<{
    ref: string;
    name: string;
    distance: number;
    position: Point;
    activeQuestTargetIds: string[];
    note: string;
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
  amountEth?: string;
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
  "swap_eth_for_mfergpt",
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
    amountEth: { type: ["string", "null"] },
    actionId: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    emoteId: { type: ["string", "null"] },
    sprint: { type: ["boolean", "null"] },
  },
  required: ["action", "reason", "routeId", "x", "z", "npcRef", "playerRef", "questId", "itemId", "quantity", "amountEth", "actionId", "text", "emoteId", "sprint"],
};

export async function runLlmGameAgent(agent: MferlandAgentClient, options: LlmGameAgentOptions): Promise<LlmRunResult> {
  const policy = createActionPolicy(options);
  const log = options.log ?? console.log;
  const memory: RunMemory = {
    purchasedPotionShopItemIds: new Set<string>(),
    canceledQuestIds: new Set<string>(),
    mferGptSwapTxHashes: [],
    recentActions: [],
  };
  let actionFailureCount = 0;
  let lastQuestProgress: VisibleObservation["questProgress"] | null = null;
  let stepsTaken = 0;
  for (let step = 1; step <= options.maxSteps; step += 1) {
    const paymentSnapshot = await observePayment(options.payment ?? null);
    const frame = makeVisibleObservation(agent, {
      mferGptPaymentConfigured: Boolean(options.payment),
      paymentSnapshot,
    }, memory);
    if (!frame) {
      await delay(options.decisionIntervalMs);
      continue;
    }
    stepsTaken = step;
    lastQuestProgress = frame.observation.questProgress;
    log(`[llm:${agent.walletAddress.slice(0, 6)}] state ${step}: ${summarizeVisibleState(frame.observation)}`);
    if (frame.observation.questProgress.allQuestsCompletedOnce) {
      log(`[llm:${agent.walletAddress.slice(0, 6)}] quest goal complete: all public quests completed once`);
      break;
    }
    const decision = await policy.decide(frame.observation);
    log(`[llm:${agent.walletAddress.slice(0, 6)}] step ${step}: ${decision.action} - ${decision.reason}`);
    try {
      await executeDecision(agent, decision, frame.refs, options.payment ?? null, memory);
      rememberAction(memory, decision, "ok");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      actionFailureCount += 1;
      log(`[llm:${agent.walletAddress.slice(0, 6)}] action failed: ${errorMessage}`);
      rememberAction(memory, decision, "failed", errorMessage);
      await delay(750);
    }
    await delay(options.decisionIntervalMs);
  }
  return { stepsTaken, actionFailureCount, lastQuestProgress };
}

function createActionPolicy(options: LlmGameAgentOptions): ActionPolicy {
  if (options.provider === "codex-cli") return new CodexCliActionPolicy(options);
  return new OpenAiActionPolicy(options);
}

export function makeVisibleObservation(
  agent: MferlandAgentClient,
  capabilities: { mferGptPaymentConfigured?: boolean; paymentSnapshot?: WalletPaymentSnapshot | null } = {},
  memory: RunMemory = { purchasedPotionShopItemIds: new Set<string>(), canceledQuestIds: new Set<string>(), mferGptSwapTxHashes: [], recentActions: [] },
): { observation: VisibleObservation; refs: VisibleRefMap } | null {
  const raw = agent.observe();
  if (!raw) return null;
  const npcRefs = new Map<string, string>();
  const playerRefs = new Map<string, string>();
  const self = raw.self;
  const potionShopAlreadyStocked = memory.purchasedPotionShopItemIds.size > 0 || hasPotionShopStock(self);
  const mferGptPaymentConfigured = Boolean(capabilities.mferGptPaymentConfigured) && !potionShopAlreadyStocked;
  const paymentSnapshot = capabilities.paymentSnapshot ?? null;

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
    const visibleNearbyHostileCount = visibleAliveNpcs.filter((other) => (
      other.id !== npc.id
      && getNpcDisposition(other) === "hostile"
      && Math.hypot(other.x - npc.x, other.z - npc.z) <= 8
    )).length;
    const knownNearbyHostileCount = getKnownPublicHostileCountAroundNpc(npc.id);
    const nearbyHostileCount = Math.max(visibleNearbyHostileCount, knownNearbyHostileCount);
    const pullRisk = getPullRisk(nearbyHostileCount);
    const activeQuestTargetIds = getActiveQuestTargetIds(npc, self.quests);
    npcRefs.set(ref, npc.id);
    npcRefs.set(npc.id, npc.id);
    return {
      ref,
      name: npc.name,
      role: npc.role,
      model: npc.model,
      health: `${Math.ceil(npc.health)}/${Math.ceil(npc.maxHealth)}`,
      distance: round(npc.distance),
      position: point(npc),
      dialogue: npc.dialogue,
      alive,
      hasLoot: npc.hasLoot,
      disposition,
      targeting,
      visibleNearbyHostileCount,
      nearbyHostileCount,
      pullRisk,
      pullAdvice: getPullAdvice({ disposition, targeting, nearbyHostileCount, pullRisk }),
      activeQuestTargetIds,
      questTargetAdvice: getQuestTargetAdvice(activeQuestTargetIds),
      questMarker: getNpcQuestMarker(npc, self.quests) ?? "",
      availableQuestIds: getAvailableQuestIds(npc.id, self.quests),
      readyTurnInQuestIds: getReadyTurnInQuestIds(npc.id, self.quests),
      questId: npc.questId,
    };
  });
  const lootableCorpses = nearbyNpcs
    .filter((npc) => !npc.alive && npc.hasLoot)
    .slice(0, 6)
    .map((npc) => ({
      ref: npc.ref,
      name: npc.name,
      distance: npc.distance,
      position: npc.position,
      activeQuestTargetIds: npc.activeQuestTargetIds,
      note: "Use loot with this npcRef to take all available loot and clear the corpse for normal despawn/respawn.",
    }));

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
        nativeBalanceEth: paymentSnapshot?.nativeBalanceEth ?? "",
        mferGptBalance: paymentSnapshot?.mferGptBalance ?? "",
        mferGptBalanceWei: paymentSnapshot?.mferGptBalanceWei ?? "",
        mferGptSwapConfigured: Boolean(paymentSnapshot?.swapConfigured),
        mferGptSwapNote: getMferGptSwapNote(paymentSnapshot, memory),
        recommendedSwapEthAmount: paymentSnapshot?.recommendedSwapEthAmount ?? "0.01",
      },
      runMemory: {
        purchasedPotionShopItemIds: [...memory.purchasedPotionShopItemIds],
        canceledQuestIds: [...memory.canceledQuestIds],
        mferGptSwapTxHashes: memory.mferGptSwapTxHashes.slice(-4),
        recentActions: memory.recentActions.slice(-8),
      },
      questProgress: getQuestProgress(self.quests, memory),
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
      lootableCorpses,
      nearbyPlayers,
      recentChat: raw.recentChat.map((message) => ({
        name: message.name,
        text: message.text,
        kind: message.kind ?? "say",
      })),
      stores: getStoreObservations(self, raw.nearbyNpcs, npcRefs, {
        mferGptPaymentConfigured,
        potionShopAlreadyStocked,
        mferGptSwapConfigured: Boolean(paymentSnapshot?.swapConfigured),
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
          "Use questProgress as the public all-quests checklist. Work toward questProgress.allQuestsCompletedOnce by completing remainingQuestIds once.",
          "When several options are legal, prefer questProgress.nextRecommendedQuestIds in order.",
          "Use known npcId from the handbook only for moving toward public, named NPCs.",
          "When no quest is active, questTrackerHints may name the next public quest giver; use move_near_npc or accept_quest with that npcId to continue.",
          "Use navigation.publicRallyPoints as public map coordinates for move_to. Prefer west-hog-pull for farm hog quests, claim-booth-hog-pull for hog-loop, loop-farm-road for farm danger, and plaza-safe for a full reset.",
          "Use travel_route for known public roads: plaza-to-daily-signal-camp, daily-signal-camp-to-mfergpt, plaza-to-loop-farm, loop-farm-to-claim-pile, loop-farm-to-route-post, route-post-to-plaza, route-post-to-signal-ridge, plaza-to-signal-ridge, or signal-ridge-to-static-lot.",
          "For quests, prefer accept_quest only from nearbyNpcs.availableQuestIds and complete_quest only from nearbyNpcs.readyTurnInQuestIds.",
          "Quest turn-in requires being within 3.75m of the turn-in NPC. If an enemy is targeting you and the ready turn-in NPC is farther away, clear the attacker or retreat before complete_quest.",
          "When several quests are available, prefer main progression quests, including main repeatable gates like route-patrol-daily and hog-loop, before side quests or optional dailies.",
          "Use fight_npc for sustained combat, but only with a currently visible npcRef.",
          "Use self.combatActions to see unlocked abilities, cooldowns, mana cost, cast time, range, and AoE radius before choosing use_ability or fight_npc.",
          "If observation.lootableCorpses is nonempty and you are not in danger, prefer loot before leaving the area. Looting clears bodies for normal despawn/respawn, even when the active quest does not require the item.",
          "Use loot with a lootable corpse npcRef and no itemId to take all available loot.",
          "For active quest combat, prefer nearbyNpcs.activeQuestTargetIds containing the active quest id. This includes shared defeat targets and public drop-source knowledge for collection quests. Avoid unrelated safe targets unless defending yourself, clearing an add, grouping, or intentionally leveling.",
          "nearbyNpcs.pullRisk and pullAdvice summarize public local pull risk around that target. For solo/safe pulls, only call a target isolated when nearbyHostileCount is 0.",
          "Targets above isolated risk can still be valid when intentionally grouping, using AoE/defensive recovery, or when full-health quest progress is blocked by only one likely add; do not run deeper into packs.",
          "For active combat or collection quests, move to the public target area from questTrackerHints/handbook, then fight one visible matching hostile at a time. Do not keep interacting with the quest giver unless the quest is ready.",
          "Read observation.self.aggroCount, observation.self.nearbyHostileCount, observation.self.dangerNote, and nearbyNpcs.targeting before fighting or moving deeper.",
          "If dangerNote is nonempty or aggroCount is above 1, stop pulling. Stabilize by finishing a current attacker, using AoE/control when available, retreating far to a safe rally point, using one item if it can land before the next hit, or respawning if defeated.",
          "If health is low even without aggro, recover before starting another pull.",
          "Do not wait while an NPC is targeting you; wait is a 5-second safe recovery pause only when no hostile is actively targeting you and you are not taking damage.",
          "Avoid overpulls: do not run through hostile packs; if several hostile NPCs are close or you are low health, move back along a public route, use an item, wait, or fight one visible isolated hostile.",
          "Use share_quest_link for socialAction/tweet quests when questTrackerHints says to share; do not try to complete those quests with chat.",
          "Use nearbyPlayers and recentChat as public social context. When safe, occasional chat, emote, move_near_player, or select_player actions are normal ways to greet, coordinate, or group with visible players; do not spam or interrupt combat recovery.",
          "If runMemory.canceledQuestIds contains a repeatable quest, do not accept that quest again during this run unless nearby players are visibly grouping for it.",
          "Use observation.stores for public merchant knowledge and available store actions.",
          "Use swap_eth_for_mfergpt when the local wallet has ETH, MFERGPT is low, and observation.wallet.mferGptSwapConfigured is true; this sends a normal local wallet transaction to the configured local swap router.",
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
    amountEth: cleanText(record.amountEth, 32),
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
          "Quest turn-in requires being within 3.75m of the turn-in NPC. If a ready turn-in is visible but you are being attacked outside turn-in range, stabilize first instead of spamming complete_quest.",
          "Use observation.questProgress as the public all-quests checklist and prefer observation.questProgress.nextRecommendedQuestIds.",
          "When no quest is active, questTrackerHints may name a public quest giver npcId; use move_near_npc or accept_quest with that npcId to continue.",
          "Never complete a quest unless the current observation says it is ready.",
          "Never request database reads, scripts, hidden server state, debug messages, teleport, boost, or privileged shortcuts.",
          "Use the public aggro/danger fields before fighting or moving deeper; finish a current attacker, use AoE/control, or retreat far when multiple NPCs are targeting you.",
          "For active quest combat, prefer NPCs whose activeQuestTargetIds includes that quest, including collection drop-source targets. A safe but unrelated target is usually a detour unless it is attacking you or blocking the path.",
          "Use observation.self.combatActions for ability readiness, cooldowns, range, cast times, and AoE radius.",
          "If observation.lootableCorpses is nonempty and you are not in danger, prefer loot before leaving the area. Looting clears bodies for normal despawn/respawn, even when the active quest does not require the item.",
          "Use loot with a lootable corpse npcRef and no itemId to take all available loot.",
          "Use observation.navigation.publicRallyPoints for concrete public move_to coordinates when retreating, regrouping, or staging.",
          "Use observation.stores for public merchant locations, item effects, prices, supported actions, and whether the local MFERGPT burn flow can buy stock.",
          "If observation.wallet.mferGptSwapConfigured is true and the wallet has ETH but little MFERGPT, you may use swap_eth_for_mfergpt before buying items. That is a normal local wallet transaction through the configured local swap router.",
          "Do not choose wait while an NPC is targeting you; wait is a 5-second safe recovery pause when you are not being attacked.",
          "Do not choose use_item as the only response while multiple NPCs are actively hitting you in melee unless health is high enough for the item to land; fight, AoE/control, or retreat farther first.",
          "Use share_quest_link for socialAction/tweet quests; chat does not progress those quests.",
          "Use observation.nearbyPlayers and recentChat as public social context. When safe, occasional chat, emote, move_near_player, or select_player actions are normal ways to greet, coordinate, or group with visible players; do not spam or interrupt combat recovery.",
          "Do not immediately re-accept a repeatable quest that observation.runMemory.canceledQuestIds says was canceled this run.",
          "Repeatable daily quests are optional and often dangerous; do not solo-run into a daily boss pack at low level.",
          "Prefer isolated targets with nearbyHostileCount 0 for normal quest pulls. If no isolated targets remain, use pullRisk/pullAdvice to choose between waiting, grouping with visible players, or intentionally taking a low-risk pull with AoE/defensive recovery ready.",
          "Prefer making quest progress. When local wallet tools are configured and you have no potion-shop stock, swap ETH to MFERGPT if needed, then buy useful potion-shop items by burning MFERGPT through the normal payment flow.",
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
      {
        const movingWhileTargeted = getSelfAttackerCount(agent) > 0;
        const target = { x: requiredNumber(decision.x, "x"), z: requiredNumber(decision.z, "z") };
        if (!movingWhileTargeted) assertHealthyEnoughForTravel(agent, "move_to");
        const routeIds = getPublicRoutesForLongMove(agent, target);
        if (routeIds.length > 0) {
          for (const routeId of routeIds) {
            await agent.moveAlong(resolveRoute(routeId), {
              range: getRouteRange(routeId),
              sprint: decision.sprint ?? true,
              timeoutMs: 180_000,
              stopOnDanger: true,
              maxSelfAttackers: 0,
              maxCloseHostiles: 4,
              dangerHealthRatio: 0.28,
            });
          }
        } else {
          assertMoveToReasonable(agent, target);
        }
        if (await moveToKnownRally(agent, target)) return;
        await agent.moveToPoint(target, {
          range: 5,
          sprint: decision.sprint ?? true,
          timeoutMs: 60_000,
          stopOnDanger: !movingWhileTargeted,
          maxSelfAttackers: 0,
          maxCloseHostiles: 3,
          dangerHealthRatio: 0.42,
        });
      }
      return;
    case "travel_route":
      {
        const routeId = resolveRouteId(decision.routeId);
        assertHealthyEnoughForTravel(agent, "travel_route");
        await agent.moveAlong(resolveRoute(routeId), {
          range: getRouteRange(routeId),
          sprint: decision.sprint ?? true,
          timeoutMs: 180_000,
          stopOnDanger: true,
          maxSelfAttackers: 0,
          maxCloseHostiles: 4,
          dangerHealthRatio: 0.28,
        });
      }
      return;
    case "move_near_npc":
      assertHealthyEnoughForTravel(agent, "move_near_npc");
      await agent.moveToNpc(resolveNpcRef(refs, decision.npcRef), {
        range: 3,
        timeoutMs: 60_000,
        stopOnDanger: true,
        maxSelfAttackers: 0,
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
      const npcId = optionalNpcRef(refs, decision.npcRef) ?? getQuestTurnInNpcId(questId);
      assertQuestCompletable(agent, questId);
      assertQuestTurnInReachable(agent, questId, npcId);
      await agent.completeQuest(questId, npcId);
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
      {
        const actionId = resolveCombatAction(decision.actionId);
        agent.useCombatAbility(actionId, resolveTarget(refs, decision));
        if (COMBAT.actions[actionId].requiresStationary) await delay(Math.min(COMBAT.actions[actionId].castTimeMs + 160, 4200));
      }
      return;
    case "fight_npc": {
      const npcId = resolveVisibleNpcRef(refs, decision.npcRef);
      const teamTarget = isTeamTargetNpcId(npcId);
      await agent.fightNpc(npcId, {
        timeoutMs: teamTarget ? 120_000 : 60_000,
        preferredActions: ["taunt", "iceBlast", "fireblast", "signalShot", "shoot", "whirlwind", "multishot", "attack"],
        healNearbyAllies: true,
        yieldOnDanger: true,
        maxSelfAttackers: teamTarget ? 4 : 3,
        maxCloseHostiles: teamTarget ? 5 : 4,
        dangerHealthRatio: teamTarget ? 0.34 : 0.2,
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
    case "swap_eth_for_mfergpt":
      await swapEthForMferGpt(decision, payment, memory);
      return;
    case "buy_potion_shop_item":
      await buyPotionShopItem(agent, decision, payment, memory);
      return;
    case "wait":
    default:
      await delay(5000);
  }
}

async function swapEthForMferGpt(
  decision: LlmDecision,
  payment: MferGptBurner | null,
  memory: RunMemory,
) {
  if (!payment) throw new Error("MFERGPT payment is not configured for this agent.");
  if (memory.mferGptSwapTxHashes.length > 0) {
    await delay(250);
    return;
  }
  const result = await payment.swapEthForMferGpt(decision.amountEth || "0.01");
  memory.mferGptSwapTxHashes.push(result.txHash);
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
    .map((npc) => `${npc.ref}:${npc.name}:${npc.health}:${npc.disposition}:risk=${npc.pullRisk}/pack${npc.nearbyHostileCount}${npc.activeQuestTargetIds.length ? `:quest=${npc.activeQuestTargetIds.join("+")}` : ""}${npc.targeting ? `->${npc.targeting}` : ""}`)
    .join("|");
  const players = observation.nearbyPlayers
    .slice(0, 3)
    .map((player) => `${player.ref}:${player.name}:${player.health}:d${player.distance}`)
    .join("|");
  const lootable = observation.lootableCorpses
    .slice(0, 3)
    .map((corpse) => `${corpse.ref}:${corpse.name}:d${corpse.distance}`)
    .join("|");
  const stores = observation.stores
    .filter((store) => store.npcId === POTION_SHOP_NPC_ID || store.distance <= 12)
    .slice(0, 2)
    .map((store) => `${store.npcId}:d${store.distance}:${store.status}`)
    .join("|");
  const wallet = observation.wallet.mferGptBalance || observation.wallet.nativeBalanceEth
    ? `wallet=eth:${observation.wallet.nativeBalanceEth || "?"},mfergpt:${observation.wallet.mferGptBalance || "?"},swap:${observation.wallet.mferGptSwapConfigured ? "yes" : "no"}`
    : "";
  const questGoal = `questGoal=${observation.questProgress.completedQuestCount}/${observation.questProgress.totalQuestCount}`;
  const nextQuests = observation.questProgress.nextRecommendedQuestIds.slice(0, 3).join(",");
  return [
    `hp=${observation.self.health}`,
    `mana=${observation.self.mana}`,
    `pos=${observation.self.position.x},${observation.self.position.z}`,
    questGoal,
    nextQuests ? `next=${nextQuests}` : "",
    `aggro=${observation.self.aggroCount}`,
    `hostiles=${observation.self.nearbyHostileCount}`,
    quests ? `quests=${quests}` : "quests=none",
    observation.self.dangerNote ? `danger=${observation.self.dangerNote}` : "",
    wallet,
    nearby ? `nearby=${nearby}` : "",
    lootable ? `loot=${lootable}` : "",
    players ? `players=${players}` : "",
    stores ? `stores=${stores}` : "",
  ].filter(Boolean).join(" ");
}

function rememberAction(memory: RunMemory, decision: LlmDecision, status: "ok" | "failed", message = "") {
  const detail = [
    decision.action,
    decision.questId ? `quest=${decision.questId}` : "",
    decision.itemId ? `item=${decision.itemId}` : "",
    decision.amountEth ? `eth=${decision.amountEth}` : "",
    decision.npcRef ? `npc=${decision.npcRef}` : "",
    message ? `${status}:${cleanText(message, 160)}` : status,
  ].filter(Boolean).join(" ");
  memory.recentActions = [...memory.recentActions.slice(-7), detail];
}

function hasPotionShopStock(self: PlayerSnapshot) {
  return self.inventory.some((item) => POTION_SHOP_ITEM_IDS.includes(item.id as PotionShopItemId) && item.count > 0);
}

async function observePayment(payment: MferGptBurner | null): Promise<WalletPaymentSnapshot | null> {
  if (!payment) return null;
  try {
    return await payment.observe();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function getMferGptSwapNote(snapshot: WalletPaymentSnapshot | null, memory: RunMemory) {
  if (snapshot?.error) return `local wallet balance/swap observation failed: ${cleanText(snapshot.error, 140)}`;
  if (!snapshot?.swapConfigured) return "No local MFERGPT swap router is configured for this run.";
  if (memory.mferGptSwapTxHashes.length > 0) return "This run already swapped local ETH to MFERGPT; use the tokens before swapping again.";
  return `Can swap local ETH to MFERGPT through the configured local router. Recommended first swap: ${snapshot.recommendedSwapEthAmount ?? "0.01"} ETH.`;
}

function getQuestProgress(quests: PlayerSnapshot["quests"], memory: RunMemory): VisibleObservation["questProgress"] {
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const knownQuests = QUEST_IDS.map((questId) => {
    const quest = questById.get(questId);
    const status = getPublicQuestStatus(questId, quest, quests, memory);
    return {
      questId,
      title: QUESTS[questId].title,
      kind: getPublicQuestKind(questId),
      status,
      progress: quest ? `${quest.progress}/${quest.required}` : `0/${QUESTS[questId].required}`,
      giverNpcId: QUESTS[questId].giverNpcId,
      turnInNpcId: getQuestTurnInNpcId(questId),
      requiredQuestId: getPublicQuestRequirement(questId),
      nextQuestId: getPublicQuestNextQuestId(questId),
      objective: QUESTS[questId].objectiveLabel,
      publicPlan: getPublicQuestPlan(questId),
    };
  });
  const completedQuestIds = knownQuests
    .filter((quest) => quest.status === "completed")
    .map((quest) => quest.questId);
  const activeQuestIds = knownQuests
    .filter((quest) => quest.status === "active")
    .map((quest) => quest.questId);
  const readyQuestIds = knownQuests
    .filter((quest) => quest.status === "ready")
    .map((quest) => quest.questId);
  const availableQuestIds = knownQuests
    .filter((quest) => quest.status === "available")
    .map((quest) => quest.questId);
  const lockedQuestIds = knownQuests
    .filter((quest) => quest.status === "locked")
    .map((quest) => quest.questId);
  const remainingQuestIds = knownQuests
    .filter((quest) => quest.status !== "completed")
    .map((quest) => quest.questId);
  const nextRecommendedQuestIds = [
    ...readyQuestIds,
    ...activeQuestIds,
    ...availableQuestIds.filter((questId) => isMainProgressionQuest(questId as QuestId)),
    ...availableQuestIds.filter((questId) => getPublicQuestKind(questId as QuestId) === "side"),
    ...availableQuestIds.filter((questId) => !isMainProgressionQuest(questId as QuestId) && getPublicQuestKind(questId as QuestId) !== "side"),
  ].slice(0, 8);

  return {
    totalQuestCount: QUEST_IDS.length,
    completedQuestCount: completedQuestIds.length,
    activeQuestIds,
    readyQuestIds,
    availableQuestIds,
    lockedQuestIds,
    remainingQuestIds,
    nextRecommendedQuestIds,
    allQuestsCompletedOnce: completedQuestIds.length === QUEST_IDS.length,
    knownQuests,
  };
}

function getPublicQuestStatus(
  questId: QuestId,
  quest: PlayerSnapshot["quests"][number] | undefined,
  quests: PlayerSnapshot["quests"],
  memory: RunMemory,
) {
  if (quest?.status === "active" || quest?.status === "ready") return quest.status;
  if (quest?.status === "completed" && !isQuestReadyToRepeat(questId, quest)) return "completed";
  if (quest?.status === "completed" && isQuestReadyToRepeat(questId, quest)) return "completed";
  if (memory.canceledQuestIds.has(questId)) return "canceled-this-run";
  if (isQuestAvailableForSnapshots(questId, quests)) return "available";
  return "locked";
}

function getPublicQuestKind(questId: QuestId) {
  if (questId === "ogre-raid-daily") return "daily raid";
  if (isMainProgressionQuest(questId) && isRepeatableQuest(questId)) return "main repeatable";
  if (isSideQuest(questId)) return "side";
  if (isRepeatableQuest(questId)) return "repeatable";
  return "main";
}

function isMainProgressionQuest(questId: QuestId) {
  if (isSideQuest(questId) || questId === "ogre-raid-daily") return false;
  return !isRepeatableQuest(questId) || questId === "route-patrol-daily" || questId === "hog-loop";
}

function isSideQuest(questId: QuestId) {
  return questId === "ask-mfergpt" || questId === "mfergpt-checkin" || questId === "tweet-town-link" || questId === "mfergpt-daily-signal";
}

function getQuestRecommendationRank(questId: QuestId) {
  if (isMainProgressionQuest(questId)) return 0;
  if (isSideQuest(questId)) return 1;
  if (isRepeatableQuest(questId)) return 2;
  return 3;
}

function getPublicQuestRequirement(questId: QuestId) {
  const quest = QUESTS[questId];
  return "requiredQuestId" in quest ? quest.requiredQuestId : "";
}

function getPublicQuestNextQuestId(questId: QuestId) {
  const quest = QUESTS[questId];
  return "nextQuestId" in quest ? quest.nextQuestId : "";
}

function getPublicQuestPlan(questId: QuestId) {
  if (questId === "set-your-traits") return "accept at traits-mfer, use update_traits, then complete at traits-mfer";
  if (questId === "mfer-beginnings") return "accept at og-mfer, then complete at dao-mfer";
  if (questId === "dao-tour") return "accept at dao-mfer, then complete at fountain-mfer";
  if (questId === "fountain-vibes") return "accept at fountain-mfer, then complete at og-mfer";
  if (questId === "sealed-note") return "accept at og-mfer, deliver the note, then complete at wearables-mfer";
  if (questId === "farm-road-handoff") return "accept at wearables-mfer, travel_route plaza-to-loop-farm, then complete at hogwatch-mfer";
  if (questId === "ask-mfergpt") return "accept at wearables-mfer, chat @mfergpt, then complete at mfergpt";
  if (questId === "mfergpt-checkin") return "accept at mfergpt, chat @mfergpt, then complete at mfergpt";
  if (questId === "tweet-town-link") return "accept at mfergpt, share_quest_link, then complete at mfergpt";
  if (questId === "mfergpt-daily-signal") return "optional daily: stage at daily-signal-camp edge with players, defeat visible daily boss, then complete at mfergpt";
  if (questId === "boar-bristle-cull") return "stage at west-hog-pull, prefer visible isolated hogs, use pullRisk/pullAdvice before taking a low-risk non-isolated hog, wait or group instead of running through the farmyard, then complete at hogwatch-mfer";
  if (questId === "feral-farmers") return "fight visible farmhand-bran, farmhand-mae, and field-mage-sol one at a time, then complete at hogwatch-mfer";
  if (questId === "hog-livers") return "fight and loot visible hogs near the claim pile until enough chewed EOS drops, then complete at hogwatch-mfer";
  if (questId === "field-camp-delivery") return "travel_route loop-farm-to-route-post, then complete at field-guide-mfer";
  if (questId === "route-patrol-daily") return "clear visible route-post hogs or claim-burnt farmers one at a time, then complete at field-guide-mfer";
  if (questId === "hog-loop") return "stage at claim-booth-hog-pull, fight visible hogs near the claim booth one at a time, then complete at pen-keeper-mfer";
  if (questId === "ridge-dispatch") return "travel_route route-post-to-signal-ridge, then complete at ridge-guide-mfer";
  if (questId === "signal-scraps") return "travel_route signal-ridge-to-static-lot, fight and loot visible ridge enemies for scraps, then complete at ridge-guide-mfer";
  if (questId === "cut-the-static") return "fight visible ridge-raider-vex, ridge-raider-pax, and static-mage-ori one at a time, then complete at beacon-keeper-mfer";
  if (questId === "baron-of-static") return "group with visible players, fight static-baron-nox from static-lot edge with items/heals/taunts, then complete at beacon-keeper-mfer";
  if (questId === "ogre-raid-daily") return "accept at beacon-keeper-mfer, interact there to call raid-ogre-mfer, fight as a group, then complete at beacon-keeper-mfer";
  return `complete the public objective and turn in at ${getQuestTurnInNpcId(questId)}`;
}

function getStoreObservations(
  self: PlayerSnapshot,
  nearbyNpcs: Array<{ id: string; name: string; x: number; z: number; distance: number }>,
  npcRefs: Map<string, string>,
  capabilities: { mferGptPaymentConfigured: boolean; potionShopAlreadyStocked: boolean; mferGptSwapConfigured: boolean },
): VisibleObservation["stores"] {
  const nearbyById = new Map(nearbyNpcs.map((npc) => [npc.id, npc]));
  return PUBLIC_STORES.map((store) => {
    const nearby = nearbyById.get(store.npcId);
    const position = nearby ? point(nearby) : store.position;
    const distance = nearby ? nearby.distance : distanceToPoint(self, store.position);
    const isPotionShop = store.npcId === POTION_SHOP_NPC_ID;
    const isSwapMfer = store.npcId === "swap-mfer";
    const status = isPotionShop
      ? capabilities.potionShopAlreadyStocked
        ? "already stocked; use existing items before buying more"
        : capabilities.mferGptPaymentConfigured
        ? "can buy now with local MFERGPT burn receipt"
        : "visible/store-known, but no local MFERGPT payment signer is configured"
      : isSwapMfer
      ? capabilities.mferGptSwapConfigured
        ? "can swap local ETH to MFERGPT with the configured local router"
        : "known swap NPC; no local swap router is configured for this run"
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
        : isSwapMfer && capabilities.mferGptSwapConfigured
        ? ["move_near_npc", "interact_npc", "swap_eth_for_mfergpt"]
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
  if (aggroCount > 1) return `${aggroCount} visible NPCs are targeting you; stop pulling, finish a current attacker or use AoE/control if possible, and retreat far before slow recovery.`;
  if (aggroCount > 0 && healthRatio <= 0.35) return "You are under attack at low health; heal, use an item, retreat toward a road, or respawn if defeated.";
  if (nearbyHostileCount > 2) return `${nearbyHostileCount} visible hostile NPCs are close; avoid moving deeper and pull back before fighting.`;
  if (nearbyHostileCount > 0 && healthRatio <= 0.3) return "Hostile NPCs are close while health is critical; recover before taking another fight.";
  if (healthRatio > 0 && healthRatio <= 0.55) return "Health is low; if no NPC is targeting you, use wait at a safe rally point or use_item before moving or fighting again. If targeted, heal, use an item, or retreat.";
  return "";
}

function getPullRisk(nearbyHostileCount: number) {
  if (nearbyHostileCount <= 0) return "isolated";
  if (nearbyHostileCount === 1) return "low-add-risk";
  if (nearbyHostileCount === 2) return "pack-risk";
  return "high-pack-risk";
}

function getPullAdvice({
  disposition,
  targeting,
  nearbyHostileCount,
  pullRisk,
}: {
  disposition: string;
  targeting: string;
  nearbyHostileCount: number;
  pullRisk: string;
}) {
  if (targeting === "you") return "already targeting you; finish or recover before pulling anything else";
  if (disposition === "friendly") return "friendly/noncombat NPC; interact or quest only";
  if (pullRisk === "isolated") return "best solo target";
  if (pullRisk === "low-add-risk") return "possible one-add pull; valid when healthy, stocked, or grouped, with recovery/AoE ready";
  if (pullRisk === "pack-risk") return "pack pull; prefer group, AoE/defensives, or clearing safer targets first";
  return `${nearbyHostileCount} nearby-risk hostiles; avoid solo unless intentionally testing group/AoE combat`;
}

function getActiveQuestTargetIds(
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
  quests: PlayerSnapshot["quests"],
) {
  return quests
    .filter((quest) => quest.status === "active")
    .filter((quest) => isNpcActiveQuestTarget(npc, quest.id, quest.flags))
    .map((quest) => quest.id);
}

function isNpcActiveQuestTarget(
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
  questId: QuestId,
  questFlags = "",
) {
  const quest = QUESTS[questId];
  const objectiveIds: readonly string[] = "objectives" in quest ? quest.objectives.map((objective) => objective.id) : [];
  if (objectiveIds.includes(npc.id)) {
    const completedObjectiveIds = new Set(questFlags.split(",").filter(Boolean));
    return !completedObjectiveIds.has(npc.id);
  }
  if ("defeatNpcModels" in quest && (quest.defeatNpcModels as readonly string[]).includes(npc.model)) return true;
  if ("defeatNpcRoles" in quest && (quest.defeatNpcRoles as readonly string[]).includes(npc.role)) return true;
  if ("requiredItemId" in quest && matchesAgentItemDropTarget(npc, questId)) return true;
  return false;
}

function matchesAgentItemDropTarget(
  npc: Pick<NpcSnapshot, "id" | "model" | "role">,
  questId: QuestId,
) {
  const target = AGENT_ITEM_DROP_TARGETS[questId];
  if (!target) return false;
  if (target.models?.includes(npc.model)) return true;
  if (target.roles?.includes(npc.role)) return true;
  return target.idPrefixes?.some((prefix) => npc.id.startsWith(prefix)) ?? false;
}

function getQuestTargetAdvice(activeQuestTargetIds: string[]) {
  return activeQuestTargetIds.length > 0
    ? `counts for active quest(s): ${activeQuestTargetIds.join(", ")}`
    : "not a direct active quest target from shared quest definitions";
}

function getKnownPublicHostileCountAroundNpc(npcId: string) {
  const target = KNOWN_PUBLIC_HOSTILE_RISK_TARGETS[npcId];
  if (!target) return 0;
  return KNOWN_PUBLIC_HOSTILE_ANCHORS.filter((hostile) => (
    hostile.id !== npcId
    && Math.hypot(hostile.x - target.x, hostile.z - target.z) <= PUBLIC_ASSIST_RISK_RANGE
  )).length;
}

async function moveNearPlayer(agent: MferlandAgentClient, sessionId: string) {
  const target = agent.getPlayers().find((player) => player.sessionId === sessionId);
  if (!target) throw new Error(`nearby player ${sessionId} not visible`);
  await agent.moveToPoint({ x: target.x, z: target.z }, { range: 2.6, timeoutMs: 12_000 });
}

function getSelfAttackerCount(agent: MferlandAgentClient) {
  const self = agent.getSelf();
  if (!self) return 0;
  return agent.getNpcs().filter((npc) => (
    npc.health > 0
    && npc.defeatedAt <= 0
    && npc.aggroTargetId === self.sessionId
  )).length;
}

function assertHealthyEnoughForTravel(agent: MferlandAgentClient, action: string) {
  const self = agent.getSelf();
  if (!self || self.health <= 0 || self.maxHealth <= 0) return;
  if (getSelfAttackerCount(agent) > 0) return;
  const healthRatio = self.health / self.maxHealth;
  if (healthRatio > 0.35) return;
  const recoveryItem = self.inventory.find((item) => (
    item.count > 0
    && (item.id === "red-juice" || item.id === "field-snack")
  ));
  const recoveryAction = recoveryItem ? `use_item itemId=${recoveryItem.id}` : "wait safely until health recovers";
  throw new Error(`${action} blocked at ${Math.ceil(healthRatio * 100)}% health with no NPC targeting me; ${recoveryAction} before traveling`);
}

function assertMoveToReasonable(agent: MferlandAgentClient, target: Point) {
  const self = agent.getSelf();
  if (!self) return;
  const distance = Math.hypot(target.x - self.x, target.z - self.z);
  if (distance <= 70) return;
  const routeIds = suggestPublicRouteIds(self, target);
  throw new Error(`move_to is for local positioning/rally points, not ${Math.round(distance)}m cross-zone travel; use travel_route${routeIds.length ? ` routeId=${routeIds.join(" then ")}` : ""} or move in shorter public-route legs`);
}

function getPublicRoutesForLongMove(agent: MferlandAgentClient, target: Point) {
  const self = agent.getSelf();
  if (!self) return [];
  const distance = Math.hypot(target.x - self.x, target.z - self.z);
  if (distance <= 70) return [];
  return suggestPublicRouteIds(self, target);
}

function suggestPublicRouteIds(self: Point, target: Point) {
  if (self.x < -100 && self.z > 100 && Math.hypot(target.x, target.z) < 45) return ["route-post-to-plaza"];
  if (Math.hypot(self.x, self.z) < 45 && target.x < -95 && target.z > 100) return ["plaza-to-loop-farm", "loop-farm-to-route-post"];
  if (Math.hypot(self.x, self.z) < 45 && target.x < -45 && target.z > 45) return ["plaza-to-loop-farm"];
  if (self.x < -45 && self.z > 45 && target.x < -100 && target.z > 100) return ["loop-farm-to-route-post"];
  if (self.x < -100 && self.z > 100 && target.x > 70 && target.z < -40) return ["route-post-to-signal-ridge"];
  if (Math.hypot(self.x, self.z) < 45 && target.x > 70 && target.z < -40) return ["plaza-to-signal-ridge"];
  return [];
}

async function moveToKnownRally(agent: MferlandAgentClient, target: Point) {
  if (Math.hypot(target.x - CLAIM_BOOTH_RALLY_POINT.x, target.z - CLAIM_BOOTH_RALLY_POINT.z) > 3) return false;
  try {
    await agent.moveToNpc("pen-keeper-mfer", {
      range: 3,
      timeoutMs: 60_000,
      stopOnDanger: true,
      maxSelfAttackers: 0,
      maxCloseHostiles: 4,
      dangerHealthRatio: 0.28,
    });
  } catch (error) {
    const self = agent.getSelf();
    if (!self || distanceToPoint(self, CLAIM_BOOTH_RALLY_POINT) > 18) throw error;
  }
  return true;
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

function assertQuestTurnInReachable(agent: MferlandAgentClient, questId: QuestId, npcId: string) {
  const self = agent.getSelf();
  const npc = agent.getNpc(npcId);
  if (!self || !npc) return;
  const distance = distanceToPoint(self, npc);
  const attackers = getSelfAttackerCount(agent);
  if (attackers > 0 && distance > QUEST_TURN_IN_RANGE) {
    throw new Error(`quest ${questId} turn-in requires ${QUEST_TURN_IN_RANGE}m range; ${attackers} attacker(s) targeting you at ${round(distance)}m from ${npcId}`);
  }
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
      hints.push(`travel_route routeId=loop-farm-to-claim-pile to west-hog-pull, then prefer isolated visible hogs; if progress is blocked and health is full, a low-add-risk hog is acceptable with recovery ready, but do not move through the farmyard; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "feral-farmers") {
      hints.push(`fight_npc visible named farm mfers one at a time near the farmyard: bran, mae, sol; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "hog-livers") {
      hints.push(`travel_route routeId=loop-farm-to-claim-pile to west-hog-pull, prefer isolated visible hogs and use pullRisk/pullAdvice before taking low-add-risk hogs, then loot defeated hogs for chewed EOS; progress ${quest.progress}/${quest.required}; complete at hogwatch-mfer when ready`);
    } else if (quest.id === "route-patrol-daily") {
      hints.push(`fight_npc visible hogs or claim-burnt farmer mfers near route post one at a time; progress ${quest.progress}/${quest.required}; complete at field-guide-mfer when ready`);
    } else if (quest.id === "hog-loop") {
      hints.push(`fight_npc visible hogs near claim booth one at a time; if no safe hog is visible and you are already near route post or claim booth, wait for a nearby hog instead of walking west; progress ${quest.progress}/${quest.required}; complete at pen-keeper-mfer when ready`);
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
      .sort((left, right) => getQuestRecommendationRank(left) - getQuestRecommendationRank(right));
    for (const questId of availableQuestIds) {
      const definition = QUESTS[questId];
      const prefix = isMainProgressionQuest(questId)
        ? ""
        : isRepeatableQuest(questId)
        ? "optional repeatable: "
        : "side quest: ";
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

function resolveRouteId(value: string | undefined) {
  const routeId = cleanText(value, 80);
  if (routeId === "plaza-to-daily-signal-camp") return routeId;
  if (routeId === "daily-signal-camp-to-mfergpt") return routeId;
  if (routeId === "plaza-to-loop-farm") return routeId;
  if (routeId === "loop-farm-to-claim-pile") return routeId;
  if (routeId === "loop-farm-to-route-post") return routeId;
  if (routeId === "route-post-to-signal-ridge") return routeId;
  if (routeId === "route-post-to-plaza") return routeId;
  if (routeId === "plaza-to-signal-ridge") return routeId;
  if (routeId === "signal-ridge-to-static-lot") return routeId;
  throw new Error(`invalid routeId ${routeId}`);
}

function resolveRoute(value: string | undefined): Point[] {
  const routeId = resolveRouteId(value);
  if (routeId === "plaza-to-daily-signal-camp") return DAILY_BOSS_ROUTE;
  if (routeId === "daily-signal-camp-to-mfergpt") return DAILY_BOSS_RETURN_ROUTE;
  if (routeId === "plaza-to-loop-farm") return FARM_ROUTE;
  if (routeId === "loop-farm-to-claim-pile") return FARMYARD_ROUTE;
  if (routeId === "loop-farm-to-route-post") return FIELD_CAMP_ROUTE;
  if (routeId === "route-post-to-signal-ridge") return RIDGE_ROUTE;
  if (routeId === "route-post-to-plaza") return ROUTE_POST_TO_PLAZA_ROUTE;
  if (routeId === "plaza-to-signal-ridge") return RIDGE_FROM_PLAZA_ROUTE;
  if (routeId === "signal-ridge-to-static-lot") return RIDGE_FIELD_ROUTE;
  throw new Error(`invalid routeId ${routeId}`);
}

function getRouteRange(routeId: string) {
  return routeId === "loop-farm-to-claim-pile" ? 3 : 8;
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
  { x: -82, z: 60 },
  { x: -99, z: 75 },
];
const FIELD_CAMP_ROUTE: Point[] = [
  { x: -64.5, z: 64.5 },
  { x: -82, z: 60 },
  { x: -112, z: 70 },
  { x: -128, z: 102 },
  { x: -124, z: 124 },
  { x: -119.2, z: 132.4 },
];
const RIDGE_ROUTE: Point[] = [
  { x: -124, z: 124 },
  { x: -128, z: 102 },
  { x: -112, z: 70 },
  { x: -82, z: 60 },
  { x: -31, z: 60 },
  { x: 0, z: 29 },
  { x: 0, z: -34 },
  { x: 53, z: -11.5 },
  { x: 75, z: -22 },
  { x: 120, z: -62 },
  { x: 108.8, z: -92.8 },
];
const ROUTE_POST_TO_PLAZA_ROUTE: Point[] = [
  { x: -124, z: 124 },
  { x: -128, z: 102 },
  { x: -112, z: 70 },
  { x: -82, z: 60 },
  { x: -31, z: 60 },
  { x: 0, z: 29 },
  { x: -2.4, z: 4.2 },
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

const PUBLIC_ASSIST_RISK_RANGE = 12;
const QUEST_TURN_IN_RANGE = 3.75;
const AGENT_ITEM_DROP_TARGETS: Partial<Record<QuestId, {
  models?: readonly string[];
  roles?: readonly string[];
  idPrefixes?: readonly string[];
}>> = {
  "hog-livers": { models: ["hog"] },
  "signal-scraps": { idPrefixes: ["ridge-raider-", "static-"] },
};
const KNOWN_PUBLIC_HOSTILE_ANCHORS: Array<{ id: string; x: number; z: number }> = [
  { id: "farmhand-bran", x: -77.5, z: 86.5 },
  { id: "farmhand-mae", x: -87.5, z: 91.5 },
  { id: "field-mage-sol", x: -73.2, z: 99.8 },
  { id: "farmhand-jo", x: -94.5, z: 102.4 },
  { id: "field-mage-ren", x: -84.8, z: 108.6 },
  { id: "ridge-raider-vex", x: 145.5, z: -84.2 },
  { id: "ridge-raider-pax", x: 153.2, z: -95.8 },
  { id: "static-mage-ori", x: 150.2, z: -113.4 },
  { id: "ridge-raider-loop", x: 142, z: -74.5 },
  { id: "ridge-raider-spark", x: 158.2, z: -106.2 },
];
const KNOWN_PUBLIC_HOSTILE_RISK_TARGETS: Record<string, Point> = {
  "wild-hog-rooter": { x: -81.5, z: 88.2 },
  "wild-hog-bristle": { x: -76.8, z: 93.5 },
  "wild-hog-snort": { x: -89.2, z: 95.4 },
  "wild-hog-mud": { x: -71.4, z: 86.9 },
  "wild-hog-runt": { x: -94.8, z: 88.3 },
  "wild-hog-tusk": { x: -80.7, z: 80.1 },
  "wild-hog-grub": { x: -90.9, z: 78.8 },
  "wild-hog-boar": { x: -70.6, z: 101.4 },
  "wild-hog-thistle": { x: -98.4, z: 104.6 },
  "wild-hog-burrow": { x: -86.2, z: 111.8 },
  "wild-hog-ridge": { x: -76.4, z: 113.5 },
  "wild-hog-camp": { x: -102.8, z: 120.2 },
  "ridge-raider-vex": { x: 145.5, z: -84.2 },
  "ridge-raider-pax": { x: 153.2, z: -95.8 },
  "static-mage-ori": { x: 150.2, z: -113.4 },
  "ridge-raider-loop": { x: 142, z: -74.5 },
  "ridge-raider-spark": { x: 158.2, z: -106.2 },
  "static-baron-nox": { x: 151.5, z: -124.8 },
};

const CLAIM_BOOTH_RALLY_POINT = { x: -112.9, z: 135.6 };

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
    id: "west-hog-pull",
    label: "west hog pull point",
    position: { x: -99, z: 75 },
    useWhen: "use to pull safer west-side hogs without walking through the hostile farmer yard",
  },
  {
    id: "claim-booth-hog-pull",
    label: "claim booth hog staging point",
    position: CLAIM_BOOTH_RALLY_POINT,
    useWhen: "use for hog-loop near claim booth; stay by the booth and fight visible nearby hogs, do not use west-hog-pull for this quest",
  },
  {
    id: "claim-pile-pull",
    label: "claim pile pull point",
    position: { x: -70, z: 113 },
    useWhen: "dangerous interior farm edge; use only after observing no hostile farmers nearby or when intentionally grouping",
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
    payment: "swap local ETH to local MFERGPT through the configured local router, then burn MFERGPT for items",
    status: "swap status is computed from wallet payment config",
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
    "Quest turn-in requires being within 3.75m of the turn-in NPC. If a ready turn-in is visible but you are being attacked outside turn-in range, stabilize first instead of spamming complete_quest.",
    "Use observation.questProgress as the public all-quests checklist and prefer observation.questProgress.nextRecommendedQuestIds when several actions are legal.",
    "When no quest is active, questTrackerHints may name a public quest giver npcId; use move_near_npc or accept_quest with that npcId to continue the visible questline.",
    "Never complete a quest unless the current observation says it is ready.",
    "Use observation.self.aggroCount, observation.self.nearbyHostileCount, observation.self.dangerNote, and nearbyNpcs.targeting to avoid overpulls.",
    "Use observation.self.combatActions for ability readiness, cooldowns, range, cast times, and AoE radius. AoE abilities are valid when unlocked and intentionally handling grouped enemies.",
    "If observation.lootableCorpses is nonempty and you are not in danger, prefer loot before leaving the area. Looting clears bodies for normal despawn/respawn, even when the active quest does not require the item.",
    "Use loot with a lootable corpse npcRef and no itemId to take all available loot.",
    "Use observation.navigation.publicRallyPoints for concrete public move_to coordinates; west-hog-pull is for farm hog quests, claim-booth-hog-pull is for hog-loop, loop-farm-road is the farm retreat point, plaza-safe is a full reset.",
    "Use travel_route instead of move_to for long cross-zone travel; move_to is for local positioning and nearby rally points.",
    "Use observation.stores for public merchant locations, item effects, prices, supported actions, whether the local swap router can swap ETH to MFERGPT, and whether the local MFERGPT burn flow can buy potion-shop stock.",
    "If observation.wallet.mferGptSwapConfigured is true and MFERGPT is low, swap_eth_for_mfergpt with amountEth around observation.wallet.recommendedSwapEthAmount is a normal local wallet action.",
    "For active quest combat, prefer nearbyNpcs.activeQuestTargetIds containing the active quest id, including collection drop-source targets. Avoid unrelated safe targets unless defending yourself, clearing an add, grouping, or intentionally leveling.",
    "Use nearbyNpcs.pullRisk, pullAdvice, and nearbyHostileCount to choose targets. Do not describe a target as isolated unless nearbyHostileCount is 0.",
    "If multiple NPCs are targeting you, or dangerNote is nonempty, pick a stabilization action instead of starting a new pull or moving deeper into the pack.",
    "Do not choose wait while an NPC is targeting you; wait is a 5-second safe recovery pause. Move toward a safer road coordinate, use an item once if it can land safely, heal, fight a current attacker, or respawn if defeated.",
    "When multiple NPCs target you, avoid short retreats plus slow recovery in melee; finish a current attacker, use AoE/control if available, or retreat far enough to break the pack.",
    "Use share_quest_link for socialAction/tweet quests. Chat does not progress those quests.",
    "Use observation.nearbyPlayers and recentChat as public social context. When safe, occasional chat, emote, move_near_player, or select_player actions are normal ways to greet, coordinate, or group with visible players; do not spam or interrupt combat recovery.",
    "If observation.runMemory.canceledQuestIds contains a repeatable quest, do not accept it again during this run unless visible players are grouping for it.",
    "Prefer main progression quests, including main repeatable gates like route-patrol-daily and hog-loop, before side quests or optional dailies unless a group is ready for the daily.",
    "Avoid overpulls: do not run through hostile packs; if several hostile NPCs are close or health is low, move back along a public route, heal/use items, wait only when safe, or fight one visible isolated hostile.",
    "Prefer concrete progress: if local wallet tools are configured and you have no potion-shop stock, swap ETH to MFERGPT if needed, then buy a useful potion-shop item by burning MFERGPT; otherwise progress quests, cooperate with visible players, fight enemies, loot, and turn quests in.",
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

type AnyRecord = Record<string, unknown>;

export type LocalOllamaConfig = {
  objective: string;
  decisionModel: string;
  ollamaHost: string;
  ollamaNumCtx: number;
  ollamaNumPredict: number;
  decisionTimeoutMs: number;
};

export async function decideWithOllama(config: LocalOllamaConfig, observation: unknown, decisionActions: readonly string[]): Promise<unknown> {
  const localObservation = compactObservationForOllama(observation);
  const prompt = [
    "/no_think",
    buildDecisionPrompt(config.objective, localObservation),
    "",
    "Ollama output contract:",
    `Return only one JSON object. action must be one of: ${decisionActions.join(", ")}.`,
    "Use these keys when relevant: action, reason, x, z, npcRef, playerRef, questId, itemId, chainTokenId, slotId, talentId, actionId, text, emoteId, quantity, amountEth, paymentTxHash, paymentAmountWei, paymentChainId, paymentContractAddress, sprint, traits.",
    "Use semantic room actions when possible: if you are near a visible friendly NPC and want information or quests, choose interact_npc with npcRef; do not circle with move_to coordinates.",
    "nearbyQuestNpcs is high priority. If a nearbyQuestNpcs row is in interaction range, interact with it before continuing travel, unless it is for a completed quest.",
    "If recent messages or questMemory show an offered or turn-in quest, choose accept_quest or complete_quest with questId instead of repeatedly interacting with the same NPC.",
    "Completed quests are history. Do not move_to, interact, accept, or complete them again; if completedQuestNextHints exist, follow the next giver/quest only, otherwise explore new NPCs, combat, loot, or shops.",
    "If several friendly NPC interactions only produce saved state and no active/ready quest, stop asking the same plaza NPCs and choose travel_route to a public route that leaves the current area.",
    "After arriving at a new landmark, interact with a visible friendly NPC there or continue to a different public route; do not repeat travel_route to the landmark you already reached.",
    "If movementTrouble says a route is unsafe and weak hostiles or loot are nearby, switch to fight_npc or loot instead of trying another deeper route.",
    "If friendly NPCs give no new quest state and weak hostiles or loot are visible nearby, fight or loot before asking more friendly NPCs.",
    "Use move_to only for travel to a world point when no specific NPC, quest, loot, item, combat, or social action applies.",
    "Omit unused keys or set them to null. Do not include markdown, commentary, arrays, nested copies of the observation, or repeated keys.",
  ].join("\n");
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.decisionTimeoutMs);
  try {
    const response = await fetch(joinUrl(config.ollamaHost, "/api/generate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.decisionModel || "qwen3:8b",
        prompt,
        stream: false,
        format: "json",
        think: false,
        options: {
          temperature: 0,
          top_k: 20,
          top_p: 0.8,
          num_ctx: config.ollamaNumCtx,
          num_predict: config.ollamaNumPredict,
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`ollama ${response.status}: ${text}`);
    const body = JSON.parse(text) as { response?: unknown; error?: unknown; done_reason?: unknown; prompt_eval_count?: unknown; eval_count?: unknown };
    if (typeof body.error === "string" && body.error) throw new Error(body.error);
    const raw = typeof body.response === "string" ? body.response : JSON.stringify(body.response ?? "");
    if (process.env.AGENT_OLLAMA_DEBUG === "1") {
      console.error(`[mferland-agent] ollama debug promptChars=${prompt.length} responseChars=${raw.length} elapsedMs=${Date.now() - startedAt} done=${String(body.done_reason ?? "")} promptEval=${String(body.prompt_eval_count ?? "")} eval=${String(body.eval_count ?? "")} raw=${JSON.stringify(raw.slice(0, 500))}`);
    }
    try {
      return parseDecisionJson(raw);
    } catch (error) {
      console.error(`[mferland-agent] ollama invalid promptChars=${prompt.length} responseChars=${raw.length} elapsedMs=${Date.now() - startedAt} done=${String(body.done_reason ?? "")} promptEval=${String(body.prompt_eval_count ?? "")} eval=${String(body.eval_count ?? "")} raw=${JSON.stringify(raw.slice(0, 1200))}`);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ollama decision failed (timeout after ${config.decisionTimeoutMs}ms)`);
    }
    throw new Error(`ollama decision failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildDecisionPrompt(objective: string, observation: unknown) {
  return [
    "You are controlling one mferland wallet character as a normal player agent.",
    "Return exactly one JSON object matching the supplied schema. Use null for fields that do not apply.",
    "Do not run commands, inspect files, browse, ask for hidden server state, use debug messages, teleport, boost, or request database access.",
    "Make your own gameplay decision from public in-game context: current room state, quest offers/status/turn-ins, NPC dialogue, visible players, public map landmarks, inventory, cooldowns, combat state, and recent chat.",
    "There is no quest script. Discover the game by exploring, interacting, accepting quests, reading objective text, completing objectives, looting, grouping, and turning in ready quests.",
    "Active and ready quests are choices, not a locked script. If a quest is marked group suggested or raid suggested and the observation says needsHelp, switch focus, level/gear/shop, chat for help, wait for allies, or cancel optional daily raid content instead of repeatedly soloing it.",
    "Work toward the objective, but preserve normal gameplay: stay alive, avoid overpulls, loot when safe, and coordinate with visible players.",
    "",
    JSON.stringify({ objective, observation }),
  ].join("\n");
}

function compactObservationForOllama(observation: unknown) {
  const record = asRecord(observation);
  const self = asRecord(record.self);
  const wallet = asRecord(record.wallet);
  const catalog = asRecord(record.catalog);
  const publicMap = asRecord(record.publicMap);
  const selfQuestRows = asArray(self.quests).map(asRecord);
  const activeOrReadyQuestRows = selfQuestRows.filter((quest) => getString(quest.status) !== "completed");
  const completedQuestIds = selfQuestRows
    .filter((quest) => getString(quest.status) === "completed")
    .map((quest) => getString(quest.id))
    .filter(Boolean)
    .slice(0, 20);
  const compactRecentMessages = asArray(record.recentMessages)
    .map((entry) => cleanText(entry, 160))
    .filter(Boolean)
    .filter((entry) => !completedQuestIds.some((questId) => entry.toLowerCase().includes(questId.toLowerCase())))
    .slice(-5);
  const questMemoryRows = asArray(record.questMemory).map(asRecord);
  const activeQuestMemoryRows = questMemoryRows.filter((quest) => getString(quest.kind) !== "completed");
  const completedQuestNextHints = questMemoryRows
    .filter((quest) => getString(quest.kind) === "completed")
    .map((quest) => ({
      nextQuestId: cleanText(quest.nextQuestId, 96),
      nextQuestTitle: cleanText(quest.nextQuestTitle, 120),
      nextGiverNpcId: cleanText(quest.nextGiverNpcId, 96),
      nextGiverNpcName: cleanText(quest.nextGiverNpcName, 96),
    }))
    .filter((quest) => quest.nextQuestId || quest.nextGiverNpcId)
    .slice(0, 4);
  const nearbyNpcRows = asArray(record.nearbyNpcs);
  const prioritizedNearbyNpcRows = prioritizeNpcRowsForOllama(nearbyNpcRows, completedQuestIds);
  const nearbyQuestNpcRows = nearbyNpcRows
    .map((entry) => asRecord(entry))
    .filter((entry) => isQuestContextNpcRow(entry, completedQuestIds))
    .sort((a, b) => getNumber(a.distance) - getNumber(b.distance));
  return {
    objective: cleanText(record.objective, 240),
    now: record.now,
    lastAction: cleanText(record.lastAction, 120),
    wallet: {
      address: cleanText(wallet.address, 64),
      maxMferGptSpendWei: cleanText(wallet.maxMferGptSpendWei, 80),
      maxSwapEthSpendWei: cleanText(wallet.maxSwapEthSpendWei, 80),
      mferGptBalance: cleanText(wallet.mferGptBalance, 80),
    },
    self: {
      name: cleanText(self.name, 80),
      level: getNumber(self.level),
      xp: getNumber(self.xp),
      levelProgress: self.levelProgress,
      health: cleanText(self.health, 40),
      mana: cleanText(self.mana, 40),
      position: self.position ?? null,
      animation: cleanText(self.animation, 60),
      castingAction: cleanText(self.castingAction, 60),
      talentPoints: getNumber(self.talentPoints),
      aggroCount: getNumber(self.aggroCount),
      nearbyHostileCount: getNumber(self.nearbyHostileCount),
      nearbyDangerousHostileCount: getNumber(self.nearbyDangerousHostileCount),
      combatMath: self.combatMath ?? null,
      activeOrReadyQuests: compactQuestRows(activeOrReadyQuestRows, 10),
      completedQuestCount: completedQuestIds.length,
      inventory: compactInventoryRows(self.inventory, 8),
      equipment: compactEquipmentRows(self.equipment, 6),
      talents: compactTalentRows(self.talents, 8),
      combatActions: compactCombatActions(self.combatActions),
    },
    publicMap: {
      landmarkNames: Object.keys(asRecord(publicMap.landmarks)).slice(0, 40),
      routes: asArray(publicMap.routes).slice(0, 18),
    },
    catalog: compactCatalog(catalog, completedQuestIds),
    nearbyNpcs: compactNpcRows(prioritizedNearbyNpcRows, 12, completedQuestIds),
    nearbyQuestNpcs: compactNpcRows(nearbyQuestNpcRows, 8, completedQuestIds),
    nearbyPlayers: compactPlayerRows(record.nearbyPlayers, 4),
    social: compactSocial(record.social),
    safeTrainingTargets: asArray(record.safeTrainingTargets).slice(0, 3),
    questMemory: compactQuestMemoryRows(activeQuestMemoryRows, 8),
    completedQuestNextHints,
    combatTrouble: asArray(record.combatTrouble).slice(0, 3),
    movementTrouble: record.movementTrouble ?? null,
    lootableCorpses: compactNpcRows(record.lootableCorpses, 4, completedQuestIds),
    recentMessages: compactRecentMessages,
    availableActions: asArray(record.availableActions),
  };
}

function compactCatalog(catalog: AnyRecord, completedQuestIds: string[] = []) {
  const trashVendor = asRecord(catalog.trashVendor);
  const completedQuestIdSet = new Set(completedQuestIds.map((questId) => questId.toLowerCase()));
  const questCatalog = asArray(catalog.questCatalog)
    .filter((quest) => {
      const questId = getString(asRecord(quest).id).toLowerCase();
      return questId && !completedQuestIdSet.has(questId);
    });
  return {
    source: cleanText(catalog.source, 80),
    talentChoices: asArray(catalog.talentChoices).slice(0, 6),
    questCatalog: compactQuestRows(questCatalog, 10),
    trashVendor: Object.keys(trashVendor).length ? {
      itemIds: asArray(trashVendor.itemIds).slice(0, 20),
      agentItemsPerPoint: trashVendor.agentItemsPerPoint,
    } : null,
  };
}

function prioritizeNpcRowsForOllama(value: unknown, completedQuestIds: string[] = []) {
  const completedQuestIdSet = new Set(completedQuestIds.map((questId) => questId.toLowerCase()));
  return asArray(value)
    .map((entry) => asRecord(entry))
    .sort((a, b) => npcOllamaPriority(a, completedQuestIdSet) - npcOllamaPriority(b, completedQuestIdSet));
}

function npcOllamaPriority(row: AnyRecord, completedQuestIdSet: Set<string>) {
  const distance = getNumber(row.distance);
  const alive = Boolean(row.alive);
  const friendly = alive && !Boolean(row.attackable);
  const questIdHint = cleanText(row.questIdHint, 96).toLowerCase();
  const hasActiveQuestHint = Boolean(questIdHint && !completedQuestIdSet.has(questIdHint));
  const hasDialogue = Boolean(cleanText(row.dialogue, 90));
  const hasShop = Boolean(cleanText(row.shopId, 96));
  const hasLoot = Boolean(row.hasLoot);
  return distance
    - (friendly && hasActiveQuestHint ? 28 : 0)
    - (friendly && hasDialogue ? 12 : 0)
    - (friendly && hasShop ? 3 : 0)
    - (hasLoot ? 8 : 0);
}

function isQuestContextNpcRow(row: AnyRecord, completedQuestIds: string[] = []) {
  const completedQuestIdSet = new Set(completedQuestIds.map((questId) => questId.toLowerCase()));
  const alive = Boolean(row.alive);
  const friendly = alive && !Boolean(row.attackable);
  const questIdHint = cleanText(row.questIdHint, 96).toLowerCase();
  const hasActiveQuestHint = Boolean(questIdHint && !completedQuestIdSet.has(questIdHint));
  return friendly && (hasActiveQuestHint || Boolean(cleanText(row.dialogue, 90)));
}

function compactQuestRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const row = asRecord(entry);
    return {
      id: cleanText(row.id, 96),
      status: cleanText(row.status, 32),
      progress: cleanText(row.progress, 48),
      flags: cleanText(row.flags, 80),
      title: cleanText(row.title, 120),
      objective: cleanText(row.objective, 120),
      encounterType: cleanText(row.encounterType, 60),
      groupSuggestion: cleanText(row.groupSuggestion, 120),
      needsHelp: Boolean(row.needsHelp),
      lastKnownNpcId: cleanText(row.lastKnownNpcId, 96),
      lastKnownNpcName: cleanText(row.lastKnownNpcName, 96),
      lastKnownTurnInNpcId: cleanText(row.lastKnownTurnInNpcId, 96),
      lastKnownTurnInNpcName: cleanText(row.lastKnownTurnInNpcName, 96),
      lastKnownText: cleanText(row.lastKnownText, 120),
    };
  });
}

function compactQuestMemoryRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const row = asRecord(entry);
    return {
      kind: cleanText(row.kind, 32),
      questId: cleanText(row.questId, 96),
      npcId: cleanText(row.npcId, 96),
      npcName: cleanText(row.npcName, 96),
      turnInNpcId: cleanText(row.turnInNpcId, 96),
      turnInNpcName: cleanText(row.turnInNpcName, 96),
      title: cleanText(row.title, 120),
      objectiveLabel: cleanText(row.objectiveLabel, 180),
      text: cleanText(row.text, 140),
      progress: getNumber(row.progress),
      required: getNumber(row.required),
      nextQuestId: cleanText(row.nextQuestId, 96),
      nextQuestTitle: cleanText(row.nextQuestTitle, 120),
      nextGiverNpcId: cleanText(row.nextGiverNpcId, 96),
    };
  });
}

function compactNpcRows(value: unknown, limit: number, completedQuestIds: string[] = []) {
  const completedQuestIdSet = new Set(completedQuestIds.map((questId) => questId.toLowerCase()));
  return asArray(value).slice(0, limit).map((entry) => {
    const npc = asRecord(entry);
    const questIdHint = cleanText(npc.questIdHint, 96);
    return {
      ref: cleanText(npc.ref, 24),
      id: cleanText(npc.id, 96),
      name: cleanText(npc.name, 96),
      role: cleanText(npc.role, 48),
      model: cleanText(npc.model, 48),
      alive: Boolean(npc.alive),
      attackable: Boolean(npc.attackable),
      hostile: Boolean(npc.hostile),
      health: cleanText(npc.health, 40),
      distance: getNumber(npc.distance),
      position: npc.position ?? null,
      dialogue: cleanText(npc.dialogue, 90),
      questIdHint: completedQuestIdSet.has(questIdHint.toLowerCase()) ? "" : questIdHint,
      shopId: cleanText(npc.shopId, 96),
      hasLoot: Boolean(npc.hasLoot),
      aggroTarget: cleanText(npc.aggroTarget, 40),
      pullRisk: cleanText(npc.pullRisk, 80),
      approachRisk: cleanText(npc.approachRisk, 80),
    };
  });
}

function compactPlayerRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const player = asRecord(entry);
    return {
      ref: cleanText(player.ref, 24),
      name: cleanText(player.name, 96),
      identityType: cleanText(player.identityType, 48),
      isAgent: Boolean(player.isAgent),
      health: cleanText(player.health, 40),
      mana: cleanText(player.mana, 40),
      distance: getNumber(player.distance),
      position: player.position ?? null,
      animation: cleanText(player.animation, 60),
      agentStatus: player.agentStatus ?? null,
    };
  });
}

function compactInventoryRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const item = asRecord(entry);
    return {
      id: cleanText(item.id, 96),
      name: cleanText(item.name, 120),
      count: getNumber(item.count),
      quality: cleanText(item.quality, 40),
      slot: cleanText(item.slot, 40),
      canEquip: Boolean(item.canEquip),
      canUse: Boolean(item.canUse),
      sellableTrash: Boolean(item.sellableTrash),
    };
  });
}

function compactEquipmentRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const item = asRecord(entry);
    return {
      slot: cleanText(item.slot, 40),
      id: cleanText(item.id, 96),
      name: cleanText(item.name, 120),
      quality: cleanText(item.quality, 40),
    };
  });
}

function compactTalentRows(value: unknown, limit: number) {
  return asArray(value).slice(0, limit).map((entry) => {
    const talent = asRecord(entry);
    return {
      id: cleanText(talent.id, 96),
      name: cleanText(talent.name, 120),
      rank: getNumber(talent.rank),
    };
  });
}

function compactCombatActions(value: unknown) {
  return asArray(value).map((entry) => {
    const action = asRecord(entry);
    return {
      actionId: cleanText(action.actionId, 48),
      unlocked: Boolean(action.unlocked),
      ready: Boolean(action.ready),
      manaCost: getNumber(action.manaCost),
      maxRange: getNumber(action.maxRange),
      castTimeMs: getNumber(action.castTimeMs),
      requiresStationary: Boolean(action.requiresStationary),
    };
  });
}

function compactSocial(value: unknown) {
  const social = asRecord(value);
  return {
    canChatNow: Boolean(social.canChatNow),
    canEmoteNow: Boolean(social.canEmoteNow),
    pendingMessages: asArray(social.pendingMessages).slice(0, 5).map((entry) => {
      const message = asRecord(entry);
      return {
        name: cleanText(message.name, 96),
        identityType: cleanText(message.identityType, 48),
        text: cleanText(message.text, 180),
        kind: cleanText(message.kind, 40),
      };
    }),
  };
}

function parseDecisionJson(raw: string) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue into recovery parsing below.
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue into object extraction below.
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // Fall through to the explicit error.
    }
  }

  throw new Error(`model returned invalid JSON: ${trimmed.slice(0, 1000)}`);
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

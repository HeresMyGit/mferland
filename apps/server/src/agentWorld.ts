import { sql } from "drizzle-orm";
import {
  EQUIPMENT_SLOTS,
  ITEMS,
  MAX_PLAYERS,
  PLAZA_BOUNDS,
  QUESTS,
  QUEST_IDS,
  WORLD_HUBS,
  normalizeWalletAddress,
  type EquipmentSlotId,
  type ItemId,
  type QuestId,
} from "@mferland/shared";
import { getDatabase } from "./db/client.js";
import {
  getTownAdminSnapshots,
  type AdminNpcSnapshot,
  type AdminPlayerSnapshot,
  type AdminQuestSnapshot,
} from "./rooms/TownRoom.js";
import { buildAgentProfile } from "./agentProfile.js";

type QueryRow = Record<string, unknown>;

type LivePlayer = AdminPlayerSnapshot & {
  roomId: string;
  roomName: string;
};

type LiveNpc = AdminNpcSnapshot & {
  roomId: string;
  roomName: string;
};

type AgentWorldQuery = {
  searchParams: URLSearchParams;
};

const PUBLIC_AREAS = [
  ...WORLD_HUBS.map((hub) => ({
    id: hub.id,
    name: hub.name,
    x: hub.x,
    z: hub.z,
    radius: Math.max(36, hub.diameter * 1.55),
  })),
  {
    id: "roads-wilds",
    name: "Roads & Wilds",
    x: 0,
    z: 0,
    radius: Math.max(PLAZA_BOUNDS.maxX - PLAZA_BOUNDS.minX, PLAZA_BOUNDS.maxZ - PLAZA_BOUNDS.minZ),
  },
];

const MILESTONE_QUEST_ALIASES: Record<string, QuestId> = {
  centralizer: "baron-of-static",
  "the-centralizer": "baron-of-static",
  "static-baron": "baron-of-static",
  "baron-of-static": "baron-of-static",
  nox: "baron-of-static",
  "static-baron-nox": "baron-of-static",
};

export async function buildAgentWorld({ searchParams }: AgentWorldQuery) {
  const now = Date.now();
  const live = getPublicLiveState(now);
  const includeNpcs = searchParams.get("npcs") === "1" || searchParams.get("includeNpcs") === "true";
  const playerLimit = normalizeLimit(searchParams.get("playerLimit"), 80, 200);
  const npcLimit = normalizeLimit(searchParams.get("npcLimit"), 40, 160);

  return {
    status: 200,
    body: {
      ok: true,
      generatedAt: new Date(now).toISOString(),
      source: "live_room_public_snapshot",
      note: "Read-only public town state. Use /agent-player for one character and /agent-milestones for quest/boss completion history.",
      endpoints: {
        selfProfile: "/agent-profile?wallet=0x...",
        world: "/agent-world",
        player: "/agent-player?wallet=0x... or /agent-player?name=...",
        milestones: "/agent-milestones?type=centralizer or /agent-milestones?questId=baron-of-static",
      },
      totals: live.totals,
      areas: live.areas,
      onlinePlayers: live.players.slice(0, playerLimit),
      notableNpcs: live.npcs
        .filter((npc) => npc.alive && (isBossNpc(npc) || npc.aggroTargetId || npc.hasLoot))
        .slice(0, npcLimit),
      npcs: includeNpcs ? live.npcs.slice(0, npcLimit) : undefined,
    },
  };
}

export async function buildAgentPlayer({ searchParams }: AgentWorldQuery) {
  const now = Date.now();
  const live = getPublicLiveState(now);
  const requestedWallet = normalizeWalletAddress(searchParams.get("wallet") ?? searchParams.get("walletAddress") ?? "");
  const requestedName = cleanText(searchParams.get("name") ?? searchParams.get("q") ?? searchParams.get("handle") ?? "", 120);
  const requestedCharacterId = cleanText(searchParams.get("characterId") ?? "", 120);

  if (!requestedWallet && !requestedName && !requestedCharacterId) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "wallet, name, handle, q, or characterId required",
      },
    };
  }

  const dbMatch = requestedWallet
    ? { walletAddress: requestedWallet, characterId: "", name: "" }
    : await findPersistedCharacterRef({ name: requestedName, characterId: requestedCharacterId });
  const walletAddress = normalizeWalletAddress(dbMatch?.walletAddress ?? "") || requestedWallet;
  const liveMatches = live.players.filter((player) => (
    (walletAddress && normalizeWalletAddress(player.walletAddress) === walletAddress)
    || (requestedCharacterId && player.characterId === requestedCharacterId)
    || (requestedName && namesMatch(player.name, requestedName))
  ));

  const profile = walletAddress ? await buildAgentProfile(walletAddress) : null;
  const profileBody = profile?.body && isRecord(profile.body) ? profile.body : null;
  const savedExists = Boolean(profileBody?.exists);
  const primaryLive = liveMatches[0] ?? null;
  const profileCurrentQuest = getProfileCurrentQuest(profileBody);
  const currentQuest = primaryLive?.currentQuest ?? (profileCurrentQuest ? describeQuestShort(profileCurrentQuest) : null);

  return {
    status: 200,
    body: {
      ok: true,
      exists: savedExists || liveMatches.length > 0,
      generatedAt: new Date(now).toISOString(),
      query: {
        walletAddress: requestedWallet || walletAddress || "",
        name: requestedName,
        characterId: requestedCharacterId || dbMatch?.characterId || "",
      },
      answerHints: {
        online: liveMatches.length > 0,
        level: primaryLive?.level ?? getNestedNumber(profileBody, ["quickFacts", "level"]),
        currentQuest,
        chest: getNestedString(profileBody, ["quickFacts", "chest"]),
      },
      live: {
        online: liveMatches.length > 0,
        players: liveMatches,
      },
      profile: profileBody,
    },
  };
}

export async function buildAgentMilestones({ searchParams }: AgentWorldQuery) {
  const questId = normalizeMilestoneQuestId(searchParams.get("questId") ?? searchParams.get("type") ?? searchParams.get("milestone") ?? "");
  if (!questId) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "valid questId or milestone type required",
        examples: ["type=centralizer", "questId=baron-of-static"],
      },
    };
  }

  const limit = normalizeLimit(searchParams.get("limit"), 50, 250);
  const db = getDatabase();
  const live = getPublicLiveState(Date.now());
  const quest = QUESTS[questId];

  if (!db) {
    return {
      status: 200,
      body: {
        ok: true,
        databaseConfigured: false,
        generatedAt: new Date().toISOString(),
        questId,
        title: quest.title,
        milestone: getMilestoneLabel(questId),
        completions: [],
        totalCompletions: 0,
        note: "DATABASE_URL is not set, so persisted milestone history is unavailable.",
      },
    };
  }

  const rows = Array.from(await db.execute<QueryRow>(sql`
    SELECT
      c.id AS character_id,
      c.name AS character_name,
      c.level,
      c.xp,
      c.updated_at AS character_updated_at,
      cq.quest_id,
      cq.completed_at,
      cq.updated_at AS quest_updated_at,
      coalesce((
        SELECT jsonb_agg(aw.wallet_address ORDER BY aw.primary_wallet DESC, aw.created_at ASC)
        FROM account_wallets aw
        WHERE aw.account_id = c.account_id
      ), '[]'::jsonb) AS wallets
    FROM character_quests cq
    JOIN characters c ON c.id = cq.character_id
    WHERE cq.quest_id = ${questId}
      AND cq.status = 'completed'
    ORDER BY cq.completed_at ASC NULLS LAST, cq.updated_at ASC, c.name ASC
    LIMIT ${limit}
  `));

  const completions = rows.map((row) => {
    const wallets = toArray(row.wallets).map(toStringValue).filter(Boolean);
    const walletAddress = wallets[0] ?? "";
    const livePlayer = live.players.find((player) => (
      player.characterId === toStringValue(row.character_id)
      || (walletAddress && normalizeWalletAddress(player.walletAddress) === normalizeWalletAddress(walletAddress))
    ));
    const completedAtMs = toNumber(row.completed_at);
    return {
      characterId: toStringValue(row.character_id),
      name: toStringValue(row.character_name),
      walletAddress,
      walletShort: shortWallet(walletAddress),
      level: toNumber(row.level),
      xp: toNumber(row.xp),
      completedAtMs,
      completedAt: completedAtMs > 0 ? new Date(completedAtMs).toISOString() : "",
      updatedAt: toIsoString(row.quest_updated_at),
      online: Boolean(livePlayer),
      isAgent: Boolean(livePlayer?.isAgent),
    };
  });

  return {
    status: 200,
    body: {
      ok: true,
      databaseConfigured: true,
      generatedAt: new Date().toISOString(),
      questId,
      title: quest.title,
      milestone: getMilestoneLabel(questId),
      totalCompletions: completions.length,
      completions,
    },
  };
}

function getPublicLiveState(now: number) {
  const rooms = getTownAdminSnapshots(now);
  const players: LivePlayer[] = rooms.flatMap((room) => room.players.map((player) => ({
    ...player,
    roomId: room.roomId,
    roomName: room.roomName,
  })));
  const npcs: LiveNpc[] = rooms.flatMap((room) => room.npcs.map((npc) => ({
    ...npc,
    roomId: room.roomId,
    roomName: room.roomName,
  })));
  const publicPlayers = players.map(describeLivePlayer).sort((left, right) => left.name.localeCompare(right.name));
  const publicNpcs = npcs.map(describeLiveNpc).sort((left, right) => Number(right.alive) - Number(left.alive) || left.name.localeCompare(right.name));

  return {
    rooms,
    players: publicPlayers,
    npcs: publicNpcs,
    areas: buildAreaStats(publicPlayers, publicNpcs),
    totals: {
      rooms: rooms.length,
      maxPlayers: MAX_PLAYERS,
      playersOnline: publicPlayers.length,
      agentsOnline: publicPlayers.filter((player) => player.isAgent).length,
      humansOnline: publicPlayers.filter((player) => !player.isAgent).length,
      walletPlayersOnline: publicPlayers.filter((player) => player.identityType === "wallet").length,
      deadPlayers: publicPlayers.filter((player) => player.status === "dead").length,
      npcs: publicNpcs.length,
      aliveNpcs: publicNpcs.filter((npc) => npc.alive).length,
      hostileNpcs: publicNpcs.filter((npc) => npc.disposition === "hostile" && npc.alive).length,
      aggroNpcs: publicNpcs.filter((npc) => npc.aggroTargetId).length,
      lootNpcs: publicNpcs.filter((npc) => npc.hasLoot).length,
    },
  };
}

function describeLivePlayer(player: LivePlayer) {
  const currentQuest = player.quests.find((quest) => quest.status === "ready")
    ?? player.quests.find((quest) => quest.status === "active")
    ?? null;
  return {
    sessionId: player.sessionId,
    characterId: player.characterId,
    name: player.name,
    identityType: player.identityType,
    isAgent: player.isAgent,
    walletAddress: player.walletAddress,
    walletShort: shortWallet(player.walletAddress),
    status: player.status,
    roomId: player.roomId,
    roomName: player.roomName,
    onlineForMs: player.onlineForMs,
    lastInputAgoMs: player.lastInputAt > 0 ? Math.max(0, Date.now() - player.lastInputAt) : null,
    zone: getAreaName(player.position.x, player.position.z),
    position: {
      x: player.position.x,
      z: player.position.z,
    },
    level: player.level,
    xp: player.xp,
    talentPoints: player.talentPoints,
    season0Points: player.season0Points,
    season0DailyPoints: player.season0DailyPoints,
    health: player.health,
    maxHealth: player.maxHealth,
    mana: player.mana,
    maxMana: player.maxMana,
    currentQuest: currentQuest ? describeQuestShort(currentQuest) : null,
    questCounts: player.questCounts,
    quests: player.quests.map(describeQuestShort),
    equipment: player.equipment.map(describeEquipmentShort),
    activeCast: player.castingAction ? {
      actionId: player.castingAction,
      targetKind: player.castTargetKind,
      targetId: player.castTargetId,
    } : null,
  };
}

function describeLiveNpc(npc: LiveNpc) {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    model: npc.model,
    disposition: getNpcDisposition(npc),
    roomId: npc.roomId,
    roomName: npc.roomName,
    alive: npc.alive,
    health: npc.health,
    maxHealth: npc.maxHealth,
    zone: getAreaName(npc.position.x, npc.position.z),
    position: {
      x: npc.position.x,
      z: npc.position.z,
    },
    questId: npc.questId,
    aggroTargetId: npc.aggroTargetId,
    combatStyle: npc.combatStyle,
    hasLoot: npc.hasLoot,
    loot: npc.loot.map((item) => ({
      itemId: item.id,
      name: ITEMS[item.id]?.name ?? item.id,
      count: item.count,
    })),
    defeatedAt: npc.defeatedAt,
    respawnAt: npc.respawnAt,
    isBoss: isBossNpc(npc),
  };
}

function describeQuestShort(quest: AdminQuestSnapshot) {
  const definition = QUESTS[quest.id];
  return {
    id: quest.id,
    title: definition?.title ?? quest.id,
    status: quest.status,
    progress: quest.progress,
    required: quest.required,
    progressLabel: quest.status === "completed" ? "completed" : `${Math.min(quest.progress, quest.required)}/${quest.required}`,
    ready: quest.status === "ready" || quest.progress >= quest.required,
    objectiveLabel: definition?.objectiveLabel ?? "",
    turnInLabel: definition?.turnInLabel ?? "",
  };
}

function describeEquipmentShort(slot: { slot: string; itemId: ItemId | ""; chainTokenId: string; chainTier: number }) {
  const item = slot.itemId ? ITEMS[slot.itemId] : null;
  return {
    slot: slot.slot,
    slotLabel: EQUIPMENT_SLOTS[slot.slot as EquipmentSlotId] ?? slot.slot,
    itemId: slot.itemId,
    name: item?.name ?? (slot.itemId || "empty"),
    quality: item?.quality ?? "",
    chainTokenId: slot.chainTokenId,
    chainTier: slot.chainTier,
  };
}

function buildAreaStats(players: ReturnType<typeof describeLivePlayer>[], npcs: ReturnType<typeof describeLiveNpc>[]) {
  return PUBLIC_AREAS.map((area) => {
    const playerCount = players.filter((player) => distance2d(player.position, area) <= area.radius).length;
    const npcCount = npcs.filter((npc) => distance2d(npc.position, area) <= area.radius).length;
    const aliveNpcCount = npcs.filter((npc) => npc.alive && distance2d(npc.position, area) <= area.radius).length;
    return {
      id: area.id,
      name: area.name,
      players: playerCount,
      npcs: npcCount,
      aliveNpcs: aliveNpcCount,
    };
  }).sort((left, right) => right.players - left.players || right.aliveNpcs - left.aliveNpcs || left.name.localeCompare(right.name));
}

async function findPersistedCharacterRef({ name, characterId }: { name: string; characterId: string }) {
  const db = getDatabase();
  if (!db) return null;
  const normalizedName = name.trim().toLowerCase();
  const normalizedCharacterId = characterId.trim();
  if (!normalizedName && !normalizedCharacterId) return null;

  const rows = Array.from(await db.execute<QueryRow>(sql`
    SELECT
      c.id AS character_id,
      c.name AS character_name,
      coalesce((
        SELECT aw.wallet_address
        FROM account_wallets aw
        WHERE aw.account_id = c.account_id
        ORDER BY aw.primary_wallet DESC, aw.created_at ASC
        LIMIT 1
      ), '') AS wallet_address
    FROM characters c
    JOIN accounts a ON a.id = c.account_id
    LEFT JOIN account_wallets aw_match ON aw_match.account_id = c.account_id
    WHERE (
      ${normalizedCharacterId} <> '' AND c.id = ${normalizedCharacterId}
    ) OR (
      ${normalizedName} <> '' AND (
        lower(c.name) = ${normalizedName}
        OR lower(a.display_name) = ${normalizedName}
        OR lower(aw_match.wallet_address) = ${normalizedName}
      )
    )
    ORDER BY c.updated_at DESC
    LIMIT 1
  `));
  const row = rows[0];
  if (!row) return null;
  return {
    characterId: toStringValue(row.character_id),
    name: toStringValue(row.character_name),
    walletAddress: toStringValue(row.wallet_address),
  };
}

function normalizeMilestoneQuestId(value: string): QuestId | null {
  const key = cleanText(value, 80).toLowerCase();
  const alias = MILESTONE_QUEST_ALIASES[key];
  if (alias) return alias;
  return (QUEST_IDS as string[]).includes(key) ? key as QuestId : null;
}

function getMilestoneLabel(questId: QuestId) {
  if (questId === "baron-of-static") return "The Centralizer defeated";
  return `${QUESTS[questId].title} completed`;
}

function getProfileCurrentQuest(profileBody: Record<string, unknown> | null): AdminQuestSnapshot | null {
  const quests = profileBody?.quests;
  if (!isRecord(quests)) return null;
  const ready = Array.isArray(quests.ready) ? quests.ready : [];
  const active = Array.isArray(quests.active) ? quests.active : [];
  const raw = ready[0] ?? active[0];
  if (!isRecord(raw)) return null;
  const id = cleanText(raw.id, 80) as QuestId;
  if (!(QUEST_IDS as string[]).includes(id)) return null;
  const status = raw.status === "ready" || raw.status === "completed" ? raw.status : "active";
  return {
    id,
    status,
    progress: toNumber(raw.progress),
    required: toNumber(raw.required) || 1,
    flags: "",
    completedAt: toNumber(raw.completedAt),
  };
}

function getNpcDisposition(npc: Pick<AdminNpcSnapshot, "role" | "isImmortal">) {
  if (npc.isImmortal || npc.role === "quest_giver" || npc.role === "merchant" || npc.role === "guard" || npc.role === "wanderer") return "friendly";
  if (npc.role === "enemy" || npc.role === "farmer" || npc.role === "beast") return "hostile";
  return "neutral";
}

function isBossNpc(npc: Pick<AdminNpcSnapshot, "id" | "combatStyle" | "maxHealth">) {
  return npc.id === "static-baron-nox"
    || npc.id === "mfergpt-daily-boss"
    || npc.combatStyle === "boss"
    || npc.maxHealth >= 450;
}

function getAreaName(x: number, z: number) {
  let best = PUBLIC_AREAS[PUBLIC_AREAS.length - 1];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const area of PUBLIC_AREAS) {
    const distance = distance2d({ x, z }, area);
    if (distance > area.radius || distance >= bestDistance) continue;
    best = area;
    bestDistance = distance;
  }
  return best?.name ?? "Roads & Wilds";
}

function distance2d(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizeLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function shortWallet(walletAddress: string) {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return "";
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = toStringValue(value);
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function getNestedNumber(root: Record<string, unknown> | null, path: string[]) {
  const value = getNested(root, path);
  return typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : null;
}

function getNestedString(root: Record<string, unknown> | null, path: string[]) {
  const value = getNested(root, path);
  return typeof value === "string" ? value : "";
}

function getNested(root: Record<string, unknown> | null, path: string[]) {
  let current: unknown = root;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

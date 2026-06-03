import { type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { sql, type SQL } from "drizzle-orm";
import {
  EQUIPMENT_SLOTS,
  ITEMS,
  MAX_PLAYERS,
  PLAZA_BOUNDS,
  PROGRESSION,
  QUESTS,
  SEASON_0_DAILY_POINT_CAP,
  SEASON_0_ID,
  SEASON_0_TOTAL_POINT_CAP,
  TALENTS,
  WORLD_HUBS,
  WORLD_LANDMARKS,
  WORLD_ROADS,
  type ItemId,
} from "@mferland/shared";
import { getCryptoMarketQuoteSnapshot } from "./crypto/marketQuotes.js";
import { getDatabase } from "./db/client.js";
import { getTownAdminSnapshots, type AdminNpcSnapshot, type AdminPlayerSnapshot } from "./rooms/TownRoom.js";

const ADMIN_REFRESH_MS = 5000;
const ADMIN_CHARACTER_LIMIT = 250;
const ADMIN_RECENT_LIMIT = 80;
const ADMIN_LEADERBOARD_LIMIT = 100;
const ADMIN_INVITE_LIMIT = 120;
const DEFAULT_INVITE_PUBLIC_ORIGIN = "https://game.mfergpt.lol";

type QueryRow = Record<string, unknown>;

type AdminArea = {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
};

const ADMIN_AREAS: AdminArea[] = [
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

export function serveAdminDashboard(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  if (urlPath !== "/admin" && urlPath !== "/admin/" && urlPath !== "/admin/data") return false;

  if (process.env.MFERLAND_ADMIN_DASHBOARD === "0") {
    writeText(res, 404, "admin dashboard disabled\n");
    return true;
  }

  if (!isAdminRequestAllowed(req)) {
    writeText(res, 403, "admin dashboard is only available from loopback or private LAN addresses and hostnames\n");
    return true;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "allow": "GET, HEAD",
      "content-type": "text/plain; charset=utf-8",
    });
    res.end("method not allowed\n");
    return true;
  }

  if (urlPath === "/admin/data") {
    void writeAdminData(req, res);
    return true;
  }

  const html = getAdminHtml();
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(html);
  return true;
}

export function getAdminDashboardLanUrls(port: number) {
  return getLanAddresses()
    .filter(isLocalNetworkAddress)
    .map((address) => `http://${address}:${port}/admin`);
}

async function writeAdminData(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = await buildAdminPayload();
    const body = JSON.stringify(payload);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch (error) {
    const body = JSON.stringify({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unable to build admin payload.",
    });
    res.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  }
}

async function buildAdminPayload() {
  const now = Date.now();
  const rooms = getTownAdminSnapshots(now);
  const livePlayers = rooms.flatMap((room) => room.players.map((player) => ({
    ...player,
    roomId: room.roomId,
    roomName: room.roomName,
  })));
  const liveNpcs = rooms.flatMap((room) => room.npcs.map((npc) => ({
    ...npc,
    roomId: room.roomId,
    roomName: room.roomName,
  })));
  const [database, marketQuotes] = await Promise.all([
    loadDatabaseSnapshot(),
    loadMarketQuotes(),
  ]);

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    refreshMs: ADMIN_REFRESH_MS,
    server: {
      nodeEnv: process.env.NODE_ENV ?? "",
      pid: process.pid,
      uptimeMs: Math.round(process.uptime() * 1000),
      memory: process.memoryUsage(),
      maxPlayers: MAX_PLAYERS,
      lanUrls: getAdminDashboardLanUrls(Number(process.env.PORT ?? 2567)),
      invitePublicOrigin: getInvitePublicOrigin(),
      adminLanOnly: true,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
    },
    catalog: buildCatalog(),
    live: {
      rooms,
      players: livePlayers,
      npcs: liveNpcs,
      areas: buildAreaStats(livePlayers, liveNpcs),
      totals: {
        rooms: rooms.length,
        playersOnline: livePlayers.length,
        walletPlayersOnline: livePlayers.filter((player) => player.identityType === "wallet").length,
        guestPlayersOnline: livePlayers.filter((player) => player.identityType === "guest").length,
        deadPlayers: livePlayers.filter((player) => player.status === "dead").length,
        npcs: liveNpcs.length,
        aliveNpcs: liveNpcs.filter((npc) => npc.alive).length,
        defeatedNpcs: liveNpcs.filter((npc) => !npc.alive).length,
        aggroNpcs: liveNpcs.filter((npc) => npc.aggroTargetId).length,
        lootNpcs: liveNpcs.filter((npc) => npc.hasLoot).length,
      },
    },
    database,
    marketQuotes,
  };
}

function buildCatalog() {
  return {
    equipmentSlots: EQUIPMENT_SLOTS,
    items: Object.fromEntries(Object.entries(ITEMS).map(([id, item]) => {
      const optional = item as {
        value?: number;
        equipment?: unknown;
        consumable?: unknown;
        revealsAllNpcsOnMinimap?: boolean;
      };
      return [id, {
        id,
        name: item.name,
        description: item.description,
        quality: item.quality,
        iconColor: item.iconColor,
        stackable: item.stackable,
        value: optional.value ?? 0,
        equipment: optional.equipment ?? null,
        consumable: optional.consumable ?? null,
        revealsAllNpcsOnMinimap: Boolean(optional.revealsAllNpcsOnMinimap),
      }];
    })),
    quests: Object.fromEntries(Object.entries(QUESTS).map(([id, quest]) => {
      const optional = quest as {
        turnInNpcId?: string;
        requiredQuestId?: string;
        requiredItemId?: string;
        repeatLabel?: string;
      };
      return [id, {
        id,
        title: quest.title,
        giverNpcId: quest.giverNpcId,
        turnInNpcId: optional.turnInNpcId ?? quest.giverNpcId,
        objectiveLabel: quest.objectiveLabel,
        required: quest.required,
        requiredQuestId: optional.requiredQuestId ?? "",
        requiredItemId: optional.requiredItemId ?? "",
        xpReward: quest.xpReward,
        repeatLabel: optional.repeatLabel ?? "",
      }];
    })),
    talents: Object.fromEntries(Object.entries(TALENTS).map(([id, talent]) => [id, {
      id,
      name: talent.name,
      tree: talent.tree,
      nodeId: talent.nodeId,
      maxRank: talent.maxRank,
      description: talent.description,
    }])),
    world: {
      bounds: PLAZA_BOUNDS,
      hubs: WORLD_HUBS,
      roads: WORLD_ROADS,
      landmarks: WORLD_LANDMARKS,
      adminAreas: ADMIN_AREAS,
    },
    progression: PROGRESSION,
    season: {
      id: SEASON_0_ID,
      dailyPointCap: SEASON_0_DAILY_POINT_CAP,
      totalPointCap: SEASON_0_TOTAL_POINT_CAP,
    },
  };
}

function buildAreaStats(players: AdminPlayerSnapshot[], npcs: AdminNpcSnapshot[]) {
  const stats = ADMIN_AREAS.map((area) => ({
    id: area.id,
    name: area.name,
    x: area.x,
    z: area.z,
    radius: area.radius,
    players: 0,
    deadPlayers: 0,
    npcs: 0,
    aliveNpcs: 0,
    defeatedNpcs: 0,
    aggroNpcs: 0,
    lootNpcs: 0,
  }));
  const byId = new Map(stats.map((area) => [area.id, area]));

  for (const player of players) {
    const stat = byId.get(getAreaForPosition(player.position.x, player.position.z).id);
    if (!stat) continue;
    stat.players += 1;
    if (player.status === "dead") stat.deadPlayers += 1;
  }

  for (const npc of npcs) {
    const stat = byId.get(getAreaForPosition(npc.position.x, npc.position.z).id);
    if (!stat) continue;
    stat.npcs += 1;
    if (npc.alive) stat.aliveNpcs += 1;
    else stat.defeatedNpcs += 1;
    if (npc.aggroTargetId) stat.aggroNpcs += 1;
    if (npc.hasLoot) stat.lootNpcs += 1;
  }

  return stats;
}

function getAreaForPosition(x: number, z: number) {
  let nearest = ADMIN_AREAS[ADMIN_AREAS.length - 1];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const area of ADMIN_AREAS.slice(0, -1)) {
    const distance = Math.hypot(x - area.x, z - area.z);
    if (distance < nearestDistance) {
      nearest = area;
      nearestDistance = distance;
    }
  }
  if (nearest && nearestDistance <= nearest.radius) return nearest;
  return ADMIN_AREAS[ADMIN_AREAS.length - 1];
}

async function loadDatabaseSnapshot() {
  const db = getDatabase();
  if (!db) {
    return {
      configured: false,
      ok: false,
      partial: false,
      error: "DATABASE_URL is not set. Live room data is still available.",
      overview: {},
      characters: [],
      itemEconomy: [],
      questProgress: [],
      seasonLeaderboard: [],
      purchaseSummary: [],
      analytics: emptyAnalytics(),
      invites: emptyInvites(),
    };
  }

  try {
    const errors: string[] = [];
    const safeExecute = async <T extends QueryRow>(label: string, query: SQL) => {
      try {
        return Array.from(await db.execute<T>(query));
      } catch (error) {
        errors.push(`${label}: ${formatAdminError(error)}`);
        return [];
      }
    };
    const [
      overviewRows,
      characterRows,
      itemRows,
      questRows,
      leaderboardRows,
      purchaseRows,
      analyticsTotalRows,
      analyticsByTypeRows,
      analyticsBucketRows,
      recentAnalyticsRows,
      inviteSummaryRows,
      inviteRows,
    ] = await Promise.all([
      safeExecute<OverviewRow>("overview", sql`
        SELECT
          (SELECT count(*) FROM accounts)::int AS accounts,
          (SELECT count(*) FROM account_wallets)::int AS wallets,
          (SELECT count(*) FROM characters)::int AS characters,
          (SELECT coalesce(round(avg(level), 2), 0) FROM characters)::float AS avg_level,
          (SELECT coalesce(round(avg(xp), 2), 0) FROM characters)::float AS avg_xp,
          (SELECT count(*) FROM character_inventory WHERE count > 0)::int AS inventory_rows,
          (SELECT coalesce(sum(count), 0) FROM character_inventory WHERE count > 0)::int AS inventory_items,
          (SELECT count(*) FROM character_equipment)::int AS equipment_rows,
          (SELECT count(*) FROM character_quests WHERE status = 'active')::int AS active_quests,
          (SELECT count(*) FROM character_quests WHERE status = 'ready')::int AS ready_quests,
          (SELECT count(*) FROM character_quests WHERE status = 'completed')::int AS completed_quests,
          pg_database_size(current_database())::bigint AS database_size_bytes
      `),
      safeExecute<CharacterRow>("characters", sql`
        SELECT
          c.id,
          c.account_id,
          c.name,
          c.avatar_seed,
          c.level,
          c.xp,
          c.talent_points,
          c.created_at,
          c.updated_at,
          a.display_name,
          coalesce((
            SELECT jsonb_agg(aw.wallet_address ORDER BY aw.created_at ASC)
            FROM account_wallets aw
            WHERE aw.account_id = c.account_id
          ), '[]'::jsonb) AS wallets,
          coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', ci.item_id,
              'chainTokenId', ci.chain_token_id,
              'chainTier', ci.chain_tier,
              'count', ci.count,
              'updatedAt', ci.updated_at
            ) ORDER BY ci.updated_at DESC, ci.item_id ASC, ci.chain_token_id ASC)
            FROM character_inventory ci
            WHERE ci.character_id = c.id AND ci.count > 0
          ), '[]'::jsonb) AS inventory,
          coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'slot', ce.slot,
              'itemId', ce.item_id,
              'chainTokenId', ce.chain_token_id,
              'chainTier', ce.chain_tier,
              'updatedAt', ce.updated_at
            ) ORDER BY ce.slot ASC)
            FROM character_equipment ce
            WHERE ce.character_id = c.id
          ), '[]'::jsonb) AS equipment,
          coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', cq.quest_id,
              'status', cq.status,
              'progress', cq.progress,
              'required', cq.required,
              'flags', cq.flags,
              'completedAt', cq.completed_at,
              'updatedAt', cq.updated_at
            ) ORDER BY cq.updated_at DESC, cq.quest_id ASC)
            FROM character_quests cq
            WHERE cq.character_id = c.id
          ), '[]'::jsonb) AS quests,
          coalesce((SELECT count(*) FROM character_quests cq WHERE cq.character_id = c.id AND cq.status = 'active'), 0)::int AS active_quests,
          coalesce((SELECT count(*) FROM character_quests cq WHERE cq.character_id = c.id AND cq.status = 'ready'), 0)::int AS ready_quests,
          coalesce((SELECT count(*) FROM character_quests cq WHERE cq.character_id = c.id AND cq.status = 'completed'), 0)::int AS completed_quests,
          coalesce((SELECT count(*) FROM character_talents ct WHERE ct.character_id = c.id), 0)::int AS talent_ranks
        FROM characters c
        JOIN accounts a ON a.id = c.account_id
        ORDER BY c.updated_at DESC
        LIMIT ${ADMIN_CHARACTER_LIMIT}
      `),
      safeExecute<ItemEconomyRow>("item economy", sql`
        SELECT
          item_id,
          coalesce(sum(count), 0)::int AS total_count,
          count(DISTINCT character_id)::int AS holders,
          count(*) FILTER (WHERE chain_token_id <> '')::int AS chain_rows,
          coalesce(round(avg(chain_tier), 2), 0)::float AS avg_tier,
          max(updated_at) AS last_updated_at
        FROM character_inventory
        WHERE count > 0
        GROUP BY item_id
        ORDER BY total_count DESC, holders DESC, item_id ASC
      `),
      safeExecute<QuestProgressRow>("quest progress", sql`
        SELECT
          quest_id,
          status,
          count(*)::int AS characters,
          coalesce(sum(progress), 0)::int AS total_progress,
          coalesce(sum(required), 0)::int AS total_required,
          max(updated_at) AS last_updated_at
        FROM character_quests
        GROUP BY quest_id, status
        ORDER BY quest_id ASC, status ASC
      `),
      safeExecute<SeasonLeaderboardRow>("season leaderboard", sql`
        SELECT
          sre.wallet_address,
          max(c.name) AS character_name,
          max(a.display_name) AS display_name,
          coalesce(sum(points), 0)::int AS total_points,
          coalesce(sum(points) FILTER (WHERE status = 'pending'), 0)::int AS pending_points,
          coalesce(sum(points) FILTER (WHERE status = 'approved'), 0)::int AS approved_points,
          coalesce(sum(points) FILTER (WHERE status = 'distributed'), 0)::int AS distributed_points,
          coalesce(sum(points) FILTER (WHERE status = 'rejected'), 0)::int AS rejected_points,
          count(*)::int AS events,
          max(sre.created_at) AS last_event_at
        FROM season_reward_events sre
        LEFT JOIN account_wallets aw ON aw.wallet_address = sre.wallet_address
        LEFT JOIN accounts a ON a.id = aw.account_id
        LEFT JOIN characters c ON c.account_id = a.id
        GROUP BY sre.wallet_address
        ORDER BY total_points DESC, last_event_at DESC
        LIMIT ${ADMIN_LEADERBOARD_LIMIT}
      `),
      safeExecute<PurchaseSummaryRow>("purchase summary", sql`
        SELECT
          product_id,
          status,
          source,
          payment_token,
          count(*)::int AS events,
          count(DISTINCT wallet_address)::int AS wallets,
          max(created_at) AS last_event_at
        FROM crypto_purchase_events
        GROUP BY product_id, status, source, payment_token
        ORDER BY product_id ASC, status ASC, source ASC, payment_token ASC
      `),
      safeExecute<AnalyticsTotalsRow>("analytics totals", sql`
        SELECT
          count(*)::int AS events,
          count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS events_24h,
          count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
          count(DISTINCT character_id)::int AS characters,
          count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets,
          max(created_at) AS last_event_at
        FROM analytics_events
        WHERE created_at >= now() - interval '7 days'
      `),
      safeExecute<AnalyticsByTypeRow>("analytics by type", sql`
        SELECT
          event_type,
          count(*)::int AS events,
          count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
          count(DISTINCT character_id)::int AS characters,
          max(created_at) AS last_event_at
        FROM analytics_events
        WHERE created_at >= now() - interval '7 days'
        GROUP BY event_type
        ORDER BY events DESC, event_type ASC
      `),
      safeExecute<AnalyticsBucketRow>("analytics hourly", sql`
        SELECT
          to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00"Z"') AS bucket,
          count(*)::int AS events
        FROM analytics_events
        WHERE created_at >= now() - interval '24 hours'
        GROUP BY bucket
        ORDER BY bucket ASC
      `),
      safeExecute<RecentAnalyticsRow>("recent analytics", sql`
        SELECT
          ae.id,
          ae.event_type,
          ae.session_id,
          ae.character_id,
          c.name AS character_name,
          ae.identity_type,
          ae.wallet_hash,
          ae.properties,
          ae.created_at
        FROM analytics_events ae
        LEFT JOIN characters c ON c.id = ae.character_id
        ORDER BY ae.created_at DESC
        LIMIT ${ADMIN_RECENT_LIMIT}
      `),
      safeExecute<InviteSummaryRow>("invite summary", sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE claimed_at IS NULL)::int AS open,
          count(*) FILTER (WHERE claimed_at IS NOT NULL)::int AS claimed,
          max(created_at) AS last_created_at,
          max(claimed_at) AS last_claimed_at,
          max(last_used_at) AS last_used_at
        FROM invite_codes
      `),
      safeExecute<InviteCodeRow>("invite codes", sql`
        SELECT
          code,
          created_at,
          claimed_wallet_address,
          claimed_at,
          last_used_at
        FROM invite_codes
        ORDER BY claimed_at IS NOT NULL ASC, created_at ASC, code ASC
        LIMIT ${ADMIN_INVITE_LIMIT}
      `),
    ]);

    const overview = mapOverviewRow(firstRow(overviewRows));
    const analyticsTotals = mapAnalyticsTotalsRow(firstRow(analyticsTotalRows));
    const seasonLeaderboard = Array.from(leaderboardRows).map(mapSeasonLeaderboardRow);
    const purchaseSummary = Array.from(purchaseRows).map(mapPurchaseSummaryRow);
    overview.seasonPoints = seasonLeaderboard.reduce((sum, row) => sum + row.pendingPoints + row.approvedPoints + row.distributedPoints, 0);
    overview.seasonEvents = seasonLeaderboard.reduce((sum, row) => sum + row.events, 0);
    overview.purchaseEvents = purchaseSummary.reduce((sum, row) => sum + row.events, 0);
    overview.analyticsEvents24h = analyticsTotals.events24h;
    overview.analyticsEvents7d = analyticsTotals.events;

    return {
      configured: true,
      ok: errors.length === 0,
      partial: errors.length > 0,
      error: errors.join("; "),
      overview,
      characters: Array.from(characterRows).map(mapCharacterRow),
      itemEconomy: Array.from(itemRows).map(mapItemEconomyRow),
      questProgress: Array.from(questRows).map(mapQuestProgressRow),
      seasonLeaderboard,
      purchaseSummary,
      analytics: {
        totals: analyticsTotals,
        byType: Array.from(analyticsByTypeRows).map(mapAnalyticsByTypeRow),
        hourly: Array.from(analyticsBucketRows).map(mapAnalyticsBucketRow),
        recent: Array.from(recentAnalyticsRows).map(mapRecentAnalyticsRow),
      },
      invites: {
        summary: mapInviteSummaryRow(firstRow(inviteSummaryRows)),
        codes: Array.from(inviteRows).map(mapInviteCodeRow),
      },
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      partial: false,
      error: error instanceof Error ? error.message : "Unable to read admin database data.",
      overview: {},
      characters: [],
      itemEconomy: [],
      questProgress: [],
      seasonLeaderboard: [],
      purchaseSummary: [],
      analytics: emptyAnalytics(),
      invites: emptyInvites(),
    };
  }
}

async function loadMarketQuotes() {
  try {
    return await getCryptoMarketQuoteSnapshot();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to read market quotes.",
      refreshIntervalSeconds: 21600,
      quotes: [],
    };
  }
}

type OverviewRow = QueryRow;
type CharacterRow = QueryRow;
type ItemEconomyRow = QueryRow;
type QuestProgressRow = QueryRow;
type SeasonLeaderboardRow = QueryRow;
type PurchaseSummaryRow = QueryRow;
type AnalyticsTotalsRow = QueryRow;
type AnalyticsByTypeRow = QueryRow;
type AnalyticsBucketRow = QueryRow;
type RecentAnalyticsRow = QueryRow;
type InviteSummaryRow = QueryRow;
type InviteCodeRow = QueryRow;

function firstRow<T extends QueryRow>(rows: Iterable<T>) {
  return Array.from(rows)[0] ?? {};
}

function mapOverviewRow(row: QueryRow) {
  return {
    accounts: toNumber(row.accounts),
    wallets: toNumber(row.wallets),
    characters: toNumber(row.characters),
    avgLevel: toNumber(row.avg_level),
    avgXp: toNumber(row.avg_xp),
    inventoryRows: toNumber(row.inventory_rows),
    inventoryItems: toNumber(row.inventory_items),
    equipmentRows: toNumber(row.equipment_rows),
    activeQuests: toNumber(row.active_quests),
    readyQuests: toNumber(row.ready_quests),
    completedQuests: toNumber(row.completed_quests),
    seasonPoints: toNumber(row.season_points),
    seasonEvents: toNumber(row.season_events),
    purchaseEvents: toNumber(row.purchase_events),
    analyticsEvents24h: toNumber(row.analytics_events_24h),
    analyticsEvents7d: toNumber(row.analytics_events_7d),
    databaseSizeBytes: toNumber(row.database_size_bytes),
  };
}

function mapCharacterRow(row: QueryRow) {
  const inventory = toArray(row.inventory).map(normalizeInventoryRow);
  const equipment = toArray(row.equipment).map(normalizeEquipmentRow);
  const quests = toArray(row.quests).map(normalizeQuestRow);
  return {
    id: toStringValue(row.id),
    accountId: toStringValue(row.account_id),
    name: toStringValue(row.name),
    displayName: toStringValue(row.display_name),
    avatarSeed: toNumber(row.avatar_seed),
    level: toNumber(row.level),
    xp: toNumber(row.xp),
    talentPoints: toNumber(row.talent_points),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    wallets: toArray(row.wallets).map(toStringValue).filter(Boolean),
    inventory,
    inventoryItems: inventory.reduce((sum, item) => sum + item.count, 0),
    equipment,
    quests,
    questCounts: {
      active: toNumber(row.active_quests),
      ready: toNumber(row.ready_quests),
      completed: toNumber(row.completed_quests),
    },
    talentRanks: toNumber(row.talent_ranks),
  };
}

function mapItemEconomyRow(row: QueryRow) {
  const itemId = toStringValue(row.item_id) as ItemId;
  const definition = ITEMS[itemId];
  return {
    itemId,
    name: definition?.name ?? itemId,
    quality: definition?.quality ?? "common",
    iconColor: definition?.iconColor ?? "#8f98a8",
    totalCount: toNumber(row.total_count),
    holders: toNumber(row.holders),
    chainRows: toNumber(row.chain_rows),
    avgTier: toNumber(row.avg_tier),
    lastUpdatedAt: toIsoString(row.last_updated_at),
  };
}

function mapQuestProgressRow(row: QueryRow) {
  const questId = toStringValue(row.quest_id);
  const totalRequired = toNumber(row.total_required);
  return {
    questId,
    title: QUESTS[questId as keyof typeof QUESTS]?.title ?? questId,
    status: toStringValue(row.status),
    characters: toNumber(row.characters),
    totalProgress: toNumber(row.total_progress),
    totalRequired,
    progressPct: totalRequired > 0 ? Math.round((toNumber(row.total_progress) / totalRequired) * 1000) / 10 : 0,
    lastUpdatedAt: toIsoString(row.last_updated_at),
  };
}

function mapSeasonLeaderboardRow(row: QueryRow) {
  return {
    walletAddress: toStringValue(row.wallet_address),
    characterName: toStringValue(row.character_name),
    displayName: toStringValue(row.display_name),
    totalPoints: toNumber(row.total_points),
    pendingPoints: toNumber(row.pending_points),
    approvedPoints: toNumber(row.approved_points),
    distributedPoints: toNumber(row.distributed_points),
    rejectedPoints: toNumber(row.rejected_points),
    events: toNumber(row.events),
    lastEventAt: toIsoString(row.last_event_at),
  };
}

function mapPurchaseSummaryRow(row: QueryRow) {
  return {
    productId: toStringValue(row.product_id),
    status: toStringValue(row.status),
    source: toStringValue(row.source),
    paymentToken: toStringValue(row.payment_token) || "unknown",
    events: toNumber(row.events),
    wallets: toNumber(row.wallets),
    lastEventAt: toIsoString(row.last_event_at),
  };
}

function mapAnalyticsTotalsRow(row: QueryRow) {
  return {
    events: toNumber(row.events),
    events24h: toNumber(row.events_24h),
    sessions: toNumber(row.sessions),
    characters: toNumber(row.characters),
    wallets: toNumber(row.wallets),
    lastEventAt: toIsoString(row.last_event_at),
  };
}

function mapAnalyticsByTypeRow(row: QueryRow) {
  return {
    eventType: toStringValue(row.event_type),
    events: toNumber(row.events),
    sessions: toNumber(row.sessions),
    characters: toNumber(row.characters),
    lastEventAt: toIsoString(row.last_event_at),
  };
}

function mapAnalyticsBucketRow(row: QueryRow) {
  return {
    bucket: toStringValue(row.bucket),
    events: toNumber(row.events),
  };
}

function mapRecentAnalyticsRow(row: QueryRow) {
  return {
    id: toStringValue(row.id),
    eventType: toStringValue(row.event_type),
    sessionId: toStringValue(row.session_id),
    characterId: toStringValue(row.character_id),
    characterName: toStringValue(row.character_name),
    identityType: toStringValue(row.identity_type),
    walletHash: toStringValue(row.wallet_hash),
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
    createdAt: toIsoString(row.created_at),
  };
}

function mapInviteSummaryRow(row: QueryRow) {
  return {
    total: toNumber(row.total),
    open: toNumber(row.open),
    claimed: toNumber(row.claimed),
    lastCreatedAt: toIsoString(row.last_created_at),
    lastClaimedAt: toIsoString(row.last_claimed_at),
    lastUsedAt: toIsoString(row.last_used_at),
  };
}

function mapInviteCodeRow(row: QueryRow) {
  return {
    code: toStringValue(row.code),
    createdAt: toIsoString(row.created_at),
    claimedWalletAddress: toStringValue(row.claimed_wallet_address),
    claimedAt: toIsoString(row.claimed_at),
    lastUsedAt: toIsoString(row.last_used_at),
  };
}

function normalizeInventoryRow(value: unknown) {
  const row = isRecord(value) ? value : {};
  return {
    id: toStringValue(row.id),
    chainTokenId: toStringValue(row.chainTokenId),
    chainTier: toNumber(row.chainTier) || 1,
    count: toNumber(row.count),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function normalizeEquipmentRow(value: unknown) {
  const row = isRecord(value) ? value : {};
  return {
    slot: toStringValue(row.slot),
    itemId: toStringValue(row.itemId),
    chainTokenId: toStringValue(row.chainTokenId),
    chainTier: toNumber(row.chainTier) || 1,
    updatedAt: toIsoString(row.updatedAt),
  };
}

function normalizeQuestRow(value: unknown) {
  const row = isRecord(value) ? value : {};
  return {
    id: toStringValue(row.id),
    title: QUESTS[toStringValue(row.id) as keyof typeof QUESTS]?.title ?? toStringValue(row.id),
    status: toStringValue(row.status),
    progress: toNumber(row.progress),
    required: toNumber(row.required),
    flags: toStringValue(row.flags),
    completedAt: toNumber(row.completedAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function emptyAnalytics() {
  return {
    totals: {
      events: 0,
      events24h: 0,
      sessions: 0,
      characters: 0,
      wallets: 0,
      lastEventAt: "",
    },
    byType: [],
    hourly: [],
    recent: [],
  };
}

function emptyInvites() {
  return {
    summary: {
      total: 0,
      open: 0,
      claimed: 0,
      lastCreatedAt: "",
      lastClaimedAt: "",
      lastUsedAt: "",
    },
    codes: [],
  };
}

function formatAdminError(error: unknown) {
  if (!(error instanceof Error)) return "unknown error";
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message}${cause}`.replace(/\s+/g, " ").trim();
}

function getInvitePublicOrigin() {
  return (process.env.MFERLAND_INVITE_PUBLIC_ORIGIN ?? DEFAULT_INVITE_PUBLIC_ORIGIN).trim().replace(/\/+$/, "") || DEFAULT_INVITE_PUBLIC_ORIGIN;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function writeText(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

function isAdminRequestAllowed(req: IncomingMessage) {
  return isLocalNetworkAddress(req.socket.remoteAddress ?? "") && isLocalNetworkHost(req.headers.host ?? "");
}

function isLocalNetworkHost(host: string) {
  const hostname = normalizeHostHeader(host);
  if (!hostname) return false;
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  return isLocalNetworkAddress(hostname);
}

function normalizeHostHeader(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const closeIndex = trimmed.indexOf("]");
    return closeIndex >= 0 ? trimmed.slice(1, closeIndex) : "";
  }
  return trimmed.split(":")[0] ?? "";
}

function isLocalNetworkAddress(address: string) {
  const normalized = normalizeRemoteAddress(address);
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const ipv4 = parseIpv4(normalized);
  if (!ipv4) return false;
  const [a, b] = ipv4;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 192 && b === 168;
}

function normalizeRemoteAddress(address: string) {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed.replace(/^\[/, "").replace(/\]$/, "");
}

function parseIpv4(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

function getLanAddresses() {
  const addresses = new Set<string>();
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.internal || network.family !== "IPv4") continue;
      addresses.add(network.address);
    }
  }
  return [...addresses];
}

function getAdminHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mferland admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d1117;
      --panel: #151b23;
      --panel-2: #1d2632;
      --line: #303b4a;
      --muted: #9aa8ba;
      --text: #edf2f7;
      --good: #43d18a;
      --warn: #f0bc55;
      --bad: #ff6b6b;
      --info: #64b5f6;
      --chip: #273241;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(13, 17, 23, 0.96);
      backdrop-filter: blur(10px);
    }

    h1, h2, h3 { margin: 0; line-height: 1.15; letter-spacing: 0; }
    h1 { font-size: 20px; }
    h2 { font-size: 16px; }
    h3 { font-size: 13px; color: var(--muted); font-weight: 700; text-transform: uppercase; }
    main { width: min(1800px, 100%); margin: 0 auto; padding: 16px; }
    section { margin-bottom: 16px; }

    .topline { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .status-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--good); display: inline-block; }
    .muted { color: var(--muted); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--chip);
      color: var(--text);
      font-size: 12px;
      white-space: nowrap;
    }
    .pill.good { color: var(--good); border-color: rgba(67, 209, 138, 0.45); }
    .pill.warn { color: var(--warn); border-color: rgba(240, 188, 85, 0.45); }
    .pill.bad { color: var(--bad); border-color: rgba(255, 107, 107, 0.45); }

    .grid { display: grid; gap: 12px; }
    .kpis { grid-template-columns: repeat(8, minmax(130px, 1fr)); }
    .two-col { grid-template-columns: minmax(360px, 0.95fr) minmax(520px, 1.35fr); }
    .three-col { grid-template-columns: repeat(3, minmax(260px, 1fr)); }

    .panel, .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .panel { padding: 14px; overflow: hidden; }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .card { padding: 12px; }
    .kpi-value { font-size: 24px; font-weight: 800; }
    .kpi-label { color: var(--muted); font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 9px; border-bottom: 1px solid rgba(48, 59, 74, 0.72); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 700; background: rgba(21, 27, 35, 0.92); position: sticky; top: 0; z-index: 1; }
    tbody tr:hover { background: rgba(255, 255, 255, 0.035); }
    .scroll { max-height: 460px; overflow: auto; border: 1px solid rgba(48, 59, 74, 0.7); border-radius: 6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    button.row-button {
      width: 100%;
      display: block;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      padding: 0;
      font: inherit;
    }
    button.copy-button {
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel-2);
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      padding: 4px 8px;
      white-space: nowrap;
    }
    button.copy-button:hover { border-color: var(--info); }
    button.copy-button:disabled { cursor: not-allowed; opacity: 0.52; }
    tr.selected { background: rgba(100, 181, 246, 0.13); }

    .bar-track { height: 8px; min-width: 90px; background: #273241; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--info); border-radius: inherit; }
    .bar-fill.good { background: var(--good); }
    .bar-fill.warn { background: var(--warn); }
    .bar-fill.bad { background: var(--bad); }
    .bars { display: grid; gap: 9px; }
    .bar-row { display: grid; grid-template-columns: 150px 1fr 64px; align-items: center; gap: 8px; }
    .spark { display: flex; align-items: end; gap: 2px; height: 54px; border-bottom: 1px solid var(--line); padding-top: 4px; }
    .spark span { flex: 1; min-width: 3px; background: var(--info); border-radius: 2px 2px 0 0; }
    .invite-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .invite-code { font-size: 13px; font-weight: 700; }
    .invite-url { min-width: 320px; max-width: 720px; overflow-wrap: anywhere; color: var(--muted); }
    .copy-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 5px; }

    .item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
    .item-card {
      display: grid;
      grid-template-columns: 34px 1fr auto;
      gap: 9px;
      align-items: center;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel-2);
      min-width: 0;
    }
    .item-icon {
      width: 34px;
      height: 34px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.16);
    }
    .item-name { font-weight: 700; overflow-wrap: anywhere; }
    .item-meta { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .quality-common .item-name { color: #d8dee9; }
    .quality-poor .item-name { color: #a4abb4; }
    .quality-uncommon .item-name { color: #76df92; }
    .quality-rare .item-name { color: #9f8cff; }
    .quality-quest .item-name { color: #f2d067; }

    .detail-grid { display: grid; grid-template-columns: repeat(5, minmax(90px, 1fr)); gap: 8px; margin-bottom: 12px; }
    .stat { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 9px; }
    .stat b { display: block; font-size: 18px; }
    .stat span { color: var(--muted); font-size: 12px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    details { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 10px 12px; }
    summary { cursor: pointer; color: var(--muted); font-weight: 700; }
    pre { overflow: auto; max-height: 520px; margin: 10px 0 0; white-space: pre-wrap; word-break: break-word; color: #d5dde8; }
    .error { color: var(--bad); }

    @media (max-width: 1200px) {
      .kpis { grid-template-columns: repeat(4, minmax(130px, 1fr)); }
      .two-col, .three-col, .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      header { align-items: flex-start; flex-direction: column; }
      main { padding: 10px; }
      .kpis { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .detail-grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      th, td { padding: 7px 6px; }
      .bar-row { grid-template-columns: 112px 1fr 48px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="topline"><span class="status-dot" id="status-dot"></span><h1>mferland admin</h1><span class="pill">LAN only</span></div>
      <div class="muted" id="timestamp">Loading...</div>
    </div>
    <div class="topline">
      <span class="pill" id="db-status">DB</span>
      <span class="pill" id="refresh-rate">Refresh ${ADMIN_REFRESH_MS / 1000}s</span>
    </div>
  </header>
  <main>
    <section class="grid kpis" id="kpis"></section>
    <section class="grid two-col">
      <div class="panel">
        <div class="panel-head"><h2>Areas</h2><span class="muted" id="area-total"></span></div>
        <div class="bars" id="areas"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Players</h2><span class="muted" id="player-total"></span></div>
        <div class="scroll"><table id="players"></table></div>
      </div>
    </section>
    <section class="panel" id="player-detail"></section>
    <section class="grid three-col">
      <div class="panel">
        <div class="panel-head"><h2>NPCs</h2><span class="muted" id="npc-total"></span></div>
        <div class="scroll"><table id="npcs"></table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Item Economy</h2><span class="muted" id="item-total"></span></div>
        <div class="scroll"><table id="items"></table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Quest Progress</h2><span class="muted" id="quest-total"></span></div>
        <div class="scroll"><table id="quests"></table></div>
      </div>
    </section>
    <section class="grid two-col">
      <div class="panel">
        <div class="panel-head"><h2>Analytics</h2><span class="muted" id="analytics-total"></span></div>
        <div id="analytics"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Season & Purchases</h2><span class="muted" id="season-total"></span></div>
        <div class="split">
          <div class="scroll"><table id="season"></table></div>
          <div class="scroll"><table id="purchases"></table></div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Invites</h2><span class="muted" id="invite-total"></span></div>
      <div class="invite-actions">
        <button class="copy-button" id="copy-open-invites" type="button">Copy open invite URLs</button>
        <span class="muted" id="invite-copy-status"></span>
      </div>
      <div class="scroll"><table id="invites"></table></div>
    </section>
    <section>
      <details>
        <summary>Raw payload</summary>
        <pre id="raw"></pre>
      </details>
    </section>
  </main>
  <script>
    var state = { data: null, selectedPlayerKey: "" };

    function esc(value) {
      return String(value == null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function n(value) {
      var num = Number(value || 0);
      return Number.isFinite(num) ? num.toLocaleString() : "0";
    }

    function pct(value, total) {
      if (!total) return 0;
      return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total)) * 100)));
    }

    function time(value) {
      if (!value) return "";
      var date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString();
    }

    function duration(ms) {
      ms = Number(ms || 0);
      var sec = Math.floor(ms / 1000);
      var hrs = Math.floor(sec / 3600);
      var min = Math.floor((sec % 3600) / 60);
      var rem = sec % 60;
      if (hrs > 0) return hrs + "h " + min + "m";
      if (min > 0) return min + "m " + rem + "s";
      return rem + "s";
    }

    function inviteUrl(code) {
      return invitePublicOrigin() + "/?invite=" + encodeURIComponent(code || "");
    }

    function invitePublicOrigin() {
      var origin = state.data && state.data.server && state.data.server.invitePublicOrigin;
      return String(origin || "https://game.mfergpt.lol").replace(/\\/$/, "");
    }

    function setInviteCopyStatus(message) {
      var node = document.getElementById("invite-copy-status");
      if (!node) return;
      node.textContent = message;
      window.clearTimeout(setInviteCopyStatus.timer);
      setInviteCopyStatus.timer = window.setTimeout(function() {
        node.textContent = "";
      }, 2600);
    }

    function copyText(text, label) {
      if (!text) return;
      var done = function() { setInviteCopyStatus(label || "Copied"); };
      var fallback = function() {
        window.prompt("Copy this", text);
        done();
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
        return;
      }
      fallback();
    }

    function catalogItem(id) {
      return (state.data && state.data.catalog && state.data.catalog.items && state.data.catalog.items[id]) || {
        id: id,
        name: id || "empty",
        quality: "common",
        iconColor: "#687284"
      };
    }

    function itemChip(item) {
      if (!item || !item.id && !item.itemId) return '<span class="muted">empty</span>';
      var id = item.id || item.itemId;
      var def = catalogItem(id);
      var count = Number(item.count || 0);
      var tier = Number(item.chainTier || 1);
      var meta = [];
      if (count > 1) meta.push("x" + count);
      if (tier > 1) meta.push("T" + tier);
      if (item.chainTokenId) meta.push("#" + item.chainTokenId);
      return '<div class="item-card quality-' + esc(def.quality) + '">' +
        '<div class="item-icon" style="background:' + esc(def.iconColor) + '"></div>' +
        '<div><div class="item-name">' + esc(def.name || id) + '</div><div class="item-meta">' + esc(meta.join(" · ") || id) + '</div></div>' +
        '<div class="pill">' + esc(def.quality || "") + '</div>' +
      '</div>';
    }

    function findLivePlayerForCharacter(character) {
      var players = (state.data && state.data.live && state.data.live.players) || [];
      for (var i = 0; i < players.length; i += 1) {
        if (players[i].characterId && players[i].characterId === character.id) return players[i];
      }
      var wallets = new Set((character.wallets || []).map(function(wallet) { return String(wallet).toLowerCase(); }));
      for (var j = 0; j < players.length; j += 1) {
        if (players[j].walletAddress && wallets.has(String(players[j].walletAddress).toLowerCase())) return players[j];
      }
      return null;
    }

    function playerRows() {
      var rows = [];
      var seenSessions = new Set();
      var characters = (state.data.database && state.data.database.characters) || [];
      characters.forEach(function(character) {
        var live = findLivePlayerForCharacter(character);
        if (live) seenSessions.add(live.sessionId);
        rows.push({
          key: "character:" + character.id,
          online: Boolean(live),
          live: live,
          character: character,
          name: live ? live.name : character.name,
          level: live ? live.level : character.level,
          xp: live ? live.xp : character.xp,
          status: live ? live.status : "offline",
          identityType: live ? live.identityType : "wallet",
          walletAddress: live ? live.walletAddress : ((character.wallets || [])[0] || ""),
          inventory: live ? live.inventory : character.inventory,
          equipment: live ? live.equipment : character.equipment,
          quests: live ? live.quests : character.quests,
          questCounts: live ? live.questCounts : character.questCounts,
          updatedAt: character.updatedAt
        });
      });
      ((state.data.live && state.data.live.players) || []).forEach(function(player) {
        if (seenSessions.has(player.sessionId)) return;
        rows.push({
          key: "session:" + player.sessionId,
          online: true,
          live: player,
          character: null,
          name: player.name,
          level: player.level,
          xp: player.xp,
          status: player.status,
          identityType: player.identityType,
          walletAddress: player.walletAddress,
          inventory: player.inventory,
          equipment: player.equipment,
          quests: player.quests,
          questCounts: player.questCounts,
          updatedAt: ""
        });
      });
      rows.sort(function(a, b) {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });
      return rows;
    }

    function renderKpis() {
      var data = state.data;
      var live = data.live.totals || {};
      var overview = data.database.overview || {};
      var analytics = (data.database.analytics && data.database.analytics.totals) || {};
      var kpis = [
        ["Online", live.playersOnline, "players now"],
        ["Wallets", live.walletPlayersOnline, "wallet sessions"],
        ["NPC Aggro", live.aggroNpcs, "active targets"],
        ["Loot", live.lootNpcs, "NPCs holding loot"],
        ["Characters", overview.characters, "DB total"],
        ["Items", overview.inventoryItems, "persisted count"],
        ["Season Pts", overview.seasonPoints, "active season total"],
        ["Events 24h", analytics.events24h || overview.analyticsEvents24h, "analytics"]
      ];
      document.getElementById("kpis").innerHTML = kpis.map(function(kpi) {
        return '<div class="card"><div class="kpi-value">' + n(kpi[1]) + '</div><div class="kpi-label">' + esc(kpi[0]) + " · " + esc(kpi[2]) + '</div></div>';
      }).join("");
    }

    function renderAreas() {
      var areas = (state.data.live && state.data.live.areas) || [];
      var max = Math.max(1, ...areas.map(function(area) { return area.players + area.npcs; }));
      document.getElementById("area-total").textContent = areas.length + " areas";
      document.getElementById("areas").innerHTML = areas.map(function(area) {
        var total = area.players + area.npcs;
        return '<div class="bar-row">' +
          '<div><b>' + esc(area.name) + '</b><div class="muted">' + n(area.players) + ' players · ' + n(area.aliveNpcs) + ' NPCs</div></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct(total, max) + '%"></div></div>' +
          '<div class="num">' + n(total) + '</div>' +
        '</div>';
      }).join("");
    }

    function renderPlayers() {
      var rows = playerRows();
      if (!state.selectedPlayerKey && rows.length) state.selectedPlayerKey = rows[0].key;
      if (rows.length && !rows.some(function(row) { return row.key === state.selectedPlayerKey; })) state.selectedPlayerKey = rows[0].key;
      document.getElementById("player-total").textContent = rows.filter(function(row) { return row.online; }).length + " online · " + rows.length + " total";
      document.getElementById("players").innerHTML =
        '<thead><tr><th>Status</th><th>Name</th><th>Lvl</th><th>Inventory</th><th>Quests</th><th>Wallet</th><th>Updated</th></tr></thead><tbody>' +
        rows.map(function(row) {
          var questCounts = row.questCounts || {};
          var selected = row.key === state.selectedPlayerKey ? " selected" : "";
          var statusClass = row.status === "offline" ? "bad" : row.status === "dead" ? "warn" : "good";
          return '<tr class="' + selected + '"><td><span class="pill ' + statusClass + '">' + esc(row.status) + '</span></td>' +
            '<td><button class="row-button" data-player-key="' + esc(row.key) + '"><b>' + esc(row.name) + '</b><div class="muted">' + esc(row.isAgent ? "agent wallet" : row.identityType) + '</div></button></td>' +
            '<td class="num">' + n(row.level) + '</td>' +
            '<td class="num">' + n((row.inventory || []).reduce(function(sum, item) { return sum + Number(item.count || 0); }, 0)) + '</td>' +
            '<td class="nowrap">' + n(questCounts.active) + ' / ' + n(questCounts.ready) + ' / ' + n(questCounts.completed) + '</td>' +
            '<td class="mono">' + esc(shortWallet(row.walletAddress)) + '</td>' +
            '<td class="nowrap">' + esc(row.online && row.live ? duration(row.live.onlineForMs) : time(row.updatedAt)) + '</td></tr>';
        }).join("") + '</tbody>';
      document.querySelectorAll("[data-player-key]").forEach(function(button) {
        button.addEventListener("click", function() {
          state.selectedPlayerKey = button.getAttribute("data-player-key") || "";
          renderPlayers();
          renderPlayerDetail();
        });
      });
    }

    function renderPlayerDetail() {
      var row = playerRows().find(function(entry) { return entry.key === state.selectedPlayerKey; });
      if (!row) {
        document.getElementById("player-detail").innerHTML = '<div class="muted">No players yet.</div>';
        return;
      }
      var live = row.live || {};
      var stats = [
        ["HP", live.health != null ? Math.round(live.health) + " / " + Math.round(live.maxHealth || 0) : ""],
        ["MP", live.mana != null ? Math.round(live.mana) + " / " + Math.round(live.maxMana || 0) : ""],
        ["STR", live.strength],
        ["DEX", live.dexterity],
        ["MAG", live.magic],
        ["XP", row.xp],
        ["Talents", live.talents ? live.talents.length : (row.character ? row.character.talentRanks : 0)],
        ["Season", live.season0Points != null ? live.season0Points : ""],
        ["Pos", live.position ? Math.round(live.position.x) + ", " + Math.round(live.position.z) : ""],
        ["Online", live.onlineForMs ? duration(live.onlineForMs) : ""]
      ];
      var slotLabels = (state.data.catalog && state.data.catalog.equipmentSlots) || {};
      var equipment = row.equipment || [];
      var inventory = row.inventory || [];
      var quests = row.quests || [];
      document.getElementById("player-detail").innerHTML =
        '<div class="panel-head"><h2>' + esc(row.name) + '</h2><div class="topline"><span class="pill">' + esc(row.status) + '</span><span class="pill mono">' + esc(row.character ? row.character.id : row.live.sessionId) + '</span></div></div>' +
        '<div class="detail-grid">' + stats.map(function(stat) {
          return '<div class="stat"><b>' + esc(stat[1] == null ? "" : stat[1]) + '</b><span>' + esc(stat[0]) + '</span></div>';
        }).join("") + '</div>' +
        '<div class="split"><div><h3>Equipment</h3><div class="item-grid">' + equipment.map(function(slot) {
          return itemChip({ id: slot.itemId, chainTokenId: slot.chainTokenId, chainTier: slot.chainTier, count: 1 })
            .replace('</div><div class="pill">', '<div class="item-meta">' + esc(slotLabels[slot.slot] || slot.slot) + '</div></div><div class="pill">');
        }).join("") + '</div></div>' +
        '<div><h3>Inventory</h3><div class="item-grid">' + (inventory.length ? inventory.map(itemChip).join("") : '<div class="muted">empty</div>') + '</div></div></div>' +
        '<div style="height:12px"></div><h3>Quests</h3><div class="scroll"><table><thead><tr><th>Quest</th><th>Status</th><th>Progress</th><th>Updated</th></tr></thead><tbody>' +
        quests.map(function(quest) {
          var def = state.data.catalog.quests[quest.id] || {};
          return '<tr><td><b>' + esc(def.title || quest.title || quest.id) + '</b><div class="muted">' + esc(quest.id) + '</div></td><td><span class="pill">' + esc(quest.status) + '</span></td><td>' + n(quest.progress) + ' / ' + n(quest.required) + '</td><td>' + esc(time(quest.updatedAt || quest.completedAt)) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }

    function renderNpcs() {
      var rows = (state.data.live && state.data.live.npcs || []).slice().sort(function(a, b) {
        if (Boolean(a.aggroTargetId) !== Boolean(b.aggroTargetId)) return a.aggroTargetId ? -1 : 1;
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return String(a.id).localeCompare(String(b.id));
      });
      document.getElementById("npc-total").textContent = rows.length + " NPCs";
      document.getElementById("npcs").innerHTML =
        '<thead><tr><th>Name</th><th>Role</th><th>HP</th><th>Aggro</th><th>Loot</th><th>Area</th></tr></thead><tbody>' +
        rows.map(function(npc) {
          var healthPct = pct(npc.health, npc.maxHealth);
          var area = areaFor(npc.position.x, npc.position.z);
          return '<tr><td><b>' + esc(npc.name) + '</b><div class="muted">' + esc(npc.id) + '</div></td><td>' + esc(npc.role) + '<div class="muted">' + esc(npc.model) + '</div></td><td><div class="bar-track"><div class="bar-fill ' + (healthPct < 30 ? "bad" : "good") + '" style="width:' + healthPct + '%"></div></div><div class="muted">' + n(npc.health) + ' / ' + n(npc.maxHealth) + '</div></td><td class="mono">' + esc(npc.aggroTargetId || "") + '</td><td>' + (npc.hasLoot ? '<span class="pill warn">loot</span>' : '') + '</td><td>' + esc(area.name) + '</td></tr>';
        }).join("") + '</tbody>';
    }

    function areaFor(x, z) {
      var areas = state.data.catalog.world.adminAreas || [];
      var fallback = areas[areas.length - 1] || { name: "Unknown" };
      var best = fallback;
      var bestDistance = Infinity;
      areas.slice(0, -1).forEach(function(area) {
        var distance = Math.hypot(Number(x || 0) - area.x, Number(z || 0) - area.z);
        if (distance < bestDistance) {
          best = area;
          bestDistance = distance;
        }
      });
      return bestDistance <= best.radius ? best : fallback;
    }

    function renderEconomy() {
      var rows = (state.data.database && state.data.database.itemEconomy) || [];
      document.getElementById("item-total").textContent = rows.length + " item types";
      document.getElementById("items").innerHTML =
        '<thead><tr><th>Item</th><th class="num">Count</th><th class="num">Holders</th><th class="num">Chain</th><th>Updated</th></tr></thead><tbody>' +
        rows.map(function(row) {
          return '<tr><td>' + itemMini(row.itemId) + '</td><td class="num">' + n(row.totalCount) + '</td><td class="num">' + n(row.holders) + '</td><td class="num">' + n(row.chainRows) + '</td><td class="nowrap">' + esc(time(row.lastUpdatedAt)) + '</td></tr>';
        }).join("") + '</tbody>';
    }

    function itemMini(id) {
      var def = catalogItem(id);
      return '<div style="display:flex;gap:8px;align-items:center"><span class="item-icon" style="width:24px;height:24px;background:' + esc(def.iconColor) + '"></span><div><b>' + esc(def.name || id) + '</b><div class="muted">' + esc(id) + '</div></div></div>';
    }

    function renderQuests() {
      var rows = (state.data.database && state.data.database.questProgress) || [];
      document.getElementById("quest-total").textContent = rows.length + " rows";
      document.getElementById("quests").innerHTML =
        '<thead><tr><th>Quest</th><th>Status</th><th class="num">Players</th><th>Progress</th><th>Updated</th></tr></thead><tbody>' +
        rows.map(function(row) {
          return '<tr><td><b>' + esc(row.title) + '</b><div class="muted">' + esc(row.questId) + '</div></td><td><span class="pill">' + esc(row.status) + '</span></td><td class="num">' + n(row.characters) + '</td><td><div class="bar-track"><div class="bar-fill" style="width:' + pct(row.totalProgress, row.totalRequired) + '%"></div></div><div class="muted">' + n(row.totalProgress) + ' / ' + n(row.totalRequired) + '</div></td><td class="nowrap">' + esc(time(row.lastUpdatedAt)) + '</td></tr>';
        }).join("") + '</tbody>';
    }

    function renderAnalytics() {
      var analytics = (state.data.database && state.data.database.analytics) || { totals: {}, byType: [], hourly: [], recent: [] };
      document.getElementById("analytics-total").textContent = n(analytics.totals.events || 0) + " events / 7d";
      var max = Math.max(1, ...analytics.hourly.map(function(row) { return row.events; }));
      var spark = '<div class="spark">' + analytics.hourly.map(function(row) {
        return '<span title="' + esc(row.bucket + " · " + row.events) + '" style="height:' + Math.max(3, pct(row.events, max)) + '%"></span>';
      }).join("") + '</div>';
      var byType = '<div class="scroll" style="max-height:230px"><table><thead><tr><th>Event</th><th class="num">Events</th><th class="num">Sessions</th><th>Last</th></tr></thead><tbody>' +
        analytics.byType.map(function(row) {
          return '<tr><td>' + esc(row.eventType) + '</td><td class="num">' + n(row.events) + '</td><td class="num">' + n(row.sessions) + '</td><td class="nowrap">' + esc(time(row.lastEventAt)) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
      var recent = '<h3>Recent</h3><div class="scroll" style="max-height:220px"><table><thead><tr><th>Time</th><th>Event</th><th>Player</th></tr></thead><tbody>' +
        analytics.recent.map(function(row) {
          return '<tr><td class="nowrap">' + esc(time(row.createdAt)) + '</td><td>' + esc(row.eventType) + '</td><td>' + esc(row.characterName || row.identityType || row.sessionId) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
      document.getElementById("analytics").innerHTML = spark + '<div style="height:10px"></div>' + byType + '<div style="height:12px"></div>' + recent;
    }

    function renderSeasonPurchases() {
      var season = (state.data.database && state.data.database.seasonLeaderboard) || [];
      var purchases = (state.data.database && state.data.database.purchaseSummary) || [];
      document.getElementById("season-total").textContent = season.length + " wallets · " + purchases.length + " purchase rows";
      document.getElementById("season").innerHTML =
        '<thead><tr><th>Wallet</th><th class="num">Pts</th><th class="num">Pending</th><th class="num">Approved</th></tr></thead><tbody>' +
        season.map(function(row) {
          return '<tr><td><b>' + esc(row.characterName || row.displayName || shortWallet(row.walletAddress)) + '</b><div class="mono muted">' + esc(shortWallet(row.walletAddress)) + '</div></td><td class="num">' + n(row.totalPoints) + '</td><td class="num">' + n(row.pendingPoints) + '</td><td class="num">' + n(row.approvedPoints + row.distributedPoints) + '</td></tr>';
        }).join("") + '</tbody>';
      document.getElementById("purchases").innerHTML =
        '<thead><tr><th>Product</th><th>Status</th><th class="num">Events</th><th class="num">Wallets</th></tr></thead><tbody>' +
        purchases.map(function(row) {
          return '<tr><td><b>' + esc(row.productId) + '</b><div class="muted">' + esc(row.paymentToken) + '</div></td><td>' + esc(row.status) + '<div class="muted">' + esc(row.source) + '</div></td><td class="num">' + n(row.events) + '</td><td class="num">' + n(row.wallets) + '</td></tr>';
        }).join("") + '</tbody>';
    }

    function renderInvites() {
      var invites = (state.data.database && state.data.database.invites) || { summary: {}, codes: [] };
      var summary = invites.summary || {};
      var rows = invites.codes || [];
      var openRows = rows.filter(function(row) { return !row.claimedAt; });
      var openCount = summary.open != null ? summary.open : openRows.length;
      document.getElementById("invite-total").textContent = n(openCount) + " open · " + n(summary.claimed) + " claimed · " + n(summary.total) + " total";

      var copyAll = document.getElementById("copy-open-invites");
      copyAll.disabled = openRows.length === 0;
      copyAll.onclick = function() {
        var links = openRows.map(function(row) { return inviteUrl(row.code); }).join("\\n");
        copyText(links, "Copied " + openRows.length + " open invite URLs");
      };

      document.getElementById("invites").innerHTML =
        '<thead><tr><th>Status</th><th>Invite</th><th>Wallet</th><th>Created</th><th>Claimed</th><th>Last login</th></tr></thead><tbody>' +
        rows.map(function(row) {
          var claimed = Boolean(row.claimedAt);
          var statusClass = claimed ? "good" : "warn";
          var statusText = claimed ? "claimed" : "open";
          var url = inviteUrl(row.code);
          return '<tr><td><span class="pill ' + statusClass + '">' + statusText + '</span></td>' +
            '<td><div class="mono invite-code">' + esc(row.code) + '</div><div class="mono invite-url">' + esc(url) + '</div>' +
            '<div class="copy-row"><button class="copy-button" type="button" data-copy-text="' + esc(row.code) + '" data-copy-label="Copied invite code">Copy code</button>' +
            '<button class="copy-button" type="button" data-copy-text="' + esc(url) + '" data-copy-label="Copied invite URL">Copy URL</button></div></td>' +
            '<td class="mono">' + esc(shortWallet(row.claimedWalletAddress)) + '</td>' +
            '<td class="nowrap">' + esc(time(row.createdAt)) + '</td>' +
            '<td class="nowrap">' + esc(time(row.claimedAt)) + '</td>' +
            '<td class="nowrap">' + esc(time(row.lastUsedAt)) + '</td></tr>';
        }).join("") + '</tbody>';

      document.querySelectorAll("[data-copy-text]").forEach(function(button) {
        button.addEventListener("click", function() {
          copyText(button.getAttribute("data-copy-text") || "", button.getAttribute("data-copy-label") || "Copied");
        });
      });
    }

    function shortWallet(wallet) {
      if (!wallet) return "";
      wallet = String(wallet);
      if (wallet.length <= 14) return wallet;
      return wallet.slice(0, 6) + "..." + wallet.slice(-4);
    }

    function renderDbStatus() {
      var db = state.data.database || {};
      var pill = document.getElementById("db-status");
      if (!db.configured) {
        pill.className = "pill warn";
        pill.textContent = "DB off";
      } else if (db.partial) {
        pill.className = "pill warn";
        pill.textContent = "DB partial";
      } else if (!db.ok) {
        pill.className = "pill bad";
        pill.textContent = "DB error";
      } else {
        pill.className = "pill good";
        pill.textContent = "DB ok";
      }
      if (db.error) {
        document.getElementById("raw").textContent = db.error + "\\n\\n" + JSON.stringify(state.data, null, 2);
      } else {
        document.getElementById("raw").textContent = JSON.stringify(state.data, null, 2);
      }
    }

    function render() {
      if (!state.data) return;
      document.getElementById("timestamp").textContent = "Generated " + time(state.data.generatedAt) + " · server uptime " + duration(state.data.server.uptimeMs);
      renderDbStatus();
      renderKpis();
      renderAreas();
      renderPlayers();
      renderPlayerDetail();
      renderNpcs();
      renderEconomy();
      renderQuests();
      renderAnalytics();
      renderSeasonPurchases();
      renderInvites();
    }

    async function refresh() {
      try {
        var response = await fetch("/admin/data?ts=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        state.data = await response.json();
        document.getElementById("status-dot").style.background = "var(--good)";
        render();
      } catch (error) {
        document.getElementById("status-dot").style.background = "var(--bad)";
        document.getElementById("timestamp").textContent = "Refresh failed: " + error.message;
      }
    }

    refresh();
    setInterval(refresh, ${ADMIN_REFRESH_MS});
  </script>
</body>
</html>`;
}

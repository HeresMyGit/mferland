#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;

const { values } = parseArgs({
  options: {
    days: { type: "string", default: String(DEFAULT_DAYS) },
    format: { type: "string", default: "json" },
    help: { type: "boolean", default: false },
    "out-dir": { type: "string" },
    pretty: { type: "boolean", default: false },
    table: { type: "string" },
  },
});

if (values.help) {
  printUsage();
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Example: npm run fishing:analytics:report -- --days 7 --pretty");
  process.exit(1);
}

const days = normalizeDays(values.days);
const end = new Date();
const start = new Date(end.getTime() - days * 86_400_000);
const format = String(values.format || "json").toLowerCase();
const outDir = values["out-dir"] ? resolve(String(values["out-dir"])) : "";
const table = values.table ? normalizeTableName(String(values.table)) : "";

const db = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 10,
  connect_timeout: 10,
});

try {
  const report = await buildReport(db, { start, end, days });
  if (outDir) await writeReportFiles(outDir, report);
  if (format === "json") {
    console.log(JSON.stringify(report, null, values.pretty ? 2 : 0));
  } else if (format === "csv") {
    const rows = table ? getTableRows(report, table) : getTableRows(report, "hourly_events");
    console.log(rowsToCsv(rows));
  } else {
    throw new Error(`Unsupported format "${format}". Use json or csv.`);
  }
} finally {
  await db.end({ timeout: 5 });
}

async function buildReport(sql, { start, end, days }) {
  const [
    summaryRows,
    hourlyEvents,
    dailyEvents,
    reelOutcomes,
    itemOutcomes,
    nftStatus,
    nftDaily,
    nftCollections,
    notices,
    rodMintFunnel,
    fishSales,
    fishingSupply,
    mintClubRedemptions,
    claimLatencyRows,
  ] = await Promise.all([
    sql`
      SELECT
        count(*) FILTER (WHERE event_type = 'fishing_started')::int AS casts_started,
        count(*) FILTER (WHERE event_type = 'fishing_reel')::int AS reels_completed,
        count(*) FILTER (WHERE event_type = 'fishing_loot_collected')::int AS loot_pickups,
        count(*) FILTER (WHERE event_type = 'fishing_reel' AND properties->>'outcome' = 'caught')::int AS fish_caught,
        count(*) FILTER (WHERE event_type = 'fishing_reel' AND properties->>'outcome' = 'junk')::int AS junk_caught,
        count(*) FILTER (WHERE event_type = 'fishing_reel' AND properties->>'outcome' = 'missed')::int AS missed_reels,
        count(*) FILTER (WHERE event_type = 'fishing_reel' AND properties->>'outcome' = 'nft')::int AS nft_reel_hits,
        count(*) FILTER (WHERE event_type = 'fishing_nft_notice_sent')::int AS nft_notices_sent,
        count(*) FILTER (WHERE event_type = 'onchain_fishing_rod_mint_confirmed')::int AS rod_mints_confirmed,
        count(DISTINCT NULLIF(session_id, '')) FILTER (WHERE event_type IN ('fishing_started', 'fishing_reel', 'fishing_loot_collected'))::int AS fishing_sessions,
        count(DISTINCT NULLIF(wallet_hash, '')) FILTER (WHERE event_type IN ('fishing_started', 'fishing_reel', 'fishing_loot_collected'))::int AS fishing_wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
    `,
    sql`
      SELECT
        to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00"Z"') AS bucket,
        event_type,
        count(*)::int AS events,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND (
          event_type LIKE 'fishing_%'
          OR event_type LIKE 'onchain_fishing_rod_%'
          OR event_type LIKE 'mint_club_redemption_%'
        )
      GROUP BY bucket, event_type
      ORDER BY bucket ASC, event_type ASC
    `,
    sql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        event_type,
        count(*)::int AS events,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND (
          event_type LIKE 'fishing_%'
          OR event_type LIKE 'onchain_fishing_rod_%'
          OR event_type LIKE 'mint_club_redemption_%'
        )
      GROUP BY day, event_type
      ORDER BY day ASC, event_type ASC
    `,
    sql`
      SELECT
        coalesce(nullif(properties->>'outcome', ''), 'unknown') AS outcome,
        CASE WHEN properties->>'isAgent' = 'true' THEN 'agent' ELSE 'human' END AS player_kind,
        count(*)::int AS reels,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type = 'fishing_reel'
      GROUP BY outcome, player_kind
      ORDER BY reels DESC, outcome ASC, player_kind ASC
    `,
    sql`
      SELECT
        coalesce(nullif(properties->>'itemId', ''), 'unknown') AS item_id,
        max(nullif(properties->>'itemName', '')) AS item_name,
        coalesce(nullif(properties->>'outcome', ''), 'unknown') AS outcome,
        CASE WHEN properties->>'isAgent' = 'true' THEN 'agent' ELSE 'human' END AS player_kind,
        count(*)::int AS events,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type = 'fishing_reel'
        AND coalesce(nullif(properties->>'itemId', ''), '') <> ''
      GROUP BY item_id, outcome, player_kind
      ORDER BY events DESC, item_id ASC
    `,
    sql`
      SELECT
        status,
        token_standard,
        count(*)::int AS catches,
        count(DISTINCT wallet_address)::int AS wallets,
        count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed,
        count(*) FILTER (WHERE tx_submitted_at IS NOT NULL)::int AS tx_submitted,
        max(updated_at) AS last_updated_at
      FROM fishing_pond_catches
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY status, token_standard
      ORDER BY catches DESC, status ASC, token_standard ASC
    `,
    sql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        status,
        count(*)::int AS catches,
        count(DISTINCT wallet_address)::int AS wallets
      FROM fishing_pond_catches
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY day, status
      ORDER BY day ASC, status ASC
    `,
    sql`
      SELECT
        collection_address,
        token_standard,
        coalesce(nullif(metadata_name, ''), token_id) AS display_name,
        count(*)::int AS catches,
        count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
        count(DISTINCT token_id)::int AS token_ids,
        count(DISTINCT wallet_address)::int AS wallets,
        max(created_at) AS last_caught_at
      FROM fishing_pond_catches
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY collection_address, token_standard, display_name
      ORDER BY catches DESC, confirmed DESC, collection_address ASC
    `,
    sql`
      SELECT
        coalesce(nullif(properties->>'noticeKind', ''), 'unknown') AS notice_kind,
        CASE WHEN properties->>'isAgent' = 'true' THEN 'agent' ELSE 'human' END AS player_kind,
        count(*)::int AS notices,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type = 'fishing_nft_notice_sent'
      GROUP BY notice_kind, player_kind
      ORDER BY notices DESC, notice_kind ASC, player_kind ASC
    `,
    sql`
      SELECT
        event_type,
        coalesce(nullif(properties->>'mintMode', ''), 'unknown') AS mint_mode,
        coalesce(nullif(properties->>'stage', ''), '') AS stage,
        count(*)::int AS events,
        count(DISTINCT NULLIF(session_id, ''))::int AS sessions,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets,
        max(created_at) AS last_event_at
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type LIKE 'onchain_fishing_rod_mint_%'
      GROUP BY event_type, mint_mode, stage
      ORDER BY event_type ASC, events DESC
    `,
    sql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        count(*)::int AS sales,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets,
        coalesce(sum(CASE WHEN properties->>'quantity' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (properties->>'quantity')::numeric ELSE 0 END), 0)::float AS quantity,
        coalesce(sum(CASE WHEN properties->>'points' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (properties->>'points')::numeric ELSE 0 END), 0)::float AS points
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type = 'fishing_vendor_sell_confirmed'
      GROUP BY day
      ORDER BY day ASC
    `,
    sql`
      SELECT
        event_type,
        coalesce(nullif(properties->>'itemId', ''), 'unknown') AS item_id,
        count(*)::int AS events,
        count(DISTINCT NULLIF(wallet_hash, ''))::int AS wallets,
        max(created_at) AS last_event_at
      FROM analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND event_type LIKE 'fishing_supply_purchase_%'
      GROUP BY event_type, item_id
      ORDER BY event_type ASC, events DESC
    `,
    sql`
      SELECT
        coalesce(nullif(mint_club_redemption_status, ''), 'not_started') AS status,
        count(*)::int AS catches,
        count(DISTINCT wallet_address)::int AS wallets,
        max(updated_at) AS last_updated_at
      FROM fishing_pond_catches
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY status
      ORDER BY catches DESC, status ASC
    `,
    sql`
      SELECT
        count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed_claims,
        coalesce(avg(extract(epoch FROM confirmed_at - created_at)) FILTER (WHERE confirmed_at IS NOT NULL), 0)::float AS avg_seconds_to_claim,
        coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM confirmed_at - created_at)) FILTER (WHERE confirmed_at IS NOT NULL), 0)::float AS median_seconds_to_claim,
        coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM confirmed_at - created_at)) FILTER (WHERE confirmed_at IS NOT NULL), 0)::float AS p90_seconds_to_claim
      FROM fishing_pond_catches
      WHERE created_at >= ${start}
        AND created_at < ${end}
    `,
  ]);

  const summary = firstRow(summaryRows);
  const claimLatency = firstRow(claimLatencyRows);
  return {
    generated_at: new Date().toISOString(),
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
      days,
    },
    summary,
    claim_latency: claimLatency,
    tables: {
      hourly_events: Array.from(hourlyEvents),
      daily_events: Array.from(dailyEvents),
      reel_outcomes: Array.from(reelOutcomes),
      item_outcomes: Array.from(itemOutcomes),
      nft_status: Array.from(nftStatus),
      nft_daily: Array.from(nftDaily),
      nft_collections: Array.from(nftCollections),
      notices: Array.from(notices),
      rod_mint_funnel: Array.from(rodMintFunnel),
      fish_sales: Array.from(fishSales),
      fishing_supply: Array.from(fishingSupply),
      mint_club_redemptions: Array.from(mintClubRedemptions),
      claim_latency: [claimLatency],
      summary: [summary],
    },
  };
}

async function writeReportFiles(outDir, report) {
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "fishing-analytics-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await Promise.all(Object.entries(report.tables).map(([name, rows]) => (
    writeFile(resolve(outDir, `${name}.csv`), rowsToCsv(rows))
  )));
}

function getTableRows(report, name) {
  const rows = report.tables[name];
  if (!rows) {
    throw new Error(`Unknown table "${name}". Options: ${Object.keys(report.tables).sort().join(", ")}`);
  }
  return rows;
}

function rowsToCsv(rows) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (keys.length === 0) return "\n";
  const lines = [
    keys.map(csvCell).join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function firstRow(rows) {
  return Array.from(rows)[0] ?? {};
}

function normalizeDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(parsed)));
}

function normalizeTableName(value) {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function printUsage() {
  console.log(`Fishing analytics report

Usage:
  npm run fishing:analytics:report -- --days 7 --pretty
  npm run fishing:analytics:report -- --days 7 --out-dir ./tmp/fishing-analytics
  npm run fishing:analytics:report -- --format csv --table reel_outcomes

Options:
  --days <n>       Lookback window in days. Default: ${DEFAULT_DAYS}
  --format <type>  json or csv. Default: json
  --table <name>   CSV table name. Default for csv: hourly_events
  --out-dir <dir>  Also write JSON plus one CSV per table
  --pretty         Pretty-print JSON
`);
}

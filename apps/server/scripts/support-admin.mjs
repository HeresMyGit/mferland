import { parseArgs } from "node:util";
import postgres from "postgres";

const DEFAULT_SEASON_ID = "season-0";
const VALID_REWARD_STATUSES = new Set(["pending", "approved", "rejected", "distributed"]);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    id: { type: "string" },
    limit: { type: "string", default: "50" },
    note: { type: "string", default: "" },
    season: { type: "string", default: DEFAULT_SEASON_ID },
    status: { type: "string" },
    wallet: { type: "string" },
  },
});

const command = positionals[0] ?? "";

if (values.help || !command) {
  printHelp();
  process.exit(values.help ? 0 : 1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  switch (command) {
    case "wallet":
      await printWallet(values.wallet);
      break;
    case "season-summary":
      await printSeasonSummary(values.season);
      break;
    case "season-list":
      await printSeasonList({
        limit: parseLimit(values.limit),
        seasonId: values.season,
        status: values.status,
        wallet: values.wallet,
      });
      break;
    case "season-export":
      await exportSeasonRewards({
        seasonId: values.season,
        status: values.status ?? "approved",
      });
      break;
    case "season-set-status":
      await setSeasonRewardStatus({
        id: values.id,
        note: values.note,
        status: values.status,
      });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function printWallet(wallet) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) fail("Pass --wallet 0x...");

  const [account] = await sql`
    SELECT
      aw.wallet_address,
      aw.account_id,
      a.display_name,
      c.id AS character_id,
      c.name AS character_name,
      c.level,
      c.xp,
      c.talent_points
    FROM account_wallets aw
    JOIN accounts a ON a.id = aw.account_id
    LEFT JOIN characters c ON c.account_id = a.id
    WHERE aw.wallet_address = ${normalizedWallet}
    LIMIT 1
  `;

  if (!account) {
    console.log(`No wallet account found for ${normalizedWallet}`);
    return;
  }

  const [inventory] = await sql`
    SELECT count(*)::int AS rows, coalesce(sum(count), 0)::int AS items
    FROM character_inventory
    WHERE character_id = ${account.character_id}
  `;
  const [equipment] = await sql`
    SELECT count(*)::int AS slots
    FROM character_equipment
    WHERE character_id = ${account.character_id}
  `;
  const [rewards] = await sql`
    SELECT
      coalesce(sum(points) FILTER (WHERE status = 'pending'), 0)::int AS pending,
      coalesce(sum(points) FILTER (WHERE status = 'approved'), 0)::int AS approved,
      coalesce(sum(points) FILTER (WHERE status = 'rejected'), 0)::int AS rejected,
      coalesce(sum(points) FILTER (WHERE status = 'distributed'), 0)::int AS distributed
    FROM season_reward_events
    WHERE wallet_address = ${normalizedWallet}
  `;

  console.log(JSON.stringify({
    wallet: account.wallet_address,
    accountId: account.account_id,
    displayName: account.display_name,
    character: {
      id: account.character_id,
      name: account.character_name,
      level: account.level,
      xp: account.xp,
      talentPoints: account.talent_points,
    },
    inventory,
    equipment,
    seasonRewards: rewards,
  }, null, 2));
}

async function printSeasonSummary(seasonId) {
  const rows = await sql`
    SELECT
      status,
      count(*)::int AS events,
      coalesce(sum(points), 0)::int AS points,
      count(DISTINCT wallet_address)::int AS wallets
    FROM season_reward_events
    WHERE season_id = ${seasonId}
    GROUP BY status
    ORDER BY status
  `;
  console.table(rows);
}

async function printSeasonList({ limit, seasonId, status, wallet }) {
  const normalizedWallet = normalizeWallet(wallet);
  const rows = await sql`
    SELECT id, season_id, wallet_address, source_type, source_id, points, status, note, created_at
    FROM season_reward_events
    WHERE season_id = ${seasonId}
      AND (${status ?? ""} = '' OR status = ${status ?? ""})
      AND (${normalizedWallet ?? ""} = '' OR wallet_address = ${normalizedWallet ?? ""})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  console.table(rows);
}

async function exportSeasonRewards({ seasonId, status }) {
  if (!VALID_REWARD_STATUSES.has(status)) fail(`Invalid status: ${status}`);
  const rows = await sql`
    SELECT wallet_address, sum(points)::int AS points
    FROM season_reward_events
    WHERE season_id = ${seasonId}
      AND status = ${status}
    GROUP BY wallet_address
    ORDER BY points DESC, wallet_address ASC
  `;

  console.log("wallet_address,points");
  for (const row of rows) {
    console.log(`${escapeCsv(row.wallet_address)},${row.points}`);
  }
}

async function setSeasonRewardStatus({ id, note, status }) {
  if (!id) fail("Pass --id <reward_event_id>");
  if (!status || !VALID_REWARD_STATUSES.has(status)) fail("Pass --status pending|approved|rejected|distributed");

  const timestampColumn = status === "distributed" ? "distributed_at" : "reviewed_at";
  const [updated] = await sql`
    UPDATE season_reward_events
    SET
      status = ${status},
      note = CASE WHEN ${note ?? ""} = '' THEN note ELSE ${note ?? ""} END,
      reviewed_at = CASE WHEN ${timestampColumn} = 'reviewed_at' THEN now() ELSE reviewed_at END,
      distributed_at = CASE WHEN ${timestampColumn} = 'distributed_at' THEN now() ELSE distributed_at END
    WHERE id = ${id}
    RETURNING id, wallet_address, points, status, note
  `;

  if (!updated) fail(`No reward event found for id ${id}`);
  console.log(JSON.stringify(updated, null, 2));
}

function parseLimit(value) {
  const limit = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return 50;
  return limit;
}

function normalizeWallet(wallet) {
  if (!wallet) return "";
  const normalized = wallet.toLowerCase().trim();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  npm run support:admin -- wallet --wallet 0x...
  npm run support:admin -- season-summary [--season season-0]
  npm run support:admin -- season-list [--status pending] [--wallet 0x...] [--limit 50]
  npm run support:admin -- season-export [--status approved]
  npm run support:admin -- season-set-status --id <id> --status approved|rejected|distributed [--note "..."]`);
}

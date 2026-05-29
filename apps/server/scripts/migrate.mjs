import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}
if (process.env.MFERLAND_LOCAL_ONLY === "1" || process.env.MFERLAND_AGENT_LOCAL_ONLY === "1") {
  assertLocalDatabaseUrl(databaseUrl);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS mferland_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const [applied] = await sql`
      SELECT 1
      FROM mferland_migrations
      WHERE name = ${file}
      LIMIT 1
    `;
    if (applied) {
      console.log(`Already applied ${file}`);
      continue;
    }

    const contents = await readFile(join(migrationsDir, file), "utf8");
    const statements = contents
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`
        INSERT INTO mferland_migrations (name)
        VALUES (${file})
      `;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}

function assertLocalDatabaseUrl(value) {
  const productionPattern = /game\.mfergpt\.lol|neon\.tech/i;
  if (productionPattern.test(value)) {
    console.error("DATABASE_URL appears to target production; refusing local-only migration.");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error("DATABASE_URL must be a valid postgres URL for local-only migration.");
    process.exit(1);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(hostname)) {
    console.error(`DATABASE_URL host ${parsed.hostname} is not local; refusing local-only migration.`);
    process.exit(1);
  }
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { assertLocalOnlyRuntimeSafety } from "../localSafety.js";

let sqlClient: postgres.Sql | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  assertLocalOnlyRuntimeSafety();

  if (!database) {
    sqlClient = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    database = drizzle(sqlClient, { schema });
  }

  return database;
}

export async function closeDatabase() {
  await sqlClient?.end({ timeout: 5 });
  sqlClient = null;
  database = null;
}

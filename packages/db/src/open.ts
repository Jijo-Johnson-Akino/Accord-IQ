import { loadConfig } from "@accordiq/core";
import { createDb, createSqliteClient } from "./client";
import { applyMigrationsToClient } from "./migrate";

/** Open a SQLite connection, apply pending migrations, and keep foreign keys on. */
export async function openDatabase(databaseUrl = loadConfig().DATABASE_URL) {
  const client = createSqliteClient(databaseUrl);
  await applyMigrationsToClient(client);
  return createDb(client);
}

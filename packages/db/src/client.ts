import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client/node";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { loadConfig, type AppConfig } from "@accordiq/core";
import { findWorkspaceRoot } from "./paths";
import { schema } from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

function sqliteUrl(databaseUrl: string, root: string): string {
  if (databaseUrl === ":memory:") return ":memory:";
  if (!databaseUrl.startsWith("file:")) return databaseUrl;
  const raw = databaseUrl.slice("file:".length);
  const filePath = isAbsolute(raw) ? raw : join(root, raw);
  mkdirSync(dirname(filePath), { recursive: true });
  return pathToFileURL(filePath).href;
}

export function createSqliteClient(databaseUrl: string, root = findWorkspaceRoot()): Client {
  return createClient({ url: sqliteUrl(databaseUrl, root) });
}

/**
 * Temp-file SQLite for tests that use drizzle transactions. libsql opens a new connection after
 * `client.transaction()`; a plain `:memory:` URL would then be an empty database.
 */
export function createTempSqliteClient(): Client {
  const dir = mkdtempSync(join(tmpdir(), "accordiq-"));
  return createClient({ url: pathToFileURL(join(dir, "accordiq.sqlite")).href });
}

export function createDb(client: Client): Database {
  return drizzle(client, { schema });
}

let cached: { db: Database; configKey: string } | null = null;

/** Process-wide database used by the web app. Tests should call `createDb` instead. */
export function getDb(config: AppConfig = loadConfig()): Database {
  const key = `${config.DATABASE_URL}::${findWorkspaceRoot()}`;
  if (cached && cached.configKey === key) return cached.db;
  const client = createSqliteClient(config.DATABASE_URL);
  const db = createDb(client);
  cached = { db, configKey: key };
  return db;
}

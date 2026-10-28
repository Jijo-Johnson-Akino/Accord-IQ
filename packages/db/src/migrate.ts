import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { loadConfig } from "@accordiq/core";
import { createSqliteClient } from "./client";
import { dbPackageRoot } from "./paths";

const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/i;

export function listMigrationFiles(root = dbPackageRoot()): { id: string; path: string }[] {
  const dir = join(root, "drizzle");
  return readdirSync(dir)
    .map((file) => {
      const match = MIGRATION_FILE.exec(file);
      if (!match?.[1]) return null;
      return { id: match[1], path: join(dir, file) };
    })
    .filter((entry): entry is { id: string; path: string } => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function appliedIds(rows: Record<string, unknown>[]): Set<string> {
  return new Set(rows.map((row) => String(row.id ?? row[0] ?? "")).filter((id) => id.length > 0));
}

/** Split hand-written SQL files on `;`. Statements are simple (no `;` inside strings). */
export function sqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) =>
      part
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("--"))
        .join("\n"),
    )
    .filter((part) => part.length > 0);
}

async function rollbackQuietly(client: Client): Promise<void> {
  try {
    await client.execute("ROLLBACK");
  } catch {
    // SQLite may already have aborted the transaction when a statement failed.
  }
}

/**
 * Apply versioned SQL in order. Never drops data. An existing Phase 4 database is recognized
 * (user table present, no schema_migration row) and 0001 is recorded as already applied.
 */
export async function applyMigrationsToClient(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const userTable = await client.execute(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'user'",
  );
  const appliedResult = await client.execute("SELECT id FROM schema_migration");
  const applied = appliedIds(appliedResult.rows as Record<string, unknown>[]);

  if (userTable.rows.length > 0 && !applied.has("0001_identity")) {
    await client.execute({
      sql: "INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)",
      args: ["0001_identity", Date.now()],
    });
    applied.add("0001_identity");
  }

  for (const migration of listMigrationFiles()) {
    if (applied.has(migration.id)) continue;
    const statements = sqlStatements(readFileSync(migration.path, "utf8"));
    // SQLite/libsql may implicitly commit DDL, so do not wrap files in BEGIN/COMMIT.
    try {
      for (const statement of statements) {
        await client.execute(statement);
      }
      await client.execute({
        sql: "INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)",
        args: [migration.id, Date.now()],
      });
    } catch (error) {
      await rollbackQuietly(client);
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Migration ${migration.id} failed: ${detail}`, { cause: error });
    }
  }
}

export async function applyMigrations(databaseUrl = loadConfig().DATABASE_URL): Promise<void> {
  const client = createSqliteClient(databaseUrl);
  await applyMigrationsToClient(client);
}

const invokedDirectly = process.argv[1]?.includes("migrate.ts");
if (invokedDirectly) {
  applyMigrations()
    .then(() => {
      console.log("Migrations applied.");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Migration failed.");
      process.exit(1);
    });
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "./client";
import { applyMigrationsToClient, listMigrationFiles, sqlStatements } from "./migrate";

describe("migrations", () => {
  it("splits SQL files into executable statements", () => {
    const statements = sqlStatements(`
-- heading
ALTER TABLE audit_event ADD COLUMN entity_type TEXT;
CREATE TABLE vendor (id TEXT PRIMARY KEY);
`);
    expect(statements).toEqual([
      "ALTER TABLE audit_event ADD COLUMN entity_type TEXT",
      "CREATE TABLE vendor (id TEXT PRIMARY KEY)",
    ]);
  });

  it("lists versioned SQL in order", () => {
    const files = listMigrationFiles();
    const ids = files.map((file) => file.id);
    expect(ids[0]).toBe("0001_identity");
    expect(ids).toContain("0002_contract_foundation");
    expect(ids).toContain("0003_contract_repository");
    expect(ids).toContain("0004_ai_intelligence");
    expect(ids).toContain("0005_risk_and_clauses");
    expect(ids).toContain("0006_approval_workflows");
    expect(ids).toContain("0007_esignature");
    expect(ids).toContain("0008_obligations_renewals");
    expect(ids).toContain("0009_financial_intelligence");
    expect(ids).toContain("0010_ai_assistant");
    expect(ids).toContain("0011_notifications_integrations");
    expect([...ids].sort()).toEqual(ids);
    const foundation = files.find((file) => file.id === "0002_contract_foundation");
    expect(foundation).toBeTruthy();
    const statements = sqlStatements(readFileSync(foundation!.path, "utf8"));
    expect(statements.some((sql) => sql.startsWith("CREATE TABLE contract"))).toBe(true);
  });

  it("applies twice without resetting data", async () => {
    const client = createSqliteClient(":memory:");
    await applyMigrationsToClient(client);
    await client.execute({
      sql: "INSERT INTO organization (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: ["org_keep", "Keep", "keep", Date.now(), Date.now()],
    });
    await applyMigrationsToClient(client);
    const rows = await client.execute("SELECT slug FROM organization");
    expect(rows.rows).toHaveLength(1);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contract'",
    );
    expect(tables.rows).toHaveLength(1);
  });

  it("does not re-run 0001 on a pre-existing identity database", async () => {
    const client = createSqliteClient(":memory:");
    await client.execute(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, platform_role TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )
    `);
    await client.execute(
      `CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    );
    await client.execute(
      `CREATE TABLE audit_event (id TEXT PRIMARY KEY, organization_id TEXT, actor_user_id TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    );
    await applyMigrationsToClient(client);
    const applied = await client.execute("SELECT id FROM schema_migration ORDER BY id");
    const ids = applied.rows.map((row) => String((row as unknown as { id: string }).id));
    expect(ids).toContain("0001_identity");
    expect(ids).toContain("0002_contract_foundation");
    expect(ids).toContain("0003_contract_repository");
    expect(ids).toContain("0004_ai_intelligence");
    expect(ids).toContain("0005_risk_and_clauses");
    expect(ids).toContain("0006_approval_workflows");
    expect(ids).toContain("0007_esignature");
    expect(ids).toContain("0008_obligations_renewals");
    expect(ids).toContain("0009_financial_intelligence");
    expect(ids).toContain("0010_ai_assistant");
    expect(ids).toContain("0011_notifications_integrations");
    const cols = await client.execute("PRAGMA table_info(audit_event)");
    const names = cols.rows.map((row) => String((row as unknown as { name: string }).name));
    expect(names).toContain("entity_type");
  });
});

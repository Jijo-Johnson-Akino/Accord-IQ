import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createAuthHarness, SEED } from "@accordiq/auth";
import {
  applyMigrationsToClient,
  clauseTemplate,
  createSqliteClient,
  listMigrationFiles,
  vendor,
} from "@accordiq/db";
import { CLM_SEED, seedClm } from "./seed";

describe("CLM seed", () => {
  it("loads the contract foundation migration from the db package", () => {
    expect(listMigrationFiles().map((file) => file.id)).toContain("0002_contract_foundation");
    expect(listMigrationFiles().map((file) => file.id)).toContain("0003_contract_repository");
    expect(listMigrationFiles().map((file) => file.id)).toContain("0004_ai_intelligence");
    expect(listMigrationFiles().map((file) => file.id)).toContain("0005_risk_and_clauses");
    expect(listMigrationFiles().map((file) => file.id)).toContain("0006_approval_workflows");
  });

  it("applies CLM tables on an in-memory database from this package", async () => {
    const client = createSqliteClient(":memory:");
    await applyMigrationsToClient(client);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.rows.map((row) => String((row as unknown as { name: string }).name));
    expect(names).toContain("vendor");
    expect(names).toContain("contract");
    expect(names).toContain("contract_relation");
    expect(names).toContain("extraction_run");
    expect(names).toContain("risk_policy");
    expect(names).toContain("risk_finding");
    expect(names).toContain("clause_template");
    expect(names).toContain("clause_version");
    expect(names).toContain("approval_comment");
    expect(names).toContain("approval_event");
  });

  it("is idempotent and does not delete existing rows", async () => {
    const { db } = await createAuthHarness();
    await seedClm(db);
    await seedClm(db);
    const vendors = await db
      .select()
      .from(vendor)
      .where(eq(vendor.organizationId, SEED.organizations.northwind.id));
    expect(vendors.some((row) => row.id === CLM_SEED.vendors.northwindAcme.id)).toBe(true);
    expect(vendors.filter((row) => row.id === CLM_SEED.vendors.northwindAcme.id)).toHaveLength(1);
    const clauses = await db
      .select()
      .from(clauseTemplate)
      .where(eq(clauseTemplate.organizationId, SEED.organizations.northwind.id));
    expect(
      clauses.filter((row) => row.id === CLM_SEED.clauses.northwindConfidentiality.id),
    ).toHaveLength(1);
  });
});

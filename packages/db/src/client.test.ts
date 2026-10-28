import { describe, expect, it } from "vitest";
import { applySqliteDdl } from "./ddl";
import { createDb, createSqliteClient, createTempSqliteClient } from "./client";
import { contract, organization } from "./schema";

describe("sqlite client", () => {
  it("applies schema and can insert a tenant row", async () => {
    const client = createSqliteClient(":memory:");
    await applySqliteDdl(client);
    const db = createDb(client);
    await db.insert(organization).values({
      id: "org_test",
      name: "Test",
      slug: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const rows = await db.select().from(organization);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("test");
  });

  it("keeps CLM tables visible after a drizzle transaction", async () => {
    const client = createTempSqliteClient();
    await applySqliteDdl(client);
    const db = createDb(client);
    await db.insert(organization).values({
      id: "org_tx",
      name: "Tx",
      slug: "tx",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: "org_tx_inner",
        name: "Inner",
        slug: "tx-inner",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const tables = await db.select({ id: contract.id }).from(contract).limit(1);
    expect(tables).toEqual([]);
    const orgs = await db.select().from(organization);
    expect(orgs).toHaveLength(2);
  });
});

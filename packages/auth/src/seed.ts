import { and, eq } from "drizzle-orm";
import { loadConfig } from "@accordiq/core";
import { hashPassword } from "./password";
import {
  account,
  applySqliteDdl,
  createDb,
  createSqliteClient,
  membership,
  organization,
  tenantRecord,
  user,
  type Database,
} from "@accordiq/db";
import type { OrgRole } from "./policy";

export const SEED = {
  defaultPassword: "Dev-only-passw0rd!",
  organizations: {
    northwind: { id: "org_northwind", name: "Northwind", slug: "northwind" },
    contoso: { id: "org_contoso", name: "Contoso", slug: "contoso" },
  },
  users: {
    superadmin: { id: "user_superadmin", email: "superadmin@accordiq.example", name: "Asha Rao" },
    northwindAdmin: { id: "user_nw_admin", email: "admin@northwind.example", name: "Noah Admin" },
    northwindLegal: { id: "user_nw_legal", email: "legal@northwind.example", name: "Lina Legal" },
    northwindFinance: {
      id: "user_nw_finance",
      email: "finance@northwind.example",
      name: "Farah Finance",
    },
    northwindProcurement: {
      id: "user_nw_procurement",
      email: "procurement@northwind.example",
      name: "Priya Procurement",
    },
    northwindManager: {
      id: "user_nw_manager",
      email: "manager@northwind.example",
      name: "Dev Department",
    },
    northwindViewer: {
      id: "user_nw_viewer",
      email: "viewer@northwind.example",
      name: "Vera Viewer",
    },
    contosoAdmin: { id: "user_co_admin", email: "admin@contoso.example", name: "Cam Admin" },
    contosoViewer: { id: "user_co_viewer", email: "viewer@contoso.example", name: "Casey Viewer" },
  },
  records: {
    northwind: { id: "rec_northwind", title: "Northwind only record" },
    contoso: { id: "rec_contoso", title: "Contoso only record" },
  },
} as const;

function now(): Date {
  return new Date();
}

async function upsertUser(
  db: Database,
  input: { id: string; email: string; name: string; platformRole?: string | null },
  passwordHash: string,
) {
  const existing = await db.query.user.findFirst({ where: eq(user.id, input.id) });
  if (!existing) {
    await db.insert(user).values({
      id: input.id,
      email: input.email,
      name: input.name,
      emailVerified: true,
      platformRole: input.platformRole ?? null,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  const existingAccount = await db.query.account.findFirst({
    where: eq(account.userId, input.id),
  });
  if (!existingAccount) {
    await db.insert(account).values({
      id: `acc_${input.id}`,
      accountId: input.email,
      providerId: "credential",
      userId: input.id,
      password: passwordHash,
      createdAt: now(),
      updatedAt: now(),
    });
  } else {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: now() })
      .where(eq(account.id, existingAccount.id));
  }
}

async function upsertOrg(db: Database, input: { id: string; name: string; slug: string }) {
  const existing = await db.query.organization.findFirst({ where: eq(organization.id, input.id) });
  if (!existing) {
    await db.insert(organization).values({ ...input, createdAt: now(), updatedAt: now() });
  }
}

async function upsertMembership(
  db: Database,
  input: { organizationId: string; userId: string; role: OrgRole },
) {
  const existing = await db.query.membership.findFirst({
    where: and(
      eq(membership.organizationId, input.organizationId),
      eq(membership.userId, input.userId),
    ),
  });
  if (!existing) {
    await db.insert(membership).values({
      id: `mem_${input.organizationId}_${input.userId}`,
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      createdAt: now(),
    });
  }
}

async function upsertRecord(
  db: Database,
  input: { id: string; organizationId: string; title: string; createdByUserId: string },
) {
  const existing = await db.query.tenantRecord.findFirst({
    where: eq(tenantRecord.id, input.id),
  });
  if (!existing) {
    await db.insert(tenantRecord).values({ ...input, createdAt: now() });
  }
}

export async function seedDatabase(
  db: Database,
  password = loadConfig().AUTH_SEED_PASSWORD ?? SEED.defaultPassword,
): Promise<void> {
  if (loadConfig().NODE_ENV === "production") {
    throw new Error("Refusing to seed the production database.");
  }
  const passwordHash = await hashPassword(password);
  const { organizations, users, records } = SEED;

  await upsertOrg(db, organizations.northwind);
  await upsertOrg(db, organizations.contoso);

  await upsertUser(db, { ...users.superadmin, platformRole: "SUPERADMIN" }, passwordHash);
  await upsertUser(db, users.northwindAdmin, passwordHash);
  await upsertUser(db, users.northwindLegal, passwordHash);
  await upsertUser(db, users.northwindFinance, passwordHash);
  await upsertUser(db, users.northwindProcurement, passwordHash);
  await upsertUser(db, users.northwindManager, passwordHash);
  await upsertUser(db, users.northwindViewer, passwordHash);
  await upsertUser(db, users.contosoAdmin, passwordHash);
  await upsertUser(db, users.contosoViewer, passwordHash);

  const nw = organizations.northwind.id;
  const co = organizations.contoso.id;
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindAdmin.id,
    role: "ORGANIZATION_ADMIN",
  });
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindLegal.id,
    role: "LEGAL",
  });
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindFinance.id,
    role: "FINANCE",
  });
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindProcurement.id,
    role: "PROCUREMENT",
  });
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindManager.id,
    role: "DEPARTMENT_MANAGER",
  });
  await upsertMembership(db, {
    organizationId: nw,
    userId: users.northwindViewer.id,
    role: "VIEWER",
  });
  await upsertMembership(db, {
    organizationId: co,
    userId: users.contosoAdmin.id,
    role: "ORGANIZATION_ADMIN",
  });
  await upsertMembership(db, {
    organizationId: co,
    userId: users.contosoViewer.id,
    role: "VIEWER",
  });

  await upsertRecord(db, {
    id: records.northwind.id,
    organizationId: nw,
    title: records.northwind.title,
    createdByUserId: users.northwindAdmin.id,
  });
  await upsertRecord(db, {
    id: records.contoso.id,
    organizationId: co,
    title: records.contoso.title,
    createdByUserId: users.contosoAdmin.id,
  });
}

export async function seedFromEnv(): Promise<void> {
  const config = loadConfig();
  const client = createSqliteClient(config.DATABASE_URL);
  await applySqliteDdl(client);
  const db = createDb(client);
  await seedDatabase(db, config.AUTH_SEED_PASSWORD ?? SEED.defaultPassword);
}

const invokedDirectly = process.argv[1]?.includes("seed.ts");
if (invokedDirectly) {
  seedFromEnv()
    .then(() => {
      console.log("Development seed applied. See README for example accounts.");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Seed failed.");
      process.exit(1);
    });
}

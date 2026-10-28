import { loadConfig } from "@accordiq/core";
import { applySqliteDdl, createDb, createTempSqliteClient } from "@accordiq/db";
import { createAccess } from "./access";
import { createAuth } from "./create-auth";
import { createMemoryMailer } from "./mailer";
import { seedDatabase } from "./seed";

export async function createAuthHarness(password?: string) {
  const client = createTempSqliteClient();
  await applySqliteDdl(client);
  const db = createDb(client);
  const mailer = createMemoryMailer();
  const config = loadConfig({
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: ":memory:",
    AUTH_SECRET: "t".repeat(32),
    EMAIL_DRIVER: "console",
  });
  await seedDatabase(db, password ?? "Dev-only-passw0rd!");
  const auth = createAuth({ db, config, mailer });
  return { db, auth, mailer, access: createAccess(db), config };
}

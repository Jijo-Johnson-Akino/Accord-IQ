import { join } from "node:path";
import { loadConfig } from "@accordiq/core";
import {
  createAccess,
  createAuth,
  createMailer,
  seedDatabase,
  type Access,
  type Auth,
} from "@accordiq/auth";
import { createLlm } from "@accordiq/ai";
import { createClm, seedClm, type Clm } from "@accordiq/clm";
import { createEsign } from "@accordiq/esign";
import { findWorkspaceRoot, openDatabase, type Database } from "@accordiq/db";
import { createStorage } from "@accordiq/storage";

export interface Runtime {
  config: ReturnType<typeof loadConfig>;
  db: Database;
  auth: Auth;
  access: Access;
  clm: Clm;
}

const globalForRuntime = globalThis as typeof globalThis & {
  __accordiqRuntime?: Promise<Runtime>;
};

async function initRuntime(): Promise<Runtime> {
  const config = loadConfig();
  const db = await openDatabase(config.DATABASE_URL);
  if (config.NODE_ENV !== "production") {
    const existing = await db.query.user.findFirst();
    if (!existing) {
      await seedDatabase(db, config.AUTH_SEED_PASSWORD);
    }
    await seedClm(db);
  }
  const mailer = createMailer(config, {
    outboxPath: join(findWorkspaceRoot(), ".data/mail-outbox.jsonl"),
  });
  const auth = createAuth({ db, config, mailer });
  const access = createAccess(db);
  const storage = createStorage(config, findWorkspaceRoot());
  const llm = createLlm(config);
  const esign = createEsign(config);
  const clm = createClm(db, {
    storage,
    llm,
    esign,
    mailer,
    credentialSecret: config.AUTH_SECRET,
    config,
    esignWebhook: {
      provider: config.ESIGN_PROVIDER,
      secret: config.ESIGN_WEBHOOK_SECRET ?? "",
      apiKey: config.ESIGN_API_KEY,
      toleranceSeconds: config.ESIGN_WEBHOOK_TOLERANCE_SECONDS,
    },
  });
  return { config, db, auth, access, clm };
}

/** Process-wide auth/db runtime. Schema is applied on first use; development auto-seeds if empty. */
export function getRuntime(): Promise<Runtime> {
  globalForRuntime.__accordiqRuntime ??= initRuntime();
  return globalForRuntime.__accordiqRuntime;
}

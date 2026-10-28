import type { Client } from "@libsql/client";
import { applyMigrationsToClient } from "./migrate";

/** @deprecated Use applyMigrationsToClient. Kept so existing callers keep working. */
export async function applySqliteDdl(client: Client): Promise<void> {
  await applyMigrationsToClient(client);
}

import { and, count, desc, eq } from "drizzle-orm";
import { AppError, pageResult, parseInput, type PageQuery } from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  integrationConnection,
  integrationRun,
  integrationWebhookEvent,
  organization,
  type Database,
} from "@accordiq/db";
import {
  decryptSecret,
  emailCatalog,
  encryptSecret,
  esignCatalog,
  isStoreableKind,
  parseIntegrationSecrets,
  publicConnectionView,
  sanitizeLogText,
  serializeIntegrationSecrets,
  storageCatalog,
  unwiredCatalog,
  verifyIntegrationWebhook,
  type IntegrationCard,
  type IntegrationKind,
} from "@accordiq/integrations";
import { id, notFound, requirePermission } from "./helpers";
import type { ClmOptions } from "./repository";
import { disconnectIntegrationSchema, saveIntegrationCredentialsSchema } from "./validation";

function isUniqueFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && current && "code" in current) {
      const code = String((current as { code?: string }).code ?? "").toUpperCase();
      if (code.includes("UNIQUE") || code.includes("CONSTRAINT")) return true;
    }
    const message =
      current instanceof Error ? current.message.toLowerCase() : String(current).toLowerCase();
    if (message.includes("unique") || message.includes("constraint")) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function requireSecret(options: ClmOptions): string {
  if (!options.credentialSecret) {
    throw new AppError("INTERNAL", "Credential encryption is not configured.");
  }
  return options.credentialSecret;
}

async function writeRun(
  db: Database,
  input: {
    organizationId: string;
    kind: string;
    action: string;
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    attempt?: number;
    error?: string | null;
    webhookEventId?: string | null;
    at: Date;
  },
) {
  const row = {
    id: id(),
    organizationId: input.organizationId,
    kind: input.kind,
    action: input.action,
    status: input.status,
    attempt: input.attempt ?? 1,
    error: input.error ? sanitizeLogText(input.error) : null,
    webhookEventId: input.webhookEventId ?? null,
    createdAt: input.at,
  };
  await db.insert(integrationRun).values(row);
  return row;
}

export function createIntegrationAccess(db: Database, options: ClmOptions) {
  const now = () => options.clock?.() ?? new Date();

  async function connectionsFor(organizationId: string) {
    return db
      .select()
      .from(integrationConnection)
      .where(eq(integrationConnection.organizationId, organizationId));
  }

  function catalogFor(rows: (typeof integrationConnection.$inferSelect)[]): IntegrationCard[] {
    const byKind = new Map(rows.map((row) => [row.kind, row]));
    const email = emailCatalog({
      driver: options.config?.EMAIL_DRIVER ?? "console",
    });
    const esign = options.esign?.status() ?? {
      provider: "none" as const,
      available: false,
      testOnly: false,
      setup: ["Set ESIGN_PROVIDER to sandbox or dropbox_sign."],
    };
    const crm = byKind.get("CRM");
    const erp = byKind.get("ERP");
    return [
      email,
      esignCatalog(esign),
      storageCatalog({ driver: options.config?.STORAGE_DRIVER ?? "local" }),
      unwiredCatalog({
        kind: "CRM",
        title: "CRM",
        description: "Future customer-record sync. No adapter is wired.",
        credentialConfigured: Boolean(crm?.ciphertext),
        provider: crm?.provider ?? null,
      }),
      unwiredCatalog({
        kind: "ERP",
        title: "ERP",
        description: "Future finance-system sync. No adapter is wired.",
        credentialConfigured: Boolean(erp?.ciphertext),
        provider: erp?.provider ?? null,
      }),
    ];
  }

  return {
    async listIntegrations(actor: Actor) {
      const organizationId = requirePermission(actor, "org:read");
      const rows = await connectionsFor(organizationId);
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, organizationId),
      });
      return {
        organizationSlug: org?.slug ?? null,
        webhookBasePath: "/api/webhooks/integrations",
        items: catalogFor(rows),
        connections: rows.map((row) =>
          publicConnectionView({
            kind: row.kind,
            provider: row.provider,
            status: row.status,
            ciphertext: row.ciphertext,
            updatedAt: row.updatedAt,
            revokedAt: row.revokedAt,
          }),
        ),
      };
    },

    async saveIntegrationCredentials(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "settings:manage");
      const input = parseInput(saveIntegrationCredentialsSchema, raw);
      if (!isStoreableKind(input.kind)) {
        throw new AppError(
          "VALIDATION",
          "This integration is configured with environment variables, not stored organization credentials.",
        );
      }
      const secret = requireSecret(options);
      const at = now();
      const ciphertext = encryptSecret(
        serializeIntegrationSecrets({
          apiKey: input.apiKey,
          webhookSecret: input.webhookSecret ?? null,
        }),
        secret,
      );
      const existing = await db.query.integrationConnection.findFirst({
        where: and(
          eq(integrationConnection.organizationId, organizationId),
          eq(integrationConnection.kind, input.kind),
        ),
      });
      if (existing) {
        await db
          .update(integrationConnection)
          .set({
            provider: input.provider,
            status: "STORED",
            ciphertext,
            updatedAt: at,
            revokedAt: null,
          })
          .where(eq(integrationConnection.id, existing.id));
      } else {
        await db.insert(integrationConnection).values({
          id: id(),
          organizationId,
          kind: input.kind,
          provider: input.provider,
          status: "STORED",
          ciphertext,
          createdAt: at,
          updatedAt: at,
          revokedAt: null,
        });
      }
      await writeRun(db, {
        organizationId,
        kind: input.kind,
        action: "SAVE_CREDENTIALS",
        status: "SUCCESS",
        at,
      });
      const card = catalogFor(await connectionsFor(organizationId)).find(
        (item) => item.kind === input.kind,
      );
      return {
        kind: input.kind,
        credentialConfigured: true,
        connected: false,
        available: false,
        warning: card?.warning ?? "No adapter is wired, so this integration is not connected.",
      };
    },

    async disconnectIntegration(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "settings:manage");
      const input = parseInput(disconnectIntegrationSchema, raw);
      if (!isStoreableKind(input.kind)) {
        throw new AppError(
          "VALIDATION",
          "Environment-configured integrations are disconnected by clearing server environment variables.",
        );
      }
      const existing = await db.query.integrationConnection.findFirst({
        where: and(
          eq(integrationConnection.organizationId, organizationId),
          eq(integrationConnection.kind, input.kind),
        ),
      });
      if (!existing) notFound();
      const at = now();
      await db
        .update(integrationConnection)
        .set({
          status: "REVOKED",
          ciphertext: null,
          updatedAt: at,
          revokedAt: at,
        })
        .where(eq(integrationConnection.id, existing.id));
      await writeRun(db, {
        organizationId,
        kind: input.kind,
        action: "REVOKE",
        status: "SUCCESS",
        at,
      });
      return { kind: input.kind, credentialConfigured: false, connected: false, revoked: true };
    },

    async listIntegrationRuns(actor: Actor, page: PageQuery) {
      const organizationId = requirePermission(actor, "settings:manage");
      const where = eq(integrationRun.organizationId, organizationId);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(integrationRun)
          .where(where)
          .orderBy(desc(integrationRun.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(integrationRun).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async processIntegrationWebhook(input: {
      kind: string;
      rawBody: string;
      headers: {
        signature: string | null;
        timestamp: string | null;
        eventId: string | null;
        organizationSlug: string | null;
      };
    }) {
      const kind = input.kind.trim().toUpperCase() as IntegrationKind;
      if (!isStoreableKind(kind)) {
        throw new AppError(
          "VALIDATION",
          "This webhook path is not connected. E-signature callbacks use POST /api/webhooks/esign.",
        );
      }
      const slug = input.headers.organizationSlug?.trim().toLowerCase() ?? "";
      if (!slug) {
        throw new AppError("UNAUTHENTICATED", "This integration is not configured.");
      }
      const org = await db.query.organization.findFirst({ where: eq(organization.slug, slug) });
      if (!org) {
        throw new AppError("UNAUTHENTICATED", "This integration is not configured.");
      }
      const connection = await db.query.integrationConnection.findFirst({
        where: and(
          eq(integrationConnection.organizationId, org.id),
          eq(integrationConnection.kind, kind),
        ),
      });
      if (!connection?.ciphertext || connection.status === "REVOKED") {
        throw new AppError("UNAUTHENTICATED", "This integration is not configured.");
      }
      const secret = requireSecret(options);
      let material;
      try {
        material = parseIntegrationSecrets(decryptSecret(connection.ciphertext, secret));
      } catch {
        throw new AppError("UNAUTHENTICATED", "This integration is not configured.");
      }
      const webhookSecret = material.webhookSecret;
      if (!webhookSecret) {
        throw new AppError("UNAUTHENTICATED", "This integration is not configured.");
      }
      const verified = verifyIntegrationWebhook({
        secret: webhookSecret,
        rawBody: input.rawBody,
        headers: input.headers,
        now: now(),
        toleranceSeconds: options.integrationWebhookToleranceSeconds ?? 300,
      });
      let eventType: string | null = null;
      try {
        const parsed = JSON.parse(input.rawBody) as { type?: unknown; provider?: unknown };
        eventType = typeof parsed.type === "string" ? parsed.type.slice(0, 80) : null;
      } catch {
        throw new AppError("VALIDATION", "Webhook body is not JSON.");
      }
      const at = now();
      const eventId = id();
      try {
        await db.insert(integrationWebhookEvent).values({
          id: eventId,
          organizationId: org.id,
          kind,
          provider: connection.provider,
          providerEventId: verified.eventId,
          eventType,
          status: "ACCEPTED",
          createdAt: at,
        });
      } catch (error) {
        if (isUniqueFailure(error)) {
          const existing = await db.query.integrationWebhookEvent.findFirst({
            where: and(
              eq(integrationWebhookEvent.organizationId, org.id),
              eq(integrationWebhookEvent.kind, kind),
              eq(integrationWebhookEvent.provider, connection.provider),
              eq(integrationWebhookEvent.providerEventId, verified.eventId),
            ),
          });
          return {
            duplicate: true,
            accepted: true,
            runId: null,
            eventId: existing?.id ?? null,
            connected: false,
          };
        }
        throw error;
      }
      const run = await writeRun(db, {
        organizationId: org.id,
        kind,
        action: "WEBHOOK",
        status: "SKIPPED",
        webhookEventId: eventId,
        error:
          "Event stored. No adapter is wired, so AccordIQ did not call the provider or change contract data.",
        at,
      });
      return {
        duplicate: false,
        accepted: true,
        runId: run.id,
        eventId,
        connected: false,
      };
    },
  };
}

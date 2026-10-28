import { and, count, desc, eq, isNull, lte, or } from "drizzle-orm";
import { AppError, pageResult, parseInput, type PageQuery } from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  notification,
  notificationDelivery,
  notificationPreference,
  user,
  type Database,
} from "@accordiq/db";
import {
  DEFAULT_MAX_ATTEMPTS,
  nextRetryAt,
  sanitizeLogText,
  shouldRetry,
} from "@accordiq/integrations";
import { NOTIFICATION_KINDS, type NotificationKind } from "./enums";
import { id, orgId, requirePermission } from "./helpers";
import type { ClmOptions } from "./repository";
import { updateNotificationPreferencesSchema } from "./validation";

type InsertExecutor = Pick<Database, "insert">;

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

export function defaultNotificationHref(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (entityType === "obligation") return "/obligations";
  if (entityType === "renewal") return "/obligations?view=renewals";
  if (entityType === "approval_request" && entityId) return `/approvals/${entityId}`;
  if (entityType === "signature_envelope" && entityId) return "/integrations";
  return null;
}

export interface DispatchNotificationInput {
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  href?: string | null;
  at: Date;
}

async function preferenceFor(
  db: Database,
  organizationId: string,
  userId: string,
  kind: NotificationKind,
): Promise<{ inApp: boolean; email: boolean }> {
  const row = await db.query.notificationPreference.findFirst({
    where: and(
      eq(notificationPreference.organizationId, organizationId),
      eq(notificationPreference.userId, userId),
      eq(notificationPreference.kind, kind),
    ),
  });
  return { inApp: row?.inApp ?? true, email: row?.email ?? true };
}

export async function dispatchNotification(
  db: Database,
  options: ClmOptions,
  input: DispatchNotificationInput,
  executor?: InsertExecutor,
): Promise<void> {
  const writer = executor ?? db;
  const prefs = await preferenceFor(db, input.organizationId, input.userId, input.kind);
  const href = input.href ?? defaultNotificationHref(input.entityType, input.entityId);
  let notificationId: string | null = null;
  if (prefs.inApp) {
    notificationId = id();
    await writer.insert(notification).values({
      id: notificationId,
      organizationId: input.organizationId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      status: "UNREAD",
      kind: input.kind,
      href,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: input.at,
    });
  }
  if (!prefs.email) return;
  const account = await db.query.user.findFirst({ where: eq(user.id, input.userId) });
  const toAddress = account?.email?.trim();
  if (!toAddress) return;
  await writer.insert(notificationDelivery).values({
    id: id(),
    organizationId: input.organizationId,
    userId: input.userId,
    notificationId,
    kind: input.kind,
    channel: "email",
    status: "PENDING",
    toAddress,
    subject: `AccordIQ: ${input.title}`,
    body: input.body,
    attempts: 0,
    maxAttempts: options.notificationMaxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    providerMessageId: null,
    nextRetryAt: input.at,
    sentAt: null,
    createdAt: input.at,
    updatedAt: input.at,
  });
  if (!executor) {
    await processNotificationDeliveries(db, options, {
      organizationId: input.organizationId,
      now: input.at,
    });
  }
}

export async function processNotificationDeliveries(
  db: Database,
  options: ClmOptions,
  input: { organizationId: string; now?: Date; limit?: number },
): Promise<{ processed: number; sent: number; failed: number; retried: number }> {
  const now = input.now ?? options.clock?.() ?? new Date();
  const due = or(
    isNull(notificationDelivery.nextRetryAt),
    lte(notificationDelivery.nextRetryAt, now),
  );
  const rows = await db
    .select()
    .from(notificationDelivery)
    .where(
      and(
        eq(notificationDelivery.organizationId, input.organizationId),
        eq(notificationDelivery.status, "PENDING"),
        due,
      ),
    )
    .orderBy(notificationDelivery.createdAt)
    .limit(input.limit ?? 50);

  let sent = 0;
  let failed = 0;
  let retried = 0;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      if (!options.mailer) {
        throw new AppError("INTERNAL", "Email delivery is not configured.");
      }
      const result = await options.mailer.sendTransactional({
        to: row.toAddress,
        subject: row.subject,
        text: row.body,
      });
      await db
        .update(notificationDelivery)
        .set({
          status: "SENT",
          attempts,
          providerMessageId: result?.id ?? null,
          sentAt: now,
          lastError: null,
          nextRetryAt: null,
          updatedAt: now,
        })
        .where(eq(notificationDelivery.id, row.id));
      sent += 1;
    } catch (error) {
      const message = sanitizeLogText(
        error instanceof Error ? error.message : "Failed to send email.",
      );
      const terminal = !shouldRetry(attempts, row.maxAttempts);
      await db
        .update(notificationDelivery)
        .set({
          status: terminal ? "FAILED" : "PENDING",
          attempts,
          lastError: message,
          nextRetryAt: terminal ? null : nextRetryAt(attempts, now),
          updatedAt: now,
        })
        .where(eq(notificationDelivery.id, row.id));
      if (terminal) failed += 1;
      else retried += 1;
    }
  }
  return { processed: rows.length, sent, failed, retried };
}

function mergedPreferences(
  rows: { kind: string; inApp: boolean; email: boolean }[],
): { kind: NotificationKind; inApp: boolean; email: boolean }[] {
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  return NOTIFICATION_KINDS.map((kind) => {
    const row = byKind.get(kind);
    return { kind, inApp: row?.inApp ?? true, email: row?.email ?? true };
  });
}

export function createNotifyAccess(db: Database, options: ClmOptions) {
  return {
    async listNotificationPreferences(actor: Actor) {
      const organizationId = orgId(actor);
      const rows = await db
        .select()
        .from(notificationPreference)
        .where(
          and(
            eq(notificationPreference.organizationId, organizationId),
            eq(notificationPreference.userId, actor.userId),
          ),
        );
      return mergedPreferences(rows);
    },

    async updateNotificationPreferences(actor: Actor, raw: unknown) {
      const organizationId = orgId(actor);
      const input = parseInput(updateNotificationPreferencesSchema, raw);
      const at = options.clock?.() ?? new Date();
      for (const item of input.preferences) {
        const existing = await db.query.notificationPreference.findFirst({
          where: and(
            eq(notificationPreference.organizationId, organizationId),
            eq(notificationPreference.userId, actor.userId),
            eq(notificationPreference.kind, item.kind),
          ),
        });
        if (existing) {
          await db
            .update(notificationPreference)
            .set({ inApp: item.inApp, email: item.email, updatedAt: at })
            .where(eq(notificationPreference.id, existing.id));
        } else {
          try {
            await db.insert(notificationPreference).values({
              id: id(),
              organizationId,
              userId: actor.userId,
              kind: item.kind,
              inApp: item.inApp,
              email: item.email,
              updatedAt: at,
            });
          } catch (error) {
            if (!isUniqueFailure(error)) throw error;
            await db
              .update(notificationPreference)
              .set({ inApp: item.inApp, email: item.email, updatedAt: at })
              .where(
                and(
                  eq(notificationPreference.organizationId, organizationId),
                  eq(notificationPreference.userId, actor.userId),
                  eq(notificationPreference.kind, item.kind),
                ),
              );
          }
        }
      }
      return mergedPreferences(
        await db
          .select()
          .from(notificationPreference)
          .where(
            and(
              eq(notificationPreference.organizationId, organizationId),
              eq(notificationPreference.userId, actor.userId),
            ),
          ),
      );
    },

    async processNotificationDeliveries(actor: Actor) {
      const organizationId = requirePermission(actor, "settings:manage");
      return processNotificationDeliveries(db, options, {
        organizationId,
        now: options.clock?.() ?? new Date(),
      });
    },

    async listNotificationDeliveries(actor: Actor, page: PageQuery) {
      const organizationId = requirePermission(actor, "settings:manage");
      const where = eq(notificationDelivery.organizationId, organizationId);
      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: notificationDelivery.id,
            kind: notificationDelivery.kind,
            channel: notificationDelivery.channel,
            status: notificationDelivery.status,
            toAddress: notificationDelivery.toAddress,
            subject: notificationDelivery.subject,
            body: notificationDelivery.body,
            attempts: notificationDelivery.attempts,
            lastError: notificationDelivery.lastError,
            sentAt: notificationDelivery.sentAt,
            createdAt: notificationDelivery.createdAt,
          })
          .from(notificationDelivery)
          .where(where)
          .orderBy(desc(notificationDelivery.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(notificationDelivery).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },
  };
}

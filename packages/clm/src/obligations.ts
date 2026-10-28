import { and, count, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import {
  AppError,
  likeContains,
  pageResult,
  parseInput,
  type PageQuery,
  type PageResult,
} from "@accordiq/core";
import { can, type Actor } from "@accordiq/auth";
import {
  approvalRequest,
  contract,
  document,
  membership,
  obligation,
  obligationEvent,
  organization,
  reminderReceipt,
  renewalEvent,
  renewalWatch,
  type Database,
} from "@accordiq/db";
import {
  addIsoYears,
  calendarDate,
  compareIsoDays,
  daysBetweenIso,
  formatIsoDay,
  nextOccurrenceDueOn,
  parseIsoDay,
  resolveTimeZone,
  subtractNoticeDays,
} from "./calendar";
import {
  OBLIGATION_FREQUENCIES,
  OBLIGATION_PRIORITIES,
  OBLIGATION_STATUSES,
  RENEWAL_WATCH_STATUSES,
  type NotificationKind,
  type ObligationFrequency,
  type ObligationPriority,
  type ObligationStatus,
  type RenewalWatchStatus,
} from "./enums";
import { id, notFound, optionalFilter, orgId, requirePermission, writeAudit } from "./helpers";
import { dispatchNotification, processNotificationDeliveries } from "./notify";
import type { ClmOptions } from "./repository";
import {
  applyRenewalDecisionSchema,
  assignObligationSchema,
  calendarRangeSchema,
  completeObligationSchema,
  createObligationSchema,
  organizationTimezoneSchema,
  recordRenewalDecisionSchema,
  startApprovalSchema,
  updateObligationSchema,
} from "./validation";

export const DEFAULT_NOTICE_DAYS = 60;

const OPEN_STATUSES = ["OPEN", "OVERDUE"] as const;
const CLOSED_WATCH = new Set(["TERMINATED", "CANCELLED"]);
const SKIP_WATCH_CONTRACT = new Set(["TERMINATED", "EXPIRED"]);

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

function asFrequency(value: string | null | undefined): ObligationFrequency {
  if (value && (OBLIGATION_FREQUENCIES as readonly string[]).includes(value)) {
    return value as ObligationFrequency;
  }
  return "ONCE";
}

export type ObligationListItem = typeof obligation.$inferSelect & {
  contractTitle: string;
};

export type CalendarEntry = {
  date: string;
  kind: "OBLIGATION" | "NOTICE" | "EXPIRY" | "TERMINATION";
  id: string;
  title: string;
  status: string;
  contractId: string;
  contractTitle: string;
  priority: string | null;
};

export type RenewalListItem = typeof renewalWatch.$inferSelect & {
  contractTitle: string;
  contractStatus: string;
};

export type ObligationHelpers = {
  scopedContract: (
    organizationId: string,
    contractId: string,
  ) => Promise<typeof contract.$inferSelect>;
  startApproval: (
    actor: Actor,
    contractId: string,
    raw: unknown,
  ) => Promise<{ request: { id: string; createdAt: Date } }>;
};

export function createObligationAccess(
  db: Database,
  options: ClmOptions,
  helpers: ObligationHelpers,
) {
  const clock = () => options.clock?.() ?? new Date();

  async function loadOrg(organizationId: string) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    });
    if (!org) notFound();
    const timezone = resolveTimeZone(org.timezone);
    const instant = clock();
    return { org, timezone, instant, today: calendarDate(instant, timezone) };
  }

  async function scopedObligation(organizationId: string, obligationId: string) {
    const row = await db.query.obligation.findFirst({
      where: and(eq(obligation.id, obligationId), eq(obligation.organizationId, organizationId)),
    });
    if (!row) notFound();
    return row;
  }

  async function scopedWatch(organizationId: string, contractId: string) {
    const row = await db.query.renewalWatch.findFirst({
      where: and(
        eq(renewalWatch.organizationId, organizationId),
        eq(renewalWatch.contractId, contractId),
      ),
    });
    if (!row) notFound();
    return row;
  }

  async function requireMember(organizationId: string, userId: string) {
    const row = await db.query.membership.findFirst({
      where: and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)),
    });
    if (!row) {
      throw new AppError("VALIDATION", "Owner must be a member of this organization.");
    }
    return row;
  }

  async function adminUserIds(organizationId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: membership.userId })
      .from(membership)
      .where(
        and(
          eq(membership.organizationId, organizationId),
          eq(membership.role, "ORGANIZATION_ADMIN"),
        ),
      );
    return rows.map((row) => row.userId);
  }

  async function notify(
    organizationId: string,
    userId: string | null | undefined,
    title: string,
    body: string,
    entityType: string,
    entityId: string,
    at: Date,
    kind: NotificationKind,
  ) {
    if (!userId) return;
    await dispatchNotification(db, options, {
      organizationId,
      userId,
      kind,
      title,
      body,
      entityType,
      entityId,
      at,
    });
  }

  async function claimReceipt(
    organizationId: string,
    entityType: string,
    entityId: string,
    kind: string,
    forDate: string,
    at: Date,
  ): Promise<boolean> {
    try {
      await db.insert(reminderReceipt).values({
        id: id(),
        organizationId,
        entityType,
        entityId,
        kind,
        forDate,
        createdAt: at,
      });
      return true;
    } catch (error) {
      if (isUniqueFailure(error)) return false;
      throw error;
    }
  }

  async function writeObligationEvent(
    organizationId: string,
    obligationId: string,
    action: string,
    actorUserId: string | null,
    dueOn: string | null,
    note: string | null,
    at: Date,
  ) {
    await db.insert(obligationEvent).values({
      id: id(),
      organizationId,
      obligationId,
      action,
      actorUserId,
      dueOn,
      note,
      createdAt: at,
    });
  }

  async function writeRenewalEvent(
    organizationId: string,
    watchId: string,
    action: string,
    actorUserId: string | null,
    note: string | null,
    at: Date,
  ) {
    await db.insert(renewalEvent).values({
      id: id(),
      organizationId,
      watchId,
      action,
      actorUserId,
      note,
      createdAt: at,
    });
  }

  function deriveWatchStatus(
    row: Pick<typeof renewalWatch.$inferSelect, "status" | "decision" | "expiresOn" | "noticeOn">,
    today: string,
  ): RenewalWatchStatus {
    if (row.status === "TERMINATED" || row.status === "CANCELLED") {
      return row.status;
    }
    if (row.decision) return "DECISION_PENDING";
    if (compareIsoDays(row.expiresOn, today) < 0) return "LAPSED";
    if (compareIsoDays(row.noticeOn, today) <= 0) return "NOTICE_DUE";
    return "WATCHING";
  }

  function canComplete(actor: Actor, row: typeof obligation.$inferSelect): boolean {
    if (can(actor, "contracts:write")) return true;
    return row.ownerUserId === actor.userId;
  }

  async function ensureWatchForContract(
    organizationId: string,
    row: typeof contract.$inferSelect,
    timezone: string,
    instant: Date,
    today: string,
  ) {
    if (!row.expiresOn || !parseIsoDay(row.expiresOn) || SKIP_WATCH_CONTRACT.has(row.status)) {
      const existing = await db.query.renewalWatch.findFirst({
        where: and(
          eq(renewalWatch.organizationId, organizationId),
          eq(renewalWatch.contractId, row.id),
        ),
      });
      if (existing && !CLOSED_WATCH.has(existing.status) && !row.expiresOn) {
        await db
          .update(renewalWatch)
          .set({ status: "CANCELLED", updatedAt: instant })
          .where(eq(renewalWatch.id, existing.id));
        await writeRenewalEvent(organizationId, existing.id, "CANCELLED", null, null, instant);
      }
      return;
    }

    const noticeDays = row.noticeDays ?? DEFAULT_NOTICE_DAYS;
    const noticeOn = subtractNoticeDays(row.expiresOn, noticeDays) ?? row.expiresOn;
    const terminateBy = noticeOn;
    const existing = await db.query.renewalWatch.findFirst({
      where: and(
        eq(renewalWatch.organizationId, organizationId),
        eq(renewalWatch.contractId, row.id),
      ),
    });

    if (existing) {
      if (CLOSED_WATCH.has(existing.status)) return existing;
      const datesChanged =
        existing.expiresOn !== row.expiresOn ||
        existing.noticeDays !== noticeDays ||
        existing.autoRenew !== row.autoRenew;
      if (datesChanged && !existing.decision) {
        const next = {
          expiresOn: row.expiresOn,
          noticeDays,
          noticeOn,
          terminateBy,
          autoRenew: row.autoRenew,
          timezone,
          status: deriveWatchStatus(
            { ...existing, expiresOn: row.expiresOn, noticeOn, decision: existing.decision },
            today,
          ),
          updatedAt: instant,
        };
        await db.update(renewalWatch).set(next).where(eq(renewalWatch.id, existing.id));
        return { ...existing, ...next };
      }
      return existing;
    }

    const watchId = id();
    const status = deriveWatchStatus(
      { status: "WATCHING", decision: null, expiresOn: row.expiresOn, noticeOn },
      today,
    );
    const inserted = {
      id: watchId,
      organizationId,
      contractId: row.id,
      expiresOn: row.expiresOn,
      noticeDays,
      noticeOn,
      terminateBy,
      autoRenew: row.autoRenew,
      status,
      decision: null as string | null,
      decisionNote: null as string | null,
      decidedAt: null as Date | null,
      decidedByUserId: null as string | null,
      ownerUserId: row.ownerUserId,
      approvalRequestId: null as string | null,
      proposedExpiresOn: null as string | null,
      reminderDaysBefore: 30,
      escalateDaysAfter: 7,
      timezone,
      lastRemindedOn: null as string | null,
      lastEscalatedOn: null as string | null,
      createdAt: instant,
      updatedAt: instant,
    };
    try {
      await db.insert(renewalWatch).values(inserted);
      await writeRenewalEvent(organizationId, watchId, "ENSURE", null, null, instant);
    } catch (error) {
      if (!isUniqueFailure(error)) throw error;
    }
    return inserted;
  }

  async function syncObligations(
    organizationId: string,
    timezone: string,
    instant: Date,
    today: string,
  ) {
    const rows = await db
      .select()
      .from(obligation)
      .where(
        and(
          eq(obligation.organizationId, organizationId),
          inArray(obligation.status, [...OPEN_STATUSES]),
        ),
      );
    const admins = await adminUserIds(organizationId);
    let reminders = 0;

    for (const row of rows) {
      if (!row.dueOn || !parseIsoDay(row.dueOn)) continue;
      if (row.status === "OPEN" && compareIsoDays(row.dueOn, today) < 0) {
        await db
          .update(obligation)
          .set({ status: "OVERDUE", updatedAt: instant })
          .where(eq(obligation.id, row.id));
        await writeObligationEvent(
          organizationId,
          row.id,
          "OVERDUE",
          null,
          row.dueOn,
          "Past due in the organization timezone.",
          instant,
        );
        row.status = "OVERDUE";
      }

      const untilDue = daysBetweenIso(today, row.dueOn);
      if (untilDue != null && untilDue <= row.reminderDaysBefore) {
        const claimed = await claimReceipt(
          organizationId,
          "obligation",
          row.id,
          "REMIND",
          row.dueOn,
          instant,
        );
        if (claimed) {
          reminders += 1;
          await db
            .update(obligation)
            .set({ lastRemindedOn: today, updatedAt: instant })
            .where(eq(obligation.id, row.id));
          await writeObligationEvent(
            organizationId,
            row.id,
            "REMIND",
            null,
            row.dueOn,
            null,
            instant,
          );
          await notify(
            organizationId,
            row.ownerUserId,
            "Obligation reminder",
            `${row.title} is due ${row.dueOn}.`,
            "obligation",
            row.id,
            instant,
            "OBLIGATION_REMINDER",
          );
        }
      }

      const overdueDays = daysBetweenIso(row.dueOn, today);
      if (
        overdueDays != null &&
        overdueDays >= row.escalateDaysAfter &&
        compareIsoDays(row.dueOn, today) < 0
      ) {
        const claimed = await claimReceipt(
          organizationId,
          "obligation",
          row.id,
          "ESCALATE",
          row.dueOn,
          instant,
        );
        if (claimed) {
          reminders += 1;
          await db
            .update(obligation)
            .set({ lastEscalatedOn: today, updatedAt: instant })
            .where(eq(obligation.id, row.id));
          await writeObligationEvent(
            organizationId,
            row.id,
            "ESCALATE",
            null,
            row.dueOn,
            "Overdue escalation.",
            instant,
          );
          const recipients = new Set([row.ownerUserId, ...admins].filter(Boolean) as string[]);
          for (const userId of recipients) {
            await notify(
              organizationId,
              userId,
              "Overdue obligation",
              `${row.title} was due ${row.dueOn}.`,
              "obligation",
              row.id,
              instant,
              "OBLIGATION_ESCALATION",
            );
          }
        }
      }
    }

    return reminders;
  }

  async function syncWatches(
    organizationId: string,
    timezone: string,
    instant: Date,
    today: string,
  ) {
    const contracts = await db
      .select()
      .from(contract)
      .where(eq(contract.organizationId, organizationId));
    for (const row of contracts) {
      await ensureWatchForContract(organizationId, row, timezone, instant, today);
    }

    const watches = await db
      .select()
      .from(renewalWatch)
      .where(eq(renewalWatch.organizationId, organizationId));
    const admins = await adminUserIds(organizationId);
    let reminders = 0;

    for (const watch of watches) {
      if (CLOSED_WATCH.has(watch.status)) continue;
      const nextStatus = deriveWatchStatus(watch, today);
      if (nextStatus !== watch.status) {
        await db
          .update(renewalWatch)
          .set({ status: nextStatus, updatedAt: instant })
          .where(eq(renewalWatch.id, watch.id));
        if (nextStatus === "LAPSED") {
          await writeRenewalEvent(
            organizationId,
            watch.id,
            "LAPSED",
            null,
            "Expiry passed. The contract was not terminated or renewed.",
            instant,
          );
        }
        watch.status = nextStatus;
      }

      const untilNotice = daysBetweenIso(today, watch.noticeOn);
      if (untilNotice != null && untilNotice <= watch.reminderDaysBefore) {
        const claimed = await claimReceipt(
          organizationId,
          "renewal",
          watch.id,
          "REMIND",
          watch.noticeOn,
          instant,
        );
        if (claimed) {
          reminders += 1;
          await db
            .update(renewalWatch)
            .set({ lastRemindedOn: today, updatedAt: instant })
            .where(eq(renewalWatch.id, watch.id));
          await writeRenewalEvent(organizationId, watch.id, "REMIND", null, null, instant);
          await notify(
            organizationId,
            watch.ownerUserId,
            "Renewal notice window",
            `Notice is due ${watch.noticeOn}. Expiry is ${watch.expiresOn}. AccordIQ will not renew or terminate this contract automatically.`,
            "renewal",
            watch.id,
            instant,
            "RENEWAL_ALERT",
          );
        }
      }

      const daysPastNotice = daysBetweenIso(watch.noticeOn, today);
      if (
        !watch.decision &&
        daysPastNotice != null &&
        daysPastNotice >= watch.escalateDaysAfter &&
        compareIsoDays(watch.noticeOn, today) <= 0
      ) {
        const claimed = await claimReceipt(
          organizationId,
          "renewal",
          watch.id,
          "ESCALATE",
          watch.noticeOn,
          instant,
        );
        if (claimed) {
          reminders += 1;
          await db
            .update(renewalWatch)
            .set({ lastEscalatedOn: today, updatedAt: instant })
            .where(eq(renewalWatch.id, watch.id));
          await writeRenewalEvent(
            organizationId,
            watch.id,
            "ESCALATE",
            null,
            "No renewal decision recorded.",
            instant,
          );
          const recipients = new Set([watch.ownerUserId, ...admins].filter(Boolean) as string[]);
          for (const userId of recipients) {
            await notify(
              organizationId,
              userId,
              "Renewal decision overdue",
              `A decision is needed before ${watch.terminateBy}. AccordIQ will not renew or terminate automatically.`,
              "renewal",
              watch.id,
              instant,
              "RENEWAL_ALERT",
            );
          }
        }
      }
    }

    return reminders;
  }

  async function runSync(organizationId: string) {
    const ctx = await loadOrg(organizationId);
    const obligationReminders = await syncObligations(
      organizationId,
      ctx.timezone,
      ctx.instant,
      ctx.today,
    );
    const renewalReminders = await syncWatches(
      organizationId,
      ctx.timezone,
      ctx.instant,
      ctx.today,
    );
    const deliveries = await processNotificationDeliveries(db, options, {
      organizationId,
      now: ctx.instant,
    });
    return {
      timezone: ctx.timezone,
      today: ctx.today,
      remindersSent: obligationReminders + renewalReminders,
      emailDeliveries: deliveries,
    };
  }

  async function withContractTitle<T extends { contractId: string }>(
    organizationId: string,
    rows: T[],
  ): Promise<(T & { contractTitle: string })[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((row) => row.contractId))];
    const contracts = await db
      .select({ id: contract.id, title: contract.title })
      .from(contract)
      .where(and(eq(contract.organizationId, organizationId), inArray(contract.id, ids)));
    const titles = new Map(contracts.map((row) => [row.id, row.title]));
    return rows.map((row) => ({ ...row, contractTitle: titles.get(row.contractId) ?? "Contract" }));
  }

  return {
    async getMonitoringSettings(actor: Actor) {
      const organizationId = requirePermission(actor, "org:read");
      const ctx = await loadOrg(organizationId);
      return { timezone: ctx.timezone, today: ctx.today, organizationName: ctx.org.name };
    },

    async updateOrganizationTimezone(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "settings:manage");
      const input = parseInput(organizationTimezoneSchema, raw);
      const timezone = resolveTimeZone(input.timezone);
      if (timezone !== input.timezone) {
        throw new AppError("VALIDATION", "Timezone must be a valid IANA name.");
      }
      const instant = clock();
      await db
        .update(organization)
        .set({ timezone, updatedAt: instant })
        .where(eq(organization.id, organizationId));
      await writeAudit(db, actor, "organization.timezone", "organization", organizationId, {
        timezone,
      });
      const today = calendarDate(instant, timezone);
      return { timezone, today };
    },

    async syncMonitoring(actor: Actor) {
      const organizationId = requirePermission(actor, "contracts:read");
      return runSync(organizationId);
    },

    async syncContractWatch(organizationId: string, contractId: string) {
      const ctx = await loadOrg(organizationId);
      const row = await helpers.scopedContract(organizationId, contractId);
      await ensureWatchForContract(organizationId, row, ctx.timezone, ctx.instant, ctx.today);
    },

    async listObligations(
      actor: Actor,
      page: PageQuery,
      filters: {
        contractId?: string | null;
        status?: string | null;
        ownerUserId?: string | null;
        priority?: string | null;
      } = {},
    ): Promise<PageResult<ObligationListItem>> {
      const organizationId = requirePermission(actor, "contracts:read");
      await runSync(organizationId);
      const status = optionalFilter<ObligationStatus>(filters.status, OBLIGATION_STATUSES);
      const priority = optionalFilter<ObligationPriority>(filters.priority, OBLIGATION_PRIORITIES);
      const conditions: SQL[] = [eq(obligation.organizationId, organizationId)];
      if (filters.contractId) {
        await helpers.scopedContract(organizationId, filters.contractId);
        conditions.push(eq(obligation.contractId, filters.contractId));
      }
      if (status) conditions.push(eq(obligation.status, status));
      if (priority) conditions.push(eq(obligation.priority, priority));
      if (filters.ownerUserId) conditions.push(eq(obligation.ownerUserId, filters.ownerUserId));
      if (page.q) conditions.push(like(obligation.title, likeContains(page.q)));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(obligation)
          .where(where)
          .orderBy(obligation.dueOn)
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(obligation).where(where),
      ]);
      const titled = await withContractTitle(organizationId, items);
      return pageResult(titled, Number(totalRow[0]?.total ?? 0), page);
    },

    async getObligation(actor: Actor, obligationId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      await runSync(organizationId);
      const row = await scopedObligation(organizationId, obligationId);
      const parent = await helpers.scopedContract(organizationId, row.contractId);
      const events = await db
        .select()
        .from(obligationEvent)
        .where(
          and(
            eq(obligationEvent.obligationId, row.id),
            eq(obligationEvent.organizationId, organizationId),
          ),
        )
        .orderBy(desc(obligationEvent.createdAt));
      return {
        obligation: { ...row, contractTitle: parent.title },
        events,
        canComplete: canComplete(actor, row),
      };
    },

    async createObligation(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(createObligationSchema, raw);
      await helpers.scopedContract(organizationId, input.contractId);
      const ctx = await loadOrg(organizationId);
      const ownerUserId = input.ownerUserId ?? actor.userId;
      await requireMember(organizationId, ownerUserId);
      const row = {
        id: id(),
        organizationId,
        contractId: input.contractId,
        title: input.title,
        description: input.description ?? null,
        dueOn: input.dueOn ?? null,
        status: "OPEN" as const,
        ownerUserId,
        clauseUsageId: input.clauseUsageId ?? null,
        sourceQuote: input.sourceQuote ?? null,
        frequency: input.frequency ?? "ONCE",
        intervalCount: input.intervalCount ?? 1,
        priority: input.priority ?? "MEDIUM",
        completedAt: null as Date | null,
        completedByUserId: null as string | null,
        completionNote: null as string | null,
        evidenceDocumentId: null as string | null,
        reminderDaysBefore: input.reminderDaysBefore ?? 7,
        escalateDaysAfter: input.escalateDaysAfter ?? 1,
        parentObligationId: null as string | null,
        occurrenceIndex: 1,
        timezone: ctx.timezone,
        lastRemindedOn: null as string | null,
        lastEscalatedOn: null as string | null,
        createdByUserId: actor.userId,
        createdAt: ctx.instant,
        updatedAt: ctx.instant,
      };
      await db.transaction(async (tx) => {
        await tx.insert(obligation).values(row);
        await tx.insert(obligationEvent).values({
          id: id(),
          organizationId,
          obligationId: row.id,
          action: "CREATE",
          actorUserId: actor.userId,
          dueOn: row.dueOn,
          note: null,
          createdAt: ctx.instant,
        });
        await dispatchNotification(
          db,
          options,
          {
            organizationId,
            userId: ownerUserId,
            kind: "OBLIGATION_REMINDER",
            title: "Obligation assigned",
            body: row.title,
            entityType: "obligation",
            entityId: row.id,
            at: ctx.instant,
          },
          tx,
        );
        await writeAudit(tx, actor, "obligation.create", "obligation", row.id, {
          contractId: row.contractId,
        });
      });
      await processNotificationDeliveries(db, options, {
        organizationId,
        now: ctx.instant,
      });
      return {
        ...row,
        contractTitle: (await helpers.scopedContract(organizationId, row.contractId)).title,
      };
    },

    async updateObligation(actor: Actor, obligationId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(updateObligationSchema, raw);
      const existing = await scopedObligation(organizationId, obligationId);
      if (existing.status === "DONE" || existing.status === "CANCELLED") {
        throw new AppError("CONFLICT", "A completed or cancelled obligation cannot be edited.");
      }
      if (input.ownerUserId) await requireMember(organizationId, input.ownerUserId);
      const instant = clock();
      const patch = {
        title: input.title ?? existing.title,
        description: input.description === undefined ? existing.description : input.description,
        dueOn: input.dueOn === undefined ? existing.dueOn : input.dueOn,
        ownerUserId: input.ownerUserId === undefined ? existing.ownerUserId : input.ownerUserId,
        clauseUsageId:
          input.clauseUsageId === undefined ? existing.clauseUsageId : input.clauseUsageId,
        sourceQuote: input.sourceQuote === undefined ? existing.sourceQuote : input.sourceQuote,
        frequency: input.frequency ?? existing.frequency,
        intervalCount: input.intervalCount ?? existing.intervalCount,
        priority: input.priority ?? existing.priority,
        reminderDaysBefore: input.reminderDaysBefore ?? existing.reminderDaysBefore,
        escalateDaysAfter: input.escalateDaysAfter ?? existing.escalateDaysAfter,
        updatedAt: instant,
      };
      await db
        .update(obligation)
        .set(patch)
        .where(and(eq(obligation.id, obligationId), eq(obligation.organizationId, organizationId)));
      await writeAudit(db, actor, "obligation.update", "obligation", obligationId, {
        title: patch.title,
      });
      return scopedObligation(organizationId, obligationId);
    },

    async assignObligation(actor: Actor, obligationId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(assignObligationSchema, raw);
      const existing = await scopedObligation(organizationId, obligationId);
      if (existing.status === "DONE" || existing.status === "CANCELLED") {
        throw new AppError("CONFLICT", "A completed or cancelled obligation cannot be assigned.");
      }
      await requireMember(organizationId, input.ownerUserId);
      const instant = clock();
      await db
        .update(obligation)
        .set({ ownerUserId: input.ownerUserId, updatedAt: instant })
        .where(eq(obligation.id, existing.id));
      await writeObligationEvent(
        organizationId,
        existing.id,
        "ASSIGN",
        actor.userId,
        existing.dueOn,
        input.ownerUserId,
        instant,
      );
      await notify(
        organizationId,
        input.ownerUserId,
        "Obligation assigned",
        existing.title,
        "obligation",
        existing.id,
        instant,
        "OBLIGATION_REMINDER",
      );
      await writeAudit(db, actor, "obligation.assign", "obligation", existing.id, {
        ownerUserId: input.ownerUserId,
      });
      return scopedObligation(organizationId, obligationId);
    },

    async completeObligation(actor: Actor, obligationId: string, raw: unknown) {
      const organizationId = orgId(actor);
      requirePermission(actor, "contracts:read");
      const input = parseInput(completeObligationSchema, raw ?? {});
      const existing = await scopedObligation(organizationId, obligationId);
      if (!canComplete(actor, existing)) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.");
      }
      if (existing.status === "DONE") {
        throw new AppError("CONFLICT", "This obligation is already complete.");
      }
      if (existing.status === "CANCELLED") {
        throw new AppError("CONFLICT", "A cancelled obligation cannot be completed.");
      }
      if (input.evidenceDocumentId) {
        const evidence = await db.query.document.findFirst({
          where: and(
            eq(document.id, input.evidenceDocumentId),
            eq(document.organizationId, organizationId),
            eq(document.contractId, existing.contractId),
          ),
        });
        if (!evidence) {
          throw new AppError("VALIDATION", "Evidence must be a document on this contract.");
        }
      }
      const ctx = await loadOrg(organizationId);
      await db
        .update(obligation)
        .set({
          status: "DONE",
          completedAt: ctx.instant,
          completedByUserId: actor.userId,
          completionNote: input.completionNote ?? null,
          evidenceDocumentId: input.evidenceDocumentId ?? existing.evidenceDocumentId,
          updatedAt: ctx.instant,
        })
        .where(eq(obligation.id, existing.id));
      await writeObligationEvent(
        organizationId,
        existing.id,
        "COMPLETE",
        actor.userId,
        existing.dueOn,
        input.completionNote ?? null,
        ctx.instant,
      );
      await writeAudit(db, actor, "obligation.complete", "obligation", existing.id, {
        contractId: existing.contractId,
      });

      let next: typeof obligation.$inferSelect | null = null;
      const frequency = asFrequency(existing.frequency);
      const nextDue = existing.dueOn
        ? nextOccurrenceDueOn(existing.dueOn, frequency, existing.intervalCount)
        : null;
      if (nextDue) {
        const childIndex = existing.occurrenceIndex + 1;
        const already = await db.query.obligation.findFirst({
          where: and(
            eq(obligation.parentObligationId, existing.id),
            eq(obligation.occurrenceIndex, childIndex),
            eq(obligation.organizationId, organizationId),
          ),
        });
        if (!already) {
          const child = {
            id: id(),
            organizationId,
            contractId: existing.contractId,
            title: existing.title,
            description: existing.description,
            dueOn: nextDue,
            status: "OPEN" as const,
            ownerUserId: existing.ownerUserId,
            clauseUsageId: existing.clauseUsageId,
            sourceQuote: existing.sourceQuote,
            frequency: existing.frequency,
            intervalCount: existing.intervalCount,
            priority: existing.priority,
            completedAt: null as Date | null,
            completedByUserId: null as string | null,
            completionNote: null as string | null,
            evidenceDocumentId: null as string | null,
            reminderDaysBefore: existing.reminderDaysBefore,
            escalateDaysAfter: existing.escalateDaysAfter,
            parentObligationId: existing.id,
            occurrenceIndex: childIndex,
            timezone: existing.timezone,
            lastRemindedOn: null as string | null,
            lastEscalatedOn: null as string | null,
            createdByUserId: actor.userId,
            createdAt: ctx.instant,
            updatedAt: ctx.instant,
          };
          await db.insert(obligation).values(child);
          await writeObligationEvent(
            organizationId,
            child.id,
            "OCCURRENCE",
            actor.userId,
            nextDue,
            `Occurrence ${childIndex}.`,
            ctx.instant,
          );
          next = child;
        }
      }
      const updated = await scopedObligation(organizationId, obligationId);
      return { obligation: updated, next };
    },

    async cancelObligation(actor: Actor, obligationId: string) {
      const organizationId = requirePermission(actor, "contracts:write");
      const existing = await scopedObligation(organizationId, obligationId);
      if (existing.status === "DONE") {
        throw new AppError("CONFLICT", "A completed obligation cannot be cancelled.");
      }
      if (existing.status === "CANCELLED") return existing;
      const instant = clock();
      await db
        .update(obligation)
        .set({ status: "CANCELLED", updatedAt: instant })
        .where(eq(obligation.id, existing.id));
      await writeObligationEvent(
        organizationId,
        existing.id,
        "CANCEL",
        actor.userId,
        existing.dueOn,
        null,
        instant,
      );
      await writeAudit(db, actor, "obligation.cancel", "obligation", existing.id, {
        contractId: existing.contractId,
      });
      return scopedObligation(organizationId, obligationId);
    },

    async listObligationCalendar(
      actor: Actor,
      raw: unknown,
    ): Promise<{
      timezone: string;
      today: string;
      from: string;
      to: string;
      items: CalendarEntry[];
    }> {
      const organizationId = requirePermission(actor, "contracts:read");
      const ctx = await loadOrg(organizationId);
      await runSync(organizationId);
      const input = parseInput(calendarRangeSchema, raw ?? {});
      const parsedToday = parseIsoDay(ctx.today)!;
      const monthEnd = new Date(Date.UTC(parsedToday.year, parsedToday.month, 0)).getUTCDate();
      const from = input.from ?? formatIsoDay(parsedToday.year, parsedToday.month, 1);
      const to = input.to ?? formatIsoDay(parsedToday.year, parsedToday.month, monthEnd);
      if (compareIsoDays(from, to) > 0) {
        throw new AppError("VALIDATION", "from must be on or before to.");
      }
      const span = daysBetweenIso(from, to);
      if (span != null && span > 366) {
        throw new AppError("VALIDATION", "Calendar range cannot exceed 366 days.");
      }

      const obligations = await db
        .select()
        .from(obligation)
        .where(
          and(
            eq(obligation.organizationId, organizationId),
            gte(obligation.dueOn, from),
            lte(obligation.dueOn, to),
          ),
        );
      const titledObligations = await withContractTitle(organizationId, obligations);
      const items: CalendarEntry[] = titledObligations
        .filter((row) => row.dueOn)
        .map((row) => ({
          date: row.dueOn!,
          kind: "OBLIGATION" as const,
          id: row.id,
          title: row.title,
          status: row.status,
          contractId: row.contractId,
          contractTitle: row.contractTitle,
          priority: row.priority,
        }));

      const watches = await db
        .select({
          watch: renewalWatch,
          contractTitle: contract.title,
        })
        .from(renewalWatch)
        .innerJoin(contract, eq(contract.id, renewalWatch.contractId))
        .where(eq(renewalWatch.organizationId, organizationId));

      for (const row of watches) {
        const watch = row.watch;
        if (CLOSED_WATCH.has(watch.status)) continue;
        const points: { date: string; kind: CalendarEntry["kind"]; title: string }[] = [
          { date: watch.noticeOn, kind: "NOTICE", title: `Notice: ${row.contractTitle}` },
          {
            date: watch.terminateBy,
            kind: "TERMINATION",
            title: `Terminate by: ${row.contractTitle}`,
          },
          { date: watch.expiresOn, kind: "EXPIRY", title: `Expires: ${row.contractTitle}` },
        ];
        for (const point of points) {
          if (compareIsoDays(point.date, from) < 0 || compareIsoDays(point.date, to) > 0) continue;
          items.push({
            date: point.date,
            kind: point.kind,
            id: `${watch.id}:${point.kind}`,
            title: point.title,
            status: watch.status,
            contractId: watch.contractId,
            contractTitle: row.contractTitle,
            priority: null,
          });
        }
      }

      items.sort((left, right) => {
        const byDate = compareIsoDays(left.date, right.date);
        if (byDate !== 0) return byDate;
        return left.title.localeCompare(right.title);
      });
      return { timezone: ctx.timezone, today: ctx.today, from, to, items };
    },

    async listRenewals(
      actor: Actor,
      page: PageQuery,
      filters: { status?: string | null } = {},
    ): Promise<PageResult<RenewalListItem> & { today: string; timezone: string }> {
      const organizationId = requirePermission(actor, "contracts:read");
      const ctx = await runSync(organizationId);
      const status = optionalFilter<RenewalWatchStatus>(filters.status, RENEWAL_WATCH_STATUSES);
      const conditions: SQL[] = [eq(renewalWatch.organizationId, organizationId)];
      if (status) conditions.push(eq(renewalWatch.status, status));
      if (page.q) {
        conditions.push(
          or(
            like(contract.title, likeContains(page.q)),
            like(renewalWatch.expiresOn, likeContains(page.q)),
          )!,
        );
      }
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select({
            watch: renewalWatch,
            contractTitle: contract.title,
            contractStatus: contract.status,
          })
          .from(renewalWatch)
          .innerJoin(contract, eq(contract.id, renewalWatch.contractId))
          .where(where)
          .orderBy(renewalWatch.noticeOn)
          .limit(page.limit)
          .offset(page.offset),
        db
          .select({ total: count() })
          .from(renewalWatch)
          .innerJoin(contract, eq(contract.id, renewalWatch.contractId))
          .where(where),
      ]);
      const mapped: RenewalListItem[] = items.map((row) => ({
        ...row.watch,
        contractTitle: row.contractTitle,
        contractStatus: row.contractStatus,
      }));
      return {
        ...pageResult(mapped, Number(totalRow[0]?.total ?? 0), page),
        today: ctx.today,
        timezone: ctx.timezone,
      };
    },

    async getRenewalWatch(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      const parent = await helpers.scopedContract(organizationId, contractId);
      await runSync(organizationId);
      const watch = await db.query.renewalWatch.findFirst({
        where: and(
          eq(renewalWatch.organizationId, organizationId),
          eq(renewalWatch.contractId, contractId),
        ),
      });
      const events = watch
        ? await db
            .select()
            .from(renewalEvent)
            .where(
              and(
                eq(renewalEvent.watchId, watch.id),
                eq(renewalEvent.organizationId, organizationId),
              ),
            )
            .orderBy(desc(renewalEvent.createdAt))
        : [];
      return { contract: parent, watch, events };
    },

    async recordRenewalDecision(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(recordRenewalDecisionSchema, raw);
      const parent = await helpers.scopedContract(organizationId, contractId);
      await runSync(organizationId);
      const watch = await scopedWatch(organizationId, contractId);
      if (CLOSED_WATCH.has(watch.status)) {
        throw new AppError("CONFLICT", "This renewal watch is closed.");
      }
      const instant = clock();
      await db
        .update(renewalWatch)
        .set({
          decision: input.decision,
          decisionNote: input.note ?? null,
          decidedAt: instant,
          decidedByUserId: actor.userId,
          proposedExpiresOn: input.proposedExpiresOn ?? watch.proposedExpiresOn,
          approvalRequestId: null,
          status: "DECISION_PENDING",
          updatedAt: instant,
        })
        .where(eq(renewalWatch.id, watch.id));
      await writeRenewalEvent(
        organizationId,
        watch.id,
        "DECISION",
        actor.userId,
        `${input.decision}${input.note ? `: ${input.note}` : ""}`,
        instant,
      );
      await writeAudit(db, actor, "renewal.decision", "renewal_watch", watch.id, {
        contractId,
        decision: input.decision,
      });
      let approval: { request: { id: string; createdAt: Date } } | null = null;
      if (input.templateId) {
        approval = await helpers.startApproval(actor, parent.id, {
          templateId: input.templateId,
        });
        await db
          .update(renewalWatch)
          .set({ approvalRequestId: approval.request.id, updatedAt: clock() })
          .where(eq(renewalWatch.id, watch.id));
        await writeRenewalEvent(
          organizationId,
          watch.id,
          "APPROVAL_STARTED",
          actor.userId,
          approval.request.id,
          clock(),
        );
      }
      return { watch: await scopedWatch(organizationId, contractId), approval };
    },

    async startRenewalApproval(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      parseInput(startApprovalSchema, raw);
      await helpers.scopedContract(organizationId, contractId);
      const watch = await scopedWatch(organizationId, contractId);
      if (!watch.decision) {
        throw new AppError("CONFLICT", "Record a renewal or termination decision first.");
      }
      if (CLOSED_WATCH.has(watch.status)) {
        throw new AppError("CONFLICT", "This renewal watch is closed.");
      }
      const started = await helpers.startApproval(actor, contractId, raw);
      await db
        .update(renewalWatch)
        .set({
          approvalRequestId: started.request.id,
          status: "DECISION_PENDING",
          updatedAt: clock(),
        })
        .where(eq(renewalWatch.id, watch.id));
      await writeRenewalEvent(
        organizationId,
        watch.id,
        "APPROVAL_STARTED",
        actor.userId,
        started.request.id,
        clock(),
      );
      return { watch: await scopedWatch(organizationId, contractId), approval: started };
    },

    async applyRenewalDecision(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(applyRenewalDecisionSchema, raw ?? {});
      const parent = await helpers.scopedContract(organizationId, contractId);
      const watch = await scopedWatch(organizationId, contractId);
      if (!watch.decision) {
        throw new AppError("CONFLICT", "Record a renewal or termination decision first.");
      }
      if (!watch.approvalRequestId) {
        throw new AppError(
          "CONFLICT",
          "An approved workflow started after the decision is required. AccordIQ does not renew or terminate automatically.",
        );
      }
      const request = await db.query.approvalRequest.findFirst({
        where: and(
          eq(approvalRequest.id, watch.approvalRequestId),
          eq(approvalRequest.organizationId, organizationId),
          eq(approvalRequest.contractId, contractId),
        ),
      });
      if (!request) notFound();
      if (request.status !== "APPROVED") {
        throw new AppError(
          "CONFLICT",
          "The linked workflow must be approved before applying this decision.",
        );
      }
      if (!watch.decidedAt || request.createdAt.getTime() < watch.decidedAt.getTime()) {
        throw new AppError("CONFLICT", "The approval must be recorded after the renewal decision.");
      }

      const instant = clock();
      if (watch.decision === "TERMINATE") {
        await db
          .update(contract)
          .set({ status: "TERMINATED", updatedAt: instant })
          .where(and(eq(contract.id, parent.id), eq(contract.organizationId, organizationId)));
        await db
          .update(renewalWatch)
          .set({ status: "TERMINATED", updatedAt: instant })
          .where(eq(renewalWatch.id, watch.id));
        await writeRenewalEvent(
          organizationId,
          watch.id,
          "APPLIED_TERMINATE",
          actor.userId,
          null,
          instant,
        );
        await writeAudit(db, actor, "renewal.apply", "contract", parent.id, {
          decision: "TERMINATE",
        });
        const { contract: updated } = {
          contract: await helpers.scopedContract(organizationId, contractId),
        };
        return { contract: updated, watch: await scopedWatch(organizationId, contractId) };
      }

      const nextExpires =
        input.proposedExpiresOn ??
        watch.proposedExpiresOn ??
        addIsoYears(watch.expiresOn, 1) ??
        watch.expiresOn;
      const noticeOn = subtractNoticeDays(nextExpires, watch.noticeDays) ?? nextExpires;
      await db
        .update(contract)
        .set({ expiresOn: nextExpires, updatedAt: instant })
        .where(and(eq(contract.id, parent.id), eq(contract.organizationId, organizationId)));
      await db
        .update(renewalWatch)
        .set({
          expiresOn: nextExpires,
          noticeOn,
          terminateBy: noticeOn,
          decision: null,
          decisionNote: null,
          decidedAt: null,
          decidedByUserId: null,
          approvalRequestId: null,
          proposedExpiresOn: null,
          status: "WATCHING",
          updatedAt: instant,
        })
        .where(eq(renewalWatch.id, watch.id));
      await writeRenewalEvent(
        organizationId,
        watch.id,
        "APPLIED_RENEW",
        actor.userId,
        nextExpires,
        instant,
      );
      await writeAudit(db, actor, "renewal.apply", "contract", parent.id, {
        decision: "RENEW",
        expiresOn: nextExpires,
      });
      return {
        contract: await helpers.scopedContract(organizationId, contractId),
        watch: await scopedWatch(organizationId, contractId),
      };
    },
  };
}

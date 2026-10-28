import { and, count, desc, eq, inArray } from "drizzle-orm";
import { AppError, pageResult, parseInput, type PageQuery } from "@accordiq/core";
import { can, type Actor } from "@accordiq/auth";
import {
  approvalComment,
  approvalEvent,
  approvalRequest,
  approvalStage,
  approvalStageTemplate,
  approvalWorkflowTemplate,
  contract,
  membership,
  riskAssessment,
  user,
  type Database,
} from "@accordiq/db";
import {
  actionableStageIds,
  canActorDecide,
  dueAtFromDays,
  evaluateCondition,
  isOverdue,
  materialSnapshot,
  nextRequestStatus,
  parseCondition,
  reminderDue,
  snapshotsDiffer,
  type ApprovalFacts,
  type EvaluableStage,
} from "./approval-engine";
import { APPROVAL_STATUSES, type NotificationKind } from "./enums";
import { id, notFound, optionalFilter, orgId, requirePermission, writeAudit } from "./helpers";
import { dispatchNotification, processNotificationDeliveries } from "./notify";
import type { ClmOptions } from "./repository";
import {
  commentApprovalSchema,
  createWorkflowSchema,
  decideApprovalSchema,
  delegateApprovalSchema,
  resubmitApprovalSchema,
  startApprovalSchema,
} from "./validation";

function isUniqueFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unique") || message.includes("constraint");
}

function isStale(value: boolean | number | null | undefined): boolean {
  return Boolean(value);
}

function toEvaluable(row: typeof approvalStage.$inferSelect): EvaluableStage {
  return {
    id: row.id,
    step: row.step,
    status: row.status as EvaluableStage["status"],
    requiredRole: row.requiredRole,
    delegatedToUserId: row.delegatedToUserId,
    escalateToRole: row.escalateToRole,
    escalatedAt: row.escalatedAt,
  };
}

export function createApprovalAccess(
  db: Database,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
    clock?: () => Date;
    options?: ClmOptions;
  },
) {
  const options = helpers.options ?? {};
  function now(): Date {
    return helpers.clock?.() ?? new Date();
  }
  async function loadFacts(
    organizationId: string,
    row: typeof contract.$inferSelect,
  ): Promise<ApprovalFacts> {
    const [latest] = await db
      .select()
      .from(riskAssessment)
      .where(
        and(
          eq(riskAssessment.contractId, row.id),
          eq(riskAssessment.organizationId, organizationId),
          eq(riskAssessment.status, "COMPLETE"),
        ),
      )
      .orderBy(desc(riskAssessment.assessmentNumber))
      .limit(1);
    return {
      valueMinor: row.valueMinor,
      category: row.category,
      department: row.department,
      vendorId: row.vendorId,
      overallSeverity: latest?.overallSeverity ?? null,
      versionId: row.currentVersionId,
    };
  }

  async function notifyRole(
    executor: Pick<Database, "insert">,
    input: {
      organizationId: string;
      role: string;
      title: string;
      body: string;
      entityId: string;
      kind: NotificationKind;
      exceptUserId?: string;
    },
  ) {
    const members = await db
      .select({ userId: membership.userId })
      .from(membership)
      .where(
        and(eq(membership.organizationId, input.organizationId), eq(membership.role, input.role)),
      );
    for (const member of members) {
      if (member.userId === input.exceptUserId) continue;
      await dispatchNotification(
        db,
        options,
        {
          organizationId: input.organizationId,
          userId: member.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          entityType: "approval_request",
          entityId: input.entityId,
          at: now(),
        },
        executor,
      );
    }
  }

  async function writeEvent(
    executor: Pick<Database, "insert">,
    actor: Actor,
    input: {
      organizationId: string;
      requestId: string;
      stageId?: string | null;
      action: string;
      payload?: Record<string, string | number | boolean | null>;
      idempotencyKey?: string | null;
    },
  ) {
    await executor.insert(approvalEvent).values({
      id: id(),
      organizationId: input.organizationId,
      requestId: input.requestId,
      stageId: input.stageId ?? null,
      actorUserId: actor.userId,
      action: input.action,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: now(),
    });
  }

  async function loadRequest(organizationId: string, requestId: string) {
    const request = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.id, requestId),
        eq(approvalRequest.organizationId, organizationId),
      ),
    });
    if (!request) notFound();
    const stages = await db
      .select()
      .from(approvalStage)
      .where(
        and(
          eq(approvalStage.requestId, requestId),
          eq(approvalStage.organizationId, organizationId),
        ),
      )
      .orderBy(approvalStage.position);
    return { request, stages };
  }

  async function decorate(
    actor: Actor,
    request: typeof approvalRequest.$inferSelect,
    stages: (typeof approvalStage.$inferSelect)[],
  ) {
    const asOf = now();
    const actionable = new Set(
      actionableStageIds(stages.map(toEvaluable), {
        status: request.status,
        stale: isStale(request.stale),
      }),
    );
    return stages.map((stage) => ({
      ...stage,
      actionable: actionable.has(stage.id),
      canAct: actionable.has(stage.id) && canActorDecide(actor, toEvaluable(stage)),
      overdue: stage.status === "PENDING" && isOverdue(stage.dueAt, asOf),
    }));
  }

  async function syncSchedule(
    actor: Actor,
    organizationId: string,
    request: typeof approvalRequest.$inferSelect,
    stages: (typeof approvalStage.$inferSelect)[],
  ) {
    if (request.status !== "IN_PROGRESS" || isStale(request.stale)) return stages;
    const asOf = now();
    const actionable = new Set(
      actionableStageIds(stages.map(toEvaluable), { status: request.status, stale: false }),
    );
    let changed = false;
    for (const stage of stages) {
      if (!actionable.has(stage.id) || stage.status !== "PENDING") continue;
      if (!stage.dueAt && stage.dueInDays) {
        const dueAt = dueAtFromDays(asOf, stage.dueInDays);
        await db.update(approvalStage).set({ dueAt }).where(eq(approvalStage.id, stage.id));
        stage.dueAt = dueAt;
        changed = true;
      }
      if (reminderDue(stage.dueAt, stage.reminderHoursBefore, stage.reminderSentAt, asOf)) {
        await notifyRole(db, {
          organizationId,
          role: stage.requiredRole,
          title: "Approval due soon",
          body: stage.name,
          entityId: request.id,
          kind: "APPROVAL_REMINDER",
        });
        const sentAt = asOf;
        await db
          .update(approvalStage)
          .set({ reminderSentAt: sentAt })
          .where(eq(approvalStage.id, stage.id));
        stage.reminderSentAt = sentAt;
        await writeEvent(db, actor, {
          organizationId,
          requestId: request.id,
          stageId: stage.id,
          action: "REMIND",
        });
        changed = true;
      }
      if (isOverdue(stage.dueAt, asOf) && !stage.escalatedAt && stage.escalateToRole) {
        await db
          .update(approvalStage)
          .set({ escalatedAt: asOf })
          .where(eq(approvalStage.id, stage.id));
        stage.escalatedAt = asOf;
        await notifyRole(db, {
          organizationId,
          role: stage.escalateToRole,
          title: "Approval escalated",
          body: stage.name,
          entityId: request.id,
          kind: "ESCALATION",
        });
        await writeEvent(db, actor, {
          organizationId,
          requestId: request.id,
          stageId: stage.id,
          action: "ESCALATE",
          payload: { role: stage.escalateToRole },
        });
        await writeAudit(db, actor, "approval.escalate", "approval_stage", stage.id, {
          requestId: request.id,
        });
        changed = true;
      }
    }
    await processNotificationDeliveries(db, options, { organizationId, now: asOf });
    return changed ? (await loadRequest(organizationId, request.id)).stages : stages;
  }

  async function syncStale(
    actor: Actor,
    organizationId: string,
    request: typeof approvalRequest.$inferSelect,
  ) {
    if (
      (request.status !== "IN_PROGRESS" && request.status !== "CHANGES_REQUESTED") ||
      isStale(request.stale)
    ) {
      return request;
    }
    const row = await helpers.scopedContract(organizationId, request.contractId);
    const snap = materialSnapshot(await loadFacts(organizationId, row));
    if (!snapshotsDiffer(request.snapshotJson, snap)) return request;
    const stamp = now();
    await db
      .update(approvalRequest)
      .set({
        stale: true,
        invalidatedReason: "Material contract fields changed after this approval started.",
        updatedAt: stamp,
      })
      .where(eq(approvalRequest.id, request.id));
    await db
      .update(contract)
      .set({ status: "IN_REVIEW", updatedAt: stamp })
      .where(and(eq(contract.id, row.id), eq(contract.organizationId, organizationId)));
    await writeEvent(db, actor, {
      organizationId,
      requestId: request.id,
      action: "INVALIDATE",
    });
    await writeAudit(db, actor, "approval.invalidate", "approval_request", request.id, {
      contractId: row.id,
    });
    return {
      ...request,
      stale: true,
      invalidatedReason: "Material contract fields changed after this approval started.",
      updatedAt: stamp,
    };
  }

  async function getBundle(actor: Actor, organizationId: string, requestId: string) {
    let { request, stages } = await loadRequest(organizationId, requestId);
    request = await syncStale(actor, organizationId, request);
    stages = await syncSchedule(actor, organizationId, request, stages);
    const parent = await helpers.scopedContract(organizationId, request.contractId);
    const [comments, events] = await Promise.all([
      db
        .select()
        .from(approvalComment)
        .where(
          and(
            eq(approvalComment.requestId, requestId),
            eq(approvalComment.organizationId, organizationId),
          ),
        )
        .orderBy(approvalComment.createdAt),
      db
        .select()
        .from(approvalEvent)
        .where(
          and(
            eq(approvalEvent.requestId, requestId),
            eq(approvalEvent.organizationId, organizationId),
          ),
        )
        .orderBy(approvalEvent.createdAt),
    ]);
    return {
      request,
      contract: { id: parent.id, title: parent.title, status: parent.status },
      stages: await decorate(actor, request, stages),
      comments,
      events,
    };
  }

  return {
    async listWorkflows(actor: Actor) {
      const organizationId = requirePermission(actor, "contracts:read");
      const templates = await db
        .select()
        .from(approvalWorkflowTemplate)
        .where(eq(approvalWorkflowTemplate.organizationId, organizationId))
        .orderBy(approvalWorkflowTemplate.name);
      const stages = await db
        .select()
        .from(approvalStageTemplate)
        .where(eq(approvalStageTemplate.organizationId, organizationId));
      return templates.map((template) => ({
        ...template,
        stages: stages
          .filter((stage) => stage.templateId === template.id)
          .sort((a, b) => a.position - b.position),
      }));
    },

    async createWorkflow(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "workflows:manage");
      const input = parseInput(createWorkflowSchema, raw);
      const templateId = id();
      const createdAt = now();
      const template = {
        id: templateId,
        organizationId,
        name: input.name,
        status: "ACTIVE" as const,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      };
      const stages = input.stages.map((stage, index) => ({
        id: id(),
        organizationId,
        templateId,
        position: index + 1,
        name: stage.name,
        requiredRole: stage.requiredRole,
        step: stage.step ?? index + 1,
        conditionJson: stage.condition ? JSON.stringify(stage.condition) : null,
        dueInDays: stage.dueInDays ?? null,
        reminderHoursBefore: stage.reminderHoursBefore ?? null,
        escalateToRole: stage.escalateToRole ?? null,
        allowDelegate: stage.allowDelegate ?? true,
      }));
      await db.transaction(async (tx) => {
        await tx.insert(approvalWorkflowTemplate).values(template);
        await tx.insert(approvalStageTemplate).values(stages);
        await writeAudit(tx, actor, "workflow.create", "approval_workflow_template", templateId, {
          name: template.name,
        });
      });
      return { ...template, stages };
    },

    async listApprovals(
      actor: Actor,
      page: PageQuery,
      filters: { contractId?: string | null; status?: string | null } = {},
    ) {
      const organizationId = requirePermission(actor, "contracts:read");
      const status = optionalFilter(filters.status, APPROVAL_STATUSES);
      const conditions = [eq(approvalRequest.organizationId, organizationId)];
      if (filters.contractId) {
        await helpers.scopedContract(organizationId, filters.contractId);
        conditions.push(eq(approvalRequest.contractId, filters.contractId));
      }
      if (status) conditions.push(eq(approvalRequest.status, status));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select({
            request: approvalRequest,
            contractTitle: contract.title,
          })
          .from(approvalRequest)
          .innerJoin(
            contract,
            and(
              eq(contract.id, approvalRequest.contractId),
              eq(contract.organizationId, organizationId),
            ),
          )
          .where(where)
          .orderBy(desc(approvalRequest.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(approvalRequest).where(where),
      ]);
      return pageResult(
        items.map((row) => ({
          ...row.request,
          contractTitle: row.contractTitle,
        })),
        Number(totalRow[0]?.total ?? 0),
        page,
      );
    },

    async getApproval(actor: Actor, requestId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      return getBundle(actor, organizationId, requestId);
    },

    async startApproval(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(startApprovalSchema, raw);
      const parent = await helpers.scopedContract(organizationId, contractId);
      if (input.idempotencyKey) {
        const replay = await db.query.approvalRequest.findFirst({
          where: and(
            eq(approvalRequest.organizationId, organizationId),
            eq(approvalRequest.idempotencyKey, input.idempotencyKey),
          ),
        });
        if (replay) {
          const bundle = await getBundle(actor, organizationId, replay.id);
          return { ...bundle, replayed: true };
        }
      }
      const template = await db.query.approvalWorkflowTemplate.findFirst({
        where: and(
          eq(approvalWorkflowTemplate.id, input.templateId),
          eq(approvalWorkflowTemplate.organizationId, organizationId),
        ),
      });
      if (!template) notFound();
      if (template.status !== "ACTIVE") {
        throw new AppError("CONFLICT", "This workflow is archived.");
      }
      const inProgress = await db.query.approvalRequest.findFirst({
        where: and(
          eq(approvalRequest.contractId, contractId),
          eq(approvalRequest.organizationId, organizationId),
          inArray(approvalRequest.status, ["IN_PROGRESS", "CHANGES_REQUESTED"]),
        ),
      });
      if (inProgress) throw new AppError("CONFLICT", "An approval is already in progress.");
      const stageTemplates = await db
        .select()
        .from(approvalStageTemplate)
        .where(
          and(
            eq(approvalStageTemplate.templateId, template.id),
            eq(approvalStageTemplate.organizationId, organizationId),
          ),
        )
        .orderBy(approvalStageTemplate.position);
      if (stageTemplates.length === 0) {
        throw new AppError("VALIDATION", "This workflow has no stages.");
      }
      const facts = await loadFacts(organizationId, parent);
      const snapshot = materialSnapshot(facts);
      const requestId = id();
      const createdAt = now();
      const request = {
        id: requestId,
        organizationId,
        contractId,
        templateId: template.id,
        status: "IN_PROGRESS" as const,
        snapshotJson: snapshot,
        stale: false,
        invalidatedReason: null as string | null,
        resubmitCount: 0,
        idempotencyKey: input.idempotencyKey ?? null,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      };
      const stages = stageTemplates.map((stage) => {
        const include = evaluateCondition(facts, parseCondition(stage.conditionJson));
        return {
          id: id(),
          organizationId,
          requestId,
          position: stage.position,
          name: stage.name,
          requiredRole: stage.requiredRole,
          status: include ? ("PENDING" as const) : ("SKIPPED" as const),
          decidedByUserId: null as string | null,
          decidedAt: null as Date | null,
          comment: null as string | null,
          step: stage.step,
          conditionJson: stage.conditionJson,
          dueAt: null as Date | null,
          dueInDays: stage.dueInDays,
          reminderHoursBefore: stage.reminderHoursBefore,
          reminderSentAt: null as Date | null,
          escalateToRole: stage.escalateToRole,
          escalatedAt: null as Date | null,
          delegatedToUserId: null as string | null,
          delegatedByUserId: null as string | null,
          delegatedAt: null as Date | null,
          skippedReason: include ? null : "Stage condition did not match the contract snapshot.",
          allowDelegate: stage.allowDelegate,
        };
      });
      if (stages.every((stage) => stage.status === "SKIPPED")) {
        throw new AppError(
          "VALIDATION",
          "No stages apply to this contract under the workflow conditions.",
        );
      }
      const firstStep = new Set(
        actionableStageIds(stages.map(toEvaluable), { status: "IN_PROGRESS", stale: false }),
      );
      for (const stage of stages) {
        if (firstStep.has(stage.id) && stage.dueInDays) {
          stage.dueAt = dueAtFromDays(createdAt, stage.dueInDays);
        }
      }
      try {
        await db.transaction(async (tx) => {
          await tx.insert(approvalRequest).values(request);
          await tx.insert(approvalStage).values(stages);
          await tx
            .update(contract)
            .set({ status: "PENDING_APPROVAL", updatedAt: createdAt })
            .where(and(eq(contract.id, contractId), eq(contract.organizationId, organizationId)));
          await writeEvent(tx, actor, {
            organizationId,
            requestId,
            action: "START",
            payload: { templateId: template.id },
            idempotencyKey: input.idempotencyKey ?? null,
          });
          await writeAudit(tx, actor, "approval.start", "approval_request", requestId, {
            contractId,
          });
          const first = actionableStageIds(stages.map(toEvaluable), {
            status: "IN_PROGRESS",
            stale: false,
          });
          const roles = new Set(
            stages.filter((stage) => first.includes(stage.id)).map((stage) => stage.requiredRole),
          );
          for (const role of roles) {
            await notifyRole(tx, {
              organizationId,
              role,
              title: "Approval needed",
              body: `${parent.title} · ${template.name}`,
              entityId: requestId,
              kind: "APPROVAL_REMINDER",
              exceptUserId: actor.userId,
            });
          }
        });
      } catch (error) {
        if (input.idempotencyKey && isUniqueFailure(error)) {
          const replay = await db.query.approvalRequest.findFirst({
            where: and(
              eq(approvalRequest.organizationId, organizationId),
              eq(approvalRequest.idempotencyKey, input.idempotencyKey),
            ),
          });
          if (replay) {
            const bundle = await getBundle(actor, organizationId, replay.id);
            return { ...bundle, replayed: true };
          }
        }
        throw error;
      }
      await processNotificationDeliveries(db, options, { organizationId, now: now() });
      const bundle = await getBundle(actor, organizationId, requestId);
      return { ...bundle, replayed: false };
    },

    async decideApproval(actor: Actor, requestId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "approvals:act");
      const input = parseInput(decideApprovalSchema, raw);
      if (input.decision !== "APPROVED" && !input.comment) {
        throw new AppError("VALIDATION", "Add a comment when rejecting or requesting changes.");
      }
      if (input.idempotencyKey) {
        const replay = await db.query.approvalEvent.findFirst({
          where: and(
            eq(approvalEvent.requestId, requestId),
            eq(approvalEvent.organizationId, organizationId),
            eq(approvalEvent.idempotencyKey, input.idempotencyKey),
          ),
        });
        if (replay) {
          return {
            requestId,
            stageId: replay.stageId,
            requestStatus: (await loadRequest(organizationId, requestId)).request.status,
            decision: input.decision,
            replayed: true,
          };
        }
      }
      const loaded = await loadRequest(organizationId, requestId);
      const stages = loaded.stages;
      const request = await syncStale(actor, organizationId, loaded.request);
      if (request.status !== "IN_PROGRESS") {
        throw new AppError("CONFLICT", "This approval is no longer in progress.");
      }
      if (isStale(request.stale)) {
        throw new AppError(
          "CONFLICT",
          "Contract details changed. Resubmit this approval before deciding.",
        );
      }
      const evaluable = stages.map(toEvaluable);
      const allowed = actionableStageIds(evaluable, { status: request.status, stale: false });
      let targetId = input.stageId;
      if (!targetId) {
        if (allowed.length !== 1) {
          throw new AppError("VALIDATION", "Choose which stage to decide.");
        }
        targetId = allowed[0]!;
      }
      const current = stages.find((stage) => stage.id === targetId);
      if (!current) notFound();
      if (current.status !== "PENDING") {
        throw new AppError("CONFLICT", "This stage has already been decided.");
      }
      if (!allowed.includes(targetId)) {
        throw new AppError("CONFLICT", "This stage is waiting on a prior step.");
      }
      if (!canActorDecide(actor, toEvaluable(current))) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.");
      }
      const decidedAt = now();
      const stageStatus =
        input.decision === "APPROVED"
          ? "APPROVED"
          : input.decision === "REJECTED"
            ? "REJECTED"
            : "CHANGES_REQUESTED";
      const remaining = stages.map((stage) => {
        if (stage.id === current.id) {
          return { ...toEvaluable(stage), status: stageStatus as EvaluableStage["status"] };
        }
        if (input.decision === "REJECTED" && stage.status === "PENDING") {
          return { ...toEvaluable(stage), status: "SKIPPED" as const };
        }
        return toEvaluable(stage);
      });
      const requestStatus = nextRequestStatus(remaining, input.decision);
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(approvalStage)
            .set({
              status: stageStatus,
              decidedByUserId: actor.userId,
              decidedAt,
              comment: input.comment ?? null,
            })
            .where(
              and(
                eq(approvalStage.id, current.id),
                eq(approvalStage.organizationId, organizationId),
              ),
            );
          if (input.decision === "REJECTED") {
            for (const stage of stages) {
              if (stage.id === current.id || stage.status !== "PENDING") continue;
              await tx
                .update(approvalStage)
                .set({
                  status: "SKIPPED",
                  skippedReason: "Request rejected.",
                })
                .where(eq(approvalStage.id, stage.id));
            }
          }
          await tx
            .update(approvalRequest)
            .set({ status: requestStatus, updatedAt: decidedAt })
            .where(
              and(
                eq(approvalRequest.id, requestId),
                eq(approvalRequest.organizationId, organizationId),
              ),
            );
          if (requestStatus === "APPROVED") {
            await tx
              .update(contract)
              .set({ status: "APPROVED", updatedAt: decidedAt })
              .where(
                and(
                  eq(contract.id, request.contractId),
                  eq(contract.organizationId, organizationId),
                ),
              );
          }
          if (requestStatus === "REJECTED" || requestStatus === "CHANGES_REQUESTED") {
            await tx
              .update(contract)
              .set({ status: "IN_REVIEW", updatedAt: decidedAt })
              .where(
                and(
                  eq(contract.id, request.contractId),
                  eq(contract.organizationId, organizationId),
                ),
              );
          }
          await writeEvent(tx, actor, {
            organizationId,
            requestId,
            stageId: current.id,
            action: "DECIDE",
            payload: { decision: input.decision },
            idempotencyKey: input.idempotencyKey ?? null,
          });
          await writeAudit(tx, actor, "approval.decide", "approval_request", requestId, {
            decision: input.decision,
            stageId: current.id,
          });
          if (requestStatus === "IN_PROGRESS") {
            const nextIds = actionableStageIds(
              remaining.map((stage) =>
                input.decision === "REJECTED" && stage.status === "PENDING"
                  ? { ...stage, status: "SKIPPED" as const }
                  : stage,
              ),
              { status: "IN_PROGRESS", stale: false },
            );
            const nextRoles = new Set(
              remaining
                .filter((stage) => nextIds.includes(stage.id))
                .map((stage) => stage.requiredRole),
            );
            for (const role of nextRoles) {
              await notifyRole(tx, {
                organizationId,
                role,
                title: "Approval needed",
                body: current.name,
                entityId: requestId,
                kind: "APPROVAL_REMINDER",
              });
            }
          } else {
            await dispatchNotification(
              db,
              options,
              {
                organizationId,
                userId: request.createdByUserId,
                kind: "APPROVAL_UPDATE",
                title:
                  requestStatus === "APPROVED"
                    ? "Approval completed"
                    : requestStatus === "REJECTED"
                      ? "Approval rejected"
                      : "Changes requested",
                body: current.name,
                entityType: "approval_request",
                entityId: requestId,
                at: decidedAt,
              },
              tx,
            );
          }
        });
      } catch (error) {
        if (input.idempotencyKey && isUniqueFailure(error)) {
          const replay = await db.query.approvalEvent.findFirst({
            where: and(
              eq(approvalEvent.requestId, requestId),
              eq(approvalEvent.organizationId, organizationId),
              eq(approvalEvent.idempotencyKey, input.idempotencyKey),
            ),
          });
          if (replay) {
            return {
              requestId,
              stageId: replay.stageId,
              requestStatus: (await loadRequest(organizationId, requestId)).request.status,
              decision: input.decision,
              replayed: true,
            };
          }
        }
        throw error;
      }
      await processNotificationDeliveries(db, options, { organizationId, now: now() });
      return {
        requestId,
        stageId: current.id,
        requestStatus,
        decision: input.decision,
        replayed: false,
      };
    },

    async resubmitApproval(actor: Actor, requestId: string, raw: unknown = {}) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(resubmitApprovalSchema, raw ?? {});
      const { request, stages } = await loadRequest(organizationId, requestId);
      if (
        request.status !== "CHANGES_REQUESTED" &&
        !(request.status === "IN_PROGRESS" && isStale(request.stale))
      ) {
        throw new AppError(
          "CONFLICT",
          "Only a stale or changes-requested approval can be resubmitted.",
        );
      }
      const parent = await helpers.scopedContract(organizationId, request.contractId);
      const facts = await loadFacts(organizationId, parent);
      const snapshot = materialSnapshot(facts);
      const stamp = now();
      const resetAll = isStale(request.stale);
      await db.transaction(async (tx) => {
        for (const stage of stages) {
          const include = evaluateCondition(facts, parseCondition(stage.conditionJson));
          if (!include) {
            await tx
              .update(approvalStage)
              .set({
                status: "SKIPPED",
                skippedReason: "Stage condition did not match the contract snapshot.",
                decidedByUserId: null,
                decidedAt: null,
              })
              .where(eq(approvalStage.id, stage.id));
            continue;
          }
          const reopen =
            resetAll || stage.status === "CHANGES_REQUESTED" || stage.status === "SKIPPED";
          if (reopen) {
            await tx
              .update(approvalStage)
              .set({
                status: "PENDING",
                skippedReason: null,
                decidedByUserId: null,
                decidedAt: null,
                comment: stage.status === "CHANGES_REQUESTED" ? stage.comment : null,
                reminderSentAt: null,
                escalatedAt: null,
                dueAt: stage.dueInDays ? dueAtFromDays(stamp, stage.dueInDays) : null,
              })
              .where(eq(approvalStage.id, stage.id));
          }
        }
        await tx
          .update(approvalRequest)
          .set({
            status: "IN_PROGRESS",
            stale: false,
            invalidatedReason: null,
            snapshotJson: snapshot,
            resubmitCount: request.resubmitCount + 1,
            updatedAt: stamp,
          })
          .where(eq(approvalRequest.id, requestId));
        await tx
          .update(contract)
          .set({ status: "PENDING_APPROVAL", updatedAt: stamp })
          .where(and(eq(contract.id, parent.id), eq(contract.organizationId, organizationId)));
        await writeEvent(tx, actor, {
          organizationId,
          requestId,
          action: "RESUBMIT",
          payload: { comment: input.comment ?? null },
        });
        await writeAudit(tx, actor, "approval.resubmit", "approval_request", requestId, {
          contractId: parent.id,
        });
      });
      return getBundle(actor, organizationId, requestId);
    },

    async commentApproval(actor: Actor, requestId: string, raw: unknown) {
      const organizationId = orgId(actor);
      if (!can(actor, "approvals:act") && !can(actor, "contracts:write")) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.");
      }
      const input = parseInput(commentApprovalSchema, raw);
      const { request, stages } = await loadRequest(organizationId, requestId);
      if (input.stageId && !stages.some((stage) => stage.id === input.stageId)) notFound();
      const row = {
        id: id(),
        organizationId,
        requestId,
        stageId: input.stageId ?? null,
        body: input.body,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.insert(approvalComment).values(row);
      await writeEvent(db, actor, {
        organizationId,
        requestId,
        stageId: input.stageId ?? null,
        action: "COMMENT",
      });
      await writeAudit(db, actor, "approval.comment", "approval_comment", row.id, {
        requestId: request.id,
      });
      return row;
    },

    async delegateApproval(actor: Actor, requestId: string, stageId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "approvals:act");
      const input = parseInput(delegateApprovalSchema, raw);
      const { request, stages } = await loadRequest(organizationId, requestId);
      if (request.status !== "IN_PROGRESS" || isStale(request.stale)) {
        throw new AppError("CONFLICT", "This approval cannot be delegated now.");
      }
      const stage = stages.find((row) => row.id === stageId);
      if (!stage) notFound();
      if (stage.status !== "PENDING") {
        throw new AppError("CONFLICT", "Only a pending stage can be delegated.");
      }
      if (stage.delegatedToUserId) {
        throw new AppError("CONFLICT", "This stage is already delegated.");
      }
      if (!stage.allowDelegate) {
        throw new AppError("FORBIDDEN", "Delegation is turned off for this stage.");
      }
      if (
        !canActorDecide(actor, toEvaluable(stage)) &&
        actor.organizationRole !== stage.requiredRole
      ) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.");
      }
      if (input.toUserId === actor.userId) {
        throw new AppError("VALIDATION", "Choose a different reviewer.");
      }
      const member = await db.query.membership.findFirst({
        where: and(
          eq(membership.organizationId, organizationId),
          eq(membership.userId, input.toUserId),
        ),
      });
      if (!member) notFound();
      if (member.role !== stage.requiredRole && member.role !== "ORGANIZATION_ADMIN") {
        throw new AppError(
          "VALIDATION",
          "Delegate to someone with the required role or an organization admin.",
        );
      }
      const stamp = now();
      await db
        .update(approvalStage)
        .set({
          delegatedToUserId: input.toUserId,
          delegatedByUserId: actor.userId,
          delegatedAt: stamp,
        })
        .where(eq(approvalStage.id, stageId));
      await writeEvent(db, actor, {
        organizationId,
        requestId,
        stageId,
        action: "DELEGATE",
        payload: { toUserId: input.toUserId },
      });
      await writeAudit(db, actor, "approval.delegate", "approval_stage", stageId, {
        toUserId: input.toUserId,
      });
      await dispatchNotification(db, options, {
        organizationId,
        userId: input.toUserId,
        kind: "APPROVAL_UPDATE",
        title: "Approval delegated to you",
        body: stage.name,
        entityType: "approval_request",
        entityId: requestId,
        at: stamp,
      });
      const [assignee] = await db.select().from(user).where(eq(user.id, input.toUserId)).limit(1);
      return { stageId, toUserId: input.toUserId, toName: assignee?.name ?? null };
    },

    async listReviewers(actor: Actor, requestId: string, stageId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      const { stages } = await loadRequest(organizationId, requestId);
      const stage = stages.find((row) => row.id === stageId);
      if (!stage) notFound();
      const members = await db
        .select({
          userId: membership.userId,
          role: membership.role,
          name: user.name,
          email: user.email,
        })
        .from(membership)
        .innerJoin(user, eq(user.id, membership.userId))
        .where(eq(membership.organizationId, organizationId));
      return members.filter(
        (member) => member.role === stage.requiredRole || member.role === "ORGANIZATION_ADMIN",
      );
    },

    async syncMaterialChange(actor: Actor, contractId: string) {
      const organizationId = actor.organizationId;
      if (!organizationId) return;
      const open = await db
        .select()
        .from(approvalRequest)
        .where(
          and(
            eq(approvalRequest.contractId, contractId),
            eq(approvalRequest.organizationId, organizationId),
            inArray(approvalRequest.status, ["IN_PROGRESS", "CHANGES_REQUESTED"]),
          ),
        );
      for (const request of open) {
        await syncStale(actor, organizationId, request);
      }
    },
  };
}

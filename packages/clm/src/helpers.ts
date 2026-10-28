import { AppError } from "@accordiq/core";
import { assertCan, requireOrganizationId, type Actor, type Permission } from "@accordiq/auth";
import { auditEvent, type Database } from "@accordiq/db";

export function id(): string {
  return crypto.randomUUID();
}

export function orgId(actor: Actor): string {
  return requireOrganizationId(actor);
}

export function notFound(): never {
  throw new AppError("NOT_FOUND", "Not found.");
}

export function requirePermission(actor: Actor, permission: Permission): string {
  const organizationId = orgId(actor);
  assertCan(actor, permission);
  return organizationId;
}

type InsertExecutor = Pick<Database, "insert">;

export async function writeAudit(
  executor: InsertExecutor,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, string | number | boolean | null>,
): Promise<void> {
  await executor.insert(auditEvent).values({
    id: id(),
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action,
    entityType,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date(),
  });
}

export function optionalFilter<T>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new AppError("VALIDATION", "Unknown filter value.");
}

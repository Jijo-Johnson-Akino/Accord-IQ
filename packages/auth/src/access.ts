import { and, desc, eq } from "drizzle-orm";
import { AppError } from "@accordiq/core";
import type { Database } from "@accordiq/db";
import { auditEvent, membership, organization, session, tenantRecord, user } from "@accordiq/db";
import { assertCan, isOrgRole, requireOrganizationId, type Actor, type OrgRole } from "./policy";

function id(): string {
  return crypto.randomUUID();
}

export function createAccess(db: Database) {
  return {
    async listAccessibleOrganizations(actor: Actor) {
      if (actor.platformRole === "SUPERADMIN") {
        assertCan(actor, "platform:manage");
        return db.select().from(organization).orderBy(organization.name);
      }
      const rows = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: membership.role,
        })
        .from(membership)
        .innerJoin(organization, eq(membership.organizationId, organization.id))
        .where(eq(membership.userId, actor.userId));
      return rows;
    },

    async switchOrganization(actor: Actor, organizationId: string, sessionId: string) {
      const current = await db.query.session.findFirst({
        where: eq(session.id, sessionId),
      });
      if (!current || current.userId !== actor.userId) {
        throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
      }

      const org = await db.query.organization.findFirst({
        where: eq(organization.id, organizationId),
      });
      if (!org) throw new AppError("NOT_FOUND", "Not found.");

      if (actor.platformRole !== "SUPERADMIN") {
        const member = await db.query.membership.findFirst({
          where: and(
            eq(membership.organizationId, organizationId),
            eq(membership.userId, actor.userId),
          ),
        });
        if (!member) throw new AppError("NOT_FOUND", "Not found.");
      }

      await db
        .update(session)
        .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
        .where(eq(session.id, sessionId));

      await db.insert(auditEvent).values({
        id: id(),
        organizationId,
        actorUserId: actor.userId,
        action: "session.switch_organization",
      });
      return org;
    },

    async listMembers(actor: Actor) {
      const organizationId = requireOrganizationId(actor);
      assertCan(actor, "members:read");
      return db
        .select({
          membershipId: membership.id,
          role: membership.role,
          userId: user.id,
          name: user.name,
          email: user.email,
        })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .where(eq(membership.organizationId, organizationId));
    },

    async listRecords(actor: Actor) {
      const organizationId = requireOrganizationId(actor);
      assertCan(actor, "records:read");
      return db
        .select()
        .from(tenantRecord)
        .where(eq(tenantRecord.organizationId, organizationId))
        .orderBy(desc(tenantRecord.createdAt));
    },

    async getRecord(actor: Actor, recordId: string) {
      const organizationId = requireOrganizationId(actor);
      assertCan(actor, "records:read");
      const row = await db.query.tenantRecord.findFirst({
        where: and(eq(tenantRecord.id, recordId), eq(tenantRecord.organizationId, organizationId)),
      });
      if (!row) throw new AppError("NOT_FOUND", "Not found.");
      return row;
    },

    async createRecord(actor: Actor, title: string) {
      const organizationId = requireOrganizationId(actor);
      assertCan(actor, "records:write");
      const trimmed = title.trim();
      if (!trimmed) throw new AppError("VALIDATION", "Title is required.");
      const row = {
        id: id(),
        organizationId,
        title: trimmed,
        createdByUserId: actor.userId,
        createdAt: new Date(),
      };
      await db.insert(tenantRecord).values(row);
      await db.insert(auditEvent).values({
        id: id(),
        organizationId,
        actorUserId: actor.userId,
        action: "record.create",
      });
      return row;
    },
  };
}

export type Access = ReturnType<typeof createAccess>;

export function parseOrgRole(value: string): OrgRole {
  if (!isOrgRole(value)) throw new AppError("VALIDATION", "Unknown role.");
  return value;
}

import { and, eq } from "drizzle-orm";
import type { Database } from "@accordiq/db";
import { membership, organization, session, user } from "@accordiq/db";
import { isOrgRole, isPlatformRole, type Actor } from "./policy";

interface SessionPayload {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole?: string | null;
  };
  session: {
    id: string;
    activeOrganizationId?: string | null;
  };
}

/**
 * Build the request actor from the authenticated session. Active organization is read from the
 * session row in the database, never from a client-supplied identifier.
 */
export async function loadActor(db: Database, payload: SessionPayload): Promise<Actor> {
  const platformRole = isPlatformRole(payload.user.platformRole ?? null) ? "SUPERADMIN" : null;

  const sessionRow = await db.query.session.findFirst({
    where: eq(session.id, payload.session.id),
  });
  const activeId = sessionRow?.activeOrganizationId ?? payload.session.activeOrganizationId ?? null;

  let organizationId: string | null = null;
  let organizationName: string | null = null;
  let organizationRole: Actor["organizationRole"] = null;

  if (activeId) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, activeId),
    });
    if (org) {
      const member = await db.query.membership.findFirst({
        where: and(eq(membership.organizationId, activeId), eq(membership.userId, payload.user.id)),
      });
      if (member && isOrgRole(member.role)) {
        organizationId = org.id;
        organizationName = org.name;
        organizationRole = member.role;
      } else if (platformRole) {
        organizationId = org.id;
        organizationName = org.name;
      }
    }
  }

  return {
    userId: payload.user.id,
    email: payload.user.email,
    name: payload.user.name,
    platformRole,
    organizationId,
    organizationName,
    organizationRole,
  };
}

export async function defaultOrganizationId(db: Database, userId: string): Promise<string | null> {
  const memberships = await db
    .select({ organizationId: membership.organizationId })
    .from(membership)
    .where(eq(membership.userId, userId))
    .limit(1);
  if (memberships[0]?.organizationId) return memberships[0].organizationId;

  const account = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (account?.platformRole === "SUPERADMIN") {
    const org = await db
      .select({ id: organization.id })
      .from(organization)
      .orderBy(organization.name)
      .limit(1);
    return org[0]?.id ?? null;
  }
  return null;
}

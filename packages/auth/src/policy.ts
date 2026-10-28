import { AppError } from "@accordiq/core";

export const PLATFORM_ROLE = "SUPERADMIN" as const;
export type PlatformRole = typeof PLATFORM_ROLE;

export const ORG_ROLES = [
  "ORGANIZATION_ADMIN",
  "LEGAL",
  "FINANCE",
  "PROCUREMENT",
  "DEPARTMENT_MANAGER",
  "VIEWER",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];
export type Role = PlatformRole | OrgRole;

export const PERMISSIONS = [
  "org:read",
  "org:manage",
  "members:read",
  "members:manage",
  "settings:manage",
  "contracts:read",
  "contracts:write",
  "approvals:act",
  "finance:read",
  "finance:write",
  "audit:read",
  "records:read",
  "records:write",
  "risk:review",
  "clauses:manage",
  "workflows:manage",
  "signatures:send",
  "platform:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER_PERMISSIONS: Permission[] = [
  "org:read",
  "members:read",
  "contracts:read",
  "finance:read",
  "audit:read",
  "records:read",
];

const OPERATOR_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  "contracts:write",
  "approvals:act",
  "records:write",
];

const LEGAL_PERMISSIONS: Permission[] = [
  ...OPERATOR_PERMISSIONS,
  "risk:review",
  "clauses:manage",
  "workflows:manage",
  "signatures:send",
];

const GRANTS: Record<OrgRole, readonly Permission[]> = {
  VIEWER: VIEWER_PERMISSIONS,
  DEPARTMENT_MANAGER: OPERATOR_PERMISSIONS,
  PROCUREMENT: OPERATOR_PERMISSIONS,
  LEGAL: LEGAL_PERMISSIONS,
  FINANCE: [...VIEWER_PERMISSIONS, "finance:write", "records:write", "approvals:act"],
  ORGANIZATION_ADMIN: PERMISSIONS.filter((permission) => permission !== "platform:manage"),
};

export interface Actor {
  userId: string;
  email: string;
  name: string;
  platformRole: PlatformRole | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationRole: OrgRole | null;
}

export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

export function isPlatformRole(value: string | null | undefined): value is PlatformRole {
  return value === PLATFORM_ROLE;
}

export function can(actor: Actor, permission: Permission): boolean {
  if (actor.platformRole === PLATFORM_ROLE) return true;
  if (!actor.organizationRole) return false;
  return GRANTS[actor.organizationRole].includes(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that.");
  }
}

/**
 * Tenant id used for queries. Always from the session actor — never from a URL or request body.
 */
export function requireOrganizationId(actor: Actor): string {
  if (!actor.organizationId) {
    throw new AppError("FORBIDDEN", "Select an organization first.");
  }
  return actor.organizationId;
}

export function roleLabel(actor: Actor): string {
  if (actor.platformRole === PLATFORM_ROLE) {
    return actor.organizationName ? `Superadmin · ${actor.organizationName}` : "Superadmin";
  }
  if (!actor.organizationRole) return "No organization";
  const labels: Record<OrgRole, string> = {
    ORGANIZATION_ADMIN: "Organization admin",
    LEGAL: "Legal",
    FINANCE: "Finance",
    PROCUREMENT: "Procurement",
    DEPARTMENT_MANAGER: "Department manager",
    VIEWER: "Viewer",
  };
  return labels[actor.organizationRole];
}

export function publicActor(actor: Actor) {
  return {
    userId: actor.userId,
    email: actor.email,
    name: actor.name,
    platformRole: actor.platformRole,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    organizationRole: actor.organizationRole,
    roleLabel: roleLabel(actor),
    permissions: PERMISSIONS.filter((permission) => can(actor, permission)),
  };
}

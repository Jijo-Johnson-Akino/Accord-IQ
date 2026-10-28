/**
 * Shape passed from the server layout into the client shell. Permissions listed here are for UI
 * only — every mutation is re-checked in the access layer.
 */
export interface ShellActor {
  userId: string;
  email: string;
  name: string;
  platformRole: "SUPERADMIN" | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationRole: string | null;
  roleLabel: string;
  permissions: string[];
}

export interface ShellOrganization {
  id: string;
  name: string;
}

export function hasPermission(actor: ShellActor, permission: string): boolean {
  return actor.permissions.includes(permission);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  return letters.toUpperCase() || "?";
}

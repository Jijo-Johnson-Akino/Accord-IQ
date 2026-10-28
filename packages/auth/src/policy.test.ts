import { describe, expect, it } from "vitest";
import { AppError } from "@accordiq/core";
import {
  assertCan,
  can,
  isOrgRole,
  requireOrganizationId,
  type Actor,
  type OrgRole,
} from "./policy";

function actor(partial: Partial<Actor> & Pick<Actor, "organizationRole" | "platformRole">): Actor {
  return {
    userId: "user_1",
    email: "user@example.com",
    name: "User",
    organizationId: "org_a",
    organizationName: "Northwind",
    ...partial,
  };
}

describe("policy", () => {
  it("does not treat SUPERADMIN as an organization membership role", () => {
    expect(isOrgRole("SUPERADMIN")).toBe(false);
    expect(isOrgRole("LEGAL")).toBe(true);
  });

  it("grants platform superadmins every permission", () => {
    const superadmin = actor({
      platformRole: "SUPERADMIN",
      organizationRole: null,
      organizationId: null,
    });
    expect(can(superadmin, "platform:manage")).toBe(true);
    expect(can(superadmin, "contracts:write")).toBe(true);
  });

  it("denies viewers write and platform permissions", () => {
    const viewer = actor({ platformRole: null, organizationRole: "VIEWER" });
    expect(can(viewer, "contracts:read")).toBe(true);
    expect(can(viewer, "records:read")).toBe(true);
    expect(can(viewer, "contracts:write")).toBe(false);
    expect(can(viewer, "records:write")).toBe(false);
    expect(can(viewer, "risk:review")).toBe(false);
    expect(can(viewer, "clauses:manage")).toBe(false);
    expect(can(viewer, "workflows:manage")).toBe(false);
    expect(can(viewer, "signatures:send")).toBe(false);
    expect(can(viewer, "approvals:act")).toBe(false);
    expect(can(viewer, "members:manage")).toBe(false);
    expect(can(viewer, "platform:manage")).toBe(false);
    expect(() => assertCan(viewer, "records:write")).toThrow(AppError);
  });

  it("lets legal write contracts, review risk, and manage clauses, but not the platform", () => {
    const legal = actor({ platformRole: null, organizationRole: "LEGAL" });
    expect(can(legal, "contracts:write")).toBe(true);
    expect(can(legal, "approvals:act")).toBe(true);
    expect(can(legal, "risk:review")).toBe(true);
    expect(can(legal, "clauses:manage")).toBe(true);
    expect(can(legal, "workflows:manage")).toBe(true);
    expect(can(legal, "signatures:send")).toBe(true);
    expect(can(legal, "platform:manage")).toBe(false);
    expect(can(legal, "org:manage")).toBe(false);
  });

  it("lets finance write finance data and act on finance approvals, but not manage workflows", () => {
    const finance = actor({ platformRole: null, organizationRole: "FINANCE" });
    expect(can(finance, "finance:write")).toBe(true);
    expect(can(finance, "approvals:act")).toBe(true);
    expect(can(finance, "workflows:manage")).toBe(false);
    expect(can(finance, "risk:review")).toBe(false);
    expect(can(finance, "clauses:manage")).toBe(false);
    expect(can(finance, "signatures:send")).toBe(false);
  });

  it("lets procurement write contracts but not review risk or change approved clauses", () => {
    const procurement = actor({ platformRole: null, organizationRole: "PROCUREMENT" });
    expect(can(procurement, "contracts:write")).toBe(true);
    expect(can(procurement, "risk:review")).toBe(false);
    expect(can(procurement, "clauses:manage")).toBe(false);
    expect(can(procurement, "signatures:send")).toBe(false);
  });

  it("lets organization admins manage members, risk, and clauses, but not the platform", () => {
    const admin = actor({ platformRole: null, organizationRole: "ORGANIZATION_ADMIN" });
    expect(can(admin, "members:manage")).toBe(true);
    expect(can(admin, "settings:manage")).toBe(true);
    expect(can(admin, "risk:review")).toBe(true);
    expect(can(admin, "clauses:manage")).toBe(true);
    expect(can(admin, "signatures:send")).toBe(true);
    expect(can(admin, "platform:manage")).toBe(false);
  });

  it("uses the session organization, not a caller-supplied id", () => {
    const legal = actor({ platformRole: null, organizationRole: "LEGAL", organizationId: "org_a" });
    expect(requireOrganizationId(legal)).toBe("org_a");
    expect(() =>
      requireOrganizationId(
        actor({ platformRole: null, organizationRole: "LEGAL", organizationId: null }),
      ),
    ).toThrow(/Select an organization/);
  });

  it("covers every organization role with an explicit grant table", () => {
    const roles: OrgRole[] = [
      "ORGANIZATION_ADMIN",
      "LEGAL",
      "FINANCE",
      "PROCUREMENT",
      "DEPARTMENT_MANAGER",
      "VIEWER",
    ];
    for (const role of roles) {
      expect(can(actor({ platformRole: null, organizationRole: role }), "org:read")).toBe(true);
    }
  });
});

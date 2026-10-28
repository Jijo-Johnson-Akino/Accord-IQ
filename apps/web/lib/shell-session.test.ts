import { describe, expect, it } from "vitest";
import { hasPermission, initials, type ShellActor } from "./shell-session";

const actor: ShellActor = {
  userId: "u1",
  email: "legal@northwind.example",
  name: "Lina Legal",
  platformRole: null,
  organizationId: "org_northwind",
  organizationName: "Northwind",
  organizationRole: "LEGAL",
  roleLabel: "Legal",
  permissions: ["records:read", "records:write"],
};

describe("shell session helpers", () => {
  it("treats the permission list as UI-only membership of the server-computed set", () => {
    expect(hasPermission(actor, "records:write")).toBe(true);
    expect(hasPermission(actor, "platform:manage")).toBe(false);
  });

  it("builds initials from the display name", () => {
    expect(initials("Lina Legal")).toBe("LL");
    expect(initials("Asha")).toBe("A");
  });
});

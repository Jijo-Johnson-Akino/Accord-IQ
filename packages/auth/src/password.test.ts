import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a hash of the same password and rejects another", async () => {
    const hash = await hashPassword("Dev-only-passw0rd!");
    expect(hash).not.toContain("Dev-only-passw0rd!");
    expect(await verifyPassword({ hash, password: "Dev-only-passw0rd!" })).toBe(true);
    expect(await verifyPassword({ hash, password: "some-other-pass" })).toBe(false);
  });

  it("rejects a malformed hash without throwing", async () => {
    expect(await verifyPassword({ hash: "not-a-hash", password: "Dev-only-passw0rd!" })).toBe(
      false,
    );
  });
});

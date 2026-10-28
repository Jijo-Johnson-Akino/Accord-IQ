import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-path";

describe("safeNextPath", () => {
  it("allows in-app paths and rejects open redirects", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/contracts?tab=open")).toBe("/contracts?tab=open");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/signup")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

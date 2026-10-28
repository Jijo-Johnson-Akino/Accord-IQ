import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors";
import { parseInput } from "./parse";

describe("parseInput", () => {
  it("returns parsed data and strips unknown keys", () => {
    const schema = z.object({ title: z.string().min(1) });
    expect(parseInput(schema, { title: "MSA", organizationId: "org_other" })).toEqual({
      title: "MSA",
    });
  });

  it("does not echo the received value in validation errors", () => {
    const schema = z.object({ password: z.string().min(10) });
    try {
      parseInput(schema, { password: "hunter2" });
      throw new Error("expected parseInput to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});

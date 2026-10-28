import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets later Tailwind classes win conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  // Regression: custom font sizes were misread as colors and deleted real text colors.
  it("keeps a text color alongside a custom font size", () => {
    expect(cn("text-surface", "text-small")).toBe("text-surface text-small");
    expect(cn("text-caption", "text-primary-strong")).toBe("text-caption text-primary-strong");
  });

  it("still lets a later custom font size replace an earlier one", () => {
    expect(cn("text-small", "text-h3")).toBe("text-h3");
  });

  it("still lets a later text color replace an earlier one", () => {
    expect(cn("text-ink", "text-primary")).toBe("text-primary");
  });
});

import { describe, expect, it } from "vitest";
import { getOverviewSnapshot, isDemoDataEnabled } from "./demo-data";

describe("isDemoDataEnabled", () => {
  it("is off by default", () => {
    expect(isDemoDataEnabled({})).toBe(false);
    expect(isDemoDataEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  it("turns on only in non-production when the flag is the string true", () => {
    expect(isDemoDataEnabled({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_DATA: "true" })).toBe(
      true,
    );
    expect(isDemoDataEnabled({ NODE_ENV: "test", NEXT_PUBLIC_DEMO_DATA: "true" })).toBe(true);
    expect(isDemoDataEnabled({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_DATA: "true" })).toBe(
      false,
    );
    expect(isDemoDataEnabled({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_DATA: "1" })).toBe(false);
  });
});

describe("getOverviewSnapshot", () => {
  it("returns empty figures with no invented counts", () => {
    const snapshot = getOverviewSnapshot({ NODE_ENV: "development" });
    expect(snapshot.source).toBe("empty");
    expect(snapshot.contracts).toBeNull();
    expect(snapshot.activity).toEqual([]);
    expect(snapshot.renewals).toEqual([]);
    expect(snapshot.lifecycle.every((row) => row.count === null)).toBe(true);
  });

  it("returns labeled demo figures only when the flag is on", () => {
    const snapshot = getOverviewSnapshot({
      NODE_ENV: "development",
      NEXT_PUBLIC_DEMO_DATA: "true",
    });
    expect(snapshot.source).toBe("demo");
    expect(snapshot.contracts).toBe(24);
  });
});

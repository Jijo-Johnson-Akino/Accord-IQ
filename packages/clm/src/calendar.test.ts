import { describe, expect, it } from "vitest";
import {
  addIsoDays,
  addIsoMonths,
  addIsoYears,
  calendarDate,
  compareIsoDays,
  nextOccurrenceDueOn,
  parseIsoDay,
  subtractNoticeDays,
} from "./calendar";

describe("calendar dates", () => {
  it("rejects impossible civil dates", () => {
    expect(parseIsoDay("2026-02-29")).toBeNull();
    expect(parseIsoDay("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDay("2026-13-01")).toBeNull();
  });

  it("uses the organization timezone at a UTC date boundary", () => {
    const instant = new Date("2026-10-28T23:30:00.000Z");
    expect(calendarDate(instant, "UTC")).toBe("2026-10-28");
    expect(calendarDate(instant, "America/New_York")).toBe("2026-10-28");
    expect(calendarDate(instant, "Asia/Kolkata")).toBe("2026-10-29");
  });

  it("does not shift a civil date across a DST spring-forward", () => {
    expect(addIsoDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(calendarDate(new Date("2026-03-08T07:00:00.000Z"), "America/New_York")).toBe(
      "2026-03-08",
    );
  });

  it("clamps month-end and leap-day recurrence", () => {
    expect(addIsoMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addIsoMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addIsoYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(nextOccurrenceDueOn("2026-01-31", "MONTHLY", 1)).toBe("2026-02-28");
    expect(nextOccurrenceDueOn("2026-01-08", "WEEKLY", 2)).toBe("2026-01-22");
    expect(nextOccurrenceDueOn("2026-01-08", "QUARTERLY", 1)).toBe("2026-04-08");
    expect(nextOccurrenceDueOn("2026-01-08", "ONCE", 1)).toBeNull();
  });

  it("computes notice dates backward from expiry", () => {
    expect(subtractNoticeDays("2026-12-31", 30)).toBe("2026-12-01");
    expect(subtractNoticeDays("2026-01-10", 30)).toBe("2025-12-11");
    expect(compareIsoDays("2026-01-10", "2026-01-11")).toBe(-1);
  });
});

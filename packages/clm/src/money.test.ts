import { describe, expect, it } from "vitest";
import { AppError } from "@accordiq/core";
import {
  amountToMinor,
  formatMinorAmount,
  minorDigits,
  minorToMajorInput,
  moneyToMinor,
} from "./money";

describe("money helpers", () => {
  it("converts decimal amounts to integer minor units", () => {
    expect(amountToMinor("125000.50")).toBe(12500050);
    expect(moneyToMinor({ valueMinor: 10 })).toBe(10);
    expect(moneyToMinor({ value: "1.2" })).toBe(120);
    expect(moneyToMinor({})).toBeNull();
    expect(formatMinorAmount(12500000, "USD")).toContain("125,000.00");
  });

  it("uses zero decimal digits for JPY and two for other supported currencies", () => {
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("USD")).toBe(2);
    expect(amountToMinor("1500", "JPY")).toBe(1500);
    expect(moneyToMinor({ value: "1500", currency: "JPY" })).toBe(1500);
    expect(minorToMajorInput(1500, "JPY")).toBe("1500");
    expect(formatMinorAmount(1500, "JPY")).toMatch(/1,500/);
    expect(formatMinorAmount(1500, "JPY")).not.toMatch(/1,500\.00/);
  });

  it("rejects malformed amounts and JPY fractions", () => {
    expect(() => amountToMinor("12.345")).toThrow(AppError);
    expect(() => amountToMinor("-1")).toThrow(AppError);
    expect(() => amountToMinor("1500.5", "JPY")).toThrow(AppError);
  });
});

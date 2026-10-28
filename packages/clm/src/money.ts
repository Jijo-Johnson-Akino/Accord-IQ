import { AppError } from "@accordiq/core";

/** ISO 4217 minor-unit digits for currencies AccordIQ stores. JPY has zero; the rest have two. */
export function minorDigits(currency: string | null | undefined): number {
  return currency === "JPY" ? 0 : 2;
}

function amountPattern(digits: number): RegExp {
  if (digits === 0) return /^\d+$/;
  return new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
}

/** Convert a decimal amount string to integer minor units using the currency's ISO scale. */
export function amountToMinor(value: string, currency?: string | null): number {
  const trimmed = value.trim();
  const digits = minorDigits(currency);
  if (!amountPattern(digits).test(trimmed)) {
    throw new AppError(
      "VALIDATION",
      digits === 0
        ? "Enter a whole-number amount for this currency (no decimal places)."
        : "Enter a contract value with up to two decimal places.",
    );
  }
  if (digits === 0) return Number(trimmed);
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits));
}

export function moneyToMinor(input: {
  value?: string | null;
  valueMinor?: number | null;
  currency?: string | null;
}): number | null {
  if (typeof input.valueMinor === "number") return input.valueMinor;
  if (!input.value) return null;
  return amountToMinor(input.value, input.currency);
}

export function minorToMajor(valueMinor: number, currency?: string | null): number {
  return valueMinor / 10 ** minorDigits(currency);
}

export function minorToMajorInput(
  valueMinor: number | null | undefined,
  currency?: string | null,
): string {
  if (valueMinor == null) return "";
  const digits = minorDigits(currency);
  return minorToMajor(valueMinor, currency).toFixed(digits);
}

export function formatMinorAmount(
  valueMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (valueMinor == null) return "—";
  const code = currency && currency.length === 3 ? currency : "USD";
  const major = minorToMajor(valueMinor, code);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(major);
  } catch {
    return `${major.toFixed(minorDigits(code))} ${code}`;
  }
}

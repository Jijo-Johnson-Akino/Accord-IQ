/** Calendar dates are YYYY-MM-DD. Comparisons never use the server's local timezone. */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return "UTC";
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIsoDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

export function parseIsoDay(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DAY.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Civil date in `timeZone` for an instant. DST does not change the YYYY-MM-DD string math. */
export function calendarDate(instant: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return formatIsoDay(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
  }
  return `${year}-${month}-${day}`;
}

export function compareIsoDays(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function addIsoDays(iso: string, days: number): string | null {
  const parsed = parseIsoDay(iso);
  if (!parsed) return null;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const next = new Date(utc);
  return formatIsoDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function addIsoMonths(iso: string, months: number): string | null {
  const parsed = parseIsoDay(iso);
  if (!parsed) return null;
  const year = parsed.year + Math.floor((parsed.month - 1 + months) / 12);
  const monthIndex = (((parsed.month - 1 + months) % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(parsed.day, lastDay);
  return formatIsoDay(year, monthIndex + 1, day);
}

export function addIsoYears(iso: string, years: number): string | null {
  return addIsoMonths(iso, years * 12);
}

export const FREQUENCIES = ["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function nextOccurrenceDueOn(
  dueOn: string,
  frequency: Frequency,
  intervalCount = 1,
): string | null {
  const interval = Math.max(1, intervalCount);
  if (frequency === "ONCE") return null;
  if (frequency === "WEEKLY") return addIsoDays(dueOn, 7 * interval);
  if (frequency === "MONTHLY") return addIsoMonths(dueOn, interval);
  if (frequency === "QUARTERLY") return addIsoMonths(dueOn, 3 * interval);
  return addIsoYears(dueOn, interval);
}

export function subtractNoticeDays(expiresOn: string, noticeDays: number): string | null {
  return addIsoDays(expiresOn, -Math.max(0, noticeDays));
}

export function daysBetweenIso(start: string, end: string): number | null {
  const left = parseIsoDay(start);
  const right = parseIsoDay(end);
  if (!left || !right) return null;
  const ms =
    Date.UTC(right.year, right.month - 1, right.day) -
    Date.UTC(left.year, left.month - 1, left.day);
  return Math.round(ms / 86_400_000);
}

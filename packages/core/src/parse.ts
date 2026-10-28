import { z } from "zod";
import { AppError } from "./errors";

/**
 * Parse untrusted input with Zod. Failures become VALIDATION errors with the first issue message.
 * Received values are not echoed, so secrets in the body cannot leak through error text.
 */
export function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new AppError("VALIDATION", issue?.message ?? "Invalid input.");
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.");

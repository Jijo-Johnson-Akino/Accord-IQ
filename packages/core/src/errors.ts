export type ErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INTERNAL: 500,
};

/** Base error for expected, domain-level failures. Safe to map to HTTP responses. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function isAppError(value: unknown): value is AppError {
  if (value instanceof AppError) return true;
  // Bundlers can load @accordiq/core more than once, so `instanceof` is not enough.
  if (!(value instanceof Error) || value.name !== "AppError") return false;
  const candidate = value as { code?: unknown; status?: unknown };
  return typeof candidate.code === "string" && typeof candidate.status === "number";
}

/** Safe JSON body for HTTP. Never includes stack traces or secret values. */
export function toErrorPayload(error: unknown): { error: string; code: ErrorCode; status: number } {
  if (isAppError(error)) {
    return { error: error.message, code: error.code, status: error.status };
  }
  return { error: "Something went wrong.", code: "INTERNAL", status: 500 };
}

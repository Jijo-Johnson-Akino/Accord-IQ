const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PageQuery {
  limit: number;
  offset: number;
  q?: string;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface PageResult<T> {
  items: T[];
  page: PageInfo;
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Shared list convention: `limit` (1–100), `offset` (>=0), optional `q`. */
export function parsePage(searchParams: URLSearchParams): PageQuery {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, parseIntParam(searchParams.get("offset"), 0));
  const q = searchParams.get("q")?.trim() || undefined;
  return { limit, offset, q };
}

export function pageResult<T>(items: T[], total: number, query: PageQuery): PageResult<T> {
  return { items, page: { limit: query.limit, offset: query.offset, total } };
}

/** Strip LIKE wildcards so a filter cannot broaden the match. */
export function likeContains(query: string): string {
  const safe = query.replace(/[%_]/g, "").trim();
  return `%${safe}%`;
}

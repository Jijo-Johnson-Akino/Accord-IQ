/** Better Auth 1.4 may put the token in the path or the query string. */
export function parseResetToken(url: string): string | null {
  const parsed = new URL(url);
  const fromQuery = parsed.searchParams.get("token") ?? parsed.searchParams.get("resetToken");
  if (fromQuery) return fromQuery;
  const last = parsed.pathname.split("/").filter(Boolean).at(-1);
  if (!last || last === "reset-password") return null;
  return last;
}

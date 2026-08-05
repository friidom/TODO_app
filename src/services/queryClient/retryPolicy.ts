/**
 * Which failures are worth repeating.
 *
 * TanStack retries three times by default. That is right for a dropped
 * connection and wrong for everything else: an RLS denial, a unique-constraint
 * violation or an expired JWT fails identically every time and only reaches the
 * user after the last attempt.
 *
 * Supabase reports the two cases differently, so both shapes are read:
 *
 * - Auth, Storage and Edge Function errors carry an HTTP status.
 * - PostgREST errors carry no status at all — only `code`, either a PostgREST
 *   code (`PGRST301`) or a five-character SQLSTATE (`42501`). A predicate that
 *   read only `status` would never fire for the permission denial this exists
 *   to catch, which is the whole point.
 *
 * Anything unrecognised is retried: a failed `fetch` throws a bare TypeError,
 * and that is the case retries are actually for.
 */

/** Failures to allow before giving up. TanStack passes 0 on the first failure. */
export const MAX_QUERY_RETRIES = 2;

// Transient SQLSTATE classes — the request was fine, the server was not.
// 08 connection exception, 53 insufficient resources, 57 operator intervention,
// 58 system error.
const TRANSIENT_SQLSTATE_CLASSES = ["08", "53", "57", "58"];

// Transient codes outside those classes: serialization failure and deadlock.
// Both are resolved by trying again.
const TRANSIENT_SQLSTATES = ["40001", "40P01"];

// The 4xx a retry can still clear — the server asked to be asked again.
const RETRYABLE_CLIENT_STATUSES = [408, 429];

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;

  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };

  if (typeof status === "number") return status;
  if (typeof statusCode === "number") return statusCode;

  // Storage reports its status as a string.
  if (typeof statusCode === "string" && /^\d+$/.test(statusCode)) {
    return Number(statusCode);
  }

  return null;
}

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;

  const { code } = error as { code?: unknown };

  return typeof code === "string" ? code : null;
}

export function isRetryableError(error: unknown): boolean {
  const status = statusOf(error);

  if (status !== null) {
    if (RETRYABLE_CLIENT_STATUSES.includes(status)) return true;
    return status >= 500;
  }

  const code = codeOf(error);

  // No status and no code: a network-level throw. Worth another attempt.
  if (code === null) return true;

  if (TRANSIENT_SQLSTATES.includes(code)) return true;

  // SQLSTATEs are exactly five characters; PGRST* codes are not, and none of
  // them describe a condition that changes between two identical requests.
  return (
    code.length === 5 && TRANSIENT_SQLSTATE_CLASSES.includes(code.slice(0, 2))
  );
}

export function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

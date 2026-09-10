// TanStack's default 3 retries is wrong for an RLS denial or bad JWT — those fail identically every time.
// PostgREST errors carry no HTTP status, only `code` (PGRST301 or a SQLSTATE) — a status-only check would never catch a permission denial.

export const MAX_QUERY_RETRIES = 2;

// transient SQLSTATE classes: 08 connection, 53 resources, 57 operator intervention, 58 system error
const TRANSIENT_SQLSTATE_CLASSES = ["08", "53", "57", "58"];

// serialization failure and deadlock — both resolved by trying again
const TRANSIENT_SQLSTATES = ["40001", "40P01"];

const RETRYABLE_CLIENT_STATUSES = [408, 429];

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;

  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };

  if (typeof status === "number") return status;
  if (typeof statusCode === "number") return statusCode;

  // storage reports its status as a string
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

  // no status and no code — a bare network throw, worth another attempt
  if (code === null) return true;

  if (TRANSIENT_SQLSTATES.includes(code)) return true;

  // SQLSTATEs are exactly 5 chars, PGRST* codes aren't
  return (
    code.length === 5 && TRANSIENT_SQLSTATE_CLASSES.includes(code.slice(0, 2))
  );
}

export function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

import { ApiError } from "@/services/api/client";

// TanStack's default of 3 retries is wrong for a 403 or a 404 — those fail
// identically every time, and retrying a permission denial three times only
// delays the message.
export const MAX_QUERY_RETRIES = 2;

const RETRYABLE_CLIENT_STATUSES = [408, 429];

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (RETRYABLE_CLIENT_STATUSES.includes(error.status)) return true;

    return error.status >= 500;
  }

  // A thrown TypeError from fetch, an abort, a DNS failure: no status at all,
  // and worth another attempt.
  return true;
}

export function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

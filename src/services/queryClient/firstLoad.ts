import type { QueryObserverResult } from "@tanstack/react-query";

export const FIRST_LOAD_PROPS = [
  "isPending",
  "failureCount",
  "errorUpdatedAt",
] as const;

// True only until a query's first attempt answers. A page may hold one skeleton
// over its children for that long, but no longer: once an attempt has failed,
// retrying and reporting is the child's job. Gating again would unmount the
// child, whose remount refetches the failed query — pending again, so the
// skeleton returned, forever.
export function awaitingFirstAnswer(
  query: Pick<
    QueryObserverResult,
    "isPending" | "failureCount" | "errorUpdatedAt"
  >,
): boolean {
  return (
    query.isPending && query.failureCount === 0 && query.errorUpdatedAt === 0
  );
}

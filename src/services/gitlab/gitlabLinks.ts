import type { GitLabLink, GitLabLinkStatus } from "./gitlabApi";

export const LINK_POLL_MS = 5_000;

// The settings page is outside the board's realtime room, so a delivery is
// noticed only by asking again. Only a link waiting on GitLab can change while
// the admin does nothing here, and a failed refresh stops the asking, because
// the QueryCache toasts each failed refetch.
export function linksPollInterval({
  data,
  status,
}: {
  data: readonly GitLabLink[] | undefined;
  status: "pending" | "error" | "success";
}): number | false {
  if (status === "error") return false;

  const waiting = (data ?? []).some(
    (link) => link.status === "awaiting_delivery" || link.status === "failing",
  );

  return waiting ? LINK_POLL_MS : false;
}

export type SigningTokenProblem = "required" | "prefix";

// An answer before the round trip, not the rule: the server decodes the token
// and is the one that refuses it.
export function signingTokenProblem(
  value: string,
): SigningTokenProblem | undefined {
  const token = value.trim();

  if (token === "") return "required";

  return token.startsWith("whsec_") ? undefined : "prefix";
}

export const LINK_STATUS_LABEL: Record<GitLabLinkStatus, string> = {
  awaiting_token: "gitlab.status.awaitingToken",
  awaiting_delivery: "gitlab.status.awaitingDelivery",
  active: "gitlab.status.active",
  failing: "gitlab.status.failing",
};

const FAILURE_REASONS = [
  "headers",
  "signature",
  "timestamp",
  "token",
  "project",
  "payload",
] as const;

type FailureReason = (typeof FAILURE_REASONS)[number];

const FAILURE_MESSAGE: Record<FailureReason, string> = {
  headers: "gitlab.failure.headers",
  signature: "gitlab.failure.signature",
  timestamp: "gitlab.failure.timestamp",
  token: "gitlab.failure.token",
  project: "gitlab.failure.project",
  payload: "gitlab.failure.payload",
};

function isFailureReason(value: string | null): value is FailureReason {
  return (FAILURE_REASONS as readonly (string | null)[]).includes(value);
}

export function failureMessageKey(reason: string | null): string {
  return isFailureReason(reason)
    ? FAILURE_MESSAGE[reason]
    : "gitlab.failure.unknown";
}

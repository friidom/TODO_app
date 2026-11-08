import type { GitLabLinkStatus } from "./gitlabApi";

export const LINK_POLL_MS = 5_000;

// The settings pages are outside every board's realtime room, so a delivery is
// noticed only by asking again. Only a link waiting on GitLab can change while
// the admin does nothing here, and a failed refresh stops the asking, because
// the QueryCache toasts each failed refetch.
export function linksPollInterval({
  data,
  status,
}: {
  data: readonly { status: GitLabLinkStatus }[] | undefined;
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

export type GitLabDisplayStatus = GitLabLinkStatus | "server_setup";

// Without the server's INTEGRATION_SECRET_KEY no token can be stored or opened, so whatever the link's own state, what
// it waits for is the administrator, not the person looking at it.
export function displayStatus(
  status: GitLabLinkStatus,
  configured: boolean,
): GitLabDisplayStatus {
  return configured ? status : "server_setup";
}

export const LINK_STATUS_LABEL: Record<GitLabDisplayStatus, string> = {
  server_setup: "gitlab.status.serverSetup",
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

// What Board Settings can say about a board's GitLab project. A space is
// visible only to its owner, so "the space has no project" can be offered as
// a link only when the space is the viewer's own.
export type BoardGitLabSource = "space" | "ownSpace" | "otherSpace" | "unfiled";

export function boardGitLabSource({
  spaceId,
  ownsSpace,
  spaceLinked,
}: {
  spaceId: string | null;
  ownsSpace: boolean;
  spaceLinked: boolean;
}): BoardGitLabSource {
  if (spaceLinked) return "space";

  if (spaceId === null) return "unfiled";

  return ownsSpace ? "ownSpace" : "otherSpace";
}

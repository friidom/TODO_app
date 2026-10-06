import type {
  Development,
  DevelopmentMergeRequest,
  MergeRequestState,
} from "./gitlabApi";

export const MERGE_REQUEST_PREVIEW = 3;
export const BRANCH_PREVIEW = 3;
export const COMMIT_PREVIEW = 5;

const TOOLTIP_LIMIT = 500;

const MERGE_REQUEST_ORDER: Record<MergeRequestState, number> = {
  opened: 0,
  locked: 1,
  merged: 2,
  closed: 3,
};

// Eight, not git's seven: GitLab's pages abbreviate to eight, and the id here
// should match the one the link opens on.
export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

export function developmentCount({
  commits,
  branches,
  merge_requests,
}: Development): number {
  return commits.length + branches.length + merge_requests.length;
}

export function spansProjects({
  commits,
  branches,
  merge_requests,
}: Development): boolean {
  const paths = new Set(
    [...commits, ...branches, ...merge_requests].map(
      (item) => item.project_path,
    ),
  );

  return paths.size > 1;
}

// Open ones first, because they are the ones still waiting on someone. The
// sort is stable, so the server's newest-first order holds within a state.
export function orderMergeRequests(
  mergeRequests: readonly DevelopmentMergeRequest[],
): DevelopmentMergeRequest[] {
  return [...mergeRequests].sort(
    (a, b) => MERGE_REQUEST_ORDER[a.state] - MERGE_REQUEST_ORDER[b.state],
  );
}

// Ingestion keeps up to 10 000 characters of a message, and a native tooltip
// that long covers the screen. Cut at code points, so an emoji is never split.
export function commitTooltip(message: string): string {
  const characters = Array.from(message.trim());

  return characters.length > TOOLTIP_LIMIT
    ? `${characters.slice(0, TOOLTIP_LIMIT).join("").trimEnd()}…`
    : characters.join("");
}

export const MERGE_REQUEST_STATE_LABEL: Record<MergeRequestState, string> = {
  opened: "development.state.opened",
  merged: "development.state.merged",
  closed: "development.state.closed",
  locked: "development.state.locked",
};

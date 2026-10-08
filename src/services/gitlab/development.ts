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

const SLUG_LIMIT = 50;

// The table backend/src/lib/boardKey.ts transliterates board titles with.
// prettier-ignore
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

function slugOf(title: string): string {
  const slug = [...title.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['`ʻʼ‘’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-")
    // A number is glued to the word before it: ingestion reads any
    // word-hyphen-number as a task key, so "api-2" would also link API-2.
    .replace(/-(?=\d+(?:-|$))/g, "");

  if (slug.length <= SLUG_LIMIT) return slug;

  const end = slug.lastIndexOf("-", SLUG_LIMIT);

  return slug.slice(0, end > 0 ? end : SLUG_LIMIT);
}

// <type>/<task-id>-<slug>, docs/IMPLEMENTATION_PLAN.md's branch convention.
export function branchName(
  key: string,
  title: string | null,
  type: string | null,
): string {
  const slug = slugOf(title ?? "");

  return `${type === "Bug" ? "fix" : "feature"}/${slug ? `${key}-${slug}` : key}`;
}

// Pasted into a shell, from a title any editor can write: inside double quotes
// " $ ` \ and ! still act, so "$(…)" in a title would run on the reader's machine.
export function commitCommand(key: string, title: string | null): string {
  const subject = (title ?? "")
    .replace(/["$`\\!]/g, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();

  return `git commit -m "${subject ? `${key} ${subject}` : key}"`;
}

export function newBranchUrl(projectUrl: string, branch: string): string {
  return `${projectUrl}/-/branches/new?branch_name=${encodeURIComponent(branch)}`;
}

// GitLab's own "Open in your IDE" link: VS Code offers to clone, because a web
// page cannot know where an existing checkout lives.
export function editorUrl(projectUrl: string): string {
  return `vscode://vscode.git/clone?url=${encodeURIComponent(`${projectUrl}.git`)}`;
}

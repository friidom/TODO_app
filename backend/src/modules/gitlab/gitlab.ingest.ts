import { findTaskRefs, formatTaskRef, type TaskRefMatch } from "../../lib/taskRef.js";
import type { MergeRequestEvent, PushEvent } from "./gitlab.payload.js";

const TITLE_LIMIT = 500;
const MESSAGE_LIMIT = 10_000;
const NAME_LIMIT = 255;
const BRANCH_PREFIX = "refs/heads/";
const ZERO_SHA = /^0+$/;

// A text column cannot hold NUL, and one oversized commit message must not
// fail the whole delivery: it is stored cut short instead.
export function clip(text: string, limit: number): string {
  const clean = text.replace(/\0/g, "");

  return clean.length <= limit ? clean : Array.from(clean).slice(0, limit).join("");
}

export function refId({ key, number }: { key: string; number: number }): string {
  return formatTaskRef(key, number);
}

export interface CommitCandidate {
  sha: string;
  title: string;
  message: string;
  author_name: string;
  committed_at: Date;
  refs: TaskRefMatch[];
}

export function commitCandidates(event: PushEvent): CommitCandidate[] {
  return event.commits.map((commit) => {
    const title = commit.title ?? commit.message.split("\n")[0] ?? "";

    return {
      sha: commit.id,
      title: clip(title, TITLE_LIMIT),
      message: clip(commit.message, MESSAGE_LIMIT),
      author_name: clip(commit.author.name, NAME_LIMIT),
      committed_at: commit.timestamp,
      refs: findTaskRefs(`${title}\n${commit.message}`),
    };
  });
}

export interface BranchCandidate {
  name: string;
  head_sha: string;
  deleted: boolean;
  refs: TaskRefMatch[];
}

// Tags arrive as their own event kind; anything that is not refs/heads/ is
// not a branch Veylo shows.
export function branchCandidate(event: PushEvent): BranchCandidate | null {
  if (!event.ref.startsWith(BRANCH_PREFIX)) return null;

  const name = event.ref.slice(BRANCH_PREFIX.length);

  return { name, head_sha: event.after, deleted: ZERO_SHA.test(event.after), refs: findTaskRefs(name) };
}

export interface MergeRequestCandidate {
  iid: number;
  title: string;
  state: MergeRequestEvent["object_attributes"]["state"];
  source_branch: string;
  target_branch: string;
  updated_at: Date;
  refs: TaskRefMatch[];
}

export function mergeRequestCandidate(event: MergeRequestEvent): MergeRequestCandidate {
  const attributes = event.object_attributes;

  return {
    iid: attributes.iid,
    title: clip(attributes.title, TITLE_LIMIT),
    state: attributes.state,
    source_branch: attributes.source_branch,
    target_branch: attributes.target_branch,
    updated_at: attributes.updated_at,
    refs: findTaskRefs(`${attributes.title}\n${attributes.description ?? ""}\n${attributes.source_branch}`),
  };
}

import { prisma } from "../../db/prisma.js";
import type { TaskRefMatch } from "../../lib/taskRef.js";
import { emitInvalidate } from "../../realtime/emit.js";
import { branchCandidate, commitCandidates, mergeRequestCandidate, refId } from "./gitlab.ingest.js";
import type { MergeRequestEvent, PushEvent } from "./gitlab.payload.js";
import * as gitlabRepo from "./gitlab.repo.js";

export interface IngestTarget {
  id: string;
  board_id: string;
}

// Only the link's own board is searched, so a reference to any other board —
// even one linked to the same GitLab project — resolves to nothing here.
async function resolveOnBoard(boardId: string, refs: TaskRefMatch[]): Promise<Map<string, string>> {
  const keys = await gitlabRepo.boardKeysAmong(boardId, [...new Set(refs.map((ref) => ref.key))]);
  const numbers = [...new Set(refs.filter((ref) => keys.has(ref.key)).map((ref) => ref.number))];
  const todos = await gitlabRepo.todosByNumber(boardId, numbers);
  const resolved = new Map<string, string>();

  for (const ref of refs) {
    const todoId = keys.has(ref.key) ? todos.get(ref.number) : undefined;

    if (todoId !== undefined) resolved.set(refId(ref), todoId);
  }

  return resolved;
}

// One record per work item: a message naming the same item under its current
// and a former key yields one row, labelled with the first reference.
function perTodo<T>(
  refs: TaskRefMatch[],
  resolved: Map<string, string>,
  build: (todoId: string, ref: TaskRefMatch) => T,
): T[] {
  const seen = new Set<string>();

  return refs.flatMap((ref) => {
    const todoId = resolved.get(refId(ref));

    if (todoId === undefined || seen.has(todoId)) return [];

    seen.add(todoId);

    return [build(todoId, ref)];
  });
}

export interface PushResult {
  commits: number;
  branches: number;
}

export async function ingestPush(link: IngestTarget, event: PushEvent, sentAt: Date): Promise<PushResult> {
  const commits = commitCandidates(event);
  const branch = branchCandidate(event);
  const resolved = await resolveOnBoard(link.board_id, [
    ...commits.flatMap((commit) => commit.refs),
    ...(branch?.refs ?? []),
  ]);

  const commitRows = commits.flatMap((commit) =>
    perTodo(commit.refs, resolved, (todoId, ref) => ({
      board_id: link.board_id,
      todo_id: todoId,
      link_id: link.id,
      sha: commit.sha,
      title: commit.title,
      message: commit.message,
      author_name: commit.author_name,
      committed_at: commit.committed_at,
      matched_ref: ref.text,
    })),
  );

  const branchRows =
    branch === null || branch.deleted
      ? []
      : perTodo(branch.refs, resolved, (todoId, ref) => ({
          board_id: link.board_id,
          todo_id: todoId,
          link_id: link.id,
          name: branch.name,
          matched_ref: ref.text,
          head_sha: branch.head_sha,
          pushed_at: sentAt,
        }));

  const result = await prisma.$transaction(async (tx) => {
    let branches = 0;

    if (branch?.deleted) branches += await gitlabRepo.markBranchDeleted(tx, link.id, branch.name, sentAt);

    for (const row of branchRows) branches += await gitlabRepo.upsertBranch(tx, row);

    return { commits: await gitlabRepo.insertCommits(tx, commitRows), branches };
  });

  if (result.commits + result.branches > 0) emitInvalidate(link.board_id, ["development"]);

  return result;
}

export async function ingestMergeRequest(
  link: IngestTarget,
  event: MergeRequestEvent,
): Promise<{ merge_requests: number }> {
  const mergeRequest = mergeRequestCandidate(event);
  const resolved = await resolveOnBoard(link.board_id, mergeRequest.refs);
  const fields = {
    title: mergeRequest.title,
    state: mergeRequest.state,
    source_branch: mergeRequest.source_branch,
    target_branch: mergeRequest.target_branch,
    gitlab_updated_at: mergeRequest.updated_at,
  };

  const rows = perTodo(mergeRequest.refs, resolved, (todoId, ref) => ({
    board_id: link.board_id,
    todo_id: todoId,
    link_id: link.id,
    iid: mergeRequest.iid,
    matched_ref: ref.text,
    ...fields,
  }));

  // Existing rows first, so a work item already attached is updated in place
  // and the insert only adds the ones this event names for the first time.
  const changed = await prisma.$transaction(
    async (tx) =>
      (await gitlabRepo.updateMergeRequest(tx, link.id, mergeRequest.iid, fields)) +
      (await gitlabRepo.insertMergeRequests(tx, rows)),
  );

  if (changed > 0) emitInvalidate(link.board_id, ["development"]);

  return { merge_requests: changed };
}

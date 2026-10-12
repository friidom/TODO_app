import { prisma } from "../../db/prisma.js";
import type { TaskRefMatch } from "../../lib/taskRef.js";
import { emitInvalidate } from "../../realtime/emit.js";
import { branchCandidate, commitCandidates, mergeRequestCandidate, refId } from "./gitlab.ingest.js";
import type { MergeRequestEvent, PushEvent } from "./gitlab.payload.js";
import * as gitlabRepo from "./gitlab.repo.js";

// boardIds is every board the link reaches (gitlab.service#boardsReachedBy), so
// a reference to any other board — even one whose space is linked to the same
// GitLab project — resolves to nothing here.
export interface IngestTarget {
  id: string;
  boardIds: string[];
}

interface ResolvedRef {
  todo_id: string;
  board_id: string;
}

async function resolve(boardIds: string[], refs: TaskRefMatch[]): Promise<Map<string, ResolvedRef>> {
  const boardOfKey = await gitlabRepo.boardsByKey(boardIds, [...new Set(refs.map((ref) => ref.key))]);
  const numbers = new Map<string, number[]>();

  for (const ref of refs) {
    const boardId = boardOfKey.get(ref.key);

    if (boardId !== undefined) numbers.set(boardId, [...(numbers.get(boardId) ?? []), ref.number]);
  }

  const todos = new Map(
    (await gitlabRepo.todosByNumber(numbers)).map((todo) => [`${todo.board_id}:${todo.board_key}`, todo]),
  );
  const resolved = new Map<string, ResolvedRef>();

  for (const ref of refs) {
    const todo = todos.get(`${boardOfKey.get(ref.key)}:${ref.number}`);

    if (todo !== undefined) resolved.set(refId(ref), { todo_id: todo.id, board_id: todo.board_id });
  }

  return resolved;
}

// One record per work item: a message naming the same item under its current
// and a former key yields one row, labelled with the first reference.
function perTodo<T>(
  refs: TaskRefMatch[],
  resolved: Map<string, ResolvedRef>,
  build: (target: ResolvedRef, ref: TaskRefMatch) => T,
): T[] {
  const seen = new Set<string>();

  return refs.flatMap((ref) => {
    const target = resolved.get(refId(ref));

    if (target === undefined || seen.has(target.todo_id)) return [];

    seen.add(target.todo_id);

    return [build(target, ref)];
  });
}

function announce(boardIds: Iterable<string>): void {
  for (const boardId of new Set(boardIds)) emitInvalidate(boardId, ["development"]);
}

export interface PushResult {
  commits: number;
  branches: number;
}

export async function ingestPush(link: IngestTarget, event: PushEvent, sentAt: Date): Promise<PushResult> {
  const commits = commitCandidates(event);
  const branch = branchCandidate(event);
  const resolved = await resolve(link.boardIds, [
    ...commits.flatMap((commit) => commit.refs),
    ...(branch?.refs ?? []),
  ]);

  const commitRows = commits.flatMap((commit) =>
    perTodo(commit.refs, resolved, (target, ref) => ({
      ...target,
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
      : perTodo(branch.refs, resolved, (target, ref) => ({
          ...target,
          link_id: link.id,
          name: branch.name,
          matched_ref: ref.text,
          head_sha: branch.head_sha,
          pushed_at: sentAt,
        }));

  const { commitBoards, branchBoards } = await prisma.$transaction(async (tx) => {
    const touched = branch?.deleted ? await gitlabRepo.markBranchDeleted(tx, link.id, branch.name, sentAt) : [];

    for (const row of branchRows) {
      if ((await gitlabRepo.upsertBranch(tx, row)) > 0) touched.push(row.board_id);
    }

    return { commitBoards: await gitlabRepo.insertCommits(tx, commitRows), branchBoards: touched };
  });

  announce([...commitBoards, ...branchBoards]);

  return { commits: commitBoards.length, branches: branchBoards.length };
}

export async function ingestMergeRequest(
  link: IngestTarget,
  event: MergeRequestEvent,
): Promise<{ merge_requests: number }> {
  const mergeRequest = mergeRequestCandidate(event);
  const resolved = await resolve(link.boardIds, mergeRequest.refs);
  const fields = {
    title: mergeRequest.title,
    state: mergeRequest.state,
    source_branch: mergeRequest.source_branch,
    target_branch: mergeRequest.target_branch,
    gitlab_updated_at: mergeRequest.updated_at,
  };

  const rows = perTodo(mergeRequest.refs, resolved, (target, ref) => ({
    ...target,
    link_id: link.id,
    iid: mergeRequest.iid,
    matched_ref: ref.text,
    ...fields,
  }));

  // Existing rows first, so a work item already attached is updated in place
  // and the insert only adds the ones this event names for the first time.
  const changed = await prisma.$transaction(async (tx) => [
    ...(await gitlabRepo.updateMergeRequest(tx, link.id, mergeRequest.iid, fields)),
    ...(await gitlabRepo.insertMergeRequests(tx, rows)),
  ]);

  announce(changed);

  return { merge_requests: changed.length };
}

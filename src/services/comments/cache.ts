import type { Comment } from "@/types/data";

/**
 * Every way the `["comments", todoId]` cache entry changes, as pure functions.
 *
 * Outside the mutation closures for the same reason `todos/cache.ts` is
 * (M2-16): M7-04 subscribes a channel to one open work item, and a comment
 * arriving from another client has to reach the same array through the same
 * transformation. A callback cannot reach into an `onMutate`, so a second copy
 * of these rules would be a second definition of what an edit means.
 *
 * The rules each function follows, unchanged from the todo and column sets:
 *
 * - `(comments, …) => comments` — the whole thread in, the whole thread out.
 * - No mutation of the input. `onMutate` snapshots the cached array for
 *   rollback and the cache holds these very objects, so editing one in place
 *   would leave `onError` nothing to restore.
 * - Rows nothing touched are passed through by reference, so React re-renders
 *   only the comment that changed.
 */

/** Oldest first, matching `fetchComments` and the index it reads. */
const byPostedAt = (a: Comment, b: Comment) =>
  a.created_at.localeCompare(b.created_at);

/**
 * The thread with `comment` in it.
 *
 * Sorted rather than appended, which costs one comparator and buys the
 * out-of-order case: a locally posted comment is always the newest and would
 * append correctly, but M7-04 delivers other people's, and two clients posting
 * within the same second can arrive in either order. A thread that renders in
 * a different order on each screen is the bug this avoids.
 *
 * **A comment already here is left exactly as it is.** That is the echo rule
 * M6-10 established for work items, and it is the same one line: the client
 * mints the uuid, so this client's own insert comes back carrying an id the
 * cache already holds. Replacing it would swap the optimistic row for a
 * server row that says the same thing, one render later.
 */
export function applyCommentInserted(
  comments: Comment[],
  comment: Comment,
): Comment[] {
  if (comments.some((it) => it.id === comment.id)) return comments;

  return [...comments, comment].sort(byPostedAt);
}

/**
 * The thread with `row` in place of the comment sharing its id.
 *
 * A whole-row replacement rather than a merge, matching `applyTodoUpdated`:
 * both callers hand over a complete row — the server's answer to an edit, or
 * M7-04's payload — and merging would invent a rule about which half wins.
 *
 * An edit for a comment this client does not have is dropped rather than
 * inserted. It means the insert was missed, and inventing the row from an
 * update payload would be a second convergence mechanism where a refetch on
 * resubscribe is the first.
 */
export function applyCommentUpdated(
  comments: Comment[],
  row: Comment,
): Comment[] {
  return comments.map((comment) => (comment.id === row.id ? row : comment));
}

/** The thread without the comment `id`. */
export function applyCommentDeleted(
  comments: Comment[],
  id: Comment["id"],
): Comment[] {
  return comments.filter((comment) => comment.id !== id);
}

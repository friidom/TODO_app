import type { Comment } from "@/types/data";

// Pure transforms of the ["comments", todoId] cache, shared by mutations and the realtime channel.
// No mutation of input — onMutate snapshots for rollback and the cache holds these same objects.

const byPostedAt = (a: Comment, b: Comment) =>
  a.created_at.localeCompare(b.created_at);

// Sorted, not appended — two clients posting in the same second can arrive out of order.
export function applyCommentInserted(
  comments: Comment[],
  comment: Comment,
): Comment[] {
  if (comments.some((it) => it.id === comment.id)) return comments;

  return [...comments, comment].sort(byPostedAt);
}

export function applyCommentUpdated(
  comments: Comment[],
  row: Comment,
): Comment[] {
  return comments.map((comment) => (comment.id === row.id ? row : comment));
}

export function applyCommentDeleted(
  comments: Comment[],
  id: Comment["id"],
): Comment[] {
  return comments.filter((comment) => comment.id !== id);
}

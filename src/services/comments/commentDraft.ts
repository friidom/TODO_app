/**
 * What a comment composer should send, and whether it should send at all.
 * Pure — no React, no network.
 *
 * The same job `todos/taskDraft.ts` does for the title and description fields,
 * and it exists for the same reason: "is this worth writing?" is asked on every
 * submit and every blur, and getting it wrong is quiet in both directions — too
 * eager and a stray Enter posts an empty comment, too lax and an edit is
 * dropped.
 *
 * **This is not the validation.** `comments_content_not_blank` in M7-01 is,
 * and it refuses a blank comment from any client. What these two buy is that
 * the UI never *offers* a write the database is going to refuse — a disabled
 * button instead of a toast reading "violates check constraint".
 */

/**
 * The text to post, or `null` when there is nothing to post.
 *
 * **Trimmed, unlike a description.** `descriptionValue` stores a draft exactly
 * as typed because a trailing newline under a list is the author's; a comment
 * is a single utterance in a stack of them, and leading blank lines in one
 * would push every comment after it down the thread for no one's benefit.
 *
 * Whitespace-only collapses to `null` rather than to `""` — the same treatment
 * `descriptionValue` gives a blank, so "nothing to post" is one value that
 * every caller tests once.
 */
export function commentValue(draft: string): string | null {
  const trimmed = draft.trim();

  return trimmed === "" ? null : trimmed;
}

/**
 * The text an edit should store, or `null` when there is nothing to write.
 *
 * **Blanking an existing comment reverts rather than clearing**, which is
 * `titleValue`'s rule and for the same reason: `content` is NOT NULL and
 * checked non-blank, so an empty edit has no representation in the database.
 * Deleting is the way to remove a comment, and it is a different control with
 * different permissions.
 *
 * An unchanged draft returns `null` too, so re-submitting without typing does
 * not write a row and does not move `updated_at` — which would put an "edited"
 * marker on a comment nobody edited.
 */
export function editedValue(draft: string, stored: string): string | null {
  const trimmed = draft.trim();

  if (trimmed === "" || trimmed === stored) return null;

  return trimmed;
}

/**
 * Whether a comment has been edited since it was posted.
 *
 * Both columns default to `now()` on insert — one transaction, one timestamp —
 * so they are *exactly* equal until the `comments_set_updated_at` trigger fires
 * on a real UPDATE. Inequality is therefore the whole test, and it needs no
 * tolerance window: this compares two values the database wrote, not a server
 * time against a client clock.
 */
export function isEdited(comment: {
  created_at: string;
  updated_at: string;
}): boolean {
  return comment.updated_at !== comment.created_at;
}

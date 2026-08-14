/**
 * What an edited field in the detail panel should store, and whether it
 * changed at all. Pure — no React, no network.
 *
 * Both fields save on blur, so "did this change?" is asked on every focus loss
 * and again when the panel is closed with unsaved work. Getting it wrong is
 * quiet in both directions: too eager and every click writes the same value
 * back; too lax and an edit is silently dropped.
 */

/**
 * The value to store for a description draft, or `null` to clear the column.
 *
 * **Whitespace-only clears rather than storing spaces.** "No description" must
 * be one value in the database, not a null and an assortment of blank strings
 * that every future reader has to test for separately.
 *
 * Non-empty drafts are stored exactly as typed. Trimming them would eat the
 * trailing newline someone left under a list, which is theirs and not ours.
 */
export function descriptionValue(draft: string): string | null {
  return draft.trim() === "" ? null : draft;
}

/** Whether a description draft differs from the stored column. */
export function descriptionChanged(
  draft: string,
  stored: string | null,
): boolean {
  return descriptionValue(draft) !== (stored ?? null);
}

/**
 * The value to store for a title draft, or `null` when there is nothing to
 * write.
 *
 * Unlike a description, an empty title is not a clear — `todos.title` is the
 * card's only label, so blanking it reverts instead. That is the behaviour the
 * card's inline rename has always had, and the panel must not disagree with it.
 */
export function titleValue(
  draft: string,
  stored: string | null,
): string | null {
  const trimmed = draft.trim();

  if (trimmed === "" || trimmed === (stored ?? "")) return null;

  return trimmed;
}

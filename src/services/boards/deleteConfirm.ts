/**
 * The typed confirmation guarding board deletion (M8-03, built in M15).
 *
 * **A mistake-guard, not a permission.** A non-owner is refused by M2-01's
 * DELETE policy whether or not this modal is ever reached; what this prevents is
 * the owner deleting the wrong board from a list of similar names.
 */

/**
 * What the user must type, which is exactly what they can see.
 *
 * `boards.title` is nullable, and an untitled board is reachable — the sidebar
 * and the board header both render it as "Untitled board". Asking someone to
 * type a title that is null would leave the confirm box impossible to satisfy,
 * so the label is the target, and the label is what is on screen.
 */
export function confirmLabel(title: string | null): string {
  return title?.trim() || "Untitled board";
}

/**
 * Trimmed but case-sensitive.
 *
 * Trailing whitespace is a copy-paste artefact and refusing it would read as a
 * broken box; case is the part that proves the person read the name.
 */
export function confirmMatches(typed: string, title: string | null): boolean {
  return typed.trim() === confirmLabel(title);
}

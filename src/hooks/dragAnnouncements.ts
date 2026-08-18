/**
 * What a screen reader hears during a board drag (M9-02). Pure — no React, no
 * dnd-kit, no DOM.
 *
 * **A drag is invisible by definition, so these sentences are the entire
 * interface for anyone not looking at the screen.** The board moves nothing
 * while dragging — only the `DragOverlay` travels, and an overlay is not
 * announced — so without these a keyboard drag is a card that silently
 * disappears and reappears somewhere else.
 *
 * The rule every sentence follows: **say what moved and where it is now.** A
 * position is meaningless on its own ("position 3") and a name is meaningless
 * on its own ("KAN-12 moved"), so each announcement carries both, and the
 * position is always "n of m" rather than a bare index — "position 3" tells you
 * nothing about whether you can keep going.
 *
 * Pure so the copy can be tested without rendering a board or faking a drag.
 */

/**
 * Read out when a draggable takes focus, before anything is picked up.
 *
 * dnd-kit renders this into its own hidden live region, so it is heard once per
 * focus rather than on every keystroke. It names the keys because nothing on
 * screen does: the card looks identical whether or not it can be lifted.
 */
export const SCREEN_READER_INSTRUCTIONS =
  "To pick up this item, press space or enter. " +
  "While dragging, use the arrow keys to move it between positions and columns. " +
  "Press space or enter again to drop it, or press escape to cancel.";

/**
 * "position 2 of 5 in In Progress".
 *
 * One-based, because "position 0" is a programmer's answer to a question a
 * person asked. `total` is the number of *places a card can land*, which is one
 * more than the number of cards — a column of three cards has four gaps — so it
 * is passed in rather than derived here from a card count that would be off by
 * one.
 */
export function describePosition(
  index: number,
  total: number,
  columnTitle: string,
): string {
  return `position ${index + 1} of ${total} in ${columnTitle}`;
}

/** "position 2 of 5" — a column drag has no column to be in. */
export function describeColumnPosition(index: number, total: number): string {
  return `position ${index + 1} of ${total}`;
}

/**
 * Picked up.
 *
 * Deliberately does **not** repeat the key instructions: dnd-kit has already
 * read `SCREEN_READER_INSTRUCTIONS` when the item took focus, and repeating
 * three sentences on every lift is what makes people turn announcements off.
 */
export function announcePickedUp(label: string, at: string | null): string {
  return at ? `Picked up ${label}. It is at ${at}.` : `Picked up ${label}.`;
}

/**
 * Moved over a new target.
 *
 * The null case is real and worth saying out loud rather than staying silent:
 * the board offers no target when the gap under the item is the one it already
 * occupies, so "no drop position" means "you are back where you started", not
 * "something broke".
 */
export function announceMovedOver(label: string, at: string | null): string {
  return at
    ? `${label} is over ${at}.`
    : `${label} is not over a drop position.`;
}

export function announceDropped(label: string, at: string | null): string {
  return at
    ? `${label} was dropped at ${at}.`
    : `${label} was returned to where it started.`;
}

export function announceCancelled(label: string): string {
  return `Dragging ${label} was cancelled. It returned to where it started.`;
}

/**
 * What a card is called out loud: "KAN-12, Fix the login bug".
 *
 * **The key leads.** It is the short name a person would actually say, and it
 * disambiguates two cards both titled "Fix the build" — which a title alone
 * cannot. A card still in flight has no key yet (the trigger allocates it), so
 * the title carries it alone rather than the label reading "null, …".
 *
 * Shared by the `aria-label` on the card and by the drag announcements, because
 * hearing one name on focus and a different one on pick-up is worse than either
 * name being imperfect.
 */
export function itemLabel(key: string | null, title: string | null): string {
  return [key, title].filter(Boolean).join(", ") || "Untitled item";
}

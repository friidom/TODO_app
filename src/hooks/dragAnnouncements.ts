// screen reader copy for a board drag — pure so it's testable without rendering a board or faking a drag
export const SCREEN_READER_INSTRUCTIONS =
  "To pick up this item, press space or enter. " +
  "While dragging, use the arrow keys to move it between positions and columns. " +
  "Press space or enter again to drop it, or press escape to cancel.";

// one-based ("position 1", not 0) — total is gaps (cards + 1), passed in rather than derived here
export function describePosition(
  index: number,
  total: number,
  columnTitle: string,
): string {
  return `position ${index + 1} of ${total} in ${columnTitle}`;
}

export function describeColumnPosition(index: number, total: number): string {
  return `position ${index + 1} of ${total}`;
}

// doesn't repeat the key instructions — dnd-kit already read those on focus, repeating them every lift gets announcements turned off
export function announcePickedUp(label: string, at: string | null): string {
  return at ? `Picked up ${label}. It is at ${at}.` : `Picked up ${label}.`;
}

// the null case is real, not silence — no target means back where you started, not broken
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

// key leads (disambiguates two cards titled the same); falls back to just the title while the key's still in flight
export function itemLabel(key: string | null, title: string | null): string {
  return [key, title].filter(Boolean).join(", ") || "Untitled item";
}

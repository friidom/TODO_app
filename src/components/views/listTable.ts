// Shared class strings for the List's table. Plain .ts, not a component module,
// for the reason headerControl.ts is: react-refresh cannot fast-refresh a module
// that mixes a component with other exports.

// Every colour is an opaque mix of one row colour, because the checkbox, work and
// action columns are sticky: a translucent cell would show the columns scrolling
// underneath it.
export const FRAME =
  "[--list-row:var(--elevated)] dark:[--list-row:var(--surface)] [--list-head:color-mix(in_oklab,var(--list-row),var(--canvas)_55%)] [--list-hover:color-mix(in_oklab,var(--list-row),var(--ink)_5%)] [--list-selected:color-mix(in_oklab,var(--list-row),var(--brand)_12%)] [--list-line:color-mix(in_oklab,var(--list-row),var(--ink)_14%)] border-(--list-line) bg-(--list-row) rounded-lg border";

// border-separate is not a style preference: under border-collapse, Chrome drops
// the borders off a position:sticky header row, and the header here is sticky.
export const TABLE = "w-full table-fixed border-separate border-spacing-0";

export const CELL =
  "border-(--list-line) h-10 border-r border-b px-2 align-middle transition-colors duration-100";

// data-disclosure marks the subtask chevron, whose aria-expanded means "expanded",
// not "a popover of this row is open".
export const ROW_IDLE =
  "bg-(--list-row) group-hover:bg-(--list-hover) group-has-[[aria-expanded=true]:not([data-disclosure])]:bg-(--list-hover)";

export const ROW_SELECTED = "bg-(--list-selected)";

export const HEAD_CELL =
  "bg-(--list-head) border-(--list-line) text-ink-2 sticky top-0 z-20 h-10 border-r border-b px-2 text-left align-middle text-xs font-semibold whitespace-nowrap";

// The head variants outrank the body's so the header wins where the two cross.
export const STICKY_LEFT = "sticky z-[2]";
export const STICKY_LEFT_HEAD = "sticky z-30";

export const STICKY_RIGHT =
  "sticky right-0 z-[2] border-r-0 shadow-[-1px_0_0_var(--list-line)]";
export const STICKY_RIGHT_HEAD =
  "sticky right-0 z-30 border-r-0 shadow-[-1px_0_0_var(--list-line)]";

/** Mirrors HEAD_CELL's height, so a group row parks directly beneath the header. */
export const GROUP_ROW_TOP = "top-10";

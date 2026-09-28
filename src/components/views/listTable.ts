// Shared class strings for the List's table. Plain .ts, not a component module,
// for the reason headerControl.ts is: react-refresh cannot fast-refresh a module
// that mixes a component with other exports.

// border-separate is not a style preference: under border-collapse, Chrome drops
// the borders off a position:sticky header row, and the header here is sticky.
export const TABLE = "w-full table-fixed border-separate border-spacing-0";

// Every cell paints the row background rather than the <tr> painting it once.
// The identity and action columns are sticky and so must be opaque, and a
// translucent hover tint on the row would stop dead at their edges.
export const CELL =
  "bg-surface border-hairline border-b transition-colors duration-150 group-hover:bg-elevated";

export const HEAD_CELL =
  "bg-surface border-hairline text-ink-3 text-micro sticky top-0 z-20 h-9 border-b text-left align-middle font-medium tracking-[0.08em] uppercase";

// The head variants outrank the body's so the header wins where the two cross.
export const STICKY_LEFT =
  "sticky left-0 z-[1] shadow-[1px_0_0_var(--hairline)]";
export const STICKY_LEFT_HEAD =
  "sticky left-0 z-30 shadow-[1px_0_0_var(--hairline)]";

export const STICKY_RIGHT =
  "sticky right-0 z-[1] shadow-[-1px_0_0_var(--hairline)]";
export const STICKY_RIGHT_HEAD =
  "sticky right-0 z-30 shadow-[-1px_0_0_var(--hairline)]";

/** Mirrors HEAD_CELL's height, so a group row parks directly beneath the header. */
export const GROUP_ROW_TOP = "top-9";

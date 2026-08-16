/**
 * The one grid the list is built on: the column header row and every work item
 * wear it, which is what keeps a value under its heading without a `<table>`
 * around them to enforce it.
 *
 * **A grid rather than the table this replaced.** A table sizes its columns from
 * a `<colgroup>` whose entries have to correspond one-for-one with the cells in
 * a row — and this list drops two columns below `lg`, so the widths and the
 * cells fell out of step at exactly the width where the layout matters most.
 * Grid tracks are declared per breakpoint beside the cells that are declared per
 * breakpoint, so the two cannot disagree. It also ends the `max-w-0` trick the
 * title cell needed and the `<col className="hidden">` that never hid anything.
 *
 * **Only the title is elastic**, at `minmax(0, 1fr)`: every pixel the viewport
 * gains or loses goes to the title and to nothing else, which is what makes it
 * the column that dominates at any width. The `0` minimum is the half that
 * matters — a bare `1fr` refuses to shrink below its own text, so a long summary
 * would push the metadata off the row instead of ellipsising.
 *
 * **The metadata tracks are sized to their contents and sit next to each
 * other.** They used to be spaced at `gap-x-3` with a fixed 1.25rem priority
 * track and a 5.25rem due track, which on a wide screen left four small objects
 * floating apart in the right third of the row with nothing tying them
 * together. Tightening the gap to `gap-x-2` and letting status take the width it
 * needs makes them read as one cluster the eye checks, rather than four columns
 * it has to read. The slack all goes to the title, where it belongs.
 *
 * Below `lg`, priority and due are not rendered at all. Metadata gives way
 * before the title does.
 *
 * A plain `.ts` module for the reason `headerControl.ts` is one: react-refresh
 * cannot fast-refresh a module that mixes a component with other exports, and
 * this is a string two components share.
 */
export const LIST_GRID = [
  "grid items-center gap-x-2 px-4",
  "grid-cols-[1.25rem_3.75rem_minmax(0,1fr)_7.5rem_1.5rem_1.5rem]",
  "lg:grid-cols-[1.25rem_3.75rem_minmax(0,1fr)_7.5rem_1.25rem_1.5rem_4.5rem_1.5rem]",
].join(" ");

/**
 * How narrow the list may get before it scrolls sideways instead of squeezing.
 *
 * Sits on the grid's own wrapper rather than on the scroll box, so the header,
 * the dividers and the rows all stop shrinking at the same width and stay in
 * column when the box scrolls.
 */
export const LIST_MIN_WIDTH = "min-w-[32rem]";

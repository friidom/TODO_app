// Grid, not a table — a <colgroup>'s widths and the row's cells fall out of step once two columns drop below `lg`.
// Only the title track is elastic (minmax(0,1fr)); everything else sizes to its own content.
export const LIST_GRID = [
  "grid items-center gap-x-2 px-4",
  "grid-cols-[1.25rem_3.75rem_minmax(0,1fr)_7.5rem_1.5rem_1.5rem]",
  "lg:grid-cols-[1.25rem_3.75rem_minmax(0,1fr)_7.5rem_1.25rem_1.5rem_4.5rem_1.5rem]",
].join(" ");

export const LIST_MIN_WIDTH = "min-w-[32rem]";

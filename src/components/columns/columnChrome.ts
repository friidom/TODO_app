export const COLUMN_WIDTH = "w-[264px]";

// A flexible column's slot in its row: basis-0 shares the row out equally whatever the cards hold, and
// contain-inline-size keeps its cards' unwrapped titles out of the row's max-content, so a row of these is
// min-w-max exactly like a row of fixed columns. The floor sits below COLUMN_WIDTH so a laptop board fits.
export const FLEX_COLUMN = "min-w-60 flex-1 basis-0 contain-inline-size";

export const COUNT_CHIP =
  "bg-wash-strong text-ink-2 text-micro grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-semibold tabular-nums";

export const COLUMN_TITLE =
  "text-ink-2 text-mini truncate font-semibold tracking-wide uppercase";

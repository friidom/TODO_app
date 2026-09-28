const FIELD_MOTION =
  "outline-none transition-[color,background-color,border-color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-brand";

export const FIELD_CHIP = `${FIELD_MOTION} text-mini inline-flex h-5 items-center gap-1 rounded-control px-1.5 font-medium`;

export const FIELD_ICON = `${FIELD_MOTION} grid size-5 shrink-0 place-items-center rounded-control hover:bg-wash-strong`;

// a labelled Details row (the task rail): the value reads as text, not as a dense card chip
export const FIELD_ROW =
  "text-meta hover:bg-wash-strong focus-visible:ring-brand rounded-control -mx-1.5 flex h-7 shrink-0 items-center gap-1.5 px-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2";

export const FIELD_EMPTY =
  "border-hairline text-ink-3 hover:bg-wash-strong hover:text-ink-2 border border-dashed";

// aria-expanded keeps a hover-revealed trigger on screen while its portalled panel has the pointer
export const HOVER_REVEAL =
  "coarse:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100";

// MENU_ITEM's geometry without its [&_svg]:text-ink-3, which would out-rank the option icons' own tones and the brand check.
// Disabled rows keep pointer events so a workflow refusal's title can still show on hover.
export const OPTION_ITEM =
  "rounded-control text-ink hover:bg-wash-strong focus-visible:bg-wash-strong coarse:py-2.5 flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-left text-meta outline-none transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

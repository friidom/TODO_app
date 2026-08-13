/**
 * The board header's control shell.
 *
 * Lifted verbatim from `BoardHeader`'s old `PlaceholderControl`, so the controls
 * that became real sit at exactly the weight the dead ones did — the header was
 * designed around this button and nothing about it needed to change when the
 * features behind it arrived.
 *
 * A plain `.ts` module rather than a component: react-refresh cannot fast-refresh
 * a module mixing a component with other exports, and this is a string three
 * components share. Same reason `memberLabels.ts` and `themeContext.ts` are
 * their own files.
 */
export const HEADER_CONTROL =
  "border-hairline bg-surface text-ink-2 hover:text-ink hover:bg-elevated focus-visible:ring-brand flex h-9 items-center gap-1.5 rounded-control border px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-70";

/**
 * What a control looks like once it is doing something.
 *
 * Brand-tinted rather than filled: an active filter should be obvious at a
 * glance without competing with the board it is describing. Purple is the
 * product's action colour, and a control holding state is the closest thing the
 * header has to one.
 */
export const HEADER_CONTROL_ACTIVE = "border-brand/40 bg-brand-soft text-brand";

/** The count pill on the Filter button — `Filter (3)` without the parentheses. */
export const HEADER_CONTROL_BADGE =
  "bg-brand text-brand-fg ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold";

/**
 * The view toolbar's control shell.
 *
 * Lifted verbatim from `BoardHeader`'s old `PlaceholderControl`, so the controls
 * that became real sit at exactly the weight the dead ones did — the header was
 * designed around this button and nothing about it needed to change when the
 * features behind it arrived.
 *
 * **Tuned once, in M17, rather than five times.** Search, Filter, Group and
 * Sort all wear this string, so the control's height, padding and type size are
 * a single edit and the four cannot drift apart. That is the same reason it was
 * extracted in the first place.
 *
 * A plain `.ts` module rather than a component: react-refresh cannot fast-refresh
 * a module mixing a component with other exports, and this is a string three
 * components share. Same reason `memberLabels.ts` and `themeContext.ts` are
 * their own files.
 */
export const HEADER_CONTROL =
  "border-hairline bg-surface text-ink-2 hover:text-ink hover:bg-elevated focus-visible:ring-brand flex h-9 items-center gap-1.5 rounded-control border px-2.5 text-[13px] transition-colors duration-150 outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-70";

/**
 * What a control looks like once it is doing something.
 *
 * Brand-tinted rather than filled: an active filter should be obvious at a
 * glance without competing with the board it is describing. Purple is the
 * product's action colour, and a control holding state is the closest thing the
 * header has to one.
 */
export const HEADER_CONTROL_ACTIVE = "border-brand/40 bg-brand-soft text-brand";

/**
 * The quiet end of the toolbar: no border until you reach for it.
 *
 * Search is the one control here that is not a decision — it narrows the board
 * without committing to anything, and it is used far more often than the other
 * three. Giving it the same bordered box made five equally loud objects in a
 * row; letting it sit on the surface until hover or focus puts it a level below
 * Filter/Group/Sort, which sit a level below the one filled purple button.
 */
export const HEADER_CONTROL_QUIET =
  "text-ink-3 hover:text-ink-2 hover:bg-surface focus-within:bg-surface focus-within:border-hairline flex h-9 items-center gap-1.5 rounded-control border border-transparent px-2.5 text-[13px] transition-colors duration-150 outline-none";

/** The count pill on the Filter button — `Filter (3)` without the parentheses. */
export const HEADER_CONTROL_BADGE =
  "bg-brand text-brand-fg ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold";

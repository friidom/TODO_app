/**
 * The three status categories a column can have. Fixed set — users pick one,
 * they never define their own, which is why `columns.category` is a checked
 * text field rather than its own table.
 *
 * Colours live here and not in the DB: they are presentation, so changing the
 * palette is an edit, not a migration.
 *
 * Keep each class a whole literal string — Tailwind scans source text, so a
 * composed `bg-[${hex}]` would emit no CSS and the pills would render bare.
 */
export const COLUMN_CATEGORIES = {
  todo: {
    swatch: "bg-[#dcdfe4]",
    pill: "bg-[#dcdfe4] text-[#172b4d]",
    /** Theme-aware dot, for surfaces that follow the shell tokens. */
    dot: "bg-brand",
    /**
     * The same colour as text, which is what an SVG `currentColor` stroke
     * needs (M18's status donut). A `bg-` utility cannot paint a stroke, and
     * the alternative — a raw hex in the chart — would be a fourth place the
     * palette lives.
     */
    tone: "text-brand",
    /**
     * The column header's wash (M17).
     *
     * Token-derived rather than the hard-coded hexes `pill` and `swatch` carry:
     * those predate the shell tokens and only read correctly on a light
     * surface, which is why they are confined to the transition pills. A wash
     * sits at the top of every column in both themes, so it has to be a token
     * with an alpha.
     *
     * **An atmospheric wash over the top of the COLUMN, not a band behind the
     * header.** A gradient confined to a 44px header is a coloured rectangle
     * with a soft bottom edge — the eye still reads a bar. Spilling it down
     * past the header into the first card's airspace is what makes the colour
     * belong to the column rather than sit on it, and it is why the opacity can
     * drop to 10%: a tall gradient carries at a lower intensity than a short
     * one.
     *
     * `todo` is purple — the one place the brand accent is spent on something
     * that is not an action, and it is spent at a tenth.
     */
    band: "bg-gradient-to-b from-brand/10 via-brand/[0.03] to-transparent",
  },
  in_progress: {
    swatch: "bg-[#cfe1fd]",
    pill: "bg-[#cfe1fd] text-[#172b4d]",
    dot: "bg-status-blue",
    tone: "text-status-blue",
    band: "bg-gradient-to-b from-status-blue/10 via-status-blue/[0.03] to-transparent",
  },
  done: {
    swatch: "bg-[#b3df72]",
    pill: "bg-[#b3df72] text-[#172b4d]",
    dot: "bg-status-green",
    tone: "text-status-green",
    band: "bg-gradient-to-b from-status-green/10 via-status-green/[0.03] to-transparent",
  },
} as const;

export type ColumnCategory = keyof typeof COLUMN_CATEGORIES;

export const CATEGORY_OPTIONS = Object.entries(COLUMN_CATEGORIES).map(
  ([value, meta]) => ({ value: value as ColumnCategory, ...meta }),
);

export const DEFAULT_CATEGORY: ColumnCategory = "todo";

/**
 * A column's title, as the user wrote it. Nullable in the schema, so a null
 * renders as nothing.
 *
 * This is deliberately *not* run through `t()`. Titles used to be i18n keys,
 * which meant a user who renamed a column to "todo" had it silently rendered
 * as whatever the locale mapped that word to, and the seeded English titles
 * never matched a key at all — they resolved to themselves, so ru and uz users
 * read English and it looked correct only by accident. Only `category`, a
 * fixed set the user picks from and cannot invent, is translatable.
 */
export function columnTitle(title?: string | null): string {
  return title ?? "";
}

/**
 * i18n key for a category's label. The labels themselves live in the locale
 * files rather than here, so there is one copy of each rather than an English
 * one in this module and a translated one beside it.
 */
export function categoryLabelKey(category: ColumnCategory): string {
  return `columnCategory.${category}`;
}

/** Falls back to `todo` so rows written before the migration still render. */
export function categoryOf(category?: string | null) {
  return (
    COLUMN_CATEGORIES[category as ColumnCategory] ?? COLUMN_CATEGORIES.todo
  );
}

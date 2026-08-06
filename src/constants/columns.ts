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
  },
  in_progress: {
    swatch: "bg-[#cfe1fd]",
    pill: "bg-[#cfe1fd] text-[#172b4d]",
  },
  done: {
    swatch: "bg-[#b3df72]",
    pill: "bg-[#b3df72] text-[#172b4d]",
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

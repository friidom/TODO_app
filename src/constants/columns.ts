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
    label: "To do",
    swatch: "bg-[#dcdfe4]",
    pill: "bg-[#dcdfe4] text-[#172b4d]",
  },
  in_progress: {
    label: "In progress",
    swatch: "bg-[#cfe1fd]",
    pill: "bg-[#cfe1fd] text-[#172b4d]",
  },
  done: {
    label: "Done",
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
 * Column titles double as i18n keys, but `columns.title` is nullable in the
 * schema. `t()` requires a string, so a null title becomes the empty key —
 * which is what it already resolved to at runtime.
 */
export function titleKey(title?: string | null): string {
  return title ?? "";
}

/** Falls back to `todo` so rows written before the migration still render. */
export function categoryOf(category?: string | null) {
  return (
    COLUMN_CATEGORIES[category as ColumnCategory] ?? COLUMN_CATEGORIES.todo
  );
}

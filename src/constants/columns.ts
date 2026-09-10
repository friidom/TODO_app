// colours live here, not the DB — they're presentation, so retuning is an edit, not a migration.
// keep each class a full literal string — Tailwind scans source text, a composed bg-[${hex}] emits no CSS.
export const COLUMN_CATEGORIES = {
  todo: {
    swatch: "bg-[#dcdfe4]",
    pill: "bg-[#dcdfe4] text-[#172b4d]",
    dot: "bg-brand",
    // same colour as text — an SVG currentColor stroke needs this, bg- utilities can't paint a stroke
    tone: "text-brand",
    // spills past the header into the first card's row on purpose, so the wash reads as the column's, not a band behind the header
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

// not run through t() — titles are user text, not i18n keys; renaming a column to "todo" used to render as a translation
export function columnTitle(title?: string | null): string {
  return title ?? "";
}

export function categoryLabelKey(category: ColumnCategory): string {
  return `columnCategory.${category}`;
}

// falls back to todo so rows written before the migration still render
export function categoryOf(category?: string | null) {
  return (
    COLUMN_CATEGORIES[category as ColumnCategory] ?? COLUMN_CATEGORIES.todo
  );
}

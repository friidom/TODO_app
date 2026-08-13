import {
  BugIcon,
  LightbulbIcon,
  type LucideIcon,
  SquareCheckIcon,
  BookOpenIcon,
} from "lucide-react";

/**
 * The four work types a card can be.
 *
 * A fixed set the user picks from and never defines, so it is a CHECK
 * constraint on `todos.type` rather than a table — the same shape
 * `columns.category` uses, and the same reason its palette lives here rather
 * than in the database: colours are presentation, so retuning them is an edit
 * and not a migration.
 *
 * Values are the strings the column stores. They are capitalised because the
 * constraint spells them that way; changing either means changing both.
 *
 * Each class is a whole literal string on purpose — Tailwind scans source text,
 * so a composed `text-${token}` would emit no CSS and the icons would render
 * with no colour at all.
 */

export const WORK_TYPES = {
  Bug: {
    icon: BugIcon,
    /** Icon tint on the card and in the menu. */
    tone: "text-status-red",
    /** Icon plus a soft background, for the compact card chip. */
    chip: "bg-status-red/15 text-status-red",
  },
  Task: {
    icon: SquareCheckIcon,
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue",
  },
  Story: {
    icon: BookOpenIcon,
    tone: "text-status-green",
    chip: "bg-status-green/15 text-status-green",
  },
  Feature: {
    icon: LightbulbIcon,
    tone: "text-brand",
    chip: "bg-brand-soft text-brand",
  },
} as const satisfies Record<
  string,
  { icon: LucideIcon; tone: string; chip: string }
>;

export type WorkType = keyof typeof WORK_TYPES;

/** Menu order. Task first, because it is the default and the common case. */
export const WORK_TYPE_OPTIONS = ["Task", "Bug", "Story", "Feature"] as const;

/** Matches the column's default, so the create form opens on the same value. */
export const DEFAULT_WORK_TYPE: WorkType = "Task";

/**
 * Falls back to the default rather than throwing.
 *
 * `type` is `text` with a CHECK, not an enum, so the generated type is a plain
 * `string` and the compiler cannot narrow it. A row written before the
 * migration — or by anything that bypasses the constraint — still renders.
 */
export function workTypeOf(value?: string | null) {
  return WORK_TYPES[value as WorkType] ?? WORK_TYPES[DEFAULT_WORK_TYPE];
}

/** The stored value, narrowed, or the default. */
export function toWorkType(value?: string | null): WorkType {
  return value && value in WORK_TYPES
    ? (value as WorkType)
    : DEFAULT_WORK_TYPE;
}

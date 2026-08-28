import {
  BugIcon,
  LightbulbIcon,
  type LucideIcon,
  SquareCheckIcon,
  BookOpenIcon,
  ZapIcon,
} from "lucide-react";

/**
 * The five work types a card can be.
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
 *
 * **`Epic` joined the other four in M28-A.** It is a work type like the rest —
 * same column, same CHECK, same control — and not a second model: the thing
 * that makes a row an Epic is `type = 'Epic'`, and the thing that makes it a
 * *container* is every other row's `parent_id` pointing at it, which is
 * `enforce_work_item_hierarchy`'s job, not this file's. `tone`/`chip` reuse
 * `status-orange` rather than a sixth colour: this app's card chips draw from
 * four theme-aware status tones plus `brand`, all five already spoken for by
 * priority and the other four types, and introducing a raw Tailwind colour
 * here would not repaint itself in dark mode the way these tokens do.
 */

export const WORK_TYPES = {
  Bug: {
    icon: BugIcon,
    /** Icon tint on the card and in the menu. */
    tone: "text-status-red",
    /** Icon plus a soft background, for the compact card chip. */
    chip: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  },
  Task: {
    icon: SquareCheckIcon,
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue hover:bg-status-blue/25",
  },
  Story: {
    icon: BookOpenIcon,
    tone: "text-status-green",
    chip: "bg-status-green/15 text-status-green hover:bg-status-green/25",
  },
  Feature: {
    icon: LightbulbIcon,
    tone: "text-brand",
    chip: "bg-brand-soft text-brand hover:bg-brand/20",
  },
  Epic: {
    icon: ZapIcon,
    tone: "text-status-orange",
    chip: "bg-status-orange/15 text-status-orange",
  },
} as const satisfies Record<
  string,
  { icon: LucideIcon; tone: string; chip: string }
>;

export type WorkType = keyof typeof WORK_TYPES;

/**
 * Menu order. Task first, because it is the default and the common case.
 * Epic last — it is the one type that is also a container, and the menu
 * lists what a card commonly *is* before what it also *does*.
 */
export const WORK_TYPE_OPTIONS = [
  "Task",
  "Bug",
  "Story",
  "Feature",
  "Epic",
] as const;

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
  return value && value in WORK_TYPES ? (value as WorkType) : DEFAULT_WORK_TYPE;
}

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  EqualIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * The five priorities a card can carry.
 *
 * `todos.priority` has existed since M2-04 (`20260806092902_todos_task_fields.sql`)
 * as `text` with a CHECK constraint and no UI — every row's value was null. This
 * module is the frontend half that was missing; **no migration was needed to add
 * it**, only the field's admission to `TodoPatch`.
 *
 * Same shape as `workTypes.ts` and for the same reasons: a fixed set the user
 * picks from and never defines, so it is a CHECK constraint rather than a lookup
 * table, and its palette lives here rather than in the database because colours
 * are presentation — retuning them is an edit, not a migration.
 *
 * Values are **lowercase** because the constraint spells them that way.
 * `todos.type` capitalises its own; the inconsistency is real, predates this
 * file, and `20260812090000_todos_work_type.sql` records the decision not to
 * normalise it.
 *
 * Each class is a whole literal string on purpose — Tailwind scans source text,
 * so a composed `text-${token}` would emit no CSS and the icons would render
 * with no colour at all.
 */
export const PRIORITIES = {
  highest: {
    icon: ChevronsUpIcon,
    label: "Highest",
    /** Icon tint in a menu row and in the list view. */
    tone: "text-status-red",
    /** Icon plus a soft background, for a compact chip. */
    chip: "bg-status-red/15 text-status-red",
  },
  high: {
    icon: ChevronUpIcon,
    label: "High",
    tone: "text-status-red",
    chip: "bg-status-red/15 text-status-red",
  },
  medium: {
    icon: EqualIcon,
    label: "Medium",
    tone: "text-status-orange",
    chip: "bg-status-orange/15 text-status-orange",
  },
  low: {
    icon: ChevronDownIcon,
    label: "Low",
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue",
  },
  lowest: {
    icon: ChevronsDownIcon,
    label: "Lowest",
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue",
  },
} as const satisfies Record<
  string,
  { icon: LucideIcon; label: string; tone: string; chip: string }
>;

export type Priority = keyof typeof PRIORITIES;

/**
 * Menu order: highest first, the way every issue tracker lists them.
 *
 * This doubles as the **rank** used for sorting and for group order —
 * `PRIORITY_OPTIONS.indexOf(p)` is the only place the levels are ordered, so
 * sorting cannot disagree with the menu. Alphabetical would put "high" below
 * "highest" and "low" above "lowest", which is nonsense in both directions.
 */
export const PRIORITY_OPTIONS = [
  "highest",
  "high",
  "medium",
  "low",
  "lowest",
] as const;

/**
 * Where a value ranks, ascending = most urgent first.
 *
 * Unset ranks last rather than as "medium". A card nobody has prioritised is not
 * a card of middling importance; it is a card with no answer, and sorting it
 * into the middle would invent one.
 */
export function priorityRank(value?: string | null): number {
  const index = PRIORITY_OPTIONS.indexOf(value as Priority);

  return index === -1 ? PRIORITY_OPTIONS.length : index;
}

/**
 * The meta for a stored value, or `null` when there is none.
 *
 * Unlike `workTypeOf`, this does **not** fall back to a default: `type` is NOT
 * NULL with a default of 'Task', so every card has one, but `priority` is
 * nullable and "no priority" is a real, common state that has to render
 * differently from any of the five.
 */
export function priorityOf(value?: string | null) {
  return value && value in PRIORITIES ? PRIORITIES[value as Priority] : null;
}

/** The stored value, narrowed, or `null` for unset and for anything unknown. */
export function toPriority(value?: string | null): Priority | null {
  return value && value in PRIORITIES ? (value as Priority) : null;
}

import { PRIORITIES, type Priority } from "@/constants/priorities";
import { num, str } from "./activityText";
import type { Activity } from "@/types/data";
import { formatDue } from "@/utils/dueDate";

/**
 * What one activity entry says, for the per-item History tab (M25) — the
 * Jira-style field/chip rendering, as against `activityText.ts`'s sentence
 * feed for the board-wide drawer.
 *
 * **A second renderer over the same rows, deliberately, not a second data
 * model.** The two surfaces want different shapes from one entry: the board
 * feed reads "Alice changed the priority of KAN-23 → Highest" as a scannable
 * sentence with one destination chip; the reference this milestone follows
 * shows "Alice changed the Status", a timestamp on its own line, and a
 * two-chip "To Do → In Progress" row underneath. Forcing one function to
 * produce both would mean `ActivityLine` growing fields only History reads or
 * `describeActivity`'s callers growing fields only the board feed reads.
 *
 * `str`/`num` are imported from `activityText.ts` rather than reimplemented —
 * the two modules read identical `payload` shapes, so there is exactly one
 * function that knows how to pull a string or a number out of an
 * `Activity["payload"]`.
 *
 * **Scoped to `todo.*` actions only.** `useTodoActivities` filters by
 * `entity_type = 'todo'` at the query, so `column.*`/`member.*` rows never
 * reach this function in practice — it does not attempt to handle them.
 */

export interface HistoryChange {
  /**
   * The verb before the object — "created this issue" stands alone; every
   * field-based action is "changed", paired with `field` below.
   */
  verb: string;
  /**
   * The field name to render emphasized — "Status", "Priority", "Assignee",
   * "Title", "Due date", "Work type", "Description", "Story point estimate".
   * Null only for `verb`s that are already the whole clause (`created`).
   */
  field: string | null;
  /** The chip pair, or both null when the action has nothing to show as one
   * (`created`, `description_changed` — see the migration for why the latter
   * carries no value at all). */
  from: string | null;
  to: string | null;
}

/**
 * How a `subtask_added` / `subtask_removed` / `task_added_to_epic` /
 * `task_removed_from_epic` row names the child it is about (M27, widened for
 * Epics in M28-A — all four share the same payload shape: the CHILD's title
 * and key, on a row that lives in the PARENT's history).
 *
 * Prefers the key, because that is what the subtasks table above it shows.
 * Falls back to the title for a child deleted before its key was allocated,
 * and to a bare word when the payload has neither — the same three-step
 * fallback `itemLabel` in `activityText.ts` makes, minus the board prefix,
 * which this module is not given.
 */
function childLabel(activity: Activity): string {
  const boardKey = num(activity.payload, "board_key");

  if (boardKey !== null) return `#${boardKey}`;

  return truncateTitle(str(activity.payload, "title"));
}

/** Longer titles are truncated so the chip stays one line, matching the
 * reference's compact spacing. */
function truncateTitle(value: string | null): string {
  if (value === null || value === "") return "Untitled";

  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
}

/** A stored priority, resolved to its product label — "None" for unset,
 * matching `activityText.ts`'s own `priorityDetail`. */
function priorityLabel(value: string | null): string {
  if (value === null) return "None";

  return PRIORITIES[value as Priority]?.label ?? value;
}

/** A stored assignee id, resolved through the roster the caller already has
 * — "Unassigned" for null, matching the board feed's own wording for the
 * same state, and "Former member" for an id the roster no longer lists. */
function assigneeLabel(
  id: string | null,
  names: Record<string, string>,
): string {
  if (id === null) return "Unassigned";

  return names[id] ?? "Former member";
}

/**
 * One entry, described for History — or `null` when the action has nothing
 * to show there.
 *
 * `deleted` returns `null` rather than a placeholder: the detail panel this
 * renders inside cannot be open on a deleted item, so an entry for it is
 * unreachable in practice. A future action this build does not recognise
 * (added by a later migration ahead of this client) also returns `null` —
 * silently skipping one unknown row in a bounded, per-item list is the safer
 * default for a list a person is actually reading, unlike the board feed's
 * `"changed something"` fallback, which exists because that feed cannot
 * simply omit a row without the count looking wrong.
 */
export function describeHistoryChange(
  activity: Activity,
  names: Record<string, string>,
): HistoryChange | null {
  switch (activity.action) {
    case "created":
      return { verb: "created this issue", field: null, from: null, to: null };

    case "moved":
      return {
        verb: "changed",
        field: "Status",
        from: str(activity.payload, "from") ?? "None",
        to: str(activity.payload, "to") ?? "None",
      };

    case "assigned":
      return {
        verb: "changed",
        field: "Assignee",
        from: assigneeLabel(str(activity.payload, "from"), names),
        to: assigneeLabel(str(activity.payload, "to"), names),
      };

    case "retitled":
      return {
        verb: "changed",
        field: "Title",
        from: truncateTitle(str(activity.payload, "from")),
        to: truncateTitle(str(activity.payload, "to")),
      };

    case "priority_changed":
      return {
        verb: "changed",
        field: "Priority",
        from: priorityLabel(str(activity.payload, "from")),
        to: priorityLabel(str(activity.payload, "to")),
      };

    case "due_changed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      return {
        verb: "changed",
        field: "Due date",
        from: from ? formatDue(from) : "None",
        to: to ? formatDue(to) : "None",
      };
    }

    case "type_changed":
      return {
        verb: "changed",
        field: "Work type",
        from: str(activity.payload, "from") ?? "None",
        to: str(activity.payload, "to") ?? "None",
      };

    case "subtask_added":
      // The payload names the child; this row lives in the parent's history.
      return {
        verb: "added subtask",
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "subtask_removed":
      return {
        verb: "removed subtask",
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "task_added_to_epic":
      // Same shape as `subtask_added` above (M28-A): the payload names the
      // task that was attached, and this row lives in the EPIC's own
      // history.
      return {
        verb: "added task",
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "task_removed_from_epic":
      return {
        verb: "removed task",
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "parent_changed": {
      // M28-A snapshots the parent's own key as `from_key`/`to_key`, so a
      // chip is possible without this renderer resolving anything itself —
      // unlike `subtask_added`'s child, the parent here is exactly what
      // changed, so "Parent: None → #5" is the more informative rendering
      // now that the data exists to show it. A row written before this
      // migration has neither key and falls back to M27's plain sentence.
      const fromKey = num(activity.payload, "from_key");
      const toKey = num(activity.payload, "to_key");

      if (fromKey !== null || toKey !== null) {
        return {
          verb: "changed",
          field: "Parent",
          from: fromKey !== null ? `#${fromKey}` : "None",
          to: toKey !== null ? `#${toKey}` : "None",
        };
      }

      return {
        verb: str(activity.payload, "to")
          ? "made this a subtask"
          : "made this a top-level work item",
        field: null,
        from: null,
        to: null,
      };
    }

    case "description_changed":
      // No chip — see `20260827090000_todo_history_fields.sql`'s header for
      // why the payload was never given a value to show one with.
      return { verb: "changed", field: "Description", from: null, to: null };

    case "estimate_changed": {
      const from = num(activity.payload, "from");
      const to = num(activity.payload, "to");

      // Zero is a real estimate (M24-A), so it must not fall through to
      // "None" the way a missing value does.
      return {
        verb: "changed",
        field: "Story point estimate",
        from: from === null ? "None" : String(from),
        to: to === null ? "None" : String(to),
      };
    }

    default:
      return null;
  }
}

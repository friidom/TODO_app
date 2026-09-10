import { PRIORITIES, type Priority } from "@/constants/priorities";
import { num, str } from "./activityText";
import type { Activity } from "@/types/data";
import { formatDue } from "@/utils/dueDate";

export interface HistoryChange {
  verb: string;
  field: string | null;
  from: string | null;
  to: string | null;
}

function childLabel(activity: Activity): string {
  const boardKey = num(activity.payload, "board_key");

  if (boardKey !== null) return `#${boardKey}`;

  return truncateTitle(str(activity.payload, "title"));
}

function truncateTitle(value: string | null): string {
  if (value === null || value === "") return "Untitled";

  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
}

function priorityLabel(value: string | null): string {
  if (value === null) return "None";

  return PRIORITIES[value as Priority]?.label ?? value;
}

function assigneeLabel(
  id: string | null,
  names: Record<string, string>,
): string {
  if (id === null) return "Unassigned";

  return names[id] ?? "Former member";
}

// null means nothing to show for that action, or an action this client doesn't recognise yet — skip the row rather than guess.
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

      // Older rows have neither key — fall back to a plain sentence.
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
      return { verb: "changed", field: "Description", from: null, to: null };

    case "estimate_changed": {
      const from = num(activity.payload, "from");
      const to = num(activity.payload, "to");

      // 0 is a real estimate, must not fall through to "None" like a missing value does.
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

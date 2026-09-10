import { PRIORITIES, type Priority } from "@/constants/priorities";
import type { Activity } from "@/types/data";
import { formatDue } from "@/utils/dueDate";

// Pure text formatting for one activity row — reads only the trigger's snapshotted payload, never the
// live database, so it can still render a sentence about a card or column that's since been deleted.

const FORMER = "a former member";

export type ActivityDetail = {
  label: string;
  value: string;
  // Must be a whole Tailwind class literal — Tailwind scans source text, so `text-${token}` emits no CSS.
  tone?: string;
};

export type ActivityLine = {
  // The sentence minus the actor; the row prepends "Alice ".
  text: string;
  // The work item to open, or null when there's nothing to open (deleted card, column/member event).
  taskId: string | null;
  detail: ActivityDetail | null;
};

export type ActivityContext = {
  keyPrefix: string;
  names: Record<string, string>;
  liveTaskIds: ReadonlySet<string>;
};

// Exported so historyText.ts can read the same jsonb payloads with one typed accessor.
export function str(payload: Activity["payload"], key: string): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

export function num(payload: Activity["payload"], key: string): number | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "number" ? value : null;
}

function itemLabel(activity: Activity, keyPrefix: string): string {
  const boardKey = num(activity.payload, "board_key");
  const title = str(activity.payload, "title");

  if (boardKey !== null) return `${keyPrefix}-${boardKey}`;

  return title ?? "a work item";
}

function personLabel(id: string | null, names: Record<string, string>): string {
  if (id === null) return "nobody";

  return names[id] ?? FORMER;
}

// Unrecognised values fall through as themselves rather than being dropped — a row from a newer build still says something true.
function priorityDetail(value: string | null): ActivityDetail {
  if (value === null) return { label: "Priority", value: "None" };

  const meta = PRIORITIES[value as Priority];

  return {
    label: "Priority",
    value: meta?.label ?? value,
    tone: meta?.tone,
  };
}

export function describeActivity(
  activity: Activity,
  { keyPrefix, names, liveTaskIds }: ActivityContext,
): ActivityLine {
  const item = itemLabel(activity, keyPrefix);

  const taskId =
    activity.entity_type === "todo" &&
    activity.entity_id !== null &&
    liveTaskIds.has(activity.entity_id)
      ? activity.entity_id
      : null;

  switch (`${activity.entity_type}.${activity.action}`) {
    case "todo.created":
      return { text: `created ${item}`, taskId, detail: null };

    case "todo.deleted":
      return { text: `deleted ${item}`, taskId: null, detail: null };

    case "todo.moved": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      // Uncoloured — the trigger snapshots the column's title, not its id, so there's no category to look up.
      const detail: ActivityDetail | null = to
        ? { label: "Status", value: to }
        : null;

      if (from && to)
        return { text: `moved ${item} from ${from} to ${to}`, taskId, detail };
      if (to) return { text: `moved ${item} to ${to}`, taskId, detail };

      return { text: `moved ${item}`, taskId, detail: null };
    }

    case "todo.assigned": {
      const to = str(activity.payload, "to");

      if (to === null) {
        return {
          text: `unassigned ${item}`,
          taskId,
          detail: { label: "Assignee", value: "Unassigned" },
        };
      }

      const who = personLabel(to, names);

      return {
        text: `assigned ${item} to ${who}`,
        taskId,
        detail: { label: "Assignee", value: who },
      };
    }

    case "todo.retitled": {
      const to = str(activity.payload, "to");

      if (to)
        return { text: `renamed ${item} to “${to}”`, taskId, detail: null };

      return { text: `renamed ${item}`, taskId, detail: null };
    }

    case "todo.priority_changed": {
      const to = str(activity.payload, "to");

      return {
        text: `changed the priority of ${item}`,
        taskId,
        detail: priorityDetail(to),
      };
    }

    case "todo.due_changed": {
      const to = str(activity.payload, "to");

      return {
        text: to ? `rescheduled ${item}` : `cleared the due date on ${item}`,
        taskId,
        detail: { label: "Due", value: to ? formatDue(to) : "None" },
      };
    }

    case "todo.type_changed": {
      const to = str(activity.payload, "to");

      return {
        text: `changed the type of ${item}`,
        taskId,
        // Uncoloured — a red Bug chip beside a red Highest-priority chip would read as one signal, not two.
        detail: to ? { label: "Type", value: to } : null,
      };
    }

    case "todo.description_changed":
      // No detail chip — description is unbounded free text, nothing compact to render a diff in.
      return {
        text: `changed the description of ${item}`,
        taskId,
        detail: null,
      };

    case "todo.estimate_changed": {
      const to = num(activity.payload, "to");

      return {
        text: `changed the estimate of ${item}`,
        taskId,
        detail: { label: "Estimate", value: to === null ? "None" : String(to) },
      };
    }

    case "todo.subtask_added":
      // item names the subtask; entity_id/taskId is the parent, whose history this row belongs to.
      return { text: `added subtask ${item}`, taskId, detail: null };

    case "todo.subtask_removed":
      return { text: `removed subtask ${item}`, taskId, detail: null };

    case "todo.task_added_to_epic":
      // Same asymmetry as subtask_added: item is the task, taskId is the epic.
      return { text: `added ${item} to this epic`, taskId, detail: null };

    case "todo.task_removed_from_epic":
      return { text: `removed ${item} from this epic`, taskId, detail: null };

    case "todo.parent_changed": {
      const to = str(activity.payload, "to");

      if (to === null) {
        // from_type distinguishes "removed from an epic" from "un-subtasked"; absent on older rows means the latter.
        const fromType = str(activity.payload, "from_type");

        return {
          text:
            fromType === "Epic"
              ? `removed ${item} from its epic`
              : `made ${item} a top-level work item`,
          taskId,
          detail: null,
        };
      }

      const toType = str(activity.payload, "to_type");

      if (toType === "Epic") {
        const toKey = num(activity.payload, "to_key");

        return {
          text: `assigned ${item} to ${toKey !== null ? `${keyPrefix}-${toKey}` : "an epic"}`,
          taskId,
          detail: null,
        };
      }

      return { text: `made ${item} a subtask`, taskId, detail: null };
    }

    case "column.created": {
      const title = str(activity.payload, "title");

      return {
        text: `created the column ${title ?? "a column"}`,
        taskId: null,
        detail: null,
      };
    }

    case "column.deleted": {
      const title = str(activity.payload, "title");

      return {
        text: `deleted the column ${title ?? "a column"}`,
        taskId: null,
        detail: null,
      };
    }

    case "column.renamed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      if (from && to) {
        return {
          text: `renamed the column ${from} to ${to}`,
          taskId: null,
          detail: null,
        };
      }

      return { text: `renamed a column`, taskId: null, detail: null };
    }

    case "member.added": {
      const role = str(activity.payload, "role");
      const who = personLabel(activity.entity_id, names);

      return {
        text: role ? `added ${who} as ${role}` : `added ${who}`,
        taskId: null,
        detail: null,
      };
    }

    case "member.removed":
      return {
        text: `removed ${personLabel(activity.entity_id, names)}`,
        taskId: null,
        detail: null,
      };

    case "member.role_changed": {
      const to = str(activity.payload, "to");
      const who = personLabel(activity.entity_id, names);

      return {
        text: to ? `made ${who} ${to}` : `changed ${who}'s role`,
        taskId: null,
        detail: to ? { label: "Role", value: to } : null,
      };
    }

    default:
      // Only reachable if a later migration adds an event type this build doesn't know about.
      return { text: `changed something`, taskId: null, detail: null };
  }
}

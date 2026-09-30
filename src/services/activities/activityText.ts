import { roleLabel } from "@/components/members/roleStyles";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { WORK_TYPE_LABELS, type WorkType } from "@/constants/workTypes";
import type { Activity } from "@/types/data";
import { formatDue } from "@/utils/dueDate";

// Pure text formatting for one activity row — reads only the trigger's snapshotted payload, never the
// live database, so it can still render a sentence about a card or column that's since been deleted.

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
  // i18next's t, for the sentences that go through i18n. A status name inside
  // one is user data and is passed in as a value, never translated.
  t: (key: string, values?: Record<string, string>) => string;
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

type T = ActivityContext["t"];

function itemLabel(activity: Activity, keyPrefix: string, t: T): string {
  const boardKey = num(activity.payload, "board_key");
  const title = str(activity.payload, "title");

  if (boardKey !== null) return `${keyPrefix}-${boardKey}`;

  return title ?? t("activity.aWorkItem");
}

function personLabel(
  id: string | null,
  names: Record<string, string>,
  t: T,
): string {
  if (id === null) return t("activity.nobody");

  return names[id] ?? t("activity.formerMember");
}

// Unrecognised values fall through as themselves rather than being dropped — a row from a newer build still says something true.
function priorityDetail(value: string | null, t: T): ActivityDetail {
  const label = t("fields.priority");

  if (value === null) return { label, value: t("common.none") };

  const meta = PRIORITIES[value as Priority];

  return {
    label,
    value: meta?.label ?? value,
    tone: meta?.tone,
  };
}

export function describeActivity(
  activity: Activity,
  { keyPrefix, names, liveTaskIds, t }: ActivityContext,
): ActivityLine {
  const item = itemLabel(activity, keyPrefix, t);

  const taskId =
    activity.entity_type === "todo" &&
    activity.entity_id !== null &&
    liveTaskIds.has(activity.entity_id)
      ? activity.entity_id
      : null;

  switch (`${activity.entity_type}.${activity.action}`) {
    case "todo.created":
      return { text: t("activity.created", { item }), taskId, detail: null };

    case "todo.deleted":
      return {
        text: t("activity.deleted", { item }),
        taskId: null,
        detail: null,
      };

    case "todo.moved": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      // Uncoloured — the trigger snapshots the status's name, not its id, so there's no category to look up.
      const detail: ActivityDetail | null = to
        ? { label: t("fields.status"), value: to }
        : null;

      if (from && to)
        return {
          text: t("activity.movedFromTo", { item, from, to }),
          taskId,
          detail,
        };
      if (to)
        return { text: t("activity.movedTo", { item, to }), taskId, detail };

      return { text: t("activity.moved", { item }), taskId, detail: null };
    }

    case "todo.assigned": {
      const to = str(activity.payload, "to");

      if (to === null) {
        return {
          text: t("activity.unassigned", { item }),
          taskId,
          detail: {
            label: t("fields.assignee"),
            value: t("members.unassigned"),
          },
        };
      }

      const who = personLabel(to, names, t);

      return {
        text: t("activity.assigned", { item, who }),
        taskId,
        detail: { label: t("fields.assignee"), value: who },
      };
    }

    case "todo.retitled": {
      const to = str(activity.payload, "to");

      if (to)
        return {
          text: t("activity.renamedTo", { item, to }),
          taskId,
          detail: null,
        };

      return { text: t("activity.renamed", { item }), taskId, detail: null };
    }

    case "todo.priority_changed": {
      const to = str(activity.payload, "to");

      return {
        text: t("activity.priorityChanged", { item }),
        taskId,
        detail: priorityDetail(to, t),
      };
    }

    case "todo.due_changed": {
      const to = str(activity.payload, "to");

      return {
        text: to
          ? t("activity.rescheduled", { item })
          : t("activity.dueCleared", { item }),
        taskId,
        detail: {
          label: t("activity.due"),
          value: to ? formatDue(to) : t("common.none"),
        },
      };
    }

    case "todo.type_changed": {
      const to = str(activity.payload, "to");

      return {
        text: t("activity.typeChanged", { item }),
        taskId,
        // Uncoloured — a red Bug chip beside a red Highest-priority chip would read as one signal, not two.
        detail: to
          ? {
              label: t("activity.type"),
              value: WORK_TYPE_LABELS[to as WorkType] ?? to,
            }
          : null,
      };
    }

    case "todo.description_changed":
      // No detail chip — description is unbounded free text, nothing compact to render a diff in.
      return {
        text: t("activity.descriptionChanged", { item }),
        taskId,
        detail: null,
      };

    case "todo.estimate_changed": {
      const to = num(activity.payload, "to");

      return {
        text: t("activity.estimateChanged", { item }),
        taskId,
        detail: {
          label: t("fields.estimate"),
          value: to === null ? t("common.none") : String(to),
        },
      };
    }

    case "todo.subtask_added":
      // item names the subtask; entity_id/taskId is the parent, whose history this row belongs to.
      return {
        text: t("activity.subtaskAdded", { item }),
        taskId,
        detail: null,
      };

    case "todo.subtask_removed":
      return {
        text: t("activity.subtaskRemoved", { item }),
        taskId,
        detail: null,
      };

    case "todo.task_added_to_epic":
      // Same asymmetry as subtask_added: item is the task, taskId is the epic.
      return {
        text: t("activity.addedToEpic", { item }),
        taskId,
        detail: null,
      };

    case "todo.task_removed_from_epic":
      return {
        text: t("activity.removedFromEpic", { item }),
        taskId,
        detail: null,
      };

    case "todo.parent_changed": {
      const to = str(activity.payload, "to");

      if (to === null) {
        // from_type distinguishes "removed from an epic" from "un-subtasked"; absent on older rows means the latter.
        const fromType = str(activity.payload, "from_type");

        return {
          text:
            fromType === "Epic"
              ? t("activity.removedFromItsEpic", { item })
              : t("activity.madeTopLevel", { item }),
          taskId,
          detail: null,
        };
      }

      const toType = str(activity.payload, "to_type");

      if (toType === "Epic") {
        const toKey = num(activity.payload, "to_key");

        return {
          text: t("activity.assigned", {
            item,
            who:
              toKey !== null ? `${keyPrefix}-${toKey}` : t("activity.anEpic"),
          }),
          taskId,
          detail: null,
        };
      }

      return {
        text: t("activity.madeSubtask", { item }),
        taskId,
        detail: null,
      };
    }

    case "column.created": {
      const title = str(activity.payload, "title");

      return {
        text: title
          ? t("activity.columnCreated", { name: title })
          : t("activity.columnCreatedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "column.deleted": {
      const title = str(activity.payload, "title");

      return {
        text: title
          ? t("activity.columnDeleted", { name: title })
          : t("activity.columnDeletedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "column.renamed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      if (from && to) {
        return {
          text: t("activity.columnRenamed", { from, to }),
          taskId: null,
          detail: null,
        };
      }

      return {
        text: t("activity.columnRenamedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "status.created": {
      const name = str(activity.payload, "title");

      return {
        text: name
          ? t("activity.statusCreated", { name })
          : t("activity.statusCreatedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "status.deleted": {
      const name = str(activity.payload, "title");

      return {
        text: name
          ? t("activity.statusDeleted", { name })
          : t("activity.statusDeletedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "status.renamed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      return {
        text:
          from && to
            ? t("activity.statusRenamed", { from, to })
            : t("activity.statusRenamedUnnamed"),
        taskId: null,
        detail: null,
      };
    }

    case "member.added": {
      const role = str(activity.payload, "role");
      const who = personLabel(activity.entity_id, names, t);

      return {
        text: role
          ? t("activity.memberAddedAs", {
              who,
              role: roleLabel(role).toLowerCase(),
            })
          : t("activity.memberAdded", { who }),
        taskId: null,
        detail: null,
      };
    }

    case "member.removed":
      return {
        text: t("activity.memberRemoved", {
          who: personLabel(activity.entity_id, names, t),
        }),
        taskId: null,
        detail: null,
      };

    case "member.role_changed": {
      const to = str(activity.payload, "to");
      const who = personLabel(activity.entity_id, names, t);
      const role = to === null ? null : roleLabel(to).toLowerCase();

      return {
        text:
          role !== null
            ? t("activity.roleMade", { who, role })
            : t("activity.roleChanged", { who }),
        taskId: null,
        detail:
          role !== null ? { label: t("activity.role"), value: role } : null,
      };
    }

    default:
      // Only reachable if a later migration adds an event type this build doesn't know about.
      return {
        text: t("activity.changedSomething"),
        taskId: null,
        detail: null,
      };
  }
}

import i18n from "@/components/i18n";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { WORK_TYPE_LABELS, type WorkType } from "@/constants/workTypes";
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
  if (value === null || value === "") return i18n.t("common.untitled");

  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
}

function priorityLabel(value: string | null): string {
  if (value === null) return i18n.t("common.none");

  return PRIORITIES[value as Priority]?.label ?? value;
}

function assigneeLabel(
  id: string | null,
  names: Record<string, string>,
): string {
  if (id === null) return i18n.t("members.unassigned");

  return names[id] ?? i18n.t("members.former");
}

function typeLabel(value: string | null): string {
  if (value === null) return i18n.t("common.none");

  return WORK_TYPE_LABELS[value as WorkType] ?? value;
}

function changed(field: string, from: string | null, to: string | null) {
  return { verb: i18n.t("history.changed"), field, from, to };
}

// null means nothing to show for that action, or an action this client doesn't recognise yet — skip the row rather than guess.
export function describeHistoryChange(
  activity: Activity,
  names: Record<string, string>,
): HistoryChange | null {
  switch (activity.action) {
    case "created":
      return {
        verb: i18n.t("history.created"),
        field: null,
        from: null,
        to: null,
      };

    case "moved":
      return changed(
        i18n.t("fields.status"),
        str(activity.payload, "from") ?? i18n.t("common.none"),
        str(activity.payload, "to") ?? i18n.t("common.none"),
      );

    case "assigned":
      return changed(
        i18n.t("fields.assignee"),
        assigneeLabel(str(activity.payload, "from"), names),
        assigneeLabel(str(activity.payload, "to"), names),
      );

    case "retitled":
      return changed(
        i18n.t("fields.title"),
        truncateTitle(str(activity.payload, "from")),
        truncateTitle(str(activity.payload, "to")),
      );

    case "priority_changed":
      return changed(
        i18n.t("fields.priority"),
        priorityLabel(str(activity.payload, "from")),
        priorityLabel(str(activity.payload, "to")),
      );

    case "due_changed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      return changed(
        i18n.t("fields.dueDate"),
        from ? formatDue(from) : i18n.t("common.none"),
        to ? formatDue(to) : i18n.t("common.none"),
      );
    }

    case "type_changed":
      return changed(
        i18n.t("fields.workType"),
        typeLabel(str(activity.payload, "from")),
        typeLabel(str(activity.payload, "to")),
      );

    case "subtask_added":
      return {
        verb: i18n.t("history.subtaskAdded"),
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "subtask_removed":
      return {
        verb: i18n.t("history.subtaskRemoved"),
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "task_added_to_epic":
      return {
        verb: i18n.t("history.taskAdded"),
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "task_removed_from_epic":
      return {
        verb: i18n.t("history.taskRemoved"),
        field: childLabel(activity),
        from: null,
        to: null,
      };

    case "parent_changed": {
      const fromKey = num(activity.payload, "from_key");
      const toKey = num(activity.payload, "to_key");

      if (fromKey !== null || toKey !== null) {
        return changed(
          i18n.t("fields.parent"),
          fromKey !== null ? `#${fromKey}` : i18n.t("common.none"),
          toKey !== null ? `#${toKey}` : i18n.t("common.none"),
        );
      }

      // Older rows have neither key — fall back to a plain sentence.
      return {
        verb: str(activity.payload, "to")
          ? i18n.t("history.madeSubtask")
          : i18n.t("history.madeTopLevel"),
        field: null,
        from: null,
        to: null,
      };
    }

    case "description_changed":
      return changed(i18n.t("task.description"), null, null);

    case "estimate_changed": {
      const from = num(activity.payload, "from");
      const to = num(activity.payload, "to");

      // 0 is a real estimate, must not fall through to "None" like a missing value does.
      return changed(
        i18n.t("history.estimateField"),
        from === null ? i18n.t("common.none") : String(from),
        to === null ? i18n.t("common.none") : String(to),
      );
    }

    default:
      return null;
  }
}

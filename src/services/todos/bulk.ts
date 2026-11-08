import type { TodoFields } from "@/hooks/useTodoPatch";
import {
  columnIdOf,
  type StatusIndex,
  type WorkflowModel,
} from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";
import { rankForAppend, type Ranked } from "@/utils/rank";
import { sprintAssignmentPatch } from "./backlog";
import { isEpic, isGenuineSubtask } from "./subtasks";

// What a bulk action does to each selected row, decided before anything is
// sent. Every rule here is one a single-row edit already follows; a bulk
// action may not do to twenty rows what it would refuse to do to one.

export type SkipReason =
  "transition" | "unplaceable" | "dates" | "notApplicable";

export interface Skipped {
  todo: Todo;
  reason: SkipReason;
}

export interface StatusMove {
  todo: Todo;
  statusId: string;
  rank: number;
}

export function planStatusChange(
  selected: Todo[],
  target: IStatus,
  all: Todo[],
  allows: (fromId: string | null, toId: string) => boolean,
  statusById: StatusIndex,
): { moves: StatusMove[]; skipped: Skipped[] } {
  const moves: StatusMove[] = [];
  const skipped: Skipped[] = [];
  const moving = new Set(selected.map((todo) => todo.id));

  const column: Ranked[] = all.filter(
    (todo) =>
      columnIdOf(todo, statusById) === target.column_id &&
      !moving.has(todo.id) &&
      !isGenuineSubtask(all, todo),
  );

  for (const todo of selected) {
    if (todo.status_id === target.id) continue;

    if (target.column_id === null) {
      skipped.push({ todo, reason: "unplaceable" });
      continue;
    }

    if (!allows(todo.status_id, target.id)) {
      skipped.push({ todo, reason: "transition" });
      continue;
    }

    // another status in its own column keeps its place, as a single move does
    const sameColumn =
      columnIdOf(todo, statusById) === target.column_id && todo.rank !== null;
    const rank = sameColumn ? todo.rank! : rankForAppend(column);

    if (!sameColumn) column.push({ rank, position: null });

    moves.push({ todo, statusId: target.id, rank });
  }

  return { moves, skipped };
}

// undefined: keep as is. null: clear. Dates are instants, as the row stores them.
export interface BulkFields {
  assignee_id?: string | null;
  priority?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimate?: number | null;
  parent_id?: string | null;
  sprint_id?: string | null;
  label?: string;
}

export interface FieldPatch {
  todo: Todo;
  patch: TodoFields;
}

const day = (value: string | null | undefined) =>
  value ? toCalendarDay(value) : null;

export function planFieldEdit(
  selected: Todo[],
  fields: BulkFields,
  all: Todo[],
  context: {
    activeSprintId: string | null;
    workflow: Pick<WorkflowModel, "statuses" | "statusById">;
  },
): { patches: FieldPatch[]; labels: Todo[]; skipped: Skipped[] } {
  const patches: FieldPatch[] = [];
  const labels: Todo[] = [];
  const skipped: Skipped[] = [];

  for (const todo of selected) {
    const patch: TodoFields = {};
    const subtask = isGenuineSubtask(all, todo);

    if (fields.assignee_id !== undefined)
      patch.assignee_id = fields.assignee_id;
    if (fields.priority !== undefined) patch.priority = fields.priority;
    if (fields.estimate !== undefined) patch.estimate = fields.estimate;

    if (fields.start_date !== undefined || fields.due_date !== undefined) {
      const start =
        fields.start_date !== undefined ? fields.start_date : todo.start_date;
      const due =
        fields.due_date !== undefined ? fields.due_date : todo.due_date;

      // todos_date_range_check would refuse it; leave this row's dates alone
      if (start && due && day(start)! > day(due)!) {
        skipped.push({ todo, reason: "dates" });
      } else {
        if (fields.start_date !== undefined) patch.start_date = start;
        if (fields.due_date !== undefined) patch.due_date = due;
      }
    }

    if (fields.parent_id !== undefined) {
      // an Epic takes no parent, and a Subtask's parent is the row it hangs under
      if (isEpic(todo) || subtask || fields.parent_id === todo.id) {
        skipped.push({ todo, reason: "notApplicable" });
      } else {
        patch.parent_id = fields.parent_id;
      }
    }

    if (fields.sprint_id !== undefined) {
      // a Subtask rides with its parent's sprint
      if (subtask) {
        skipped.push({ todo, reason: "notApplicable" });
      } else {
        Object.assign(
          patch,
          sprintAssignmentPatch(
            todo,
            fields.sprint_id,
            context.activeSprintId,
            context.workflow,
            all,
          ),
        );
      }
    }

    if (Object.keys(patch).length > 0) patches.push({ todo, patch });
    if (fields.label) labels.push(todo);
  }

  return { patches, labels, skipped };
}

function ancestorIds(todo: Todo, byId: Map<string, Todo>): string[] {
  const ids: string[] = [];
  let parent = todo.parent_id ? byId.get(todo.parent_id) : undefined;

  while (parent) {
    ids.push(parent.id);
    parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  }

  return ids;
}

// todos_parent_id_fkey cascades, so a selected row whose ancestor is also
// selected goes with it — sending its own delete would only 404.
export function planDelete(
  selected: Todo[],
  all: Todo[],
): { roots: Todo[]; removed: Set<string>; cascaded: number } {
  const byId = new Map(all.map((todo) => [todo.id, todo]));
  const chosen = new Set(selected.map((todo) => todo.id));

  const roots = selected.filter(
    (todo) => !ancestorIds(todo, byId).some((id) => chosen.has(id)),
  );

  const rootIds = new Set(roots.map((todo) => todo.id));
  const removed = new Set(chosen);

  for (const todo of all) {
    if (ancestorIds(todo, byId).some((id) => rootIds.has(id))) {
      removed.add(todo.id);
    }
  }

  return { roots, removed, cascaded: removed.size - chosen.size };
}

import { DEFAULT_CATEGORY, type ColumnCategory } from "@/constants/columns";
import type {
  IColumn,
  IStatus,
  ITransition,
  IWorkflow,
  Todo,
} from "@/types/data";
import { byRank } from "@/utils/rank";

// A card's status is todo.status_id -> statuses; its column is that status's
// column_id. Nothing reads a column off the card any more, and everything that
// needs "which column" or "is it done" asks here.

export type StatusIndex = ReadonlyMap<string, IStatus>;

export interface WorkflowModel {
  version: number;
  // Board order.
  columns: IColumn[];
  // Board order: by column, then by rank inside the column.
  statuses: IStatus[];
  transitions: ITransition[];
  statusById: StatusIndex;
}

export const EMPTY_WORKFLOW: WorkflowModel = {
  version: 0,
  columns: [],
  statuses: [],
  transitions: [],
  statusById: new Map(),
};

export function toWorkflowModel(workflow: IWorkflow): WorkflowModel {
  const columns = workflow.columns.slice().sort(byRank);
  const columnIndex = new Map(
    columns.map((column, index) => [column.id, index]),
  );
  const indexOf = (status: IStatus) =>
    columnIndex.get(status.column_id ?? "") ?? Number.MAX_SAFE_INTEGER;

  const statuses = workflow.statuses
    .slice()
    .sort(
      (a, b) =>
        indexOf(a) - indexOf(b) || a.rank - b.rank || a.id.localeCompare(b.id),
    );

  return {
    version: workflow.workflow_version,
    columns,
    statuses,
    transitions: workflow.transitions,
    statusById: new Map(statuses.map((status) => [status.id, status])),
  };
}

// null for a card in the backlog, which has no status and so no column.
export function columnIdOf(
  todo: Pick<Todo, "status_id">,
  statusById: StatusIndex,
): string | null {
  if (todo.status_id === null) return null;

  return statusById.get(todo.status_id)?.column_id ?? null;
}

export function categoryOfTodo(
  todo: Pick<Todo, "status_id">,
  statusById: StatusIndex,
): ColumnCategory | null {
  if (todo.status_id === null) return null;

  return statusById.get(todo.status_id)?.category ?? null;
}

export function doneStatusIds(statuses: IStatus[]): Set<string> {
  return new Set(
    statuses
      .filter((status) => status.category === "done")
      .map((status) => status.id),
  );
}

export function isDoneIn(
  todo: Pick<Todo, "status_id">,
  doneStatuses: ReadonlySet<string>,
): boolean {
  return todo.status_id !== null && doneStatuses.has(todo.status_id);
}

export function statusesInColumn(
  statuses: IStatus[],
  columnId: string | null,
): IStatus[] {
  return statuses
    .filter((status) => status.column_id === columnId)
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

// The colour a column is painted: its first visible status's category. A
// column has no category of its own any more; this is presentation only.
export function columnCategory(
  statuses: IStatus[],
  columnId: string,
): ColumnCategory {
  const shown = statusesInColumn(statuses, columnId);

  return (
    (shown.find((status) => !status.is_hidden) ?? shown[0])?.category ??
    DEFAULT_CATEGORY
  );
}

// Where a card lands when it enters a column it is not already in: the first
// visible status there that `accepts` (the workflow gate), or the first visible
// one if it accepts none, so the gate can then say why the move is refused.
// null when the column has no visible status to receive work at all.
export function entryStatus(
  statuses: IStatus[],
  columnId: string,
  accepts: (status: IStatus) => boolean = () => true,
): IStatus | null {
  const visible = statusesInColumn(statuses, columnId).filter(
    (status) => !status.is_hidden,
  );

  return visible.find(accepts) ?? visible[0] ?? null;
}

// What a card may be moved to: every visible mapped status, plus the one it is in even
// when that is hidden — a hidden status stays valid for the cards already in it.
export function selectableStatuses(
  statuses: IStatus[],
  currentStatusId: string | null,
): IStatus[] {
  return statuses.filter(
    (status) =>
      (!status.is_hidden && status.column_id !== null) ||
      status.id === currentStatusId,
  );
}

// The stages a card can actually be asked to pass through: hidden statuses
// cannot receive work, so a stage present only through them is not one.
export function visibleCategories(statuses: IStatus[]): Set<ColumnCategory> {
  return new Set(
    statuses
      .filter((status) => !status.is_hidden)
      .map((status) => status.category),
  );
}

// Where a card created with no column in mind lands: the first visible status
// in board order — the first column's, as it always was, unless that column
// cannot receive work.
export function defaultStatus(statuses: IStatus[]): IStatus | null {
  return (
    statuses.find((status) => !status.is_hidden && status.column_id !== null) ??
    null
  );
}

// Mirror of the backend's sprints.repo#firstTodoStatus: the first visible
// todo-category status in board order. Where starting a sprint puts its work,
// and where a card entering the board through sprint planning lands.
export function firstTodoStatus(statuses: IStatus[]): IStatus | null {
  return (
    statuses.find(
      (status) =>
        status.category === "todo" &&
        !status.is_hidden &&
        status.column_id !== null,
    ) ?? null
  );
}

export function unmappedStatuses(statuses: IStatus[]): IStatus[] {
  return statusesInColumn(statuses, null);
}

export function hasTransition(
  transitions: readonly ITransition[],
  from: string,
  to: string,
): boolean {
  return transitions.some((edge) => edge.from === from && edge.to === to);
}

// What a card in `fromStatusId` may be moved to: every status the workflow has
// an edge to. Placement rules (hidden, unmapped) are not this function's
// question.
export function reachableStatusIds(
  transitions: readonly ITransition[],
  fromStatusId: string,
): Set<string> {
  return new Set(
    transitions
      .filter((edge) => edge.from === fromStatusId)
      .map((edge) => edge.to),
  );
}

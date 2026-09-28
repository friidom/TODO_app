import { columnTitle, type ColumnCategory } from "@/constants/columns";

import type { WorkflowModel } from "./statuses";

// The body of PUT /boards/:boardId/workflow: the whole workflow as it should
// be after the publish. Array order is the order; whatever is left out is
// deleted. Each builder here takes a draft and returns the next one, so the
// same builder applies to whatever snapshot is newest when the publish runs.
export interface WorkflowDraft {
  version: number;
  columns: { id: string; title: string }[];
  statuses: {
    id: string;
    column_id: string;
    name: string;
    category: ColumnCategory;
    is_hidden: boolean;
  }[];
  migrations: { from: string; to: string }[];
}

export function draftOf(model: WorkflowModel): WorkflowDraft {
  return {
    version: model.version,
    columns: model.columns.map((column) => ({
      id: column.id,
      title: columnTitle(column.title) || "Untitled",
    })),
    statuses: model.statuses.map((status) => ({
      id: status.id,
      column_id: status.column_id,
      name: status.name,
      category: status.category,
      is_hidden: status.is_hidden,
    })),
    migrations: [],
  };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Status names are unique on a board, ignoring case (statuses_board_id_name_key).
export function statusNameTaken(
  draft: WorkflowDraft,
  name: string,
  exceptStatusId?: string,
): boolean {
  return draft.statuses.some(
    (status) => status.id !== exceptStatusId && sameName(status.name, name),
  );
}

// A new column arrives with one visible status carrying its name and category,
// which is what creating a column always meant: somewhere cards of that stage
// can be put.
export function withColumnAdded(
  draft: WorkflowDraft,
  column: {
    columnId: string;
    statusId: string;
    title: string;
    category: ColumnCategory;
  },
): WorkflowDraft {
  return {
    ...draft,
    columns: [...draft.columns, { id: column.columnId, title: column.title }],
    statuses: [
      ...draft.statuses,
      {
        id: column.statusId,
        column_id: column.columnId,
        name: column.title,
        category: column.category,
        is_hidden: false,
      },
    ],
  };
}

// The status a column's rename carries with it: its only status, when that
// status still has the column's own name — the shape every board had before
// statuses were their own rows, where renaming the column WAS renaming the
// status. A column holding several statuses, or one named differently, keeps
// its statuses as they are.
export function renamedWithColumn(
  draft: WorkflowDraft,
  columnId: string,
): WorkflowDraft["statuses"][number] | null {
  const column = draft.columns.find((it) => it.id === columnId);
  const inColumn = draft.statuses.filter(
    (status) => status.column_id === columnId,
  );

  if (!column || inColumn.length !== 1) return null;

  const only = inColumn[0]!;

  return sameName(only.name, column.title) ? only : null;
}

export function withColumnRenamed(
  draft: WorkflowDraft,
  columnId: string,
  title: string,
): WorkflowDraft {
  const carried = renamedWithColumn(draft, columnId);

  return {
    ...draft,
    columns: draft.columns.map((column) =>
      column.id === columnId ? { ...column, title } : column,
    ),
    statuses: draft.statuses.map((status) =>
      status.id === carried?.id ? { ...status, name: title } : status,
    ),
  };
}

// Puts the columns in the order the board showed when the move was made. An
// absolute order rather than "move X by one", so a publish queued behind
// another lands the board where the user left it; a column someone else added
// meanwhile keeps its place after the ones named.
export function withColumnOrder(
  draft: WorkflowDraft,
  columnIds: string[],
): WorkflowDraft {
  const position = new Map(columnIds.map((id, index) => [id, index]));
  const at = (id: string) => position.get(id) ?? Number.MAX_SAFE_INTEGER;

  return {
    ...draft,
    columns: draft.columns
      .map((column, index) => ({ column, index }))
      .sort((a, b) => at(a.column.id) - at(b.column.id) || a.index - b.index)
      .map(({ column }) => column),
  };
}

// The status a card dropped on the column lands in: its first visible one.
// draft.statuses is in board order, so the first match is the first by rank.
export function entryStatusOf(
  draft: WorkflowDraft,
  columnId: string,
): WorkflowDraft["statuses"][number] | null {
  return (
    draft.statuses.find(
      (status) => status.column_id === columnId && !status.is_hidden,
    ) ?? null
  );
}

// Deleting a column deletes the statuses in it, and every card in them moves to
// where a card dropped on `destinationColumnId` would land — what deleting a
// column has always done with its cards. null when the destination has no
// visible status to receive them.
export function withColumnDeleted(
  draft: WorkflowDraft,
  columnId: string,
  destinationColumnId: string,
): WorkflowDraft | null {
  const destination = entryStatusOf(draft, destinationColumnId);

  if (destination === null || destinationColumnId === columnId) return null;

  const removed = draft.statuses
    .filter((status) => status.column_id === columnId)
    .map((status) => status.id);

  return {
    ...draft,
    columns: draft.columns.filter((column) => column.id !== columnId),
    statuses: draft.statuses.filter((status) => status.column_id !== columnId),
    migrations: [
      ...draft.migrations,
      ...removed.map((from) => ({ from, to: destination.id })),
    ],
  };
}

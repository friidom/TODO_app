import {
  DEFAULT_CATEGORY,
  columnTitle,
  type ColumnCategory,
} from "@/constants/columns";

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
    // null is an unmapped status.
    column_id: string | null;
    name: string;
    category: ColumnCategory;
    is_hidden: boolean;
  }[];
  // Every allowed move, as the whole set it should be after the publish.
  transitions: { from: string; to: string }[];
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
    transitions: model.transitions.map((edge) => ({ ...edge })),
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

type DraftTransition = WorkflowDraft["transitions"][number];

const STAGES: ColumnCategory[] = ["todo", "in_progress", "in_review", "done"];

function stageOf(category: ColumnCategory): number {
  return STAGES.indexOf(category);
}

export function hasEdge(
  draft: WorkflowDraft,
  from: string,
  to: string,
): boolean {
  return draft.transitions.some(
    (edge) => edge.from === from && edge.to === to,
  );
}

// The edges a new status starts with, so adding one does not leave it
// unreachable: the sequential rule the board has always followed (forward one
// stage, backward and sideways free) applied between it and the statuses that
// are already there. A stage the board has no visible status in can be skipped.
// They are ordinary edges from here on; the workflow editor changes them.
function defaultEdgesFor(
  draft: WorkflowDraft,
  added: WorkflowDraft["statuses"][number],
): DraftTransition[] {
  const stages = new Set(
    [...draft.statuses, added]
      .filter((status) => !status.is_hidden)
      .map((status) => stageOf(status.category)),
  );
  const allowed = (from: ColumnCategory, to: ColumnCategory) => {
    const start = stageOf(from);
    const end = stageOf(to);

    return (
      end - start <= 1 ||
      ![...stages].some((stage) => stage > start && stage < end)
    );
  };

  return draft.statuses.flatMap((other) => [
    ...(allowed(other.category, added.category)
      ? [{ from: other.id, to: added.id }]
      : []),
    ...(allowed(added.category, other.category)
      ? [{ from: added.id, to: other.id }]
      : []),
  ]);
}

// Removing a status must not strand the work behind it: every status that led
// into it is connected to every status it led to, unless already connected.
function withoutStatusEdges(
  transitions: DraftTransition[],
  statusId: string,
): DraftTransition[] {
  const into = transitions.filter((edge) => edge.to === statusId);
  const out = transitions.filter((edge) => edge.from === statusId);
  const kept = transitions.filter(
    (edge) => edge.from !== statusId && edge.to !== statusId,
  );
  const known = new Set(kept.map((edge) => `${edge.from}>${edge.to}`));
  const bridges: DraftTransition[] = [];

  for (const a of into) {
    for (const b of out) {
      const key = `${a.from}>${b.to}`;

      if (a.from === b.to || known.has(key)) continue;

      known.add(key);
      bridges.push({ from: a.from, to: b.to });
    }
  }

  return [...kept, ...bridges];
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
  const status = {
    id: column.statusId,
    column_id: column.columnId,
    name: column.title,
    category: column.category,
    is_hidden: false,
  };

  return {
    ...draft,
    columns: [...draft.columns, { id: column.columnId, title: column.title }],
    statuses: [...draft.statuses, status],
    transitions: [...draft.transitions, ...defaultEdgesFor(draft, status)],
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
    transitions: removed.reduce(withoutStatusEdges, draft.transitions),
    migrations: [
      ...draft.migrations,
      ...removed.map((from) => ({ from, to: destination.id })),
    ],
  };
}

type DraftStatus = WorkflowDraft["statuses"][number];

// By column, then by place inside the column. The API only reads the order
// inside a column, but a draft that keeps the whole array in board order can be
// read top to bottom as the board.
function inBoardOrder(
  columns: WorkflowDraft["columns"],
  statuses: DraftStatus[],
): DraftStatus[] {
  const columnIds = new Set(columns.map((column) => column.id));

  return [
    ...columns.flatMap((column) =>
      statuses.filter((status) => status.column_id === column.id),
    ),
    ...statuses.filter(
      (status) => status.column_id === null || !columnIds.has(status.column_id),
    ),
  ];
}

function placed(
  draft: WorkflowDraft,
  status: DraftStatus,
  columnId: string | null,
  index: number,
): DraftStatus[] {
  const rest = draft.statuses.filter((it) => it.id !== status.id);
  const inColumn = rest.filter((it) => it.column_id === columnId);
  const at = Math.max(0, Math.min(index, inColumn.length));

  return inBoardOrder(draft.columns, [
    ...rest.filter((it) => it.column_id !== columnId),
    ...inColumn.slice(0, at),
    { ...status, column_id: columnId },
    ...inColumn.slice(at),
  ]);
}

function hasColumn(draft: WorkflowDraft, columnId: string): boolean {
  return draft.columns.some((column) => column.id === columnId);
}

function statusIn(
  draft: WorkflowDraft,
  statusId: string,
): DraftStatus | undefined {
  return draft.statuses.find((status) => status.id === statusId);
}

function withStatus(
  draft: WorkflowDraft,
  statusId: string,
  change: Partial<Omit<DraftStatus, "id">>,
): WorkflowDraft | null {
  if (!statusIn(draft, statusId)) return null;

  return {
    ...draft,
    statuses: draft.statuses.map((status) =>
      status.id === statusId ? { ...status, ...change } : status,
    ),
  };
}

export function statusesOfColumn(
  draft: WorkflowDraft,
  columnId: string | null,
): DraftStatus[] {
  return draft.statuses.filter((status) => status.column_id === columnId);
}

// Mirrors statuses.ts#columnCategory for a draft: the colour a column is
// painted, and so the category a status added to it starts with.
export function columnCategoryOf(
  draft: WorkflowDraft,
  columnId: string,
): ColumnCategory {
  const inColumn = statusesOfColumn(draft, columnId);

  return (
    (inColumn.find((status) => !status.is_hidden) ?? inColumn[0])?.category ??
    DEFAULT_CATEGORY
  );
}

// `index` counts the column's statuses without the one being moved, which is
// what insertionIndex answers for a drop.
export function withStatusMoved(
  draft: WorkflowDraft,
  statusId: string,
  columnId: string | null,
  index: number,
): WorkflowDraft | null {
  const status = statusIn(draft, statusId);

  if (!status || (columnId !== null && !hasColumn(draft, columnId))) {
    return null;
  }

  return { ...draft, statuses: placed(draft, status, columnId, index) };
}

export function withStatusUnmapped(
  draft: WorkflowDraft,
  statusId: string,
): WorkflowDraft | null {
  return withStatusMoved(draft, statusId, null, Number.POSITIVE_INFINITY);
}

export function withStatusAdded(
  draft: WorkflowDraft,
  status: {
    id: string;
    columnId: string | null;
    name: string;
    category: ColumnCategory;
  },
): WorkflowDraft | null {
  if (
    !status.name.trim() ||
    (status.columnId !== null && !hasColumn(draft, status.columnId)) ||
    statusIn(draft, status.id) ||
    statusNameTaken(draft, status.name)
  ) {
    return null;
  }

  const added = {
    id: status.id,
    column_id: status.columnId,
    name: status.name,
    category: status.category,
    is_hidden: false,
  };

  return {
    ...draft,
    statuses: placed(draft, added, status.columnId, Number.POSITIVE_INFINITY),
    transitions: [...draft.transitions, ...defaultEdgesFor(draft, added)],
  };
}

export function withStatusRenamed(
  draft: WorkflowDraft,
  statusId: string,
  name: string,
): WorkflowDraft | null {
  if (!name.trim() || statusNameTaken(draft, name, statusId)) return null;

  return withStatus(draft, statusId, { name });
}

export function withStatusCategory(
  draft: WorkflowDraft,
  statusId: string,
  category: ColumnCategory,
): WorkflowDraft | null {
  return withStatus(draft, statusId, { category });
}

export function withStatusHidden(
  draft: WorkflowDraft,
  statusId: string,
  hidden: boolean,
): WorkflowDraft | null {
  return withStatus(draft, statusId, { is_hidden: hidden });
}

function canReceiveWork(draft: WorkflowDraft, statusId: string): boolean {
  const status = statusIn(draft, statusId);

  return !!status && !status.is_hidden;
}

// Re-points work an earlier delete in this draft sent to `target`.
export function withMigrationsRetargeted(
  draft: WorkflowDraft,
  target: string,
  to: string,
): WorkflowDraft | null {
  if (!canReceiveWork(draft, to)) return null;

  return {
    ...draft,
    migrations: draft.migrations.map((migration) =>
      migration.to === target ? { ...migration, to } : migration,
    ),
  };
}

// What a status will hold once the draft is published: its own work items,
// plus those an earlier delete in this draft sends to it. `counts` is work
// items per stored status id.
export function workItemCount(
  draft: WorkflowDraft,
  statusId: string,
  counts: ReadonlyMap<string, number>,
): number {
  return draft.migrations
    .filter((migration) => migration.to === statusId)
    .reduce(
      (sum, migration) => sum + (counts.get(migration.from) ?? 0),
      counts.get(statusId) ?? 0,
    );
}

// `migrateTo` is where the work the status will hold goes, and null when it
// will hold none. Work an earlier delete sent to this status follows its own;
// with no `migrateTo` it is left pointing at a status that is gone, which
// brokenMigrations reports. A status this draft created (`stored: false`)
// carries no migration of its own, because the API refuses a migration off a
// status it has never stored.
export function withStatusDeleted(
  draft: WorkflowDraft,
  statusId: string,
  migrateTo: string | null,
  { stored = true }: { stored?: boolean } = {},
): WorkflowDraft | null {
  if (!statusIn(draft, statusId)) return null;

  let next = draft;

  if (migrateTo !== null) {
    const retargeted =
      migrateTo === statusId
        ? null
        : withMigrationsRetargeted(draft, statusId, migrateTo);

    if (!retargeted) return null;

    next = stored
      ? {
          ...retargeted,
          migrations: [
            ...retargeted.migrations,
            { from: statusId, to: migrateTo },
          ],
        }
      : retargeted;
  }

  return {
    ...next,
    statuses: next.statuses.filter((status) => status.id !== statusId),
    transitions: withoutStatusEdges(next.transitions, statusId),
  };
}

export function withTransitionAdded(
  draft: WorkflowDraft,
  from: string,
  to: string,
): WorkflowDraft | null {
  if (
    from === to ||
    !statusIn(draft, from) ||
    !statusIn(draft, to) ||
    hasEdge(draft, from, to)
  ) {
    return null;
  }

  return { ...draft, transitions: [...draft.transitions, { from, to }] };
}

export function withTransitionRemoved(
  draft: WorkflowDraft,
  from: string,
  to: string,
): WorkflowDraft | null {
  if (!hasEdge(draft, from, to)) return null;

  return {
    ...draft,
    transitions: draft.transitions.filter(
      (edge) => !(edge.from === from && edge.to === to),
    ),
  };
}

// The API refuses a migration into a status that is not in the publish, or is
// hidden — either happens when a target is deleted or hidden after the delete
// that chose it.
export function brokenMigrations(
  draft: WorkflowDraft,
): WorkflowDraft["migrations"] {
  return draft.migrations.filter(
    (migration) => !canReceiveWork(draft, migration.to),
  );
}

// Unlike withColumnDeleted, the column's statuses and their work items stay:
// they join the column before it, or the one after when it is the first, on the
// side that keeps the board's order.
export function withColumnRemoved(
  draft: WorkflowDraft,
  columnId: string,
): WorkflowDraft | null {
  const at = draft.columns.findIndex((column) => column.id === columnId);

  if (at === -1 || draft.columns.length < 2) return null;

  const neighbour = draft.columns[at === 0 ? 1 : at - 1]!;
  const columns = draft.columns.filter((column) => column.id !== columnId);
  const moving = statusesOfColumn(draft, columnId).map((status) => ({
    ...status,
    column_id: neighbour.id,
  }));
  const staying = draft.statuses.filter(
    (status) => status.column_id !== columnId,
  );

  return {
    ...draft,
    columns,
    statuses: inBoardOrder(
      columns,
      at === 0 ? [...moving, ...staying] : [...staying, ...moving],
    ),
  };
}

function canonical(draft: WorkflowDraft): string {
  return JSON.stringify({
    columns: draft.columns.map((column) => [
      column.id,
      column.title,
      statusesOfColumn(draft, column.id).map((status) => [
        status.id,
        status.name,
        status.category,
        status.is_hidden,
      ]),
    ]),
    unmapped: statusesOfColumn(draft, null).map((status) => [
      status.id,
      status.name,
      status.category,
      status.is_hidden,
    ]),
    transitions: draft.transitions
      .map((edge) => `${edge.from}>${edge.to}`)
      .sort(),
    migrations: draft.migrations
      .map((migration) => `${migration.from}>${migration.to}`)
      .sort(),
  });
}

// Whether publishing `b` over `a` would change anything. Array order across
// columns is not compared, since the API reads only the order inside one.
export function sameWorkflow(a: WorkflowDraft, b: WorkflowDraft): boolean {
  return canonical(a) === canonical(b);
}

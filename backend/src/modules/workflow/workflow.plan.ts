import { AppError } from "../../lib/errors.js";
import { RANK_GAP } from "../../lib/rank.js";
import type { PublishWorkflowInput } from "./workflow.schema.js";

export interface CurrentColumn {
  id: string;
  title: string | null;
  rank: number | null;
  position: number | null;
}

export interface Transition {
  from: string;
  to: string;
}

export interface CurrentStatus {
  id: string;
  column_id: string | null;
  name: string;
  category: string;
  rank: number;
  is_hidden: boolean;
}

export interface CurrentWorkflow {
  columns: CurrentColumn[];
  statuses: CurrentStatus[];
  transitions: Transition[];
  // Work items per status id. A status absent from the map holds none.
  cards: ReadonlyMap<string, number>;
}

export interface ColumnWrite {
  id: string;
  title: string;
  rank: number;
  position: number;
}

export interface StatusWrite {
  id: string;
  column_id: string | null;
  name: string;
  category: string;
  rank: number;
  is_hidden: boolean;
}

export interface CardMigration {
  from: string;
  to: string;
  // The column the cards land in when it differs from the one they leave; they
  // are appended there, as deleting a column always appended its cards (§10.6).
  // null when they stay in the same column and so keep their order.
  appendTo: string | null;
}

export interface WorkflowPlan {
  createColumns: ColumnWrite[];
  updateColumns: (Pick<ColumnWrite, "id"> & Partial<ColumnWrite>)[];
  deleteColumns: string[];
  createStatuses: StatusWrite[];
  updateStatuses: (Pick<StatusWrite, "id"> & Partial<StatusWrite>)[];
  deleteStatuses: string[];
  createTransitions: Transition[];
  deleteTransitions: Transition[];
  migrations: CardMigration[];
}

function badRequest(message: string): AppError {
  return new AppError("bad_request", message);
}

// statuses.name is citext, so the database compares lowercased.
function nameKey(name: string): string {
  return name.toLowerCase();
}

function requireUnique(ids: string[], what: string): void {
  if (new Set(ids).size !== ids.length) {
    throw badRequest(`Each ${what} may appear only once.`);
  }
}

function changedFields<T extends { id: string }>(current: T, next: T): Partial<T> {
  const changes: Partial<T> = {};

  for (const key of Object.keys(next) as (keyof T)[]) {
    if (key !== "id" && current[key] !== next[key]) changes[key] = next[key];
  }

  return changes;
}

function withChanges<T extends { id: string }>(
  id: string,
  changes: Partial<T>,
): (Pick<T, "id"> & Partial<T>)[] {
  return Object.keys(changes).length === 0 ? [] : [{ ...changes, id } as Pick<T, "id"> & Partial<T>];
}

// Pure: reads the workflow as it is and the workflow as the publish says it
// should be, refuses what the rules forbid, and returns the writes. The service
// applies them in one transaction; nothing here touches the database.
export function planWorkflow(current: CurrentWorkflow, input: PublishWorkflowInput): WorkflowPlan {
  requireUnique(
    input.columns.map((column) => column.id),
    "column",
  );
  requireUnique(
    input.statuses.map((status) => status.id),
    "status",
  );

  const seenNames = new Map<string, string>();

  for (const status of input.statuses) {
    const key = nameKey(status.name);

    if (seenNames.has(key)) {
      throw badRequest(`Two statuses are named "${status.name}". Status names must be unique.`);
    }

    seenNames.set(key, status.name);
  }

  const nextColumnIds = new Set(input.columns.map((column) => column.id));

  for (const status of input.statuses) {
    if (status.column_id !== null && !nextColumnIds.has(status.column_id)) {
      throw badRequest(`The status "${status.name}" names a column that is not in the workflow.`);
    }
  }

  const currentColumns = new Map(current.columns.map((column) => [column.id, column]));
  const currentStatuses = new Map(current.statuses.map((status) => [status.id, status]));

  const plan: WorkflowPlan = {
    createColumns: [],
    updateColumns: [],
    deleteColumns: current.columns
      .filter((column) => !nextColumnIds.has(column.id))
      .map((column) => column.id),
    createStatuses: [],
    updateStatuses: [],
    deleteStatuses: [],
    createTransitions: [],
    deleteTransitions: [],
    migrations: [],
  };

  input.columns.forEach((column, index) => {
    const next: ColumnWrite = {
      id: column.id,
      title: column.title,
      rank: (index + 1) * RANK_GAP,
      position: index,
    };
    const existing = currentColumns.get(column.id);

    if (existing === undefined) {
      plan.createColumns.push(next);

      return;
    }

    plan.updateColumns.push(
      ...withChanges<ColumnWrite>(
        column.id,
        changedFields<ColumnWrite>(
          {
            id: existing.id,
            title: existing.title ?? "",
            rank: existing.rank ?? Number.NaN,
            position: existing.position ?? Number.NaN,
          },
          next,
        ),
      ),
    );
  });

  const indexInColumn = new Map<string | null, number>();
  const nextStatuses = new Map<string, StatusWrite>();

  for (const status of input.statuses) {
    const index = indexInColumn.get(status.column_id) ?? 0;

    indexInColumn.set(status.column_id, index + 1);

    const next: StatusWrite = {
      id: status.id,
      column_id: status.column_id,
      name: status.name,
      category: status.category,
      rank: (index + 1) * RANK_GAP,
      is_hidden: status.is_hidden,
    };

    nextStatuses.set(status.id, next);

    const existing = currentStatuses.get(status.id);

    if (existing === undefined) {
      plan.createStatuses.push(next);

      continue;
    }

    plan.updateStatuses.push(
      ...withChanges<StatusWrite>(status.id, changedFields<StatusWrite>(existing, next)),
    );
  }

  plan.deleteStatuses = current.statuses
    .filter((status) => !nextStatuses.has(status.id))
    .map((status) => status.id);

  const deleted = new Set(plan.deleteStatuses);

  requireUnique(
    input.migrations.map((migration) => migration.from),
    "status to move work items off",
  );

  for (const migration of input.migrations) {
    const from = currentStatuses.get(migration.from);

    if (from === undefined || !deleted.has(migration.from)) {
      throw badRequest("Work items can only be moved off a status this publish deletes.");
    }

    const to = nextStatuses.get(migration.to);

    if (to === undefined) {
      throw badRequest(`Work items from "${from.name}" must move to a status in the workflow.`);
    }

    if (to.column_id === null) {
      throw badRequest(
        `Work items from "${from.name}" cannot move to "${to.name}", which is not on any column.`,
      );
    }

    if (to.is_hidden) {
      throw badRequest(
        `Work items from "${from.name}" cannot move to "${to.name}", which is hidden.`,
      );
    }

    plan.migrations.push({
      from: migration.from,
      to: migration.to,
      appendTo: to.column_id === from.column_id ? null : to.column_id,
    });
  }

  for (const status of nextStatuses.values()) {
    const count = current.cards.get(status.id) ?? 0;

    if (status.column_id === null && count > 0) {
      throw new AppError(
        "conflict",
        `The status "${status.name}" still holds ${count} work item${count === 1 ? "" : "s"}, ` +
          "so it has to stay on a column. Move the work items first.",
      );
    }
  }

  const migrated = new Set(plan.migrations.map((migration) => migration.from));

  for (const statusId of plan.deleteStatuses) {
    const count = current.cards.get(statusId) ?? 0;

    if (count > 0 && !migrated.has(statusId)) {
      const name = currentStatuses.get(statusId)?.name ?? "";

      throw new AppError(
        "conflict",
        `The status "${name}" still holds ${count} work item${count === 1 ? "" : "s"}. ` +
          "Choose a status to move them to before deleting it.",
      );
    }
  }

  const pairKey = (edge: Transition) => `${edge.from}>${edge.to}`;
  const nextEdges = new Map<string, Transition>();

  for (const edge of input.transitions) {
    if (edge.from === edge.to) throw badRequest("A status cannot have a transition to itself.");

    // An edge on a status this publish deletes goes with it, as the cascade
    // would take it anyway. One naming a status the board never had is an error.
    if (deleted.has(edge.from) || deleted.has(edge.to)) continue;

    if (!nextStatuses.has(edge.from) || !nextStatuses.has(edge.to)) {
      throw badRequest("A transition names a status that is not in the workflow.");
    }

    if (nextEdges.has(pairKey(edge))) throw badRequest("Each transition may appear only once.");

    nextEdges.set(pairKey(edge), edge);
  }

  const currentEdges = new Set(current.transitions.map(pairKey));

  plan.createTransitions = [...nextEdges.values()].filter((edge) => !currentEdges.has(pairKey(edge)));
  // An edge on a deleted status leaves with the status (cascade), so it is not
  // a delete of its own.
  plan.deleteTransitions = current.transitions.filter(
    (edge) => !nextEdges.has(pairKey(edge)) && !deleted.has(edge.from) && !deleted.has(edge.to),
  );

  return plan;
}

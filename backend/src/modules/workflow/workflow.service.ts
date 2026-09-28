import { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { emitInvalidate } from "../../realtime/emit.js";
import type { Actor } from "../../types/actor.js";
import * as columnsRepo from "../columns/columns.repo.js";
import type { ColumnRow } from "../columns/columns.repo.js";
import * as todosRepo from "../todos/todos.repo.js";
import { planWorkflow } from "./workflow.plan.js";
import * as workflowRepo from "./workflow.repo.js";
import type { StatusRow } from "./workflow.repo.js";
import type { PublishWorkflowInput } from "./workflow.schema.js";

export interface WorkflowSnapshot {
  workflow_version: number;
  columns: ColumnRow[];
  // Board order: by column, then by rank inside the column.
  statuses: StatusRow[];
}

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

function inBoardOrder(columns: ColumnRow[], statuses: StatusRow[]): StatusRow[] {
  const columnIndex = new Map(columns.map((column, index) => [column.id, index]));

  return statuses
    .map((status, index) => ({ status, index }))
    .sort(
      (a, b) =>
        (columnIndex.get(a.status.column_id) ?? Number.MAX_SAFE_INTEGER) -
          (columnIndex.get(b.status.column_id) ?? Number.MAX_SAFE_INTEGER) ||
        a.index - b.index,
    )
    .map(({ status }) => status);
}

// One REPEATABLE READ snapshot, so the version handed out always describes
// exactly the columns and statuses beside it. Read separately, a publish landing
// between the reads could pair a fresh version with stale statuses, and the next
// publish from that client would pass the version check and silently undo it.
export async function snapshot(boardId: string): Promise<WorkflowSnapshot> {
  const result = await prisma.$transaction(
    async (tx) => {
      const version = await workflowRepo.versionOf(boardId, tx);

      if (version === null) return null;

      const columns = await columnsRepo.findByBoard(boardId, tx);
      const statuses = await workflowRepo.findByBoard(boardId, tx);

      return { workflow_version: version, columns, statuses: inBoardOrder(columns, statuses) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  if (result === null) throw notFound();

  return result;
}

// Shared by PUT /boards/:boardId/workflow (owner and admin) and
// PUT /admin/boards/:id/workflow (superadmin). Who may call it is each route's
// question; what a publish may do is answered once, here and in
// workflow.plan.ts.
//
// Everything happens in one transaction, in an order the constraints accept:
// columns exist before statuses move into them, statuses exist before work
// items move into them, work items leave a status before it is deleted, and a
// column is deleted only once no status is left in it. Status-name uniqueness
// is deferred to COMMIT so the order of renames cannot matter.
//
// Moving work items off a deleted status is deliberately not held to the
// sequential workflow: the status is going away, and refusing would leave a
// status that cannot be deleted — the same reasoning deleting a column always
// followed.
export async function publish(
  actor: Actor,
  boardId: string,
  input: PublishWorkflowInput,
): Promise<WorkflowSnapshot> {
  await withActor(actor.id, async (tx) => {
    if (!(await workflowRepo.claimVersion(tx, boardId, input.version))) {
      if ((await workflowRepo.versionOf(boardId, tx)) === null) throw notFound();

      throw new AppError(
        "conflict",
        "The workflow was changed since it was loaded. Reload it and try again.",
      );
    }

    await workflowRepo.deferNameUniqueness(tx);

    const plan = planWorkflow(
      {
        columns: await columnsRepo.findByBoard(boardId, tx),
        statuses: await workflowRepo.findByBoard(boardId, tx),
        cards: await workflowRepo.cardCounts(tx, boardId),
      },
      input,
    );

    await columnsRepo.insertMany(tx, boardId, plan.createColumns);

    for (const change of plan.updateColumns) {
      await columnsRepo.updateStructure(tx, boardId, change);
    }

    await workflowRepo.insertMany(tx, boardId, plan.createStatuses);

    for (const change of plan.updateStatuses) {
      await workflowRepo.updateStructure(tx, boardId, change);
    }

    for (const migration of plan.migrations) {
      await todosRepo.moveStatusCards(tx, boardId, migration);
    }

    await workflowRepo.removeMany(tx, boardId, plan.deleteStatuses);
    await columnsRepo.removeMany(tx, boardId, plan.deleteColumns);
  });

  // A category change stamps started_at and completed_at on every card in the
  // status, and a migration moves cards, so the cards are refetched with the
  // workflow rather than described.
  emitInvalidate(boardId, ["workflow", "todos"]);

  return snapshot(boardId);
}

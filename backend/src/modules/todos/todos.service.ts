import { randomUUID } from "node:crypto";

import { withActor } from "../../db/withActor.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { rankForAppend } from "../../lib/rank.js";
import type { Actor } from "../../types/actor.js";
import { emitChange, emitDeleted, emitInvalidate } from "../../realtime/emit.js";
import * as boardsRepo from "../boards/boards.repo.js";
import * as membersRepo from "../members/members.repo.js";
import type { BoardContext } from "../members/members.service.js";
import * as todosRepo from "./todos.repo.js";
import * as workflowRepo from "../workflow/workflow.repo.js";
import type { TodoDetailRow, TodoRow, TodoWrite } from "./todos.repo.js";
import type { CreateTodoInput, MoveTodoInput, UpsertTodoInput } from "./todos.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

// The id belongs to a row on a board the caller cannot see, so the upsert's
// where missed and the insert hit the primary key. Reported as a conflict
// rather than silently writing to the other board.
function conflictIfForeignId(error: unknown): unknown {
  return uniqueConstraintOf(error) === "todos_pkey"
    ? new AppError("conflict", "That id is already in use.")
    : error;
}

// An assignee who is not on the board is not merely meaningless.
// notify_on_assignment writes them a notifications row carrying the board
// title, the card title and the actor name -- all three chosen by the caller --
// so without this check any editor of any board can put arbitrary text in any
// account's inbox, and the invitee search hands them the ids to aim at.
async function requireBoardMember(
  board: BoardContext,
  assigneeId: string | null | undefined,
): Promise<void> {
  if (assigneeId === undefined || assigneeId === null) return;

  if ((await membersRepo.roleOf(board.id, assigneeId)) === null) {
    throw new AppError("bad_request", "That person is not a member of this board.");
  }
}

// Every write that places a card in a status runs this first. The status must
// be on this board — the composite foreign key would refuse it too, but as a
// 409 that says nothing — and it must not be hidden, unless it is the status
// the card already has: a hidden status is retired from new placement, and the
// cards already in it stay valid.
//
// Returns the placements it read, so the workflow check that follows does not
// read them again.
async function requirePlaceableStatus(
  board: BoardContext,
  currentStatusId: string | null,
  nextStatusId: string | null | undefined,
): Promise<Map<string, workflowRepo.StatusPlacement>> {
  if (nextStatusId === undefined || nextStatusId === null) return new Map();

  const ids = currentStatusId === null ? [nextStatusId] : [currentStatusId, nextStatusId];
  const placements = await workflowRepo.placementsOf(board.id, ids);
  const next = placements.get(nextStatusId);

  if (next === undefined) {
    throw new AppError("bad_request", "That status is not on this board.");
  }

  if (next.column_id === null && nextStatusId !== currentStatusId) {
    throw new AppError("bad_request", "That status is not on any column and cannot receive work items.");
  }

  if (next.is_hidden && nextStatusId !== currentStatusId) {
    throw new AppError("bad_request", "That status is hidden and cannot receive work items.");
  }

  return placements;
}

// THE one place the workflow is enforced. Both user-driven writes of status_id
// call it -- move (drag and drop) and upsert (PATCH) -- so a rule added here
// cannot be missed by one of them, and neither controller
// knows the rule exists.
//
// Deliberately NOT called from create (a first placement has no "from"), from
// a workflow publish moving cards off a deleted status (the status is going
// away whatever its category), or from the sprint start bulk-assign (it only
// fills status_id where it is null).
//
// Whether it runs at all is boards.workflow_enabled (migration 0020), one
// field on the board this request already resolved. The rule itself is the
// board's stored status_transitions.
async function requireAllowedTransition(
  board: BoardContext,
  currentStatusId: string | null,
  nextStatusId: string | null | undefined,
  placements: Map<string, workflowRepo.StatusPlacement>,
): Promise<void> {
  // undefined: the patch does not touch the status. null: the card is being
  // taken off the board entirely, which is a Backlog move, not a transition.
  if (nextStatusId === undefined || nextStatusId === null) return;

  // No status yet (a backlog card arriving on the board, or a row the upsert is
  // about to create): a first placement is not a transition.
  if (currentStatusId === null) return;

  // Same status: a reorder, which changes rank and never status.
  if (currentStatusId === nextStatusId) return;

  if (!(await boardsRepo.workflowEnabledFor(board.id))) return;

  if (await workflowRepo.transitionExists(board.id, currentStatusId, nextStatusId)) return;

  const from = placements.get(currentStatusId)?.name ?? "this status";
  const to = placements.get(nextStatusId)?.name ?? "that status";

  throw new AppError(
    "bad_request",
    `The workflow has no transition from "${from}" to "${to}".`,
  );
}

async function requireStatusChange(
  board: BoardContext,
  todoId: string,
  nextStatusId: string | null | undefined,
): Promise<void> {
  if (nextStatusId === undefined || nextStatusId === null) return;

  const currentStatusId = (await todosRepo.statusOf(board.id, todoId))?.status_id ?? null;
  const placements = await requirePlaceableStatus(board, currentStatusId, nextStatusId);

  await requireAllowedTransition(board, currentStatusId, nextStatusId, placements);
}

export function list(board: BoardContext): Promise<TodoRow[]> {
  return todosRepo.findByBoard(board.id);
}

export async function get(board: BoardContext, todoId: string): Promise<TodoDetailRow> {
  const todo = await todosRepo.findOne(board.id, todoId);

  if (todo === null) throw notFound();

  return todo;
}

function writeFrom(input: UpsertTodoInput | CreateTodoInput): TodoWrite {
  return {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.status_id !== undefined && { status_id: input.status_id }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.start_date !== undefined && { start_date: input.start_date }),
    ...(input.due_date !== undefined && { due_date: input.due_date }),
    ...(input.estimate !== undefined && { estimate: input.estimate }),
    ...(input.assignee_id !== undefined && { assignee_id: input.assignee_id }),
    ...(input.parent_id !== undefined && { parent_id: input.parent_id }),
    ...(input.sprint_id !== undefined && { sprint_id: input.sprint_id }),
    ...(input.rank !== undefined && { rank: input.rank }),
    ...(input.backlog_rank !== undefined && { backlog_rank: input.backlog_rank }),
  };
}

export async function create(
  actor: Actor,
  board: BoardContext,
  input: CreateTodoInput,
): Promise<TodoDetailRow> {
  await requireBoardMember(board, input.assignee_id);

  const placements = await requirePlaceableStatus(board, null, input.status_id);
  const write = writeFrom(input);

  // The append rank the client used to read for itself before sending. Only
  // computed when the card lands in a status and the client did not choose a
  // rank of its own; the card goes after the last card of the status's column.
  const placement = input.status_id == null ? undefined : placements.get(input.status_id);

  if (placement?.column_id != null && input.rank === undefined) {
    const last = await todosRepo.lastInColumn(board.id, placement.column_id);

    write.rank = rankForAppend(last === null ? [] : [last]);
    write.position = (last?.position ?? -1) + 1;
  }

  try {
    const created = await withActor(actor.id, (tx) =>
      todosRepo.upsert(tx, board.id, input.id ?? randomUUID(), actor.id, write),
    );

    emitChange(board.id, "todo", "INSERT", created);

    return created;
  } catch (error) {
    throw conflictIfForeignId(error);
  }
}

// PATCH is an upsert because a freshly created card can be patched before its
// insert lands, and an update would silently match zero rows — the board would
// look correct and then revert (§12.3). boardAccess is wired with
// mayNotExist:"todoId" for this route, so the id is NOT resolved and the
// scoping is entirely this compound-key write's job.
export async function upsert(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  input: UpsertTodoInput,
): Promise<TodoDetailRow> {
  await requireBoardMember(board, input.assignee_id);
  await requireStatusChange(board, todoId, input.status_id);

  try {
    const saved = await withActor(actor.id, (tx) =>
      todosRepo.upsert(tx, board.id, todoId, actor.id, writeFrom(input)),
    );

    emitChange(board.id, "todo", "UPDATE", saved);

    return saved;
  } catch (error) {
    throw conflictIfForeignId(error);
  }
}

export async function remove(actor: Actor, board: BoardContext, todoId: string): Promise<void> {
  const removed = await withActor(actor.id, (tx) => todosRepo.remove(tx, board.id, todoId));

  if (removed === 0) throw notFound();

  emitDeleted(board.id, "todo", todoId);
  // The card's own removal is precise; what it cascaded is not enumerable
  // from here, so those two scopes are refetched rather than described.
  emitInvalidate(board.id, ["comments", "attachments"]);
}

// One row. The old dense-integer scheme renumbered a whole column from each
// client's own snapshot, so two people dragging at once overwrote cards
// neither had touched.
export async function move(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  input: MoveTodoInput,
): Promise<TodoDetailRow> {
  await requireStatusChange(board, todoId, input.status_id);

  const moved = await withActor(actor.id, (tx) =>
    todosRepo.update(tx, board.id, todoId, { status_id: input.status_id, rank: input.rank }),
  );

  if (moved === 0) throw notFound();

  // Re-read rather than echo the input: the emitted payload must be the same
  // projection a GET would return, or a client could receive a shape it could
  // not have selected.
  const row = await todosRepo.findOne(board.id, todoId);

  if (row === null) throw notFound();

  emitChange(board.id, "todo", "UPDATE", row);

  return row;
}

export async function rebalanceColumn(
  actor: Actor,
  board: BoardContext,
  columnId: string,
): Promise<number> {
  const count = await withActor(actor.id, (tx) =>
    todosRepo.rebalanceColumn(tx, board.id, columnId),
  );

  emitInvalidate(board.id, ["todos"]);

  return count;
}

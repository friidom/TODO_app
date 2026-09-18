import { withActor } from "../../db/withActor.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { RANK_GAP } from "../../lib/rank.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as sprintsRepo from "./sprints.repo.js";
import type { SprintRow } from "./sprints.repo.js";
import type { CreateSprintInput, UpdateSprintInput } from "./sprints.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

async function require(board: BoardContext, sprintId: string): Promise<SprintRow> {
  const sprint = await sprintsRepo.findOne(board.id, sprintId);

  if (sprint === null) throw notFound();

  return sprint;
}

export function list(board: BoardContext): Promise<SprintRow[]> {
  return sprintsRepo.findByBoard(board.id);
}

export async function create(
  actor: Actor,
  board: BoardContext,
  input: CreateSprintInput,
): Promise<SprintRow> {
  const highest = await sprintsRepo.maxRank(board.id);

  return withActor(actor.id, (tx) =>
    sprintsRepo.insert(tx, {
      boardId: board.id,
      name: input.name,
      goal: input.goal ?? null,
      startDate: input.start_date ?? null,
      endDate: input.end_date ?? null,
      rank: (highest ?? 0) + RANK_GAP,
    }),
  );
}

export async function update(
  actor: Actor,
  board: BoardContext,
  sprintId: string,
  patch: UpdateSprintInput,
): Promise<SprintRow> {
  const changed = await withActor(actor.id, (tx) =>
    sprintsRepo.update(tx, board.id, sprintId, patch),
  );

  if (changed === 0) throw notFound();

  return require(board, sprintId);
}

// todos.sprint_id is ON DELETE SET NULL, so the work returns to the Backlog
// rather than going with the sprint.
export async function remove(
  actor: Actor,
  board: BoardContext,
  sprintId: string,
): Promise<void> {
  const removed = await withActor(actor.id, (tx) => sprintsRepo.remove(tx, board.id, sprintId));

  if (removed === 0) throw notFound();
}

// There is no "this board already has an active sprint" check, deliberately:
// sprints_one_active_per_board is the whole mechanism and it fires on the state
// write at the end. Its 23505 becomes a 409 here rather than a generic one.
export async function start(
  actor: Actor,
  board: BoardContext,
  sprintId: string,
): Promise<SprintRow> {
  const sprint = await require(board, sprintId);

  if (sprint.state !== "future") {
    throw new AppError(
      "bad_request",
      `Only a future sprint may be started; this one is ${sprint.state}.`,
    );
  }

  try {
    await withActor(actor.id, async (tx) => {
      const column = await sprintsRepo.firstTodoColumn(tx, board.id);

      if (column === null) {
        throw new AppError(
          "bad_request",
          "This board has no 'todo' column to receive the sprint's items.",
        );
      }

      await sprintsRepo.placeUncolumnedItems(tx, board.id, sprintId, column.id);

      if ((await sprintsRepo.setState(tx, board.id, sprintId, "active")) === 0) throw notFound();
    });
  } catch (error) {
    if (uniqueConstraintOf(error) === "sprints_one_active_per_board") {
      throw new AppError("conflict", "This board already has an active sprint.");
    }

    throw error;
  }

  return require(board, sprintId);
}

// An absent destination and an explicit null both mean the Backlog — the old
// client sent `undefined` and PostgREST omitted the key, so the SQL default
// supplied null. Neither is a validation error.
export async function complete(
  actor: Actor,
  board: BoardContext,
  sprintId: string,
  moveToSprintId: string | null,
): Promise<SprintRow> {
  const sprint = await require(board, sprintId);

  if (sprint.state !== "active") {
    throw new AppError(
      "bad_request",
      `Only an active sprint may be completed; this one is ${sprint.state}.`,
    );
  }

  if (moveToSprintId !== null) {
    if (moveToSprintId === sprintId) {
      throw new AppError(
        "bad_request",
        "The destination sprint must differ from the one being completed.",
      );
    }

    await require(board, moveToSprintId);
  }

  await withActor(actor.id, async (tx) => {
    await sprintsRepo.rehomeUnfinished(tx, board.id, sprintId, moveToSprintId);

    if ((await sprintsRepo.setState(tx, board.id, sprintId, "completed")) === 0) throw notFound();
  });

  return require(board, sprintId);
}

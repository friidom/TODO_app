import { randomUUID } from "node:crypto";

import { EVERY_BOARD_PART, invalidateBoard } from "../../cache/keys.js";
import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { emitInvalidate } from "../../realtime/emit.js";
import { closeBoardRoom } from "../../realtime/rooms.js";
import type { Actor } from "../../types/actor.js";
import * as boardsRepo from "./boards.repo.js";
import type { BoardRow } from "./boards.repo.js";
import type { CreateBoardInput, UpdateBoardInput } from "./boards.schema.js";

export function list(actor: Actor): Promise<BoardRow[]> {
  return boardsRepo.accessibleBoardIds(actor).then(boardsRepo.findMany);
}

export async function get(boardId: string): Promise<BoardRow> {
  const board = await boardsRepo.findOne(boardId);

  // boardAccess resolved this id a moment ago, so a miss here is a delete that
  // landed in between rather than a permission question.
  if (board === null) throw new AppError("not_found", "Not found.");

  return board;
}

// withActor, not a bare transaction: the insert fires boards_add_owner_membership
// (which writes the owner's membership row — without it the owner is locked out
// of their own board) and that fires log_member_activity, which reads
// app.actor_id. boards_space_ownership reads it too, and PASSES THROUGH when it
// is null, so filing into someone else's space would go unchecked.
export async function create(actor: Actor, input: CreateBoardInput): Promise<BoardRow> {
  const board = await withActor(actor.id, (tx) =>
    boardsRepo.insert(tx, {
      id: input.id ?? randomUUID(),
      ownerId: actor.id,
      title: input.title,
      spaceId: input.space_id ?? null,
    }),
  );

  // The client may mint the id, so a new board clears anything a deleted board
  // with the same id could still have cached.
  await invalidateBoard(board.id, EVERY_BOARD_PART);

  return board;
}

export async function update(
  actor: Actor,
  boardId: string,
  patch: UpdateBoardInput,
): Promise<BoardRow> {
  const board = await withActor(actor.id, (tx) => boardsRepo.update(tx, boardId, patch));

  await invalidateBoard(boardId, ["board"]);
  emitInvalidate(boardId, ["boards"]);

  return board;
}

// The cascade takes the columns, cards, comments and activity with it. The
// room is told once; there is nothing left for a row-level event to describe.
export async function remove(actor: Actor, boardId: string): Promise<void> {
  await withActor(actor.id, (tx) => boardsRepo.remove(tx, boardId));

  await invalidateBoard(boardId, EVERY_BOARD_PART);
  emitInvalidate(boardId, ["boards"]);
  await closeBoardRoom(boardId);
}

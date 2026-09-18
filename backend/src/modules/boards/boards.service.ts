import { randomUUID } from "node:crypto";

import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
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
export function create(actor: Actor, input: CreateBoardInput): Promise<BoardRow> {
  return withActor(actor.id, (tx) =>
    boardsRepo.insert(tx, {
      id: input.id ?? randomUUID(),
      ownerId: actor.id,
      title: input.title,
      spaceId: input.space_id ?? null,
    }),
  );
}

export function update(
  actor: Actor,
  boardId: string,
  patch: UpdateBoardInput,
): Promise<BoardRow> {
  return withActor(actor.id, (tx) => boardsRepo.update(tx, boardId, patch));
}

export function remove(actor: Actor, boardId: string): Promise<void> {
  return withActor(actor.id, (tx) => boardsRepo.remove(tx, boardId));
}

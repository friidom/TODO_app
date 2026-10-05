import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { EVERY_BOARD_PART, invalidateBoard } from "../../cache/keys.js";
import { withActor } from "../../db/withActor.js";
import { boardKeyBase, suffixedBoardKey } from "../../lib/boardKey.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { emitInvalidate } from "../../realtime/emit.js";
import { closeBoardRoom } from "../../realtime/rooms.js";
import type { Actor } from "../../types/actor.js";
import * as boardsRepo from "./boards.repo.js";
import type { BoardRow } from "./boards.repo.js";
import * as workflowRepo from "../workflow/workflow.repo.js";
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

// The caller must insert the key in the same transaction: the lock is what
// stops a concurrent creation from finding the same key free.
export async function allocateBoardKey(
  tx: Prisma.TransactionClient,
  title: string,
): Promise<string> {
  await boardsRepo.lockBoardKeys(tx);

  const base = boardKeyBase(title);

  let candidate = base;
  let suffix = 1;

  while (await boardsRepo.boardKeyTaken(tx, candidate)) {
    suffix += 1;
    candidate = suffixedBoardKey(base, suffix);
  }

  return candidate;
}

function boardKeyConflict(error: unknown, key: string | undefined): unknown {
  switch (uniqueConstraintOf(error)) {
    case "boards_key_prefix_key":
    case "board_keys_pkey":
      return new AppError("conflict", `Board key ${key ?? ""} is already in use.`);
    default:
      return error;
  }
}

// withActor, not a bare transaction: the insert fires boards_add_owner_membership
// (which writes the owner's membership row — without it the owner is locked out
// of their own board) and that fires log_member_activity, which reads
// app.actor_id. boards_space_ownership reads it too, and PASSES THROUGH when it
// is null, so filing into someone else's space would go unchecked.
export async function create(actor: Actor, input: CreateBoardInput): Promise<BoardRow> {
  let keyPrefix: string | undefined;

  const board = await withActor(actor.id, async (tx) => {
    keyPrefix = await allocateBoardKey(tx, input.title);

    const inserted = await boardsRepo.insert(tx, {
      id: input.id ?? randomUUID(),
      ownerId: actor.id,
      title: input.title,
      spaceId: input.space_id ?? null,
      keyPrefix,
    });

    await workflowRepo.insertDefaultWorkflow(tx, inserted.id);

    return inserted;
  }).catch((error: unknown) => {
    throw boardKeyConflict(error, keyPrefix);
  });

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
  const board = await withActor(actor.id, async (tx) => {
    if (patch.key_prefix !== undefined) await boardsRepo.lockBoardKeys(tx);

    return boardsRepo.update(tx, boardId, patch);
  }).catch((error: unknown) => {
    throw boardKeyConflict(error, patch.key_prefix);
  });

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

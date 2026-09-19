import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { rankForAppend } from "../../lib/rank.js";
import { emitChange, emitDeleted, emitInvalidate } from "../../realtime/emit.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as todosRepo from "../todos/todos.repo.js";
import * as columnsRepo from "./columns.repo.js";
import type { ColumnRow } from "./columns.repo.js";
import type { CreateColumnInput, MoveColumnInput, UpdateColumnInput } from "./columns.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export function list(board: BoardContext): Promise<ColumnRow[]> {
  return columnsRepo.findByBoard(board.id);
}

export async function create(
  actor: Actor,
  board: BoardContext,
  input: CreateColumnInput,
): Promise<ColumnRow> {
  const last = await columnsRepo.lastOf(board.id);

  const created = await withActor(actor.id, (tx) =>
    columnsRepo.insert(tx, {
      boardId: board.id,
      title: input.title,
      category: input.category,
      position: (last?.position ?? -1) + 1,
      rank: rankForAppend(last === null ? [] : [last]),
    }),
  );

  emitChange(board.id, "column", "INSERT", created);

  return created;
}

export async function update(
  actor: Actor,
  board: BoardContext,
  columnId: string,
  patch: UpdateColumnInput,
): Promise<ColumnRow> {
  const changed = await withActor(actor.id, (tx) =>
    columnsRepo.update(tx, board.id, columnId, patch),
  );

  if (changed === 0) throw notFound();

  const column = await columnsRepo.findOne(board.id, columnId);

  if (column === null) throw notFound();

  emitChange(board.id, "column", "UPDATE", column);

  return column;
}

export async function move(
  actor: Actor,
  board: BoardContext,
  columnId: string,
  input: MoveColumnInput,
): Promise<ColumnRow> {
  const changed = await withActor(actor.id, (tx) =>
    columnsRepo.update(tx, board.id, columnId, { rank: input.rank }),
  );

  if (changed === 0) throw notFound();

  const column = await columnsRepo.findOne(board.id, columnId);

  if (column === null) throw notFound();

  emitChange(board.id, "column", "UPDATE", column);

  return column;
}

// One transaction, because a rehome that commits without its delete leaves the
// board rearranged for nothing, and a delete without its rehome cannot commit
// at all — todos_column_id_fkey is ON DELETE RESTRICT, which is the backstop
// behind the row-count check rather than a second implementation of it.
export async function remove(
  actor: Actor,
  board: BoardContext,
  columnId: string,
  moveToColumnId: string,
): Promise<void> {
  if (columnId === moveToColumnId) {
    throw new AppError("bad_request", "The destination must differ from the column being deleted.");
  }

  const destination = await columnsRepo.findOne(board.id, moveToColumnId);

  if (destination === null) throw notFound();

  await withActor(actor.id, async (tx) => {
    // Appends by BOTH rank and position. The SQL wrote only position, three
    // days before ranks existed — and since every surface sorts by
    // `rank ?? position * RANK_GAP`, its "append" was invisible and the
    // rehomed cards interleaved by their old ranks. §10.6 asks for an append,
    // so this writes the key that actually orders them.
    const moved = await todosRepo.rehomeColumn(tx, board.id, columnId, moveToColumnId);

    if ((await columnsRepo.remove(tx, board.id, columnId)) === 0) throw notFound();

    return moved;
  });

  // The column's removal is one row; the rehome is N, and which N is not worth
  // describing when the client can refetch the board's cards in one request.
  emitDeleted(board.id, "column", columnId);
  emitInvalidate(board.id, ["todos"]);
}

export async function rebalance(actor: Actor, board: BoardContext): Promise<number> {
  const count = await withActor(actor.id, (tx) => columnsRepo.rebalance(tx, board.id));

  emitInvalidate(board.id, ["columns"]);

  return count;
}

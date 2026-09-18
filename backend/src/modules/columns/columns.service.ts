import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { rankForAppend } from "../../lib/rank.js";
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

  return withActor(actor.id, (tx) =>
    columnsRepo.insert(tx, {
      boardId: board.id,
      title: input.title,
      category: input.category,
      position: (last?.position ?? -1) + 1,
      rank: rankForAppend(last === null ? [] : [last]),
    }),
  );
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

  return column;
}

export async function move(
  actor: Actor,
  board: BoardContext,
  columnId: string,
  input: MoveColumnInput,
): Promise<void> {
  const changed = await withActor(actor.id, (tx) =>
    columnsRepo.update(tx, board.id, columnId, { rank: input.rank }),
  );

  if (changed === 0) throw notFound();
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
}

export function rebalance(actor: Actor, board: BoardContext): Promise<number> {
  return withActor(actor.id, (tx) => columnsRepo.rebalance(tx, board.id));
}

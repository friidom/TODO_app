import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { emitChange } from "../../realtime/emit.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as columnsRepo from "./columns.repo.js";
import type { ColumnRow } from "./columns.repo.js";
import type { UpdateColumnInput } from "./columns.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export async function updateLimits(
  actor: Actor,
  board: BoardContext,
  columnId: string,
  patch: UpdateColumnInput,
): Promise<ColumnRow> {
  const changed = await withActor(actor.id, (tx) =>
    columnsRepo.updateLimits(tx, board.id, columnId, patch),
  );

  if (changed === 0) throw notFound();

  const column = await columnsRepo.findOne(board.id, columnId);

  if (column === null) throw notFound();

  emitChange(board.id, "column", "UPDATE", column);

  return column;
}

import { AppError } from "../../lib/errors.js";
import { formatTaskRef, parseTaskRef } from "../../lib/taskRef.js";
import * as boardsRepo from "../boards/boards.repo.js";
import * as membersRepo from "../members/members.repo.js";
import * as todosRepo from "../todos/todos.repo.js";

export interface ResolvedTaskRef {
  board_id: string;
  todo_id: string;
  key: string;
}

// One answer for a malformed reference, an unknown or deleted board, a missing
// card and a board the caller is not on — boardAccess's rule, for the same
// reason: anything else tells a stranger which keys and numbers are real.
function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export async function resolve(actorId: string, raw: string): Promise<ResolvedTaskRef> {
  const ref = parseTaskRef(raw);

  if (ref === null) throw notFound();

  const board = await boardsRepo.boardForKey(ref.key);

  // Membership before the card lookup, so a non-member never learns from
  // timing whether the number exists.
  if (board === null || (await membersRepo.roleOf(board.id, actorId)) === null) {
    throw notFound();
  }

  const todo = await todosRepo.findByBoardNumber(board.id, ref.number);

  if (todo === null) throw notFound();

  return { board_id: board.id, todo_id: todo.id, key: formatTaskRef(board.key_prefix, ref.number) };
}

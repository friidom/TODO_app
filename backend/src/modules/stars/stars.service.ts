import { MAX_PAGE } from "../../config/constants.js";
import type { Actor } from "../../types/actor.js";
import { accessibleBoardIds } from "../boards/boards.repo.js";
import * as starsRepo from "./stars.repo.js";

export async function listMine(actor: Actor): Promise<starsRepo.StarRow[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0) return [];

  return starsRepo.findForUser(actor.id, boardIds, MAX_PAGE);
}

export function star(actor: Actor, board: { id: string }): Promise<starsRepo.StarRow> {
  return starsRepo.star(board.id, actor.id);
}

export function unstar(actor: Actor, board: { id: string }): Promise<void> {
  return starsRepo.unstar(board.id, actor.id);
}

import { FEED_PAGE } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
import type { Actor } from "../../types/actor.js";
import * as activitiesRepo from "../activities/activities.repo.js";
import { accessibleBoardIds } from "../boards/boards.repo.js";
import { LIST_FIELDS, toRow, type TodoRow } from "../todos/todos.repo.js";

export type FeedTab = "assigned" | "recent";

export interface WorkedOnEntry {
  id: string;
  at: Date;
}

// Ids and dates rather than rows: the client joins them to the todos it already
// has and dates each card by when YOU touched it, not by the row updated_at.
export async function workedOn(actor: Actor, limit: number): Promise<WorkedOnEntry[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0) return [];

  const events = await activitiesRepo.findTodoIdsWorkedOn(actor.id, boardIds, limit * 4);

  const newest = new Map<string, Date>();

  for (const event of events) {
    if (event.entity_id !== null && !newest.has(event.entity_id)) {
      newest.set(event.entity_id, event.created_at);
    }
  }

  return [...newest].slice(0, limit).map(([id, at]) => ({ id, at }));
}

// The viewed tab keeps its ids in localStorage and has no server side, so this
// is the one read that takes ids from the client. They are still filtered to
// the boards the caller can reach.
export async function byIds(actor: Actor, ids: string[]): Promise<TodoRow[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0 || ids.length === 0) return [];

  const rows = await prisma.todos.findMany({
    where: { id: { in: ids }, board_id: { in: boardIds }, parent_id: null },
    orderBy: [{ updated_at: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: LIST_FIELDS,
  });

  return rows.map(toRow);
}

// The scoping that makes this endpoint safe. `board_id in (...)` is part of the
// query, BEFORE the limit — filtering afterwards fills the page with rows the
// actor cannot see and then empties it.
//
// Every tab is top-level only: a subtask means nothing here without its parent.
export async function feed(actor: Actor, tab: FeedTab, limit = FEED_PAGE): Promise<TodoRow[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0) return [];

  const rows = await prisma.todos.findMany({
    where: {
      board_id: { in: boardIds },
      parent_id: null,
      ...(tab === "assigned" && { assignee_id: actor.id }),
    },
    orderBy: [{ updated_at: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: limit,
    select: LIST_FIELDS,
  });

  return rows.map(toRow);
}

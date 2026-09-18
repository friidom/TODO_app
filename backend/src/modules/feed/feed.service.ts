import { FEED_PAGE } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
import type { Actor } from "../../types/actor.js";
import * as activitiesRepo from "../activities/activities.repo.js";
import { accessibleBoardIds } from "../boards/boards.repo.js";
import { LIST_FIELDS, toRow, type TodoRow } from "../todos/todos.repo.js";

export type FeedTab = "assigned" | "recent" | "worked-on";

// The scoping that makes this endpoint safe. `board_id in (...)` is part of the
// query, BEFORE the limit — filtering afterwards fills the page with rows the
// actor cannot see and then empties it.
//
// Every tab is top-level only: a subtask means nothing here without its parent.
export async function feed(actor: Actor, tab: FeedTab, limit = FEED_PAGE): Promise<TodoRow[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0) return [];

  if (tab === "worked-on") return workedOn(actor, boardIds, limit);

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

// The activity limit counts EVENTS, not cards: a hundred edits to three cards
// is a three-card tab. Rows arrive newest-first, so the first sighting of an id
// is its most recent activity.
async function workedOn(actor: Actor, boardIds: string[], limit: number): Promise<TodoRow[]> {
  const events = await activitiesRepo.findTodoIdsWorkedOn(actor.id, boardIds, limit * 4);

  const newest = new Map<string, Date>();

  for (const event of events) {
    if (event.entity_id !== null && !newest.has(event.entity_id)) {
      newest.set(event.entity_id, event.created_at);
    }
  }

  if (newest.size === 0) return [];

  const rows = await prisma.todos.findMany({
    where: { id: { in: [...newest.keys()] }, board_id: { in: boardIds }, parent_id: null },
    orderBy: [{ id: "desc" }],
    select: LIST_FIELDS,
  });

  // The id tiebreak is not decoration: several rows written by one statement
  // share created_at exactly, so without it two identical calls can return the
  // same cards in a different order and the page jumps.
  return rows
    .map(toRow)
    .sort(
      (a, b) =>
        (newest.get(b.id)?.getTime() ?? 0) - (newest.get(a.id)?.getTime() ?? 0) ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(0, limit);
}

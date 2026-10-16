import type { Prisma } from "@prisma/client";

import { FEED_PAGE } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
import type { Actor } from "../../types/actor.js";
import * as activitiesRepo from "../activities/activities.repo.js";
import type { ActivityRow } from "../activities/activities.repo.js";
import { accessibleBoardIds } from "../boards/boards.repo.js";
import { LIST_FIELDS, toRow, type TodoRow } from "../todos/todos.repo.js";

export type FeedTab = "assigned" | "recent";

// The status rides along because a list spanning boards has no one workflow to
// look status_id up in.
const FEED_FIELDS = {
  ...LIST_FIELDS,
  statuses: { select: { name: true, category: true } },
} satisfies Prisma.todosSelect;

type FeedRecord = Prisma.todosGetPayload<{ select: typeof FEED_FIELDS }>;

export type FeedTodoRow = TodoRow & { status: { name: string; category: string } | null };

function toFeedRow({ statuses, ...record }: FeedRecord): FeedTodoRow {
  return { ...toRow(record), status: statuses };
}

export interface Person {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ActivityFeed {
  items: ActivityRow[];
  people: Record<string, Person>;
  live_todo_ids: string[];
}

function assigneeOf(payload: Prisma.JsonValue): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;

  const to = payload.to;

  return typeof to === "string" ? to : null;
}

// A person is named only while they share a board with the caller, the rule a
// board roster follows.
export async function activity(actor: Actor, limit: number): Promise<ActivityFeed> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0) return { items: [], people: {}, live_todo_ids: [] };

  const items = await activitiesRepo.findTodoEventsByOthers(actor.id, boardIds, limit);

  const personIds = new Set<string>();
  const todoIds = new Set<string>();

  for (const item of items) {
    if (item.actor_id) personIds.add(item.actor_id);
    if (item.entity_id) todoIds.add(item.entity_id);

    const assignee = item.action === "assigned" ? assigneeOf(item.payload) : null;

    if (assignee) personIds.add(assignee);
  }

  const [members, live] = await Promise.all([
    prisma.board_members.findMany({
      where: { board_id: { in: boardIds }, user_id: { in: [...personIds] } },
      distinct: ["user_id"],
      select: {
        profiles: { select: { id: true, username: true, full_name: true, avatar_url: true } },
      },
    }),
    prisma.todos.findMany({
      where: { id: { in: [...todoIds] }, board_id: { in: boardIds } },
      select: { id: true },
    }),
  ]);

  return {
    items,
    people: Object.fromEntries(members.map(({ profiles }) => [profiles.id, profiles])),
    live_todo_ids: live.map((todo) => todo.id),
  };
}

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
export async function byIds(actor: Actor, ids: string[]): Promise<FeedTodoRow[]> {
  const boardIds = await accessibleBoardIds(actor);

  if (boardIds.length === 0 || ids.length === 0) return [];

  const rows = await prisma.todos.findMany({
    where: { id: { in: ids }, board_id: { in: boardIds }, parent_id: null },
    orderBy: [{ updated_at: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: FEED_FIELDS,
  });

  return rows.map(toFeedRow);
}

// The scoping that makes this endpoint safe. `board_id in (...)` is part of the
// query, BEFORE the limit — filtering afterwards fills the page with rows the
// actor cannot see and then empties it.
//
// Every tab is top-level only: a subtask means nothing here without its parent.
export async function feed(
  actor: Actor,
  tab: FeedTab,
  limit = FEED_PAGE,
): Promise<FeedTodoRow[]> {
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
    select: FEED_FIELDS,
  });

  return rows.map(toFeedRow);
}

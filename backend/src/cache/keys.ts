import { ACTIVITY_PAGE } from "../config/constants.js";
import { invalidate, type CacheEntry } from "./cache.js";

// Board-scoped and identical for every member, so no key names a user. That is
// safe only because boardAccess checks membership against PostgreSQL before a
// controller reaches the cache: Redis answers "what is on this board", never
// "who may see it".
//
// The TTLs are the backstop, not the mechanism. Every write that changes one of
// these entries deletes it; the TTL bounds what that cannot cover, such as a
// read racing a write, or a write made outside the API.
export const boardCache = {
  board: (boardId: string): CacheEntry => ({ key: `todo-app:board:${boardId}`, ttlSeconds: 60 }),
  members: (boardId: string): CacheEntry => ({
    key: `todo-app:members:board:${boardId}`,
    ttlSeconds: 60,
  }),
  workflow: (boardId: string): CacheEntry => ({
    key: `todo-app:workflow:board:${boardId}`,
    ttlSeconds: 30,
  }),
  sprints: (boardId: string): CacheEntry => ({
    key: `todo-app:sprints:board:${boardId}`,
    ttlSeconds: 30,
  }),
  todos: (boardId: string): CacheEntry => ({ key: `todo-app:todos:board:${boardId}`, ttlSeconds: 15 }),
  // Rows are written only by triggers on todos, board_members, columns and
  // statuses, so every write to one of those tables invalidates this as well.
  activities: (boardId: string): CacheEntry => ({
    key: `todo-app:activities:board:${boardId}:limit:${ACTIVITY_PAGE}`,
    ttlSeconds: 10,
  }),
};

export type BoardCachePart = keyof typeof boardCache;

export const EVERY_BOARD_PART = Object.keys(boardCache) as BoardCachePart[];

export function invalidateBoards(
  boardIds: readonly string[],
  parts: readonly BoardCachePart[],
): Promise<void> {
  return invalidate(boardIds.flatMap((boardId) => parts.map((part) => boardCache[part](boardId).key)));
}

export function invalidateBoard(boardId: string, parts: readonly BoardCachePart[]): Promise<void> {
  return invalidateBoards([boardId], parts);
}

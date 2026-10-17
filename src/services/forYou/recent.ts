import { isViewMode } from "@/services/views/registry";
import type { IBoard, ISpace } from "@/types/data";
import { taskKey } from "@/utils/taskKey";
import { groupByPeriod, type FeedTodo, type PeriodGroup } from "./feed";
import type { BoardVisit, ViewedEntry } from "./viewed";

export const RECENT_FILTERS = ["all", "boards", "tasks"] as const;

export type RecentFilter = (typeof RECENT_FILTERS)[number];

export type RecentItem =
  | { kind: "board"; id: string; at: string; board: IBoard; href: string }
  | {
      kind: "task";
      id: string;
      at: string;
      board: IBoard;
      todo: FeedTodo;
      key: string | null;
      href: string;
    };

// Only what was really opened: no padding with unvisited boards, and an id the
// reader can no longer resolve is dropped rather than drawn without a name.
export function buildRecent({
  visits,
  viewed,
  boards,
  todos,
  spaces,
  filter,
  query,
  now,
}: {
  visits: BoardVisit[];
  viewed: ViewedEntry[];
  boards: IBoard[];
  todos: FeedTodo[];
  spaces: ISpace[];
  filter: RecentFilter;
  query: string;
  now: Date;
}): PeriodGroup<RecentItem>[] {
  const boardById = new Map(boards.map((board) => [board.id, board]));
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  const spaceTitle = new Map(spaces.map((space) => [space.id, space.title]));

  const items: RecentItem[] = [];

  if (filter !== "tasks") {
    for (const visit of visits) {
      const board = boardById.get(visit.id);

      if (!board) continue;

      const view = isViewMode(visit.view) ? `?view=${visit.view}` : "";

      items.push({
        kind: "board",
        id: board.id,
        at: visit.at,
        board,
        href: `/boards/${board.id}${view}`,
      });
    }
  }

  if (filter !== "boards") {
    for (const entry of viewed) {
      const todo = todoById.get(entry.id);
      const board = todo?.board_id ? boardById.get(todo.board_id) : undefined;

      if (!todo || !board) continue;

      items.push({
        kind: "task",
        id: todo.id,
        at: entry.at,
        board,
        todo,
        key: taskKey(board.key_prefix, todo.board_key),
        href: `/boards/${board.id}?task=${todo.id}`,
      });
    }
  }

  const needle = query.trim().toLowerCase();

  const matching = needle
    ? items.filter((item) =>
        [
          item.kind === "task" ? item.todo.title : null,
          item.kind === "task" ? item.key : null,
          item.board.title,
          item.board.key_prefix,
          item.board.space_id ? spaceTitle.get(item.board.space_id) : null,
        ].some((text) => text?.toLowerCase().includes(needle)),
      )
    : items;

  return groupByPeriod(
    matching.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    now,
  );
}

import { useColumns } from "@/services/columns/useColumnsApi";
import React from "react";
import type { IColumn, Todo } from "@/types/data";
import { isOnBoard } from "@/services/todos/backlog";
import { useSprints } from "@/services/sprints/useSprints";

/**
 * One array for every empty render, rather than a fresh `[]` each time.
 *
 * A `= []` default in the destructure below allocates on every render while the
 * query has no data, which changes the memo's dependency and re-runs it
 * every time — and re-runs `orderedColumns` in KanbanBoard, which is keyed on
 * the same reference.
 */
const EMPTY_COLUMNS: IColumn[] = [];

/**
 * Cards bucketed into the columns that hold them, in the order they arrive.
 *
 * **Takes the cards rather than fetching them, and does not order them.** It
 * used to do both: call `useTodos()` and sort each bucket by `position`. Both
 * became wrong once a board could be filtered and sorted — the caller decides
 * which cards and in what order, and this only has to answer *which column*.
 *
 * `useVisibleTodos` has already put the array in display order, so bucketing
 * preserves it. Sorting again here is what made the list and the board two
 * implementations of one rule.
 *
 * Every column gets an entry even when nothing is in it, so an empty column
 * still renders — once the Board has anything to render at all; see below.
 *
 * **The Board is a view onto the active Sprint (2026-08-27 product
 * direction), and `isOnBoard` is where that is enforced.** With no Sprint
 * `active` on this board, `todosByColumn` comes back with every bucket
 * empty regardless of what any card's `column_id` says — `KanbanBoard` reads
 * `activeSprintId` (returned below) to show a dedicated empty state instead
 * of a wall of empty columns. See `backlog.ts`'s own module doc for the
 * history: an earlier pass here fell back to "a column alone decides" when
 * no Sprint was active, which was product-reversed — the Board no longer has
 * a plain-Kanban mode to fall back to once a board has Sprints at all.
 */
export default function useTodosByColumns(todos: Todo[]) {
  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { data: sprints = [], isPending: sprintsPending } = useSprints();

  const activeSprintId =
    sprints.find((sprint) => sprint.state === "active")?.id ?? null;

  const todosByColumn = React.useMemo(() => {
    // Built inside the memo: it was previously allocated on every render but
    // only populated here, so the memo mutated an object it did not own.
    const grouped: Record<string, Todo[]> = {};

    columns.forEach((column) => {
      grouped[column.id] = [];
    });

    todos.forEach((todo) => {
      // `column_id` is nullable: a card with no column belongs to no group.
      // Previously this indexed `grouped[null]`, which found nothing and
      // no-opped through the optional chain — skipping is the same outcome,
      // stated deliberately. `isOnBoard` already implies this, but
      // TypeScript cannot narrow `todo.column_id` through a function call,
      // so the check stays explicit here for the indexing below.
      if (todo.column_id === null) return;
      if (!isOnBoard(todo, activeSprintId)) return;

      grouped[todo.column_id]?.push(todo);
    });

    return grouped;
  }, [todos, columns, activeSprintId]);

  return { todosByColumn, columns, activeSprintId, sprintsPending };
}

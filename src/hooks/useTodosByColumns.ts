import { useColumns } from "@/services/columns/useColumnsApi";
import React from "react";
import type { IColumn, Todo } from "@/types/data";
import { isOnBoard } from "@/services/todos/backlog";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";

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
 * **`isOnBoard` is the one Sprint rule applied here**, and it only ever
 * *removes* a card: one committed to a Sprint that is not the running one is
 * withheld until that Sprint starts. A card with no Sprint at all is on the
 * Board on its `column_id` alone, so a board with nothing running is an
 * ordinary Kanban rather than an empty page. See `backlog.ts`'s own module
 * doc for the pass that answered this differently and what it broke.
 *
 * `activeSprintId` is returned rather than kept private because `KanbanBoard`
 * names the state in a notice above the board — not to decide whether to
 * render one.
 */
export default function useTodosByColumns(todos: Todo[]) {
  const { data: columns = EMPTY_COLUMNS } = useColumns();
  const { data: sprints = [], isPending: sprintsPending } = useSprints();

  const activeSprintId = activeSprintIdOf(sprints);

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

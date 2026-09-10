import type { DragEndEvent } from "@dnd-kit/core";

import { resolveDropIndex } from "@/services/todos/dropIndex";
import { useTodoDrop } from "@/services/todos/useTodoDrop";
import { useDoneFlash } from "@/stores/doneFlash";
import type { IColumn, Todo } from "@/types/data";
import { byRank } from "@/utils/rank";
import type { TodoIndicator } from "./useKanbanDnd";

interface BoardDragEndParams {
  todos: Todo[];
  // What each column actually rendered, keyed by id — not the same as `todos` grouped, since a filter/sort/swimlane narrows it.
  visibleByColumn: Record<string, Todo[]>;
  orderedColumns: IColumn[];
  activeTodo: Todo | null;
  activeColumn: IColumn | null;
  indicator: TodoIndicator;
  columnIndicator: number | null;
  resetDrag: () => void;
  moveColumn: (from: number, to: number) => void;
}

// Not a useCallback — DndContext isn't memoised, and this closes over almost every piece of drag state anyway.
export function useBoardDragEnd({
  todos,
  visibleByColumn,
  orderedColumns,
  activeTodo,
  activeColumn,
  indicator,
  columnIndicator,
  resetDrag,
  moveColumn,
}: BoardDragEndParams) {
  const todoDrop = useTodoDrop();
  const flashDone = useDoneFlash((state) => state.flash);

  const onDragEnd = ({ active }: DragEndEvent) => {
    // ---- column reorder ----------------------------------------------------
    if (activeColumn) {
      const from = orderedColumns.findIndex((c) => c.id === active.id);

      if (from !== -1 && columnIndicator !== null) {
        // gap index counts the dragged column itself while it's left of the target, so shift by one
        const to =
          from < columnIndicator ? columnIndicator - 1 : columnIndicator;

        if (to !== from) moveColumn(from, to);
      }

      resetDrag();
      return;
    }

    // ---- todo drop ---------------------------------------------------------
    if (activeTodo && indicator.columnId) {
      const destination = orderedColumns.find(
        (c) => c.id === indicator.columnId,
      );

      // fired before the mutation so it rides the optimistic move, not the network round-trip
      if (
        destination?.category === "done" &&
        destination.id !== activeTodo.column_id
      ) {
        flashDone(activeTodo.id);
      }

      // translates the visible gap into the stored-array index — see dropIndex.ts for why they differ
      const index = resolveDropIndex(
        todos
          .filter((todo) => todo.column_id === indicator.columnId)
          .sort(byRank),
        visibleByColumn[indicator.columnId] ?? [],
        indicator.index,
        activeTodo.id,
      );

      todoDrop.mutate({
        todos,
        activeTodo,
        columnId: indicator.columnId,
        index,
      });
    }

    resetDrag();
  };

  const sourceId = activeTodo?.column_id ?? null;
  const destinationId = activeTodo ? indicator.columnId : null;
  const crossColumn = !!destinationId && destinationId !== sourceId;

  const sourceColumn = crossColumn
    ? orderedColumns.find((column) => column.id === sourceId)
    : undefined;

  return { onDragEnd, sourceId, destinationId, sourceColumn };
}

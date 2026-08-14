import type { DragEndEvent } from "@dnd-kit/core";

import { resolveDropIndex } from "@/services/todos/dropIndex";
import { useTodoDrop } from "@/services/todos/useTodoDrop";
import { useDoneFlash } from "@/stores/doneFlash";
import type { IColumn, Todo } from "@/types/data";
import { byRank } from "@/utils/rank";
import type { TodoIndicator } from "./useKanbanDnd";

interface BoardDragEndParams {
  /** Every todo on the board — the flat array the drop mutation rewrites. */
  todos: Todo[];
  /**
   * What each column actually rendered, keyed by column id.
   *
   * Not the same thing as `todos` grouped: a filter, a sort or a swimlane means
   * the user is looking at a subset, in an order of their choosing. The gap they
   * dropped into is numbered over *this*, and `resolveDropIndex` is what turns
   * that number back into one the stored column understands.
   */
  visibleByColumn: Record<string, Todo[]>;
  /** Columns sorted by position: the indices `columnIndicator` counts. */
  orderedColumns: IColumn[];
  activeTodo: Todo | null;
  activeColumn: IColumn | null;
  indicator: TodoIndicator;
  columnIndicator: number | null;
  resetDrag: () => void;
  /**
   * The column-reorder write, passed in rather than done here because the
   * header menu's arrows perform the same one — two callers, one
   * implementation. M2-18 moves it into `useColumnReorder`.
   */
  moveColumn: (from: number, to: number) => void;
}

/**
 * What a drag means once it ends, and what the board looks like while one is
 * in flight. `docs/FRONTEND.md`: *"Business logic should never live inside UI
 * components."* This is the logic that used to sit inline in `KanbanBoard`'s
 * JSX — 45 lines of it, inside the `onDragEnd` prop.
 *
 * Deliberately not a `useCallback`: `DndContext` is not memoised, so a stable
 * identity would buy nothing, and the handler closes over almost every piece
 * of drag state.
 */
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
        // The gap index counts the dragged column itself while it sits to the
        // left of the target, so shift by one.
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

      // Landing in a done column is worth celebrating; reordering inside one
      // the card already sat in is not. Fired before the mutation so the ring
      // rides the optimistic move, not the network round-trip.
      if (
        destination?.category === "done" &&
        destination.id !== activeTodo.column_id
      ) {
        flashDone(activeTodo.id);
      }

      // The gap the user saw, translated into the index `applyTodoMoved` splices
      // at. The two are not the same number — see `dropIndex.ts` — and were only
      // ever accidentally equal on an unfiltered board dragged upwards.
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

  // A card on its way to another column: the destination gets highlighted and
  // both headers swap to the transition state. Same-column drags are just
  // reordering, so they stay quiet.
  const sourceId = activeTodo?.column_id ?? null;
  const destinationId = activeTodo ? indicator.columnId : null;
  const crossColumn = !!destinationId && destinationId !== sourceId;

  const sourceColumn = crossColumn
    ? orderedColumns.find((column) => column.id === sourceId)
    : undefined;

  return { onDragEnd, sourceId, destinationId, sourceColumn };
}

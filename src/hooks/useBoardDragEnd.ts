import type { DragEndEvent } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

import type { TransitionPill } from "@/components/columns/ColumnHeader";
import { resolveDropIndex } from "@/services/todos/dropIndex";
import { useTodoDrop } from "@/services/todos/useTodoDrop";
import { useWorkflowGate } from "@/services/todos/useWorkflowGate";
import {
  columnIdOf,
  dropChoices,
  entryStatus,
  type WorkflowModel,
} from "@/services/workflow/statuses";
import { toast } from "@/stores/toasts";
import { useDoneFlash } from "@/stores/doneFlash";
import type { IColumn, IStatus, Todo } from "@/types/data";
import { byRank } from "@/utils/rank";
import type { TodoIndicator } from "./useKanbanDnd";

interface BoardDragEndParams {
  todos: Todo[];
  // What each column actually rendered, keyed by id — not the same as `todos` grouped, since a filter/sort/swimlane narrows it.
  visibleByColumn: Record<string, Todo[]>;
  orderedColumns: IColumn[];
  workflow: WorkflowModel;
  activeTodo: Todo | null;
  activeColumn: IColumn | null;
  indicator: TodoIndicator;
  columnIndicator: number | null;
  resetDrag: () => void;
  moveColumn: (from: number, to: number) => void;
}

function pill(status: IStatus): TransitionPill {
  return { title: status.name, category: status.category };
}

// Not a useCallback — DndContext isn't memoised, and this closes over almost every piece of drag state anyway.
export function useBoardDragEnd({
  todos,
  visibleByColumn,
  orderedColumns,
  workflow,
  activeTodo,
  activeColumn,
  indicator,
  columnIndicator,
  resetDrag,
  moveColumn,
}: BoardDragEndParams) {
  const todoDrop = useTodoDrop();
  const gate = useWorkflowGate();
  const flashDone = useDoneFlash((state) => state.flash);
  const { t } = useTranslation();

  const sourceStatus =
    activeTodo?.status_id != null
      ? workflow.statusById.get(activeTodo.status_id)
      : undefined;

  const sourceId = activeTodo
    ? columnIdOf(activeTodo, workflow.statusById)
    : null;

  const reachable = (status: IStatus) =>
    gate.allows(sourceStatus?.id, status.id);

  // The status a card lands in when it enters a column it is not already in:
  // the one whose zone it was dropped on, otherwise the first visible one the
  // workflow lets it reach from where it is.
  const landingIn = (columnId: string, statusId?: string): IStatus | null =>
    statusId
      ? (workflow.statusById.get(statusId) ?? null)
      : entryStatus(workflow.statuses, columnId, reachable);

  const choicesIn = (columnId: string) =>
    activeTodo && columnId !== sourceId
      ? dropChoices(workflow.statuses, columnId, reachable)
      : null;

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
      const columnId = indicator.columnId;

      // Inside its own column a drop is a reorder, which never changes status.
      const target =
        columnId === sourceId && sourceStatus
          ? sourceStatus
          : landingIn(columnId, indicator.statusId);

      if (target === null) {
        toast.error(t("workflow.noStatusToReceive"));
        resetDrag();

        return;
      }

      // Checked before the optimistic write, so a refused drop never paints the
      // card into the new column and then snaps it back. The API refuses it too;
      // this exists so the drag does not LOOK like it worked.
      const refusal =
        target.id === sourceStatus?.id
          ? null
          : gate.refusal(sourceStatus?.id, target.id);

      if (refusal !== null) {
        toast.error(refusal);
        resetDrag();

        return;
      }

      // fired before the mutation so it rides the optimistic move, not the network round-trip
      if (target.category === "done" && target.id !== activeTodo.status_id) {
        flashDone(activeTodo.id);
      }

      const visible = visibleByColumn[columnId] ?? [];

      // translates the visible gap into the stored-array index — see dropIndex.ts for why they differ
      const index = resolveDropIndex(
        todos
          .filter((todo) => columnIdOf(todo, workflow.statusById) === columnId)
          .sort(byRank),
        visible,
        // a status zone covers the column's cards, so it names no gap: append
        indicator.statusId ? visible.length : indicator.index,
        activeTodo.id,
      );

      todoDrop.mutate({
        todos,
        activeTodo,
        columnId,
        statusId: target.id,
        index,
      });
    }

    resetDrag();
  };

  const destinationId = activeTodo ? indicator.columnId : null;
  const crossColumn = !!destinationId && destinationId !== sourceId;

  // The pills the destination header swaps to while a card hovers over it:
  // the status it would leave and the one it would land in.
  const landing =
    crossColumn && destinationId
      ? landingIn(destinationId, indicator.statusId)
      : null;

  const transition =
    crossColumn && landing && reachable(landing)
      ? {
          from: sourceStatus
            ? pill(sourceStatus)
            : { title: "", category: null },
          to: pill(landing),
        }
      : null;

  return { onDragEnd, sourceId, destinationId, transition, choicesIn };
}

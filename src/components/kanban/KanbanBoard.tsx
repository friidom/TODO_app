import { Fragment, useMemo, useState } from "react";

import { DndContext } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { t } from "i18next";

import useKanbanDnd from "@/hooks/useKanbanDnd";
import { useBoardDragEnd } from "@/hooks/useBoardDragEnd";
import { useBoardId } from "@/hooks/useBoardId";
import useTodosByColumns from "@/hooks/useTodosByColumns";
import { applyColumnMoved } from "@/services/columns/cache";
import { useReorderColumns } from "@/services/columns/useReorderColumns";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useTodos } from "@/services/todos/useTodos";

import SortableColumn from "./SortableColumn";
import ColumnDropZone from "./ColumnDropZone";
import TodoDragOverlay from "./TodoDragOverlay";
import AddColumnButton from "../columns/AddColumnButton";
import CreateColumnModal from "../columns/CreateColumnModal";
import ColumnLimitModal from "../columns/ColumnLimitModal";
import DeleteColumnModal from "../columns/DeleteColumnModal";
import CollapsedColumn from "../columns/CollapsedColumn";
import Loading from "../pages/loading/LoadingPage";
import type { IColumn } from "@/types/data";
import { byPosition } from "@/utils/position";
import { titleKey } from "@/constants/columns";

export default function KanbanBoard() {
  const { data: todos = [], isLoading, error } = useTodos();
  const { todosByColumn, columns } = useTodosByColumns();
  const reorderColumns = useReorderColumns();
  const queryClient = useQueryClient();
  // Both column-reorder paths write the cache directly before handing off to
  // the mutation, so this component needs the board the same way the hooks do.
  const boardId = useBoardId();

  const {
    sensors,
    collisionDetection,
    handleDragOver,
    activeTodo,
    setActiveTodo,
    activeColumn,
    setActiveColumn,
    indicator,
    columnIndicator,
    resetDrag,
  } = useKanbanDnd();

  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [limitColumn, setLimitColumn] = useState<IColumn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IColumn | null>(null);

  const orderedColumns = useMemo(
    () => columns.slice().sort(byPosition),
    [columns],
  );

  /** Swap a column with its neighbour and renumber the whole list. */
  function moveColumn(from: number, to: number) {
    const reordered = applyColumnMoved(orderedColumns, from, to);

    queryClient.setQueryData(queryKeys.columns(boardId), reordered);
    reorderColumns.mutate(reordered);
  }

  const { onDragEnd, sourceId, destinationId, sourceColumn } = useBoardDragEnd({
    todos,
    orderedColumns,
    activeTodo,
    activeColumn,
    indicator,
    columnIndicator,
    resetDrag,
    moveColumn,
  });

  function toggleCollapsed(id: string) {
    setCollapsed((open) =>
      open.includes(id) ? open.filter((it) => it !== id) : [...open, id],
    );
  }

  if (isLoading) return <Loading />;

  if (error) return <p>{error.message}</p>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => {
        if (active.data.current?.type === "column") {
          setActiveColumn(
            orderedColumns.find((c) => c.id === active.id) ?? null,
          );
          return;
        }

        const todo = todos.find((todo) => todo.id === active.id);

        if (todo) setActiveTodo(todo);
      }}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      <div className="h-full overflow-x-auto">
        <div className="flex min-w-max px-0 pb-6">
          <div className="flex h-full min-w-max">
            {orderedColumns.map((column, index) => (
              <Fragment key={column.id}>
                <ColumnDropZone
                  index={index}
                  active={!!activeColumn && columnIndicator === index}
                  beforeId={orderedColumns[index - 1]?.id}
                  afterId={column.id}
                />

                {collapsed.includes(column.id) ? (
                  <CollapsedColumn
                    column={column}
                    headerTitle={t(titleKey(column.title))}
                    count={todosByColumn[column.id]?.length ?? 0}
                    onExpand={() => toggleCollapsed(column.id)}
                  />
                ) : (
                  <SortableColumn
                    id={column.id}
                    column={column}
                    headerTitle={t(titleKey(column.title))}
                    todos={todosByColumn[column.id] ?? []}
                    indicator={indicator}
                    isDragSource={!!activeTodo && column.id === sourceId}
                    onCollapse={() => toggleCollapsed(column.id)}
                    onSetLimit={() => setLimitColumn(column)}
                    onDelete={() => setDeleteTarget(column)}
                    onMoveLeft={
                      index > 0 ? () => moveColumn(index, index - 1) : undefined
                    }
                    onMoveRight={
                      index < orderedColumns.length - 1
                        ? () => moveColumn(index, index + 1)
                        : undefined
                    }
                    canDelete={orderedColumns.length > 1}
                    transition={
                      sourceColumn && column.id === destinationId
                        ? {
                            from: {
                              title: t(titleKey(sourceColumn.title)),
                              category: sourceColumn.category,
                            },
                            to: {
                              title: t(titleKey(column.title)),
                              category: column.category,
                            },
                          }
                        : null
                    }
                  />
                )}
              </Fragment>
            ))}

            <ColumnDropZone
              index={orderedColumns.length}
              active={
                !!activeColumn && columnIndicator === orderedColumns.length
              }
              beforeId={orderedColumns[orderedColumns.length - 1]?.id}
            />
          </div>

          <AddColumnButton setCreateColumnOpen={setCreateColumnOpen} />
        </div>
      </div>

      <CreateColumnModal
        open={createColumnOpen}
        onClose={() => setCreateColumnOpen(false)}
      />

      <ColumnLimitModal
        column={limitColumn}
        onClose={() => setLimitColumn(null)}
      />

      <DeleteColumnModal
        column={deleteTarget}
        destinations={orderedColumns.filter(
          (column) => column.id !== deleteTarget?.id,
        )}
        onClose={() => setDeleteTarget(null)}
      />

      <TodoDragOverlay
        activeTodo={activeTodo}
        activeColumn={activeColumn}
        todosCount={
          activeColumn ? (todosByColumn[activeColumn.id]?.length ?? 0) : 0
        }
        columnCollapsed={!!activeColumn && collapsed.includes(activeColumn.id)}
      />
    </DndContext>
  );
}

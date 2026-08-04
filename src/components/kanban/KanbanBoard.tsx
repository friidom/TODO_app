import { Fragment, useMemo, useState } from "react";

import { DndContext } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { t } from "i18next";

import useKanbanDnd from "@/hooks/useKanbanDnd";
import useTodosByColumns from "@/hooks/useTodosByColumns";
import { useReorderColumns } from "@/services/columns/useReorderColumns";
import { queryClient } from "@/services/queryClient/queryClient";
import { useTodos } from "@/services/lib/todos/useTodos";
import { todoDrop } from "@/services/lib/todos/useTodoDrop";

import SortableColumn from "./SortableColumn";
import ColumnDropZone from "./ColumnDropZone";
import TodoDragOverlay from "./TodoDragOverlay";
import AddColumnButton from "../columns/AddColumnButton";
import CreateColumnModal from "../columns/CreateColumnModal";
import Loading from "../pages/loading/LoadingPage";

export default function KanbanBoard() {
  const { data: todos = [], isLoading, error } = useTodos();
  const { todosByColumn, columns } = useTodosByColumns();
  const reorderColumns = useReorderColumns();

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

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [createColumnOpen, setCreateColumnOpen] = useState(false);

  const orderedColumns = useMemo(
    () => columns.slice().sort((a, b) => a.position - b.position),
    [columns],
  );

  // A card on its way to another column: the destination gets highlighted and
  // both headers swap to the transition state. Same-column drags are just
  // reordering, so they stay quiet.
  const sourceId = activeTodo?.column_id ?? null;
  const destinationId = activeTodo ? indicator.columnId : null;
  const crossColumn = !!destinationId && destinationId !== sourceId;

  const sourceTitle = crossColumn
    ? t(orderedColumns.find((column) => column.id === sourceId)?.title ?? "")
    : "";

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
      onDragEnd={async ({ active }) => {
        // ---- column reorder ------------------------------------------------
        if (activeColumn) {
          const from = orderedColumns.findIndex((c) => c.id === active.id);

          if (from !== -1 && columnIndicator !== null) {
            // The gap index counts the dragged column itself while it sits to
            // the left of the target, so shift by one.
            const to =
              from < columnIndicator ? columnIndicator - 1 : columnIndicator;

            if (to !== from) {
              const reordered = arrayMove(orderedColumns, from, to).map(
                (column, index) => ({ ...column, position: index }),
              );

              queryClient.setQueryData(["columns"], reordered);
              reorderColumns.mutate(reordered);
            }
          }

          resetDrag();
          return;
        }

        // ---- todo drop -----------------------------------------------------
        if (activeTodo && indicator.columnId) {
          await todoDrop(todos, activeTodo, indicator);
        }

        resetDrag();
      }}
      onDragCancel={resetDrag}
    >
      <div className="h-full overflow-x-auto">
        <div className="flex min-w-max px-6 pb-6">
          <div className="flex h-full min-w-max">
            {orderedColumns.map((column, index) => (
              <Fragment key={column.id}>
                <ColumnDropZone
                  index={index}
                  active={!!activeColumn && columnIndicator === index}
                  beforeId={orderedColumns[index - 1]?.id}
                  afterId={column.id}
                />

                <SortableColumn
                  id={column.id}
                  column={column}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  headerTitle={t(column.title)}
                  todos={todosByColumn[column.id] ?? []}
                  indicator={indicator}
                  isDragSource={!!activeTodo && column.id === sourceId}
                  transition={
                    crossColumn && column.id === destinationId
                      ? { from: sourceTitle, to: t(column.title) }
                      : null
                  }
                />
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

      <TodoDragOverlay
        activeTodo={activeTodo}
        activeColumn={activeColumn}
        todosCount={
          activeColumn ? (todosByColumn[activeColumn.id]?.length ?? 0) : 0
        }
      />
    </DndContext>
  );
}

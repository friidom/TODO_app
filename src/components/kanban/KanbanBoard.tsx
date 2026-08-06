import { Fragment, useMemo, useState } from "react";

import { DndContext } from "@dnd-kit/core";
import { t } from "i18next";

import useKanbanDnd from "@/hooks/useKanbanDnd";
import { useBoardDragEnd } from "@/hooks/useBoardDragEnd";
import { useBoardModals } from "@/hooks/useBoardModals";
import { useColumnReorder } from "@/hooks/useColumnReorder";
import useTodosByColumns from "@/hooks/useTodosByColumns";
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
import { byPosition } from "@/utils/position";
import { titleKey } from "@/constants/columns";

export default function KanbanBoard() {
  const { data: todos = [], isLoading, error } = useTodos();
  const { todosByColumn, columns } = useTodosByColumns();

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

  /** Client-only view state: which columns are folded away. Never persisted. */
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const {
    createColumnOpen,
    setCreateColumnOpen,
    closeCreateColumn,
    limitColumn,
    openLimitModal,
    closeLimitModal,
    deleteTarget,
    openDeleteModal,
    closeDeleteModal,
  } = useBoardModals();

  const orderedColumns = useMemo(
    () => columns.slice().sort(byPosition),
    [columns],
  );

  const { moveColumn } = useColumnReorder(orderedColumns);

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
                    onSetLimit={() => openLimitModal(column)}
                    onDelete={() => openDeleteModal(column)}
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

      <CreateColumnModal open={createColumnOpen} onClose={closeCreateColumn} />

      <ColumnLimitModal column={limitColumn} onClose={closeLimitModal} />

      <DeleteColumnModal
        column={deleteTarget}
        destinations={orderedColumns.filter(
          (column) => column.id !== deleteTarget?.id,
        )}
        onClose={closeDeleteModal}
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

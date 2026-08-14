import { Fragment, useMemo, useState } from "react";

import { DndContext } from "@dnd-kit/core";

import useKanbanDnd from "@/hooks/useKanbanDnd";
import { useBoardDragEnd } from "@/hooks/useBoardDragEnd";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardModals } from "@/hooks/useBoardModals";
import { usePermissions } from "@/hooks/usePermissions";
import { useBoardView } from "@/hooks/useBoardView";
import { useColumnReorder } from "@/hooks/useColumnReorder";
import useTodosByColumns from "@/hooks/useTodosByColumns";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { groupTodos, isSwimlaneGroup } from "@/services/todos/view";

import SortableColumn from "./SortableColumn";
import ColumnDropZone from "./ColumnDropZone";
import Swimlanes from "./Swimlanes";
import TodoDragOverlay from "./TodoDragOverlay";
import AddColumnButton from "../columns/AddColumnButton";
import CreateColumnModal from "../columns/CreateColumnModal";
import ColumnLimitModal from "../columns/ColumnLimitModal";
import DeleteColumnModal from "../columns/DeleteColumnModal";
import CollapsedColumn from "../columns/CollapsedColumn";
import ViewNotice from "../board/ViewNotice";
import Loading from "../loading/LoadingPage";
import { byPosition } from "@/utils/position";
import { columnTitle } from "@/constants/columns";

export default function KanbanBoard() {
  const boardId = useBoardId();
  const view = useBoardView();

  // `todos` is what the view asked for; `all` is the board as it is stored. The
  // drop mutation rewrites positions across whole columns, so it needs every
  // row — a filtered array would renumber the visible cards and silently strand
  // the hidden ones.
  const { todos, all, isLoading, error } = useVisibleTodos();

  const { data: members = [] } = useBoardMembers(boardId);

  // A drop rewrites `column_id` and `position`, which M3-05 gates at editor.
  // The plan is explicit that the SENSORS have to be gated and not only the
  // buttons: a viewer who can pick a card up gets an optimistic move that
  // silently reverts, and that reads as a broken board rather than as a
  // permission.
  const { canEditTodos } = usePermissions(boardId);

  const dragDisabled = view.dndDisabled || !canEditTodos;

  const swimlanes = isSwimlaneGroup(view.group);

  // Already in display order — `useVisibleTodos` filtered and ordered it, so
  // this only buckets.
  const { todosByColumn, columns } = useTodosByColumns(todos);

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

  const lanes = useMemo(
    () =>
      swimlanes ? groupTodos(todos, view.group, { columns, members }) : [],
    [swimlanes, todos, view.group, columns, members],
  );

  const { moveColumn } = useColumnReorder(orderedColumns);

  const { onDragEnd, sourceId, destinationId, sourceColumn } = useBoardDragEnd({
    todos: all,
    visibleByColumn: todosByColumn,
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

        const todo = all.find((todo) => todo.id === active.id);

        if (todo) setActiveTodo(todo);
      }}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      <div className="flex h-full min-h-0 flex-col">
        <ViewNotice view={view} visibleCount={todos.length} showDragHint />

        {swimlanes ? (
          <Swimlanes
            groups={lanes}
            group={view.group}
            orderedColumns={orderedColumns}
            members={members}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max px-0 pb-6">
              <div className="flex h-full min-w-max">
                {orderedColumns.map((column, index) => (
                  <Fragment key={column.id}>
                    {/* Column gaps stay: reordering columns is still meaningful
                        while the cards inside them are sorted, because the
                        columns themselves are always in stored order. */}
                    <ColumnDropZone
                      index={index}
                      active={!!activeColumn && columnIndicator === index}
                      beforeId={orderedColumns[index - 1]?.id}
                      afterId={column.id}
                    />

                    {collapsed.includes(column.id) ? (
                      <CollapsedColumn
                        column={column}
                        headerTitle={columnTitle(column.title)}
                        count={todosByColumn[column.id]?.length ?? 0}
                        onExpand={() => toggleCollapsed(column.id)}
                      />
                    ) : (
                      <SortableColumn
                        id={column.id}
                        column={column}
                        headerTitle={columnTitle(column.title)}
                        todos={todosByColumn[column.id] ?? []}
                        indicator={indicator}
                        isDragSource={!!activeTodo && column.id === sourceId}
                        dragDisabled={dragDisabled}
                        exactOrder={
                          view.filterCount === 0 && view.sort === "manual"
                        }
                        onCollapse={() => toggleCollapsed(column.id)}
                        onSetLimit={() => openLimitModal(column)}
                        onDelete={() => openDeleteModal(column)}
                        onMoveLeft={
                          index > 0
                            ? () => moveColumn(index, index - 1)
                            : undefined
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
                                  title: columnTitle(sourceColumn.title),
                                  category: sourceColumn.category,
                                },
                                to: {
                                  title: columnTitle(column.title),
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
        )}
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

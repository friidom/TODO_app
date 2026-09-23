import { Fragment, useMemo, useState } from "react";

import { DndContext, type DataRef, type UniqueIdentifier } from "@dnd-kit/core";
import { RocketIcon } from "lucide-react";

import {
  SCREEN_READER_INSTRUCTIONS,
  announceCancelled,
  announceDropped,
  announceMovedOver,
  announcePickedUp,
  describeColumnPosition,
  describePosition,
  itemLabel,
} from "@/hooks/dragAnnouncements";
import useKanbanDnd from "@/hooks/useKanbanDnd";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
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
import { isOnBoard } from "@/services/todos/backlog";

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
import EmptyState from "../ui/EmptyState";
import Loading from "../loading/LoadingPage";
import { byRank } from "@/utils/rank";
import { columnTitle } from "@/constants/columns";
import { taskKey } from "@/utils/taskKey";

export default function KanbanBoard() {
  const boardId = useBoardId();
  const view = useBoardView();

  // `all` (unfiltered) is what the drop mutation reorders — a filtered array would strand the hidden cards.
  const { todos, all, isLoading, error } = useVisibleTodos();

  const { data: members = [] } = useBoardMembers(boardId);

  // Sensors gated too, not just the buttons — a viewer who can pick a card up gets a move that silently reverts.
  const { canEditTodos } = usePermissions(boardId);

  const dragDisabled = view.dndDisabled || !canEditTodos;

  const swimlanes = isSwimlaneGroup(view.group);

  const { todosByColumn, columns, activeSprintId, sprintsEnabled, sprintsPending } =
    useTodosByColumns(todos);

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

  const keyPrefix = useKeyPrefix();

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

  const orderedColumns = useMemo(() => columns.slice().sort(byRank), [columns]);

  // isOnBoard filtered here, not inside Swimlanes, so the rule stays in one place and that component stays about layout.
  const lanes = useMemo(
    () =>
      swimlanes
        ? groupTodos(
            todos.filter((todo) => isOnBoard(todo, activeSprintId, sprintsEnabled)),
            view.group,
            { columns, members },
          )
        : [],
    [swimlanes, todos, activeSprintId, sprintsEnabled, view.group, columns, members],
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

  // sprintsPending still gates loading — without it a card in the running sprint flickers out of its column for a frame.
  if (isLoading || sprintsPending) return <Loading />;

  if (error) return <p>{error.message}</p>;

  function labelOf(id: UniqueIdentifier, type: string | undefined) {
    if (type === "column") {
      return (
        columnTitle(orderedColumns.find((c) => c.id === id)?.title) || "column"
      );
    }

    const todo = all.find((it) => it.id === id);

    if (!todo) return "item";

    return itemLabel(taskKey(keyPrefix, todo.board_key), todo.title);
  }

  function positionOf(over: { id: UniqueIdentifier; data: DataRef } | null) {
    const data = over?.data.current as
      { type?: string; columnId?: string; index?: number } | undefined;

    if (!data) return null;

    if (data.type === "column-gap") {
      return describeColumnPosition(data.index ?? 0, orderedColumns.length + 1);
    }

    const column = orderedColumns.find((c) => c.id === data.columnId);
    const title = columnTitle(column?.title) || "this column";

    if (data.type === "column") return `${title}, which is empty`;

    const gaps = (todosByColumn[data.columnId ?? ""]?.length ?? 0) + 1;

    return describePosition(data.index ?? 0, gaps, title);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
        announcements: {
          onDragStart: ({ active }) =>
            announcePickedUp(
              labelOf(active.id, active.data.current?.type),
              positionOf(null),
            ),
          onDragOver: ({ active, over }) =>
            announceMovedOver(
              labelOf(active.id, active.data.current?.type),
              positionOf(over),
            ),
          onDragEnd: ({ active, over }) =>
            announceDropped(
              labelOf(active.id, active.data.current?.type),
              positionOf(over),
            ),
          onDragCancel: ({ active }) =>
            announceCancelled(labelOf(active.id, active.data.current?.type)),
        },
      }}
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

        {sprintsEnabled && activeSprintId === null ? (
          <NoActiveSprint onGoToBacklog={() => view.setMode("backlog")} />
        ) : swimlanes ? (
          <Swimlanes
            groups={lanes}
            group={view.group}
            orderedColumns={orderedColumns}
            members={members}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto pb-4">
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
                      dragging={!!activeTodo || !!activeColumn}
                      // search narrows a column same as a filter — without this a searched column offers the mid-column + with a bogus index
                      exactOrder={
                        view.filterCount === 0 &&
                        !view.query.trim() &&
                        view.sort === "manual"
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

              <div className="ml-2 shrink-0 self-start">
                <AddColumnButton setCreateColumnOpen={setCreateColumnOpen} />
              </div>
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

// Replaces the columns rather than sitting above them: with Sprints on and none
// running the board has nothing to show, and a row of empty columns reads as a
// bug where this reads as a state. Column management stays reachable from the
// Backlog and from Board settings.
//
// Only rendered when the Sprints feature is on — with it off, a column is the
// whole rule again and the board is never empty for this reason.
function NoActiveSprint({ onGoToBacklog }: { onGoToBacklog: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center">
      <EmptyState
        icon={RocketIcon}
        title="No active sprint"
        hint="Start a sprint to see work on this board."
        action={{ label: "Go to Backlog", run: onGoToBacklog }}
      />
    </div>
  );
}

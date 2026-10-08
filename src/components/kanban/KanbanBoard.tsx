import { useTranslation } from "react-i18next";
import { Fragment, useMemo, useRef, useState } from "react";

import { DndContext, type DataRef, type UniqueIdentifier } from "@dnd-kit/core";
import { CircleAlertIcon, RocketIcon } from "lucide-react";

import {
  screenReaderInstructions,
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
import { hideStaleDone } from "@/services/views/boardViewPrefs";
import { useBoardViewPrefs } from "@/stores/boardViewPrefs";
import {
  columnCategory,
  doneStatusIds,
  entryStatus,
} from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { IStatus } from "@/types/data";

import BoardMinimap from "./BoardMinimap";
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
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";

const NO_STATUSES: IStatus[] = [];

export default function KanbanBoard() {
  const { t } = useTranslation();
  const boardId = useBoardId();
  const view = useBoardView();

  // `all` (unfiltered) is what the drop mutation reorders — a filtered array would strand the hidden cards.
  const { todos: visible, all, isLoading, error } = useVisibleTodos();

  const { data: statuses = NO_STATUSES } = useStatuses();
  const hideDoneAfter = useBoardViewPrefs((state) => state.prefs.hideDoneAfter);
  const today = todayISO();

  // Hide done is a Board setting, so it trims after the shared pipeline rather than inside it — List and Backlog keep everything.
  const todos = useMemo(
    () => hideStaleDone(visible, hideDoneAfter, doneStatusIds(statuses), today),
    [visible, hideDoneAfter, statuses, today],
  );

  const { data: members = [] } = useBoardMembers(boardId);

  // Sensors gated too, not just the buttons — a viewer who can pick a card up gets a move that silently reverts.
  const { canEditTodos, canManageColumns, canManageWorkflow } =
    usePermissions(boardId);

  const dragDisabled = view.dndDisabled || !canEditTodos;

  const swimlanes = isSwimlaneGroup(view.group);

  const {
    todosByColumn,
    columns,
    workflow,
    activeSprintId,
    sprintsEnabled,
    sprintsPending,
  } = useTodosByColumns(todos);

  const {
    sensors,
    autoScroll,
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

  // Read here and handed down, never per column or card, so a layout change re-renders the columns and nothing finer.
  const flexible = useBoardViewPrefs(
    (state) => state.prefs.columnSize === "flexible",
  );
  const wholeBoard = useBoardViewPrefs(
    (state) => state.prefs.scroll === "board",
  );

  // The minimap reads this scroller's own scroll and size; nothing here depends on either.
  const scrollerRef = useRef<HTMLDivElement>(null);

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
            todos.filter((todo) =>
              isOnBoard(todo, activeSprintId, sprintsEnabled),
            ),
            view.group,
            { statuses: workflow.statuses, members },
          )
        : [],
    // t: groupTodos names the fallback lanes in the current language, so a
    // language switch must regroup
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      swimlanes,
      todos,
      activeSprintId,
      sprintsEnabled,
      view.group,
      workflow.statuses,
      members,
      t,
    ],
  );

  // Where a deleted column's cards can go: another column that can receive
  // them, i.e. one with a visible status.
  const deleteDestinations = (columnId: string | undefined) =>
    orderedColumns.filter(
      (column) =>
        column.id !== columnId &&
        entryStatus(workflow.statuses, column.id) !== null,
    );

  const { moveColumn } = useColumnReorder(orderedColumns);

  const { onDragEnd, sourceId, destinationId, transition, choicesIn } =
    useBoardDragEnd({
      todos: all,
      visibleByColumn: todosByColumn,
      orderedColumns,
      workflow,
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

  if (error) {
    return (
      <div className="grid h-full place-items-center">
        <EmptyState
          icon={CircleAlertIcon}
          title={t("board.loadFailed")}
          hint={error.message}
        />
      </div>
    );
  }

  function labelOf(id: UniqueIdentifier, type: string | undefined) {
    if (type === "column") {
      return (
        columnTitle(orderedColumns.find((c) => c.id === id)?.title) ||
        t("dnd.column")
      );
    }

    const todo = all.find((it) => it.id === id);

    if (!todo) return t("dnd.item");

    return itemLabel(taskKey(keyPrefix, todo.board_key), todo.title);
  }

  function positionOf(over: { id: UniqueIdentifier; data: DataRef } | null) {
    const data = over?.data.current as
      | { type?: string; columnId?: string; index?: number; statusId?: string }
      | undefined;

    if (!data) return null;

    if (data.type === "column-gap") {
      return describeColumnPosition(data.index ?? 0, orderedColumns.length + 1);
    }

    const column = orderedColumns.find((c) => c.id === data.columnId);
    const title = columnTitle(column?.title) || t("dnd.thisColumn");

    if (data.type === "column") return t("dnd.emptyColumn", { column: title });

    if (data.type === "status-zone") {
      return t("dnd.statusIn", {
        status:
          workflow.statusById.get(data.statusId ?? "")?.name ??
          t("dnd.aStatus"),
        column: title,
      });
    }

    const gaps = (todosByColumn[data.columnId ?? ""]?.length ?? 0) + 1;

    return describePosition(data.index ?? 0, gaps, title);
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={autoScroll}
      collisionDetection={collisionDetection}
      accessibility={{
        screenReaderInstructions: { draggable: screenReaderInstructions() },
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
      <div className="relative flex h-full min-h-0 flex-col">
        <ViewNotice view={view} visibleCount={visible.length} showDragHint />

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
          // -mx-3 spends the leading gap's width from ViewShell's gutter, so the first column lines up with the toolbar
          <div
            ref={scrollerRef}
            className={cn(
              "-mx-3 min-h-0 flex-1 pb-4",
              wholeBoard ? "overflow-auto" : "overflow-x-auto",
            )}
          >
            <div
              className={cn(
                "flex",
                wholeBoard ? "min-h-full" : "h-full",
                // growable columns would otherwise size the row by the longest unwrapped card title
                flexible ? "min-w-full" : "min-w-max",
              )}
            >
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
                      category={columnCategory(workflow.statuses, column.id)}
                      headerTitle={columnTitle(column.title)}
                      count={todosByColumn[column.id]?.length ?? 0}
                      onExpand={() => toggleCollapsed(column.id)}
                      reorderDisabled={!canManageWorkflow}
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
                      flexible={flexible}
                      wholeBoard={wholeBoard}
                      dragging={!!activeTodo || !!activeColumn}
                      // search narrows a column same as a filter — without this a searched column offers the mid-column + with a bogus index
                      exactOrder={
                        view.filterCount === 0 &&
                        !view.query.trim() &&
                        view.sort === "manual" &&
                        todos === visible
                      }
                      onCollapse={() => toggleCollapsed(column.id)}
                      onSetLimit={
                        canManageColumns
                          ? () => openLimitModal(column)
                          : undefined
                      }
                      onDelete={() => openDeleteModal(column)}
                      onMoveLeft={
                        canManageWorkflow && index > 0
                          ? () => moveColumn(index, index - 1)
                          : undefined
                      }
                      onMoveRight={
                        canManageWorkflow && index < orderedColumns.length - 1
                          ? () => moveColumn(index, index + 1)
                          : undefined
                      }
                      canDelete={
                        canManageWorkflow &&
                        deleteDestinations(column.id).length > 0
                      }
                      reorderDisabled={!canManageWorkflow}
                      transition={
                        column.id === destinationId ? transition : null
                      }
                      choices={choicesIn(column.id)}
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

              <div className="mt-1.5 shrink-0 self-start">
                <AddColumnButton setCreateColumnOpen={setCreateColumnOpen} />
              </div>
            </div>
          </div>
        )}

        {/* Rendered under the same condition as the scroller it follows, so the two always mount and unmount together */}
        {!(sprintsEnabled && activeSprintId === null) && !swimlanes && (
          <BoardMinimap
            scrollerRef={scrollerRef}
            columns={orderedColumns.length}
          />
        )}
      </div>

      <CreateColumnModal open={createColumnOpen} onClose={closeCreateColumn} />

      <ColumnLimitModal column={limitColumn} onClose={closeLimitModal} />

      <DeleteColumnModal
        column={deleteTarget}
        destinations={deleteDestinations(deleteTarget?.id)}
        onClose={closeDeleteModal}
      />

      <TodoDragOverlay
        activeTodo={activeTodo}
        activeColumn={activeColumn}
        activeColumnCategory={
          activeColumn
            ? columnCategory(workflow.statuses, activeColumn.id)
            : null
        }
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
  const { t } = useTranslation();

  return (
    <div className="grid min-h-0 flex-1 place-items-center">
      <EmptyState
        icon={RocketIcon}
        title={t("sprint.noneActive")}
        hint={t("sprint.noneActiveHint")}
        action={{ label: t("sprint.goToBacklog"), run: onGoToBacklog }}
      />
    </div>
  );
}

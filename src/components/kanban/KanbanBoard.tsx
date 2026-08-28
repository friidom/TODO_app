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
import Loading from "../loading/LoadingPage";
import { byRank } from "@/utils/rank";
import { columnTitle } from "@/constants/columns";
import { taskKey } from "@/utils/taskKey";

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
  // this only buckets. `activeSprintId === null` is this board's own "no
  // Sprint is running" state, and it is read here only to *name* that state
  // in a notice above the board — never to decide whether the board renders.
  const { todosByColumn, columns, activeSprintId, sprintsPending } =
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

  /** The board's key prefix, for naming cards in drag announcements (M9-02). */
  const keyPrefix = useKeyPrefix();

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

  const orderedColumns = useMemo(() => columns.slice().sort(byRank), [columns]);

  // Swimlanes render the same board, so they answer "what is on it" the same
  // way. `Swimlanes` buckets a lane by `column_id` alone, which drops Backlog
  // rows (no column matches) but would happily show work committed to a
  // Sprint that is not running — the one thing `isOnBoard` exists to withhold.
  // Filtering here rather than inside `Swimlanes` keeps the rule in one place
  // and keeps that component about layout.
  const lanes = useMemo(
    () =>
      swimlanes
        ? groupTodos(
            todos.filter((todo) => isOnBoard(todo, activeSprintId)),
            view.group,
            { columns, members },
          )
        : [],
    [swimlanes, todos, activeSprintId, view.group, columns, members],
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

  // `sprintsPending` still joins the loading gate. It no longer decides
  // whether the board renders at all, but `isOnBoard` reads `activeSprintId`
  // — so without this, a card committed to the running Sprint would flicker
  // out of its column for one frame while `useSprints()` resolved and
  // `activeSprintId` was still defaulting to null.
  if (isLoading || sprintsPending) return <Loading />;

  if (error) return <p>{error.message}</p>;

  /**
   * The board, said out loud (M9-02).
   *
   * Every lookup here reads state this component already holds — `columns`,
   * `todosByColumn`, `orderedColumns` — so announcing a drag costs no query and
   * nothing had to be lifted or re-fetched to make the board audible.
   */
  function labelOf(id: UniqueIdentifier, type: string | undefined) {
    if (type === "column") {
      return (
        columnTitle(orderedColumns.find((c) => c.id === id)?.title) || "column"
      );
    }

    const todo = all.find((it) => it.id === id);

    if (!todo) return "item";

    // The same builder the card's own `aria-label` uses. Hearing one name on
    // focus and a different one on pick-up is worse than either being
    // imperfect, so there is exactly one of these.
    return itemLabel(taskKey(keyPrefix, todo.board_key), todo.title);
  }

  /** The `over` droppable, as "position n of m in Column". */
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

    // Gaps, not cards: a column of three cards has four places to land.
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
        {activeSprintId === null && (
          <NoActiveSprintNotice onGoToBacklog={() => view.setMode("backlog")} />
        )}

        <ViewNotice view={view} visibleCount={todos.length} showDragHint />

        {swimlanes ? (
          <Swimlanes
            groups={lanes}
            group={view.group}
            orderedColumns={orderedColumns}
            members={members}
          />
        ) : (
          // The board's own scroll box. `pb-4` sits on this element rather than
          // on the track inside it, so the columns can be `h-full` without the
          // padding pushing them past the bottom edge (M17).
          <div className="min-h-0 flex-1 overflow-x-auto pb-4">
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
                      // One boolean, computed once, in place of ~200 gaps each
                      // subscribing to dnd-kit's context (M9-05).
                      dragging={!!activeTodo || !!activeColumn}
                      // A search narrows a column exactly as a filter does, so
                      // it belongs in this test — without it a searched column
                      // believed it was showing stored order, offered the
                      // mid-column `+`, and handed `addTodo` an index counted
                      // over the matches while the insert spliced into the full
                      // column. Same class of bug `dropIndex.ts` exists for.
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

              {/* Wrapped so the button keeps its own height inside a flex
                    track whose items otherwise stretch to the column height. */}
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

/**
 * No Sprint is running on this board — said in a strip above an otherwise
 * completely normal board, not by replacing it.
 *
 * **This is `ViewNotice`'s own case, and it used to be `EmptyList`'s.** An
 * earlier pass made it a full-page takeover on the reasoning that there was
 * nothing behind it worth looking at, because `isOnBoard` withheld every card
 * while no Sprint was active. That rule is gone (see `backlog.ts`): unplanned
 * work sits on the Board on its `column_id` alone, so behind this strip there
 * are real columns with real cards — plus every column control, rename,
 * reorder, limits, delete and Add column, which the takeover made unreachable
 * on a board that had simply never started a Sprint.
 *
 * So it borrows `ViewNotice`'s shape rather than `EmptyList`'s: one line, an
 * icon, and the single click that resolves it. Same `mb-3` rhythm and the same
 * `text-brand` action button, so the two read as one row of chrome on the
 * boards where a filter notice happens to be showing too.
 */
function NoActiveSprintNotice({
  onGoToBacklog,
}: {
  onGoToBacklog: () => void;
}) {
  return (
    <p className="text-ink-3 mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <RocketIcon className="size-3.5 shrink-0" />
      <span>
        No sprint is running. Cards below are unplanned work — plan a sprint to
        commit to a set of it.
      </span>
      <button
        type="button"
        onClick={onGoToBacklog}
        className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded px-1.5 py-0.5 font-medium transition-colors outline-none focus-visible:ring-2"
      >
        Go to Backlog
      </button>
    </p>
  );
}

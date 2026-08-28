import { Fragment, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PlusIcon } from "lucide-react";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import { workTypeOf } from "@/constants/workTypes";
import useBacklogDnd, { type BacklogIndicator } from "@/hooks/useBacklogDnd";
import { useBacklogDragEnd } from "@/hooks/useBacklogDragEnd";
import { useBoardView } from "@/hooks/useBoardView";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { usePermissions } from "@/hooks/usePermissions";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { buildBacklogBoard } from "@/services/todos/backlog";
import { useAddBacklogItem } from "@/services/todos/useAddBacklogItem";
import { useSprints } from "@/services/sprints/useSprints";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import type { IColumn, Sprint, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";
import BacklogDropZone from "./BacklogDropZone";
import BacklogRow from "./BacklogRow";
import SprintSection from "./SprintSection";
import CreateSprintModal from "./CreateSprintModal";
import CompleteSprintModal from "./CompleteSprintModal";
import DeleteSprintModal from "./DeleteSprintModal";

/**
 * The board's unstarted work, organised by Sprint (M29+M30+M31-C).
 *
 * **A renderer over the same pipeline as every other view.** It reads
 * `useVisibleTodos()`, so the filter and the search a viewer already set
 * apply here too — the same argument the Timeline's own header comment
 * makes for itself. `buildBacklogBoard` is the one place that turns that
 * flat array into "one section per open Sprint, plus the ungrouped
 * Backlog" — see its own doc for why an item's presence here and its
 * presence on the Board are independent facts.
 *
 * **A genuine Subtask never reaches this page.** `useVisibleTodos` has
 * already dropped it (M27), so "Subtasks remain attached to their Task and
 * do not become independent planning items" holds without this component
 * doing anything about it — the same free property the Timeline has.
 *
 * **Gap-precise drag-and-drop (M31-C), extracted the same way the Board's
 * own is.** `useBacklogDnd` (sensors, collision detection, the hovered-gap
 * indicator) and `useBacklogDragEnd` (what a drop means) are this page's
 * counterparts to the Board's `useKanbanDnd`/`useBoardDragEnd` — narrowed to
 * one branch, since this page only ever drags one kind of thing. Collision
 * detection resolves the nearest Sprint section, then the nearest gap
 * inside it, exactly like the Board resolves a column and then a gap within
 * it; `resolveDropIndex` (`services/todos/dropIndex.ts`) is reused
 * unchanged to turn the rendered gap into a stored-list index.
 * `sprintAssignmentPatch` (in `useBacklogDragEnd`) is still the one function
 * a drag and `BacklogRow`'s own `SprintControl` dropdown both call, so the
 * two can never disagree about where a card lands.
 *
 * **The Backlog's own ungrouped list is its own component, `BacklogUnplannedSection`,
 * for a reason that is not stylistic.** `useDroppable` reads a React Context
 * that only exists inside `<DndContext>`'s children — a component cannot
 * consume the context of the provider it itself renders. Calling it directly
 * in `BacklogView`, the component whose JSX *creates* `<DndContext>`, silently
 * registers nothing (confirmed live: the droppable's ref fires, but dnd-kit's
 * own registry never gains the id). `SprintSection` already had this right,
 * being a genuine child; the Backlog's own section needed the same shape.
 *
 * As on the Board, nothing here reflows while dragging — only the
 * `DragOverlay` moves, and a static blue line marks the nearest gap.
 */
export default function BacklogView() {
  const view = useBoardView();
  const { todos, isLoading, error } = useVisibleTodos();
  const { data: sprints = [], isLoading: sprintsLoading } = useSprints();
  const { data: columns = [] } = useColumns();
  const { canEditTodos } = usePermissions();
  const keyPrefix = useKeyPrefix();

  const [creatingSprint, setCreatingSprint] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [completingSprint, setCompletingSprint] = useState<Sprint | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<Sprint | null>(null);
  const [addingToBacklog, setAddingToBacklog] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);

  const addItem = useAddBacklogItem();

  const { sensors, collisionDetection, handleDragOver, indicator, resetDrag } =
    useBacklogDnd();

  // Memoised for the same reason `useTodosByColumns` memoises the Board's
  // own grouping: `indicator` lives in this component, so every pointer
  // move re-renders it — recomputing a filter+sort over every todo on the
  // board on each of those renders is exactly the kind of "expensive
  // calculation during pointer movement" that reads as drag jank.
  const board = useMemo(
    () => buildBacklogBoard(todos, sprints),
    [todos, sprints],
  );

  // Memoised so its *reference* is stable across an indicator-driven
  // re-render, not just its contents — `BacklogRow` is split the way
  // `TodoItem` is (M9-05) specifically so it can bail out via `memo`, and a
  // fresh array here on every render would defeat that for every row on
  // every gap the pointer crosses, same as a fresh object would for
  // `TodoContainer` (see that file's own `SubtaskCounts` doc).
  const openSprints = useMemo(
    () => sprints.filter((sprint) => sprint.state !== "completed"),
    [sprints],
  );
  const activeSprintId = activeSprintIdOf(sprints);

  const { onDragEnd } = useBacklogDragEnd({
    board,
    columns,
    activeSprintId,
    indicator,
    resetDrag: () => {
      resetDrag();
      setActiveTodo(null);
    },
  });

  if (isLoading || sprintsLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  function submitBacklogItem() {
    const trimmed = newItemTitle.trim();

    if (trimmed) addItem.mutate({ title: trimmed });

    setNewItemTitle("");
    setAddingToBacklog(false);
  }

  function handleDragStart(event: DragStartEvent) {
    const dragged = event.active.data.current?.todo as Todo | undefined;

    setActiveTodo(dragged ?? null);
  }

  const overlayType = activeTodo ? workTypeOf(activeTodo.type) : null;
  const OverlayIcon = overlayType?.icon;
  const overlayKey = activeTodo
    ? taskKey(keyPrefix, activeTodo.board_key)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        resetDrag();
        setActiveTodo(null);
      }}
    >
      {/* **Two elements, not one, and that is the fix for the page not
          scrolling** (and for Sprint sections visibly collapsing). This used
          to be a single `flex h-full min-h-0 flex-col overflow-y-auto`
          carrying both jobs at once. A flex item defaults to `flex-shrink:
          1`, so once the sections were taller than the viewport the flex
          algorithm *shrank them to fit* rather than letting them overflow —
          which meant nothing ever exceeded the container, `overflow-y-auto`
          had nothing to scroll, and each `<section>` (being
          `overflow-hidden`) simply clipped its own rows. Splitting the
          non-scrolling column from the scroll box is the shape `ListView`,
          `CalendarView` and `TimelineView` all already use. */}
      <div className="flex h-full min-h-0 flex-col">
        <ViewNotice view={view} visibleCount={todos.length} />

        {canEditTodos && (
          <button
            type="button"
            onClick={() => setCreatingSprint(true)}
            className="border-hairline text-ink-2 hover:bg-ink/6 rounded-control mb-4 flex h-8 w-fit shrink-0 items-center gap-1.5 border px-3 text-xs font-medium transition-colors"
          >
            <PlusIcon className="size-3.5" />
            Create sprint
          </button>
        )}

        {/* The scroll box. Deliberately NOT a flex container: the sections are
            ordinary block children here, so they take their natural height and
            the box scrolls, instead of being flex items competing to shrink. */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {board.sprintSections.map((section) => (
            <SprintSection
              key={section.sprint.id}
              section={section}
              sprints={openSprints}
              columns={columns}
              indicator={indicator}
              onEdit={setEditingSprint}
              onComplete={setCompletingSprint}
              onDelete={setDeletingSprint}
            />
          ))}

          <BacklogUnplannedSection
            items={board.unplanned}
            sprints={openSprints}
            columns={columns}
            indicator={indicator}
            canEditTodos={canEditTodos}
            adding={addingToBacklog}
            newItemTitle={newItemTitle}
            onNewItemTitleChange={setNewItemTitle}
            onStartAdding={() => setAddingToBacklog(true)}
            onCancelAdding={() => {
              setNewItemTitle("");
              setAddingToBacklog(false);
            }}
            onSubmit={submitBacklogItem}
          />
        </div>

        {creatingSprint && (
          <CreateSprintModal onClose={() => setCreatingSprint(false)} />
        )}

        {editingSprint && (
          <CreateSprintModal
            sprint={editingSprint}
            onClose={() => setEditingSprint(null)}
          />
        )}

        {completingSprint && (
          <CompleteSprintModal
            sprint={completingSprint}
            otherOpenSprints={openSprints.filter(
              (sprint) => sprint.id !== completingSprint.id,
            )}
            onClose={() => setCompletingSprint(null)}
          />
        )}

        {deletingSprint && (
          <DeleteSprintModal
            sprint={deletingSprint}
            onClose={() => setDeletingSprint(null)}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null} adjustScale={false}>
        {activeTodo && OverlayIcon && (
          // Shadow/opacity/cursor match `TodoCard`'s own `overlay` branch
          // (`components/todo/TodoCard.tsx`) — the Board's drag overlay is
          // the reference for what a lifted item looks like on this product,
          // and this page's own overlay should read as the same gesture.
          <div className="bg-elevated border-hairline rounded-card text-ink flex max-w-xs cursor-grabbing items-center gap-1.5 border px-3 py-2 text-sm font-medium opacity-70 shadow-lg">
            <OverlayIcon
              className={cn("size-3.5 shrink-0", overlayType!.tone)}
            />

            {overlayKey && (
              <span className="text-ink-3/80 text-mini shrink-0 font-medium tabular-nums">
                {overlayKey}
              </span>
            )}

            <span className="truncate">{activeTodo.title || "Untitled"}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The Backlog's own ungrouped list — a genuine child of `<DndContext>` (see
 * this file's own header for why that is load-bearing, not stylistic).
 * Mirrors `SprintSection`'s gap-precise shape exactly, for the section
 * `sectionKey: null` names.
 */
function BacklogUnplannedSection({
  items,
  sprints,
  columns,
  indicator,
  canEditTodos,
  adding,
  newItemTitle,
  onNewItemTitleChange,
  onStartAdding,
  onCancelAdding,
  onSubmit,
}: {
  items: Todo[];
  sprints: Sprint[];
  columns: IColumn[];
  indicator: BacklogIndicator | null;
  canEditTodos: boolean;
  adding: boolean;
  newItemTitle: string;
  onNewItemTitleChange: (value: string) => void;
  onStartAdding: () => void;
  onCancelAdding: () => void;
  onSubmit: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "backlog-section:none",
    data: { type: "backlog-section", sectionKey: null },
  });

  function gapActive(index: number) {
    return indicator?.sectionKey === null && indicator.index === index;
  }

  return (
    <section className="border-hairline rounded-card overflow-hidden border">
      <header className="px-3 py-2.5">
        <h3 className="text-ink text-sm font-semibold">Backlog</h3>
        <p className="text-ink-3 text-mini mt-0.5">
          {items.length} {items.length === 1 ? "item" : "items"} not yet on a
          Sprint
        </p>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "border-hairline border-t transition-colors",
          isOver && "bg-brand/5",
        )}
      >
        {items.length > 0 && (
          <BacklogDropZone
            sectionKey={null}
            index={0}
            active={gapActive(0)}
            afterId={items[0]?.id}
          />
        )}

        {items.map((item, i) => (
          <Fragment key={item.id}>
            <BacklogRow todo={item} sprints={sprints} columns={columns} />

            <BacklogDropZone
              sectionKey={null}
              index={i + 1}
              active={gapActive(i + 1)}
              beforeId={item.id}
              afterId={items[i + 1]?.id}
            />
          </Fragment>
        ))}

        {canEditTodos &&
          (adding ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                autoFocus
                value={newItemTitle}
                onChange={(e) => onNewItemTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                  if (e.key === "Escape") onCancelAdding();
                }}
                onBlur={onSubmit}
                placeholder="What needs doing?"
                className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-control min-w-0 flex-1 border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartAdding}
              className="text-ink-3 hover:bg-ink/[0.035] hover:text-ink-2 flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium transition-colors"
            >
              <PlusIcon className="size-3.5" />
              Create item
            </button>
          ))}

        {items.length === 0 && !adding && (
          <p className="text-ink-3 px-3 pb-2 text-xs">
            Nothing unplanned — everything real is either on a Sprint or on the
            Board already.
          </p>
        )}
      </div>
    </section>
  );
}

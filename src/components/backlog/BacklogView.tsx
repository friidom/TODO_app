import { Fragment, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PlusIcon, LayersIcon } from "lucide-react";

import ViewNotice from "@/components/board/ViewNotice";
import Loading from "@/components/loading/LoadingPage";
import EmptyState from "@/components/ui/EmptyState";
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

// The ungrouped list is its own component (BacklogUnplannedSection) because useDroppable needs DndContext's
// React context — calling it directly here, in the component whose JSX creates <DndContext>, silently registers nothing.
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

  // memoised — indicator changes on every pointer move, and re-filtering the whole board on each of those is drag jank.
  const board = useMemo(
    () => buildBacklogBoard(todos, sprints),
    [todos, sprints],
  );

  // stable reference so BacklogRow's memo() doesn't bail out on every gap the pointer crosses
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
      {/* two elements, not one — a single flex-col+overflow-y-auto let flex-shrink squeeze the sections instead of overflowing */}
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

        {/* not a flex container — sections take their natural height so this can actually scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {board.sprintSections.length === 0 &&
            board.unplanned.length === 0 && (
              <EmptyState
                icon={LayersIcon}
                title="Nothing planned yet"
                hint="The Backlog is where work waits before a sprint picks it up. Create a sprint, or add items and plan them later."
                action={
                  canEditTodos
                    ? {
                        label: "Create sprint",
                        run: () => setCreatingSprint(true),
                      }
                    : undefined
                }
              />
            )}

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
          // matches TodoCard's overlay styling so a lifted item reads the same everywhere
          <div className="bg-elevated border-hairline rounded-card text-ink flex max-w-xs cursor-grabbing items-center gap-1.5 border px-3 py-2 text-sm font-medium opacity-70 shadow-e3">
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

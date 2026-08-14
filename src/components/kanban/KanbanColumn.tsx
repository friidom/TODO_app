import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";

import type { IColumn, Todo } from "../../types/data";
import { Plus } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useAddTodo } from "@/services/todos/useAddTodo";
import DropZone from "./DropZone";
import TodoCreateForm, { type CreateDraft } from "./TodoCreateForm";
import ColumnHeader, { type TransitionPill } from "../columns/ColumnHeader";
import { categoryOf } from "@/constants/columns";
import { cn } from "@/utils/cn";
import ErrorBoundary from "@/components/ErrorBoundary";
import { usePermissions } from "@/hooks/usePermissions";
import type { TodoIndicator } from "@/hooks/useKanbanDnd";

interface Props {
  headerTitle: string;
  id: string;
  todos: Todo[];
  column: IColumn;
  indicator: TodoIndicator;
  dragHandleProps?: Record<string, unknown>;
  /** A card is being dragged out of this column. */
  isDragSource?: boolean;
  /** This column is the drop target for a card from another column. */
  transition?: { from: TransitionPill; to: TransitionPill } | null;
  /**
   * Nothing on this board may be picked up right now — a view sort is on, or the
   * board is split into swimlanes. The drop indicators go with it: an indicator
   * is a promise about where a card will land, and there is no honest answer.
   */
  dragDisabled?: boolean;
  /**
   * Whether `todos` is this column's complete list, in stored order.
   *
   * A new card's index is counted over what is rendered, and `applyTodoInserted`
   * splices it into the whole column — the same mismatch `dropIndex.ts` exists
   * for. A drop can be translated because it names the card it landed above; an
   * insert into a filtered column has no such anchor at the end of the list, so
   * this says so instead: the mid-column `+` is withheld and a new card appends.
   */
  exactOrder?: boolean;
  /**
   * This column is one lane's slice of a column, not the column itself.
   *
   * It renders the same cards in the same shape, minus everything that belongs
   * to the column as a whole: the header's menu (which would repeat once per
   * lane), the Create button (a card created here would have to inherit the
   * lane's dimension too) and the height cap (lanes stack, so the page scrolls
   * rather than each column).
   */
  lane?: boolean;
  onCollapse: () => void;
  onSetLimit: () => void;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canDelete: boolean;
}

export default function KanbanColumn({
  id,
  headerTitle,
  todos,
  column,
  indicator,
  dragHandleProps,
  isDragSource = false,
  transition = null,
  dragDisabled = false,
  exactOrder = true,
  lane = false,
  onCollapse,
  onSetLimit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canDelete,
}: Props) {
  const { setNodeRef } = useDroppable({
    id,
    data: { type: "column", columnId: id },
    disabled: dragDisabled,
  });

  // Creating work is editor and above (M3-05). Gates the Create button, the
  // hover-`+` on every gap, and the form itself — a viewer can still read the
  // column and its cards.
  const { canEditTodos } = usePermissions();

  /** Gap index the create form is open at, or `null` when it is closed. */
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  /** True only for the opening render, so the skeleton plays once. */
  const [skeleton, setSkeleton] = useState(false);
  const [title, setTitle] = useState("");

  const addTodoMutation = useAddTodo();
  const formRef = useRef<HTMLDivElement>(null);

  function openAt(gap: number) {
    setCreatingAt(gap);
    setSkeleton(true);
  }

  function onClose() {
    setCreatingAt(null);
    setSkeleton(false);
    setTitle("");
  }

  useEffect(() => {
    if (creatingAt === null) return;

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;

      if (formRef.current?.contains(target)) return;

      // The due-date and assignee panels are portalled to document.body, so
      // they are outside the form in the DOM while being part of it in the UI.
      // Without this, choosing a date closes the form and discards the draft.
      if (target instanceof Element && target.closest("[data-card-popover]")) {
        return;
      }

      onClose();
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [creatingAt]);

  useEffect(() => {
    // Only the form at the bottom needs the list scrolled down to it.
    if (creatingAt !== todos.length) return;

    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [todos.length, creatingAt]);

  const handleAddTodo = (draft: CreateDraft) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || creatingAt === null) return;

    addTodoMutation.mutate({
      title: trimmedTitle,
      column_id: id,
      // Omitted appends, which is the only honest answer when the rendered list
      // is not the whole column — `creatingAt` counts visible cards, and the
      // insert splices into every card the column holds.
      index: exactOrder ? creatingAt : undefined,
      // Whatever the form's own controls collected. Both null when untouched,
      // which is the behaviour creation had before they existed.
      ...draft,
    });
    //clean input for the next title
    setTitle("");
    // keep creating, now below the card we just added — no skeleton this time,
    // the form is already open and the caret has to stay live
    setSkeleton(false);
    setCreatingAt(creatingAt + 1);
  };
  //ref scroll
  const listRef = useRef<HTMLDivElement>(null);

  const isIndicatorHere = indicator?.columnId === id;

  /**
   * The `+` is pointless on the last gap (the Create button below already adds
   * there) and on the gap whose form is currently open — and meaningless when
   * the column is showing a subset, since the gap does not name a position the
   * stored column has.
   */
  const addHandlerFor = (gap: number) =>
    canEditTodos && exactOrder && gap < todos.length && creatingAt !== gap
      ? () => openAt(gap)
      : undefined;

  // One element, rendered at whichever gap `creatingAt` points to. Moving it
  // remounts it, which re-runs its autoFocus.
  const createForm = (
    <TodoCreateForm
      ref={formRef}
      value={title}
      onChange={setTitle}
      onSubmit={handleAddTodo}
      onCancel={onClose}
      boardId={column.board_id}
      skeleton={skeleton}
    />
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-surface border-hairline relative flex w-[288px] shrink-0 flex-col overflow-hidden border transition-colors duration-150",
        // **Height comes from the flex row, not from a pixel sum** (M17). It
        // used to be `max-h-[calc(100vh-220px)]`, which hard-coded the height
        // of every bar above the board — so the redesign that changed those
        // bars would have left every column silently mis-sized. `h-full` inside
        // a `min-h-0` parent gets the same cap from the layout that actually
        // knows it.
        //
        // Lanes stack down the page, so a per-column cap would give every lane
        // its own scrollbar. The board scrolls instead.
        lane ? "h-fit" : "h-fit max-h-full",
        transition
          ? "bg-status-blue/10 ring-status-blue ring-2 ring-inset"
          : "bg-surface",
      )}
    >
      {/* The category wash (M17). Absolutely positioned so it spans the header
          AND the first card's airspace — a gradient stopped at the header's
          bottom edge reads as a coloured rectangle no matter how soft its fade
          is. `pointer-events-none` keeps it out of the drag path entirely. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32",
          categoryOf(column.category).band,
        )}
      />

      {lane ? (
        <LaneColumnHeader
          headerTitle={headerTitle}
          category={column.category}
          count={todos.length}
        />
      ) : (
        <ColumnHeader
          column={column}
          headerTitle={headerTitle}
          count={todos.length}
          isDragSource={isDragSource}
          transition={transition}
          onCollapse={onCollapse}
          onAdd={canEditTodos ? () => openAt(todos.length) : undefined}
          onSetLimit={onSetLimit}
          onDelete={onDelete}
          onMoveLeft={onMoveLeft}
          onMoveRight={onMoveRight}
          canDelete={canDelete}
          dragHandleProps={dragHandleProps}
        />
      )}

      {/* TODO LIST */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-1"
      >
        {/* Scoped to the cards: a card that throws costs this column its list,
            not the header, the Create button, or the rest of the board. */}
        <ErrorBoundary>
          <div
            className={cn(
              "flex min-h-10 flex-col",
              // The `DropZone`s below are `h-2.5`, and they were carrying the
              // spacing between cards as a side effect of being drop targets —
              // so switching off dragging (a view sort, or swimlanes) took the
              // gaps with them and left the cards flush, borders touching. The
              // rhythm is the list's to own, not the drop targets': `gap-2.5`
              // is the same 10px, applied only when nothing else supplies it.
              dragDisabled && "gap-2.5",
            )}
          >
            {/* The gaps are both the drop targets and the hover-`+` create
                affordance. With dragging off they would draw lines for a drop
                that cannot happen, so they are not rendered at all — the Create
                button below still adds to the column. */}
            {!dragDisabled && (
              <DropZone
                columnId={id}
                index={0}
                active={isIndicatorHere && indicator.index === 0}
                afterId={todos[0]?.id}
                onAdd={addHandlerFor(0)}
              />
            )}

            {creatingAt === 0 && createForm}

            {todos.map((todo, index) => (
              <React.Fragment key={todo.id}>
                <TodoItem todo={todo} dragDisabled={dragDisabled} />

                {!dragDisabled && (
                  <DropZone
                    columnId={id}
                    index={index + 1}
                    active={isIndicatorHere && indicator.index === index + 1}
                    beforeId={todo.id}
                    afterId={todos[index + 1]?.id}
                    onAdd={addHandlerFor(index + 1)}
                  />
                )}

                {creatingAt === index + 1 && createForm}
              </React.Fragment>
            ))}
          </div>
        </ErrorBoundary>
      </div>

      {/* CREATE — no background of its own, so it follows the column's.
          A lane has none: a card created inside "Sara Kim / In progress" would
          have to inherit the lane's dimension as well as the column, and the
          ungrouped board is one click away. */}
      {!lane && canEditTodos && (
        <div className="relative shrink-0 px-2.5 pt-1 pb-2.5">
          <button
            type="button"
            onClick={() => openAt(todos.length)}
            className="text-ink-3 border-ink/[0.09] hover:border-brand/40 hover:bg-brand-soft hover:text-brand rounded-card flex h-10 w-full items-center justify-center gap-1.5 border border-dashed text-[13px] font-medium transition-colors"
          >
            <Plus size={15} />
            Create
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A lane's column header: what the column is and how many cards of this lane are
 * in it, and nothing else.
 *
 * Rename, limits, delete and reorder belong to the column, not to one lane's
 * slice of it — repeating them once per lane would offer the same action five
 * times and make it ambiguous which one it applied to.
 */
function LaneColumnHeader({
  headerTitle,
  category,
  count,
}: {
  headerTitle: string;
  category: string | null;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span
        className={cn("size-2 shrink-0 rounded-full", categoryOf(category).dot)}
      />
      <span className="text-ink-2 min-w-0 truncate text-xs font-semibold tracking-wide uppercase">
        {headerTitle}
      </span>
      <span className="bg-ink/10 text-ink-3 ml-auto shrink-0 rounded px-1.5 text-[11px] font-semibold">
        {count}
      </span>
    </div>
  );
}

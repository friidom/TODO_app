import { useDroppable } from "@dnd-kit/core";
import TodoItem from "../todo/TodoItem";

import type { IColumn, Todo } from "../../types/data";
import { Plus, InboxIcon } from "lucide-react";
import React, { useCallback, useState, useRef, useEffect } from "react";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { useSubtaskProgressByParent } from "@/services/todos/useSubtasks";
import DropZone from "./DropZone";
import TodoCreateForm, { type CreateDraft } from "./TodoCreateForm";
import ColumnHeader, { type TransitionPill } from "../columns/ColumnHeader";
import { categoryOf } from "@/constants/columns";
import { cn } from "@/utils/cn";
import EmptyState from "@/components/ui/EmptyState";
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
  isDragSource?: boolean;
  transition?: { from: TransitionPill; to: TransitionPill } | null;
  // view sort or swimlanes on — nothing can be picked up, so no drop indicators either
  dragDisabled?: boolean;
  // read from the board, not useDndContext per gap — keeps ~200 gaps out of the drag's render path
  dragging?: boolean;
  // false when todos is a filtered subset — an insert has no anchor to splice at, so it just appends
  exactOrder?: boolean;
  // one lane's slice of the column — no menu, no Create button, no height cap (those belong to the column as a whole)
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
  dragging = false,
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

  // one lookup per column, not per card
  const subtaskProgress = useSubtaskProgressByParent();

  const { canEditTodos } = usePermissions();

  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  const [skeleton, setSkeleton] = useState(false);
  const [title, setTitle] = useState("");

  const addTodoMutation = useAddTodo();
  const formRef = useRef<HTMLDivElement>(null);

  // stable identity so DropZone's memo holds across ~200 gaps
  const openAt = useCallback((gap: number) => {
    setCreatingAt(gap);
    setSkeleton(true);
  }, []);

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

      // due-date/assignee panels are portalled outside the form's DOM subtree — without this, picking a date closes the form
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
      // creatingAt counts visible cards; append when the list is filtered so the index can't be wrong
      index: exactOrder ? creatingAt : undefined,
      ...draft,
    });
    setTitle("");
    setSkeleton(false);
    setCreatingAt(creatingAt + 1);
  };
  const listRef = useRef<HTMLDivElement>(null);

  const isIndicatorHere = indicator?.columnId === id;

  const canAddAt = (gap: number) =>
    canEditTodos && exactOrder && gap < todos.length && creatingAt !== gap;

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
        // height comes from the flex row, not a hardcoded pixel sum, so it survives changes to the bars above the board
        lane ? "h-fit" : "h-fit max-h-full",
        transition
          ? "bg-status-blue/10 ring-status-blue ring-2 ring-inset"
          : "bg-surface",
      )}
    >
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

      <div
        ref={listRef}
        // overflow-x-hidden is load-bearing: overflow-y-auto alone leaves x at "visible", which
        // CSS then promotes to "auto" and the column gets a stray horizontal scrollbar
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pt-2 pb-1"
      >
        {/* a card that throws only costs this column its list, not the rest of the board */}
        <ErrorBoundary>
          <div
            className={cn(
              "flex min-h-10 flex-col",
              // DropZones normally carry the card spacing as a side effect of being h-2.5 — fall back to gap when they're not rendered
              dragDisabled && "gap-2.5",
            )}
          >
            {!dragDisabled && (
              <DropZone
                columnId={id}
                index={0}
                active={isIndicatorHere && indicator.index === 0}
                afterId={todos[0]?.id}
                dragging={dragging}
                canAdd={canAddAt(0)}
                onAdd={openAt}
              />
            )}

            {creatingAt === 0 && createForm}

            {todos.length === 0 && !dragging && creatingAt === null && (
              <EmptyState
                size="sm"
                icon={InboxIcon}
                title="Nothing here yet"
                className="text-ink-3"
              />
            )}

            {todos.map((todo, index) => (
              <React.Fragment key={todo.id}>
                <TodoItem
                  todo={todo}
                  dragDisabled={dragDisabled}
                  // primitives, not an object, so TodoContainer's memo isn't broken by a fresh {done,total} every render
                  subtaskDone={subtaskProgress.get(todo.id)?.done ?? 0}
                  subtaskTotal={subtaskProgress.get(todo.id)?.total ?? 0}
                />

                {!dragDisabled && (
                  <DropZone
                    columnId={id}
                    index={index + 1}
                    active={isIndicatorHere && indicator.index === index + 1}
                    beforeId={todo.id}
                    afterId={todos[index + 1]?.id}
                    dragging={dragging}
                    canAdd={canAddAt(index + 1)}
                    onAdd={openAt}
                  />
                )}

                {creatingAt === index + 1 && createForm}
              </React.Fragment>
            ))}
          </div>
        </ErrorBoundary>
      </div>

      {!lane && canEditTodos && (
        <div className="relative shrink-0 px-2.5 pt-1 pb-2.5">
          <button
            type="button"
            onClick={() => openAt(todos.length)}
            className="text-ink-3 border-ink/[0.09] hover:border-brand/40 hover:bg-brand-soft hover:text-brand rounded-card text-meta flex h-10 w-full items-center justify-center gap-1.5 border border-dashed font-medium transition-colors"
          >
            <Plus size={15} />
            Create
          </button>
        </div>
      )}
    </div>
  );
}

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
      <span className="bg-ink/10 text-ink-3 text-mini ml-auto shrink-0 rounded px-1.5 font-semibold">
        {count}
      </span>
    </div>
  );
}

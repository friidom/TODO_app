import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";

import TodoCard from "./TodoCard";
import AssigneeControl from "./TodoItem/AssigneeControl";
import TodoMenu from "./TodoItem/TodoMenu";
import { itemLabel } from "@/hooks/dragAnnouncements";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { toCardContent } from "@/services/todos/toCardContent";
import { useDoneFlash } from "@/stores/doneFlash";
import type { Todo, TodoViewState } from "@/types/data";
import { taskKey } from "@/utils/taskKey";

// card owns pixels, this owns the row/cache/drag registration — memoised, but the real fix is the memo boundary on DraggableTodo below
const TodoItem = memo(function TodoItem({
  todo,
  overlay = false,
  dragDisabled = false,
  subtaskDone = 0,
  subtaskTotal = 0,
}: { todo: Todo } & TodoViewState & SubtaskCounts) {
  // split so hooks are never called conditionally
  if (overlay) return <TodoContainer todo={todo} overlay />;

  return (
    <DraggableTodo
      todo={todo}
      dragDisabled={dragDisabled}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
    />
  );
});

// handed down, not looked up — a hook per card would be a fresh object every render and break the memo below
export interface SubtaskCounts {
  subtaskDone?: number;
  subtaskTotal?: number;
}

export default TodoItem;

function DraggableTodo({
  todo,
  dragDisabled,
  subtaskDone,
  subtaskTotal,
}: {
  todo: Todo;
  dragDisabled?: boolean;
} & SubtaskCounts) {
  const keyPrefix = useKeyPrefix();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: todo.id,
    data: { type: "todo", columnId: todo.column_id },
    disabled: dragDisabled,
  });

  // dnd-kit rebuilds `listeners` on most renders (measured: 1,224/1,643 during one drag), which broke the memo below.
  // pinning a stable wrapper here and forwarding through the ref is what stops every card re-rendering on a drag.
  const listenersRef = useRef(listeners);

  useEffect(() => {
    listenersRef.current = listeners;
  });

  const listenerKeys = listeners ? Object.keys(listeners).sort().join(",") : "";

  const stableListeners = useMemo(() => {
    const out: Record<string, (event: unknown) => void> = {};

    for (const key of listenerKeys ? listenerKeys.split(",") : []) {
      out[key] = (event) =>
        (
          listenersRef.current as
            Record<string, ((e: unknown) => void) | undefined> | undefined
        )?.[key]?.(event);
    }

    return out;
  }, [listenerKeys]);

  const handleProps = useMemo(
    () => ({
      ...attributes,
      ...stableListeners,
      // without this a screen reader reads the whole card body as the button's name
      "aria-label": itemLabel(taskKey(keyPrefix, todo.board_key), todo.title),
      "aria-roledescription": "card",
    }),
    [attributes, stableListeners, keyPrefix, todo.board_key, todo.title],
  );

  // no transform here — the card stays put, only the DragOverlay follows the cursor
  return (
    <TodoContainer
      todo={todo}
      dragging={isDragging}
      dragDisabled={dragDisabled}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
      setNodeRef={setNodeRef}
      handleProps={handleProps}
    />
  );
}

// the memo boundary sits here, below useDraggable — context updates bypass memo, so memoising higher up wouldn't stop a drag re-rendering every card
const TodoContainer = memo(function TodoContainer({
  todo,
  overlay = false,
  dragging = false,
  dragDisabled = false,
  subtaskDone = 0,
  subtaskTotal = 0,
  setNodeRef,
  handleProps,
}: { todo: Todo } & TodoViewState &
  SubtaskCounts & {
    setNodeRef?: (element: HTMLElement | null) => void;
    handleProps?: Record<string, unknown>;
  }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title ?? "");

  const patch = useTodoPatch(todo);

  const { canEditTodos } = usePermissions();
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  // only the real card celebrates, never the drag overlay's copy
  const celebrate = useDoneFlash(
    (state) => state.todoId === todo.id && !overlay && !dragging,
  );

  function save() {
    // empty reverts, unchanged is a no-op — both just close the editor
    if (draft.trim() === "" || draft === todo.title) {
      setDraft(todo.title ?? "");
      setEditing(false);
      return;
    }

    patch({ title: draft }, { onSuccess: () => setEditing(false) });
  }

  function cancel() {
    setDraft(todo.title ?? "");
    setEditing(false);
  }

  return (
    <TodoCard
      {...toCardContent(todo, keyPrefix)}
      draft={draft}
      editing={editing}
      canEdit={canEditTodos}
      celebrate={celebrate}
      overlay={overlay}
      dragging={dragging}
      dragDisabled={dragDisabled}
      onDraftChange={setDraft}
      onSave={save}
      onCancel={cancel}
      onStartEdit={() => setEditing(true)}
      onWorkTypeChange={(type) => patch({ type })}
      onPriorityChange={(priority) => patch({ priority })}
      onDueDateChange={(due_date) => patch({ due_date })}
      onEstimateChange={(estimate) => patch({ estimate })}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
      // opening the panel is a read, not gated on canEditTodos — just withheld on the overlay copy
      onOpen={overlay ? undefined : () => openTask(todo.id)}
      assignee={
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      }
      menu={<TodoMenu todo={todo} onEdit={() => setEditing(true)} />}
      setNodeRef={setNodeRef}
      handleProps={handleProps}
    />
  );
});

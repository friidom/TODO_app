import { useState } from "react";
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

/**
 * The container behind a card: state, writes and drag registration (M5-02).
 *
 * **Everything `TodoCard` used to own and should not have.** The card held its
 * own rename state and called `useUpdateTodo` directly, which is precisely
 * what `docs/FRONTEND.md` uses it as the counter-example of. The split is the
 * conventional one: this knows about the row, the cache and the board; the
 * card knows about pixels.
 *
 * It also owns the draggable. That is behaviour, not rendering, and keeping it
 * here is what lets `id` and `column_id` stay out of the card's props
 * entirely — the card receives a `setNodeRef` and some handle props and never
 * learns what they are for.
 *
 * The three things a card cannot supply for itself are built here and passed
 * down as rendered nodes: the assignee picker (which fetches the roster), the
 * action menu (which needs a complete `Todo`), and the write callbacks.
 */
export default function TodoItem({
  todo,
  overlay = false,
  dragDisabled = false,
}: { todo: Todo } & TodoViewState) {
  // Split so hooks are never called conditionally: the overlay copy is a plain
  // card with no drag registration, the one in the column is draggable.
  if (overlay) return <TodoContainer todo={todo} overlay />;

  return <DraggableTodo todo={todo} dragDisabled={dragDisabled} />;
}

function DraggableTodo({
  todo,
  dragDisabled,
}: {
  todo: Todo;
  dragDisabled?: boolean;
}) {
  const keyPrefix = useKeyPrefix();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: todo.id,
    data: { type: "todo", columnId: todo.column_id },
    // @dnd-kit's own switch, rather than withholding the listeners: a disabled
    // draggable is still registered, so nothing downstream has to cope with a
    // card that exists on the board but not in the drag context.
    disabled: dragDisabled,
  });

  // No transform is applied on purpose: the card stays exactly where it is and
  // only the DragOverlay follows the cursor.
  return (
    <TodoContainer
      todo={todo}
      dragging={isDragging}
      dragDisabled={dragDisabled}
      setNodeRef={setNodeRef}
      handleProps={{
        ...attributes,
        ...listeners,
        // M9-02. `attributes` already carries role, tabIndex and the
        // aria-describedby pointing at dnd-kit's instructions; what it cannot
        // know is what this particular card *is*. Without a label a screen
        // reader reads the card's whole contents — two chip labels, a title, a
        // date — as the name of a button.
        "aria-label": itemLabel(taskKey(keyPrefix, todo.board_key), todo.title),
        // Overrides dnd-kit's "draggable", which describes the mechanism
        // rather than the thing. "card" is the word the rest of the product
        // uses out loud.
        "aria-roledescription": "card",
      }}
    />
  );
}

function TodoContainer({
  todo,
  overlay = false,
  dragging = false,
  dragDisabled = false,
  setNodeRef,
  handleProps,
}: { todo: Todo } & TodoViewState & {
    setNodeRef?: (element: HTMLElement | null) => void;
    handleProps?: Record<string, unknown>;
  }) {
  const [editing, setEditing] = useState(false);
  // `todos.title` is nullable in the schema; the draft is always a string, so
  // a null card title starts the input empty rather than as `null`.
  const [draft, setDraft] = useState(todo.title ?? "");

  // board_id travels with every patch: updateTodo upserts, so it needs the
  // row's board to propose a valid row when the card's own INSERT has not
  // landed yet. `useTodoPatch` is the single `updateTodo` call site.
  const patch = useTodoPatch(todo);

  const { canEditTodos } = usePermissions();
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  // Only the real card rings — never the drag overlay's copy of it.
  const celebrate = useDoneFlash(
    (state) => state.todoId === todo.id && !overlay && !dragging,
  );

  function save() {
    // Empty reverts and an unchanged title is not a write: both close the
    // editor without touching the row.
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
      // Not gated on canEditTodos: opening the panel is a read, and the menu
      // that used to be the only way in is editor-only. Withheld on the drag
      // overlay, which is a picture of a card rather than one.
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
}

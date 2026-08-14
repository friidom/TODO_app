import { useState } from "react";
import { X } from "lucide-react";

import AssigneeControl from "./TodoItem/AssigneeControl";
import DueDateControl from "./TodoItem/DueDateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import {
  descriptionChanged,
  descriptionValue,
  titleValue,
} from "@/services/todos/taskDraft";
import { useTodo } from "@/services/todos/useTodo";
import type { TodoRow } from "@/types/data";
import { cn } from "@/utils/cn";

/**
 * One work item, in a right-side panel over the board (M5-06).
 *
 * **A panel, not a page**, and `useOpenTask` records why at length: the board
 * stays mounted behind it, so opening a task costs no refetch and loses no
 * filter, sort, grouping, scroll position or collapsed column. `?task=<id>`
 * makes it addressable anyway — refresh, share and back all work.
 *
 * Every property control is the one the card and the list already use, wired
 * to the same `useTodoPatch`. The panel adds exactly one field the rest of the
 * app has nowhere to show: `description`.
 */
export default function TaskDetailPanel({ boardId }: { boardId: string }) {
  const { taskId, closeTask } = useOpenTask();

  // Keyed by task, so switching tasks remounts and the description draft
  // cannot leak from one item to the next.
  if (!taskId) return null;

  return (
    <Panel key={taskId} taskId={taskId} boardId={boardId} onClose={closeTask} />
  );
}

function Panel({
  taskId,
  boardId,
  onClose,
}: {
  taskId: string;
  boardId: string;
  onClose: () => void;
}) {
  const { data: todo, isPending, error } = useTodo(taskId, boardId);

  return (
    <aside
      role="complementary"
      aria-label="Task details"
      className="border-hairline bg-card flex w-full shrink-0 flex-col overflow-hidden border-l sm:w-[420px]"
    >
      {isPending ? (
        <div className="space-y-3 p-5" aria-busy>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <Empty
          onClose={onClose}
          title="Could not load this task"
          body="Something went wrong fetching it. Close the panel and try again."
        />
      ) : !todo ? (
        // Null covers a deleted task and one belonging to another board, and
        // deliberately does not distinguish them — `fetchTodo` scopes by board,
        // so a pasted id cannot be probed for existence from here.
        <Empty
          onClose={onClose}
          title="Task not found"
          body="This task no longer exists, or it belongs to a different board."
        />
      ) : (
        <Body todo={todo} onClose={onClose} />
      )}
    </aside>
  );
}

function Body({ todo, onClose }: { todo: TodoRow; onClose: () => void }) {
  const patch = useTodoPatch(todo);
  const { canEditTodos } = usePermissions();

  const [title, setTitle] = useState(todo.title ?? "");
  const [description, setDescription] = useState(todo.description ?? "");

  // What is on screen but not yet stored. Both fields save on blur, so this is
  // only ever true mid-edit — which is exactly when closing would lose work.
  const dirty =
    titleValue(title, todo.title) !== null ||
    descriptionChanged(description, todo.description);

  const [confirmingClose, setConfirmingClose] = useState(false);

  // No effect syncing these drafts back from the server, deliberately. `Panel`
  // is keyed by task id, so switching tasks remounts and the initial state is
  // always this task's. The only case a sync would serve is the row changing
  // underneath an open panel — a rename from the card behind it, or another
  // client — and that is M6's to solve once for every surface rather than this
  // component's to guess at now.

  function requestClose() {
    if (dirty) {
      setConfirmingClose(true);
      return;
    }

    onClose();
  }

  function saveTitle() {
    const next = titleValue(title, todo.title);

    // Null means nothing to write — either unchanged, or blanked, which
    // reverts rather than clearing.
    if (next === null) {
      setTitle(todo.title ?? "");
      return;
    }

    patch({ title: next });
  }

  function saveDescription() {
    if (!descriptionChanged(description, todo.description)) return;

    patch({ description: descriptionValue(description) });
  }

  return (
    <>
      <header className="border-hairline flex items-center gap-2 border-b px-4 py-3">
        {todo.board_key !== null && (
          <span className="bg-ink/10 text-ink-2 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold">
            KAN-{todo.board_key}
          </span>
        )}

        <span className="ml-auto" />

        <button
          type="button"
          onClick={requestClose}
          aria-label="Close task details"
          className="text-ink-2 hover:bg-ink/10 hover:text-ink shrink-0 rounded p-1"
        >
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <textarea
          value={title}
          readOnly={!canEditTodos}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          rows={2}
          aria-label="Title"
          className={cn(
            "text-ink mb-5 w-full resize-none rounded-md bg-transparent px-2 py-1 text-lg font-semibold outline-none",
            canEditTodos && "hover:bg-ink/5 focus:ring-brand focus:ring-2",
          )}
        />

        {/* Inert for a viewer, exactly as the list row's cells are. The two
            textareas are `readOnly`, but these five are popover triggers —
            without this a viewer could open the status menu, pick a column and
            watch the write silently fail. Panel and list must agree about what
            read-only looks like. */}
        <dl
          className={cn(
            "mb-6 grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-2.5",
            !canEditTodos && "pointer-events-none",
          )}
        >
          <Field label="Status">
            <StatusControl todoId={todo.id} columnId={todo.column_id} />
          </Field>

          <Field label="Work type">
            <WorkTypeControl
              value={todo.type}
              onChange={(type) => patch({ type })}
              showLabel
            />
          </Field>

          <Field label="Priority">
            <PriorityControl
              value={todo.priority}
              onChange={(priority) => patch({ priority })}
              showLabel
            />
          </Field>

          <Field label="Due date">
            <DueDateControl
              value={todo.due_date}
              onChange={(due_date) => patch({ due_date })}
              alwaysVisible
            />
          </Field>

          <Field label="Assignee">
            <AssigneeControl
              boardId={todo.board_id}
              value={todo.assignee_id}
              onChange={(assignee_id) => patch({ assignee_id })}
              alwaysVisible
            />
          </Field>
        </dl>

        <h3 className="text-ink mb-1.5 text-sm font-semibold">Description</h3>

        <textarea
          value={description}
          readOnly={!canEditTodos}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={10}
          placeholder={canEditTodos ? "Add a description…" : "No description."}
          className={cn(
            "border-hairline text-ink placeholder:text-ink-3 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none",
            canEditTodos && "focus:border-brand focus:ring-brand focus:ring-1",
          )}
        />
      </div>

      {confirmingClose && (
        <div className="border-hairline bg-elevated border-t px-4 py-3">
          <p className="text-ink mb-2 text-sm">
            Close with unsaved changes? They will be lost.
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingClose(false)}
              className="text-ink hover:bg-ink/10 rounded-md px-3 py-1.5 text-sm"
            >
              Keep editing
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-status-red hover:bg-status-red/85 rounded-md px-3 py-1.5 text-sm font-medium text-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** One property row: its name, and the control that sets it. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-3 text-xs">{label}</dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </>
  );
}

/** The panel's two dead ends: a task that cannot load, and one that is gone. */
function Empty({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-ink text-sm font-semibold">{title}</p>
      <p className="text-ink-3 text-xs leading-relaxed">{body}</p>

      <button
        type="button"
        onClick={onClose}
        className="text-brand hover:bg-brand-soft mt-2 rounded px-2 py-1 text-xs font-medium"
      >
        Close
      </button>
    </div>
  );
}

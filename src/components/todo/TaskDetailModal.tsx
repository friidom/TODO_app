import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import ActivitySection from "./ActivitySection";
import AttachmentsSection from "./AttachmentsSection";
import EpicTasksSection from "./EpicTasksSection";
import ParentLine from "./ParentLine";
import SubtasksSection from "./SubtasksSection";
import AssigneeControl from "./TodoItem/AssigneeControl";
import DueDateControl from "./TodoItem/DueDateControl";
import EpicParentControl from "./TodoItem/EpicParentControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import SprintControl from "./TodoItem/SprintControl";
import StartDateControl from "./TodoItem/StartDateControl";
import StatusControl from "./TodoItem/StatusControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import {
  descriptionChanged,
  descriptionValue,
  titleValue,
} from "@/services/todos/taskDraft";
import { useTodo } from "@/services/todos/useTodo";
import { useTodoHierarchy } from "@/services/todos/useSubtasks";
import { useSprints } from "@/services/sprints/useSprints";
import type { TodoRow } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

const EXIT_MS = 150;

// Centered modal, not a drawer — a drawer permanently squeezes the board for a surface open only part of the time.
export default function TaskDetailModal({ boardId }: { boardId: string }) {
  const { taskId, closeTask } = useOpenTask();

  const shown = useClosingValue(taskId, EXIT_MS);

  if (!shown) return null;

  return (
    // Keyed by task so switching tasks remounts and drafts don't leak between items.
    <Overlay
      key={shown}
      taskId={shown}
      boardId={boardId}
      leaving={!taskId}
      onClose={closeTask}
    />
  );
}

// Keeps the last truthy value for `ms` so an exit animation has something to render while unmounting.
function useClosingValue<T>(value: T | undefined, ms: number) {
  const [held, setHeld] = useState(value);

  // Derived state, adjusted during render rather than an effect (avoids the double-render).
  if (value && value !== held) setHeld(value);

  useEffect(() => {
    if (value) return;

    const id = setTimeout(() => setHeld(undefined), ms);

    return () => clearTimeout(id);
  }, [value, ms]);

  return value ?? held;
}

function Overlay({
  taskId,
  boardId,
  leaving,
  onClose,
}: {
  taskId: string;
  boardId: string;
  leaving: boolean;
  onClose: () => void;
}) {
  const { data: todo, isPending, error } = useTodo(taskId, boardId);

  // Ref, not a prop — only Body knows if a draft is unsaved, and it rebinds this every render.
  const requestCloseRef = useRef(onClose);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      // Deferred to whatever's on top — a nested popover marks the event so it closes without taking the task with it.
      if (event.key === "Escape" && !event.defaultPrevented) {
        requestCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div
      // onMouseDown, not onClick — a text selection dragged past the panel edge shouldn't dismiss.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestCloseRef.current();
      }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6",
        leaving
          ? "animate-out fade-out-0 fill-mode-forwards duration-150"
          : "animate-in fade-in-0 duration-200",
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className={cn(
          "border-hairline bg-canvas rounded-surface shadow-e3 flex h-[min(46rem,100%)] w-[min(1100px,100%)] flex-col overflow-hidden border",
          leaving
            ? "animate-out fade-out-0 slide-out-to-bottom-1 fill-mode-forwards duration-150"
            : "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
        )}
      >
        {isPending ? (
          <Loading onClose={onClose} />
        ) : error ? (
          <Dead
            onClose={onClose}
            title="Could not load this task"
            body="Something went wrong fetching it. Close this and try again."
          />
        ) : !todo ? (
          // Deliberately doesn't distinguish "deleted" from "wrong board" — fetchTodo is board-scoped.
          <Dead
            onClose={onClose}
            title="Task not found"
            body="This task no longer exists, or it belongs to a different board."
          />
        ) : (
          <Body todo={todo} onClose={onClose} bindCloseRef={requestCloseRef} />
        )}
      </div>
    </div>
  );
}

function Body({
  todo,
  onClose,
  bindCloseRef,
}: {
  todo: TodoRow;
  onClose: () => void;
  bindCloseRef: React.RefObject<() => void>;
}) {
  const patch = useTodoPatch(todo);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), todo.board_key);

  const hierarchy = useTodoHierarchy(todo);

  const { data: sprints = [] } = useSprints();

  const [title, setTitle] = useState(todo.title ?? "");
  const [description, setDescription] = useState(todo.description ?? "");

  // True only mid-edit, since both fields save on blur — which is exactly when closing would lose work.
  const dirty =
    titleValue(title, todo.title) !== null ||
    descriptionChanged(description, todo.description);

  const [confirmingClose, setConfirmingClose] = useState(false);

  function requestClose() {
    if (dirty) {
      setConfirmingClose(true);
      return;
    }

    onClose();
  }

  // No dependency array — requestClose closes over dirty, which changes on every keystroke.
  useEffect(() => {
    bindCloseRef.current = requestClose;
  });

  function saveTitle() {
    const next = titleValue(title, todo.title);

    // Null: unchanged, or blanked — reverts rather than clearing.
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

  const created = relativeTime(todo.created_at);
  const updated = relativeTime(todo.updated_at);

  return (
    <>
      <Header keyLabel={key} onClose={requestClose} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="min-w-0 flex-1 px-5 py-5 md:overflow-y-auto md:px-6">
          {/* Renders nothing for a top-level card, which is most of them. */}
          <ParentLine parentId={todo.parent_id} boardId={todo.board_id} />

          <textarea
            value={title}
            readOnly={!canEditTodos}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            rows={1}
            aria-label="Title"
            className={cn(
              "text-ink -mx-2 mb-6 field-sizing-content w-[calc(100%+1rem)] resize-none rounded-md bg-transparent px-2 py-1 text-xl leading-snug font-semibold tracking-tight outline-none",
              canEditTodos && "hover:bg-ink/5 focus:ring-brand focus:ring-2",
            )}
          />

          <h3 className="text-ink-3 text-mini mb-2 font-semibold tracking-[0.08em] uppercase">
            Description
          </h3>

          <textarea
            value={description}
            readOnly={!canEditTodos}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            rows={12}
            placeholder={
              canEditTodos ? "Add a description…" : "No description."
            }
            className={cn(
              "border-hairline text-ink placeholder:text-ink-3 rounded-card h-36 w-full resize-y border bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none md:h-auto",
              canEditTodos &&
                "focus:border-brand/60 focus:ring-brand/25 focus:ring-2",
            )}
          />

          {/* Attachments are content, not Activity (comments/history) — filed as its own section, not a fifth tab. */}
          <AttachmentsSection todoId={todo.id} />

          {/* A genuine Subtask (leaf of the hierarchy) renders neither of these. */}
          {hierarchy.canHaveSubtasks && <SubtasksSection todo={todo} />}

          {hierarchy.isEpic && <EpicTasksSection epic={todo} />}

          <ActivitySection todoId={todo.id} boardId={todo.board_id} />
        </div>

        {/* pointer-events-none for a viewer — these controls are popover triggers, not readOnly like the textareas. */}
        <aside
          className={cn(
            "border-hairline bg-surface/40 shrink-0 border-t p-5 md:w-[19rem] md:overflow-y-auto md:border-t-0 md:border-l",
            !canEditTodos && "pointer-events-none",
          )}
        >
          <div className="mb-4 flex">
            <StatusControl todoId={todo.id} columnId={todo.column_id} />
          </div>

          <div className="border-hairline rounded-card border">
            <h3 className="text-ink-3 border-hairline text-mini border-b px-3.5 py-2 font-semibold tracking-[0.08em] uppercase">
              Details
            </h3>

            <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-3 px-3.5 py-3.5">
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
                  alwaysVisible
                />
              </Field>

              <Field label="Story points">
                <EstimateControl
                  value={todo.estimate}
                  onChange={(estimate) => patch({ estimate })}
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

              {hierarchy.canPickEpicParent && (
                <Field label="Parent">
                  <EpicParentControl
                    value={todo.parent_id}
                    onChange={(epicId) => patch({ parent_id: epicId })}
                  />
                </Field>
              )}

              {/* A genuine Subtask has no sprint of its own — it inherits its parent Task's. */}
              {!hierarchy.isGenuineSubtask && (
                <Field label="Sprint">
                  <SprintControl
                    value={todo.sprint_id}
                    sprints={sprints}
                    onChange={(sprintId) => patch({ sprint_id: sprintId })}
                  />
                </Field>
              )}

              {/* Each end is bounded by the other, so the range can't be inverted. */}
              <Field label="Start date">
                <StartDateControl
                  value={todo.start_date}
                  onChange={(start_date) => patch({ start_date })}
                  notAfter={todo.due_date}
                  alwaysVisible
                />
              </Field>

              <Field label="Due date">
                <DueDateControl
                  value={todo.due_date}
                  onChange={(due_date) => patch({ due_date })}
                  notBefore={todo.start_date}
                  alwaysVisible
                />
              </Field>
            </dl>
          </div>

          {(created || updated) && (
            <p className="text-ink-3/80 text-mini mt-3 px-0.5 leading-relaxed">
              {created && <span className="block">Created {created}</span>}
              {updated && <span className="block">Updated {updated}</span>}
            </p>
          )}
        </aside>
      </div>

      {confirmingClose && (
        <div className="border-hairline bg-elevated flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <p className="text-ink mr-auto text-sm">
            Close with unsaved changes? They will be lost.
          </p>

          <button
            type="button"
            onClick={() => setConfirmingClose(false)}
            className="text-ink hover:bg-ink/10 rounded-control focus-visible:ring-brand px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2"
          >
            Keep editing
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-status-red hover:bg-status-red/85 rounded-control focus-visible:ring-status-red px-3 py-1.5 text-sm font-medium text-white transition-colors outline-none focus-visible:ring-2"
          >
            Discard
          </button>
        </div>
      )}
    </>
  );
}

function Header({
  keyLabel,
  onClose,
}: {
  keyLabel: string | null;
  onClose: () => void;
}) {
  return (
    <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-4 md:px-5">
      {keyLabel !== null ? (
        <span className="text-ink-3 text-xs font-semibold tabular-nums">
          {keyLabel}
        </span>
      ) : (
        // Absent means the create is still in flight — the server allocates the key.
        <span className="text-ink-3/50 text-xs">—</span>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Close task details"
        className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand rounded-control coarse:size-9 ml-auto grid size-7 shrink-0 place-items-center transition-colors outline-none focus-visible:ring-2"
      >
        <X size={16} />
      </button>
    </header>
  );
}

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

function Loading({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row" aria-busy>
        <div className="min-w-0 flex-1 space-y-4 px-5 py-5 md:px-6">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>

        <div className="border-hairline bg-surface/40 shrink-0 space-y-3 border-t p-5 md:w-[19rem] md:border-t-0 md:border-l">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    </>
  );
}

function Dead({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-ink text-sm font-semibold">{title}</p>
        <p className="text-ink-3 max-w-sm text-xs leading-relaxed">{body}</p>

        <button
          type="button"
          onClick={onClose}
          className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control mt-2 px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
        >
          Close
        </button>
      </div>
    </>
  );
}

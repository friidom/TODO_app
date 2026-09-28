import { useEffect, useRef, useState, type ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  CircleAlertIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import ActivitySection from "./ActivitySection";
import AttachmentsSection from "./AttachmentsSection";
import EpicTasksSection from "./EpicTasksSection";
import ParentLine from "./ParentLine";
import SectionHeader from "./SectionHeader";
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
import { useCardPopover } from "./TodoItem/useCardPopover";
import { SECTION_TITLE, TEXT_FIELD } from "./detailChrome";
import IconButton from "@/components/ui/IconButton";
import { MENU_ITEM_DANGER, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { DIALOG_CANCEL, DIALOG_DANGER } from "@/components/ui/dialogChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { workTypeOf } from "@/constants/workTypes";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import {
  descriptionChanged,
  descriptionValue,
  titleValue,
} from "@/services/todos/taskDraft";
import { useDeleteTodo } from "@/services/todos/useDeleteTodo";
import { useTodo } from "@/services/todos/useTodo";
import { useTodoHierarchy } from "@/services/todos/useSubtasks";
import { useSprints } from "@/services/sprints/useSprints";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import type { TodoDetail } from "@/types/data";
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

  const requestClose = () => requestCloseRef.current();

  return (
    <div
      // onMouseDown, not onClick — a text selection dragged past the panel edge shouldn't dismiss.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
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
          "border-hairline bg-surface rounded-surface shadow-e3 flex h-[min(46rem,100%)] w-[min(1100px,100%)] flex-col overflow-hidden border",
          leaving
            ? "animate-out fade-out-0 slide-out-to-bottom-1 fill-mode-forwards duration-150"
            : "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
        )}
      >
        {isPending ? (
          <Loading onClose={requestClose} />
        ) : error ? (
          <Dead
            onClose={requestClose}
            title="Could not load this task"
            body="Something went wrong fetching it. Close this and try again."
          />
        ) : !todo ? (
          // Deliberately doesn't distinguish "deleted" from "wrong board" — fetchTodo is board-scoped.
          <Dead
            onClose={requestClose}
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
  todo: TodoDetail;
  onClose: () => void;
  bindCloseRef: React.RefObject<() => void>;
}) {
  const patch = useTodoPatch(todo);
  const deleteTodo = useDeleteTodo();
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), todo.board_key);

  const hierarchy = useTodoHierarchy(todo);

  const { data: sprints = [] } = useSprints();
  const sprintsEnabled = useSprintsEnabled();

  const [title, setTitle] = useState(todo.title ?? "");
  const [description, setDescription] = useState(todo.description ?? "");

  // True only mid-edit, since both fields save on blur — which is exactly when closing would lose work.
  const dirty =
    titleValue(title, todo.title) !== null ||
    descriptionChanged(description, todo.description);

  const [confirming, setConfirming] = useState<"close" | "delete" | null>(null);

  function requestClose() {
    if (dirty) {
      setConfirming("close");
      return;
    }

    onClose();
  }

  // No dependency array — requestClose closes over dirty, which changes on every keystroke.
  useEffect(() => {
    bindCloseRef.current = requestClose;

    // Unmounting (the task was deleted or failed to load) must not leave the ref on a dead Body's guard.
    return () => {
      bindCloseRef.current = onClose;
    };
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

  function confirmDelete() {
    deleteTodo.mutate(todo.id);
    setConfirming(null);
    requestClose();
  }

  const created = relativeTime(todo.created_at);
  const updated = relativeTime(todo.updated_at);

  return (
    <>
      <Header
        keyLabel={key}
        type={todo.type}
        breadcrumb={
          <ParentLine parentId={todo.parent_id} boardId={todo.board_id} />
        }
        actions={
          canEditTodos && (
            <MoreActions onDelete={() => setConfirming("delete")} />
          )
        }
        onClose={requestClose}
      />

      {confirming === "delete" && (
        <ConfirmBar
          tone="danger"
          message={`Delete ${key ?? "this task"}? It is removed for everyone and cannot be restored.`}
          onCancel={() => setConfirming(null)}
        >
          <button
            type="button"
            autoFocus
            onClick={() => setConfirming(null)}
            className={cn(DIALOG_CANCEL, "h-8 px-3")}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            className={cn(DIALOG_DANGER, "h-8 px-3")}
          >
            Delete task
          </button>
        </ConfirmBar>
      )}

      {confirming === "close" && (
        <ConfirmBar
          message="Close with unsaved changes? They will be lost."
          onCancel={() => setConfirming(null)}
        >
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className={cn(DIALOG_CANCEL, "h-8 px-3")}
          >
            Keep editing
          </button>

          <button
            type="button"
            onClick={onClose}
            className={cn(DIALOG_DANGER, "h-8 px-3")}
          >
            Discard
          </button>
        </ConfirmBar>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="min-w-0 flex-1 space-y-8 px-5 py-6 md:overflow-y-auto md:px-7">
          <div>
            <textarea
              value={title}
              readOnly={!canEditTodos}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              rows={1}
              aria-label="Title"
              className={cn(
                "text-ink rounded-control -mx-2 field-sizing-content w-[calc(100%+1rem)] resize-none bg-transparent px-2 py-1 text-xl leading-snug font-semibold tracking-tight transition-colors duration-150 outline-none",
                canEditTodos &&
                  "hover:bg-wash-strong focus:ring-brand focus:bg-transparent focus:ring-2",
              )}
            />

            <div className="mt-5">
              <SectionHeader title="Description" />

              <textarea
                value={description}
                readOnly={!canEditTodos}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                rows={5}
                placeholder={
                  canEditTodos ? "Add a description…" : "No description."
                }
                aria-label="Description"
                className={cn(
                  TEXT_FIELD,
                  "rounded-card block field-sizing-content max-h-[28rem] min-h-24 w-full resize-y px-3 py-2.5 text-sm leading-relaxed",
                  !canEditTodos && "focus:border-hairline focus:ring-0",
                )}
              />
            </div>
          </div>

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
            "border-hairline bg-canvas/50 shrink-0 space-y-5 border-t p-5 md:w-[20rem] md:overflow-y-auto md:border-t-0 md:border-l",
            !canEditTodos && "pointer-events-none",
          )}
        >
          <div>
            <p className={cn(SECTION_TITLE, "mb-2")}>Status</p>

            <StatusControl
              todoId={todo.id}
              statusId={todo.status_id}
              variant="field"
            />
          </div>

          <section className="border-hairline bg-surface rounded-card border">
            <h3
              className={cn(
                SECTION_TITLE,
                "border-hairline border-b px-3.5 py-2.5",
              )}
            >
              Details
            </h3>

            <dl className="px-3.5 py-1.5">
              <Field label="Assignee">
                <AssigneeControl
                  boardId={todo.board_id}
                  value={todo.assignee_id}
                  onChange={(assignee_id) => patch({ assignee_id })}
                  alwaysVisible
                  showName
                />
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
                  alwaysVisible
                />
              </Field>

              <Field label="Story points">
                <EstimateControl
                  value={todo.estimate}
                  onChange={(estimate) => patch({ estimate })}
                  alwaysVisible
                  showLabel
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

              {/* A genuine Subtask has no sprint of its own — it inherits its parent Task's.
                  The field also goes with the Sprints feature (0020); the stored
                  sprint_id is left alone so turning it back on restores it. */}
              {sprintsEnabled && !hierarchy.isGenuineSubtask && (
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
                  showLabel
                />
              </Field>

              <Field label="Due date">
                <DueDateControl
                  value={todo.due_date}
                  onChange={(due_date) => patch({ due_date })}
                  notBefore={todo.start_date}
                  alwaysVisible
                  showLabel
                />
              </Field>
            </dl>
          </section>

          {(created || updated) && (
            <p className="text-ink-3 text-mini px-0.5 leading-relaxed">
              {created && <span className="block">Created {created}</span>}
              {updated && <span className="block">Updated {updated}</span>}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function Header({
  keyLabel,
  type,
  breadcrumb,
  actions,
  onClose,
}: {
  keyLabel: string | null;
  type?: string | null;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const workType = type === undefined ? null : workTypeOf(type);
  const TypeIcon = workType?.icon;

  return (
    <header className="border-hairline flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {breadcrumb}

        {TypeIcon && (
          <TypeIcon className={cn("size-4 shrink-0", workType?.tone)} />
        )}

        {keyLabel !== null ? (
          <span className="text-ink-2 text-meta shrink-0 font-medium tabular-nums">
            {keyLabel}
          </span>
        ) : (
          // Absent means the create is still in flight — the server allocates the key.
          <span className="text-ink-3/50 text-meta">—</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {actions}

        <IconButton label="Close task details" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
    </header>
  );
}

function MoreActions({ onDelete }: { onDelete: () => void }) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  return (
    <>
      <IconButton label="More actions" aria-haspopup="menu" {...triggerProps}>
        <MoreHorizontalIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Task actions"
            className={cn(POPOVER_PANEL, "z-50 w-48")}
          >
            <button
              type="button"
              role="menuitem"
              // Portalled to the end of body, so Tab from the trigger would never reach it.
              autoFocus
              onClick={() => {
                close();
                onDelete();
              }}
              className={MENU_ITEM_DANGER}
            >
              <Trash2Icon />
              Delete task
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// Inline, never a dialog over the task — a nested dialog's Escape would reach the task's listener too.
function ConfirmBar({
  tone = "neutral",
  message,
  onCancel,
  children,
}: {
  tone?: "neutral" | "danger";
  message: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        onCancel();
      }}
      className={cn(
        "border-hairline flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2.5",
        tone === "danger" ? "bg-status-red/[0.06]" : "bg-elevated",
      )}
    >
      {tone === "danger" ? (
        <Trash2Icon className="text-status-red size-4 shrink-0" />
      ) : (
        <CircleAlertIcon className="text-status-orange size-4 shrink-0" />
      )}

      <p className="text-ink text-meta mr-auto min-w-0">{message}</p>

      {children}
    </div>
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
    <div className="grid min-h-9 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-2">
      <dt className="text-ink-3 text-meta truncate">{label}</dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </div>
  );
}

function Loading({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row" aria-busy>
        <div className="min-w-0 flex-1 space-y-5 px-5 py-6 md:px-7">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>

        <div className="border-hairline bg-canvas/50 shrink-0 space-y-5 border-t p-5 md:w-[20rem] md:border-t-0 md:border-l">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-72 w-full" />
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
        <p className="text-ink-3 text-meta max-w-sm leading-relaxed">{body}</p>

        <button
          type="button"
          onClick={onClose}
          className={cn(DIALOG_CANCEL, "mt-2 h-8 px-3")}
        >
          Close
        </button>
      </div>
    </>
  );
}

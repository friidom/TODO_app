import { useTranslation } from "react-i18next";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  LinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import ActivitySection from "./ActivitySection";
import AttachmentsSection from "./AttachmentsSection";
import DetailCard from "./DetailCard";
import DevelopmentActions from "./DevelopmentActions";
import DevelopmentSection from "./DevelopmentSection";
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
import { TEXT_FIELD } from "./detailChrome";
import IconButton from "@/components/ui/IconButton";
import {
  ICON_BUTTON,
  MENU_ITEM_DANGER,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { DIALOG_CANCEL, DIALOG_DANGER } from "@/components/ui/dialogChrome";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  useTodoHierarchy,
  type TodoHierarchy,
} from "@/services/todos/useSubtasks";
import { useSprints } from "@/services/sprints/useSprints";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { toast } from "@/stores/toasts";
import { useTaskLayout } from "@/stores/taskLayout";
import type { TodoDetail } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

const EXIT_MS = 150;

type TaskVariant = "modal" | "panel";

type Patch = ReturnType<typeof useTodoPatch>;

// Centered modal by default — a drawer permanently squeezes the board for a surface open only part of the time.
// TaskPanel below is the opt-in alternative for people who want the board beside the task.
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

// Rendered through ViewShell's drawer slot, not through Drawer: Drawer closes on Escape without asking, which would
// route around the unsaved-edit guard (the M17 regression).
export function TaskPanel({ boardId }: { boardId: string }) {
  const { taskId, closeTask } = useOpenTask();

  if (!taskId) return null;

  return <PanelShell taskId={taskId} boardId={boardId} onClose={closeTask} />;
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

// Escape and the unsaved-edit guard, shared by the dialog and the side panel. A ref, not a prop — only Body knows if a
// draft is unsaved, and it rebinds this every render.
function useGuardedClose(
  onClose: () => void,
  scope?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      // Deferred to whatever's on top — a nested popover marks the event so it closes without taking the task with it.
      if (event.key !== "Escape" || event.defaultPrevented) return;

      // The panel sits beside a live board, and the board's own text fields (create card, rename column, search) do not
      // mark Escape as handled — without this, cancelling one of them would close the task.
      if (
        scope &&
        event.target instanceof Element &&
        !scope.current?.contains(event.target) &&
        event.target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }

      closeRef.current();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [scope]);

  return closeRef;
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
  const { t } = useTranslation();
  const closeRef = useGuardedClose(onClose);

  const requestClose = () => closeRef.current();

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
        aria-label={t("task.details")}
        className={cn(
          "border-hairline bg-surface rounded-surface shadow-e3 flex h-[min(46rem,100%)] w-[min(1100px,100%)] flex-col overflow-hidden border",
          leaving
            ? "animate-out fade-out-0 slide-out-to-bottom-1 fill-mode-forwards duration-150"
            : "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
        )}
      >
        <TaskContent
          taskId={taskId}
          boardId={boardId}
          onClose={onClose}
          closeRef={closeRef}
          variant="modal"
        />
      </div>
    </div>
  );
}

// Below xl there is no room to sit beside the board, so it overlays it with a scrim, as Drawer does.
function PanelShell({
  taskId,
  boardId,
  onClose,
}: {
  taskId: string;
  boardId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useGuardedClose(onClose, panel);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <div
        aria-hidden
        onMouseDown={() => closeRef.current()}
        className="fixed inset-0 z-40 bg-black/40 xl:hidden"
      />

      <aside
        ref={panel}
        tabIndex={-1}
        aria-label={t("task.details")}
        className="border-hairline bg-surface animate-in fade-in-0 slide-in-from-right-4 shadow-e3 fixed inset-y-0 right-0 z-50 flex w-[min(28rem,100vw)] shrink-0 flex-col border-l duration-200 outline-none xl:static xl:z-auto xl:shadow-none"
      >
        {/* Keyed by task, so the aside itself stays put when switching tasks and only its content remounts. */}
        <TaskContent
          key={taskId}
          taskId={taskId}
          boardId={boardId}
          onClose={onClose}
          closeRef={closeRef}
          variant="panel"
        />
      </aside>
    </>
  );
}

function TaskContent({
  taskId,
  boardId,
  onClose,
  closeRef,
  variant,
}: {
  taskId: string;
  boardId: string;
  onClose: () => void;
  closeRef: RefObject<() => void>;
  variant: TaskVariant;
}) {
  const { t } = useTranslation();
  const { data: todo, isPending, error } = useTodo(taskId, boardId);

  const requestClose = () => closeRef.current();

  if (isPending) return <Loading onClose={requestClose} variant={variant} />;

  if (error) {
    return (
      <Dead
        onClose={requestClose}
        title={t("task.loadFailed")}
        body={t("task.loadFailedHint")}
      />
    );
  }

  // Deliberately doesn't distinguish "deleted" from "wrong board" — fetchTodo is board-scoped.
  if (!todo) {
    return (
      <Dead
        onClose={requestClose}
        title={t("task.notFound")}
        body={t("task.notFoundHint")}
      />
    );
  }

  return (
    <Body
      todo={todo}
      onClose={onClose}
      bindCloseRef={closeRef}
      variant={variant}
    />
  );
}

function Body({
  todo,
  onClose,
  bindCloseRef,
  variant,
}: {
  todo: TodoDetail;
  onClose: () => void;
  bindCloseRef: RefObject<() => void>;
  variant: TaskVariant;
}) {
  const { t } = useTranslation();
  const patch = useTodoPatch(todo);
  const deleteTodo = useDeleteTodo();
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), todo.board_key);

  const hierarchy = useTodoHierarchy(todo);

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

  const panel = variant === "panel";

  const titleField = (
    <textarea
      value={title}
      readOnly={!canEditTodos}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={saveTitle}
      rows={1}
      aria-label={t("fields.title")}
      className={cn(
        "text-ink rounded-control -mx-2 field-sizing-content w-[calc(100%+1rem)] resize-none bg-transparent px-2 py-1 text-xl leading-snug font-semibold tracking-tight transition-colors duration-150 outline-none",
        canEditTodos &&
          "hover:bg-wash-strong focus:ring-brand focus:bg-transparent focus:ring-2",
      )}
    />
  );

  const descriptionField = (
    <>
      <SectionHeader title={t("task.description")} />

      <textarea
        value={description}
        readOnly={!canEditTodos}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveDescription}
        rows={5}
        placeholder={
          canEditTodos ? t("task.addDescription") : t("task.noDescription")
        }
        aria-label={t("task.description")}
        className={cn(
          TEXT_FIELD,
          "rounded-card block field-sizing-content max-h-[28rem] min-h-24 w-full resize-y px-3 py-2.5 text-sm leading-relaxed",
          !canEditTodos && "focus:border-hairline focus:ring-0",
        )}
      />
    </>
  );

  const sections = (
    <>
      {/* Attachments are content, not Activity (comments/history) — filed as its own section, not a fifth tab. */}
      <AttachmentsSection todoId={todo.id} />

      {/* A genuine Subtask (leaf of the hierarchy) renders neither of these. */}
      {hierarchy.canHaveSubtasks && <SubtasksSection todo={todo} />}

      {hierarchy.isEpic && <EpicTasksSection epic={todo} />}

      <DevelopmentSection
        todoId={todo.id}
        boardId={todo.board_id}
        taskKey={key}
      />
    </>
  );

  return (
    <>
      <Header
        keyLabel={key}
        type={todo.type}
        breadcrumb={
          <ParentLine parentId={todo.parent_id} boardId={todo.board_id} />
        }
        actions={
          <TaskActions
            todo={todo}
            keyLabel={key}
            variant={variant}
            onDelete={() => setConfirming("delete")}
          />
        }
        onClose={requestClose}
      />

      {confirming === "delete" && (
        <ConfirmBar
          tone="danger"
          message={t("task.deleteConfirm", { name: key ?? t("task.thisTask") })}
          onCancel={() => setConfirming(null)}
        >
          <button
            type="button"
            autoFocus
            onClick={() => setConfirming(null)}
            className={cn(DIALOG_CANCEL, "h-8 px-3")}
          >
            {t("common.cancel")}
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            className={cn(DIALOG_DANGER, "h-8 px-3")}
          >
            {t("task.delete")}
          </button>
        </ConfirmBar>
      )}

      {confirming === "close" && (
        <ConfirmBar
          message={t("task.closeUnsaved")}
          onCancel={() => setConfirming(null)}
        >
          <button
            type="button"
            // both keep focus in the field: losing it saves, which would save what Discard throws away
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setConfirming(null)}
            className={cn(DIALOG_CANCEL, "h-8 px-3")}
          >
            {t("workflow.keepEditing")}
          </button>

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            className={cn(DIALOG_DANGER, "h-8 px-3")}
          >
            {t("workflow.discard")}
          </button>
        </ConfirmBar>
      )}

      {panel ? (
        // One column, Jira's order: the fields cards sit below the content, and the conversation closes it out.
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            {titleField}

            <StatusField todo={todo} panel />
          </div>

          <div>{descriptionField}</div>

          {sections}

          <TaskRail
            todo={todo}
            hierarchy={hierarchy}
            patch={patch}
            keyLabel={key}
          />

          <ActivitySection todoId={todo.id} boardId={todo.board_id} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="min-w-0 flex-1 space-y-8 px-5 py-6 md:overflow-y-auto md:px-7">
            <div>
              {titleField}

              <div className="mt-5">{descriptionField}</div>
            </div>

            {sections}

            <ActivitySection todoId={todo.id} boardId={todo.board_id} />
          </div>

          <aside className="border-hairline bg-canvas/50 shrink-0 space-y-5 border-t p-5 md:w-[20rem] md:overflow-y-auto md:border-t-0 md:border-l">
            <StatusField todo={todo} />

            <TaskRail
              todo={todo}
              hierarchy={hierarchy}
              patch={patch}
              keyLabel={key}
            />
          </aside>
        </div>
      )}
    </>
  );
}

// pointer-events-none for a viewer — these controls are popover triggers, not readOnly like the textareas.
function StatusField({
  todo,
  panel = false,
}: {
  todo: TodoDetail;
  panel?: boolean;
}) {
  const { canEditTodos } = usePermissions();

  return (
    <div
      className={cn(
        panel && "w-fit min-w-40",
        !canEditTodos && "pointer-events-none",
      )}
    >
      <StatusControl
        todoId={todo.id}
        statusId={todo.status_id}
        variant="field"
      />
    </div>
  );
}

// The cards under the status, shared by both layouts. Only the field values are inert for a viewer: the card's own
// collapse toggle must stay reachable, so pointer-events-none cannot sit on the whole rail.
function TaskRail({
  todo,
  hierarchy,
  patch,
  keyLabel,
}: {
  todo: TodoDetail;
  hierarchy: TodoHierarchy;
  patch: Patch;
  keyLabel: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { canEditTodos } = usePermissions();
  const { data: sprints = [] } = useSprints();
  const sprintsEnabled = useSprintsEnabled();

  const created = relativeTime(todo.created_at);
  const updated = relativeTime(todo.updated_at);

  // One list feeds both the rows and the collapsed card's summary, so the summary can only name fields that are shown.
  const fields: { key: string; label: string; node: ReactNode }[] = [
    {
      key: "assignee",
      label: t("fields.assignee"),
      node: (
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
          alwaysVisible
          showName
        />
      ),
    },
    {
      key: "workType",
      label: t("fields.workType"),
      node: (
        <WorkTypeControl
          value={todo.type}
          onChange={(type) => patch({ type })}
          showLabel
        />
      ),
    },
    {
      key: "priority",
      label: t("fields.priority"),
      node: (
        <PriorityControl
          value={todo.priority}
          onChange={(priority) => patch({ priority })}
          showLabel
          alwaysVisible
        />
      ),
    },
    {
      key: "storyPoints",
      label: t("task.storyPoints"),
      node: (
        <EstimateControl
          value={todo.estimate}
          onChange={(estimate) => patch({ estimate })}
          alwaysVisible
          showLabel
        />
      ),
    },
    ...(hierarchy.canPickEpicParent
      ? [
          {
            key: "parent",
            label: t("fields.parent"),
            node: (
              <EpicParentControl
                value={todo.parent_id}
                onChange={(epicId) => patch({ parent_id: epicId })}
              />
            ),
          },
        ]
      : []),
    // A genuine Subtask has no sprint of its own — it inherits its parent Task's.
    // The field also goes with the Sprints feature (0020); the stored
    // sprint_id is left alone so turning it back on restores it.
    ...(sprintsEnabled && !hierarchy.isGenuineSubtask
      ? [
          {
            key: "sprint",
            label: t("fields.sprint"),
            node: (
              <SprintControl
                value={todo.sprint_id}
                sprints={sprints}
                onChange={(sprintId) => patch({ sprint_id: sprintId })}
              />
            ),
          },
        ]
      : []),
    // Each end is bounded by the other, so the range can't be inverted.
    {
      key: "startDate",
      label: t("fields.startDate"),
      node: (
        <StartDateControl
          value={todo.start_date}
          onChange={(start_date) => patch({ start_date })}
          notAfter={todo.due_date}
          alwaysVisible
          showLabel
        />
      ),
    },
    {
      key: "dueDate",
      label: t("fields.dueDate"),
      node: (
        <DueDateControl
          value={todo.due_date}
          onChange={(due_date) => patch({ due_date })}
          notBefore={todo.start_date}
          alwaysVisible
          showLabel
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <DetailCard
        id="details"
        title={t("workflow.details")}
        summary={fields.map((field) => field.label).join(", ")}
      >
        <dl
          className={cn(
            "px-3.5 py-1.5",
            !canEditTodos && "pointer-events-none",
          )}
        >
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.node}
            </Field>
          ))}
        </dl>
      </DetailCard>

      <DevelopmentActions todo={todo} taskKey={keyLabel} />

      {(created || updated) && (
        <p className="text-ink-3 text-mini px-0.5 leading-relaxed">
          {created && (
            <span
              className="block"
              title={new Date(todo.created_at).toLocaleString(i18n.language)}
            >
              {t("task.createdAgo", { when: created })}
            </span>
          )}
          {updated && (
            <span
              className="block"
              title={
                todo.updated_at
                  ? new Date(todo.updated_at).toLocaleString(i18n.language)
                  : undefined
              }
            >
              {t("task.updatedAgo", { when: updated })}
            </span>
          )}
        </p>
      )}
    </div>
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
  const { t } = useTranslation();
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

        <IconButton label={t("task.closeDetails")} onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
    </header>
  );
}

function TaskActions({
  todo,
  keyLabel,
  variant,
  onDelete,
}: {
  todo: TodoDetail;
  keyLabel: string | null;
  variant: TaskVariant;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { canEditTodos } = usePermissions();
  const setLayout = useTaskLayout((state) => state.setLayout);

  const panel = variant === "panel";
  // The key where there is one: TaskRefPage resolves it, and it reads better in a pasted link. The id covers a card still in flight.
  const path = `/tasks/${keyLabel ?? todo.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success(t("task.linkCopied"));
    } catch {
      toast.error(t("task.copyLinkFailed"));
    }
  }

  return (
    <>
      <IconButton label={t("task.copyLink")} onClick={() => void copyLink()}>
        <LinkIcon />
      </IconButton>

      {canEditTodos && <MoreActions onDelete={onDelete} />}

      {panel && (
        <Tooltip>
          <TooltipTrigger
            render={<a href={path} target="_blank" rel="noreferrer" />}
            aria-label={t("task.openInNewTab")}
            className={ICON_BUTTON.sm}
          >
            <ExternalLinkIcon />
          </TooltipTrigger>

          <TooltipContent side="bottom">
            {t("task.openInNewTab")}
          </TooltipContent>
        </Tooltip>
      )}

      <IconButton
        label={panel ? t("task.openAsDialog") : t("task.openInPanel")}
        onClick={() => setLayout(panel ? "modal" : "panel")}
      >
        {panel ? <Maximize2Icon /> : <Minimize2Icon />}
      </IconButton>
    </>
  );
}

function MoreActions({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  return (
    <>
      <IconButton
        label={t("task.moreActions")}
        aria-haspopup="menu"
        {...triggerProps}
      >
        <MoreHorizontalIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("task.actions")}
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
              {t("task.delete")}
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

function Loading({
  onClose,
  variant,
}: {
  onClose: () => void;
  variant: TaskVariant;
}) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      {variant === "panel" ? (
        <div className="space-y-5 px-5 py-5" aria-busy>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
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
      )}
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
  const { t } = useTranslation();

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
          {t("common.close")}
        </button>
      </div>
    </>
  );
}

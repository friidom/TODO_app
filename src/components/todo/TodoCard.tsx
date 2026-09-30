import { useTranslation } from "react-i18next";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { ListTree, Pencil } from "lucide-react";

import DueDateControl from "./TodoItem/DueDateControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import IconButton from "@/components/ui/IconButton";
import { toPriority, type Priority } from "@/constants/priorities";
import type { WorkType } from "@/constants/workTypes";
import { cn } from "@/utils/cn";
import type { TodoCardContent, TodoViewState } from "@/types/data";

export interface TodoCardProps extends TodoCardContent, TodoViewState {
  draft: string;
  editing: boolean;
  canEdit: boolean;
  // just landed in a done column — play the ring once
  celebrate?: boolean;
  // the card whose task panel is open
  selected?: boolean;

  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
  onWorkTypeChange: (value: WorkType) => void;
  onPriorityChange: (value: Priority | null) => void;
  onDueDateChange: (value: string | null) => void;
  onEstimateChange: (value: number | null) => void;

  // two primitives, not one object — TodoContainer is memoised and a fresh {done,total} per render would break that
  subtaskDone?: number;
  subtaskTotal?: number;

  // absent on the drag overlay, which has no chrome to open anything from
  onOpen?: () => void;

  assignee?: ReactNode;
  menu?: ReactNode;

  setNodeRef?: (element: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
}

// Renders and reports, doesn't decide — no network calls or mutations in here, TodoItem owns those.
export default function TodoCard({
  title,
  taskKey,
  workType,
  priority,
  dueDate,
  estimate,
  draft,
  editing,
  canEdit,
  celebrate = false,
  selected = false,
  overlay = false,
  dragging = false,
  dragDisabled = false,
  onDraftChange,
  onSave,
  onCancel,
  onStartEdit,
  onWorkTypeChange,
  onPriorityChange,
  onDueDateChange,
  onEstimateChange,
  subtaskDone = 0,
  subtaskTotal = 0,
  onOpen,
  assignee,
  menu,
  setNodeRef,
  handleProps,
}: TodoCardProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Set fields lead and empty ones trail, each in its own box: an invisible placeholder in front would indent
  // everything after it, and one that wrapped would leave a blank line under the card at rest.
  const fields = [
    {
      key: "priority",
      set: toPriority(priority) !== null,
      node: (
        <PriorityControl
          bare
          value={priority}
          onChange={onPriorityChange}
          placement="bottom-start"
        />
      ),
    },
    {
      key: "estimate",
      set: estimate !== null,
      node: (
        <EstimateControl
          value={estimate}
          onChange={onEstimateChange}
          placement="bottom-start"
        />
      ),
    },
    {
      key: "due",
      set: Boolean(dueDate),
      node: (
        <DueDateControl
          value={dueDate}
          onChange={onDueDateChange}
          placement="bottom-start"
        />
      ),
    },
  ];

  const filled = fields.filter((field) => field.set);
  const empty = fields.filter((field) => !field.set);

  return (
    <div
      ref={setNodeRef}
      {...handleProps}
      inert={overlay || undefined}
      // safe to put on the drag handle: dnd-kit's pointer sensor needs an 8px move to start a drag,
      // and swallows the click for 50ms after a drop, so a stationary click never gets eaten
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, input, a")
        ) {
          return;
        }

        // mid-rename, this click is the blur that saves — don't also open the modal
        if (editing) return;

        onOpen?.();
      }}
      className={cn(
        "group border-hairline bg-elevated rounded-card shadow-e1 focus-visible:ring-brand relative flex flex-col gap-1 border p-2.5 transition-[border-color,box-shadow,opacity] duration-150 outline-none focus-visible:ring-2",
        !dragDisabled && "touch-none select-none",
        overlay
          ? "shadow-e3 pointer-events-none rotate-[1.5deg]"
          : cn(
              "hover:border-ink/15 hover:shadow-e2",
              onOpen && "cursor-pointer",
            ),
        selected &&
          "border-brand/40 hover:border-brand/40 ring-brand/50 ring-2",
        // dragged-from placeholder: a dimmed dashed slot, no shadow, so it doesn't read as two cards stacked
        dragging &&
          "border-ink/20 hover:border-ink/20 border-dashed opacity-40 shadow-none hover:shadow-none",
        celebrate && "done-flash",
      )}
    >
      <div className="coarse:min-h-7 flex min-h-5 items-center gap-1.5">
        <WorkTypeControl
          bare
          value={workType}
          onChange={onWorkTypeChange}
          placement="bottom-start"
        />

        {taskKey === null ? (
          <span aria-hidden className="bg-wash-strong h-2 w-9 rounded-full" />
        ) : onOpen ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpen}
            title={`Open ${taskKey}`}
            className="text-ink-3 hover:text-brand focus-visible:ring-brand rounded-control text-mini font-medium tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            {taskKey}
          </button>
        ) : (
          <span className="text-ink-3 text-mini font-medium tabular-nums">
            {taskKey}
          </span>
        )}

        {!editing && canEdit && (
          <div className="coarse:opacity-100 -my-0.5 -mr-1 ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
            <IconButton
              size="xs"
              label={t("common.rename")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onStartEdit}
            >
              <Pencil />
            </IconButton>

            {menu}
          </div>
        )}
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            // the card root has dnd-kit's KeyboardSensor listening too, which treats Enter/Space as "pick up" — stop it here
            e.stopPropagation();

            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="bg-elevated text-ink rounded-control ring-brand -mx-1 w-[calc(100%+0.5rem)] px-1 text-sm leading-snug font-medium ring-2 outline-none"
        />
      ) : (
        <p className="text-ink line-clamp-3 text-sm leading-snug font-medium break-words">
          {title}
        </p>
      )}

      {/* always in flow, never toggled — hiding it on hover would shove every card below it up and down the column */}
      <div className="mt-1 flex min-h-6 items-center gap-1">
        {(filled.length > 0 || subtaskTotal > 0) && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {filled.map((field) => (
              <Fragment key={field.key}>{field.node}</Fragment>
            ))}

            {subtaskTotal > 0 && (
              <SubtaskProgress done={subtaskDone} total={subtaskTotal} />
            )}
          </div>
        )}

        {empty.length > 0 && (
          <div className="-mx-0.5 flex h-6 min-w-0 flex-1 items-center gap-1 overflow-hidden px-0.5">
            {empty.map((field) => (
              <Fragment key={field.key}>{field.node}</Fragment>
            ))}
          </div>
        )}

        <div className="ml-auto flex shrink-0">{assignee}</div>
      </div>
    </div>
  );
}

function SubtaskProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation();

  return (
    <span
      title={t("subtasks.progress", { done, count: total })}
      className="text-ink-3 flex h-5 shrink-0 flex-col justify-center gap-0.5"
    >
      <span className="text-mini flex items-center gap-1 leading-none font-medium tabular-nums">
        <ListTree className="size-3 shrink-0" />
        {done}/{total}
      </span>

      <span className="bg-wash-strong h-0.5 overflow-hidden rounded-full">
        <span
          style={{ width: `${Math.round((done / total) * 100)}%` }}
          className="bg-status-green block h-full rounded-full transition-[width] duration-300"
        />
      </span>
    </span>
  );
}

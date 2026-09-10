import type { ReactNode } from "react";
import { ListTree, Pencil, SignalIcon, User } from "lucide-react";
import { useEffect, useRef } from "react";

import DueDateControl from "./TodoItem/DueDateControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { priorityOf, type Priority } from "@/constants/priorities";
import { workTypeOf, type WorkType } from "@/constants/workTypes";
import { cn } from "@/utils/cn";
import type { TodoCardContent, TodoViewState } from "@/types/data";

export interface TodoCardProps extends TodoCardContent, TodoViewState {
  draft: string;
  editing: boolean;
  canEdit: boolean;
  // just landed in a done column — play the ring once
  celebrate?: boolean;

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
  overlay = false,
  dragging = false,
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div
      ref={setNodeRef}
      {...handleProps}
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
        "group border-ink/[0.06] bg-elevated hover:border-ink/15 hover:bg-ink/[0.02] rounded-card shadow-e1 hover:shadow-e2 relative flex touch-none flex-col gap-1.5 border p-2.5 transition-[background-color,border-color,box-shadow,opacity] duration-150 select-none",
        overlay
          ? "cursor-grabbing opacity-70 shadow-e3"
          : onOpen && "cursor-pointer",
        // dragged-from placeholder keeps the border but drops the shadow, so it doesn't look like two cards stacked
        dragging && "hover:border-ink/[0.06] shadow-none opacity-40",
        celebrate && "done-flash",
      )}
    >
      <div className="flex items-center gap-1">
        {overlay ? (
          <>
            <PriorityBadge value={priority} />
            <WorkTypeBadge type={workType} />
          </>
        ) : (
          <>
            <PriorityControl
              bare
              value={priority}
              onChange={onPriorityChange}
              alwaysVisible
            />
            <WorkTypeControl
              bare
              value={workType}
              onChange={onWorkTypeChange}
            />
          </>
        )}

        {/* slot always renders (ml-auto lives here) so the action cluster doesn't jump right once the key arrives */}
        <span className="ml-auto shrink-0">
          {taskKey !== null &&
            (onOpen ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpen}
                title={`Open ${taskKey}`}
                className="text-ink-3 hover:text-brand text-mini cursor-pointer font-semibold tracking-wide tabular-nums transition-colors duration-150"
              >
                {taskKey}
              </button>
            ) : (
              <span className="text-ink-3 text-mini font-semibold tracking-wide tabular-nums">
                {taskKey}
              </span>
            ))}
        </span>

        {!editing && canEdit && (
          <div className="coarse:opacity-100 -mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onStartEdit}
              aria-label="Rename"
              className="text-ink-3 hover:bg-ink/10 hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded p-1 transition-colors"
            >
              <Pencil size={13} />
            </button>

            {!overlay && menu}
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
          className="border-brand bg-surface text-ink rounded-control w-full border-2 px-2 py-1 text-sm outline-none"
        />
      ) : (
        <p className="text-ink line-clamp-3 text-sm leading-[1.35] font-medium break-words">
          {title}
        </p>
      )}

      {/* always in flow, never toggled — hiding it on hover would shove every card below it up and down the column */}
      <div className="flex min-h-6 items-center justify-between gap-1.5">
        {overlay ? (
          <span className="border-hairline text-ink-3 grid size-6 shrink-0 place-items-center rounded-full border border-dashed">
            <User size={12} />
          </span>
        ) : (
          assignee
        )}

        {!overlay && (
          <div className="flex shrink-0 items-center gap-1.5">
            <EstimateControl value={estimate} onChange={onEstimateChange} />
            <DueDateControl value={dueDate} onChange={onDueDateChange} />
          </div>
        )}
      </div>

      {subtaskTotal > 0 && (
        <div
          className="flex items-center gap-1.5"
          title={`${subtaskDone} of ${subtaskTotal} subtasks done`}
        >
          <ListTree className="text-ink-3 size-3 shrink-0" />

          <span className="text-ink-3 text-micro shrink-0 font-medium tabular-nums">
            {subtaskDone}/{subtaskTotal}
          </span>

          <div className="bg-ink/[0.06] h-1 min-w-0 flex-1 overflow-hidden rounded-full">
            <div
              style={{
                width: `${Math.round((subtaskDone / subtaskTotal) * 100)}%`,
              }}
              className="bg-status-green h-full rounded-full transition-[width] duration-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// mirrors PriorityControl's bare look pixel for pixel so lifting a card doesn't redraw its top row
function PriorityBadge({ value }: { value: string | null }) {
  const meta = priorityOf(value);

  const Icon = meta?.icon ?? SignalIcon;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center rounded p-0.5",
        meta ? meta.tone : "text-ink-3/40",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

function WorkTypeBadge({ type }: { type: string | null }) {
  const meta = workTypeOf(type);
  const Icon = meta.icon;

  return (
    <span className={cn("flex shrink-0 items-center rounded p-0.5", meta.tone)}>
      <Icon className="size-3.5" />
    </span>
  );
}

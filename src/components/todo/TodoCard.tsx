import { useTranslation } from "react-i18next";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckIcon,
  FolderIcon,
  ListTree,
  Pencil,
  UserIcon,
  XIcon,
} from "lucide-react";

import LabelChip from "./LabelChip";
import DueDateControl from "./TodoItem/DueDateControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import IconButton from "@/components/ui/IconButton";
import { toPriority, type Priority } from "@/constants/priorities";
import { workTypeOf, type WorkType } from "@/constants/workTypes";
import {
  DEFAULT_CARD_FIELDS,
  type CardField,
} from "@/services/views/boardViewPrefs";
import { cn } from "@/utils/cn";
import { formatDayFull, formatDue } from "@/utils/dueDate";
import { relativeTime } from "@/utils/relativeTime";
import type { TodoCardContent, TodoViewState } from "@/types/data";

const EPIC = workTypeOf("Epic");
const MAX_LABELS = 6;

const META_ROW =
  "text-ink-2 flex min-w-0 items-center gap-1.5 text-xs leading-4";
const META_CHIP =
  "border-ink/20 inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded border px-1 text-xs";

export interface TodoCardProps extends TodoCardContent, TodoViewState {
  draft: string;
  editing: boolean;
  canEdit: boolean;
  // just landed in a done column — play the ring once
  celebrate?: boolean;
  // its status's category is done: the footer shows a check
  done?: boolean;
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

  // View settings › Show fields: a field left out is not rendered at all, set or empty
  shownFields?: readonly CardField[];
  parentLabel?: string;
  spaceLabel?: string;
  reporterName?: string;

  // absent on the drag overlay, which has no chrome to open anything from
  onOpen?: () => void;

  status?: ReactNode;
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
  labels,
  startDate,
  createdAt,
  updatedAt,
  completedAt,
  draft,
  editing,
  canEdit,
  celebrate = false,
  done = false,
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
  shownFields = DEFAULT_CARD_FIELDS,
  parentLabel,
  spaceLabel,
  reporterName,
  onOpen,
  status,
  assignee,
  menu,
  setNodeRef,
  handleProps,
}: TodoCardProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [wasPending] = useState(taskKey === null && !overlay);
  // cleared once played: done-flash shares the animation property, and would replay the entrance when it ends
  const [arriving, setArriving] = useState(wasPending);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const show = (field: CardField) => shownFields.includes(field);

  const controls: { key: CardField; set: boolean; node: ReactNode }[] = [
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

  const fields = controls.filter((field) => show(field.key));

  // An empty control waits in the footer, revealed on hover. A set due date is a row of its own: beside the
  // priority, estimate, subtasks and avatar it pushed the key off a 264px card.
  const empty = fields.filter((field) => !field.set);
  const filled = fields.filter((field) => field.set && field.key !== "due");
  const due = fields.find((field) => field.set && field.key === "due");

  const subtasks = show("subtasks") && subtaskTotal > 0;
  const parent = show("parent") && parentLabel !== undefined;
  const space = show("space") && spaceLabel !== undefined;
  const reporter = show("reporter") && reporterName !== undefined;
  const identity = show("type") || show("key");

  // Each date is "Label value", with the full day in its title: an icon alone cannot tell created from updated.
  const dates = (
    [
      [
        "start",
        "fields.startDate",
        startDate,
        startDate && formatDue(startDate),
      ],
      ["created", "fields.created", createdAt, relativeTime(createdAt)],
      ["updated", "fields.updated", updatedAt, relativeTime(updatedAt)],
      ["resolved", "fields.completed", completedAt, relativeTime(completedAt)],
    ] as const
  ).filter(([field, , iso, text]) => show(field) && iso && text);

  const footer =
    identity || fields.length > 0 || subtasks || done || show("assignee");

  const actions = !editing && canEdit && (
    // over the title rather than beside it, so a long title keeps the card's full width at rest;
    // background:inherit picks up the card's hover wash, which is a gradient layer and not a colour
    <div className="coarse:opacity-100 rounded-control absolute top-2.5 right-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 [background:inherit] group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
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
  );

  return (
    <div
      ref={setNodeRef}
      {...handleProps}
      inert={overlay || undefined}
      aria-busy={taskKey === null || undefined}
      onAnimationEnd={
        arriving
          ? (event) => {
              if (event.target === event.currentTarget) setArriving(false);
            }
          : undefined
      }
      // safe to put on the drag handle: dnd-kit's pointer sensor needs an 8px move to start a drag,
      // and swallows the click for 50ms after a drop, so a stationary click never gets eaten
      onClick={(event) => {
        // a portalled dialog or popover bubbles through the card in React's tree
        if (!event.currentTarget.contains(event.target as Node)) return;

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
        "group border-hairline bg-elevated shadow-e1 focus-visible:ring-brand relative flex flex-col gap-2 rounded-md border p-3 transition-[border-color,box-shadow,opacity] duration-150 outline-none focus-visible:ring-2",
        !dragDisabled && "touch-none select-none",
        overlay
          ? "shadow-e3 pointer-events-none rotate-[1.5deg]"
          : cn(
              // the wash is a gradient layer, not a background colour: --wash is translucent and would show the column through
              "hover:border-brand/30 hover:shadow-e2 hover:from-wash hover:to-wash hover:bg-linear-to-b",
              onOpen && "cursor-pointer",
            ),
        selected &&
          "border-brand/40 hover:border-brand/40 ring-brand/50 ring-2",
        // dragged-from placeholder: a dimmed dashed slot, no shadow, so it doesn't read as two cards stacked
        dragging &&
          "border-ink/20 hover:border-ink/20 border-dashed opacity-40 shadow-none hover:shadow-none",
        celebrate && "done-flash",
        arriving &&
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 ease-emphasized duration-200",
      )}
    >
      {actions}

      {editing ? (
        <div className="flex flex-col gap-1.5">
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
            className="bg-elevated text-ink rounded-control ring-brand -mx-1 w-[calc(100%+0.5rem)] px-1 text-sm leading-5 ring-2 outline-none"
          />

          {/* preventDefault on pointerdown keeps focus in the field: its blur saves, and would beat Cancel to it */}
          <div className="flex justify-end gap-1">
            <IconButton
              size="sm"
              label={t("common.save")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={onSave}
              className="border-hairline bg-elevated shadow-e1 hover:text-brand border"
            >
              <CheckIcon />
            </IconButton>

            <IconButton
              size="sm"
              label={t("common.cancel")}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={onCancel}
              className="border-hairline bg-elevated shadow-e1 border"
            >
              <XIcon />
            </IconButton>
          </div>
        </div>
      ) : (
        show("summary") && (
          <p
            className={cn(
              "text-ink line-clamp-3 text-sm leading-5 break-words",
              // touch shows the actions at rest, so the first line must not run under them
              actions && "coarse:pr-16",
            )}
          >
            {title}
          </p>
        )
      )}

      {show("status") && status && <div className="flex min-w-0">{status}</div>}

      {show("labels") && labels.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1">
          {labels.slice(0, MAX_LABELS).map((name) => (
            <LabelChip key={name} name={name} outline />
          ))}
          {labels.length > MAX_LABELS && (
            <span
              title={labels.slice(MAX_LABELS).join(", ")}
              className={cn(META_CHIP, "text-ink-2 tabular-nums")}
            >
              +{labels.length - MAX_LABELS}
            </span>
          )}
        </div>
      )}

      {dates.length > 0 && (
        <div className="text-ink-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-4 tabular-nums">
          {dates.map(([field, label, iso, text]) => (
            <span key={field} title={iso ? formatDayFull(iso) : undefined}>
              <span className="text-ink-3">{t(label)}</span> {text}
            </span>
          ))}
        </div>
      )}

      {due && <div className="flex">{due.node}</div>}

      {parent && (
        <span
          title={parentLabel}
          className={cn(META_CHIP, "text-ink self-start")}
        >
          <EPIC.icon className={cn("size-3.5 shrink-0", EPIC.tone)} />
          <span className="truncate">
            {parentLabel || t("common.untitled")}
          </span>
        </span>
      )}

      {reporter && (
        <span
          title={`${t("fields.reporter")}: ${reporterName}`}
          className={META_ROW}
        >
          <UserIcon className="text-ink-3 size-4 shrink-0" />
          <span className="truncate">{reporterName}</span>
        </span>
      )}

      {space && (
        <span title={spaceLabel} className={META_ROW}>
          <FolderIcon className="text-ink-3 size-4 shrink-0" />
          <span className="truncate">{spaceLabel}</span>
        </span>
      )}

      {/* in flow whenever a field is shown, never toggled by hover — that would shove every card below it up and down the column.
          It wraps rather than truncating the key once every control is set; the hover-revealed group has a zero basis, so it never causes a wrap */}
      {footer && (
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          {identity && (
            <div className="flex min-w-0 items-center gap-1">
              {show("type") && (
                <WorkTypeControl
                  bare
                  value={workType}
                  onChange={onWorkTypeChange}
                  placement="bottom-start"
                />
              )}

              {!show("key") ? null : taskKey === null ? (
                <span aria-hidden className="skeleton h-2 w-9 rounded-full" />
              ) : onOpen ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onOpen}
                  title={`Open ${taskKey}`}
                  className={cn(
                    "text-ink-2 hover:text-brand focus-visible:ring-brand rounded-control truncate text-xs font-semibold tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2",
                    wasPending &&
                      "motion-safe:animate-in motion-safe:fade-in-0 duration-300",
                  )}
                >
                  {taskKey}
                </button>
              ) : (
                <span className="text-ink-2 truncate text-xs font-semibold tabular-nums">
                  {taskKey}
                </span>
              )}
            </div>
          )}

          {empty.length > 0 && (
            <div className="-mx-0.5 flex h-6 min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden px-0.5">
              {empty.map((field) => (
                <Fragment key={field.key}>{field.node}</Fragment>
              ))}
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {filled.map((field) => (
              <Fragment key={field.key}>{field.node}</Fragment>
            ))}

            {subtasks && (
              <SubtaskProgress done={subtaskDone} total={subtaskTotal} />
            )}

            {done && (
              <CheckIcon
                role="img"
                aria-label={t("columnCategory.done")}
                className="text-status-green size-4 shrink-0"
              />
            )}

            {show("assignee") && assignee}
          </div>
        </div>
      )}
    </div>
  );
}

function SubtaskProgress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation();

  return (
    <span
      title={t("subtasks.progress", { done, count: total })}
      className="text-ink-2 flex h-5 shrink-0 flex-col justify-center gap-0.5"
    >
      <span className="flex items-center gap-1 text-xs leading-none font-medium tabular-nums">
        <ListTree className="text-ink-3 size-3.5 shrink-0" />
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

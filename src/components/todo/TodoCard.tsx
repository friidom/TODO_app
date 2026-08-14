import type { ReactNode } from "react";
import { Pencil, User } from "lucide-react";
import { useEffect, useRef } from "react";

import DueDateControl from "./TodoItem/DueDateControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { workTypeOf, type WorkType } from "@/constants/workTypes";
import { cn } from "@/utils/cn";
import type { TodoCardContent, TodoViewState } from "@/types/data";

export interface TodoCardProps extends TodoCardContent, TodoViewState {
  /** The title being typed, which is not the stored one until it is saved. */
  draft: string;
  editing: boolean;
  /** Editor and above. Below it the whole action cluster is absent. */
  canEdit: boolean;
  /** This card just landed in a done column — play the ring once. */
  celebrate?: boolean;

  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
  onWorkTypeChange: (value: WorkType) => void;
  onDueDateChange: (value: string | null) => void;

  /** Opens the detail panel. Absent on the drag overlay, which has no chrome. */
  onOpen?: () => void;

  /**
   * The assignee control and the action menu, as rendered nodes.
   *
   * Both need things a presentational card must not have: the picker fetches
   * the board's roster, and the menu needs a complete `Todo`. Passing them in
   * is what keeps this component free of a board id, a row and a query —
   * `TodoItem` has all three and builds them.
   */
  assignee?: ReactNode;
  menu?: ReactNode;

  /** @dnd-kit wiring, owned by `TodoItem`. */
  setNodeRef?: (element: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
}

/**
 * One work item, as a card. **Renders and reports; it does not decide.**
 *
 * `docs/FRONTEND.md` names this component as its example of one that *"only
 * renders"*, and until M5-02 it was the opposite: it held the rename state and
 * called `useUpdateTodo` itself, so the thing the guide pointed at was the
 * thing the guide warned about. Every hook that reached the network or the
 * cache now lives in `TodoItem`; what is left is markup, three presentational
 * child controls and a set of callbacks.
 *
 * That is what makes it testable and reusable: it can be rendered from a
 * hand-written props object with no database row, no query client and no
 * board.
 */
export default function TodoCard({
  title,
  boardKey,
  workType,
  dueDate,
  draft,
  editing,
  canEdit,
  celebrate = false,
  overlay = false,
  dragging = false,
  dragDisabled = false,
  onDraftChange,
  onSave,
  onCancel,
  onStartEdit,
  onWorkTypeChange,
  onDueDateChange,
  onOpen,
  assignee,
  menu,
  setNodeRef,
  handleProps,
}: TodoCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus follows the mode, which is a rendering concern — the state that says
  // *whether* we are editing is the container's.
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
      className={cn(
        "group border-hairline bg-elevated hover:border-ink/25 rounded-card relative flex touch-none flex-col gap-2 border px-2.5 py-2 shadow-sm transition-colors duration-200 select-none",
        overlay
          ? "cursor-grabbing opacity-60 shadow-lg"
          : dragDisabled
            ? "hover:shadow-md"
            : "cursor-grab hover:shadow-md",
        dragging && "hover:border-hairline opacity-40 shadow-none",
        // Mounting in a done column means the card just got there — the
        // animation is one-shot, so mounting is the whole trigger.
        celebrate && "done-flash",
      )}
    >
      {/* TITLE */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onBlur={onSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onCancel();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="border-brand bg-surface text-ink rounded-control w-full border-2 px-2 py-1 text-sm outline-none"
            />
          ) : (
            <p className="text-ink text-[13px] leading-snug break-words">
              {title}
            </p>
          )}
        </div>

        {/* actions — no pending state to hide behind since M2-14: the card
            already holds its real id, so its menu and its key are valid the
            moment it appears.

            Hidden entirely below editor: every action behind them writes, and
            the whole cluster is hover-revealed anyway, so a viewer simply
            never sees one appear. */}
        {!editing && canEdit && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onStartEdit}
              className="text-ink-3 hover:bg-ink/10 hover:text-ink rounded-md p-1"
            >
              <Pencil size={15} />
            </button>

            {!overlay && menu}
          </div>
        )}
      </div>

      {/* META — work type, key, due date, then the assignee pushed right.
          Secondary to the title by design: everything here is 11px on a muted
          chip, and a control with nothing set stays invisible until the card is
          hovered, so a bare card carries no chrome.

          There is no status chip. Status is which column the card is in, and
          the column already says so above every card in it — a chip repeating
          it spent the widest part of the densest row on the board saying
          nothing. Changing status still works, through the card menu.

          Wraps rather than overflowing: on a narrow column a card with a long
          due date and an avatar runs out of room, and a second line reads
          better than a clipped one. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {overlay ? (
          <WorkTypeBadge type={workType} />
        ) : (
          <WorkTypeControl value={workType} onChange={onWorkTypeChange} />
        )}

        {/* The key opens the detail panel, and it is the affordance a VIEWER
            has. The action cluster above is editor-only, and the menu inside
            it was the only way in — so reading a description required
            permission to write one. Reading is not editing. Null only while a
            freshly created card is in flight. */}
        {boardKey !== null &&
          (onOpen ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpen}
              title={`Open KAN-${boardKey}`}
              className="bg-ink/10 text-ink-2 hover:bg-ink/20 hover:text-ink shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors"
            >
              KAN-{boardKey}
            </button>
          ) : (
            <span className="bg-ink/10 text-ink-2 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold">
              KAN-{boardKey}
            </span>
          ))}

        {/* Controlled and writing nothing: the card reports a change and the
            container decides what it costs. The create form holds the same
            values in local state instead. One implementation, two modes. */}
        {!overlay && (
          <DueDateControl value={dueDate} onChange={onDueDateChange} />
        )}

        <div className="ml-auto flex shrink-0 items-center">
          {overlay ? (
            <span className="border-hairline text-ink-3 grid size-6 place-items-center rounded-full border border-dashed">
              <User size={12} />
            </span>
          ) : (
            assignee
          )}
        </div>
      </div>
    </div>
  );
}

/** The overlay's copy of the work-type chip: the same look, no popover. */
function WorkTypeBadge({ type }: { type: string | null }) {
  const meta = workTypeOf(type);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold",
        meta.chip,
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

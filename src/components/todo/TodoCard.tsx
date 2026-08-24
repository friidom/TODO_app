import type { ReactNode } from "react";
import { Pencil, User } from "lucide-react";
import { useEffect, useRef } from "react";

import DueDateControl from "./TodoItem/DueDateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { PRIORITIES, toPriority, type Priority } from "@/constants/priorities";
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
  onPriorityChange: (value: Priority | null) => void;
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
  taskKey,
  workType,
  priority,
  dueDate,
  draft,
  editing,
  canEdit,
  celebrate = false,
  overlay = false,
  dragging = false,
  // `dragDisabled` is deliberately not destructured any more. It stays on
  // `TodoViewState` because `TodoItem` needs it for `useDraggable`, but the
  // card itself no longer renders differently for it: opening is what the
  // pointer cursor now promises, and that works whether or not drag does.
  onDraftChange,
  onSave,
  onCancel,
  onStartEdit,
  onWorkTypeChange,
  onPriorityChange,
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
      /**
       * The whole card opens the detail, not just the key.
       *
       * **Safe to put on the drag handle, and dnd-kit is what makes it safe.**
       * The pointer sensor carries `activationConstraint: { distance: 8 }`, so
       * a press that never moves 8px never becomes a drag — and the moment one
       * does, dnd-kit adds a capture-phase `click` listener on the document
       * that stops propagation, which it keeps for 50ms after the drop. So a
       * drop never reaches this handler and a click that stayed still always
       * does. That is why the earlier attempt at this was commented out rather
       * than fixed: as a bare `onClick={onOpen}` it also fired on every drop.
       */
      onClick={(event) => {
        // Every control inside the card answers its own click: the priority
        // and work-type popovers, the assignee, the due date, the rename
        // field, the menu, and the key. Without this, setting a priority would
        // also open the modal behind the popover that was just used to set it.
        if (
          event.target instanceof Element &&
          event.target.closest("button, input, a")
        ) {
          return;
        }

        // Mid-rename this click is the blur that saves. Opening the modal on
        // top of that would take the card out from under the field being
        // edited.
        if (editing) return;

        onOpen?.();
      }}
      className={cn(
        // No resting shadow and a border at half the hairline's contrast: the
        // card is found by its surface being one step above the column, which
        // is what the tightened token ladder is for. A border and a shadow on
        // top of that is the "developer dashboard" look.
        "group border-ink/[0.06] bg-elevated hover:border-ink/15 hover:bg-ink/[0.02] rounded-card relative flex touch-none flex-col gap-2 border p-3 transition-[background-color,border-color,opacity] duration-150 select-none",
        // The pointer cursor is earned by opening rather than by dragging now,
        // which is why the `dragDisabled` branch is gone: a card on a grouped
        // board cannot be dragged and still opens, so a default cursor there
        // was telling the truth about the wrong verb.
        overlay
          ? "cursor-grabbing opacity-70 shadow-lg"
          : onOpen && "cursor-pointer",
        dragging && "hover:border-ink/[0.06] opacity-40",
        // Mounting in a done column means the card just got there — the
        // animation is one-shot, so mounting is the whole trigger.
        celebrate && "done-flash",
      )}
    >
      {/* ROW 1 — what kind of work this is, and how urgent.
          Leads the card (M17) because those two answer "should I read this?"
          faster than the title does, and the reference proves the pattern: a
          scannable column is chips first, prose second.

          Both are live controls, not badges — the same popovers the detail
          panel uses, so a priority is set from the board without opening
          anything. Each renders nothing until hover when its value is unset,
          which is what keeps a bare card free of chrome. */}
      <div className="flex items-center gap-1.5">
        {overlay ? (
          <>
            <PriorityBadge value={priority} />
            <WorkTypeBadge type={workType} />
          </>
        ) : (
          <>
            {/* Labelled only when there is a priority to name. Unset, the
                control renders "No priority", which would put those two words
                on every card of a board nobody has prioritised — so it stays a
                small muted icon there, discoverable without shouting. */}
            <PriorityControl
              value={priority}
              onChange={onPriorityChange}
              showLabel={toPriority(priority) !== null}
              // The card keeps its placeholder. A board is scanned by moving
              // between cards rather than by resting on one, so a control that
              // only appears under the cursor is a control most people never
              // find — the opposite of the list, where the same glyph on forty
              // consecutive rows was the problem.
              alwaysVisible
            />
            <WorkTypeControl
              value={workType}
              onChange={onWorkTypeChange}
              showLabel
            />
          </>
        )}

        {/* The key opens the detail panel, and it is the affordance a VIEWER
            has. The action cluster is editor-only, and the menu inside it was
            the only way in — so reading a description required permission to
            write one. Reading is not editing. Null only while a freshly created
            card is in flight. */}
        {taskKey !== null && (
          <span className="ml-auto shrink-0">
            {onOpen ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onOpen}
                title={`Open ${taskKey}`}
                className="text-ink-3 hover:text-brand text-mini cursor-pointer font-semibold tracking-wide transition-colors"
              >
                {taskKey}
              </button>
            ) : (
              <span className="text-ink-3 text-mini font-semibold tracking-wide">
                {taskKey}
              </span>
            )}
          </span>
        )}

        {/* Hidden entirely below editor: every action behind them writes, and
            the cluster is hover-revealed anyway, so a viewer never sees one
            appear. */}
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

      {/* ROW 2 — the title, and the loudest thing on the card. */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            // The field owns the keyboard while it is open, and this line is
            // what says so. The card root carries dnd-kit's listeners, and
            // M9-01's KeyboardSensor treats Enter *and Space* on the draggable
            // as "pick this card up" — so without this, saving a title also
            // started a keyboard drag, and the overlay it raised stayed on
            // screen because nothing else was coming to end it. The pointer
            // path below was guarded from the start; the keyboard path arrived
            // a milestone later and was not.
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

      {/* ROW 3 — whose it is, then when it is due.
          Assignee first (M17 pass 3): a face is a fixed-width object and a date
          is not, so anchoring the faces left and letting the date sit against
          the right edge keeps a column of cards aligned down both sides.

          Both are invisible until hover when unset, so a bare card carries no
          chrome. There is still no status chip — status is which column the
          card is in, and the column says so above every card in it. */}
      {/* Always in flow, never toggled. A previous pass collapsed this row on
          cards with no assignee and no date and brought it back on hover — which
          changed the card's height under the cursor and shoved every card below
          it down the column. Reserving the row is the rule: a control that
          appears on hover keeps its space when it is invisible. Both controls
          fade in place, so a bare card still carries no chrome. */}
      <div className="flex min-h-6 items-center gap-1.5">
        <div className="flex shrink-0 items-center">
          {overlay ? (
            <span className="border-hairline text-ink-3 grid size-6 place-items-center rounded-full border border-dashed">
              <User size={12} />
            </span>
          ) : (
            assignee
          )}
        </div>

        {!overlay && (
          <span className="ml-auto shrink-0">
            <DueDateControl value={dueDate} onChange={onDueDateChange} />
          </span>
        )}
      </div>
    </div>
  );
}

/** The overlay's copy of the priority chip: the same look, no popover. */
function PriorityBadge({ value }: { value: string | null }) {
  const priority = toPriority(value);

  if (!priority) return null;

  const meta = PRIORITIES[priority];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "text-mini flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
        meta.chip,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

/** The overlay's copy of the work-type chip: the same look, no popover. */
function WorkTypeBadge({ type }: { type: string | null }) {
  const meta = workTypeOf(type);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "text-mini flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
        meta.chip,
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

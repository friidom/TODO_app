import { useTranslation } from "react-i18next";
import { CalendarIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import DatePanel from "./DatePanel";
import { useCardPopover } from "./useCardPopover";
import {
  dueStatus,
  formatDue,
  fromCalendarDay,
  toCalendarDay,
  todayISO,
} from "@/utils/dueDate";
import { cn } from "@/utils/cn";

/**
 * The card's due date: a chip when set, a calendar button when not.
 *
 * The picker is a hand-built month grid rather than a dependency. There is no
 * calendar in `components/ui`, and neither `@base-ui/react` nor `radix-ui` ships
 * one — a date picker library would have been a new dependency for a 7-column
 * grid whose only real difficulty is calendar arithmetic, and that lives in
 * `utils/calendarGrid.ts` where it is tested.
 *
 * It replaced a native `<input type="date">`, which could not render the stored
 * value at all: `due_date` is `timestamptz`, so it arrives as a full ISO instant
 * and the input needs `YYYY-MM-DD`. The text field at the top of the panel is
 * still a native date input, because it is the one part the platform does well
 * — typing a date, and keyboard access.
 *
 * **The picker itself moved to `DatePanel` in M20**, when `start_date` arrived
 * and needed the same grid. Nothing about this control changed with it; what is
 * new is `notBefore`, which the task detail passes so a due date cannot be set
 * earlier than the item's start. The database refuses that pair outright
 * (`todos_date_range_check`), so the choice is between disabling the days and
 * surfacing a constraint violation in a toast.
 *
 * **Controlled, and it does not know how the value is saved.** It reports the
 * chosen instant through `onChange` and nothing else. That is what lets the
 * create form and an existing card share this one implementation: on a card the
 * parent patches through `updateTodo`, and in the create form the parent holds
 * it in state until the card is submitted. A control that called the mutation
 * itself could only ever work on a row that already existed.
 */

/** Chip tone keeps the existing overdue / today / upcoming logic. */
const CHIP_TONE = {
  overdue: "bg-status-red/15 text-status-red",
  today: "bg-status-orange/15 text-status-orange",
  upcoming: "bg-ink/10 text-ink-2",
} as const;

/**
 * The same three states without the fill — a date the row can carry quietly.
 *
 * Overdue keeps its red and today keeps its orange, because those are the two
 * this control exists to shout about. An upcoming date drops to `--ink-3`: it is
 * a fact about the item, not a warning, and in a list of thirty rows thirty
 * tinted chips are what make a date impossible to notice when it does matter.
 */
const BARE_TONE = {
  overdue: "text-status-red",
  today: "text-status-orange",
  upcoming: "text-ink-3",
} as const;

export default function DueDateControl({
  value: dueDate,
  onChange,
  notBefore,
  alwaysVisible = false,
  bare = false,
}: {
  /** The stored instant, or null. */
  value: string | null;
  /** Receives the instant to store, or null to clear. */
  onChange: (value: string | null) => void;
  /**
   * The item's start date as a stored instant, where one is known. Days before
   * it cannot be picked — the range constraint would reject them.
   */
  notBefore?: string | null;
  /**
   * Keep the trigger visible instead of revealing it on card hover. The create
   * form has no card to hover, so its controls are always shown.
   */
  alwaysVisible?: boolean;
  /** Text rather than a chip — see `BARE_TONE`. */
  bare?: boolean;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { i18n } = useTranslation();

  const selected = dueDate ? toCalendarDay(dueDate) : null;
  const status = dueDate ? dueStatus(dueDate) : null;
  const label = dueDate
    ? `Due ${formatDue(dueDate, todayISO(), i18n.language)}`
    : "Set a due date";

  function commit(day: string | null) {
    onChange(day ? fromCalendarDay(day) : null);
    close();
  }

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={cn(
          "text-mini flex shrink-0 items-center gap-1 rounded font-medium transition-colors",
          bare ? "hover:bg-ink/10 px-1 py-0.5" : "px-1.5 py-0.5",
          dueDate
            ? bare
              ? BARE_TONE[status!]
              : CHIP_TONE[status!]
            : cn(
                "hover:bg-ink/10 hover:text-ink-2",
                bare ? "text-ink-3/40" : "text-ink-3",
              ),
          !dueDate &&
            !alwaysVisible &&
            "coarse:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        {/* The icon takes the chip's own colour rather than a fixed red. A red
            calendar on a muted "upcoming" chip said "urgent" about a date that
            is not, which is the one thing this control exists to communicate.

            It disappears entirely once a date is set and the control is bare:
            in a column of dates the word "Aug 12" is already unmistakably a
            date, and the glyph beside it is the difference between a row that
            scans and a row of small objects. */}
        {(!dueDate || !bare) && (
          <CalendarIcon className="size-3" strokeWidth={dueDate ? 2.5 : 2} />
        )}
        {dueDate && formatDue(dueDate, todayISO(), i18n.language)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Due date"
            className="border-hairline bg-elevated rounded-surface z-50 w-[268px] border p-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
          >
            <DatePanel
              title="Due date"
              icon={CalendarIcon}
              accent="text-status-red"
              selected={selected}
              locale={i18n.language}
              min={notBefore ? toCalendarDay(notBefore) : undefined}
              onSelect={commit}
              onClear={() => commit(null)}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

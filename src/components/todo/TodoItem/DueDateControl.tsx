import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import { monthGrid, shiftMonth } from "@/utils/calendarGrid";
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
  alwaysVisible = false,
  bare = false,
}: {
  /** The stored instant, or null. */
  value: string | null;
  /** Receives the instant to store, or null to clear. */
  onChange: (value: string | null) => void;
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
          "flex shrink-0 items-center gap-1 rounded text-[11px] font-medium transition-colors",
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
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
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
              selected={selected}
              locale={i18n.language}
              onSelect={commit}
              onClear={() => commit(null)}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function DatePanel({
  selected,
  locale,
  onSelect,
  onClear,
}: {
  selected: string | null;
  locale: string;
  onSelect: (day: string) => void;
  onClear: () => void;
}) {
  const today = todayISO();

  // The month on screen. Opens on the selected date, else on today.
  const [view, setView] = useState(() => {
    const [year, month] = (selected ?? today).split("-").map(Number);

    return { year, month: month - 1 };
  });

  // en is the only Sunday-first locale the app carries; ru and uz start Monday.
  const weekStartsOn = locale.startsWith("en") ? 0 : 1;
  const grid = monthGrid(view.year, view.month, weekStartsOn);

  const heading = new Date(
    Date.UTC(view.year, view.month, 1),
  ).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Derived from the grid's own first week, so the labels can never fall out of
  // step with the columns beneath them.
  const weekdays = grid.slice(0, 7).map((entry) =>
    new Date(`${entry.day}T00:00:00.000Z`).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <CalendarIcon className="text-status-red size-4 shrink-0" />
        <h3 className="text-ink text-sm font-semibold">Due date</h3>

        {selected && (
          <button
            type="button"
            onClick={onClear}
            className="text-ink-3 hover:bg-ink/10 hover:text-ink ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
          >
            <XIcon className="size-3" />
            Clear
          </button>
        )}
      </div>

      {/* Typing a date is the one thing the native control does better than a
          grid, so it stays — but only as the text field, not as the picker. */}
      <input
        type="date"
        value={selected ?? ""}
        onChange={(event) => event.target.value && onSelect(event.target.value)}
        aria-label="Due date"
        className="border-hairline bg-surface text-ink focus-visible:ring-brand/40 rounded-control mb-3 h-9 w-full border px-2 text-sm outline-none focus-visible:ring-2"
      />

      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          className="text-ink-2 hover:bg-ink/10 hover:text-ink rounded-control grid size-7 place-items-center transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <span className="text-ink text-sm font-medium capitalize">
          {heading}
        </span>

        <button
          type="button"
          aria-label="Next month"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          className="text-ink-2 hover:bg-ink/10 hover:text-ink rounded-control grid size-7 place-items-center transition-colors"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weekdays.map((label, index) => (
          <span
            key={index}
            className="text-ink-3 grid h-7 place-items-center text-[10px] font-semibold uppercase"
          >
            {label}
          </span>
        ))}

        {grid.map(({ day, inMonth }) => {
          const isSelected = day === selected;
          const isToday = day === today;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={cn(
                "rounded-control grid h-8 place-items-center text-[13px] transition-colors",
                isSelected
                  ? "bg-brand text-brand-fg font-semibold"
                  : inMonth
                    ? "text-ink hover:bg-ink/10"
                    : "text-ink-3 hover:bg-ink/5",
                // Today is a ring rather than a fill, so it stays legible when
                // it is also the selected day.
                isToday && !isSelected && "ring-brand/60 ring-1 ring-inset",
              )}
            >
              {Number(day.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </>
  );
}

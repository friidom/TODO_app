import { useTranslation } from "react-i18next";
import { PlayIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import DatePanel from "./DatePanel";
import { useCardPopover } from "./useCardPopover";
import {
  formatDue,
  fromCalendarDay,
  toCalendarDay,
  todayISO,
} from "@/utils/dueDate";
import { cn } from "@/utils/cn";

/**
 * When a work item is meant to *begin* (M20).
 *
 * **`DueDateControl`'s shape, which is what the plan asked for** — the same
 * popover, the same `DatePanel`, the same "receives the instant to store" idiom
 * that lets a control serve both a saved row and a draft. What it deliberately
 * does *not* copy is the tone: a due date shouts overdue in red and today in
 * amber because a deadline that has passed is news, whereas a start date in the
 * past is the ordinary state of every task already underway. Colouring it would
 * paint most of a healthy board red.
 *
 * **The value is a `timestamptz` holding midnight UTC**, exactly like
 * `due_date` — see `20260817090000_todos_start_date.sql` for why the column is
 * not the `date` the plan first named, and `utils/dueDate.ts` for the
 * convention both now share. Nothing here converts a timezone: the stored value
 * is sliced to a day and a chosen day is written back with an explicit `Z`.
 *
 * **`notAfter` keeps the range valid before the write.** `todos_date_range_check`
 * refuses `start_date > due_date`, so the days past the due date are disabled
 * rather than offered and then rejected.
 */
export default function StartDateControl({
  value: startDate,
  onChange,
  notAfter,
  alwaysVisible = false,
}: {
  /** The stored instant, or null. */
  value: string | null;
  /** Receives the instant to store, or null to clear. */
  onChange: (value: string | null) => void;
  /** The item's due date as a stored instant, where one is known. */
  notAfter?: string | null;
  /** Keep the trigger visible instead of revealing it on row hover. */
  alwaysVisible?: boolean;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { i18n } = useTranslation();

  const selected = startDate ? toCalendarDay(startDate) : null;
  const label = startDate
    ? `Starts ${formatDue(startDate, todayISO(), i18n.language)}`
    : "Set a start date";

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
          "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
          startDate
            ? "text-ink-2 hover:bg-ink/10"
            : "text-ink-3 hover:bg-ink/10 hover:text-ink-2",
          !startDate &&
            !alwaysVisible &&
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        {/* The glyph stays even once a date is set, unlike the due date's: this
            control sits in a labelled field beside another date, and a bare
            "Aug 12" in each row would make the two impossible to tell apart at
            a glance. */}
        <PlayIcon className="size-3" strokeWidth={startDate ? 2.5 : 2} />
        {startDate && formatDue(startDate, todayISO(), i18n.language)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Start date"
            className="border-hairline bg-elevated rounded-surface z-50 w-[268px] border p-3 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
          >
            <DatePanel
              title="Start date"
              icon={PlayIcon}
              accent="text-brand"
              selected={selected}
              locale={i18n.language}
              max={notAfter ? toCalendarDay(notAfter) : undefined}
              onSelect={commit}
              onClear={() => commit(null)}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

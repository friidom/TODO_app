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

// hand-built month grid, not a date picker lib — no calendar in ui/, and the only real difficulty is calendar
// arithmetic (utils/calendarGrid.ts). fully controlled, doesn't know how the value gets saved, so card and
// create-form can share it.
const CHIP_TONE = {
  overdue: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  today: "bg-status-orange/15 text-status-orange hover:bg-status-orange/25",
  upcoming: "bg-ink/10 text-ink-2 hover:bg-ink/15",
} as const;

// upcoming drops to plain ink — in a list of 30 rows, 30 tinted chips make the one that matters invisible
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
  value: string | null;
  onChange: (value: string | null) => void;
  // days before this can't be picked — the range constraint would reject them
  notBefore?: string | null;
  // the create form has no card to hover, so its controls stay shown
  alwaysVisible?: boolean;
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
          "text-mini flex shrink-0 items-center gap-1 rounded font-medium transition-colors duration-150",
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
        {/* icon takes the chip's own colour — a fixed red on a muted "upcoming" chip said "urgent" wrongly */}
        {(!dueDate || !bare) && <CalendarIcon className="size-3" />}
        {dueDate && formatDue(dueDate, todayISO(), i18n.language)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Due date"
            className="border-hairline bg-elevated rounded-surface z-50 w-[268px] border p-3 shadow-e2"
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

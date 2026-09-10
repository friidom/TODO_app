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

// Unlike the due date, this one never turns red for being in the past — a start date behind today is just a task already underway.
export default function StartDateControl({
  value: startDate,
  onChange,
  notAfter,
  alwaysVisible = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  notAfter?: string | null;
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
          "text-mini flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
          startDate
            ? "text-ink-2 hover:bg-ink/10"
            : "text-ink-3 hover:bg-ink/10 hover:text-ink-2",
          !startDate &&
            !alwaysVisible &&
            "coarse:opacity-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        {/* icon stays even with a date set, so this doesn't get confused with the due date beside it */}
        <PlayIcon className="size-3" strokeWidth={startDate ? 2.5 : 2} />
        {startDate && formatDue(startDate, todayISO(), i18n.language)}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Start date"
            className="border-hairline bg-elevated rounded-surface z-50 w-[268px] border p-3 shadow-e2"
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

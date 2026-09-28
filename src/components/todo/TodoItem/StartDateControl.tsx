import { useTranslation } from "react-i18next";
import { PlayIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  formatDue,
  fromCalendarDay,
  toCalendarDay,
  todayISO,
} from "@/utils/dueDate";
import { cn } from "@/utils/cn";
import DatePanel from "./DatePanel";
import {
  FIELD_CELL,
  FIELD_CHIP,
  FIELD_EMPTY,
  FIELD_ICON,
  FIELD_ROW,
  HOVER_REVEAL,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// Unlike the due date, this one never turns red for being in the past — a start date behind today is just a task already underway.
export default function StartDateControl({
  value: startDate,
  onChange,
  notAfter,
  alwaysVisible = false,
  showLabel = false,
  variant,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  notAfter?: string | null;
  alwaysVisible?: boolean;
  showLabel?: boolean;
  variant?: "cell";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { i18n } = useTranslation();

  const selected = startDate ? toCalendarDay(startDate) : null;
  const label = startDate
    ? `Starts ${formatDue(startDate, todayISO(), i18n.language)}`
    : "Set a start date";
  const cell = variant === "cell";

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
        className={
          cell
            ? cn(FIELD_CELL, !startDate && "text-ink-3")
            : showLabel
              ? cn(FIELD_ROW, startDate ? "text-ink" : "text-ink-3")
              : startDate
                ? cn(
                    FIELD_CHIP,
                    "text-ink-2 hover:bg-wash-strong hover:text-ink shrink-0 whitespace-nowrap",
                  )
                : cn(FIELD_ICON, FIELD_EMPTY, !alwaysVisible && HOVER_REVEAL)
        }
      >
        {cell ? (
          startDate ? (
            <>
              <PlayIcon className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">
                {formatDue(startDate, todayISO(), i18n.language)}
              </span>
            </>
          ) : (
            "None"
          )
        ) : (
          <>
            {/* icon stays even with a date set, so this doesn't get confused with the due date beside it */}
            <PlayIcon
              className={startDate && !showLabel ? "size-3" : "size-3.5"}
              strokeWidth={startDate ? 2.5 : 2}
            />
            {startDate
              ? formatDue(startDate, todayISO(), i18n.language)
              : showLabel && "None"}
          </>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Start date"
            className={cn(POPOVER_PANEL, "z-50 w-[268px] p-3")}
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

import { useTranslation } from "react-i18next";
import { CalendarIcon } from "lucide-react";
import { FloatingPortal, type Placement } from "@floating-ui/react";

import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  dueStatus,
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

// upcoming never gets a fill — in a column or list of 30, 30 tinted chips make the one that matters invisible
const CHIP_TONE = {
  overdue: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  today: "bg-status-orange/15 text-status-orange hover:bg-status-orange/25",
  upcoming: "text-ink-2 hover:bg-wash-strong hover:text-ink",
} as const;

const CELL_TONE = {
  overdue: "text-status-red",
  today: "text-status-orange",
  upcoming: "text-ink",
} as const;

const BARE_TONE = {
  overdue: "text-status-red hover:bg-wash-strong",
  today: "text-status-orange hover:bg-wash-strong",
  upcoming: "text-ink-3 hover:bg-wash-strong hover:text-ink-2",
} as const;

// hand-built month grid, not a date picker lib — no calendar in ui/, and the only real difficulty is calendar
// arithmetic (utils/calendarGrid.ts). fully controlled, doesn't know how the value gets saved, so card and
// create-form can share it.
export default function DueDateControl({
  value: dueDate,
  onChange,
  notBefore,
  alwaysVisible = false,
  bare = false,
  showLabel = false,
  placement,
  variant,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  // days before this can't be picked — the range constraint would reject them
  notBefore?: string | null;
  // the create form has no card to hover, so its controls stay shown
  alwaysVisible?: boolean;
  bare?: boolean;
  showLabel?: boolean;
  placement?: Placement;
  variant?: "cell";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    placement,
  });
  const { t, i18n } = useTranslation();

  const selected = dueDate ? toCalendarDay(dueDate) : null;
  const status = dueDate ? dueStatus(dueDate) : null;
  const label = dueDate
    ? t("dates.dueOn", { date: formatDue(dueDate, todayISO(), i18n.language) })
    : t("dates.setDue");
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
            ? cn(FIELD_CELL, dueDate ? CELL_TONE[status!] : "text-ink-3")
            : showLabel
              ? cn(FIELD_ROW, dueDate ? BARE_TONE[status!] : "text-ink-3")
              : dueDate
                ? cn(
                    FIELD_CHIP,
                    "shrink-0 whitespace-nowrap",
                    bare
                      ? cn("px-1", BARE_TONE[status!])
                      : cn("px-1.5", CHIP_TONE[status!]),
                  )
                : cn(FIELD_ICON, FIELD_EMPTY, !alwaysVisible && HOVER_REVEAL)
        }
      >
        {cell ? (
          dueDate ? (
            <>
              <CalendarIcon className="size-4 shrink-0 opacity-70" />
              <span className="truncate">
                {formatDue(dueDate, todayISO(), i18n.language)}
              </span>
            </>
          ) : (
            t("common.none")
          )
        ) : (
          <>
            {/* icon takes the chip's own colour — a fixed red on a muted "upcoming" chip said "urgent" wrongly */}
            {(!dueDate || !bare || showLabel) && (
              <CalendarIcon
                className={dueDate && !showLabel ? "size-3" : "size-3.5"}
              />
            )}
            {dueDate
              ? formatDue(dueDate, todayISO(), i18n.language)
              : showLabel && t("common.none")}
          </>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("fields.dueDate")}
            className={cn(POPOVER_PANEL, "z-50 w-[268px] p-3")}
          >
            <DatePanel
              title={t("fields.dueDate")}
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

import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

import { monthGrid, shiftMonth } from "@/utils/calendarGrid";
import { todayISO } from "@/utils/dueDate";
import { cn } from "@/utils/cn";

/**
 * The month picker, shared by both of a work item's dates (M20).
 *
 * **Extracted from `DueDateControl`, unchanged in behaviour.** It was private to
 * that file while the row had one date on it; M20 adds `start_date`, and the
 * choice was to copy sixty lines of calendar arithmetic or to lift them. A
 * second copy would be a second place a month boundary, a weekday offset or a
 * locale rule can be wrong — and they would drift silently, because both
 * pickers look right until you page one of them into February.
 *
 * Still a hand-built grid rather than a dependency, for the reason
 * `DueDateControl` records: neither `@base-ui/react` nor `radix-ui` ships a
 * calendar, and the only hard part is arithmetic that already lives in
 * `utils/calendarGrid.ts` where it is tested.
 *
 * **`min` / `max` are what keep the two dates from crossing.** The database
 * refuses an inverted range — `todos_date_range_check`, added with the column —
 * so without a bound the UI would happily offer a start date after the due date
 * and then surface a raw `23514` in a toast. Disabling the days that cannot be
 * chosen says the same thing before the click, which is the difference between
 * a constraint that guides and one that scolds.
 */
export default function DatePanel({
  title,
  icon: Glyph,
  accent,
  selected,
  locale,
  min,
  max,
  onSelect,
  onClear,
}: {
  title: string;
  /**
   * The heading's glyph. A due date and a start date are the same picker and
   * not the same idea, and the icon is the cheapest place to say so.
   */
  icon: LucideIcon;
  /** Tailwind text colour for that glyph. */
  accent: string;
  selected: string | null;
  locale: string;
  /** Earliest selectable day, `YYYY-MM-DD`. */
  min?: string;
  /** Latest selectable day, `YYYY-MM-DD`. */
  max?: string;
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

  // String comparison, because the format is fixed-width and big-endian — the
  // same rule every date comparison in the app follows.
  const blocked = (day: string) =>
    (min !== undefined && day < min) || (max !== undefined && day > max);

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <Glyph className={cn("size-4 shrink-0", accent)} />
        <h3 className="text-ink text-sm font-semibold">{title}</h3>

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
          grid, so it stays — but only as the text field, not as the picker.
          `min`/`max` are honoured by the browser's own validation too. */}
      <input
        type="date"
        value={selected ?? ""}
        min={min}
        max={max}
        onChange={(event) =>
          event.target.value &&
          !blocked(event.target.value) &&
          onSelect(event.target.value)
        }
        aria-label={title}
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
          const isBlocked = blocked(day);

          return (
            <button
              key={day}
              type="button"
              disabled={isBlocked}
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
                // Out of range: struck through rather than merely dimmed, so it
                // reads as "not allowed" rather than "outside this month".
                isBlocked &&
                  "text-ink-3/30 cursor-not-allowed line-through hover:bg-transparent",
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

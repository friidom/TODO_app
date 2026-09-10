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

// shared by start date and due date — min/max disable days that'd invert the range before the DB constraint has to reject it
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
  icon: LucideIcon;
  accent: string;
  selected: string | null;
  locale: string;
  min?: string;
  max?: string;
  onSelect: (day: string) => void;
  onClear: () => void;
}) {
  const today = todayISO();

  const [view, setView] = useState(() => {
    const [year, month] = (selected ?? today).split("-").map(Number);

    return { year, month: month - 1 };
  });

  // en is the only Sunday-first locale here; ru/uz start Monday
  const weekStartsOn = locale.startsWith("en") ? 0 : 1;
  const grid = monthGrid(view.year, view.month, weekStartsOn);

  const heading = new Date(
    Date.UTC(view.year, view.month, 1),
  ).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const weekdays = grid.slice(0, 7).map((entry) =>
    new Date(`${entry.day}T00:00:00.000Z`).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );

  // string comparison works because YYYY-MM-DD is fixed-width and big-endian
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
            className="text-ink-3 text-micro grid h-7 place-items-center font-semibold uppercase"
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
                "rounded-control text-meta grid h-8 place-items-center transition-colors",
                isSelected
                  ? "bg-brand text-brand-fg font-semibold"
                  : inMonth
                    ? "text-ink hover:bg-ink/10"
                    : "text-ink-3 hover:bg-ink/5",
                isToday && !isSelected && "ring-brand/60 ring-1 ring-inset",
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

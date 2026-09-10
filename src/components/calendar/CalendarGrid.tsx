import { useMemo } from "react";

import type { BoardMember } from "@/services/members/membersApi";
import {
  isSameMonth,
  weekdayNames,
  type CalendarLayout,
} from "@/services/views/calendar";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import DayCell from "./DayCell";

// one component for month and week — they only differ in row count and row height, everything else would drift if duplicated
export default function CalendarGrid({
  days,
  anchor,
  layout,
  byDay,
  today,
  keyPrefix,
  memberById,
  canEdit,
  onOpenTask,
  onOpenDay,
  locale,
}: {
  days: string[];
  anchor: string;
  layout: CalendarLayout;
  byDay: Map<string, Todo[]>;
  today: string;
  keyPrefix: string;
  memberById: Map<string, BoardMember>;
  canEdit: boolean;
  onOpenTask: (id: string) => void;
  onOpenDay: (day: string) => void;
  locale?: string;
}) {
  const weekdays = useMemo(() => weekdayNames(locale), [locale]);

  return (
    <div className="border-hairline rounded-surface bg-surface flex min-h-0 flex-1 flex-col overflow-hidden border">
      <div className="border-hairline bg-canvas grid shrink-0 grid-cols-7 border-b">
        {weekdays.map((name, i) => (
          <div
            key={name}
            className={cn(
              "text-ink-3/70 text-micro truncate px-2 py-1.5 font-medium tracking-[0.08em] uppercase",
              i >= 5 && "text-ink-3/45",
            )}
          >
            {name}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-7",
          // minmax floor, not 1fr — 1fr would clamp a busy day's "+2 more" button off a short viewport
          layout === "month"
            ? "auto-rows-[minmax(7.25rem,auto)] overflow-y-auto"
            : "grid-rows-1 overflow-hidden",
        )}
      >
        {days.map((day) => (
          <DayCell
            key={day}
            day={day}
            todos={byDay.get(day) ?? []}
            layout={layout}
            inMonth={layout === "week" || isSameMonth(day, anchor)}
            isToday={day === today}
            keyPrefix={keyPrefix}
            memberById={memberById}
            canEdit={canEdit}
            onOpenTask={onOpenTask}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
}

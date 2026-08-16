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

/**
 * The day grid, in either layout (M19).
 *
 * **One component for month and week**, because they differ in two numbers and
 * nothing else: how many days a row holds, and how tall a row is. Writing them
 * as two components would mean the weekday header, the today rule, the padding
 * rule and the drop targets each existed twice and could drift.
 *
 * **The month grid is always six rows** (`monthMatrix` guarantees 42 days), so
 * paging from February to March does not change the grid's height and no cell
 * moves under the pointer. That is the layout-shift rule the brief states,
 * applied to the one place a calendar usually breaks it.
 */
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
      {/* The weekday header, deliberately the quietest row here — the same
          treatment the list's column header gets, and for the same reason: it
          names seven columns once and then has to stop competing with what is
          in them. */}
      <div className="border-hairline bg-canvas grid shrink-0 grid-cols-7 border-b">
        {weekdays.map((name, i) => (
          <div
            key={name}
            className={cn(
              "text-ink-3/70 truncate px-2 py-1.5 text-[10px] font-medium tracking-[0.08em] uppercase",
              // Saturday and Sunday, muted one more step. Not coloured — a
              // weekend is not a warning, and the semantic palette is reserved
              // for status.
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
          // **`minmax(7.25rem, auto)`, not `1fr`.** A row sized purely by
          // fraction clamps to the space available, so on a short viewport a
          // cell holding three items plus a "+2 more" would clip the button —
          // the overflow affordance disappearing exactly when it is needed.
          // The floor keeps an empty month looking like a calendar rather than
          // a spreadsheet; `auto` lets a busy row take the height it needs and
          // the grid scroll. The row heights only diverge once some day
          // overflows, and the item limit bounds how far.
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

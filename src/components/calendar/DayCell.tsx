import { useDroppable } from "@dnd-kit/core";

import type { BoardMember } from "@/services/members/membersApi";
import type { CalendarLayout } from "@/services/views/calendar";
import { DAY_ITEM_LIMIT } from "@/services/views/calendar";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import CalendarChip from "./CalendarChip";

/**
 * One day, as a droppable cell (M19).
 *
 * **The drop target is the whole cell**, not a gap between items. A calendar
 * drop answers "which day", and a day has no internal order to aim at — the
 * board's gap-based `collisionDetection` exists because dropping between two
 * cards means something there, and it means nothing here. That is why the
 * calendar's DnD is `closestCenter` over big rectangles rather than a second
 * copy of `useKanbanDnd`.
 *
 * **The overflow rule, applied.** `DAY_ITEM_LIMIT` items are listed and the
 * rest become one control that opens the day in the week layout. Decided once
 * in the pure module because M19 states it recurs in both layouts — and the
 * week's limit is infinite, so the branch below simply never fires there and
 * the cell scrolls instead. The escalation has to stop at the surface it
 * escalates *to*.
 */
export default function DayCell({
  day,
  todos,
  layout,
  inMonth,
  isToday,
  keyPrefix,
  memberById,
  canEdit,
  onOpenTask,
  onOpenDay,
}: {
  day: string;
  todos: Todo[];
  layout: CalendarLayout;
  /** False for the padding days a month grid borrows from its neighbours. */
  inMonth: boolean;
  isToday: boolean;
  keyPrefix: string;
  memberById: Map<string, BoardMember>;
  canEdit: boolean;
  onOpenTask: (id: string) => void;
  /** "+N more" — switches to the week containing this day. */
  onOpenDay: (day: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${day}`,
    data: { day },
  });

  const limit = DAY_ITEM_LIMIT[layout];
  const shown = todos.slice(0, limit);
  const hidden = todos.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-hairline flex min-w-0 flex-col gap-1 border-r border-b p-1.5 transition-colors",
        // The week cell is one row tall and owns the scroll; the month cell is
        // sized by the row track and never scrolls itself.
        layout === "week" && "min-h-0",
        // A padding day is still a real day you can drop on — a task due the
        // 1st belongs on the 1st whichever grid you are looking at — so it is
        // dimmed rather than disabled.
        !inMonth && "bg-ink/[0.02]",
        // The only thing a hover changes is the fill. No border width, no
        // ring, no transform: a cell that grows under the pointer would move
        // its neighbours mid-drag.
        isOver && "bg-brand-soft",
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-mini grid size-5 shrink-0 place-items-center rounded-full tabular-nums",
            isToday && "bg-brand text-brand-fg font-semibold",
            !isToday && inMonth && "text-ink-2",
            !isToday && !inMonth && "text-ink-3/50",
          )}
        >
          {Number(day.slice(8, 10))}
        </span>

        {/* The count sits in the header rather than under the list, so a cell
            that is overflowing says so before you have finished reading it. */}
        {todos.length > 0 && (
          <span className="text-ink-3/70 text-micro ml-auto shrink-0 tabular-nums">
            {todos.length}
          </span>
        )}
      </div>

      {/* Only the week cell scrolls — it has no item limit, so this is where a
          busy day is actually read. A month cell never scrolls, because a
          scrollbar in one of thirty-five boxes is invisible until you are
          already inside it; it shows three and hands the day over. */}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          layout === "week" && "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {shown.map((todo) => (
          <CalendarChip
            key={todo.id}
            todo={todo}
            keyPrefix={keyPrefix}
            assignee={
              todo.assignee_id ? memberById.get(todo.assignee_id) : undefined
            }
            draggable={canEdit}
            onOpen={() => onOpenTask(todo.id)}
          />
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => onOpenDay(day)}
            className="text-ink-3 hover:text-brand hover:bg-ink/[0.05] focus-visible:ring-brand rounded-control text-micro h-5 px-1.5 text-left font-medium transition-colors outline-none focus-visible:ring-2"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

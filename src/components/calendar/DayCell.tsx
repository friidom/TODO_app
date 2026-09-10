import { useDroppable } from "@dnd-kit/core";

import type { BoardMember } from "@/services/members/membersApi";
import type { CalendarLayout } from "@/services/views/calendar";
import { DAY_ITEM_LIMIT } from "@/services/views/calendar";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import CalendarChip from "./CalendarChip";

// drop target is the whole cell, not a gap — a day has no internal order to drop between
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
  inMonth: boolean;
  isToday: boolean;
  keyPrefix: string;
  memberById: Map<string, BoardMember>;
  canEdit: boolean;
  onOpenTask: (id: string) => void;
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
        layout === "week" && "min-h-0",
        // padding day, still droppable — dimmed, not disabled
        !inMonth && "bg-ink/[0.02]",
        // only the fill changes on hover — a growing cell would shove neighbours mid-drag
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

        {todos.length > 0 && (
          <span className="text-ink-3/70 text-micro ml-auto shrink-0 tabular-nums">
            {todos.length}
          </span>
        )}
      </div>

      {/* only the week cell scrolls — a scrollbar in one of thirty-five month boxes is invisible until you're in it */}
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

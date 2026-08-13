import { DragOverlay } from "@dnd-kit/core";

import TodoItem from "../todo/TodoItem";
import { cn } from "@/utils/cn";

import type { IColumn, ISupabaseTodo } from "@/types/data";
import { columnTitle } from "@/constants/columns";

interface Props {
  activeTodo: ISupabaseTodo | null;
  activeColumn?: IColumn | null;
  todosCount?: number;
  /** Mirrors the rail the user actually grabbed. */
  columnCollapsed?: boolean;
}

export default function TodoDragOverlay({
  activeTodo,
  activeColumn = null,
  todosCount = 0,
  columnCollapsed = false,
}: Props) {
  return (
    <DragOverlay dropAnimation={null} adjustScale={false}>
      {activeTodo && (
        <TodoItem
          {...activeTodo}
          overlay
        />
      )}

      {activeColumn && (
        <div
          className={cn(
            "rounded-xl bg-surface shadow-xl",
            columnCollapsed
              ? "flex w-14 flex-col items-center gap-3 py-3"
              : "w-[280px] px-3 py-3",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              columnCollapsed && "flex-col",
            )}
          >
            <h2
              className="text-[15px] font-semibold text-ink"
              style={
                columnCollapsed ? { writingMode: "vertical-rl" } : undefined
              }
            >
              {columnTitle(activeColumn.title)}
            </h2>

            <span className="shrink-0 rounded bg-ink/10 px-1.5 py-0.5 text-xs font-semibold text-ink-2">
              {todosCount}
            </span>
          </div>
        </div>
      )}
    </DragOverlay>
  );
}

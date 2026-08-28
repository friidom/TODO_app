import { DragOverlay } from "@dnd-kit/core";

import TodoItem from "../todo/TodoItem";
import { cn } from "@/utils/cn";

import type { IColumn, Todo } from "@/types/data";
import { columnTitle } from "@/constants/columns";

interface Props {
  activeTodo: Todo | null;
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
      {activeTodo && <TodoItem todo={activeTodo} overlay />}

      {activeColumn && (
        <div
          className={cn(
            "bg-surface rounded-xl shadow-e2",
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
              className="text-ink text-sm font-semibold"
              style={
                columnCollapsed ? { writingMode: "vertical-rl" } : undefined
              }
            >
              {columnTitle(activeColumn.title)}
            </h2>

            <span className="bg-ink/10 text-ink-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold">
              {todosCount}
            </span>
          </div>
        </div>
      )}
    </DragOverlay>
  );
}

import { DragOverlay } from "@dnd-kit/core";

import TodoItem from "../todo/TodoItem";
import {
  COLUMN_TITLE,
  COLUMN_WIDTH,
  COUNT_CHIP,
} from "@/components/columns/columnChrome";
import {
  categoryOf,
  columnTitle,
  type ColumnCategory,
} from "@/constants/columns";
import { useCardLabels } from "@/hooks/useCardLabels";
import { useSubtaskProgressByParent } from "@/services/todos/useSubtasks";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";

interface Props {
  activeTodo: Todo | null;
  activeColumn?: IColumn | null;
  activeColumnCategory?: ColumnCategory | null;
  todosCount?: number;
  /** Mirrors the rail the user actually grabbed. */
  columnCollapsed?: boolean;
}

export default function TodoDragOverlay({
  activeTodo,
  activeColumn = null,
  activeColumnCategory = null,
  todosCount = 0,
  columnCollapsed = false,
}: Props) {
  const subtaskProgress = useSubtaskProgressByParent();
  const progress = activeTodo ? subtaskProgress.get(activeTodo.id) : undefined;
  const cardLabels = useCardLabels();

  return (
    // the lifted content is pointer-events-none, so the cursor has to come from this wrapper
    <DragOverlay
      dropAnimation={null}
      adjustScale={false}
      className="cursor-grabbing"
    >
      {activeTodo && (
        <TodoItem
          todo={activeTodo}
          overlay
          subtaskDone={progress?.done ?? 0}
          subtaskTotal={progress?.total ?? 0}
          parentLabel={cardLabels.parents.get(activeTodo.parent_id ?? "")}
          sprintLabel={cardLabels.sprints.get(activeTodo.sprint_id ?? "")}
        />
      )}

      {activeColumn && (
        <div
          className={cn(
            "rounded-surface border-hairline bg-surface shadow-e3 pointer-events-none border",
            columnCollapsed
              ? "flex w-11 flex-col items-center gap-2 py-3.5"
              : cn(COLUMN_WIDTH, "flex h-12 items-center gap-2 px-4.5"),
          )}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              categoryOf(activeColumnCategory).dot,
            )}
          />

          <h2
            className={COLUMN_TITLE}
            style={columnCollapsed ? { writingMode: "vertical-rl" } : undefined}
          >
            {columnTitle(activeColumn.title)}
          </h2>

          <span className={COUNT_CHIP}>{todosCount}</span>
        </div>
      )}
    </DragOverlay>
  );
}

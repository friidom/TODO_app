import { DragOverlay } from "@dnd-kit/core";
import { t } from "i18next";

import TodoItem from "../todo/TodoItem";

import type { IColumn, ISupabaseTodo } from "@/types/data";

interface Props {
  activeTodo: ISupabaseTodo | null;
  activeColumn?: IColumn | null;
  todosCount?: number;
}

export default function TodoDragOverlay({
  activeTodo,
  activeColumn = null,
  todosCount = 0,
}: Props) {
  return (
    <DragOverlay dropAnimation={null} adjustScale={false}>
      {activeTodo && (
        <TodoItem
          {...activeTodo}
          overlay
          menuOpen={false}
          openMenu={() => {}}
          closeMenu={() => {}}
        />
      )}

      {activeColumn && (
        <div className="w-[280px]  rounded-xl bg-[#f8f8f8] px-5 py-4 shadow-xl">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-700">
              {t(activeColumn.title)}
            </h2>

            <span className="rounded-md bg-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-600">
              {todosCount}
            </span>
          </div>
        </div>
      )}
    </DragOverlay>
  );
}

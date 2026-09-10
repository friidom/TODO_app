import { ChevronRightIcon, ListTreeIcon } from "lucide-react";

import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useTodos } from "@/services/todos/useTodos";
import { taskKey } from "@/utils/taskKey";

// breadcrumb for a genuine Subtask only — an Epic-parented row shows its parent in the Details rail instead
export default function ParentLine({
  parentId,
  boardId,
}: {
  parentId: string | null;
  boardId: string;
}) {
  const { openTask } = useOpenTask();
  const { data: todos = [] } = useTodos();
  const keyPrefix = useKeyPrefix();

  if (parentId === null) return null;

  const parent = todos.find(
    (todo) => todo.id === parentId && todo.board_id === boardId,
  );

  if (parent?.type === "Epic") return null;

  const key = parent ? taskKey(keyPrefix, parent.board_key) : null;

  return (
    <p className="text-ink-3 mb-3 flex min-w-0 items-center gap-1 text-xs">
      <ListTreeIcon className="size-3.5 shrink-0" />

      {parent ? (
        <>
          <button
            type="button"
            onClick={() => openTask(parent.id)}
            title={`Open ${key ?? parent.title ?? "the parent task"}`}
            className="hover:text-brand focus-visible:ring-brand min-w-0 truncate rounded font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {key ? `${key} ` : ""}
            {parent.title || "Untitled"}
          </button>

          <ChevronRightIcon className="text-ink-3/60 size-3 shrink-0" />

          <span className="shrink-0">Subtask</span>
        </>
      ) : (
        // board array not loaded yet, or (shouldn't happen — fk cascades) the parent is gone
        <span className="italic">Subtask of a task</span>
      )}
    </p>
  );
}

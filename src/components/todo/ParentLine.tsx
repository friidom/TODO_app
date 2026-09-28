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
    <>
      {parent ? (
        <button
          type="button"
          onClick={() => openTask(parent.id)}
          title={`Open ${key ?? parent.title ?? "the parent task"}`}
          className="text-ink-3 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand rounded-control text-meta -ml-1.5 flex h-7 max-w-64 min-w-0 items-center gap-1.5 px-1.5 transition-colors duration-150 outline-none focus-visible:ring-2"
        >
          <ListTreeIcon className="size-3.5 shrink-0" />
          {key && <span className="shrink-0 tabular-nums">{key}</span>}
          <span className="min-w-0 truncate">{parent.title || "Untitled"}</span>
        </button>
      ) : (
        // board array not loaded yet, or (shouldn't happen — fk cascades) the parent is gone
        <span className="text-ink-3 text-meta flex shrink-0 items-center gap-1.5 italic">
          <ListTreeIcon className="size-3.5 shrink-0" />
          Subtask of a task
        </span>
      )}

      <ChevronRightIcon className="text-ink-3/60 size-3.5 shrink-0" />
    </>
  );
}

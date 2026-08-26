import { ChevronRightIcon, ListTreeIcon } from "lucide-react";

import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useTodos } from "@/services/todos/useTodos";
import { taskKey } from "@/utils/taskKey";

/**
 * "You are inside KAN-9" — the breadcrumb at the top of a subtask's panel
 * (M27).
 *
 * **Renders nothing for a top-level card**, which is most of them, so the
 * caller can mount it unconditionally rather than repeating the null check.
 *
 * The parent is resolved out of the board's own array rather than fetched.
 * `fetchTodos` returns every row on the board, subtasks included (see its own
 * comment), so the parent of anything openable is already in the cache — and
 * resolving it there means the crumb updates when the parent is renamed
 * without a second query to invalidate.
 *
 * Clicking it is `openTask(parentId)`, the same `?task=` param the rest of
 * the app navigates by. `Overlay` is keyed on the task id, so the modal
 * remounts on the parent and no draft can leak between the two. Each hop
 * pushes a history entry, so Back walks the chain — which is the correct
 * reading of a breadcrumb as *navigation* rather than as a dismissal.
 */
export default function ParentLine({
  parentId,
  boardId,
}: {
  parentId: string | null;
  /**
   * Taken from the child rather than the route, so the crumb and the row it
   * describes can never disagree about which board they are on.
   */
  boardId: string;
}) {
  const { openTask } = useOpenTask();
  const { data: todos = [] } = useTodos();
  const keyPrefix = useKeyPrefix();

  if (parentId === null) return null;

  const parent = todos.find(
    (todo) => todo.id === parentId && todo.board_id === boardId,
  );

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
        // The board's array has not arrived, or the parent is genuinely gone.
        // The second should be impossible — the foreign key cascades, so a
        // deleted parent takes its children with it — but a row is easier to
        // reason about than a race, and saying "a task" is honest either way.
        <span className="italic">Subtask of a task</span>
      )}
    </p>
  );
}

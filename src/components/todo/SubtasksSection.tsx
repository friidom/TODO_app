import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ListTreeIcon,
  PlusIcon,
} from "lucide-react";

import AssigneeControl from "./TodoItem/AssigneeControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useAddSubtask } from "@/services/todos/useAddSubtask";
import { useSubtasks } from "@/services/todos/useSubtasks";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

/**
 * The grid every row of the subtask table shares, header included (M27).
 *
 * Modelled on `listGrid.ts` and narrower for the same reason it is: only the
 * title is elastic, `minmax(0,1fr)` is what allows it to truncate, and the
 * metadata columns are fixed so the four tracks line up down the table. The
 * reference's own columns are Work · Priority · Assignee · Status, which is
 * this order with the key folded into Work.
 */
const SUBTASK_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_1.5rem_1.5rem_7.5rem]";

/**
 * One task's subtasks (M27) — the section the Jira reference puts between the
 * description and Activity, and where this one goes too.
 *
 * **It renders nothing for a subtask.** Two levels is the whole hierarchy, so
 * a subtask has no children and must not be offered any: the caller decides
 * that with `canHaveSubtasks`, and this component is simply not mounted. The
 * database refuses the write regardless (`enforce_subtask_depth`), which is
 * what makes the UI's job "do not offer" rather than "do not allow".
 *
 * **Progress is the existing status system, not a second one.** A subtask is
 * done when its column's category is `done` — M2-15's rule, which deleted
 * `todos.completed` so that doneness could have exactly one definition. `0/1`
 * and the bar both come from `subtaskProgress`, which is where that is
 * computed and tested.
 *
 * **Every cell is the control the rest of the app already uses**, wired to the
 * same `useTodoPatch`, so a status set here is the same write a drag performs
 * and there is no second path. For a viewer they are inert rather than absent
 * — `ListRow`'s `pointer-events-none` idiom — so the table looks identical
 * whatever your role, while the create affordance is hidden outright, which
 * is what every other row-creating control in this app does.
 */
export default function SubtasksSection({ todo }: { todo: Todo }) {
  const { subtasks, progress, isPending } = useSubtasks(todo.id);
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} subtasks`}
          onClick={() => setCollapsed((open) => !open)}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand -ml-1 rounded p-1 transition-colors outline-none focus-visible:ring-2"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </button>

        <h3 className="text-ink-3 text-mini font-semibold tracking-[0.08em] uppercase">
          Subtasks
        </h3>

        {/* The count stays visible while collapsed, deliberately: closing the
            section is not the same as hiding what it holds — the same choice
            `UndatedStrip` makes for its own count. */}
        {progress.total > 0 && (
          <span className="bg-ink/10 text-ink-3 text-mini shrink-0 rounded px-1.5 py-0.5 font-semibold tabular-nums">
            {progress.done}/{progress.total}
          </span>
        )}

        {canEditTodos && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setAdding(true);
            }}
            aria-label="Add subtask"
            title="Add subtask"
            className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand ml-auto grid size-6 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
          >
            <PlusIcon className="size-4" />
          </button>
        )}
      </div>

      {/* The bar reads as "how much of this task is finished" and so belongs
          above the fold with the count, not inside the collapsed body. The
          track is `SummaryCard`'s and `StatusOverview`'s, unchanged. */}
      {progress.total > 0 && (
        <div
          className="bg-ink/[0.06] mb-3 h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`${progress.done} of ${progress.total} subtasks done`}
        >
          <div
            style={{ width: `${progress.percent}%` }}
            className="bg-status-green h-full rounded-full transition-[width] duration-300"
          />
        </div>
      )}

      {!collapsed && (
        <>
          {isPending ? (
            <div className="space-y-2" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : subtasks.length === 0 && !adding ? (
            <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
              <ListTreeIcon className="size-4 shrink-0" />
              <span>
                No subtasks yet.
                {canEditTodos && " Break this task down with the + above."}
              </span>
            </div>
          ) : (
            subtasks.length > 0 && (
              <div
                role="table"
                aria-label="Subtasks"
                className="border-hairline rounded-card overflow-hidden border"
              >
                <div
                  role="row"
                  className={cn(
                    SUBTASK_GRID,
                    "border-hairline text-ink-3/70 text-micro bg-surface/40 h-8 border-b font-medium tracking-[0.08em] uppercase",
                  )}
                >
                  <span role="columnheader">Work</span>
                  <span role="columnheader">
                    {/* `sr-only` on a nested span, never on the grid item —
                        it is `position: absolute`, which would take the cell
                        out of the grid and slide every column along one. */}
                    <span className="sr-only">Title</span>
                  </span>
                  <span role="columnheader">
                    <span className="sr-only">Priority</span>
                  </span>
                  <span role="columnheader">
                    <span className="sr-only">Assignee</span>
                  </span>
                  <span role="columnheader">Status</span>
                </div>

                {subtasks.map((subtask) => (
                  <SubtaskRow key={subtask.id} subtask={subtask} />
                ))}
              </div>
            )
          )}

          {adding && (
            <AddSubtaskRow
              parent={todo}
              onDone={() => setAdding(false)}
              hasRows={subtasks.length > 0}
            />
          )}
        </>
      )}
    </section>
  );
}

/** One subtask: its key, its title, and the three controls the reference shows. */
function SubtaskRow({ subtask }: { subtask: Todo }) {
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(subtask);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), subtask.board_key);

  // Inert rather than absent for a viewer, so the table reads identically
  // whatever your role — `ListRow`'s own idiom.
  const inert = canEditTodos ? undefined : "pointer-events-none";

  return (
    <div
      role="row"
      className={cn(
        SUBTASK_GRID,
        "border-hairline group hover:bg-ink/[0.035] h-11 border-b transition-colors duration-150 last:border-b-0",
      )}
    >
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(subtask.id)}
            title={`Open ${key}`}
            className="text-ink-3/80 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          // The key is allocated by a trigger, so its absence is the moment a
          // just-created subtask is still in flight.
          <span className="text-ink-3/40 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={() => openTask(subtask.id)}
          title={subtask.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {subtask.title || <span className="text-ink-3/60">Untitled</span>}
        </button>
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <PriorityControl
          bare
          value={subtask.priority}
          onChange={(priority) => patch({ priority })}
        />
      </div>

      <div role="cell" className={cn("flex", inert)}>
        <AssigneeControl
          boardId={subtask.board_id}
          value={subtask.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      </div>

      <div role="cell" className={cn("flex min-w-0", inert)}>
        <StatusControl todoId={subtask.id} columnId={subtask.column_id} />
      </div>
    </div>
  );
}

/**
 * The create affordance: a title, and nothing else.
 *
 * Everything a subtask needs beyond a title it inherits or defaults —
 * the parent's column so it has a status, `Task` as its type, no assignee, no
 * priority. Asking for any of that up front would make creating one a form,
 * and the reference's own flow is a single line of text.
 *
 * **The parent is never chosen.** It is the task whose panel this is, which
 * is the requirement stated plainly: the user should not have to select one.
 */
function AddSubtaskRow({
  parent,
  onDone,
  hasRows,
}: {
  parent: Todo;
  onDone: () => void;
  hasRows: boolean;
}) {
  const [title, setTitle] = useState("");
  const add = useAddSubtask();

  const value = title.trim();

  function submit() {
    if (value === "") {
      onDone();
      return;
    }

    // A subtask with no column would have no status, and status is what the
    // progress count is derived from — so a parent that somehow has no column
    // cannot have subtasks created under it. In practice `column_id` is null
    // only for the instant a card is in flight.
    if (!parent.column_id) return;

    add.mutate({
      title: value,
      parentId: parent.id,
      columnId: parent.column_id,
    });

    // Cleared immediately rather than in `onSuccess`: the write is optimistic
    // so the row is already in the table above, and leaving the text in the
    // box would show it twice and invite a second create. The composer stays
    // open, because adding several subtasks in a row is the common case.
    setTitle("");
  }

  return (
    <div className={cn("flex items-center gap-2", hasRows ? "mt-2" : "mt-0")}>
      <input
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();

          if (event.key === "Escape") {
            // Marked handled so the modal's own listener does not take the
            // whole task with it — the rule every nested dismissible follows.
            event.preventDefault();
            onDone();
          }
        }}
        onBlur={submit}
        placeholder="What needs doing?"
        aria-label="Subtask title"
        className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-control min-w-0 flex-1 border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2"
      />

      <button
        type="button"
        // `onMouseDown` rather than `onClick`: the input's own `onBlur`
        // submits, and by the time a click fires this button has already
        // been unmounted by it.
        onMouseDown={onDone}
        className="text-ink-3 hover:text-ink rounded-control shrink-0 px-2 py-1 text-xs font-medium"
      >
        Done
      </button>
    </div>
  );
}

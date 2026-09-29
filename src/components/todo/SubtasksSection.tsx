import { useState } from "react";
import { ListTreeIcon, PlusIcon } from "lucide-react";

import SectionHeader, { EmptyLine } from "./SectionHeader";
import AssigneeControl from "./TodoItem/AssigneeControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import {
  INLINE_ACTION,
  TABLE,
  TABLE_HEAD,
  TABLE_ROW,
  TEXT_FIELD,
} from "./detailChrome";
import IconButton from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useAddSubtask } from "@/services/todos/useAddSubtask";
import { useSubtasks } from "@/services/todos/useSubtasks";
import { entryStatus } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

const SUBTASK_GRID =
  "grid items-center gap-x-2 px-3 grid-cols-[3.75rem_minmax(0,1fr)_1.5rem_1.5rem_7.5rem]";

export default function SubtasksSection({ todo }: { todo: Todo }) {
  const { subtasks, progress, isPending } = useSubtasks(todo.id);
  const { canEditTodos } = usePermissions();

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <SectionHeader
        title="Subtasks"
        count={progress.total > 0 ? `${progress.done}/${progress.total}` : null}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((open) => !open),
          noun: "subtasks",
        }}
        actions={
          canEditTodos && (
            <IconButton
              label="Add subtask"
              onClick={() => {
                setCollapsed(false);
                setAdding(true);
              }}
            >
              <PlusIcon />
            </IconButton>
          )
        }
      />

      {progress.total > 0 && (
        <div
          className="bg-wash-strong mb-3 h-1 overflow-hidden rounded-full"
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
            <EmptyLine icon={ListTreeIcon}>
              <span>
                No subtasks yet.
                {canEditTodos && " Break this task down with the + above."}
              </span>
            </EmptyLine>
          ) : (
            subtasks.length > 0 && (
              <div role="table" aria-label="Subtasks" className={TABLE}>
                <div role="row" className={cn(SUBTASK_GRID, TABLE_HEAD)}>
                  <span role="columnheader">Work</span>
                  <span role="columnheader">
                    {/* sr-only on the span, not the grid item, or it'd drop out of the grid */}
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

function SubtaskRow({ subtask }: { subtask: Todo }) {
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(subtask);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), subtask.board_key);

  // viewers get inert controls, not hidden ones, so the table looks the same for everyone
  const inert = canEditTodos ? undefined : "pointer-events-none";

  return (
    <div role="row" className={cn(SUBTASK_GRID, TABLE_ROW, "group h-11")}>
      <div role="cell" className="min-w-0">
        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(subtask.id)}
            title={`Open ${key}`}
            className="text-ink-3 hover:text-brand focus-visible:ring-brand text-mini block truncate rounded font-medium tabular-nums transition-colors outline-none focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          // no key yet means the create is still in flight
          <span className="text-ink-3/50 text-mini">—</span>
        )}
      </div>

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={() => openTask(subtask.id)}
          title={subtask.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {subtask.title || <span className="text-ink-3">Untitled</span>}
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
        <StatusControl todoId={subtask.id} statusId={subtask.status_id} />
      </div>
    </div>
  );
}

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
  const { data: statuses = [] } = useStatuses();

  const value = title.trim();

  // A subtask starts in its parent's status — unless that status is hidden,
  // which new work cannot enter; then the first visible one in its column.
  const parentStatus = statuses.find(
    (status) => status.id === parent.status_id,
  );
  const startIn =
    parentStatus && !parentStatus.is_hidden
      ? parentStatus
      : parentStatus?.column_id
        ? entryStatus(statuses, parentStatus.column_id)
        : null;

  function submit() {
    if (value === "") {
      onDone();
      return;
    }

    // no status on the parent means none to inherit — shouldn't happen outside a create in flight
    if (!startIn) return;

    add.mutate({
      title: value,
      parentId: parent.id,
      statusId: startIn.id,
    });

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
            // stop it bubbling to the modal's Escape handler, or this closes the task too
            event.preventDefault();
            onDone();
          }
        }}
        onBlur={submit}
        placeholder="What needs doing?"
        aria-label="Subtask title"
        className={cn(
          TEXT_FIELD,
          "rounded-control h-8 min-w-0 flex-1 px-2.5 text-sm",
        )}
      />

      <button
        type="button"
        // mousedown, not click — the input's onBlur fires first and unmounts this button
        onMouseDown={onDone}
        className={cn(INLINE_ACTION, "py-1 text-xs")}
      >
        Done
      </button>
    </div>
  );
}

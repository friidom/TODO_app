import { useTranslation } from "react-i18next";
import { useMemo, useState, type ReactNode } from "react";
import { CornerDownLeftIcon, ListTreeIcon, PlusIcon } from "lucide-react";

import SectionHeader, { EmptyLine } from "./SectionHeader";
import {
  ChooseExisting,
  SubtaskColumnsMenu,
  SubtaskOptionsMenu,
} from "./SubtaskControls";
import AssigneeControl from "./TodoItem/AssigneeControl";
import DueDateControl from "./TodoItem/DueDateControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import StatusControl from "./TodoItem/StatusControl";
import { INLINE_ACTION, TABLE, TABLE_HEAD, TABLE_ROW } from "./detailChrome";
import IconButton from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/skeleton";
import { workTypeOf } from "@/constants/workTypes";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useAddSubtask } from "@/services/todos/useAddSubtask";
import { useSubtasks } from "@/services/todos/useSubtasks";
import {
  SUBTASK_COLUMN_LABELS,
  arrangeSubtasks,
  subtaskGrid,
  type SubtaskColumnId,
} from "@/services/todos/subtaskTable";
import { subtaskStartStatus } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { useSubtaskTable } from "@/stores/subtaskTable";
import type { IStatus, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

const NO_STATUSES: IStatus[] = [];

const ROW = "grid items-center gap-x-2 px-3";

export default function SubtasksSection({ todo }: { todo: Todo }) {
  const { t } = useTranslation();
  const { subtasks, progress, isPending } = useSubtasks(todo.id);
  const { canEditTodos } = usePermissions();
  const { data: statuses = NO_STATUSES } = useStatuses();
  const prefs = useSubtaskTable((state) => state.prefs);

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  // Hide done and the sort only shape what is listed — the progress above still counts every subtask.
  const rows = useMemo(
    () => arrangeSubtasks(subtasks, prefs, statuses),
    [subtasks, prefs, statuses],
  );

  const grid = subtaskGrid(prefs.columns);

  return (
    <section>
      <SectionHeader
        title={t("subtasks.title")}
        count={progress.total > 0 ? `${progress.done}/${progress.total}` : null}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((open) => !open),
          noun: t("subtasks.title"),
        }}
        actions={
          <>
            {subtasks.length > 0 && (
              <>
                <SubtaskOptionsMenu />
                <SubtaskColumnsMenu />
              </>
            )}

            {canEditTodos && (
              <IconButton
                label={t("subtasks.add")}
                onClick={() => {
                  setCollapsed(false);
                  setAdding(true);
                }}
              >
                <PlusIcon />
              </IconButton>
            )}
          </>
        }
      />

      {progress.total > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div
            className="bg-wash-strong h-1 min-w-0 flex-1 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label={t("subtasks.progress", {
              done: progress.done,
              count: progress.total,
            })}
          >
            <div
              style={{ width: `${progress.percent}%` }}
              className="bg-status-green h-full rounded-full transition-[width] duration-300"
            />
          </div>

          <span className="text-ink-3 text-mini shrink-0 tabular-nums">
            {t("common.percentDone", { percent: progress.percent })}
          </span>
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
          ) : subtasks.length === 0 ? (
            !adding &&
            (canEditTodos ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-ink-3 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand rounded-control text-meta -mx-1.5 flex h-8 w-full items-center px-1.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2"
              >
                {t("subtasks.add")}
              </button>
            ) : (
              <EmptyLine icon={ListTreeIcon}>
                <span>{t("subtasks.empty")}</span>
              </EmptyLine>
            ))
          ) : rows.length === 0 ? (
            <EmptyLine icon={ListTreeIcon}>
              <span>{t("subtasks.allDone")}</span>
            </EmptyLine>
          ) : (
            // The wrapper scrolls, not the table: in the narrow task panel the columns keep their widths and slide sideways.
            <div className="overflow-x-auto">
              <div
                role="table"
                aria-label={t("subtasks.title")}
                className={TABLE}
                style={{ minWidth: grid.minWidth }}
              >
                <div
                  role="row"
                  className={cn(ROW, TABLE_HEAD)}
                  style={{ gridTemplateColumns: grid.template }}
                >
                  <span role="columnheader">{t("fields.work")}</span>

                  {prefs.columns.map((id) => (
                    <span key={id} role="columnheader" className="truncate">
                      {SUBTASK_COLUMN_LABELS[id]}
                    </span>
                  ))}
                </div>

                {rows.map((subtask) => (
                  <SubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    columns={prefs.columns}
                    template={grid.template}
                  />
                ))}
              </div>
            </div>
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

function SubtaskRow({
  subtask,
  columns,
  template,
}: {
  subtask: Todo;
  columns: readonly SubtaskColumnId[];
  template: string;
}) {
  const { t } = useTranslation();
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(subtask);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), subtask.board_key);

  const workType = workTypeOf(subtask.type);
  const WorkTypeIcon = workType.icon;

  // viewers get inert controls, not hidden ones, so the table looks the same for everyone
  const inert = canEditTodos ? undefined : "pointer-events-none";

  const cells: Record<SubtaskColumnId, ReactNode> = {
    priority: (
      <PriorityControl
        variant="cell"
        value={subtask.priority}
        onChange={(priority) => patch({ priority })}
      />
    ),
    assignee: (
      <AssigneeControl
        variant="cell"
        boardId={subtask.board_id}
        value={subtask.assignee_id}
        onChange={(assignee_id) => patch({ assignee_id })}
      />
    ),
    status: (
      <StatusControl
        variant="lozenge"
        todoId={subtask.id}
        statusId={subtask.status_id}
      />
    ),
    estimate: (
      <EstimateControl
        variant="cell"
        value={subtask.estimate}
        onChange={(estimate) => patch({ estimate })}
      />
    ),
    due: (
      <DueDateControl
        variant="cell"
        value={subtask.due_date}
        notBefore={subtask.start_date}
        onChange={(due_date) => patch({ due_date })}
      />
    ),
  };

  return (
    <div
      role="row"
      className={cn(ROW, TABLE_ROW, "group h-11")}
      style={{ gridTemplateColumns: template }}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <WorkTypeIcon className={cn("size-4 shrink-0", workType.tone)} />

        {key !== null ? (
          <button
            type="button"
            onClick={() => openTask(subtask.id)}
            title={t("list.open", { key })}
            className="text-brand focus-visible:ring-brand text-meta shrink-0 rounded font-medium tabular-nums outline-none hover:underline focus-visible:ring-2"
          >
            {key}
          </button>
        ) : (
          // no key yet means the create is still in flight
          <span className="text-ink-3/50 text-mini shrink-0">—</span>
        )}

        <button
          type="button"
          onClick={() => openTask(subtask.id)}
          title={subtask.title ?? undefined}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta min-w-0 flex-1 truncate rounded text-left transition-colors outline-none focus-visible:ring-2"
        >
          {subtask.title || (
            <span className="text-ink-3">{t("common.untitled")}</span>
          )}
        </button>
      </div>

      {columns.map((id) => (
        <div key={id} role="cell" className={cn("flex min-w-0", inert)}>
          {cells[id]}
        </div>
      ))}
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
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const add = useAddSubtask();
  const { data: statuses } = useStatuses();

  const value = title.trim();

  function submit() {
    if (add.isPending) return;

    if (value === "") {
      onDone();
      return;
    }

    // not loaded yet: "no status" here would file an on-board parent's subtask nowhere
    if (!statuses) return;

    add.mutate(
      {
        title: value,
        parentId: parent.id,
        statusId: subtaskStartStatus(statuses, parent.status_id)?.id ?? null,
      },
      { onSuccess: () => setTitle("") },
    );
  }

  // onMouseDown on the buttons below keeps focus in the name field in browsers that do not focus a button on click,
  // so the row's blur cannot submit (or close) ahead of the click.
  return (
    <div
      onBlur={(event) => {
        const next = event.relatedTarget;

        if (event.currentTarget.contains(next)) return;

        // Choose existing opens a popover portalled outside this row — focus moving into it is not leaving.
        if (next instanceof Element && next.closest("[data-card-popover]")) {
          return;
        }

        submit();
      }}
      className={cn("space-y-2", hasRows ? "mt-2" : "mt-0")}
    >
      <div className="border-hairline bg-surface focus-within:border-brand focus-within:ring-brand rounded-control flex h-10 items-center gap-2 border pr-1.5 pl-3 transition-colors duration-150 focus-within:ring-2">
        <input
          value={title}
          autoFocus
          readOnly={add.isPending}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();

            if (event.key === "Escape") {
              // stop it bubbling to the modal's Escape handler, or this closes the task too
              event.preventDefault();
              onDone();
            }
          }}
          placeholder={t("subtasks.namePlaceholder")}
          aria-label={t("subtasks.itemTitle")}
          className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />

        <IconButton
          label={t("subtasks.create")}
          tooltip={false}
          disabled={value === "" || add.isPending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
        >
          <CornerDownLeftIcon />
        </IconButton>
      </div>

      <div className="flex items-center justify-between gap-2">
        <ChooseExisting parent={parent} onPicked={onDone} />

        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDone}
          className={cn(INLINE_ACTION, "text-meta py-1")}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

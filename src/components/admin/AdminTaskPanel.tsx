import { Link } from "react-router";
import { XIcon } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { COLUMN_CATEGORIES } from "@/constants/columns";
import { PRIORITIES } from "@/constants/priorities";
import { WORK_TYPES } from "@/constants/workTypes";
import { actionLabel, formatDuration, LOCALE } from "@/services/admin/format";
import { useAdminTodo } from "@/services/admin/useAdmin";
import type { AdminActivityRow } from "@/services/admin/types";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

export default function AdminTaskPanel({
  todoId,
  onClose,
}: {
  todoId: string;
  onClose: () => void;
}) {
  const { data, error, isLoading } = useAdminTodo(todoId);
  const todo = data?.todo;

  const key = todo
    ? (taskKey(todo.key_prefix, todo.board_key) ?? "Task")
    : "Task";

  return (
    <Modal title={key} onClose={onClose} width="w-[30rem]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink-3 text-micro font-semibold tracking-wide tabular-nums">
            {key}
          </p>
          {isLoading ? (
            <Skeleton className="mt-1.5 h-5 w-64" />
          ) : (
            <h2 className="text-ink mt-0.5 text-sm leading-snug font-semibold">
              {todo?.title ?? "Untitled"}
            </h2>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink-3 hover:text-ink hover:bg-wash rounded-control -mt-1 -mr-1 shrink-0 p-1 transition-colors"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {error ? (
        <p className="text-ink-3 mt-5 text-center text-xs">
          That task could not be loaded.
        </p>
      ) : isLoading || data === undefined || todo === undefined ? (
        <div className="mt-5 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="border-hairline mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border-t pt-4">
            <Field label="Board">
              <Link
                to={`/admin/boards/${todo.board_id}`}
                className="text-ink hover:text-brand truncate transition-colors"
              >
                {todo.board_title ?? "Untitled board"}
              </Link>
            </Field>

            {todo.space_id && (
              <Field label="Space">
                <Link
                  to={`/admin/spaces/${todo.space_id}`}
                  className="text-ink-2 hover:text-brand truncate transition-colors"
                >
                  {todo.space_title}
                </Link>
              </Field>
            )}

            <Field label="Status">
              <Chip
                className={
                  COLUMN_CATEGORIES[
                    (todo.category ?? "todo") as keyof typeof COLUMN_CATEGORIES
                  ]?.pill
                }
              >
                {todo.column_title ?? "Backlog"}
              </Chip>
            </Field>

            <Field label="Type">
              <Chip
                className={
                  WORK_TYPES[todo.type as keyof typeof WORK_TYPES]?.chip
                }
              >
                {todo.type}
              </Chip>
            </Field>

            <Field label="Priority">
              {todo.priority === null ? (
                <Dash />
              ) : (
                <Chip
                  className={
                    PRIORITIES[todo.priority as keyof typeof PRIORITIES]?.chip
                  }
                >
                  {PRIORITIES[todo.priority as keyof typeof PRIORITIES]
                    ?.label ?? todo.priority}
                </Chip>
              )}
            </Field>

            <Field label="Estimate">
              {todo.estimate === null ? (
                <Dash />
              ) : (
                <span>{todo.estimate} points</span>
              )}
            </Field>

            <Field label="Assignee">
              {todo.assignee_username === null ? (
                <Dash />
              ) : (
                <span>{todo.assignee_username}</span>
              )}
            </Field>

            {todo.completed_by_username && (
              <Field label="Completed by">
                <span>{todo.completed_by_username}</span>
              </Field>
            )}
          </dl>

          <dl className="border-hairline mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border-t pt-4">
            <Field label="Created">
              <span className="tabular-nums">{day(todo.created_at)}</span>
            </Field>
            <Field label="Started">
              {todo.started_at === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">{day(todo.started_at)}</span>
              )}
            </Field>
            <Field label="Completed">
              {todo.completed_at === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">{day(todo.completed_at)}</span>
              )}
            </Field>
            <Field label="Cycle time">
              {todo.cycle_days === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">
                  {formatDuration(todo.cycle_days)}
                </span>
              )}
            </Field>
          </dl>

          <section className="border-hairline mt-4 border-t pt-4">
            <h3 className="text-ink-3 text-micro mb-2 font-semibold tracking-wide uppercase">
              Activity
            </h3>

            {data.activity.length === 0 ? (
              <p className="text-ink-3 text-mini">
                Nothing recorded for this task.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {data.activity.map((row) => (
                  <Entry key={row.id} row={row} />
                ))}
              </ol>
            )}
          </section>

          <div className="border-hairline mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-ink-3 text-micro">
              Read-only. Editing a task needs board membership.
            </p>

            <Link
              to={`/boards/${todo.board_id}?task=${todo.id}`}
              className="text-brand text-mini shrink-0 hover:underline"
            >
              Open task →
            </Link>
          </div>
        </>
      )}
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-3 text-mini">{label}</dt>
      <dd className="text-ink-2 text-meta flex min-w-0 items-center">
        {children}
      </dd>
    </>
  );
}

function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-control text-mini truncate px-1.5 py-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Dash() {
  return <span className="text-ink-3">—</span>;
}

function Entry({ row }: { row: AdminActivityRow }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="text-ink-3 text-micro w-16 shrink-0 tabular-nums">
        {relativeTime(row.created_at)}
      </span>
      <span className="text-ink-2 text-mini min-w-0 flex-1 truncate">
        {actionLabel(row.action)}
      </span>
      <span className="text-ink-3 text-micro shrink-0">
        {row.actor_username ?? "—"}
      </span>
    </li>
  );
}

function day(value: string): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
}

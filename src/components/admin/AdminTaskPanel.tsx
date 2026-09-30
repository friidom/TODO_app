import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { XIcon } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { COLUMN_CATEGORIES } from "@/constants/columns";
import { PRIORITIES } from "@/constants/priorities";
import {
  WORK_TYPE_LABELS,
  WORK_TYPES,
  toWorkType,
} from "@/constants/workTypes";
import {
  actionLabel,
  adminLocale,
  formatDuration,
} from "@/services/admin/format";
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
  const { t } = useTranslation();
  const { data, error, isLoading } = useAdminTodo(todoId);
  const todo = data?.todo;

  const key = todo
    ? (taskKey(todo.key_prefix, todo.board_key) ?? t("workType.task"))
    : t("workType.task");

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
              {todo?.title ?? t("common.untitled")}
            </h2>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="text-ink-3 hover:text-ink hover:bg-wash rounded-control -mt-1 -mr-1 shrink-0 p-1 transition-colors"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {error ? (
        <p className="text-ink-3 mt-5 text-center text-xs">
          {t("admin.taskLoadFailed")}
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
            <Field label={t("sidebar.board")}>
              <Link
                to={`/admin/boards/${todo.board_id}`}
                className="text-ink hover:text-brand truncate transition-colors"
              >
                {todo.board_title ?? t("common.untitledBoard")}
              </Link>
            </Field>

            {todo.space_id && (
              <Field label={t("boards.space")}>
                <Link
                  to={`/admin/spaces/${todo.space_id}`}
                  className="text-ink-2 hover:text-brand truncate transition-colors"
                >
                  {todo.space_title}
                </Link>
              </Field>
            )}

            <Field label={t("fields.status")}>
              <Chip
                className={
                  COLUMN_CATEGORIES[
                    (todo.category ?? "todo") as keyof typeof COLUMN_CATEGORIES
                  ]?.pill
                }
              >
                {todo.status_name ?? t("views.backlog")}
              </Chip>
            </Field>

            <Field label={t("activity.type")}>
              <Chip
                className={
                  WORK_TYPES[todo.type as keyof typeof WORK_TYPES]?.chip
                }
              >
                {WORK_TYPE_LABELS[toWorkType(todo.type)]}
              </Chip>
            </Field>

            <Field label={t("fields.priority")}>
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

            <Field label={t("fields.estimate")}>
              {todo.estimate === null ? (
                <Dash />
              ) : (
                <span>
                  {t("estimate.points", {
                    count: todo.estimate,
                    value: todo.estimate,
                  })}
                </span>
              )}
            </Field>

            <Field label={t("fields.assignee")}>
              {todo.assignee_username === null ? (
                <Dash />
              ) : (
                <span>{todo.assignee_username}</span>
              )}
            </Field>

            {todo.completed_by_username && (
              <Field label={t("admin.completedBy")}>
                <span>{todo.completed_by_username}</span>
              </Field>
            )}
          </dl>

          <dl className="border-hairline mt-4 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border-t pt-4">
            <Field label={t("fields.created")}>
              <span className="tabular-nums">{day(todo.created_at)}</span>
            </Field>
            <Field label={t("admin.started")}>
              {todo.started_at === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">{day(todo.started_at)}</span>
              )}
            </Field>
            <Field label={t("fields.completed")}>
              {todo.completed_at === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">{day(todo.completed_at)}</span>
              )}
            </Field>
            <Field label={t("admin.cycleTime")}>
              {todo.cycle_days === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">
                  {formatDuration(todo.cycle_days)}
                </span>
              )}
            </Field>
            <Field label={t("admin.leadTime")}>
              {todo.lead_days === null ? (
                <Dash />
              ) : (
                <span className="tabular-nums">
                  {formatDuration(todo.lead_days)}
                </span>
              )}
            </Field>
          </dl>

          <section className="border-hairline mt-4 border-t pt-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-ink-3 text-micro font-semibold tracking-wide uppercase">
                {t("board.activity")}
              </h3>

              {/* The board's feed, not this task's: /admin/activity takes no
                  entity facet, and the last 20 rows for the task itself are
                  already the list below. */}
              <Link
                to={`/admin/activity?board=${todo.board_id}`}
                className="text-ink-3 hover:text-brand text-mini shrink-0 transition-colors"
              >
                {t("admin.allBoardActivity")}
              </Link>
            </div>

            {data.activity.length === 0 ? (
              <p className="text-ink-3 text-mini">
                {t("admin.nothingRecorded")}
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
            <p className="text-ink-3 text-micro">{t("admin.readOnlyTask")}</p>

            <Link
              to={`/boards/${todo.board_id}?task=${todo.id}`}
              className="text-brand text-mini shrink-0 hover:underline"
            >
              {t("admin.openTask")}
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
  return new Date(value).toLocaleDateString(adminLocale(), {
    day: "numeric",
    month: "short",
  });
}

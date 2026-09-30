import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import { HEADER_CONTROL } from "@/components/board/headerControl";
import AdminTaskPanel from "@/components/admin/AdminTaskPanel";
import { useAdminActivityRealtime } from "@/hooks/useAdminActivityRealtime";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useOpenTask } from "@/hooks/useOpenTask";
import { actionOptions } from "@/services/admin/activityFilters";
import { taskTarget } from "@/services/admin/drilldown";
import { taskKey } from "@/utils/taskKey";
import {
  useAdminActivity,
  useAdminBoards,
  useAdminUsers,
} from "@/services/admin/useAdmin";
import { actionLabel, rangeLabel } from "@/services/admin/format";
import { relativeTime } from "@/utils/relativeTime";
import { cn } from "@/utils/cn";

const COLUMNS =
  "minmax(8rem,1fr) minmax(7rem,0.8fr) minmax(12rem,2fr) minmax(9rem,1fr) 7rem";

export default function AdminActivityPage() {
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const [params, setParams] = useSearchParams();

  const user = params.get("user") ?? undefined;
  const board = params.get("board") ?? undefined;
  const action = params.get("action") ?? undefined;
  const space = params.get("space") ?? undefined;
  const { taskId, openTask, closeTask } = useOpenTask();
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  const {
    data,
    isFetching,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAdminActivity({ period, user, board, action, space, from, to });
  const { data: users } = useAdminUsers(period);
  const { data: boards } = useAdminBoards(period);

  useAdminActivityRealtime(
    {
      board,
      space,
      spaceBoardIds: boards?.boards
        .filter((entry) => entry.space_id === space)
        .map((entry) => entry.id),
    },
    taskId,
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);

    if (value === "") next.delete(key);
    else next.set(key, value);

    setParams(next, { replace: true });
  };

  const spaceName = boards?.boards.find(
    (entry) => entry.space_id === space,
  )?.space_title;

  const clearFilters = (keys: string[]) => {
    const next = new URLSearchParams(params);

    for (const key of keys) next.delete(key);

    setParams(next, { replace: true });
  };

  const pages = data?.pages ?? [];
  const rows = pages.flatMap((page) => page.activities);
  const firstPage = pages[0];

  const actions = actionOptions(rows, action);

  return (
    <AdminShell
      title={t("board.activity")}
      hint={
        firstPage
          ? t("admin.activity.hint", {
              count: rows.length,
              more: hasNextPage ? "+" : "",
              range: rangeLabel(firstPage.from, firstPage.to),
            })
          : t("admin.activity.hintLoading")
      }
      busy={isFetching}
      actions={
        <div className="flex flex-wrap gap-1.5">
          <select
            aria-label={t("admin.activity.byDeveloper")}
            className={HEADER_CONTROL}
            value={user ?? ""}
            onChange={(event) => setFilter("user", event.target.value)}
          >
            <option value="">{t("admin.activity.everyone")}</option>
            {(users?.users ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.username}
              </option>
            ))}
          </select>

          <select
            aria-label={t("admin.activity.byBoard")}
            className={HEADER_CONTROL}
            value={board ?? ""}
            onChange={(event) => setFilter("board", event.target.value)}
          >
            <option value="">{t("admin.allBoards")}</option>
            {(boards?.boards ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.title ?? t("common.untitledBoard")}
              </option>
            ))}
          </select>

          <select
            aria-label={t("admin.activity.byAction")}
            className={HEADER_CONTROL}
            value={action ?? ""}
            onChange={(event) => setFilter("action", event.target.value)}
          >
            <option value="">{t("admin.activity.everyAction")}</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {actionLabel(value)}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {(from || to || space) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {space && (
            <FilterChip
              label={spaceName ?? t("admin.activity.oneSpace")}
              onClear={() => clearFilters(["space"])}
            />
          )}

          {(from || to) && (
            <FilterChip
              label={rangeLabel(from ?? "", to ?? "")}
              onClear={() => clearFilters(["from", "to"])}
            />
          )}
        </div>
      )}

      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton rows={12} />
      ) : (
        <AdminGrid columns={COLUMNS} label={t("admin.activity.gridLabel")}>
          <AdminRow header>
            <AdminCell header>{t("admin.columns.developer")}</AdminCell>
            <AdminCell header>{t("admin.columns.action")}</AdminCell>
            <AdminCell header>{t("admin.columns.item")}</AdminCell>
            <AdminCell header>{t("sidebar.board")}</AdminCell>
            <AdminCell header align="right">
              {t("admin.columns.when")}
            </AdminCell>
          </AdminRow>

          {rows.length === 0 ? (
            <AdminEmpty>{t("admin.nothingHappened")}</AdminEmpty>
          ) : (
            rows.map((row) => (
              <AdminRow
                key={row.id}
                onOpen={
                  taskTarget(row) === null
                    ? undefined
                    : () => openTask(taskTarget(row)!)
                }
              >
                <AdminCell>
                  <span className="text-ink">
                    {row.actor_username ?? t("admin.unknown")}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-2">{actionLabel(row.action)}</span>
                </AdminCell>

                <AdminCell>
                  {taskKey(row.key_prefix, row.board_key) !== null && (
                    <span className="text-ink-3 text-micro mr-1.5 tabular-nums">
                      {taskKey(row.key_prefix, row.board_key)}
                    </span>
                  )}
                  <span className="text-ink-2">
                    {row.title ?? t("common.untitled")}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-3">{row.board_title ?? "—"}</span>
                </AdminCell>

                <AdminCell align="right">
                  <span
                    className="text-ink-3 text-micro"
                    title={row.created_at}
                  >
                    {relativeTime(row.created_at)}
                  </span>
                </AdminCell>
              </AdminRow>
            ))
          )}
        </AdminGrid>
      )}

      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className={cn(HEADER_CONTROL, "px-3")}
          >
            {isFetchingNextPage ? t("common.loading") : t("admin.loadMore")}
          </button>
        </div>
      )}

      {taskId && <AdminTaskPanel todoId={taskId} onClose={closeTask} />}
    </AdminShell>
  );
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  return (
    <span className="border-brand/40 bg-brand-soft text-brand text-mini rounded-control flex items-center gap-1.5 border px-2 py-1">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={t("admin.clearFilter", { name: label })}
        className="hover:text-ink transition-colors"
      >
        ×
      </button>
    </span>
  );
}

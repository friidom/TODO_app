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
      title="Activity"
      hint={
        firstPage
          ? `${rows.length} entries${hasNextPage ? "+" : ""} · ${rangeLabel(firstPage.from, firstPage.to)}`
          : "Across every board"
      }
      busy={isFetching}
      actions={
        <div className="flex flex-wrap gap-1.5">
          <select
            aria-label="Filter by developer"
            className={HEADER_CONTROL}
            value={user ?? ""}
            onChange={(event) => setFilter("user", event.target.value)}
          >
            <option value="">Everyone</option>
            {(users?.users ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.username}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by board"
            className={HEADER_CONTROL}
            value={board ?? ""}
            onChange={(event) => setFilter("board", event.target.value)}
          >
            <option value="">Every board</option>
            {(boards?.boards ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.title ?? "Untitled board"}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by action"
            className={HEADER_CONTROL}
            value={action ?? ""}
            onChange={(event) => setFilter("action", event.target.value)}
          >
            <option value="">Every action</option>
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
              label={spaceName ?? "One space"}
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
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton rows={12} />
      ) : (
        <AdminGrid columns={COLUMNS} label="System-wide activity">
          <AdminRow header>
            <AdminCell header>Developer</AdminCell>
            <AdminCell header>Action</AdminCell>
            <AdminCell header>Item</AdminCell>
            <AdminCell header>Board</AdminCell>
            <AdminCell header align="right">
              When
            </AdminCell>
          </AdminRow>

          {rows.length === 0 ? (
            <AdminEmpty>Nothing happened in this window.</AdminEmpty>
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
                    {row.actor_username ?? "Unknown"}
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
                    {row.title ?? `Untitled ${row.entity_type}`}
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
            {isFetchingNextPage ? "Loading…" : "Load more"}
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
  return (
    <span className="border-brand/40 bg-brand-soft text-brand text-mini rounded-control flex items-center gap-1.5 border px-2 py-1">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="hover:text-ink transition-colors"
      >
        ×
      </button>
    </span>
  );
}

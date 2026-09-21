import { useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import ScopeFilter from "@/components/admin/ScopeFilter";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminScope } from "@/hooks/useAdminScope";
import {
  dash,
  formatDuration,
  percent,
  rangeLabel,
} from "@/services/admin/format";
import {
  BOARD_SORT_LABELS,
  DEFAULT_BOARD_SORT,
  isBoardSortKey,
  isLeaderboardMode,
  LEADERBOARD_MODES,
  LEADERBOARD_MODE_LABELS,
  metricShare,
  metricsFor,
  sortBoards,
  type BoardSortKey,
  type LeaderboardMode,
  type SortDirection,
} from "@/services/admin/leaderboard";
import {
  DEFAULT_USER_SORT,
  isUserSortKey,
  sortUsers,
  USER_SORT_LABELS,
  type UserSortKey,
} from "@/services/admin/sortUsers";
import {
  useAdminBoards,
  useAdminSpaces,
  useAdminUsers,
} from "@/services/admin/useAdmin";
import type { AdminBoard, AdminUser } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const PEOPLE_COLUMNS =
  "2.25rem minmax(8rem,1.5fr) repeat(5, minmax(4.75rem,1fr)) minmax(8rem,1.2fr)";
const BOARD_COLUMNS =
  "2.25rem minmax(9rem,1.6fr) minmax(7rem,1fr) repeat(5, minmax(4.75rem,1fr))";

const ASCENDING = "median_cycle_days";

const PEOPLE_COLUMN_KEYS = [
  "completed_todos",
  "completed_points",
  "median_cycle_days",
  "activities",
  "boards",
] as const;

const BOARD_COLUMN_KEYS = [
  "completed_todos",
  "completed_points",
  "median_cycle_days",
  "activities",
  "open_todos",
] as const;

export default function AdminLeaderboardsPage() {
  const { period } = useAdminPeriod();
  const { scope, setScope } = useAdminScope();
  const view = useLeaderboardView();

  const people = useAdminUsers(period, view.mode === "people" ? scope : {});
  const boards = useAdminBoards(period, scope.space);
  const spaces = useAdminSpaces(period);

  const boardOptions = useMemo(
    () =>
      (boards.data?.boards ?? []).map((board) => ({
        id: board.id,
        label: board.title ?? "Untitled board",
      })),
    [boards.data],
  );

  const spaceOptions = useMemo(
    () =>
      (spaces.data?.spaces ?? [])
        .filter((space) => space.id !== null)
        .map((space) => ({ id: space.id!, label: space.title })),
    [spaces.data],
  );

  const active = view.mode === "people" ? people : boards;
  const window = active.data;

  return (
    <AdminShell
      title="Leaderboards"
      hint={
        window
          ? `Performance across the organisation · ${rangeLabel(window.from, window.to)}`
          : "Performance across the organisation"
      }
      busy={people.isFetching || boards.isFetching}
      actions={
        <ScopeFilter
          scope={scope}
          setScope={setScope}
          spaces={spaceOptions}
          boards={view.mode === "people" ? boardOptions : []}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Leaderboard"
            className="border-hairline bg-surface rounded-control inline-flex h-9 items-center gap-0.5 border p-0.5"
          >
            {LEADERBOARD_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => view.setMode(mode)}
                aria-pressed={mode === view.mode}
                className={cn(
                  "rounded-control text-meta h-8 px-3 transition-colors",
                  mode === view.mode
                    ? HEADER_CONTROL_ACTIVE
                    : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
                )}
              >
                {LEADERBOARD_MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Order by"
            className="flex flex-wrap gap-1"
          >
            {metricsFor(view.mode).map((metric) => (
              <button
                key={metric.key}
                type="button"
                title={metric.hint}
                onClick={() => view.setSort(metric.key)}
                aria-pressed={metric.key === view.sort}
                className={cn(
                  HEADER_CONTROL,
                  "px-2",
                  metric.key === view.sort && HEADER_CONTROL_ACTIVE,
                )}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>

        {active.error ? (
          <AdminEmpty>That did not load. Try again.</AdminEmpty>
        ) : view.mode === "people" ? (
          people.data === undefined ? (
            <AdminSkeleton />
          ) : (
            <PeopleTable
              rows={people.data.users}
              sort={isUserSortKey(view.sort) ? view.sort : DEFAULT_USER_SORT}
              onSort={view.setSort}
              period={period}
            />
          )
        ) : boards.data === undefined ? (
          <AdminSkeleton />
        ) : (
          <BoardTable
            rows={boards.data.boards}
            sort={isBoardSortKey(view.sort) ? view.sort : DEFAULT_BOARD_SORT}
            onSort={view.setSort}
            period={period}
          />
        )}

        <p className="text-ink-3 text-mini">
          Ordered by one named metric at a time. The number in the first column
          is the position under that ordering and nothing else — there is no
          combined score, and each figure stands on its own.
        </p>
      </div>
    </AdminShell>
  );
}

function useLeaderboardView(): {
  mode: LeaderboardMode;
  sort: string;
  setMode: (next: LeaderboardMode) => void;
  setSort: (next: string) => void;
} {
  const [params, setParams] = useSearchParams();

  const mode: LeaderboardMode = isLeaderboardMode(params.get("mode"))
    ? (params.get("mode") as LeaderboardMode)
    : "people";

  const fallback = mode === "people" ? DEFAULT_USER_SORT : DEFAULT_BOARD_SORT;
  const raw = params.get("by");
  const valid = mode === "people" ? isUserSortKey(raw) : isBoardSortKey(raw);
  const sort = valid ? raw! : fallback;

  const write = useCallback(
    (
      next: Record<string, string | undefined>,
      defaults: Record<string, string>,
    ) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);

          for (const [facet, value] of Object.entries(next)) {
            if (value === undefined || value === defaults[facet])
              updated.delete(facet);
            else updated.set(facet, value);
          }

          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    mode,
    sort,
    setMode: (next) => write({ mode: next, by: undefined }, { mode: "people" }),
    setSort: (next) => write({ by: next }, { by: fallback }),
  };
}

function PeopleTable({
  rows,
  sort,
  onSort,
  period,
}: {
  rows: AdminUser[];
  sort: UserSortKey;
  onSort: (next: string) => void;
  period: string;
}) {
  const ordered = useMemo(() => sortUsers(rows, sort), [rows, sort]);
  const peaks = usePeaks(ordered, PEOPLE_COLUMN_KEYS);
  const numeric = PEOPLE_COLUMN_KEYS;

  return (
    <AdminGrid columns={PEOPLE_COLUMNS} label="People, ordered by one metric">
      <AdminRow header>
        <AdminCell header align="right">
          <span className="sr-only">Position</span>
          <span aria-hidden>#</span>
        </AdminCell>
        <AdminCell header>Developer</AdminCell>
        {numeric.map((key) => (
          <AdminCell key={key} header align="right">
            <SortButton active={sort === key} onClick={() => onSort(key)}>
              {USER_SORT_LABELS[key]}
            </SortButton>
          </AdminCell>
        ))}
        <AdminCell header align="right">
          <SortButton
            active={sort === "performance"}
            onClick={() => onSort("performance")}
          >
            {USER_SORT_LABELS.performance}
          </SortButton>
        </AdminCell>
      </AdminRow>

      {ordered.length === 0 ? (
        <AdminEmpty>No developers yet.</AdminEmpty>
      ) : (
        ordered.map((row, index) => (
          <AdminRow key={row.id}>
            <Ordinal index={index} />

            <AdminCell>
              <Link
                to={`/admin/users/${row.id}?period=${period}`}
                className="text-ink hover:text-brand truncate font-medium transition-colors"
              >
                {row.username}
              </Link>
            </AdminCell>

            {numeric.map((key) => (
              <AdminCell key={key} align="right">
                <Metric
                  value={row[key]}
                  peak={peaks[key] ?? 0}
                  format={key === ASCENDING ? formatDuration : dash}
                  direction={key === ASCENDING ? "asc" : "desc"}
                  bar={key !== "boards"}
                />
              </AdminCell>
            ))}

            <AdminCell align="right">
              <span
                className={cn(
                  "font-medium",
                  row.performance === null ? "text-ink-3" : "text-ink",
                )}
              >
                {percent(row.performance)}
              </span>
              <span
                className="text-ink-3 text-micro ml-1.5"
                title="completed points / target points"
              >
                {dash(row.completed_points)} / {dash(row.target_points)}
              </span>
            </AdminCell>
          </AdminRow>
        ))
      )}
    </AdminGrid>
  );
}

function BoardTable({
  rows,
  sort,
  onSort,
  period,
}: {
  rows: AdminBoard[];
  sort: BoardSortKey;
  onSort: (next: string) => void;
  period: string;
}) {
  const navigate = useNavigate();
  const ordered = useMemo(() => sortBoards(rows, sort), [rows, sort]);
  const peaks = usePeaks(ordered, BOARD_COLUMN_KEYS);
  const numeric = BOARD_COLUMN_KEYS;

  return (
    <AdminGrid columns={BOARD_COLUMNS} label="Boards, ordered by one metric">
      <AdminRow header>
        <AdminCell header align="right">
          <span className="sr-only">Position</span>
          <span aria-hidden>#</span>
        </AdminCell>
        <AdminCell header>
          <SortButton active={sort === "title"} onClick={() => onSort("title")}>
            {BOARD_SORT_LABELS.title}
          </SortButton>
        </AdminCell>
        <AdminCell header>Owner</AdminCell>
        {numeric.map((key) => (
          <AdminCell key={key} header align="right">
            <SortButton active={sort === key} onClick={() => onSort(key)}>
              {BOARD_SORT_LABELS[key]}
            </SortButton>
          </AdminCell>
        ))}
      </AdminRow>

      {ordered.length === 0 ? (
        <AdminEmpty>No boards yet.</AdminEmpty>
      ) : (
        ordered.map((row, index) => (
          <AdminRow
            key={row.id}
            onOpen={() =>
              void navigate(`/admin/boards/${row.id}?period=${period}`)
            }
          >
            <Ordinal index={index} />

            <AdminCell>
              <span className="text-ink truncate font-medium">
                {row.title ?? "Untitled board"}
              </span>
            </AdminCell>

            <AdminCell>
              <span className="text-ink-3 truncate">
                {row.owner_username ?? "—"}
              </span>
            </AdminCell>

            {numeric.map((key) => (
              <AdminCell key={key} align="right">
                <Metric
                  value={row[key]}
                  peak={peaks[key] ?? 0}
                  format={key === ASCENDING ? formatDuration : dash}
                  direction={key === ASCENDING ? "asc" : "desc"}
                  bar={key !== "open_todos"}
                />
              </AdminCell>
            ))}
          </AdminRow>
        ))
      )}
    </AdminGrid>
  );
}

function usePeaks<T, K extends string>(
  rows: T[],
  keys: readonly K[],
): Record<string, number> {
  return useMemo(() => {
    const result: Record<string, number> = {};

    for (const key of keys) {
      result[key] = rows.reduce((highest, row) => {
        const value = (row as Record<string, unknown>)[key];

        return typeof value === "number" ? Math.max(highest, value) : highest;
      }, 0);
    }

    return result;
  }, [rows, keys]);
}

function Ordinal({ index }: { index: number }) {
  return (
    <AdminCell align="right">
      <span className="text-ink-3 text-micro tabular-nums">{index + 1}</span>
    </AdminCell>
  );
}

function Metric({
  value,
  peak,
  format,
  direction,
  bar,
}: {
  value: number | null;
  peak: number;
  format: (value: number | null) => string;
  direction: SortDirection;
  bar: boolean;
}) {
  return (
    <span className="flex items-center justify-end gap-2">
      {bar && (
        <span className="bg-ink/[0.06] hidden h-1 w-10 overflow-hidden rounded-full lg:block">
          <span
            className={cn(
              "block h-full rounded-full",
              value === null ? "bg-transparent" : "bg-brand/70",
            )}
            style={{ width: `${metricShare(value, peak, direction)}%` }}
          />
        </span>
      )}
      <span
        className={cn(
          "w-10 text-right tabular-nums",
          value === null ? "text-ink-3" : "text-ink-2",
        )}
      >
        {format(value)}
      </span>
    </span>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "hover:text-ink uppercase transition-colors",
        active && "text-brand",
      )}
    >
      {children}
    </button>
  );
}

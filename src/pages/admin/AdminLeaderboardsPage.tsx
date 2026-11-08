import { useTranslation } from "react-i18next";
import { useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
  AdminSortButton,
} from "@/components/admin/AdminTable";
import ScopeFilter from "@/components/admin/ScopeFilter";
import Segmented from "@/components/admin/Segmented";
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
  const { t } = useTranslation();
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
        label: board.title ?? t("common.untitledBoard"),
      })),
    [boards.data, t],
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
    <AdminPage
      title={t("admin.sections.leaderboards")}
      description={
        window
          ? `${t("admin.leaders.hint")} · ${rangeLabel(window.from, window.to)}`
          : t("admin.leaders.hint")
      }
      toolbar={
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
          <Segmented
            label={t("admin.leaders.label")}
            value={view.mode}
            onChange={view.setMode}
            options={LEADERBOARD_MODES.map((mode) => ({
              value: mode,
              label: LEADERBOARD_MODE_LABELS[mode],
            }))}
          />

          <Segmented
            label={t("admin.leaders.orderBy")}
            value={view.sort}
            onChange={view.setSort}
            options={metricsFor(view.mode).map((metric) => ({
              value: metric.key,
              label: metric.label,
              title: metric.hint,
            }))}
          />
        </div>

        {active.error ? (
          <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
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

        <p className="text-ink-3 text-mini">{t("admin.leaders.explainer")}</p>
      </div>
    </AdminPage>
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
  const { t } = useTranslation();
  const ordered = useMemo(() => sortUsers(rows, sort), [rows, sort]);
  const peaks = usePeaks(ordered, PEOPLE_COLUMN_KEYS);
  const numeric = PEOPLE_COLUMN_KEYS;

  return (
    <AdminGrid columns={PEOPLE_COLUMNS} label={t("admin.leaders.peopleLabel")}>
      <AdminRow header>
        <AdminCell header align="right">
          <span className="sr-only">{t("admin.leaders.position")}</span>
          <span aria-hidden>#</span>
        </AdminCell>
        <AdminCell header>{t("admin.columns.developer")}</AdminCell>
        {numeric.map((key) => (
          <AdminCell key={key} header align="right">
            <SortButton
              active={sort === key}
              onClick={() => onSort(key)}
              sortKey={key}
            >
              {USER_SORT_LABELS[key]}
            </SortButton>
          </AdminCell>
        ))}
        <AdminCell header align="right">
          <SortButton
            active={sort === "performance"}
            onClick={() => onSort("performance")}
            sortKey="performance"
          >
            {USER_SORT_LABELS.performance}
          </SortButton>
        </AdminCell>
      </AdminRow>

      {ordered.length === 0 ? (
        <AdminEmpty>{t("admin.noDevelopers")}</AdminEmpty>
      ) : (
        ordered.map((row, index) => (
          <AdminRow key={row.id}>
            <Ordinal index={index} ranked={rankable(row[sort], sort)} />

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
                title={t("admin.pointsOverTarget")}
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ordered = useMemo(() => sortBoards(rows, sort), [rows, sort]);
  const peaks = usePeaks(ordered, BOARD_COLUMN_KEYS);
  const numeric = BOARD_COLUMN_KEYS;

  return (
    <AdminGrid columns={BOARD_COLUMNS} label={t("admin.leaders.boardsLabel")}>
      <AdminRow header>
        <AdminCell header align="right">
          <span className="sr-only">{t("admin.leaders.position")}</span>
          <span aria-hidden>#</span>
        </AdminCell>
        <AdminCell header>
          <SortButton
            active={sort === "title"}
            onClick={() => onSort("title")}
            sortKey="title"
          >
            {BOARD_SORT_LABELS.title}
          </SortButton>
        </AdminCell>
        <AdminCell header>{t("roles.owner")}</AdminCell>
        {numeric.map((key) => (
          <AdminCell key={key} header align="right">
            <SortButton
              active={sort === key}
              onClick={() => onSort(key)}
              sortKey={key}
            >
              {BOARD_SORT_LABELS[key]}
            </SortButton>
          </AdminCell>
        ))}
      </AdminRow>

      {ordered.length === 0 ? (
        <AdminEmpty>{t("sidebar.noBoardsYet")}</AdminEmpty>
      ) : (
        ordered.map((row, index) => (
          <AdminRow
            key={row.id}
            onOpen={() =>
              void navigate(`/admin/boards/${row.id}?period=${period}`)
            }
          >
            <Ordinal index={index} ranked={rankable(row[sort], sort)} />

            <AdminCell>
              <span className="text-ink truncate font-medium">
                {row.title ?? t("common.untitledBoard")}
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

// A row the ordering metric says nothing about is listed, not ranked: in a
// quiet week every zero would otherwise take a place by alphabet.
function rankable(value: unknown, sortKey: string): boolean {
  if (typeof value !== "number") return typeof value === "string";

  return sortKey === ASCENDING || value > 0;
}

function Ordinal({ index, ranked }: { index: number; ranked: boolean }) {
  return (
    <AdminCell align="right">
      <span className="text-ink-3 text-mini tabular-nums">
        {ranked ? index + 1 : "–"}
      </span>
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
  const quiet = value === null || (direction === "desc" && value === 0);

  return (
    <span className="flex items-center justify-end gap-2">
      {bar && (
        <span className="hidden h-1 w-10 overflow-hidden rounded-full lg:block">
          {!quiet && (
            <span
              className="bg-brand/70 block h-full rounded-full"
              style={{ width: `${metricShare(value, peak, direction)}%` }}
            />
          )}
        </span>
      )}
      <span
        className={cn(
          "w-10 text-right tabular-nums",
          quiet ? "text-ink-3/70" : "text-ink",
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
  sortKey,
  children,
}: {
  active: boolean;
  onClick: () => void;
  sortKey: string;
  children: React.ReactNode;
}) {
  return (
    <AdminSortButton
      active={active}
      onClick={onClick}
      direction={sortKey === ASCENDING || sortKey === "title" ? "asc" : "desc"}
    >
      {children}
    </AdminSortButton>
  );
}

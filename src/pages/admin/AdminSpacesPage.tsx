import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminNumber,
  AdminRow,
  AdminSkeleton,
  AdminSortButton as SortButton,
} from "@/components/admin/AdminTable";
import SummaryCard, {
  DistributionRow,
  WidgetEmpty,
} from "@/components/summary/SummaryCard";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { spaceName, spaceTarget } from "@/services/admin/drilldown";
import { barShare, peakOf, proportionOf } from "@/services/admin/flow";
import { formatDuration, rangeLabel } from "@/services/admin/format";
import { compareBy } from "@/services/admin/leaderboard";
import { translated } from "@/components/i18n";
import { useAdminSpaces } from "@/services/admin/useAdmin";
import type { SpaceMetrics } from "@/services/admin/types";
import { cn } from "@/utils/cn";

const COLUMNS =
  "minmax(9rem,1.6fr) repeat(3, 4.5rem) repeat(4, minmax(4.5rem,1fr)) 6rem";

const NUMERIC = [
  "boards",
  "members",
  "open_todos",
  "completed_todos",
  "completed_points",
  "median_cycle_days",
  "activities",
] as const;

type SpaceSortKey = (typeof NUMERIC)[number] | "title";

const LABELS = translated<SpaceSortKey>({
  title: "boards.space",
  boards: "boards.title",
  members: "admin.modes.people",
  open_todos: "admin.columns.open",
  completed_todos: "columnCategory.done",
  completed_points: "admin.columns.points",
  median_cycle_days: "admin.columns.cycle",
  activities: "board.activity",
});

export default function AdminSpacesPage() {
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const navigate = useNavigate();
  const { data, error } = useAdminSpaces(period);
  const [sort, setSort] = useState<SpaceSortKey>("completed_todos");

  const rows = useMemo(() => {
    const spaces = data?.spaces ?? [];
    const byName = (a: SpaceMetrics, b: SpaceMetrics) =>
      a.title.localeCompare(b.title);

    if (sort === "title") return [...spaces].sort(byName);

    return compareBy(
      spaces,
      (space) => space[sort],
      sort === "median_cycle_days" ? "asc" : "desc",
      byName,
    );
  }, [data, sort]);

  const peak = peakOf(rows.map((space) => ({ count: space.completed_todos })));
  const total = rows.reduce((sum, space) => sum + space.completed_todos, 0);

  return (
    <AdminPage
      title={t("sidebar.spaces")}
      description={
        data
          ? t("admin.spaces.hint", {
              count: rows.length,
              range: rangeLabel(data.from, data.to),
            })
          : t("admin.spaces.hintLoading")
      }
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <SummaryCard
            title={t("admin.spaces.completedTitle")}
            hint={t("admin.spaces.completedHint")}
          >
            {total === 0 ? (
              <WidgetEmpty>{t("admin.spaces.nothingCompleted")}</WidgetEmpty>
            ) : (
              <div className="flex flex-col gap-2 px-3.5 pb-3.5">
                {rows
                  .filter((space) => space.completed_todos > 0)
                  .sort((a, b) => b.completed_todos - a.completed_todos)
                  .slice(0, 8)
                  .map((space) => (
                    <DistributionRow
                      key={space.id ?? "unfiled"}
                      label={spaceName(space)}
                      title={spaceName(space)}
                      count={space.completed_todos}
                      percent={barShare(space.completed_todos, peak)}
                      share={proportionOf(space.completed_todos, total)}
                      barClassName={
                        space.id === null ? "bg-ink-3/50" : "bg-brand/70"
                      }
                      labelClassName="flex-[0_0_9rem]"
                    />
                  ))}
              </div>
            )}
          </SummaryCard>

          <AdminGrid columns={COLUMNS} label={t("admin.spaces.gridLabel")}>
            <AdminRow header>
              <AdminCell header>
                <SortButton
                  active={sort === "title"}
                  onClick={() => setSort("title")}
                  direction="asc"
                >
                  {LABELS.title}
                </SortButton>
              </AdminCell>

              {NUMERIC.map((key) => (
                <AdminCell key={key} header align="right">
                  <SortButton
                    active={sort === key}
                    onClick={() => setSort(key)}
                    direction={key === "median_cycle_days" ? "asc" : "desc"}
                  >
                    {LABELS[key]}
                  </SortButton>
                </AdminCell>
              ))}

              <AdminCell header align="right">
                {t("roles.owner")}
              </AdminCell>
            </AdminRow>

            {rows.length === 0 ? (
              <AdminEmpty>{t("admin.noSpaces")}</AdminEmpty>
            ) : (
              rows.map((space) => (
                <AdminRow
                  key={space.id ?? "unfiled"}
                  onOpen={
                    spaceTarget(space, period) === null
                      ? undefined
                      : () => void navigate(spaceTarget(space, period)!)
                  }
                >
                  <AdminCell>
                    <span
                      className={cn(
                        "truncate font-medium",
                        space.id === null ? "text-ink-3 italic" : "text-ink",
                      )}
                      title={
                        space.id === null
                          ? t("admin.spaces.unfiledHint")
                          : space.title
                      }
                    >
                      {spaceName(space)}
                    </span>
                  </AdminCell>

                  {NUMERIC.map((key) => (
                    <AdminCell key={key} align="right">
                      {key === "median_cycle_days" ? (
                        <span
                          className={
                            space[key] === null ? "text-ink-3/70" : "text-ink"
                          }
                        >
                          {formatDuration(space[key])}
                        </span>
                      ) : (
                        <AdminNumber value={space[key]} />
                      )}
                    </AdminCell>
                  ))}

                  <AdminCell align="right">
                    <span className="text-ink-3 truncate">
                      {space.owner_username ?? "—"}
                    </span>
                  </AdminCell>
                </AdminRow>
              ))
            )}
          </AdminGrid>
        </div>
      )}
    </AdminPage>
  );
}

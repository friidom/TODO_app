import { useMemo } from "react";
import {
  CalendarClockIcon,
  CircleCheckIcon,
  CircleDotIcon,
  LayoutListIcon,
  PencilLineIcon,
  PlusIcon,
  type LucideIcon,
} from "lucide-react";

import ActivityFeed from "@/components/activity/ActivityFeed";
import Loading from "@/components/loading/LoadingPage";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardView } from "@/hooks/useBoardView";
import { usePanel } from "@/hooks/usePanel";
import { useVisibleTodos } from "@/hooks/useVisibleTodos";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  categoryIndex,
  dueSoonItems,
  priorityDistribution,
  recentCounts,
  statusDistribution,
  summaryStats,
  typeDistribution,
  workload,
} from "@/services/views/summary";
import { activityTrend } from "@/services/views/trends";
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dueDate";
import SummaryCard from "./SummaryCard";
import StatusOverview from "./StatusOverview";
import TrendsChart from "./TrendsChart";
import DueSoon from "./DueSoon";
import { TeamWorkload, WorkDistribution } from "./Breakdowns";

const WINDOW_DAYS = 7;
const ACTIVITY_PREVIEW = 5;
const DUE_SOON_LIMIT = 6;

export default function SummaryView() {
  const boardId = useBoardId();
  const view = useBoardView();
  const { openPanel } = usePanel();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const today = todayISO();

  const index = useMemo(() => categoryIndex(columns), [columns]);

  const stats = useMemo(
    () => summaryStats(todos, index, today),
    [todos, index, today],
  );

  const recent = useMemo(
    () => recentCounts(todos, index, new Date(), WINDOW_DAYS),
    [todos, index],
  );

  const byStatus = useMemo(
    () => statusDistribution(todos, columns),
    [todos, columns],
  );

  const byPriority = useMemo(() => priorityDistribution(todos), [todos]);
  const byType = useMemo(() => typeDistribution(todos), [todos]);

  const load = useMemo(
    () => workload(todos, index, today),
    [todos, index, today],
  );

  const due = useMemo(
    () => dueSoonItems(todos, index, today, WINDOW_DAYS, DUE_SOON_LIMIT),
    [todos, index, today],
  );

  const trend = useMemo(
    () => activityTrend(todos, new Date(), WINDOW_DAYS),
    [todos],
  );

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-4">
      <div className="flex flex-col gap-3">
        {/* gap-px + bg-hairline, not divide-x — divide-* skips the first child, which draws a mid-row rule once the grid wraps to 3 cols */}
        <div className="border-hairline bg-hairline rounded-card grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 xl:grid-cols-6">
          <Metric icon={LayoutListIcon} label="Total" value={stats.total} />

          <Metric
            icon={CircleDotIcon}
            label="In progress"
            value={stats.inProgress}
            tone="blue"
          />

          <Metric
            icon={CircleCheckIcon}
            label="Completed"
            value={stats.done}
            tone="green"
          />

          <Metric
            icon={PlusIcon}
            label={`Created · ${WINDOW_DAYS}d`}
            value={recent.created}
          />

          <Metric
            icon={PencilLineIcon}
            label={`Updated · ${WINDOW_DAYS}d`}
            value={recent.updated}
          />

          <Metric
            icon={CalendarClockIcon}
            label={`Due soon · ${WINDOW_DAYS}d`}
            value={recent.dueSoon}
            // amber only when nonzero — a permanently colored zero trains people to ignore it
            tone={recent.dueSoon > 0 ? "orange" : undefined}
          />
        </div>

        {/* two independent columns, not grid rows — panels differ wildly in height, so a shared row would stretch or gap the short one */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-3 lg:col-span-7">
            <StatusOverview
              slices={byStatus}
              columns={columns}
              total={stats.total}
              done={stats.done}
            />

            <TrendsChart points={trend} />

            <WorkDistribution priority={byPriority} types={byType} />
          </div>

          <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
            <SummaryCard
              title="Activity feed"
              action={
                <button
                  type="button"
                  onClick={() => openPanel("activity")}
                  className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control px-2 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
                >
                  View all
                </button>
              }
            >
              {/* ignores the view filter unlike everything else here — history shouldn't hide what someone else just did */}
              <ActivityFeed
                boardId={boardId}
                limit={ACTIVITY_PREVIEW}
                compact
              />
            </SummaryCard>

            <TeamWorkload entries={load} members={members} />

            <DueSoon items={due} windowDays={WINDOW_DAYS} />
          </div>
        </div>

        {view.filterCount > 0 || view.query.trim() !== "" ? (
          <p className="text-ink-3 text-center text-xs">
            These figures describe the {todos.length}{" "}
            {todos.length === 1 ? "item" : "items"} matching the current filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "blue" | "green" | "orange";
}) {
  const TONES = {
    blue: "text-status-blue",
    green: "text-status-green",
    orange: "text-status-orange",
  } as const;

  return (
    // bg-surface per cell, not on the grid — the grid's bg is the hairline showing through the gap-px
    <div className="bg-surface flex min-w-0 flex-col gap-1 px-3.5 py-2.5">
      <p
        className={cn(
          "text-xl leading-none font-semibold tabular-nums",
          tone ? TONES[tone] : "text-ink",
        )}
      >
        {value}
      </p>

      <div className="text-ink-3 flex min-w-0 items-center gap-1.5">
        <Icon className="size-3 shrink-0" />

        <span className="text-mini min-w-0 truncate font-medium">{label}</span>
      </div>
    </div>
  );
}

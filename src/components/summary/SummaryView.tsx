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
  priorityDistribution,
  recentCounts,
  statusDistribution,
  summaryStats,
  typeDistribution,
  workload,
} from "@/services/views/summary";
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dueDate";
import SummaryCard from "./SummaryCard";
import StatusOverview from "./StatusOverview";
import { PriorityBreakdown, TeamWorkload, TypeBreakdown } from "./Breakdowns";

/** The window every "recently" and "soon" on this page means. */
const WINDOW_DAYS = 7;

/** How many entries the activity widget shows before the drawer takes over. */
const ACTIVITY_PREVIEW = 6;

/**
 * The board's own dashboard (M18).
 *
 * **A view, not a page**, and that is what made it small: `summary` is an entry
 * in M16's view registry, so it arrives inside the same `ViewShell` as Board and
 * List, under the same identity row, reachable at `?view=summary`, sharing the
 * board's filter and search. Nothing about routing, layout or the toolbar had to
 * learn about it — the registry's capability flags are what tell `ViewToolbar`
 * to drop the Group and Sort controls, because a count has no order to honour.
 *
 * **Everything is scoped to the board in the URL, by construction.** It reads
 * `useVisibleTodos()`, whose scope defaults to `{ kind: "board", boardId }`, and
 * `useColumns()` / `useBoardMembers(boardId)`, both keyed on the same board. No
 * hook here takes a wider scope and none can be handed one — the only way to
 * summarise two boards would be to pass a scope deliberately, and nothing does.
 *
 * **It follows the filter.** A summary of the filtered board is a real question
 * — "how does my work look" is the filter plus this page — and it is the same
 * pipeline the other two views read, so the numbers here and the cards there
 * cannot disagree. The board header's "3 of 57" chip already says when the view
 * is narrowed.
 *
 * **Adding a widget is: write a component, wrap it in `SummaryCard`, put it in
 * the grid.** There is deliberately no dashboard framework, no widget registry
 * and no layout persistence — six widgets do not pay for one, and the brief
 * asked for composable components rather than a system.
 */
export default function SummaryView() {
  const boardId = useBoardId();
  const view = useBoardView();
  const { openPanel } = usePanel();

  const { todos, isLoading, error } = useVisibleTodos();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const today = todayISO();

  // One index, four consumers. Rebuilt only when the columns change, which
  // matters because every optimistic card patch re-runs this component.
  const index = useMemo(() => categoryIndex(columns), [columns]);

  const stats = useMemo(
    () => summaryStats(todos, index, today),
    [todos, index, today],
  );

  const recent = useMemo(
    // `new Date()` rather than a frozen value: this is the render boundary
    // where the clock is allowed to be read, which is exactly why the pure
    // module takes it as an argument.
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

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-6">
      <div className="flex flex-col gap-4">
        {/* THE METRIC ROW — six compact tiles rather than four large ones. They
            are read as a row, so each one is a label, a number and nothing
            else; anything that needs a chart is a widget below. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
            label="Created"
            value={recent.created}
            note={`last ${WINDOW_DAYS} days`}
          />

          <Metric
            icon={PencilLineIcon}
            label="Updated"
            value={recent.updated}
            note={`last ${WINDOW_DAYS} days`}
          />

          <Metric
            icon={CalendarClockIcon}
            label="Due soon"
            value={recent.dueSoon}
            note={`next ${WINDOW_DAYS} days`}
            // Amber only when something is actually due. A permanently coloured
            // zero teaches people to ignore the colour, which costs the one
            // time it matters.
            tone={recent.dueSoon > 0 ? "orange" : undefined}
          />
        </div>

        {/* The two widest widgets first: what the board looks like, and what
            just happened to it. Everything below is a breakdown of the first. */}
        <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
          <StatusOverview
            slices={byStatus}
            columns={columns}
            total={stats.total}
          />

          <SummaryCard
            title="Recent activity"
            hint="The last changes anyone made to this board."
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
            {/* The feed is board-scoped and ignores the view filter, unlike
                every other widget here — an activity entry describes a change,
                not a work item, and narrowing history by the filter you happen
                to have set would quietly hide what someone else just did. */}
            <ActivityFeed boardId={boardId} limit={ACTIVITY_PREVIEW} compact />
          </SummaryCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <PriorityBreakdown slices={byPriority} />
          <TypeBreakdown slices={byType} />
        </div>

        <TeamWorkload entries={load} members={members} />

        {/* Said once, at the foot, rather than on six cards. The identity row
            above already reports "N of M tasks" when a filter is on; this is
            the reminder that the charts moved too. */}
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

/**
 * One number, at the top of the page.
 *
 * Deliberately not a `SummaryCard`: a tile has no title row, no hint and no
 * action, so wearing the widget shell would mean overriding three of its four
 * decisions. The border, surface and radius are the same tokens, which is what
 * makes them belong to the same page.
 */
function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  note?: string;
  tone?: "blue" | "green" | "orange";
}) {
  const TONES = {
    blue: "text-status-blue",
    green: "text-status-green",
    orange: "text-status-orange",
  } as const;

  return (
    <div className="border-hairline bg-surface rounded-surface border px-3.5 py-3">
      <div className="text-ink-3 flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className={cn("size-3.5 shrink-0", tone && TONES[tone])} />
        <span className="truncate">{label}</span>
      </div>

      <p
        className={cn(
          "mt-1.5 text-2xl leading-none font-semibold tabular-nums",
          tone ? TONES[tone] : "text-ink",
        )}
      >
        {value}
      </p>

      {/* Reserved whether or not it is filled, so the six tiles stay the same
          height and the row does not step up and down across breakpoints. */}
      <p className="text-ink-3/70 mt-1 h-3.5 text-[10px] leading-none">
        {note}
      </p>
    </div>
  );
}

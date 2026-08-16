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
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dueDate";
import SummaryCard from "./SummaryCard";
import StatusOverview from "./StatusOverview";
import DueSoon from "./DueSoon";
import { PriorityBreakdown, TeamWorkload, TypeBreakdown } from "./Breakdowns";

/** The window every "recently" and "soon" on this page means. */
const WINDOW_DAYS = 7;

/** How many entries the activity widget shows before the drawer takes over. */
const ACTIVITY_PREVIEW = 7;

/** How many deadlines the due-soon widget lists before it stops being a list. */
const DUE_SOON_LIMIT = 7;

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
 * **The layout is three rows of two, under one strip.** Each row pairs a
 * question with its answer at the same altitude: what the board looks like
 * beside what just happened to it; how it is prioritised beside what kind of
 * work it is; who is carrying it beside what is about to be late. Nothing here
 * spans the full width any more — a full-bleed card with four rows in it was
 * most of the empty space on the previous version.
 *
 * **Adding a widget is: write a component, wrap it in `SummaryCard`, put it in
 * the grid.** There is deliberately no dashboard framework, no widget registry
 * and no layout persistence — seven widgets do not pay for one, and the brief
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

  // One index, five consumers. Rebuilt only when the columns change, which
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

  const due = useMemo(
    () => dueSoonItems(todos, index, today, WINDOW_DAYS, DUE_SOON_LIMIT),
    [todos, index, today],
  );

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-6">
      <div className="flex flex-col gap-4">
        {/* THE METRIC STRIP — one surface split by hairlines, not six floating
            tiles. Six bordered boxes in a row is six objects to parse before
            the first number is read, and each one carried enough padding to
            make the row taller than the chart beneath it. As one strip it is a
            single object with six readings, which is what the row actually is.

            **`gap-px` over `bg-hairline`, not `divide-x`.** The grid is 2 / 3 /
            6 columns across three breakpoints, and `divide-*` puts its border
            on every child but the first — which in a 3-column grid draws a top
            rule on cells 2 and 3 as well, mid-row. A one-pixel gap letting the
            parent's own colour through is a rule between every pair of
            neighbours at any column count, with nothing to keep in step. Each
            cell repaints `bg-surface` over it. */}
        <div className="border-hairline bg-hairline rounded-surface grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 xl:grid-cols-6">
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

        {/* The two widest questions first: what the board looks like, and what
            just happened to it. Everything below is a breakdown of the first. */}
        <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_1fr]">
          <StatusOverview
            slices={byStatus}
            columns={columns}
            total={stats.total}
            done={stats.done}
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

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <PriorityBreakdown slices={byPriority} />
          <TypeBreakdown slices={byType} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <TeamWorkload entries={load} members={members} />
          <DueSoon items={due} windowDays={WINDOW_DAYS} />
        </div>

        {/* Said once, at the foot, rather than on seven cards. The identity row
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
 * One number in the strip.
 *
 * Deliberately not a `SummaryCard`: a cell has no title row, no hint and no
 * action, so wearing the widget shell would mean overriding three of its four
 * decisions — and it has no border of its own at all now that the strip
 * supplies one for the whole row.
 *
 * Label and value on ONE line rather than stacked. Stacked, six of these were
 * ~110px tall and the row outweighed the chart under it; side by side they are
 * ~62px and the number is still the largest thing in the cell, because size and
 * weight carry the hierarchy rather than position.
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
    // `bg-surface` here rather than on the grid: the grid's background is the
    // hairline the 1px gaps expose, so each cell has to repaint over it.
    <div className="bg-surface flex min-w-0 items-center gap-3 px-3.5 py-3">
      {/* The glyph sits in a tinted disc rather than beside the label, so the
          six cells have one repeating anchor down the left of each and the row
          scans as a row. */}
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          tone ? `${TONES[tone]} bg-current/10` : "text-ink-3 bg-ink/[0.06]",
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0">
        <p
          className={cn(
            "text-xl leading-none font-semibold tabular-nums",
            tone ? TONES[tone] : "text-ink",
          )}
        >
          {value}
        </p>

        <p className="text-ink-3 mt-1 truncate text-[11px] font-medium">
          {label}
        </p>

        {/* Reserved whether or not it is filled, so the six cells stay the same
            height and the strip does not step up and down across breakpoints. */}
        <p className="text-ink-3/70 mt-0.5 h-3 truncate text-[10px] leading-none">
          {note}
        </p>
      </div>
    </div>
  );
}

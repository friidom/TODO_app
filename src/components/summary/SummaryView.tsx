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

/** The window every "recently", "soon" and "trend" on this page means. */
const WINDOW_DAYS = 7;

/**
 * How many entries the activity widget shows before the drawer takes over.
 *
 * Five. This and `DUE_SOON_LIMIT` are the only two heights on the page that grow
 * with the data, so they are what decides whether the dashboard stays composed.
 * The drawer is one click away and holds the rest.
 */
const ACTIVITY_PREVIEW = 5;

/**
 * How many deadlines the due-soon widget lists before it stops being a list.
 *
 * Six, because it is the narrowest panel on the page. A deeper list there would
 * be the tallest thing on the dashboard for the least reason; the board and the
 * list view are where you work through them.
 */
const DUE_SOON_LIMIT = 6;

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
 * **A KPI strip over two columns**, reading left to right as "what is the work"
 * and "what is happening to it":
 *
 * - *left (7/12)* — Work status, Activity trends, Work distribution: the shape
 *   of the board, how it is moving, what it is made of.
 * - *right (5/12)* — Activity feed, Team workload, Due soon: what just changed,
 *   who is carrying it, what needs attention.
 * - above both — the strip: how much work there is.
 *
 * **Columns rather than grid rows, and that is the whole trick.** Panels in a
 * grid *row* share a height, and these panels differ enormously — a four-person
 * workload is ~160px next to a ten-row distribution at ~310px. Sharing a row
 * leaves exactly two options, and both look broken: stretch the short panel
 * (blank surface inside the card) or start it (a ~150px hole of canvas beneath
 * it). Columns have no such coupling — a short panel just pulls the next one up,
 * so the only uneven edge on the page is where the two columns end.
 *
 * **Nothing stretches, either.** `SummaryCard`'s body is not `flex-1` and the
 * outer grid is `items-start`, which is why a four-row panel ends after four
 * rows.
 *
 * **The chart charts what exists.** Created and Updated are real per-day series
 * folded out of `created_at` and `updated_at`; *Completed* is not, and is not
 * drawn — `services/views/trends.ts` records why, and what would make it
 * possible. Nothing on this page is estimated, inferred or filled in.
 *
 * **Adding a widget is: write a component, wrap it in `SummaryCard`, give it a
 * span.** There is deliberately no dashboard framework, no widget registry, no
 * layout primitive and no layout persistence — seven widgets do not pay for one,
 * and the brief asked for composable components rather than a system.
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

  const trend = useMemo(
    () => activityTrend(todos, new Date(), WINDOW_DAYS),
    [todos],
  );

  if (isLoading) return <Loading />;

  if (error) return <p className="text-status-red text-sm">{error.message}</p>;

  return (
    <div className="h-full min-h-0 overflow-y-auto pb-4">
      {/* 12px between the strip and the grid, and 12px inside it — one spacing
          step for the whole page rather than a different one per tier. */}
      <div className="flex flex-col gap-3">
        {/* THE KPI STRIP — one surface split by hairlines, not six floating
            tiles. Six bordered boxes in a row is six objects to parse before
            the first number is read. As one strip it is a single object with
            six readings, which is what the row actually is.

            **`gap-px` over `bg-hairline`, not `divide-x`.** The grid is 2 / 3 /
            6 columns across three breakpoints, and `divide-*` puts its border
            on every child but the first — which in a 3-column grid draws a top
            rule on cells 2 and 3 as well, mid-row. A one-pixel gap letting the
            parent's own colour through is a rule between every pair of
            neighbours at any column count, with nothing to keep in step. Each
            cell repaints `bg-surface` over it. */}
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

          {/* The window folded into the label rather than set on a line of its
              own. Three of the six cells have no window to report, so a
              reserved third line was blank height on half the strip — and
              "Created · 7d" is the same fact in the space the label already
              occupied. */}
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
            // Amber only when something is actually due. A permanently coloured
            // zero teaches people to ignore the colour, which costs the one
            // time it matters.
            tone={recent.dueSoon > 0 ? "orange" : undefined}
          />
        </div>

        {/* THE DASHBOARD — TWO INDEPENDENT COLUMNS, not a grid of rows.

            **This is what removes the holes, and it is structural rather than a
            spacing tweak.** Panels laid out as grid *rows* share a row height,
            and because these panels have very different natural heights — a
            four-person workload is ~160px beside a ten-row distribution at
            ~310px — the short one either stretched (a blank lower half inside
            the card) or, with `items-start`, left a ~150px hole of canvas
            beneath it. Both are the "ugly space between blocks". There is no
            third option *within a row*.

            A column has no such coupling. Each is `flex flex-col gap-3`, so its
            panels sit exactly 12px apart whatever they contain, and a short
            panel simply pulls the next one up. The only ragged edge left is
            where the two columns end, at the very bottom of the page, which
            reads as the page ending rather than as a gap.

            The split is 7/5 and the two columns are chosen so their totals land
            close: the analytical half (shape, trend, composition) on the left,
            the "what is happening and what needs me" half on the right. Below
            `lg` it is one column and the panels stack in that same order. */}
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
              {/* The feed is board-scoped and ignores the view filter, unlike
                  every other widget here — an activity entry describes a change,
                  not a work item, and narrowing history by the filter you happen
                  to have set would quietly hide what someone else just did. */}
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

        {/* Said once, at the foot, rather than on seven widgets. The identity
            row above already reports "N of M tasks" when a filter is on; this is
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
 * Deliberately not a `SummaryCard`: a cell has no title row and no action, so
 * wearing the widget shell would mean overriding most of its decisions — and it
 * has no border of its own at all, because the strip supplies one for the row.
 *
 * **The number first, the label muted under it, the glyph small and beside the
 * label.** It read label-first once, which made the eye pass six captions before
 * reaching a single figure; a strip of statistics is scanned for the statistics.
 * The glyph is `size-3` and `text-ink-3` — an anchor for the eye running along
 * the row, not an illustration. It sits in no disc: a `size-8` tinted circle set
 * the cell's height from its decoration rather than from its text.
 *
 * The tone colours the number rather than the label, because the number is what
 * the colour is about.
 */
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
    // `bg-surface` here rather than on the grid: the grid's background is the
    // hairline the 1px gaps expose, so each cell has to repaint over it.
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

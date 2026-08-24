import type { ReactNode } from "react";
import { UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { workTypeOf, type WorkType } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { Slice, WorkloadEntry } from "@/services/views/summary";
import { cn } from "@/utils/cn";
import SummaryCard, { DistributionRow, WidgetEmpty } from "./SummaryCard";

/**
 * The board's distribution, by priority, work type and assignee (M18).
 *
 * One file because they are one shape — a labelled row per category, a thin bar,
 * a count — and splitting them across files would be filing rather than
 * structure.
 *
 * **Rows are the whole widget.** Each used to open with a stacked composition
 * bar summarising the rows beneath it; it is gone. It answered a question the
 * rows already answer, and a breakdown of four categories should be four lines
 * tall — the point of these is density, not a chart.
 *
 * Bars are scaled to the LARGEST ROW rather than to the total, because the
 * question here is comparative: scaling to the total makes every bar a sliver on
 * a board with six categories. The count and the percent beside each row are the
 * absolute answers for anyone who wants them.
 */

/** Row bars: percent of the heaviest row, never dividing by zero. */
function scale(count: number, heaviest: number): number {
  return heaviest === 0 ? 0 : (count / heaviest) * 100;
}

/**
 * A labelled group of rows inside a panel that holds more than one.
 *
 * The alternative was two panels, and two panels is what this replaces: priority
 * and type are the same question asked of two fields, so a frame around each was
 * a border drawn between halves of one thought. A small caps label costs ~14px
 * and says the same thing.
 */
function Subsection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-ink-3/80 text-micro mb-1.5 font-semibold tracking-[0.06em] uppercase">
        {label}
      </p>

      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/**
 * What the board is made of: priority and work type, in one surface.
 *
 * Two subsections rather than two panels. They answer the same shape of question
 * about two fields of the same rows, they are read together, and at four to six
 * rows each neither is big enough to be a widget on its own.
 */
export function WorkDistribution({
  priority,
  types,
  className,
}: {
  priority: Slice<Priority | null>[];
  types: Slice<WorkType>[];
  /** The widget's span in the Summary's grid. */
  className?: string;
}) {
  const priorityHeaviest = Math.max(...priority.map((s) => s.count), 0);
  const priorityTotal = priority.reduce((sum, s) => sum + s.count, 0);

  const typeHeaviest = Math.max(...types.map((s) => s.count), 0);
  const typeTotal = types.reduce((sum, s) => sum + s.count, 0);

  return (
    <SummaryCard title="Work distribution" className={className}>
      {priorityTotal === 0 && typeTotal === 0 ? (
        <WidgetEmpty>No work items to break down.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-3 px-3.5 pb-3">
          <Subsection label="Priority">
            {priority.map((slice) => {
              const meta = slice.key ? PRIORITIES[slice.key] : null;
              const Icon = meta?.icon;

              return (
                <DistributionRow
                  key={slice.key ?? "none"}
                  icon={
                    Icon ? (
                      <Icon className={cn("size-3.5 shrink-0", meta.tone)} />
                    ) : (
                      <span className="bg-ink/20 size-1.5 shrink-0 rounded-full" />
                    )
                  }
                  label={meta?.label ?? "No priority"}
                  count={slice.count}
                  percent={scale(slice.count, priorityHeaviest)}
                  share={
                    priorityTotal === 0
                      ? undefined
                      : (slice.count / priorityTotal) * 100
                  }
                  // The bar takes the priority's own semantic colour, held back
                  // to 70% so five full-strength bars do not turn the panel into
                  // a traffic light. Unset is ink, because it means nothing.
                  barClassName={
                    meta ? cn(meta.tone, "bg-current opacity-70") : "bg-ink/25"
                  }
                />
              );
            })}
          </Subsection>

          <Subsection label="Type">
            {types.map((slice) => {
              const meta = workTypeOf(slice.key);
              const Icon = meta.icon;

              return (
                <DistributionRow
                  key={slice.key}
                  icon={<Icon className={cn("size-3.5 shrink-0", meta.tone)} />}
                  label={slice.key}
                  count={slice.count}
                  percent={scale(slice.count, typeHeaviest)}
                  share={
                    typeTotal === 0
                      ? undefined
                      : (slice.count / typeTotal) * 100
                  }
                  barClassName={cn(meta.tone, "bg-current opacity-70")}
                />
              );
            })}
          </Subsection>
        </div>
      )}
    </SummaryCard>
  );
}

/**
 * Who is carrying the open work.
 *
 * Open only — `workload()` drops finished items, because a person who shipped
 * forty tasks is not busier than one who shipped none, and counting completed
 * work would rank the roster by tenure.
 *
 * Unassigned is a row rather than an omission. On most boards it is the largest
 * one, and hiding it would make the chart describe a minority of the work.
 *
 * **One line per person**, on the same grid as the other two breakdowns: a name
 * track, a bar, a count. It used to stack the bar under the name, which made a
 * four-person board twice as tall as it needed to be for the same four numbers.
 *
 * **The list scrolls past a ceiling rather than growing.** This is the one
 * widget whose height is set by the roster rather than by a fixed set of
 * categories, so a board with thirty assignees would otherwise be taller than
 * the rest of the dashboard put together. Two columns were the previous answer
 * and are the wrong one here: a second column halves the bars this widget exists
 * to compare. The app styles scrollbars thin globally, so the overflow needs no
 * CSS of its own.
 */
export function TeamWorkload({
  entries,
  members,
  className,
}: {
  entries: WorkloadEntry[];
  members: BoardMember[];
  /** The widget's span in the Summary's grid. */
  className?: string;
}) {
  const heaviest = Math.max(...entries.map((entry) => entry.open), 0);
  const totalOpen = entries.reduce((sum, entry) => sum + entry.open, 0);

  return (
    <SummaryCard
      title="Team workload"
      className={className}
      action={
        totalOpen > 0 ? (
          <span className="text-ink-3 text-mini tabular-nums">
            {totalOpen} open
          </span>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <WidgetEmpty>No open work items to distribute.</WidgetEmpty>
      ) : (
        // `max-h-52` is about seven rows — the point where this list becomes
        // longer than anything beside it.
        <div className="max-h-52 overflow-y-auto px-3.5 pb-3">
          {entries.map((entry) => {
            const member = entry.assigneeId
              ? members.find((it) => it.id === entry.assigneeId)
              : undefined;

            return (
              <div
                key={entry.assigneeId ?? "unassigned"}
                className="flex items-center gap-2 py-0.5"
              >
                <div className="flex min-w-0 flex-[0_0_9rem] items-center gap-1.5">
                  {member ? (
                    <Avatar size="sm" className="shrink-0">
                      <AvatarImage
                        src={member.avatar_url ?? undefined}
                        alt=""
                      />
                      <AvatarFallback className="bg-ink/10 text-ink-2 text-micro font-semibold">
                        {memberInitial(member)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="border-hairline text-ink-3 grid size-6 shrink-0 place-items-center rounded-full border border-dashed">
                      <UserIcon className="size-3" />
                    </span>
                  )}

                  <span className="text-ink-2 min-w-0 truncate text-xs">
                    {/* An assignee id with no roster row is somebody who has
                        been removed from the board; their cards keep the id
                        (`on delete set null` only fires when the profile itself
                        goes), so this is a real and reachable row. */}
                    {member
                      ? memberName(member)
                      : entry.assigneeId
                        ? "Former member"
                        : "Unassigned"}
                  </span>
                </div>

                {/* Two segments in one bar: how much, and how much of it is
                    late. A separate bar for the overdue share would be two
                    lengths to compare where one will do. */}
                <div className="bg-ink/[0.06] flex h-1 min-w-0 flex-1 overflow-hidden rounded-full">
                  <div
                    style={{ width: `${scale(entry.overdue, heaviest)}%` }}
                    className="bg-status-red transition-[width] duration-200"
                  />
                  <div
                    style={{
                      width: `${scale(entry.open - entry.overdue, heaviest)}%`,
                    }}
                    className="bg-brand/60 transition-[width] duration-200"
                  />
                </div>

                <span className="text-ink w-6 shrink-0 text-right text-xs font-medium tabular-nums">
                  {entry.open}
                </span>

                {/* Fixed width whether or not it is filled — the same reserved
                    cell `DistributionRow` keeps for its share, and for the same
                    reason: a variable-width marker on some rows only would step
                    the counts out of one column. */}
                <span className="text-status-red text-mini w-11 shrink-0 text-right font-medium tabular-nums">
                  {entry.overdue > 0 ? `${entry.overdue} late` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SummaryCard>
  );
}

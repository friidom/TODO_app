import { UserIcon } from "lucide-react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { PRIORITIES, type Priority } from "@/constants/priorities";
import { workTypeOf, type WorkType } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { Slice, WorkloadEntry } from "@/services/views/summary";
import { cn } from "@/utils/cn";
import SummaryCard, { DistributionRow, WidgetEmpty } from "./SummaryCard";

/**
 * The three horizontal breakdowns: priority, work type and assignee (M18).
 *
 * One file because they are one shape — a labelled row, a bar, a count — and
 * splitting three twenty-line components across three files would be filing
 * rather than structure. Each is exported separately, so the Summary composes
 * them individually and a future widget replaces one without touching the
 * others.
 *
 * **Bars are scaled to the largest row, not to the total.** The question these
 * answer is comparative — who has the most, which priority dominates — and
 * scaling to the total makes every bar a sliver on a board with six categories.
 * The count beside each row is the absolute answer for anyone who wants it.
 */

/** Shared by all three: percent of the heaviest row, never dividing by zero. */
function scale(count: number, heaviest: number): number {
  return heaviest === 0 ? 0 : (count / heaviest) * 100;
}

export function PriorityBreakdown({
  slices,
}: {
  slices: Slice<Priority | null>[];
}) {
  const heaviest = Math.max(...slices.map((slice) => slice.count), 0);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <SummaryCard
      title="Priority breakdown"
      hint="How the work on this board is prioritised."
    >
      {total === 0 ? (
        <WidgetEmpty>Nothing to prioritise yet.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          {slices.map((slice) => {
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
                percent={scale(slice.count, heaviest)}
                // The bar takes the priority's own semantic colour, held back to
                // 70% so five full-strength bars do not turn the card into a
                // traffic light. Unset is ink, because it means nothing.
                barClassName={
                  meta ? cn(meta.tone, "bg-current opacity-70") : "bg-ink/25"
                }
              />
            );
          })}
        </div>
      )}
    </SummaryCard>
  );
}

export function TypeBreakdown({ slices }: { slices: Slice<WorkType>[] }) {
  const heaviest = Math.max(...slices.map((slice) => slice.count), 0);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <SummaryCard
      title="Types of work"
      hint="What kind of work this board is carrying."
    >
      {total === 0 ? (
        <WidgetEmpty>No work items to break down.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          {slices.map((slice) => {
            const meta = workTypeOf(slice.key);
            const Icon = meta.icon;

            return (
              <DistributionRow
                key={slice.key}
                icon={<Icon className={cn("size-3.5 shrink-0", meta.tone)} />}
                label={slice.key}
                count={slice.count}
                percent={scale(slice.count, heaviest)}
                barClassName={cn(meta.tone, "bg-current opacity-70")}
              />
            );
          })}
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
 */
export function TeamWorkload({
  entries,
  members,
}: {
  entries: WorkloadEntry[];
  members: BoardMember[];
}) {
  const heaviest = Math.max(...entries.map((entry) => entry.open), 0);

  return (
    <SummaryCard
      title="Team workload"
      hint="Open work items per person on this board."
    >
      {entries.length === 0 ? (
        <WidgetEmpty>No open work items to distribute.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {entries.map((entry) => {
            const member = entry.assigneeId
              ? members.find((it) => it.id === entry.assigneeId)
              : undefined;

            return (
              <div key={entry.assigneeId ?? "unassigned"}>
                <div className="flex items-center gap-2.5">
                  {member ? (
                    <MemberIdentity member={member} />
                  ) : (
                    <>
                      <span className="border-hairline text-ink-3 grid size-6 shrink-0 place-items-center rounded-full border border-dashed">
                        <UserIcon className="size-3" />
                      </span>

                      <p className="text-ink-2 min-w-0 flex-1 truncate text-[13px] font-medium">
                        {/* An assignee id with no roster row is somebody who has
                            been removed from the board; their cards keep the id
                            (`on delete set null` only fires when the profile
                            itself goes), so this is a real and reachable row. */}
                        {entry.assigneeId ? "Former member" : "Unassigned"}
                      </p>
                    </>
                  )}

                  <span className="text-ink shrink-0 text-[13px] font-medium tabular-nums">
                    {entry.open}
                  </span>
                </div>

                {/* Two segments in one bar: how much, and how much of it is
                    late. A separate "2 overdue" label would put a second number
                    beside the count it qualifies. */}
                <div className="bg-ink/[0.06] mt-1.5 flex h-1.5 overflow-hidden rounded-full">
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
              </div>
            );
          })}
        </div>
      )}
    </SummaryCard>
  );
}

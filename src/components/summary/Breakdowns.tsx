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

// bars scale to the heaviest row, not the total — otherwise every bar is a sliver once there are six categories
function scale(count: number, heaviest: number): number {
  return heaviest === 0 ? 0 : (count / heaviest) * 100;
}

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

export function WorkDistribution({
  priority,
  types,
  className,
}: {
  priority: Slice<Priority | null>[];
  types: Slice<WorkType>[];
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
                  // held back to 70% opacity so five full-strength bars don't turn the panel into a traffic light
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

export function TeamWorkload({
  entries,
  members,
  className,
}: {
  entries: WorkloadEntry[];
  members: BoardMember[];
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
                    {/* an assignee id with no roster row is someone removed from the board, not deleted */}
                    {member
                      ? memberName(member)
                      : entry.assigneeId
                        ? "Former member"
                        : "Unassigned"}
                  </span>
                </div>

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

                {/* fixed width even when empty, so the count column stays aligned */}
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

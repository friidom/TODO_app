import { useMemo } from "react";
import { ArrowRightIcon, HistoryIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useActivities } from "@/services/activities/useActivities";
import { groupActivitiesByDay } from "@/services/activities/activityGroups";
import {
  describeActivity,
  type ActivityContext,
} from "@/services/activities/activityText";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import type { BoardMember } from "@/services/members/membersApi";
import { useTodos } from "@/services/todos/useTodos";
import type { Activity } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

// Board-scoped only — a cross-board feed would need a union over every readable board, out of scope for now.
// Joins nothing at read time: people come from the roster already in cache, and the trigger snapshotted the rest into the payload, so a deleted card still reads fine.
export default function ActivityFeed({
  boardId,
  limit,
  compact = false,
}: {
  boardId: string | undefined;
  limit?: number;
  // the Summary widget's variant: smaller avatar, inline timestamp, no sticky headers
  compact?: boolean;
}) {
  const { data: activities, isPending, error } = useActivities(boardId);
  const { data: members = [] } = useBoardMembers(boardId);
  const { data: todos = [] } = useTodos();
  const keyPrefix = useKeyPrefix();

  const context = useMemo<ActivityContext>(
    () => ({
      keyPrefix,
      names: Object.fromEntries(
        members.map((member) => [member.id, memberName(member)]),
      ),
      // so a row about a deleted task renders as text instead of a dead link
      liveTaskIds: new Set(todos.map((todo) => todo.id)),
    }),
    [keyPrefix, members, todos],
  );

  const shown = limit ? activities?.slice(0, limit) : activities;

  const days = useMemo(
    () => (shown ? groupActivitiesByDay(shown, new Date()) : []),
    [shown],
  );

  if (isPending) {
    return (
      <div
        className={cn(compact ? "space-y-2 px-3.5 pb-3" : "space-y-4 p-4")}
        aria-busy
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton
              className={cn(
                "shrink-0 rounded-full",
                compact ? "size-5" : "size-6",
              )}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              {!compact && <Skeleton className="h-2.5 w-16" />}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p
        className={cn(
          "text-status-red text-sm",
          compact ? "px-3.5 pb-3" : "p-4",
        )}
      >
        Could not load this board's activity.
      </p>
    );
  }

  if (days.length === 0) {
    return compact ? (
      <p className="text-ink-3 px-4 py-5 text-center text-xs">
        No activity yet.
      </p>
    ) : (
      <div className="flex flex-col items-center gap-1 px-6 py-16 text-center">
        <span className="bg-ink/[0.06] text-ink-3 mb-3 grid size-10 place-items-center rounded-full">
          <HistoryIcon className="size-4" />
        </span>

        <p className="text-ink text-sm font-medium">Nothing has happened yet</p>
        <p className="text-ink-3 max-w-[15rem] text-xs">
          Creating, moving and assigning work items will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "px-1.5 pb-2" : "p-2"}>
      {days.map((day) => (
        <section key={day.key}>
          {/* sticky only in the drawer — the Summary widget's scroller is the whole page, so top-0 there floats over the KPI strip */}
          <h3
            className={cn(
              "text-ink-3 text-mini px-2 font-semibold tracking-[0.04em] uppercase shadow-[inset_0_-1px_0_var(--hairline)]",
              compact ? "bg-surface py-1" : "bg-rail sticky top-0 z-10 py-1.5",
            )}
          >
            {day.label}
          </h3>

          <ul className={compact ? "pt-0.5 pb-1.5" : "pt-1 pb-2"}>
            {day.items.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                context={context}
                members={members}
                compact={compact}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// members is a prop, not its own useBoardMembers call — fifty rows would mean fifty subscriptions on one cache entry.
function ActivityRow({
  activity,
  context,
  members,
  compact = false,
}: {
  activity: Activity;
  context: ActivityContext;
  members: BoardMember[];
  compact?: boolean;
}) {
  const { openTask } = useOpenTask();

  const line = describeActivity(activity, context);
  const actor = members.find((member) => member.id === activity.actor_id);

  const when = relativeTime(activity.created_at, undefined, { short: compact });

  const chip = line.detail && (
    <span className="border-hairline bg-ink/[0.04] text-mini inline-flex min-w-0 items-center gap-1 rounded-full border py-0.5 pr-2 pl-1.5">
      <span className="text-ink-3 shrink-0">{line.detail.label}</span>

      <ArrowRightIcon className="text-ink-3/60 size-3 shrink-0" />

      <span
        className={cn(
          "min-w-0 truncate font-medium",
          line.detail.tone ?? "text-ink",
        )}
      >
        {line.detail.value}
      </span>
    </span>
  );

  const sentence = (
    <p className="text-ink-2 text-meta min-w-0 leading-snug">
      <span className="text-ink font-medium">
        {actor ? memberName(actor) : "Someone"}
      </span>{" "}
      {line.text}
    </p>
  );

  const body = (
    <>
      <Avatar
        size="sm"
        // has to match the data-size variant the primitive uses, or tailwind-merge won't override it
        className={cn("mt-0.5 shrink-0", compact && "data-[size=sm]:size-5")}
      >
        <AvatarImage src={actor?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-ink/10 text-ink-2 text-micro font-semibold">
          {actor ? memberInitial(actor) : "?"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        {compact ? (
          <div className="flex items-baseline gap-2">
            {sentence}

            {when && (
              <span className="text-ink-3/70 text-mini ml-auto shrink-0 whitespace-nowrap tabular-nums">
                {when}
              </span>
            )}
          </div>
        ) : (
          sentence
        )}

        {chip && <div className={compact ? "mt-1" : "mt-1.5"}>{chip}</div>}

        {!compact && when && (
          <p className="text-ink-3 text-mini mt-0.5 tabular-nums">{when}</p>
        )}
      </div>
    </>
  );

  const shell = cn(
    "flex w-full gap-2.5 rounded-control px-2 text-left",
    compact ? "py-1" : "py-1.5",
  );

  return (
    <li>
      {line.taskId !== null ? (
        <button
          type="button"
          onClick={() => openTask(line.taskId!)}
          className={cn(
            shell,
            "hover:bg-ink/[0.05] focus-visible:ring-brand transition-colors outline-none focus-visible:ring-2",
          )}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}

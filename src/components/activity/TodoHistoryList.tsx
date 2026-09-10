import { ArrowRightIcon } from "lucide-react";
import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import {
  describeHistoryChange,
  type HistoryChange,
} from "@/services/activities/historyText";
import { useTodoActivities } from "@/services/activities/useTodoActivities";
import type { BoardMember } from "@/services/members/membersApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import type { Activity } from "@/types/data";
import { relativeTime } from "@/utils/relativeTime";

// flat list, unlike ActivityFeed's day-grouped drawer — one card's history is short enough to not need day headers
export default function TodoHistoryList({
  todoId,
  boardId,
  currentUserId,
}: {
  todoId: string;
  boardId: string;
  currentUserId: string | undefined;
}) {
  const {
    data: activities,
    isPending,
    error,
  } = useTodoActivities(todoId, boardId);
  const { data: members = [] } = useBoardMembers(boardId);

  const names = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, memberName(m)])),
    [members],
  );

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-status-red text-sm">Could not load this history.</p>
    );
  }

  // describeHistoryChange returns null for actions it doesn't know how to phrase — filtered, not rendered blank
  const rows = (activities ?? [])
    .map((activity) => ({
      activity,
      change: describeHistoryChange(activity, names),
    }))
    .filter(
      (row): row is { activity: Activity; change: HistoryChange } =>
        row.change !== null,
    );

  if (rows.length === 0) {
    return <p className="text-ink-3 py-1 text-sm">No history yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {rows.map(({ activity, change }) => (
        <li key={activity.id}>
          <HistoryRow
            activity={activity}
            change={change}
            members={members}
            currentUserId={currentUserId}
          />
        </li>
      ))}
    </ol>
  );
}

// exported so ActivitySection's "All" tab can render this with the same markup a CommentRow gets
export function HistoryRow({
  activity,
  change,
  members,
  currentUserId,
}: {
  activity: Activity;
  change: HistoryChange;
  members: BoardMember[];
  currentUserId: string | undefined;
}) {
  const actor = members.find((member) => member.id === activity.actor_id);

  // "You" for the viewer's own edits — only here, ActivityFeed always resolves a name
  const actorLabel =
    activity.actor_id !== null && activity.actor_id === currentUserId
      ? "You"
      : actor
        ? memberName(actor)
        : "Someone";

  const hasChip = change.from !== null && change.to !== null;

  return (
    <article className="flex gap-2.5">
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarImage src={actor?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
          {actor ? memberInitial(actor) : "?"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-ink-2 text-sm leading-snug">
          <span className="text-ink font-medium">{actorLabel}</span>{" "}
          {change.field ? (
            <>
              {change.verb} the{" "}
              <span className="text-ink font-medium">{change.field}</span>
            </>
          ) : (
            change.verb
          )}
        </p>

        <time
          dateTime={activity.created_at}
          title={new Date(activity.created_at).toLocaleString()}
          className="text-ink-3 text-xs"
        >
          {relativeTime(activity.created_at)}
        </time>

        {hasChip && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <span className="bg-ink/[0.06] text-ink-2 text-mini min-w-0 truncate rounded-full px-2 py-0.5">
              {change.from}
            </span>

            <ArrowRightIcon className="text-ink-3/60 size-3 shrink-0" />

            <span className="bg-brand-soft text-brand text-mini min-w-0 truncate rounded-full px-2 py-0.5 font-medium">
              {change.to}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

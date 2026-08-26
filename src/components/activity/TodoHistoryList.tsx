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

/**
 * One work item's History tab (M25) — the Jira-style field/chip rendering the
 * reference asks for, over the same `activities` table the board-wide feed
 * reads.
 *
 * **A flat list, unlike `ActivityFeed`'s day-grouped drawer.** One item's
 * lifetime of activity is bounded and usually short; a day header earns its
 * place scanning a board's worth of history across weeks, not one card's.
 *
 * **`names` is built once here and handed to both `HistoryRow` and
 * `ActivitySection`'s "All" tab** (which imports `HistoryRow` directly) — the
 * same shape `ActivityContext.names` already established, so a history
 * renderer resolving an assignee id is not a new convention.
 */
export default function TodoHistoryList({
  todoId,
  boardId,
  currentUserId,
}: {
  todoId: string;
  boardId: string;
  /** The signed-in viewer's id, for the "You" substitution `HistoryRow` does
   * that the board-wide feed deliberately does not. */
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

  // Filtered rather than mapped-and-nulled: `deleted` and any action a future
  // migration adds ahead of this build return null from `describeHistoryChange`,
  // and a list a person is reading should not show a blank row for either.
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

/**
 * One history entry: avatar, "{actor} changed the {field}", a relative
 * timestamp on its own line, and — when there is a value to show — a
 * two-chip "old → new" row underneath, the new value emphasized. Matches the
 * reference screenshot's spacing rather than `ActivityFeed`'s single
 * destination-only chip, which is the one place the two renderers genuinely
 * differ (see `historyText.ts`'s header for why).
 *
 * Exported so `ActivitySection`'s "All" tab can render a history row with the
 * identical markup a plain `CommentRow` gets for a comment — one look for the
 * merged feed, not two competing ones.
 */
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

  // "You" for the viewer's own edits, matching the reference's mixed example
  // ("aminjanovkamoliddin0725 changed the Status" / "You changed Story
  // Points"). Deliberately only here — the board-wide `ActivityFeed` keeps
  // always resolving a name, unchanged.
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

            {/* The new value is the one worth seeing at a glance — the same
                argument `ActivityFeed`'s own chip makes for its single
                destination value, applied here to the second half of a pair
                instead of the whole chip. */}
            <span className="bg-brand-soft text-brand text-mini min-w-0 truncate rounded-full px-2 py-0.5 font-medium">
              {change.to}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

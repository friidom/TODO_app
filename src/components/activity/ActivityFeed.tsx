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

/**
 * What has happened on this board (M18).
 *
 * **This feed is the reason the `activities` table is allowed to exist.**
 * M7-05 made the log conditional on a reader — *"an unbounded audit table with
 * no reader grows forever and is silently wrong the day you finally build the
 * UI"* — and refused to build one without it. This is that reader, shipped in
 * the same milestone as the table and the triggers.
 *
 * **Board-scoped, and that is the plan's decision rather than a shortcut.**
 * `activities.board_id` is the policy key, so a board's history is exactly what
 * one RLS predicate returns. A cross-board feed would be a union of readable
 * boards, which M18 puts under *Explicitly not* for v1 — so the feed lives
 * beside the board it describes, in the drawer slot M17 already built, and the
 * Overview carries statistics instead.
 *
 * **It joins nothing.** People are resolved through the roster the board
 * already has in cache, and the live work items through the board's own todo
 * cache — both are entries other surfaces filled, so opening this costs one
 * query. Everything else the sentence needs was snapshotted into the payload by
 * the trigger, which is what lets an entry about a deleted card still read.
 *
 * **Three things per entry, in a fixed shape**: who (avatar and name), what
 * (the sentence), and where it landed (the chip). The chip is the part worth
 * having — a column of "→ In Progress", "→ Highest", "→ Aug 20" can be scanned
 * without reading a single sentence, which is what makes this a feed rather
 * than a log dump.
 *
 * **Two callers, one component.** The drawer shows the whole page of entries;
 * the Summary tab shows the newest few inside a widget. They differ by a
 * `limit` and by what wraps them, which is not enough difference to be worth a
 * second implementation of fourteen event sentences.
 */
export default function ActivityFeed({
  boardId,
  limit,
  compact = false,
}: {
  /**
   * Undefined while the route param resolves. `useActivities` is disabled for
   * it, so the feed renders its loading state rather than querying for a board
   * that is not there yet — the same contract every board-scoped hook here has.
   */
  boardId: string | undefined;
  /** Newest N. Absent means the whole page the query returned. */
  limit?: number;
  /** Tighter rows and no padding of its own, for a card that supplies both. */
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
      // What still exists, so a row that would open a "Task not found" modal is
      // rendered as text instead of as a link. Read from the board's own cache
      // rather than queried — the board page has it, and this drawer only opens
      // over a board.
      liveTaskIds: new Set(todos.map((todo) => todo.id)),
    }),
    [keyPrefix, members, todos],
  );

  const shown = limit ? activities?.slice(0, limit) : activities;

  const days = useMemo(
    // `new Date()` rather than a frozen value: this is the render boundary
    // where the clock is allowed to be read, which is exactly why the pure
    // module takes it as an argument.
    () => (shown ? groupActivitiesByDay(shown, new Date()) : []),
    [shown],
  );

  if (isPending) {
    return (
      <div className={cn("space-y-4", compact ? "px-4 pb-4" : "p-4")} aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p
        className={cn("text-status-red text-sm", compact ? "px-4 pb-4" : "p-4")}
      >
        Could not load this board's activity.
      </p>
    );
  }

  if (days.length === 0) {
    // Compact says it in one line, because the card around it already carries
    // a title explaining what is missing. The drawer has a whole panel to fill
    // and an illustration is what stops it reading as a failed load.
    return compact ? (
      <p className="text-ink-3 px-4 py-10 text-center text-xs">
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
    <div className={compact ? "px-2 pb-2" : "p-2"}>
      {days.map((day) => (
        <section key={day.key}>
          {/* The day header, and the whole reason it is here: a column of
              relative stamps says how long ago, never when. Sticky so scrolling
              a long day never leaves you without the boundary you are inside —
              the same behaviour the list's group dividers have.

              An inset shadow rather than a border, so nothing in the sticky
              element's own box changes as it detaches. The fill has to be the
              container's own — `bg-surface` inside a Summary card, `bg-rail`
              inside the drawer — because a sticky header is opaque by
              definition and a mismatched one would read as a band. */}
          <h3
            className={cn(
              "text-ink-3 sticky top-0 z-10 px-2 py-1.5 text-[11px] font-semibold tracking-[0.04em] uppercase shadow-[inset_0_-1px_0_var(--hairline)]",
              compact ? "bg-surface" : "bg-rail",
            )}
          >
            {day.label}
          </h3>

          <ul className="pt-1 pb-2">
            {day.items.map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                context={context}
                members={members}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One entry.
 *
 * The whole row is the link when there is a work item behind it, rather than
 * the key inside the sentence: four characters is a poor click target, and a
 * row that highlights as one object is easier to scan than a line with a link
 * buried in it. Rows with nothing to open are plain `<div>`s at the same
 * metrics, so the list does not change rhythm between them.
 *
 * **`members` is a prop rather than a hook call.** It used to read
 * `useBoardMembers` itself, which mounted one observer per row on a query the
 * parent already holds — fifty rows, fifty subscriptions, one cache entry. The
 * parent resolves it once and hands it down.
 */
function ActivityRow({
  activity,
  context,
  members,
}: {
  activity: Activity;
  context: ActivityContext;
  members: BoardMember[];
}) {
  const { openTask } = useOpenTask();

  const line = describeActivity(activity, context);
  const actor = members.find((member) => member.id === activity.actor_id);
  const when = relativeTime(activity.created_at);

  const body = (
    <>
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarImage src={actor?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-ink/10 text-ink-2 text-[10px] font-semibold">
          {actor ? memberInitial(actor) : "?"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-ink-2 text-[13px] leading-snug">
          {/* The actor is the only part rendered at full ink: the feed is
              scanned down the left edge for who, and the sentence is read only
              once a name is worth reading. A deleted account has no name left,
              and "Someone" is the honest word for that rather than a blank. */}
          <span className="text-ink font-medium">
            {actor ? memberName(actor) : "Someone"}
          </span>{" "}
          {line.text}
        </p>

        {line.detail && (
          <span className="border-hairline bg-ink/[0.04] mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-2 pl-1.5 text-[11px]">
            <span className="text-ink-3 shrink-0">{line.detail.label}</span>

            <ArrowRightIcon className="text-ink-3/60 size-3 shrink-0" />

            {/* The one coloured thing in the row, and only where the value has
                a colour of its own in the product already — a priority. A chip
                that tinted every value would make the feed a palette. */}
            <span
              className={cn(
                "min-w-0 truncate font-medium",
                line.detail.tone ?? "text-ink",
              )}
            >
              {line.detail.value}
            </span>
          </span>
        )}

        {when && (
          <p className="text-ink-3 mt-0.5 text-[11px] tabular-nums">{when}</p>
        )}
      </div>
    </>
  );

  const shell = "flex w-full gap-2.5 rounded-control px-2 py-1.5 text-left";

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

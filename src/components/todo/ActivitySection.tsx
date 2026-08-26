import { ClockIcon } from "lucide-react";
import { useMemo, useState } from "react";

import CommentThread, { CommentRow } from "@/components/comments/CommentThread";
import TodoHistoryList, {
  HistoryRow,
} from "@/components/activity/TodoHistoryList";
import { Skeleton } from "@/components/ui/skeleton";
import { memberName } from "@/components/members/memberLabels";
import { useAuth } from "@/services/auth/useAuth";
import { describeHistoryChange } from "@/services/activities/historyText";
import { mergeActivityFeed } from "@/services/activities/mergeActivityFeed";
import { useTodoActivities } from "@/services/activities/useTodoActivities";
import { useComments } from "@/services/comments/useComments";
import { useBoardMembers } from "@/services/members/useBoardMembers";

const TABS = [
  { key: "all", label: "All" },
  { key: "comments", label: "Comments" },
  { key: "history", label: "History" },
  { key: "worklog", label: "Work log" },
] as const;

type ActivityTab = (typeof TABS)[number]["key"];

/**
 * One work item's Activity section (M25) — the tabbed shell the reference
 * screenshots specify, replacing the bare `<CommentThread>` this modal used
 * to mount directly.
 *
 * **A shell over three things that already exist, and one placeholder.**
 * "Comments" is the unmodified `CommentThread`; "History" is
 * `TodoHistoryList`; "All" merges the two read-only, newest first, reusing
 * both surfaces' own row components (`CommentRow`, `HistoryRow`) rather than
 * inventing a third rendering. "Work log" has no backing table and is not
 * built — a plain placeholder pane, per this milestone's explicit scope.
 *
 * **Only "Comments" can write.** `CommentThread`'s composer is part of that
 * component; "All" and "History" render existing rows and stop there, so
 * there is exactly one place a comment gets posted from, however it is later
 * read.
 */
export default function ActivitySection({
  todoId,
  boardId,
}: {
  todoId: string;
  boardId: string;
}) {
  const [tab, setTab] = useState<ActivityTab>("all");
  const { user } = useAuth();

  return (
    <section className="mt-8">
      <h3 className="text-ink-3 text-mini mb-3 font-semibold tracking-[0.08em] uppercase">
        Activity
      </h3>

      <div className="border-hairline mb-4 flex items-center gap-4 border-b text-sm">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "true" : undefined}
            className={
              tab === key
                ? "border-brand text-brand -mb-px border-b-2 pb-2 font-medium"
                : "text-ink-3 hover:text-ink -mb-px border-b-2 border-transparent pb-2"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <AllFeed todoId={todoId} boardId={boardId} currentUserId={user?.id} />
      )}

      {tab === "comments" && <CommentThread todoId={todoId} hideHeading />}

      {tab === "history" && (
        <TodoHistoryList
          todoId={todoId}
          boardId={boardId}
          currentUserId={user?.id}
        />
      )}

      {tab === "worklog" && <WorkLogPlaceholder />}
    </section>
  );
}

/** Comments and history, interleaved newest first, read-only. */
function AllFeed({
  todoId,
  boardId,
  currentUserId,
}: {
  todoId: string;
  boardId: string;
  currentUserId: string | undefined;
}) {
  const { data: comments, isPending: commentsPending } = useComments(todoId);
  const { data: activities, isPending: activitiesPending } = useTodoActivities(
    todoId,
    boardId,
  );
  const { data: members = [] } = useBoardMembers(boardId);

  const names = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, memberName(m)])),
    [members],
  );

  const entries = useMemo(
    () => mergeActivityFeed(comments ?? [], activities ?? []),
    [comments, activities],
  );

  if (commentsPending || activitiesPending) {
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

  if (entries.length === 0) {
    return <p className="text-ink-3 py-1 text-sm">Nothing here yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => {
        if (entry.kind === "comment") {
          return (
            <li key={`comment-${entry.comment.id}`}>
              <CommentRow
                comment={entry.comment}
                author={members.find((m) => m.id === entry.comment.author_id)}
                todoId={todoId}
              />
            </li>
          );
        }

        // Same skip rule `TodoHistoryList` applies: an unrenderable action
        // (deleted, or one this build does not recognise yet) drops out of
        // the merged feed rather than showing a blank row.
        const change = describeHistoryChange(entry.activity, names);

        if (!change) return null;

        return (
          <li key={`history-${entry.activity.id}`}>
            <HistoryRow
              activity={entry.activity}
              change={change}
              members={members}
              currentUserId={currentUserId}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** Work log is out of scope for this milestone — a plain pane, not a control
 * that looks like it does something. */
function WorkLogPlaceholder() {
  return (
    <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
      <ClockIcon className="size-4 shrink-0" />
      <span>Work log isn't available yet.</span>
    </div>
  );
}

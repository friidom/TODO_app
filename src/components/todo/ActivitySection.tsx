import { ClockIcon, HistoryIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import SectionHeader, { EmptyLine } from "./SectionHeader";
import CommentThread, {
  CommentRow,
  Composer,
} from "@/components/comments/CommentThread";
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
import { cn } from "@/utils/cn";

const TABS = [
  { key: "all", label: "All" },
  { key: "comments", label: "Comments" },
  { key: "history", label: "History" },
  { key: "worklog", label: "Work log" },
] as const;

type ActivityTab = (typeof TABS)[number]["key"];

// tabbed shell over CommentThread + TodoHistoryList — "All" merges both, "Work log" has no backing table yet
export default function ActivitySection({
  todoId,
  boardId,
}: {
  todoId: string;
  boardId: string;
}) {
  const [tab, setTab] = useState<ActivityTab>("all");
  const { user } = useAuth();
  const id = useId();

  return (
    <section>
      <SectionHeader title="Activity" />

      <div
        role="tablist"
        aria-label="Activity"
        className="border-hairline mb-5 flex items-stretch gap-4 border-b"
      >
        {TABS.map(({ key, label }) => {
          const selected = tab === key;

          return (
            <button
              key={key}
              id={`${id}-${key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              onClick={() => setTab(key)}
              className={cn(
                "text-meta focus-visible:ring-brand -mb-px flex h-9 items-center rounded-t-[6px] border-b-2 px-0.5 transition-colors duration-150 outline-none focus-visible:ring-2",
                selected
                  ? "border-brand text-ink font-medium"
                  : "text-ink-3 hover:text-ink hover:border-hairline border-transparent",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
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

        {tab === "worklog" && (
          <EmptyLine icon={ClockIcon}>
            <span>Work log isn't available yet.</span>
          </EmptyLine>
        )}
      </div>
    </section>
  );
}

// newest first, so the composer sits on top, where a posted comment lands
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

  return (
    <>
      <Composer todoId={todoId} className="mb-6" />

      {commentsPending || activitiesPending ? (
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
      ) : entries.length === 0 ? (
        <EmptyLine icon={HistoryIcon}>
          <span>Nothing here yet.</span>
        </EmptyLine>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => {
            if (entry.kind === "comment") {
              return (
                <li key={`comment-${entry.comment.id}`}>
                  <CommentRow
                    comment={entry.comment}
                    author={members.find(
                      (m) => m.id === entry.comment.author_id,
                    )}
                    todoId={todoId}
                  />
                </li>
              );
            }

            // unrenderable actions drop out rather than showing a blank row
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
      )}
    </>
  );
}

import { useTranslation } from "react-i18next";
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
import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_IDLE,
  SEGMENTED,
} from "./detailChrome";
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
  { key: "all", labelKey: "taskActivity.all" },
  { key: "comments", labelKey: "taskActivity.comments" },
  { key: "history", labelKey: "taskActivity.history" },
  { key: "worklog", labelKey: "taskActivity.worklog" },
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
  const { t } = useTranslation();
  const [tab, setTab] = useState<ActivityTab>("all");
  const { user } = useAuth();
  const id = useId();

  return (
    <section>
      <SectionHeader title={t("board.activity")} />

      <div
        role="tablist"
        aria-label={t("board.activity")}
        className={cn(SEGMENTED, "mb-5 w-fit max-w-full overflow-x-auto")}
      >
        {TABS.map(({ key, labelKey }) => {
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
                SEGMENT,
                "text-meta h-7 px-3",
                selected ? SEGMENT_ACTIVE : SEGMENT_IDLE,
              )}
            >
              {t(labelKey)}
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
            <span>{t("taskActivity.worklogUnavailable")}</span>
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
  const { t } = useTranslation();
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
          <span>{t("taskActivity.empty")}</span>
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

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  CircleAlertIcon,
  HistoryIcon,
  RotateCwIcon,
} from "lucide-react";

import { SkeletonRegion } from "@/components/loading/ViewSkeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { groupActivitiesByDay } from "@/services/activities/activityGroups";
import {
  describeActivity,
  type ActivityContext,
} from "@/services/activities/activityText";
import type { ActivityPerson } from "@/services/forYou/forYouApi";
import { useMyActivity } from "@/services/forYou/useForYou";
import type { Activity, IBoard } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

const personName = (person: ActivityPerson) =>
  person.full_name || person.username;

export default function ActivityPanel({
  boards,
  onOpen,
}: {
  boards: IBoard[];
  onOpen: (boardId: string, taskId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data, isPending, error, refetch, dataUpdatedAt } = useMyActivity();

  const boardById = useMemo(
    () => new Map(boards.map((board) => [board.id, board])),
    [boards],
  );

  const names = useMemo(
    () =>
      Object.fromEntries(
        Object.values(data?.people ?? {}).map((person) => [
          person.id,
          personName(person),
        ]),
      ),
    [data],
  );

  const live = useMemo(() => new Set(data?.live_todo_ids ?? []), [data]);

  // dated against the fetch, not the clock: the panel polls, and a "now" frozen at mount would age every row
  const days = useMemo(
    () =>
      data
        ? groupActivitiesByDay(
            data.items,
            new Date(dataUpdatedAt),
            i18n.language,
          )
        : [],
    [data, dataUpdatedAt, i18n.language],
  );

  return (
    <aside
      aria-labelledby="for-you-activity"
      className="border-hairline bg-surface rounded-surface border lg:sticky lg:top-0"
    >
      <div className="border-hairline flex items-baseline gap-2 border-b px-4 py-3">
        <h2 id="for-you-activity" className="text-ink text-sm font-semibold">
          {t("forYou.activity.title")}
        </h2>

        <span className="text-ink-3 text-mini min-w-0 truncate">
          {t("forYou.activity.subtitle")}
        </span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-1.5 lg:max-h-[calc(100svh-9rem)]">
        {isPending ? (
          <ActivitySkeleton />
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-1 px-4 py-8 text-center"
          >
            <CircleAlertIcon className="text-status-red mb-2 size-5" />
            <p className="text-ink text-meta font-medium">
              {t("forYou.activity.loadFailed")}
            </p>
            <p className="text-ink-3 text-mini">{error.message}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="border-hairline text-ink-2 hover:bg-wash hover:text-ink focus-visible:ring-brand rounded-control text-meta mt-3 inline-flex h-8 items-center gap-1.5 border px-3 font-medium transition-[color,background-color,scale] duration-150 outline-none focus-visible:ring-2 motion-safe:active:scale-[0.98]"
            >
              <RotateCwIcon className="size-3.5" />
              {t("common.retry")}
            </button>
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <span className="bg-wash-strong text-ink-3 mb-2 grid size-9 place-items-center rounded-full">
              <HistoryIcon className="size-4" />
            </span>
            <p className="text-ink text-meta font-medium">
              {t("forYou.activity.emptyTitle")}
            </p>
            <p className="text-ink-3 text-mini max-w-60 text-pretty">
              {t("forYou.activity.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="motion-safe:animate-in motion-safe:fade-in-0 duration-200">
            {days.map((day) => (
              <section key={day.key} aria-label={day.label}>
                <h3 className="text-ink-3 text-mini px-2.5 pt-2 pb-1 font-semibold tracking-[0.06em] uppercase">
                  {day.label}
                </h3>

                <ul>
                  {day.items.map((activity) => (
                    <ActivityRow
                      key={activity.id}
                      activity={activity}
                      board={boardById.get(activity.board_id)}
                      person={
                        activity.actor_id
                          ? data?.people[activity.actor_id]
                          : undefined
                      }
                      names={names}
                      live={live}
                      now={dataUpdatedAt}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function ActivityRow({
  activity,
  board,
  person,
  names,
  live,
  now,
  onOpen,
}: {
  activity: Activity;
  board: IBoard | undefined;
  person: ActivityPerson | undefined;
  names: ActivityContext["names"];
  live: ReadonlySet<string>;
  now: number;
  onOpen: (boardId: string, taskId: string) => void;
}) {
  const { t } = useTranslation();

  const line = describeActivity(activity, {
    keyPrefix: board?.key_prefix ?? "",
    names,
    liveTaskIds: live,
    t: (key, values) => t(key, values),
  });

  const name = person ? personName(person) : t("presence.someone");
  const taskId = line.taskId;

  const body = (
    <>
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-wash-strong text-ink-2 text-micro font-semibold">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-ink-2 text-meta leading-snug text-pretty">
          <span className="text-ink font-medium">{name}</span> {line.text}
        </p>

        {line.detail && (
          <span className="border-hairline bg-wash text-mini mt-1.5 inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border py-0.5 pr-2 pl-1.5">
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
        )}

        <p className="text-ink-3 text-mini mt-1 flex min-w-0 items-center gap-1.5">
          <span className="truncate">
            {board?.title || t("common.untitledBoard")}
          </span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {relativeTime(activity.created_at, now)}
          </span>
        </p>
      </div>
    </>
  );

  const shell = "rounded-control flex w-full gap-2.5 px-2.5 py-2 text-left";

  return (
    <li>
      {taskId ? (
        <button
          type="button"
          onClick={() => onOpen(activity.board_id, taskId)}
          className={cn(
            shell,
            "hover:bg-wash focus-visible:ring-brand transition-colors duration-150 outline-none focus-visible:ring-2",
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

function ActivitySkeleton() {
  return (
    <SkeletonRegion className="flex flex-col gap-1 p-1">
      {Array.from({ length: 6 }, (_, row) => (
        <div key={row} className="flex gap-2.5 px-1.5 py-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton
              className="h-3 rounded-full"
              style={{ width: `${60 + ((row * 17) % 35)}%` }}
            />
            <Skeleton className="mt-2 h-2.5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

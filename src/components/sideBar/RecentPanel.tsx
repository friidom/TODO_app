import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { ClockIcon, SearchIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_IDLE,
  SEGMENTED,
} from "@/components/todo/detailChrome";
import StatusLozenge from "@/components/workflow/StatusLozenge";
import {
  WORK_TYPE_LABELS,
  toWorkType,
  workTypeOf,
} from "@/constants/workTypes";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { fetchTodosByIds } from "@/services/forYou/forYouApi";
import {
  RECENT_FILTERS,
  buildRecent,
  type RecentFilter,
  type RecentItem,
} from "@/services/forYou/recent";
import { readBoardVisits, readViewed } from "@/services/forYou/viewed";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard, ISpace } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDayFull } from "@/utils/dueDate";
import { relativeTime } from "@/utils/relativeTime";
import {
  BoardChip,
  FlyoutError,
  FlyoutFrame,
  FlyoutGroupLabel,
  FlyoutSkeleton,
  FlyoutState,
} from "./flyoutParts";
import { FLYOUT_LINK, FLYOUT_ROW, flyoutRowProps } from "./flyoutChrome";

const NO_BOARDS: IBoard[] = [];
const NO_SPACES: ISpace[] = [];

const FILTER_LABELS: Record<RecentFilter, string> = {
  all: "recent.filterAll",
  boards: "recent.filterBoards",
  tasks: "recent.filterTasks",
};

// Recent is what you opened or created on this device; what you worked on is
// For You's activity-backed tab, linked from the footer and never mixed in here.
export default function RecentPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuth().user?.id;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecentFilter>("all");

  // read once per opening: the panel mounts when it opens
  const [visits] = useState(() => readBoardVisits(userId));
  const [viewed] = useState(() => readViewed(userId));
  const [now] = useState(() => new Date());

  const ids = useMemo(() => viewed.map((entry) => entry.id), [viewed]);

  const boards = useBoards();
  const { data: spaces = NO_SPACES } = useSpaces();
  const tasks = useQuery({
    queryKey: queryKeys.forYouByIds(ids),
    queryFn: () => fetchTodosByIds(ids),
    enabled: ids.length > 0,
  });

  const groups = useMemo(
    () =>
      buildRecent({
        visits,
        viewed,
        boards: boards.data ?? NO_BOARDS,
        todos: tasks.data ?? [],
        spaces,
        filter,
        query,
        now,
      }),
    [visits, viewed, boards.data, tasks.data, spaces, filter, query, now],
  );

  const tasksLoading = ids.length > 0 && tasks.isPending && !tasks.error;
  const showTasks = filter !== "boards";
  const empty = visits.length === 0 && viewed.length === 0;

  function open(item: RecentItem) {
    navigate(item.href);
    onClose();
  }

  const list =
    groups.length === 0 ? null : (
      <div className="flex flex-col">
        {groups.map((group) => (
          <section key={group.period} aria-label={group.label}>
            <FlyoutGroupLabel>{group.label}</FlyoutGroupLabel>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <Row item={item} now={now.getTime()} onOpen={open} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );

  return (
    <FlyoutFrame
      title={t("recent.title")}
      onClose={onClose}
      query={query}
      onQuery={setQuery}
      searchLabel={t("recent.search")}
      toolbar={
        <div role="group" aria-label={t("recent.title")} className={SEGMENTED}>
          {RECENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                SEGMENT,
                filter === value ? SEGMENT_ACTIVE : SEGMENT_IDLE,
              )}
            >
              {t(FILTER_LABELS[value])}
            </button>
          ))}
        </div>
      }
      footer={
        <>
          <Link to="/?tab=viewed" onClick={onClose} className={FLYOUT_LINK}>
            {t("recent.viewAll")}
          </Link>
          <span aria-hidden className="text-ink-3">
            ·
          </span>
          <Link to="/?tab=workedon" onClick={onClose} className={FLYOUT_LINK}>
            {t("recent.workedOn")}
          </Link>
        </>
      }
    >
      {empty ? (
        <FlyoutState
          icon={ClockIcon}
          title={t("recent.empty")}
          hint={t("recent.emptyHint")}
        />
      ) : boards.isPending || (tasksLoading && filter === "tasks") ? (
        <FlyoutSkeleton />
      ) : boards.error ? (
        <FlyoutError
          message={t("recent.loadFailed")}
          onRetry={() => void boards.refetch()}
        />
      ) : (
        <>
          {showTasks && tasks.error && (
            <FlyoutError
              message={t("recent.loadFailed")}
              onRetry={() => void tasks.refetch()}
              className="mb-1"
            />
          )}

          {list}

          {showTasks && tasksLoading && <FlyoutSkeleton rows={3} />}

          {!list && !tasksLoading && !(showTasks && tasks.error) && (
            <FlyoutState
              icon={query.trim() ? SearchIcon : ClockIcon}
              title={
                query.trim()
                  ? t("recent.noMatches", { query: query.trim() })
                  : t("recent.empty")
              }
            />
          )}
        </>
      )}
    </FlyoutFrame>
  );
}

function Row({
  item,
  now,
  onOpen,
}: {
  item: RecentItem;
  now: number;
  onOpen: (item: RecentItem) => void;
}) {
  const { t } = useTranslation();
  const boardTitle = item.board.title || t("common.untitledBoard");
  const when = relativeTime(item.at, now, { short: true });

  return (
    <a
      href={item.href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onOpen(item);
      }}
      className={FLYOUT_ROW}
      {...flyoutRowProps}
    >
      {item.kind === "board" ? (
        <BoardChip title={boardTitle} />
      ) : (
        <TaskIcon type={item.todo.type} />
      )}

      <span className="min-w-0 flex-1">
        <span className="text-ink text-meta block truncate font-medium">
          {item.kind === "board"
            ? boardTitle
            : item.todo.title || t("common.untitled")}
        </span>
        <span className="text-ink-3 text-mini flex min-w-0 items-center gap-1.5">
          {item.kind === "task" && item.key && (
            <span className="shrink-0 font-medium tabular-nums">
              {item.key}
            </span>
          )}
          {item.kind === "task" && item.key && <span aria-hidden>·</span>}
          <span className="truncate">
            {item.kind === "board" ? item.board.key_prefix : boardTitle}
          </span>
        </span>
      </span>

      {item.kind === "task" && item.todo.status && (
        <span className="hidden max-w-28 shrink-0 sm:inline-flex">
          <StatusLozenge
            name={item.todo.status.name}
            category={item.todo.status.category}
          />
        </span>
      )}

      {when && (
        <time
          dateTime={item.at}
          title={formatDayFull(item.at)}
          className="text-ink-3 text-mini shrink-0 tabular-nums"
        >
          {when}
        </time>
      )}
    </a>
  );
}

function TaskIcon({ type }: { type: string | null }) {
  const work = workTypeOf(type);
  const Icon = work.icon;

  return (
    <span
      className={cn(
        "rounded-control grid size-7 shrink-0 place-items-center",
        work.chip,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{WORK_TYPE_LABELS[toWorkType(type)]}</span>
    </span>
  );
}

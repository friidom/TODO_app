import { useTranslation } from "react-i18next";

import StatusLozenge from "@/components/workflow/StatusLozenge";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import {
  WORK_TYPE_LABELS,
  toWorkType,
  workTypeOf,
} from "@/constants/workTypes";
import type { FeedItem } from "@/services/forYou/feed";
import { cn } from "@/utils/cn";
import { dueStatus, formatDue } from "@/utils/dueDate";
import { relativeTime } from "@/utils/relativeTime";

const DUE_TONE = {
  overdue: "bg-status-red/12 text-status-red",
  today: "bg-status-orange/15 text-status-orange",
  upcoming: "text-ink-3",
} as const;

const DUE_LABEL = {
  overdue: "due.overdue",
  today: "due.today",
  upcoming: "due.upcoming",
} as const;

// avatar only renders when isMine — profiles RLS is self-only, so a cross-board feed can't resolve other assignees without a per-board RPC
export default function FeedRow({
  item,
  now,
  isMine,
  avatarUrl,
  initial,
  onOpen,
}: {
  item: FeedItem;
  now: number;
  isMine: boolean;
  avatarUrl?: string | null;
  initial: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { todo } = item;

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const priority = toPriority(todo.priority);
  const PriorityIcon = priority ? PRIORITIES[priority].icon : null;

  // a finished item's date is history, not a deadline
  const due =
    todo.due_date && todo.status?.category !== "done"
      ? dueStatus(todo.due_date)
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-wash focus-visible:ring-brand rounded-control flex w-full items-center gap-3 px-2 py-2 text-left transition-colors duration-150 outline-none focus-visible:ring-2 sm:px-3"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            type.chip,
          )}
        >
          <TypeIcon aria-hidden className="size-4" />
          <span className="sr-only">
            {WORK_TYPE_LABELS[toWorkType(todo.type)]}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-ink text-meta block truncate font-medium">
            {todo.title || (
              <span className="text-ink-3/70">{t("common.untitled")}</span>
            )}
          </span>

          <span className="text-ink-3 text-mini mt-0.5 flex min-w-0 items-center gap-1.5">
            {item.key && (
              <span className="shrink-0 font-medium tabular-nums">
                {item.key}
              </span>
            )}

            {item.key && item.boardName && <span aria-hidden>·</span>}

            <span className="truncate">{item.boardName}</span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {PriorityIcon && priority && (
            <PriorityIcon
              role="img"
              aria-label={PRIORITIES[priority].label}
              className={cn(
                "hidden size-4 sm:block",
                PRIORITIES[priority].tone,
              )}
            />
          )}

          {due && todo.due_date && (
            <span
              title={t(DUE_LABEL[due])}
              className={cn(
                "text-mini hidden h-5 items-center rounded px-1.5 font-medium tabular-nums sm:inline-flex",
                DUE_TONE[due],
              )}
            >
              {formatDue(todo.due_date)}
            </span>
          )}

          {todo.status && (
            <span className="hidden max-w-36 md:inline-flex">
              <StatusLozenge
                name={todo.status.name}
                category={todo.status.category}
              />
            </span>
          )}

          {isMine &&
            (avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="hidden size-6 rounded-full object-cover sm:block"
              />
            ) : (
              <span className="bg-brand-soft text-brand text-micro hidden size-6 place-items-center rounded-full font-semibold sm:grid">
                {initial}
              </span>
            ))}

          <span className="text-ink-3 text-mini w-14 text-right tabular-nums">
            {relativeTime(item.at, now)}
          </span>
        </span>
      </button>
    </li>
  );
}

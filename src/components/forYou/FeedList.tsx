import { useTranslation } from "react-i18next";
import {
  CircleAlertIcon,
  InboxIcon,
  RotateCwIcon,
  type LucideIcon,
} from "lucide-react";

import { SkeletonRegion } from "@/components/loading/ViewSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabelKey } from "@/constants/columns";
import {
  groupByStatus,
  groupFeed,
  type FeedItem,
  type ForYouTab,
} from "@/services/forYou/feed";
import { cn } from "@/utils/cn";
import FeedRow from "./FeedRow";

const EMPTY: Record<ForYouTab, { titleKey: string; hintKey: string }> = {
  recommended: {
    titleKey: "forYou.empty.recommended.title",
    hintKey: "forYou.empty.recommended.hint",
  },
  assigned: {
    titleKey: "forYou.empty.assigned.title",
    hintKey: "forYou.empty.assigned.hint",
  },
  workedon: {
    titleKey: "forYou.empty.workedOn.title",
    hintKey: "forYou.empty.workedOn.hint",
  },
  viewed: {
    titleKey: "forYou.empty.viewed.title",
    hintKey: "forYou.empty.viewed.hint",
  },
};

export default function FeedList({
  tab,
  items,
  isLoading,
  error,
  onRetry,
  now,
  currentUserId,
  avatarUrl,
  initial,
  onOpen,
}: {
  tab: ForYouTab;
  items: FeedItem[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  now: number;
  currentUserId?: string;
  avatarUrl?: string | null;
  initial: string;
  onOpen: (item: FeedItem) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) return <FeedSkeleton />;

  if (error) {
    return (
      <FeedState
        icon={CircleAlertIcon}
        title={t("forYou.loadFailed")}
        hint={error.message}
        tone="error"
        action={{ label: t("common.retry"), run: onRetry }}
      />
    );
  }

  if (items.length === 0) {
    const empty = EMPTY[tab];

    return (
      <FeedState
        icon={InboxIcon}
        title={t(empty.titleKey)}
        hint={t(empty.hintKey)}
      />
    );
  }

  // now is passed in, not read here, so every row agrees on the "Today"/"Yesterday" boundary
  const sections =
    tab === "assigned"
      ? groupByStatus(items).map((group) => ({
          id: group.key,
          label:
            group.key === "backlog"
              ? t("forYou.groups.backlog")
              : t(categoryLabelKey(group.key)),
          items: group.items,
        }))
      : groupFeed(items, new Date(now)).map((group) => ({
          id: group.period,
          label: group.label,
          items: group.items,
        }));

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 flex flex-col gap-5 duration-200">
      {sections.map((section) => (
        <section key={section.id} aria-label={section.label}>
          <h3 className="text-ink-3 text-mini flex items-center gap-2 pb-1 font-semibold tracking-[0.06em] uppercase">
            {section.label}

            <span className="bg-wash-strong text-ink-2 text-micro rounded-full px-1.5 leading-4 font-semibold tracking-normal tabular-nums">
              {section.items.length}
            </span>
          </h3>

          <ul className="-mx-2 sm:-mx-3">
            {section.items.map((item) => (
              <FeedRow
                key={item.todo.id}
                item={item}
                now={now}
                isMine={Boolean(
                  currentUserId && item.todo.assignee_id === currentUserId,
                )}
                avatarUrl={avatarUrl}
                initial={initial}
                onOpen={() => onOpen(item)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function FeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonRegion>
      <Skeleton className="mb-2.5 h-2.5 w-24 rounded-full" />

      <div className="flex flex-col">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3 py-2">
            <Skeleton className="size-8 shrink-0 rounded-lg" />

            <div className="min-w-0 flex-1">
              <Skeleton
                className="h-3 rounded-full"
                // varied width so it reads as text, not a progress bar
                style={{ width: `${52 + ((row * 13) % 34)}%` }}
              />
              <Skeleton className="mt-2 h-2.5 w-40 max-w-[60%] rounded-full" />
            </div>

            <Skeleton className="hidden h-5 w-20 shrink-0 rounded md:block" />
            <Skeleton className="h-2.5 w-12 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function FeedState({
  icon: Icon,
  title,
  hint,
  tone = "empty",
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  tone?: "empty" | "error";
  action?: { label: string; run: () => void };
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="border-hairline rounded-surface flex min-h-[13rem] flex-col items-center justify-center gap-1 border border-dashed px-6 py-10 text-center"
    >
      <span
        className={cn(
          "mb-3 grid size-10 place-items-center rounded-full",
          tone === "error"
            ? "bg-status-red/10 text-status-red"
            : "bg-wash-strong text-ink-3",
        )}
      >
        <Icon className="size-4" />
      </span>

      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="text-ink-3 max-w-sm text-xs leading-relaxed text-pretty">
        {hint}
      </p>

      {action && (
        <button
          type="button"
          onClick={action.run}
          className="border-hairline text-ink-2 hover:bg-wash hover:text-ink focus-visible:ring-brand rounded-control text-meta mt-4 inline-flex h-8 items-center gap-1.5 border px-3 font-medium transition-[color,background-color,scale] duration-150 outline-none focus-visible:ring-2 motion-safe:active:scale-[0.98]"
        >
          <RotateCwIcon className="size-3.5" />
          {action.label}
        </button>
      )}
    </div>
  );
}

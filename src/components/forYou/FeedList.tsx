import { useTranslation } from "react-i18next";
import { CircleAlertIcon, InboxIcon, type LucideIcon } from "lucide-react";

import {
  groupFeed,
  type FeedItem,
  type ForYouTab,
} from "@/services/forYou/feed";
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
  now: number;
  currentUserId?: string;
  avatarUrl?: string | null;
  initial: string;
  onOpen: (item: FeedItem) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) return <Skeleton />;

  if (error) {
    return (
      <State
        icon={CircleAlertIcon}
        title={t("forYou.loadFailed")}
        hint={error.message}
        tone="error"
      />
    );
  }

  if (items.length === 0) {
    const empty = EMPTY[tab];

    return (
      <State
        icon={InboxIcon}
        title={t(empty.titleKey)}
        hint={t(empty.hintKey)}
      />
    );
  }

  // now is passed in, not read here, so every row agrees on the "Today"/"Yesterday" boundary
  const groups = groupFeed(items, new Date(now));

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.period}>
          <h2 className="bg-canvas text-ink-3 sticky top-0 z-10 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
            {group.label}
          </h2>

          <ul className="-mx-2 sm:-mx-3">
            {group.items.map((item) => (
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

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-ink/10 my-1.5 h-3 w-24 rounded" />

      <ul className="flex flex-col gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-2 py-2 sm:px-3">
            <span className="bg-ink/10 size-8 shrink-0 rounded-lg" />

            <span className="min-w-0 flex-1">
              <span
                className="bg-ink/10 block h-3 rounded"
                // varied width so it reads as text, not a progress bar
                style={{ width: `${52 + ((i * 13) % 34)}%` }}
              />
              <span className="bg-ink/10 mt-2 block h-2.5 w-40 max-w-[60%] rounded" />
            </span>

            <span className="bg-ink/10 h-2.5 w-12 shrink-0 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function State({
  icon: Icon,
  title,
  hint,
  tone = "empty",
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  tone?: "empty" | "error";
}) {
  return (
    <div className="border-hairline rounded-surface bg-surface flex min-h-[13rem] flex-col items-center justify-center gap-1 border border-dashed px-6 py-10 text-center">
      <span
        className={
          tone === "error"
            ? "bg-status-red/10 text-status-red mb-3 grid size-10 place-items-center rounded-full"
            : "bg-ink/[0.06] text-ink-3 mb-3 grid size-10 place-items-center rounded-full"
        }
      >
        <Icon className="size-4" />
      </span>

      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="text-ink-3 max-w-sm text-xs leading-relaxed">{hint}</p>
    </div>
  );
}

import { CircleAlertIcon, InboxIcon, type LucideIcon } from "lucide-react";

import { groupFeed, type FeedItem, type ForYouTab } from "@/services/forYou/feed";
import FeedRow from "./FeedRow";

/**
 * The grouped feed, and the three states it can be in instead (M21).
 *
 * **Every state is the same width and lives in the same place**, so switching
 * tabs never moves the page under the pointer — the failure the brief names as
 * "a huge empty white area". The empty and error states are inset boxes of a
 * fixed minimum height rather than centred in the viewport, because the tabs
 * above them are still the subject and an apology that fills the screen implies
 * the whole page failed.
 */

/** What each tab says when it has nothing, and why it might have nothing. */
const EMPTY: Record<ForYouTab, { icon: LucideIcon; title: string; hint: string }> =
  {
    recommended: {
      icon: InboxIcon,
      title: "No recent work yet",
      hint: "Once you create or update work items, the ones worth your attention show up here.",
    },
    assigned: {
      icon: InboxIcon,
      title: "Nothing assigned to you",
      hint: "Work items get here when someone sets you as the assignee — including you, from a card's assignee control.",
    },
    workedon: {
      icon: InboxIcon,
      title: "You haven't worked on anything yet",
      hint: "Creating, editing or moving a work item puts it here, newest first.",
    },
    viewed: {
      icon: InboxIcon,
      title: "Nothing viewed yet",
      hint: "Tasks you open appear here. This list is kept in this browser only, so it starts empty on a new device.",
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
  if (isLoading) return <Skeleton />;

  if (error) {
    return (
      <State
        icon={CircleAlertIcon}
        title="Couldn't load your work"
        hint={error.message}
        tone="error"
      />
    );
  }

  if (items.length === 0) {
    const empty = EMPTY[tab];

    return <State icon={empty.icon} title={empty.title} hint={empty.hint} />;
  }

  // `now` is passed in rather than read here, so every group header and every
  // row in one render agrees about where the boundaries are. A component that
  // called `new Date()` per row could place two rows a millisecond apart into
  // "Today" and "Yesterday".
  const groups = groupFeed(items, new Date(now));

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.period}>
          {/* Sticky, so the period you are reading stays named while you scroll
              a long feed. `bg-canvas` rather than transparent: rows pass
              underneath it. */}
          <h2 className="bg-canvas text-ink-3 sticky top-0  py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
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

/**
 * The loading state, shaped like the thing it is standing in for.
 *
 * Rows rather than a spinner: the layout is known before the data is, so
 * reserving it means the feed fills in rather than appearing and shoving the
 * page down. One group header and five rows is roughly what a live feed opens
 * with.
 */
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
                // Varied so it reads as text rather than as a progress bar.
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
